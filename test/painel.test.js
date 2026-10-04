'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novaApi } = require('./ajuda');

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('grade tamanho × cor soma o estoque e ordena os tamanhos', () => {
  const { chamar } = novaApi();
  for (const [t, c, e] of [['G', 'Preto', 3], ['P', 'Preto', 2], ['M', 'Off', 4], ['GG', 'Off', 0], ['M', 'Preto', 1]]) {
    chamar('POST', '/api/produtos', { nome: 'Vestido Midi', referencia: '10', tamanho: t, cor: c, estoque: e });
  }
  chamar('POST', '/api/produtos', { nome: 'Outro', tamanho: 'P', estoque: 9 });
  const g = chamar('GET', '/api/produtos/grade?nome=vestido%20midi&referencia=10').corpo;
  assert.deepEqual(g.tamanhos, ['P', 'M', 'G', 'GG']);
  assert.deepEqual(g.cores, ['Off', 'Preto']);
  assert.equal(g.celulas['Preto|G'].estoque, 3);
  assert.equal(g.celulas['Off|GG'].estoque, 0);
  assert.equal(g.celulas['Off|P'], undefined);
  assert.equal(g.total, 10);
});

test('foto do produto: envia, devolve a imagem e remove', () => {
  const { chamar } = novaApi();
  const p = chamar('POST', '/api/produtos', { nome: 'Blusa' }).corpo;
  assert.equal(chamar('GET', `/api/produtos/${p.id}/foto`).status, 404);
  assert.equal(chamar('PUT', `/api/produtos/${p.id}/foto`, { imagem: 'data:text/html;base64,AAAA' }).status, 400);
  const com = chamar('PUT', `/api/produtos/${p.id}/foto`, { imagem: PNG_1PX }).corpo;
  assert.ok(com.foto_versao > 0);
  const f = chamar('GET', `/api/produtos/${p.id}/foto`).corpo;
  assert.equal(f.tipo, 'image/png');
  assert.deepEqual([...f.conteudo.subarray(1, 4)], [0x50, 0x4e, 0x47]); // "PNG"
  assert.equal(chamar('DELETE', `/api/produtos/${p.id}/foto`).corpo.foto_versao, null);
});

test('painel: vendas de hoje, meta do mês e aniversariantes', () => {
  const { chamar } = novaApi();
  chamar('PUT', '/api/config', { meta_mensal: '1000000' });
  const p = chamar('POST', '/api/produtos', { nome: 'Saia', preco_venda: 10000, estoque: 5 }).corpo;
  chamar('POST', '/api/caixa/abrir', {});
  chamar('POST', '/api/vendas', { itens: [{ produto_id: p.id, quantidade: 2 }], pagamentos: [{ forma: 'pix', valor: 20000 }] });
  const hoje = new Date().toLocaleDateString('sv-SE');
  chamar('POST', '/api/clientes', { nome: 'Ana', aniversario: `1990-${hoje.slice(5)}` });
  chamar('POST', '/api/clientes', { nome: 'Bia', aniversario: '1990-01-01' === `1990-${hoje.slice(5)}` ? '1990-06-15' : '1990-01-01' });

  const r = chamar('GET', '/api/painel').corpo;
  assert.equal(r.hoje.faturamento, 20000);
  assert.equal(r.hoje.pecas, 2);
  assert.equal(r.hoje.ticket, 20000);
  assert.equal(r.mes.meta, 1000000);
  assert.equal(r.ultimos14.length, 14);
  assert.equal(r.ultimos14[13].faturamento, 20000);
  assert.equal(r.mais_vendidos[0].nome, 'Saia');
  assert.deepEqual(r.aniversariantes.map((c) => [c.nome, c.em_dias]), [['Ana', 0]]);
});
