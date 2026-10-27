'use strict';

/**
 * Foto do produto tirada pelo celular.
 *
 * O computador abre uma "sessão" (código aleatório de uso único, vale 15 minutos) e mostra um QR Code
 * com o endereço do PDV na rede da loja. O celular abre /celular, tira a foto e envia; o computador
 * busca a foto e coloca no cadastro. O celular não entra no sistema: só consegue mandar a foto daquela
 * sessão (server.js bloqueia todo o resto para quem não está no computador da loja).
 */

const os = require('node:os');
const crypto = require('node:crypto');
const dgram = require('node:dgram');

const VALIDADE_MS = 15 * 60e3;

// Faixas usadas por programas de máquina virtual (VirtualBox 192.168.56.x, Docker, WSL/Hyper-V…):
// existem só dentro do computador, o celular nunca alcança.
const FAIXA_VIRTUAL = /^(192\.168\.56\.|192\.168\.99\.|172\.17\.|169\.254\.)/;
const NOME_VIRTUAL = /virtual|vmware|vbox|wsl|hyper-v|vethernet|docker|loopback|bluetooth/i;

/**
 * Ordena os endereços: primeiro o da placa que o Windows usa para sair para a rede (Wi-Fi ou cabo de
 * verdade), depois os de rede local comum; placas virtuais e endereços sem rede por último.
 */
function ordenarEnderecos(interfaces, preferido) {
  const lista = [];
  for (const [nome, ifs] of Object.entries(interfaces)) {
    for (const i of ifs || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal) continue;
      const privado = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address);
      // Faixa conhecida de máquina virtual pesa mais que só o nome (o VirtualBox aparece como "Ethernet 2").
      const peso = i.address === preferido ? -10
        : (privado ? 0 : 2) + (NOME_VIRTUAL.test(nome) ? 5 : 0) + (FAIXA_VIRTUAL.test(i.address) ? 6 : 0);
      lista.push({ ip: i.address, peso, nome });
    }
  }
  return lista.sort((a, b) => a.peso - b.peso).map((x) => x.ip);
}

/**
 * Endereço da placa que o sistema usa para sair para a rede: "conecta" um UDP num endereço externo
 * (nada é enviado, só a rota é calculada) e lê o IP de origem escolhido. Sem rede, devolve null.
 */
function ipDaRotaPrincipal() {
  return new Promise((ok) => {
    let feito = false;
    const s = dgram.createSocket('udp4');
    const fim = (ip) => {
      if (feito) return;
      feito = true;
      try { s.close(); } catch { /* já fechado */ }
      ok(ip);
    };
    s.on('error', () => fim(null));
    try {
      s.connect(53, '8.8.8.8', () => {
        try { fim(s.address().address); } catch { fim(null); }
      });
    } catch { fim(null); }
    setTimeout(() => fim(null), 800).unref();
  });
}

async function enderecosLocais() {
  return ordenarEnderecos(os.networkInterfaces(), await ipDaRotaPrincipal());
}

const ONLINE_MS = 12e3; // celular que perguntou há menos de 12 s está com a página aberta

function instalarCelular({ db, rota, erro, texto }) {
  const sessoes = new Map();
  // Celulares conectados: o que cada um está esperando agora (token do aparelho -> token da sessão)
  // e quando perguntou pela última vez.
  const pedidos = new Map();
  const vistos = new Map();
  const aparelho = (token) => {
    const a = db.prepare('SELECT token, nome FROM celular_aparelhos WHERE token = ?').get(String(token || ''));
    if (!a) throw erro(404, 'Este celular foi desconectado. Leia o QR Code de novo no computador.');
    return a;
  };
  const online = (token) => Date.now() - (vistos.get(token) || 0) < ONLINE_MS;
  const limpar = () => {
    const agora = Date.now();
    for (const [t, s] of sessoes) if (agora - s.criada > VALIDADE_MS) sessoes.delete(t);
  };
  const sessao = (token) => {
    limpar();
    const s = sessoes.get(String(token || ''));
    if (!s) throw erro(404, 'Este QR Code venceu. Gere outro no computador.');
    return s;
  };

  /**
   * Computador: abre a sessão e recebe os endereços para montar o QR Code.
   * Com um celular conectado e com a página aberta, o pedido já vai para ele (sem QR Code).
   * Sem celular, devolve também um código de aparelho novo: quem ler o QR fica conectado.
   */
  rota('POST', '/api/celular/sessao', async ({ corpo }) => {
    limpar();
    if (sessoes.size > 50) throw erro(429, 'Muitas fotos pendentes. Espere alguns minutos.');
    const token = crypto.randomBytes(16).toString('hex');
    const tipo = corpo && corpo.tipo === 'cliente' ? 'cliente' : 'produto';
    sessoes.set(token, { criada: Date.now(), nome: texto(corpo && corpo.nome, 120) || (tipo === 'cliente' ? 'Cliente' : 'Produto'), tipo, foto: null });
    const conectados = db.prepare('SELECT token, nome FROM celular_aparelhos ORDER BY visto_em DESC').all().filter((a) => online(a.token));
    let enviado = null;
    let parear = null;
    if (conectados.length && !(corpo && corpo.qr)) {
      enviado = conectados[0];
      pedidos.set(enviado.token, token);
      sessoes.get(token).aparelho = enviado.token;
    } else {
      // Aparelhos que nunca leram o QR somem depois de 1 dia.
      db.prepare(`DELETE FROM celular_aparelhos WHERE visto_em IS NULL AND criado_em < datetime('now','localtime','-1 day')`).run();
      parear = crypto.randomBytes(16).toString('hex');
      const n = db.prepare('SELECT COUNT(*) AS n FROM celular_aparelhos').get().n;
      db.prepare('INSERT INTO celular_aparelhos (token, nome) VALUES (?, ?)').run(parear, `Celular ${n + 1}`);
      // Esta foto já fica como o pedido do celular que ler o QR.
      pedidos.set(parear, token);
      sessoes.get(token).aparelho = parear;
    }
    return {
      token, enderecos: await enderecosLocais(), validade_min: VALIDADE_MS / 60e3,
      celular: enviado ? { nome: enviado.nome } : null, parear,
    };
  }, 'logado');

  /** Celular conectado: "tem foto para tirar?" (pergunta a cada 1,5 s com a página aberta). */
  rota('GET', '/api/celular/aparelho/:token', ({ params }) => {
    limpar();
    const a = aparelho(params.token);
    if (!vistos.has(a.token)) db.prepare(`UPDATE celular_aparelhos SET visto_em = datetime('now','localtime') WHERE token = ?`).run(a.token);
    vistos.set(a.token, Date.now());
    const t = pedidos.get(a.token);
    const s = t && sessoes.get(t);
    if (t && !s) pedidos.delete(a.token);
    return { nome: a.nome, pedido: s ? { token: t, nome: s.nome, tipo: s.tipo } : null };
  }, 'publico');

  /** Computador: celulares conectados (Configurações). */
  rota('GET', '/api/celular/aparelhos', () => db.prepare(`SELECT token, nome, visto_em FROM celular_aparelhos
    WHERE visto_em IS NOT NULL ORDER BY visto_em DESC`).all().map((a) => ({ ...a, online: online(a.token) })), 'logado');

  rota('DELETE', '/api/celular/aparelhos/:token', ({ params }) => {
    db.prepare('DELETE FROM celular_aparelhos WHERE token = ?').run(String(params.token));
    pedidos.delete(String(params.token));
    vistos.delete(String(params.token));
    return { ok: true };
  }, 'admin');

  /** Celular: confere o código e mostra o nome da peça. */
  rota('GET', '/api/celular/sessao/:token', ({ params }) => {
    const s = sessao(params.token);
    return { nome: s.nome, tipo: s.tipo, recebida: !!s.foto };
  }, 'publico');

  /** Celular: envia a foto (JPEG/PNG/WEBP em base64, já reduzida pelo celular). */
  rota('POST', '/api/celular/foto/:token', ({ params, corpo }) => {
    const s = sessao(params.token);
    const img = String((corpo && corpo.imagem) || '');
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(img)) throw erro(400, 'Foto inválida.');
    if (img.length > 2.2e6) throw erro(400, 'Foto muito grande.');
    s.foto = img;
    return { ok: true };
  }, 'publico');

  /** Computador: busca a foto nova (cada foto é entregue uma vez; o celular pode tirar outra). */
  rota('GET', '/api/celular/foto/:token', ({ params }) => {
    const s = sessao(params.token);
    const foto = s.foto;
    s.foto = null;
    return { foto };
  }, 'logado');

  /** Computador: fechou o cadastro, a sessão acaba. */
  rota('DELETE', '/api/celular/sessao/:token', ({ params }) => {
    const s = sessoes.get(String(params.token));
    if (s && s.aparelho && pedidos.get(s.aparelho) === String(params.token)) pedidos.delete(s.aparelho);
    sessoes.delete(String(params.token));
    return { ok: true };
  }, 'logado');
}

module.exports = { instalarCelular, enderecosLocais, ordenarEnderecos, ipDaRotaPrincipal };
