'use strict';

/**
 * Montador de cupom em ESC/POS (Epson, Elgin i7/i8/i9, Bematech MP-4200 em modo ESC/POS,
 * Daruma, Tanca, Knup e a maioria das térmicas de 58/80 mm).
 *
 * Além dos bytes, guarda uma versão em texto puro (`texto`) usada na pré-visualização e nos testes.
 */

// Acentos do português na página de código 850.
const CP850 = {
  'á': 0xa0, 'à': 0x85, 'â': 0x83, 'ã': 0xc6, 'ä': 0x84, 'é': 0x82, 'è': 0x8a, 'ê': 0x88, 'ë': 0x89,
  'í': 0xa1, 'ì': 0x8d, 'î': 0x8c, 'ï': 0x8b, 'ó': 0xa2, 'ò': 0x95, 'ô': 0x93, 'õ': 0xe4, 'ö': 0x94,
  'ú': 0xa3, 'ù': 0x97, 'û': 0x96, 'ü': 0x81, 'ç': 0x87, 'ñ': 0xa4,
  'Á': 0xb5, 'À': 0xb7, 'Â': 0xb6, 'Ã': 0xc7, 'Ä': 0x8e, 'É': 0x90, 'È': 0xd4, 'Ê': 0xd2, 'Í': 0xd6,
  'Ó': 0xe0, 'Ô': 0xe2, 'Õ': 0xe5, 'Ö': 0x99, 'Ú': 0xe9, 'Ü': 0x9a, 'Ç': 0x80, 'Ñ': 0xa5,
  'º': 0xa7, 'ª': 0xa6, '°': 0xf8, '·': 0xfa, '§': 0xf5,
};

const semAcento = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[º°]/g, 'o')
    .replace(/ª/g, 'a')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/·/g, '-')
    .replace(/[^\x20-\x7e\n]/g, '?');

class Cupom {
  /** @param {{colunas?: number, acentos?: 'cp850'|'sem'}} op */
  constructor({ colunas = 48, acentos = 'cp850' } = {}) {
    this.colunas = colunas;
    this.acentos = acentos;
    this.partes = [];
    this.linhas = [];
    this.cmd(0x1b, 0x40); // inicializa
    if (acentos === 'cp850') this.cmd(0x1b, 0x74, 2); // página de código 850
    this.largura = 1;
  }

  cmd(...bytes) {
    this.partes.push(Buffer.from(bytes));
    return this;
  }

  codificar(s) {
    if (this.acentos !== 'cp850') return Buffer.from(semAcento(s), 'latin1');
    const bytes = [];
    for (const ch of String(s ?? '')) {
      if (CP850[ch] !== undefined) bytes.push(CP850[ch]);
      else {
        const c = ch.charCodeAt(0);
        bytes.push(...((c >= 0x20 && c < 0x7f) || c === 0x0a ? [c] : Buffer.from(semAcento(ch), 'latin1')));
      }
    }
    return Buffer.from(bytes);
  }

  /** Colunas úteis considerando letra dupla de largura. */
  get cols() {
    return Math.floor(this.colunas / this.largura);
  }

  alinhar(a) {
    return this.cmd(0x1b, 0x61, { esquerda: 0, centro: 1, direita: 2 }[a] ?? 0);
  }

  negrito(on = true) {
    return this.cmd(0x1b, 0x45, on ? 1 : 0);
  }

  /** tamanho: 'normal' | 'alto' | 'grande' (dupla largura e altura) */
  tamanho(t = 'normal') {
    this.largura = t === 'grande' ? 2 : 1;
    return this.cmd(0x1d, 0x21, { normal: 0x00, alto: 0x01, grande: 0x11 }[t] ?? 0);
  }

  escrever(s) {
    this.partes.push(this.codificar(s));
    return this;
  }

  /** Linha de texto (quebra em várias linhas se passar da largura). */
  linha(s = '', alinhamento) {
    if (alinhamento) this.alinhar(alinhamento);
    for (const l of quebrar(String(s ?? ''), this.cols)) {
      this.escrever(l + '\n');
      this.linhas.push(alinhamento === 'centro' ? centralizar(l, this.cols) : l);
    }
    if (alinhamento) this.alinhar('esquerda');
    return this;
  }

  centro(s) {
    return this.linha(s, 'centro');
  }

  /** Texto à esquerda e valor à direita na mesma linha. */
  par(esq, dir) {
    esq = String(esq ?? '');
    dir = String(dir ?? '');
    const espaco = this.cols - dir.length - 1;
    if (esq.length > espaco) {
      const partes = quebrar(esq, this.cols);
      const ultima = partes.pop();
      for (const p of partes) this.linha(p);
      esq = ultima;
    }
    const l = esq.padEnd(this.cols - dir.length) + dir;
    this.escrever(l.slice(0, Math.max(this.cols, l.length)) + '\n');
    this.linhas.push(l);
    return this;
  }

  separador(ch = '-') {
    return this.linha(ch.repeat(this.cols));
  }

  pular(n = 1) {
    this.cmd(0x1b, 0x64, n);
    for (let i = 0; i < n; i++) this.linhas.push('');
    return this;
  }

  /** Código de barras CODE128 centralizado (sem texto embaixo). */
  codigoBarras(dados, altura = 60) {
    const d = Buffer.from('{B' + semAcento(dados), 'latin1');
    this.alinhar('centro');
    this.cmd(0x1d, 0x68, altura); // altura
    this.cmd(0x1d, 0x77, 2); // largura do módulo
    this.cmd(0x1d, 0x48, 0); // sem texto
    this.cmd(0x1d, 0x6b, 73, d.length);
    this.partes.push(d);
    this.escrever('\n');
    this.alinhar('esquerda');
    this.linhas.push(centralizar(`||| ${dados} |||`, this.cols));
    return this;
  }

  /**
   * Imagem monocromática (logo) com GS v 0. raster = { largura: bytes por linha, altura, dados: Buffer }
   * (1 bit por ponto, 1 = preto, linha a linha).
   */
  imagem(raster) {
    const { largura, altura, dados } = raster;
    if (!largura || !altura || !dados || dados.length < largura * altura) return this;
    this.alinhar('centro');
    // Em blocos de até 255 linhas: algumas térmicas não aceitam imagens mais altas num só comando.
    for (let y = 0; y < altura; y += 255) {
      const h = Math.min(255, altura - y);
      this.cmd(0x1d, 0x76, 0x30, 0x00, largura & 0xff, largura >> 8, h & 0xff, h >> 8);
      this.partes.push(dados.subarray(y * largura, (y + h) * largura));
    }
    this.alinhar('esquerda');
    this.linhas.push(centralizar('[ logo ]', this.cols));
    return this;
  }

  /** QR Code nativo da impressora (GS ( k, modelo 2). tamanho = módulo de 1 a 16 pontos. */
  qrcode(texto, tamanho = 6) {
    const d = Buffer.from(semAcento(texto), 'latin1');
    if (!d.length || d.length > 700) return this;
    const n = d.length + 3;
    this.alinhar('centro');
    this.cmd(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // modelo 2
    this.cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, tamanho); // tamanho do módulo
    this.cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // correção de erro M
    this.cmd(0x1d, 0x28, 0x6b, n & 0xff, n >> 8, 0x31, 0x50, 0x30);
    this.partes.push(d);
    this.cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // imprime
    this.escrever('\n');
    this.alinhar('esquerda');
    this.linhas.push(centralizar(`[ QR: ${texto} ]`, this.cols));
    return this;
  }

  gaveta() {
    return this.cmd(0x1b, 0x70, 0x00, 0x19, 0xfa);
  }

  cortar() {
    this.pular(4);
    return this.cmd(0x1d, 0x56, 0x42, 0x00);
  }

  bytes() {
    return Buffer.concat(this.partes);
  }

  get texto() {
    return this.linhas.join('\n');
  }
}

function quebrar(s, largura) {
  if (s.length <= largura) return [s];
  const saida = [];
  let atual = '';
  for (const palavra of s.split(' ')) {
    if (!atual) atual = palavra;
    else if ((atual + ' ' + palavra).length <= largura) atual += ' ' + palavra;
    else {
      saida.push(atual);
      atual = palavra;
    }
    while (atual.length > largura) {
      saida.push(atual.slice(0, largura));
      atual = atual.slice(largura);
    }
  }
  if (atual) saida.push(atual);
  return saida;
}

function centralizar(s, largura) {
  const esq = Math.max(0, Math.floor((largura - s.length) / 2));
  return ' '.repeat(esq) + s;
}

module.exports = { Cupom, semAcento, quebrar };
