/* Despesas da loja: compras, funcionárias, aluguel, contas… lançar, editar e ver para onde foi o dinheiro. */
Telas.despesas = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal } = U;
  let raiz;
  let periodo = 'mes';
  let categoria = '';
  let dados = null;

  const CATEGORIAS = [
    ['Compras de mercadoria', 'Peças compradas de fornecedor (não entra no lucro real: o custo das peças vendidas já entra).'],
    ['Funcionários', 'Salário, comissão, vale, 13º, férias.'],
    ['Aluguel', ''], ['Energia', ''], ['Água', ''], ['Internet/telefone', ''],
    ['Contador', ''], ['Impostos', 'DAS, taxas, alvará.'], ['Embalagens', 'Sacolas, papel de seda, etiquetas.'],
    ['Marketing', 'Anúncios, fotos, influenciadora.'], ['Frete/entregas', ''], ['Manutenção', 'Consertos, limpeza, decoração.'],
    ['Retirada da dona', 'Pró-labore / dinheiro tirado para a casa.'], ['Outras', ''],
  ];
  const FORMAS = [['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['cartao', 'Cartão'], ['boleto', 'Boleto'], ['transferencia', 'Transferência'], ['outro', 'Outro']];
  const FORMA_TXT = Object.fromEntries(FORMAS);
  const PERIODOS = [['mes', 'Este mês'], ['passado', 'Mês passado'], ['30d', '30 dias'], ['ano', 'Este ano'], ['outro', 'Escolher datas']];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dataBr = (d) => String(d || '').slice(0, 10).split('-').reverse().join('/');

  function intervalo(p) {
    const h = new Date();
    const iso = (d) => d.toLocaleDateString('sv-SE');
    if (p === 'passado') return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))];
    if (p === '30d') return [iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - 29)), iso(h)];
    if (p === 'ano') return [iso(new Date(h.getFullYear(), 0, 1)), iso(h)];
    return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)];
  }

  async function abrir(el) {
    raiz = el;
    const [de, ate] = intervalo(periodo);
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Despesas</h1><p class="subtitulo">Tudo o que a loja gasta: compras, funcionárias, aluguel, contas… e para onde foi o dinheiro.</p></div>
        <div class="ferramentas"><button class="btn btn-primario" id="nova">${Icone('mais')} Nova despesa</button></div>
      </div>
      <div class="vd-filtros">
        <div class="segmentos" id="periodos">${PERIODOS.map(([k, t]) => `<button class="segmento ${k === periodo ? 'sel' : ''}" data-periodo="${k}">${t}</button>`).join('')}</div>
        <div class="vd-datas" id="datas" ${periodo === 'outro' ? '' : 'hidden'}><input type="date" id="de" value="${de}"><span>até</span><input type="date" id="ate" value="${ate}"></div>
        <div class="busca-ico dsp-busca">${Icone('busca')}<input id="q" type="search" placeholder="Procurar descrição ou para quem…"></div>
      </div>
      <div id="dsp"></div>`;
    raiz.querySelector('#nova').onclick = () => formulario(null, carregar);
    raiz.querySelector('#periodos').onclick = (ev) => {
      const b = ev.target.closest('[data-periodo]');
      if (!b) return;
      periodo = b.dataset.periodo;
      raiz.querySelectorAll('#periodos .segmento').forEach((x) => x.classList.toggle('sel', x === b));
      raiz.querySelector('#datas').hidden = periodo !== 'outro';
      if (periodo !== 'outro') [raiz.querySelector('#de').value, raiz.querySelector('#ate').value] = intervalo(periodo);
      carregar();
    };
    raiz.querySelector('#de').onchange = carregar;
    raiz.querySelector('#ate').onchange = carregar;
    raiz.querySelector('#q').addEventListener('input', U.debounce(desenhar, 150));
    await carregar();
  }

  async function carregar() {
    if (!raiz) return;
    try {
      dados = await api(`/api/relatorios/despesas?de=${raiz.querySelector('#de').value}&ate=${raiz.querySelector('#ate').value}`);
    } catch (e) { return erro(e); }
    if (categoria && !dados.por_categoria.some((c) => c.categoria === categoria)) categoria = '';
    desenhar();
  }

  function desenhar() {
    if (!raiz || !dados) return;
    const r = dados;
    const q = raiz.querySelector('#q').value.trim().toLowerCase();
    const lanc = r.lancamentos.filter((d) => (!categoria || (d.categoria || 'Outras') === categoria)
      && (!q || `${d.descricao} ${d.favorecido || ''} ${d.observacao || ''}`.toLowerCase().includes(q)));
    const mercadoria = r.por_categoria.find((c) => c.categoria === 'Compras de mercadoria')?.valor || 0;
    const daGaveta = r.lancamentos.filter((d) => d.sangria_id).reduce((a, d) => a + d.valor, 0);
    const pct = r.anterior ? Math.round(((r.total - r.anterior) / r.anterior) * 100) : null;
    const el = raiz.querySelector('#dsp');
    el.innerHTML = `
      <div class="vd-kpis dsp-kpis">
        <div class="vd-kpi destaque"><span>${Icone('carteira')} Total gasto</span><b>${brl(r.total)}</b>
          <small>${pct === null ? 'sem comparação' : `<span class="var ${pct > 0 ? 'desce' : 'sobe'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span> vs. ${brl(r.anterior)} no período anterior`}</small></div>
        <div class="vd-kpi"><span>${Icone('roupa')} Compras de mercadoria</span><b>${brl(mercadoria)}</b><small>peças para revender</small></div>
        <div class="vd-kpi"><span>${Icone('recibo')} Despesas da loja</span><b>${brl(r.total - mercadoria)}</b><small>funcionárias, contas… (entram no lucro)</small></div>
        <div class="vd-kpi"><span>${Icone('gaveta')} Pago pela gaveta</span><b>${brl(daGaveta)}</b><small>saiu do caixa como sangria</small></div>
      </div>
      <div class="dsp-grade">
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('grafico')} Para onde foi o dinheiro</h3>
          ${r.por_categoria.length ? `<p class="dica">Clique numa categoria para ver só ela.</p>
          <div class="dp-cats">${r.por_categoria.map((c) => `
            <button type="button" class="dp-cat ${categoria === c.categoria ? 'sel' : ''}" data-cat="${esc(c.categoria)}">
              <span class="dp-cat-txt"><b>${esc(c.categoria)}</b><small>${c.qtd} lançamento(s)</small></span>
              <span class="dp-cat-valor"><b>${brl(c.valor)}</b><small>${r.total ? Math.round((c.valor / r.total) * 100) : 0}%</small></span>
              <span class="dp-cat-barra"><i style="width:${(c.valor / r.por_categoria[0].valor) * 100}%"></i></span>
            </button>`).join('')}</div>` : '<div class="vazio">Nada lançado no período.</div>'}
          ${r.meses.some((m) => m.valor) ? `<h4 class="dp-sub">Últimos 6 meses</h4>
            ${Graficos.colunas(r.meses.map((m) => ({ rotulo: MESES[Number(m.mes.slice(5)) - 1], valor: m.valor,
    dica: `${MESES[Number(m.mes.slice(5)) - 1]}/${m.mes.slice(0, 4)}: ${brl(m.valor)}` })), { altura: 120 })}` : ''}
        </div>
        <div class="cartao">
          <div class="cabecalho-cartao"><h3 class="titulo-ico">${Icone('prancheta')} Lançamentos${categoria ? ` · ${esc(categoria)}` : ''}</h3>
            ${categoria ? '<button class="btn btn-peq" id="todas">Ver todas</button>' : ''}</div>
          ${lanc.length ? `<div class="tabela-rolagem"><table class="tabela dp-tabela">
            <thead><tr><th>Data</th><th>Descrição</th><th>Para quem</th><th>Categoria</th><th>Pago com</th><th class="r">Valor</th><th></th></tr></thead>
            <tbody>${lanc.map((d) => `<tr>
              <td class="nowrap">${dataBr(d.data).slice(0, 5)}<small class="bloco">${d.data.slice(0, 4)}</small></td>
              <td title="Lançado por ${esc(d.usuario || '—')}"><b class="dsp-desc">${esc(d.descricao)}</b>${d.observacao ? `<small class="bloco">${esc(d.observacao)}</small>` : ''}</td>
              <td>${esc(d.favorecido || '—')}</td>
              <td><span class="dp-chip">${esc(d.categoria || 'Outras')}</span></td>
              <td><small>${d.forma ? FORMA_TXT[d.forma] || d.forma : '—'}${d.sangria_id ? ' · da gaveta' : ''}</small></td>
              <td class="r"><b>${brl(d.valor)}</b></td>
              <td class="r nowrap"><button class="btn-ico" data-editar="${d.id}" title="Editar">${Icone('lapis')}</button>
                <button class="btn-ico" data-apagar="${d.id}" title="Apagar">${Icone('lixeira')}</button></td></tr>`).join('')}</tbody>
            <tfoot><tr><th colspan="5">Total${categoria ? ` em ${esc(categoria)}` : ''}${q ? ' (busca)' : ''}</th><th class="r">${brl(lanc.reduce((a, d) => a + d.valor, 0))}</th><th></th></tr></tfoot>
          </table></div>` : `<div class="vd-vazio">${Ilustracao.svg('recibo', 130)}<b>${r.lancamentos.length ? 'Nada encontrado' : 'Nenhuma despesa no período'}</b><br>
            <small>${r.lancamentos.length ? 'Mude a busca ou a categoria.' : 'Clique em <b>Nova despesa</b> para lançar compras, salários, aluguel…'}</small></div>`}
        </div>
      </div>`;
    el.onclick = async (ev) => {
      const c = ev.target.closest('[data-cat]');
      if (c) { categoria = categoria === c.dataset.cat ? '' : c.dataset.cat; return desenhar(); }
      if (ev.target.closest('#todas')) { categoria = ''; return desenhar(); }
      const ed = ev.target.closest('[data-editar]');
      if (ed) return formulario(r.lancamentos.find((d) => d.id === Number(ed.dataset.editar)), carregar);
      const ap = ev.target.closest('[data-apagar]');
      if (ap) {
        const d = r.lancamentos.find((x) => x.id === Number(ap.dataset.apagar));
        // Some na hora, com "Desfazer" por alguns segundos (sem pergunta antes).
        const linha = ap.closest('.dp-item, tr, li, .dsp-item') || ap.parentElement;
        if (linha) linha.hidden = true;
        U.desfazivel(`Despesa "${d.descricao}" (${brl(d.valor)}) apagada.`, {
          executar: (fechando) => api(`/api/despesas/${d.id}`, { metodo: 'DELETE', keepalive: fechando }),
          aoDesfazer: () => { if (linha) linha.hidden = false; },
          depois: (res) => {
            if (res && res.devolvido_ao_caixa) aviso('O dinheiro dessa despesa voltou para o caixa.');
            atualizarStatusCaixa();
            carregar();
          },
        });
      }
    };
  }

  /**
   * Formulário de despesa (nova ou editar). pre: valores iniciais (ex.: vindo de uma sangria).
   * depois(): chamado depois de salvar.
   */
  async function formulario(d, depois, pre = {}) {
    const editar = !!(d && d.id);
    d = { ...(d || {}), ...pre };
    let caixa = null;
    let favorecidos = [];
    try {
      [caixa, favorecidos] = await Promise.all([
        editar ? null : api('/api/caixa/atual').then((x) => x.caixa).catch(() => null),
        api('/api/despesas/favorecidos').catch(() => []),
      ]);
    } catch { /* segue sem */ }
    const conhecida = CATEGORIAS.some(([c]) => c === d.categoria);
    const corpo = abrirModal(editar ? 'Editar despesa' : 'Nova despesa', `
      <form class="form dsp-form">
        <div class="dsp-cats-btns" id="dsp-cats">${CATEGORIAS.map(([c]) => `<button type="button" class="chip-filtro ${(d.categoria || (editar ? 'Outras' : '')) === c ? 'sel' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}
          <button type="button" class="chip-filtro ${d.categoria && !conhecida ? 'sel' : ''}" data-c="__outra">+ Nova categoria</button></div>
        <input type="hidden" name="categoria" value="${esc(d.categoria || '')}">
        <label id="dsp-outra" ${d.categoria && !conhecida ? '' : 'hidden'}>Nome da categoria<input name="categoria_outra" maxlength="40" value="${esc(d.categoria && !conhecida ? d.categoria : '')}"></label>
        <small class="dica" id="dsp-cat-dica"></small>
        <label>Descrição *<input name="descricao" required value="${esc(d.descricao || '')}" placeholder="Ex.: Salário de outubro, conta de luz, compra da coleção verão"></label>
        <div class="grade-form">
          <label>Valor (R$) *<input name="valor" inputmode="decimal" required value="${d.valor ? U.num(d.valor) : ''}"></label>
          <label>Data<input type="date" name="data" value="${d.data || U.hoje()}" required></label>
        </div>
        <label>Para quem <small>funcionária, fornecedor, empresa…</small><input name="favorecido" maxlength="120" value="${esc(d.favorecido || '')}"></label>
        ${favorecidos.length ? `<div class="dsp-fav" id="dsp-fav">${favorecidos.slice(0, 12).map((f) => `<button type="button" class="chip-preset" data-f="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : ''}
        <div class="dsp-forma"><span>Pagamento</span><div class="segmentos" id="dsp-forma">${FORMAS.map(([k, t]) => `<button type="button" class="segmento ${(d.forma || '') === k ? 'sel' : ''}" data-forma="${k}" ${d.sangria_id && k !== 'dinheiro' ? 'disabled' : ''}>${t}</button>`).join('')}</div></div>
        <input type="hidden" name="forma" value="${esc(d.forma || '')}">
        ${pre.sangria_id ? '<p class="dica">Esta sangria já saiu do caixa: ela vira a despesa, sem tirar dinheiro de novo.</p>' : ''}
        ${!editar && caixa && !pre.sangria_id ? `<label class="check" id="dsp-gaveta" ${d.forma === 'dinheiro' ? '' : 'hidden'}><input type="checkbox" name="do_caixa" ${pre.do_caixa ? 'checked' : ''}>
          Tirei o dinheiro da gaveta do caixa (sai do caixa nº ${caixa.id} como sangria)</label>` : ''}
        <label>Observação<input name="observacao" maxlength="500" value="${esc(d.observacao || '')}" placeholder="Opcional"></label>
        ${editar ? '' : `<label>Repetir todo mês <small>aluguel, salário, internet…</small><select name="repetir">${[1, 2, 3, 6, 12].map((n) => `<option value="${n}">${n === 1 ? 'não repetir' : `por ${n} meses`}</option>`).join('')}</select></label>`}
        <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">${Icone('check')} ${editar ? 'Salvar' : 'Lançar despesa'}</button></div>
      </form>`, { largura: '620px' });
    const form = corpo.querySelector('form');
    const dicaCat = () => {
      const c = CATEGORIAS.find(([n]) => n === form.categoria.value);
      corpo.querySelector('#dsp-cat-dica').textContent = c ? c[1] : '';
    };
    dicaCat();
    corpo.querySelector('#dsp-cats').onclick = (ev) => {
      const b = ev.target.closest('[data-c]');
      if (!b) return;
      corpo.querySelectorAll('#dsp-cats .chip-filtro').forEach((x) => x.classList.toggle('sel', x === b));
      const outra = b.dataset.c === '__outra';
      form.categoria.value = outra ? '' : b.dataset.c;
      corpo.querySelector('#dsp-outra').hidden = !outra;
      if (outra) form.categoria_outra.focus(); else form.descricao.focus();
      dicaCat();
    };
    const fav = corpo.querySelector('#dsp-fav');
    if (fav) fav.onclick = (ev) => { const b = ev.target.closest('[data-f]'); if (b) form.favorecido.value = b.dataset.f; };
    corpo.querySelector('#dsp-forma').onclick = (ev) => {
      const b = ev.target.closest('[data-forma]');
      if (!b || b.disabled) return;
      const mesma = form.forma.value === b.dataset.forma;
      form.forma.value = mesma ? '' : b.dataset.forma;
      corpo.querySelectorAll('#dsp-forma .segmento').forEach((x) => x.classList.toggle('sel', !mesma && x === b));
      const gaveta = corpo.querySelector('#dsp-gaveta');
      if (gaveta) {
        gaveta.hidden = form.forma.value !== 'dinheiro';
        if (gaveta.hidden) form.do_caixa.checked = false;
      }
    };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const f = U.dadosForm(form);
      const valor = U.paraCentavos(f.valor);
      if (!(valor > 0)) return aviso('Valor inválido.', 'erro');
      const cat = corpo.querySelector('#dsp-outra').hidden ? f.categoria : (f.categoria_outra || '').trim();
      if (!cat) return aviso('Escolha a categoria (ou digite o nome em "Outra").', 'alerta');
      const dadosEnvio = {
        descricao: f.descricao, categoria: cat, valor, data: f.data, forma: f.forma || null,
        favorecido: f.favorecido, observacao: f.observacao,
      };
      try {
        if (editar) {
          await api(`/api/despesas/${d.id}`, { metodo: 'PUT', corpo: dadosEnvio });
          aviso('Despesa atualizada.');
        } else {
          const r = await api('/api/despesas', { metodo: 'POST', corpo: { ...dadosEnvio, repetir: Number(f.repetir || 1), do_caixa: !!f.do_caixa, sangria_id: pre.sangria_id || undefined } });
          aviso(r.lancadas > 1 ? `${r.lancadas} despesas lançadas (uma por mês).` : r.do_caixa ? 'Despesa lançada e retirada do caixa.' : 'Despesa lançada.');
          if (r.do_caixa) atualizarStatusCaixa();
        }
        fecharModal();
        if (depois) depois();
      } catch (e) { erro(e); }
    };
  }

  return { abrir, formulario, sair: () => { raiz = null; } };
})();
