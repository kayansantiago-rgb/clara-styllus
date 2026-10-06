'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novaApi } = require('./ajuda');
const taxas = require('../src/taxas');

test('inventário: bipa, confere faltas/sobras, desfaz e ajusta o estoque ao finalizar', () => {
  const { chamar } = novaApi();
  const a = chamar('POST', '/api/produtos', { nome: 'Blusa', categoria: 'Blusas', estoque: 3, preco_custo: 2000 }).corpo;
  const b = chamar('POST', '/api/produtos', { nome: 'Regata', categoria: 'Blusas', estoque: 1, preco_custo: 1000 }).corpo;
  const c = chamar('POST', '/api/produtos', { nome: 'Top', categoria: 'Blusas', estoque: 2, preco_custo: 1500 }).corpo;
  const fora = chamar('POST', '/api/produtos', { nome: 'Calça', categoria: 'Calças', estoque: 5 }).corpo;

  const inv = chamar('POST', '/api/inventarios', { categoria: 'blusas' }).corpo.inventario;
  assert.equal(chamar('POST', '/api/inventarios', {}).status, 409); // só um aberto por vez

  chamar('POST', `/api/inventarios/${inv.id}/bipar`, { codigo: a.codigo });
  chamar('POST', `/api/inventarios/${inv.id}/bipar`, { codigo: a.codigo, quantidade: 2 });
  chamar('POST', `/api/inventarios/${inv.id}/bipar`, { codigo: b.codigo, quantidade: 3 });
  const r = chamar('POST', `/api/inventarios/${inv.id}/bipar`, { codigo: b.codigo }).corpo;
  assert.equal(r.contado, 4);
  assert.equal(chamar('POST', `/api/inventarios/${inv.id}/desfazer`).status, 200);
  assert.equal(chamar('POST', `/api/inventarios/${inv.id}/bipar`, { codigo: fora.codigo }).status, 409);
  assert.equal(chamar('POST', `/api/inventarios/${inv.id}/bipar`, { codigo: '999' }).status, 404);

  const conf = chamar('GET', `/api/inventarios/${inv.id}/conferencia`).corpo;
  assert.deepEqual(conf.itens.map((i) => [i.nome, i.estoque, i.contado, i.diferenca]), [
    ['Blusa', 3, 3, 0], ['Regata', 1, 3, 2], ['Top', 2, 0, -2],
  ]);
  assert.equal(conf.totais.valor_sobra, 2000);
  assert.equal(conf.totais.valor_falta, 3000);

  // Corrige a contagem da Regata digitando o número certo.
  chamar('PUT', `/api/inventarios/${inv.id}/contagem/${b.id}`, { contado: 2 });

  const fim = chamar('POST', `/api/inventarios/${inv.id}/finalizar`, { zerar_nao_bipados: true }).corpo;
  assert.equal(fim.status, 'finalizado');
  assert.equal(fim.ajustados, 2);
  assert.equal(chamar('GET', `/api/produtos/${b.id}`).corpo.estoque, 2);
  assert.equal(chamar('GET', `/api/produtos/${c.id}`).corpo.estoque, 0);
  assert.equal(chamar('GET', `/api/produtos/${fora.id}`).corpo.estoque, 5);
  assert.equal(chamar('GET', `/api/produtos/${c.id}/movimentos`).corpo[0].tipo, 'inventario');
  assert.equal(chamar('POST', `/api/inventarios/${inv.id}/bipar`, { codigo: a.codigo }).status, 409);
});

test('inventário parcial não zera o que não foi bipado', () => {
  const { chamar } = novaApi();
  const a = chamar('POST', '/api/produtos', { nome: 'A', estoque: 4 }).corpo;
  const b = chamar('POST', '/api/produtos', { nome: 'B', estoque: 7 }).corpo;
  const inv = chamar('POST', '/api/inventarios', {}).corpo.inventario;
  chamar('POST', `/api/inventarios/${inv.id}/bipar`, { codigo: a.codigo, quantidade: 5 });
  chamar('POST', `/api/inventarios/${inv.id}/finalizar`, { zerar_nao_bipados: false });
  assert.equal(chamar('GET', `/api/produtos/${a.id}`).corpo.estoque, 5);
  assert.equal(chamar('GET', `/api/produtos/${b.id}`).corpo.estoque, 7);
});

test('taxas das maquininhas por forma e parcelas', () => {
  const cfg = { taxa_debito: '1,5', taxa_credito_vista: '3', taxa_credito_2a6: '4,5', taxa_credito_7a12: '6', taxa_pix: '' };
  assert.equal(taxas.calcular(cfg, 'debito', 1, 10000), 150);
  assert.equal(taxas.calcular(cfg, 'credito', 1, 10000), 300);
  assert.equal(taxas.calcular(cfg, 'credito', 6, 10000), 450);
  assert.equal(taxas.calcular(cfg, 'credito', 10, 10000), 600);
  assert.equal(taxas.calcular(cfg, 'pix', 1, 10000), 0);
  assert.equal(taxas.calcular(cfg, 'dinheiro', 1, 10000), 0);
});

test('taxas por parcela e bandeira (tabela da maquininha)', () => {
  const cfg = { taxas_tabela: JSON.stringify(taxas.TABELA_PADRAO), taxa_pix: '' };
  assert.equal(taxas.percentual(cfg, 'debito', 1), 1.37);
  assert.equal(taxas.percentual(cfg, 'debito', 1, 'elo_amex'), 2.58);
  assert.equal(taxas.percentual(cfg, 'credito', 1), 3.15);
  assert.equal(taxas.percentual(cfg, 'credito', 3), 6.12);
  assert.equal(taxas.percentual(cfg, 'credito', 12, 'elo_amex'), 13.41);
  assert.equal(taxas.calcular(cfg, 'credito', 10, 10000, 'visa_master'), 1106);
  assert.equal(taxas.calcular(cfg, 'pix', 1, 10000), 0);
  // Bandeira desconhecida usa Visa/Master.
  assert.equal(taxas.percentual(cfg, 'credito', 2, 'xyz'), 5.39);
});

test('venda grava a taxa da bandeira escolhida', () => {
  const { chamar } = novaApi();
  const p = chamar('POST', '/api/produtos', { nome: 'Vestido', preco_venda: 10000, estoque: 5 }).corpo;
  chamar('POST', '/api/caixa/abrir', {});
  const v = chamar('POST', '/api/vendas', { itens: [{ produto_id: p.id, quantidade: 1 }], pagamentos: [{ forma: 'credito', valor: 10000, parcelas: 3, bandeira: 'elo_amex' }] }).corpo;
  const r = chamar('GET', '/api/relatorios').corpo;
  const l = r.taxas.linhas.find((x) => x.forma === 'credito');
  assert.equal(l.bandeira, 'elo_amex');
  assert.equal(l.taxa, 720);
  assert.equal(l.percentual, 7.2);
  assert.ok(v.id);
});

test('relatório mostra taxa gravada na venda e lucro após taxas', () => {
  const { chamar } = novaApi();
  chamar('PUT', '/api/config', { taxas_tabela: '', taxa_debito: '2', taxa_credito_2a6: '5' });
  const p = chamar('POST', '/api/produtos', { nome: 'Saia', preco_venda: 10000, preco_custo: 4000, estoque: 5 }).corpo;
  chamar('POST', '/api/caixa/abrir', {});
  chamar('POST', '/api/vendas', { itens: [{ produto_id: p.id, quantidade: 1 }], pagamentos: [{ forma: 'debito', valor: 10000 }] });
  chamar('POST', '/api/vendas', { itens: [{ produto_id: p.id, quantidade: 2 }], pagamentos: [{ forma: 'credito', valor: 20000, parcelas: 3 }] });
  // Mudar a taxa depois não altera vendas já feitas.
  chamar('PUT', '/api/config', { taxas_tabela: '', taxa_debito: '9' });

  const r = chamar('GET', '/api/relatorios').corpo;
  assert.equal(r.taxas.total, 200 + 1000);
  const deb = r.taxas.linhas.find((l) => l.forma === 'debito');
  assert.deepEqual([deb.bruto, deb.taxa, deb.liquido], [10000, 200, 9800]);
  assert.equal(r.totais.lucro_bruto, 30000 - 12000);
  assert.equal(r.totais.lucro_apos_taxas, 18000 - 1200);
});
