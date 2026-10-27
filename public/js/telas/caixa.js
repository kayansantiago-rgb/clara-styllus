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
    if (raiz !== el) return; // saiu da tela enquanto carregava
    raiz.innerHTML = `
      <div class="cabecalho-tela"><div><h1>Caixa</h1><p class="subtitulo">Abertura, sangria, suprimento e fechamento do dia.</p></div></div>
      ${atual.caixa ? painel(atual) : formAbrir()}
      <div class="cartao">
        <h3 class="titulo-ico">${Icone('relogio')} Caixas anteriores</h3>
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
    form.onsubmit = U.umaVez(form, async (ev) => {
      ev.preventDefault();
      const valor = U.paraCentavos(form.valor.value);
      if (Number.isNaN(valor) || valor < 0) return aviso('Valor inválido.', 'erro');
      try {
        await api('/api/caixa/abrir', { metodo: 'POST', corpo: { valor_abertura: valor } });
        aviso('Caixa aberto. Boas vendas!');
        aoAbrir();
      } catch (e) { erro(e); }
    });
  }

  // -------------------------------------------------------------- painel
  const COR_FORMA = { dinheiro: '#2f9e6a', pix: '#16a596', debito: '#2f5fa8', credito: '#7a49a6', crediario: '#b06d80', vale: '#c99a3e', outro: '#7a6d74' };

  function painel(r) {
    const troco = r.vendas.troco;
    const recebido = (r.recebimentos_crediario || []).reduce((a, f) => a + f.valor, 0);
    const horas = Math.max(0, Math.round((Date.now() - new Date(r.caixa.aberto_em.replace(' ', 'T')).getTime()) / 36e5));
    return `
      <div class="cx-topo">
        <div class="cx-esperado">
          <small>${Icone('dinheiro')} Dinheiro que deve ter na gaveta</small>
          <b>${brl(r.dinheiro_esperado)}</b>
          <span>Caixa nº ${r.caixa.id} · aberto ${dataHora(r.caixa.aberto_em)} (${horas}h) por ${esc(r.caixa.operador || '—')}</span>
        </div>
        <div class="cx-botoes">
          <button class="cx-botao" id="sangria">${Icone('retirar')}<b>Sangria</b><small>retirar dinheiro</small></button>
          <button class="cx-botao" id="suprimento">${Icone('colocar')}<b>Suprimento</b><small>colocar troco</small></button>
          <button class="cx-botao" id="gaveta">${Icone('gaveta')}<b>Abrir gaveta</b><small>sem venda</small></button>
          <button class="cx-botao" id="parcial">${Icone('impressora')}<b>Parcial</b><small>imprimir resumo</small></button>
          <button class="cx-botao perigo" id="fechar">${Icone('cadeado')}<b>Fechar caixa</b><small>contar e encerrar o dia</small></button>
        </div>
      </div>
      <div class="vd-kpis">
        <div class="vd-kpi"><span>${Icone('recibo')} Vendas</span><b>${r.vendas.quantidade}</b><small>${r.vendas.canceladas ? `${r.vendas.canceladas} cancelada(s)` : 'nenhuma cancelada'}</small></div>
        <div class="vd-kpi"><span>${Icone('carteira')} Total vendido</span><b>${brl(r.vendas.total)}</b><small>ticket ${brl(r.vendas.quantidade ? Math.round(r.vendas.total / r.vendas.quantidade) : 0)}</small></div>
        <div class="vd-kpi"><span>${Icone('etiqueta')} Descontos</span><b>${brl(r.vendas.desconto)}</b><small>dados nas vendas</small></div>
        <div class="vd-kpi"><span>${Icone('caderno')} Crediário recebido</span><b>${brl(recebido)}</b><small>parcelas pagas neste caixa</small></div>
      </div>
      <div class="rl-grade">
        <div class="cartao"><h3 class="titulo-ico">${Icone('cartao')} Como entrou o dinheiro</h3>
          ${Graficos.rosca(r.formas.map((f) => ({ nome: rotulo(f.forma), valor: f.forma === 'dinheiro' ? f.valor - troco : f.valor, cor: COR_FORMA[f.forma] || '#4a3aa7' })), { centro: 'Vendido' })}</div>
        <div class="cartao"><h3 class="titulo-ico">${Icone('gaveta')} Movimento da gaveta</h3>
          <div class="cx-mov">
            <div class="linha"><span>Troco inicial</span><b>${brl(r.caixa.valor_abertura)}</b></div>
            <div class="linha"><span>Vendas em dinheiro (já sem o troco)</span><b>${brl((r.formas.find((f) => f.forma === 'dinheiro')?.valor || 0) - troco)}</b></div>
            ${(r.sinais_reserva || []).find((f) => f.forma === 'dinheiro') ? `<div class="linha"><span>Sinais de reserva em dinheiro</span><b>${brl(r.sinais_reserva.find((f) => f.forma === 'dinheiro').valor)}</b></div>` : ''}
            ${recebido ? `<div class="linha"><span>Crediário recebido em dinheiro</span><b>${brl((r.recebimentos_crediario || []).find((f) => f.forma === 'dinheiro')?.valor || 0)}</b></div>` : ''}
            ${r.movimentos.map((m) => `<div class="linha cx-${m.tipo}"><span>${m.tipo === 'sangria' ? 'Sangria' : 'Suprimento'} · ${esc(m.motivo || 'sem motivo')}</span><b>${m.tipo === 'sangria' ? '−' : '+'}${brl(m.valor)}</b></div>`).join('')}
            <div class="linha total"><span>Esperado na gaveta</span><b>${brl(r.dinheiro_esperado)}</b></div>
          </div>
        </div>
      </div>`;
  }

  function movimento(tipo, aoConcluir) {
    const sang = tipo === 'sangria';
    const corpo = abrirModal(sang ? 'Sangria' : 'Suprimento', `
      <form class="form mv">
        <div class="mv-cab ${sang ? 'sangria' : ''}">${Icone(sang ? 'retirar' : 'colocar')}<span>${sang ? 'Retirar dinheiro da gaveta (depósito, pagamento…)' : 'Colocar dinheiro na gaveta (reforço de troco)'}</span></div>
        <label>Valor<div class="campo-moeda"><span>R$</span><input name="valor" inputmode="decimal" required autofocus class="campo-destaque" placeholder="0,00"></div></label>
        <label>Motivo<input name="motivo" placeholder="${sang ? 'Ex.: depósito no banco, pagamento de fornecedor' : 'Ex.: troco do banco'}"></label>
        <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">${Icone('check')} Lançar ${sang ? 'sangria' : 'suprimento'}</button></div>
      </form>`, { largura: '440px' });
    const fMov = corpo.querySelector('form');
    fMov.onsubmit = U.umaVez(fMov, async (ev) => {
      ev.preventDefault();
      const valor = U.paraCentavos(ev.target.valor.value);
      if (!(valor > 0)) return aviso('Valor inválido.', 'erro');
      try {
        await api('/api/caixa/movimento', { metodo: 'POST', corpo: { tipo, valor, motivo: ev.target.motivo.value } });
        aviso('Lançado.');
        fecharModal();
        if (aoConcluir) aoConcluir();
      } catch (e) { erro(e); }
    });
  }

  async function fechar(r, aoConcluir) {
    if (!r) {
      try { r = await api('/api/caixa/atual'); } catch (e) { return erro(e); }
      if (!r.caixa) return aviso('O caixa já está fechado.', 'alerta');
    }
    const NOTAS = [20000, 10000, 5000, 2000, 1000, 500, 200];
    const MOEDAS = [100, 50, 25, 10, 5];
    const nomeValor = (v) => (v >= 100 ? `R$ ${v / 100}` : `R$ 0,${String(v).padStart(2, '0')}`);
    const linhaContagem = (v) => `
      <div class="fc-linha ${v < 200 ? 'moeda' : ''}">
        <span class="fc-valor">${nomeValor(v)}</span>
        <div class="fc-passo">
          <button type="button" class="fc-mm" data-menos="${v}" tabindex="-1" aria-label="menos">−</button>
          <input type="text" inputmode="numeric" maxlength="4" data-v="${v}" placeholder="0" aria-label="Quantidade de ${nomeValor(v)}">
          <button type="button" class="fc-mm" data-mais="${v}" tabindex="-1" aria-label="mais">+</button>
        </div>
        <small class="fc-sub" data-sub="${v}">—</small>
      </div>`;
    // Resumo: o que tem que estar na gaveta (dinheiro) e o que fica fora (cartão, PIX…).
    const din = (f) => f.forma === 'dinheiro';
    const vendasDinheiro = (r.formas.find(din)?.valor || 0) - r.vendas.troco;
    const credDin = (r.recebimentos_crediario || []).filter(din).reduce((a, f) => a + f.valor, 0);
    const sinalDin = (r.sinais_reserva || []).filter(din).reduce((a, f) => a + f.valor, 0);
    const suprimentos = r.movimentos.filter((m) => m.tipo === 'suprimento');
    const sangrias = r.movimentos.filter((m) => m.tipo === 'sangria');
    const fora = [
      ...r.formas.filter((f) => !din(f)).map((f) => [rotulo(f.forma), f.valor, COR_FORMA[f.forma] || '#4a3aa7']),
      ...(r.recebimentos_crediario || []).filter((f) => !din(f)).map((f) => [`Crediário recebido · ${U.FORMAS[f.forma] || f.forma}`, f.valor, '#d98a9e']),
      ...(r.sinais_reserva || []).filter((f) => !din(f)).map((f) => [`Sinal de reserva · ${U.FORMAS[f.forma] || f.forma}`, f.valor, '#4a3aa7']),
    ];
    const linha = (rot, valor, extra = '') => `<div class="linha ${extra}"><span>${rot}</span><span>${valor}</span></div>`;
    const corpo = abrirModal('Fechar o caixa', `
      <form class="fc fc2">
        <div class="fc-contar">
          <div class="p4-passo"><span>1</span>Conte o dinheiro da gaveta</div>
          <p class="dica">Digite quantas notas e moedas tem de cada valor (Enter passa para a próxima). O sistema soma.</p>
          <div class="fc-colunas">
            <div class="fc-lista"><h4>Notas</h4>${NOTAS.map(linhaContagem).join('')}</div>
            <div class="fc-lista"><h4>Moedas</h4>${MOEDAS.map(linhaContagem).join('')}
              <button type="button" class="link fc-limpar" id="fc-limpar">Limpar contagem</button></div>
          </div>
          <label class="fc-total"><span>Total contado <small>preenche sozinho, ou digite o total direto</small></span>
            <div class="campo-moeda"><span>R$</span><input name="valor" inputmode="decimal" required class="campo-destaque" placeholder="0,00"></div></label>
        </div>
        <div class="fc-resumo">
          <div class="p4-passo"><span>2</span>Confira e feche</div>
          <div class="fc-bloco">
            <h4>${Icone('gaveta')} Na gaveta (dinheiro)</h4>
            ${linha('Troco inicial', brl(r.caixa.valor_abertura))}
            ${linha('Vendas em dinheiro <small>(já sem o troco)</small>', brl(vendasDinheiro))}
            ${credDin ? linha('Crediário recebido', `+ ${brl(credDin)}`) : ''}
            ${sinalDin ? linha('Sinais de reserva', `+ ${brl(sinalDin)}`) : ''}
            ${suprimentos.map((m) => linha(`Suprimento ${m.motivo ? `<small>${esc(m.motivo)}</small>` : ''}`, `+ ${brl(m.valor)}`)).join('')}
            ${sangrias.map((m) => linha(`Sangria ${m.motivo ? `<small>${esc(m.motivo)}</small>` : ''}`, `− ${brl(m.valor)}`, 'fc-menos')).join('')}
            ${linha('<b>Esperado na gaveta</b>', `<b>${brl(r.dinheiro_esperado)}</b>`, 'total')}
          </div>
          ${fora.length ? `<div class="fc-bloco fc-fora">
            <h4>${Icone('cartao')} Fora da gaveta <small>confira na maquininha e no banco</small></h4>
            ${fora.map(([rot, v, cor]) => linha(`<i class="fc-ponto" style="background:${cor}"></i>${rot}`, brl(v))).join('')}
          </div>` : ''}
          <p class="fc-vendas">${r.vendas.quantidade} venda(s) no caixa · ${brl(r.vendas.total)}</p>
          <div class="fc-dif" id="dif"><small>Diferença</small><b>—</b><span>Conte o dinheiro para ver se bate.</span></div>
          <input name="obs" class="fc-obs" maxlength="300" placeholder="Observação (opcional) — ex.: faltou R$ 2 de troco">
          <button class="btn btn-perigo btn-grande">${Icone('cadeado')} Fechar caixa e imprimir</button>
        </div>
      </form>`, { largura: '1000px' });
    const form = corpo.querySelector('form');
    const atualizarDif = () => {
      const v = U.paraCentavos(form.valor.value);
      const box = corpo.querySelector('#dif');
      if (Number.isNaN(v) || !form.valor.value) {
        box.className = 'fc-dif';
        box.innerHTML = '<small>Diferença</small><b>—</b><span>Conte o dinheiro para ver se bate.</span>';
        return;
      }
      const d = v - r.dinheiro_esperado;
      box.className = `fc-dif ${d === 0 ? 'ok' : d < 0 ? 'falta' : 'sobra'}`;
      box.innerHTML = d === 0 ? `<small>Diferença</small><b>${Icone('check')} Caixa batendo</b><span>O dinheiro contado é igual ao esperado.</span>`
        : `<small>${d < 0 ? 'Está faltando' : 'Está sobrando'}</small><b>${brl(Math.abs(d))}</b><span>Contado ${brl(v)} · esperado ${brl(r.dinheiro_esperado)}</span>`;
    };
    form.querySelectorAll('[data-v]').forEach((inp) => {
      inp.oninput = () => {
        let total = 0;
        form.querySelectorAll('[data-v]').forEach((x) => {
          const n = Math.max(0, Number(x.value) || 0);
          total += n * Number(x.dataset.v);
          const sub = form.querySelector(`[data-sub="${x.dataset.v}"]`);
          sub.textContent = n ? brl(n * Number(x.dataset.v)) : '—';
          sub.closest('.fc-linha').classList.toggle('tem', !!n);
        });
        form.valor.value = U.num(total);
        atualizarDif();
      };
    });
    form.valor.oninput = atualizarDif;
    const somar = () => form.querySelector('[data-v]').oninput();
    form.querySelectorAll('[data-v]').forEach((x) => {
      x.addEventListener('beforeinput', (e) => { if (e.data && /\D/.test(e.data)) e.preventDefault(); });
    });
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mais],[data-menos]');
      if (b) {
        const inp = form.querySelector(`[data-v="${b.dataset.mais || b.dataset.menos}"]`);
        inp.value = Math.max(0, (Number(inp.value) || 0) + (b.dataset.mais ? 1 : -1)) || '';
        somar();
        return;
      }
      if (e.target.closest('#fc-limpar')) {
        form.querySelectorAll('[data-v]').forEach((x) => { x.value = ''; });
        somar();
        form.valor.value = '';
        atualizarDif();
        form.querySelector('[data-v]').focus();
      }
    });
    // Na contagem, Enter passa para a próxima nota/moeda (não fecha o caixa no meio da contagem).
    const contagem = [...form.querySelectorAll('[data-v]')];
    contagem.forEach((inp, i) => {
      inp.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        (contagem[i + 1] || form.obs).focus();
      };
    });
    setTimeout(() => form.querySelector('[data-v]').focus(), 50);
    form.onsubmit = U.umaVez(form, async (ev) => {
      ev.preventDefault();
      const valor = U.paraCentavos(form.valor.value);
      if (Number.isNaN(valor) || valor < 0) return aviso('Valor inválido.', 'erro');
      // Com diferença, pede um segundo clique (o botão muda de texto) antes de fechar.
      const d = valor - r.dinheiro_esperado;
      const botao = form.querySelector('.btn-perigo');
      if (d && form.dataset.confirmado !== String(valor)) {
        form.dataset.confirmado = String(valor);
        botao.innerHTML = `${Icone('alerta')} ${d < 0 ? 'Falta' : 'Sobra'} ${brl(Math.abs(d))} — clique de novo para fechar assim`;
        aviso(`${d < 0 ? 'Está faltando' : 'Está sobrando'} ${brl(Math.abs(d))}. Confira a contagem ou clique de novo para fechar assim.`, 'alerta');
        return;
      }
      try {
        const fechado = await api('/api/caixa/fechar', { metodo: 'POST', corpo: { valor_informado: valor, observacao: form.obs.value } });
        fecharModal();
        aviso(fechado.backup && fechado.backup.ok ? 'Caixa fechado e backup feito.' : 'Caixa fechado.');
        if (fechado.backup && fechado.backup.aviso) aviso(fechado.backup.aviso, 'alerta');
        Impressao.fechamentoCaixa(fechado);
        if (aoConcluir) aoConcluir();
      } catch (e) { erro(e); }
    });
  }

  return { abrir, movimento, fechar, formAbrir, ligarFormAbrir, sair: () => { raiz = null; } };
})();
