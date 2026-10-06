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
    caixa = r.caixa;
    pararRelogio();
    if (!caixa) return telaCaixaFechado();

    const hora = caixa.aberto_em.split(' ')[1]?.slice(0, 5) || '';
    const eu = U.sessao.usuario;
    raiz.innerHTML = `
      <div class="pdv4">
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
              <a href="#/relatorios" data-admin>${Icone('grafico')} Relatórios</a>
              <a href="#/config" data-admin>${Icone('ajustes')} Configurações</a>
            </div>
          </div>
          <div class="p4-caixa"><span class="ponto ok"></span><b>Caixa ${caixa.id} aberto</b><small>desde ${esc(hora)}</small></div>
          <div class="p4-topo-acoes">
            <button class="p4-acao" id="t-troca" title="Troca ou devolução de uma venda (bipe o cupom)">${Icone('troca')}<span>Troca</span></button>
            <button class="p4-acao" id="t-condicional" title="Mandar as peças desta venda como condicional (malinha)">${Icone('bolsa')}<span>Condicional</span></button>
            <button class="p4-acao" id="t-reservar" title="Separar as peças com sinal para a cliente buscar depois">${Icone('reserva')}<span>Reservar</span></button>
            <button class="p4-acao" id="t-gaveta" title="Abrir a gaveta">${Icone('gaveta')}<span>Gaveta</span></button>
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
          <div class="p4-passo"><span>1</span>Bipe a etiqueta ou procure a peça</div>
          <div class="pdv-busca p4-busca">
            <span class="pdv-busca-ico">${Icone('codigo')}</span>
            <input id="busca" autocomplete="off" placeholder="Bipe aqui ou digite o nome da peça…">
            <kbd>F2</kbd>
            <div id="sugestoes" class="sugestoes" hidden></div>
          </div>
          <div class="pdv-alertas" id="alertas"></div>
          <div class="p4-lista-cab">
            <div><b>Peças da venda</b><span id="itens-cont"></span></div>
            <button class="btn btn-claro btn-peq" id="btn-sem-etiqueta">${Icone('estrela')} Peça sem etiqueta</button>
          </div>
          <div class="pdv-lista p4-lista" id="itens"></div>
          <div class="p4-rapidos" id="secao-atalhos" hidden>
            <span>${Icone('raio')} Rápido</span>
            <div class="pdv-atalhos" id="atalhos"></div>
          </div>
        </section>

        <aside class="p4-pagar">
          <div class="p4-passo"><span>2</span>Confira a cliente e o total</div>
          <button class="pdv-cliente" id="btn-cliente">
            <span class="pdv-cliente-ico">${Icone('usuario')}</span>
            <span id="cliente-info" class="pdv-cliente-txt"></span>
            <kbd>F6</kbd>
          </button>
          <div class="p4-total">
            <small>Total a pagar</small>
            <b id="t-total"></b>
            <div class="p4-total-det"><span><b id="t-pecas"></b> peça(s)</span><span>Subtotal <b id="t-sub"></b></span><span>Desconto <b id="t-desc"></b></span></div>
          </div>
          <div class="p4-ajustes">
            <button id="btn-desconto">${Icone('etiqueta')}<span id="desconto-txt">Desconto</span><kbd>F7</kbd></button>
            <button id="btn-cpf">${Icone('recibo')}<span id="cpf-txt">CPF na nota</span></button>
          </div>
          <div class="p4-passo"><span>3</span>Como a cliente vai pagar?</div>
          <div class="pdv-pagar p4-formas">
            ${[...FORMAS_RAPIDAS, ['vale', 'vale', 'Vale-troca']].map(([k, ico, nome]) => `<button class="pdv-forma" data-forma="${k}">${Icone(ico)}<span>${nome}</span></button>`).join('')}
          </div>
          <div class="p4-rodape-pagar">
            <button class="link" id="btn-finalizar">Dividir em duas formas <kbd>F4</kbd></button>
            <button class="link p4-cancelar" id="btn-limpar">Cancelar venda <kbd>F9</kbd></button>
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
    raiz.querySelector('#btn-finalizar').onclick = () => finalizar();
    raiz.querySelector('#btn-limpar').onclick = limpar;
    raiz.querySelector('#itens').addEventListener('click', cliqueItem);
    raiz.querySelector('.pdv-pagar').onclick = (e) => {
      const b = e.target.closest('[data-forma]');
      if (b) finalizar(b.dataset.forma);
    };
    const recarregar = () => { atualizarStatusCaixa(); if (raiz) abrir(raiz); };
    raiz.querySelector('#t-sangria').onclick = () => Telas.caixa.movimento('sangria', recarregar);
    raiz.querySelector('#t-suprimento').onclick = () => Telas.caixa.movimento('suprimento', recarregar);
    raiz.querySelector('#t-gaveta').onclick = () => Impressao.abrirGaveta();
    raiz.querySelector('#t-troca').onclick = () => Trocas.perguntarVenda();
    raiz.querySelector('#t-condicional').onclick = () => enviarCondicional();
    raiz.querySelector('#t-reservar').onclick = () => reservar();
    raiz.querySelector('#t-tela').onclick = alternarTelaCheia;
    const menu = raiz.querySelector('#menu-caixa');
    raiz.querySelector('#t-mais').onclick = (ev) => { ev.stopPropagation(); menu.hidden = !menu.hidden; };
    menu.onclick = () => { menu.hidden = true; };
    raiz.addEventListener('click', (ev) => {
      if (!ev.target.closest('#t-mais')) menu.hidden = true;
      if (!ev.target.closest('#t-nav')) nav.hidden = true;
    });
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

  async function carregarSaldoCliente() {
    saldoCliente = null;
    if (!carrinho.cliente) return;
    try {
      const c = await api(`/api/clientes/${carrinho.cliente.id}`);
      saldoCliente = c.crediario;
      if (raiz) { desenharCliente(); desenharAlertas(); }
    } catch { /* cliente apagado: ignora */ }
  }

  function desenharCliente() {
    const info = raiz.querySelector('#cliente-info');
    if (!carrinho.cliente) {
      info.innerHTML = '<b>Identificar cliente</b><small>Opcional · obrigatório no crediário</small>';
      return;
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
            <span class="p4-tags">${p.tamanho ? `<span class="p4-tag">Tam ${esc(p.tamanho)}</span>` : ''}${p.cor ? `<span class="p4-tag">${esc(p.cor)}</span>` : ''}<small>${esc(p.codigo)}</small></span>
          </div>
          <div class="p4-item-preco">${liq ? `<s>${num(p.preco_anterior)}</s>` : ''}<span>${num(p.preco_venda)}</span><small>cada</small></div>
          <span class="qtd-ctrl p4-qtd"><button class="mini" data-acao="menos" title="Menos uma">${Icone('menos')}</button><span>${it.quantidade}</span><button class="mini" data-acao="mais" title="Mais uma">${Icone('mais')}</button></span>
          <button class="pdv-desc ${it.desconto ? 'tem' : ''}" data-acao="desc" title="Desconto nesta peça">${it.desconto ? `−${num(it.desconto)}` : `${Icone('etiqueta')} desconto`}</button>
          <b class="p4-item-total">${num(totalItem(it))}</b>
          <button class="p4-remover" data-acao="remover" title="Tirar da venda">${Icone('lixeira')}</button>
        </div>`;
      }).join('')
      : `<div class="p4-vazio">
          ${Ilustracao.svg('sacola', 150)}
          <b>Caixa livre</b>
          <p>Bipe a etiqueta da peça com o leitor — ela aparece aqui.</p>
          <div class="p4-vazio-passos">
            <span><i>1</i>Bipe as peças</span><span><i>2</i>Confira o total</span><span><i>3</i>Escolha a forma de pagamento</span>
          </div>
          <div class="pdv-vazio-dicas"><span><kbd>3*</kbd>código = 3 peças iguais</span><span><kbd>F8</kbd> tira a última peça</span></div>
        </div>`;
    const recente = lista.querySelector('.recente');
    if (recente) recente.scrollIntoView({ block: 'nearest' });

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
      alertas.push(['perigo', `<i data-icone="caderno"></i> ${esc(carrinho.cliente.nome)} tem <b>${brl(saldoCliente.vencido)}</b> vencido no crediário.`]);
    }
    const porProduto = new Map();
    for (const it of carrinho.itens) {
      const x = porProduto.get(it.produto.id) || { p: it.produto, qtd: 0 };
      x.qtd += it.quantidade;
      porProduto.set(it.produto.id, x);
    }
    for (const { p, qtd } of porProduto.values()) {
      if (p.servico) continue; // serviço não tem estoque
      const nome = esc([p.nome, p.tamanho, p.cor].filter(Boolean).join(' '));
      if (qtd > p.estoque) alertas.push(['perigo', `<i data-icone="caixa"></i> <b>${nome}</b>: o sistema só tem ${p.estoque} em estoque. Confira a etiqueta.
        <button class="link" data-espera="${p.id}">anotar na lista de espera</button>`]);
      else if (p.estoque - qtd <= p.estoque_minimo) alertas.push(['alerta', `<i data-icone="caixa"></i> <b>${nome}</b>: ${p.estoque - qtd === 0 ? 'é a última peça' : `restam só ${p.estoque - qtd}`}. Hora de repor.`]);
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
    el.querySelectorAll('[data-espera]').forEach((b) => {
      b.onclick = () => {
        const it = carrinho.itens.find((x) => x.produto.id === Number(b.dataset.espera));
        if (it) Telas.espera.anotar({ produto: it.produto, cliente: carrinho.cliente });
      };
    });
  }

  function desenharTotais() {
    const t = totais();
    raiz.querySelector('#t-pecas').textContent = t.pecas;
    raiz.querySelector('#t-sub').textContent = brl(t.bruto);
    raiz.querySelector('#t-desc').textContent = brl(t.bruto - t.total);
    raiz.querySelector('#t-total').textContent = brl(t.total);
    const temDesc = !!String(carrinho.desconto || '').trim();
    raiz.querySelector('#desconto-txt').textContent = temDesc ? `Desconto: ${carrinho.desconto}` : 'Desconto';
    raiz.querySelector('#btn-desconto').classList.toggle('ativo', temDesc);
    raiz.querySelector('#btn-desconto').classList.toggle('invalido', Number.isNaN(lerDesconto(carrinho.desconto, t.subtotal)));
    raiz.querySelector('#cpf-txt').textContent = carrinho.cpf_nota ? `CPF ${carrinho.cpf_nota}` : 'CPF na nota';
    raiz.querySelector('#btn-cpf').classList.toggle('ativo', !!carrinho.cpf_nota);
    raiz.querySelector('.p4-pagar').classList.toggle('sem-itens', !carrinho.itens.length);
  }

  /** Desconto na venda inteira: "10%" ou "15,00". */
  async function pedirDesconto() {
    const t = totais();
    const v = await U.perguntar('Desconto na venda', `Digite em % (ex.: 10%) ou em reais (ex.: 15,00). Subtotal: ${brl(t.subtotal)}. Deixe vazio para tirar.`,
      { valor: carrinho.desconto || '', obrigatorio: false });
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
    try {
      if (await lerEntrada(valor)) limparBusca();
    } catch (e) { erro(e); }
  }

  // -------------------------------------------------------------- itens
  async function cliqueItem(ev) {
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
      const v = await U.perguntar('Desconto no item', `${it.produto.nome} — ${brl(brutoItem(it))}. Ex.: 10% ou 20,00`,
        { valor: it.desconto ? num(it.desconto) : '', obrigatorio: false });
      if (v !== null) {
        const d = lerDesconto(v, brutoItem(it));
        if (Number.isNaN(d) || d < 0 || d > brutoItem(it)) aviso('Desconto inválido.', 'erro');
        else it.desconto = d;
      }
    }
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
  async function finalizar(formaInicial = 'dinheiro', valeCodigo) {
    if (!carrinho.itens.length) return aviso('Adicione itens antes de finalizar.', 'alerta');
    // Vale gerado numa troca e marcado para "usar agora".
    const pendente = local.ler('pdv_vale_pendente', null);
    if (!valeCodigo && pendente && formaInicial === 'dinheiro') {
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
    const formas = Object.entries(U.FORMAS);

    const ICONES_PAG = { dinheiro: 'dinheiro', pix: 'pix', debito: 'cartao', credito: 'cartao', crediario: 'caderno', vale: 'vale', outro: 'carteira' };
    const NOMES_PAG = { debito: 'Débito', credito: 'Crédito' };
    const corpo = abrirModal('Pagamento', `
      <div class="pag2">
        <div class="pag2-esq">
          <div class="pag2-rotulo">Forma de pagamento</div>
          <div class="formas formas-7">
            ${formas.map(([k, v], i) =>
    `<button class="forma ${k === forma ? 'sel' : ''}" data-forma="${k}">${Icone(ICONES_PAG[k] || 'carteira')}<span>${NOMES_PAG[k] || v}</span><kbd title="Atalho: Alt + ${i + 1}">Alt+${i + 1}</kbd></button>`).join('')}
          </div>
          <form id="f-pag" class="pag2-form">
            <label class="pag2-valor"><span id="pag-rotulo">Valor recebido</span><div class="campo-moeda"><span>R$</span><input id="pag-valor" inputmode="decimal" autocomplete="off" autofocus></div></label>
            <label id="lbl-parc" hidden>Parcelas<select id="pag-parc"></select></label>
            <div id="lbl-band" class="pag2-band" hidden><span>Bandeira do cartão</span>
              <div class="segmentos">${Object.entries(U.BANDEIRAS).map(([k, n]) => `<button type="button" class="segmento tx-seg ${k === 'visa_master' ? 'sel' : ''}" data-band="${k}">${n}</button>`).join('')}</div></div>
            <label id="lbl-venc" hidden>1º vencimento<input type="date" id="pag-venc" value="${vencPadrao}"></label>
            <label id="lbl-vale" hidden>Código do vale<input id="pag-vale" autocomplete="off" placeholder="Bipe o vale-troca"></label>
            <button class="btn btn-claro pag2-add">${Icone('mais')} Adicionar <kbd>Enter</kbd></button>
          </form>
          <div class="pag2-dica" id="pag-dica" hidden></div>
          <div class="pag2-taxa" id="info-taxa" hidden></div>
          <div class="valores-rapidos" id="rapidos"></div>
          <div id="info-vale" class="info-cred" hidden></div>
          <div id="info-cred" class="info-cred" hidden></div>
        </div>
        <aside class="pag2-dir">
          <div class="pag2-total"><small>Total da venda</small><b>${brl(t.total)}</b><span>${t.pecas} peça${t.pecas === 1 ? '' : 's'}${t.bruto - t.total ? ` · desconto ${brl(t.bruto - t.total)}` : ''}</span></div>
          <div id="lista-pag" class="lista-pag"></div>
          <div class="pag-resumo" id="pag-resumo"></div>
          <button class="btn btn-primario btn-grande pag2-concluir" id="concluir" disabled>${Icone('check')} Confirmar venda <kbd>Enter</kbd></button>
          <button class="btn btn-fantasma" data-fechar>Voltar <kbd>Esc</kbd></button>
        </aside>
      </div>`, { largura: '920px' });

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
      el.innerHTML = unicos.map((v, i) => `<button type="button" class="btn valor-rapido ${i === 0 ? 'exato' : ''}" data-v="${v}">${i === 0 ? 'Valor exato ' : ''}${brl(v)}</button>`).join('');
    };
    corpo.querySelector('#rapidos').onclick = (ev) => {
      const b = ev.target.closest('[data-v]');
      if (!b) return;
      valorEl.value = num(Number(b.dataset.v));
      corpo.querySelector('#f-pag').requestSubmit();
    };
    const parcEl = corpo.querySelector('#pag-parc');
    const vencEl = corpo.querySelector('#pag-venc');
    const pago = () => pagamentos.reduce((a, p) => a + p.valor, 0);
    const restante = () => t.total - pago();

    const preencherParcelas = () => {
      const max = forma === 'crediario' ? maxParcelas : 12;
      const atual = Number(parcEl.value) || 1;
      parcEl.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('');
      parcEl.value = String(Math.min(atual, max));
    };

    // Cartão: bandeira escolhida e quanto a maquininha desconta (só informativo para quem está no caixa).
    let bandeira = 'visa_master';
    const infoTaxa = () => {
      const box = corpo.querySelector('#info-taxa');
      const cartao = forma === 'debito' || forma === 'credito';
      corpo.querySelector('#lbl-band').hidden = !cartao;
      const n = forma === 'credito' ? Number(parcEl.value) || 1 : 1;
      const p = cartao || forma === 'pix' ? U.taxa(cfg, forma, n, bandeira) : 0;
      box.hidden = !p;
      if (!p) return;
      const v = U.paraCentavos(valorEl.value) || 0;
      const tx = Math.round((v * p) / 100);
      box.innerHTML = `${Icone('cartao')}<span>Taxa da maquininha <b>${U.pctTxt(p)}</b> (${brl(tx)}) · cai na conta <b>${brl(v - tx)}</b></span>`;
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
      if (f === 'crediario' && !carrinho.cliente) {
        fecharModal();
        aviso('Para vender no crediário, escolha o cliente.', 'alerta');
        return escolherCliente(() => finalizar('crediario'));
      }
      forma = f;
      corpo.querySelectorAll('.forma').forEach((b) => b.classList.toggle('sel', b.dataset.forma === f));
      corpo.querySelector('#lbl-parc').hidden = f !== 'credito' && f !== 'crediario';
      corpo.querySelector('#lbl-venc').hidden = f !== 'crediario';
      corpo.querySelector('#lbl-vale').hidden = f !== 'vale';
      // Só dinheiro tem "valor recebido" (troco). Nas outras formas o valor é o que falta pagar;
      // muda só para dividir a venda em duas formas (ex.: parte no PIX, parte no cartão).
      const nome = NOMES_PAG[f] || U.FORMAS[f];
      corpo.querySelector('#pag-rotulo').textContent = f === 'dinheiro' ? 'Valor recebido em dinheiro' : `Valor no ${nome.toLowerCase() === 'pix' ? 'PIX' : nome.toLowerCase()}`;
      const dica = corpo.querySelector('#pag-dica');
      dica.hidden = f === 'dinheiro';
      dica.textContent = f === 'vale' ? 'O valor vem do saldo do vale.' : 'Já vem com o valor exato. Só mude se a cliente for dividir o pagamento em duas formas.';
      if (f !== 'dinheiro' && restante() > 0) valorEl.value = num(restante());
      preencherParcelas();
      infoCrediario();
      infoVale();
      desenharRapidos();
      if (f === 'vale' && !valeAtual) { valeEl.focus(); return; }
      valorEl.focus();
      valorEl.select();
    };

    const atualizar = () => {
      corpo.querySelector('#lista-pag').innerHTML = pagamentos.length ? pagamentos.map((p, i) => `
        <div class="pag2-item">${Icone(ICONES_PAG[p.forma] || 'carteira')}<span><b>${NOMES_PAG[p.forma] || U.FORMAS[p.forma]}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''}</b>${
  p.codigo ? `<small>${esc(p.codigo)}</small>` : ''}${p.bandeira ? `<small>${U.BANDEIRAS[p.bandeira]}</small>` : ''}${p.forma === 'crediario' ? `<small>1º venc. ${p.primeiro_vencimento.split('-').reverse().join('/')}</small>` : ''}</span>
        <b>${brl(p.valor)}</b><button class="mini perigo" data-rm="${i}" title="Tirar">${Icone('fechar')}</button></div>`).join('')
        : '<div class="pag2-nada">Escolha a forma e o valor ao lado.</div>';
      const r = restante();
      corpo.querySelector('#pag-resumo').innerHTML = r > 0
        ? `<div class="pag2-falta"><span>Falta receber</span><b>${brl(r)}</b></div>`
        : `<div class="pag2-troco ${r < 0 ? 'tem' : ''}"><span>${r < 0 ? 'Troco para a cliente' : 'Pago'}</span><b>${r < 0 ? brl(-r) : 'Valor certo ✓'}</b>
            <small>Confira e clique em <b>Confirmar venda</b>. Se a cliente desistir, clique em Voltar — nada é registrado.</small></div>`;
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
    valorEl.addEventListener('input', infoCrediario);
    parcEl.addEventListener('change', infoCrediario);
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
          },
        });
        carrinho = novoCarrinho();
        saldoCliente = null;
        salvar();
        if (pagamentos.some((p) => p.forma === 'vale')) local.gravar('pdv_vale_pendente', null);
        fecharModal();
        vendaConcluida(venda);
      } catch (e) {
        enviando = false;
        erro(e);
      }
    };
    corpo.querySelector('#concluir').onclick = concluir;
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
          <button class="btn btn-primario btn-grande"><i data-icone="bolsa"></i> Registrar e imprimir (2 vias)</button></div>
      </form>`, { largura: '520px' });
    corpo.querySelector('form').onsubmit = async (ev) => {
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
    };
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
  function carregarVenda({ itens, cliente }) {
    const c = novoCarrinho();
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

  async function vendaConcluida(venda) {
    const cfg = await U.config();
    U.som('sucesso');
    const automatica = cfg.impressao_automatica === '1';
    const impressao = automatica ? Impressao.cupom(venda) : null;
    const cred = venda.crediario || [];
    const nomesPag = { debito: 'Débito', credito: 'Crédito' };
    const corpo = abrirModal(`Venda nº ${venda.id} concluída`, `
      <div class="vc ${venda.troco ? 'com-troco' : ''}">
        <div class="vc-ico">${Icone('check')}</div>
        ${venda.troco
    ? `<div class="vc-rotulo">Devolva de troco</div><div class="vc-valor">${brl(venda.troco)}</div>
           <div class="vc-det">Recebido ${brl(venda.total + venda.troco)} · total ${brl(venda.total)}</div>`
    : `<div class="vc-rotulo">Venda registrada</div><div class="vc-valor">${brl(venda.total)}</div>
           <div class="vc-det">${venda.pagamentos.map((p) => esc(nomesPag[p.forma] || U.FORMAS[p.forma]) + (p.parcelas > 1 ? ` ${p.parcelas}x` : '')).join(' + ')}</div>`}
      </div>
      ${cred.length ? `<div class="info-cred">${Icone('caderno')} Crediário em ${cred.length}x — ${cred.map((p) =>
    `${p.vencimento.split('-').reverse().slice(0, 2).join('/')} ${brl(p.valor)}`).join(' · ')}<br>
          <small>Peça para a cliente assinar a via da loja.</small></div>` : ''}
      ${automatica ? `<div class="status-impressao" id="st-imp">${Icone('impressora')} Imprimindo o cupom…</div>` : ''}
      <div class="vc-acoes">
        <button class="btn" id="imp">${Icone('impressora')} ${automatica ? 'Imprimir de novo' : 'Imprimir cupom'}</button>
        <button class="btn" id="troca">${Icone('presente')} Cupom de troca</button>
        <button class="btn btn-primario btn-grande vc-nova" data-fechar autofocus>${Icone('sacola')} Próxima venda <kbd>Enter</kbd></button>
      </div>`, { largura: '560px', aoFechar: () => raiz && abrir(raiz) });
    corpo.querySelector('#imp').onclick = () => Impressao.cupom(venda, { gaveta: false });
    corpo.querySelector('#troca').onclick = () => Impressao.cupomTroca(venda);
    if (impressao) {
      impressao.then((ok) => {
        const st = corpo.querySelector('#st-imp');
        if (!st) return;
        if (ok === false) {
          st.classList.add('falhou');
          st.innerHTML = '<i data-icone="alerta"></i> O cupom não foi impresso. Confira se a impressora está ligada e com papel'
            + (U.ehAdmin() ? ' (Configurações → Impressão)' : '')
            + ' e clique em “Imprimir de novo”.';
        } else {
          st.textContent = '✓ Cupom enviado para a impressora';
        }
      });
    }
  }

  function tecla(ev) {
    if (!raiz || !caixa) return;
    const mapa = {
      F2: () => raiz.querySelector('#busca').focus(),
      F4: () => !U.modalAberto() && finalizar(),
      F6: () => !U.modalAberto() && escolherCliente(),
      F7: () => !U.modalAberto() && pedirDesconto(),
      F8: () => {
        if (U.modalAberto() || !carrinho.itens.length) return;
        carrinho.itens.pop();
        salvar();
        desenhar();
      },
      F9: () => !U.modalAberto() && limpar(),
    };
    if (mapa[ev.key]) {
      ev.preventDefault();
      mapa[ev.key]();
    }
  }

  return {
    abrir, tecla, carregarVenda, usarCliente,
    recarregar: () => raiz && abrir(raiz),
    sair: () => { raiz = null; pararRelogio(); },
  };
})();
