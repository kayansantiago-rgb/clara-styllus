'use strict';

/**
 * Site da loja: giro de 360° (a cliente arrasta e a roupa gira), link direto da peça (abre já nela),
 * tema de época com contagem regressiva e foto de capa.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { novoSistema, dadosBasicos, pular } = require('./ajuda');

const OPC = { skip: pular, timeout: 120000 };

test('site: giro 360° no provador, link direto da peça, tema e capa', OPC, async () => {
  const sis = await novoSistema({ largura: 1366, altura: 768 });
  try {
    const d = await dadosBasicos(sis);
    // 8 quadros diferentes (cores diferentes) para ver o giro trocar de foto.
    await sis.pagina.evaluate(async (id) => {
      for (let i = 0; i < 8; i += 1) {
        const c = document.createElement('canvas'); c.width = 60; c.height = 80;
        const x = c.getContext('2d'); x.fillStyle = `hsl(${i * 45},70%,50%)`; x.fillRect(0, 0, 60, 80);
        await U.api(`/api/produtos/${id}/360/${i}`, { metodo: 'PUT', corpo: { imagem: c.toDataURL('image/jpeg', 0.9) } });
      }
      await U.api(`/api/produtos/${id}/360`, { metodo: 'POST', corpo: { quadros: 8 } });
      const f = document.createElement('canvas'); f.width = 60; f.height = 80;
      await U.api(`/api/produtos/${id}/foto`, { metodo: 'PUT', corpo: { imagem: f.toDataURL('image/jpeg', 0.9) } });
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      c.getContext('2d').fillRect(0, 0, 160, 90);
      await U.api('/api/catalogo/capa', { metodo: 'PUT', corpo: { imagem: c.toDataURL('image/jpeg', 0.9) } });
      await U.api('/api/config', { metodo: 'PUT', corpo: { catalogo_tema: 'black_friday', catalogo_tema_fim: '2099-12-31' } });
    }, d.vestido.id);

    // No sistema: a ficha da peça tem o giro e o link (sem site publicado, avisa).
    await sis.ir('produtos');
    await sis.pagina.locator('[data-acao=ficha]').first().click();
    await sis.pagina.waitForSelector('#pf-360');
    await sis.pagina.click('#pf-link');
    await sis.pagina.waitForSelector('text=ainda não foi publicado');

    const cookies = await sis.navegador.contexts()[0].cookies();
    const ctx = await sis.navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addCookies(cookies);
    const site = await ctx.newPage();
    const erros = [];
    site.on('pageerror', (e) => erros.push(e.message));
    const previa = `${sis.url}api/catalogo/site/previa/index.html`;
    await site.goto(previa);
    const D = await site.evaluate(() => JSON.parse(document.getElementById('dados').textContent));
    const peca = D.pecas.find((p) => p.giro.length);
    assert.equal(peca.giro.length, 8);

    // Tema e capa
    assert.equal(await site.getAttribute('body', 'data-tema'), 'black_friday');
    assert.match(await site.textContent('#contagem'), /As ofertas acabam em/);
    assert.match(await site.getAttribute('#hero', 'style'), /--capa: url\("assets\/capa-\d+\.jpg"\)/);
    assert.ok(await site.evaluate(() => document.querySelector('#hero').classList.contains('com-capa')));

    // Link direto: abre o catálogo já na peça, com o giro.
    await site.goto(`${previa}?x=1#peca-${peca.lk}`);
    await site.waitForSelector('#cortina.aberta #giro360', { timeout: 10000 });
    assert.match(await site.textContent('#provador h2'), new RegExp(peca.nome));
    // Arrastar troca o quadro.
    await site.waitForTimeout(400);
    const antes = await site.getAttribute('#giro360 img', 'src');
    const b = await site.locator('#giro360').boundingBox();
    await site.mouse.move(b.x + 40, b.y + b.height / 2);
    await site.mouse.down();
    await site.mouse.move(b.x + b.width - 40, b.y + b.height / 2, { steps: 8 });
    await site.mouse.up();
    assert.notEqual(await site.getAttribute('#giro360 img', 'src'), antes);
    // Foto normal e volta ao 360.
    await site.click('.prov-mini [data-f="0"]');
    assert.equal(await site.isHidden('#giro360'), true);
    await site.click('.prov-mini [data-g]');
    assert.equal(await site.isVisible('#giro360'), true);
    // Fechar tira o #peca do endereço.
    await site.click('#prov-fechar');
    assert.equal(new URL(site.url()).hash, '');
    // Peça que não existe mais: avisa.
    await site.goto(`${previa}?x=2#peca-999999`);
    await site.waitForSelector('#toast.ver', { timeout: 5000 });
    assert.match(await site.textContent('#toast'), /já foi vendida/);
    assert.deepEqual(erros, []);
    assert.deepEqual(sis.erros, []);
    await ctx.close();
  } finally {
    await sis.fechar();
  }
});
