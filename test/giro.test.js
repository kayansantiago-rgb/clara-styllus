'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novaApi } = require('./ajuda');

function preparar() {
  const api = novaApi();
  const { chamar } = api;
  const P = (c) => chamar('POST', '/api/produtos', { estoque: 10, ...c }).corpo;
  const vestidoM = P({ nome: 'Vestido Midi', categoria: 'Vestidos', tamanho: 'M', cor: 'Preto', preco_venda: 20000, preco_custo: 8000 });
  const vestidoG = P({ nome: 'Vestido Midi', categoria: 'Vestidos', tamanho: 'G', cor: 'Preto', preco_venda: 20000, preco_custo: 8000 });
  const blusa = P({ nome: 'Blusa Linho', categoria: 'Blusas', tamanho: 'M', preco_venda: 5000, preco_custo: 2000 });
  const saia = P({ nome: 'Saia Jeans', categoria: 'Saias', tamanho: 'P', preco_venda: 3000, preco_custo: 1000 });
  const ana = chamar('POST', '/api/clientes', { nome: 'Ana Souza', telefone: '63999990000' }).corpo;
  const bia = chamar('POST', '/api/clientes', { nome: 'Bia Lima', telefone: '63988880000' }).corpo;
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  const vender = (cliente, produto, qtd) => chamar('POST', '/api/vendas', {
    cliente_id: cliente && cliente.id, itens: [{ produto_id: produto.id, quantidade: qtd }],
    pagamentos: [{ forma: 'dinheiro', valor: produto.preco_venda * qtd }],
  }).corpo;
  return { ...api, vestidoM, vestidoG, blusa, saia, ana, bia, vender };
}

test('curva ABC: junta tamanhos do mesmo modelo e separa A/B/C pelo faturamento', () => {
  const { chamar, vestidoM, vestidoG, blusa, saia, vender } = preparar();
  vender(null, vestidoM, 2); // 40.000
  vender(null, vestidoG, 2); // 40.000  → modelo vestido = 80.000
  vender(null, blusa, 3); //    15.000
  vender(null, saia, 1); //      3.000
  const r = chamar('GET', '/api/relatorios/abc').corpo;
  assert.equal(r.total, 98000);
  assert.deepEqual(r.modelos.map((m) => [m.nome, m.pecas, m.classe]), [
    ['Vestido Midi', 4, 'A'], ['Blusa Linho', 3, 'B'], ['Saia Jeans', 1, 'C'],
  ]);
  assert.equal(r.modelos[0].estoque, 16);
  assert.deepEqual(r.resumo.map((x) => x.modelos), [1, 1, 1]);
});

test('peças paradas: modelo com estoque sem venda há N dias, com o dinheiro parado no custo', () => {
  const { chamar, db, blusa, saia, vender } = preparar();
  vender(null, blusa, 1);
  // Cadastro antigo: tudo foi criado há 200 dias; a blusa vendeu hoje.
  db.prepare(`UPDATE produtos SET criado_em = datetime('now','localtime','-200 days')`).run();
  const r = chamar('GET', '/api/relatorios/paradas?dias=90').corpo;
  const nomes = r.modelos.map((m) => m.nome);
  assert.ok(!nomes.includes('Blusa Linho'));
  assert.deepEqual(nomes, ['Vestido Midi', 'Saia Jeans']); // ordenado pelo custo parado
  assert.equal(r.modelos[0].valor_custo, 20 * 8000);
  assert.deepEqual(r.modelos[0].tamanhos.sort(), ['G', 'M']);
  assert.ok(r.modelos[1].dias_parado >= 199);
  // Venda antiga também conta como parada.
  vender(null, saia, 1);
  db.prepare(`UPDATE vendas SET criado_em = datetime('now','localtime','-120 days') WHERE id = (SELECT MAX(id) FROM vendas)`).run();
  const s = chamar('GET', '/api/relatorios/paradas?dias=90').corpo.modelos.find((m) => m.nome === 'Saia Jeans');
  assert.ok(s.ultima_venda && s.dias_parado >= 119);
  assert.equal(chamar('GET', '/api/relatorios/paradas?dias=365').corpo.modelos.length, 0);
});

test('interessadas: lista de espera primeiro, depois quem compra a categoria no tamanho', () => {
  const { chamar, vestidoM, vestidoG, blusa, saia, ana, bia, vender } = preparar();
  vender(ana, blusa, 1); // Blusas M: não é vestido
  vender(bia, vestidoM, 1); // Vestidos M
  const carla = chamar('POST', '/api/clientes', { nome: 'Carla Dias', telefone: '' }).corpo;
  chamar('POST', '/api/espera', { cliente_id: carla.id, descricao: 'vestido midi', tamanho: 'G' });
  const r = chamar('GET', `/api/produtos/interessadas?ids=${vestidoM.id},${vestidoG.id}`).corpo;
  assert.deepEqual(r.peca.tamanhos, ['M', 'G']);
  assert.equal(r.peca.categoria, 'Vestidos');
  assert.deepEqual(r.clientes.map((c) => c.nome), ['Carla Dias', 'Bia Lima']);
  assert.ok(r.clientes[0].espera_id);
  assert.match(r.clientes[1].motivo, /Já comprou esta peça/);
  // Blusa nova no tamanho M: Ana compra blusas M.
  const nova = chamar('POST', '/api/produtos', { nome: 'Blusa Seda', categoria: 'Blusas', tamanho: 'M', preco_venda: 9000, estoque: 2 }).corpo;
  const b = chamar('GET', `/api/produtos/interessadas?ids=${nova.id}`).corpo;
  assert.deepEqual(b.clientes.map((c) => c.nome), ['Ana Souza']);
  assert.match(b.clientes[0].motivo, /Compra blusas no tam M/);
  // Tamanho que ninguém compra: ninguém.
  assert.equal(chamar('GET', `/api/produtos/interessadas?ids=${saia.id}`).corpo.clientes.length, 0);
  assert.equal(chamar('GET', '/api/produtos/interessadas?ids=').status, 400);
});

test('relatório traz vendas por dia da semana × hora (mapa de calor)', () => {
  const { chamar, blusa, vender } = preparar();
  vender(null, blusa, 1);
  vender(null, blusa, 1);
  const r = chamar('GET', '/api/relatorios').corpo;
  assert.equal(r.por_semana_hora.length, 1);
  const c = r.por_semana_hora[0];
  assert.equal(c.dia, new Date().getDay());
  assert.equal(c.hora, new Date().getHours());
  assert.equal(c.vendas, 2);
  assert.equal(c.faturamento, 10000);
});
