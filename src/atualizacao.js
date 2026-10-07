'use strict';

/**
 * Atualização do sistema.
 *  - Automática (com internet): procura a versão mais nova nas "Releases" do GitHub
 *    (ou num endereço configurado), baixa o instalador em segundo plano e avisa o administrador.
 *  - Por arquivo (sem internet): o administrador escolhe o instalador baixado em outro computador.
 * A instalação roda o instalador em modo silencioso (/S) por uma tarefa agendada do Windows,
 * fora do serviço do PDV (o instalador para e reinicia o serviço; os dados ficam guardados).
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const VERSAO = require('../package.json').version;
const URL_PADRAO = 'https://api.github.com/repos/kayansantiago-rgb/clara-styllus/releases/latest';

/** Compara "1.10.2" com "1.9.0": positivo se a for mais nova. */
function compararVersao(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

/** Lê o retorno do GitHub (release) ou de um manifesto simples { versao, url, sha256, notas }. */
function lerManifesto(j) {
  if (j && j.tag_name) {
    const assets = Array.isArray(j.assets) ? j.assets : [];
    const exe = assets.find((a) => /\.exe$/i.test(a.name));
    const sha = assets.find((a) => /\.exe\.sha256$/i.test(a.name));
    return {
      versao: j.tag_name.replace(/^v/i, ''),
      notas: j.body || '',
      publicada_em: j.published_at || null,
      arquivo: exe ? exe.name : null,
      url: exe ? exe.url : null, // URL da API (funciona também com repositório privado + token)
      url_sha256: sha ? sha.url : null,
      github: true,
    };
  }
  if (j && j.versao && j.url) {
    return { versao: String(j.versao).replace(/^v/i, ''), notas: j.notas || '', arquivo: path.basename(new URL(j.url).pathname), url: j.url, sha256: j.sha256 || null, github: false };
  }
  throw new Error('Resposta do servidor de atualização em formato desconhecido.');
}

function instalarAtualizacao({ rota, erro, config, salvarConfig, pasta }) {
  const estado = {
    verificando: false, baixando: false, instalando: false,
    disponivel: null, // manifesto da versão nova
    baixado: null, // caminho do instalador pronto
    erro: null,
    verificado_em: null,
  };
  fs.mkdirSync(pasta, { recursive: true });

  /** O token de acesso só vai para o GitHub ou para o endereço de atualização configurado. */
  const hostConfiavel = (url) => {
    try {
      const host = new URL(url).host;
      const cfgUrl = config().atualizacao_url;
      return host === 'api.github.com' || (!!cfgUrl && host === new URL(cfgUrl).host);
    } catch {
      return false;
    }
  };
  const cabecalhos = (binario, url) => {
    const cfg = config();
    const h = { 'User-Agent': 'ClaraStyllusPDV/' + VERSAO, Accept: binario ? 'application/octet-stream' : 'application/vnd.github+json' };
    if (cfg.atualizacao_token && hostConfiavel(url)) h.Authorization = `Bearer ${cfg.atualizacao_token}`;
    return h;
  };

  async function verificar() {
    if (estado.verificando) return status();
    estado.verificando = true;
    estado.erro = null;
    try {
      const url = config().atualizacao_url || URL_PADRAO;
      const r = await fetch(url, { headers: cabecalhos(false, url), signal: AbortSignal.timeout(20000) });
      if (r.status === 404) throw new Error('Nenhuma versão publicada encontrada (se o repositório for privado, informe o token de acesso).');
      if (r.status === 401 || r.status === 403) throw new Error('Acesso negado pelo GitHub: confira o token de acesso.');
      if (!r.ok) throw new Error(`Servidor de atualização respondeu ${r.status}.`);
      const m = lerManifesto(await r.json());
      estado.verificado_em = new Date().toISOString();
      salvarConfig({ atualizacao_verificada_em: estado.verificado_em });
      estado.disponivel = compararVersao(m.versao, VERSAO) > 0 && m.url ? m : null;
      if (estado.disponivel && config().atualizacao_auto !== '0') baixar().catch(() => {});
    } catch (e) {
      estado.erro = e.name === 'TimeoutError' || /fetch failed/i.test(e.message)
        ? 'Sem conexão com a internet para procurar atualizações.' : e.message;
    } finally {
      estado.verificando = false;
    }
    return status();
  }

  let downloadEmAndamento = null;
  /** Baixa o instalador (se já estiver baixando, espera o mesmo download). */
  function baixar() {
    const m = estado.disponivel;
    if (!m) return Promise.reject(erro(409, 'Nenhuma atualização disponível.'));
    const destino = path.join(pasta, m.arquivo || `ClaraStyllus-PDV-Setup-${m.versao}.exe`);
    if (estado.baixado === destino && fs.existsSync(destino)) return Promise.resolve(destino);
    if (!downloadEmAndamento) downloadEmAndamento = baixarAgora(m, destino).finally(() => { downloadEmAndamento = null; });
    return downloadEmAndamento;
  }

  async function baixarAgora(m, destino) {
    estado.baixando = true;
    try {
      const r = await fetch(m.url, { headers: cabecalhos(m.github, m.url), signal: AbortSignal.timeout(15 * 60000) });
      if (!r.ok) throw new Error(`Falha ao baixar o instalador (${r.status}).`);
      const dados = Buffer.from(await r.arrayBuffer());
      let esperado = m.sha256;
      if (!esperado && m.url_sha256) {
        const rs = await fetch(m.url_sha256, { headers: cabecalhos(true, m.url_sha256), signal: AbortSignal.timeout(30000) });
        if (rs.ok) esperado = (await rs.text()).trim().split(/\s+/)[0];
      }
      const obtido = crypto.createHash('sha256').update(dados).digest('hex');
      if (esperado && esperado.toLowerCase() !== obtido) throw new Error('O arquivo baixado está corrompido (assinatura SHA-256 não confere).');
      fs.writeFileSync(destino + '.parcial', dados);
      fs.renameSync(destino + '.parcial', destino);
      estado.baixado = destino;
      return destino;
    } catch (e) {
      estado.erro = e.message;
      throw e;
    } finally {
      estado.baixando = false;
    }
  }

  /** Roda o instalador em modo silencioso por uma tarefa agendada (fora do serviço). */
  function executar(instalador) {
    if (process.platform !== 'win32') {
      throw erro(400, 'A instalação automática só funciona no Windows. Rode o instalador manualmente.');
    }
    const tarefa = 'ClaraStyllusAtualizar';
    const h = new Date(Date.now() + 2 * 60000);
    const hora = `${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}`;
    // Argumentos montados à mão (windowsVerbatimArguments): o schtasks espera /TR "\"caminho\" /S".
    const run = (args) => new Promise((ok, falha) => execFile('schtasks', args, { windowsHide: true, windowsVerbatimArguments: true },
      (e, so, se) => (e ? falha(new Error(se || e.message)) : ok(so))));
    estado.instalando = true;
    // A tarefa roda já (/Run); o horário é só obrigatório no comando. O instalador apaga a tarefa ao terminar.
    return run(['/Create', '/F', '/TN', tarefa, '/TR', `"\\"${instalador}\\" /S"`, '/SC', 'ONCE', '/ST', hora, '/RU', 'SYSTEM', '/RL', 'HIGHEST'])
      .then(() => run(['/Run', '/TN', tarefa]))
      .catch((e) => { estado.instalando = false; throw erro(500, `Não consegui iniciar o instalador: ${e.message}`); });
  }

  const status = () => ({
    versao_atual: VERSAO,
    disponivel: estado.disponivel && { versao: estado.disponivel.versao, notas: estado.disponivel.notas, publicada_em: estado.disponivel.publicada_em },
    baixado: !!estado.baixado && fs.existsSync(estado.baixado),
    verificando: estado.verificando,
    baixando: estado.baixando,
    instalando: estado.instalando,
    erro: estado.erro,
    verificado_em: estado.verificado_em || config().atualizacao_verificada_em || null,
    automatica: config().atualizacao_auto !== '0',
    usa_token: !!config().atualizacao_token,
  });

  rota('GET', '/api/atualizacao', () => status(), 'admin');
  rota('POST', '/api/atualizacao/verificar', () => verificar(), 'admin');
  rota('POST', '/api/atualizacao/instalar', async () => {
    const instalador = await baixar();
    await executar(instalador);
    return { ok: true, versao: estado.disponivel.versao };
  }, 'admin');

  /** Instalador escolhido pelo administrador (pendrive, download em outro computador). */
  rota('POST', '/api/atualizacao/arquivo', async ({ corpo }) => {
    const dados = corpo && corpo.arquivo;
    if (!Buffer.isBuffer(dados) || dados.length < 1e5) throw erro(400, 'Envie o arquivo do instalador (ClaraStyllus-PDV-Setup-x.y.z.exe).');
    if (dados.subarray(0, 2).toString('latin1') !== 'MZ') throw erro(400, 'Esse arquivo não é um instalador do Windows (.exe).');
    const nome = path.basename(String(corpo.nome || '')).replace(/[^\w.\-]/g, '_');
    const m = /ClaraStyllus-PDV-Setup-(\d+\.\d+\.\d+)\.exe$/i.exec(nome);
    if (!m) throw erro(400, 'O nome do arquivo precisa ser ClaraStyllus-PDV-Setup-x.y.z.exe.');
    const destino = path.join(pasta, nome);
    fs.writeFileSync(destino, dados);
    await executar(destino);
    return { ok: true, versao: m[1] };
  }, 'admin');

  return { verificar, status };
}

module.exports = { instalarAtualizacao, compararVersao, lerManifesto, VERSAO, URL_PADRAO };
