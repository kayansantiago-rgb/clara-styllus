/* Crediário: quem está devendo, parcelas, recebimentos e débitos antigos. */
Telas.crediario = (() => {
  /** Foto da cliente (quando tem) ou as iniciais. */
  const avatarCli = (c) => (c.foto_versao
    ? `<img class="avatar cl-foto" src="/api/clientes/${c.id}/foto?v=${c.foto_versao}" alt="" loading="lazy">`
    : `<span class="avatar">${U.esc(String(c.nome || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase())}</span>`);
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;
  let lista = [];
  let situacao = 'abertos'; // 'abertos' ou 'quitados'

  const dataBr = (d) => (d ? d.split('-').reverse().join('/') : '');
  const diasAte = (d) => Math.round((Date.parse(d + 'T00:00') - Date.parse(U.hoje() + 'T00:00')) / 864e5);

  /** Semáforo: vermelho = atrasado, amarelo = vence em até 7 dias, verde = em dia. */
  function semaforo(vencido, proximo, diasAtraso) {
    if (vencido > 0) return { cor: 'vermelho', txt: `atrasado ${diasAtraso} dia${diasAtraso === 1 ? '' : 's'}` };
    const n = proximo ? diasAte(proximo) : 99;
    if (n <= 7) return { cor: 'amarelo', txt: n === 0 ? 'vence hoje' : `vence em ${n} dia${n === 1 ? '' : 's'}` };
    return { cor: 'verde', txt: 'em dia' };
  }
  const selo = (s) => `<span class="semaforo ${s.cor}"><i></i>${s.txt}</span>`;

  async function abrir(el) {
    raiz = el;
    if (/[?&]aba=cobrar/.test(location.hash)) situacao = 'cobrar';
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Crediário</h1><p class="subtitulo">Quem está devendo, parcelas, recebimentos e cobrança.</p></div>
        <div class="ferramentas">
          <button class="btn so-admin" id="lancar">${Icone('mais')} Lançar débito antigo</button>
        </div>
      </div>
      <div class="vd-kpis cr-kpis" id="resumo"></div>
      <div class="vd-barra-filtros">
        <div class="segmentos" id="situacao">
          <button class="segmento ${situacao === 'abertos' ? 'sel' : ''}" data-sit="abertos">Em aberto</button>
          <button class="segmento ${situacao === 'cobrar' ? 'sel' : ''}" data-sit="cobrar">${Icone('whatsapp')} Cobrar hoje <span class="cr-n" id="cr-n-cobrar"></span></button>
          <button class="segmento ${situacao === 'quitados' ? 'sel' : ''}" data-sit="quitados">${Icone('check')} Quitados</button>
        </div>
        <div class="busca-ico pr-busca">${Icone('busca')}<input id="q" type="search" placeholder="Nome, CPF ou telefone" autofocus autocomplete="off"></div>
        <label class="interruptor vd-canceladas"><input type="checkbox" id="atraso"><span class="trilho"></span><span class="txt"><b>Só quem está em atraso</b></span></label>
        <span class="semaforo-legenda">${selo({ cor: 'verde', txt: 'em dia' })}${selo({ cor: 'amarelo', txt: 'vence em 7 dias' })}${selo({ cor: 'vermelho', txt: 'atrasado' })}</span>
      </div>
      <div class="cr-lista" id="lista"></div>`;
    raiz.querySelector('#q').addEventListener('input', U.debounce(carregar));
    raiz.querySelector('#atraso').onchange = carregar;
    raiz.querySelector('#situacao').onclick = (ev) => {
      const b = ev.target.closest('[data-sit]');
      if (!b) return;
      situacao = b.dataset.sit;
      raiz.querySelectorAll('#situacao .segmento').forEach((x) => x.classList.toggle('sel', x === b));
      carregar();
    };
    raiz.querySelector('#lancar').onclick = () => escolherClienteParaDebito();
    // Cobrança em fila: depois de mandar no WhatsApp, registra e passa para a próxima.
    raiz.querySelector('#lista').addEventListener('zap-enviado', async (ev) => {
      const linha = ev.target.closest('[data-cobrar]');
      if (!linha) return;
      try { await api('/api/crediario/cobrancas', { metodo: 'POST', corpo: { cliente_id: Number(linha.dataset.cobrar) } }); } catch (e) { return erro(e); }
      linha.classList.add('cobrada');
      linha.querySelector('.cb-quando').innerHTML = `${Icone('check')} cobrada agora`;
      const prox = [...raiz.querySelectorAll('.cb-linha:not(.cobrada) [data-zap]')][0];
      if (prox) prox.focus();
      atualizarContagemCobrar();
    });
    raiz.querySelector('#lista').onclick = (ev) => {
      if (ev.target.closest('[data-zap]')) return; // o WhatsApp cuida
      const cb = ev.target.closest('[data-cobrar]');
      if (cb) return detalhe(Number(cb.dataset.cobrar));
      const tr = ev.target.closest('[data-i]');
      if (!tr) return;
      const c = lista[Number(tr.dataset.i)];
      if (ev.target.closest('[data-receber]')) return receber(c.id);
      detalhe(c.id);
    };
    await carregar();
  }

  async function atualizarContagemCobrar() {
    try {
      const r = await api('/api/crediario/cobrar');
      const el = raiz && raiz.querySelector('#cr-n-cobrar');
      if (el) el.textContent = r.pendentes || '';
    } catch { /* sem contagem */ }
  }

  /** Fila de cobrança do dia: um botão de WhatsApp por cliente, na ordem. */
  async function carregarCobrar() {
    let r;
    try { r = await api('/api/crediario/cobrar'); } catch (e) { return erro(e); }
    if (!raiz) return;
    raiz.querySelector('#cr-n-cobrar').textContent = r.pendentes || '';
    const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    const quando = (c) => {
      if (c.cobrada_hoje) return `${Icone('check')} cobrada hoje`;
      if (!c.ultima_cobranca) return 'ainda não cobrada';
      const dias = Math.round((Date.parse(U.hoje()) - Date.parse(c.ultima_cobranca.slice(0, 10))) / 864e5);
      return `última cobrança há ${dias} dia(s)`;
    };
    raiz.querySelector('#lista').innerHTML = (r.clientes.length ? `
      <p class="dica cb-dica">${r.pendentes ? `<b>${r.pendentes} cliente(s) para cobrar.</b> Clique em <b>Cobrar</b>: o WhatsApp abre com a mensagem pronta; depois de mandar, a próxima já fica selecionada.` : `${Icone('check')} Todo mundo já foi cobrado hoje.`}
        ${r.dias_antes ? ` Inclui quem vence nos próximos ${r.dias_antes} dia(s).` : ''}</p>` : '') +
      (r.clientes.map((c) => {
        const atrasada = c.vencido > 0;
        const chave = atrasada ? 'crediario' : 'parcela_hoje';
        const vars = atrasada
          ? { nome: c.nome, saldo: brl(c.saldo), vencido: `, sendo ${brl(c.vencido)} vencido` }
          : { nome: c.nome, valor: brl(c.a_vencer) };
        const zap = Zap.attrs(c.telefone, chave, vars);
        return `<div class="cr-linha cb-linha ${atrasada ? 'cr-vermelho' : 'cr-amarelo'} ${c.cobrada_hoje ? 'cobrada' : ''}" data-cobrar="${c.id}">
          ${avatarCli(c)}
          <div class="cr-nome"><b>${esc(c.nome)}</b><small>${esc(c.telefone || 'sem telefone')}</small></div>
          <div>${atrasada ? selo({ cor: 'vermelho', txt: `atrasada ${c.dias_atraso} dia${c.dias_atraso === 1 ? '' : 's'}` })
    : selo({ cor: 'amarelo', txt: c.proximo_vencimento === U.hoje() ? 'vence hoje' : `vence ${dataBr(c.proximo_vencimento)}` })}</div>
          <div class="cr-num r"><small>${atrasada ? 'Vencido' : 'A vencer'}</small><b class="${atrasada ? 'txt-perigo' : ''}">${brl(atrasada ? c.vencido : c.a_vencer)}</b><small>deve ${brl(c.saldo)} no total</small></div>
          <small class="cb-quando">${quando(c)}</small>
          ${zap ? `<a class="btn cl-btn-zap" ${zap}>${Icone('whatsapp')} Cobrar</a>` : '<small class="cb-sem">sem WhatsApp no cadastro</small>'}
        </div>`;
      }).join('') || `<div class="vd-vazio">${Ilustracao.svg('caderno', 150)}<b>Ninguém para cobrar hoje</b><br><small>Aparece aqui quem tem parcela vencida ou vencendo hoje.</small></div>`);
  }

  async function carregar() {
    if (!raiz) return;
    const cobrar = situacao === 'cobrar';
    raiz.querySelector('#q').closest('.busca-ico').hidden = cobrar;
    if (cobrar) {
      raiz.querySelector('#atraso').closest('label').hidden = true;
      raiz.querySelector('.semaforo-legenda').hidden = true;
      try {
        const resumo = await api('/api/crediario/resumo');
        desenharResumo(resumo);
      } catch { /* segue */ }
      return carregarCobrar();
    }
    atualizarContagemCobrar();
    const q = raiz.querySelector('#q').value;
    const atraso = raiz.querySelector('#atraso').checked ? '&atraso=1' : '';
    raiz.querySelector('#atraso').closest('label').hidden = situacao === 'quitados';
    raiz.querySelector('.semaforo-legenda').hidden = situacao === 'quitados';
    let resumo;
    try {
      [lista, resumo] = await Promise.all([
        situacao === 'quitados' ? api(`/api/crediario/quitados?q=${encodeURIComponent(q)}`) : api(`/api/crediario?q=${encodeURIComponent(q)}${atraso}`),
        api('/api/crediario/resumo'),
      ]);
    } catch (e) { return erro(e); }
    if (!raiz) return;
    desenharResumo(resumo);
    lista = lista || [];
    renderLista();
  }

  function desenharResumo(resumo) {
    raiz.querySelector('#resumo').innerHTML = `
      <div class="vd-kpi destaque"><span>${Icone('caderno')} Total a receber</span><b>${brl(resumo.a_receber)}</b><small>${resumo.clientes} cliente(s) devendo</small></div>
      <div class="vd-kpi"><span>${Icone('alerta')} Vencido</span><b class="${resumo.vencido ? 'txt-perigo' : ''}">${brl(resumo.vencido)}</b><small>${resumo.clientes_atraso} cliente(s) em atraso</small></div>
      <div class="vd-kpi"><span>${Icone('dinheiro')} Recebido hoje</span><b>${brl(resumo.recebido)}</b><small>parcelas pagas hoje</small></div>
      <div class="vd-kpi"><span>${Icone('clientes')} Clientes devendo</span><b>${resumo.clientes}</b><small>com saldo em aberto</small></div>`;
  }

  function renderLista() {
    const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    if (situacao === 'quitados') {
      raiz.querySelector('#lista').innerHTML = lista.map((c, i) => `
      <div class="cr-linha cr-quitado" data-i="${i}" tabindex="0">
        ${avatarCli(c)}
        <div class="cr-nome"><b>${esc(c.nome)}</b><small>${esc([c.telefone, c.cpf && U.cpf(c.cpf)].filter(Boolean).join(' · ') || 'sem contato')}</small></div>
        <div><span class="semaforo verde"><i></i>quitado</span></div>
        <div class="cr-num"><small>Quitou em</small><b>${c.quitado_em ? dataBr(c.quitado_em.slice(0, 10)) : '—'}</b><small>cliente desde ${dataBr(c.desde.slice(0, 10))}</small></div>
        <div class="cr-num r"><small>Compras</small><b>${c.compras}</b><small>${c.parcelas} parcela(s)</small></div>
        <div class="cr-num r"><small>Total pago</small><b class="txt-ok">${brl(c.total)}</b></div>
        <button class="btn">${Icone('olho')} Ver</button>
      </div>`).join('') || `<div class="vd-vazio">${Ilustracao.svg('caderno', 150)}<b>Nenhum crediário quitado ainda</b><br><small>Quando uma cliente pagar todas as parcelas, ela aparece aqui.</small></div>`;
      return;
    }
    raiz.querySelector('#lista').innerHTML = lista.map((c, i) => {
      const sem = semaforo(c.vencido, c.proximo_vencimento, c.dias_atraso);
      return `
      <div class="cr-linha cr-v2 cr-${sem.cor}" data-i="${i}" tabindex="0">
        ${avatarCli(c)}
        <div class="cr-nome"><b>${esc(c.nome)}</b><small>${esc([c.telefone, c.cpf && U.cpf(c.cpf)].filter(Boolean).join(' · ') || 'sem contato')}</small></div>
        <div>${selo(sem)}</div>
        <div class="cr-prog">
          <div class="cr-prog-cab"><small>Pagou <b>${brl(c.pago_carne || 0)}</b> de ${brl(c.total_carne || c.saldo)}</small><small>próx. ${dataBr(c.proximo_vencimento) || '—'}</small></div>
          <div class="cr-barra"><i style="width:${c.total_carne ? Math.round((c.pago_carne / c.total_carne) * 100) : 0}%"></i></div>
          <div class="cr-bolinhas" title="Parcelas: verde paga, vermelha vencida, cinza a vencer">${(c.mapa || []).slice(0, 18).map((m) => `<i class="b-${m}"></i>`).join('')}${(c.mapa || []).length > 18 ? '<small>…</small>' : ''}</div>
        </div>
        <div class="cr-num r"><small>Vencido</small><b class="${c.vencido ? 'txt-perigo' : ''}">${c.vencido ? brl(c.vencido) : '—'}</b></div>
        <div class="cr-num r"><small>Deve</small><b class="cr-saldo">${brl(c.saldo)}</b></div>
        <button class="btn btn-primario" data-receber>${Icone('dinheiro')} Receber</button>
      </div>`;
    }).join('') || `<div class="vd-vazio">${Ilustracao.svg('caderno', 150)}<b>Ninguém devendo no crediário</b><br><small>Quando uma venda for no crediário, a cliente aparece aqui.</small></div>`;
  }

  // ------------------------------------------------------------- detalhe
  async function detalhe(clienteId) {
    let d;
    try { d = await api(`/api/crediario/clientes/${clienteId}`); } catch (e) { return erro(e); }
    const hoje = U.hoje();
    const abertas = d.parcelas.filter((p) => p.status === 'aberta');
    const pagas = d.parcelas.filter((p) => p.status === 'paga');
    const linhaParcela = (p) => {
      const resta = p.valor - p.valor_pago;
      const atrasada = p.status === 'aberta' && p.vencimento < hoje;
      const st = p.status === 'paga' ? 'paga' : atrasada ? 'atrasada' : diasAte(p.vencimento) <= 7 ? 'perto' : 'aberta';
      return `<div class="cr-parc ${st}">
        <span class="cr-ponto"></span>
        <div class="cr-parc-data"><b>${dataBr(p.vencimento)}</b><small>${p.numero}/${p.total_parcelas}${p.descricao ? ' · ' + esc(p.descricao) : ''}</small></div>
        <div class="cr-parc-valor"><b>${brl(p.status === 'paga' ? p.valor : resta)}</b>
          <small>${p.status === 'paga' ? 'paga' : p.valor_pago ? `pagou ${brl(p.valor_pago)} de ${brl(p.valor)}` : atrasada ? `atrasada ${-diasAte(p.vencimento)} dia(s)` : diasAte(p.vencimento) === 0 ? 'vence hoje' : `em ${diasAte(p.vencimento)} dia(s)`}</small></div>
        ${p.status === 'aberta' && !p.venda_id && !p.valor_pago ? `<button class="mini perigo so-admin" data-cancelar-parc="${p.id}" title="Cancelar parcela lançada por engano">${Icone('fechar')}</button>` : '<span></span>'}
      </div>`;
    };
    const tel = (d.cliente.telefone || '').replace(/\D/g, '');
    const corpo = abrirModal(`Crediário — ${d.cliente.nome}`, `
      <div class="cl-kpis cr-det-kpis">
        <div><small>Deve no total</small><b>${brl(d.saldo.aberto)}</b></div>
        <div><small>Vencido</small><b class="${d.saldo.vencido ? 'txt-perigo' : ''}">${brl(d.saldo.vencido)}</b></div>
        <div><small>Limite de crédito</small><b>${d.limite == null ? 'sem limite' : brl(d.limite)}</b></div>
      </div>
      <div class="acoes acoes-esq">
        <button class="btn btn-primario" id="receber" ${d.saldo.aberto ? '' : 'disabled'}>${Icone('dinheiro')} Receber pagamento</button>
        <button class="btn so-admin" id="debito">${Icone('mais')} Lançar débito</button>
        ${d.saldo.aberto && Zap.attrs(tel, 'crediario', { nome: d.cliente.nome, saldo: brl(d.saldo.aberto), vencido: d.saldo.vencido ? `, sendo ${brl(d.saldo.vencido)} vencido` : '' })
    ? `<a class="btn cl-btn-zap" ${Zap.attrs(tel, 'crediario', { nome: d.cliente.nome, saldo: brl(d.saldo.aberto), vencido: d.saldo.vencido ? `, sendo ${brl(d.saldo.vencido)} vencido` : '' })}>${Icone('whatsapp')} Cobrar no WhatsApp</a>` : ''}
      </div>
      ${(d.cobrancas || []).length ? `<p class="dica cr-cobrancas">${Icone('whatsapp')} Cobrada pelo WhatsApp: ${d.cobrancas.slice(0, 5).map((x) => `${dataBr(x.criado_em.slice(0, 10))}${x.usuario ? ` (${esc(x.usuario.split(' ')[0])})` : ''}`).join(' · ')}</p>` : ''}
      <div class="cr-det">
        <div><h4>Parcelas em aberto</h4>
          <div class="cr-linha-tempo" id="parc">${abertas.map(linhaParcela).join('') || U.vazio({ ilu: 'caderno', compacto: true, titulo: 'Tudo pago', texto: 'Nenhuma parcela em aberto.' })}</div>
          ${pagas.length ? `<details ${abertas.length ? '' : 'open'}><summary>Parcelas já pagas (${pagas.length})</summary><div class="cr-linha-tempo">${pagas.map(linhaParcela).join('')}</div></details>` : ''}
        </div>
        <div><h4>Recebimentos</h4>
          <div class="cr-recs" id="recs">${d.recebimentos.map((r) => `
            <div class="cr-rec ${r.status === 'estornado' ? 'inativo' : ''}">
              <span class="cr-rec-ico">${Icone('dinheiro')}</span>
              <div><b>${brl(r.valor)}</b>${r.status === 'estornado' ? ' <span class="selo perigo">estornado</span>' : ''}<small>${dataHora(r.criado_em)} · ${U.FORMAS[r.forma] || r.forma}${r.operador ? ' · ' + esc(r.operador) : ''}</small></div>
              <span class="nowrap"><button class="btn-ico" data-recibo="${r.id}" title="Imprimir recibo">${Icone('impressora')}</button>
              ${r.status === 'ok' ? `<button class="btn-ico perigo so-admin" data-estornar="${r.id}" title="Estornar">${Icone('troca')}</button>` : ''}</span>
            </div>`).join('') || U.vazio({ ilu: 'recibo', compacto: true, texto: 'Nenhum recebimento ainda.' })}</div>
        </div>
      </div>`,
    { largura: '900px' });

    corpo.querySelector('#receber').onclick = () => receber(clienteId);
    // (No próprio botão: o corpo da janela é reaproveitado pelas outras janelas.)
    const cobrar = corpo.querySelector('a[data-zap="crediario"]');
    if (cobrar) {
      cobrar.addEventListener('zap-enviado', () => {
        api('/api/crediario/cobrancas', { metodo: 'POST', corpo: { cliente_id: clienteId } }).catch(() => {});
      });
    }
    corpo.querySelector('#debito').onclick = () => lancarDebito(d.cliente);
    corpo.querySelector('#recs').onclick = async (ev) => {
      const imp = ev.target.closest('[data-recibo]');
      if (imp) {
        try { Impressao.recebimento(await api(`/api/crediario/recebimentos/${imp.dataset.recibo}`)); } catch (e) { erro(e); }
      }
      const est = ev.target.closest('[data-estornar]');
      if (est && await U.confirmar('Estornar recebimento', 'O valor volta a ficar devendo e sai do caixa. Confirmar?', { ok: 'Estornar', perigo: true })) {
        try {
          await api(`/api/crediario/recebimentos/${est.dataset.estornar}/estornar`, { metodo: 'POST' });
          aviso('Recebimento estornado.');
          carregar();
          detalhe(clienteId);
        } catch (e) { erro(e); }
      }
    };
    corpo.querySelector('#parc').onclick = async (ev) => {
      const b = ev.target.closest('[data-cancelar-parc]');
      if (!b) return;
      if (!(await U.confirmar('Cancelar parcela', 'Cancelar esta parcela lançada por engano?', { ok: 'Cancelar parcela', perigo: true }))) return;
      try {
        await api(`/api/crediario/parcelas/${b.dataset.cancelarParc}/cancelar`, { metodo: 'POST' });
        aviso('Parcela cancelada.');
        carregar();
        detalhe(clienteId);
      } catch (e) { erro(e); }
    };
  }

  // ------------------------------------------------------------- receber
  /** depois: chamado depois de receber (ex.: a tela de venda atualiza o saldo da cliente). */
  async function receber(clienteId, depois) {
    let d;
    try { d = await api(`/api/crediario/clientes/${clienteId}`); } catch (e) { return erro(e); }
    const caixa = await api('/api/caixa/atual').catch(() => ({}));
    if (!caixa.caixa) return aviso('Abra o caixa para receber pagamentos (menu Caixa).', 'alerta');
    // Sugere o vencido; se estiver em dia, a próxima parcela.
    const proxima = d.parcelas.find((p) => p.status === 'aberta');
    const sugerido = d.saldo.vencido || (proxima ? proxima.valor - proxima.valor_pago : d.saldo.aberto);
    const corpo = abrirModal(`Receber — ${d.cliente.nome}`, `
      <div class="cards cards-mini">
        <div class="card"><small>Saldo devedor</small><b>${brl(d.saldo.aberto)}</b></div>
        <div class="card"><small>Vencido</small><b class="${d.saldo.vencido ? 'txt-perigo' : ''}">${brl(d.saldo.vencido)}</b></div>
      </div>
      <form class="form">
        <label>Valor recebido (R$)<input name="valor" inputmode="decimal" required autofocus value="${U.num(sugerido)}"></label>
        <div class="atalhos-valor">
          ${d.saldo.vencido ? `<button type="button" class="btn btn-peq" data-v="${d.saldo.vencido}">Vencido ${brl(d.saldo.vencido)}</button>` : ''}
          <button type="button" class="btn btn-peq" data-v="${d.saldo.aberto}">Quitar tudo ${brl(d.saldo.aberto)}</button>
        </div>
        <label>Forma<select name="forma">
          ${['dinheiro', 'pix', 'debito', 'credito', 'outro'].map((f) => `<option value="${f}">${U.FORMAS[f]}</option>`).join('')}
        </select></label>
        <label id="rc-band" hidden>Bandeira do cartão<select name="bandeira">
          ${Object.entries(U.BANDEIRAS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}
        </select></label>
        <label>Observação<input name="observacao"></label>
        <p class="dica">O valor abate primeiro as parcelas mais antigas.</p>
        <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">Receber e imprimir recibo</button></div>
      </form>`, { largura: '480px' });
    const form = corpo.querySelector('form');
    form.valor.select();
    form.forma.onchange = () => { corpo.querySelector('#rc-band').hidden = !['debito', 'credito'].includes(form.forma.value); };
    corpo.querySelector('.atalhos-valor').onclick = (e) => {
      const b = e.target.closest('[data-v]');
      if (b) { form.valor.value = U.num(Number(b.dataset.v)); form.valor.focus(); }
    };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const valor = U.paraCentavos(form.valor.value);
      if (!(valor > 0)) return aviso('Valor inválido.', 'erro');
      try {
        const rec = await api(`/api/crediario/clientes/${clienteId}/receber`, {
          metodo: 'POST', corpo: { valor, forma: form.forma.value, bandeira: form.bandeira.value, observacao: form.observacao.value },
        });
        fecharModal();
        aviso(`Recebido ${brl(rec.valor)}. Saldo restante: ${brl(rec.saldo.aberto)}.`);
        Impressao.recebimento(rec);
        atualizarStatusCaixa();
        carregar();
        if (depois) depois(rec);
      } catch (e) { erro(e); }
    };
  }

  // ------------------------------------------------------- débito manual
  function escolherClienteParaDebito() {
    const corpo = abrirModal('Lançar débito — escolha o cliente', `
      <input id="q-cli" placeholder="Nome, CPF ou telefone" autofocus>
      <div id="lista-cli" class="lista-escolha"></div>
      <div class="acoes"><button class="btn" id="novo-cli">+ Cadastrar cliente</button></div>`, { largura: '560px' });
    const listaEl = corpo.querySelector('#lista-cli');
    let encontrados = [];
    const buscar = async (q) => {
      encontrados = await api(`/api/clientes?q=${encodeURIComponent(q)}`);
      listaEl.innerHTML = encontrados.map((c, i) => `<button class="item-escolha" data-i="${i}"><b>${esc(c.nome)}</b>
        <small>${esc(U.cpf(c.cpf))} ${esc(c.telefone || '')}</small></button>`).join('') || U.vazio({ ilu: 'clientes', compacto: true, texto: 'Nenhuma cliente encontrada.' });
    };
    corpo.querySelector('#q-cli').addEventListener('input', U.debounce((e) => buscar(e.target.value).catch(erro)));
    listaEl.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (b) lancarDebito(encontrados[Number(b.dataset.i)]);
    };
    corpo.querySelector('#novo-cli').onclick = () => Telas.clientes.formulario(null, (c) => lancarDebito(c));
    buscar('').catch(erro);
  }

  async function lancarDebito(cliente) {
    const cfg = await U.config();
    const venc = new Date(Date.now() + (Number(cfg.crediario_dias_primeira) || 30) * 864e5).toLocaleDateString('sv-SE');
    const corpo = abrirModal(`Lançar débito — ${cliente.nome}`, `
      <p class="dica">Use para passar para o sistema as contas do caderno ou de outro sistema. Não mexe no caixa nem no estoque.</p>
      <form class="form grade-form">
        <label class="col2">Descrição<input name="descricao" value="Saldo anterior (caderno)" required></label>
        <label>Valor total (R$)<input name="valor" inputmode="decimal" required autofocus></label>
        <label>Parcelas<input name="parcelas" type="number" min="1" max="24" value="1"></label>
        <label class="col2">Vencimento da 1ª parcela<input name="primeiro_vencimento" type="date" value="${venc}"></label>
        <div class="acoes col2"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">Lançar</button></div>
      </form>`, { largura: '520px' });
    corpo.querySelector('form').onsubmit = U.umaVez(corpo.querySelector('form'), async (ev) => {
      ev.preventDefault();
      const d = U.dadosForm(ev.target);
      const valor = U.paraCentavos(d.valor);
      if (!(valor > 0)) return aviso('Valor inválido.', 'erro');
      try {
        await api(`/api/crediario/clientes/${cliente.id}/debito`, {
          metodo: 'POST', corpo: { ...d, valor, parcelas: Number(d.parcelas) },
        });
        fecharModal();
        aviso('Débito lançado.');
        carregar();
      } catch (e) { erro(e); }
    });
  }

  return { abrir, detalhe, receber, sair: () => { raiz = null; } };
})();
