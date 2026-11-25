'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');
const { novaApi } = require('./ajuda');
const { codigoScript } = require('../src/pedidos-site');

/** Roda o código do Google Apps Script (o mesmo que a loja cola no Google) com uma planilha de mentira. */
function caixaGoogle(chave) {
  const linhas = [];
  const aba = {
    setName() {}, setFrozenRows() {},
    appendRow: (l) => linhas.push([...l]),
    getDataRange: () => ({ getValues: () => linhas.map((l) => [...l]) }),
    getRange: (i, j) => ({ setValue: (v) => { linhas[i - 1][j - 1] = v; } }),
  };
  const planilha = { getId: () => 'p1', getSheets: () => [aba], getSheetByName: () => aba };
  const props = {};
  const ctx = {
    SpreadsheetApp: { create: () => planilha, openById: () => planilha },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => ({ texto: t }) }) },
  };
  vm.createContext(ctx);
  vm.runInContext(codigoScript(chave), ctx);
  return { linhas, doPost: (corpo) => JSON.parse(ctx.doPost({ postData: { contents: corpo } }).texto), doGet: (p) => JSON.parse(ctx.doGet({ parameter: p }).texto) };
}

function preparar() {
  const api = novaApi();
  const { chamar } = api;
  const P = (c) => chamar('POST', '/api/produtos/grade', c).corpo;
  const [calca38, calca40] = P({ nome: 'Calça Wide', preco_venda: 18990, variantes: [{ tamanho: '38', cor: 'Azul', quantidade: 2 }, { tamanho: '40', cor: 'Azul', quantidade: 1 }] });
  const [blusa] = P({ nome: 'Blusa Linho', preco_venda: 8990, variantes: [{ tamanho: 'M', quantidade: 1 }] });
  const ana = chamar('POST', '/api/clientes', { nome: 'Ana Souza', telefone: '(63) 98888-1111' }).corpo;
  return { ...api, calca38, calca40, blusa, ana };
}

test('caixa de pedidos (Google Apps Script): recebe, lista com a chave certa e marca como importado', () => {
  const g = caixaGoogle('segredo');
  assert.deepEqual(g.doPost(JSON.stringify({ codigo: 'ABC123', nome: '=HYPERLINK("x")', telefone: '63', itens: [{ id: 1 }] })), { ok: true, codigo: 'ABC123' });
  assert.equal(g.linhas[1][2], '\'=HYPERLINK("x")', 'nome que vira fórmula é guardado como texto');
  assert.equal(g.doPost('não é json').ok, false);
  assert.equal(g.doPost(JSON.stringify({ codigo: 'X', itens: [] })).ok, false);
  assert.deepEqual(g.doGet({ chave: 'errada' }), { ok: false, erro: 'chave' });
  const l = g.doGet({ chave: 'segredo' });
  assert.equal(l.pedidos.length, 1);
  assert.equal(l.pedidos[0].codigo, 'ABC123');
  g.doGet({ chave: 'segredo', acao: 'confirmar', codigos: 'ABC123' });
  assert.equal(g.doGet({ chave: 'segredo' }).pedidos.length, 0);
});

test('pedido do site vira reserva: acha a cliente pelo WhatsApp (ou cadastra), separa as peças e avisa o que acabou', async () => {
  const { chamar, calca38, calca40, blusa, db } = preparar();
  const chave = chamar('GET', '/api/pedidos-site/script').corpo.codigo.match(/const CHAVE = '([^']+)'/)[1];
  const g = caixaGoogle(chave);
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(g.doGet(Object.fromEntries(url.searchParams))));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  try {
    // Sem a caixa ligada, não faz nada.
    assert.deepEqual((await chamar('POST', '/api/pedidos-site/sincronizar')).corpo, { novos: [], configurado: false });
    chamar('PUT', '/api/config', { pedidos_url: `http://127.0.0.1:${srv.address().port}/exec` });
    // A busca automática só aceita https; no teste o servidor é http, então liberamos aqui.
    db.prepare(`UPDATE config SET valor = ? WHERE chave = 'pedidos_url'`).run(`https://127.0.0.1:${srv.address().port}/exec`);
    const fetchOriginal = global.fetch;
    global.fetch = (u, o) => fetchOriginal(String(u).replace('https://', 'http://'), o);
    try {
      // Ana (já é cliente, telefone escrito diferente) pede 2 calças 38 e a blusa; Bia é nova e pede a 40 duas vezes.
      g.doPost(JSON.stringify({ codigo: 'K7Q2MX', nome: 'Ana', telefone: '+55 63 98888-1111', observacao: 'busco sábado',
        itens: [{ id: calca38.id, preco: 1 }, { id: calca38.id }, { id: blusa.id }] }));
      g.doPost(JSON.stringify({ codigo: 'B1A2C3', nome: 'Bia Lima', telefone: '63 97777-2222', itens: [{ id: calca40.id }, { id: calca40.id }] }));
      g.doPost(JSON.stringify({ codigo: 'K7Q2MX', nome: 'Ana', telefone: '63988881111', itens: [{ id: blusa.id }] })); // enviado duas vezes

      const r = await chamar('POST', '/api/pedidos-site/sincronizar');
      assert.equal(r.status, 200, JSON.stringify(r.corpo));
      assert.deepEqual(r.corpo.novos.sort(), ['B1A2C3', 'K7Q2MX']);
      assert.equal(g.doGet({ chave }).pedidos.length, 0, 'todos marcados como importados no Google');

      const lista = chamar('GET', '/api/pedidos-site').corpo.pedidos;
      const ana = lista.find((p) => p.codigo === 'K7Q2MX');
      assert.equal(ana.situacao, 'novo');
      assert.equal(ana.total, 18990 * 2 + 8990, 'preço da loja, não o que veio do site');
      assert.equal(ana.faltou, null);
      const clientes = chamar('GET', '/api/clientes').corpo;
      assert.equal(clientes.filter((c) => c.nome.startsWith('Ana')).length, 1, 'achou a Ana pelo WhatsApp');
      assert.ok(clientes.some((c) => c.nome === 'Bia Lima'), 'cadastrou a Bia');
      const reserva = chamar('GET', `/api/reservas/${ana.reserva_id}`).corpo;
      assert.equal(reserva.origem, 'site');
      assert.match(reserva.observacao, /Pedido do site nº K7Q2MX · busco sábado/);
      assert.equal(chamar('GET', `/api/produtos/${calca38.id}`).corpo.estoque, 0, 'peças separadas saem do estoque');

      const bia = lista.find((p) => p.codigo === 'B1A2C3');
      assert.equal(bia.faltou, '1× Calça Wide · Tam 40 · Azul');
      assert.equal(bia.total, 18990);

      assert.equal(chamar('GET', '/api/sistema/avisos').corpo.pedidos, 2);
      chamar('POST', '/api/pedidos-site/K7Q2MX/visto');
      assert.equal(chamar('GET', '/api/sistema/avisos').corpo.pedidos, 1);

      // Cancelar devolve as peças.
      chamar('POST', '/api/pedidos-site/K7Q2MX/cancelar');
      assert.equal(chamar('GET', `/api/produtos/${calca38.id}`).corpo.estoque, 2);
      assert.equal(chamar('GET', '/api/pedidos-site').corpo.pedidos.find((p) => p.codigo === 'K7Q2MX').situacao, 'cancelado');

      // Chave errada no script: mostra o problema sem quebrar nada.
      db.prepare(`UPDATE config SET valor = 'outra' WHERE chave = 'pedidos_chave'`).run();
      const e = await chamar('POST', '/api/pedidos-site/sincronizar');
      assert.equal(e.status, 502);
      assert.match(chamar('GET', '/api/pedidos-site').corpo.erro, /chave do script não confere/);
    } finally {
      global.fetch = fetchOriginal;
    }
  } finally {
    srv.close();
  }
});

test('cadastro da reserva: CPF e foto da cliente vão para o cadastro de clientes', async () => {
  const { chamar, blusa, calca38, ana, db } = preparar();
  const chave = chamar('GET', '/api/pedidos-site/script').corpo.codigo.match(/const CHAVE = '([^']+)'/)[1];
  const g = caixaGoogle(chave);
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(g.doGet(Object.fromEntries(url.searchParams))));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const fetchOriginal = global.fetch;
  global.fetch = (u, o) => fetchOriginal(String(u).replace('https://', 'http://'), o);
  try {
    db.prepare(`UPDATE config SET valor = ? WHERE chave = 'pedidos_url'`).run(`https://127.0.0.1:${srv.address().port}/exec`);
    const foto = `data:image/jpeg;base64,${Buffer.alloc(3000, 7).toString('base64')}`;
    // Nova cliente com CPF e foto; Ana (já cadastrada, sem CPF) manda o CPF; CPF inválido é ignorado.
    assert.equal(g.doPost(JSON.stringify({ codigo: 'CPF001', nome: 'Carla Dias', telefone: '63 96666-3333', cpf: '529.982.247-25', foto, itens: [{ id: blusa.id }] })).ok, true);
    g.doPost(JSON.stringify({ codigo: 'CPF002', nome: 'Ana', telefone: '63988881111', cpf: '11144477735', itens: [{ id: calca38.id }] }));
    g.doPost(JSON.stringify({ codigo: 'CPF003', nome: 'Duda', telefone: '63 95555-4444', cpf: '111.111.111-11', foto: 'data:text/html;base64,AAAA', itens: [{ id: calca38.id }] }));
    const r = await chamar('POST', '/api/pedidos-site/sincronizar');
    assert.equal(r.corpo.novos.length, 3, JSON.stringify(r.corpo));

    const carla = db.prepare(`SELECT * FROM clientes WHERE nome = 'Carla Dias'`).get();
    assert.equal(carla.cpf, '52998224725');
    assert.ok(carla.foto_versao, 'ficou com foto');
    const f = await chamar('GET', `/api/clientes/${carla.id}/foto`);
    assert.equal(f.status, 200);
    assert.equal(db.prepare('SELECT length(dados) AS n FROM cliente_fotos WHERE cliente_id = ?').get(carla.id).n, 3000);

    assert.equal(db.prepare('SELECT cpf FROM clientes WHERE id = ?').get(ana.id).cpf, '11144477735', 'completou o CPF da Ana');
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM clientes WHERE nome LIKE 'Ana%'`).get().n, 1);
    const duda = db.prepare(`SELECT * FROM clientes WHERE nome = 'Duda'`).get();
    assert.equal(duda.cpf, null, 'CPF inválido não entra');
    assert.equal(duda.foto_versao, null, 'arquivo que não é foto não entra');

    // Pedido seguinte com o mesmo CPF e outro telefone: acha a Carla pelo CPF e não troca a foto.
    const versao = carla.foto_versao;
    g.doPost(JSON.stringify({ codigo: 'CPF004', nome: 'Carla', telefone: '61 90000-0000', cpf: '52998224725', foto, itens: [{ id: blusa.id }] }));
    await chamar('POST', '/api/pedidos-site/sincronizar');
    assert.equal(db.prepare(`SELECT cliente_id FROM pedidos_site WHERE codigo = 'CPF004'`).get().cliente_id, carla.id);
    assert.equal(db.prepare('SELECT foto_versao FROM clientes WHERE id = ?').get(carla.id).foto_versao, versao);
  } finally {
    global.fetch = fetchOriginal;
    srv.close();
  }
});
