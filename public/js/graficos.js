/*
 * Gráficos simples em HTML/SVG (sem bibliotecas): colunas, barras horizontais e rosca.
 * Todo elemento com data-dica mostra uma dica ao passar o mouse.
 */
const Graficos = (() => {
  const { esc } = U;

  /** Colunas verticais de uma série. dados: [{ rotulo, valor, dica, destaque }] */
  function colunas(dados, { altura = 180, formato = U.brl, rotular = 'max' } = {}) {
    if (!dados.length || dados.every((d) => !d.valor)) return '<div class="g-vazio">Sem vendas no período.</div>';
    const max = Math.max(...dados.map((d) => d.valor));
    const iMax = dados.findIndex((d) => d.valor === max);
    const passo = Math.ceil(dados.length / 16); // não lota o eixo de rótulos
    return `<div class="g-colunas" style="--altura:${altura}px">
      <div class="g-grade"><span>${formato(max)}</span><span>${formato(max / 2)}</span><span></span></div>
      <div class="g-barras">${dados.map((d, i) => `
        <div class="g-col ${d.destaque ? 'destaque' : ''}" data-dica="${esc(d.dica || `${d.rotulo}: ${formato(d.valor)}`)}" tabindex="0">
          <div class="g-col-area">
            ${rotular === 'max' && i === iMax && d.valor ? `<em>${formato(d.valor)}</em>` : ''}
            <i style="height:${max ? Math.max(d.valor ? 2 : 0, (d.valor / max) * 100) : 0}%"></i>
          </div>
          <small>${i % passo === 0 || i === dados.length - 1 ? esc(d.rotulo) : ''}</small>
        </div>`).join('')}</div>
    </div>`;
  }

  /** Barras horizontais ordenadas. lista: [{ nome, valor, sub }] */
  function barras(lista, { formato = U.brl, max: limite = 8 } = {}) {
    if (!lista.length) return '<div class="g-vazio">Sem dados no período.</div>';
    const itens = lista.slice(0, limite);
    const resto = lista.slice(limite);
    if (resto.length) itens.push({ nome: `Outras (${resto.length})`, valor: resto.reduce((a, x) => a + x.valor, 0) });
    const max = Math.max(...itens.map((x) => x.valor)) || 1;
    const total = lista.reduce((a, x) => a + x.valor, 0) || 1;
    return `<div class="g-hbarras">${itens.map((x) => `
      <div class="g-hbarra" data-dica="${esc(`${x.nome}: ${formato(x.valor)} (${Math.round((x.valor / total) * 100)}%)${x.sub ? ' · ' + x.sub : ''}`)}">
        <div class="g-hbarra-txt"><span>${esc(x.nome)}</span><b>${formato(x.valor)}</b></div>
        <div class="g-hbarra-trilho"><i style="width:${(x.valor / max) * 100}%"></i></div>
        ${x.sub ? `<small>${esc(x.sub)}</small>` : ''}
      </div>`).join('')}</div>`;
  }

  /** Rosca com legenda. fatias: [{ nome, valor, cor }] (cor fixa por entidade). */
  function rosca(fatias, { formato = U.brl, centro = 'Total' } = {}) {
    const lista = fatias.filter((f) => f.valor > 0);
    if (!lista.length) return '<div class="g-vazio">Sem vendas no período.</div>';
    const total = lista.reduce((a, f) => a + f.valor, 0);
    const r = 42;
    const c = 2 * Math.PI * r;
    const vao = lista.length > 1 ? 1.6 : 0; // 2px de respiro entre as fatias
    let ini = 0;
    const arcos = lista.map((f) => {
      const tam = (f.valor / total) * c;
      const arco = `<circle r="${r}" cx="50" cy="50" fill="none" stroke="${f.cor}" stroke-width="14"
        stroke-dasharray="${Math.max(0.01, tam - vao)} ${c}" stroke-dashoffset="${-ini}"
        data-dica="${esc(`${f.nome}: ${formato(f.valor)} (${Math.round((f.valor / total) * 100)}%)`)}"></circle>`;
      ini += tam;
      return arco;
    }).join('');
    return `<div class="g-rosca">
      <div class="g-rosca-svg">
        <svg viewBox="0 0 100 100" role="img" aria-label="${esc(centro)}"><g transform="rotate(-90 50 50)">${arcos}</g></svg>
        <div class="g-rosca-centro"><small>${esc(centro)}</small><b>${formato(total)}</b></div>
      </div>
      <div class="g-legenda">${lista.map((f) => `
        <div><i style="background:${f.cor}"></i><span>${esc(f.nome)}</span><b>${formato(f.valor)}</b><small>${Math.round((f.valor / total) * 100)}%</small></div>`).join('')}</div>
    </div>`;
  }

  // Dica flutuante única para todos os gráficos.
  let dica;
  function mostrar(ev) {
    const alvo = ev.target.closest('[data-dica]');
    if (!alvo) { if (dica) dica.hidden = true; return; }
    if (!dica) {
      dica = document.createElement('div');
      dica.className = 'g-dica';
      document.body.appendChild(dica);
    }
    dica.textContent = alvo.dataset.dica;
    dica.hidden = false;
    const x = Math.min(window.innerWidth - dica.offsetWidth - 12, ev.clientX + 14);
    dica.style.left = `${x}px`;
    dica.style.top = `${ev.clientY - dica.offsetHeight - 12}px`;
  }
  document.addEventListener('mousemove', mostrar);
  document.addEventListener('focusin', (ev) => {
    const alvo = ev.target.closest && ev.target.closest('[data-dica]');
    if (!alvo) return;
    const b = alvo.getBoundingClientRect();
    mostrar({ target: alvo, clientX: b.left + b.width / 2, clientY: b.top });
  });

  return { colunas, barras, rosca };
})();
