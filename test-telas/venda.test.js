'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novoSistema, dadosBasicos, bipar, pagar, confirmar, pular } = require('./ajuda');

const OPC = { skip: pular, timeout: 90000 };

test('abrir o caixa pela tela e vender em dinheiro com troco', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis, { abrirCaixa: false });
    await sis.ir('pdv');
    await sis.pagina.fill('#f-abrir input[name=valor]', '100,00');
    await sis.pagina.click('#f-abrir button');
    await sis.pagina.waitForSelector('#busca');
    await bipar(sis, d.vestido.codigo);
    await bipar(sis, d.blusa.codigo);
    assert.match(await sis.pagina.textContent('.p4-pagar'), /349,80/);
    await pagar(sis, 'dinheiro', { valor: '400,00' });
    assert.match(await sis.pagina.textContent('#pag-resumo'), /Troco[\s\S]*50,20/);
    const v = await confirmar(sis);
    assert.equal(v.total, 34980);
    assert.equal(v.troco, 5020);
    assert.match(await sis.pagina.textContent('.vc'), /50,20/);
    // Estoque baixou e o carrinho ficou vazio na próxima venda.
    assert.equal((await sis.api(`/api/produtos/${d.vestido.id}`)).estoque, 9);
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForTimeout(500);
    assert.equal(await sis.pagina.locator('.p4-item').count(), 0);
    const cx = await sis.api('/api/caixa/atual');
    assert.equal(cx.dinheiro_esperado, 10000 + 34980);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('pagamento dividido (PIX + dinheiro) e desistência não grava nada', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await bipar(sis, d.vestido.codigo);
    // Desistência: abre o pagamento, adiciona e volta — nenhuma venda.
    await pagar(sis, 'pix');
    await sis.pagina.click('.pag2 [data-fechar], .modal [data-fechar]');
    await sis.pagina.waitForTimeout(300);
    assert.equal((await sis.api('/api/vendas')).length, 0);
    // Dividido.
    await pagar(sis, 'pix', { valor: '100,00', dividir: true });
    await pagar(sis, 'dinheiro', { valor: '159,90' });
    const v = await confirmar(sis);
    assert.deepEqual(v.pagamentos.map((p) => [p.forma, p.valor]), [['pix', 10000], ['dinheiro', 15990]]);
    assert.equal(v.troco, 0);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('crédito: 3x sem juros (a loja paga a taxa) e 6x com juros (a cliente paga)', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await bipar(sis, d.vestido.codigo);
    await pagar(sis, 'credito', { parcelas: 3 });
    assert.match(await sis.pagina.textContent('#pag-liquido'), /Cai na conta[\s\S]*243,99/);
    const v3 = await confirmar(sis);
    assert.equal(v3.total, 25990);
    assert.equal(v3.liquido, 24399);
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForTimeout(500);

    await bipar(sis, d.vestido.codigo);
    await sis.pagina.click('.p4-formas [data-forma=credito]');
    await sis.pagina.waitForSelector('.pag2');
    await sis.pagina.selectOption('#pag-parc', '6');
    await sis.pagina.waitForTimeout(150);
    // O total grande já mostra o valor que vai na maquininha.
    assert.match(await sis.pagina.textContent('#pag-total'), /Passar na maquininha[\s\S]*283,37[\s\S]*6x de R\$\s?47,23/);
    const v6 = await confirmar(sis);
    assert.equal(v6.total, 28337);
    assert.equal(v6.acrescimo, 2347);
    assert.ok(Math.abs(v6.liquido - 25990) <= 1);
    assert.match(await sis.pagina.textContent('.vc'), /Cai na conta[\s\S]*259,9/);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('Enter duas vezes não grava a venda duas vezes; Alt+2 escolhe PIX e o "2" sozinho digita', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await bipar(sis, d.blusa.codigo);
    await sis.pagina.click('.p4-formas [data-forma=dinheiro]');
    await sis.pagina.waitForSelector('.pag2');
    await sis.pagina.fill('#pag-valor', '');
    await sis.pagina.keyboard.type('2');
    assert.equal(await sis.pagina.inputValue('#pag-valor'), '2');
    assert.equal(await sis.pagina.getAttribute('.pag2 .forma.sel', 'data-forma'), 'dinheiro');
    await sis.pagina.keyboard.press('Alt+2');
    await sis.pagina.waitForTimeout(150);
    assert.equal(await sis.pagina.getAttribute('.pag2 .forma.sel', 'data-forma'), 'pix');
    await sis.pagina.focus('#concluir');
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForTimeout(1200);
    assert.equal((await sis.api('/api/vendas')).length, 1);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('desconto na venda (F7) e peça sem estoque mostra o aviso da lista de espera', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await bipar(sis, d.vestido.codigo);
    await sis.pagina.keyboard.press('F7');
    await sis.pagina.waitForSelector('#modal-corpo input[name=v]');
    await sis.pagina.fill('#modal-corpo input[name=v]', '10%');
    await sis.pagina.click('#modal-corpo .btn-primario');
    await sis.pagina.waitForTimeout(300);
    assert.match(await sis.pagina.textContent('.p4-pagar'), /233,91/);
    await bipar(sis, d.saia.codigo);
    assert.match(await sis.pagina.textContent('#alertas'), /anotar na lista de espera/);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('modo direto: escolhe a forma e Enter confirma; no dinheiro mostra o troco antes', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await bipar(sis, d.blusa.codigo);
    await sis.pagina.click('.p4-formas [data-forma=dinheiro]');
    await sis.pagina.waitForSelector('.pag2.direto');
    assert.equal(await sis.pagina.isVisible('.pag2-add'), false, 'sem o botão Adicionar');
    await sis.pagina.keyboard.type('100');
    await sis.pagina.waitForTimeout(150);
    assert.match(await sis.pagina.textContent('#pag-resumo'), /Troco[\s\S]*10,10/);
    assert.equal((await sis.api('/api/vendas')).length, 0, 'ainda não gravou');
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForSelector('.vc');
    const v = (await sis.api('/api/vendas'))[0];
    assert.equal(v.troco, 1010);
    // Débito: nem precisa digitar valor.
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForTimeout(400);
    await bipar(sis, d.blusa.codigo);
    await sis.pagina.click('.p4-formas [data-forma=debito]');
    await sis.pagina.waitForSelector('.pag2.direto');
    assert.equal(await sis.pagina.isVisible('#pag-valor'), false);
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForSelector('.vc');
    assert.equal((await sis.api('/api/vendas')).length, 2);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});
