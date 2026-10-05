'use strict';

/**
 * Backup automático do banco de dados.
 *
 * Gera uma cópia consistente com VACUUM INTO (pode rodar com o sistema em uso), guarda as
 * últimas N cópias e, se configurada, copia também para uma segunda pasta (pendrive ou pasta
 * sincronizada com Google Drive/OneDrive). Roda ao fechar o caixa e, no servidor, uma vez por
 * dia (verificação a cada hora).
 */

const fs = require('node:fs');
const path = require('node:path');

const PREFIXO = 'clara-styllus-';
const nomeArquivo = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  // Os milissegundos garantem que a ordem alfabética seja sempre a ordem de criação.
  return `${PREFIXO}${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}.db`;
};

function criarBackup({ db, config, salvarConfig, pastaPadrao }) {
  const pasta = () => (config().backup_pasta || '').trim() || pastaPadrao;
  const manter = () => Math.max(1, Number(config().backup_manter) || 30);

  function listar() {
    const p = pasta();
    if (!fs.existsSync(p)) return [];
    return fs
      .readdirSync(p)
      .filter((n) => n.startsWith(PREFIXO) && n.endsWith('.db'))
      .map((n) => {
        const st = fs.statSync(path.join(p, n));
        return { nome: n, tamanho: st.size, data: st.mtime.toISOString() };
      })
      .sort((a, b) => b.nome.localeCompare(a.nome));
  }

  function limparAntigos(dir) {
    const arquivos = fs.readdirSync(dir).filter((n) => n.startsWith(PREFIXO) && n.endsWith('.db')).sort().reverse();
    for (const n of arquivos.slice(manter())) fs.rmSync(path.join(dir, n), { force: true });
  }

  /** Faz o backup agora. Devolve { arquivo, extra, aviso }; lança erro se a pasta principal falhar. */
  function fazer(motivo = 'manual') {
    const dir = pasta();
    fs.mkdirSync(dir, { recursive: true });
    let nome = nomeArquivo();
    for (let i = 2; fs.existsSync(path.join(dir, nome)); i++) nome = nomeArquivo().replace('.db', `_${i}.db`); // "_2" fica depois na ordem
    const destino = path.join(dir, nome);
    try {
      db.prepare('VACUUM INTO ?').run(destino);
      limparAntigos(dir);
    } catch (e) {
      salvarConfig({ backup_ultimo_erro: `${new Date().toLocaleString('pt-BR')}: ${e.message}` });
      throw e;
    }
    let aviso = '';
    let extra = null;
    const pastaExtra = (config().backup_pasta_extra || '').trim();
    if (pastaExtra) {
      try {
        fs.mkdirSync(pastaExtra, { recursive: true });
        extra = path.join(pastaExtra, nome);
        fs.copyFileSync(destino, extra);
        limparAntigos(pastaExtra);
      } catch (e) {
        extra = null;
        aviso = `Não consegui copiar para a segunda pasta (${pastaExtra}): ${e.message}. O pendrive está conectado?`;
      }
    }
    salvarConfig({
      backup_ultimo: new Date().toISOString(),
      backup_ultimo_arquivo: destino,
      backup_ultimo_motivo: motivo,
      backup_ultimo_erro: aviso,
    });
    return { arquivo: destino, extra, aviso };
  }

  /** Horas desde o último backup (Infinity se nunca fez). */
  function horasDesdeUltimo() {
    const u = Date.parse(config().backup_ultimo || '');
    return Number.isFinite(u) ? (Date.now() - u) / 36e5 : Infinity;
  }

  /** Faz backup se o automático estiver ligado e o último tiver mais de 24 h. */
  function seNecessario(motivo = 'automatico') {
    if (config().backup_auto === '0') return null;
    if (horasDesdeUltimo() < 24) return null;
    try {
      return fazer(motivo);
    } catch (e) {
      console.error('Backup automático falhou:', e.message);
      return null;
    }
  }

  function status() {
    const c = config();
    return {
      automatico: c.backup_auto !== '0',
      pasta: pasta(),
      pasta_extra: c.backup_pasta_extra || '',
      manter: manter(),
      ultimo: c.backup_ultimo || null,
      ultimo_arquivo: c.backup_ultimo_arquivo || null,
      ultimo_erro: c.backup_ultimo_erro || '',
      horas_desde_ultimo: Number.isFinite(horasDesdeUltimo()) ? Math.round(horasDesdeUltimo()) : null,
      arquivos: listar().slice(0, 40),
    };
  }

  return { fazer, seNecessario, status, horasDesdeUltimo };
}

module.exports = { criarBackup, nomeArquivo };
