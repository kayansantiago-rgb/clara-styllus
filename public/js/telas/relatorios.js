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
        <div class="card"><small>Taxas das maquininhas</small><b class="${t.taxas ? 'txt-perigo' : ''}">− ${brl(t.taxas)}</b></div>
        <div class="card destaque"><small>Lucro real (depois de tudo)</small><b class="${t.lucro_real < 0 ? 'txt-perigo' : ''}">${brl(t.lucro_real)}</b></div>
      </div>
      <div class="duas-colunas">
        <div class="cartao dre">
          <h3>💰 Lucro real do período</h3>
          <div class="linha"><span>Vendas</span><b>${brl(t.faturamento)}</b></div>
          <div class="linha"><span>(−) Trocas/devoluções em vale</span><span class="txt-perigo">− ${brl(t.trocas)}</span></div>
          <div class="linha"><span>(−) Custo das peças vendidas</span><span class="txt-perigo">− ${brl(t.custo - t.custo_trocas)}</span></div>
          <div class="linha"><span>(−) Taxas das maquininhas</span><span class="txt-perigo">− ${brl(t.taxas)}</span></div>
          <div class="linha"><span>(−) Despesas da loja</span><span class="txt-perigo">− ${brl(t.despesas)}</span></div>
          <div class="linha total"><span>= Lucro real</span><b class="${t.lucro_real < 0 ? 'txt-perigo' : 'txt-ok'}">${brl(t.lucro_real)}</b></div>
          ${t.faturamento ? `<p class="dica">Margem real: <b>${((t.lucro_real / t.faturamento) * 100).toFixed(1).replace('.', ',')}%</b> das vendas.</p>` : ''}
        </div>
        <div class="cartao">
          <div class="cabecalho-cartao"><h3>🧾 Despesas</h3><button class="btn btn-peq btn-primario" id="nova-despesa">+ Lançar despesa</button></div>
          ${r.despesas_por_categoria.map((d) => `<div class="linha"><span>${esc(d.categoria)}</span><span>${brl(d.valor)}</span></div>`).join('') || '<div class="vazio">Nenhuma despesa lançada no período.</div>'}
          <details id="det-despesas"><summary>Ver lançamentos</summary><div id="lista-despesas">Carregando…</div></details>
        </div>
      </div>
      <div class="cartao">
        <h3>💳 Maquininhas: quanto realmente cai na conta</h3>
        ${r.taxas.linhas.length ? `
        <table class="tabela">
          <thead><tr><th>Forma</th><th>Origem</th><th class="r">Taxa</th><th class="r">Valor vendido</th><th class="r">Taxa (R$)</th><th class="r">Líquido</th></tr></thead>
          <tbody>${r.taxas.linhas.map((l) => `<tr>
            <td>${U.FORMAS[l.forma] || l.forma}${l.forma === 'credito' ? (l.parcelas > 1 ? ` ${l.parcelas}x` : ' à vista') : ''}</td>
            <td><small>${l.origem === 'crediario' ? 'recebimento do crediário' : 'vendas'}</small></td>
            <td class="r">${l.percentual ? l.percentual.toLocaleString('pt-BR') + '%' : '<small>sem taxa</small>'}</td>
            <td class="r">${brl(l.bruto)}</td><td class="r txt-perigo">− ${brl(l.taxa)}</td><td class="r"><b>${brl(l.liquido)}</b></td></tr>`).join('')}</tbody>
          <tfoot><tr><th colspan="3">Total</th><th class="r">${brl(r.taxas.bruto)}</th><th class="r txt-perigo">− ${brl(r.taxas.total)}</th><th class="r">${brl(r.taxas.bruto - r.taxas.total)}</th></tr></tfoot>
        </table>
        ${r.taxas.total ? '' : '<p class="dica">Cadastre as taxas da sua maquininha em <a href="#/config">Configurações → Taxas das maquininhas</a>.</p>'}`
    : '<div class="vazio">Nenhuma venda em cartão ou PIX no período.</div>'}
      </div>
      <div class="cards">
        <div class="card"><small>Crediário: recebido no período</small><b>${brl(r.crediario.recebido)}</b></div>
        <div class="card"><small>Crediário: total a receber</small><b>${brl(r.crediario.a_receber)}</b></div>
        <div class="card"><small>Crediário: vencido</small><b class="${r.crediario.vencido ? 'txt-perigo' : ''}">${brl(r.crediario.vencido)}</b></div>
        <div class="card"><small>Clientes em atraso</small><b>${r.crediario.clientes_atraso}</b></div>
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
    ligarDespesas();
  }

  /** Liga os botões de despesas depois que o relatório é desenhado. */
  function ligarDespesas() {
    const de = raiz.querySelector('#de').value;
    const ate = raiz.querySelector('#ate').value;
    const lista = raiz.querySelector('#lista-despesas');
    raiz.querySelector('#det-despesas').addEventListener('toggle', async (ev) => {
      if (!ev.target.open) return;
      try {
        const ds = await api(`/api/despesas?de=${de}&ate=${ate}`);
        lista.innerHTML = ds.map((d) => `<div class="linha"><span>${d.data.split('-').reverse().join('/')} · ${esc(d.descricao)}
          <small>${esc(d.categoria || '')}</small></span><span>${brl(d.valor)} <button class="mini perigo" data-del="${d.id}" title="Apagar">×</button></span></div>`).join('')
          || '<div class="vazio">Nenhuma.</div>';
      } catch (e) { erro(e); }
    });
    lista.onclick = async (ev) => {
      const b = ev.target.closest('[data-del]');
      if (!b || !(await U.confirmar('Apagar despesa', 'Apagar este lançamento?', { ok: 'Apagar', perigo: true }))) return;
      try { await api(`/api/despesas/${b.dataset.del}`, { metodo: 'DELETE' }); carregar(); } catch (e) { erro(e); }
    };
    raiz.querySelector('#nova-despesa').onclick = () => {
      const corpo = U.abrirModal('Lançar despesa', `
        <form class="form grade-form">
          <label class="col2">Descrição<input name="descricao" required autofocus placeholder="Ex.: Aluguel, luz, internet, embalagens"></label>
          <label>Categoria<input name="categoria" list="cat-despesas" placeholder="Ex.: Aluguel">
            <datalist id="cat-despesas">${['Aluguel', 'Energia', 'Água', 'Internet/telefone', 'Funcionários', 'Contador', 'Embalagens', 'Marketing', 'Impostos', 'Outras']
    .map((c) => `<option value="${c}">`).join('')}</datalist></label>
          <label>Valor (R$)<input name="valor" inputmode="decimal" required></label>
          <label>Data<input type="date" name="data" value="${U.hoje()}" required></label>
          <label>Repetir todo mês por<select name="repetir">${[1, 2, 3, 6, 12].map((n) => `<option value="${n}">${n === 1 ? 'não repetir' : `${n} meses`}</option>`).join('')}</select></label>
          <div class="acoes col2"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">Lançar</button></div>
        </form>`, { largura: '560px' });
      corpo.querySelector('form').onsubmit = async (ev) => {
        ev.preventDefault();
        const d = U.dadosForm(ev.target);
        const valor = U.paraCentavos(d.valor);
        if (!(valor > 0)) return U.aviso('Valor inválido.', 'erro');
        try {
          const r = await api('/api/despesas', { metodo: 'POST', corpo: { ...d, valor, repetir: Number(d.repetir) } });
          U.fecharModal();
          U.aviso(r.lancadas > 1 ? `${r.lancadas} despesas lançadas (uma por mês).` : 'Despesa lançada.');
          carregar();
        } catch (e) { erro(e); }
      };
    };
  }

  return { abrir, sair: () => { raiz = null; } };
})();
