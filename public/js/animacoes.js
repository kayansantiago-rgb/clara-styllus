/* Animações: entrada das telas, números que "sobem" e confete. Respeita "reduzir movimento" do Windows. */
const Animacoes = (() => {
  const reduzir = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Entrada suave da tela (os blocos sobem um pouco, um depois do outro). */
  function entrarTela(el) {
    if (reduzir()) return;
    el.classList.remove('entrando');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('entrando');
    clearTimeout(el._entrando);
    // Tira a classe depois: transform deixa de existir e não atrapalha elementos fixos/fixados.
    el._entrando = setTimeout(() => el.classList.remove('entrando'), 800);
  }

  const brl = (c) => U.brl(c);
  /** Lê "R$ 1.234,56" (em centavos) ou "123" (inteiro). Outros textos não são animados. */
  function ler(txt) {
    const t = txt.trim();
    let m = /^R\$\s?(-?[\d.]+,\d{2})$/.exec(t);
    if (m) return { valor: Math.round(Number(m[1].replace(/\./g, '').replace(',', '.')) * 100), fmt: brl };
    m = /^-?\d{1,3}(\.\d{3})*$|^-?\d+$/.exec(t);
    if (m) return { valor: Number(t.replace(/\./g, '')), fmt: (n) => Math.round(n).toLocaleString('pt-BR') };
    return null;
  }

  /** Números dos cartões (KPIs) contando de 0 até o valor. */
  function contar(raiz, seletor = '.vd-kpi > b, [data-contar]') {
    if (reduzir()) return;
    const alvos = [...raiz.querySelectorAll(seletor)]
      .filter((el) => el.children.length === 0)
      .map((el) => ({ el, info: ler(el.textContent), final: el.textContent }))
      .filter((x) => x.info && x.info.valor !== 0);
    if (!alvos.length) return;
    const dur = 750;
    const ini = performance.now();
    const passo = (agora) => {
      const p = Math.min(1, (agora - ini) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      for (const a of alvos) {
        if (!a.el.isConnected) continue;
        a.el.textContent = p >= 1 ? a.final : a.info.fmt(Math.round(a.info.valor * e));
      }
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  /** Chuva de confete por cima da tela (some sozinha). */
  function confete({ duracao = 3800, quantidade = 170 } = {}) {
    if (reduzir()) return;
    const cv = document.createElement('canvas');
    cv.className = 'confete';
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    const cores = ['#a14d6f', '#d07ca0', '#f3c5d8', '#e9c46a', '#f6dd9b', '#ffffff', '#7c3554'];
    const pecas = Array.from({ length: quantidade }, (_, i) => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.35 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 15 - 5,
      g: 0.32 + Math.random() * 0.12,
      w: 6 + Math.random() * 7,
      h: 8 + Math.random() * 10,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      cor: cores[i % cores.length],
      forma: Math.random() < 0.3 ? 'bola' : 'fita',
    }));
    const ini = performance.now();
    const quadro = (agora) => {
      const t = agora - ini;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = t > duracao - 700 ? Math.max(0, (duracao - t) / 700) : 1;
      for (const p of pecas) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.cor;
        if (p.forma === 'bola') {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.scale(1, Math.cos(p.r * 2)); // "gira" no ar
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      if (t < duracao) requestAnimationFrame(quadro);
      else cv.remove();
    };
    requestAnimationFrame(quadro);
  }

  return { entrarTela, contar, confete, reduzir };
})();
