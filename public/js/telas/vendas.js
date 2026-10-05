/* Consulta de vendas, reimpressão e cancelamento. */
Telas.vendas = (() => {
  const { esc, brl, num, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;

  async function abrir(el) {
    raiz = el;
    const hoje = U.hoje();
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <h1>Vendas</h1>
        <div class="ferramentas">
          <label>De <input type="date" id="de" value="${hoje}"></label>
          <label>Até <input type="date" id="ate" value="${hoje}"></label>
          <input id="num" placeholder="Nº da venda (ou bipe o cupom)">
        </div>
      </div>
      <div class="resumo-linha" id="resumo"></div>
      <div class="tabela-rolagem cartao">
        <table class="tabela">
          <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Vendedor(a)</th><th class="r">Peças</th>
            <th>Pagamento</th><th class="r">Total</th><th>Situação</th><th class="so-admin"></th></tr></thead>
          <tbody id="lista"></tbody>
        </table>
      </div>`;
    raiz.querySelector('#de').onchange = carregar;
    raiz.querySelector('#ate').onchange = carregar;
    raiz.querySelector('#num').addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const id = ev.target.value.replace(/\D/g, '');
      ev.target.value = '';
      if (id) detalhe(id);
    });
    raiz.querySelector('#lista').onclick = (ev) => {
      const exc = ev.target.closest('[data-excluir]');
      if (exc) return excluir(exc.dataset.excluir);
      const tr = ev.target.closest('[data-id]');
      if (tr) detalhe(tr.dataset.id);
    };
    await carregar();
  }

  async function carregar() {
    const de = raiz.querySelector('#de').value;
    const ate = raiz.querySelector('#ate').value;
    let vendas;
    try {
      vendas = await api(`/api/vendas?de=${de}&ate=${ate}`);
    } catch (e) { return erro(e); }
    const ok = vendas.filter((v) => v.status === 'concluida');
    raiz.querySelector('#resumo').innerHTML = `
      <span>${ok.length} venda(s)</span>
      <span>${ok.reduce((a, v) => a + (v.pecas || 0), 0)} peça(s)</span>
      <span>Total <b>${brl(ok.reduce((a, v) => a + v.total, 0))}</b></span>`;
    raiz.querySelector('#lista').innerHTML = vendas.map((v) => `
      <tr data-id="${v.id}" class="clicavel ${v.status === 'cancelada' ? 'inativo' : ''}">
        <td><b>${v.id}</b></td>
        <td>${dataHora(v.criado_em)}</td>
        <td>${esc(v.cliente_nome || '')}</td>
        <td>${esc(v.vendedor || '')}</td>
        <td class="r">${v.pecas || 0}</td>
        <td>${esc((v.formas || '').split(',').map((f) => U.FORMAS[f] || f).join(', '))}</td>
        <td class="r"><b>${num(v.total)}</b></td>
        <td>${v.status === 'cancelada' ? '<span class="selo perigo">Cancelada</span>' : '<span class="selo ok">Concluída</span>'}</td>
        <td class="r so-admin"><button class="btn-ico perigo" data-excluir="${v.id}" title="Excluir venda">${Icone('lixeira')}</button></td>
      </tr>`).join('') || '<tr><td colspan="9" class="vazio">Nenhuma venda no período.</td></tr>';
  }

  async function detalhe(id) {
    let v;
    try {
      v = await api(`/api/vendas/${id}`);
    } catch (e) { return erro(e); }
    const corpo = abrirModal(`Venda nº ${v.id}`, `
      <div class="info-grade">
        <div><small>Data</small>${dataHora(v.criado_em)}</div>
        <div><small>Vendedor(a)</small>${esc(v.vendedor || '—')}</div>
        <div><small>Cliente</small>${esc(v.cliente_nome || '—')}</div>
        <div><small>CPF/CNPJ</small>${esc(U.cpf(v.cpf_nota) || '—')}</div>
      </div>
      ${v.status === 'cancelada' ? `<div class="alerta-box">Cancelada em ${dataHora(v.cancelada_em)} — ${esc(v.motivo_cancelamento)}</div>` : ''}
      <table class="tabela">
        <thead><tr><th>Produto</th><th class="r">Qtd</th><th class="r">Unit.</th><th class="r">Desc.</th><th class="r">Total</th></tr></thead>
        <tbody>${v.itens.map((it) => `<tr><td>${esc(it.nome)} ${esc([it.tamanho, it.cor].filter(Boolean).join(' · '))}<br><small>${esc(it.codigo)}</small></td>
          <td class="r">${it.quantidade}</td><td class="r">${num(it.preco_unitario)}</td>
          <td class="r">${it.desconto ? num(it.desconto) : ''}</td><td class="r">${num(it.total)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="totais-venda">
        <div class="linha"><span>Subtotal</span><span>${brl(v.subtotal)}</span></div>
        <div class="linha"><span>Descontos</span><span>-${brl(v.desconto)}</span></div>
        <div class="linha total"><span>Total</span><span>${brl(v.total)}</span></div>
        ${v.pagamentos.map((p) => `<div class="linha"><span>${U.FORMAS[p.forma] || p.forma}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''}</span><span>${brl(p.valor)}</span></div>`).join('')}
        ${v.troco ? `<div class="linha"><span>Troco</span><span>${brl(v.troco)}</span></div>` : ''}
      </div>
      ${v.crediario && v.crediario.length ? `<h3>Parcelas do crediário</h3>
        ${v.crediario.map((p) => `<div class="linha"><span>${p.numero}/${p.total_parcelas} · venc. ${p.vencimento.split('-').reverse().join('/')}</span>
          <span>${brl(p.valor)} ${p.status === 'paga' ? '<span class="selo ok">paga</span>' : p.status === 'cancelada' ? '<span class="selo perigo">cancelada</span>' : p.valor_pago ? `<small>pago ${brl(p.valor_pago)}</small>` : ''}</span></div>`).join('')}` : ''}
      <div class="acoes">
        ${U.sessao.ehAdmin() ? `<button class="btn btn-fantasma btn-perigo-claro" id="excluir" style="margin-right:auto">${Icone('lixeira')} Excluir venda</button>` : ''}
        ${v.status === 'concluida' && U.sessao.ehAdmin() ? '<button class="btn btn-perigo-claro" id="cancelar">Cancelar venda</button>' : ''}
        ${v.status === 'concluida' ? `<button class="btn" id="devolver">${Icone('troca')} Troca / devolução</button>` : ''}
        <button class="btn" id="troca">${Icone('presente')} Cupom de troca</button>
        <button class="btn btn-primario" id="cupom">${Icone('impressora')} Reimprimir cupom</button>
      </div>`, { largura: '760px' });
    corpo.querySelector('#cupom').onclick = () => Impressao.cupom(v);
    corpo.querySelector('#troca').onclick = () => Impressao.cupomTroca(v);
    const dev = corpo.querySelector('#devolver');
    if (dev) dev.onclick = () => Trocas.abrirVenda(v.id);
    const btnExcluir = corpo.querySelector('#excluir');
    if (btnExcluir) btnExcluir.onclick = () => excluir(v.id);
    const btnCancelar = corpo.querySelector('#cancelar');
    if (btnCancelar) {
      btnCancelar.onclick = async () => {
        const motivo = await U.perguntar('Cancelar venda', 'Motivo do cancelamento (as peças voltam para o estoque):');
        if (!motivo) return;
        try {
          await api(`/api/vendas/${v.id}/cancelar`, { metodo: 'POST', corpo: { motivo } });
          aviso(`Venda nº ${v.id} cancelada.`);
          fecharModal();
          if (raiz) carregar();
        } catch (e) { erro(e); }
      };
    }
  }

  /** Excluir de vez (só administrador): para venda lançada errado ou de teste. */
  async function excluir(id) {
    const ok = await U.confirmar('Excluir venda', `A venda nº ${id} será apagada do sistema e não aparecerá mais nos relatórios
      nem no caixa. Se ela não estava cancelada, as peças voltam para o estoque. Essa ação não pode ser desfeita.`,
    { ok: 'Excluir venda', perigo: true });
    if (!ok) return;
    try {
      await api(`/api/vendas/${id}`, { metodo: 'DELETE' });
      aviso(`Venda nº ${id} excluída.`);
      fecharModal();
      if (raiz) carregar();
    } catch (e) { erro(e); }
  }

  return { abrir, detalhe, sair: () => { raiz = null; } };
})();
