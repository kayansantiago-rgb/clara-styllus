'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novaApi } = require('./ajuda');

test('histórico registra desconto, cancelamento, exclusão, estoque, preço, caixa e senha errada', () => {
  const { chamar, sair } = novaApi();
  const p = chamar('POST', '/api/produtos', { nome: 'Saia', preco_venda: 10000, estoque: 5 }).corpo;
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 5000 });
  const semDesc = chamar('POST', '/api/vendas', { itens: [{ produto_id: p.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valor: 10000 }] }).corpo;
  const comDesc = chamar('POST', '/api/vendas', { itens: [{ produto_id: p.id, quantidade: 1, desconto: 2000 }], pagamentos: [{ forma: 'pix', valor: 8000 }] }).corpo;
  chamar('POST', `/api/vendas/${comDesc.id}/cancelar`, { motivo: 'Desistiu' });
  chamar('DELETE', `/api/vendas/${semDesc.id}`);
  chamar('PUT', `/api/produtos/${p.id}`, { preco_venda: 8990 });
  chamar('POST', `/api/produtos/${p.id}/estoque`, { tipo: 'ajuste', quantidade: 2, motivo: 'Contagem' });
  chamar('POST', '/api/caixa/movimento', { tipo: 'sangria', valor: 1000, motivo: 'Banco' });
  chamar('POST', '/api/caixa/movimento', { tipo: 'sangria', valor: 0 }); // inválida: não registra
  sair();
  chamar('POST', '/api/login', { login: 'clara', senha: 'errada' });
  chamar('POST', '/api/login', { login: 'clara', senha: '1234' });

  const r = chamar('GET', '/api/auditoria').corpo;
  const acoes = r.itens.map((i) => i.acao).reverse();
  assert.deepEqual(acoes, [
    'Primeiro acesso', 'Cadastrou produto', 'Abriu o caixa', 'Deu desconto', 'Cancelou venda', 'Excluiu venda',
    'Editou produto', 'Ajuste de estoque', 'Sangria', 'Senha errada', 'Entrou no sistema',
  ]);
  const por = (a) => r.itens.find((i) => i.acao === a);
  assert.match(por('Deu desconto').descricao, /R\$ 20,00 \(20%\)/);
  assert.equal(por('Deu desconto').importante, 1);
  assert.match(por('Editou produto').descricao, /preço R\$ 100,00 → R\$ 89,90/);
  assert.match(por('Ajuste de estoque').descricao, /5 → 2 · Contagem/);
  assert.match(por('Excluiu venda').descricao, /Venda nº 1 de R\$ 100,00/);
  assert.equal(por('Senha errada').usuario, null);
  assert.equal(por('Cancelou venda').usuario, 'Clara');
  assert.deepEqual(r.usuarios, ['Clara']);

  assert.equal(chamar('GET', '/api/auditoria?importantes=1').corpo.itens.every((i) => i.importante === 1), true);
  assert.equal(chamar('GET', '/api/auditoria?tipo=caixa').corpo.itens.length, 2);
  assert.equal(chamar('GET', '/api/auditoria?q=Banco').corpo.itens.length, 1);
});

test('vendedor(a) não vê o histórico', () => {
  const { chamar, sair } = novaApi();
  chamar('POST', '/api/usuarios', { nome: 'Ana', login: 'ana', senha: 'abcd' });
  sair();
  chamar('POST', '/api/login', { login: 'ana', senha: 'abcd' });
  assert.equal(chamar('GET', '/api/auditoria').status, 403);
});
