/* Condicional (malinha): quem levou peças para provar, prazo e fechamento. */
Telas.condicional = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;
  let lista = [];

  const diasAte = (d) => Math.round((Date.parse(d + 'T00:00') - Date.parse(U.hoje() + 'T00:00')) / 864e5);
  const selo = (c) => {
    if (c.status !== 'aberta') return `<span class="selo">${c.status}</span>`;
    const n = diasAte(c.prazo);
    if (n < 0) return `<span class="semaforo vermelho"><i></i>atrasada ${-n} dia(s)</span>`;
    if (n === 0) return '<span class="semaforo amarelo"><i></i>devolve hoje</span>';
    return `<span class="semaforo verde"><i></i>${n} dia(s)</span>`;
  };

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <h1>Condicional</h1>
        <div class="ferramentas">
          <select id="status"><option value="aberta">Abertas</option><option value="todas">Todas</option></select>
          <a class="btn btn-primario" href="#/pdv" title="Bipe as peças no caixa, escolha a cliente e clique em Condicional"><i data-icone="bolsa"></i> Nova condicional</a>
        </div>
      </div>
      <p class="dica">Para criar: no <b>caixa</b>, bipe as peças, escolha a cliente (F6) e clique em <b><i data-icone="bolsa"></i> Condicional</b>.
        As peças saem do estoque até a cliente devolver; o que ela ficar vai para o caixa como venda.</p>
      <div class="cartao tabela-rolagem">
        <table class="tabela">
          <thead><tr><th>Situação</th><th>Nº</th><th>Cliente</th><th>Saiu em</th><th>Devolver até</th><th class="r">Peças</th><th class="r">Valor</th><th></th></tr></thead>
          <tbody id="lista"></tbody>
        </table>
      </div>`;
    raiz.querySelector('#status').onchange = carregar;
    raiz.querySelector('#lista').onclick = (ev) => {
      const tr = ev.target.closest('[data-i]');
      if (tr) detalhe(lista[Number(tr.dataset.i)].id);
    };
    await carregar();
  }

  async function carregar() {
    if (!raiz) return;
    try { lista = await api(`/api/condicionais?status=${raiz.querySelector('#status').value}`); } catch (e) { return erro(e); }
    raiz.querySelector('#lista').innerHTML = lista.map((c, i) => `
      <tr class="clicavel ${c.status === 'aberta' && diasAte(c.prazo) < 0 ? 'linha-vermelho' : ''}" data-i="${i}">
        <td>${selo(c)}</td><td>${c.id}</td><td><b>${esc(c.cliente_nome)}</b><br><small>${esc(c.cliente_telefone || '')}</small></td>
        <td>${dataHora(c.criado_em)}</td><td>${c.prazo.split('-').reverse().join('/')}</td>
        <td class="r">${c.pecas}</td><td class="r">${brl(c.valor)}</td>
        <td class="r">${c.status === 'aberta' ? '<button class="btn btn-primario btn-peq">Fechar</button>' : ''}</td>
      </tr>`).join('') || '<tr><td colspan="8" class="vazio">Nenhuma condicional aberta.</td></tr>';
  }

  async function detalhe(id) {
    let c;
    try { c = await api(`/api/condicionais/${id}`); } catch (e) { return erro(e); }
    const aberta = c.status === 'aberta';
    const tel = String(c.cliente_telefone || '').replace(/\D/g, '').replace(/^55/, '');
    const msg = encodeURIComponent(`Olá, ${c.cliente_nome.split(' ')[0]}! Aqui é da Clara Styllus 💕 Passando para lembrar das peças da condicional (devolver até ${c.prazo.split('-').reverse().join('/')}). Gostou de alguma?`);
    const corpo = abrirModal(`Condicional nº ${c.id} — ${c.cliente_nome}`, `
      <p>${selo(c)} · saiu em ${dataHora(c.criado_em)} por ${esc(c.usuario || '')} · devolver até <b>${c.prazo.split('-').reverse().join('/')}</b>
        ${c.observacao ? `<br><small>${esc(c.observacao)}</small>` : ''}</p>
      <table class="tabela">
        <thead><tr><th></th><th>Peça</th><th class="r">Preço</th><th class="c">Levou</th><th class="c">${aberta ? 'Ficou com' : 'Ficou'}</th></tr></thead>
        <tbody>${c.itens.map((it) => `<tr>
          <td class="td-foto">${U.miniatura({ id: it.produto_id, foto_versao: it.foto_versao })}</td>
          <td><b>${esc(it.nome)}</b> ${esc([it.tamanho, it.cor].filter(Boolean).join(' · '))}<br><small>${esc(it.codigo)}</small></td>
          <td class="r">${brl(it.preco_venda)}</td><td class="c">${it.quantidade}</td>
          <td class="c">${aberta ? `<input type="number" class="qtd-input" min="0" max="${it.quantidade}" value="0" data-id="${it.id}">` : (it.ficou ?? '—')}</td>
        </tr>`).join('')}</tbody>
      </table>
      ${aberta ? `<div class="troca-total" id="cond-total"></div>
      <p class="dica">Coloque quantas peças a cliente <b>ficou</b> (o resto volta para o estoque). As que ela ficou vão para o caixa para receber o pagamento.</p>` : ''}
      <div class="acoes">
        ${aberta ? '<button class="btn btn-perigo-claro so-admin" id="cancelar">Cancelar condicional</button>' : ''}
        ${tel.length >= 10 && aberta ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/55${tel}?text=${msg}"><i data-icone="whatsapp"></i> Lembrar no WhatsApp</a>` : ''}
        <button class="btn" id="reimprimir"><i data-icone="impressora"></i> Imprimir</button>
        ${aberta ? '<button class="btn btn-primario btn-grande" id="fechar"><i data-icone="check"></i> Fechar condicional</button>' : ''}
      </div>`, { largura: '820px' });
    corpo.querySelector('#reimprimir').onclick = () => Impressao.condicional(c);
    if (!aberta) return;
    const total = () => {
      let v = 0;
      corpo.querySelectorAll('[data-id]').forEach((i) => {
        const it = c.itens.find((x) => x.id === Number(i.dataset.id));
        v += Math.min(it.quantidade, Math.max(0, Number(i.value) || 0)) * it.preco_venda;
      });
      corpo.querySelector('#cond-total').innerHTML = v ? `Ficou com <b>${brl(v)}</b> — vai para o caixa` : 'Devolveu tudo';
    };
    corpo.querySelector('tbody').addEventListener('input', total);
    total();
    corpo.querySelector('#cancelar').onclick = async () => {
      if (!(await U.confirmar('Cancelar condicional', 'Todas as peças voltam para o estoque. Confirmar?', { ok: 'Cancelar condicional', perigo: true }))) return;
      try {
        await api(`/api/condicionais/${c.id}/cancelar`, { metodo: 'POST' });
        aviso('Condicional cancelada; peças de volta ao estoque.');
        carregar();
      } catch (e) { erro(e); }
    };
    corpo.querySelector('#fechar').onclick = async () => {
      const itens = [...corpo.querySelectorAll('[data-id]')].map((i) => ({ id: Number(i.dataset.id), ficou: Math.max(0, Number(i.value) || 0) }));
      try {
        const r = await api(`/api/condicionais/${c.id}/fechar`, { metodo: 'POST', corpo: { itens } });
        fecharModal();
        if (!r.ficou.length) {
          aviso('Condicional fechada: todas as peças voltaram para o estoque.');
          return carregar();
        }
        // Monta a venda no caixa com as peças que ela ficou.
        const produtos = await Promise.all(r.ficou.map(async (f) => ({ produto: await api(`/api/produtos/${f.produto_id}`), quantidade: f.quantidade })));
        const cliente = await api(`/api/clientes/${c.cliente_id}`);
        aviso('Condicional fechada. As peças que ela ficou já estão no caixa: é só receber.');
        Telas.pdv.carregarVenda({ itens: produtos, cliente });
      } catch (e) { erro(e); }
    };
  }

  return { abrir, sair: () => { raiz = null; } };
})();
