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
  rota('POST', '/api/celular/sessao', async ({ corpo }) => {
    limpar();
    if (sessoes.size > 50) throw erro(429, 'Muitas fotos pendentes. Espere alguns minutos.');
    const token = crypto.randomBytes(16).toString('hex');
    const tipo = corpo && corpo.tipo === 'cliente' ? 'cliente' : 'produto';
    sessoes.set(token, { criada: Date.now(), nome: texto(corpo && corpo.nome, 120) || (tipo === 'cliente' ? 'Cliente' : 'Produto'), tipo, foto: null });
    return { token, enderecos: await enderecosLocais(), validade_min: VALIDADE_MS / 60e3 };
  }, 'logado');

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
    sessoes.delete(String(params.token));
    return { ok: true };
  }, 'logado');
}

module.exports = { instalarCelular, enderecosLocais, ordenarEnderecos, ipDaRotaPrincipal };
