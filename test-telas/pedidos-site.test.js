'use strict';

/**
 * Loja online de ponta a ponta: a cliente monta a sacola no site e finaliza; o pedido vai para a caixa de
 * pedidos (o mesmo código do Google Apps Script, rodando aqui com uma planilha de mentira); o sistema busca,
 * separa as peças numa reserva e mostra em "Pedidos online". Com PDV_PRINTS=pasta, salva os prints.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { novoSistema, dadosBasicos, pular } = require('./ajuda');
const { codigoScript } = require('../src/pedidos-site');

const OPC = { skip: pular, timeout: 120000 };
const CAIXA = 'https://script.google.com/macros/s/TESTE/exec';

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
  return { doPost: (c) => ctx.doPost({ postData: { contents: c } }).texto, doGet: (p) => ctx.doGet({ parameter: p }).texto };
}

test('loja online: a cliente finaliza a sacola no site e o pedido cai em "Pedidos online" com as peças separadas', OPC, async () => {
  const sis = await novoSistema({ largura: 1366, altura: 768 });
  const prints = process.env.PDV_PRINTS;
  const shot = async (pg, nome) => { if (prints) { await pg.waitForTimeout(700); await pg.screenshot({ path: path.join(prints, `${nome}.png`) }); } };
  const fetchOriginal = global.fetch;
  let srv;
  try {
    const d = await dadosBasicos(sis);
    await sis.api('/api/config', { metodo: 'PUT', corpo: { loja_telefone: '(63) 99999-1234', pedidos_url: CAIXA } });
    const chave = (await sis.api('/api/pedidos-site/script')).codigo.match(/const CHAVE = '([^']+)'/)[1];
    const g = caixaGoogle(chave);
    // O sistema busca na "caixa do Google": aqui, num servidor local que roda o mesmo script.
    srv = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(g.doGet(Object.fromEntries(new URL(req.url, 'http://x').searchParams)));
    });
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    global.fetch = (u, o) => fetchOriginal(String(u).startsWith(CAIXA) ? String(u).replace(CAIXA, `http://127.0.0.1:${srv.address().port}/exec`) : u, o);

    // ----- a cliente, no celular
    const cookies = await sis.navegador.contexts()[0].cookies();
    const cel = await sis.navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: prints ? 2 : 1, isMobile: true, hasTouch: true });
    await cel.addCookies(cookies);
    const site = await cel.newPage();
    const errosSite = [];
    site.on('pageerror', (e) => errosSite.push(e.message));
    await site.route(`${CAIXA}**`, (rota) => rota.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: g.doPost(rota.request().postData()) }));
    await site.goto(`${sis.url}api/catalogo/site/previa/index.html`);
    await site.waitForTimeout(1500);
    await site.evaluate(() => document.querySelector('#vitrine').scrollIntoView());
    await site.waitForTimeout(900);
    await site.locator('.peca', { hasText: 'Vestido Midi Floral' }).click();
    await site.click('#prov-quero'); // escolha única (M · Preto): já vai para a sacola
    await site.waitForSelector('#gaveta.aberta');
    await site.click('#fechar-gaveta');
    await site.locator('.peca', { hasText: 'Blusa Linho' }).locator('.bt-add').click();
    await site.click('#bt-sacola');
    await site.waitForSelector('#finalizar');
    await shot(site, 'loja-1-sacola');
    await site.click('#finalizar');
    await site.fill('#form-pedido [name=nome]', 'Carla Mendes');
    await site.fill('#form-pedido [name=telefone]', '(63) 98123-4567');
    await site.fill('#form-pedido [name=observacao]', 'Vou buscar no sábado de manhã');
    await shot(site, 'loja-2-dados');
    await site.click('#confirmar-pedido');
    await site.waitForSelector('.feito');
    const codigo = (await site.textContent('.feito .cod')).trim();
    assert.match(codigo, /^[A-Z0-9]{6}$/);
    await shot(site, 'loja-3-feito');
    assert.deepEqual(errosSite, []);

    // ----- a loja, no sistema
    await sis.ir('pedidos');
    await sis.pagina.click('#po-buscar');
    await sis.pagina.waitForSelector(`.po-card[data-codigo="${codigo}"]`);
    const card = await sis.pagina.textContent(`.po-card[data-codigo="${codigo}"]`);
    assert.match(card, /Carla Mendes[\s\S]*Vestido Midi Floral[\s\S]*Blusa Linho[\s\S]*Vou buscar no sábado/);
    assert.match(card, /R\$\s?349,80/);
    await shot(sis.pagina, 'loja-4-sistema');
    assert.equal((await sis.api(`/api/produtos/${d.vestido.id}`)).estoque, 9, 'a peça saiu do estoque (separada)');
    const reservas = await sis.api('/api/reservas');
    assert.ok(reservas.some((r) => r.origem === 'site' && r.cliente_nome === 'Carla Mendes'));
    assert.deepEqual(sis.erros, []);
    await cel.close();
  } finally {
    global.fetch = fetchOriginal;
    if (srv) srv.close();
    await sis.fechar();
  }
});
