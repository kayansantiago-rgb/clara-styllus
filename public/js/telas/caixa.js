/* Caixa: abertura, sangria, suprimento e fechamento (as janelas também são usadas no PDV). */
Telas.caixa = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;

  /** Nome da forma no resumo do caixa (crediário não entra dinheiro na hora). */
  const rotulo = (f) => (f === 'crediario' ? 'Crediário (a receber)' : U.FORMAS[f] || f);

  const recarregar = () => {
    atualizarStatusCaixa();
    if (raiz) abrir(raiz);
  };

  async function abrir(el) {
    raiz = el;
    const [atual, historico] = await Promise.all([api('/api/caixa/atual'), api('/api/caixas')]);
    raiz.innerHTML = `
      <div class="cabecalho-tela"><h1>Caixa</h1></div>
      ${atual.caixa ? painel(atual) : formAbrir()}
      <div class="cartao">
        <h3>Caixas anteriores</h3>
        <table class="tabela">
          <thead><tr><th>Nº</th><th>Operador(a)</th><th>Abertura</th><th>Fechamento</th><th></th></tr></thead>
          <tbody id="hist">${historico.map((c) => `
            <tr><td>${c.id}</td><td>${esc(c.operador || '')}</td><td>${dataHora(c.aberto_em)}</td>
            <td>${c.fechado_em ? dataHora(c.fechado_em) : '<span class="selo ok">Aberto</span>'}</td>
            <td class="r"><button class="btn-ico" data-imp="${c.id}" title="Imprimir resumo">${Icone('impressora')}</button></td></tr>`).join('')}</tbody>
        </table>
      </div>`;
    raiz.querySelector('#hist').onclick = async (ev) => {
      const b = ev.target.closest('[data-imp]');
      if (!b) return;
      try { Impressao.fechamentoCaixa(await api(`/api/caixas/${b.dataset.imp}`)); } catch (e) { erro(e); }
    };
    if (atual.caixa) {
      raiz.querySelector('#sangria').onclick = () => movimento('sangria', recarregar);
      raiz.querySelector('#suprimento').onclick = () => movimento('suprimento', recarregar);
      raiz.querySelector('#parcial').onclick = () => Impressao.fechamentoCaixa(atual);
      raiz.querySelector('#gaveta').onclick = () => Impressao.abrirGaveta();
      raiz.querySelector('#fechar').onclick = () => fechar(atual, recarregar);
    } else {
      ligarFormAbrir(raiz, recarregar);
    }
  }

  // --------------------------------------------------------------- abrir
  function formAbrir() {
    return `
      <div class="cartao caixa-abrir">
        <div class="caixa-abrir-ico">${Icone('carteira')}</div>
        <h2>Caixa fechado</h2>
        <p>Conte o dinheiro que está na gaveta (o troco) e abra o caixa para começar a vender.</p>
        <form id="f-abrir" class="form">
          <div class="caixa-abrir-op"><span class="avatar">${esc(String(U.sessao.usuario.nome || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase())}</span>
            <span><small>Operador(a)</small><b>${esc(U.sessao.usuario.nome)}</b></span>
            <span class="caixa-abrir-data">${new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span></div>
          <label>Troco inicial na gaveta<div class="campo-moeda"><span>R$</span><input name="valor" inputmode="decimal" placeholder="0,00" autofocus class="campo-destaque"></div></label>
          <button class="btn btn-primario btn-grande">${Icone('cadeado')} Abrir caixa</button>
        </form>
      </div>`;
  }

  function ligarFormAbrir(el, aoAbrir) {
    const form = el.querySelector('#f-abrir');
    form.valor.focus();
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const valor = U.paraCentavos(form.valor.value);
      if (Number.isNaN(valor) || valor < 0) return aviso('Valor inválido.', 'erro');
      try {
        await api('/api/caixa/abrir', { metodo: 'POST', corpo: { valor_abertura: valor } });
        aviso('Caixa aberto. Boas vendas!');
        aoAbrir();
      } catch (e) { erro(e); }
    };
  }

  // -------------------------------------------------------------- painel
  function painel(r) {
    const troco = r.vendas.troco;
    const recebido = (r.recebimentos_crediario || []).reduce((a, f) => a + f.valor, 0);
    return `
      <div class="cartao">
        <div class="caixa-topo">
          <h3>🔓 Caixa nº ${r.caixa.id} — aberto em ${dataHora(r.caixa.aberto_em)} por ${esc(r.caixa.operador || '—')}</h3>
        </div>
        <div class="cards">
          <div class="card destaque"><small>Dinheiro esperado na gaveta</small><b>${brl(r.dinheiro_esperado)}</b></div>
          <div class="card"><small>Vendas</small><b>${r.vendas.quantidade}</b></div>
          <div class="card"><small>Total vendido</small><b>${brl(r.vendas.total)}</b></div>
          ${r.formas.map((f) => `<div class="card"><small>${rotulo(f.forma)}</small><b>${brl(f.forma === 'dinheiro' ? f.valor - troco : f.valor)}</b></div>`).join('')}
          ${recebido ? `<div class="card"><small>Recebido do crediário</small><b>${brl(recebido)}</b></div>` : ''}
        </div>
        ${r.movimentos.length ? `<h4>Sangrias e suprimentos</h4>${r.movimentos.map((m) =>
    `<div class="linha"><span>${dataHora(m.criado_em)} · ${m.tipo === 'sangria' ? 'Sangria' : 'Suprimento'} ${esc(m.motivo || '')}</span><span>${m.tipo === 'sangria' ? '-' : '+'}${brl(m.valor)}</span></div>`).join('')}` : ''}
        <div class="acoes">
          <button class="btn" id="sangria">➖ Sangria</button>
          <button class="btn" id="suprimento">➕ Suprimento</button>
          <button class="btn" id="gaveta">🗄️ Abrir gaveta</button>
          <button class="btn" id="parcial">🖨️ Imprimir parcial</button>
          <button class="btn btn-perigo" id="fechar">🔒 Fechar caixa</button>
        </div>
      </div>`;
  }

  function movimento(tipo, aoConcluir) {
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
        if (aoConcluir) aoConcluir();
      } catch (e) { erro(e); }
    };
  }

  async function fechar(r, aoConcluir) {
    if (!r) {
      try { r = await api('/api/caixa/atual'); } catch (e) { return erro(e); }
      if (!r.caixa) return aviso('O caixa já está fechado.', 'alerta');
    }
    const corpo = abrirModal('Fechar caixa', `
      <div class="resumo-fechar">
        <div class="linha"><span>Vendas</span><b>${r.vendas.quantidade} · ${brl(r.vendas.total)}</b></div>
        ${r.formas.map((f) => `<div class="linha"><span>${rotulo(f.forma)}</span><span>${brl(f.forma === 'dinheiro' ? f.valor - r.vendas.troco : f.valor)}</span></div>`).join('')}
        ${(r.recebimentos_crediario || []).map((f) => `<div class="linha"><span>Recebido do crediário · ${U.FORMAS[f.forma] || f.forma}</span><span>${brl(f.valor)}</span></div>`).join('')}
        ${r.movimentos.map((m) => `<div class="linha"><span>${m.tipo === 'sangria' ? 'Sangria' : 'Suprimento'} ${esc(m.motivo || '')}</span><span>${m.tipo === 'sangria' ? '-' : '+'}${brl(m.valor)}</span></div>`).join('')}
        <div class="linha"><span>Troco inicial</span><span>${brl(r.caixa.valor_abertura)}</span></div>
        <div class="linha total"><span>Dinheiro esperado na gaveta</span><b>${brl(r.dinheiro_esperado)}</b></div>
      </div>
      <form class="form">
        <label>Dinheiro contado na gaveta (R$)<input name="valor" inputmode="decimal" required autofocus></label>
        <div id="dif" class="dica"></div>
        <label>Observação<textarea name="obs" rows="2"></textarea></label>
        <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-perigo">🔒 Fechar e imprimir</button></div>
      </form>`, { largura: '480px' });
    const form = corpo.querySelector('form');
    form.valor.oninput = () => {
      const v = U.paraCentavos(form.valor.value);
      const d = v - r.dinheiro_esperado;
      corpo.querySelector('#dif').innerHTML = Number.isNaN(v) || !form.valor.value ? '' : d === 0 ? '✅ Caixa batendo.'
        : `Diferença: <b class="${d < 0 ? 'txt-perigo' : ''}">${d > 0 ? 'sobra de ' : 'falta de '}${brl(Math.abs(d))}</b>`;
    };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const valor = U.paraCentavos(form.valor.value);
      if (Number.isNaN(valor) || valor < 0) return aviso('Valor inválido.', 'erro');
      try {
        const fechado = await api('/api/caixa/fechar', { metodo: 'POST', corpo: { valor_informado: valor, observacao: form.obs.value } });
        fecharModal();
        aviso(fechado.backup && fechado.backup.ok ? 'Caixa fechado e backup feito. ✅' : 'Caixa fechado.');
        if (fechado.backup && fechado.backup.aviso) aviso(fechado.backup.aviso, 'alerta');
        Impressao.fechamentoCaixa(fechado);
        if (aoConcluir) aoConcluir();
      } catch (e) { erro(e); }
    };
  }

  return { abrir, movimento, fechar, formAbrir, ligarFormAbrir, sair: () => { raiz = null; } };
})();
