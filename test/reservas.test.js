'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novaApi } = require('./ajuda');

function preparar() {
  const api = novaApi();
  const { chamar } = api;
  const p = chamar('POST', '/api/produtos', { nome: 'Vestido Midi', tamanho: 'M', cor: 'Preto', preco_venda: 20000, estoque: 3 }).corpo;
  const cli = chamar('POST', '/api/clientes', { nome: 'Ana Souza', telefone: '63999990000' }).corpo;
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 5000 });
  return { ...api, p, cli };
}

test('reserva com sinal: separa as peças, sinal entra no caixa e vira vale na retirada', () => {
  const { chamar, p, cli } = preparar();
  const r = chamar('POST', '/api/reservas', {
    cliente_id: cli.id, itens: [{ produto_id: p.id, quantidade: 2 }], sinal: { valor: 10000, forma: 'dinheiro' },
  }).corpo;
  assert.equal(r.total, 40000);
  assert.equal(r.pago, 10000);
  assert.equal(r.falta, 30000);
  assert.equal(chamar('GET', `/api/produtos/${p.id}`).corpo.estoque, 1);
  // Sinal em dinheiro soma na gaveta.
  const cx = chamar('GET', '/api/caixa/atual').corpo;
  assert.equal(cx.dinheiro_esperado, 15000);
  assert.equal(cx.sinais_reserva[0].valor, 10000);
  // Mais um adiantamento; não pode passar do total.
  chamar('POST', `/api/reservas/${r.id}/sinal`, { valor: 5000, forma: 'pix' });
  assert.equal(chamar('POST', `/api/reservas/${r.id}/sinal`, { valor: 999999, forma: 'pix' }).status, 400);
  // Retirada: estoque volta, vale com o que foi pago, venda usa o vale.
  const ret = chamar('POST', `/api/reservas/${r.id}/retirar`).corpo;
  assert.equal(ret.vale.saldo, 15000);
  assert.match(ret.vale.codigo, /^RS\d{6}$/);
  assert.equal(chamar('GET', `/api/produtos/${p.id}`).corpo.estoque, 3);
  const v = chamar('POST', '/api/vendas', {
    cliente_id: cli.id, itens: ret.itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
    pagamentos: [{ forma: 'vale', valor: 15000, codigo: ret.vale.codigo }, { forma: 'dinheiro', valor: 25000 }],
  }).corpo;
  assert.equal(v.total, 40000);
  assert.equal(chamar('GET', `/api/produtos/${p.id}`).corpo.estoque, 1);
  assert.equal(chamar('POST', `/api/reservas/${r.id}/retirar`).status, 409);
});

test('cancelar reserva: estoque volta e o sinal vira vale, volta em dinheiro ou fica com a loja', () => {
  const { chamar, p, cli } = preparar();
  const nova = () => chamar('POST', '/api/reservas', {
    cliente_id: cli.id, itens: [{ produto_id: p.id, quantidade: 1 }], sinal: { valor: 6000, forma: 'dinheiro' },
  }).corpo;
  const a = nova();
  assert.equal(chamar('POST', `/api/reservas/${a.id}/cancelar`, {}).status, 400);
  const ca = chamar('POST', `/api/reservas/${a.id}/cancelar`, { destino: 'vale' }).corpo;
  assert.equal(ca.vale.saldo, 6000);
  assert.equal(ca.reserva.status, 'cancelada');
  const b = nova();
  chamar('POST', `/api/reservas/${b.id}/cancelar`, { destino: 'dinheiro' });
  const cx = chamar('GET', '/api/caixa/atual').corpo;
  // 50 de abertura + 2 sinais de 60 − 60 devolvidos.
  assert.equal(cx.dinheiro_esperado, 5000 + 12000 - 6000);
  assert.equal(chamar('GET', `/api/produtos/${p.id}`).corpo.estoque, 3);
});

test('lista de espera: avisa quando a peça volta ao estoque (ligada ao produto ou por descrição)', () => {
  const { chamar, cli } = preparar();
  const esgotado = chamar('POST', '/api/produtos', { nome: 'Blusa Linho', tamanho: 'P', cor: 'Off', preco_venda: 9000, estoque: 0 }).corpo;
  const e1 = chamar('POST', '/api/espera', { cliente_id: cli.id, produto_id: esgotado.id }).corpo;
  const e2 = chamar('POST', '/api/espera', { cliente_id: cli.id, descricao: 'saia plissada', tamanho: 'G' }).corpo;
  assert.equal(e1.chegou, null);
  assert.equal(chamar('GET', '/api/espera/resumo').corpo.chegaram, 0);
  chamar('POST', `/api/produtos/${esgotado.id}/estoque`, { tipo: 'entrada', quantidade: 2 });
  chamar('POST', '/api/produtos', { nome: 'Saia Plissada Midi', tamanho: 'G', preco_venda: 12000, estoque: 1 });
  const lista = chamar('GET', '/api/espera').corpo;
  assert.equal(lista.find((x) => x.id === e1.id).chegou.estoque, 2);
  assert.equal(lista.find((x) => x.id === e2.id).chegou.nome, 'Saia Plissada Midi');
  assert.equal(chamar('GET', '/api/espera/resumo').corpo.chegaram, 2);
  chamar('POST', `/api/espera/${e1.id}/status`, { status: 'avisada' });
  assert.equal(chamar('GET', '/api/espera/resumo').corpo.chegaram, 1);
  assert.equal(chamar('POST', '/api/espera', { cliente_id: cli.id }).status, 400);
});
