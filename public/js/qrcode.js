/*
 * Gerador de QR Code (ISO/IEC 18004), sem bibliotecas: modo byte (UTF-8), versões 1 a 40,
 * escolha automática da máscara. Usado na pré-visualização e no cupom impresso pelo navegador
 * (a impressora térmica gera o próprio QR com o comando GS ( k).
 *
 * QRCode.matriz(texto, nivel) → array de linhas (true = módulo escuro)
 * QRCode.svg(texto, { nivel, margem, tamanho }) → <svg> pronto
 */
const QRCode = (() => {
  // Correção de erro: L, M, Q, H (bits do formato: 1, 0, 3, 2).
  const NIVEIS = { L: 0, M: 1, Q: 2, H: 3 };
  const BITS_FORMATO = [1, 0, 3, 2];
  const ECC_POR_BLOCO = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const BLOCOS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  /** Módulos de dados disponíveis numa versão (tudo menos os padrões fixos). */
  function modulosDados(v) {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) {
      const n = Math.floor(v / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (v >= 7) r -= 36;
    }
    return r;
  }
  const palavrasDados = (v, e) => Math.floor(modulosDados(v) / 8) - ECC_POR_BLOCO[e][v] * BLOCOS[e][v];

  // ------------------------------------------------------- Reed-Solomon (GF(256), polinômio 0x11D)
  function mult(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function divisor(grau) {
    const r = new Array(grau).fill(0);
    r[grau - 1] = 1;
    let raiz = 1;
    for (let i = 0; i < grau; i++) {
      for (let j = 0; j < grau; j++) {
        r[j] = mult(r[j], raiz);
        if (j + 1 < grau) r[j] ^= r[j + 1];
      }
      raiz = mult(raiz, 0x02);
    }
    return r;
  }
  function resto(dados, div) {
    const r = div.map(() => 0);
    for (const b of dados) {
      const f = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => { r[i] ^= mult(c, f); });
    }
    return r;
  }

  /** Divide em blocos, calcula a correção de erro e intercala. */
  function comCorrecao(dados, v, e) {
    const nBlocos = BLOCOS[e][v];
    const eccLen = ECC_POR_BLOCO[e][v];
    const brutos = Math.floor(modulosDados(v) / 8);
    const curtos = nBlocos - (brutos % nBlocos);
    const tamCurto = Math.floor(brutos / nBlocos);
    const div = divisor(eccLen);
    const blocos = [];
    for (let i = 0, k = 0; i < nBlocos; i++) {
      const d = dados.slice(k, k + tamCurto - eccLen + (i < curtos ? 0 : 1));
      k += d.length;
      const ecc = resto(d, div);
      if (i < curtos) d.push(0);
      blocos.push(d.concat(ecc));
    }
    const r = [];
    for (let i = 0; i < blocos[0].length; i++) {
      blocos.forEach((b, j) => {
        if (i !== tamCurto - eccLen || j >= curtos) r.push(b[i]);
      });
    }
    return r;
  }

  function posicoesAlinhamento(v) {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2;
    const passo = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const r = [6];
    for (let p = v * 4 + 17 - 7; r.length < n; p -= passo) r.splice(1, 0, p);
    return r;
  }

  // ------------------------------------------------------------------ desenho da matriz
  function montar(v, e, palavras, mascaraFixa) {
    const tam = v * 4 + 17;
    const mod = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const fixo = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const marcar = (x, y, escuro) => { mod[y][x] = escuro; fixo[y][x] = true; };

    for (let i = 0; i < tam; i++) { marcar(6, i, i % 2 === 0); marcar(i, 6, i % 2 === 0); }
    const localizador = (x, y) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < tam && yy >= 0 && yy < tam) marcar(xx, yy, d !== 2 && d !== 4);
        }
      }
    };
    localizador(3, 3);
    localizador(tam - 4, 3);
    localizador(3, tam - 4);
    const al = posicoesAlinhamento(v);
    al.forEach((a, i) => al.forEach((b, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) marcar(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));

    const formato = (mascara) => {
      const d = (BITS_FORMATO[e] << 3) | mascara;
      let r = d;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const bits = ((d << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) marcar(8, i, bit(bits, i));
      marcar(8, 7, bit(bits, 6));
      marcar(8, 8, bit(bits, 7));
      marcar(7, 8, bit(bits, 8));
      for (let i = 9; i < 15; i++) marcar(14 - i, 8, bit(bits, i));
      for (let i = 0; i < 8; i++) marcar(tam - 1 - i, 8, bit(bits, i));
      for (let i = 8; i < 15; i++) marcar(8, tam - 15 + i, bit(bits, i));
      marcar(8, tam - 8, true);
    };
    formato(0); // reserva a área (o valor certo é desenhado depois da máscara)
    if (v >= 7) {
      let r = v;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const bits = (v << 12) | r;
      for (let i = 0; i < 18; i++) {
        const b = bit(bits, i);
        const a = tam - 11 + (i % 3);
        const c = Math.floor(i / 3);
        marcar(a, c, b);
        marcar(c, a, b);
      }
    }

    // Dados em zigue-zague, de baixo para cima, duas colunas por vez.
    let i = 0;
    for (let dir = tam - 1; dir >= 1; dir -= 2) {
      if (dir === 6) dir = 5;
      for (let vert = 0; vert < tam; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = dir - j;
          const subindo = ((dir + 1) & 2) === 0;
          const y = subindo ? tam - 1 - vert : vert;
          if (!fixo[y][x] && i < palavras.length * 8) {
            mod[y][x] = bit(palavras[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }

    const aplicar = (m) => {
      for (let y = 0; y < tam; y++) {
        for (let x = 0; x < tam; x++) {
          if (fixo[y][x]) continue;
          let inv;
          switch (m) {
            case 0: inv = (x + y) % 2 === 0; break;
            case 1: inv = y % 2 === 0; break;
            case 2: inv = x % 3 === 0; break;
            case 3: inv = (x + y) % 3 === 0; break;
            case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
            case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
            case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
            default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
          }
          if (inv) mod[y][x] = !mod[y][x];
        }
      }
    };

    // Escolhe a máscara com menor penalidade (regras da norma).
    const penalidade = () => {
      let p = 0;
      const linhas = [];
      for (let y = 0; y < tam; y++) linhas.push(mod[y]);
      for (let x = 0; x < tam; x++) linhas.push(mod.map((l) => l[x]));
      for (const l of linhas) {
        let n = 1;
        for (let k = 1; k <= tam; k++) {
          if (k < tam && l[k] === l[k - 1]) n++;
          else { if (n >= 5) p += 3 + (n - 5); n = 1; }
        }
        const s = l.map((b) => (b ? '1' : '0')).join('');
        for (const pad of ['10111010000', '00001011101']) {
          for (let k = s.indexOf(pad); k >= 0; k = s.indexOf(pad, k + 1)) p += 40;
        }
      }
      for (let y = 0; y < tam - 1; y++) {
        for (let x = 0; x < tam - 1; x++) {
          const c = mod[y][x];
          if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
        }
      }
      const escuros = mod.reduce((a, l) => a + l.filter(Boolean).length, 0);
      p += Math.floor(Math.abs(escuros * 20 - tam * tam * 10) / (tam * tam)) * 10;
      return p;
    };
    let melhor = mascaraFixa ?? -1;
    if (melhor < 0) {
      let menor = Infinity;
      for (let m = 0; m < 8; m++) {
        aplicar(m);
        formato(m);
        const p = penalidade();
        if (p < menor) { menor = p; melhor = m; }
        aplicar(m); // desfaz
      }
    }
    aplicar(melhor);
    formato(melhor);
    return mod;
  }

  /** Matriz do QR Code para o texto (UTF-8, modo byte). */
  function matriz(texto, nivel = 'M', mascara) {
    const e = NIVEIS[nivel] ?? 1;
    const bytes = [...new TextEncoder().encode(String(texto))];
    let v = 1;
    for (; v <= 40; v++) {
      const bitsContagem = v <= 9 ? 8 : 16;
      if (4 + bitsContagem + bytes.length * 8 <= palavrasDados(v, e) * 8) break;
    }
    if (v > 40) throw new Error('Texto grande demais para um QR Code.');
    const cap = palavrasDados(v, e) * 8;
    const bits = [];
    const por = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    por(0x4, 4);
    por(bytes.length, v <= 9 ? 8 : 16);
    bytes.forEach((b) => por(b, 8));
    por(0, Math.min(4, cap - bits.length));
    por(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) por(pad, 8);
    const palavras = [];
    for (let i = 0; i < bits.length; i += 8) palavras.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    return montar(v, e, comCorrecao(palavras, v, e), mascara);
  }

  /** SVG com margem branca (4 módulos, como pede a norma). */
  function svg(texto, { nivel = 'M', margem = 4, tamanho = 160, cor = '#000' } = {}) {
    const m = matriz(texto, nivel);
    const n = m.length + margem * 2;
    let d = '';
    m.forEach((linha, y) => linha.forEach((escuro, x) => {
      if (escuro) d += `M${x + margem} ${y + margem}h1v1h-1z`;
    }));
    return `<svg class="qrcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${tamanho}" height="${tamanho}" shape-rendering="crispEdges">`
      + `<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="${cor}"/></svg>`;
  }

  return { matriz, svg };
})();

if (typeof module !== 'undefined') module.exports = QRCode;
