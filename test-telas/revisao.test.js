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

test('clientes em cartões com selos e filtros; ficha com linha do tempo; venda concluída com WhatsApp', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.pagina.evaluate((x) => U.api('/api/vendas', { metodo: 'POST', corpo: { cliente_id: x.ana.id, itens: [{ produto_id: x.blusa.id, quantidade: 1 }], pagamentos: [{ forma: 'crediario', valor: 8990, parcelas: 2 }] } }), d);
    await sis.ir('clientes');
    await sis.pagina.waitForSelector('.cl2-card');
    assert.match(await sis.pagina.textContent('.cl2-card'), /Ana Paula Souza[\s\S]*Crediário/);
    await sis.pagina.click('.chip-filtro[data-filtro=devendo]');
    assert.equal(await sis.pagina.locator('.cl2-card').count(), 1);
    await sis.pagina.click('.cl2-card .cl2-nome');
    await sis.pagina.waitForSelector('.cl3-evento');
    assert.match(await sis.pagina.textContent('.cl3-tempo'), /Blusa/);
    await sis.pagina.keyboard.press('Escape');

    // Venda para ela: tela de concluída com fotos das peças e botão do WhatsApp.
    await sis.pagina.click('.cl2-card [data-vender]');
    await sis.pagina.waitForSelector('#busca');
    await bipar(sis, d.vestido.codigo);
    await pagar(sis, 'pix');
    await confirmar(sis);
    await sis.pagina.waitForSelector('.vc2 .vc-peca');
    await sis.pagina.waitForSelector('#vc-zap[href^="https://wa.me/"]');
    assert.match(await sis.pagina.textContent('.vc-obrigada'), /Obrigada, Ana/);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('menu com bolinhas de aviso; modo escuro liga, fica guardado e desliga', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    // Parcela vencida: o Crediário ganha a bolinha vermelha.
    await sis.pagina.evaluate((x) => U.api('/api/vendas', { metodo: 'POST', corpo: { cliente_id: x.ana.id, itens: [{ produto_id: x.blusa.id, quantidade: 1 }], pagamentos: [{ forma: 'crediario', valor: 8990, parcelas: 1, primeiro_vencimento: '2020-01-10' }] } }), d);
    await sis.ir('clientes');
    await sis.pagina.waitForSelector('[data-bolinha="crediario"]:not([hidden])');
    assert.equal((await sis.pagina.textContent('[data-bolinha="crediario"]')).trim(), '1');
    assert.equal(await sis.pagina.isHidden('[data-bolinha="reservas"]'), true);

    await sis.pagina.click('#tema');
    assert.equal(await sis.pagina.evaluate(() => document.documentElement.classList.contains('escuro')), true);
    await sis.pagina.reload();
    await sis.pagina.waitForSelector('#tema');
    assert.equal(await sis.pagina.evaluate(() => document.documentElement.classList.contains('escuro')), true);
    await sis.pagina.click('#tema');
    assert.equal(await sis.pagina.evaluate(() => localStorage.getItem('tema')), 'claro');
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});
