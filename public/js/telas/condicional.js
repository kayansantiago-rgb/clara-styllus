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
        <div><h1>Condicional</h1><p class="subtitulo">Peças que as clientes levaram para provar em casa (malinha).</p></div>
        <div class="ferramentas">
          <div class="segmentos" id="status">
            <button class="segmento sel" data-st="aberta">Abertas</button><button class="segmento" data-st="todas">Todas</button>
          </div>
          <a class="btn btn-primario" href="#/pdv" title="Bipe as peças no caixa, escolha a cliente e clique em Condicional">${Icone('bolsa')} Nova condicional</a>
        </div>
      </div>
      <div class="cd-como">${Icone('bolsa')}<span><b>Como criar:</b> no caixa, bipe as peças, escolha a cliente (F6) e clique em <b>Condicional</b>.
        As peças saem do estoque até a cliente devolver; o que ela ficar vai para o caixa como venda.</span></div>
      <div class="cd-grade" id="lista"></div>`;
    let status = 'aberta';
    raiz.querySelector('#status').onclick = (ev) => {
      const b = ev.target.closest('[data-st]');
      if (!b) return;
      status = b.dataset.st;
      raiz.querySelectorAll('#status .segmento').forEach((x) => x.classList.toggle('sel', x === b));
      carregar(status);
    };
    raiz.querySelector('#lista').onclick = (ev) => {
      const card = ev.target.closest('[data-i]');
      if (card) detalhe(lista[Number(card.dataset.i)].id);
    };
    await carregar(status);
  }

  async function carregar(status = 'aberta') {
    if (!raiz) return;
    try { lista = await api(`/api/condicionais?status=${status}`); } catch (e) { return erro(e); }
    const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    raiz.querySelector('#lista').innerHTML = lista.map((c, i) => {
      const n = diasAte(c.prazo);
      const st = c.status !== 'aberta' ? 'encerrada' : n < 0 ? 'atrasada' : n <= 1 ? 'perto' : 'ok';
      const prazo = c.status !== 'aberta' ? (c.status === 'fechada' ? 'Fechada' : 'Cancelada')
        : n < 0 ? `Atrasada ${-n} dia(s)` : n === 0 ? 'Devolve hoje' : n === 1 ? 'Devolve amanhã' : `Faltam ${n} dias`;
      const fotos = c.itens.slice(0, 5);
      return `<div class="cd-card cd-${st}" data-i="${i}" tabindex="0">
        <div class="cd-topo"><span class="avatar">${esc(iniciais(c.cliente_nome))}</span>
          <div><b>${esc(c.cliente_nome)}</b><small>nº ${c.id} · saiu ${dataHora(c.criado_em).split(' ')[0]}</small></div>
          <span class="cd-prazo">${prazo}<small>até ${c.prazo.split('-').reverse().join('/')}</small></span></div>
        <div class="cd-fotos">${fotos.map((it) => U.miniatura({ id: it.produto_id, foto_versao: it.foto_versao }, 'cd-foto')).join('')}
          ${c.itens.length > 5 ? `<span class="cd-mais">+${c.itens.length - 5}</span>` : ''}</div>
        <div class="cd-rodape"><span><b>${c.pecas}</b> peça(s) · <b>${brl(c.valor)}</b></span>
          ${c.status === 'aberta' ? `<button class="btn btn-primario btn-peq">${Icone('check')} Fechar</button>` : ''}</div>
      </div>`;
    }).join('') || `<div class="vd-vazio cd-vazio">${Ilustracao.svg('bolsa', 150)}<b>Nenhuma condicional ${status === 'aberta' ? 'aberta' : ''}</b><br><small>Crie pelo caixa: bipe as peças, escolha a cliente e clique em Condicional.</small></div>`;
  }

  async function detalhe(id) {
    let c;
    try { c = await api(`/api/condicionais/${id}`); } catch (e) { return erro(e); }
    const aberta = c.status === 'aberta';
    const tel = String(c.cliente_telefone || '').replace(/\D/g, '').replace(/^55/, '');
    const corpo = abrirModal(`Condicional nº ${c.id} — ${c.cliente_nome}`, `
      <div class="tr-cab">
        <span>${selo(c)}</span><span>${Icone('relogio')} saiu ${dataHora(c.criado_em)}${c.usuario ? ` por ${esc(c.usuario)}` : ''}</span>
        <span>${Icone('caderno')} devolver até <b>&nbsp;${c.prazo.split('-').reverse().join('/')}</b></span>
      </div>
      ${c.observacao ? `<p class="dica">${esc(c.observacao)}</p>` : ''}
      ${aberta ? `<div class="cd-conf">
        <div class="busca-ico cd-leitor">${Icone('codigo')}<input id="cd-bipe" placeholder="Bipe aqui as peças que voltaram (ou digite o código e Enter)" autocomplete="off"></div>
        <div class="cd-conf-status" id="cd-conf">Bipe cada peça que a cliente trouxe de volta: o sistema confere o que voltou e o que está faltando.</div>
      </div>
      <div class="p4-passo"><span>1</span>Quantas peças ela ficou? <small class="cd-passo-dica">(bipando, o sistema preenche sozinho)</small></div>` : ''}
      <div class="tr-itens" id="cd-itens">${c.itens.map((it) => `
        <div class="tr-item" data-linha="${it.id}">
          ${U.miniatura({ id: it.produto_id, foto_versao: it.foto_versao }, 'p4-item-foto')}
          <div class="p4-item-txt"><b>${esc(it.nome)}</b>
            <span class="p4-tags">${it.tamanho ? `<span class="p4-tag">Tam ${esc(it.tamanho)}</span>` : ''}${it.cor ? `<span class="p4-tag">${esc(it.cor)}</span>` : ''}<small>${brl(it.preco_venda)} · levou ${it.quantidade}</small></span></div>
          ${aberta ? `<span class="qtd-ctrl p4-qtd"><button type="button" class="mini" data-menos="${it.id}">${Icone('menos')}</button><span data-n="${it.id}">0</span><button type="button" class="mini" data-mais="${it.id}">${Icone('mais')}</button></span>
            <input type="hidden" data-id="${it.id}" value="0"><small class="tr-max">de ${it.quantidade}<span class="cd-voltou" data-voltou="${it.id}"></span></small>`
    : `<b>ficou ${it.ficou ?? 0}</b><span></span>`}
        </div>`).join('')}</div>
      ${aberta ? `<div class="tr-rodape"><div class="tr-total" id="cond-total"></div></div>
      <p class="dica">O que ela não ficou volta para o estoque. As peças que ela ficou vão para o caixa para receber o pagamento.</p>` : ''}
      <div class="acoes">
        ${aberta ? `<button class="btn btn-fantasma btn-perigo-claro so-admin" id="cancelar" style="margin-right:auto">${Icone('fechar')} Cancelar condicional</button>` : ''}
        ${aberta && Zap.attrs(tel, 'condicional', { nome: c.cliente_nome, prazo: c.prazo.split('-').reverse().join('/') })
    ? `<a class="btn cl-btn-zap" ${Zap.attrs(tel, 'condicional', { nome: c.cliente_nome, prazo: c.prazo.split('-').reverse().join('/') })}>${Icone('whatsapp')} Lembrar no WhatsApp</a>` : ''}
        <button class="btn" id="reimprimir">${Icone('impressora')} Imprimir</button>
        ${aberta ? `<button class="btn btn-primario btn-grande" id="fechar">${Icone('check')} Fechar condicional</button>` : ''}
      </div>`, { largura: '820px' });
    corpo.querySelector('#reimprimir').onclick = () => Impressao.condicional(c);
    if (!aberta) return;
    const total = () => {
      let v = 0;
      let n = 0;
      corpo.querySelectorAll('input[data-id]').forEach((i) => {
        const it = c.itens.find((x) => x.id === Number(i.dataset.id));
        const q = Math.min(it.quantidade, Math.max(0, Number(i.value) || 0));
        v += q * it.preco_venda;
        n += q;
        corpo.querySelector(`[data-n="${it.id}"]`).textContent = q;
        corpo.querySelector(`[data-linha="${it.id}"]`).classList.toggle('sel', q > 0);
      });
      corpo.querySelector('#cond-total').innerHTML = n
        ? `<small>Ela ficou com</small><b>${brl(v)}</b><span>${n} peça(s) vão para o caixa · o resto volta para o estoque</span>`
        : '<small>Ela ficou com</small><b>nada</b><span>Todas as peças voltam para o estoque.</span>';
    };
    // Conferência pela bipagem: cada peça bipada "voltou"; o que não voltou fica como compra da cliente.
    const voltou = new Map(c.itens.map((it) => [it.id, 0]));
    let conferindo = false;
    const nomeItem = (it) => [it.nome, it.tamanho, it.cor].filter(Boolean).join(' ');
    const desenharConferencia = () => {
      if (!conferindo) return;
      const levou = c.itens.reduce((a, it) => a + it.quantidade, 0);
      const voltaram = [...voltou.values()].reduce((a, n) => a + n, 0);
      const faltam = c.itens.filter((it) => voltou.get(it.id) < it.quantidade);
      for (const it of c.itens) {
        const v = voltou.get(it.id);
        const linha = corpo.querySelector(`[data-linha="${it.id}"]`);
        linha.classList.toggle('cd-ok', v >= it.quantidade);
        linha.classList.toggle('cd-falta', v < it.quantidade);
        corpo.querySelector(`[data-voltou="${it.id}"]`).textContent = `voltou ${v}`;
      }
      corpo.querySelector('#cd-conf').className = `cd-conf-status ${faltam.length ? 'falta' : 'ok'}`;
      corpo.querySelector('#cd-conf').innerHTML = faltam.length
        ? `<b>Voltaram ${voltaram} de ${levou} peça(s).</b> Faltando: ${faltam.map((it) => `${esc(nomeItem(it))}${it.quantidade - voltou.get(it.id) > 1 ? ` (${it.quantidade - voltou.get(it.id)})` : ''}`).join(', ')}`
        : `${Icone('check')} <b>Voltaram todas as ${levou} peça(s).</b> Nada vai para o caixa.`;
    };
    const aplicarConferencia = () => {
      for (const it of c.itens) corpo.querySelector(`input[data-id="${it.id}"]`).value = it.quantidade - voltou.get(it.id);
      total();
      desenharConferencia();
    };
    const leitor = corpo.querySelector('#cd-bipe');
    leitor.onkeydown = (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const txt = leitor.value.trim();
      leitor.value = '';
      if (!txt) return;
      const m = /^(\d+)\*(.+)$/.exec(txt);
      const qtd = m ? Math.max(1, Number(m[1])) : 1;
      const codigo = (m ? m[2] : txt).trim().toLowerCase();
      const it = c.itens.find((x) => String(x.codigo || '').toLowerCase() === codigo);
      if (!it) { U.som('erro'); return aviso(`Esta peça (${txt}) não é desta condicional.`, 'erro'); }
      if (voltou.get(it.id) + qtd > it.quantidade) {
        U.som('erro');
        return aviso(`${nomeItem(it)}: ela só levou ${it.quantidade} e já voltaram ${voltou.get(it.id)}.`, 'alerta');
      }
      conferindo = true;
      voltou.set(it.id, voltou.get(it.id) + qtd);
      U.som('ok');
      aplicarConferencia();
      corpo.querySelector(`[data-linha="${it.id}"]`).scrollIntoView({ block: 'nearest' });
    };
    setTimeout(() => leitor.focus(), 60);
    corpo.querySelector('#cd-itens').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-mais],[data-menos]');
      if (!b) return;
      const id = b.dataset.mais || b.dataset.menos;
      const inp = corpo.querySelector(`input[data-id="${id}"]`);
      const it = c.itens.find((x) => x.id === Number(id));
      inp.value = Math.max(0, Math.min(it.quantidade, (Number(inp.value) || 0) + (b.dataset.mais ? 1 : -1)));
      total();
    });
    total();
    corpo.querySelector('#cancelar').onclick = async () => {
      if (!(await U.confirmar('Cancelar condicional', 'Todas as peças voltam para o estoque. Confirmar?', { ok: 'Cancelar condicional', perigo: true }))) return;
      try {
        await api(`/api/condicionais/${c.id}/cancelar`, { metodo: 'POST' });
        aviso('Condicional cancelada; peças de volta ao estoque.');
        carregar();
      } catch (e) { erro(e); }
    };
    corpo.querySelector('#fechar').onclick = U.umaVez(corpo.querySelector('#fechar'), async () => {
      const itens = [...corpo.querySelectorAll('[data-id]')].map((i) => ({ id: Number(i.dataset.id), ficou: Math.max(0, Number(i.value) || 0) }));
      // Conferindo pela bipagem e faltou peça: confirma antes de cobrar.
      // (Pede um segundo clique no próprio botão, sem fechar esta janela e perder a conferência.)
      const botao = corpo.querySelector('#fechar');
      if (conferindo) {
        const faltam = c.itens.filter((it) => voltou.get(it.id) < it.quantidade).reduce((a, it) => a + it.quantidade - voltou.get(it.id), 0);
        const chave = [...voltou.values()].join(',');
        if (faltam && botao.dataset.confirmado !== chave) {
          botao.dataset.confirmado = chave;
          botao.innerHTML = `${Icone('alerta')} ${faltam} peça(s) não voltaram — clique de novo para cobrar`;
          aviso(`${faltam} peça(s) não foram bipadas: vão para o caixa como compra da cliente. Se ela ainda vai devolver, deixe a condicional aberta.`, 'alerta');
          return;
        }
      }
      if (itens.some((x) => x.ficou > 0) && !(await Telas.pdv.podeSubstituirVenda())) return;
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
    });
  }

  return { abrir, sair: () => { raiz = null; } };
})();
