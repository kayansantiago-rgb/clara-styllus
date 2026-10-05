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
      <p class="dica">${U.dataHora(venda.criado_em)}${venda.cliente_nome ? ` · ${esc(venda.cliente_nome)}` : ''} · total ${brl(venda.total)}.
        Marque quantas peças de cada item estão voltando. O valor do vale é o que a cliente pagou (já com os descontos da venda).</p>
      <table class="tabela">
        <thead><tr><th>Peça</th><th class="r">Vendidas</th><th class="r">Já voltaram</th><th class="r">Valor pago (un.)</th><th class="c">Voltando</th></tr></thead>
        <tbody>${itens.map((it) => `<tr class="${it.pode_voltar ? '' : 'inativo'}">
          <td><b>${esc(it.nome)}</b> ${esc([it.tamanho, it.cor].filter(Boolean).join(' · '))}<br><small>${esc(it.codigo)}</small></td>
          <td class="r">${it.quantidade}</td><td class="r">${it.devolvido || ''}</td><td class="r">${brl(it.valor_unitario_pago)}</td>
          <td class="c">${it.pode_voltar ? `<input type="number" class="qtd-input" min="0" max="${it.pode_voltar}" value="0" data-item="${it.id}">` : '—'}</td></tr>`).join('')}</tbody>
      </table>
      <label>Motivo (opcional)<input id="troca-motivo" placeholder="Ex.: tamanho, defeito, presente"></label>
      <div class="troca-total" id="troca-total"></div>
      <div class="acoes">
        <button class="btn" data-fechar>Cancelar</button>
        <button class="btn btn-primario btn-grande" id="troca-ok" disabled>Gerar vale-troca</button>
      </div>`, { largura: '820px' });
    const total = () => itens.reduce((a, it) => a + (qtd.get(it.id) || 0) * it.valor_unitario_pago, 0);
    const atualizar = () => {
      const t = total();
      corpo.querySelector('#troca-total').innerHTML = t ? `Vale-troca de <b>${brl(t)}</b>` : '';
      corpo.querySelector('#troca-ok').disabled = !t && ![...qtd.values()].some(Boolean);
    };
    corpo.querySelector('tbody').addEventListener('input', (ev) => {
      const id = Number(ev.target.dataset.item);
      const it = itens.find((x) => x.id === id);
      const n = Math.max(0, Math.min(it.pode_voltar, Math.floor(Number(ev.target.value) || 0)));
      qtd.set(id, n);
      atualizar();
    });
    corpo.querySelector('#troca-ok').onclick = async () => {
      try {
        const t = await api(`/api/vendas/${venda.id}/troca`, {
          metodo: 'POST',
          corpo: { itens: [...qtd.entries()].filter(([, n]) => n > 0).map(([id, n]) => ({ venda_item_id: id, quantidade: n })), motivo: corpo.querySelector('#troca-motivo').value },
        });
        Impressao.troca(t);
        mostrarVale(t);
      } catch (e) { erro(e); }
    };
  }

  function mostrarVale(t) {
    const corpo = abrirModal('Vale-troca gerado', `
      <div class="concluida">
        <div class="sucesso-ico"><i data-icone="vale"></i></div>
        <div class="concluida-rotulo">VALE-TROCA ${esc(t.vale ? t.vale.codigo : '')}</div>
        <div class="concluida-valor">${brl(t.valor)}</div>
        <div class="concluida-det">${t.vale && t.vale.validade ? `válido até ${t.vale.validade.split('-').reverse().join('/')} · ` : ''}as peças voltaram para o estoque</div>
      </div>
      <p class="dica">A cliente pode usar agora numa nova compra ou guardar o vale impresso.</p>
      <div class="acoes">
        <button class="btn" id="vale-imp"><i data-icone="impressora"></i> Imprimir de novo</button>
        <button class="btn" data-fechar>Fechar</button>
        ${t.vale ? '<button class="btn btn-primario btn-grande" id="vale-usar"><i data-icone="sacola"></i> Usar agora numa nova venda</button>' : ''}
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
