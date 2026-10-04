/* Tela de venda (frente de caixa). */
Telas.pdv = (() => {
  const { esc, brl, num, api, aviso, erro, abrirModal, fecharModal, local } = U;
  const CHAVE = 'pdv_carrinho';
  let raiz;
  let carrinho;
  let caixa = null;
  let sugestoes = [];
  let selecionada = -1;

  const novoCarrinho = () => ({ itens: [], desconto: '', cliente: null, cpf_nota: '', vendedor: local.ler('pdv_vendedor', '') });
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
    if (!caixa) return telaCaixaFechado();

    raiz.innerHTML = `
      <div class="pdv">
        <section class="pdv-esq">
          <div class="pdv-busca">
            <input id="busca" autocomplete="off" placeholder="Leia o código de barras ou digite o nome do produto  (F2)">
            <div id="sugestoes" class="sugestoes" hidden></div>
          </div>
          <div class="pdv-ultimo" id="ultimo"></div>
          <div class="tabela-rolagem">
            <table class="tabela itens">
              <thead><tr><th>#</th><th>Produto</th><th class="c">Qtd</th><th class="r">Unit.</th>
                <th class="r">Desc.</th><th class="r">Total</th><th></th></tr></thead>
              <tbody id="itens"></tbody>
            </table>
          </div>
        </section>
        <aside class="pdv-dir">
          <div class="cartao">
            <div class="campo-linha">
              <button class="btn btn-claro largo" id="btn-cliente">👤 Cliente (F6)</button>
            </div>
            <div id="cliente-info" class="cliente-info"></div>
            <label>CPF/CNPJ no cupom<input id="cpf" inputmode="numeric" value="${esc(carrinho.cpf_nota)}"></label>
            <label>Vendedor(a)<input id="vendedor" value="${esc(carrinho.vendedor)}"></label>
            <label>Desconto na venda (F7) <small>ex.: 10% ou 15,00</small>
              <input id="desconto" value="${esc(carrinho.desconto)}"></label>
          </div>
          <div class="cartao totais">
            <div class="linha"><span>Peças</span><span id="t-pecas"></span></div>
            <div class="linha"><span>Subtotal</span><span id="t-sub"></span></div>
            <div class="linha"><span>Descontos</span><span id="t-desc"></span></div>
            <div class="linha total"><span>Total</span><span id="t-total"></span></div>
          </div>
          <button class="btn btn-primario btn-grande" id="btn-finalizar">Finalizar venda (F4)</button>
          <button class="btn btn-perigo-claro" id="btn-limpar">Cancelar venda (F9)</button>
          <div class="atalhos">F2 buscar · F4 finalizar · F6 cliente · F7 desconto · F8 remove último · <b>3*</b>código = 3 unidades</div>
        </aside>
      </div>`;

    const busca = raiz.querySelector('#busca');
    busca.addEventListener('keydown', teclaBusca);
    busca.addEventListener('input', U.debounce(() => sugerir(busca.value), 200));
    raiz.querySelector('#cpf').addEventListener('input', (e) => { carrinho.cpf_nota = e.target.value; salvar(); });
    raiz.querySelector('#vendedor').addEventListener('input', (e) => {
      carrinho.vendedor = e.target.value;
      local.gravar('pdv_vendedor', e.target.value);
      salvar();
    });
    raiz.querySelector('#desconto').addEventListener('input', (e) => { carrinho.desconto = e.target.value; salvar(); desenharTotais(); });
    raiz.querySelector('#btn-cliente').onclick = escolherCliente;
    raiz.querySelector('#btn-finalizar').onclick = finalizar;
    raiz.querySelector('#btn-limpar').onclick = limpar;
    raiz.querySelector('#itens').addEventListener('click', cliqueItem);
    desenhar();
    busca.focus();
  }

  function telaCaixaFechado() {
    raiz.innerHTML = `
      <div class="centro">
        <div class="cartao cartao-estreito">
          <h2>Caixa fechado</h2>
          <p>Para começar a vender, abra o caixa informando o troco inicial da gaveta.</p>
          <form id="f-abrir" class="form">
            <label>Operador(a)<input name="operador" value="${esc(local.ler('pdv_vendedor', ''))}" autofocus></label>
            <label>Troco inicial (R$)<input name="valor" inputmode="decimal" placeholder="0,00"></label>
            <button class="btn btn-primario btn-grande">Abrir caixa</button>
          </form>
        </div>
      </div>`;
    raiz.querySelector('#f-abrir').onsubmit = async (ev) => {
      ev.preventDefault();
      const valor = U.paraCentavos(ev.target.valor.value);
      if (Number.isNaN(valor)) return aviso('Valor inválido.', 'erro');
      try {
        await api('/api/caixa/abrir', { metodo: 'POST', corpo: { operador: ev.target.operador.value, valor_abertura: valor } });
        aviso('Caixa aberto. Boas vendas!');
        abrir(raiz);
        atualizarStatusCaixa();
      } catch (e) { erro(e); }
    };
    raiz.querySelector('input').focus();
  }

  function desenhar() {
    const tbody = raiz.querySelector('#itens');
    tbody.innerHTML = carrinho.itens.length
      ? carrinho.itens.map((it, i) => {
        const p = it.produto;
        const det = [p.tamanho && `Tam ${p.tamanho}`, p.cor].filter(Boolean).join(' · ');
        return `<tr data-i="${i}">
          <td>${i + 1}</td>
          <td><b>${esc(p.nome)}</b><br><small>${esc(det)} ${det ? '·' : ''} ${esc(p.codigo)}</small></td>
          <td class="c qtd"><button class="mini" data-acao="menos">−</button><span>${it.quantidade}</span><button class="mini" data-acao="mais">+</button></td>
          <td class="r">${num(p.preco_venda)}</td>
          <td class="r"><button class="link" data-acao="desc">${it.desconto ? '-' + num(it.desconto) : 'dar'}</button></td>
          <td class="r"><b>${num(totalItem(it))}</b></td>
          <td><button class="mini perigo" data-acao="remover" title="Remover">×</button></td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="7" class="vazio">Nenhum item. Leia o código de barras da etiqueta para começar.</td></tr>';

    const ult = carrinho.itens[carrinho.itens.length - 1];
    raiz.querySelector('#ultimo').innerHTML = ult
      ? `<span>${esc(ult.produto.nome)} ${ult.produto.tamanho ? '· ' + esc(ult.produto.tamanho) : ''}</span>
         <b>${ult.quantidade} × ${brl(ult.produto.preco_venda)}</b>`
      : `<span>Clara Styllus</span><b>Caixa livre</b>`;

    const info = raiz.querySelector('#cliente-info');
    info.innerHTML = carrinho.cliente
      ? `<b>${esc(carrinho.cliente.nome)}</b> ${carrinho.cliente.cpf ? '· ' + esc(U.cpf(carrinho.cliente.cpf)) : ''}
         <button class="link" id="tirar-cliente">remover</button>`
      : '<small>Venda sem cliente identificado</small>';
    const tirar = info.querySelector('#tirar-cliente');
    if (tirar) tirar.onclick = () => { carrinho.cliente = null; salvar(); desenhar(); };
    desenharTotais();
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
  function adicionar(produto, quantidade = 1) {
    const existente = carrinho.itens.find((it) => it.produto.id === produto.id && !it.desconto);
    const jaNoCarrinho = carrinho.itens.filter((it) => it.produto.id === produto.id)
      .reduce((a, it) => a + it.quantidade, 0);
    if (existente) {
      existente.quantidade += quantidade;
      // Move para o fim, para aparecer como "último item".
      carrinho.itens.splice(carrinho.itens.indexOf(existente), 1);
      carrinho.itens.push(existente);
    } else {
      carrinho.itens.push({ produto, quantidade, desconto: 0 });
    }
    if (jaNoCarrinho + quantidade > produto.estoque) {
      aviso(`Atenção: estoque de "${produto.nome}" é ${produto.estoque}.`, 'alerta');
    }
    salvar();
    desenhar();
    const tabela = raiz.querySelector('.tabela-rolagem');
    tabela.scrollTop = tabela.scrollHeight;
  }

  async function lerEntrada(valor) {
    let texto = valor.trim();
    if (!texto) return;
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
    sugestoes = lista;
    selecionada = lista.length ? 0 : -1;
    const box = raiz.querySelector('#sugestoes');
    if (!lista.length) return esconderSugestoes();
    box.hidden = false;
    box.innerHTML = lista.map((p, i) => `
      <div class="sugestao ${i === selecionada ? 'sel' : ''}" data-i="${i}">
        <span><b>${esc(p.nome)}</b> ${esc([p.tamanho, p.cor].filter(Boolean).join(' · '))}
          <small>${esc(p.codigo)}</small></span>
        <span>${brl(p.preco_venda)} <small class="${p.estoque <= 0 ? 'txt-perigo' : ''}">est. ${p.estoque}</small></span>
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
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const valor = ev.target.value;
    // Se o texto é nome (não código) e há sugestão marcada, usa ela.
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
    desenhar();
    raiz.querySelector('#busca').focus();
  }

  async function limpar() {
    if (!carrinho.itens.length) return;
    if (!(await U.confirmar('Cancelar venda', 'Remover todos os itens desta venda?', { ok: 'Sim, cancelar', perigo: true }))) return;
    carrinho = novoCarrinho();
    salvar();
    abrir(raiz);
  }

  // ------------------------------------------------------------ cliente
  function escolherCliente() {
    const corpo = abrirModal('Identificar cliente', `
      <input id="q-cli" placeholder="Nome, CPF ou telefone" autofocus>
      <div id="lista-cli" class="lista-escolha"></div>
      <div class="acoes"><button class="btn" id="novo-cli">+ Cadastrar nova cliente</button></div>`, { largura: '560px' });
    const lista = corpo.querySelector('#lista-cli');
    let encontrados = [];
    const buscar = async (q) => {
      encontrados = await api(`/api/clientes?q=${encodeURIComponent(q)}`);
      lista.innerHTML = encontrados.map((c, i) => `
        <button class="item-escolha" data-i="${i}"><b>${esc(c.nome)}</b>
          <small>${esc(U.cpf(c.cpf))} ${esc(c.telefone || '')}</small></button>`).join('') ||
        '<div class="vazio">Nenhuma cliente encontrada.</div>';
    };
    const usar = (c) => {
      carrinho.cliente = { id: c.id, nome: c.nome, cpf: c.cpf };
      if (c.cpf && !carrinho.cpf_nota) carrinho.cpf_nota = U.cpf(c.cpf);
      salvar();
      fecharModal();
      abrir(raiz);
    };
    corpo.querySelector('#q-cli').addEventListener('input', U.debounce((e) => buscar(e.target.value).catch(erro)));
    corpo.querySelector('#q-cli').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && encontrados.length) usar(encontrados[0]);
    });
    lista.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (b) usar(encontrados[Number(b.dataset.i)]);
    };
    corpo.querySelector('#novo-cli').onclick = () => Telas.clientes.formulario(null, usar);
    buscar('').catch(erro);
  }

  // ------------------------------------------------------------ finalizar
  function finalizar() {
    if (!carrinho.itens.length) return aviso('Adicione itens antes de finalizar.', 'alerta');
    const t = totais();
    if (Number.isNaN(lerDesconto(carrinho.desconto, t.subtotal))) return aviso('Desconto da venda inválido.', 'erro');
    const pagamentos = [];
    let forma = 'dinheiro';

    const corpo = abrirModal('Pagamento', `
      <div class="pag-total">Total a pagar <b>${brl(t.total)}</b></div>
      <div class="formas">
        ${Object.entries(U.FORMAS).map(([k, v], i) =>
    `<button class="forma ${k === forma ? 'sel' : ''}" data-forma="${k}"><kbd>${i + 1}</kbd>${v}</button>`).join('')}
      </div>
      <form id="f-pag" class="form-linha">
        <label>Valor recebido<input id="pag-valor" inputmode="decimal" autofocus></label>
        <label id="lbl-parc" hidden>Parcelas<select id="pag-parc">${
  Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}</select></label>
        <button class="btn">Adicionar (Enter)</button>
      </form>
      <div id="lista-pag" class="lista-pag"></div>
      <div class="pag-resumo" id="pag-resumo"></div>
      <div class="acoes">
        <button class="btn" data-fechar>Voltar (Esc)</button>
        <button class="btn btn-primario btn-grande" id="concluir" disabled>Concluir venda</button>
      </div>`, { largura: '620px' });

    const valorEl = corpo.querySelector('#pag-valor');
    const pago = () => pagamentos.reduce((a, p) => a + p.valor, 0);
    const restante = () => t.total - pago();

    const escolherForma = (f) => {
      forma = f;
      corpo.querySelectorAll('.forma').forEach((b) => b.classList.toggle('sel', b.dataset.forma === f));
      corpo.querySelector('#lbl-parc').hidden = f !== 'credito';
      valorEl.focus();
      valorEl.select();
    };

    const atualizar = () => {
      corpo.querySelector('#lista-pag').innerHTML = pagamentos.map((p, i) => `
        <div class="linha"><span>${U.FORMAS[p.forma]}${p.parcelas > 1 ? ` (${p.parcelas}x)` : ''}</span>
        <span>${brl(p.valor)} <button class="mini perigo" data-rm="${i}">×</button></span></div>`).join('');
      const r = restante();
      corpo.querySelector('#pag-resumo').innerHTML = r > 0
        ? `<div class="linha"><span>Falta</span><b class="txt-perigo">${brl(r)}</b></div>`
        : `<div class="linha troco"><span>Troco</span><b>${brl(-r)}</b></div>`;
      corpo.querySelector('#concluir').disabled = r > 0;
      valorEl.value = r > 0 ? num(r) : '';
      valorEl.select();
    };

    corpo.querySelector('.formas').onclick = (e) => {
      const b = e.target.closest('[data-forma]');
      if (b) escolherForma(b.dataset.forma);
    };
    corpo.querySelector('#lista-pag').onclick = (e) => {
      const b = e.target.closest('[data-rm]');
      if (b) { pagamentos.splice(Number(b.dataset.rm), 1); atualizar(); valorEl.focus(); }
    };
    valorEl.addEventListener('keydown', (e) => {
      const n = Number(e.key);
      if (!e.ctrlKey && n >= 1 && n <= 5 && valorEl.selectionStart === 0 && valorEl.selectionEnd === valorEl.value.length) {
        // Com o valor todo selecionado, as teclas 1–5 escolhem a forma de pagamento.
        e.preventDefault();
        escolherForma(Object.keys(U.FORMAS)[n - 1]);
      }
    });
    corpo.querySelector('#f-pag').onsubmit = (e) => {
      e.preventDefault();
      if (!valorEl.value.trim() && restante() <= 0) return concluir();
      const v = U.paraCentavos(valorEl.value);
      if (!v || Number.isNaN(v) || v < 0) return aviso('Valor inválido.', 'erro');
      if (forma !== 'dinheiro' && v > restante()) return aviso('Só pagamento em dinheiro pode ter troco.', 'erro');
      const parcelas = forma === 'credito' ? Number(corpo.querySelector('#pag-parc').value) : 1;
      const igual = pagamentos.find((p) => p.forma === forma && p.parcelas === parcelas);
      if (igual) igual.valor += v;
      else pagamentos.push({ forma, valor: v, parcelas });
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
            itens: carrinho.itens.map((it) => ({ produto_id: it.produto.id, quantidade: it.quantidade, desconto: it.desconto || 0 })),
            desconto: t.descontoGeral,
            pagamentos,
            cliente_id: carrinho.cliente ? carrinho.cliente.id : null,
            cpf_nota: carrinho.cpf_nota,
            vendedor: carrinho.vendedor,
          },
        });
        carrinho = novoCarrinho();
        salvar();
        fecharModal();
        vendaConcluida(venda);
      } catch (e) {
        enviando = false;
        erro(e);
      }
    };
    corpo.querySelector('#concluir').onclick = concluir;
    atualizar();
  }

  async function vendaConcluida(venda) {
    const cfg = await U.config();
    if (cfg.impressao_automatica === '1') Impressao.cupom(venda);
    const corpo = abrirModal(`Venda nº ${venda.id} concluída`, `
      <div class="sucesso">
        <div>Total <b>${brl(venda.total)}</b></div>
        ${venda.troco ? `<div class="troco-grande">Troco: ${brl(venda.troco)}</div>` : ''}
      </div>
      <div class="acoes">
        <button class="btn" id="imp">🧾 Imprimir cupom</button>
        <button class="btn" id="troca">🎁 Cupom de troca</button>
        <button class="btn btn-primario" data-fechar autofocus>Nova venda (Enter)</button>
      </div>`, { largura: '520px', aoFechar: () => raiz && abrir(raiz) });
    corpo.querySelector('#imp').onclick = () => Impressao.cupom(venda);
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

  return { abrir, tecla, sair: () => { raiz = null; } };
})();
