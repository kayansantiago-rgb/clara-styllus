'use strict';

/**
 * Etiquetas em linguagem de impressora térmica:
 *  - ZPL: Zebra, Elgin L42 Pro, Argox (modo ZPL), Tanca, Gainscha…
 *  - EPL: Zebra LP/TLP, Elgin L42, Argox em PPLB (compatível com EPL2).
 *  - TSPL: impressoras genéricas de etiqueta (TSC, Gprinter, Xprinter, iDPRT, Beeprt, HPRT
 *    e as "térmicas de etiqueta adesiva" vendidas em marketplaces).
 * Suporta rolo com 1 ou mais colunas (etiquetas lado a lado).
 */

const { semAcento } = require('./escpos');
const Logo = require('./logo-etiqueta-bits');

const ean13Valido = (c) => {
  if (!/^\d{13}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(c[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10 === Number(c[12]);
};

const preco = (c) => 'R$ ' + ((Number(c) || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Número de parcelas do modelo "parcelado" (2 a 12, padrão 3). */
const parcelasEtiqueta = (cfg) => {
  const n = Math.min(12, Math.max(2, Number(cfg.etiqueta_parcelas) || 3));
  // "Sem juros" só até a última parcela sem juros (ex.: juros a partir de 4x → no máximo 3x).
  const aPartir = Number(cfg.juros_a_partir) || 0;
  if (!aPartir) return n;
  return aPartir - 1 >= 2 ? Math.min(n, aPartir - 1) : 0; // 0 = não há parcelamento sem juros
};
/** Valor de cada parcela, arredondado para cima (as parcelas nunca somam menos que o preço). */
const valorParcela = (centavos, n) => Math.ceil((Number(centavos) || 0) / n);

/** Calcula as medidas (em pontos) a partir da configuração. */
function medidas(cfg) {
  const dpmm = (Number(cfg.etiqueta_dpi) || 203) / 25.4;
  const mm = (v) => Math.round(Number(v) * dpmm);
  const largura = mm(cfg.etiqueta_largura_mm || 40);
  const altura = mm(cfg.etiqueta_altura_mm || 30);
  const colunas = Math.max(1, Number(cfg.etiqueta_colunas) || 1);
  const espaco = mm(cfg.etiqueta_espaco_mm || 0);
  return {
    dpmm, largura, altura, colunas, espaco,
    margem: mm(Math.max(1, Number(cfg.etiqueta_margem_mm) || 1.5)),
    gap: mm(cfg.etiqueta_gap_mm || 3),
    larguraTotal: largura * colunas + espaco * (colunas - 1),
  };
}

/** Linhas de conteúdo de uma etiqueta, com altura proporcional. */
function conteudo(p, cfg, m) {
  const det = [p.tamanho && `TAM ${p.tamanho}`, p.cor, p.referencia && `REF ${p.referencia}`].filter(Boolean).join(' - ');
  const h = m.altura - 2 * m.margem;
  const linhas = [];
  // Modelos: padrão (loja, nome, detalhes, preço), preço em destaque e simples (sem o nome da loja).
  const modelo = cfg.etiqueta_modelo || 'padrao';
  const destaque = modelo === 'preco';
  if (cfg.etiqueta_mostrar_loja === '1' && modelo !== 'simples') {
    // Logo da loja no lugar do nome (ou o nome escrito, se a logo estiver desligada).
    if (cfg.etiqueta_logo === '1') linhas.push({ logo: true, alt: (destaque ? 0.13 : modelo === 'parcelado' ? 0.15 : 0.17) * h });
    else linhas.push({ texto: cfg.loja_nome || 'Clara Styllus', alt: (destaque ? 0.08 : 0.1) * h });
  }
  linhas.push({ texto: p.nome, alt: (destaque ? 0.09 : 0.11) * h });
  if (det) linhas.push({ texto: det, alt: (destaque ? 0.075 : 0.085) * h });
  if (cfg.etiqueta_mostrar_preco === '1' && modelo === 'parcelado' && parcelasEtiqueta(cfg) >= 2) {
    // Parcelado: preço à vista menor e "3X DE R$ 86,64" em destaque (sem juros).
    const n = parcelasEtiqueta(cfg);
    if (p.preco_anterior && p.preco_anterior > p.preco_venda) {
      linhas.push({ texto: `DE ${preco(p.preco_anterior)} POR ${preco(p.preco_venda)}`, alt: 0.085 * h });
    } else {
      linhas.push({ texto: preco(p.preco_venda), alt: 0.11 * h });
    }
    linhas.push({ texto: `${n}X DE ${preco(valorParcela(p.preco_venda, n))}`, alt: 0.16 * h });
    linhas.push({ texto: 'SEM JUROS', alt: 0.07 * h });
  } else if (cfg.etiqueta_mostrar_preco === '1') {
    if (p.preco_anterior && p.preco_anterior > p.preco_venda) {
      // Liquidação: "DE R$ 159,90" riscado e "POR R$ 99,90" em destaque.
      linhas.push({ texto: `DE ${preco(p.preco_anterior)}`, alt: 0.085 * h, riscado: true });
      linhas.push({ texto: `POR ${preco(p.preco_venda)}`, alt: (destaque ? 0.2 : 0.15) * h });
    } else {
      linhas.push({ texto: preco(p.preco_venda), alt: (destaque ? 0.26 : 0.17) * h });
    }
  }
  // Quebras de linha e caracteres de controle viram espaço: na linguagem da impressora, uma quebra de
  // linha no nome da peça viraria um comando (ex.: imprimir centenas de etiquetas).
  return linhas.map((l) => (l.logo ? { ...l, alt: Math.max(16, Math.round(l.alt)) } : {
    ...l,
    texto: semAcento(String(l.texto).replace(/[\x00-\x1f\x7f]+/g, ' ')).toUpperCase(),
    alt: Math.max(12, Math.round(l.alt)),
  }));
}

/** Coloca a logo centralizada na linha; devolve [comando, altura usada]. */
function linhaLogo(l, x0, y, m, util, linguagem) {
  const b = Logo.bitmap(l.alt, util);
  const x = x0 + m.margem + Math.max(0, Math.round((util - b.largura) / 2));
  return [Logo[linguagem](b, x, y), b.altura];
}

function barras(codigo, larguraUtil) {
  const ean = ean13Valido(codigo);
  const modulos = ean ? 95 + 18 : (codigo.length + 3) * 11 + 2 + 20;
  const modulo = Math.max(1, Math.min(3, Math.floor(larguraUtil / modulos)));
  const largura = (ean ? 95 : (codigo.length + 3) * 11 + 2) * modulo;
  return { ean, modulo, largura };
}

// ------------------------------------------------------------------- ZPL
function zpl(lista, cfg) {
  const m = medidas(cfg);
  const limpa = (s) => String(s).replace(/[\^~\\]/g, ' ');
  const pecas = [];
  for (const grupo of agrupar(lista, m.colunas)) {
    let z = `^XA^CI0^PW${m.larguraTotal}^LL${m.altura}^LH0,0\n`;
    grupo.forEach((p, col) => {
      const x0 = col * (m.largura + m.espaco);
      const util = m.largura - 2 * m.margem;
      let y = m.margem;
      for (const l of conteudo(p, cfg, m)) {
        if (l.logo) { const [c, a] = linhaLogo(l, x0, y, m, util, 'zpl'); z += c; y += a + 4; continue; }
        // Fonte A0 tem ~0,8 da largura por caractere: diminui (ou corta) para caber em uma linha.
        let alt = l.alt;
        while (alt > 14 && l.texto.length * alt * 0.75 * 0.8 > util) alt--;
        const w = Math.round(alt * 0.75);
        const max = Math.floor(util / (w * 0.8));
        const t = l.texto.slice(0, max);
        z += `^FO${x0 + m.margem},${y + (l.alt - alt)}^A0N,${alt},${w}^FB${util},1,0,C,0^FD${limpa(t)}^FS\n`;
        if (l.riscado) {
          const tw = Math.min(util, Math.round(t.length * w * 0.8));
          z += `^FO${x0 + m.margem + Math.round((util - tw) / 2)},${y + (l.alt - alt) + Math.round(alt * 0.45)}^GB${tw},2,2^FS\n`;
        }
        y += l.alt + 2;
      }
      const codigo = semAcento(String(p.codigo).replace(/[\x00-\x1f\x7f]+/g, ''));
      const b = barras(codigo, util);
      const txt = Math.max(14, Math.round(m.altura * 0.08));
      const alt = Math.max(20, m.altura - m.margem - y - txt - 6);
      const x = x0 + Math.max(m.margem, Math.round((m.largura - b.largura) / 2));
      z += `^BY${b.modulo},2,${alt}`;
      z += b.ean
        ? `^FO${x},${y + 2}^BEN,${alt},Y,N^FD${codigo.slice(0, 12)}^FS\n`
        : `^FO${x},${y + 2}^BCN,${alt},Y,N,N^FD${limpa(codigo)}^FS\n`;
    });
    z += '^PQ1^XZ\n';
    pecas.push(z);
  }
  return Buffer.from(pecas.join(''), 'latin1');
}

// ------------------------------------------------------------------- EPL
// Fontes residentes (203 dpi): largura da célula e altura em pontos.
const FONTES_EPL = [
  { n: 1, w: 10, h: 12 },
  { n: 2, w: 12, h: 16 },
  { n: 3, w: 14, h: 20 },
  { n: 4, w: 16, h: 24 },
  { n: 5, w: 34, h: 48 },
];

function fonteEpl(alturaDesejada, texto, larguraUtil) {
  let escolhida = FONTES_EPL[0];
  for (const f of FONTES_EPL) if (f.h <= alturaDesejada) escolhida = f;
  // Diminui se o texto não couber na largura.
  while (escolhida.n > 1 && texto.length * escolhida.w > larguraUtil) escolhida = FONTES_EPL[escolhida.n - 2];
  return escolhida;
}

function epl(lista, cfg) {
  const m = medidas(cfg);
  const limpa = (s) => String(s).replace(/["\\]/g, ' ');
  let e = `\nN\nq${m.larguraTotal}\nQ${m.altura},${m.gap}\nR0,0\n`;
  const blocos = [];
  for (const grupo of agrupar(lista, m.colunas)) {
    let b = 'N\n';
    grupo.forEach((p, col) => {
      const x0 = col * (m.largura + m.espaco);
      const util = m.largura - 2 * m.margem;
      let y = m.margem;
      for (const l of conteudo(p, cfg, m)) {
        if (l.logo) { const [c, a] = linhaLogo(l, x0, y, m, util, 'epl'); b += c; y += a + 4; continue; }
        const f = fonteEpl(l.alt, l.texto, util);
        const max = Math.floor(util / f.w);
        const t = l.texto.slice(0, max);
        const x = x0 + m.margem + Math.max(0, Math.round((util - t.length * f.w) / 2));
        b += `A${x},${y},0,${f.n},1,1,N,"${limpa(t)}"\n`;
        if (l.riscado) b += `LO${x},${y + Math.round(f.h / 2)},${t.length * f.w},2\n`;
        y += f.h + 3;
      }
      const codigo = semAcento(String(p.codigo).replace(/[\x00-\x1f\x7f]+/g, ''));
      const bar = barras(codigo, util);
      const alt = Math.max(20, m.altura - m.margem - y - 22);
      const x = x0 + Math.max(m.margem, Math.round((m.largura - bar.largura) / 2));
      b += bar.ean
        ? `B${x},${y + 2},0,E30,${bar.modulo},${bar.modulo * 2},${alt},B,"${codigo.slice(0, 12)}"\n`
        : `B${x},${y + 2},0,1,${bar.modulo},${bar.modulo * 2},${alt},B,"${limpa(codigo)}"\n`;
    });
    b += 'P1\n';
    blocos.push(b);
  }
  e += blocos.join('');
  return Buffer.from(e, 'latin1');
}

// ------------------------------------------------------------------ TSPL
// Fontes internas (203 dpi): largura e altura do caractere em pontos.
const FONTES_TSPL = [
  { n: '1', w: 8, h: 12 },
  { n: '2', w: 12, h: 20 },
  { n: '3', w: 16, h: 24 },
  { n: '4', w: 24, h: 32 },
  { n: '5', w: 32, h: 48 },
];

function fonteTspl(alturaDesejada, texto, larguraUtil) {
  let i = 0;
  FONTES_TSPL.forEach((f, j) => { if (f.h <= alturaDesejada) i = j; });
  while (i > 0 && texto.length * FONTES_TSPL[i].w > larguraUtil) i--;
  return FONTES_TSPL[i];
}

function tspl(lista, cfg) {
  const m = medidas(cfg);
  const limpa = (s) => String(s).replace(/["\\]/g, ' ');
  const mmTotal = (Number(cfg.etiqueta_largura_mm) || 40) * m.colunas + (Number(cfg.etiqueta_espaco_mm) || 0) * (m.colunas - 1);
  const mmAltura = Number(cfg.etiqueta_altura_mm) || 30;
  const mmGap = Number(cfg.etiqueta_gap_mm) || 3;
  let t = `SIZE ${mmTotal} mm,${mmAltura} mm\r\nGAP ${mmGap} mm,0 mm\r\nDIRECTION 1,0\r\nREFERENCE 0,0\r\n`;
  for (const grupo of agrupar(lista, m.colunas)) {
    t += 'CLS\r\n';
    grupo.forEach((p, col) => {
      const x0 = col * (m.largura + m.espaco);
      const util = m.largura - 2 * m.margem;
      let y = m.margem;
      for (const l of conteudo(p, cfg, m)) {
        if (l.logo) { const [c, a] = linhaLogo(l, x0, y, m, util, 'tspl'); t += c; y += a + 4; continue; }
        const f = fonteTspl(l.alt, l.texto, util);
        const tx = l.texto.slice(0, Math.floor(util / f.w));
        const x = x0 + m.margem + Math.max(0, Math.round((util - tx.length * f.w) / 2));
        t += `TEXT ${x},${y},"${f.n}",0,1,1,"${limpa(tx)}"\r\n`;
        if (l.riscado) t += `BAR ${x},${y + Math.round(f.h / 2)},${tx.length * f.w},2\r\n`;
        y += f.h + 3;
      }
      const codigo = semAcento(String(p.codigo).replace(/[\x00-\x1f\x7f]+/g, ''));
      const bar = barras(codigo, util);
      const alt = Math.max(20, m.altura - m.margem - y - 26);
      const x = x0 + Math.max(m.margem, Math.round((m.largura - bar.largura) / 2));
      t += bar.ean
        ? `BARCODE ${x},${y + 2},"EAN13",${alt},1,0,${bar.modulo},${bar.modulo},"${codigo.slice(0, 12)}"\r\n`
        : `BARCODE ${x},${y + 2},"128",${alt},1,0,${bar.modulo},${bar.modulo},"${limpa(codigo)}"\r\n`;
    });
    t += 'PRINT 1,1\r\n';
  }
  return Buffer.from(t, 'latin1');
}

/** Divide a lista de etiquetas em linhas de N colunas. */
function agrupar(lista, colunas) {
  const linhas = [];
  for (let i = 0; i < lista.length; i += colunas) linhas.push(lista.slice(i, i + colunas));
  return linhas;
}

// Marcas que só entendem TSPL: se ficou em ZPL (o padrão), a impressora ignora tudo calada.
const SO_TSPL = /knup|xprinter|gprinter|\btsc\b|hprt|idprt|beeprt|jadens|munbyn|rongta|etiquetadeira|etiquetadora/i;

/** Linguagem que vai de fato para a impressora (corrige ZPL numa impressora que só fala TSPL). */
function linguagem(cfg) {
  const modo = cfg.impressao_etiqueta_modo || 'zpl';
  if (modo === 'zpl' && SO_TSPL.test(cfg.impressora_etiqueta || '')) return 'tspl';
  return modo;
}

/** lista: [{ produto, quantidade }] -> buffer pronto para a impressora */
function gerarEtiquetas(itens, cfg) {
  const lista = itens.flatMap(({ produto, quantidade }) => Array(Math.max(0, quantidade)).fill(produto));
  if (!lista.length) return null;
  const l = linguagem(cfg);
  if (l === 'epl') return epl(lista, cfg);
  if (l === 'tspl') return tspl(lista, cfg);
  return zpl(lista, cfg);
}

module.exports = { linguagem, SO_TSPL, valorParcela, parcelasEtiqueta, gerarEtiquetas, zpl, epl, tspl, medidas };
