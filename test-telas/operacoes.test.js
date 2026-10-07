'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novoSistema, dadosBasicos, bipar, pagar, confirmar, pular } = require('./ajuda');

const OPC = { skip: pular, timeout: 90000 };

test('troca: bipa o cupom, escolhe a peça, gera o vale e usa numa venda nova', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await bipar(sis, d.vestido.codigo);
    await pagar(sis, 'pix');
    const v = await confirmar(sis);
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForTimeout(400);
    await bipar(sis, `V${v.id}`);
    await sis.pagina.waitForSelector('.tr-itens');
    await sis.pagina.click('.tr-itens [data-mais]');
    assert.match(await sis.pagina.textContent('#troca-total'), /259,90/);
    await sis.pagina.click('#troca-ok');
    await sis.pagina.waitForSelector('.vale-cartao');
    const codigo = (await sis.pagina.textContent('.vale-codigo')).trim();
    assert.match(codigo, /^VT\d+$/);
    assert.equal((await sis.api(`/api/produtos/${d.vestido.id}`)).estoque, 10);
    await sis.pagina.click('#vale-usar');
    await sis.pagina.waitForTimeout(800);
    await bipar(sis, d.blusa.codigo);
    // O vale entra sozinho no pagamento.
    await sis.pagina.click('.p4-formas [data-forma=dinheiro]');
    await sis.pagina.waitForSelector('.pag2');
    assert.equal(await sis.pagina.inputValue('#pag-vale'), codigo);
    await sis.pagina.click('.pag2-add');
    await sis.pagina.waitForTimeout(300);
    const v2 = await confirmar(sis);
    assert.deepEqual(v2.pagamentos.map((p) => p.forma), ['vale']);
    assert.equal((await sis.api(`/api/vales/${codigo}`)).saldo, 25990 - 8990);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('reserva com sinal pelo caixa, retirada e venda paga com o sinal', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await sis.pagina.evaluate((c) => Telas.pdv.usarCliente(c), { id: d.ana.id, nome: d.ana.nome });
    await sis.pagina.waitForTimeout(500);
    await bipar(sis, d.vestido.codigo);
    await sis.pagina.click('#t-reservar');
    await sis.pagina.waitForSelector('#rs-valor');
    assert.equal(await sis.pagina.inputValue('#rs-valor'), '78,00'); // 30% sugerido
    await sis.pagina.click('[data-f=pix]');
    await sis.pagina.click('#rs-ok');
    await sis.pagina.waitForSelector('.vc');
    let r = (await sis.api('/api/reservas'))[0];
    assert.deepEqual([r.total, r.pago, r.falta], [25990, 7800, 18190]);
    assert.equal((await sis.api(`/api/produtos/${d.vestido.id}`)).estoque, 9);
    await sis.pagina.keyboard.press('Escape');

    await sis.ir('reservas');
    await sis.pagina.click('[data-retirar]');
    await sis.pagina.click('#modal-corpo [data-ok]');
    await sis.pagina.waitForTimeout(1200);
    assert.match(await sis.pagina.textContent('#alertas'), /Sinal da reserva/);
    await sis.pagina.click('.p4-formas [data-forma=dinheiro]');
    await sis.pagina.waitForSelector('.pag2');
    await sis.pagina.click('.pag2-add'); // o sinal (vale RS…)
    await sis.pagina.waitForTimeout(300);
    await pagar(sis, 'dinheiro');
    const v = await confirmar(sis);
    assert.equal(v.total, 25990);
    assert.deepEqual(v.pagamentos.map((p) => [p.forma, p.valor]), [['vale', 7800], ['dinheiro', 18190]]);
    assert.equal((await sis.api(`/api/produtos/${d.vestido.id}`)).estoque, 9);
    r = (await sis.api('/api/reservas?status=todas'))[0];
    assert.equal(r.status, 'retirada');
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('lista de espera: anota pelo caixa e avisa quando a peça chega', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await sis.pagina.evaluate((c) => Telas.pdv.usarCliente(c), { id: d.ana.id, nome: d.ana.nome, telefone: d.ana.telefone });
    await sis.pagina.waitForTimeout(500);
    await bipar(sis, d.saia.codigo);
    await sis.pagina.click('[data-espera]');
    await sis.pagina.waitForSelector('#es-ok');
    await sis.pagina.click('#es-ok');
    await sis.pagina.waitForTimeout(500);
    await sis.api(`/api/produtos/${d.saia.id}/estoque`, { metodo: 'POST', corpo: { tipo: 'entrada', quantidade: 2 } });
    await sis.ir('espera');
    assert.match(await sis.pagina.textContent('#bolinha-espera'), /1/);
    assert.match(await sis.pagina.textContent('.es-card'), /Chegou!/);
    await sis.pagina.click('[data-vender]');
    // Ainda tinha a saia no caixa (de quando foi anotado): pergunta antes de trocar a venda.
    await sis.pagina.waitForSelector('#modal-corpo [data-ok]');
    assert.match(await sis.pagina.textContent('#modal-corpo'), /Já tem peças no caixa/);
    await sis.pagina.click('#modal-corpo [data-ok]');
    await sis.pagina.waitForTimeout(1200);
    assert.match(await sis.pagina.textContent('.p4-venda'), /Saia Plissada/);
    assert.equal((await sis.api('/api/espera/resumo')).chegaram, 0);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('condicional: sai pelo caixa, volta uma peça e a outra vai para a venda', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await sis.pagina.evaluate((c) => Telas.pdv.usarCliente(c), { id: d.ana.id, nome: d.ana.nome });
    await sis.pagina.waitForTimeout(500);
    await bipar(sis, d.vestido.codigo);
    await bipar(sis, d.blusa.codigo);
    await sis.pagina.click('#t-condicional');
    await sis.pagina.waitForSelector('#modal-corpo form');
    await sis.pagina.click('#modal-corpo form .btn-primario');
    await sis.pagina.waitForTimeout(800);
    assert.equal((await sis.api(`/api/produtos/${d.vestido.id}`)).estoque, 9);
    await sis.ir('condicional');
    await sis.pagina.click('.cd-card');
    await sis.pagina.waitForSelector('#cd-itens');
    await sis.pagina.click('#cd-itens [data-mais]'); // ficou com a primeira peça (vestido)
    await sis.pagina.click('#fechar');
    await sis.pagina.waitForTimeout(1500);
    assert.equal((await sis.api(`/api/produtos/${d.blusa.id}`)).estoque, 5);
    assert.match(await sis.pagina.textContent('.p4-venda'), /Vestido Midi Floral/);
    assert.doesNotMatch(await sis.pagina.textContent('.p4-venda'), /Blusa Linho/);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('crediário: vende em 3x e recebe uma parcela pela tela', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await sis.pagina.evaluate((c) => Telas.pdv.usarCliente(c), { id: d.ana.id, nome: d.ana.nome });
    await sis.pagina.waitForTimeout(500);
    await bipar(sis, d.blusa.codigo);
    await pagar(sis, 'crediario', { parcelas: 3 });
    const v = await confirmar(sis);
    assert.equal(v.crediario.length, 3);
    await sis.pagina.keyboard.press('Escape');
    await sis.ir('crediario');
    await sis.pagina.click('[data-receber]');
    await sis.pagina.waitForSelector('#modal-corpo form');
    await sis.pagina.fill('#modal-corpo input[name=valor]', '29,97');
    await sis.pagina.click('#modal-corpo form .btn-primario');
    await sis.pagina.waitForTimeout(800);
    const cx = await sis.api('/api/caixa/atual');
    assert.equal(cx.recebimentos_crediario[0].valor, 2997);
    assert.equal(cx.dinheiro_esperado, 10000 + 2997);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('fechar o caixa contando notas: a diferença bate', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await bipar(sis, d.blusa.codigo);
    await pagar(sis, 'dinheiro', { valor: '100,00' });
    await confirmar(sis);
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForTimeout(400);
    // Esperado: 100 de troco inicial + 89,90 = 189,90
    await sis.pagina.click('#t-mais');
    await sis.pagina.click('#t-fechar');
    await sis.pagina.waitForSelector('.fc-dif');
    await sis.pagina.fill('#modal-corpo input[name=valor]', '189,90');
    await sis.pagina.dispatchEvent('#modal-corpo input[name=valor]', 'input');
    await sis.pagina.waitForTimeout(200);
    assert.match(await sis.pagina.textContent('#dif'), /batendo|igual ao esperado/i);
    await sis.pagina.click('#modal-corpo .btn-perigo');
    await sis.pagina.waitForTimeout(1200);
    const r = await sis.api('/api/caixa/atual');
    assert.equal(r.caixa, null);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});
