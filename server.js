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
  '.json': 'application/json',
};

function criarServidor(db) {
  const despachar = criarApi(db);

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname.startsWith('/api/')) {
      let bruto = '';
      req.on('data', (c) => {
        bruto += c;
        if (bruto.length > 5e6) req.destroy();
      });
      req.on('end', () => {
        let corpo = null;
        try {
          corpo = bruto ? JSON.parse(bruto) : null;
        } catch {
          return enviarJson(res, 400, { erro: 'JSON inválido.' });
        }
        try {
          const token = lerCookie(req.headers.cookie, COOKIE);
          const r = despachar(req.method, url.pathname, url.searchParams, corpo, token);
          if (!r) return enviarJson(res, 404, { erro: 'Rota não encontrada.' });
          if (r.sessao !== undefined) {
            res.setHeader('Set-Cookie', r.sessao
              ? `${COOKIE}=${r.sessao}; HttpOnly; SameSite=Strict; Path=/`
              : `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
          }
          if (r.corpo && r.corpo.__arquivo) {
            res.writeHead(200, {
              'Content-Type': r.corpo.tipo,
              'Content-Disposition': `attachment; filename="${r.corpo.nome}"`,
            });
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
    let arquivo = path.normalize(path.join(PASTA_PUBLICA, decodeURIComponent(url.pathname)));
    if (!arquivo.startsWith(PASTA_PUBLICA)) {
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

function enviarJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

if (require.main === module) {
  const porta = Number(process.env.PORTA || 3456);
  const arquivoBanco = process.env.BANCO || path.join(__dirname, 'dados', 'clara-styllus.db');
  const db = abrirBanco(arquivoBanco);
  // Só aceita conexões desta máquina; defina HOST=0.0.0.0 para usar em outro computador da rede.
  const host = process.env.HOST || '127.0.0.1';
  criarServidor(db).listen(porta, host, () => {
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
