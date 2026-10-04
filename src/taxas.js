'use strict';

/**
 * Taxas das maquininhas de cartão / PIX.
 * As porcentagens ficam em Configurações; o valor da taxa é gravado em cada pagamento
 * no momento da venda, para o relatório não mudar se a taxa for alterada depois.
 */

const pct = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Porcentagem cobrada para a forma de pagamento e número de parcelas. */
function percentual(cfg, forma, parcelas = 1) {
  if (forma === 'debito') return pct(cfg.taxa_debito);
  if (forma === 'pix') return pct(cfg.taxa_pix);
  if (forma === 'credito') {
    if (parcelas <= 1) return pct(cfg.taxa_credito_vista);
    if (parcelas <= 6) return pct(cfg.taxa_credito_2a6);
    return pct(cfg.taxa_credito_7a12);
  }
  return 0;
}

/** Valor da taxa em centavos. */
const calcular = (cfg, forma, parcelas, valor) => Math.round((valor * percentual(cfg, forma, parcelas)) / 100);

module.exports = { percentual, calcular };
