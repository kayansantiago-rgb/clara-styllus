/* Lista de espera: peças que as clientes pediram e acabaram. Avisa quando chegam ao estoque. */
Telas.espera = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;
  let lista = [];
  let aba = 'chegou';

  const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const diasDesde = (d) => Math.max(0, Math.round((Date.now() - Date.parse(d.replace(' ', 'T'))) / 864e5));
  const pecaTxt = (e) => (e.produto_id
    ? [e.produto_nome, e.produto_tamanho && `Tam ${e.produto_tamanho}`, e.produto_cor].filter(Boolean).join(' · ')
    : [e.descricao, e.tamanho && `Tam ${e.tamanho}`, e.cor].filter(Boolean).join(' · '));
  const whats = (e) => {
    const tel = String(e.cliente_telefone || '').replace(/\D/g, '').replace(/^55/, '');
    if (tel.length < 10) return null;
    const p = e.chegou;
    const peca = p ? [p.nome, p.tamanho && `tamanho ${p.tamanho}`, p.cor].filter(Boolean).join(', ') : pecaTxt(e);
    const msg = `Oi, ${e.cliente_nome.split(' ')[0]}! Aqui é da Clara Styllus 💕 Chegou ${peca}${p ? ` (${brl(p.preco_venda)})` : ''} que você pediu! Quer que eu separe para você?`;
    return `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;
  };

  const ABAS = [
    ['chegou', 'Chegou', (e) => e.chegou && e.status === 'aguardando'],
    ['aguardando', 'Aguardando', (e) => !e.chegou && e.status === 'aguardando'],
    ['avisada', 'Avisadas', (e) => e.status === 'avisada'],
    ['encerrados', 'Encerrados', (e) => e.status === 'atendida' || e.status === 'cancelada'],
  ];

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Lista de espera</h1><p class="subtitulo">Quem pediu uma peça ou tamanho que acabou. Quando chega, é só avisar.</p></div>
        <div class="ferramentas"><button class="btn btn-primario" id="novo">${Icone('sino')} Anotar pedido</button></div>
      </div>
      <div class="segmentos es-abas" id="abas"></div>
      <div class="es-lista" id="lista"></div>`;
    raiz.querySelector('#novo').onclick = () => anotar({ aoSalvar: carregar });
    raiz.querySelector('#abas').onclick = (ev) => {
      const b = ev.target.closest('[data-aba]');
      if (!b) return;
      aba = b.dataset.aba;
      desenhar();
    };
    raiz.querySelector('#lista').onclick = acao;
    await carregar();
  }

  async function carregar() {
    if (!raiz) return;
    try { lista = await api('/api/espera?status=todos'); } catch (e) { return erro(e); }
    if (aba === 'chegou' && !lista.some(ABAS[0][2])) aba = lista.some(ABAS[1][2]) ? 'aguardando' : 'chegou';
    desenhar();
    window.atualizarBolinhaEspera && window.atualizarBolinhaEspera();
  }

  function desenhar() {
    raiz.querySelector('#abas').innerHTML = ABAS.map(([k, n, f]) => {
      const qtd = lista.filter(f).length;
      return `<button class="segmento ${k === aba ? 'sel' : ''} ${k === 'chegou' && qtd ? 'es-tem' : ''}" data-aba="${k}">${n}${qtd ? ` <span class="es-n">${qtd}</span>` : ''}</button>`;
    }).join('');
    const filtro = ABAS.find((x) => x[0] === aba)[2];
    const itens = lista.filter(filtro);
    raiz.querySelector('#lista').innerHTML = itens.map((e) => {
      const p = e.chegou;
      const link = whats(e);
      const dias = diasDesde(e.criado_em);
      return `<div class="es-card ${p && e.status !== 'atendida' && e.status !== 'cancelada' ? 'chegou' : ''} es-${e.status}" data-id="${e.id}">
        <div class="es-cli"><span class="avatar">${esc(iniciais(e.cliente_nome))}</span>
          <div><b>${esc(e.cliente_nome)}</b><small>${esc(e.cliente_telefone || 'sem telefone')}</small></div></div>
        <div class="es-peca">
          ${U.miniatura(p ? { id: p.id, foto_versao: p.foto_versao } : e.produto_id ? { id: e.produto_id, foto_versao: e.produto_foto_versao } : null, 'es-foto')}
          <div><b>${esc(pecaTxt(e))}</b>
            <small>pediu ${dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`}${e.usuario ? ` · anotado por ${esc(e.usuario)}` : ''}</small>
            ${e.observacao ? `<small class="es-obs">“${esc(e.observacao)}”</small>` : ''}</div>
        </div>
        <div class="es-situacao">
          ${e.status === 'atendida' ? '<span class="selo ok">Atendida</span>' : e.status === 'cancelada' ? '<span class="selo">Cancelada</span>'
    : p ? `<span class="es-chegou">${Icone('sino')} Chegou! <small>${p.estoque} em estoque${e.produto_id ? '' : ` · ${esc(p.nome)}${p.tamanho ? ` ${esc(p.tamanho)}` : ''}`}</small></span>`
      : '<span class="es-esperando"><i></i>Aguardando chegar</span>'}
          ${e.status === 'avisada' ? `<small>avisada ${dataHora(e.avisado_em)}</small>` : ''}
        </div>
        <div class="es-acoes">
          ${['aguardando', 'avisada'].includes(e.status) ? `
            ${p && link ? `<a class="btn cl-btn-zap btn-peq" href="${link}" target="_blank" rel="noopener" data-avisar>${Icone('whatsapp')} Avisar</a>` : ''}
            ${p ? `<button class="btn btn-primario btn-peq" data-vender>${Icone('sacola')} Vender</button>` : ''}
            <button class="btn-ico" data-atendida title="Marcar como atendida">${Icone('check')}</button>
            <button class="btn-ico" data-cancelar title="Tirar da lista">${Icone('lixeira')}</button>`
    : `<button class="btn-ico" data-reabrir title="Voltar para a lista">${Icone('troca')}</button>`}
        </div>
      </div>`;
    }).join('') || `<div class="vd-vazio">${Ilustracao.svg(aba === 'chegou' ? 'presente' : 'busca', 150)}
      <b>${aba === 'chegou' ? 'Nenhuma peça pedida chegou ainda' : aba === 'aguardando' ? 'Ninguém esperando peça' : 'Nada por aqui'}</b><br>
      <small>${aba === 'chegou' ? 'Quando uma peça da lista voltar ao estoque, ela aparece aqui para você avisar a cliente.' : 'Anote quando uma cliente pedir uma peça ou tamanho que acabou.'}</small></div>`;
  }

  async function mudar(id, status) {
    try { await api(`/api/espera/${id}/status`, { metodo: 'POST', corpo: { status } }); } catch (e) { erro(e); }
    carregar();
  }

  async function acao(ev) {
    const card = ev.target.closest('[data-id]');
    if (!card) return;
    const e = lista.find((x) => x.id === Number(card.dataset.id));
    if (ev.target.closest('[data-avisar]')) { setTimeout(() => mudar(e.id, 'avisada'), 300); return; }
    if (ev.target.closest('[data-atendida]')) return mudar(e.id, 'atendida');
    if (ev.target.closest('[data-reabrir]')) return mudar(e.id, 'aguardando');
    if (ev.target.closest('[data-cancelar]')) {
      if (await U.confirmar('Tirar da lista de espera?', `${e.cliente_nome}: ${pecaTxt(e)}`)) mudar(e.id, 'cancelada');
      return;
    }
    if (ev.target.closest('[data-vender]')) {
      try {
        const produto = await api(`/api/produtos/${e.chegou.id}`);
        await api(`/api/espera/${e.id}/status`, { metodo: 'POST', corpo: { status: 'atendida' } });
        Telas.pdv.carregarVenda({ itens: [{ produto, quantidade: 1 }], cliente: { id: e.cliente_id, nome: e.cliente_nome, cpf: e.cliente_cpf } });
      } catch (err) { erro(err); }
    }
  }

  /**
   * Anotar um pedido. Pode vir com a peça (bipada no caixa sem estoque) e/ou a cliente já escolhidas.
   */
  function anotar({ produto = null, cliente = null, aoSalvar } = {}) {
    let cli = cliente;
    let prod = produto;
    const corpo = abrirModal('Anotar na lista de espera', `
      <div class="es-form">
        <div class="p4-passo"><span>1</span>Quem quer</div>
        <div id="es-cli"></div>
        <div class="p4-passo"><span>2</span>Qual peça</div>
        <div id="es-prod"></div>
        <label>Observação <small>opcional</small><input id="es-obs" placeholder="Ex.: quer para o casamento dia 20"></label>
        <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button>
          <button class="btn btn-primario btn-grande" id="es-ok">${Icone('sino')} Anotar</button></div>
      </div>`, { largura: '600px' });

    const desenharCli = () => {
      const el = corpo.querySelector('#es-cli');
      if (cli) {
        el.innerHTML = `<div class="es-escolhido"><span class="avatar">${esc(iniciais(cli.nome))}</span><div><b>${esc(cli.nome)}</b><small>${esc(cli.telefone || '')}</small></div>
          <button type="button" class="btn btn-peq" id="troca-cli">Trocar</button></div>`;
        el.querySelector('#troca-cli').onclick = () => { cli = null; desenharCli(); };
        return;
      }
      el.innerHTML = `<div class="busca-ico">${Icone('busca')}<input id="es-qcli" placeholder="Nome, telefone ou CPF da cliente" autocomplete="off"></div>
        <div class="es-res" id="es-rcli"></div>`;
      const q = el.querySelector('#es-qcli');
      const res = el.querySelector('#es-rcli');
      const buscar = U.debounce(async () => {
        const t = q.value.trim();
        if (!t) { res.innerHTML = ''; return; }
        let r = [];
        try { r = await api(`/api/clientes?q=${encodeURIComponent(t)}`); } catch (e) { return erro(e); }
        res.innerHTML = r.slice(0, 6).map((c, i) => `<button type="button" data-c="${i}"><span class="avatar">${esc(iniciais(c.nome))}</span><span><b>${esc(c.nome)}</b><small>${esc(c.telefone || '')}</small></span></button>`).join('')
          + `<button type="button" data-novo class="es-novo">${Icone('mais')}<span><b>Cadastrar “${esc(t)}”</b><small>cliente nova</small></span></button>`;
        res.onclick = async (ev) => {
          const b = ev.target.closest('[data-c],[data-novo]');
          if (!b) return;
          if (b.dataset.c !== undefined) { cli = r[Number(b.dataset.c)]; desenharCli(); return; }
          const tel = await U.perguntar('Cliente nova', `Telefone / WhatsApp de ${t} (para avisar quando chegar):`, { obrigatorio: false });
          if (tel === null) return;
          try {
            const c = await api('/api/clientes', { metodo: 'POST', corpo: { nome: t, telefone: tel } });
            // perguntar() fecha o modal: reabre com o que já foi preenchido.
            anotar({ produto: prod, cliente: c, aoSalvar });
          } catch (e) { erro(e); }
        };
      }, 200);
      q.addEventListener('input', buscar);
      q.focus();
    };

    const desenharProd = () => {
      const el = corpo.querySelector('#es-prod');
      if (prod) {
        el.innerHTML = `<div class="es-escolhido">${U.miniatura(prod, 'es-foto')}<div><b>${esc(prod.nome)}</b>
          <small>${[prod.tamanho && `Tam ${prod.tamanho}`, prod.cor, `${prod.estoque} em estoque`].filter(Boolean).join(' · ')}</small></div>
          <button type="button" class="btn btn-peq" id="troca-prod">Trocar</button></div>`;
        el.querySelector('#troca-prod').onclick = () => { prod = null; desenharProd(); };
        return;
      }
      el.innerHTML = `<div class="busca-ico">${Icone('busca')}<input id="es-qprod" placeholder="Procure a peça no cadastro (ou descreva abaixo)" autocomplete="off"></div>
        <div class="es-res" id="es-rprod"></div>
        <div class="es-ou"><span>ou descreva</span></div>
        <div class="grade-form tres">
          <label class="col2">Peça<input id="es-desc" placeholder="Ex.: vestido midi floral"></label>
          <label>Tamanho<input id="es-tam" placeholder="M"></label>
          <label>Cor<input id="es-cor" placeholder="opcional"></label>
        </div>`;
      const q = el.querySelector('#es-qprod');
      const res = el.querySelector('#es-rprod');
      q.addEventListener('input', U.debounce(async () => {
        const t = q.value.trim();
        if (!t) { res.innerHTML = ''; return; }
        let r = [];
        try { r = await api(`/api/produtos?q=${encodeURIComponent(t)}&limite=8`); } catch (e) { return erro(e); }
        res.innerHTML = r.map((p, i) => `<button type="button" data-p="${i}">${U.miniatura(p, 'es-foto-mini')}<span><b>${esc(p.nome)}</b>
          <small>${[p.tamanho && `Tam ${p.tamanho}`, p.cor].filter(Boolean).join(' · ')} · <span class="${p.estoque > 0 ? '' : 'txt-perigo'}">${p.estoque} em estoque</span></small></span></button>`).join('')
          || '<small class="dica">Nada no cadastro. Descreva a peça abaixo.</small>';
        res.onclick = (ev) => {
          const b = ev.target.closest('[data-p]');
          if (b) { prod = r[Number(b.dataset.p)]; desenharProd(); }
        };
      }, 200));
    };

    desenharCli();
    desenharProd();
    corpo.querySelector('#es-ok').onclick = async () => {
      if (!cli) return aviso('Escolha a cliente.', 'erro');
      const desc = corpo.querySelector('#es-desc');
      if (!prod && !(desc && desc.value.trim())) return aviso('Escolha a peça ou descreva o que ela quer.', 'erro');
      try {
        await api('/api/espera', {
          metodo: 'POST',
          corpo: {
            cliente_id: cli.id, produto_id: prod ? prod.id : null,
            descricao: desc ? desc.value : '', tamanho: corpo.querySelector('#es-tam')?.value, cor: corpo.querySelector('#es-cor')?.value,
            observacao: corpo.querySelector('#es-obs').value,
          },
        });
        fecharModal();
        aviso(`Anotado: avisamos ${cli.nome.split(' ')[0]} quando chegar.`);
        if (aoSalvar) aoSalvar();
        window.atualizarBolinhaEspera && window.atualizarBolinhaEspera();
      } catch (e) { erro(e); }
    };
  }

  return { abrir, anotar, sair: () => { raiz = null; } };
})();
