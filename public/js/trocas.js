/* Troca e devolução: escolher as peças que voltam de uma venda e gerar o vale-troca. */
const Trocas = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, local } = U;

  /** Pede o número da venda (ou o código bipado do cupom, ex.: V123). */
  async function perguntarVenda() {
    const v = await U.perguntar('Troca / devolução', 'Bipe o código do cupom (V123) ou digite o número da venda:');
    if (!v) return;
    const id = String(v).replace(/\D/g, '');
    if (!id) return aviso('Número de venda inválido.', 'erro');
    abrirVenda(Number(id));
  }

  async function abrirVenda(vendaId) {
    let d;
    try { d = await api(`/api/vendas/${vendaId}/troca`); } catch (e) { return erro(e); }
    const { venda, itens } = d;
    const qtd = new Map();
    const corpo = abrirModal(`Troca — venda nº ${venda.id}`, `
      <div class="tr-cab">
        <span>${Icone('recibo')} ${U.dataHora(venda.criado_em)}</span>
        ${venda.cliente_nome ? `<span>${Icone('usuario')} ${esc(venda.cliente_nome)}</span>` : ''}
        <span>${Icone('carteira')} total ${brl(venda.total)}</span>
      </div>
      <div class="p4-passo"><span>1</span>Quais peças estão voltando?</div>
      <div class="tr-itens">${itens.map((it) => `
        <div class="tr-item ${it.pode_voltar ? '' : 'inativo'}" data-linha="${it.id}">
          ${U.miniatura({ id: it.produto_id, foto_versao: it.foto_versao }, 'p4-item-foto')}
          <div class="p4-item-txt"><b>${esc(it.nome)}</b>
            <span class="p4-tags">${it.tamanho ? `<span class="p4-tag">Tam ${esc(it.tamanho)}</span>` : ''}${it.cor ? `<span class="p4-tag">${esc(it.cor)}</span>` : ''}
              <small>pagou ${brl(it.valor_unitario_pago)} cada${it.devolvido ? ` · ${it.devolvido} já voltou` : ''}</small></span></div>
          ${it.pode_voltar ? `<span class="qtd-ctrl p4-qtd"><button type="button" class="mini" data-menos="${it.id}">${Icone('menos')}</button><span data-n="${it.id}">0</span><button type="button" class="mini" data-mais="${it.id}">${Icone('mais')}</button></span>
            <small class="tr-max">de ${it.pode_voltar}</small>` : '<small class="tr-max">já trocada</small><span></span>'}
        </div>`).join('')}</div>
      <div class="p4-passo"><span>2</span>Motivo e vale</div>
      <label>Motivo <small>opcional</small><input id="troca-motivo" placeholder="Ex.: tamanho, defeito, presente"></label>
      <div class="tr-rodape">
        <div class="tr-total" id="troca-total"><small>Vale-troca</small><b>${brl(0)}</b><span>As peças voltam para o estoque.</span></div>
        <div class="tr-botoes"><button class="btn" data-fechar>Cancelar</button>
          <button class="btn btn-primario btn-grande" id="troca-ok" disabled>${Icone('vale')} Gerar vale-troca</button></div>
      </div>`, { largura: '820px' });
    const total = () => itens.reduce((a, it) => a + (qtd.get(it.id) || 0) * it.valor_unitario_pago, 0);
    const atualizar = () => {
      const t = total();
      const pecas = [...qtd.values()].reduce((a, n) => a + n, 0);
      corpo.querySelector('#troca-total').innerHTML = `<small>Vale-troca</small><b>${brl(t)}</b><span>${pecas ? `${pecas} peça(s) voltando para o estoque` : 'Escolha as peças acima.'}</span>`;
      corpo.querySelector('#troca-ok').disabled = !pecas;
      itens.forEach((it) => {
        const el = corpo.querySelector(`[data-n="${it.id}"]`);
        if (el) el.textContent = qtd.get(it.id) || 0;
        corpo.querySelector(`[data-linha="${it.id}"]`).classList.toggle('sel', (qtd.get(it.id) || 0) > 0);
      });
    };
    corpo.querySelector('.tr-itens').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-mais],[data-menos]');
      if (!b) return;
      const id = Number(b.dataset.mais || b.dataset.menos);
      const it = itens.find((x) => x.id === id);
      const n = (qtd.get(id) || 0) + (b.dataset.mais ? 1 : -1);
      qtd.set(id, Math.max(0, Math.min(it.pode_voltar, n)));
      atualizar();
    });
    corpo.querySelector('#troca-ok').onclick = U.umaVez(corpo.querySelector('#troca-ok'), async () => {
      try {
        const t = await api(`/api/vendas/${venda.id}/troca`, {
          metodo: 'POST',
          corpo: { itens: [...qtd.entries()].filter(([, n]) => n > 0).map(([id, n]) => ({ venda_item_id: id, quantidade: n })), motivo: corpo.querySelector('#troca-motivo').value },
        });
        Impressao.troca(t);
        mostrarVale(t);
      } catch (e) { erro(e); }
    });
  }

  function mostrarVale(t) {
    const corpo = abrirModal('Vale-troca gerado', `
      <div class="vale-cartao">
        <div class="vale-topo"><span>Vale-troca</span>${Icone('presente')}</div>
        <b>${brl(t.valor)}</b>
        <div class="vale-rodape"><span class="vale-codigo">${esc(t.vale ? t.vale.codigo : '')}</span>
          <span>${t.vale && t.vale.validade ? `válido até ${t.vale.validade.split('-').reverse().join('/')}` : ''}</span></div>
      </div>
      <p class="dica" style="text-align:center">As peças voltaram para o estoque. A cliente pode usar o vale agora ou guardar o impresso.</p>
      <div class="vc-acoes">
        <button class="btn" id="vale-imp">${Icone('impressora')} Imprimir de novo</button>
        <button class="btn" data-fechar>Fechar</button>
        ${t.vale ? `<button class="btn btn-primario btn-grande vc-nova" id="vale-usar">${Icone('sacola')} Usar agora numa nova venda</button>` : ''}
      </div>`, { largura: '520px' });
    corpo.querySelector('#vale-imp').onclick = () => Impressao.troca(t);
    const usar = corpo.querySelector('#vale-usar');
    if (usar) {
      usar.onclick = () => {
        local.gravar('pdv_vale_pendente', { codigo: t.vale.codigo, saldo: t.vale.saldo });
        fecharModal();
        aviso(`Vale ${t.vale.codigo} pronto: bipe as peças novas e ele entra no pagamento.`);
        if (location.hash === '#/pdv') Telas.pdv.recarregar(); else location.hash = '#/pdv';
      };
    }
  }

  return { perguntarVenda, abrirVenda };
})();
