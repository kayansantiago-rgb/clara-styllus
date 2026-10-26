/*
 * Etiqueta personalizada ("Minha etiqueta"): a loja monta a etiqueta no editor (textos, campos da peça,
 * logo, código de barras, linhas…) e ela é desenhada aqui — na tela do editor, na prévia e, ponto por
 * ponto, para a impressora (vai como imagem, então sai igual ao que aparece na tela).
 *
 * Medidas em milímetros; o tamanho da etiqueta vem de Configurações → Impressoras.
 */
const EtiquetaLayout = (() => {
  const FONTES = {
    inter: { nome: 'Moderna', css: 'Inter, Arial, sans-serif' },
    playfair: { nome: 'Elegante', css: '"Playfair Display", Georgia, serif' },
    arial: { nome: 'Simples', css: 'Arial, Helvetica, sans-serif' },
    mono: { nome: 'Máquina', css: '"Courier New", Courier, monospace' },
  };
  const QUANDO = {
    sempre: 'Sempre',
    normal: 'Só sem liquidação',
    liquidacao: 'Só em liquidação (tem preço "De")',
    parcelado: 'Só quando dá para parcelar',
  };
  // Campos que podem ir na etiqueta: {chave} no texto vira o dado da peça.
  const CAMPOS = [
    ['nome', 'Nome da peça'], ['tamanho', 'Tamanho'], ['cor', 'Cor'], ['detalhes', 'Tam · cor · ref'],
    ['preco', 'Preço'], ['preco_de', 'Preço "De" (liquidação)'], ['parcelas', 'Nº de parcelas'], ['parcela', 'Valor da parcela'],
    ['ref', 'Referência'], ['categoria', 'Categoria'], ['codigo', 'Código'], ['loja', 'Nome da loja'],
  ];
  const IMAGENS = { logo: '/img/logo-etiqueta.png', cs: '/img/cs.png' };
  const PT_MM = 25.4 / 72;

  const brl = (c) => 'R$ ' + ((Number(c) || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tamanho = (cfg) => ({ w: Number(cfg.etiqueta_largura_mm) || 40, h: Number(cfg.etiqueta_altura_mm) || 30 });
  const dpmm = (cfg) => (Number(cfg.etiqueta_dpi) || 203) / 25.4;
  let seq = 0;
  const novoId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

  /** Parcelas sem juros da etiqueta (0 = não parcela), igual ao modelo "Parcelado". */
  function parcelas(cfg) {
    const n = Math.min(12, Math.max(2, Number(cfg.etiqueta_parcelas) || 3));
    const aPartir = Number(cfg.juros_a_partir) || 0;
    if (!aPartir) return n;
    return aPartir - 1 >= 2 ? Math.min(n, aPartir - 1) : 0;
  }

  function dados(p, cfg) {
    const n = parcelas(cfg);
    const liq = Number(p.preco_anterior) > Number(p.preco_venda);
    return {
      loja: cfg.loja_nome || 'Clara Styllus',
      nome: p.nome || '', tamanho: p.tamanho || '', cor: p.cor || '', ref: p.referencia || '', categoria: p.categoria || '',
      detalhes: [p.tamanho && `Tam ${p.tamanho}`, p.cor, p.referencia && `Ref ${p.referencia}`].filter(Boolean).join(' · '),
      preco: brl(p.preco_venda), preco_de: liq ? brl(p.preco_anterior) : '',
      parcelas: n >= 2 ? String(n) : '', parcela: n >= 2 ? brl(Math.ceil((Number(p.preco_venda) || 0) / n)) : '',
      codigo: String(p.codigo || ''),
      _liq: liq, _parcela: n >= 2,
    };
  }

  /** Texto final do elemento, ou null se ele não aparece nesta peça. */
  function textoFinal(el, d) {
    if (el.quando === 'liquidacao' && !d._liq) return null;
    if (el.quando === 'normal' && d._liq) return null;
    if (el.quando === 'parcelado' && !d._parcela) return null;
    const campos = String(el.texto || '').match(/\{(\w+)\}/g) || [];
    let vazio = campos.length > 0;
    const t = String(el.texto || '').replace(/\{(\w+)\}/g, (m, k) => {
      if (!(k in d) || k.startsWith('_')) return m;
      if (d[k]) vazio = false;
      return d[k];
    });
    if (vazio || !t.trim()) return null; // só campos e todos vazios (ex.: peça sem cor)
    return el.maiusculas ? t.toUpperCase() : t;
  }

  // ------------------------------------------------------------ modelos prontos
  /** Etiqueta inicial parecida com os modelos fixos, ajustada ao tamanho configurado. */
  function modelo(nome, cfg) {
    const { w: W, h: H } = tamanho(cfg);
    const sy = H / 30;
    const m = 1.5;
    const larg = W - 2 * m;
    const t = (texto, y, h, tam, extra = {}) => ({ id: novoId(), tipo: 'texto', texto, x: m, y: y * sy, w: larg, h: h * sy, tam: tam * Math.min(sy, W / 40 + 0.15), fonte: 'inter', negrito: false, alinhar: 'centro', maiusculas: false, riscado: false, quando: 'sempre', encolher: true, ...extra });
    const logo = { id: novoId(), tipo: 'imagem', src: 'logo', x: (W - 17) / 2, y: 1.2 * sy, w: 17, h: 4.6 * sy };
    const barras = (y) => ({ id: novoId(), tipo: 'barras', x: m + 1, y: y * sy, w: larg - 2, h: H - y * sy - 1.2, numero: true });
    const els = [logo, t('{nome}', 6.2, 3.6, 8.5, { negrito: true })];
    if (nome === 'preco') {
      els.push(t('{detalhes}', 9.6, 2.6, 6));
      els.push(t('{preco}', 12.2, 7.5, 20, { negrito: true, quando: 'normal' }));
      els.push(t('De {preco_de}', 12, 2.8, 6.5, { riscado: true, quando: 'liquidacao' }));
      els.push(t('Por {preco}', 14.6, 5, 15, { negrito: true, quando: 'liquidacao' }));
      els.push(barras(20.2));
    } else if (nome === 'parcelado') {
      els.push(t('{detalhes}', 9.6, 2.6, 6));
      els.push(t('{preco}', 12, 3.2, 8, { negrito: true }));
      els.push(t('{parcelas}x de {parcela}', 15, 4.4, 12.5, { negrito: true, quando: 'parcelado' }));
      els.push(t('sem juros no cartão', 19.2, 2.2, 5.5, { maiusculas: true, quando: 'parcelado' }));
      els.push(barras(21.6));
    } else {
      els.push(t('{detalhes}', 9.8, 2.8, 6.5));
      els.push(t('{preco}', 12.6, 6, 16, { negrito: true, quando: 'normal' }));
      els.push(t('De {preco_de}', 12.4, 2.8, 6.5, { riscado: true, quando: 'liquidacao' }));
      els.push(t('Por {preco}', 15, 4, 13, { negrito: true, quando: 'liquidacao' }));
      els.push(barras(19.4));
    }
    return { v: 1, elementos: els };
  }

  /** Etiqueta salva (ou o modelo padrão, se ainda não foi feita). */
  function ler(cfg) {
    try {
      const l = JSON.parse(cfg.etiqueta_layout || '');
      if (l && Array.isArray(l.elementos)) {
        // Etiquetas feitas antes: "sem juros" passou a ser "sem juros no cartão".
        for (const e of l.elementos) if (e.tipo === 'texto' && /^\s*sem juros\s*$/i.test(e.texto || '')) e.texto = 'sem juros no cartão';
        return l;
      }
    } catch { /* ainda não tem */ }
    return modelo('padrao', cfg);
  }

  /** Elemento novo, no meio da etiqueta. */
  function novo(tipo, cfg, extra = {}) {
    const { w: W, h: H } = tamanho(cfg);
    const base = { id: novoId(), tipo };
    if (tipo === 'texto') Object.assign(base, { texto: 'Texto', w: Math.min(W - 3, 24), h: 4, tam: 9, fonte: 'inter', negrito: false, alinhar: 'centro', maiusculas: false, riscado: false, quando: 'sempre', encolher: true });
    if (tipo === 'imagem') Object.assign(base, { src: 'logo', w: 17, h: 4.6 });
    if (tipo === 'barras') Object.assign(base, { w: W - 5, h: 8, numero: true });
    if (tipo === 'linha') Object.assign(base, { w: W - 6, h: 0.3 });
    if (tipo === 'caixa') Object.assign(base, { w: W - 3, h: H - 3, espessura: 0.3 });
    Object.assign(base, extra);
    base.x = base.x ?? (W - base.w) / 2;
    base.y = base.y ?? (H - base.h) / 2;
    return base;
  }

  // ------------------------------------------------------------ imagens e fontes
  const cache = new Map(); // src -> Promise<canvas|img>
  /** Imagem pronta para desenhar; logo e monograma viram preto (a impressora só imprime preto). */
  function imagem(src) {
    if (cache.has(src)) return cache.get(src);
    const pr = new Promise((ok) => {
      const i = new Image();
      i.onload = () => {
        if (!IMAGENS[src]) return ok(i);
        const c = document.createElement('canvas');
        c.width = i.naturalWidth;
        c.height = i.naturalHeight;
        const x = c.getContext('2d');
        x.drawImage(i, 0, 0);
        x.globalCompositeOperation = 'source-in';
        x.fillStyle = '#000';
        x.fillRect(0, 0, c.width, c.height);
        ok(c);
      };
      i.onerror = () => ok(null);
      i.src = IMAGENS[src] || src;
    });
    pr.then((v) => { pr.valor = v; });
    cache.set(src, pr);
    return pr;
  }

  /** Carrega as imagens e fontes usadas antes de desenhar (o desenho em si é instantâneo). */
  async function pronto(layout) {
    const usadas = new Set(layout.elementos.filter((e) => e.tipo === 'texto').map((e) => `${e.negrito ? 700 : 400} 20px ${(FONTES[e.fonte] || FONTES.inter).css}`));
    usadas.add('700 20px Inter, Arial, sans-serif');
    await Promise.all([
      ...[...usadas].map((f) => document.fonts.load(f).catch(() => {})),
      ...layout.elementos.filter((e) => e.tipo === 'imagem').map((e) => imagem(e.src)),
    ]);
  }

  // ------------------------------------------------------------ desenho
  /**
   * Desenha a etiqueta no canvas (já com o tamanho W*pxmm x H*pxmm).
   * `pxmm`: pixels por mm do canvas; o código de barras usa a largura de barra que a impressora vai usar.
   */
  function desenhar(ctx, layout, produto, cfg, pxmm) {
    const { w: W, h: H } = tamanho(cfg);
    const d = dados(produto, cfg);
    const pd = dpmm(cfg); // pontos da impressora por mm
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W * pxmm, H * pxmm);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    for (const el of layout.elementos) {
      const x = el.x * pxmm;
      const y = el.y * pxmm;
      const w = el.w * pxmm;
      const h = el.h * pxmm;
      if (el.tipo === 'texto') {
        const t = textoFinal(el, d);
        if (t === null) continue;
        const familia = (FONTES[el.fonte] || FONTES.inter).css;
        const linhas = t.split('\n');
        let px = (Number(el.tam) || 9) * PT_MM * pxmm;
        const fonte = (tam) => `${el.negrito ? 700 : 400} ${tam}px ${familia}`;
        ctx.font = fonte(px);
        if (el.encolher !== false) {
          const maior = Math.max(...linhas.map((l) => ctx.measureText(l).width));
          if (maior > w) px = Math.max(px * 0.35, (px * w) / maior);
          const alturaTotal = linhas.length * px * 1.15;
          if (alturaTotal > h * 1.25) px = Math.max(px * 0.35, (px * h * 1.25) / alturaTotal);
        }
        ctx.font = fonte(px);
        ctx.textBaseline = 'middle';
        ctx.textAlign = el.alinhar === 'esquerda' ? 'left' : el.alinhar === 'direita' ? 'right' : 'center';
        const ax = el.alinhar === 'esquerda' ? x : el.alinhar === 'direita' ? x + w : x + w / 2;
        const lh = px * 1.15;
        const y0 = y + (h - linhas.length * lh) / 2;
        linhas.forEach((l, i) => {
          const cy = y0 + lh * (i + 0.5);
          ctx.fillText(l, ax, cy);
          if (el.riscado) {
            const lw = ctx.measureText(l).width;
            const sx = ctx.textAlign === 'left' ? ax : ctx.textAlign === 'right' ? ax - lw : ax - lw / 2;
            ctx.fillRect(sx, cy - Math.max(1, px * 0.04), lw, Math.max(1, px * 0.08));
          }
        });
      } else if (el.tipo === 'imagem') {
        const img = imagem(el.src).valor;
        if (!img) continue;
        const iw = img.width || img.naturalWidth;
        const ih = img.height || img.naturalHeight;
        const f = Math.min(w / iw, h / ih);
        ctx.drawImage(img, x + (w - iw * f) / 2, y + (h - ih * f) / 2, iw * f, ih * f);
      } else if (el.tipo === 'barras') {
        const mods = window.CodigoBarras.modulos(d.codigo);
        if (!mods.length) continue;
        const modPontos = Math.max(1, Math.floor((el.w * pd) / mods.length)); // barra inteira na impressora
        const mod = (modPontos * pxmm) / pd;
        const numH = el.numero ? Math.min(h * 0.32, 2.8 * pxmm) : 0;
        const bw = mod * mods.length;
        const bx = x + (w - bw) / 2;
        const bh = Math.max(1, h - numH);
        for (let i = 0; i < mods.length;) {
          if (mods[i] === '1') {
            let n = 1;
            while (mods[i + n] === '1') n++;
            ctx.fillRect(bx + i * mod, y, n * mod, bh);
            i += n;
          } else i++;
        }
        if (el.numero) {
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.font = `600 ${numH * 0.82}px Inter, Arial, sans-serif`;
          ctx.fillText(d.codigo, x + w / 2, y + bh + numH * 0.55, w);
        }
      } else if (el.tipo === 'linha') {
        ctx.fillRect(x, y, w, Math.max(1, h));
      } else if (el.tipo === 'caixa') {
        const esp = Math.max(1, (Number(el.espessura) || 0.3) * pxmm);
        ctx.lineWidth = esp;
        ctx.strokeRect(x + esp / 2, y + esp / 2, w - esp, h - esp);
      }
    }
    ctx.restore();
  }

  /** Canvas da etiqueta para a tela (pxmm pixels por mm). */
  function canvas(layout, produto, cfg, pxmm = 12) {
    const { w, h } = tamanho(cfg);
    const c = document.createElement('canvas');
    c.width = Math.round(w * pxmm);
    c.height = Math.round(h * pxmm);
    desenhar(c.getContext('2d'), layout, produto, cfg, pxmm);
    return c;
  }

  /** Pontos pretos e brancos no tamanho exato da impressora: { l: bytes por linha, h, d: base64 } (1 = preto). */
  function bitmap(layout, produto, cfg) {
    const pd = dpmm(cfg);
    const { w, h } = tamanho(cfg);
    const W = Math.round(w * pd);
    const Hh = Math.round(h * pd);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = Hh;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    desenhar(ctx, layout, produto, cfg, pd);
    const px = ctx.getImageData(0, 0, W, Hh).data;
    const l = Math.ceil(W / 8);
    const bits = new Uint8Array(l * Hh);
    for (let y = 0; y < Hh; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] < 150) bits[y * l + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    let bin = '';
    for (let i = 0; i < bits.length; i += 8192) bin += String.fromCharCode(...bits.subarray(i, i + 8192));
    return { l, h: Hh, d: btoa(bin) };
  }

  /** Mesma etiqueta em preto e branco puro, como a impressora vai imprimir (para conferir na tela). */
  function canvasImpressora(layout, produto, cfg) {
    const b = bitmap(layout, produto, cfg);
    const bin = atob(b.d);
    const c = document.createElement('canvas');
    c.width = Math.round(tamanho(cfg).w * dpmm(cfg));
    c.height = b.h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(c.width, c.height);
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < c.width; x++) {
        const preto = bin.charCodeAt(y * b.l + (x >> 3)) & (0x80 >> (x & 7));
        const i = (y * c.width + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = preto ? 0 : 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  const ativo = (cfg) => cfg.etiqueta_modelo === 'personalizado';

  return { FONTES, QUANDO, CAMPOS, modelo, ler, novo, pronto, desenhar, canvas, bitmap, canvasImpressora, tamanho, dados, textoFinal, ativo, imagem };
})();
