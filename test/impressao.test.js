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
  assert.match(t, /BARCODE \d+,\d+,"EAN13",\d+,0,0,\d,\d,"200000000001"/);
  assert.match(t, /BARCODE \d+,\d+,"128",\d+,0,0,\d,\d,"ABC-123"/);
  // Número embaixo das barras escrito em fonte pequena, dentro da etiqueta (240 pontos de altura).
  for (const [, y] of t.matchAll(/TEXT \d+,(\d+),"2",0,1,1,"(?:2000000000015|ABC-123)"/g)) assert.ok(Number(y) + 20 <= 240 - 12, `número cortado: y=${y}`);
  assert.match(t, /"2000000000015"/);
  assert.match(t, /TEXT \d+,\d+,"\d",0,1,1,"R\$ 89,90"/);
});

test('etiqueta com a logo da loja: imagem no lugar do nome, nas três linguagens', () => {
  const cfg = { ...cfgEtq, etiqueta_colunas: '1', etiqueta_logo: '1' };
  const t = tspl([prod], cfg).toString('latin1');
  const m = t.match(/BITMAP (\d+),(\d+),(\d+),(\d+),0,/);
  assert.ok(m, 'TSPL sem BITMAP');
  const [, x, , larg, alt] = m.map(Number);
  assert.ok(alt >= 30 && alt <= 40 && x + larg * 8 <= 320, `logo fora da etiqueta: ${m[0]}`);
  // O bitmap tem exatamente largura x altura bytes e o próximo comando começa logo depois.
  const fim = t.indexOf(m[0]) + m[0].length + larg * alt;
  assert.match(t.slice(fim, fim + 7), /^\r\nTEXT /);
  assert.doesNotMatch(t, /"CLARA STYLLUS"/);
  assert.match(zpl([prod], cfg).toString('latin1'), /\^GFA,\d+,\d+,\d+,[0-9A-F]+\^FS/);
  assert.match(epl([prod], cfg).toString('latin1'), /\nGW\d+,\d+,\d+,\d+,/);
  // Desligada (ou modelo simples): volta o nome escrito / nada.
  assert.match(tspl([prod], { ...cfg, etiqueta_logo: '0' }).toString('latin1'), /"CLARA STYLLUS"/);
  assert.doesNotMatch(tspl([prod], { ...cfg, etiqueta_modelo: 'simples' }).toString('latin1'), /BITMAP/);
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

test('etiqueta modelo parcelado: "3X DE" com a parcela arredondada para cima', () => {
  const { zpl: z, tspl: t, epl: e, valorParcela } = require('../src/impressao/etiquetas');
  assert.equal(valorParcela(25990, 3), 8664);
  assert.equal(valorParcela(9000, 3), 3000);
  const cfg = { ...cfgEtq, etiqueta_colunas: '1', etiqueta_modelo: 'parcelado', etiqueta_mostrar_preco: '1' };
  const p = { nome: 'Vestido', codigo: '2000000000015', preco_venda: 25990, tamanho: 'M' };
  for (const saida of [t([p], cfg), z([p], cfg), e([p], cfg)].map((b) => b.toString('latin1'))) {
    assert.match(saida, /3X DE R\$ 86,64/);
    assert.match(saida, /SEM JUROS NO CARTAO/);
    assert.match(saida, /R\$ 259,90/);
  }
  assert.match(t([p], { ...cfg, etiqueta_parcelas: '5' }).toString('latin1'), /5X DE R\$ 51,98/);
});

test('etiquetadora Knup em ZPL (o padrão) recebe TSPL, senão ela ignora a impressão', () => {
  const { gerarEtiquetas, linguagem } = require('../src/impressao/etiquetas');
  const cfg = { ...cfgEtq, etiqueta_colunas: '1', impressao_etiqueta_modo: 'zpl', impressora_etiqueta: 'ETIQUETADEIRA KNUP' };
  assert.equal(linguagem(cfg), 'tspl');
  assert.match(gerarEtiquetas([{ produto: prod, quantidade: 1 }], cfg).toString('latin1'), /^SIZE 40 mm,30 mm/);
  assert.equal(linguagem({ ...cfg, impressora_etiqueta: 'ZDesigner GC420t' }), 'zpl');
  assert.equal(linguagem({ ...cfg, impressao_etiqueta_modo: 'epl' }), 'epl');
});

test('etiqueta do editor: desenho em pontos vira BITMAP/GFA/GW com o número de cópias', () => {
  const { gerarEtiquetasImagem } = require('../src/impressao/etiquetas');
  const bits = Buffer.alloc(40 * 240, 0); // 320 x 240 pontos (40 x 30 mm)
  bits[0] = 0x80; // um ponto preto no canto
  const img = { l: 40, h: 240, bits, copias: 3 };
  const cfg = { ...cfgEtq, etiqueta_colunas: '1', impressao_etiqueta_modo: 'tspl' };
  const t = gerarEtiquetasImagem([img], cfg).toString('latin1');
  assert.match(t, /^SIZE 40 mm,30 mm\r\nGAP 3 mm,0 mm/);
  assert.match(t, /BITMAP 0,0,40,240,0,/);
  assert.equal(t.charCodeAt(t.indexOf('BITMAP 0,0,40,240,0,') + 20), 0x7f); // TSPL: 0 = preto
  assert.match(t, /PRINT 1,3\r\n$/);
  assert.match(gerarEtiquetasImagem([img], { ...cfg, impressao_etiqueta_modo: 'zpl' }).toString('latin1'), /\^GFA,9600,9600,40,80{3}[0-9A-F]+\^FS\n\^PQ3\^XZ/);
  assert.match(gerarEtiquetasImagem([img], { ...cfg, impressao_etiqueta_modo: 'epl' }).toString('latin1'), /\nGW0,0,40,240,[\s\S]*\nP3\n$/);
  // Duas colunas: 3 cópias viram 2 linhas (2 + 1 etiquetas).
  const duas = gerarEtiquetasImagem([img], { ...cfgEtq, impressao_etiqueta_modo: 'tspl' }).toString('latin1');
  assert.equal((duas.match(/^CLS\r$/gm) || []).length, 2);
  assert.equal((duas.match(/BITMAP/g) || []).length, 3);
});

test('crediário, condicional e reserva: só a via da cliente, sem linha de assinatura', () => {
  const doc = require('../src/impressao/documentos');
  const cfg = { loja_nome: 'Clara Styllus', cupom_colunas: '48' };
  const cd = { id: 1, criado_em: '2026-10-26 10:00:00', cliente_nome: 'Ana Souza', prazo: '2026-10-30', pecas: 1, valor: 9990,
    itens: [{ quantidade: 1, nome: 'Blusa', codigo: '200', preco_venda: 9990 }] };
  const cliente = doc.condicional(cd, cfg, 'Via da cliente').texto;
  assert.match(cliente, /Via da cliente/);
  assert.doesNotMatch(cliente, /_{10}/);
  assert.match(doc.condicional(cd, cfg, 'Via da loja').texto, /_{10}/);
});

test('etiqueta "preço único": várias peças com um código só, sai PRECO UNICO e o preço grande (ZPL, EPL e TSPL)', () => {
  const { gerarEtiquetas } = require('../src/impressao/etiquetas');
  const unico = { ...prod, nome: 'Brincos variados', tamanho: 'M', cor: 'Preto', preco_venda: 1500, preco_unico: 1 };
  for (const modo of ['zpl', 'epl', 'tspl']) {
    const saida = gerarEtiquetas([{ produto: unico, quantidade: 1 }], { ...cfgEtq, etiqueta_colunas: '1', impressao_etiqueta_modo: modo }).toString('latin1');
    assert.match(saida, /PRECO UNICO/);
    assert.match(saida, /BRINCOS VARIADOS/);
    assert.match(saida, /R\$ 15,00/);
    assert.doesNotMatch(saida, /TAM M/); // tamanho e cor não aparecem: vale para várias peças
  }
});
