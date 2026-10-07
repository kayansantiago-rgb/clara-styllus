'use strict';

/**
 * Taxas das maquininhas de cartão / PIX.
 * A tabela (Configurações → Vendas) tem a taxa do débito e de cada parcela do crédito (1x a 12x),
 * separada por grupo de bandeira. O valor da taxa é gravado em cada pagamento no momento da venda,
 * para o relatório não mudar se a taxa for alterada depois.
 */

const BANDEIRAS = { visa_master: 'Visa / Mastercard', elo_amex: 'Elo / Amex' };
const BANDEIRA_PADRAO = 'visa_master';

const pct = (v) => {
  const n = Number(String(v ?? '').replace('%', '').replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Tabela salva em JSON: { visa_master: { debito, 1, 2, …, 12 }, elo_amex: { … } }. */
function tabela(cfg) {
  try {
    const t = JSON.parse(cfg.taxas_tabela || 'null');
    return t && typeof t === 'object' ? t : null;
  } catch {
    return null;
  }
}

const bandeiraValida = (b) => (Object.hasOwn(BANDEIRAS, b) ? b : BANDEIRA_PADRAO);

/** Porcentagem cobrada para a forma de pagamento, número de parcelas e bandeira. */
function percentual(cfg, forma, parcelas = 1, bandeira = BANDEIRA_PADRAO) {
  if (forma === 'pix') return pct(cfg.taxa_pix);
  if (forma !== 'debito' && forma !== 'credito') return 0;
  const t = tabela(cfg);
  const linha = t && (t[bandeiraValida(bandeira)] || t[BANDEIRA_PADRAO]);
  if (linha) {
    const chave = forma === 'debito' ? 'debito' : String(Math.min(12, Math.max(1, Number(parcelas) || 1)));
    if (linha[chave] !== undefined && linha[chave] !== '') return pct(linha[chave]);
  }
  // Formato antigo (uma taxa por faixa de parcelas).
  if (forma === 'debito') return pct(cfg.taxa_debito);
  if (parcelas <= 1) return pct(cfg.taxa_credito_vista);
  if (parcelas <= 6) return pct(cfg.taxa_credito_2a6);
  return pct(cfg.taxa_credito_7a12);
}

/** Valor da taxa em centavos. */
const calcular = (cfg, forma, parcelas, valor, bandeira) =>
  Math.round((valor * percentual(cfg, forma, parcelas, bandeira)) / 100);

/**
 * Juros repassados à cliente: no crédito com `juros_a_partir` parcelas ou mais, a cliente paga o valor
 * "cheio" para a loja receber o preço da peça depois da taxa: cobrado = valor / (1 − taxa).
 * Devolve 0 quando não há repasse.
 */
function jurosRepassados(cfg, forma, parcelas, valor, bandeira) {
  const aPartir = Number(cfg.juros_a_partir) || 0;
  if (forma !== 'credito' || !aPartir || (Number(parcelas) || 1) < aPartir) return 0;
  const p = percentual(cfg, forma, parcelas, bandeira);
  if (!p || p >= 100) return 0;
  return Math.ceil(valor / (1 - p / 100) - 1e-9) - valor;
}

/** Tabela da maquininha da loja (Smart / InfiniteTap), usada como padrão numa instalação nova. */
const TABELA_PADRAO = {
  visa_master: { debito: '1,37', 1: '3,15', 2: '5,39', 3: '6,12', 4: '6,85', 5: '7,57', 6: '8,28', 7: '8,99', 8: '9,69', 9: '10,38', 10: '11,06', 11: '11,74', 12: '12,40' },
  elo_amex: { debito: '2,58', 1: '4,91', 2: '6,47', 3: '7,20', 4: '7,92', 5: '8,63', 6: '9,33', 7: '10,03', 8: '10,72', 9: '11,41', 10: '12,08', 11: '12,75', 12: '13,41' },
};

module.exports = { percentual, calcular, jurosRepassados, tabela, bandeiraValida, BANDEIRAS, BANDEIRA_PADRAO, TABELA_PADRAO };
