'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Cupom } = require('../src/impressao/escpos');
const { zpl, epl, tspl } = require('../src/impressao/etiquetas');
const { novaApi } = require('./ajuda');

test('ESC/POS: acentos em CP850, colunas e corte', () => {
  const c = new Cupom({ colunas: 32 });
  c.linha('Pão de açúcar').par('Total', '10,00').cortar();
  const b = c.bytes();
  assert.deepEqual([...b.subarray(0, 5)], [0x1b, 0x40, 0x1b, 0x74, 2]);
  assert.ok(b.includes(Buffer.from([0xc6, 0x6f]))); // "ão"
  assert.ok(b.includes(Buffer.from([0x87, 0xa3]))); // "çú"
  assert.deepEqual([...b.subarray(-4)], [0x1d, 0x56, 0x42, 0x00]);
  assert.equal(c.linhas[1].length, 32);
  // Quebra de linha precisa chegar como LF (0x0A), nos dois modos de acentuação.
  assert.equal(b.filter((x) => x === 0x0a).length, 2);
  assert.ok(!b.includes(Buffer.from('?')));
  assert.ok(new Cupom({ acentos: 'sem' }).linha('a').linha('b').bytes().includes(Buffer.from('a\nb\n')));
  assert.match(c.linhas[1], /^Total\s+10,00$/);
  assert.ok(new Cupom({ acentos: 'sem' }).linha('ação').bytes().includes(Buffer.from('acao')));
});

test('ESC/POS: logo (GS v 0) e QR Code (GS ( k) no cupom', () => {
  const { cupomVenda } = require('../src/impressao/documentos');
  const raster = Buffer.alloc(2 * 3, 0xff); // 16 x 3 pontos pretos
  const cfg = {
    loja_nome: 'Loja', cupom_colunas: '48', cupom_mensagem: 'Volte sempre!',
    cupom_logo: JSON.stringify({ l: 2, h: 3, d: raster.toString('base64') }),
    cupom_qr_texto: 'https://instagram.com/clarastyllus', cupom_qr_legenda: 'Siga a gente',
  };
  const venda = { id: 7, criado_em: '2026-10-06 10:00:00', itens: [], pagamentos: [], subtotal: 0, total: 0 };
  const c = cupomVenda(venda, cfg);
  const b = c.bytes();
  assert.ok(b.includes(Buffer.concat([Buffer.from([0x1d, 0x76, 0x30, 0x00, 2, 0, 3, 0]), raster])));
  const qr = Buffer.from(cfg.cupom_qr_texto, 'latin1');
  assert.ok(b.includes(Buffer.concat([Buffer.from([0x1d, 0x28, 0x6b, qr.length + 3, 0, 0x31, 0x50, 0x30]), qr])));
  assert.ok(b.includes(Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30])));
  assert.match(c.texto, /\[ logo \]/);
  assert.match(c.texto, /Volte sempre!/);
  // Logo inválido é ignorado sem quebrar o cupom.
  assert.doesNotThrow(() => cupomVenda(venda, { ...cfg, cupom_logo: '{quebrado' }));
});

const cfgEtq = {
  etiqueta_largura_mm: '40', etiqueta_altura_mm: '30', etiqueta_colunas: '2', etiqueta_espaco_mm: '2',
  etiqueta_dpi: '203', etiqueta_mostrar_loja: '1', etiqueta_mostrar_preco: '1', loja_nome: 'Clara Styllus',
};
const prod = { nome: 'Blusa Linho', tamanho: 'M', cor: 'Off-white', preco_venda: 8990, codigo: '2000000000015' };

test('ZPL: duas colunas lado a lado, EAN-13 e preço', () => {
  const z = zpl([prod, prod, prod], cfgEtq).toString('latin1');
  assert.equal((z.match(/\^XA/g) || []).length, 2); // 3 etiquetas em 2 linhas
  assert.match(z, /\^PW656/); // 2 x 320 pontos + 16 de espaço
  assert.match(z, /\^BEN,\d+,Y,N\^FD200000000001\^FS/);
  assert.match(z, /R\$ 89,90/);
  assert.match(z, /OFF-WHITE/);
});

test('TSPL: tamanho do rolo em mm, EAN-13, Code128 e uma PRINT por linha', () => {
  const t = tspl([prod, { ...prod, codigo: 'ABC-123' }, prod], cfgEtq).toString('latin1');
  assert.match(t, /^SIZE 82 mm,30 mm\r\nGAP 3 mm,0 mm\r\n/); // 2 x 40 mm + 2 de espaço
  assert.equal((t.match(/^CLS\r$/gm) || []).length, 2);
  assert.equal((t.match(/^PRINT 1,1\r$/gm) || []).length, 2);
  assert.match(t, /BARCODE \d+,\d+,"EAN13",\d+,1,0,\d,\d,"200000000001"/);
  assert.match(t, /BARCODE \d+,\d+,"128",\d+,1,0,\d,\d,"ABC-123"/);
  assert.match(t, /TEXT \d+,\d+,"\d",0,1,1,"R\$ 89,90"/);
});

test('EPL: Code128 para código que não é EAN', () => {
  const e = epl([{ ...prod, codigo: 'ABC-123' }], { ...cfgEtq, etiqueta_colunas: '1' }).toString('latin1');
  assert.match(e, /q320/);
  assert.match(e, /B\d+,\d+,0,1,\d,\d,\d+,B,"ABC-123"/);
  assert.match(e, /P1\n$/);
});

test('rotas de impressão gravam o cupom e as etiquetas na impressora (pasta de teste)', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-imp-'));
  process.env.PDV_IMPRESSAO_PASTA = pasta;
  try {
    const { chamar } = novaApi();
    const p = chamar('POST', '/api/produtos', { nome: 'Saia', preco_venda: 5000, estoque: 3 }).corpo;
    chamar('POST', '/api/caixa/abrir', {});
    const v = chamar('POST', '/api/vendas', {
      itens: [{ produto_id: p.id, quantidade: 1 }],
      pagamentos: [{ forma: 'dinheiro', valor: 10000 }],
    }).corpo;

    // Etiqueta sem impressora escolhida: erro claro.
    const semImpressora = await chamar('POST', '/api/imprimir/etiquetas', { itens: [{ produto_id: p.id, quantidade: 1 }] });
    assert.equal(semImpressora.status, 502);

    // Cupom sem impressora escolhida: acha a única impressora instalada e guarda a escolha.
    assert.deepEqual(await (await chamar('GET', '/api/impressoras')).corpo, ['Arquivo (teste)']);
    assert.equal((await chamar('POST', `/api/imprimir/venda/${v.id}`, {})).status, 200);
    assert.equal(chamar('GET', '/api/config').corpo.impressora_cupom, 'Arquivo (teste)');

    chamar('PUT', '/api/config', { impressora_etiqueta: 'Arquivo (teste)' });
    assert.equal((await chamar('POST', '/api/imprimir/etiquetas', { itens: [{ produto_id: p.id, quantidade: 2 }] })).status, 200);

    const arquivos = fs.readdirSync(pasta).sort();
    assert.equal(arquivos.length, 2);
    const cupom = fs.readFileSync(path.join(pasta, arquivos.find((a) => a.includes('venda'))));
    assert.deepEqual([...cupom.subarray(0, 2)], [0x1b, 0x40]);
    assert.ok(cupom.includes(Buffer.from([0x1b, 0x70, 0x00]))); // abriu a gaveta (pagou em dinheiro)
    assert.ok(cupom.includes(Buffer.from('Troco')));

    const previa = chamar('GET', `/api/imprimir/previa/venda/${v.id}`).corpo.texto;
    assert.match(previa, /COMPROVANTE DE VENDA/);
    assert.match(previa, /Troco\s+50,00/);
  } finally {
    delete process.env.PDV_IMPRESSAO_PASTA;
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});
