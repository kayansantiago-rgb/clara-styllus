/* Relatórios de vendas por período. */
Telas.relatorios = (() => {
  const { esc, brl, api, erro } = U;
  let raiz;

  function inicioMes() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE');
  }

  const PERIODOS = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Este mês'], ['passado', 'Mês passado'], ['outro', 'Escolher datas']];
  const COR_FORMA = { dinheiro: '#2f9e6a', pix: '#16a596', debito: '#2f5fa8', credito: '#7a49a6', crediario: '#b06d80', crediario_recebido: '#b06d80', vale: '#c99a3e', outro: '#7a6d74' };
  const nomeForma = (f) => (f === 'crediario_recebido' ? 'Crediário recebido' : U.FORMAS[f] || f);
  const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const SEMANA_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const SEMANA_ORDEM = [1, 2, 3, 4, 5, 6, 0];
  let diasParado = 90;
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
        <div class="ferramentas"><button class="btn" id="resumo-img">${Icone('imagem')} Resumo do mês em imagem</button></div>
      </div>
      <div class="vd-filtros">
        <div class="segmentos" id="periodos">${PERIODOS.map(([k, t]) => `<button class="segmento ${k === periodo ? 'sel' : ''}" data-periodo="${k}">${t}</button>`).join('')}</div>
        <div class="vd-datas" id="datas" ${periodo === 'outro' ? '' : 'hidden'}><input type="date" id="de" value="${de}"><span>até</span><input type="date" id="ate" value="${ate}"></div>
      </div>
      <div id="rel"></div>`;
    raiz.querySelector('#resumo-img').onclick = () => {
      // "Mês passado" abre no mês anterior; os outros períodos, no mês atual.
      const h = new Date();
      if (periodo === 'passado') ResumoMes.abrir(h.getMonth() ? h.getFullYear() : h.getFullYear() - 1, (h.getMonth() + 11) % 12);
      else ResumoMes.abrir();
    };
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
        data: k,
        rotulo: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        valor: x ? x.faturamento : 0,
        dica: `${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}: ${brl(x ? x.faturamento : 0)} · ${x ? x.vendas : 0} venda(s)`,
        destaque: k === U.hoje(),
      });
    }
    return out;
  }

  /** Igual à variação, mas para gasto: subir é ruim (vermelho), cair é bom (verde). */
  function variacaoGasto(atual, antes) {
    if (!antes) return atual ? '<span class="var desce">novo</span>' : '';
    const pct = Math.round(((atual - antes) / antes) * 100);
    return `<span class="var ${pct > 0 ? 'desce' : 'sobe'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
  }

  function variacao(atual, antes) {
    if (!antes) return atual ? '<span class="var sobe">novo</span>' : '';
    const pct = Math.round(((atual - antes) / antes) * 100);
    return `<span class="var ${pct >= 0 ? 'sobe' : 'desce'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
  }

  /** Pílula colorida com seta: subiu (verde) ou caiu (vermelho) em relação ao período anterior. */
  function seta(atual, antes) {
    if (!antes) return atual ? '<span class="rl-seta sobe">novo</span>' : '<span class="rl-seta igual">—</span>';
    const pct = Math.round(((atual - antes) / antes) * 100);
    if (!pct) return '<span class="rl-seta igual">= igual</span>';
    return `<span class="rl-seta ${pct > 0 ? 'sobe' : 'desce'}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="${pct > 0 ? 'M6 2 10 7H7.5v3h-3V7H2Z' : 'M6 10 2 5h2.5V2h3v3H10Z'}" fill="currentColor"/></svg>${Math.abs(pct)}%</span>`;
  }

  /** Meta do mês em anel: quanto já vendeu, quanto falta e para onde o ritmo leva. */
  function anelMeta(feito, meta) {
    const hoje = new Date();
    const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const pct = meta ? Math.min(1, feito / meta) : 0;
    const raio = 52;
    const volta = 2 * Math.PI * raio;
    const previsao = Math.round((feito / Math.max(1, hoje.getDate())) * diasMes);
    const falta = Math.max(0, meta - feito);
    const diasRestam = diasMes - hoje.getDate() + 1;
    return `<div class="cartao rl-meta">
      <svg class="rl-anel" viewBox="0 0 130 130" aria-hidden="true">
        <circle cx="65" cy="65" r="${raio}" fill="none" stroke="#f0e7ea" stroke-width="13"/>
        <circle cx="65" cy="65" r="${raio}" fill="none" stroke="${pct >= 1 ? '#2f9e6a' : 'var(--ouro-vivo)'}" stroke-width="13" stroke-linecap="round"
          stroke-dasharray="${(volta * pct).toFixed(1)} ${volta.toFixed(1)}" transform="rotate(-90 65 65)" class="rl-anel-arco" style="--volta:${volta.toFixed(1)}"/>
        <text x="65" y="63" text-anchor="middle" font-size="26" font-weight="800" fill="var(--texto)">${Math.round(pct * 100)}%</text>
        <text x="65" y="82" text-anchor="middle" font-size="10.5" fill="var(--suave)">da meta</text>
      </svg>
      <div class="rl-meta-txt">
        <small>Meta do mês</small>
        <b>${brl(feito)}</b><span class="rl-meta-de">de ${brl(meta)}</span>
        ${pct >= 1 ? `<p class="rl-meta-ok">${Icone('estrela')} Meta batida! Parabéns à equipe.</p>`
    : `<p>Faltam <b>${brl(falta)}</b> · ${brl(Math.ceil(falta / diasRestam))} por dia nos ${diasRestam} dia(s) que restam.</p>`}
        <p class="rl-meta-prev">No ritmo atual o mês fecha em <b>${brl(previsao)}</b> ${previsao >= meta ? '<span class="rl-seta sobe">bate a meta</span>' : '<span class="rl-seta desce">abaixo da meta</span>'}</p>
      </div>
    </div>`;
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
    // Mapa de calor: dia da semana × hora, pelo faturamento.
    const celulasCalor = new Map();
    for (const c of r.por_semana_hora || []) {
      celulasCalor.set(`${c.dia}|${c.hora}`, {
        valor: c.faturamento,
        dica: `${SEMANA_LONGO[c.dia]}, ${c.hora}h às ${c.hora + 1}h: ${brl(c.faturamento)} · ${c.vendas} venda(s)`,
      });
    }
    const horasCalor = [];
    for (let h = h0; h <= h1; h++) horasCalor.push({ chave: h, rotulo: `${h}h` });
    const melhores = (r.por_semana_hora || []).slice().sort((a, b) => b.faturamento - a.faturamento).slice(0, 3)
      .map((c) => `${SEMANA_LONGO[c.dia]} ${c.hora}h–${c.hora + 1}h`);
    const cfg = await U.config().catch(() => ({}));
    const meta = Number(cfg.meta_mensal) || 0;
    const a = r.anterior;
    const comparar = [
      ['Faturamento', brl(t.faturamento), brl(a.faturamento), seta(t.faturamento, a.faturamento)],
      ['Vendas', t.vendas, a.vendas, seta(t.vendas, a.vendas)],
      ['Peças', t.pecas, a.pecas, seta(t.pecas, a.pecas)],
      ['Ticket médio', brl(t.ticket_medio), brl(a.ticket_medio), seta(t.ticket_medio, a.ticket_medio)],
    ];
    const dataCurta = (d) => d.split('-').reverse().slice(0, 2).join('/');
    raiz.querySelector('#rel').innerHTML = `
      <div class="rl-hero ${periodo === 'mes' ? '' : 'sem-meta'}">
        ${periodo === 'mes' ? (meta ? anelMeta(t.faturamento, meta) : `<div class="cartao rl-meta rl-meta-vazia">
          <svg class="rl-anel" viewBox="0 0 130 130" aria-hidden="true"><circle cx="65" cy="65" r="52" fill="none" stroke="#f0e7ea" stroke-width="13" stroke-dasharray="6 8"/></svg>
          <div class="rl-meta-txt"><small>Meta do mês</small><b>Sem meta definida</b>
            <p>Coloque uma meta de vendas e acompanhe aqui quanto falta.</p>
            ${U.sessao.ehAdmin() ? '<a class="btn btn-claro btn-peq" href="#/config?aba=vendas">Definir meta</a>' : ''}</div></div>`) : ''}
        <div class="cartao rl-comp">
          <h3 class="titulo-ico">${Icone('grafico')} Comparado com o período anterior <small>${dataCurta(a.de)} a ${dataCurta(a.ate)}</small></h3>
          <div class="rl-comp-grade">${comparar.map(([n, v, ant, s]) => `<div><small>${n}</small><b>${v}</b><span>${s}<em>antes ${ant}</em></span></div>`).join('')}</div>
        </div>
      </div>
      <div class="vd-kpis rl-kpis">
        <div class="vd-kpi destaque" title="Vendas pagas na hora + parcelas do crediário recebidas. Venda no crediário só entra quando a cliente paga.">
          <span>${Icone('carteira')} Faturamento</span><b>${brl(t.faturamento)}</b>
          <small>${variacao(t.faturamento, r.anterior.faturamento)} vs. ${brl(r.anterior.faturamento)} no período anterior</small></div>
        <div class="vd-kpi rl-kpi-cred" title="Vendido no crediário neste período: ainda a receber. Entra no faturamento quando a cliente pagar.">
          <span>${Icone('caderno')} Vendido no crediário</span><b>${brl(t.vendido_crediario)}</b>
          <small>a receber · recebido no período <strong>${brl(t.recebido_crediario)}</strong></small></div>
        <div class="vd-kpi vd-kpi-cai"><span>${Icone('dinheiro')} Cai na conta</span><b>${brl(t.cai_na_conta ?? t.faturamento)}</b>
          <small>${t.faturamento - (t.cai_na_conta ?? t.faturamento) ? `− ${brl(t.faturamento - t.cai_na_conta)} de taxas` : 'sem taxas no período'}${t.juros_repassados ? ` · inclui ${brl(t.juros_repassados)} de juros pagos pelas clientes` : ''}</small></div>
        <div class="vd-kpi"><span>${Icone('recibo')} Vendas</span><b>${t.vendas}</b><small>${variacao(t.vendas, r.anterior.vendas)} · ${t.pecas} peça(s)</small></div>
        <div class="vd-kpi"><span>${Icone('grafico')} Ticket médio</span><b>${brl(t.ticket_medio)}</b><small>descontos ${brl(t.descontos)}</small></div>
        <div class="vd-kpi"><span>${Icone('estrela')} Lucro real</span><b class="${t.lucro_real < 0 ? 'txt-perigo' : ''}">${brl(t.lucro_real)}</b>
          <small>${t.faturamento ? `${((t.lucro_real / t.faturamento) * 100).toFixed(1).replace('.', ',')}% das vendas` : '—'}</small></div>
      </div>

      <div class="rl-grade rl-2-1">
        <div class="cartao"><div class="cabecalho-cartao"><h3 class="titulo-ico">${Icone('grafico')} Faturamento por dia</h3></div>
          ${Graficos.colunas(diasDoPeriodo(r), { altura: 200 })}</div>
        <div class="cartao"><h3 class="titulo-ico">${Icone('cartao')} Formas de pagamento</h3>
          ${Graficos.rosca(r.formas.map((f) => ({ nome: nomeForma(f.forma), valor: f.valor, cor: COR_FORMA[f.forma] || '#4a3aa7' })), { centro: 'Entrou' })}
          ${t.vendido_crediario ? `<p class="dica rl-cred-dica">${Icone('caderno')} Vendido no crediário: <b>${brl(t.vendido_crediario)}</b> (entra aqui quando a cliente pagar)</p>` : ''}</div>
      </div>

      ${(() => {
    // O mês inteiro (do 1º dia do mês do início até o último dia do mês do fim), até 3 meses.
    const ini = new Date(r.de.slice(0, 8) + '01T12:00');
    const fimP = new Date(r.ate + 'T12:00');
    const fim = new Date(fimP.getFullYear(), fimP.getMonth() + 1, 0, 12);
    if ((fim - ini) / 864e5 > 93) return '';
    const mapa = new Map(r.por_dia.map((d) => [d.dia, d]));
    const hoje = U.hoje();
    const dados = [];
    for (let d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) {
      const k = d.toLocaleDateString('sv-SE');
      const x = mapa.get(k);
      const nome = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      dados.push({ data: k, valor: x ? x.faturamento : 0, futuro: k > hoje,
        dica: k > hoje ? `${nome}: ainda não chegou` : `${nome}: ${brl(x ? x.faturamento : 0)} · ${x ? x.vendas : 0} venda(s)` });
    }
    return `<div class="cartao rl-cal"><h3 class="titulo-ico">${Icone('reserva')} Calendário de vendas
      <small>cada quadradinho é um dia · quanto mais escuro, mais vendeu</small></h3>${Graficos.calendario(dados)}</div>`;
  })()}

      <div class="rl-grade">
        <div class="cartao"><h3 class="titulo-ico">${Icone('relogio')} Horário de pico</h3>
          <p class="dica">${pico ? `Mais vendas entre <b>${pico.hora}h e ${pico.hora + 1}h</b>. Bom horário para ter mais gente no caixa.` : 'Sem vendas no período.'}</p>
          ${Graficos.colunas(horas, { altura: 150, formato: qtd })}</div>
        <div class="cartao"><h3 class="titulo-ico">${Icone('caderno')} Dia da semana</h3>
          <p class="dica">Quanto a loja vende em cada dia da semana no período.</p>
          ${Graficos.colunas(semana, { altura: 150 })}</div>
      </div>

      <div class="cartao">
        <h3 class="titulo-ico">${Icone('fogo')} Melhores dias e horários</h3>
        ${melhores.length ? `<p class="dica">Os momentos que mais vendem: ${melhores.map((m, i) => `<b>${i + 1}º ${m}</b>`).join(' · ')}. Bons para ter mais gente na loja e postar nas redes um pouco antes.</p>` : ''}
        ${Graficos.calor(SEMANA_ORDEM.map((d) => ({ chave: d, rotulo: SEMANA[d] })), horasCalor, celulasCalor)}
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
          <div class="linha"><span>Entradas <small>(vendas pagas + crediário recebido)</small></span><b>${brl(t.faturamento)}</b></div>
          <div class="linha"><span>(−) Trocas/devoluções em vale</span><span class="txt-perigo">− ${brl(t.trocas)}</span></div>
          <div class="linha"><span>(−) Custo das peças vendidas</span><span class="txt-perigo">− ${brl(t.custo - t.custo_trocas)}</span></div>
          ${t.sinais_retidos ? `<div class="linha"><span>(+) Sinais de reserva que ficaram com a loja</span><span class="txt-ok">+ ${brl(t.sinais_retidos)}</span></div>` : ''}
          <div class="linha"><span>(−) Taxas das maquininhas</span><span class="txt-perigo">− ${brl(t.taxas)}</span></div>
          <div class="linha"><span>(−) Despesas da loja</span><span class="txt-perigo">− ${brl(t.despesas)}</span></div>
          ${t.compras_mercadoria ? `<p class="dica">As compras de mercadoria (${brl(t.compras_mercadoria)}) não entram aqui: o custo das peças vendidas já está na conta.</p>` : ''}
          ${t.vendido_crediario ? `<p class="dica">Vendido no crediário no período: ${brl(t.vendido_crediario)}. Entra no lucro quando a cliente pagar as parcelas.</p>` : ''}
          <div class="linha total"><span>= Lucro real</span><b class="${t.lucro_real < 0 ? 'txt-perigo' : 'txt-ok'}">${brl(t.lucro_real)}</b></div>
          ${t.faturamento ? `<p class="dica">Margem real: <b>${((t.lucro_real / t.faturamento) * 100).toFixed(1).replace('.', ',')}%</b> das vendas.</p>` : ''}
        </div>
        <div class="cartao" id="desp-resumo"><h3 class="titulo-ico">${Icone('recibo')} Despesas da loja</h3>${U.esqueleto(3)}</div>
      </div>
      <div class="cartao" id="desp-lista"></div>
      <div class="cartao">
        <h3 class="titulo-ico">${Icone('cartao')} Maquininhas: quanto realmente cai na conta</h3>
        ${r.taxas.linhas.length ? `
        <table class="tabela">
          <thead><tr><th>Forma</th><th>Origem</th><th class="r">Taxa</th><th class="r">Valor vendido</th><th class="r">Taxa (R$)</th><th class="r">Líquido</th></tr></thead>
          <tbody>${r.taxas.linhas.map((l) => `<tr>
            <td>${U.FORMAS[l.forma] || l.forma}${l.forma === 'credito' ? (l.parcelas > 1 ? ` ${l.parcelas}x` : ' à vista') : ''}
              ${l.bandeira ? `<span class="tx-band tx-${l.bandeira}">${U.BANDEIRAS[l.bandeira] || l.bandeira}</span>` : ''}</td>
            <td><small>${l.origem === 'crediario' ? 'recebimento do crediário' : 'vendas'}</small></td>
            <td class="r">${l.percentual ? l.percentual.toLocaleString('pt-BR') + '%' : '<small>sem taxa</small>'}</td>
            <td class="r">${brl(l.bruto)}</td><td class="r txt-perigo">− ${brl(l.taxa)}</td><td class="r"><b>${brl(l.liquido)}</b></td></tr>`).join('')}</tbody>
          <tfoot><tr><th colspan="3">Total</th><th class="r">${brl(r.taxas.bruto)}</th><th class="r txt-perigo">− ${brl(r.taxas.total)}</th><th class="r">${brl(r.taxas.bruto - r.taxas.total)}</th></tr></tfoot>
        </table>
        ${r.taxas.total ? '' : '<p class="dica">Cadastre as taxas da sua maquininha em <a href="#/config?aba=vendas">Configurações → Vendas</a>.</p>'}`
    : U.vazio({ ilu: 'recibo', compacto: true, texto: 'Nenhuma venda em cartão ou PIX no período.' })}
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
          ${r.top_produtos.length ? `<div class="rl-top">${r.top_produtos.slice(0, 10).map((p, i) => `<div class="rl-top-item">
            <span class="rl-pos rl-pos-${i + 1}">${i + 1}º</span>
            ${U.miniatura(p, 'rl-top-foto')}
            <div class="rl-top-txt"><b>${esc(p.nome)}</b><small>${esc([p.tamanho, p.cor].filter(Boolean).join(' · ') || '—')}</small>
              <div class="rl-top-barra"><i style="width:${Math.round((p.quantidade / r.top_produtos[0].quantidade) * 100)}%"></i></div></div>
            <div class="rl-top-num"><b>${p.quantidade}</b><small>${brl(p.total)}</small></div>
          </div>`).join('')}</div>` : U.vazio({ ilu: 'cabide', compacto: true, texto: 'Sem vendas no período.' })}
        </div>
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('alerta')} Estoque baixo (repor)</h3>
          <table class="tabela"><thead><tr><th>Produto</th><th class="r">Estoque</th><th class="r">Mínimo</th></tr></thead>
          <tbody>${baixo.map((p) => `<tr><td>${esc(p.nome)} ${esc([p.tamanho, p.cor].filter(Boolean).join(' · '))}</td>
            <td class="r txt-perigo">${p.estoque}</td><td class="r">${p.estoque_minimo}</td></tr>`).join('') || '<tr><td class="vazio" colspan="3">Tudo certo.</td></tr>'}</tbody></table>
        </div>
      </div>
      <div class="cartao" id="abc"><h3 class="titulo-ico">${Icone('grafico')} Curva ABC</h3>${U.esqueleto(3)}</div>
      <div class="cartao" id="paradas"><h3 class="titulo-ico">${Icone('relogio')} Peças paradas</h3>${U.esqueleto(3)}</div>`;
    ligarDespesas(t.faturamento);
    carregarAbc();
    carregarParadas();
  }

  const fotoModelo = (m) => U.miniatura(m.foto_versao ? { id: m.foto_id, foto_versao: m.foto_versao } : null, 'pr-foto');
  const nomeModelo = (m) => `<b>${esc(m.nome)}</b><small>${esc([m.categoria, m.referencia && 'Ref ' + m.referencia].filter(Boolean).join(' · ') || '—')}</small>`;
  const linkProdutos = (m) => `#/produtos?q=${encodeURIComponent(m.referencia || m.nome)}`;

  /** Curva ABC do período: poucos modelos fazem a maior parte do faturamento. */
  async function carregarAbc() {
    const el = raiz && raiz.querySelector('#abc');
    if (!el) return;
    let r;
    try { r = await api(`/api/relatorios/abc?de=${raiz.querySelector('#de').value}&ate=${raiz.querySelector('#ate').value}`); } catch (e) { return erro(e); }
    if (!raiz || !raiz.contains(el)) return;
    const TXT = {
      A: 'Carro-chefe: nunca deixe faltar. Repor tamanhos e cores primeiro.',
      B: 'Vendem bem: mantenha a grade, sem exagerar na compra.',
      C: 'Vendem pouco: compre menos ou use em promoção e kit.',
    };
    const [a, b, c] = r.resumo;
    const pct = (x) => (r.total ? Math.round((x / r.total) * 100) : 0);
    el.innerHTML = `
      <div class="cabecalho-cartao"><h3 class="titulo-ico">${Icone('grafico')} Curva ABC</h3><small class="dica">Modelos (todas as cores e tamanhos juntos) pelo faturamento do período.</small></div>
      ${!r.modelos.length ? U.vazio({ ilu: 'grafico', compacto: true, texto: 'Sem vendas no período.' }) : `
      <div class="abc-resumo">${r.resumo.map((x) => `
        <div class="abc-bloco abc-${x.classe}">
          <span class="abc-letra">${x.classe}</span>
          <div><b>${x.modelos} modelo(s) · ${pct(x.total)}% das vendas</b><small>${brl(x.total)} · ${x.pecas} peça(s)</small><small>${TXT[x.classe]}</small></div>
        </div>`).join('')}</div>
      ${a.modelos && r.modelos.length > 4 ? `<p class="dica">Só <b>${Math.round((a.modelos / r.modelos.length) * 100)}%</b> dos modelos (${a.modelos} de ${r.modelos.length}) trazem <b>${pct(a.total)}%</b> do faturamento.${c.modelos ? ` Outros ${c.modelos} somam só ${pct(c.total)}%.` : ''}</p>` : ''}
      <table class="tabela abc-tabela">
        <thead><tr><th></th><th>Modelo</th><th class="r">Peças</th><th class="r">Vendido</th><th class="r">% vendas</th><th class="r">Em estoque</th></tr></thead>
        <tbody>${r.modelos.map((m, i) => `<tr class="${i >= 15 ? 'abc-mais' : ''}" ${i >= 15 ? 'hidden' : ''}>
          <td><span class="abc-tag abc-${m.classe}">${m.classe}</span></td>
          <td><a class="abc-modelo" href="${linkProdutos(m)}">${fotoModelo(m)}<span>${nomeModelo(m)}</span></a></td>
          <td class="r">${m.pecas}</td><td class="r">${brl(m.total)}</td>
          <td class="r">${m.percentual.toFixed(1).replace('.', ',')}%</td>
          <td class="r ${m.classe === 'A' && m.estoque <= 2 ? 'txt-perigo' : ''}">${m.estoque}${m.classe === 'A' && m.estoque <= 2 ? ' · repor' : ''}</td></tr>`).join('')}</tbody>
      </table>
      ${r.modelos.length > 15 ? `<button class="link" id="abc-todos">Ver todos os ${r.modelos.length} modelos</button>` : ''}`}`;
    const todos = el.querySelector('#abc-todos');
    if (todos) todos.onclick = () => { el.querySelectorAll('.abc-mais').forEach((x) => { x.hidden = false; }); todos.remove(); };
  }

  /** Peças com estoque que não vendem há muito tempo: dinheiro parado na arara. */
  async function carregarParadas() {
    const el = raiz && raiz.querySelector('#paradas');
    if (!el) return;
    let r;
    try { r = await api(`/api/relatorios/paradas?dias=${diasParado}`); } catch (e) { return erro(e); }
    if (!raiz || !raiz.contains(el)) return;
    const desde = (d) => (d ? d.slice(0, 10).split('-').reverse().join('/') : null);
    el.innerHTML = `
      <div class="cabecalho-cartao"><h3 class="titulo-ico">${Icone('relogio')} Peças paradas</h3>
        <label class="pp-dias">Sem vender há <select id="pp-dias">${[30, 60, 90, 120, 180].map((n) => `<option value="${n}" ${n === diasParado ? 'selected' : ''}>${n} dias</option>`).join('')}</select></label></div>
      ${!r.modelos.length ? U.vazio({ ilu: 'cabide', compacto: true, titulo: 'Estoque girando bem', texto: `Nenhuma peça parada há mais de ${r.dias} dias.` }) : `
      <div class="pp-resumo">
        <div><small>Modelos parados</small><b>${r.modelos.length}</b></div>
        <div><small>Peças</small><b>${r.pecas}</b></div>
        <div><small>Dinheiro parado (custo)</small><b class="txt-perigo">${brl(r.valor_custo)}</b></div>
        <div><small>Valendo na etiqueta</small><b>${brl(r.valor_venda)}</b></div>
      </div>
      <p class="dica">Ideias: liquidação "De/Por", montar kits, oferecer para as clientes que compram a categoria, ou expor na frente da loja.
        Clique no modelo para abrir no cadastro e usar o botão <b>Liquidação</b>.</p>
      <table class="tabela">
        <thead><tr><th>Modelo</th><th>Tamanhos</th><th class="r">Peças</th><th class="r">Custo parado</th><th class="r">Última venda</th></tr></thead>
        <tbody>${r.modelos.map((m) => `<tr>
          <td><a class="abc-modelo" href="${linkProdutos(m)}">${fotoModelo(m)}<span>${nomeModelo(m)}</span></a>${m.em_liquidacao ? ' <span class="pp-liq">em liquidação</span>' : ''}</td>
          <td><small>${esc(m.tamanhos.join(', ') || '—')}</small></td>
          <td class="r">${m.estoque}</td><td class="r">${brl(m.valor_custo)}</td>
          <td class="r"><b>${m.dias_parado} dias</b><small class="bloco">${m.ultima_venda ? `vendeu em ${desde(m.ultima_venda)}` : `nunca vendeu · cadastro ${desde(m.cadastrado_em)}`}</small></td></tr>`).join('')}</tbody>
      </table>`}`;
    el.querySelector('#pp-dias').onchange = (ev) => { diasParado = Number(ev.target.value); carregarParadas(); };
  }

  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dataBr = (d) => String(d || '').slice(0, 10).split('-').reverse().join('/');
  let filtroCategoria = '';

  /** Despesas: para onde foi o dinheiro (por categoria, mês a mês), lançamentos e sangrias do caixa. */
  async function ligarDespesas(faturamento) {
    const de = raiz.querySelector('#de').value;
    const ate = raiz.querySelector('#ate').value;
    let r;
    try { r = await api(`/api/relatorios/despesas?de=${de}&ate=${ate}`); } catch (e) { return erro(e); }
    const resumo = raiz && raiz.querySelector('#desp-resumo');
    const listaEl = raiz && raiz.querySelector('#desp-lista');
    if (!resumo || !listaEl) return;
    if (filtroCategoria && !r.por_categoria.some((c) => c.categoria === filtroCategoria)) filtroCategoria = '';
    const maior = r.lancamentos.reduce((m, d) => (!m || d.valor > m.valor ? d : m), null);
    resumo.innerHTML = `
      <div class="cabecalho-cartao"><h3 class="titulo-ico">${Icone('recibo')} Despesas da loja</h3>
        <span class="nowrap"><a class="btn btn-peq" href="#/despesas">Abrir Despesas</a>
        <button class="btn btn-peq btn-primario" id="nova-despesa">${Icone('mais')} Lançar despesa</button></span></div>
      <div class="dp-kpis">
        <div><small>Total gasto</small><b>${brl(r.total)}</b><small>${variacaoGasto(r.total, r.anterior)} vs. ${brl(r.anterior)} antes</small></div>
        <div><small>Das vendas</small><b>${faturamento ? `${((r.total / faturamento) * 100).toFixed(1).replace('.', ',')}%` : '—'}</b><small>de cada R$ 100 vendidos</small></div>
        <div><small>Maior gasto</small><b>${maior ? brl(maior.valor) : '—'}</b><small>${maior ? esc(maior.descricao) : 'nenhum lançamento'}</small></div>
      </div>
      ${r.por_categoria.length ? `<p class="dica">Clique numa categoria para ver só os lançamentos dela.</p>
      <div class="dp-cats">${r.por_categoria.map((c) => `
        <button type="button" class="dp-cat ${filtroCategoria === c.categoria ? 'sel' : ''}" data-cat="${esc(c.categoria)}">
          <span class="dp-cat-txt"><b>${esc(c.categoria)}</b><small>${c.qtd} lançamento(s)</small></span>
          <span class="dp-cat-valor"><b>${brl(c.valor)}</b><small>${r.total ? Math.round((c.valor / r.total) * 100) : 0}%</small></span>
          <span class="dp-cat-barra"><i style="width:${r.total ? (c.valor / r.por_categoria[0].valor) * 100 : 0}%"></i></span>
        </button>`).join('')}</div>` : U.vazio({ ilu: 'recibo', compacto: true, titulo: 'Nenhuma despesa no período', texto: 'Use <b>Lançar despesa</b> para aluguel, luz, embalagens…' })}
      ${r.meses.some((m) => m.valor) ? `<h4 class="dp-sub">Últimos 6 meses</h4>
        ${Graficos.colunas(r.meses.map((m) => ({ rotulo: MESES_CURTOS[Number(m.mes.slice(5)) - 1], valor: m.valor, dica: `${MESES_CURTOS[Number(m.mes.slice(5)) - 1]}/${m.mes.slice(0, 4)}: ${brl(m.valor)}`, destaque: m.mes === ate.slice(0, 7) })), { altura: 120 })}` : ''}`;
    const lanc = r.lancamentos.filter((d) => !filtroCategoria || (d.categoria || 'Outras') === filtroCategoria);
    listaEl.innerHTML = `
      <div class="cabecalho-cartao"><h3 class="titulo-ico">${Icone('prancheta')} Lançamentos de despesas${filtroCategoria ? ` · ${esc(filtroCategoria)}` : ''}</h3>
        ${filtroCategoria ? '<button class="btn btn-peq" id="dp-todas">Ver todas</button>' : ''}</div>
      ${lanc.length ? `<table class="tabela dp-tabela">
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Lançado por</th><th class="r">Valor</th><th></th></tr></thead>
        <tbody>${lanc.map((d) => `<tr><td>${dataBr(d.data)}</td><td>${esc(d.descricao)}</td>
          <td><span class="dp-chip">${esc(d.categoria || 'Outras')}</span></td><td><small>${esc(d.usuario || '—')}</small></td>
          <td class="r"><b>${brl(d.valor)}</b></td><td class="r"><button class="btn-ico" data-del="${d.id}" title="Apagar lançamento">${Icone('lixeira')}</button></td></tr>`).join('')}</tbody>
        <tfoot><tr><th colspan="4">Total${filtroCategoria ? ` em ${esc(filtroCategoria)}` : ''}</th><th class="r">${brl(lanc.reduce((a, d) => a + d.valor, 0))}</th><th></th></tr></tfoot>
      </table>` : U.vazio({ ilu: 'recibo', compacto: true, texto: 'Nenhum lançamento no período.' })}
      ${r.sangrias.length ? `
      <h4 class="dp-sub">Retiradas do caixa (sangrias) no período</h4>
      <p class="dica">Dinheiro que saiu da gaveta. Não entra no lucro como despesa; se alguma foi para pagar conta da loja, clique em <b>Lançar como despesa</b>.</p>
      <table class="tabela dp-tabela">
        <thead><tr><th>Data</th><th>Motivo</th><th>Caixa</th><th class="r">Valor</th><th></th></tr></thead>
        <tbody>${r.sangrias.map((m, i) => `<tr><td>${U.dataHora(m.criado_em)}</td><td>${esc(m.motivo || '—')}</td>
          <td><small>nº ${m.caixa_id}${m.operador ? ` · ${esc(m.operador)}` : ''}</small></td><td class="r">${brl(m.valor)}</td>
          <td class="r"><button class="btn btn-peq" data-sangria="${i}">Lançar como despesa</button></td></tr>`).join('')}</tbody>
      </table>` : ''}`;

    resumo.querySelector('#nova-despesa').onclick = () => Telas.despesas.formulario(null, carregar);
    resumo.onclick = (ev) => {
      const b = ev.target.closest('[data-cat]');
      if (!b) return;
      filtroCategoria = filtroCategoria === b.dataset.cat ? '' : b.dataset.cat;
      ligarDespesas(faturamento);
    };
    listaEl.onclick = async (ev) => {
      if (ev.target.closest('#dp-todas')) { filtroCategoria = ''; ligarDespesas(faturamento); return; }
      const s = ev.target.closest('[data-sangria]');
      if (s) {
        const m = r.sangrias[Number(s.dataset.sangria)];
        Telas.despesas.formulario(null, carregar, { descricao: m.motivo || 'Sangria do caixa', valor: m.valor, data: m.criado_em.slice(0, 10), forma: 'dinheiro', sangria_id: m.id });
        return;
      }
      const b = ev.target.closest('[data-del]');
      if (!b) return;
      const linha = b.closest('tr, li, div');
      if (linha) linha.hidden = true;
      U.desfazivel('Lançamento apagado.', {
        executar: (fechando) => api(`/api/despesas/${b.dataset.del}`, { metodo: 'DELETE', keepalive: fechando }),
        aoDesfazer: () => { if (linha) linha.hidden = false; },
        depois: () => carregar(),
      });
    };
  }

  return { abrir, sair: () => { raiz = null; } };
})();
