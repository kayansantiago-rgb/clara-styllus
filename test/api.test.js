'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { gerarEan13Interno } = require('../src/codigos');
const { novaApi } = require('./ajuda');

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

test('login: primeiro acesso cria admin, vendedor tem acesso restrito', () => {
  const { chamar, sair } = novaApi({ logar: false });
  assert.equal(chamar('GET', '/api/sessao').corpo.primeiro_acesso, true);
  assert.equal(chamar('GET', '/api/produtos').status, 401);

  const adm = chamar('POST', '/api/primeiro-acesso', { nome: 'Clara', login: 'Clara', senha: '1234' });
  assert.equal(adm.corpo.usuario.perfil, 'admin');
  assert.equal(chamar('POST', '/api/primeiro-acesso', { nome: 'X', login: 'x', senha: '1234' }).status, 409);

  const p = chamar('POST', '/api/produtos', { nome: 'Top', preco_venda: 3000, estoque: 5 }).corpo;
  const ana = chamar('POST', '/api/usuarios', { nome: 'Ana Souza', login: 'ana', senha: 'abcd' }).corpo;
  assert.equal(ana.perfil, 'vendedor');
  assert.equal(chamar('POST', '/api/usuarios', { nome: 'Outra', login: 'ANA', senha: 'abcd' }).status, 409);

  sair();
  assert.equal(chamar('GET', '/api/sessao').corpo.usuario, null);
  assert.equal(chamar('POST', '/api/login', { login: 'ana', senha: 'errada' }).status, 401);
  assert.equal(chamar('POST', '/api/login', { login: 'ana', senha: 'abcd' }).status, 200);

  // Vendedor vende e a venda fica no nome dele, mas não mexe em cadastro/relatório.
  assert.equal(chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 }).corpo.caixa.operador, 'Ana Souza');
  const v = chamar('POST', '/api/vendas', {
    itens: [{ produto_id: p.id, quantidade: 1 }],
    pagamentos: [{ forma: 'pix', valor: 3000 }],
  }).corpo;
  assert.equal(v.vendedor, 'Ana Souza');
  assert.equal(v.usuario_id, ana.id);
  assert.equal(chamar('POST', '/api/produtos', { nome: 'X' }).status, 403);
  assert.equal(chamar('GET', '/api/relatorios').status, 403);
  assert.equal(chamar('POST', `/api/vendas/${v.id}/cancelar`, { motivo: 'x' }).status, 403);
  assert.equal(chamar('DELETE', `/api/vendas/${v.id}`).status, 403);
  assert.equal(chamar('GET', '/api/usuarios').status, 403);

  // Troca de senha pelo próprio usuário.
  assert.equal(chamar('POST', '/api/minha-senha', { senha_atual: 'abcd', nova_senha: 'nova1' }).status, 200);
  sair();
  assert.equal(chamar('POST', '/api/login', { login: 'ana', senha: 'nova1' }).status, 200);
});

test('usuário desativado perde o acesso e sempre sobra um admin', () => {
  const { chamar, sair } = novaApi();
  const ana = chamar('POST', '/api/usuarios', { nome: 'Ana', login: 'ana', senha: 'abcd' }).corpo;
  const clara = chamar('GET', '/api/sessao').corpo.usuario;
  assert.equal(chamar('PUT', `/api/usuarios/${clara.id}`, { perfil: 'vendedor' }).status, 409);
  assert.equal(chamar('PUT', `/api/usuarios/${clara.id}`, { ativo: false }).status, 409);

  sair();
  chamar('POST', '/api/login', { login: 'ana', senha: 'abcd' });
  const tokenAna = chamar('GET', '/api/sessao').corpo.usuario;
  assert.equal(tokenAna.login, 'ana');
  sair();
  chamar('POST', '/api/login', { login: 'clara', senha: '1234' });
  assert.equal(chamar('PUT', `/api/usuarios/${ana.id}`, { ativo: false }).corpo.ativo, 0);
  sair();
  assert.equal(chamar('POST', '/api/login', { login: 'ana', senha: 'abcd' }).status, 401);
});

test('administrador exclui venda: devolve estoque e some do caixa e da lista', () => {
  const { chamar } = novaApi();
  const p = chamar('POST', '/api/produtos', { nome: 'Saia', preco_venda: 5000, estoque: 4 }).corpo;
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  const vender = () => chamar('POST', '/api/vendas', {
    itens: [{ produto_id: p.id, quantidade: 2 }],
    pagamentos: [{ forma: 'dinheiro', valor: 10000 }],
  }).corpo;
  const a = vender();
  const b = vender();
  assert.equal(chamar('GET', `/api/produtos/${p.id}`).corpo.estoque, 0);

  // Venda ativa: excluir devolve as peças.
  assert.equal(chamar('DELETE', `/api/vendas/${a.id}`).status, 200);
  assert.equal(chamar('GET', `/api/vendas/${a.id}`).status, 404);
  assert.equal(chamar('GET', `/api/produtos/${p.id}`).corpo.estoque, 2);
  assert.equal(chamar('GET', '/api/caixa/atual').corpo.dinheiro_esperado, 10000);

  // Venda já cancelada: o estoque já voltou, não soma de novo.
  chamar('POST', `/api/vendas/${b.id}/cancelar`, { motivo: 'teste' });
  assert.equal(chamar('DELETE', `/api/vendas/${b.id}`).status, 200);
  assert.equal(chamar('GET', `/api/produtos/${p.id}`).corpo.estoque, 4);
  assert.equal(chamar('GET', '/api/vendas').corpo.length, 0);
  assert.equal(chamar('DELETE', `/api/vendas/${b.id}`).status, 404);
});
