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
    chamar('PUT', '/api/config', { catalogo_destino: 'netlify' });
    const sem = await chamar('POST', '/api/catalogo/site/publicar');
    assert.equal(sem.status, 502);
    assert.match(sem.corpo.erro, /chave da Netlify/);

    chamar('PUT', '/api/config', { catalogo_destino: 'netlify', catalogo_netlify_token: 'segredo-abc' });
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

test('catálogo online no GitHub Pages: cria o repositório, manda só o que mudou e liga o Pages', async () => {
  const { chamar } = preparar();
  const repos = new Map(); // nome -> { arquivos: Map(path -> sha), tree, head, pages }
  const pedidos = [];
  let n = 0;
  const id = () => `sha${++n}`;
  const srv = http.createServer((req, res) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => {
      const corpo = partes.length ? JSON.parse(Buffer.concat(partes).toString()) : null;
      pedidos.push(`${req.method} ${req.url}`);
      const ok = (o, st = 200) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== 'Bearer ghp_teste') return ok({ message: 'Bad credentials' }, 401);
      const m = /^\/repos\/loja\/([^/]+)(\/.*)?$/.exec(req.url.split('?')[0]);
      if (req.url === '/user') return ok({ login: 'loja' });
      if (req.method === 'POST' && req.url === '/user/repos') {
        repos.set(corpo.name, { blobs: new Map(), trees: new Map([['t0', []]]), commits: new Map([['c0', 't0']]), head: 'c0', pages: false });
        return ok({ name: corpo.name, owner: { login: 'loja' }, default_branch: 'main' }, 201);
      }
      if (!m) return ok({ message: 'Not Found' }, 404);
      const r = repos.get(m[1]);
      const resto = m[2] || '';
      if (!r) return ok({ message: 'Not Found' }, 404);
      if (!resto) return ok({ name: m[1], owner: { login: 'loja' }, default_branch: 'main' });
      if (resto === '/git/ref/heads/main') return ok({ object: { sha: r.head } });
      if (resto.startsWith('/git/commits/')) return ok({ tree: { sha: r.commits.get(resto.split('/').pop()) } });
      if (resto.startsWith('/git/trees/')) return ok({ tree: (r.trees.get(resto.split('/').pop()) || []).map((t) => ({ ...t, type: 'blob' })) });
      if (resto === '/git/blobs') {
        const dados = Buffer.from(corpo.content, 'base64');
        const sha = catalogoSite.shaGit(dados);
        r.blobs.set(sha, dados);
        return ok({ sha }, 201);
      }
      if (resto === '/git/trees') {
        const chave = corpo.tree.map((t) => `${t.path}:${t.sha}`).sort().join('|');
        for (const [k, v] of r.trees) if (v.map((t) => `${t.path}:${t.sha}`).sort().join('|') === chave) return ok({ sha: k }, 201);
        const tid = id();
        r.trees.set(tid, corpo.tree.map((t) => ({ path: t.path, sha: t.sha })));
        return ok({ sha: tid }, 201);
      }
      if (req.method === 'POST' && resto === '/git/commits') { const cid = id(); r.commits.set(cid, corpo.tree); return ok({ sha: cid }, 201); }
      if (req.method === 'PATCH' && resto === '/git/refs/heads/main') { r.head = corpo.sha; return ok({}); }
      if (resto === '/pages' && req.method === 'GET') return r.pages ? ok({ html_url: `https://loja.github.io/${m[1]}/` }) : ok({ message: 'Not Found' }, 404);
      if (resto === '/pages' && req.method === 'POST') { r.pages = true; return ok({ html_url: `https://loja.github.io/${m[1]}/` }, 201); }
      return ok({ message: 'Not Found' }, 404);
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  process.env.PDV_GITHUB_API = `http://127.0.0.1:${srv.address().port}`;
  try {
    chamar('PUT', '/api/config', { catalogo_github_token: 'ghp_teste', catalogo_nome_site: 'catalogo-clara' });
    const r1 = await chamar('POST', '/api/catalogo/site/publicar');
    assert.equal(r1.status, 200, JSON.stringify(r1.corpo));
    assert.equal(r1.corpo.url, 'https://loja.github.io/catalogo-clara/');
    const repo = repos.get('catalogo-clara');
    assert.ok(repo.pages, 'liga o GitHub Pages');
    const arvore = repo.trees.get(repo.commits.get(repo.head));
    const caminhos = arvore.map((t) => t.path);
    assert.ok(caminhos.includes('index.html') && caminhos.includes('.nojekyll') && caminhos.includes('assets/logo.png'));
    const html = repo.blobs.get(arvore.find((t) => t.path === 'index.html').sha).toString();
    assert.match(html, /Calça Wide/);
    assert.equal(chamar('GET', '/api/config').corpo.catalogo_github_token, '••••••••');
    assert.equal(chamar('GET', '/api/catalogo/site').corpo.repo, 'loja/catalogo-clara');

    // A 2ª publicação já sabe o endereço do site (imagem de prévia do WhatsApp); da 3ª em diante, sem
    // mudanças, não reenvia arquivos nem cria commit.
    await chamar('POST', '/api/catalogo/site/publicar');
    assert.match(repo.blobs.get(repo.trees.get(repo.commits.get(repo.head)).find((t) => t.path === 'index.html').sha).toString(),
      /og:image" content="https:\/\/loja\.github\.io\/catalogo-clara\/fotos\//);
    pedidos.length = 0;
    const r2 = await chamar('POST', '/api/catalogo/site/publicar');
    assert.equal(r2.status, 200);
    assert.ok(!pedidos.some((p) => p.includes('/git/blobs') || p.includes('POST /repos/loja/catalogo-clara/git/commits') || p === 'POST /user/repos'), pedidos.join('\n'));

    // Preço mudou: manda só o index.html e a página do link daquela peça (a prévia do WhatsApp mostra o preço).
    const calca = chamar('GET', '/api/produtos?q=Calça').corpo.find((p) => p.estoque > 0);
    chamar('PUT', `/api/produtos/${calca.id}`, { preco_venda: 17990 });
    pedidos.length = 0;
    await chamar('POST', '/api/catalogo/site/publicar');
    assert.equal(pedidos.filter((p) => p.includes('/git/blobs')).length, 2);
    const link = chamar('GET', `/api/catalogo/site/link/${calca.id}`).corpo;
    assert.match(link.url, /^https:\/\/loja\.github\.io\/catalogo-clara\/p\/\d+\/$/);
    const pagina = repo.trees.get(repo.commits.get(repo.head)).find((t) => t.path === `p/${link.url.match(/p\/(\d+)/)[1]}/index.html`);
    assert.match(repo.blobs.get(pagina.sha).toString(), /og:title" content="Calça Wide · R\$ 179,90"/);

    chamar('PUT', '/api/config', { catalogo_github_token: 'errado' });
    const r4 = await chamar('POST', '/api/catalogo/site/publicar');
    assert.match(r4.corpo.erro, /chave do GitHub não foi aceita/);
  } finally {
    delete process.env.PDV_GITHUB_API;
    srv.close();
  }
});

test('site: giro de 360°, foto de capa, tema de época e link direto da peça', () => {
  const { chamar, db } = novaApi();
  const [p38, p40] = chamar('POST', '/api/produtos/grade', { nome: 'Vestido Midi', preco_venda: 25990, variantes: [{ tamanho: 'P', quantidade: 1 }, { tamanho: 'M', quantidade: 2 }] }).corpo;
  const jpg = `data:image/jpeg;base64,${Buffer.from('quadro').toString('base64')}`;
  // Giro: sobe quadro a quadro e fecha com a quantidade; faltando quadro, não fecha.
  for (let i = 0; i < 8; i += 1) assert.equal(chamar('PUT', `/api/produtos/${p40.id}/360/${i}`, { imagem: jpg }).status, 200);
  assert.equal(chamar('POST', `/api/produtos/${p40.id}/360`, { quadros: 9 }).status, 400);
  assert.equal(chamar('POST', `/api/produtos/${p40.id}/360`, { quadros: 8 }).corpo.foto360_n, 8);
  const cfg = chamar('GET', '/api/config').corpo;
  let { dados } = catalogoSite.montarDados(db, cfg, { hoje: new Date(2026, 10, 23) });
  const peca = dados.pecas.find((p) => p.nome === 'Vestido Midi');
  assert.equal(peca.giro.length, 8);
  assert.equal(peca.lk, p38.id, 'link fixo pelo primeiro cadastro do modelo');
  assert.equal(chamar('GET', `/api/catalogo/site/previa/giro/${peca.giro[3].split('/')[1]}`).status, 200);

  // Tema automático: Black Friday 2026 é 27/11; a contagem vai até o domingo seguinte.
  assert.equal(catalogoSite.blackFriday(2026).getDate(), 27);
  assert.equal(catalogoSite.blackFriday(2024).getDate(), 29);
  assert.equal(catalogoSite.diaDasMaes(2026).getDate(), 10);
  assert.equal(dados.tema.id, 'black_friday');
  assert.equal(new Date(dados.tema.fim).getDate(), 29);
  assert.equal(catalogoSite.temaDoSite(cfg, new Date(2026, 11, 10)).id, 'natal');
  assert.equal(catalogoSite.temaDoSite(cfg, new Date(2026, 7, 10)).id, 'classico');
  assert.deepEqual(catalogoSite.temaDoSite({ catalogo_tema: 'verao' }, new Date(2026, 0, 5)), { id: 'verao', fim: '' });
  assert.equal(catalogoSite.temaDoSite({ catalogo_tema: 'classico' }, new Date(2026, 10, 23)).id, 'classico');

  // Capa
  assert.equal(chamar('PUT', '/api/catalogo/capa', { imagem: jpg }).status, 200);
  ({ dados } = catalogoSite.montarDados(db, chamar('GET', '/api/config').corpo));
  assert.match(dados.capa, /^assets\/capa-\d+\.jpg$/);
  const { arquivos } = catalogoSite.arquivosDoSite(db, chamar('GET', '/api/config').corpo, { urlSite: 'https://loja.github.io/cat' });
  const nomes = arquivos.map((a) => a.nome);
  assert.ok(nomes.includes(dados.capa) && nomes.includes(peca.giro[0]) && nomes.includes(`p/${peca.lk}/index.html`));
  const pag = arquivos.find((a) => a.nome === `p/${peca.lk}/index.html`).dados.toString();
  assert.match(pag, new RegExp(`location.replace\\("../../#peca-${peca.lk}"\\)`));

  // Link: sem site publicado avisa; publicado, devolve o endereço da página da peça (de qualquer tamanho).
  assert.equal(chamar('GET', `/api/catalogo/site/link/${p40.id}`).status, 400);
  chamar('PUT', '/api/config', { catalogo_site_url: 'https://loja.github.io/cat/' });
  assert.equal(chamar('GET', `/api/catalogo/site/link/${p40.id}`).corpo.url, `https://loja.github.io/cat/p/${p38.id}/`);
  assert.equal(chamar('DELETE', `/api/produtos/${p40.id}/360`).corpo.foto360_n, 0);
});
