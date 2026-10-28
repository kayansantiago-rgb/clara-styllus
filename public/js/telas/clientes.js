/* Clientes: lista, ficha (o que compra, tamanhos, crediário) e cadastro. */
Telas.clientes = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;
  let lista = [];
  let ordem = 'nome';

  const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const zap = (tel) => {
    const d = String(tel || '').replace(/\D/g, '');
    return d.length >= 10 ? `https://wa.me/${d.length <= 11 ? '55' + d : d}` : null;
  };
  /** "hoje", "ontem", "há 12 dias", "há 3 meses". */
  function haQuanto(dt) {
    if (!dt) return '';
    const dias = Math.floor((Date.now() - new Date(dt.replace(' ', 'T')).getTime()) / 864e5);
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ontem';
    if (dias < 45) return `há ${dias} dias`;
    const meses = Math.round(dias / 30);
    return meses < 12 ? `há ${meses} meses` : `há ${Math.floor(meses / 12)} ano(s)`;
  }
  const aniversarioTxt = (a) => (a ? a.split('-').reverse().slice(0, 2).join('/') : '');
  const fotoUrl = (c) => (c && c.foto_versao ? `/api/clientes/${c.id}/foto?v=${c.foto_versao}` : null);
  /** Avatar: a foto da cliente ou as iniciais. */
  const avatar = (c, classe) => (fotoUrl(c)
    ? `<img class="avatar ${classe} cl-foto" src="${fotoUrl(c)}" alt="" loading="lazy">`
    : `<span class="avatar ${classe}">${esc(iniciais(c.nome))}</span>`);

  /** Foto quadrada (corta o meio), 600 × 600, para o avatar. */
  function quadrada(arquivo, lado = 600) {
    return new Promise((ok, falha) => {
      const img = new Image();
      img.onload = () => {
        const m = Math.min(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = Math.min(lado, m);
        c.height = c.width;
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        ok(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => falha(new Error('Não consegui abrir a foto.'));
      img.src = URL.createObjectURL(arquivo);
    });
  }

  let filtro = '';
  const mesAtual = () => new Date().getMonth() + 1;
  const diasDesde = (dt) => (dt ? Math.floor((Date.now() - new Date(dt.replace(' ', 'T')).getTime()) / 864e5) : null);
  /** Selos da cliente: VIP, nova, sumida, devendo, aniversário no mês. */
  function selos(c) {
    const s = [];
    if (c.vencido > 0) s.push(['atrasada', 'Atrasada']);
    else if (c.deve > 0) s.push(['devendo', 'Crediário']);
    if (c.compras >= 5 || c.total_comprado >= 150000) s.push(['vip', 'VIP']);
    if (diasDesde(c.criado_em) !== null && diasDesde(c.criado_em) <= 30) s.push(['nova', 'Nova']);
    const d = diasDesde(c.ultima_compra);
    if (c.compras && d !== null && d > 60) s.push(['sumida', 'Sumida']);
    if (c.aniversario && Number(c.aniversario.split('-')[1]) === mesAtual()) s.push(['niver', 'Aniversário']);
    return s;
  }
  const seloHtml = (s) => s.map(([k, t]) => `<span class="cl-selo cl-selo-${k}">${k === 'vip' ? Icone('estrela') : k === 'niver' ? Icone('bolo') : ''}${t}</span>`).join('');

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Clientes</h1><p class="subtitulo">Quem compra na loja, o que gosta e como falar com ela.</p></div>
        <div class="ferramentas">
          <div class="busca-ico">${Icone('busca')}<input id="q" type="search" placeholder="Nome, CPF ou telefone" autofocus autocomplete="off"></div>
          <button class="btn btn-primario" id="novo">${Icone('mais')} Nova cliente</button>
        </div>
      </div>
      <div class="cl2-kpis" id="kpis"></div>
      <div class="vd-barra-filtros cl2-barra">
        <div class="cl2-filtros" id="filtros"></div>
        <div class="segmentos" id="ordem">
          ${[['nome', 'A–Z'], ['recentes', 'Recentes'], ['valor', 'Que mais compram']].map(([k, t]) =>
    `<button class="segmento ${k === ordem ? 'sel' : ''}" data-ordem="${k}">${t}</button>`).join('')}
        </div>
      </div>
      <div class="cl2-grade" id="lista"></div>`;
    raiz.querySelector('#q').addEventListener('input', U.debounce(carregar));
    raiz.querySelector('#novo').onclick = () => formulario(null, () => carregar());
    raiz.querySelector('#ordem').onclick = (ev) => {
      const b = ev.target.closest('[data-ordem]');
      if (!b) return;
      ordem = b.dataset.ordem;
      raiz.querySelectorAll('#ordem .segmento').forEach((x) => x.classList.toggle('sel', x === b));
      carregar();
    };
    raiz.querySelector('#filtros').onclick = (ev) => {
      const b = ev.target.closest('[data-filtro]');
      if (!b) return;
      filtro = b.dataset.filtro;
      desenhar();
    };
    raiz.querySelector('#kpis').onclick = (ev) => {
      const b = ev.target.closest('[data-filtro]');
      if (!b) return;
      filtro = b.dataset.filtro;
      desenhar();
    };
    raiz.querySelector('#lista').onclick = (ev) => {
      if (ev.target.closest('a')) return; // link do WhatsApp
      const vender = ev.target.closest('[data-vender]');
      const linha = ev.target.closest('[data-i]');
      if (!linha) return;
      const c = lista[Number(linha.dataset.i)];
      if (vender) {
        Telas.pdv.usarCliente({ id: c.id, nome: c.nome, cpf: c.cpf });
        location.hash = '#/pdv';
        return;
      }
      ficha(c.id);
    };
    raiz.querySelector('#lista').onkeydown = (ev) => {
      const linha = ev.target.closest('[data-i]');
      if (linha && ev.key === 'Enter') ficha(lista[Number(linha.dataset.i)].id);
    };
    await carregar();
  }

  async function carregar() {
    if (!raiz) return;
    try {
      lista = await api(`/api/clientes?q=${encodeURIComponent(raiz.querySelector('#q').value)}&ordem=${ordem}`);
    } catch (e) { return erro(e); }
    lista.forEach((c) => { c.selos = selos(c); });
    desenhar();
  }

  function desenhar() {
    const conta = (k) => lista.filter((c) => c.selos.some(([s]) => s === k || (k === 'devendo' && s === 'atrasada'))).length;
    const doMes = lista.filter((c) => diasDesde(c.ultima_compra) !== null && diasDesde(c.ultima_compra) <= 30).length;
    raiz.querySelector('#kpis').innerHTML = `
      <button class="cl2-kpi ${filtro === '' ? 'sel' : ''}" data-filtro=""><span class="cl2-kpi-ico">${Icone('clientes')}</span><div><b>${lista.length}</b><small>clientes</small></div></button>
      <div class="cl2-kpi"><span class="cl2-kpi-ico ok">${Icone('sacola')}</span><div><b>${doMes}</b><small>compraram em 30 dias</small></div></div>
      <button class="cl2-kpi ${filtro === 'niver' ? 'sel' : ''}" data-filtro="niver"><span class="cl2-kpi-ico ouro">${Icone('bolo')}</span><div><b>${conta('niver')}</b><small>fazem aniversário este mês</small></div></button>
      <button class="cl2-kpi ${filtro === 'devendo' ? 'sel' : ''}" data-filtro="devendo"><span class="cl2-kpi-ico perigo">${Icone('caderno')}</span><div><b>${conta('devendo')}</b><small>com crediário aberto</small></div></button>`;
    const FILTROS = [['', 'Todas'], ['vip', 'VIP'], ['nova', 'Novas'], ['sumida', 'Sumidas'], ['devendo', 'Crediário'], ['niver', 'Aniversário']];
    raiz.querySelector('#filtros').innerHTML = FILTROS.map(([k, t]) =>
      `<button class="chip-filtro ${k === filtro ? 'sel' : ''}" data-filtro="${k}">${t}${k ? ` <small>${conta(k)}</small>` : ''}</button>`).join('');
    const mostrar = lista.map((c, i) => [c, i]).filter(([c]) => !filtro || c.selos.some(([s]) => s === filtro || (filtro === 'devendo' && s === 'atrasada')));
    raiz.querySelector('#lista').innerHTML = mostrar.length ? mostrar.map(([c, i]) => {
      const w = zap(c.telefone);
      return `<div class="cl-linha cl2-card ${c.vencido > 0 ? 'atrasada' : ''}" data-i="${i}" data-id="${c.id}" tabindex="0">
        <div class="cl2-topo">
          ${avatar(c, 'cl-avatar cl2-avatar')}
          <div class="cl2-nome"><b>${esc(c.nome)}</b>
            <small>${esc(c.telefone || 'sem telefone')}${c.aniversario ? ` · ${Icone('bolo')} ${aniversarioTxt(c.aniversario)}` : ''}</small></div>
        </div>
        <div class="cl2-selos">${seloHtml(c.selos)}</div>
        <div class="cl2-nums">
          <div><small>Já comprou</small><b>${brl(c.total_comprado)}</b></div>
          <div><small>Compras</small><b>${c.compras}</b></div>
          <div><small>Última</small><b>${c.ultima_compra ? haQuanto(c.ultima_compra) : '—'}</b></div>
        </div>
        ${c.deve > 0 ? `<div class="cl2-deve">${Icone('caderno')} Deve <b>${brl(c.deve)}</b>${c.vencido > 0 ? ` · <b>${brl(c.vencido)}</b> atrasado` : ''}</div>` : ''}
        <div class="cl2-acoes">
          ${w ? `<a class="btn cl2-zap" href="${w}" target="_blank" rel="noopener" title="Conversar no WhatsApp">${Icone('whatsapp')} WhatsApp</a>` : '<span></span>'}
          <button class="btn btn-claro" data-vender title="Abrir o caixa com ela">${Icone('sacola')} Vender</button>
        </div>
      </div>`;
    }).join('') : `<div class="vd-vazio cl2-vazio">${Ilustracao.svg('clientes', 150)}<b>${filtro ? 'Nenhuma cliente neste filtro' : 'Nenhuma cliente encontrada'}</b>
        <p>${filtro ? 'Escolha outro filtro acima.' : 'Cadastre a primeira cliente para acompanhar o que ela compra.'}</p></div>`;
  }

  /** Ficha completa da cliente. */
  async function ficha(id) {
    let c;
    try { c = await api(`/api/clientes/${id}`); } catch (e) { return erro(e); }
    const w = zap(c.telefone);
    const ticket = c.compras ? Math.round(c.total_comprado / c.compras) : 0;
    const chips = (arr, vazio) => (arr.length
      ? arr.map((x) => `<span class="cl-chip">${esc(x.nome)}<small>${x.pecas}</small></span>`).join('') : `<small>${vazio}</small>`);
    const cr = c.crediario || {};
    const sel = selos(c);
    // Linha do tempo: cada compra com as fotos das peças.
    const porVenda = {};
    for (const p of c.pecas_compradas) (porVenda[p.venda_id] = porVenda[p.venda_id] || []).push(p);
    const corpo = abrirModal('Ficha da cliente', `
      <div class="cl3-hero">
        ${avatar(c, 'cl-avatar-g cl3-avatar')}
        <div class="cl3-nome">
          <h2>${esc(c.nome)}</h2>
          <div class="cl2-selos">${seloHtml(sel)}</div>
          <div class="cl-contatos">
            ${c.telefone ? `<span>${Icone('telefone')}${esc(c.telefone)}</span>` : ''}
            ${c.aniversario ? `<span>${Icone('bolo')}${aniversarioTxt(c.aniversario)}</span>` : ''}
            ${c.cpf ? `<span>CPF ${esc(U.cpf(c.cpf))}</span>` : ''}
            <span>cliente desde ${new Date(c.criado_em.replace(' ', 'T')).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
        <div class="cl3-hero-acoes">
          ${w ? `<a class="btn cl2-zap" href="${w}" target="_blank" rel="noopener">${Icone('whatsapp')} WhatsApp</a>` : ''}
          <button class="btn btn-primario" id="vender">${Icone('sacola')} Vender para ela</button>
        </div>
      </div>

      <div class="cl-kpis cl3-kpis">
        <div><small>Total comprado</small><b>${brl(c.total_comprado)}</b></div>
        <div><small>Compras</small><b>${c.compras}</b></div>
        <div><small>Ticket médio</small><b>${brl(ticket)}</b></div>
        <div><small>Última compra</small><b>${c.ultima_compra ? haQuanto(c.ultima_compra) : '—'}</b></div>
      </div>

      ${cr.aberto || c.vales.length || c.condicionais.length ? `<div class="cl-avisos">
        ${cr.aberto ? `<div class="cl-aviso ${cr.vencido ? 'perigo' : 'alerta'}">${Icone('caderno')}<span>Deve <b>${brl(cr.aberto)}</b> no crediário${cr.vencido ? ` · <b>${brl(cr.vencido)} vencido</b>` : ''}</span><a href="#/crediario" data-fechar>ver</a></div>` : ''}
        ${c.vales.map((v) => `<div class="cl-aviso ok">${Icone('vale')}<span>Vale-troca <b>${esc(v.codigo)}</b> com saldo de <b>${brl(v.saldo)}</b>${v.validade ? ` até ${v.validade.split('-').reverse().join('/')}` : ''}</span></div>`).join('')}
        ${c.condicionais.map((x) => `<div class="cl-aviso alerta">${Icone('bolsa')}<span>Está com a condicional nº ${x.id} · devolver até ${x.prazo.split('-').reverse().join('/')}</span><a href="#/condicional" data-fechar>ver</a></div>`).join('')}
      </div>` : ''}

      <div class="cl-pref">
        <div><h4>Tamanhos que ela usa</h4><div class="cl-chips">${chips(c.tamanhos, 'Ainda sem compras com tamanho.')}</div></div>
        <div><h4>Cores preferidas</h4><div class="cl-chips">${chips(c.cores, '—')}</div></div>
        <div><h4>O que mais compra</h4><div class="cl-chips">${chips(c.categorias, '—')}</div></div>
      </div>
      ${c.observacao ? `<div class="cl-obs">${Icone('lapis')}<span>${esc(c.observacao)}</span></div>` : ''}

      ${c.historico.length ? `<h4>Linha do tempo</h4><div class="cl3-tempo">${c.historico.slice(0, 10).map((v) => {
    const pecas = porVenda[v.id] || [];
    return `<div class="cl3-evento ${v.status === 'cancelada' ? 'cancelada' : ''}" data-venda="${v.id}">
          <span class="cl3-ponto"></span>
          <div class="cl3-ev-cab"><b>${new Date(v.criado_em.replace(' ', 'T')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</b>
            <small>${haQuanto(v.criado_em)} · nº ${v.id} · ${v.pecas || 0} peça(s)${v.vendedor ? ` · ${esc(v.vendedor)}` : ''}${v.status === 'cancelada' ? ' · cancelada' : ''}</small>
            <span class="cl3-ev-total">${brl(v.total)}</span></div>
          ${pecas.length ? `<div class="cl3-pecas">${pecas.slice(0, 6).map((p) => `<div class="cl3-peca" title="${esc(p.nome)}">
            ${U.miniatura({ id: p.produto_id, foto_versao: p.foto_versao }, 'cl3-peca-foto')}
            <span><b>${esc(p.nome)}</b><small>${esc([p.tamanho, p.cor].filter(Boolean).join(' · ') || '—')}</small></span></div>`).join('')}</div>` : ''}
        </div>`;
  }).join('')}</div>` : `<div class="cl3-sem">${Icone('sacola')} Ainda não comprou. Que tal mandar uma mensagem com as novidades?</div>`}

      <div class="acoes vd-det-acoes">
        <button class="btn btn-fantasma" id="editar">${Icone('lapis')} Editar dados</button>
        ${U.sessao.ehAdmin() ? `<button class="btn btn-fantasma btn-perigo-claro" id="excluir">${Icone('lixeira')} Excluir cliente</button>` : ''}
      </div>`, { largura: '880px', classe: 'modal-ficha' });
    corpo.querySelector('#editar').onclick = () => formulario(c, () => { carregar(); ficha(c.id); });
    const bExcluir = corpo.querySelector('#excluir');
    if (bExcluir) {
      bExcluir.onclick = async () => {
        const ok = await U.confirmar(`Excluir ${c.nome}?`,
          'O cadastro sai da lista de clientes. Se ela já comprou, o nome continua nas vendas antigas, mas telefone, CPF e aniversário são apagados. Logo depois dá para desfazer.',
          { ok: 'Excluir cliente', perigo: true });
        if (!ok) return ficha(c.id);
        // Sai da lista na hora; só apaga de verdade se não clicar em "Desfazer".
        if (raiz) raiz.querySelectorAll(`[data-id="${c.id}"]`).forEach((x) => { x.hidden = true; });
        U.desfazivel(`${c.nome} foi excluída.`, {
          executar: (fechando) => api(`/api/clientes/${c.id}`, { metodo: 'DELETE', keepalive: fechando }),
          aoDesfazer: () => carregar(),
          depois: () => carregar(),
        });
      };
    }
    corpo.querySelector('#vender').onclick = () => {
      Telas.pdv.usarCliente({ id: c.id, nome: c.nome, cpf: c.cpf });
      fecharModal();
      location.hash = '#/pdv';
    };
    corpo.querySelectorAll('[data-venda]').forEach((el) => {
      el.onclick = () => Telas.vendas.detalhe(el.dataset.venda);
    });
  }

  /** Formulário de cadastro/edição; chama aoSalvar(cliente) depois de gravar. */
  async function formulario(c, aoSalvar) {
    c = c || {};
    const corpo = abrirModal(c.id ? 'Editar cliente' : 'Nova cliente', `
      <form class="form fp" autocomplete="off">
        <section class="fp-secao cl-foto-secao">
          <div class="cl-foto-previa" id="cl-foto-previa">${fotoUrl(c) ? `<img src="${fotoUrl(c)}" alt="">` : `<span>${Icone('usuario')}</span>`}</div>
          <div class="cl-foto-acoes">
            <b>Foto da cliente</b>
            <small>Ajuda a reconhecer a cliente no caixa e no crediário. Opcional.</small>
            <div class="fp-foto-acoes">
              <label class="btn btn-claro btn-peq">${Icone('camera')} Escolher foto<input type="file" accept="image/*" id="cl-foto-arquivo" hidden></label>
              <button type="button" class="btn btn-claro btn-peq" id="cl-foto-celular">${Icone('telefone')} Pelo celular</button>
              <button type="button" class="btn btn-fantasma btn-perigo-claro btn-peq" id="cl-foto-remover" ${fotoUrl(c) ? '' : 'hidden'} title="Tirar a foto">${Icone('lixeira')}</button>
            </div>
          </div>
          <div class="fp-celular cl-celular" id="cl-celular-painel" hidden></div>
        </section>
        <section class="fp-secao">
          <h3>Dados da cliente</h3>
          <label>Nome *<input name="nome" class="campo-destaque" required value="${esc(c.nome)}" autofocus placeholder="Nome completo"></label>
          <div class="fp-grid3">
            <label>Telefone / WhatsApp<input name="telefone" value="${esc(c.telefone)}" placeholder="(63) 99999-9999"></label>
            <label>CPF<input name="cpf" inputmode="numeric" value="${esc(U.cpf(c.cpf))}" placeholder="Opcional"></label>
            <label>Aniversário<input name="aniversario" type="date" value="${esc(c.aniversario)}"></label>
          </div>
          <label>E-mail<input name="email" type="email" value="${esc(c.email)}" placeholder="Opcional"></label>
          <label>Observações <small>tamanhos, preferências, estilo…</small><textarea name="observacao" rows="2">${esc(c.observacao)}</textarea></label>
        </section>
        <section class="fp-secao so-admin">
          <h3>Crediário</h3>
          <label>Limite no crediário <small>vazio = sem limite</small>
            <div class="campo-moeda" style="max-width:260px"><span>R$</span><input name="limite_credito" inputmode="decimal" value="${c.limite_credito != null ? U.num(c.limite_credito) : ''}"></div></label>
        </section>
        <div class="fp-rodape">
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button class="btn btn-primario">${Icone('check')} Salvar</button>
        </div>
      </form>`, { largura: '640px' });
    // Foto: undefined = não mexeu; null = tirar; string = nova.
    let foto;
    const previa = corpo.querySelector('#cl-foto-previa');
    const usarFoto = async (arquivo) => {
      try {
        foto = await quadrada(arquivo);
        previa.innerHTML = `<img src="${foto}" alt="">`;
        corpo.querySelector('#cl-foto-remover').hidden = false;
      } catch (e) { erro(e); }
    };
    corpo.querySelector('#cl-foto-arquivo').onchange = (ev) => {
      const arq = ev.target.files[0];
      ev.target.value = '';
      if (arq) usarFoto(arq);
    };
    corpo.querySelector('#cl-foto-celular').onclick = () => FotoCelular.abrir(corpo.querySelector('#cl-celular-painel'), {
      tipo: 'cliente',
      nome: corpo.querySelector('[name=nome]').value.trim() || c.nome || 'Cliente nova',
      aoReceber: usarFoto,
    });
    corpo.querySelector('#cl-foto-remover').onclick = () => {
      foto = null;
      previa.innerHTML = `<span>${Icone('usuario')}</span>`;
      corpo.querySelector('#cl-foto-remover').hidden = true;
    };
    corpo.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      const d = U.dadosForm(ev.target);
      if (d.cpf && !U.cpfValido(d.cpf)) return aviso('CPF inválido.', 'erro');
      if (d.limite_credito) {
        d.limite_credito = U.paraCentavos(d.limite_credito);
        if (Number.isNaN(d.limite_credito)) return aviso('Limite inválido.', 'erro');
      }
      try {
        const salvo = await api(c.id ? `/api/clientes/${c.id}` : '/api/clientes', { metodo: c.id ? 'PUT' : 'POST', corpo: d });
        if (foto !== undefined) {
          const r = await api(`/api/clientes/${salvo.id}/foto`, foto ? { metodo: 'PUT', corpo: { imagem: foto } } : { metodo: 'DELETE' });
          salvo.foto_versao = foto ? r.foto_versao : null;
        }
        aviso('Cliente salva.');
        fecharModal();
        if (aoSalvar) aoSalvar(salvo);
      } catch (e) { erro(e); }
    };
  }

  return { abrir, formulario, ficha, sair: () => { raiz = null; } };
})();
