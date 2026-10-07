'use strict';

/** Testes dos problemas encontrados na revisão geral (para não voltarem). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { novaApi } = require('./ajuda');

function loja() {
  const api = novaApi();
  const { chamar } = api;
  const p = chamar('POST', '/api/produtos', { nome: 'Vestido', preco_venda: 10000, estoque: 10 }).corpo;
  const cli = chamar('POST', '/api/clientes', { nome: 'Ana' }).corpo;
  return { ...api, p, cli };
}

test('cancelar venda de um caixa já fechado não muda o fechamento dele; o dinheiro sai do caixa de hoje', () => {
  const { chamar, p } = loja();
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  const v = chamar('POST', '/api/vendas', { itens: [{ produto_id: p.id, quantidade: 1 }], pagamentos: [{ forma: 'dinheiro', valor: 10000 }] }).corpo;
  const c1 = chamar('POST', '/api/caixa/fechar', { valor_informado: 10000 }).corpo;
  assert.equal(c1.diferenca, 0);
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 5000 });
  assert.equal(chamar('POST', `/api/vendas/${v.id}/cancelar`, { motivo: 'desistiu' }).status, 200);
  const antigo = chamar('GET', `/api/caixas/${c1.caixa.id}`).corpo;
  assert.equal(antigo.diferenca, 0);
  assert.equal(antigo.vendas.total, 10000);
  const hoje = chamar('GET', '/api/caixa/atual').corpo;
  assert.equal(hoje.dinheiro_esperado, 5000 - 10000);
  assert.match(hoje.movimentos[0].motivo, /Devolução da venda/);
});

test('cancelar venda no mesmo caixa continua como antes (sem sangria extra)', () => {
  const { chamar, p } = loja();
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  const v = chamar('POST', '/api/vendas', { itens: [{ produto_id: p.id, quantidade: 1 }], pagamentos: [{ forma: 'dinheiro', valor: 10000 }] }).corpo;
  chamar('POST', `/api/vendas/${v.id}/cancelar`, { motivo: 'erro' });
  const cx = chamar('GET', '/api/caixa/atual').corpo;
  assert.equal(cx.dinheiro_esperado, 0);
  assert.equal(cx.movimentos.length, 0);
  assert.equal(cx.vendas.canceladas, 1);
});

test('estorno de recebimento do crediário de outro caixa: fechamento antigo intacto', () => {
  const { chamar, p, cli } = loja();
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  chamar('POST', '/api/vendas', { cliente_id: cli.id, itens: [{ produto_id: p.id, quantidade: 1 }], pagamentos: [{ forma: 'crediario', valor: 10000, parcelas: 2 }] });
  const rec = chamar('POST', `/api/crediario/clientes/${cli.id}/receber`, { valor: 5000, forma: 'dinheiro' }).corpo;
  const c1 = chamar('POST', '/api/caixa/fechar', { valor_informado: 5000 }).corpo;
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  chamar('POST', `/api/crediario/recebimentos/${rec.id}/estornar`);
  assert.equal(chamar('GET', `/api/caixas/${c1.caixa.id}`).corpo.diferenca, 0);
  assert.equal(chamar('GET', '/api/caixa/atual').corpo.dinheiro_esperado, -5000);
});

test('vale cancelado pelo administrador não volta a valer quando a venda é cancelada', () => {
  const { chamar, p } = loja();
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  const v1 = chamar('POST', '/api/vendas', { itens: [{ produto_id: p.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valor: 10000 }] }).corpo;
  const t = chamar('POST', `/api/vendas/${v1.id}/troca`, { itens: [{ venda_item_id: v1.itens[0].id, quantidade: 1 }] }).corpo;
  const v2 = chamar('POST', '/api/vendas', { itens: [{ produto_id: p.id, quantidade: 1 }], pagamentos: [{ forma: 'vale', codigo: t.vale.codigo, valor: 6000 }, { forma: 'pix', valor: 4000 }] }).corpo;
  chamar('POST', `/api/vales/${t.vale.codigo}/cancelar`);
  chamar('POST', `/api/vendas/${v2.id}/cancelar`, { motivo: 'teste' });
  assert.equal(chamar('GET', `/api/vales/${t.vale.codigo}`).corpo.status, 'cancelado');
});

test('pagamento com vale sem código dá erro claro (400), não erro interno', () => {
  const { chamar, p } = loja();
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  const r = chamar('POST', '/api/vendas', { itens: [{ produto_id: p.id, quantidade: 1 }], pagamentos: [{ forma: 'vale', codigo: 'VT000001', valor: 1000 }, { forma: 'vale', valor: 1000 }, { forma: 'dinheiro', valor: 8000 }] });
  assert.equal(r.status, 400);
});

test('troca nunca devolve mais do que a cliente pagou (arredondamento)', () => {
  const { chamar } = loja();
  const b = chamar('POST', '/api/produtos', { nome: 'Meia', preco_venda: 3000, estoque: 10 }).corpo;
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  const v = chamar('POST', '/api/vendas', { itens: [{ produto_id: b.id, quantidade: 2, desconto: 1 }], pagamentos: [{ forma: 'pix', valor: 5999 }] }).corpo;
  const t1 = chamar('POST', `/api/vendas/${v.id}/troca`, { itens: [{ venda_item_id: v.itens[0].id, quantidade: 1 }] }).corpo;
  const t2 = chamar('POST', `/api/vendas/${v.id}/troca`, { itens: [{ venda_item_id: v.itens[0].id, quantidade: 1 }] }).corpo;
  assert.equal(t1.valor + t2.valor, 5999);
});

test('retirada de reserva usa o preço combinado, mesmo se a peça ficou mais cara (sem esbarrar no desconto máximo)', () => {
  const { chamar, p, cli } = loja();
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  const r = chamar('POST', '/api/reservas', { cliente_id: cli.id, itens: [{ produto_id: p.id, quantidade: 1 }], sinal: { valor: 3000, forma: 'pix' } }).corpo;
  chamar('PUT', `/api/produtos/${p.id}`, { preco_venda: 20000 });
  const ret = chamar('POST', `/api/reservas/${r.id}/retirar`).corpo;
  const v = chamar('POST', '/api/vendas', {
    reserva_id: r.id, cliente_id: cli.id, itens: [{ produto_id: p.id, quantidade: 1 }],
    pagamentos: [{ forma: 'vale', codigo: ret.vale.codigo, valor: 3000 }, { forma: 'dinheiro', valor: 7000 }],
  });
  assert.equal(v.status, 200, JSON.stringify(v.corpo));
  assert.equal(v.corpo.total, 10000);
  assert.equal(v.corpo.desconto, 0);
  // A mesma reserva não vira duas vendas com o preço antigo.
  assert.equal(chamar('POST', '/api/vendas', { reserva_id: r.id, itens: [{ produto_id: p.id, quantidade: 1 }], pagamentos: [{ forma: 'dinheiro', valor: 10000 }] }).status, 409);
});

test('sinal que fica com a loja entra no lucro real', () => {
  const { chamar, p, cli } = loja();
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  const r = chamar('POST', '/api/reservas', { cliente_id: cli.id, itens: [{ produto_id: p.id, quantidade: 1 }], sinal: { valor: 3000, forma: 'dinheiro' } }).corpo;
  chamar('POST', `/api/reservas/${r.id}/cancelar`, { destino: 'loja' });
  const rel = chamar('GET', '/api/relatorios').corpo;
  assert.equal(rel.totais.sinais_retidos, 3000);
  assert.equal(rel.totais.lucro_real, 3000);
});

test('senha errada 5 vezes: o usuário espera antes de tentar de novo', () => {
  const { chamar, sair } = novaApi();
  sair();
  for (let i = 0; i < 5; i++) assert.equal(chamar('POST', '/api/login', { login: 'clara', senha: 'errada' }).status, 401);
  const r = chamar('POST', '/api/login', { login: 'clara', senha: '1234' });
  assert.equal(r.status, 429);
  assert.match(r.corpo.erro, /Espere/);
});

test('vendedora: não vê preço de custo e não cancela condicional', () => {
  const { chamar, p, cli, sair } = loja();
  chamar('POST', '/api/usuarios', { nome: 'Bia', login: 'bia', senha: '1234', perfil: 'vendedor' });
  chamar('PUT', `/api/produtos/${p.id}`, { preco_custo: 4000 });
  const c = chamar('POST', '/api/condicionais', { cliente_id: cli.id, itens: [{ produto_id: p.id, quantidade: 1 }] }).corpo;
  sair();
  chamar('POST', '/api/login', { login: 'bia', senha: '1234' });
  assert.equal('preco_custo' in chamar('GET', `/api/produtos/${p.id}`).corpo, false);
  assert.equal('preco_custo' in chamar('GET', '/api/produtos').corpo[0], false);
  assert.equal(chamar('POST', `/api/condicionais/${c.id}/cancelar`).status, 403);
});

test('etiqueta: quebra de linha no nome não vira comando da impressora', () => {
  const { tspl, epl } = require('../src/impressao/etiquetas');
  const cfg = { etiqueta_largura_mm: '40', etiqueta_altura_mm: '30', etiqueta_colunas: '1', etiqueta_mostrar_preco: '1' };
  const p = { nome: 'Blusa\r\nPRINT 500,1\r\nX', codigo: '2000000000015', preco_venda: 100, tamanho: 'M\nA1' };
  assert.doesNotMatch(tspl([p], cfg).toString('latin1'), /^PRINT 500/m);
  assert.doesNotMatch(epl([p], cfg).toString('latin1'), /^A1$/m);
});

test('servidor: endereço malformado responde 400 e o sistema continua no ar; upload sem login é recusado antes', async () => {
  const { abrirBanco } = require('../src/db');
  const { criarServidor } = require('../server');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-srv-'));
  const db = abrirBanco(path.join(pasta, 't.db'));
  const srv = criarServidor(db, { pastaBackup: path.join(pasta, 'b'), pastaAtualizacoes: path.join(pasta, 'a') });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal((await fetch(`${base}/%E0%A4`)).status, 400);
    assert.equal((await fetch(`${base}/api/produtos/%E0%A4`)).status, 400);
    assert.equal((await fetch(`${base}/`)).status, 200);
    const up = await fetch(`${base}/api/atualizacao/arquivo`, { method: 'POST', body: Buffer.alloc(2e6) });
    assert.equal(up.status, 401);
  } finally {
    await new Promise((ok) => srv.close(ok));
    db.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('excluir cliente: bloqueia quem deve; sem histórico apaga; com histórico apaga os dados e tira das listas', () => {
  const { chamar, p } = loja();
  chamar('POST', '/api/caixa/abrir', { valor_abertura: 0 });
  const nova = chamar('POST', '/api/clientes', { nome: 'Sem Compras', telefone: '63999990000' }).corpo;
  assert.equal(chamar('DELETE', `/api/clientes/${nova.id}`).corpo.apagado, true);
  assert.equal(chamar('GET', `/api/clientes/${nova.id}`).status, 404);

  const bia = chamar('POST', '/api/clientes', { nome: 'Bia Devendo', telefone: '63988887777', cpf: '' }).corpo;
  chamar('POST', '/api/vendas', { cliente_id: bia.id, itens: [{ produto_id: p.id, quantidade: 1 }], pagamentos: [{ forma: 'crediario', valor: 10000, parcelas: 1 }] });
  const r = chamar('DELETE', `/api/clientes/${bia.id}`);
  assert.equal(r.status, 409);
  assert.match(r.corpo.erro, /deve/);
  // Quitou: aparece nos quitados e já pode ser excluída (o nome fica na venda).
  chamar('POST', `/api/crediario/clientes/${bia.id}/receber`, { valor: 10000, forma: 'pix' });
  const quitados = chamar('GET', '/api/crediario/quitados').corpo;
  assert.equal(quitados.length, 1);
  assert.equal(quitados[0].total, 10000);
  assert.equal(chamar('GET', '/api/crediario').corpo.length, 0);
  const ex = chamar('DELETE', `/api/clientes/${bia.id}`).corpo;
  assert.equal(ex.apagado, false);
  assert.equal(chamar('GET', '/api/clientes').corpo.some((c) => c.id === bia.id), false);
  const ficha = chamar('GET', `/api/clientes/${bia.id}`).corpo;
  assert.equal(ficha.telefone, null);
  assert.equal(chamar('GET', '/api/vendas').corpo[0].cliente_nome, 'Bia Devendo');
});
