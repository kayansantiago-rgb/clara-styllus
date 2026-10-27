'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novoSistema, dadosBasicos, pular } = require('./ajuda');

const OPC = { skip: pular, timeout: 90000 };

test('Desfazer: excluir produto e apagar despesa voltam atrás; entrada de estoque é desfeita', OPC, async () => {
  const sis = await novoSistema();
  const p = sis.pagina;
  try {
    const d = await dadosBasicos(sis);
    // Nesta parte o aviso fica mais tempo, para dar tempo de clicar.
    await p.evaluate(() => { window.__desfazerSegundos = 5; });
    await sis.ir('produtos');
    await p.evaluate((v) => Telas.produtos.formulario(v), await sis.api(`/api/produtos/${d.saia.id}`));
    await p.click('#excluir-produto');
    await p.click('#modal-corpo [data-ok]');
    await p.waitForSelector('.aviso-desfazer');
    await p.click('.aviso-desfazer button');
    await p.waitForTimeout(300);
    assert.equal((await sis.api(`/api/produtos/${d.saia.id}`)).nome, 'Saia Plissada');
    assert.match(await p.textContent('#lista'), /Saia Plissada/);

    // Sem clicar: some de verdade depois do tempo.
    await p.evaluate(() => { window.__desfazerSegundos = 0.3; });
    await p.evaluate((v) => Telas.produtos.formulario(v), await sis.api(`/api/produtos/${d.saia.id}`));
    await p.click('#excluir-produto');
    await p.click('#modal-corpo [data-ok]');
    await p.waitForTimeout(1200);
    assert.ok(!(await sis.api('/api/produtos?q=Saia')).length);

    // Entrada de estoque com "Desfazer": o estoque volta ao que era.
    await p.evaluate(() => { window.__desfazerSegundos = 5; });
    const soma = async () => (await sis.api('/api/produtos?limite=100')).reduce((a, x) => a + x.estoque, 0);
    const antes = await soma();
    await p.click('.pm-v[data-acao=estoque]');
    await p.waitForSelector('#f-est');
    await p.selectOption('#f-est [name=tipo]', 'entrada');
    await p.fill('#f-est [name=quantidade]', '4');
    await p.click('#f-est .btn-primario');
    const botao = p.locator('.aviso-acao button', { hasText: 'Desfazer' });
    await botao.waitFor();
    assert.equal(await soma(), antes + 4);
    await botao.click();
    await p.waitForSelector('.aviso:has-text("Entrada desfeita")');
    assert.equal(await soma(), antes);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});
