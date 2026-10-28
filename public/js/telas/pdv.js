/* Tela de venda (frente de caixa). */
Telas.pdv = (() => {
  const { esc, brl, num, api, aviso, erro, abrirModal, fecharModal, local } = U;
  const CHAVE = 'pdv_carrinho';
  const FORMAS_RAPIDAS = [
    ['dinheiro', 'dinheiro', 'Dinheiro'],
    ['pix', 'pix', 'PIX'],
    ['debito', 'cartao', 'Débito'],
    ['credito', 'cartao', 'Crédito'],
    ['crediario', 'caderno', 'Crediário'],
  ];
  let raiz;
  let carrinho;
  let caixa = null;
  let sugestoes = [];
  let selecionada = -1;
  let relogio = null;
  let saldoCliente = null;

  const novoCarrinho = () => ({ itens: [], desconto: '', cliente: null, cpf_nota: '' });
  const salvar = () => local.gravar(CHAVE, carrinho);

  /** "10%" -> percentual sobre a base; "5,00" -> valor. Retorna centavos ou NaN. */
  function lerDesconto(txt, base) {
    const s = String(txt || '').trim();
    if (!s) return 0;
    if (s.endsWith('%')) {
      const pct = Number(s.slice(0, -1).replace(',', '.'));
      return Number.isFinite(pct) ? Math.round((base * pct) / 100) : NaN;
    }
    return U.paraCentavos(s);
  }

  const brutoItem = (it) => it.produto.preco_venda * it.quantidade;
  const totalItem = (it) => brutoItem(it) - (it.desconto || 0);

  function totais() {
    const bruto = carrinho.itens.reduce((a, it) => a + brutoItem(it), 0);
    const subtotal = carrinho.itens.reduce((a, it) => a + totalItem(it), 0);
    let descontoGeral = lerDesconto(carrinho.desconto, subtotal);
    if (!Number.isFinite(descontoGeral) || descontoGeral < 0) descontoGeral = 0;
    descontoGeral = Math.min(descontoGeral, subtotal);
    const pecas = carrinho.itens.reduce((a, it) => a + it.quantidade, 0);
    return { bruto, subtotal, descontoGeral, total: subtotal - descontoGeral, pecas };
  }

  // -------------------------------------------------------------- render
  async function abrir(el) {
    raiz = el;
    carrinho = local.ler(CHAVE, null) || novoCarrinho();
    const r = await api('/api/caixa/atual');
    if (!raiz) return; // saiu da tela enquanto carregava
    caixa = r.caixa;
    pararRelogio();
    if (!caixa) return telaCaixaFechado();

    const hora = caixa.aberto_em.split(' ')[1]?.slice(0, 5) || '';
    const eu = U.sessao.usuario;
    raiz.innerHTML = `
      <div class="pdv4 pdv5">
        <header class="p4-topo">
          <div class="p3-mais">
            <button class="p4-nav-btn" id="t-nav" title="Ir para outra tela">${Icone('grade')}<span>Menu</span></button>
            <div class="p3-menu p4-nav" id="menu-nav" hidden>
              <a href="#/inicio" data-admin>${Icone('inicio')} Início</a>
              <a href="#/produtos">${Icone('roupa')} Produtos</a>
              <a href="#/vendas">${Icone('recibo')} Vendas</a>
              <a href="#/clientes">${Icone('clientes')} Clientes</a>
              <a href="#/crediario">${Icone('caderno')} Crediário</a>
              <a href="#/condicional">${Icone('bolsa')} Condicional</a>
              <a href="#/reservas">${Icone('reserva')} Reservas</a>
              <a href="#/espera">${Icone('sino')} Lista de espera</a>
              <a href="#/etiquetas">${Icone('etiqueta')} Etiquetas</a>
              <a href="#/caixa">${Icone('carteira')} Caixa</a>
              <a href="#/despesas" data-admin>${Icone('dinheiro')} Despesas</a>
              <a href="#/relatorios" data-admin>${Icone('grafico')} Relatórios</a>
              <a href="#/config" data-admin>${Icone('ajustes')} Configurações</a>
            </div>
          </div>
          <div class="p5-marca"><span class="marca-logo"><img src="/img/cs.png" alt="CS"></span></div>
          <div class="p4-caixa" title="Caixa ${caixa.id} aberto desde ${esc(hora)}"><span class="ponto ok"></span><b>Caixa ${caixa.id}</b><small>${esc(hora)}</small></div>
          <div class="p4-topo-acoes">
            <button class="p4-acao p5-espera" id="t-espera" title="Vendas em espera (F3)">${Icone('relogio')}<span>Em espera</span><i class="p5-badge" id="espera-n" hidden></i></button>
            <button class="p4-acao" id="t-troca" title="Troca ou devolução de uma venda (bipe o cupom)">${Icone('troca')}<span>Troca</span></button>
            <button class="p4-acao" id="t-condicional" title="Mandar as peças desta venda como condicional (malinha)">${Icone('bolsa')}<span>Condicional</span></button>
            <button class="p4-acao" id="t-reservar" title="Separar as peças com sinal para a cliente buscar depois">${Icone('reserva')}<span>Reservar</span></button>
            <button class="p4-acao" id="t-crediario" title="Receber pagamento do crediário (F10)">${Icone('caderno')}<span>Crediário</span></button>
            <div class="p3-mais">
              <button class="p4-acao" id="t-mais" title="Sangria, suprimento e fechar o caixa">${Icone('carteira')}<span>Caixa</span></button>
              <div class="p3-menu" id="menu-caixa" hidden>
                <button id="t-sangria">${Icone('retirar')} Sangria <small>retirar dinheiro</small></button>
                <button id="t-suprimento">${Icone('colocar')} Suprimento <small>colocar troco</small></button>
                <button id="t-tela">${Icone('telaCheia')} Tela cheia <small>F11</small></button>
                <hr>
                <button id="t-fechar" class="perigo">${Icone('cadeado')} Fechar o caixa</button>
              </div>
            </div>
          </div>
          <div class="p4-quem" title="Vendas ficam no nome de quem está logado">
            <span class="avatar">${esc(String(eu.nome || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase())}</span>
            <div><b>${esc(eu.nome.split(' ')[0])}</b><button class="link" onclick="exigirLogin()" type="button">trocar</button></div>
          </div>
          <span class="pdv-relogio" id="relogio"></span>
        </header>

        <section class="p4-venda">
          <div class="pdv-busca p4-busca">
            <span class="pdv-busca-ico">${Icone('codigo')}</span>
            <input id="busca" autocomplete="off" placeholder="Bipe aqui ou digite o nome da peça…">
            <kbd>F2</kbd>
            <div id="sugestoes" class="sugestoes" hidden></div>
          </div>
          <div class="pdv-ultimo p5-ultimo" id="ultimo"></div>
          <div class="pdv-alertas" id="alertas"></div>
          <div class="p4-lista-cab">
            <div><b>Sacola</b><span id="itens-cont"></span></div>
            <div class="p5-lista-acoes">
              <button class="btn btn-claro btn-peq" id="t-pausar" title="Guardar esta venda e atender outra cliente (F3)">${Icone('relogio')} Pôr em espera</button>
              <button class="btn btn-claro btn-peq" id="btn-sem-etiqueta">${Icone('estrela')} Peça sem etiqueta</button>
            </div>
          </div>
          <div class="pdv-lista p4-lista" id="itens"></div>
          <div class="p4-rapidos" id="secao-atalhos" hidden>
            <span>${Icone('raio')} Rápido</span>
            <div class="pdv-atalhos" id="atalhos"></div>
          </div>
          <div class="p5-teclas">${[['F2', 'Buscar'], ['F3', 'Em espera'], ['F4', 'Dividir'], ['F6', 'Cliente'], ['F7', 'Desconto'], ['F8', 'Tirar última'], ['F9', 'Cancelar'], ['F10', 'Crediário']]
    .map(([k, t]) => `<span><kbd>${k}</kbd>${t}</span>`).join('')}</div>
        </section>

        <aside class="p4-pagar">
          <div class="p4-passo">Cliente</div>
          <button class="pdv-cliente" id="btn-cliente">
            <span class="pdv-cliente-ico">${Icone('usuario')}</span>
            <span id="cliente-info" class="pdv-cliente-txt"></span>
            <kbd>F6</kbd>
          </button>
          <div class="p4-total">
            <small>Total a pagar</small>
            <b id="t-total"></b>
            <div class="p4-total-det"><span><b id="t-pecas"></b> peça(s)</span><span>Subtotal <b id="t-sub"></b></span><span>Desconto <b id="t-desc"></b></span></div>
            <div class="p6-economia" id="t-economia" hidden></div>
          </div>
          <div class="p4-ajustes">
            <button id="btn-desconto">${Icone('etiqueta')}<span id="desconto-txt">Desconto</span><kbd>F7</kbd></button>
            <button id="btn-cpf">${Icone('recibo')}<span id="cpf-txt">CPF na nota</span></button>
          </div>
          <div class="p4-passo">Pagamento</div>
          <div class="pdv-pagar p4-formas">
            ${[...FORMAS_RAPIDAS, ['vale', 'vale', 'Vale-troca']].map(([k, ico, nome]) => `<button class="pdv-forma" data-forma="${k}">${Icone.pag(k)}<span>${nome}</span></button>`).join('')}
          </div>
          <div class="p4-rodape-pagar">
            <button class="link" id="btn-finalizar">${Icone('mais')} Dividir <kbd>F4</kbd></button>
            <button class="link p4-cancelar" id="btn-limpar">${Icone('fechar')} Cancelar <kbd>F9</kbd></button>
          </div>
        </aside>
      </div>`;

    const busca = raiz.querySelector('#busca');
    busca.addEventListener('keydown', teclaBusca);
    busca.addEventListener('input', U.debounce(() => sugerir(busca.value), 200));
    busca.addEventListener('blur', () => setTimeout(esconderSugestoes, 150));
    raiz.querySelector('#btn-desconto').onclick = pedirDesconto;
    raiz.querySelector('#btn-cpf').onclick = pedirCpf;
    raiz.querySelector('#btn-sem-etiqueta').onclick = abrirVitrine;
    const nav = raiz.querySelector('#menu-nav');
    raiz.querySelector('#t-nav').onclick = (ev) => { ev.stopPropagation(); nav.hidden = !nav.hidden; };
    raiz.querySelector('#btn-cliente').onclick = () => escolherCliente();
    raiz.querySelector('#btn-finalizar').onclick = () => finalizar('dinheiro', undefined, { dividir: true });
    raiz.querySelector('#btn-limpar').onclick = limpar;
    raiz.querySelector('#itens').addEventListener('click', cliqueItem);
    raiz.querySelector('.pdv-pagar').onclick = (e) => {
      const b = e.target.closest('[data-forma]');
      if (b) finalizar(b.dataset.forma);
    };
    const recarregar = () => { atualizarStatusCaixa(); if (raiz) abrir(raiz); };
    raiz.querySelector('#t-sangria').onclick = () => Telas.caixa.movimento('sangria', recarregar);
    raiz.querySelector('#t-suprimento').onclick = () => Telas.caixa.movimento('suprimento', recarregar);
    raiz.querySelector('#t-troca').onclick = () => Trocas.perguntarVenda();
    raiz.querySelector('#t-condicional').onclick = () => enviarCondicional();
    raiz.querySelector('#t-reservar').onclick = () => reservar();
    raiz.querySelector('#t-crediario').onclick = () => receberCrediario();
    raiz.querySelector('#t-pausar').onclick = () => pausarVenda();
    raiz.querySelector('#t-espera').onclick = () => listaEspera();
    contarEspera();
    raiz.querySelector('#t-tela').onclick = alternarTelaCheia;
    const menu = raiz.querySelector('#menu-caixa');
    raiz.querySelector('#t-mais').onclick = (ev) => { ev.stopPropagation(); menu.hidden = !menu.hidden; };
    menu.onclick = () => { menu.hidden = true; };
    // onclick (e não addEventListener): o container é o mesmo a cada venda, não pode acumular.
    raiz.onclick = (ev) => {
      if (!ev.target.closest('#t-mais')) menu.hidden = true;
      if (!ev.target.closest('#t-nav')) nav.hidden = true;
    };
    carregarAtalhos();
    raiz.querySelector('#t-fechar').onclick = async () => {
      if (carrinho.itens.length && !(await U.confirmar('Fechar caixa',
        'Há uma venda em andamento. Ela continua guardada e volta quando o caixa for aberto de novo. Fechar mesmo assim?',
        { ok: 'Fechar caixa' }))) return;
      Telas.caixa.fechar(null, recarregar);
    };
    iniciarRelogio();
    carregarSaldoCliente();
    desenhar();
    busca.focus();
  }

  function iniciarRelogio() {
    const el = raiz.querySelector('#relogio');
    const tic = () => {
      if (!el.isConnected) return pararRelogio();
      const d = new Date();
      el.innerHTML = `<b>${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b>
        <span>${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>`;
    };
    tic();
    relogio = setInterval(tic, 15000);
  }

  function pararRelogio() {
    if (relogio) clearInterval(relogio);
    relogio = null;
  }

  function telaCaixaFechado() {
    raiz.innerHTML = `<div class="centro pdv-fechado">${Telas.caixa.formAbrir()}</div>`;
    Telas.caixa.ligarFormAbrir(raiz, () => {
      atualizarStatusCaixa();
      if (raiz) abrir(raiz);
    });
  }

  /**
   * Receber parcela do crediário pelo caixa: se a cliente da venda deve, já abre o recebimento dela;
   * senão, mostra quem está devendo para escolher.
   */
  function receberCrediario() {
    const atualizar = () => { carregarSaldoCliente(); atualizarStatusCaixa(); };
    if (carrinho.cliente && saldoCliente && saldoCliente.aberto > 0) return Telas.crediario.receber(carrinho.cliente.id, atualizar);
    const corpo = abrirModal('Receber crediário: quem vai pagar?', `
      <div class="ec">
        <div class="busca-ico ec-busca">${Icone('busca')}<input id="q-deve" placeholder="Nome, CPF ou telefone da cliente" autofocus autocomplete="off"></div>
        <div id="lista-deve" class="ec-lista"></div>
      </div>`, { largura: '640px' });
    const lista = corpo.querySelector('#lista-deve');
    const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    let encontrados = [];
    const buscar = async (q) => {
      try { encontrados = await api(`/api/crediario?q=${encodeURIComponent(q)}`); } catch (e) { return erro(e); }
      lista.innerHTML = encontrados.slice(0, 40).map((c, i) => `
        <button class="ec-item" data-i="${i}">
          <span class="avatar">${esc(iniciais(c.nome))}</span>
          <span class="ec-txt"><b>${esc(c.nome)}</b><small>${esc([c.telefone, c.cpf && U.cpf(c.cpf)].filter(Boolean).join(' · ') || 'sem contato')}</small></span>
          <span class="ec-info"><b>${brl(c.saldo)}</b><small>${c.parcelas} parcela(s) em aberto</small></span>
          ${c.vencido > 0 ? `<span class="selo perigo">${brl(c.vencido)} vencido</span>` : '<span class="selo ok">em dia</span>'}
        </button>`).join('') ||
        `<div class="ec-vazio">${Icone('caderno')}<b>${q ? 'Ninguém com esse nome devendo no crediário' : 'Ninguém devendo no crediário'}</b><small>${q ? 'Confira o nome, o CPF ou o telefone.' : 'Tudo pago.'}</small></div>`;
    };
    corpo.querySelector('#q-deve').addEventListener('input', U.debounce((ev) => buscar(ev.target.value.trim()), 200));
    lista.onclick = (ev) => {
      const b = ev.target.closest('[data-i]');
      if (!b) return;
      const c = encontrados[Number(b.dataset.i)];
      fecharModal();
      Telas.crediario.receber(c.id, atualizar);
    };
    buscar('');
  }

  async function carregarSaldoCliente() {
    saldoCliente = null;
    if (!carrinho.cliente) return;
    try {
      const c = await api(`/api/clientes/${carrinho.cliente.id}`);
      saldoCliente = c.crediario;
      if (raiz) { desenharCliente(); desenharAlertas(); }
    } catch { /* cliente apagado: ignora */ }
  }

  // Peças que mais vendem, para tocar e colocar na venda quando o caixa está vazio.
  let populares = null;
  async function desenharVitrineRapida() {
    const el = raiz && raiz.querySelector('#vit-rapida');
    if (!el) return;
    if (!populares) {
      try { populares = await api('/api/produtos/populares?limite=12'); } catch { populares = []; }
    }
    const alvo = raiz && raiz.querySelector('#vit-rapida');
    if (!alvo) return;
    alvo.innerHTML = populares.length ? `<small class="p6-vit-tit">${Icone('raio')} Mais vendidas e novidades — toque para vender</small>
      <div class="p6-vit-grade">${populares.map((p, i) => `<button type="button" class="p6-peca" data-pop="${i}" title="${esc(p.nome)}">
        ${U.miniatura(p, 'p6-peca-foto')}
        <span class="p6-peca-txt"><b>${esc(p.nome)}</b><small>${esc([p.tamanho, p.cor].filter(Boolean).join(' · ') || '—')}</small></span>
        <span class="p6-peca-preco">${brl(p.preco_venda)}</span></button>`).join('')}</div>` : '';
  }

  function desenharCliente() {
    const info = raiz.querySelector('#cliente-info');
    const ico = raiz.querySelector('.pdv-cliente-ico');
    const botao = raiz.querySelector('#btn-cliente');
    if (!carrinho.cliente) {
      info.innerHTML = '<b>Identificar cliente</b><small>Opcional · obrigatório no crediário</small>';
      if (ico) ico.innerHTML = Icone('usuario');
      if (botao) botao.classList.remove('com-cliente', 'deve');
      return;
    }
    if (ico) ico.textContent = String(carrinho.cliente.nome || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    if (botao) {
      botao.classList.add('com-cliente');
      botao.classList.toggle('deve', !!(saldoCliente && saldoCliente.vencido > 0));
    }
    const s = saldoCliente;
    const deve = s && s.aberto > 0
      ? `<small class="${s.vencido > 0 ? 'txt-perigo' : ''}">Crediário: deve ${brl(s.aberto)}${s.vencido > 0 ? ` · ${brl(s.vencido)} vencido` : ''}</small>`
      : `<small>${carrinho.cliente.cpf ? esc(U.cpf(carrinho.cliente.cpf)) : 'Sem débitos no crediário'}</small>`;
    info.innerHTML = `<b>${esc(carrinho.cliente.nome)}</b>${deve}`;
  }

  function desenhar() {
    const lista = raiz.querySelector('#itens');
    const pecas = carrinho.itens.reduce((a, it) => a + it.quantidade, 0);
    raiz.querySelector('#itens-cont').textContent = carrinho.itens.length
      ? `${pecas} peça${pecas === 1 ? '' : 's'} · ${carrinho.itens.length} ${carrinho.itens.length === 1 ? 'item' : 'itens'}` : '';
    lista.innerHTML = carrinho.itens.length
      ? carrinho.itens.map((it, i) => {
        const p = it.produto;
        const liq = p.preco_anterior > p.preco_venda;
        return `<div class="p4-item ${i === carrinho.itens.length - 1 ? 'recente' : ''}" data-i="${i}">
          ${U.miniatura(p, 'p4-item-foto')}
          <div class="p4-item-txt">
            <b title="${esc(p.nome)}">${esc(p.nome)}</b>
            <span class="p4-tags">${p.tamanho ? `<span class="p4-tag">Tam ${esc(p.tamanho)}</span>` : ''}${p.cor ? `<span class="p4-tag">${esc(p.cor)}</span>` : ''}${tagEstoque(p)}<small>${esc(p.codigo)}</small></span>
          </div>
          <div class="p4-item-preco">${liq ? `<s>${num(p.preco_anterior)}</s>` : ''}<span>${num(p.preco_venda)}</span><small>cada</small></div>
          <span class="qtd-ctrl p4-qtd"><button class="mini" data-acao="menos" title="Menos uma">${Icone('menos')}</button><span>${it.quantidade}</span><button class="mini" data-acao="mais" title="Mais uma">${Icone('mais')}</button></span>
          <button class="pdv-desc ${it.desconto ? 'tem' : ''}" data-acao="desc" title="Desconto nesta peça">${it.desconto ? `−${num(it.desconto)}${it.descontoTxt && it.descontoTxt.endsWith('%') ? ` <small>(${esc(it.descontoTxt)})</small>` : ''}` : `${Icone('etiqueta')} desconto`}</button>
          <b class="p4-item-total">${num(totalItem(it))}</b>
          <button class="p4-remover" data-acao="remover" title="Tirar da venda">${Icone('lixeira')}</button>
        </div>`;
      }).join('')
      : `<div class="p4-vazio p6-vazio">
          <div class="p6-vazio-cab">
            <span class="p6-vazio-ico">${Icone('sacola')}</span>
            <div><b>Caixa livre</b><p>Bipe a etiqueta com o leitor ou toque numa peça abaixo para colocar na venda.</p></div>
          </div>
          <div class="p6-vit" id="vit-rapida"></div>
          <div class="pdv-vazio-dicas"><span><kbd>3*</kbd>código = 3 peças iguais</span><span><kbd>F8</kbd> tira a última peça</span><span><kbd>F3</kbd> vendas em espera</span></div>
        </div>`;
    const recente = lista.querySelector('.recente');
    if (recente) recente.scrollIntoView({ block: 'nearest' });
    if (!carrinho.itens.length) desenharVitrineRapida();

    const ult = carrinho.itens[carrinho.itens.length - 1];
    const ultEl = raiz.querySelector('#ultimo');
    if (ultEl) {
    ultEl.classList.toggle('vazio-ult', !ult);
    const chaveUlt = ult ? `${carrinho.itens.length}-${ult.produto.id}-${ult.quantidade}` : '';
    if (chaveUlt && chaveUlt !== ultEl.dataset.chave) {
      ultEl.classList.remove('novo');
      void ultEl.offsetWidth; // reinicia a animação
      ultEl.classList.add('novo');
    }
    ultEl.dataset.chave = chaveUlt;
    ultEl.innerHTML = ult
      ? `${U.miniatura(ult.produto, 'ultimo-foto')}<div class="ultimo-txt"><small>Último item</small><span>${esc(ult.produto.nome)}</span>
           <small>${esc([ult.produto.tamanho && 'Tam ' + ult.produto.tamanho, ult.produto.cor].filter(Boolean).join(' · '))}</small></div>
         <b>${ult.quantidade} × ${brl(ult.produto.preco_venda)}</b>`
      : `<span class="ultimo-foto sem-foto">${Icone('sacola')}</span><div class="ultimo-txt"><small>Último item</small><span>Nenhuma peça ainda</span><small>As peças bipadas aparecem aqui</small></div><b>${brl(0)}</b>`;
    }

    desenharCliente();
    desenharTotais();
    desenharAlertas();
  }

  /** Faixa de avisos no topo: crediário vencido, estoque acabando, caixa aberto há muito tempo. */
  function desenharAlertas() {
    const el = raiz && raiz.querySelector('#alertas');
    if (!el) return;
    const alertas = [];
    if (carrinho.cliente && saldoCliente && saldoCliente.vencido > 0) {
      alertas.push(['perigo', `<i data-icone="caderno"></i> ${esc(carrinho.cliente.nome)} tem <b>${brl(saldoCliente.vencido)}</b> vencido no crediário.
        <button class="link" data-receber-cred>receber agora</button>`]);
    }
    const pendente = local.ler('pdv_vale_pendente', null);
    if (pendente) alertas.push(['ok', `<i data-icone="vale"></i> ${/^RS/i.test(pendente.codigo) ? 'Sinal da reserva' : 'Vale-troca'} <b>${esc(pendente.codigo)}</b> (${brl(pendente.saldo)}) vai entrar no pagamento desta venda. <button class="link" id="tirar-vale">não usar</button>`]);
    const aberto = caixa ? new Date(caixa.aberto_em.replace(' ', 'T')) : null;
    if (aberto && Date.now() - aberto.getTime() > 12 * 36e5) {
      alertas.push(['alerta', `<i data-icone="dinheiro"></i> O caixa nº ${caixa.id} está aberto desde ${U.dataHora(caixa.aberto_em)}. Feche o caixa do dia anterior.`]);
    }
    el.innerHTML = alertas.map(([tipo, txt]) => `<div class="pdv-alerta ${tipo}">${txt}</div>`).join('');
    const tirar = el.querySelector('#tirar-vale');
    if (tirar) tirar.onclick = () => { local.gravar('pdv_vale_pendente', null); desenharAlertas(); };
    const rc = el.querySelector('[data-receber-cred]');
    if (rc) rc.onclick = () => receberCrediario();
  }

  /**
   * Estoque da peça como etiqueta discreta no próprio item (no lugar das faixas de aviso):
   * "sem estoque" quando o sistema tem menos do que está sendo vendido (clicar anota na lista de
   * espera) e, só para a administradora, "última peça" / "restam N" quando chega no mínimo.
   */
  function tagEstoque(p) {
    if (p.servico) return '';
    const qtd = carrinho.itens.filter((x) => x.produto.id === p.id).reduce((a, x) => a + x.quantidade, 0);
    if (qtd > p.estoque) {
      return `<button type="button" class="p4-estq zero" data-espera="${p.id}"
        title="O sistema tem ${p.estoque} em estoque. Confira a etiqueta. Clique para anotar na lista de espera.">sem estoque</button>`;
    }
    const resta = p.estoque - qtd;
    if (U.sessao.ehAdmin() && resta <= p.estoque_minimo) {
      return `<span class="p4-estq pouco" title="Hora de repor">${resta === 0 ? 'última peça' : `restam ${resta}`}</span>`;
    }
    return '';
  }

  function desenharTotais() {
    const t = totais();
    raiz.querySelector('#t-pecas').textContent = t.pecas;
    raiz.querySelector('#t-sub').textContent = brl(t.bruto);
    raiz.querySelector('#t-desc').textContent = brl(t.bruto - t.total);
    raiz.querySelector('#t-total').textContent = brl(t.total);
    // Quanto a cliente está economizando (liquidação + descontos).
    const liq = carrinho.itens.reduce((a, it) => a + (it.produto.preco_anterior > it.produto.preco_venda ? (it.produto.preco_anterior - it.produto.preco_venda) * it.quantidade : 0), 0);
    const economia = liq + (t.bruto - t.total);
    const eco = raiz.querySelector('#t-economia');
    if (eco) {
      eco.hidden = economia <= 0;
      eco.innerHTML = economia > 0 ? `${Icone('presente')} ${carrinho.cliente ? `${esc(carrinho.cliente.nome.split(' ')[0])} está economizando` : 'A cliente está economizando'} <b>${brl(economia)}</b>` : '';
    }
    const temDesc = !!String(carrinho.desconto || '').trim();
    raiz.querySelector('#desconto-txt').textContent = temDesc ? `Desconto: ${carrinho.desconto}` : 'Desconto';
    raiz.querySelector('#btn-desconto').classList.toggle('ativo', temDesc);
    raiz.querySelector('#btn-desconto').classList.toggle('invalido', Number.isNaN(lerDesconto(carrinho.desconto, t.subtotal)));
    raiz.querySelector('#cpf-txt').textContent = carrinho.cpf_nota ? `CPF ${carrinho.cpf_nota}` : 'CPF na nota';
    raiz.querySelector('#btn-cpf').classList.toggle('ativo', !!carrinho.cpf_nota);
    raiz.querySelector('.p4-pagar').classList.toggle('sem-itens', !carrinho.itens.length);
  }

  /** Desconto na venda inteira: "10%" ou "15,00". */
  /**
   * Janela de desconto: botões prontos (5%, 10%, 15%, 20%…, em Configurações) que já mostram quanto fica,
   * ou digitar outro valor em % ou R$. Devolve o texto ("10%", "15,00", "" para tirar) ou null se voltou.
   */
  async function janelaDesconto(titulo, base, atual) {
    const cfg = await U.config();
    const max = Number(cfg.desconto_maximo_pct || 100);
    const presets = [...new Set(String(cfg.desconto_presets || '5,10,15,20').split(/[;,\s]+/)
      .map((x) => Number(String(x).replace('%', ''))).filter((n) => n > 0 && n <= 100))].sort((a, b) => a - b).slice(0, 8);
    atual = String(atual || '').trim();
    const ehPreset = (p) => atual.replace(',', '.') === `${p}%`;
    // O foco começa nos botões (teclas 1, 2, 3…): no marcado, senão no primeiro liberado.
    const focoPct = (presets.find((p) => ehPreset(p) && p <= max) ?? presets.find((p) => p <= max));
    return new Promise((resolve) => {
      let resposta = null;
      const corpo = abrirModal(titulo, `
        <div class="dsc">
          <p class="dsc-base">Valor sem desconto: <b>${brl(base)}</b></p>
          <div class="dsc-botoes">${presets.map((p, i) => {
    const v = Math.round((base * p) / 100);
    const bloq = p > max;
    return `<button type="button" class="dsc-btn ${ehPreset(p) ? 'sel' : ''}" data-pct="${p}" ${p === focoPct ? 'autofocus' : ''} ${bloq ? `disabled title="Acima do desconto máximo (${max}%)"` : ''}>
              <kbd>${i + 1}</kbd><b>${String(p).replace('.', ',')}%</b><small>− ${brl(v)}</small><span>fica ${brl(base - v)}</span></button>`;
  }).join('')}</div>
          <form class="form dsc-outro">
            <label>Outro desconto <small>em % (ex.: 12%) ou em reais (ex.: 15,00)</small>
              <input name="v" value="${esc(atual && !presets.some(ehPreset) ? atual : '')}" autocomplete="off"></label>
            <div class="acoes">
              ${atual ? '<button type="button" class="btn btn-fantasma btn-perigo-claro" id="dsc-tirar">Tirar desconto</button>' : ''}
              <button type="button" class="btn" data-fechar>Voltar</button><button class="btn btn-primario">Aplicar</button>
            </div>
          </form>
        </div>`, { aoFechar: () => resolve(resposta), largura: '520px' });
      const escolher = (b) => { if (!b || b.disabled) return; resposta = `${b.dataset.pct}%`; fecharModal(); };
      corpo.querySelector('.dsc-botoes').onclick = (ev) => escolher(ev.target.closest('[data-pct]'));
      // Teclas 1, 2, 3… escolhem o botão (fora do campo de digitar).
      corpo.querySelector('.dsc').onkeydown = (ev) => {
        if (ev.target.matches('input') || !/^[1-9]$/.test(ev.key)) return;
        ev.preventDefault();
        escolher(corpo.querySelectorAll('[data-pct]')[Number(ev.key) - 1]);
      };
      const tirar = corpo.querySelector('#dsc-tirar');
      if (tirar) tirar.onclick = () => { resposta = ''; fecharModal(); };
      corpo.querySelector('form').onsubmit = (ev) => { ev.preventDefault(); resposta = ev.target.v.value.trim(); fecharModal(); };
    });
  }

  async function pedirDesconto() {
    const t = totais();
    const v = await janelaDesconto('Desconto na venda', t.subtotal, carrinho.desconto);
    if (v === null) return;
    const d = lerDesconto(v, t.subtotal);
    if (Number.isNaN(d) || d < 0) return aviso('Desconto inválido. Use 10% ou 15,00.', 'erro');
    if (d > t.subtotal) return aviso('O desconto não pode ser maior que a venda.', 'erro');
    carrinho.desconto = String(v).trim();
    salvar();
    desenharTotais();
    raiz.querySelector('#busca').focus();
  }

  async function pedirCpf() {
    const v = await U.perguntar('CPF/CNPJ na nota', 'Digite o CPF ou CNPJ da cliente (vazio para tirar):', { valor: carrinho.cpf_nota || '', obrigatorio: false });
    if (v === null) return;
    const dig = String(v).replace(/\D/g, '');
    if (dig && dig.length !== 11 && dig.length !== 14) return aviso('CPF precisa ter 11 números (CNPJ, 14).', 'erro');
    carrinho.cpf_nota = dig ? U.cpf(dig) : '';
    salvar();
    desenharTotais();
    raiz.querySelector('#busca').focus();
  }

  // -------------------------------------------------------------- busca
  /** Botões rápidos (sacola, ajuste de barra…) configurados no cadastro do produto. */
  async function carregarAtalhos() {
    let lista = [];
    try { lista = await api('/api/produtos/atalhos'); } catch { /* sem atalhos */ }
    const el = raiz && raiz.querySelector('#atalhos');
    if (!el) return;
    raiz.querySelector('#secao-atalhos').hidden = !lista.length;
    el.innerHTML = lista.map((p, i) => `<button class="pdv-atalho" data-i="${i}" title="${esc(p.nome)}">
      ${U.miniatura(p)}<span>${esc(p.nome)}<small>${p.servico && !p.preco_venda ? 'preço na hora' : brl(p.preco_venda)}</small></span></button>`).join('');
    el.onclick = async (ev) => {
      const b = ev.target.closest('[data-i]');
      if (!b) return;
      const p = lista[Number(b.dataset.i)];
      if (p.servico && !p.preco_venda) {
        const v = await U.perguntar(p.nome, 'Valor cobrado (R$):', { tipo: 'text' });
        if (v === null) return;
        const c = U.paraCentavos(v);
        if (!(c >= 0) || Number.isNaN(c)) return aviso('Valor inválido.', 'erro');
        adicionar({ ...p, preco_venda: c }, 1, c);
      } else adicionar(p, 1);
      raiz.querySelector('#busca').focus();
    };
  }

  /** Peça sem etiqueta: escolhe pela foto entre as mais vendidas (ou procura pelo nome). */
  async function abrirVitrine() {
    let lista = [];
    try { lista = await api('/api/produtos/populares?limite=24'); } catch (e) { return erro(e); }
    const corpo = abrirModal('Peça sem etiqueta', `
      <p class="dica">Clique na peça para colocar na venda. Não achou? Feche e digite o nome na busca.</p>
      <div class="p3-vitrine" id="vitrine">${lista.length ? lista.map((p, i) => `<button class="p3-peca" data-i="${i}" title="${esc(p.nome)}">
        ${U.miniatura(p, 'p3-peca-foto')}
        <span class="p3-peca-txt"><b>${esc(p.nome)}</b><small>${esc([p.tamanho, p.cor].filter(Boolean).join(' · ') || '—')}</small></span>
        <span class="p3-peca-preco">${p.preco_anterior > p.preco_venda ? `<s>${num(p.preco_anterior)}</s>` : ''}<b>${brl(p.preco_venda)}</b><small>${p.servico ? 'serviço' : `${p.estoque} em estoque`}</small></span>
      </button>`).join('') : '<div class="p3-vitrine-vazia">As peças mais vendidas aparecem aqui depois das primeiras vendas.</div>'}</div>`,
    { largura: '900px', aoFechar: () => raiz && raiz.querySelector('#busca').focus() });
    corpo.querySelector('#vitrine').onclick = (ev) => {
      const b = ev.target.closest('[data-i]');
      if (!b) return;
      fecharModal();
      adicionar(lista[Number(b.dataset.i)], 1);
    };
  }

  function alternarTelaCheia() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch { aviso('Use a tecla F11 para tela cheia.', 'alerta'); }
  }

  function adicionar(produto, quantidade = 1, preco) {
    const existente = carrinho.itens.find((it) => it.produto.id === produto.id && !it.desconto && (it.preco ?? null) === (preco ?? null));
    const jaNoCarrinho = carrinho.itens.filter((it) => it.produto.id === produto.id)
      .reduce((a, it) => a + it.quantidade, 0);
    if (existente) {
      existente.quantidade += quantidade;
      carrinho.itens.splice(carrinho.itens.indexOf(existente), 1);
      carrinho.itens.push(existente);
    } else {
      carrinho.itens.push({ produto, quantidade, desconto: 0, preco });
    }
    U.som(!produto.servico && jaNoCarrinho + quantidade > produto.estoque ? 'erro' : 'ok');
    salvar();
    desenhar(); // a peça adicionada vai para o fim da lista e fica visível
  }

  async function lerEntrada(valor) {
    let texto = valor.trim();
    if (!texto) return;
    // Código do cupom (V123): abre a troca. Código de vale (VT000123): usa no pagamento.
    if (/^(VT|RS)\d+$/i.test(texto)) {
      if (!carrinho.itens.length) {
        try {
          const v = await api(`/api/vales/${encodeURIComponent(texto)}`);
          aviso(`Vale ${v.codigo}: saldo ${brl(v.saldo)} (${v.status}). Bipe as peças e depois o vale de novo.`, v.status === 'ativo' ? 'ok' : 'alerta');
        } catch (e) { erro(e); }
        return true;
      }
      finalizar('vale', texto.toUpperCase());
      return true;
    }
    if (/^V\d+$/i.test(texto)) {
      Trocas.abrirVenda(Number(texto.slice(1)));
      return true;
    }
    let qtd = 1;
    const m = texto.match(/^(\d{1,3})\s*[*xX]\s*(.+)$/);
    if (m) {
      qtd = Number(m[1]);
      texto = m[2].trim();
    }
    try {
      const p = await api(`/api/produtos/codigo/${encodeURIComponent(texto)}`);
      adicionar(p, qtd);
      return true;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    const lista = await api(`/api/produtos?q=${encodeURIComponent(texto)}&limite=20`);
    if (lista.length === 1) {
      adicionar(lista[0], qtd);
      return true;
    }
    if (!lista.length) {
      U.som('erro');
      aviso(`Nenhum produto encontrado para "${texto}".`, 'erro');
      return false;
    }
    mostrarSugestoes(lista);
    return false;
  }

  async function sugerir(texto) {
    texto = texto.trim();
    if (texto.length < 2 || /^\d+$/.test(texto) || /^\d{1,3}\s*[*xX]/.test(texto)) return esconderSugestoes();
    try {
      mostrarSugestoes(await api(`/api/produtos?q=${encodeURIComponent(texto)}&limite=20`));
    } catch { esconderSugestoes(); }
  }

  function mostrarSugestoes(lista) {
    if (!raiz) return;
    sugestoes = lista;
    selecionada = lista.length ? 0 : -1;
    const box = raiz.querySelector('#sugestoes');
    if (!lista.length) return esconderSugestoes();
    box.hidden = false;
    box.innerHTML = lista.map((p, i) => `
      <div class="sugestao ${i === selecionada ? 'sel' : ''}" data-i="${i}">
        ${U.miniatura(p)}
        <span class="sugestao-txt"><b>${esc(p.nome)}</b> ${esc([p.tamanho, p.cor].filter(Boolean).join(' · '))}
          <small>${esc(p.codigo)}</small></span>
        <span>${p.preco_anterior > p.preco_venda ? `<small class="preco-de">${brl(p.preco_anterior)}</small> ` : ''}${brl(p.preco_venda)} <small class="${p.estoque <= 0 ? 'txt-perigo' : ''}">est. ${p.estoque}</small></span>
      </div>`).join('');
    box.onmousedown = (ev) => {
      const d = ev.target.closest('[data-i]');
      if (!d) return;
      ev.preventDefault();
      adicionar(sugestoes[Number(d.dataset.i)]);
      limparBusca();
    };
  }

  function esconderSugestoes() {
    sugestoes = [];
    selecionada = -1;
    const box = raiz && raiz.querySelector('#sugestoes');
    if (box) box.hidden = true;
  }

  function limparBusca() {
    const b = raiz.querySelector('#busca');
    b.value = '';
    esconderSugestoes();
    b.focus();
  }

  async function teclaBusca(ev) {
    if (sugestoes.length && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      ev.preventDefault();
      selecionada = (selecionada + (ev.key === 'ArrowDown' ? 1 : -1) + sugestoes.length) % sugestoes.length;
      raiz.querySelectorAll('.sugestao').forEach((d, i) => d.classList.toggle('sel', i === selecionada));
      return;
    }
    if (ev.key === 'Escape' && sugestoes.length) return esconderSugestoes();
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const valor = ev.target.value;
    if (sugestoes.length && selecionada >= 0 && !/^\d+$/.test(valor.trim())) {
      adicionar(sugestoes[selecionada]);
      return limparBusca();
    }
    // Código bipado: limpa o campo na hora, para o próximo bipe (rápido) não se misturar com este.
    const codigo = /^(\d{1,3}\s*[*xX]\s*)?[A-Za-z]{0,2}\d{3,}$/.test(valor.trim());
    if (codigo) ev.target.value = '';
    try {
      if (await lerEntrada(valor) && (!codigo || !ev.target.value)) limparBusca();
    } catch (e) { erro(e); }
  }

  // -------------------------------------------------------------- itens
  async function cliqueItem(ev) {
    const pop = ev.target.closest('[data-pop]');
    if (pop && populares) {
      const p = populares[Number(pop.dataset.pop)];
      if (p) adicionar(p, 1);
      return;
    }
    const esp = ev.target.closest('[data-espera]');
    if (esp) {
      const it = carrinho.itens.find((x) => x.produto.id === Number(esp.dataset.espera));
      if (it) Telas.espera.anotar({ produto: it.produto, cliente: carrinho.cliente });
      return;
    }
    const btn = ev.target.closest('[data-acao]');
    if (!btn) return;
    const i = Number(btn.closest('[data-i]').dataset.i);
    const it = carrinho.itens[i];
    if (btn.dataset.acao === 'mais') it.quantidade++;
    if (btn.dataset.acao === 'menos') {
      if (it.quantidade > 1) it.quantidade--;
      else carrinho.itens.splice(i, 1);
    }
    if (btn.dataset.acao === 'remover') carrinho.itens.splice(i, 1);
    if (btn.dataset.acao === 'desc') {
      const v = await janelaDesconto(`Desconto: ${it.produto.nome}`, brutoItem(it), it.descontoTxt || (it.desconto ? num(it.desconto) : ''));
      if (v !== null) {
        const d = lerDesconto(v, brutoItem(it));
        if (Number.isNaN(d) || d < 0 || d > brutoItem(it)) aviso('Desconto inválido.', 'erro');
        else { it.desconto = d; it.descontoTxt = String(v).trim(); }
      }
    }
    // Desconto em % acompanha a quantidade.
    if (it && it.descontoTxt && it.descontoTxt.endsWith('%')) it.desconto = lerDesconto(it.descontoTxt, brutoItem(it)) || 0;
    if (it && it.desconto > brutoItem(it)) it.desconto = brutoItem(it);
    salvar();
    if (!raiz) return;
    desenhar();
    raiz.querySelector('#busca').focus();
  }

  async function limpar() {
    if (!carrinho.itens.length) return;
    if (!(await U.confirmar('Cancelar venda', 'Remover todos os itens desta venda?', { ok: 'Sim, cancelar', perigo: true }))) return;
    carrinho = novoCarrinho();
    local.gravar('pdv_vale_pendente', null); // o vale "para usar agora" era desta venda
    salvar();
    if (raiz) abrir(raiz);
  }

  // ------------------------------------------------------------ cliente
  /** Abre a busca de cliente; `depois` é chamado após escolher (usado pelo crediário). */
  function escolherCliente(depois) {
    const corpo = abrirModal('Identificar cliente', `
      <div class="ec">
        <div class="busca-ico ec-busca">${Icone('busca')}<input id="q-cli" placeholder="Nome, CPF ou telefone da cliente" autofocus autocomplete="off"></div>
        <div id="lista-cli" class="ec-lista"></div>
        <div class="ec-rodape">
          ${carrinho.cliente ? `<button class="btn btn-fantasma btn-perigo-claro" id="tirar-cli">${Icone('fechar')} Tirar ${esc(carrinho.cliente.nome.split(' ')[0])} da venda</button>` : '<span></span>'}
          <button class="btn btn-claro" id="novo-cli">${Icone('mais')} Cadastrar cliente nova</button>
        </div>
      </div>`, { largura: '640px' });
    const lista = corpo.querySelector('#lista-cli');
    let encontrados = [];
    const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    const buscar = async (q) => {
      encontrados = await api(`/api/clientes?q=${encodeURIComponent(q)}${q ? '' : '&ordem=recentes'}`);
      lista.innerHTML = encontrados.slice(0, 40).map((c, i) => `
        <button class="ec-item ${carrinho.cliente && carrinho.cliente.id === c.id ? 'atual' : ''}" data-i="${i}">
          <span class="avatar">${esc(iniciais(c.nome))}</span>
          <span class="ec-txt"><b>${esc(c.nome)}</b><small>${esc([c.telefone, c.cpf && U.cpf(c.cpf)].filter(Boolean).join(' · ') || 'sem contato')}</small></span>
          <span class="ec-info">${c.compras ? `<b>${brl(c.total_comprado)}</b><small>${c.compras} compra(s)</small>` : '<small>ainda não comprou</small>'}</span>
          ${c.deve > 0 ? `<span class="selo perigo">deve ${brl(c.deve)}</span>` : ''}
        </button>`).join('') ||
        `<div class="ec-vazio">${Icone('clientes')}<b>Nenhuma cliente encontrada</b><small>Confira o nome ou cadastre uma cliente nova.</small></div>`;
      if (!q && encontrados.length) lista.insertAdjacentHTML('afterbegin', '<small class="ec-dica">Últimas clientes que compraram</small>');
    };
    const usar = (c) => {
      carrinho.cliente = { id: c.id, nome: c.nome, cpf: c.cpf };
      if (c.cpf && !carrinho.cpf_nota) carrinho.cpf_nota = U.cpf(c.cpf);
      salvar();
      fecharModal();
      if (!raiz) return;
      desenharTotais();
      carregarSaldoCliente().then(() => {
        desenharCliente();
        desenharAlertas();
        if (depois) depois();
      });
    };
    corpo.querySelector('#q-cli').addEventListener('input', U.debounce((e) => buscar(e.target.value).catch(erro)));
    corpo.querySelector('#q-cli').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && encontrados.length) usar(encontrados[0]);
    });
    lista.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (b) usar(encontrados[Number(b.dataset.i)]);
    };
    const tirar = corpo.querySelector('#tirar-cli');
    if (tirar) {
      tirar.onclick = () => {
        carrinho.cliente = null;
        saldoCliente = null;
        salvar();
        fecharModal();
        if (raiz) { desenharCliente(); desenharAlertas(); }
      };
    }
    corpo.querySelector('#novo-cli').onclick = () => Telas.clientes.formulario(null, usar);
    buscar('').catch(erro);
  }

  // ------------------------------------------------------------ finalizar
  /**
   * O carrinho fica guardado no navegador (sobrevive a fechar a tela): antes de receber, confere os
   * preços atuais das peças para o valor da tela ser o mesmo que o sistema grava.
   */
  async function conferirPrecos() {
    const ids = [...new Set(carrinho.itens.map((it) => it.produto.id))];
    const atuais = await Promise.all(ids.map((id) => api(`/api/produtos/${id}`).catch(() => null)));
    let mudou = false;
    carrinho.itens.forEach((it) => {
      const p = atuais[ids.indexOf(it.produto.id)];
      if (!p || it.produto.servico) return;
      // Na retirada de reserva vale o preço combinado (o menor).
      const preco = carrinho.reserva_id ? Math.min(p.preco_venda, it.produto.preco_venda) : p.preco_venda;
      if (preco !== it.produto.preco_venda) mudou = true;
      it.produto = { ...p, preco_venda: preco };
    });
    if (mudou) {
      salvar();
      desenhar();
      aviso('O preço de alguma peça mudou desde que ela entrou no caixa. Confira o total.', 'alerta');
    }
    return !mudou;
  }

  /**
   * Pagamento. Modo direto (o normal): escolhe a forma e confirma (Enter). No dinheiro, digita o valor
   * recebido para ver o troco. "Dividir em duas formas" (ou vale-troca) usa a lista com "Adicionar".
   */
  async function finalizar(formaInicial = 'dinheiro', valeCodigo, opcoes = {}) {
    if (!carrinho.itens.length) return aviso('Adicione itens antes de finalizar.', 'alerta');
    try {
      if (!(await conferirPrecos())) return;
    } catch { /* sem conexão: segue; o servidor confere de novo */ }
    // Vale gerado numa troca e marcado para "usar agora".
    const pendente = local.ler('pdv_vale_pendente', null);
    if (!valeCodigo && pendente) {
      formaInicial = 'vale';
      valeCodigo = pendente.codigo;
    }
    const t = totais();
    if (Number.isNaN(lerDesconto(carrinho.desconto, t.subtotal))) return aviso('Desconto da venda inválido.', 'erro');
    if (formaInicial === 'crediario' && !carrinho.cliente) {
      aviso('Para vender no crediário, escolha o cliente.', 'alerta');
      return escolherCliente(() => finalizar('crediario'));
    }
    const cfg = await U.config();
    const maxParcelas = Math.max(1, Number(cfg.crediario_max_parcelas) || 6);
    const vencPadrao = new Date(Date.now() + (Number(cfg.crediario_dias_primeira) || 30) * 864e5).toLocaleDateString('sv-SE');
    const pagamentos = [];
    let forma = formaInicial;
    let dividir = !!opcoes.dividir || !!valeCodigo || formaInicial === 'vale';
    const formas = Object.entries(U.FORMAS);

    const NOMES_PAG = { debito: 'Débito', credito: 'Crédito' };
    const pecasPag = carrinho.itens.reduce((a, it) => a + it.quantidade, 0);
    const corpo = abrirModal('Pagamento', `
      <div class="pag2 pag3">
        <div class="pag2-esq">
          <div class="pag2-rotulo">Forma de pagamento</div>
          <div class="formas formas-7">
            ${formas.map(([k, v], i) =>
    `<button class="forma pag3-f-${k} ${k === forma ? 'sel' : ''}" data-forma="${k}" title="Atalho: Alt + ${i + 1}">${Icone.pag(k)}<span>${NOMES_PAG[k] || v}</span></button>`).join('')}
          </div>
          <form id="f-pag" class="pag2-form">
            <label class="pag2-valor"><span id="pag-rotulo">Recebido</span><div class="campo-moeda"><span>R$</span><input id="pag-valor" inputmode="decimal" autocomplete="off" autofocus></div></label>
            <label id="lbl-parc" hidden>Parcelas<select id="pag-parc"></select></label>
            <div id="lbl-band" class="pag2-band" hidden><span>Bandeira</span>
              <div class="segmentos">${Object.entries(U.BANDEIRAS).map(([k, n]) => `<button type="button" class="segmento tx-seg ${k === 'visa_master' ? 'sel' : ''}" data-band="${k}">${n}</button>`).join('')}</div></div>
            <label id="lbl-venc" hidden>1º vencimento<input type="date" id="pag-venc" value="${vencPadrao}"></label>
            <label id="lbl-vale" hidden>Código do vale<input id="pag-vale" autocomplete="off" placeholder="Bipe o vale-troca"></label>
            <button class="btn btn-claro pag2-add">${Icone('mais')} Adicionar</button>
          </form>
          <button type="button" class="link pag2-modo" id="pag-modo"></button>
          <div class="pag2-dica" id="pag-dica" hidden></div>
          <div class="pag2-taxa" id="info-taxa" hidden></div>
          <div class="valores-rapidos" id="rapidos"></div>
          <div id="info-vale" class="info-cred" hidden></div>
          <div id="info-cred" class="info-cred" hidden></div>
        </div>
        <aside class="pag2-dir">
          <div class="pag2-total" id="pag-total"></div>
          <div class="pag3-sacola" title="${pecasPag} ${pecasPag === 1 ? 'peça' : 'peças'} nesta venda">
            <div class="pag3-fotos">${carrinho.itens.slice(0, 6).map((it) => U.miniatura(it.produto, 'pag3-foto')).join('')}${carrinho.itens.length > 6 ? `<span class="pag3-mais">+${carrinho.itens.length - 6}</span>` : ''}</div>
            ${carrinho.cliente ? `<span class="pag3-cli"><i>${esc(String(carrinho.cliente.nome).trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase())}</i>${esc(carrinho.cliente.nome.split(' ')[0])}</span>` : ''}
          </div>
          <div id="lista-pag" class="lista-pag"></div>
          <div class="pag-resumo" id="pag-resumo"></div>
          <div class="pag2-liquido" id="pag-liquido"></div>
          <button class="btn btn-primario btn-grande pag2-concluir" id="concluir" disabled>${Icone('check')} Confirmar venda <kbd>Enter</kbd></button>
          <button class="btn btn-fantasma pag3-voltar" data-fechar>Voltar <kbd>Esc</kbd></button>
        </aside>
      </div>`, { largura: '960px', classe: 'modal-pagamento' });

    const valorEl = corpo.querySelector('#pag-valor');
    const valeEl = corpo.querySelector('#pag-vale');
    let valeAtual = null;
    const infoVale = () => {
      const box = corpo.querySelector('#info-vale');
      box.hidden = forma !== 'vale';
      if (box.hidden) return;
      box.innerHTML = valeAtual
        ? `Vale <b>${esc(valeAtual.codigo)}</b>${valeAtual.cliente_nome ? ` de ${esc(valeAtual.cliente_nome)}` : ''} · saldo <b>${brl(valeAtual.saldo - usadoDoVale(valeAtual.codigo))}</b>${valeAtual.validade ? ` · válido até ${valeAtual.validade.split('-').reverse().join('/')}` : ''}`
        : 'Bipe ou digite o código do vale (VT…) e aperte Enter.';
    };
    const usadoDoVale = (cod) => pagamentos.filter((p) => p.forma === 'vale' && p.codigo === cod).reduce((a, p) => a + p.valor, 0);
    const buscarVale = async () => {
      const cod = valeEl.value.trim().toUpperCase();
      if (!cod) return false;
      try {
        const v = await api(`/api/vales/${encodeURIComponent(cod)}`);
        if (v.status !== 'ativo') throw new Error(`O vale ${v.codigo} já foi ${v.status === 'usado' ? 'usado' : 'cancelado'}.`);
        if (v.validade && v.validade < U.hoje()) throw new Error(`O vale ${v.codigo} venceu.`);
        valeAtual = v;
        const disp = v.saldo - usadoDoVale(v.codigo);
        valorEl.value = num(Math.max(0, Math.min(disp, restante())));
        infoVale();
        valorEl.focus();
        valorEl.select();
        return true;
      } catch (e) {
        valeAtual = null;
        infoVale();
        U.som('erro');
        erro(e);
        return false;
      }
    };
    valeEl.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      buscarVale();
    });

    // Botões de valor rápido: "valor exato" e notas comuns acima do que falta.
    const desenharRapidos = () => {
      const r = restante();
      const el = corpo.querySelector('#rapidos');
      if (r <= 0 || forma === 'vale') { el.innerHTML = ''; return; }
      const opcoes = [r];
      if (forma === 'dinheiro') {
        for (const passo of [1000, 5000, 10000]) {
          const v = Math.ceil(r / passo) * passo;
          if (v > r) opcoes.push(v);
        }
        for (const nota of [5000, 10000, 20000]) if (nota > r) opcoes.push(nota);
      }
      const unicos = [...new Set(opcoes)].sort((a, b) => a - b).slice(0, 5);
      el.innerHTML = unicos.map((v, i) => `<button type="button" class="btn valor-rapido ${i === 0 ? 'exato' : ''}" data-v="${v}">${i === 0 ? '<small>Exato</small>' : ''}${brl(v)}</button>`).join('');
    };
    corpo.querySelector('#rapidos').onclick = (ev) => {
      const b = ev.target.closest('[data-v]');
      if (!b) return;
      valorEl.value = num(Number(b.dataset.v));
      if (dividir) return corpo.querySelector('#f-pag').requestSubmit();
      // Modo direto: mostra o troco e espera a confirmação.
      atualizarDireto();
      corpo.querySelector('#concluir').focus();
    };
    const parcEl = corpo.querySelector('#pag-parc');
    const vencEl = corpo.querySelector('#pag-venc');
    const pago = () => pagamentos.reduce((a, p) => a + p.valor, 0);
    const restante = () => t.total - pago();

    const aPartir = Number(cfg.juros_a_partir) || 0;
    const preencherParcelas = () => {
      const max = forma === 'crediario' ? maxParcelas : 12;
      const atual = Number(parcEl.value) || 1;
      // No crédito: até 3x sem juros; a partir de 4x com os juros da maquininha (para a cliente).
      parcEl.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}x${
        forma !== 'credito' ? '' : aPartir && i + 1 >= aPartir ? ' com juros' : ' sem juros'}</option>`).join('');
      parcEl.value = String(Math.min(atual, max));
    };

    // Cartão: bandeira escolhida e quanto a maquininha desconta (só informativo para quem está no caixa).
    let bandeira = 'visa_master';
    const jurosDe = (p) => U.juros(cfg, p.forma, p.parcelas, p.valor, p.bandeira);
    const infoTaxa = () => {
      const box = corpo.querySelector('#info-taxa');
      const cartao = forma === 'debito' || forma === 'credito';
      corpo.querySelector('#lbl-band').hidden = !cartao;
      const n = forma === 'credito' ? Number(parcEl.value) || 1 : 1;
      const p = cartao || forma === 'pix' ? U.taxa(cfg, forma, n, bandeira) : 0;
      const v = U.paraCentavos(valorEl.value) || 0;
      box.hidden = !p || !v;
      box.classList.remove('com-juros');
      if (!p || !v) return;
      const j = U.juros(cfg, forma, n, v, bandeira);
      const tx = Math.round(((v + j) * p) / 100);
      if (j) {
        box.classList.add('com-juros');
        box.innerHTML = `${Icone('cartao')}<span>Juros de <b>${brl(j)}</b> pagos pela cliente</span>`;
      } else {
        box.innerHTML = `${Icone('cartao')}<span>${forma === 'credito' && n > 1 ? `<b>${n}x sem juros</b> · ` : ''}Taxa <b>${U.pctTxt(p)}</b> · ${brl(tx)}</span>`;
      }
    };
    corpo.querySelector('#lbl-band').onclick = (e) => {
      const b = e.target.closest('[data-band]');
      if (!b) return;
      bandeira = b.dataset.band;
      corpo.querySelectorAll('[data-band]').forEach((x) => x.classList.toggle('sel', x === b));
      infoTaxa();
      valorEl.focus();
    };

    const infoCrediario = () => {
      infoTaxa();
      const box = corpo.querySelector('#info-cred');
      box.hidden = forma !== 'crediario';
      if (box.hidden) return;
      const v = U.paraCentavos(valorEl.value) || 0;
      const n = Number(parcEl.value) || 1;
      const parc = Math.floor(v / n);
      const s = saldoCliente;
      box.innerHTML = `
        <div><b>${esc(carrinho.cliente?.nome || '')}</b>
          ${s && s.aberto ? ` · já deve ${brl(s.aberto)}${s.vencido ? ` (<span class="txt-perigo">${brl(s.vencido)} vencido</span>)` : ''}` : ' · sem débitos'}</div>
        <div>${n}x de <b>${brl(parc + (v - parc * n))}</b>${n > 1 ? ` (demais ${brl(parc)})` : ''} · 1º vencimento ${vencEl.value.split('-').reverse().join('/')}</div>`;
    };

    const escolherForma = (f) => {
      if (f === 'vale' && !dividir) { dividir = true; modo(); }
      if (f === 'crediario' && !carrinho.cliente) {
        fecharModal();
        aviso('Para vender no crediário, escolha o cliente.', 'alerta');
        return escolherCliente(() => finalizar('crediario'));
      }
      forma = f;
      corpo.querySelector('.pag2').dataset.forma = f;
      corpo.querySelectorAll('.forma').forEach((b) => b.classList.toggle('sel', b.dataset.forma === f));
      corpo.querySelector('#lbl-parc').hidden = f !== 'credito' && f !== 'crediario';
      corpo.querySelector('#lbl-venc').hidden = f !== 'crediario';
      corpo.querySelector('#lbl-vale').hidden = f !== 'vale';
      // Só dinheiro tem "valor recebido" (troco). Nas outras formas o valor é o que falta pagar;
      // muda só para dividir a venda em duas formas (ex.: parte no PIX, parte no cartão).
      const nome = NOMES_PAG[f] || U.FORMAS[f];
      corpo.querySelector('#pag-rotulo').textContent = f === 'dinheiro' ? 'Recebido em dinheiro' : `Valor no ${nome.toLowerCase() === 'pix' ? 'PIX' : nome.toLowerCase()}`;
      valorEl.placeholder = f === 'dinheiro' && !dividir ? `${num(t.total)} (valor exato)` : '';
      const dica = corpo.querySelector('#pag-dica');
      dica.hidden = true;
      if (f !== 'dinheiro' && restante() > 0) valorEl.value = num(restante());
      if (f === 'dinheiro' && !dividir) valorEl.value = '';
      preencherParcelas();
      infoCrediario();
      infoVale();
      desenharRapidos();
      if (!dividir) atualizar();
      if (f === 'vale' && !valeAtual) { valeEl.focus(); return; }
      // Modo direto sem valor para digitar (PIX, cartão…): o foco vai para "Confirmar venda" (Enter).
      if (!dividir && f !== 'dinheiro') { corpo.querySelector('#concluir').focus(); return; }
      valorEl.focus();
      valorEl.select();
    };

    // Total grande: no crédito com juros mostra o valor que vai na maquininha.
    const desenharTotal = (juros, n) => {
      corpo.querySelector('#pag-total').innerHTML = juros
        ? `<small>Passar na maquininha</small><b>${brl(t.total + juros)}</b>
           <span class="pag2-parcelas">${n}x de ${brl(Math.ceil((t.total + juros) / n))}</span>
           <span>com juros · venda ${brl(t.total)}</span>`
        : `<small>Total</small><b>${brl(t.total)}</b><span>${t.pecas} peça${t.pecas === 1 ? '' : 's'}${t.bruto - t.total ? ` · desconto ${brl(t.bruto - t.total)}` : ''}</span>`;
      corpo.querySelector('#pag-total').classList.toggle('com-juros', !!juros);
    };

    /** Pagamento do modo direto: a venda inteira na forma escolhida. */
    const pagamentoDireto = () => {
      const recebido = U.paraCentavos(valorEl.value);
      return {
        forma,
        valor: forma === 'dinheiro' && valorEl.value.trim() ? recebido : t.total,
        parcelas: forma === 'credito' || forma === 'crediario' ? Number(parcEl.value) || 1 : 1,
        bandeira: forma === 'debito' || forma === 'credito' ? bandeira : undefined,
        primeiro_vencimento: forma === 'crediario' ? vencEl.value : undefined,
      };
    };

    const atualizarDireto = () => {
      const p = pagamentoDireto();
      const j = jurosDe(p);
      desenharTotal(j, p.parcelas);
      const invalido = Number.isNaN(p.valor);
      const falta = invalido ? t.total : t.total - p.valor;
      const bruto = (forma === 'dinheiro' ? t.total : p.valor) + j;
      const liquido = bruto - Math.round((bruto * U.taxa(cfg, p.forma, p.parcelas, p.bandeira)) / 100);
      corpo.querySelector('#pag-resumo').innerHTML = falta > 0
        ? `<div class="pag2-falta"><span>${invalido ? 'Valor inválido' : 'Falta'}</span><b>${brl(falta)}</b></div>`
        : `<div class="pag2-troco ${falta < 0 ? 'tem' : 'certo'}"><span>${falta < 0 ? 'Troco' : `${Icone('check')} Valor certo`}</span>${falta < 0 ? `<b>${brl(-falta)}</b>` : ''}</div>`;
      corpo.querySelector('#pag-liquido').innerHTML = `<div class="linha cai"><span>${Icone('carteira')} Cai na conta</span><b>${brl(liquido)}</b></div>`;
      corpo.querySelector('#concluir').disabled = falta > 0;
      infoTaxa();
    };

    /** Liga/desliga o modo "dividir em duas formas". */
    const modo = () => {
      corpo.querySelector('.pag2').classList.toggle('direto', !dividir);
      corpo.querySelector('#pag-modo').classList.toggle('voltar', dividir);
      corpo.querySelector('#pag-modo').innerHTML = dividir
        ? `${Icone('seta')} Uma forma só`
        : `${Icone('mais')} Dividir pagamento`;
      corpo.querySelector('#pag-modo').hidden = dividir && pagamentos.some((p) => p.forma === 'vale');
      if (dividir) desenharTotal(0);
    };
    corpo.querySelector('#pag-modo').onclick = () => {
      dividir = !dividir;
      pagamentos.length = 0;
      modo();
      escolherForma(forma === 'vale' ? 'dinheiro' : forma);
      atualizar();
    };

    const atualizar = () => {
      if (!dividir) return atualizarDireto();
      corpo.querySelector('#lista-pag').innerHTML = pagamentos.length ? pagamentos.map((p, i) => `
        <div class="pag2-item">${Icone.pag(p.forma)}<span><b>${NOMES_PAG[p.forma] || U.FORMAS[p.forma]}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''}</b>${
  p.codigo ? `<small>${esc(p.codigo)}</small>` : ''}${p.bandeira ? `<small>${U.BANDEIRAS[p.bandeira]}</small>` : ''}${
  jurosDe(p) ? `<small class="txt-perigo">+ ${brl(jurosDe(p))} de juros</small>` : ''}${p.forma === 'crediario' ? `<small>1º venc. ${p.primeiro_vencimento.split('-').reverse().join('/')}</small>` : ''}</span>
        <b>${brl(p.valor)}</b><button class="mini perigo" data-rm="${i}" title="Tirar">${Icone('fechar')}</button></div>`).join('')
        : '<div class="pag2-nada">Nenhum valor lançado</div>';
      const r = restante();
      const totalJuros = pagamentos.reduce((a, p) => a + jurosDe(p), 0);
      const liquido = pagamentos.reduce((a, p) => {
        const bruto = p.valor + jurosDe(p) - (p.forma === 'dinheiro' ? Math.max(0, -r) : 0);
        return a + bruto - Math.round((bruto * U.taxa(cfg, p.forma, p.parcelas, p.bandeira)) / 100);
      }, 0);
      corpo.querySelector('#pag-liquido').innerHTML = pagamentos.length ? `
        ${totalJuros ? `<div class="linha"><span>Cliente paga (com juros)</span><b>${brl(t.total + totalJuros)}</b></div>` : ''}
        <div class="linha cai"><span>${Icone('carteira')} Cai na conta</span><b>${brl(liquido)}</b></div>` : '';
      corpo.querySelector('#pag-resumo').innerHTML = r > 0
        ? `<div class="pag2-falta"><span>Falta receber</span><b>${brl(r)}</b></div>`
        : `<div class="pag2-troco ${r < 0 ? 'tem' : 'certo'}"><span>${r < 0 ? 'Troco' : `${Icone('check')} Valor certo`}</span>${r < 0 ? `<b>${brl(-r)}</b>` : ''}</div>`;
      corpo.querySelector('#concluir').disabled = r > 0;
      valorEl.value = r > 0 ? num(r) : '';
      valorEl.select();
      infoCrediario();
      infoVale();
      desenharRapidos();
    };

    corpo.querySelector('.formas').onclick = (e) => {
      const b = e.target.closest('[data-forma]');
      if (b) escolherForma(b.dataset.forma);
    };
    corpo.querySelector('#lista-pag').onclick = (e) => {
      const b = e.target.closest('[data-rm]');
      if (b) { pagamentos.splice(Number(b.dataset.rm), 1); atualizar(); valorEl.focus(); }
    };
    valorEl.addEventListener('input', () => { infoCrediario(); if (!dividir) atualizarDireto(); });
    parcEl.addEventListener('change', () => { infoCrediario(); if (!dividir) atualizarDireto(); });
    vencEl.addEventListener('change', infoCrediario);
    // Alt + 1…7 escolhe a forma de pagamento. Os números sozinhos sempre digitam o valor
    // (antes, com o valor selecionado, o "2" de R$ 200 trocava para PIX).
    corpo.querySelector('.pag2').addEventListener('keydown', (e) => {
      const n = Number(e.code && e.code.startsWith('Digit') ? e.code.slice(5) : e.code && e.code.startsWith('Numpad') ? e.code.slice(6) : NaN);
      if (e.altKey && !e.ctrlKey && n >= 1 && n <= formas.length) {
        e.preventDefault();
        escolherForma(formas[n - 1][0]);
      }
    });
    corpo.querySelector('#f-pag').onsubmit = async (e) => {
      e.preventDefault();
      if (!dividir) return concluir();
      if (!valorEl.value.trim() && restante() <= 0) return concluir();
      if (forma === 'vale' && (!valeAtual || valeAtual.codigo !== valeEl.value.trim().toUpperCase())) {
        if (!(await buscarVale())) return;
        return; // primeiro mostra o saldo; o próximo Enter adiciona
      }
      const v = U.paraCentavos(valorEl.value);
      if (!v || Number.isNaN(v) || v < 0) return aviso('Valor inválido.', 'erro');
      if (forma === 'vale' && v > valeAtual.saldo - usadoDoVale(valeAtual.codigo)) return aviso('Valor maior que o saldo do vale.', 'erro');
      if (forma !== 'dinheiro' && v > restante()) return aviso('Só pagamento em dinheiro pode ter troco.', 'erro');
      if (forma === 'crediario' && pagamentos.some((p) => p.forma === 'crediario')) {
        return aviso('Já existe um lançamento no crediário nesta venda.', 'erro');
      }
      const parcelas = forma === 'credito' || forma === 'crediario' ? Number(parcEl.value) : 1;
      const codigo = forma === 'vale' ? valeAtual.codigo : undefined;
      const band = forma === 'debito' || forma === 'credito' ? bandeira : undefined;
      const igual = forma !== 'crediario' && pagamentos.find((p) => p.forma === forma && p.parcelas === parcelas && p.codigo === codigo && p.bandeira === band);
      if (igual) igual.valor += v;
      else {
        pagamentos.push({
          forma, valor: v, parcelas, codigo, bandeira: band,
          primeiro_vencimento: forma === 'crediario' ? vencEl.value : undefined,
        });
      }
      if (forma === 'vale' && restante() > 0) escolherForma('dinheiro'); // completa o resto em outra forma
      atualizar();
      // Não conclui sozinho: mostra o troco e espera a confirmação (a cliente ainda pode desistir).
      if (restante() <= 0) {
        const btn = corpo.querySelector('#concluir');
        btn.classList.remove('pronto');
        void btn.offsetWidth;
        btn.classList.add('pronto');
        btn.focus();
      }
    };

    let enviando = false;
    const concluir = async () => {
      if (!dividir && !enviando) {
        const p = pagamentoDireto();
        if (Number.isNaN(p.valor) || p.valor < t.total) return aviso(forma === 'dinheiro' ? 'O valor recebido é menor que o total.' : 'Valor inválido.', 'erro');
        pagamentos.length = 0;
        pagamentos.push(p);
      }
      if (enviando || restante() > 0) return;
      enviando = true;
      try {
        const venda = await api('/api/vendas', {
          metodo: 'POST',
          corpo: {
            itens: carrinho.itens.map((it) => ({ produto_id: it.produto.id, quantidade: it.quantidade, desconto: it.desconto || 0, preco: it.preco })),
            desconto: t.descontoGeral,
            pagamentos,
            cliente_id: carrinho.cliente ? carrinho.cliente.id : null,
            cpf_nota: carrinho.cpf_nota,
            reserva_id: carrinho.reserva_id || undefined,
          },
        });
        const levou = { produtos: carrinho.itens.map((it) => it.produto), cliente: carrinho.cliente };
        carrinho = novoCarrinho();
        saldoCliente = null;
        salvar();
        local.gravar('pdv_vale_pendente', null); // usado ou não, o vale "para usar agora" era desta venda
        fecharModal();
        vendaConcluida(venda, levou);
      } catch (e) {
        enviando = false;
        if (!dividir) pagamentos.length = 0;
        erro(e);
      }
    };
    corpo.querySelector('#concluir').onclick = concluir;
    modo();
    escolherForma(forma);
    atualizar();
    if (valeCodigo) {
      valeEl.value = valeCodigo;
      buscarVale();
    }
  }

  /** Manda as peças do carrinho como condicional (malinha) para a cliente identificada. */
  async function enviarCondicional() {
    const pecas = carrinho.itens.filter((it) => !it.produto.servico);
    if (!pecas.length) {
      location.hash = '#/condicional';
      return;
    }
    if (!carrinho.cliente) {
      aviso('Escolha a cliente que vai levar as peças.', 'alerta');
      return escolherCliente(() => enviarCondicional());
    }
    const cfg = await U.config();
    const prazo = new Date(Date.now() + (Number(cfg.condicional_prazo_dias) || 3) * 864e5).toLocaleDateString('sv-SE');
    const total = pecas.reduce((a, it) => a + it.produto.preco_venda * it.quantidade, 0);
    const corpo = abrirModal('Condicional (malinha)', `
      <p><b>${esc(carrinho.cliente.nome)}</b> vai levar <b>${pecas.reduce((a, it) => a + it.quantidade, 0)} peça(s)</b> para provar (${brl(total)}).
        As peças saem do estoque até ela devolver ou comprar.</p>
      <form class="form">
        <label>Devolver até<input type="date" name="prazo" value="${prazo}" required></label>
        <label>Observação<input name="obs" placeholder="Ex.: vai mostrar para a irmã"></label>
        <div class="acoes"><button type="button" class="btn" data-fechar>Voltar</button>
          <button class="btn btn-primario btn-grande"><i data-icone="bolsa"></i> Registrar e imprimir</button></div>
      </form>`, { largura: '520px' });
    corpo.querySelector('form').onsubmit = U.umaVez(corpo.querySelector('form'), async (ev) => {
      ev.preventDefault();
      try {
        const c = await api('/api/condicionais', {
          metodo: 'POST',
          corpo: {
            cliente_id: carrinho.cliente.id, prazo: ev.target.prazo.value, observacao: ev.target.obs.value,
            itens: pecas.map((it) => ({ produto_id: it.produto.id, quantidade: it.quantidade })),
          },
        });
        Impressao.condicional(c);
        carrinho = novoCarrinho();
        saldoCliente = null;
        salvar();
        fecharModal();
        aviso(`Condicional nº ${c.id} registrada para ${c.cliente_nome} (devolver até ${c.prazo.split('-').reverse().join('/')}).`);
        if (raiz) abrir(raiz);
      } catch (e) { erro(e); }
    });
  }

  /** Reserva com sinal: as peças do carrinho ficam separadas para a cliente identificada. */
  function reservar() {
    const pecas = carrinho.itens.filter((it) => !it.produto.servico);
    if (!pecas.length) {
      location.hash = '#/reservas';
      return;
    }
    if (!carrinho.cliente) {
      aviso('Escolha a cliente da reserva.', 'alerta');
      return escolherCliente(() => reservar());
    }
    Telas.reservas.criar({
      itens: pecas,
      cliente: carrinho.cliente,
      aoCriar: () => {
        carrinho = novoCarrinho();
        saldoCliente = null;
        salvar();
        if (raiz) abrir(raiz);
      },
    });
  }

  /** Coloca peças no carrinho (ex.: o que a cliente ficou da condicional) e abre o caixa. */
  /** Há uma venda em andamento no caixa? (antes de trazer peças de outra tela) */
  const temVendaEmAndamento = () => !!((local.ler(CHAVE, null) || {}).itens || []).length;
  /** Pergunta antes de trocar a venda em andamento pelas peças de outra tela. */
  const podeSubstituirVenda = async () => !temVendaEmAndamento()
    || U.confirmar('Venda em andamento no caixa', 'Já tem peças no caixa. Trocar pela nova venda? As peças de agora saem do caixa.', { ok: 'Trocar' });

  function carregarVenda({ itens, cliente, reservaId }) {
    const c = novoCarrinho();
    if (reservaId) c.reserva_id = reservaId;
    c.itens = itens.map(({ produto, quantidade, desconto }) => ({ produto, quantidade, desconto: desconto || 0 }));
    if (cliente) {
      c.cliente = { id: cliente.id, nome: cliente.nome, cpf: cliente.cpf };
      if (cliente.cpf) c.cpf_nota = U.cpf(cliente.cpf);
    }
    local.gravar(CHAVE, c);
    if (location.hash === '#/pdv' && raiz) abrir(raiz);
    else location.hash = '#/pdv';
  }

  /** Identifica a cliente na venda atual (mantém as peças que já estão no carrinho). */
  function usarCliente(cliente) {
    const c = local.ler(CHAVE, null) || novoCarrinho();
    c.cliente = { id: cliente.id, nome: cliente.nome, cpf: cliente.cpf };
    c.cpf_nota = cliente.cpf ? U.cpf(cliente.cpf) : '';
    local.gravar(CHAVE, c);
    if (raiz) { carrinho = c; abrir(raiz); }
  }

  /** Chuva de confete rápida quando a venda fecha (some sozinha; nada de clique). */
  function confete() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cores = ['#d4a24a', '#955968', '#f3cf72', '#2f9e6a', '#e8b4c0', '#7a49a6'];
    const caixa = document.createElement('div');
    caixa.className = 'confete';
    caixa.innerHTML = Array.from({ length: 70 }, () => {
      const x = Math.random() * 100;
      const d = 1.6 + Math.random() * 1.4;
      const atraso = Math.random() * 0.35;
      const giro = Math.round(Math.random() * 720 - 360);
      const lado = Math.round(Math.random() * 160 - 80);
      return `<i style="left:${x}%;background:${cores[Math.floor(Math.random() * cores.length)]};animation-duration:${d}s;animation-delay:${atraso}s;--giro:${giro}deg;--lado:${lado}px;${Math.random() > 0.5 ? 'border-radius:50%;' : ''}"></i>`;
    }).join('');
    document.body.appendChild(caixa);
    setTimeout(() => caixa.remove(), 3600);
  }

  async function vendaConcluida(venda, levou = {}) {
    const cfg = await U.config();
    U.som('sucesso');
    confete();
    const automatica = cfg.impressao_automatica === '1';
    const impressao = automatica ? Impressao.cupom(venda) : null;
    const cred = venda.crediario || [];
    const nomesPag = { debito: 'Débito', credito: 'Crédito' };
    const itensVc = venda.itens || [];
    const pecasVc = itensVc.reduce((a, it) => a + it.quantidade, 0);
    const produtos = levou.produtos || [];
    const cliente = levou.cliente || (venda.cliente_id ? { id: venda.cliente_id, nome: venda.cliente_nome } : null);
    const corpo = abrirModal(`Venda nº ${venda.id} concluída`, `
      <div class="vc vc2 ${venda.troco ? 'com-troco' : ''}">
        <div class="vc-ico">${Icone('check')}</div>
        <div class="vc-obrigada"><span>${cliente ? `Obrigada, <b>${esc(String(cliente.nome).split(' ')[0])}</b>!` : 'Venda concluída!'}</span></div>
        ${venda.troco
    ? `<div class="vc-rotulo">Devolva de troco</div><div class="vc-valor">${brl(venda.troco)}</div>
           <div class="vc-det">Recebido ${brl(venda.total + venda.troco)} · total ${brl(venda.total)}</div>`
    : `<div class="vc-rotulo">Total da venda</div><div class="vc-valor">${brl(venda.total)}</div>
           <div class="vc-det vc-formas">${venda.pagamentos.map((p) => `<span>${Icone.pag(p.forma)}${esc(nomesPag[p.forma] || U.FORMAS[p.forma])}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''}</span>`).join('')}</div>`}
        ${produtos.length ? `<div class="vc-pecas" title="${pecasVc} ${pecasVc === 1 ? 'peça' : 'peças'}">
          ${produtos.slice(0, 6).map((pr) => U.miniatura(pr, 'vc-peca')).join('')}${produtos.length > 6 ? `<span class="vc-mais">+${produtos.length - 6}</span>` : ''}
          <small>${pecasVc} ${pecasVc === 1 ? 'peça' : 'peças'}</small></div>` : ''}
        ${venda.taxas || venda.acrescimo ? `<div class="vc-liquido">${Icone('carteira')} Cai na conta <b>${brl(venda.liquido)}</b>
          <small>${venda.acrescimo ? `juros da cliente ${brl(venda.acrescimo)} · ` : ''}taxas ${brl(venda.taxas)}</small></div>` : ''}
        ${cred.length ? `<div class="vc-cred">${Icone('caderno')}<span>${cred.length}x · ${cred.slice(0, 4).map((p) =>
    `${p.vencimento.split('-').reverse().slice(0, 2).join('/')} <b>${brl(p.valor)}</b>`).join(' · ')}${cred.length > 4 ? ' …' : ''}</span></div>` : ''}
      </div>
      ${automatica ? `<div class="status-impressao" id="st-imp">${Icone('impressora')} Imprimindo o cupom…</div>` : ''}
      <div class="vc2-acoes">
        <button class="btn vc2-btn" id="imp">${Icone('impressora')}<span>${automatica ? 'Imprimir de novo' : 'Imprimir cupom'}</span></button>
        <a class="btn vc2-btn vc2-zap" id="vc-zap" hidden>${Icone('whatsapp')}<span>Enviar no WhatsApp</span></a>
        <button class="btn vc2-btn" id="troca">${Icone('presente')}<span>Cupom de troca</span></button>
      </div>
      <button class="btn btn-primario btn-grande vc-nova" data-fechar autofocus>${Icone('sacola')} Próxima venda <kbd>Enter</kbd></button>`,
    { largura: '600px', classe: 'modal-concluida', aoFechar: () => raiz && abrir(raiz) });
    // WhatsApp de agradecimento: só aparece quando a cliente tem telefone.
    if (cliente && cliente.id) {
      (async () => {
        let tel = cliente.telefone;
        try {
          const cad = await api(`/api/clientes/${cliente.id}`);
          tel = tel || cad.telefone;
          // Com foto cadastrada, ela aparece ao lado do "Obrigada".
          const ola = corpo.querySelector('.vc-obrigada');
          if (cad.foto_versao && ola && ola.isConnected) {
            ola.insertAdjacentHTML('afterbegin', `<img class="vc-cli-foto" src="/api/clientes/${cad.id}/foto?v=${cad.foto_versao}" alt="">`);
          }
        } catch { /* cliente apagada: segue sem foto e sem WhatsApp */ }
        const nomes = itensVc.map((it) => `${it.quantidade > 1 ? `${it.quantidade}x ` : ''}${it.nome}`).join(', ');
        const at = Zap.attrs(tel, 'compra', { nome: cliente.nome, pecas: nomes || `${pecasVc} peça(s)`, total: brl(venda.total) });
        const link = corpo.querySelector('#vc-zap');
        if (!at || !link || !link.isConnected) return;
        link.outerHTML = `<a class="btn vc2-btn vc2-zap" id="vc-zap" ${at}>${Icone('whatsapp')}<span>Enviar no WhatsApp</span></a>`;
      })();
    }
    corpo.querySelector('#imp').onclick = () => Impressao.cupom(venda, { gaveta: false });
    corpo.querySelector('#troca').onclick = () => Impressao.cupomTroca(venda);
    if (impressao) {
      impressao.then((ok) => {
        const st = corpo.querySelector('#st-imp');
        if (!st) return;
        if (ok === false) {
          st.classList.add('falhou');
          st.innerHTML = '<i data-icone="alerta"></i> O cupom não foi impresso. Confira se a impressora está ligada e com papel'
            + (U.sessao.ehAdmin() ? ' (Configurações → Impressoras)' : '')
            + ' e clique em “Imprimir de novo”.';
        } else {
          st.textContent = '✓ Cupom enviado para a impressora';
        }
      });
    }
  }

  // ------------------------------------------------------ vendas em espera
  // A cliente foi para o provador (ou esqueceu algo): a venda fica guardada e o caixa atende a próxima.
  const ESPERA = 'pdv_espera';
  const emEspera = () => local.ler(ESPERA, []) || [];
  function totalDe(c) {
    const sub = c.itens.reduce((a, it) => a + it.produto.preco_venda * it.quantidade - (it.desconto || 0), 0);
    const d = lerDesconto(c.desconto, sub);
    return sub - (Number.isFinite(d) && d > 0 ? Math.min(d, sub) : 0);
  }
  function contarEspera() {
    const el = raiz && raiz.querySelector('#espera-n');
    if (!el) return;
    const n = emEspera().length;
    el.hidden = !n;
    el.textContent = n;
    raiz.querySelector('#t-espera').classList.toggle('tem', n > 0);
  }
  function guardarAtual() {
    const lista = emEspera();
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    lista.push({ id: Date.now(), hora, nome: carrinho.cliente ? carrinho.cliente.nome : '', carrinho });
    local.gravar(ESPERA, lista);
    return lista[lista.length - 1];
  }
  function pausarVenda() {
    if (!carrinho.itens.length) return aviso('A sacola está vazia: não tem venda para pôr em espera.', 'alerta');
    const g = guardarAtual();
    carrinho = novoCarrinho();
    salvar();
    saldoCliente = null;
    desenhar();
    contarEspera();
    aviso(`Venda ${g.nome ? `da ${g.nome.split(' ')[0]}` : `das ${g.hora}`} em espera. O caixa está livre para a próxima cliente.`);
    raiz.querySelector('#busca').focus();
  }
  function listaEspera() {
    const lista = emEspera();
    if (!lista.length) return aviso('Nenhuma venda em espera. Use "Pôr em espera" (F3) quando a cliente for ao provador.', 'alerta');
    const corpo = U.abrirModal('Vendas em espera', `
      <p class="dica">Clique em <b>Retomar</b> para continuar a venda.${carrinho.itens.length ? ' A venda que está no caixa agora vai para a espera no lugar dela.' : ''}</p>
      <div class="p5-esperas">${lista.map((g) => {
    const pecas = g.carrinho.itens.reduce((a, it) => a + it.quantidade, 0);
    return `<div class="p5-esp" data-id="${g.id}">
          <div class="p5-esp-fotos">${g.carrinho.itens.slice(0, 3).map((it) => U.miniatura(it.produto, 'p5-esp-foto')).join('')}</div>
          <div class="p5-esp-txt"><b>${esc(g.nome || `Venda das ${g.hora}`)}</b>
            <small>${pecas} peça(s) · desde ${esc(g.hora)} · ${esc(g.carrinho.itens.map((it) => it.produto.nome).slice(0, 2).join(', '))}${g.carrinho.itens.length > 2 ? '…' : ''}</small></div>
          <b class="p5-esp-total">${brl(totalDe(g.carrinho))}</b>
          <button class="btn btn-primario btn-peq" data-retomar="${g.id}">Retomar</button>
          <button class="btn-ico" data-descartar="${g.id}" title="Descartar esta venda">${Icone('lixeira')}</button>
        </div>`;
  }).join('')}</div>
      <div class="acoes"><button class="btn" data-fechar>Fechar</button></div>`, { largura: '680px' });
    corpo.querySelector('.p5-esperas').onclick = async (ev) => {
      const r = ev.target.closest('[data-retomar]');
      const d = ev.target.closest('[data-descartar]');
      if (r) {
        const g = emEspera().find((x) => x.id === Number(r.dataset.retomar));
        let resto = emEspera().filter((x) => x.id !== g.id);
        local.gravar(ESPERA, resto);
        if (carrinho.itens.length) { guardarAtual(); resto = emEspera(); }
        carrinho = g.carrinho;
        salvar();
        U.fecharModal();
        saldoCliente = null;
        carregarSaldoCliente();
        desenhar();
        contarEspera();
        aviso(`Venda ${g.nome ? `da ${g.nome.split(' ')[0]}` : `das ${g.hora}`} de volta ao caixa.`);
        raiz.querySelector('#busca').focus();
      }
      if (d) {
        if (!(await U.confirmar('Descartar venda em espera?', 'As peças saem da lista (nada foi cobrado nem tirado do estoque).', { ok: 'Descartar', perigo: true }))) return listaEspera();
        local.gravar(ESPERA, emEspera().filter((x) => x.id !== Number(d.dataset.descartar)));
        contarEspera();
        if (emEspera().length) listaEspera();
      }
    };
  }

  function tecla(ev) {
    if (!raiz || !caixa) return;
    const mapa = {
      F2: () => raiz.querySelector('#busca').focus(),
      F3: () => { if (!U.modalAberto()) { if (carrinho.itens.length) pausarVenda(); else listaEspera(); } },
      F4: () => !U.modalAberto() && finalizar('dinheiro', undefined, { dividir: true }),
      F6: () => !U.modalAberto() && escolherCliente(),
      F7: () => !U.modalAberto() && pedirDesconto(),
      F8: () => {
        if (U.modalAberto() || !carrinho.itens.length) return;
        carrinho.itens.pop();
        salvar();
        desenhar();
      },
      F9: () => !U.modalAberto() && limpar(),
      F10: () => !U.modalAberto() && receberCrediario(),
    };
    if (mapa[ev.key]) {
      ev.preventDefault();
      mapa[ev.key]();
    }
  }

  return {
    abrir, tecla, carregarVenda, usarCliente, podeSubstituirVenda,
    recarregar: () => raiz && abrir(raiz),
    sair: () => { raiz = null; pararRelogio(); },
  };
})();
