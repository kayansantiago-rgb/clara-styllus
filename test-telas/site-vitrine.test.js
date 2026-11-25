'use strict';

/**
 * Site da loja, vitrine: filtros (tamanho, cor, preço e ordem), favoritas, "Qual o meu tamanho?",
 * vídeo da peça e as novidades em estilo stories.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { novoSistema, dadosBasicos, pular } = require('./ajuda');

const OPC = { skip: pular, timeout: 120000 };

test('site: filtros, favoritas, tabela de medidas, vídeo e stories', OPC, async () => {
  const sis = await novoSistema({ largura: 1366, altura: 768 });
  try {
    const d = await dadosBasicos(sis);
    await sis.pagina.evaluate(async ([id, blusa]) => {
      const foto = (cor) => { const c = document.createElement('canvas'); c.width = 60; c.height = 80; const x = c.getContext('2d'); x.fillStyle = cor; x.fillRect(0, 0, 60, 80); return c.toDataURL('image/jpeg', 0.9); };
      await U.api('/api/produtos/grade', { metodo: 'POST', corpo: { nome: 'Calça Wide', preco_venda: 18990, preco_anterior: 22990, variantes: [{ tamanho: '38', cor: 'Azul', quantidade: 2 }, { tamanho: '40', cor: 'Azul', quantidade: 1 }] } });
      await U.api(`/api/produtos/${id}/foto`, { metodo: 'PUT', corpo: { imagem: foto('#a33') } });
      await U.api(`/api/produtos/${blusa}/foto`, { metodo: 'PUT', corpo: { imagem: foto('#eee') } });
      // "Vídeo" (só o começo de um WEBM: o teste confere o caminho, não toca de verdade).
      const r = await fetch(`/api/produtos/${id}/video`, { method: 'POST', headers: { 'Content-Type': 'video/webm' }, body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) });
      if (!r.ok) throw new Error(await r.text());
      await U.api('/api/config', { metodo: 'PUT', corpo: { catalogo_tema: 'classico', catalogo_medidas: JSON.stringify({ letras: { colunas: ['Busto', 'Quadril'], linhas: [['P', '86', '94'], ['M', '90', '98'], ['G', '96', '104']] } }) } });
    }, [d.vestido.id, d.blusa.id]);

    // O vídeo tem botão na ficha da peça.
    await sis.ir('produtos');
    await sis.pagina.fill('#q', 'Vestido Midi');
    await sis.pagina.waitForTimeout(600);
    await sis.pagina.locator('[data-acao=ficha]').first().click();
    assert.match(await sis.pagina.textContent('#pf-video'), /Vídeo ✓/);

    const cookies = await sis.navegador.contexts()[0].cookies();
    const ctx = await sis.navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addCookies(cookies);
    const site = await ctx.newPage();
    const erros = [];
    site.on('pageerror', (e) => erros.push(e.message));
    await site.goto(`${sis.url}api/catalogo/site/previa/index.html`);
    await site.waitForTimeout(1500);
    const nomes = async () => site.$$eval('#grade .peca h3', (hs) => hs.map((h) => h.textContent));
    assert.equal((await nomes()).length, 3);

    // Filtros: tamanho 38 → só a calça; preço; ordem; limpar.
    await site.click('#cats [data-filtro]');
    await site.waitForSelector('#filtros.aberto');
    await site.click('#filtros [data-ft="38"]');
    assert.deepEqual(await nomes(), ['Calça Wide']);
    assert.match(await site.textContent('#f-ver'), /Ver 1 peça$/);
    await site.click('#filtros [data-ft="38"]');
    await site.click('#filtros [data-fp="0-10000"]');
    assert.deepEqual(await nomes(), ['Blusa Linho']);
    await site.click('#filtros [data-fp="0-10000"]');
    await site.click('#filtros [data-fo="maior"]');
    assert.deepEqual(await nomes(), ['Vestido Midi Floral', 'Calça Wide', 'Blusa Linho']);
    assert.match(await site.textContent('#cats [data-filtro]'), /Filtrar1/);
    await site.click('#f-limpar');
    await site.click('#f-ver');
    assert.equal(await site.isHidden('#filtros'), true);

    // Favoritas: o coração guarda, aparece o atalho no topo e a categoria "Favoritas".
    assert.equal(await site.isHidden('#bt-favs'), true);
    const cartaoBlusa = site.locator('.peca', { hasText: 'Blusa Linho' });
    await cartaoBlusa.scrollIntoViewIfNeeded();
    await site.waitForSelector('.peca.visivel >> text=Blusa Linho');
    await site.waitForTimeout(900);
    await cartaoBlusa.locator('[data-fav]').click();
    await site.waitForSelector('#bt-favs', { state: 'visible' });
    assert.equal(await site.textContent('#favs-n'), '1');
    await site.click('#bt-favs');
    assert.deepEqual(await nomes(), ['Blusa Linho']);
    // Continua depois de recarregar (fica no celular).
    await site.reload();
    await site.waitForTimeout(1200);
    assert.equal(await site.textContent('#favs-n'), '1');
    assert.match(await site.textContent('#cats'), /Favoritas1/);

    // Qual o meu tamanho? Escreve as medidas e o site escolhe o M.
    const cartaoVestido = site.locator('.peca', { hasText: 'Vestido Midi Floral' });
    await cartaoVestido.scrollIntoViewIfNeeded();
    await site.waitForTimeout(900);
    await cartaoVestido.locator('.peca-foto img').click();
    await site.waitForSelector('#cortina.aberta');
    await site.click('#prov-medidas');
    const campos = site.locator('#medidas input');
    await campos.nth(0).fill('89');
    await campos.nth(1).fill('97');
    assert.match(await site.textContent('#medidas-r'), /O seu tamanho é M ✓ e tem nesta peça/);
    assert.equal(await site.getAttribute('#esc-tam [data-t="M"]', 'class'), 'sel');
    await campos.nth(0).fill('120');
    assert.match(await site.textContent('#medidas-r'), /passam do maior tamanho/);

    // Vídeo: botão "vídeo" nas miniaturas mostra o vídeo.
    await site.click('.prov-mini [data-v]');
    assert.equal(await site.isVisible('#prov-video'), true);
    assert.match(await site.getAttribute('#prov-video video', 'src'), /^videos\/\d+-\d+\.webm$/);
    await site.click('.prov-mini [data-f="0"]');
    assert.equal(await site.isHidden('#prov-video'), true);
    // Coração dentro da peça.
    await site.click('#provador [data-fav]');
    assert.equal(await site.textContent('#favs-n'), '2');
    await site.click('#prov-fechar');

    // Stories: bolinhas no topo; abre, passa, mostra a peça e fecha.
    await site.evaluate(() => scrollTo(0, 0));
    const grupos = await site.$$eval('#stories .story small', (s) => s.map((x) => x.textContent));
    // A calça em promoção não tem foto: não entra nos stories.
    assert.deepEqual(grupos, ['Novidades', 'Vídeos']);
    await site.click('#stories [data-g="0"]');
    await site.waitForSelector('#story-tela.aberta');
    assert.equal(await site.locator('#story-barras i').count(), 2);
    const primeira = await site.textContent('#story-nome');
    await site.click('.story-lado.prox');
    assert.notEqual(await site.textContent('#story-nome'), primeira);
    await site.click('#story-ver');
    await site.waitForSelector('#cortina.aberta');
    await site.waitForSelector('#story-tela', { state: 'hidden' });
    await site.click('#prov-fechar');
    // A bolinha vista fica apagada.
    assert.match(await site.getAttribute('#stories [data-g="0"]', 'class'), /visto/);
    // O grupo de vídeos toca o vídeo da peça.
    await site.click('#stories [data-g="1"]');
    await site.waitForSelector('#story-tela.aberta');
    assert.equal(await site.locator('#story-midia video').count(), 1);
    await site.keyboard.press('Escape');
    await site.waitForSelector('#story-tela', { state: 'hidden' });

    assert.deepEqual(erros, []);
    assert.deepEqual(sis.erros, []);
    await ctx.close();
  } finally {
    await sis.fechar();
  }
});
