/*
 * Tira o fundo da foto da peça e coloca num fundo no visual da loja (rosa, branco ou creme), com uma
 * sombra suave embaixo. Roda no próprio computador, sem internet: modelo U²-Net pequeno (u2netp)
 * no ONNX Runtime Web. O motor (≈11 MB) só é carregado na primeira foto.
 */
const TirarFundo = (() => {
  const LADO = 320; // entrada do modelo
  const SAIDA = [900, 1200]; // foto final, 3 × 4
  const FUNDOS = {
    rosa: { nome: 'Rosa da loja', cores: ['#fbf4f7', '#f1dde6'] },
    branco: { nome: 'Branco', cores: ['#ffffff', '#ffffff'] },
    creme: { nome: 'Creme', cores: ['#faf6f0', '#efe5d8'] },
  };

  let sessao = null;
  function carregarScript(src) {
    return new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => falha(new Error('Não consegui carregar o recorte de fundo.'));
      document.head.appendChild(s);
    });
  }
  async function motor() {
    if (!sessao) {
      sessao = (async () => {
        if (!window.ort) await carregarScript('/vendor/onnxruntime/ort.wasm.min.js');
        ort.env.wasm.wasmPaths = '/vendor/onnxruntime/';
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        return ort.InferenceSession.create('/vendor/modelos/u2netp.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      })();
      sessao.catch(() => { sessao = null; });
    }
    return sessao;
  }

  const abrirImagem = (fonte) => new Promise((ok, falha) => {
    const img = new Image();
    const url = typeof fonte === 'string' ? fonte : URL.createObjectURL(fonte);
    img.onload = () => { if (typeof fonte !== 'string') URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => falha(new Error('Não consegui abrir a foto.'));
    img.src = url;
  });

  /** Máscara do modelo (0..1, LADO × LADO). */
  async function prever(img) {
    const s = await motor();
    const c = document.createElement('canvas');
    c.width = LADO;
    c.height = LADO;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, LADO, LADO);
    const px = ctx.getImageData(0, 0, LADO, LADO).data;
    const n = LADO * LADO;
    const entrada = new Float32Array(3 * n);
    const media = [0.485, 0.456, 0.406];
    const dp = [0.229, 0.224, 0.225];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) entrada[k * n + i] = (px[i * 4 + k] / 255 - media[k]) / dp[k];
    }
    const saida = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', entrada, [1, 3, LADO, LADO]) });
    const m = saida[s.outputNames[0]].data;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) { if (m[i] < min) min = m[i]; if (m[i] > max) max = m[i]; }
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) r[i] = (m[i] - min) / (max - min + 1e-8);
    return r;
  }

  /**
   * Acerta a máscara: buracos fechados dentro da peça (listras brancas, estampa clara) viram peça;
   * o miolo fica sólido e só a borda fica suave.
   */
  function acertar(m) {
    const n = LADO * LADO;
    const fundo = new Uint8Array(n);
    for (let i = 0; i < n; i++) fundo[i] = m[i] < 0.25 ? 1 : 0;
    const rotulo = new Int32Array(n);
    const fila = new Int32Array(n);
    let objeto = 0;
    for (let i = 0; i < n; i++) objeto += 1 - fundo[i];
    const peca = new Uint8Array(n);
    for (let i = 0; i < n; i++) peca[i] = 1 - fundo[i];
    let id = 0;
    for (let i = 0; i < n; i++) {
      if (!fundo[i] || rotulo[i]) continue;
      id++;
      let ini = 0;
      let fim = 0;
      fila[fim++] = i;
      rotulo[i] = id;
      let borda = false;
      while (ini < fim) {
        const p = fila[ini++];
        const y = (p / LADO) | 0;
        const x = p - y * LADO;
        if (x === 0 || y === 0 || x === LADO - 1 || y === LADO - 1) borda = true;
        const viz = [x > 0 ? p - 1 : -1, x < LADO - 1 ? p + 1 : -1, y > 0 ? p - LADO : -1, y < LADO - 1 ? p + LADO : -1];
        for (const q of viz) if (q >= 0 && fundo[q] && !rotulo[q]) { rotulo[q] = id; fila[fim++] = q; }
      }
      // Buraco fechado e pequeno perto da peça: faz parte dela.
      if (!borda && fim < 0.15 * objeto) for (let k = 0; k < fim; k++) peca[fila[k]] = 1;
    }
    // Miolo = peça sem 2 px de borda.
    let miolo = peca;
    for (let passo = 0; passo < 2; passo++) {
      const e = new Uint8Array(n);
      for (let y = 1; y < LADO - 1; y++) {
        for (let x = 1; x < LADO - 1; x++) {
          const p = y * LADO + x;
          e[p] = miolo[p] & miolo[p - 1] & miolo[p + 1] & miolo[p - LADO] & miolo[p + LADO];
        }
      }
      miolo = e;
    }
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) r[i] = miolo[i] ? 1 : Math.min(1, Math.max(0, (m[i] - 0.1) / 0.5));
    return r;
  }

  /**
   * Recorta a peça. Devolve { recorte } (canvas só com a peça, fundo transparente, já cortado
   * em volta dela) para montar com qualquer fundo em `montar`.
   */
  async function recortar(fonte) {
    const img = await abrirImagem(fonte);
    const alfa = acertar(await prever(img));
    // Caixa em volta da peça (na escala do modelo).
    let x0 = LADO;
    let y0 = LADO;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < LADO; y++) {
      for (let x = 0; x < LADO; x++) {
        if (alfa[y * LADO + x] > 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0 || (x1 - x0) * (y1 - y0) < LADO * LADO * 0.02) throw new Error('Não encontrei a peça na foto. Tente com a roupa mais perto, ocupando a foto.');
    // Máscara como imagem (alfa), ampliada para o tamanho da foto.
    const mc = document.createElement('canvas');
    mc.width = LADO;
    mc.height = LADO;
    const mctx = mc.getContext('2d');
    const md = mctx.createImageData(LADO, LADO);
    for (let i = 0; i < LADO * LADO; i++) { md.data[i * 4 + 3] = Math.round(alfa[i] * 255); }
    mctx.putImageData(md, 0, 0);
    const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
    const W = Math.round(img.width * escala);
    const H = Math.round(img.height * escala);
    const sx = W / LADO;
    const sy = H / LADO;
    const folga = 2;
    const cx = Math.max(0, Math.floor((x0 - folga) * sx));
    const cy = Math.max(0, Math.floor((y0 - folga) * sy));
    const cw = Math.min(W, Math.ceil((x1 + 1 + folga) * sx)) - cx;
    const ch = Math.min(H, Math.ceil((y1 + 1 + folga) * sy)) - cy;
    const recorte = document.createElement('canvas');
    recorte.width = cw;
    recorte.height = ch;
    const rctx = recorte.getContext('2d');
    rctx.drawImage(img, -cx, -cy, W, H);
    rctx.globalCompositeOperation = 'destination-in';
    rctx.imageSmoothingQuality = 'high';
    rctx.drawImage(mc, -cx, -cy, W, H);
    return { recorte };
  }

  /** Monta a foto final (900 × 1200) com o fundo escolhido. Devolve data URL JPEG. */
  function montar({ recorte }, estilo = 'rosa') {
    const [W, H] = SAIDA;
    const f = FUNDOS[estilo] || FUNDOS.rosa;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, f.cores[0]);
    g.addColorStop(1, f.cores[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const k = Math.min((W * 0.84) / recorte.width, (H * 0.84) / recorte.height);
    const w = recorte.width * k;
    const h = recorte.height * k;
    const x = (W - w) / 2;
    const y = (H - h) / 2 + H * 0.01;
    // Sombra: a própria silhueta, escura e borrada, um pouco abaixo.
    const sombra = document.createElement('canvas');
    sombra.width = recorte.width;
    sombra.height = recorte.height;
    const sctx = sombra.getContext('2d');
    sctx.drawImage(recorte, 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = estilo === 'rosa' ? '#5a2840' : '#3a3030';
    sctx.fillRect(0, 0, sombra.width, sombra.height);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.filter = 'blur(16px)';
    ctx.drawImage(sombra, x + w * 0.015, y + h * 0.02, w, h);
    ctx.restore();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(recorte, x, y, w, h);
    return c.toDataURL('image/jpeg', 0.86);
  }

  /** Atalho: recorta e monta de uma vez. */
  async function processar(fonte, estilo) {
    return montar(await recortar(fonte), estilo);
  }

  return { recortar, montar, processar, motor, FUNDOS };
})();
