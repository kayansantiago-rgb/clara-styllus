/* Relatórios de vendas por período. */
Telas.relatorios = (() => {
  const { esc, brl, api, erro } = U;
  let raiz;

  function inicioMes() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE');
  }

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <h1>Relatórios</h1>
        <div class="ferramentas">
          <label>De <input type="date" id="de" value="${inicioMes()}"></label>
          <label>Até <input type="date" id="ate" value="${U.hoje()}"></label>
          <button class="btn" data-p="hoje">Hoje</button>
          <button class="btn" data-p="7">7 dias</button>
          <button class="btn" data-p="mes">Este mês</button>
        </div>
      </div>
      <div id="rel"></div>`;
    raiz.querySelector('#de').onchange = carregar;
    raiz.querySelector('#ate').onchange = carregar;
    raiz.querySelector('.ferramentas').addEventListener('click', (ev) => {
      const p = ev.target.dataset.p;
      if (!p) return;
      const hoje = U.hoje();
      raiz.querySelector('#ate').value = hoje;
      raiz.querySelector('#de').value = p === 'hoje' ? hoje : p === 'mes' ? inicioMes()
        : new Date(Date.now() - 6 * 864e5).toLocaleDateString('sv-SE');
      carregar();
    });
    await carregar();
  }

  async function carregar() {
    let r;
    let baixo;
    try {
      [r, baixo] = await Promise.all([
        api(`/api/relatorios?de=${raiz.querySelector('#de').value}&ate=${raiz.querySelector('#ate').value}`),
        api('/api/produtos?estoque_baixo=1&limite=50'),
      ]);
    } catch (e) { return erro(e); }
    const t = r.totais;
    const maxDia = Math.max(1, ...r.por_dia.map((d) => d.faturamento));
    const totalFormas = r.formas.reduce((a, f) => a + f.valor, 0) || 1;
    raiz.querySelector('#rel').innerHTML = `
      <div class="cards">
        <div class="card"><small>Faturamento</small><b>${brl(t.faturamento)}</b></div>
        <div class="card"><small>Vendas</small><b>${t.vendas}</b></div>
        <div class="card"><small>Peças vendidas</small><b>${t.pecas}</b></div>
        <div class="card"><small>Ticket médio</small><b>${brl(t.ticket_medio)}</b></div>
        <div class="card"><small>Descontos dados</small><b>${brl(t.descontos)}</b></div>
        <div class="card"><small>Lucro bruto (venda − custo)</small><b>${brl(t.lucro_bruto)}</b></div>
      </div>
      <div class="duas-colunas">
        <div class="cartao">
          <h3>Vendas por dia</h3>
          ${r.por_dia.map((d) => `
            <div class="barra-linha"><span>${d.dia.split('-').reverse().slice(0, 2).join('/')}</span>
              <div class="barra"><i style="width:${(d.faturamento / maxDia) * 100}%"></i></div>
              <span class="r">${brl(d.faturamento)}</span></div>`).join('') || '<div class="vazio">Sem vendas.</div>'}
        </div>
        <div class="cartao">
          <h3>Formas de pagamento</h3>
          ${r.formas.map((f) => `
            <div class="barra-linha"><span>${U.FORMAS[f.forma] || f.forma}</span>
              <div class="barra"><i style="width:${(f.valor / totalFormas) * 100}%"></i></div>
              <span class="r">${brl(f.valor)}</span></div>`).join('') || '<div class="vazio">Sem vendas.</div>'}
          <h3>Por vendedor(a)</h3>
          ${r.por_vendedor.map((v) => `<div class="linha"><span>${esc(v.vendedor)} (${v.vendas})</span><b>${brl(v.total)}</b></div>`).join('') || '<div class="vazio">—</div>'}
        </div>
      </div>
      <div class="duas-colunas">
        <div class="cartao">
          <h3>Mais vendidos</h3>
          <table class="tabela"><thead><tr><th>Produto</th><th class="r">Qtd</th><th class="r">Total</th></tr></thead>
          <tbody>${r.top_produtos.map((p) => `<tr><td>${esc(p.nome)} ${esc([p.tamanho, p.cor].filter(Boolean).join(' · '))}</td>
            <td class="r">${p.quantidade}</td><td class="r">${brl(p.total)}</td></tr>`).join('') || '<tr><td class="vazio" colspan="3">—</td></tr>'}</tbody></table>
        </div>
        <div class="cartao">
          <h3>Estoque baixo (repor)</h3>
          <table class="tabela"><thead><tr><th>Produto</th><th class="r">Estoque</th><th class="r">Mínimo</th></tr></thead>
          <tbody>${baixo.map((p) => `<tr><td>${esc(p.nome)} ${esc([p.tamanho, p.cor].filter(Boolean).join(' · '))}</td>
            <td class="r txt-perigo">${p.estoque}</td><td class="r">${p.estoque_minimo}</td></tr>`).join('') || '<tr><td class="vazio" colspan="3">Tudo certo.</td></tr>'}</tbody></table>
        </div>
      </div>`;
  }

  return { abrir, sair: () => { raiz = null; } };
})();
