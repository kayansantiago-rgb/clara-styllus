/* Relatórios de vendas por período. */
Telas.relatorios = (() => {
  const { esc, brl, api, erro } = U;
  let raiz;

  function inicioMes() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE');
  }

  const PERIODOS = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Este mês'], ['passado', 'Mês passado'], ['outro', 'Escolher datas']];
  const COR_FORMA = { dinheiro: '#2a78d6', pix: '#eb6834', debito: '#1baf7a', credito: '#eda100', crediario: '#e87ba4', vale: '#008300', outro: '#4a3aa7' };
  const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let periodo = 'mes';

  function intervalo(p) {
    const h = new Date();
    const iso = (d) => d.toLocaleDateString('sv-SE');
    if (p === 'hoje') return [iso(h), iso(h)];
    if (p === '7d') return [iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 6)), iso(h)];
    if (p === 'passado') return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))];
    return [inicioMes(), iso(h)];
  }

  async function abrir(el) {
    raiz = el;
    const [de, ate] = intervalo(periodo);
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Relatórios</h1><p class="subtitulo">Como a loja está indo: vendas, horários, categorias, vendedoras e lucro.</p></div>
      </div>
      <div class="vd-filtros">
        <div class="segmentos" id="periodos">${PERIODOS.map(([k, t]) => `<button class="segmento ${k === periodo ? 'sel' : ''}" data-periodo="${k}">${t}</button>`).join('')}</div>
        <div class="vd-datas" id="datas" ${periodo === 'outro' ? '' : 'hidden'}><input type="date" id="de" value="${de}"><span>até</span><input type="date" id="ate" value="${ate}"></div>
      </div>
      <div id="rel"></div>`;
    raiz.querySelector('#de').onchange = carregar;
    raiz.querySelector('#ate').onchange = carregar;
    raiz.querySelector('#periodos').onclick = (ev) => {
      const b = ev.target.closest('[data-periodo]');
      if (!b) return;
      periodo = b.dataset.periodo;
      raiz.querySelectorAll('.segmento').forEach((x) => x.classList.toggle('sel', x === b));
      raiz.querySelector('#datas').hidden = periodo !== 'outro';
      if (periodo !== 'outro') [raiz.querySelector('#de').value, raiz.querySelector('#ate').value] = intervalo(periodo);
      carregar();
    };
    await carregar();
  }

  /** Todos os dias do período (dias sem venda aparecem com zero). */
  function diasDoPeriodo(r) {
    const mapa = new Map(r.por_dia.map((d) => [d.dia, d]));
    const out = [];
    const fim = new Date(r.ate + 'T12:00');
    for (let d = new Date(r.de + 'T12:00'); d <= fim && out.length < 120; d.setDate(d.getDate() + 1)) {
      const k = d.toLocaleDateString('sv-SE');
      const x = mapa.get(k);
      out.push({
        rotulo: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        valor: x ? x.faturamento : 0,
        dica: `${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}: ${brl(x ? x.faturamento : 0)} · ${x ? x.vendas : 0} venda(s)`,
        destaque: k === U.hoje(),
      });
    }
    return out;
  }

  function variacao(atual, antes) {
    if (!antes) return atual ? '<span class="var sobe">novo</span>' : '';
    const pct = Math.round(((atual - antes) / antes) * 100);
    return `<span class="var ${pct >= 0 ? 'sobe' : 'desce'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
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
    const horas = [];
    const porHora = new Map(r.por_hora.map((h) => [h.hora, h]));
    const hs = r.por_hora.map((h) => h.hora);
    const h0 = Math.min(8, ...hs);
    const h1 = Math.max(20, ...hs);
    for (let h = h0; h <= h1; h++) {
      const x = porHora.get(h);
      horas.push({ rotulo: `${h}h`, valor: x ? x.vendas : 0, dica: `${h}h às ${h + 1}h: ${x ? x.vendas : 0} venda(s) · ${brl(x ? x.faturamento : 0)}` });
    }
    const pico = r.por_hora.slice().sort((a, b) => b.vendas - a.vendas)[0];
    const porSemana = new Map(r.por_semana.map((d) => [d.dia, d]));
    const semana = [1, 2, 3, 4, 5, 6, 0].map((d) => {
      const x = porSemana.get(d);
      return { rotulo: SEMANA[d], valor: x ? x.faturamento : 0, dica: `${SEMANA[d]}: ${brl(x ? x.faturamento : 0)} · ${x ? x.vendas : 0} venda(s)` };
    });
    const qtd = (n) => `${Math.round(n)}`;
    raiz.querySelector('#rel').innerHTML = `
      <div class="vd-kpis rl-kpis">
        <div class="vd-kpi destaque"><span>${Icone('carteira')} Faturamento</span><b>${brl(t.faturamento)}</b>
          <small>${variacao(t.faturamento, r.anterior.faturamento)} vs. ${brl(r.anterior.faturamento)} no período anterior</small></div>
        <div class="vd-kpi"><span>${Icone('recibo')} Vendas</span><b>${t.vendas}</b><small>${variacao(t.vendas, r.anterior.vendas)} · ${t.pecas} peça(s)</small></div>
        <div class="vd-kpi"><span>${Icone('grafico')} Ticket médio</span><b>${brl(t.ticket_medio)}</b><small>descontos ${brl(t.descontos)}</small></div>
        <div class="vd-kpi"><span>${Icone('estrela')} Lucro real</span><b class="${t.lucro_real < 0 ? 'txt-perigo' : ''}">${brl(t.lucro_real)}</b>
          <small>${t.faturamento ? `${((t.lucro_real / t.faturamento) * 100).toFixed(1).replace('.', ',')}% das vendas` : '—'}</small></div>
      </div>

      <div class="rl-grade rl-2-1">
        <div class="cartao"><div class="cabecalho-cartao"><h3 class="titulo-ico">${Icone('grafico')} Faturamento por dia</h3></div>
          ${Graficos.colunas(diasDoPeriodo(r), { altura: 200 })}</div>
        <div class="cartao"><h3 class="titulo-ico">${Icone('cartao')} Formas de pagamento</h3>
          ${Graficos.rosca(r.formas.map((f) => ({ nome: U.FORMAS[f.forma] || f.forma, valor: f.valor, cor: COR_FORMA[f.forma] || '#4a3aa7' })), { centro: 'Recebido' })}</div>
      </div>

      <div class="rl-grade">
        <div class="cartao"><h3 class="titulo-ico">${Icone('relogio')} Horário de pico</h3>
          <p class="dica">${pico ? `Mais vendas entre <b>${pico.hora}h e ${pico.hora + 1}h</b>. Bom horário para ter mais gente no caixa.` : 'Sem vendas no período.'}</p>
          ${Graficos.colunas(horas, { altura: 150, formato: qtd })}</div>
        <div class="cartao"><h3 class="titulo-ico">${Icone('caderno')} Dia da semana</h3>
          <p class="dica">Quanto a loja fatura em cada dia da semana no período.</p>
          ${Graficos.colunas(semana, { altura: 150 })}</div>
      </div>

      <div class="rl-grade">
        <div class="cartao"><h3 class="titulo-ico">${Icone('roupa')} Vendas por categoria</h3>
          ${Graficos.barras(r.por_categoria.map((c) => ({ nome: c.categoria, valor: c.total, sub: `${c.pecas} peça(s)` })))}</div>
        <div class="cartao"><h3 class="titulo-ico">${Icone('clientes')} Por vendedor(a)</h3>
          ${Graficos.barras(r.por_vendedor.map((v) => ({ nome: v.vendedor, valor: v.total, sub: `${v.vendas} venda(s) · ticket ${brl(v.vendas ? Math.round(v.total / v.vendas) : 0)}` })))}</div>
      </div>

      <div class="duas-colunas">
        <div class="cartao dre">
          <h3 class="titulo-ico">${Icone('estrela')} Lucro real do período</h3>
          <div class="linha"><span>Vendas</span><b>${brl(t.faturamento)}</b></div>
          <div class="linha"><span>(−) Trocas/devoluções em vale</span><span class="txt-perigo">− ${brl(t.trocas)}</span></div>
          <div class="linha"><span>(−) Custo das peças vendidas</span><span class="txt-perigo">− ${brl(t.custo - t.custo_trocas)}</span></div>
          <div class="linha"><span>(−) Taxas das maquininhas</span><span class="txt-perigo">− ${brl(t.taxas)}</span></div>
          <div class="linha"><span>(−) Despesas da loja</span><span class="txt-perigo">− ${brl(t.despesas)}</span></div>
          <div class="linha total"><span>= Lucro real</span><b class="${t.lucro_real < 0 ? 'txt-perigo' : 'txt-ok'}">${brl(t.lucro_real)}</b></div>
          ${t.faturamento ? `<p class="dica">Margem real: <b>${((t.lucro_real / t.faturamento) * 100).toFixed(1).replace('.', ',')}%</b> das vendas.</p>` : ''}
        </div>
        <div class="cartao">
          <div class="cabecalho-cartao"><h3 class="titulo-ico">${Icone('recibo')} Despesas</h3><button class="btn btn-peq btn-primario" id="nova-despesa">${Icone('mais')} Lançar despesa</button></div>
          ${r.despesas_por_categoria.map((d) => `<div class="linha"><span>${esc(d.categoria)}</span><span>${brl(d.valor)}</span></div>`).join('') || '<div class="vazio">Nenhuma despesa lançada no período.</div>'}
          <details id="det-despesas"><summary>Ver lançamentos</summary><div id="lista-despesas">Carregando…</div></details>
        </div>
      </div>
      <div class="cartao">
        <h3 class="titulo-ico">${Icone('cartao')} Maquininhas: quanto realmente cai na conta</h3>
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
        ${r.taxas.total ? '' : '<p class="dica">Cadastre as taxas da sua maquininha em <a href="#/config?aba=vendas">Configurações → Vendas</a>.</p>'}`
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
          <h3 class="titulo-ico">${Icone('estrela')} Mais vendidos</h3>
          <table class="tabela"><thead><tr><th>Produto</th><th class="r">Qtd</th><th class="r">Total</th></tr></thead>
          <tbody>${r.top_produtos.map((p) => `<tr><td>${esc(p.nome)} ${esc([p.tamanho, p.cor].filter(Boolean).join(' · '))}</td>
            <td class="r">${p.quantidade}</td><td class="r">${brl(p.total)}</td></tr>`).join('') || '<tr><td class="vazio" colspan="3">—</td></tr>'}</tbody></table>
        </div>
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('alerta')} Estoque baixo (repor)</h3>
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
