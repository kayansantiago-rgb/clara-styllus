/* Crediário: quem está devendo, parcelas, recebimentos e débitos antigos. */
Telas.crediario = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;
  let lista = [];

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
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Crediário</h1><p class="subtitulo">Quem está devendo, parcelas, recebimentos e cobrança.</p></div>
        <div class="ferramentas">
          <button class="btn so-admin" id="lancar">${Icone('mais')} Lançar débito antigo</button>
        </div>
      </div>
      <div class="vd-kpis cr-kpis" id="resumo"></div>
      <div class="vd-barra-filtros">
        <div class="busca-ico pr-busca">${Icone('busca')}<input id="q" type="search" placeholder="Buscar cliente por nome, CPF ou telefone" autofocus autocomplete="off"></div>
        <label class="interruptor vd-canceladas"><input type="checkbox" id="atraso"><span class="trilho"></span><span class="txt"><b>Só quem está em atraso</b></span></label>
        <span class="semaforo-legenda">${selo({ cor: 'verde', txt: 'em dia' })}${selo({ cor: 'amarelo', txt: 'vence em 7 dias' })}${selo({ cor: 'vermelho', txt: 'atrasado' })}</span>
      </div>
      <div class="cr-lista" id="lista"></div>`;
    raiz.querySelector('#q').addEventListener('input', U.debounce(carregar));
    raiz.querySelector('#atraso').onchange = carregar;
    raiz.querySelector('#lancar').onclick = () => escolherClienteParaDebito();
    raiz.querySelector('#lista').onclick = (ev) => {
      const tr = ev.target.closest('[data-i]');
      if (!tr) return;
      const c = lista[Number(tr.dataset.i)];
      if (ev.target.closest('[data-receber]')) return receber(c.id);
      detalhe(c.id);
    };
    await carregar();
  }

  async function carregar() {
    if (!raiz) return;
    const q = raiz.querySelector('#q').value;
    const atraso = raiz.querySelector('#atraso').checked ? '&atraso=1' : '';
    let resumo;
    try {
      [lista, resumo] = await Promise.all([
        api(`/api/crediario?q=${encodeURIComponent(q)}${atraso}`),
        api('/api/crediario/resumo'),
      ]);
    } catch (e) { return erro(e); }
    if (!raiz) return;
    raiz.querySelector('#resumo').innerHTML = `
      <div class="vd-kpi destaque"><span>${Icone('caderno')} Total a receber</span><b>${brl(resumo.a_receber)}</b><small>${resumo.clientes} cliente(s) devendo</small></div>
      <div class="vd-kpi"><span>${Icone('alerta')} Vencido</span><b class="${resumo.vencido ? 'txt-perigo' : ''}">${brl(resumo.vencido)}</b><small>${resumo.clientes_atraso} cliente(s) em atraso</small></div>
      <div class="vd-kpi"><span>${Icone('dinheiro')} Recebido hoje</span><b>${brl(resumo.recebido)}</b><small>parcelas pagas hoje</small></div>
      <div class="vd-kpi"><span>${Icone('clientes')} Clientes devendo</span><b>${resumo.clientes}</b><small>com saldo em aberto</small></div>`;
    const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    raiz.querySelector('#lista').innerHTML = lista.map((c, i) => {
      const sem = semaforo(c.vencido, c.proximo_vencimento, c.dias_atraso);
      return `
      <div class="cr-linha cr-${sem.cor}" data-i="${i}" tabindex="0">
        <span class="avatar">${esc(iniciais(c.nome))}</span>
        <div class="cr-nome"><b>${esc(c.nome)}</b><small>${esc([c.telefone, c.cpf && U.cpf(c.cpf)].filter(Boolean).join(' · ') || 'sem contato')}</small></div>
        <div>${selo(sem)}</div>
        <div class="cr-num"><small>Próx. vencimento</small><b>${dataBr(c.proximo_vencimento) || '—'}</b><small>${c.parcelas} parcela(s)</small></div>
        <div class="cr-num r"><small>Vencido</small><b class="${c.vencido ? 'txt-perigo' : ''}">${c.vencido ? brl(c.vencido) : '—'}</b></div>
        <div class="cr-num r"><small>Deve</small><b class="cr-saldo">${brl(c.saldo)}</b></div>
        <button class="btn btn-primario" data-receber>${Icone('dinheiro')} Receber</button>
      </div>`;
    }).join('') || `<div class="vd-vazio"><div class="pdv-vazio-ico">${Icone('check')}</div><b>Ninguém devendo no crediário</b><br><small>Quando uma venda for no crediário, a cliente aparece aqui.</small></div>`;
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
    const msg = encodeURIComponent(`Olá, ${d.cliente.nome.split(' ')[0]}! Aqui é da Clara Styllus. ` +
      `Passando para lembrar do seu crediário: saldo de ${brl(d.saldo.aberto)}` +
      `${d.saldo.vencido ? `, sendo ${brl(d.saldo.vencido)} vencido` : ''}. Qualquer dúvida estamos à disposição!`);
    const corpo = abrirModal(`Crediário — ${d.cliente.nome}`, `
      <div class="cl-kpis cr-det-kpis">
        <div><small>Deve no total</small><b>${brl(d.saldo.aberto)}</b></div>
        <div><small>Vencido</small><b class="${d.saldo.vencido ? 'txt-perigo' : ''}">${brl(d.saldo.vencido)}</b></div>
        <div><small>Limite de crédito</small><b>${d.limite == null ? 'sem limite' : brl(d.limite)}</b></div>
      </div>
      <div class="acoes acoes-esq">
        <button class="btn btn-primario" id="receber" ${d.saldo.aberto ? '' : 'disabled'}>${Icone('dinheiro')} Receber pagamento</button>
        <button class="btn so-admin" id="debito">${Icone('mais')} Lançar débito</button>
        ${tel.length >= 10 && d.saldo.aberto ? `<a class="btn cl-btn-zap" target="_blank" rel="noopener" href="https://wa.me/55${tel.replace(/^55/, '')}?text=${msg}">${Icone('whatsapp')} Cobrar no WhatsApp</a>` : ''}
      </div>
      <div class="cr-det">
        <div><h4>Parcelas em aberto</h4>
          <div class="cr-linha-tempo" id="parc">${abertas.map(linhaParcela).join('') || '<div class="vazio">Nenhuma parcela em aberto.</div>'}</div>
          ${pagas.length ? `<details><summary>Parcelas já pagas (${pagas.length})</summary><div class="cr-linha-tempo">${pagas.map(linhaParcela).join('')}</div></details>` : ''}
        </div>
        <div><h4>Recebimentos</h4>
          <div class="cr-recs" id="recs">${d.recebimentos.map((r) => `
            <div class="cr-rec ${r.status === 'estornado' ? 'inativo' : ''}">
              <span class="cr-rec-ico">${Icone('dinheiro')}</span>
              <div><b>${brl(r.valor)}</b>${r.status === 'estornado' ? ' <span class="selo perigo">estornado</span>' : ''}<small>${dataHora(r.criado_em)} · ${U.FORMAS[r.forma] || r.forma}${r.operador ? ' · ' + esc(r.operador) : ''}</small></div>
              <span class="nowrap"><button class="btn-ico" data-recibo="${r.id}" title="Imprimir recibo">${Icone('impressora')}</button>
              ${r.status === 'ok' ? `<button class="btn-ico perigo so-admin" data-estornar="${r.id}" title="Estornar">${Icone('troca')}</button>` : ''}</span>
            </div>`).join('') || '<div class="vazio">Nenhum recebimento ainda.</div>'}</div>
        </div>
      </div>`,
    { largura: '900px' });

    corpo.querySelector('#receber').onclick = () => receber(clienteId);
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
  async function receber(clienteId) {
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
        <label>Observação<input name="observacao"></label>
        <p class="dica">O valor abate primeiro as parcelas mais antigas.</p>
        <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">Receber e imprimir recibo</button></div>
      </form>`, { largura: '480px' });
    const form = corpo.querySelector('form');
    form.valor.select();
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
          metodo: 'POST', corpo: { valor, forma: form.forma.value, observacao: form.observacao.value },
        });
        fecharModal();
        aviso(`Recebido ${brl(rec.valor)}. Saldo restante: ${brl(rec.saldo.aberto)}.`);
        Impressao.recebimento(rec);
        atualizarStatusCaixa();
        carregar();
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
        <small>${esc(U.cpf(c.cpf))} ${esc(c.telefone || '')}</small></button>`).join('') || '<div class="vazio">Nenhum cliente.</div>';
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
    corpo.querySelector('form').onsubmit = async (ev) => {
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
    };
  }

  return { abrir, detalhe, receber, sair: () => { raiz = null; } };
})();
