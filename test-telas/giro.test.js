'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novoSistema, dadosBasicos, pular } = require('./ajuda');

const OPC = { skip: pular, timeout: 90000 };
// PRINTS=pasta salva as telas para conferir o visual.
const print = (sis, nome, el) => process.env.PRINTS && (el || sis.pagina).screenshot({ path: `${process.env.PRINTS}/${nome}.png` });

/** Foto de mentira (um retângulo colorido) para a peça. */
const fotoFalsa = (sis, id, cor) => sis.pagina.evaluate(async ([pid, c]) => {
  const cv = document.createElement('canvas');
  cv.width = 600; cv.height = 800;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#efe7e2'; ctx.fillRect(0, 0, 600, 800);
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(220, 120); ctx.lineTo(380, 120); ctx.lineTo(500, 740); ctx.lineTo(100, 740); ctx.closePath(); ctx.fill();
  await U.api(`/api/produtos/${pid}/foto`, { metodo: 'PUT', corpo: { imagem: cv.toDataURL('image/jpeg', 0.8) } });
}, [id, cor]);

test('relatórios: mapa de calor, curva ABC e peças paradas', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.pagina.evaluate(async ([v, b]) => {
      const vender = (p, q) => U.api('/api/vendas', { metodo: 'POST', corpo: { itens: [{ produto_id: p.id, quantidade: q }], pagamentos: [{ forma: 'pix', valor: p.preco_venda * q }] } });
      await vender(v, 3);
      await vender(b, 1);
    }, [d.vestido, d.blusa]);
    sis.db.prepare(`UPDATE produtos SET criado_em = datetime('now','localtime','-200 days')`).run();
    sis.db.prepare(`UPDATE produtos SET estoque = 4, preco_custo = 6000 WHERE nome = 'Saia Plissada'`).run();
    await sis.ir('relatorios');
    await sis.pagina.waitForSelector('.g-calor');
    assert.match(await sis.pagina.textContent('.cartao:has(.g-calor) .dica'), /1º/);
    await sis.pagina.waitForSelector('#abc .abc-tabela');
    assert.deepEqual(await sis.pagina.$$eval('#abc .abc-tag', (xs) => xs.map((x) => x.textContent)), ['A', 'B']);
    await sis.pagina.waitForSelector('#paradas .pp-resumo');
    assert.match(await sis.pagina.textContent('#paradas'), /Saia Plissada[\s\S]*nunca vendeu/);
    await sis.pagina.selectOption('#pp-dias', '30');
    await sis.pagina.waitForTimeout(400);
    await print(sis, 'rel-calor', sis.pagina.locator('.cartao:has(.g-calor)'));
    await print(sis, 'rel-abc', sis.pagina.locator('#abc'));
    await print(sis, 'rel-paradas', sis.pagina.locator('#paradas'));
    // Clicar no modelo abre Produtos já filtrado.
    await sis.pagina.click('#abc .abc-modelo');
    await sis.pagina.waitForSelector('.pr-lista, .pr-vitrine');
    await sis.pagina.waitForTimeout(400);
    assert.equal(await sis.pagina.inputValue('#q'), 'Vestido Midi Floral');
    assert.deepEqual(sis.erros, []);
  } finally { await sis.fechar(); }
});

test('catálogo: escolhe as peças e gera as imagens (1 por imagem e 4 por imagem)', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await fotoFalsa(sis, d.vestido.id, '#1f1a1c');
    await fotoFalsa(sis, d.blusa.id, '#d9c7a8');
    await sis.pagina.evaluate(async (v) => U.api(`/api/produtos/${v.id}`, { metodo: 'PUT', corpo: { preco_anterior: 32990 } }), d.vestido);
    await sis.ir('produtos');
    await sis.pagina.click('#catalogo');
    await sis.pagina.waitForSelector('.cat-previa canvas');
    await sis.pagina.waitForTimeout(800);
    assert.equal(await sis.pagina.locator('.cat-previa').count(), 2); // as duas com foto e estoque
    const tamanho = await sis.pagina.$eval('.cat-previa canvas', (c) => [c.width, c.height]);
    assert.deepEqual(tamanho, [1080, 1920]);
    await print(sis, 'cat-modal');
    const salvar = async (nome, i = 0) => {
      if (!process.env.PRINTS) return;
      const url = await sis.pagina.$$eval('.cat-previa canvas', (cs, n) => cs[n].toDataURL('image/png'), i);
      require('node:fs').writeFileSync(`${process.env.PRINTS}/${nome}.png`, Buffer.from(url.split(',')[1], 'base64'));
    };
    await salvar('cat-story-1');
    await salvar('cat-story-2', 1);
    await sis.pagina.click('#cat-formato [data-f=post]');
    await sis.pagina.click('#cat-modo [data-m=grade]');
    await sis.pagina.fill('#cat-titulo', 'Novidades da semana');
    await sis.pagina.waitForTimeout(1200);
    assert.equal(await sis.pagina.locator('.cat-previa').count(), 1);
    assert.deepEqual(await sis.pagina.$eval('.cat-previa canvas', (c) => [c.width, c.height]), [1080, 1350]);
    await salvar('cat-post-grade');
    assert.deepEqual(sis.erros, []);
  } finally { await sis.fechar(); }
});

test('chegou peça: depois da entrada, mostra as clientes para avisar no WhatsApp', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.pagina.evaluate(async ([b, ana]) => U.api('/api/vendas', { metodo: 'POST', corpo: { cliente_id: ana.id, itens: [{ produto_id: b.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valor: b.preco_venda }] } }), [d.blusa, d.ana]);
    await sis.ir('produtos');
    await sis.pagina.click('#entrada');
    await sis.pagina.waitForSelector('#ent-leitor');
    await sis.pagina.fill('#ent-leitor', d.blusa.codigo);
    await sis.pagina.press('#ent-leitor', 'Enter');
    await sis.pagina.waitForTimeout(300);
    await sis.pagina.click('#ent-ok');
    await sis.pagina.waitForSelector('.ci-cliente');
    assert.match(await sis.pagina.textContent('.ci-cliente'), /Ana Paula Souza[\s\S]*Já comprou esta peça/);
    assert.match(await sis.pagina.inputValue('#ci-texto'), /Chegou Blusa Linho \(tam P\)/);
    await print(sis, 'avisar', sis.pagina.locator('.modal'));
    // O botão monta o link do WhatsApp com o primeiro nome.
    const [popup] = await Promise.all([
      sis.pagina.context().waitForEvent('page').catch(() => null),
      sis.pagina.click('.ci-cliente [data-avisar]'),
    ]);
    const href = await sis.pagina.getAttribute('.ci-cliente [data-avisar]', 'href');
    assert.match(href, /^https:\/\/wa\.me\/5563988881111\?text=Oi%2C%20Ana!/);
    if (popup) await popup.close();
    await sis.pagina.waitForSelector('.ci-cliente.avisada');
    assert.deepEqual(sis.erros, []);
  } finally { await sis.fechar(); }
});
