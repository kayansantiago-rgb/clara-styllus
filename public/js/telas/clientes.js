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

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Clientes</h1><p class="subtitulo">Ficha de cada cliente: o que compra, tamanhos, crediário e contato.</p></div>
        <div class="ferramentas">
          <div class="busca-ico">${Icone('busca')}<input id="q" type="search" placeholder="Nome, CPF ou telefone" autofocus autocomplete="off"></div>
          <button class="btn btn-primario" id="novo">${Icone('mais')} Nova cliente</button>
        </div>
      </div>
      <div class="vd-barra-filtros">
        <div class="segmentos" id="ordem">
          ${[['nome', 'A–Z'], ['recentes', 'Compraram por último'], ['valor', 'Que mais compram']].map(([k, t]) =>
    `<button class="segmento ${k === ordem ? 'sel' : ''}" data-ordem="${k}">${t}</button>`).join('')}
        </div>
        <span class="subtitulo" id="contagem"></span>
      </div>
      <div class="cl-lista" id="lista"></div>`;
    raiz.querySelector('#q').addEventListener('input', U.debounce(carregar));
    raiz.querySelector('#novo').onclick = () => formulario(null, () => carregar());
    raiz.querySelector('#ordem').onclick = (ev) => {
      const b = ev.target.closest('[data-ordem]');
      if (!b) return;
      ordem = b.dataset.ordem;
      raiz.querySelectorAll('.segmento').forEach((x) => x.classList.toggle('sel', x === b));
      carregar();
    };
    raiz.querySelector('#lista').onclick = (ev) => {
      if (ev.target.closest('a')) return; // link do WhatsApp
      const linha = ev.target.closest('[data-i]');
      if (linha) ficha(lista[Number(linha.dataset.i)].id);
    };
    await carregar();
  }

  async function carregar() {
    if (!raiz) return;
    try {
      lista = await api(`/api/clientes?q=${encodeURIComponent(raiz.querySelector('#q').value)}&ordem=${ordem}`);
    } catch (e) { return erro(e); }
    raiz.querySelector('#contagem').textContent = `${lista.length} cliente(s)`;
    raiz.querySelector('#lista').innerHTML = lista.length ? lista.map((c, i) => {
      const w = zap(c.telefone);
      return `<div class="cl-linha" data-i="${i}" data-id="${c.id}" tabindex="0">
        ${avatar(c, 'cl-avatar')}
        <div class="cl-nome"><b>${esc(c.nome)}</b>
          <small>${[c.telefone, c.aniversario && `aniversário ${aniversarioTxt(c.aniversario)}`].filter(Boolean).map(esc).join(' · ') || 'sem contato'}</small></div>
        <div class="cl-num"><small>Comprou</small><b>${brl(c.total_comprado)}</b><small>${c.compras} compra(s)</small></div>
        <div class="cl-num"><small>Última compra</small><b>${c.ultima_compra ? haQuanto(c.ultima_compra) : '—'}</b></div>
        <div class="cl-tags">${c.deve > 0 ? `<span class="selo perigo">deve ${brl(c.deve)}</span>` : ''}</div>
        ${w ? `<a class="btn-ico cl-zap" href="${w}" target="_blank" rel="noopener" title="Conversar no WhatsApp">${Icone('whatsapp')}</a>` : '<span></span>'}
      </div>`;
    }).join('') : `<div class="vd-vazio">${Ilustracao.svg('clientes', 150)}<b>Nenhuma cliente encontrada</b></div>`;
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
    const corpo = abrirModal('Ficha da cliente', `
      <div class="cl-ficha-topo">
        ${avatar(c, 'cl-avatar-g')}
        <div class="cl-ficha-nome">
          <h2>${esc(c.nome)}</h2>
          <div class="cl-contatos">
            ${c.telefone ? `<span>${Icone('telefone')}${esc(c.telefone)}</span>` : ''}
            ${c.aniversario ? `<span>${Icone('bolo')}${aniversarioTxt(c.aniversario)}</span>` : ''}
            ${c.cpf ? `<span>CPF ${esc(U.cpf(c.cpf))}</span>` : ''}
            <span>cliente desde ${new Date(c.criado_em.replace(' ', 'T')).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
        ${w ? `<a class="btn cl-btn-zap" href="${w}" target="_blank" rel="noopener">${Icone('whatsapp')} WhatsApp</a>` : ''}
      </div>

      <div class="cl-kpis">
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

      ${c.pecas_compradas.length ? `<h4>Últimas peças compradas</h4>
        <div class="cl-pecas">${c.pecas_compradas.map((p) => `<div class="cl-peca">
          ${U.miniatura({ id: p.produto_id, foto_versao: p.foto_versao }, 'cl-peca-foto')}
          <b>${esc(p.nome)}</b><small>${esc([p.tamanho, p.cor].filter(Boolean).join(' · ') || '—')}</small>
          <small>${new Date(p.criado_em.replace(' ', 'T')).toLocaleDateString('pt-BR')}</small></div>`).join('')}</div>` : ''}

      ${c.compras.length ? `<h4>Compras</h4><div class="cl-compras">${c.compras.slice(0, 10).map((v) => `
        <div class="cl-compra ${v.status === 'cancelada' ? 'cancelada' : ''}" data-venda="${v.id}">
          <span>${dataHora(v.criado_em)}</span><span>nº ${v.id} · ${v.pecas || 0} peça(s)${v.vendedor ? ` · ${esc(v.vendedor)}` : ''}</span>
          <b>${brl(v.total)}</b></div>`).join('')}</div>` : ''}

      <div class="acoes vd-det-acoes">
        <button class="btn btn-fantasma" id="editar">${Icone('lapis')} Editar dados</button>
        ${U.sessao.ehAdmin() ? `<button class="btn btn-fantasma btn-perigo-claro" id="excluir">${Icone('lixeira')} Excluir cliente</button>` : ''}
        <span class="espaco"></span>
        <button class="btn btn-primario" id="vender">${Icone('sacola')} Vender para ela</button>
      </div>`, { largura: '860px' });
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
