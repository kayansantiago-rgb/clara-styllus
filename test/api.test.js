'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirBanco } = require('../src/db');
const { criarApi } = require('../src/api');
const { gerarEan13Interno } = require('../src/codigos');

function novaApi() {
  const db = abrirBanco(':memory:');
  const despachar = criarApi(db);
  const chamar = (metodo, caminho, corpo) => {
    const url = new URL(caminho, 'http://x');
    return despachar(metodo, url.pathname, url.searchParams, corpo);
  };
  return { db, chamar };
}

test('EAN-13 interno tem dígito verificador válido', () => {
  assert.equal(gerarEan13Interno(1), '2000000000015');
  assert.equal(gerarEan13Interno(123), '2000000001234');
});

test('cadastro de produto gera código e registra estoque inicial', () => {
  const { chamar } = novaApi();
  const r = chamar('POST', '/api/produtos', {
    nome: 'Vestido Midi', tamanho: 'M', cor: 'Preto', preco_venda: 15990, estoque: 5,
  });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.codigo, gerarEan13Interno(r.corpo.id));
  assert.equal(r.corpo.estoque, 5);

  const porCodigo = chamar('GET', `/api/produtos/codigo/${r.corpo.codigo}`);
  assert.equal(porCodigo.corpo.nome, 'Vestido Midi');

  const dup = chamar('POST', '/api/produtos', { nome: 'Outro', codigo: r.corpo.codigo });
  assert.equal(dup.status, 409);
});

test('venda exige caixa aberto, baixa estoque, calcula troco e pode ser cancelada', () => {
  const { chamar } = novaApi();
  const blusa = chamar('POST', '/api/produtos', { nome: 'Blusa', preco_venda: 5000, estoque: 3 }).corpo;

  const semCaixa = chamar('POST', '/api/vendas', {
    itens: [{ produto_id: blusa.id, quantidade: 1 }],
    pagamentos: [{ forma: 'dinheiro', valor: 5000 }],
  });
  assert.equal(semCaixa.status, 409);

  chamar('POST', '/api/caixa/abrir', { valor_abertura: 10000, operador: 'Clara' });

  const venda = chamar('POST', '/api/vendas', {
    itens: [{ produto_id: blusa.id, quantidade: 2, desconto: 1000 }],
    pagamentos: [{ forma: 'pix', valor: 4000 }, { forma: 'dinheiro', valor: 6000 }],
  });
  assert.equal(venda.status, 200, JSON.stringify(venda.corpo));
  assert.equal(venda.corpo.subtotal, 10000);
  assert.equal(venda.corpo.desconto, 1000);
  assert.equal(venda.corpo.total, 9000);
  assert.equal(venda.corpo.troco, 1000);
  assert.equal(chamar('GET', `/api/produtos/${blusa.id}`).corpo.estoque, 1);

  const semEstoque = chamar('POST', '/api/vendas', {
    itens: [{ produto_id: blusa.id, quantidade: 2 }],
    pagamentos: [{ forma: 'pix', valor: 10000 }],
  });
  assert.equal(semEstoque.status, 409);

  const caixa = chamar('GET', '/api/caixa/atual').corpo;
  // 100,00 abertura + 60,00 dinheiro - 10,00 troco
  assert.equal(caixa.dinheiro_esperado, 15000);

  const cancel = chamar('POST', `/api/vendas/${venda.corpo.id}/cancelar`, { motivo: 'Desistência' });
  assert.equal(cancel.corpo.status, 'cancelada');
  assert.equal(chamar('GET', `/api/produtos/${blusa.id}`).corpo.estoque, 3);
  assert.equal(chamar('GET', '/api/caixa/atual').corpo.dinheiro_esperado, 10000);
});

test('troco só sai de dinheiro e desconto respeita o limite', () => {
  const { chamar } = novaApi();
  const p = chamar('POST', '/api/produtos', { nome: 'Calça', preco_venda: 10000, estoque: 10 }).corpo;
  chamar('POST', '/api/caixa/abrir', {});

  const trocoNoCartao = chamar('POST', '/api/vendas', {
    itens: [{ produto_id: p.id, quantidade: 1 }],
    pagamentos: [{ forma: 'credito', valor: 12000 }],
  });
  assert.equal(trocoNoCartao.status, 400);

  const descontoDemais = chamar('POST', '/api/vendas', {
    itens: [{ produto_id: p.id, quantidade: 1 }],
    desconto: 5000,
    pagamentos: [{ forma: 'pix', valor: 5000 }],
  });
  assert.equal(descontoDemais.status, 403);
});

test('fechamento de caixa calcula diferença e relatório soma vendas', () => {
  const { chamar } = novaApi();
  const p = chamar('POST', '/api/produtos', {
    nome: 'Saia', preco_venda: 8000, preco_custo: 3000, estoque: 10,
  }).corpo;
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 5000 });
  chamar('POST', '/api/vendas', {
    itens: [{ produto_id: p.id, quantidade: 1 }],
    pagamentos: [{ forma: 'dinheiro', valor: 10000 }],
  });
  chamar('POST', '/api/caixa/movimento', { tipo: 'sangria', valor: 2000, motivo: 'Depósito' });
  const fechado = chamar('POST', '/api/caixa/fechar', { valor_informado: 10900 }).corpo;
  assert.equal(fechado.dinheiro_esperado, 11000);
  assert.equal(fechado.diferenca, -100);

  const rel = chamar('GET', '/api/relatorios').corpo;
  assert.equal(rel.totais.faturamento, 8000);
  assert.equal(rel.totais.lucro_bruto, 5000);
  assert.deepEqual(rel.formas.map((f) => ({ ...f })), [{ forma: 'dinheiro', valor: 8000 }]);
});

test('ajuste de estoque define a contagem real', () => {
  const { chamar } = novaApi();
  const p = chamar('POST', '/api/produtos', { nome: 'Cinto', estoque: 4 }).corpo;
  const r = chamar('POST', `/api/produtos/${p.id}/estoque`, { tipo: 'ajuste', quantidade: 7 });
  assert.equal(r.corpo.estoque, 7);
  const movs = chamar('GET', `/api/produtos/${p.id}/movimentos`).corpo;
  assert.equal(movs[0].quantidade, 3);
});
