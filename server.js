'use strict';

const [maior, menor] = process.versions.node.split('.').map(Number);
if (maior < 22 || (maior === 22 && menor < 13)) {
  console.error(`É preciso Node.js 22.13 ou mais novo (você tem ${process.versions.node}).`);
  console.error('Baixe em https://nodejs.org (versão LTS).');
  process.exit(1);
}

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { abrirBanco } = require('./src/db');
const { criarApi } = require('./src/api');

const PASTA_PUBLICA = path.join(__dirname, 'public');
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
};

function criarServidor(db, opcoes = {}) {
  const despachar = criarApi(db, opcoes);
  // Backup diário: confere ao ligar e depois a cada hora (só faz se o último tiver mais de 24 h).
  if (opcoes.agendarBackup) {
    const verificar = () => {
      const r = despachar.backup.seNecessario('automático diário');
      if (r) console.log(`Backup automático salvo em ${r.arquivo}${r.aviso ? ' — ' + r.aviso : ''}`);
    };
    setTimeout(verificar, 10000).unref();
    setInterval(verificar, 36e5).unref();
    // Procura versão nova 1 minuto depois de ligar e a cada 6 horas (precisa de internet).
    const procurar = () => {
      if (db.prepare(`SELECT valor FROM config WHERE chave = 'atualizacao_auto'`).get()?.valor === '0') return;
      despachar.atualizacao.verificar().then((s) => {
        if (s.disponivel) console.log(`Atualização disponível: versão ${s.disponivel.versao}`);
      });
    };
    setTimeout(procurar, 60000).unref();
    setInterval(procurar, 6 * 36e5).unref();
  }

  // Outros computadores da loja: liberado em Configurações (ou REDE_LIBERADA=1 na linha de comando).
  const lerRede = db.prepare(`SELECT valor FROM config WHERE chave = 'rede_computadores'`);
  const redeLiberada = () => opcoes.redeLiberada || lerRede.get()?.valor === '1';

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    // "Você é o PDV da Clara Styllus?" — o programa do outro computador procura o caixa na rede com isso.
    if (url.pathname === '/rede/ping') {
      req.resume();
      const cors = {
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Allow-Methods': 'GET', 'Cache-Control': 'no-store',
      };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      const loja = db.prepare(`SELECT valor FROM config WHERE chave = 'loja_nome'`).get()?.valor || 'Clara Styllus';
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ app: 'clara-styllus-pdv', liberado: redeLiberada(), loja }));
    }

    // Quem não está neste computador (celular na rede da loja) só acessa a página da foto do produto,
    // a não ser que a loja tenha liberado os outros computadores.
    if (!ehLocal(req) && !liberadoParaCelular(req.method, url.pathname) && !redeLiberada()) {
      req.resume();
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Este computador ainda não foi liberado. No computador do caixa, vá em Configurações → Loja → Outros computadores da loja.');
    }
    if (url.pathname === '/celular') {
      return fs.readFile(path.join(PASTA_PUBLICA, 'celular.html'), (err, dados) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(dados);
      });
    }

    // Envio do instalador (arquivo binário grande) para atualizar sem internet.
    if (url.pathname === '/api/atualizacao/arquivo' && req.method === 'POST') {
      // Confere o login antes de receber o arquivo (até 300 MB) para ninguém encher a memória.
      const quem = despachar.usuarioDoToken(lerCookie(req.headers.cookie, COOKIE));
      if (!quem || quem.perfil !== 'admin') {
        req.resume();
        return enviarJson(res, quem ? 403 : 401, { erro: quem ? 'Só o administrador pode atualizar o sistema.' : 'Entre no sistema.' });
      }
      if (Number(req.headers['content-length']) > 300e6) {
        req.resume();
        return enviarJson(res, 413, { erro: 'Arquivo grande demais.' });
      }
      const partes = [];
      let tam = 0;
      req.on('data', (c) => {
        tam += c.length;
        if (tam > 300e6) req.destroy();
        else partes.push(c);
      });
      req.on('end', async () => {
        try {
          const token = lerCookie(req.headers.cookie, COOKIE);
          const corpo = { arquivo: Buffer.concat(partes), nome: decodeURIComponent(req.headers['x-nome-arquivo'] || '') };
          const r = await despachar('POST', url.pathname, url.searchParams, corpo, token);
          enviarJson(res, r.status, r.corpo);
        } catch (e) {
          console.error(e);
          enviarJson(res, 500, { erro: 'Erro interno: ' + e.message });
        }
      });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      let bruto = '';
      req.on('data', (c) => {
        bruto += c;
        if (bruto.length > 5e6) req.destroy();
      });
      req.on('end', async () => {
        let corpo = null;
        try {
          corpo = bruto ? JSON.parse(bruto) : null;
        } catch {
          return enviarJson(res, 400, { erro: 'JSON inválido.' });
        }
        try {
          const token = lerCookie(req.headers.cookie, COOKIE);
          const r = await despachar(req.method, url.pathname, url.searchParams, corpo, token);
          if (!r) return enviarJson(res, 404, { erro: 'Rota não encontrada.' });
          if (r.sessao !== undefined) {
            res.setHeader('Set-Cookie', r.sessao
              ? `${COOKIE}=${r.sessao}; HttpOnly; SameSite=Strict; Path=/`
              : `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
          }
          if (r.corpo && r.corpo.__arquivo) {
            res.writeHead(200, r.corpo.inline
              ? { 'Content-Type': r.corpo.tipo, 'Cache-Control': 'private, max-age=31536000' }
              : { 'Content-Type': r.corpo.tipo, 'Content-Disposition': `attachment; filename="${r.corpo.nome}"` });
            return res.end(r.corpo.conteudo);
          }
          enviarJson(res, r.status, r.corpo);
        } catch (e) {
          console.error(e);
          enviarJson(res, 500, { erro: 'Erro interno: ' + e.message });
        }
      });
      return;
    }

    // Arquivos estáticos (sem permitir sair da pasta public).
    let caminho;
    try {
      caminho = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      return res.end('Endereço inválido');
    }
    let arquivo = path.normalize(path.join(PASTA_PUBLICA, caminho));
    if (arquivo !== PASTA_PUBLICA && !arquivo.startsWith(PASTA_PUBLICA + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    if (url.pathname === '/' || !path.extname(arquivo)) arquivo = path.join(PASTA_PUBLICA, 'index.html');
    fs.readFile(arquivo, (err, dados) => {
      if (err) {
        res.writeHead(404);
        return res.end('Não encontrado');
      }
      res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(dados);
    });
  });
}

const COOKIE = 'pdv_sessao';

function lerCookie(cabecalho, nome) {
  for (const parte of String(cabecalho || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return v.join('=');
  }
  return null;
}

/** Pedido vindo deste mesmo computador? */
function ehLocal(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/** O que o celular pode acessar: a página da foto e o envio da foto (com o código da sessão). */
function liberadoParaCelular(metodo, caminho) {
  if (metodo === 'GET' && caminho === '/celular') return true;
  if (metodo === 'GET' && /^\/api\/celular\/sessao\/[0-9a-f]{32}$/.test(caminho)) return true;
  if (metodo === 'POST' && /^\/api\/celular\/foto\/[0-9a-f]{32}$/.test(caminho)) return true;
  // Celular conectado perguntando se tem foto para tirar.
  if (metodo === 'GET' && /^\/api\/celular\/aparelho\/[0-9a-f]{32}$/.test(caminho)) return true;
  return false;
}

function enviarJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

if (require.main === module) {
  const porta = Number(process.env.PORTA || 3456);
  const arquivoBanco = process.env.BANCO || path.join(__dirname, 'dados', 'clara-styllus.db');
  const db = abrirBanco(arquivoBanco);
  // Backups ficam ao lado da pasta de dados (no Windows: C:\ProgramData\ClaraStyllus\backups).
  const pastaBackup = process.env.PASTA_BACKUP || path.join(path.dirname(arquivoBanco), '..', 'backups');
  const pastaAtualizacoes = path.join(path.dirname(arquivoBanco), '..', 'atualizacoes');
  // Escuta na rede da loja para o celular mandar a foto do produto, mas quem não está neste computador
  // só acessa essa página (ver liberadoParaCelular). REDE_LIBERADA=1 libera o sistema todo na rede
  // (outro computador como caixa); HOST=127.0.0.1 desliga o acesso pela rede.
  const host = process.env.HOST || '0.0.0.0';
  const redeLiberada = process.env.REDE_LIBERADA === '1';
  criarServidor(db, { pastaBackup, pastaAtualizacoes, pastaDados: path.join(path.dirname(arquivoBanco), '..'), agendarBackup: true, redeLiberada }).listen(porta, host, () => {
    console.log('');
    console.log('  Clara Styllus PDV rodando!');
    console.log(`  Abra no navegador: http://localhost:${porta}`);
    console.log(`  Banco de dados:    ${arquivoBanco}`);
    console.log('  Para encerrar, feche esta janela ou aperte Ctrl+C.');
    console.log('');
  });
  const fechar = () => {
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', fechar);
  process.on('SIGTERM', fechar);
}

module.exports = { criarServidor };
