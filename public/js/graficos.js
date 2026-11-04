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

  /**
   * Mapa de calor: linhas × colunas, cor de um só tom (claro = pouco, escuro = muito).
   * celulas: Map("linha|coluna" → { valor, dica }).
   */
  const TONS = ['#f4e8eb', '#e1c2ca', '#c796a2', '#a46676', '#703d4a'];
  function calor(linhas, colunas, celulas, { formato = U.brl } = {}) {
    const valores = [...celulas.values()].map((c) => c.valor).filter((v) => v > 0);
    if (!valores.length) return '<div class="g-vazio">Sem vendas no período.</div>';
    const max = Math.max(...valores);
    const tom = (v) => (v > 0 ? TONS[Math.min(TONS.length - 1, Math.floor((v / max) * TONS.length - 1e-9))] : '');
    return `<div class="g-calor" style="--cols:${colunas.length}">
      <span></span>${colunas.map((c, i) => `<small class="g-calor-col">${i % 2 === 0 ? esc(c.rotulo) : ''}</small>`).join('')}
      ${linhas.map((l) => `<small class="g-calor-lin">${esc(l.rotulo)}</small>${colunas.map((c) => {
    const x = celulas.get(`${l.chave}|${c.chave}`);
    const v = x ? x.valor : 0;
    return `<i class="${v ? '' : 'zero'}" style="${v ? `background:${tom(v)}` : ''}" data-dica="${esc(x ? x.dica : `${l.rotulo}, ${c.rotulo}: sem vendas`)}"></i>`;
  }).join('')}`).join('')}
    </div>
    <div class="g-calor-legenda"><span>menos</span>${TONS.map((t, i) => `<i style="background:${t}" title="até ${formato((max * (i + 1)) / TONS.length)}"></i>`).join('')}<span>mais</span></div>`;
  }

  /**
   * Calendário de calor (um quadradinho por dia, semanas em linhas, segunda a domingo).
   * dias: [{ data: 'AAAA-MM-DD', valor, dica }] em ordem.
   */
  function calendario(dias, { formato = U.brl } = {}) {
    const comValor = dias.filter((d) => d.valor > 0);
    if (!comValor.length) return '<div class="g-vazio">Sem vendas no período.</div>';
    const max = Math.max(...comValor.map((d) => d.valor));
    const tom = (v) => (v > 0 ? TONS[Math.min(TONS.length - 1, Math.floor((v / max) * TONS.length - 1e-9))] : '');
    const hoje = new Date().toLocaleDateString('sv-SE');
    const primeiro = new Date(dias[0].data + 'T12:00');
    const vazio = (primeiro.getDay() + 6) % 7; // segunda = 0
    const melhor = comValor.reduce((a, d) => (d.valor > a.valor ? d : a));
    return `<div class="g-cal">
      ${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => `<small class="g-cal-sem">${d}</small>`).join('')}
      ${'<span></span>'.repeat(vazio)}
      ${dias.map((d, i) => {
    const dia = Number(d.data.slice(8));
    const claro = d.valor && TONS.indexOf(tom(d.valor)) >= 3;
    return `<i class="${d.valor ? '' : 'zero'} ${d.futuro ? 'futuro' : ''} ${d.data === hoje ? 'hoje' : ''} ${d === melhor ? 'melhor' : ''} ${claro ? 'escuro' : ''}"
          style="${d.valor ? `background:${tom(d.valor)};` : ''}--i:${i}" data-dica="${esc(d.dica)}"><b>${dia}</b>${d.valor ? `<em>${formato(d.valor).replace('R$', '').trim().replace(/,\d\d$/, '')}</em>` : ''}</i>`;
  }).join('')}
    </div>
    <div class="g-calor-legenda"><span>menos</span>${TONS.map((t) => `<i style="background:${t}"></i>`).join('')}<span>mais</span></div>`;
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

  return { colunas, barras, rosca, calor, calendario };
})();
