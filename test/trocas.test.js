'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novaApi } = require('./ajuda');

function preparar() {
  const api = novaApi();
  const { chamar } = api;
  const vestido = chamar('POST', '/api/produtos', { nome: 'Vestido', preco_venda: 10000, preco_custo: 4000, estoque: 5 }).corpo;
  const blusa = chamar('POST', '/api/produtos', { nome: 'Blusa', preco_venda: 5000, preco_custo: 2000, estoque: 5 }).corpo;
  const ajuste = chamar('POST', '/api/produtos', { nome: 'Ajuste de barra', preco_venda: 0, servico: true, atalho: true }).corpo;
  const cliente = chamar('POST', '/api/clientes', { nome: 'Ana' }).corpo;
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  return { ...api, vestido, blusa, ajuste, cliente };
}

test('serviço: preço na hora, não controla estoque e aparece como atalho', () => {
  const { chamar, ajuste, vestido } = preparar();
  assert.equal(chamar('GET', '/api/produtos/atalhos').corpo[0].nome, 'Ajuste de barra');
  const v = chamar('POST', '/api/vendas', {
    itens: [{ produto_id: vestido.id, quantidade: 1 }, { produto_id: ajuste.id, quantidade: 1, preco: 1500 }],
    pagamentos: [{ forma: 'pix', valor: 11500 }],
  });
  assert.equal(v.status, 200, JSON.stringify(v.corpo));
  assert.equal(v.corpo.total, 11500);
  assert.equal(chamar('GET', `/api/produtos/${ajuste.id}`).corpo.estoque, 0);
  // Preço informado só vale para serviço.
  const tentativa = chamar('POST', '/api/vendas', {
    itens: [{ produto_id: vestido.id, quantidade: 1, preco: 1 }],
    pagamentos: [{ forma: 'pix', valor: 10000 }],
  });
  assert.equal(tentativa.corpo.total, 10000);
  assert.ok(!chamar('GET', '/api/produtos?estoque_baixo=1').corpo.some((p) => p.servico));
});

test('troca gera vale com o valor pago (com desconto), devolve estoque e o vale paga outra compra', () => {
  const { chamar, vestido, blusa, cliente } = preparar();
  const venda = chamar('POST', '/api/vendas', {
    cliente_id: cliente.id,
    itens: [{ produto_id: vestido.id, quantidade: 2 }, { produto_id: blusa.id, quantidade: 1 }],
    desconto: 2500, // 10% sobre 250,00
    pagamentos: [{ forma: 'dinheiro', valor: 22500 }],
  }).corpo;
  const info = chamar('GET', `/api/vendas/${venda.id}/troca`).corpo;
  const itVestido = info.itens.find((i) => i.nome === 'Vestido');
  assert.equal(itVestido.valor_unitario_pago, 9000);

  assert.equal(chamar('POST', `/api/vendas/${venda.id}/troca`, { itens: [{ venda_item_id: itVestido.id, quantidade: 3 }] }).status, 409);
  const t = chamar('POST', `/api/vendas/${venda.id}/troca`, { itens: [{ venda_item_id: itVestido.id, quantidade: 1 }], motivo: 'Tamanho' }).corpo;
  assert.equal(t.valor, 9000);
  assert.match(t.vale.codigo, /^VT\d{6}$/);
  assert.equal(chamar('GET', `/api/produtos/${vestido.id}`).corpo.estoque, 4);
  assert.equal(chamar('POST', `/api/vendas/${venda.id}/cancelar`, { motivo: 'x' }).status, 409);

  // Usa 50,00 do vale numa blusa; sobra 40,00.
  const nova = chamar('POST', '/api/vendas', {
    itens: [{ produto_id: blusa.id, quantidade: 1 }],
    pagamentos: [{ forma: 'vale', valor: 5000, codigo: t.vale.codigo.toLowerCase() }],
  });
  assert.equal(nova.status, 200, JSON.stringify(nova.corpo));
  let vale = chamar('GET', `/api/vales/${t.vale.codigo}`).corpo;
  assert.deepEqual([vale.saldo, vale.status], [4000, 'ativo']);
  // Não pode passar do saldo nem dar troco com vale.
  assert.equal(chamar('POST', '/api/vendas', {
    itens: [{ produto_id: vestido.id, quantidade: 1 }],
    pagamentos: [{ forma: 'vale', valor: 10000, codigo: t.vale.codigo }],
  }).status, 409);
  // Cancelar a venda paga com vale devolve o saldo.
  chamar('POST', `/api/vendas/${nova.corpo.id}/cancelar`, { motivo: 'teste' });
  vale = chamar('GET', `/api/vales/${t.vale.codigo}`).corpo;
  assert.equal(vale.saldo, 9000);

  const rel = chamar('GET', '/api/relatorios').corpo;
  assert.equal(rel.totais.trocas, 9000);
});

test('condicional: peças saem do estoque, voltam ao fechar e as que ficaram vão para venda', () => {
  const { chamar, vestido, blusa, cliente } = preparar();
  assert.equal(chamar('POST', '/api/condicionais', { cliente_id: cliente.id, itens: [{ produto_id: vestido.id, quantidade: 9 }] }).status, 409);
  const c = chamar('POST', '/api/condicionais', {
    cliente_id: cliente.id,
    itens: [{ produto_id: vestido.id, quantidade: 2 }, { produto_id: blusa.id, quantidade: 1 }],
  }).corpo;
  assert.equal(c.pecas, 3);
  assert.equal(c.valor, 25000);
  assert.equal(chamar('GET', `/api/produtos/${vestido.id}`).corpo.estoque, 3);
  assert.equal(chamar('GET', '/api/condicionais').corpo.length, 1);

  const itVestido = c.itens.find((i) => i.produto_id === vestido.id);
  const r = chamar('POST', `/api/condicionais/${c.id}/fechar`, { itens: [{ id: itVestido.id, ficou: 1 }] }).corpo;
  assert.deepEqual(r.ficou, [{ produto_id: vestido.id, quantidade: 1 }]);
  assert.equal(chamar('GET', `/api/produtos/${vestido.id}`).corpo.estoque, 5); // tudo voltou; a venda baixa depois
  assert.equal(chamar('GET', '/api/condicionais').corpo.length, 0);
  assert.equal(chamar('POST', `/api/condicionais/${c.id}/cancelar`).status, 409);
});

test('despesas mensais e lucro real', () => {
  const { chamar, vestido } = preparar();
  chamar('PUT', '/api/config', { taxas_tabela: '', taxa_debito: '2' });
  chamar('POST', '/api/vendas', { itens: [{ produto_id: vestido.id, quantidade: 1 }], pagamentos: [{ forma: 'debito', valor: 10000 }] });
  const hoje = new Date().toLocaleDateString('sv-SE');
  assert.equal(chamar('POST', '/api/despesas', { descricao: 'Aluguel', categoria: 'Aluguel', valor: 3000, data: hoje, repetir: 3 }).corpo.lancadas, 3);
  const r = chamar('GET', '/api/relatorios').corpo;
  assert.equal(r.totais.despesas, 3000); // só a deste mês entra no período de hoje
  // 100,00 − 40,00 custo − 2,00 taxa − 30,00 despesa
  assert.equal(r.totais.lucro_real, 2800);
  const lista = chamar('GET', `/api/despesas?de=${hoje}&ate=2099-12-31`).corpo;
  assert.equal(lista.length, 3);
});
