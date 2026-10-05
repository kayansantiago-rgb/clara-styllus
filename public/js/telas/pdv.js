/* Tela de venda (frente de caixa). */
Telas.pdv = (() => {
  const { esc, brl, num, api, aviso, erro, abrirModal, fecharModal, local } = U;
  const CHAVE = 'pdv_carrinho';
  const FORMAS_RAPIDAS = [
    ['dinheiro', '💵', 'Dinheiro'],
    ['pix', '⚡', 'PIX'],
    ['debito', '💳', 'Débito'],
    ['credito', '💳', 'Crédito'],
    ['crediario', '📒', 'Crediário'],
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
    raiz.innerHTML = `
      <div class="pdv2">
        <header class="pdv-topo">
          <div class="pdv-caixa"><span class="ponto ok"></span>
            <b>Caixa nº ${caixa.id}</b><span>aberto às ${esc(hora)} por ${esc(caixa.operador || '')}</span></div>
          <div class="pdv-topo-acoes">
            <button class="btn btn-topo" id="t-sangria" title="Retirar dinheiro da gaveta">➖ Sangria</button>
            <button class="btn btn-topo" id="t-suprimento" title="Colocar troco na gaveta">➕ Suprimento</button>
            <button class="btn btn-topo" id="t-troca" title="Troca ou devolução de uma venda (bipe o cupom)">🔁 Troca</button>
            <button class="btn btn-topo" id="t-condicional" title="Mandar as peças desta venda como condicional (malinha)">👜 Condicional</button>
            <button class="btn btn-topo" id="t-gaveta" title="Abrir a gaveta">🗄️ Gaveta</button>
            <button class="btn btn-topo" id="t-tela" title="Tela cheia (F11)">⛶</button>
            <button class="btn btn-topo btn-topo-perigo" id="t-fechar">🔒 Fechar caixa</button>
            <span class="pdv-relogio" id="relogio"></span>
          </div>
        </header>

        <section class="pdv-esq">
          <div class="pdv-alertas" id="alertas"></div>
          <div class="pdv-busca">
            <span class="pdv-busca-ico">⌕</span>
            <input id="busca" autocomplete="off" placeholder="Bipe o código de barras ou digite o nome do produto">
            <kbd>F2</kbd>
            <div id="sugestoes" class="sugestoes" hidden></div>
          </div>
          <div class="pdv-ultimo" id="ultimo"></div>
          <div class="pdv-atalhos" id="atalhos"></div>
          <div class="pdv-itens tabela-rolagem">
            <table class="tabela itens">
              <thead><tr><th>#</th><th>Produto</th><th class="c">Qtd</th><th class="r">Unit.</th>
                <th class="r">Desc.</th><th class="r">Total</th><th></th></tr></thead>
              <tbody id="itens"></tbody>
            </table>
          </div>
        </section>

        <aside class="pdv-dir">
          <div class="pdv-total">
            <div class="pdv-total-rotulo">TOTAL A PAGAR</div>
            <div class="pdv-total-valor" id="t-total"></div>
            <div class="pdv-total-det">
              <span><b id="t-pecas"></b> peças</span>
              <span>Subtotal <b id="t-sub"></b></span>
              <span>Desc. <b id="t-desc"></b></span>
            </div>
          </div>

          <div class="pdv-bloco">
            <button class="pdv-cliente" id="btn-cliente">
              <span class="pdv-cliente-ico">👤</span>
              <span id="cliente-info" class="pdv-cliente-txt"></span>
              <kbd>F6</kbd>
            </button>
            <div class="pdv-campos">
              <label>CPF/CNPJ no cupom<input id="cpf" inputmode="numeric" value="${esc(carrinho.cpf_nota)}"></label>
              <label>Desconto (F7)<input id="desconto" placeholder="10% ou 15,00" value="${esc(carrinho.desconto)}"></label>
            </div>
            <div class="vendedor-logado"><small>Vendedor(a)</small><b>${esc(U.sessao.usuario.nome)}</b>
              <button class="link" onclick="exigirLogin()" type="button">trocar</button></div>
          </div>

          <div class="pdv-pagar">
            ${FORMAS_RAPIDAS.map(([k, ico, nome]) =>
    `<button class="pdv-forma" data-forma="${k}"><span>${ico}</span>${nome}</button>`).join('')}
          </div>
          <button class="btn btn-primario btn-grande pdv-finalizar" id="btn-finalizar">Finalizar venda <kbd>F4</kbd></button>
          <button class="btn btn-perigo-claro" id="btn-limpar">Cancelar venda <kbd>F9</kbd></button>
        </aside>

        <footer class="pdv-rodape">
          <span><kbd>F2</kbd> buscar</span><span><kbd>F4</kbd> finalizar</span><span><kbd>F6</kbd> cliente</span>
          <span><kbd>F7</kbd> desconto</span><span><kbd>F8</kbd> remove último</span><span><kbd>F9</kbd> cancela venda</span>
          <span><b>3*</b>código = 3 unidades</span>
        </footer>
      </div>`;

    const busca = raiz.querySelector('#busca');
    busca.addEventListener('keydown', teclaBusca);
    busca.addEventListener('input', U.debounce(() => sugerir(busca.value), 200));
    busca.addEventListener('blur', () => setTimeout(esconderSugestoes, 150));
    raiz.querySelector('#cpf').addEventListener('input', (e) => { carrinho.cpf_nota = e.target.value; salvar(); });
    raiz.querySelector('#desconto').addEventListener('input', (e) => { carrinho.desconto = e.target.value; salvar(); desenharTotais(); });
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
    raiz.querySelector('#t-tela').onclick = alternarTelaCheia;
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
        ${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}`;
    };
    tic();
    relogio = setInterval(tic, 15000);
  }

  function pararRelogio() {
    if (relogio) clearInterval(relogio);
    relogio = null;
  }

  function telaCaixaFechado() {
    raiz.innerHTML = `<div class="centro">${Telas.caixa.formAbrir()}</div>`;
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
    const tbody = raiz.querySelector('#itens');
    tbody.innerHTML = carrinho.itens.length
      ? carrinho.itens.map((it, i) => {
        const p = it.produto;
        const det = [p.tamanho && `Tam ${p.tamanho}`, p.cor].filter(Boolean).join(' · ');
        return `<tr data-i="${i}" class="${i === carrinho.itens.length - 1 ? 'recente' : ''}">
          <td class="num-item">${i + 1}</td>
          <td><b>${esc(p.nome)}</b><br><small>${esc(det)} ${det ? '·' : ''} ${esc(p.codigo)}</small></td>
          <td class="c qtd"><button class="mini" data-acao="menos">−</button><span>${it.quantidade}</span><button class="mini" data-acao="mais">+</button></td>
          <td class="r">${p.preco_anterior > p.preco_venda ? `<small class="preco-de">${num(p.preco_anterior)}</small><br><span class="preco-por">${num(p.preco_venda)}</span>` : num(p.preco_venda)}</td>
          <td class="r"><button class="link" data-acao="desc">${it.desconto ? '-' + num(it.desconto) : 'dar'}</button></td>
          <td class="r"><b>${num(totalItem(it))}</b></td>
          <td><button class="mini perigo" data-acao="remover" title="Remover">×</button></td>
        </tr>`;
      }).join('')
      : `<tr><td colspan="7" class="vazio pdv-vazio">
          <div class="pdv-vazio-ico">🛍️</div>
          <b>Caixa livre</b><br>Bipe a etiqueta da peça para começar a venda.</td></tr>`;

    const ult = carrinho.itens[carrinho.itens.length - 1];
    const ultEl = raiz.querySelector('#ultimo');
    ultEl.classList.toggle('vazio-ult', !ult);
    ultEl.innerHTML = ult
      ? `${U.miniatura(ult.produto, 'ultimo-foto')}<div class="ultimo-txt"><small>Último item</small><span>${esc(ult.produto.nome)}</span>
           <small>${esc([ult.produto.tamanho && 'Tam ' + ult.produto.tamanho, ult.produto.cor].filter(Boolean).join(' · '))}</small></div>
         <b>${ult.quantidade} × ${brl(ult.produto.preco_venda)}</b>`
      : `<span class="ultimo-foto sem-foto">🛍️</span><div class="ultimo-txt"><small>Clara Styllus</small><span>Pronto para vender</span></div><b>${brl(0)}</b>`;

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
      alertas.push(['perigo', `📒 ${esc(carrinho.cliente.nome)} tem <b>${brl(saldoCliente.vencido)}</b> vencido no crediário.`]);
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
      if (qtd > p.estoque) alertas.push(['perigo', `📦 <b>${nome}</b>: o sistema só tem ${p.estoque} em estoque. Confira a etiqueta.`]);
      else if (p.estoque - qtd <= p.estoque_minimo) alertas.push(['alerta', `📦 <b>${nome}</b>: ${p.estoque - qtd === 0 ? 'é a última peça' : `restam só ${p.estoque - qtd}`}. Hora de repor.`]);
    }
    const pendente = local.ler('pdv_vale_pendente', null);
    if (pendente) alertas.push(['ok', `🎟️ Vale-troca <b>${esc(pendente.codigo)}</b> (${brl(pendente.saldo)}) vai entrar no pagamento desta venda. <button class="link" id="tirar-vale">não usar</button>`]);
    const aberto = caixa ? new Date(caixa.aberto_em.replace(' ', 'T')) : null;
    if (aberto && Date.now() - aberto.getTime() > 12 * 36e5) {
      alertas.push(['alerta', `💰 O caixa nº ${caixa.id} está aberto desde ${U.dataHora(caixa.aberto_em)}. Feche o caixa do dia anterior.`]);
    }
    el.innerHTML = alertas.map(([tipo, txt]) => `<div class="pdv-alerta ${tipo}">${txt}</div>`).join('');
    const tirar = el.querySelector('#tirar-vale');
    if (tirar) tirar.onclick = () => { local.gravar('pdv_vale_pendente', null); desenharAlertas(); };
  }

  function desenharTotais() {
    const t = totais();
    raiz.querySelector('#t-pecas').textContent = t.pecas;
    raiz.querySelector('#t-sub').textContent = brl(t.bruto);
    raiz.querySelector('#t-desc').textContent = brl(t.bruto - t.total);
    raiz.querySelector('#t-total').textContent = brl(t.total);
    const campo = raiz.querySelector('#desconto');
    campo.classList.toggle('invalido', Number.isNaN(lerDesconto(carrinho.desconto, t.subtotal)));
  }

  // -------------------------------------------------------------- busca
  /** Botões rápidos (sacola, ajuste de barra…) configurados no cadastro do produto. */
  async function carregarAtalhos() {
    let lista = [];
    try { lista = await api('/api/produtos/atalhos'); } catch { /* sem atalhos */ }
    const el = raiz && raiz.querySelector('#atalhos');
    if (!el) return;
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
    desenhar();
    const tabela = raiz.querySelector('.pdv-itens');
    tabela.scrollTop = tabela.scrollHeight;
  }

  async function lerEntrada(valor) {
    let texto = valor.trim();
    if (!texto) return;
    // Código do cupom (V123): abre a troca. Código de vale (VT000123): usa no pagamento.
    if (/^VT\d+$/i.test(texto)) {
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
    const i = Number(btn.closest('tr').dataset.i);
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
      <input id="q-cli" placeholder="Nome, CPF ou telefone" autofocus>
      <div id="lista-cli" class="lista-escolha"></div>
      <div class="acoes">
        ${carrinho.cliente ? '<button class="btn btn-perigo-claro" id="tirar-cli">Remover cliente da venda</button>' : ''}
        <button class="btn" id="novo-cli">+ Cadastrar cliente</button>
      </div>`, { largura: '560px' });
    const lista = corpo.querySelector('#lista-cli');
    let encontrados = [];
    const buscar = async (q) => {
      encontrados = await api(`/api/clientes?q=${encodeURIComponent(q)}`);
      lista.innerHTML = encontrados.map((c, i) => `
        <button class="item-escolha" data-i="${i}"><b>${esc(c.nome)}</b>
          <small>${esc(U.cpf(c.cpf))} ${esc(c.telefone || '')}</small></button>`).join('') ||
        '<div class="vazio">Nenhum cliente encontrado.</div>';
    };
    const usar = (c) => {
      carrinho.cliente = { id: c.id, nome: c.nome, cpf: c.cpf };
      if (c.cpf && !carrinho.cpf_nota) carrinho.cpf_nota = U.cpf(c.cpf);
      salvar();
      fecharModal();
      if (!raiz) return;
      raiz.querySelector('#cpf').value = carrinho.cpf_nota;
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

    const corpo = abrirModal('Pagamento', `
      <div class="pag-total">Total a pagar <b>${brl(t.total)}</b></div>
      <div class="formas formas-7">
        ${formas.map(([k, v], i) =>
    `<button class="forma ${k === forma ? 'sel' : ''}" data-forma="${k}"><kbd>${i + 1}</kbd>${v}</button>`).join('')}
      </div>
      <form id="f-pag" class="form-linha">
        <label>Valor<input id="pag-valor" inputmode="decimal" autofocus></label>
        <label id="lbl-parc" hidden>Parcelas<select id="pag-parc"></select></label>
        <label id="lbl-venc" hidden>1º vencimento<input type="date" id="pag-venc" value="${vencPadrao}"></label>
        <label id="lbl-vale" hidden>Código do vale<input id="pag-vale" autocomplete="off" placeholder="Bipe o vale-troca"></label>
        <button class="btn">Adicionar (Enter)</button>
      </form>
      <div class="valores-rapidos" id="rapidos"></div>
      <div id="info-vale" class="info-cred" hidden></div>
      <div id="info-cred" class="info-cred" hidden></div>
      <div id="lista-pag" class="lista-pag"></div>
      <div class="pag-resumo" id="pag-resumo"></div>
      <div class="acoes">
        <button class="btn" data-fechar>Voltar (Esc)</button>
        <button class="btn btn-primario btn-grande" id="concluir" disabled>Concluir venda</button>
      </div>`, { largura: '780px' });

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

    const infoCrediario = () => {
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
      preencherParcelas();
      infoCrediario();
      infoVale();
      desenharRapidos();
      if (f === 'vale' && !valeAtual) { valeEl.focus(); return; }
      valorEl.focus();
      valorEl.select();
    };

    const atualizar = () => {
      corpo.querySelector('#lista-pag').innerHTML = pagamentos.map((p, i) => `
        <div class="linha"><span>${U.FORMAS[p.forma]}${p.codigo ? ` ${esc(p.codigo)}` : ''}${p.parcelas > 1 ? ` (${p.parcelas}x)` : ''}${
  p.forma === 'crediario' ? ` · 1º venc. ${p.primeiro_vencimento.split('-').reverse().join('/')}` : ''}</span>
        <span>${brl(p.valor)} <button class="mini perigo" data-rm="${i}">×</button></span></div>`).join('');
      const r = restante();
      corpo.querySelector('#pag-resumo').innerHTML = r > 0
        ? `<div class="linha"><span>Falta</span><b class="txt-perigo">${brl(r)}</b></div>`
        : `<div class="linha troco"><span>Troco</span><b>${brl(-r)}</b></div>`;
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
    valorEl.addEventListener('keydown', (e) => {
      const n = Number(e.key);
      if (!e.ctrlKey && n >= 1 && n <= formas.length && valorEl.selectionStart === 0 && valorEl.selectionEnd === valorEl.value.length) {
        // Com o valor todo selecionado, as teclas 1–6 escolhem a forma de pagamento.
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
      const igual = forma !== 'crediario' && pagamentos.find((p) => p.forma === forma && p.parcelas === parcelas && p.codigo === codigo);
      if (igual) igual.valor += v;
      else {
        pagamentos.push({
          forma, valor: v, parcelas, codigo,
          primeiro_vencimento: forma === 'crediario' ? vencEl.value : undefined,
        });
      }
      if (forma === 'vale' && restante() > 0) escolherForma('dinheiro'); // completa o resto em outra forma
      atualizar();
      if (restante() <= 0) concluir();
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
    const corpo = abrirModal('👜 Condicional (malinha)', `
      <p><b>${esc(carrinho.cliente.nome)}</b> vai levar <b>${pecas.reduce((a, it) => a + it.quantidade, 0)} peça(s)</b> para provar (${brl(total)}).
        As peças saem do estoque até ela devolver ou comprar.</p>
      <form class="form">
        <label>Devolver até<input type="date" name="prazo" value="${prazo}" required></label>
        <label>Observação<input name="obs" placeholder="Ex.: vai mostrar para a irmã"></label>
        <div class="acoes"><button type="button" class="btn" data-fechar>Voltar</button>
          <button class="btn btn-primario btn-grande">👜 Registrar e imprimir (2 vias)</button></div>
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

  /** Coloca peças no carrinho (ex.: o que a cliente ficou da condicional) e abre o caixa. */
  function carregarVenda({ itens, cliente }) {
    const c = novoCarrinho();
    c.itens = itens.map(({ produto, quantidade }) => ({ produto, quantidade, desconto: 0 }));
    if (cliente) {
      c.cliente = { id: cliente.id, nome: cliente.nome, cpf: cliente.cpf };
      if (cliente.cpf) c.cpf_nota = U.cpf(cliente.cpf);
    }
    local.gravar(CHAVE, c);
    if (location.hash === '#/pdv' && raiz) abrir(raiz);
    else location.hash = '#/pdv';
  }

  async function vendaConcluida(venda) {
    const cfg = await U.config();
    U.som('sucesso');
    if (cfg.impressao_automatica === '1') Impressao.cupom(venda);
    const cred = venda.crediario || [];
    const corpo = abrirModal(`Venda nº ${venda.id} concluída`, `
      <div class="concluida ${venda.troco ? 'com-troco' : ''}">
        <div class="sucesso-ico">✓</div>
        ${venda.troco
    ? `<div class="concluida-rotulo">TROCO</div><div class="concluida-valor">${brl(venda.troco)}</div>
           <div class="concluida-det">Total ${brl(venda.total)} · recebido ${brl(venda.total + venda.troco)}</div>`
    : `<div class="concluida-rotulo">TOTAL DA VENDA</div><div class="concluida-valor">${brl(venda.total)}</div>
           <div class="concluida-det">${venda.pagamentos.map((p) => U.FORMAS[p.forma] + (p.parcelas > 1 ? ` ${p.parcelas}x` : '')).join(' + ')}</div>`}
      </div>
      ${cred.length ? `<div class="info-cred">Crediário: ${cred.length}x — ${cred.map((p) =>
    `${p.vencimento.split('-').reverse().slice(0, 2).join('/')} ${brl(p.valor)}`).join(' · ')}<br>
          <small>Peça para o cliente assinar a via da loja.</small></div>` : ''}
      <div class="acoes">
        <button class="btn" id="imp">🧾 Imprimir cupom</button>
        <button class="btn" id="troca">🎁 Cupom de troca</button>
        <button class="btn btn-primario btn-grande" data-fechar autofocus>Nova venda (Enter)</button>
      </div>`, { largura: '560px', aoFechar: () => raiz && abrir(raiz) });
    corpo.querySelector('#imp').onclick = () => Impressao.cupom(venda, { gaveta: false });
    corpo.querySelector('#troca').onclick = () => Impressao.cupomTroca(venda);
  }

  function tecla(ev) {
    if (!raiz || !caixa) return;
    const mapa = {
      F2: () => raiz.querySelector('#busca').focus(),
      F4: () => !U.modalAberto() && finalizar(),
      F6: () => !U.modalAberto() && escolherCliente(),
      F7: () => { const d = raiz.querySelector('#desconto'); d.focus(); d.select(); },
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
    abrir, tecla, carregarVenda,
    recarregar: () => raiz && abrir(raiz),
    sair: () => { raiz = null; pararRelogio(); },
  };
})();
