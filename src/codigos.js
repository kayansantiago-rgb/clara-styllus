'use strict';

/** Dígito verificador EAN-13 para os 12 primeiros dígitos. */
function digitoEan13(doze) {
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += Number(doze[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (soma % 10)) % 10);
}

/**
 * Gera um EAN-13 de uso interno (prefixo 2, reservado pelo GS1 para uso
 * dentro da própria loja) a partir do id do produto.
 */
function gerarEan13Interno(id) {
  const doze = '2' + String(id).padStart(11, '0');
  return doze + digitoEan13(doze);
}

module.exports = { digitoEan13, gerarEan13Interno };
