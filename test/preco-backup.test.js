'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { novaApi } = require('./ajuda');
const { arredondarPreco } = require('../src/api');
const { zpl, epl } = require('../src/impressao/etiquetas');

test('arredondamento do preço sugerido', () => {
  assert.equal(arredondarPreco(14250, '90'), 14290);
  assert.equal(arredondarPreco(14295, '90'), 14390);
  assert.equal(arredondarPreco(14250, '99'), 14299);
  assert.equal(arredondarPreco(14250, '00'), 14300);
  assert.equal(arredondarPreco(14250, ''), 14250);
  assert.equal(arredondarPreco(11193, '90', 'baixo'), 11190);
  assert.equal(arredondarPreco(11150, '90', 'baixo'), 11090);
});

test('liquidação em lote guarda o preço "De", não acumula desconto e pode ser encerrada', () => {
  const { chamar } = novaApi();
  const a = chamar('POST', '/api/produtos', { nome: 'Vestido', preco_venda: 15990, estoque: 2 }).corpo;
  const b = chamar('POST', '/api/produtos', { nome: 'Saia', preco_venda: 9990, estoque: 2 }).corpo;
  assert.equal(chamar('POST', '/api/produtos/liquidacao', { ids: [a.id], percentual: 0 }).status, 400);

  let r = chamar('POST', '/api/produtos/liquidacao', { ids: [a.id, b.id], percentual: 30, arredondar: '90' }).corpo;
  assert.deepEqual(r.map((p) => [p.preco_anterior, p.preco_venda]), [[15990, 11190], [9990, 6990]]);
  // Mudar para 50% calcula sobre o preço original, não sobre o já reduzido.
  r = chamar('POST', '/api/produtos/liquidacao', { ids: [a.id], percentual: 50, arredondar: '' }).corpo;
  assert.deepEqual([r[0].preco_anterior, r[0].preco_venda], [15990, 7995]);

  // A venda guarda o preço "De" para mostrar a economia no cupom.
  chamar('POST', '/api/caixa/abrir', {});
  const v = chamar('POST', '/api/vendas', { itens: [{ produto_id: a.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valor: 7995 }] }).corpo;
  assert.equal(v.itens[0].preco_anterior, 15990);

  r = chamar('POST', '/api/produtos/liquidacao/encerrar', { ids: [a.id, b.id] }).corpo;
  assert.deepEqual(r.map((p) => [p.preco_anterior, p.preco_venda]), [[null, 15990], [null, 9990]]);
});

test('etiqueta de liquidação mostra "De" riscado e "Por"', () => {
  const cfg = { etiqueta_largura_mm: '40', etiqueta_altura_mm: '30', etiqueta_colunas: '1', etiqueta_dpi: '203', etiqueta_mostrar_preco: '1', etiqueta_mostrar_loja: '1', loja_nome: 'Clara' };
  const p = { nome: 'Vestido', preco_venda: 9990, preco_anterior: 15990, codigo: '2000000000015' };
  const z = zpl([p], cfg).toString('latin1');
  assert.match(z, /DE R\$ 159,90/);
  assert.match(z, /POR R\$ 99,90/);
  assert.match(z, /\^GB\d+,2,2\^FS/); // risco sobre o preço antigo
  const e = epl([p], cfg).toString('latin1');
  assert.match(e, /DE R\$ 159,90/);
  assert.match(e, /\nLO\d+,\d+,\d+,2\n/);
  // Sem liquidação continua só o preço.
  assert.doesNotMatch(zpl([{ ...p, preco_anterior: null }], cfg).toString('latin1'), /DE R\$/);
});

test('backup: manual, ao fechar o caixa, mantém só as últimas N cópias e copia para a segunda pasta', () => {
  const { chamar, pastaBackup, despachar } = novaApi();
  const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-pendrive-'));
  chamar('PUT', '/api/config', { backup_manter: '2', backup_pasta_extra: extra });

  const r = chamar('POST', '/api/backup/agora').corpo;
  assert.ok(fs.existsSync(r.arquivo));
  assert.equal(path.dirname(r.arquivo), pastaBackup);
  assert.ok(fs.existsSync(r.extra));
  assert.equal(r.status.arquivos.length, 1);

  chamar('POST', '/api/caixa/abrir', {});
  const fechado = chamar('POST', '/api/caixa/fechar', { valor_informado: 0 }).corpo;
  assert.equal(fechado.backup.ok, true);

  // Força nomes diferentes para testar a limpeza (o nome tem precisão de segundos).
  fs.copyFileSync(r.arquivo, path.join(pastaBackup, 'clara-styllus-2000-01-01_000000.db'));
  chamar('POST', '/api/backup/agora');
  const st = chamar('GET', '/api/backup/status').corpo;
  assert.ok(st.arquivos.length <= 2);
  assert.ok(!st.arquivos.some((a) => a.nome.startsWith('clara-styllus-2000')));
  assert.equal(st.horas_desde_ultimo, 0);
  assert.equal(despachar.backup.seNecessario(), null); // já fez hoje

  // Pendrive desconectado: backup principal funciona e avisa.
  chamar('PUT', '/api/config', { backup_pasta_extra: path.join(extra, 'arquivo.txt', 'sub') });
  fs.writeFileSync(path.join(extra, 'arquivo.txt'), 'x');
  const comAviso = chamar('POST', '/api/backup/agora').corpo;
  assert.match(comAviso.aviso, /segunda pasta/);
  assert.ok(fs.existsSync(comAviso.arquivo));
});
