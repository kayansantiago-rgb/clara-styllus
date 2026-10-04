'use strict';

/**
 * Etiquetas em linguagem de impressora térmica:
 *  - ZPL: Zebra, Elgin L42 Pro, Argox (modo ZPL), Tanca, Gainscha…
 *  - EPL: Zebra LP/TLP, Elgin L42, Argox em PPLB (compatível com EPL2).
 * Suporta rolo com 1 ou mais colunas (etiquetas lado a lado).
 */

const { semAcento } = require('./escpos');

const ean13Valido = (c) => {
  if (!/^\d{13}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(c[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10 === Number(c[12]);
};

const preco = (c) => 'R$ ' + ((Number(c) || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  if (cfg.etiqueta_mostrar_loja === '1') linhas.push({ texto: cfg.loja_nome || 'Clara Styllus', alt: 0.1 * h });
  linhas.push({ texto: p.nome, alt: 0.11 * h });
  if (det) linhas.push({ texto: det, alt: 0.085 * h });
  if (cfg.etiqueta_mostrar_preco === '1') linhas.push({ texto: preco(p.preco_venda), alt: 0.17 * h });
  return linhas.map((l) => ({ ...l, texto: semAcento(l.texto).toUpperCase(), alt: Math.max(12, Math.round(l.alt)) }));
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
        // Fonte A0 tem ~0,8 da largura por caractere: diminui (ou corta) para caber em uma linha.
        let alt = l.alt;
        while (alt > 14 && l.texto.length * alt * 0.75 * 0.8 > util) alt--;
        const w = Math.round(alt * 0.75);
        const max = Math.floor(util / (w * 0.8));
        z += `^FO${x0 + m.margem},${y + (l.alt - alt)}^A0N,${alt},${w}^FB${util},1,0,C,0^FD${limpa(l.texto.slice(0, max))}^FS\n`;
        y += l.alt + 2;
      }
      const codigo = semAcento(p.codigo);
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
        const f = fonteEpl(l.alt, l.texto, util);
        const max = Math.floor(util / f.w);
        const t = l.texto.slice(0, max);
        const x = x0 + m.margem + Math.max(0, Math.round((util - t.length * f.w) / 2));
        b += `A${x},${y},0,${f.n},1,1,N,"${limpa(t)}"\n`;
        y += f.h + 3;
      }
      const codigo = semAcento(p.codigo);
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

/** Divide a lista de etiquetas em linhas de N colunas. */
function agrupar(lista, colunas) {
  const linhas = [];
  for (let i = 0; i < lista.length; i += colunas) linhas.push(lista.slice(i, i + colunas));
  return linhas;
}

/** lista: [{ produto, quantidade }] -> buffer pronto para a impressora */
function gerarEtiquetas(itens, cfg) {
  const lista = itens.flatMap(({ produto, quantidade }) => Array(Math.max(0, quantidade)).fill(produto));
  if (!lista.length) return null;
  return cfg.impressao_etiqueta_modo === 'epl' ? epl(lista, cfg) : zpl(lista, cfg);
}

module.exports = { gerarEtiquetas, zpl, epl, medidas };
