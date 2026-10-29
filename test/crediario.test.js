'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novaApi } = require('./ajuda');
const { somarMeses, dividir } = require('../src/crediario');

const hoje = () => new Date().toLocaleDateString('sv-SE');

function preparar() {
  const api = novaApi();
  const { chamar } = api;
  const produto = chamar('POST', '/api/produtos', { nome: 'Vestido', preco_venda: 30000, estoque: 10 }).corpo;
  const cliente = chamar('POST', '/api/clientes', { nome: 'Maria', telefone: '63999990000' }).corpo;
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  return { ...api, produto, cliente };
}

test('datas e divisão das parcelas', () => {
  assert.equal(somarMeses('2026-01-31', 1), '2026-02-28');
  assert.equal(somarMeses('2026-11-15', 2), '2027-01-15');
  assert.deepEqual(dividir(10000, 3), [3334, 3333, 3333]);
});

test('venda no crediário gera parcelas, exige cliente e respeita o limite', () => {
  const { chamar, produto, cliente } = preparar();
  const semCliente = chamar('POST', '/api/vendas', {
    itens: [{ produto_id: produto.id, quantidade: 1 }],
    pagamentos: [{ forma: 'crediario', valor: 30000, parcelas: 3 }],
  });
  assert.equal(semCliente.status, 400);

  const v = chamar('POST', '/api/vendas', {
    cliente_id: cliente.id,
    itens: [{ produto_id: produto.id, quantidade: 1 }],
    pagamentos: [{ forma: 'pix', valor: 10000 }, { forma: 'crediario', valor: 20000, parcelas: 2, primeiro_vencimento: '2030-03-10' }],
  });
  assert.equal(v.status, 200, JSON.stringify(v.corpo));
  assert.deepEqual(v.corpo.crediario.map((p) => [p.numero, p.valor, p.vencimento]), [
    [1, 10000, '2030-03-10'],
    [2, 10000, '2030-04-10'],
  ]);

  const lista = chamar('GET', '/api/crediario').corpo;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].saldo, 20000);
  assert.equal(lista[0].vencido, 0);

  // Limite de crédito
  chamar('PUT', `/api/clientes/${cliente.id}`, { nome: 'Maria', limite_credito: 25000 });
  const estourou = chamar('POST', '/api/vendas', {
    cliente_id: cliente.id,
    itens: [{ produto_id: produto.id, quantidade: 1 }],
    pagamentos: [{ forma: 'crediario', valor: 30000, parcelas: 1 }],
  });
  assert.equal(estourou.status, 409);
  assert.match(estourou.corpo.erro, /Limite/);
});

test('recebimento abate parcelas mais antigas, entra no caixa e pode ser estornado', () => {
  const { chamar, produto, cliente } = preparar();
  const v = chamar('POST', '/api/vendas', {
    cliente_id: cliente.id,
    itens: [{ produto_id: produto.id, quantidade: 1 }],
    pagamentos: [{ forma: 'crediario', valor: 30000, parcelas: 3 }],
  }).corpo;

  const demais = chamar('POST', `/api/crediario/clientes/${cliente.id}/receber`, { valor: 99999, forma: 'dinheiro' });
  assert.equal(demais.status, 400);

  const rec = chamar('POST', `/api/crediario/clientes/${cliente.id}/receber`, { valor: 15000, forma: 'dinheiro' }).corpo;
  assert.deepEqual(rec.parcelas.map((p) => [p.numero, p.valor_recebido]), [[1, 10000], [2, 5000]]);
  assert.equal(rec.saldo.aberto, 15000);

  const caixa = chamar('GET', '/api/caixa/atual').corpo;
  assert.equal(caixa.dinheiro_esperado, 15000);
  assert.deepEqual(caixa.recebimentos_crediario.map((r) => ({ ...r })), [{ forma: 'dinheiro', valor: 15000, quantidade: 1 }]);

  // Venda com parcela já paga não pode ser cancelada sem estornar.
  assert.equal(chamar('POST', `/api/vendas/${v.id}/cancelar`, { motivo: 'teste' }).status, 409);
  const est = chamar('POST', `/api/crediario/recebimentos/${rec.id}/estornar`).corpo;
  assert.equal(est.status, 'estornado');
  assert.equal(est.saldo.aberto, 30000);
  assert.equal(chamar('GET', '/api/caixa/atual').corpo.dinheiro_esperado, 0);

  assert.equal(chamar('POST', `/api/vendas/${v.id}/cancelar`, { motivo: 'teste' }).status, 200);
  assert.equal(chamar('GET', '/api/crediario').corpo.length, 0);
});

test('excluir venda no crediário: recusa com parcela recebida, apaga as parcelas depois do estorno', () => {
  const { chamar, produto, cliente } = preparar();
  const v = chamar('POST', '/api/vendas', {
    cliente_id: cliente.id,
    itens: [{ produto_id: produto.id, quantidade: 1 }],
    pagamentos: [{ forma: 'crediario', valor: 30000, parcelas: 3 }],
  }).corpo;
  const rec = chamar('POST', `/api/crediario/clientes/${cliente.id}/receber`, { valor: 10000, forma: 'pix' }).corpo;
  assert.equal(chamar('DELETE', `/api/vendas/${v.id}`).status, 409);
  chamar('POST', `/api/crediario/recebimentos/${rec.id}/estornar`);
  assert.equal(chamar('DELETE', `/api/vendas/${v.id}`).status, 200);
  assert.equal(chamar('GET', '/api/crediario').corpo.length, 0);
  assert.equal(chamar('GET', `/api/crediario/clientes/${cliente.id}`).status, 200);
});

test('débito manual (caderno antigo), atraso bloqueia nova venda fiada', () => {
  const { chamar, produto, cliente } = preparar();
  const ontem = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE');
  const s = chamar('POST', `/api/crediario/clientes/${cliente.id}/debito`, {
    valor: 5000, parcelas: 1, primeiro_vencimento: ontem, descricao: 'Caderno',
  }).corpo;
  assert.equal(s.vencido, 5000);

  const lista = chamar('GET', '/api/crediario?atraso=1').corpo;
  assert.equal(lista[0].dias_atraso, 1);

  const bloqueada = chamar('POST', '/api/vendas', {
    cliente_id: cliente.id,
    itens: [{ produto_id: produto.id, quantidade: 1 }],
    pagamentos: [{ forma: 'crediario', valor: 30000, parcelas: 1 }],
  });
  assert.equal(bloqueada.status, 409);
  assert.match(bloqueada.corpo.erro, /atraso/);

  const resumo = chamar('GET', `/api/crediario/resumo?de=${hoje()}&ate=${hoje()}`).corpo;
  assert.equal(resumo.a_receber, 5000);
  assert.equal(resumo.clientes_atraso, 1);
});

test('lista do crediário traz o mapa das parcelas (pagas, vencidas, a vencer) e a ficha traz o histórico', () => {
  const { chamar, produto, cliente } = preparar();
  const v = chamar('POST', '/api/vendas', {
    cliente_id: cliente.id,
    itens: [{ produto_id: produto.id, quantidade: 1 }],
    pagamentos: [{ forma: 'crediario', valor: 30000, parcelas: 3, primeiro_vencimento: '2020-01-10' }],
  });
  assert.equal(v.status, 200, JSON.stringify(v.corpo));
  chamar('POST', `/api/crediario/clientes/${cliente.id}/receber`, { valor: 10000, forma: 'pix' });
  const [c] = chamar('GET', '/api/crediario').corpo;
  assert.deepEqual(c.mapa, ['p', 'v', 'v']);
  assert.equal(c.total_carne, 30000);
  assert.equal(c.pago_carne, 10000);
  const lista = chamar('GET', '/api/clientes').corpo.find((x) => x.id === cliente.id);
  assert.equal(lista.vencido, 20000);
  const ficha = chamar('GET', `/api/clientes/${cliente.id}`).corpo;
  assert.equal(ficha.compras, 1);
  assert.equal(ficha.historico.length, 1);
  assert.equal(ficha.pecas_compradas[0].venda_id, v.corpo.id);
});

test('relatório: venda no crediário não é faturamento; só entra quando a cliente paga (inclusive débito antigo)', () => {
  const { chamar, produto, cliente } = preparar();
  const d = hoje();
  // Venda à vista de R$ 300 e venda no crediário de R$ 300.
  chamar('POST', '/api/vendas', { itens: [{ produto_id: produto.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valor: 30000 }] });
  chamar('POST', '/api/vendas', { cliente_id: cliente.id, itens: [{ produto_id: produto.id, quantidade: 1 }], pagamentos: [{ forma: 'crediario', valor: 30000, parcelas: 3 }] });
  let r = chamar('GET', `/api/relatorios?de=${d}&ate=${d}`).corpo;
  assert.equal(r.totais.faturamento, 30000);
  assert.equal(r.totais.vendido_crediario, 30000);
  assert.equal(r.totais.vendido, 60000);
  assert.ok(!r.formas.some((f) => f.forma === 'crediario'));

  // Débito antigo de R$ 50 lançado e pago em dinheiro: entra no faturamento.
  const deb = chamar('POST', `/api/crediario/clientes/${cliente.id}/debito`, { valor: 5000, descricao: 'Caderno antigo' });
  assert.equal(deb.status, 200, JSON.stringify(deb.corpo));
  const rec = chamar('POST', `/api/crediario/clientes/${cliente.id}/receber`, { valor: 5000, forma: 'dinheiro' });
  assert.equal(rec.status, 200, JSON.stringify(rec.corpo));
  r = chamar('GET', `/api/relatorios?de=${d}&ate=${d}`).corpo;
  assert.equal(r.totais.recebido_crediario, 5000);
  assert.equal(r.totais.faturamento, 35000);
  assert.equal(r.formas.find((f) => f.forma === 'crediario_recebido').valor, 5000);
  assert.equal(r.por_dia.reduce((a, x) => a + x.faturamento, 0), 35000);
  // Meta do mês no Início usa a mesma conta.
  assert.equal(chamar('GET', '/api/painel').corpo.mes.faturamento, 35000);
});
