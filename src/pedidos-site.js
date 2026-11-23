'use strict';

/**
 * Pedidos da loja online.
 *
 * O site (GitHub Pages ou Netlify) é só páginas: não alcança o computador da loja. Os pedidos ficam
 * numa "caixa de correio" grátis da própria loja, um Google Apps Script que guarda cada pedido numa
 * planilha privada do Google Drive dela. O sistema busca os pedidos novos de 2 em 2 minutos, cadastra a
 * cliente (se for nova), separa as peças numa reserva e mostra o pedido na tela "Pedidos online".
 *
 * A chave (pedidos_chave) só existe aqui e no script: sem ela ninguém lê os pedidos. O site só envia.
 */

const crypto = require('node:crypto');

/** Código do Google Apps Script que a loja cola em script.google.com (já com a chave dela). */
function codigoScript(chave, loja = 'Clara Styllus') {
  return `/**
 * Caixa de pedidos do site — ${loja}.
 * Recebe os pedidos do catálogo online e guarda numa planilha só sua ("Pedidos do site").
 * O sistema da loja busca os pedidos novos com a chave abaixo. Não mude nada aqui.
 */
const CHAVE = '${chave}';

function doPost(e) {
  const trava = LockService.getScriptLock();
  trava.waitLock(15000);
  try {
    const texto = (e && e.postData && e.postData.contents) || '';
    if (texto.length > 20000) return resposta_({ ok: false, erro: 'pedido grande demais' });
    const p = JSON.parse(texto);
    if (!p || !p.codigo || !Array.isArray(p.itens) || !p.itens.length || p.itens.length > 40) return resposta_({ ok: false, erro: 'pedido inválido' });
    const codigo = String(p.codigo).replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
    aba_().appendRow([new Date(), codigo, celula_(p.nome, 80), celula_(p.telefone, 30), texto, 'novo']);
    return resposta_({ ok: true, codigo: codigo });
  } catch (erro) {
    return resposta_({ ok: false, erro: 'pedido inválido' });
  } finally {
    trava.releaseLock();
  }
}

function doGet(e) {
  const q = (e && e.parameter) || {};
  if (q.chave !== CHAVE) return resposta_({ ok: false, erro: 'chave' });
  const aba = aba_();
  const linhas = aba.getDataRange().getValues();
  if (q.acao === 'confirmar') {
    const codigos = String(q.codigos || '').split(',');
    for (let i = 1; i < linhas.length; i++) {
      if (linhas[i][5] === 'novo' && codigos.indexOf(String(linhas[i][1])) >= 0) aba.getRange(i + 1, 6).setValue('no sistema');
    }
    return resposta_({ ok: true });
  }
  const pedidos = [];
  for (let i = 1; i < linhas.length; i++) {
    if (linhas[i][5] !== 'novo') continue;
    const quando = linhas[i][0] instanceof Date ? linhas[i][0].toISOString() : String(linhas[i][0]);
    pedidos.push({ codigo: String(linhas[i][1]), recebido: quando, dados: String(linhas[i][4]) });
  }
  return resposta_({ ok: true, pedidos: pedidos });
}

// Texto que começa com = + - @ viraria fórmula na planilha: guarda como texto.
function celula_(valor, max) {
  const t = String(valor || '').slice(0, max);
  return /^[=+\\-@]/.test(t) ? "'" + t : t;
}

function aba_() {
  const props = PropertiesService.getScriptProperties();
  let planilha = null;
  const id = props.getProperty('planilha');
  if (id) {
    try { planilha = SpreadsheetApp.openById(id); } catch (erro) { planilha = null; }
  }
  if (!planilha) {
    planilha = SpreadsheetApp.create('Pedidos do site - ${loja.replace(/'/g, '')}');
    props.setProperty('planilha', planilha.getId());
    const aba = planilha.getSheets()[0];
    aba.setName('Pedidos');
    aba.appendRow(['Recebido em', 'Código', 'Nome', 'WhatsApp', 'Pedido (dados)', 'Situação']);
    aba.setFrozenRows(1);
  }
  return planilha.getSheetByName('Pedidos');
}

function resposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
`;
}

const digitos = (t) => String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');

function instalarPedidosSite({ db, rota, erro, texto, plano, planos, transacao, config, reservas }) {
  const gravar = db.prepare('UPDATE config SET valor = ? WHERE chave = ?');
  const chave = () => {
    let c = config().pedidos_chave;
    if (!c) {
      c = crypto.randomBytes(18).toString('base64url');
      gravar.run(c, 'pedidos_chave');
    }
    return c;
  };

  /** Cliente pelo WhatsApp (mesmos dígitos); se não existir, cadastra. */
  function clienteDoPedido(nome, telefone) {
    const d = digitos(telefone);
    if (d.length >= 10) {
      const achou = db.prepare('SELECT id, telefone FROM clientes WHERE excluido_em IS NULL AND telefone IS NOT NULL').all()
        .find((c) => digitos(c.telefone) === d);
      if (achou) return Number(achou.id);
    }
    const r = db.prepare('INSERT INTO clientes (nome, telefone, observacao) VALUES (?,?,?)')
      .run(nome || 'Cliente do site', telefone || null, 'Cadastrada por um pedido do site.');
    return Number(r.lastInsertRowid);
  }

  /** Transforma um pedido recebido em reserva (só com as peças que ainda têm estoque). */
  function importar(p) {
    let d;
    try { d = JSON.parse(p.dados); } catch { d = null; }
    const codigo = String(p.codigo || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
    if (!d || !codigo || !Array.isArray(d.itens)) return null;
    if (db.prepare('SELECT 1 FROM pedidos_site WHERE codigo = ?').get(codigo)) return null; // já importado
    const nome = texto(d.nome, 80) || 'Cliente do site';
    const telefone = texto(d.telefone, 30);
    const obs = texto(d.observacao, 300);
    // Junta as peças iguais e confere no estoque (o preço vale o da loja, não o que veio do site).
    const pedidas = new Map();
    for (const it of d.itens.slice(0, 40)) {
      const id = Number(it.id);
      if (!Number.isInteger(id)) continue;
      pedidas.set(id, (pedidas.get(id) || 0) + 1);
    }
    const separar = [];
    const faltou = [];
    let total = 0;
    const resumo = [];
    for (const [id, qtd] of pedidas) {
      const prod = plano(db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1 AND servico = 0').get(id));
      const original = d.itens.find((x) => Number(x.id) === id) || {};
      const descricao = prod ? [prod.nome, prod.tamanho && `Tam ${prod.tamanho}`, prod.cor].filter(Boolean).join(' · ')
        : texto(original.nome, 120) || `Peça ${id}`;
      const temos = prod ? Math.max(0, Math.min(qtd, prod.estoque)) : 0;
      if (temos) {
        separar.push({ produto_id: id, quantidade: temos });
        total += temos * prod.preco_venda;
      }
      if (temos < qtd) faltou.push(`${qtd - temos}× ${descricao}`);
      resumo.push({ produto_id: id, descricao, quantidade: qtd, separadas: temos, preco: prod ? prod.preco_venda : null, foto_versao: prod ? prod.foto_versao : null });
    }
    return transacao(db, () => {
      const clienteId = clienteDoPedido(nome, telefone);
      let reservaId = null;
      if (separar.length) {
        const r = reservas.criarReserva({
          clienteId, itens: separar, usuarioNome: 'Site', origem: 'site',
          observacao: [`Pedido do site nº ${codigo}`, obs, faltou.length ? `Sem estoque: ${faltou.join(', ')}` : ''].filter(Boolean).join(' · ').slice(0, 300),
        });
        reservaId = r.id;
      }
      db.prepare(`INSERT INTO pedidos_site (codigo, recebido_em, cliente_id, nome, telefone, observacao, itens, total, reserva_id, faltou)
                  VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(codigo, String(p.recebido || '').slice(0, 30) || new Date().toISOString(), clienteId, nome, telefone, obs,
          JSON.stringify(resumo), total, reservaId, faltou.length ? faltou.join(', ') : null);
      return codigo;
    });
  }

  async function chamarScript(params) {
    const cfg = config();
    const url = new URL(cfg.pedidos_url);
    for (const [k, v] of Object.entries({ ...params, chave: chave() })) url.searchParams.set(k, v);
    const r = await fetch(url, { redirect: 'follow' });
    const txt = await r.text();
    let json;
    try { json = JSON.parse(txt); } catch { json = null; }
    if (!r.ok || !json) throw new Error('A caixa de pedidos do Google não respondeu direito. Confira o endereço (Implantar → Gerenciar implantações).');
    if (!json.ok) throw new Error(json.erro === 'chave' ? 'A chave do script não confere. Copie o código de novo em "Pedidos online" e reimplante.' : `Caixa de pedidos: ${json.erro}`);
    return json;
  }

  let rodando = null;
  /** Busca os pedidos novos, importa e avisa o script quais já entraram. */
  async function sincronizar() {
    const cfg = config();
    if (!/^https:\/\//.test(cfg.pedidos_url || '')) return { novos: [], configurado: false };
    if (rodando) return rodando;
    rodando = (async () => {
      const agora = () => new Date().toLocaleString('sv-SE');
      try {
        const r = await chamarScript({ acao: 'listar' });
        const novos = [];
        const recebidos = [];
        for (const p of r.pedidos || []) {
          try {
            const c = importar(p);
            if (c) novos.push(c);
            recebidos.push(String(p.codigo));
          } catch (e) {
            console.error('Pedido do site não importado:', p.codigo, e.message);
          }
        }
        if (recebidos.length) await chamarScript({ acao: 'confirmar', codigos: recebidos.join(',') });
        gravar.run(agora(), 'pedidos_ultima_busca');
        gravar.run('', 'pedidos_erro');
        return { novos, configurado: true };
      } catch (e) {
        gravar.run(agora(), 'pedidos_ultima_busca');
        gravar.run(String(e.message || e).slice(0, 300), 'pedidos_erro');
        throw e;
      } finally {
        rodando = null;
      }
    })();
    return rodando;
  }

  const situacao = (p) => {
    if (p.reserva_status === 'retirada') return 'concluido';
    if (p.reserva_status === 'cancelada' || p.status === 'cancelado') return 'cancelado';
    if (!p.reserva_id) return p.status === 'novo' ? 'novo' : 'sem_estoque';
    return p.status === 'novo' ? 'novo' : 'separado';
  };

  rota('GET', '/api/pedidos-site', () => {
    const cfg = config();
    const lista = planos(db.prepare(
      `SELECT ps.*, r.status AS reserva_status, r.prazo AS reserva_prazo, c.foto_versao AS cliente_foto
       FROM pedidos_site ps LEFT JOIN reservas r ON r.id = ps.reserva_id LEFT JOIN clientes c ON c.id = ps.cliente_id
       ORDER BY ps.importado_em DESC, ps.codigo LIMIT 200`
    ).all()).map((p) => ({ ...p, itens: JSON.parse(p.itens || '[]'), situacao: situacao(p) }));
    return {
      pedidos: lista,
      configurado: /^https:\/\//.test(cfg.pedidos_url || ''),
      ultima_busca: cfg.pedidos_ultima_busca || null,
      erro: cfg.pedidos_erro || null,
    };
  });

  rota('POST', '/api/pedidos-site/sincronizar', async () => {
    try { return await sincronizar(); } catch (e) { throw erro(502, e.message); }
  });

  rota('POST', '/api/pedidos-site/:codigo/visto', ({ params }) => {
    db.prepare(`UPDATE pedidos_site SET status = 'visto' WHERE codigo = ? AND status = 'novo'`).run(params.codigo);
    return { ok: true };
  });

  rota('POST', '/api/pedidos-site/:codigo/cancelar', ({ params }) => {
    const p = db.prepare('SELECT * FROM pedidos_site WHERE codigo = ?').get(params.codigo);
    if (!p) throw erro(404, 'Pedido não encontrado.');
    transacao(db, () => {
      if (p.reserva_id) reservas.cancelarSemSinal(p.reserva_id, `Pedido do site nº ${p.codigo} cancelado`);
      db.prepare(`UPDATE pedidos_site SET status = 'cancelado' WHERE codigo = ?`).run(p.codigo);
    });
    return { ok: true };
  });

  /** O código do Google Apps Script, já com a chave desta loja. */
  rota('GET', '/api/pedidos-site/script', () => ({ codigo: codigoScript(chave(), config().loja_nome || 'Clara Styllus') }), 'admin');

  const novos = () => db.prepare(`SELECT COUNT(*) AS n FROM pedidos_site WHERE status = 'novo'`).get().n;
  return { sincronizar, importar, novos, chave };
}

module.exports = { instalarPedidosSite, codigoScript };
