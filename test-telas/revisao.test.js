'use strict';

/** Testes de tela dos problemas encontrados na revisão geral. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { novoSistema, dadosBasicos, bipar, pagar, confirmar, pular } = require('./ajuda');

const OPC = { skip: pular, timeout: 90000 };

test('Enter na contagem de notas passa para a próxima nota e não fecha o caixa', OPC, async () => {
  const sis = await novoSistema();
  try {
    await dadosBasicos(sis);
    await sis.ir('pdv');
    await sis.pagina.click('#t-mais');
    await sis.pagina.click('#t-fechar');
    await sis.pagina.waitForSelector('[data-v]');
    await sis.pagina.focus('[data-v]');
    await sis.pagina.keyboard.type('1');
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForTimeout(500);
    assert.ok((await sis.api('/api/caixa/atual')).caixa, 'o caixa não pode ter fechado');
    // Com diferença, precisa de um segundo clique.
    await sis.pagina.click('#modal-corpo .btn-perigo');
    await sis.pagina.waitForTimeout(500);
    assert.ok((await sis.api('/api/caixa/atual')).caixa, 'primeiro clique com diferença só avisa');
    assert.match(await sis.pagina.textContent('#modal-corpo .btn-perigo'), /clique de novo/);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('clique duplo em "Gerar vale-troca" e na sangria grava uma vez só', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await bipar(sis, d.vestido.codigo);
    await bipar(sis, d.vestido.codigo);
    await pagar(sis, 'pix');
    const v = await confirmar(sis);
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForTimeout(400);
    await bipar(sis, `V${v.id}`);
    await sis.pagina.waitForSelector('.tr-itens');
    await sis.pagina.click('.tr-itens [data-mais]');
    await sis.pagina.dblclick('#troca-ok');
    await sis.pagina.waitForTimeout(1200);
    const troca = await sis.api(`/api/vendas/${v.id}/troca`);
    assert.equal(troca.itens[0].devolvido, 1);
    await sis.pagina.keyboard.press('Escape');

    await sis.ir('pdv');
    await sis.pagina.click('#t-mais');
    await sis.pagina.click('#t-sangria');
    await sis.pagina.waitForSelector('#modal-corpo input[name=valor]');
    await sis.pagina.fill('#modal-corpo input[name=valor]', '1.500');
    await sis.pagina.focus('#modal-corpo input[name=valor]');
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForTimeout(1000);
    const cx = await sis.api('/api/caixa/atual');
    assert.equal(cx.movimentos.length, 1);
    assert.equal(cx.movimentos[0].valor, 150000, '"1.500" é mil e quinhentos reais');
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('trocar de tela rápido não mostra erro no lugar da tela de venda', OPC, async () => {
  const sis = await novoSistema();
  try {
    await dadosBasicos(sis);
    await sis.ir('produtos');
    for (const r of ['caixa', 'reservas', 'espera']) {
      await sis.pagina.evaluate((x) => { location.hash = `#/${x}`; location.hash = '#/pdv'; }, r);
      await sis.pagina.waitForTimeout(900);
      assert.doesNotMatch(await sis.pagina.textContent('#conteudo'), /Não foi possível abrir a tela/);
      assert.ok(await sis.pagina.isVisible('#busca'));
    }
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('vale "para usar agora" não passa para a próxima cliente se a venda é cancelada', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await sis.pagina.evaluate(() => U.local.gravar('pdv_vale_pendente', { codigo: 'VT000099', saldo: 1000 }));
    await bipar(sis, d.blusa.codigo);
    await sis.pagina.keyboard.press('F9');
    await sis.pagina.click('#modal-corpo [data-ok]');
    await sis.pagina.waitForTimeout(500);
    assert.equal(await sis.pagina.evaluate(() => U.local.ler('pdv_vale_pendente', null)), null);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('preço que mudou depois de a peça entrar no caixa é atualizado antes de receber', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await bipar(sis, d.blusa.codigo);
    await sis.api(`/api/produtos/${d.blusa.id}`, { metodo: 'PUT', corpo: { preco_venda: 9990 } });
    await sis.pagina.click('.p4-formas [data-forma=pix]');
    await sis.pagina.waitForTimeout(800);
    assert.match(await sis.pagina.textContent('.p4-pagar'), /99,90/);
    await pagar(sis, 'pix');
    const v = await confirmar(sis);
    assert.equal(v.total, 9990);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});
