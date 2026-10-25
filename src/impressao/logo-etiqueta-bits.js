'use strict';

/**
 * Logo da loja para a etiqueta: a imagem (tons de cinza, em logo-etiqueta.json) é reduzida para a
 * altura pedida e vira pontos pretos/brancos no formato de cada linguagem de impressora.
 */

const fonte = require('./logo-etiqueta.json');

const PIXELS = Buffer.from(fonte.d, 'base64');

/** Reduz para no máximo `alt` de altura e `larg` de largura (pontos). Largura sai múltipla de 8. */
function bitmap(alt, larg) {
  let h = Math.max(8, Math.round(alt));
  let w = Math.round((fonte.w * h) / fonte.h);
  if (w > larg) { w = larg; h = Math.round((fonte.h * w) / fonte.w); }
  const bytesLinha = Math.ceil(w / 8);
  const bits = new Uint8Array(bytesLinha * h); // 1 = preto
  const fx = fonte.w / w;
  const fy = fonte.h / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let soma = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) soma += PIXELS[yy * fonte.w + xx];
      // Limiar baixo: os traços finos da letra cursiva não somem na redução.
      if (soma / ((y1 - y0) * (x1 - x0)) > 85) bits[y * bytesLinha + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { largura: w, altura: h, bytesLinha, bits };
}

const binario = (bits, inverter) => {
  const b = Buffer.from(bits);
  if (inverter) for (let i = 0; i < b.length; i++) b[i] = 255 - b[i];
  return b.toString('latin1');
};

/** ZPL ^GFA (1 = preto, em hexadecimal). */
function zpl(b, x, y) {
  const hex = Buffer.from(b.bits).toString('hex').toUpperCase();
  return `^FO${x},${y}^GFA,${b.bits.length},${b.bits.length},${b.bytesLinha},${hex}^FS\n`;
}

/** EPL GW (0 = preto, binário). */
function epl(b, x, y) {
  return `GW${x},${y},${b.bytesLinha},${b.altura},${binario(b.bits, true)}\n`;
}

/** TSPL BITMAP (0 = preto, binário). */
function tspl(b, x, y) {
  return `BITMAP ${x},${y},${b.bytesLinha},${b.altura},0,${binario(b.bits, true)}\r\n`;
}

module.exports = { bitmap, zpl, epl, tspl, proporcao: fonte.w / fonte.h };
