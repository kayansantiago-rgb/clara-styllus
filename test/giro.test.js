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

test('tamanhos/cores vazios: lista só o que nunca teve peça e apaga com segurança', () => {
  const { chamar, db, vestidoM, ana } = preparar();
  const grade = chamar('POST', '/api/produtos/grade', {
    nome: 'Blusa Grade', preco_venda: 5000,
    variantes: [{ tamanho: 'P', cor: 'Preto', quantidade: 2 }, { tamanho: 'M', cor: 'Azul', quantidade: 1 },
      { tamanho: 'P', cor: 'Azul', quantidade: 0 }, { tamanho: 'M', cor: 'Preto', quantidade: 0 }, { tamanho: 'G', cor: 'Azul', quantidade: 0 }],
  }).corpo;
  const [, , azulP, pretoM, azulG] = grade;
  // Uma das vazias tem cliente esperando: fica.
  chamar('POST', '/api/espera', { cliente_id: ana.id, produto_id: azulG.id });
  // Produto que esgotou de verdade (teve estoque e vendeu) não é "vazio".
  db.prepare('UPDATE produtos SET estoque = 0 WHERE id = ?').run(vestidoM.id);
  const vs = chamar('GET', '/api/produtos/vazias').corpo;
  assert.deepEqual(vs.map((v) => v.id).sort(), [azulP.id, pretoM.id].sort());
  assert.deepEqual(chamar('GET', '/api/produtos/vazias?nome=blusa%20grade').corpo.length, 2);
  // Só apaga o que continua vazio: o Preto M recebe peça antes de apagar.
  chamar('POST', `/api/produtos/${pretoM.id}/estoque`, { tipo: 'entrada', quantidade: 1 });
  assert.equal(chamar('POST', '/api/produtos/vazias/apagar', { ids: [azulP.id, pretoM.id, vestidoM.id] }).corpo.apagados, 1);
  assert.equal(chamar('GET', `/api/produtos/${azulP.id}`).status, 404);
  assert.equal(chamar('GET', `/api/produtos/${pretoM.id}`).corpo.estoque, 1);
  assert.equal(chamar('GET', `/api/produtos/${vestidoM.id}`).status, 200);
});

test('foto da cliente: grava, entrega, troca e some ao excluir o cadastro', () => {
  const { chamar, db, ana } = preparar();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal(chamar('PUT', `/api/clientes/${ana.id}/foto`, { imagem: 'data:text/html;base64,PGI+' }).status, 400);
  const r = chamar('PUT', `/api/clientes/${ana.id}/foto`, { imagem: png }).corpo;
  assert.ok(r.foto_versao);
  assert.equal(chamar('GET', `/api/clientes/${ana.id}`).corpo.foto_versao, r.foto_versao);
  const f = chamar('GET', `/api/clientes/${ana.id}/foto`).corpo;
  assert.equal(f.tipo, 'image/png');
  chamar('DELETE', `/api/clientes/${ana.id}`);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cliente_fotos').get().n, 0);
});

test('relatório de despesas: por categoria, comparação, 6 meses e sangrias do caixa', () => {
  const { chamar, db } = preparar();
  const hoje = new Date().toLocaleDateString('sv-SE');
  chamar('POST', '/api/despesas', { descricao: 'Aluguel', categoria: 'Aluguel', valor: 150000, data: hoje });
  chamar('POST', '/api/despesas', { descricao: 'Luz', categoria: 'Energia', valor: 32000, data: hoje });
  chamar('POST', '/api/despesas', { descricao: 'Sacolas', categoria: '', valor: 8000, data: hoje });
  chamar('POST', '/api/caixa/movimento', { tipo: 'sangria', valor: 5000, motivo: 'Pagou o motoboy' });
  const r = chamar('GET', `/api/relatorios/despesas?de=${hoje}&ate=${hoje}`).corpo;
  assert.equal(r.total, 190000);
  assert.deepEqual(r.por_categoria.map((c) => [c.categoria, c.valor, c.qtd]), [['Aluguel', 150000, 1], ['Energia', 32000, 1], ['Outras', 8000, 1]]);
  assert.equal(r.lancamentos.length, 3);
  assert.equal(r.lancamentos[0].usuario, 'Clara');
  assert.equal(r.meses.length, 6);
  assert.equal(r.meses[5].valor, 190000);
  assert.equal(r.sangrias.length, 1);
  assert.equal(r.sangrias[0].motivo, 'Pagou o motoboy');
  // Período anterior (ontem) para comparar.
  db.prepare(`UPDATE despesas SET data = date(data, '-1 day') WHERE descricao = 'Luz'`).run();
  const r2 = chamar('GET', `/api/relatorios/despesas?de=${hoje}&ate=${hoje}`).corpo;
  assert.equal(r2.anterior, 32000);
  assert.equal(r2.total, 158000);
});

test('despesas: tirar da gaveta, sangria vira despesa, editar e apagar devolvendo ao caixa', () => {
  const { chamar } = preparar();
  const esperado = () => chamar('GET', '/api/caixa/atual').corpo.dinheiro_esperado;
  assert.equal(esperado(), 0);
  chamar('POST', '/api/caixa/movimento', { tipo: 'suprimento', valor: 20000 });
  const r = chamar('POST', '/api/despesas', { descricao: 'Vale', categoria: 'Funcionários', valor: 5000, forma: 'pix', do_caixa: true, favorecido: 'Bia' }).corpo;
  assert.equal(r.do_caixa, true);
  assert.equal(esperado(), 15000);
  const d = chamar('GET', '/api/despesas').corpo[0];
  assert.equal(d.forma, 'dinheiro');
  assert.ok(d.sangria_id);
  assert.equal(chamar('POST', '/api/despesas', { descricao: 'Aluguel', valor: 1000, do_caixa: true, repetir: 3 }).status, 400);
  // Não muda o valor de quem saiu da gaveta; o resto muda.
  assert.equal(chamar('PUT', `/api/despesas/${d.id}`, { descricao: 'Vale', valor: 9999 }).status, 409);
  assert.equal(chamar('PUT', `/api/despesas/${d.id}`, { descricao: 'Vale da Bia', valor: 5000, categoria: 'Funcionários', favorecido: 'Bia' }).corpo.descricao, 'Vale da Bia');
  // Sangria antiga vira despesa (sem tirar de novo); uma vez só.
  chamar('POST', '/api/caixa/movimento', { tipo: 'sangria', valor: 3000, motivo: 'Motoboy' });
  const sg = chamar('GET', '/api/relatorios/despesas').corpo.sangrias;
  assert.deepEqual(sg.map((x) => x.motivo), ['Motoboy']); // a do vale não aparece
  chamar('POST', '/api/despesas', { descricao: 'Motoboy', valor: 3000, sangria_id: sg[0].id });
  assert.equal(chamar('POST', '/api/despesas', { descricao: 'Motoboy', valor: 3000, sangria_id: sg[0].id }).status, 409);
  assert.equal(esperado(), 12000);
  assert.equal(chamar('GET', '/api/relatorios/despesas').corpo.sangrias.length, 0);
  assert.deepEqual(chamar('GET', '/api/despesas/favorecidos').corpo, ['Bia']);
  // Apagar: o vale volta para a gaveta; o motoboy (sangria antiga) não.
  const todas = chamar('GET', '/api/despesas').corpo;
  assert.equal(chamar('DELETE', `/api/despesas/${todas.find((x) => x.descricao === 'Vale da Bia').id}`).corpo.devolvido_ao_caixa, true);
  assert.equal(chamar('DELETE', `/api/despesas/${todas.find((x) => x.descricao === 'Motoboy').id}`).corpo.devolvido_ao_caixa, false);
  assert.equal(esperado(), 17000);
});

test('selos dos produtos (novidade, mais vendida, última peça, parada) e ficha da peça', () => {
  const { chamar, db } = require('./ajuda').novaApi();
  const P = (c) => chamar('POST', '/api/produtos/grade', c).corpo;
  const [calca] = P({ nome: 'Calça Wide', preco_venda: 18990, preco_custo: 8000, variantes: [{ tamanho: '38', quantidade: 10 }, { tamanho: '40', quantidade: 2 }] });
  P({ nome: 'Blazer', preco_venda: 42990, variantes: [{ tamanho: 'G', quantidade: 1 }] });
  P({ nome: 'Saia Antiga', preco_venda: 9990, variantes: [{ tamanho: 'M', quantidade: 3 }] });
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  chamar('POST', '/api/vendas', { itens: [{ produto_id: calca.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valor: 37980 }] });
  db.prepare(`UPDATE produtos SET criado_em = datetime('now','localtime','-90 days') WHERE nome IN ('Saia Antiga', 'Calça Wide')`).run();
  const s = chamar('GET', '/api/produtos/selos').corpo;
  assert.deepEqual(s['calça wide|'], ['mais_vendida']);
  assert.deepEqual(s['blazer|'], ['novidade', 'ultima']);
  assert.deepEqual(s['saia antiga|'], ['parada']);
  const f = chamar('GET', '/api/produtos/ficha?nome=Calça Wide').corpo;
  assert.equal(f.vendidas_30, 2);
  assert.equal(f.total_30, 37980);
  assert.equal(f.semanas.length, 8);
  assert.equal(f.semanas[7], 2);
  assert.deepEqual(f.por_tamanho, [{ tamanho: '38', pecas: 2 }]);
});
