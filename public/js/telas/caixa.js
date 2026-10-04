/* Caixa: abertura, sangria, suprimento e fechamento. */
Telas.caixa = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;

  async function abrir(el) {
    raiz = el;
    const [atual, historico] = await Promise.all([api('/api/caixa/atual'), api('/api/caixas')]);
    raiz.innerHTML = `
      <div class="cabecalho-tela"><h1>Caixa</h1></div>
      ${atual.caixa ? painel(atual) : `
        <div class="cartao cartao-estreito">
          <p>O caixa está fechado.</p>
          <a class="btn btn-primario" href="#/pdv">Abrir caixa na tela de venda</a>
        </div>`}
      <div class="cartao">
        <h3>Caixas anteriores</h3>
        <table class="tabela">
          <thead><tr><th>Nº</th><th>Operador(a)</th><th>Abertura</th><th>Fechamento</th><th></th></tr></thead>
          <tbody id="hist">${historico.map((c) => `
            <tr><td>${c.id}</td><td>${esc(c.operador || '')}</td><td>${dataHora(c.aberto_em)}</td>
            <td>${c.fechado_em ? dataHora(c.fechado_em) : '<span class="selo ok">Aberto</span>'}</td>
            <td class="r"><button class="btn-ico" data-imp="${c.id}" title="Imprimir resumo">🖨️</button></td></tr>`).join('')}</tbody>
        </table>
      </div>`;
    raiz.querySelector('#hist').onclick = async (ev) => {
      const b = ev.target.closest('[data-imp]');
      if (!b) return;
      try { Impressao.fechamentoCaixa(await api(`/api/caixas/${b.dataset.imp}`)); } catch (e) { erro(e); }
    };
    if (atual.caixa) {
      raiz.querySelector('#sangria').onclick = () => movimento('sangria');
      raiz.querySelector('#suprimento').onclick = () => movimento('suprimento');
      raiz.querySelector('#parcial').onclick = () => Impressao.fechamentoCaixa(atual);
      raiz.querySelector('#fechar').onclick = () => fechar(atual);
    }
  }

  function painel(r) {
    return `
      <div class="cartao">
        <h3>Caixa nº ${r.caixa.id} — aberto em ${dataHora(r.caixa.aberto_em)} por ${esc(r.caixa.operador || '—')}</h3>
        <div class="cards">
          <div class="card"><small>Vendas</small><b>${r.vendas.quantidade}</b></div>
          <div class="card"><small>Total vendido</small><b>${brl(r.vendas.total)}</b></div>
          <div class="card"><small>Dinheiro esperado na gaveta</small><b>${brl(r.dinheiro_esperado)}</b></div>
          ${r.formas.map((f) => `<div class="card"><small>${U.FORMAS[f.forma] || f.forma}</small><b>${brl(f.forma === 'dinheiro' ? f.valor - r.vendas.troco : f.valor)}</b></div>`).join('')}
        </div>
        ${r.movimentos.length ? `<h4>Sangrias e suprimentos</h4>${r.movimentos.map((m) =>
    `<div class="linha"><span>${dataHora(m.criado_em)} · ${m.tipo === 'sangria' ? 'Sangria' : 'Suprimento'} ${esc(m.motivo || '')}</span><span>${m.tipo === 'sangria' ? '-' : '+'}${brl(m.valor)}</span></div>`).join('')}` : ''}
        <div class="acoes">
          <button class="btn" id="sangria">➖ Sangria (retirada)</button>
          <button class="btn" id="suprimento">➕ Suprimento (reforço)</button>
          <button class="btn" id="parcial">🖨️ Imprimir parcial</button>
          <button class="btn btn-primario" id="fechar">Fechar caixa</button>
        </div>
      </div>`;
  }

  function movimento(tipo) {
    const corpo = abrirModal(tipo === 'sangria' ? 'Sangria (retirada de dinheiro)' : 'Suprimento (reforço de troco)', `
      <form class="form">
        <label>Valor (R$)<input name="valor" inputmode="decimal" required autofocus></label>
        <label>Motivo<input name="motivo" placeholder="${tipo === 'sangria' ? 'Ex.: depósito, pagamento de fornecedor' : 'Ex.: troco'}"></label>
        <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">Lançar</button></div>
      </form>`, { largura: '420px' });
    corpo.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      const valor = U.paraCentavos(ev.target.valor.value);
      if (!(valor > 0)) return aviso('Valor inválido.', 'erro');
      try {
        await api('/api/caixa/movimento', { metodo: 'POST', corpo: { tipo, valor, motivo: ev.target.motivo.value } });
        aviso('Lançado.');
        fecharModal();
        if (raiz) abrir(raiz);
      } catch (e) { erro(e); }
    };
  }

  function fechar(r) {
    const corpo = abrirModal('Fechar caixa', `
      <p>Conte o dinheiro da gaveta e informe o valor. O sistema espera <b>${brl(r.dinheiro_esperado)}</b>.</p>
      <form class="form">
        <label>Dinheiro contado (R$)<input name="valor" inputmode="decimal" required autofocus></label>
        <div id="dif" class="dica"></div>
        <label>Observação<textarea name="obs" rows="2"></textarea></label>
        <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">Fechar e imprimir</button></div>
      </form>`, { largura: '460px' });
    const form = corpo.querySelector('form');
    form.valor.oninput = () => {
      const v = U.paraCentavos(form.valor.value);
      const d = v - r.dinheiro_esperado;
      corpo.querySelector('#dif').innerHTML = Number.isNaN(v) ? '' : d === 0 ? '✅ Caixa batendo.'
        : `Diferença: <b class="${d < 0 ? 'txt-perigo' : ''}">${d > 0 ? 'sobra de ' : 'falta de '}${brl(Math.abs(d))}</b>`;
    };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const valor = U.paraCentavos(form.valor.value);
      if (Number.isNaN(valor) || valor < 0) return aviso('Valor inválido.', 'erro');
      try {
        const fechado = await api('/api/caixa/fechar', { metodo: 'POST', corpo: { valor_informado: valor, observacao: form.obs.value } });
        fecharModal();
        Impressao.fechamentoCaixa(fechado);
        aviso('Caixa fechado.');
        atualizarStatusCaixa();
        if (raiz) abrir(raiz);
      } catch (e) { erro(e); }
    };
  }

  return { abrir, sair: () => { raiz = null; } };
})();
