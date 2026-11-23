'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { novaApi } = require('./ajuda');
const catalogoSite = require('../src/catalogo-site');

// JPEG mínimo (1×1) só para ter "foto" cadastrada.
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function preparar() {
  const api = novaApi();
  const { chamar } = api;
  chamar('PUT', '/api/config', { loja_telefone: '(63) 99999-1234', loja_instagram: 'clarastyllus', catalogo_titulo: 'Nova coleção' });
  const P = (c) => chamar('POST', '/api/produtos/grade', c).corpo;
  const calca = P({ nome: 'Calça Wide', categoria: 'Calças', preco_venda: 18990, preco_custo: 8000, variantes: [{ tamanho: '40', cor: 'Azul', quantidade: 2 }, { tamanho: '38', cor: 'Azul', quantidade: 1 }, { tamanho: '42', cor: 'Azul', quantidade: 0 }] });
  P({ nome: 'Blusa </script><b>', categoria: 'Blusas', preco_venda: 8990, variantes: [{ tamanho: 'M', quantidade: 3 }] });
  P({ nome: 'Saia Esgotada', categoria: 'Saias', preco_venda: 9990, variantes: [{ tamanho: 'P', quantidade: 0 }] });
  chamar('PUT', `/api/produtos/${calca[0].id}/foto`, { imagem: JPG });
  return { ...api, calca };
}

test('catálogo online: só peças com estoque, tamanhos em ordem, nada de custo e texto seguro no HTML', () => {
  const { chamar, db } = preparar();
  const st = chamar('GET', '/api/catalogo/site').corpo;
  assert.equal(st.pecas, 2);
  assert.equal(st.sem_foto, 1);
  assert.equal(st.whatsapp_ok, true);
  assert.equal(st.tem_chave, false);
  const cfg = chamar('GET', '/api/config').corpo;
  const { dados } = catalogoSite.montarDados(db, cfg);
  const calca = dados.pecas.find((p) => p.nome === 'Calça Wide');
  assert.deepEqual(calca.tamanhos, ['38', '40']);
  assert.equal(calca.fotos.length, 1);
  assert.equal(dados.whatsapp, '5563999991234');
  assert.equal(dados.instagram, '@clarastyllus');
  assert.ok(!JSON.stringify(dados).includes('8000'), 'o custo não vai para o site');
  const html = chamar('GET', '/api/catalogo/site/previa/index.html').corpo;
  assert.equal(html.tipo, 'text/html; charset=utf-8');
  const texto = html.conteudo.toString('utf8');
  assert.ok(!texto.includes('__DADOS__'));
  assert.ok(!texto.includes('</script><b>'), 'nome da peça não fecha o <script> dos dados');
  assert.match(texto, /Nova coleção · Clara Styllus/);
  // A foto e a logo da prévia
  const foto = chamar('GET', `/api/catalogo/site/previa/${calca.fotos[0]}`).corpo;
  assert.equal(foto.tipo, 'image/jpeg');
  assert.equal(chamar('GET', '/api/catalogo/site/previa/assets/logo.png').corpo.tipo, 'image/png');
  assert.equal(chamar('GET', '/api/catalogo/site/previa/assets/..%2Fapi.js').status, 404);
});

test('catálogo online: o .zip abre e tem index.html, fotos e assets', () => {
  const { chamar } = preparar();
  const r = chamar('GET', '/api/catalogo/site.zip').corpo;
  assert.equal(r.tipo, 'application/zip');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-zip-'));
  const arq = path.join(pasta, 'site.zip');
  fs.writeFileSync(arq, r.conteudo);
  let lista;
  try { lista = execFileSync('unzip', ['-Z1', arq], { encoding: 'utf8' }).trim().split('\n'); } catch { return; } // sem unzip na máquina
  assert.ok(lista.includes('index.html'));
  assert.ok(lista.includes('assets/logo.png'));
  assert.ok(lista.some((n) => /^fotos\/\d+-\d+\.jpg$/.test(n)));
  execFileSync('unzip', ['-q', '-t', arq]);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('catálogo online: publica na Netlify (cria o site na 1ª vez, depois só atualiza) e a chave nunca volta para a tela', async () => {
  const { chamar } = preparar();
  const pedidos = [];
  const srv = http.createServer((req, res) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => {
      pedidos.push({ metodo: req.method, url: req.url, auth: req.headers.authorization, tipo: req.headers['content-type'], tam: Buffer.concat(partes).length });
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && req.url === '/sites') return res.end(JSON.stringify({ id: 'site123', ssl_url: 'https://clara-styllus.netlify.app' }));
      if (req.method === 'GET' && req.url === '/sites/site123') return res.end(JSON.stringify({ id: 'site123', ssl_url: 'https://clara-styllus.netlify.app' }));
      if (req.method === 'POST' && req.url === '/sites/site123/deploys') return res.end(JSON.stringify({ id: `dep${pedidos.length}` }));
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  process.env.PDV_NETLIFY_API = `http://127.0.0.1:${srv.address().port}`;
  try {
    const sem = await chamar('POST', '/api/catalogo/site/publicar');
    assert.equal(sem.status, 502);
    assert.match(sem.corpo.erro, /chave da Netlify/);

    chamar('PUT', '/api/config', { catalogo_netlify_token: 'segredo-abc' });
    const cfg = chamar('GET', '/api/config').corpo;
    assert.notEqual(cfg.catalogo_netlify_token, 'segredo-abc');
    // Salvar as configurações com a chave mascarada não apaga a chave guardada.
    chamar('PUT', '/api/config', { catalogo_netlify_token: cfg.catalogo_netlify_token, loja_cidade: 'Palmas' });

    const r1 = await chamar('POST', '/api/catalogo/site/publicar');
    assert.equal(r1.status, 200, JSON.stringify(r1.corpo));
    assert.equal(r1.corpo.url, 'https://clara-styllus.netlify.app');
    assert.equal(pedidos.find((p) => p.url === '/sites').auth, 'Bearer segredo-abc');
    const dep = pedidos.find((p) => p.url.endsWith('/deploys'));
    assert.equal(dep.tipo, 'application/zip');
    assert.ok(dep.tam > 1000);

    pedidos.length = 0;
    const r2 = await chamar('POST', '/api/catalogo/site/publicar');
    assert.equal(r2.status, 200);
    assert.ok(!pedidos.some((p) => p.metodo === 'POST' && p.url === '/sites'), 'na 2ª vez não cria outro site');
    const st = chamar('GET', '/api/catalogo/site').corpo;
    assert.equal(st.url, 'https://clara-styllus.netlify.app');
    assert.ok(st.publicado_em);
  } finally {
    delete process.env.PDV_NETLIFY_API;
    srv.close();
  }
});
