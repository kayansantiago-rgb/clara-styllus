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

const VALIDADE_MS = 15 * 60e3;

/** Endereços IPv4 deste computador na rede local (Wi-Fi/cabo), os de rede doméstica primeiro. */
function enderecosLocais() {
  const lista = [];
  for (const [nome, ifs] of Object.entries(os.networkInterfaces())) {
    for (const i of ifs || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      const privado = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address);
      // Placas virtuais (VirtualBox, VMware, WSL, Hyper-V) vão para o fim.
      const virtual = /virtual|vmware|vbox|wsl|hyper-v|vethernet|docker/i.test(nome);
      lista.push({ ip: i.address, peso: (privado ? 0 : 2) + (virtual ? 1 : 0) });
    }
  }
  return lista.sort((a, b) => a.peso - b.peso).map((x) => x.ip);
}

function instalarCelular({ rota, erro, texto }) {
  const sessoes = new Map();
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

  /** Computador: abre a sessão e recebe os endereços para montar o QR Code. */
  rota('POST', '/api/celular/sessao', ({ corpo }) => {
    limpar();
    if (sessoes.size > 50) throw erro(429, 'Muitas fotos pendentes. Espere alguns minutos.');
    const token = crypto.randomBytes(16).toString('hex');
    sessoes.set(token, { criada: Date.now(), nome: texto(corpo && corpo.nome, 120) || 'Produto', foto: null });
    return { token, enderecos: enderecosLocais(), validade_min: VALIDADE_MS / 60e3 };
  }, 'admin');

  /** Celular: confere o código e mostra o nome da peça. */
  rota('GET', '/api/celular/sessao/:token', ({ params }) => {
    const s = sessao(params.token);
    return { nome: s.nome, recebida: !!s.foto };
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
  }, 'admin');

  /** Computador: fechou o cadastro, a sessão acaba. */
  rota('DELETE', '/api/celular/sessao/:token', ({ params }) => {
    sessoes.delete(String(params.token));
    return { ok: true };
  }, 'admin');
}

module.exports = { instalarCelular, enderecosLocais };
