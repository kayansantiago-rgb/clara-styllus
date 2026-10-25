'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { novoSistema, dadosBasicos, pular } = require('./ajuda');

const OPC = { skip: pular, timeout: 90000 };
const print = (sis, nome) => process.env.PRINTS && sis.pagina.screenshot({ path: `${process.env.PRINTS}/${nome}.png` });

test('editor de etiqueta: adiciona texto, arrasta, salva e imprime como imagem', OPC, async () => {
  const sis = await novoSistema({ largura: 1440, altura: 860 });
  const p = sis.pagina;
  try {
    const d = await dadosBasicos(sis);
    await sis.api('/api/config', { metodo: 'PUT', corpo: { impressao_etiqueta_modo: 'tspl', impressora_etiqueta: 'Arquivo (teste)' } });
    await p.evaluate(() => U.config(true));
    await sis.ir('etiquetas');
    // "Minha etiqueta" ainda não existe: abre o editor com o modelo padrão.
    await p.click('[data-modelo="personalizado"]');
    await p.waitForSelector('#ee-canvas');
    const antes = await p.$$eval('.ee-item', (xs) => xs.length);
    assert.ok(antes >= 5);

    // Novo texto com campo da peça, no centro; arrasta 3 mm para cima.
    await p.click('[data-add="texto"]');
    await p.fill('[data-prop="texto"]', 'Promo {tamanho}');
    const box = await p.locator('.ee-item.sel').boundingBox();
    const y0 = Number(await p.inputValue('[data-prop="y"]'));
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 40, { steps: 6 });
    await p.mouse.up();
    assert.ok(Number(await p.inputValue('[data-prop="y"]')) < y0, 'não arrastou');
    await p.click('[data-tog="negrito"]');
    // Desfazer volta o negrito; refazer aplica de novo.
    await p.click('#ee-desfazer');
    assert.equal(await p.$eval('[data-tog="negrito"]', (b) => b.classList.contains('on')), false);
    await p.click('#ee-refazer');
    assert.equal(await p.$eval('[data-tog="negrito"]', (b) => b.classList.contains('on')), true);
    await print(sis, 'editor-etiqueta');

    await p.click('#ee-salvar');
    await p.waitForSelector('#ee-status:has-text("Salva")');
    const cfg = await sis.api('/api/config');
    assert.equal(cfg.etiqueta_modelo, 'personalizado');
    const salvo = JSON.parse(cfg.etiqueta_layout);
    assert.equal(salvo.elementos.length, antes + 1);
    assert.ok(salvo.elementos.some((e) => e.texto === 'Promo {tamanho}' && e.negrito));

    // Impressão pela fila: vai como BITMAP (TSPL) com 2 cópias.
    await sis.ir('etiquetas');
    await p.evaluate((v) => Telas.etiquetas.adicionar(v, 2), d.vestido);
    await p.waitForSelector('.et-previa-canvas');
    await p.click('#imprimir');
    await p.waitForTimeout(800);
    const pasta = process.env.PDV_IMPRESSAO_PASTA;
    const arq = fs.readdirSync(pasta).filter((f) => f.includes('etiquetas')).pop();
    const t = fs.readFileSync(path.join(pasta, arq)).toString('latin1');
    assert.match(t, /BITMAP 0,0,40,240,0,/);
    assert.match(t, /PRINT 1,2\r\n$/);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});
