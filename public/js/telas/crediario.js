/* Crediário: quem está devendo, parcelas, recebimentos e débitos antigos. */
Telas.crediario = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;
  let lista = [];

  const dataBr = (d) => (d ? d.split('-').reverse().join('/') : '');

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <h1>Crediário</h1>
        <div class="ferramentas">
          <input id="q" type="search" placeholder="Buscar cliente por nome, CPF ou telefone" autofocus>
          <label class="check"><input type="checkbox" id="atraso"> Só em atraso</label>
          <button class="btn so-admin" id="lancar">+ Lançar débito antigo</button>
        </div>
      </div>
      <div class="cards" id="resumo"></div>
      <div class="cartao tabela-rolagem">
        <table class="tabela">
          <thead><tr><th>Cliente</th><th>Telefone</th><th class="r">Parcelas</th><th>Próx. vencimento</th>
            <th class="r">Em atraso</th><th class="r">Saldo devedor</th><th></th></tr></thead>
          <tbody id="lista"></tbody>
        </table>
      </div>`;
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
      <div class="card destaque"><small>Total a receber</small><b>${brl(resumo.a_receber)}</b></div>
      <div class="card"><small>Vencido</small><b class="${resumo.vencido ? 'txt-perigo' : ''}">${brl(resumo.vencido)}</b></div>
      <div class="card"><small>Clientes devendo</small><b>${resumo.clientes}</b></div>
      <div class="card"><small>Clientes em atraso</small><b class="${resumo.clientes_atraso ? 'txt-perigo' : ''}">${resumo.clientes_atraso}</b></div>
      <div class="card"><small>Recebido hoje</small><b>${brl(resumo.recebido)}</b></div>`;
    raiz.querySelector('#lista').innerHTML = lista.map((c, i) => `
      <tr class="clicavel ${c.vencido ? 'linha-atraso' : ''}" data-i="${i}">
        <td><b>${esc(c.nome)}</b>${c.cpf ? `<br><small>${esc(U.cpf(c.cpf))}</small>` : ''}</td>
        <td>${esc(c.telefone || '')}</td>
        <td class="r">${c.parcelas}</td>
        <td>${dataBr(c.proximo_vencimento)}</td>
        <td class="r">${c.vencido ? `<span class="selo perigo">${brl(c.vencido)} · ${c.dias_atraso}d</span>` : '<span class="selo ok">em dia</span>'}</td>
        <td class="r"><b>${brl(c.saldo)}</b></td>
        <td class="r"><button class="btn btn-primario btn-peq" data-receber>Receber</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="vazio">Ninguém devendo no crediário. 🎉</td></tr>';
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
      return `<tr class="${atrasada ? 'linha-atraso' : ''}">
        <td>${esc(p.descricao || '')}</td><td class="c">${p.numero}/${p.total_parcelas}</td>
        <td>${dataBr(p.vencimento)}</td><td class="r">${brl(p.valor)}</td>
        <td class="r">${p.valor_pago ? brl(p.valor_pago) : ''}</td>
        <td class="r">${p.status === 'paga' ? '<span class="selo ok">paga</span>' : `<b class="${atrasada ? 'txt-perigo' : ''}">${brl(resta)}</b>`}</td>
        <td>${p.status === 'aberta' && !p.venda_id && !p.valor_pago ? `<button class="mini perigo so-admin" data-cancelar-parc="${p.id}" title="Cancelar parcela lançada por engano">×</button>` : ''}</td>
      </tr>`;
    };
    const tel = (d.cliente.telefone || '').replace(/\D/g, '');
    const msg = encodeURIComponent(`Olá, ${d.cliente.nome.split(' ')[0]}! Aqui é da Clara Styllus. ` +
      `Passando para lembrar do seu crediário: saldo de ${brl(d.saldo.aberto)}` +
      `${d.saldo.vencido ? `, sendo ${brl(d.saldo.vencido)} vencido` : ''}. Qualquer dúvida estamos à disposição!`);
    const corpo = abrirModal(`Crediário — ${d.cliente.nome}`, `
      <div class="cards cards-mini">
        <div class="card destaque"><small>Saldo devedor</small><b>${brl(d.saldo.aberto)}</b></div>
        <div class="card"><small>Vencido</small><b class="${d.saldo.vencido ? 'txt-perigo' : ''}">${brl(d.saldo.vencido)}</b></div>
        <div class="card"><small>Limite de crédito</small><b>${d.limite == null ? 'sem limite' : brl(d.limite)}</b></div>
      </div>
      <div class="acoes acoes-esq">
        <button class="btn btn-primario" id="receber" ${d.saldo.aberto ? '' : 'disabled'}>💰 Receber pagamento</button>
        <button class="btn so-admin" id="debito">+ Lançar débito</button>
        ${tel.length >= 10 && d.saldo.aberto ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/55${tel.replace(/^55/, '')}?text=${msg}">📱 Cobrar no WhatsApp</a>` : ''}
      </div>
      <h3>Parcelas em aberto</h3>
      <div class="tabela-rolagem baixa"><table class="tabela">
        <thead><tr><th>Origem</th><th class="c">Parc.</th><th>Vencimento</th><th class="r">Valor</th><th class="r">Pago</th><th class="r">Resta</th><th></th></tr></thead>
        <tbody id="parc">${abertas.map(linhaParcela).join('') || '<tr><td colspan="7" class="vazio">Nenhuma parcela em aberto.</td></tr>'}</tbody>
      </table></div>
      <h3>Recebimentos</h3>
      <div class="tabela-rolagem baixa"><table class="tabela"><tbody id="recs">${d.recebimentos.map((r) => `
        <tr class="${r.status === 'estornado' ? 'inativo' : ''}"><td>${dataHora(r.criado_em)}</td><td>${U.FORMAS[r.forma] || r.forma}</td>
          <td>${esc(r.operador || '')}</td><td class="r"><b>${brl(r.valor)}</b>${r.status === 'estornado' ? ' <span class="selo perigo">estornado</span>' : ''}</td>
          <td class="r nowrap"><button class="btn-ico" data-recibo="${r.id}" title="Imprimir recibo">🖨️</button>
          ${r.status === 'ok' ? `<button class="btn-ico so-admin" data-estornar="${r.id}" title="Estornar">↩️</button>` : ''}</td></tr>`).join('') ||
        '<tr><td class="vazio">Nenhum recebimento.</td></tr>'}</tbody></table></div>
      ${pagas.length ? `<details><summary>Parcelas já pagas (${pagas.length})</summary>
        <table class="tabela"><tbody>${pagas.map(linhaParcela).join('')}</tbody></table></details>` : ''}`,
    { largura: '860px' });

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
