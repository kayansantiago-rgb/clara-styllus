/* Cadastro de produtos, grade (tamanho × cor) e estoque. */
Telas.produtos = (() => {
  const { esc, brl, num, api, aviso, erro, abrirModal, fecharModal } = U;
  let raiz;
  let lista = [];

  let modo = (() => { try { return localStorage.getItem('produtos_modo') || 'lista'; } catch { return 'lista'; } })();
  let categoria = '';
  let filtro = ''; // '' | 'baixo' | 'inativos'

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Produtos</h1><p class="subtitulo" id="pr-resumo">Cadastro, estoque, preços e etiquetas.</p></div>
        <div class="ferramentas">
          <button class="btn" id="catalogo" title="Imagens das peças da lista para postar no Instagram e mandar no WhatsApp">${Icone('imagem')} Catálogo</button>
          <button class="btn so-admin" id="entrada" title="Somar estoque bipando as peças que chegaram">${Icone('codigo')} Entrada por bipagem</button>
          <button class="btn so-admin" id="liquidacao" title="Aplicar ou encerrar liquidação nos produtos da lista">${Icone('fogo')} Liquidação</button>
          <button class="btn btn-primario so-admin" id="novo">${Icone('mais')} Novo produto</button>
        </div>
      </div>
      <div class="pr-barra">
        <div class="busca-ico pr-busca">${Icone('busca')}<input id="q" type="search" placeholder="Buscar por nome, código, referência, cor…" autofocus autocomplete="off"></div>
        <div class="chips-filtro" id="filtros">
          <button class="chip-filtro ${filtro === '' ? 'sel' : ''}" data-f="">Ativos</button>
          <button class="chip-filtro ${filtro === 'baixo' ? 'sel' : ''}" data-f="baixo">${Icone('alerta')} Estoque baixo</button>
          <button class="chip-filtro so-admin ${filtro === 'inativos' ? 'sel' : ''}" data-f="inativos">Com inativos</button>
        </div>
        <div class="segmentos" id="modo">
          <button class="segmento ${modo === 'lista' ? 'sel' : ''}" data-modo="lista" title="Lista">${Icone('prancheta')} Lista</button>
          <button class="segmento ${modo === 'vitrine' ? 'sel' : ''}" data-modo="vitrine" title="Vitrine com fotos">${Icone('imagem')} Vitrine</button>
        </div>
      </div>
      <div class="chips-filtro pr-categorias" id="categorias"></div>
      <div id="vazias-aviso"></div>
      <div id="lista"></div>`;
    const recarregar = U.debounce(carregar, 200);
    raiz.querySelector('#q').addEventListener('input', recarregar);
    raiz.querySelector('#filtros').onclick = (ev) => {
      const b = ev.target.closest('[data-f]');
      if (!b) return;
      filtro = b.dataset.f;
      raiz.querySelectorAll('#filtros .chip-filtro').forEach((x) => x.classList.toggle('sel', x === b));
      carregar();
    };
    raiz.querySelector('#modo').onclick = (ev) => {
      const b = ev.target.closest('[data-modo]');
      if (!b) return;
      modo = b.dataset.modo;
      try { localStorage.setItem('produtos_modo', modo); } catch { /* sem armazenamento */ }
      raiz.querySelectorAll('#modo .segmento').forEach((x) => x.classList.toggle('sel', x === b));
      desenhar();
    };
    raiz.querySelector('#categorias').onclick = (ev) => {
      const b = ev.target.closest('[data-cat]');
      if (!b) return;
      categoria = b.dataset.cat;
      desenhar();
    };
    raiz.querySelector('#novo').onclick = () => formulario(null);
    raiz.querySelector('#liquidacao').onclick = liquidacao;
    raiz.querySelector('#entrada').onclick = entradaBipagem;
    raiz.querySelector('#catalogo').onclick = () => Catalogo.abrir(lista);
    raiz.querySelector('#lista').onclick = acao;
    // Vindo de outra tela (ex.: Relatórios → peças paradas) com uma busca pronta.
    const pedida = (/[?&]q=([^&]*)/.exec(location.hash) || [])[1];
    if (pedida) raiz.querySelector('#q').value = decodeURIComponent(pedida);
    await carregar();
  }

  let todos = [];
  async function carregar() {
    if (!raiz) return;
    const q = raiz.querySelector('#q').value;
    const extra = filtro === 'baixo' ? '&estoque_baixo=1' : filtro === 'inativos' ? '&inativos=1' : '';
    try {
      todos = await api(`/api/produtos?q=${encodeURIComponent(q)}${extra}&limite=1000`);
    } catch (e) { return erro(e); }
    desenhar();
    avisoVazias();
  }

  /** Aviso de tamanhos/cores cadastrados com 0 que nunca existiram (aparecem como esgotados à toa). */
  async function avisoVazias() {
    const el = raiz && raiz.querySelector('#vazias-aviso');
    if (!el || !U.sessao.ehAdmin()) return;
    let vs = [];
    try { vs = await api('/api/produtos/vazias'); } catch { return; }
    if (!raiz || !raiz.contains(el)) return;
    el.innerHTML = vs.length ? `<div class="pr-vazias">${Icone('alerta')}
      <span><b>${vs.length} tamanho(s)/cor(es) aparecem como esgotados, mas nunca tiveram peça.</b>
        <small>Foram criados com quantidade 0 no cadastro em grade.</small></span>
      <button class="btn btn-peq" id="ver-vazias">Ver e apagar</button></div>` : '';
    const b = el.querySelector('#ver-vazias');
    if (b) b.onclick = () => limparVazias(vs);
  }

  /** Lista as variações vazias (todas ou de um modelo) para apagar de uma vez. */
  function limparVazias(vs, depois) {
    const grupos = new Map();
    for (const v of vs) {
      const k = `${v.nome}|${v.referencia || ''}`;
      if (!grupos.has(k)) grupos.set(k, { nome: v.nome, referencia: v.referencia, itens: [] });
      grupos.get(k).itens.push(v);
    }
    const corpo = abrirModal('Tamanhos e cores que nunca tiveram peça', `
      <p class="dica">Estas combinações foram criadas com quantidade 0 e nunca tiveram estoque, venda nem pedido na lista de espera.
        Apagar não mexe em nada do que já foi vendido. Se um dia chegar, é só usar <b>Adicionar tamanhos ou cores</b>.</p>
      <div class="vz-lista">${[...grupos.values()].map((g) => `
        <div class="vz-grupo"><b>${esc(g.nome)}${g.referencia ? ` <small>Ref ${esc(g.referencia)}</small>` : ''}</b>
          <div class="vz-itens">${g.itens.map((v) => `<label class="vz-item"><input type="checkbox" data-id="${v.id}" checked>
            ${esc([v.tamanho && `Tam ${v.tamanho}`, v.cor].filter(Boolean).join(' · ') || 'sem tamanho/cor')}</label>`).join('')}</div>
        </div>`).join('')}</div>
      <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button>
        <button type="button" class="btn btn-primario" id="vz-apagar">${Icone('lixeira')} Apagar marcados</button></div>`, { largura: '620px' });
    corpo.querySelector('#vz-apagar').onclick = U.umaVez(corpo.querySelector('#vz-apagar'), async () => {
      const ids = [...corpo.querySelectorAll('[data-id]:checked')].map((x) => Number(x.dataset.id));
      if (!ids.length) return aviso('Marque pelo menos um.', 'alerta');
      try {
        const r = await api('/api/produtos/vazias/apagar', { metodo: 'POST', corpo: { ids } });
        fecharModal();
        aviso(`${r.apagados} combinação(ões) apagada(s).`);
        if (depois) depois();
        if (raiz) carregar();
      } catch (e) { erro(e); }
    });
  }

  const situacao = (p) => (p.servico ? 'servico' : p.estoque <= 0 ? 'zero' : p.estoque <= p.estoque_minimo ? 'baixo' : 'ok');
  const pilula = (p) => {
    const st = situacao(p);
    if (st === 'servico') return '<span class="pr-estoque servico">serviço</span>';
    return `<span class="pr-estoque ${st}">${p.estoque} ${st === 'zero' ? '· esgotado' : st === 'baixo' ? '· repor' : 'em estoque'}</span>`;
  };
  const precoHtml = (p) => (p.preco_anterior > p.preco_venda
    ? `<s>${num(p.preco_anterior)}</s><b class="preco-por">${brl(p.preco_venda)}</b>` : `<b>${brl(p.preco_venda)}</b>`);
  const acoesHtml = (i) => `
    <button class="btn-ico" data-acao="grade" data-i="${i}" title="Ver grade de estoque (tamanho × cor)">${Icone('grade')}</button>
    <button class="btn-ico so-admin" data-acao="estoque" data-i="${i}" title="Entrada / ajuste de estoque">${Icone('caixa')}</button>
    <button class="btn-ico" data-acao="etiqueta" data-i="${i}" title="Mandar para impressão de etiquetas">${Icone('etiqueta')}</button>
    <button class="btn-ico" data-acao="avisar" data-i="${i}" title="Avisar clientes que podem gostar (WhatsApp)">${Icone('whatsapp')}</button>
    <button class="btn-ico so-admin" data-acao="editar" data-i="${i}" title="Editar">${Icone('lapis')}</button>`;

  function desenhar() {
    // Categorias que existem na busca atual (com contagem).
    const cats = new Map();
    for (const p of todos) { const c = p.categoria || 'Sem categoria'; cats.set(c, (cats.get(c) || 0) + 1); }
    if (categoria && !cats.has(categoria)) categoria = '';
    raiz.querySelector('#categorias').innerHTML = cats.size > 1
      ? `<button class="chip-filtro ${categoria ? '' : 'sel'}" data-cat="">Todas <small>${todos.length}</small></button>` +
        [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `<button class="chip-filtro ${categoria === c ? 'sel' : ''}" data-cat="${esc(c)}">${esc(c)} <small>${n}</small></button>`).join('')
      : '';
    lista = categoria ? todos.filter((p) => (p.categoria || 'Sem categoria') === categoria) : todos;
    const pecas = lista.reduce((a, p) => a + (p.servico ? 0 : Math.max(0, p.estoque)), 0);
    const valor = lista.reduce((a, p) => a + (p.servico ? 0 : Math.max(0, p.estoque) * p.preco_venda), 0);
    const baixos = lista.filter((p) => ['baixo', 'zero'].includes(situacao(p))).length;
    raiz.querySelector('#pr-resumo').innerHTML = `${lista.length} produto(s) · <b>${pecas}</b> peças em estoque · ${brl(valor)} em preço de venda${baixos ? ` · <span class="txt-perigo">${baixos} para repor</span>` : ''}`;
    const el = raiz.querySelector('#lista');
    if (!lista.length) {
      el.innerHTML = `<div class="vd-vazio">${Ilustracao.svg('cabide', 150)}<b>${todos.length ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado ainda'}</b><br><small>${todos.length ? 'Mude a busca ou os filtros.' : 'Clique em <b>Novo produto</b> para cadastrar a primeira peça.'}</small></div>`;
      return;
    }
    if (modo === 'vitrine') {
      el.className = 'pr-vitrine';
      el.innerHTML = lista.map((p, i) => `
        <div class="pr-card ${p.ativo ? '' : 'inativo'}">
          <div class="pr-card-foto">${U.miniatura(p, 'pr-foto-g')}${pilula(p)}</div>
          <div class="pr-card-txt"><b title="${esc(p.nome)}">${esc(p.nome)}</b>
            <small>${esc([p.tamanho && 'Tam ' + p.tamanho, p.cor].filter(Boolean).join(' · ') || '—')}</small></div>
          <div class="pr-card-preco">${precoHtml(p)}</div>
          <div class="pr-card-acoes">${acoesHtml(i)}</div>
        </div>`).join('');
      return;
    }
    el.className = 'pr-lista';
    el.innerHTML = `<div class="pr-cab"><span></span><span>Produto</span><span>Tamanho · cor</span><span class="r">Custo</span><span class="r">Venda</span><span class="r">Estoque</span><span></span></div>` +
      lista.map((p, i) => `
      <div class="pr-linha ${p.ativo ? '' : 'inativo'}">
        ${U.miniatura(p, 'pr-foto')}
        <div class="pr-nome"><b>${esc(p.nome)}</b><small>${esc([p.categoria, p.marca, p.referencia && 'Ref ' + p.referencia].filter(Boolean).join(' · '))} <code>${esc(p.codigo)}</code></small></div>
        <div class="p4-tags">${p.tamanho ? `<span class="p4-tag">${esc(p.tamanho)}</span>` : ''}${p.cor ? `<span class="p4-tag">${esc(p.cor)}</span>` : ''}</div>
        <div class="r pr-custo">${p.preco_custo ? num(p.preco_custo) : '—'}</div>
        <div class="r pr-preco">${precoHtml(p)}</div>
        <div class="r">${pilula(p)}</div>
        <div class="r nowrap pr-acoes">${acoesHtml(i)}</div>
      </div>`).join('');
  }

  function acao(ev) {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const p = lista[Number(b.dataset.i)];
    if (b.dataset.acao === 'editar') formulario(p);
    if (b.dataset.acao === 'estoque') estoque(p);
    if (b.dataset.acao === 'grade') grade(p);
    if (b.dataset.acao === 'avisar') {
      // O modelo inteiro (todos os tamanhos e cores com estoque), não só esta variação.
      const mesmo = todos.filter((x) => x.nome === p.nome && (x.referencia || '') === (p.referencia || '') && x.estoque > 0);
      Interessadas.abrir((mesmo.length ? mesmo : [p]).map((x) => x.id));
    }
    if (b.dataset.acao === 'etiqueta') {
      Telas.etiquetas.adicionar(p, Math.max(1, p.estoque));
      aviso(`${Math.max(1, p.estoque)} etiqueta(s) de "${p.nome}" na fila de impressão.`);
    }
  }

  /** Preço sugerido = custo × markup, arredondado para cima (,90 / ,99 / ,00). */
  function precoSugerido(custo, cfg) {
    const mk = Number(String(cfg.markup_padrao || '').replace(',', '.'));
    if (!(custo > 0 && mk > 0)) return null;
    let v = Math.round(custo * mk);
    const final = { 90: 90, 99: 99, '00': 0 }[cfg.arredondar_preco];
    if (final !== undefined) {
      let r = Math.floor(v / 100) * 100 + final;
      if (r < v) r += 100;
      v = r;
    }
    return v;
  }

  /**
   * Formulário de produto.
   * opcoes.base: produto existente para "adicionar tamanhos/cores" na mesma grade.
   * opcoes.codigo: código já bipado (vindo da entrada por bipagem) para um produto novo.
   */
  async function formulario(p, opcoes = {}) {
    const cfg = await U.config();
    const novo = !p;
    let existentes = new Set();
    let tamIniciais = [];
    let corIniciais = [];
    if (novo && opcoes.base) {
      const b = opcoes.base;
      p = { nome: b.nome, referencia: b.referencia, categoria: b.categoria, marca: b.marca,
        preco_custo: b.preco_custo, preco_venda: b.preco_venda, preco_anterior: b.preco_anterior, estoque_minimo: b.estoque_minimo };
      try {
        const g = await api(`/api/produtos/grade?nome=${encodeURIComponent(b.nome)}${b.referencia ? `&referencia=${encodeURIComponent(b.referencia)}` : ''}`);
        tamIniciais = g.tamanhos.filter((t) => t !== '—');
        corIniciais = g.cores.filter((c) => c !== '—');
        existentes = new Set(Object.keys(g.celulas).map((k) => {
          const [c, t] = k.split('|');
          return GradeEditor.chave(t === '—' ? '' : t, c === '—' ? '' : c);
        }));
      } catch (e) { erro(e); }
    }
    p = p || {};
    const semFoto = `<span class="foto-vazia">${Icone('imagem')}<small>sem foto</small></span>`;
    const moeda = (nome, valor, extra = '') =>
      `<div class="campo-moeda"><span>R$</span><input name="${nome}" inputmode="decimal" value="${valor ? num(valor) : ''}" ${extra}></div>`;
    const corpo = abrirModal(novo ? (opcoes.base ? `Adicionar tamanhos/cores — ${p.nome}` : 'Novo produto') : `Editar produto`, `
      <form class="fp" id="f-prod" autocomplete="off">
        <div class="fp-corpo">
          <aside class="fp-lateral">
            <div class="foto-previa" id="foto-previa">${U.fotoUrl(p) ? `<img src="${U.fotoUrl(p)}" alt="">` : semFoto}</div>
            <div class="fp-foto-acoes">
              <label class="btn btn-claro">${Icone('camera')} ${U.fotoUrl(p) ? 'Trocar foto' : 'Escolher foto'}<input type="file" accept="image/*" capture="environment" id="foto-arquivo" hidden></label>
              <button type="button" class="btn btn-claro" id="foto-celular" title="Tirar a foto com o celular (mesmo Wi-Fi da loja)">${Icone('telefone')} Pelo celular</button>
              <button type="button" class="btn btn-fantasma btn-perigo-claro" id="foto-remover" ${U.fotoUrl(p) ? '' : 'hidden'}>${Icone('lixeira')}</button>
            </div>
            <div class="fp-fundo" id="foto-fundo" ${U.fotoUrl(p) ? '' : 'hidden'}></div>
            <div class="fp-celular" id="foto-celular-painel" hidden></div>
            <small class="fp-ajuda">A foto aparece no caixa para conferir se bipou a peça certa.${novo ? ' Vale para todos os tamanhos e cores criados agora.' : ''}</small>
            ${novo ? '' : `<label class="check fp-ajuda"><input type="checkbox" id="foto-cor" checked> Usar a mesma foto em todos os tamanhos ${p.cor ? `da cor ${esc(p.cor)}` : 'deste produto'}</label>`}
            <div class="fp-margem" id="margem-box" hidden>
              <small>Margem de lucro</small>
              <b id="margem-pct"></b>
              <span id="margem"></span>
            </div>
          </aside>

          <div class="fp-principal">
            <section class="fp-secao">
              <h3>Informações da peça</h3>
              <label>Nome da peça *<input name="nome" class="campo-destaque" required value="${esc(p.nome)}" autofocus placeholder="Ex.: Vestido midi canelado"></label>
              <div class="fp-grid3">
                <label>Categoria<input name="categoria" value="${esc(p.categoria)}" placeholder="Vestido, blusa, calça…" list="lista-categorias"></label>
                <label>Marca / fornecedor<input name="marca" value="${esc(p.marca)}" placeholder="Opcional"></label>
                <label>Referência<input name="referencia" value="${esc(p.referencia)}" placeholder="Cód. do fornecedor"></label>
              </div>
            </section>

            <section class="fp-secao">
              <h3>Preço e estoque</h3>
              <div class="fp-grid3">
                <label>Preço de custo${moeda('preco_custo', p.preco_custo, 'placeholder="0,00"')}</label>
                <label>Preço de venda *${moeda('preco_venda', p.preco_venda, 'placeholder="0,00" class="campo-destaque"')}</label>
                <label>Estoque mínimo<input name="estoque_minimo" type="number" min="0" value="${p.estoque_minimo ?? 0}" title="Avisa quando o estoque chegar neste número"></label>
              </div>
              <span class="sugestao-preco" id="sugestao-preco" hidden></span>
              <label class="so-admin fp-liquidacao">Preço “De” — liquidação <small>deixe vazio se a peça não estiver em promoção · sai riscado na etiqueta</small>
                ${moeda('preco_anterior', p.preco_anterior, 'placeholder="Preço antigo"')}</label>
            </section>

            ${novo ? '' : `
            <section class="fp-secao">
              <h3>Variação</h3>
              <div class="fp-grid3">
                <label>Tamanho<input name="tamanho" value="${esc(p.tamanho)}"></label>
                <label>Cor<input name="cor" value="${esc(p.cor)}"></label>
                <label>Código de barras<input name="codigo" required value="${esc(p.codigo)}"></label>
              </div>
              <label class="interruptor"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}><span class="trilho"></span>
                <span class="txt"><b>Produto ativo</b><small>Desligado, a peça some do caixa e das buscas.</small></span></label>
            </section>`}
          </div>
        </div>

        ${novo ? `
        <section class="fp-secao fp-grade">
          <h3>Tamanhos, cores e quantidades</h3>
          <p class="dica">Cada combinação vira um produto com seu próprio código de barras. Peças sem etiqueta do fornecedor
            recebem um código da loja automaticamente.</p>
          <div id="grade-editor"></div>
          <label class="check"><input type="checkbox" id="criar-zeradas"> Cadastrar também as combinações com quantidade 0 (aparecem como esgotadas, para repor depois)</label>
        </section>` : ''}

        <section class="fp-opcoes">
          <label class="interruptor"><input type="checkbox" name="atalho" ${p.atalho ? 'checked' : ''}><span class="trilho"></span>
            <span class="txt"><b>Botão rápido no caixa</b><small>Para sacola, embrulho e itens vendidos toda hora.</small></span></label>
          <label class="interruptor"><input type="checkbox" name="servico" ${p.servico ? 'checked' : ''}><span class="trilho"></span>
            <span class="txt"><b>É um serviço</b><small>Não controla estoque (ajuste de barra…). Com preço 0, o valor é perguntado na hora.</small></span></label>
        </section>

        <datalist id="lista-categorias">${['Vestido', 'Blusa', 'Camisa', 'Calça', 'Saia', 'Short', 'Macacão', 'Conjunto', 'Body', 'Cropped', 'Jaqueta', 'Casaco', 'Moda praia', 'Lingerie', 'Acessório', 'Bolsa', 'Calçado']
    .map((c) => `<option value="${c}">`).join('')}</datalist>

        <div class="fp-rodape">
          ${novo ? '' : `<button type="button" class="btn btn-fantasma btn-perigo-claro fp-excluir" id="excluir-produto">${Icone('lixeira')} Excluir produto</button>`}
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button class="btn btn-primario">${Icone('check')} ${novo ? 'Cadastrar produto' : 'Salvar alterações'}</button>
        </div>
      </form>`, { largura: novo ? '980px' : '860px' });

    const form = corpo.querySelector('form');
    const editor = novo
      ? GradeEditor.criar(corpo.querySelector('#grade-editor'), { existentes, tamanhos: tamIniciais, cores: corIniciais, codigoPendente: opcoes.codigo })
      : null;
    const margem = () => {
      const c = U.paraCentavos(form.preco_custo.value);
      const v = U.paraCentavos(form.preco_venda.value);
      const temMargem = c > 0 && v > 0;
      corpo.querySelector('#margem-box').hidden = !temMargem;
      if (temMargem) {
        const pct = ((v - c) / v) * 100;
        corpo.querySelector('#margem-pct').textContent = `${pct.toFixed(0)}%`;
        corpo.querySelector('#margem-pct').className = pct < 30 ? 'txt-perigo' : '';
        corpo.querySelector('#margem').textContent = `Lucro de ${U.brl(v - c)} por peça · markup ${(v / c).toFixed(2).replace('.', ',')}x`;
      }
      // Sugestão pelo markup padrão da loja (Configurações → Regras de venda).
      const sug = precoSugerido(c, cfg);
      const el = corpo.querySelector('#sugestao-preco');
      el.hidden = !sug || sug === v;
      if (sug && sug !== v) {
        el.innerHTML = `Sugerido pelo markup ${esc(cfg.markup_padrao)}x: <b>${U.brl(sug)}</b> <button type="button" class="link">usar</button>`;
        el.querySelector('button').onclick = () => { form.preco_venda.value = num(sug); margem(); };
      }
    };
    const bExcluir = corpo.querySelector('#excluir-produto');
    if (bExcluir) {
      bExcluir.onclick = async () => {
        const desc = [p.nome, p.tamanho && `tam ${p.tamanho}`, p.cor].filter(Boolean).join(' · ');
        const ok = await U.confirmar('Excluir produto?',
          `${desc} sai do cadastro, da busca e do caixa. Se a peça já foi vendida, ela continua aparecendo nas vendas antigas. Não dá para desfazer.`,
          { ok: 'Excluir produto', perigo: true });
        if (!ok) return formulario(p, opcoes);
        try {
          const r = await api(`/api/produtos/${p.id}`, { metodo: 'DELETE' });
          aviso(`${r.nome} foi excluído.`);
          carregar();
        } catch (e) {
          erro(e);
          formulario(p, opcoes);
        }
      };
    }

    // Foto: undefined = não mexeu; null = remover; string = nova imagem.
    let foto;
    const previa = corpo.querySelector('#foto-previa');
    // Tirar o fundo: a peça recortada (para trocar o fundo sem recortar de novo) e a foto original.
    let recorte = null;
    let original = null;
    let estilo = TirarFundo.FUNDOS[cfg.foto_fundo] ? cfg.foto_fundo : 'rosa';
    const barraFundo = corpo.querySelector('#foto-fundo');
    const mostrar = (url) => {
      previa.innerHTML = `<img src="${url}" alt="">`;
      corpo.querySelector('#foto-remover').hidden = false;
    };
    const desenharBarra = () => {
      const temFoto = !!(foto || (foto === undefined && U.fotoUrl(p)));
      barraFundo.hidden = !temFoto;
      if (!temFoto) return;
      barraFundo.innerHTML = recorte
        ? `<small>Fundo:</small>${Object.entries(TirarFundo.FUNDOS).map(([k, f]) => `<button type="button" class="fp-fundo-cor ${foto !== original && k === estilo ? 'sel' : ''}"
            data-fundo="${k}" title="${f.nome}" style="background:linear-gradient(${f.cores[0]},${f.cores[1]})"></button>`).join('')}
          <button type="button" class="link ${foto === original ? 'sel' : ''}" data-fundo="original">original</button>`
        : `<button type="button" class="btn btn-claro btn-peq" data-fundo="tirar">${Icone('raio')} Tirar o fundo</button>`;
      barraFundo.insertAdjacentHTML('beforeend', `<label class="check fp-fundo-auto" title="Vale para as próximas fotos">
        <input type="checkbox" id="foto-auto" ${cfg.foto_sem_fundo === '0' ? '' : 'checked'}> tirar o fundo sozinho</label>`);
    };
    async function tirarFundo(fonte) {
      previa.insertAdjacentHTML('beforeend', `<span class="fp-processando"><span class="girando"></span>Tirando o fundo…</span>`);
      // Não salva no meio do recorte (a foto ainda vai mudar).
      const salvar = corpo.querySelector('.fp-rodape .btn-primario');
      salvar.disabled = true;
      try {
        recorte = await TirarFundo.recortar(fonte);
        foto = TirarFundo.montar(recorte, estilo);
        mostrar(foto);
      } catch (e) {
        aviso(e.message || 'Não deu para tirar o fundo desta foto.', 'alerta');
      } finally {
        previa.querySelector('.fp-processando')?.remove();
        salvar.disabled = false;
        desenharBarra();
      }
    }
    /** Foto nova (do computador ou do celular): mostra na hora e, se ligado, tira o fundo. */
    async function novaFoto(arquivo) {
      original = await U.reduzirImagem(arquivo, 900);
      recorte = null;
      foto = original;
      mostrar(foto);
      desenharBarra();
      if (cfg.foto_sem_fundo !== '0') await tirarFundo(arquivo);
    }
    barraFundo.onclick = async (ev) => {
      const b = ev.target.closest('[data-fundo]');
      if (!b) return;
      const k = b.dataset.fundo;
      if (k === 'tirar') {
        // Foto já salva: busca ela para recortar.
        try {
          const blob = foto ? await (await fetch(foto)).blob() : await (await fetch(U.fotoUrl(p))).blob();
          if (!original) original = foto || await U.reduzirImagem(blob, 900);
          await tirarFundo(blob);
        } catch (e) { erro(e); }
        return;
      }
      if (k === 'original') foto = original;
      else {
        estilo = k;
        foto = TirarFundo.montar(recorte, k);
        api('/api/config', { metodo: 'PUT', corpo: { foto_fundo: k } }).then(() => { cfg.foto_fundo = k; }).catch(() => {});
      }
      mostrar(foto);
      desenharBarra();
    };
    barraFundo.onchange = (ev) => {
      if (ev.target.id !== 'foto-auto') return;
      cfg.foto_sem_fundo = ev.target.checked ? '1' : '0';
      api('/api/config', { metodo: 'PUT', corpo: { foto_sem_fundo: cfg.foto_sem_fundo } }).catch(erro);
    };
    desenharBarra();
    corpo.querySelector('#foto-arquivo').onchange = async (ev) => {
      const arq = ev.target.files[0];
      ev.target.value = '';
      if (!arq) return;
      try { await novaFoto(arq); } catch (e) { erro(e); }
    };
    // Foto pelo celular: QR Code com o endereço do PDV na rede da loja; a foto chega sozinha.
    corpo.querySelector('#foto-celular').onclick = () => FotoCelular.abrir(corpo.querySelector('#foto-celular-painel'), {
      nome: [p.nome || corpo.querySelector('[name=nome]').value, p.tamanho, p.cor].filter(Boolean).join(' · '),
      aoReceber: (blob) => novaFoto(blob),
    });

    corpo.querySelector('#foto-remover').onclick = () => {
      foto = null;
      recorte = null;
      original = null;
      previa.innerHTML = semFoto;
      corpo.querySelector('#foto-remover').hidden = true;
      desenharBarra();
    };
    const salvarFoto = async (ids) => {
      if (foto === undefined) return;
      for (const id of ids) {
        await api(`/api/produtos/${id}/foto`, foto ? { metodo: 'PUT', corpo: { imagem: foto } } : { metodo: 'DELETE' });
      }
    };

    form.preco_custo.oninput = () => {
      // Produto novo sem preço digitado: já preenche com o sugerido.
      const sug = precoSugerido(U.paraCentavos(form.preco_custo.value), cfg);
      if (novo && sug && !form.preco_venda.dataset.mexeu) form.preco_venda.value = num(sug);
      margem();
    };
    form.preco_venda.addEventListener('input', () => { form.preco_venda.dataset.mexeu = '1'; });
    form.preco_venda.oninput = margem;
    margem();

    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const d = U.dadosForm(form);
      const base = {
        nome: d.nome, referencia: d.referencia, categoria: d.categoria, marca: d.marca,
        preco_custo: U.paraCentavos(d.preco_custo), preco_venda: U.paraCentavos(d.preco_venda),
        estoque_minimo: Number(d.estoque_minimo || 0),
      };
      if ('preco_anterior' in d) base.preco_anterior = U.paraCentavos(d.preco_anterior);
      base.atalho = !!d.atalho;
      base.servico = !!d.servico;
      if (base.servico && Number.isNaN(base.preco_venda)) base.preco_venda = 0;
      if ([base.preco_custo, base.preco_venda, base.preco_anterior ?? 0].some(Number.isNaN)) return aviso('Preço inválido.', 'erro');
      if (base.preco_anterior && base.preco_anterior <= base.preco_venda) {
        return aviso('O preço "De" precisa ser maior que o preço de venda (ou deixe vazio).', 'erro');
      }
      let chegaram = [];
      try {
        if (!novo) {
          await api(`/api/produtos/${p.id}`, {
            metodo: 'PUT',
            corpo: { ...base, tamanho: d.tamanho, cor: d.cor, codigo: d.codigo, ativo: !!d.ativo },
          });
          let ids = [p.id];
          if (foto !== undefined && corpo.querySelector('#foto-cor')?.checked) {
            const g = await api(`/api/produtos/grade?nome=${encodeURIComponent(base.nome)}${base.referencia ? `&referencia=${encodeURIComponent(base.referencia)}` : ''}`);
            const cor = d.cor || '—';
            ids = [...new Set([p.id, ...Object.entries(g.celulas).filter(([k]) => k.startsWith(cor + '|')).flatMap(([, c]) => c.ids)])];
          }
          await salvarFoto(ids);
          aviso('Produto atualizado.');
        } else {
          // Só cadastra o que tem peça; com uma combinação só (ou serviço) vale mesmo com 0.
          const todas = editor.variantes(true);
          const variantes = corpo.querySelector('#criar-zeradas').checked || base.servico || todas.length === 1 ? todas : editor.variantes(false);
          if (!variantes.length) {
            return aviso(opcoes.base && !todas.length ? 'Escolha pelo menos um tamanho ou cor novo.' : 'Coloque a quantidade de pelo menos uma combinação (ou marque "cadastrar com quantidade 0").', 'erro');
          }
          const criados = await api('/api/produtos/grade', { metodo: 'POST', corpo: { ...base, variantes } });
          await salvarFoto(criados.map((x) => x.id));
          aviso(criados.length > 1 ? `${criados.length} produtos criados.` : 'Produto criado.');
          const qtdEtiquetas = criados.reduce((a, x) => a + x.estoque, 0);
          if (qtdEtiquetas && await U.confirmar('Etiquetas', `Mandar ${qtdEtiquetas} etiqueta(s) para a fila de impressão?`, { ok: 'Sim' })) {
            criados.forEach((x) => x.estoque && Telas.etiquetas.adicionar(x, x.estoque));
          }
          chegaram = criados.filter((x) => x.estoque > 0).map((x) => x.id);
        }
        fecharModal();
        if (raiz) carregar();
        // Peça nova com estoque: mostra quem pode gostar (só abre se alguma cliente combinar).
        if (chegaram.length) Interessadas.abrir(chegaram, { auto: true });
      } catch (e) { erro(e); }
    };
  }

  /**
   * Entrada de mercadoria bipando: cada bipe soma +1 na peça. Código desconhecido pode virar
   * um produto novo na hora. Ao confirmar, o estoque é atualizado de uma vez.
   */
  function entradaBipagem() {
    const itens = new Map(); // produto_id -> { produto, quantidade }
    const corpo = abrirModal('Entrada por bipagem', `
      <p class="dica">Bipe a etiqueta de cada peça que chegou. Pode usar <b>3*código</b> para várias iguais.
        Nada muda no estoque até você clicar em <b>Confirmar entrada</b>.</p>
      <div class="pdv-busca"><span class="pdv-busca-ico">⌕</span><input id="ent-leitor" autocomplete="off" placeholder="Bipe as peças aqui" autofocus></div>
      <div id="ent-msg" class="ent-msg"></div>
      <div class="tabela-rolagem baixa"><table class="tabela"><thead><tr><th></th><th>Produto</th><th class="r">Estoque atual</th><th class="c">Chegou</th><th></th></tr></thead>
        <tbody id="ent-lista"></tbody></table></div>
      <div class="ent-total" id="ent-total"></div>
      <label class="check"><input type="checkbox" id="ent-etq"> Mandar etiquetas dessas peças para a fila de impressão</label>
      <label>Observação<input id="ent-motivo" placeholder="Ex.: NF 1234 do fornecedor"></label>
      <div class="acoes">
        <button class="btn" data-fechar>Cancelar</button>
        <button class="btn btn-primario btn-grande" id="ent-ok" disabled>Confirmar entrada</button>
      </div>`, { largura: '820px' });
    const leitor = corpo.querySelector('#ent-leitor');
    const msg = (html, tipo = '') => { corpo.querySelector('#ent-msg').innerHTML = html ? `<span class="ge-msg ${tipo}">${html}</span>` : ''; };
    const desenhar = () => {
      const lista = [...itens.values()].reverse();
      corpo.querySelector('#ent-lista').innerHTML = lista.map(({ produto: p, quantidade }) => `<tr>
        <td class="td-foto">${U.miniatura(p)}</td>
        <td><b>${esc(p.nome)}</b> ${esc([p.tamanho, p.cor].filter(Boolean).join(' · '))}<br><small>${esc(p.codigo)}</small></td>
        <td class="r">${p.estoque}</td>
        <td class="c"><input type="number" min="0" class="qtd-input" data-id="${p.id}" value="${quantidade}"></td>
        <td><button class="mini perigo" data-rm="${p.id}">×</button></td></tr>`).join('')
        || '<tr><td colspan="5" class="vazio">Nenhuma peça bipada ainda.</td></tr>';
      const pecas = lista.reduce((a, x) => a + x.quantidade, 0);
      corpo.querySelector('#ent-total').innerHTML = `<b>${pecas}</b> peça(s) de <b>${lista.length}</b> produto(s)`;
      corpo.querySelector('#ent-ok').disabled = !pecas;
    };
    corpo.querySelector('#ent-lista').addEventListener('input', (ev) => {
      const id = Number(ev.target.dataset.id);
      if (itens.has(id)) itens.get(id).quantidade = Math.max(0, Math.floor(Number(ev.target.value) || 0));
      const pecas = [...itens.values()].reduce((a, x) => a + x.quantidade, 0);
      corpo.querySelector('#ent-total').innerHTML = `<b>${pecas}</b> peça(s) de <b>${itens.size}</b> produto(s)`;
      corpo.querySelector('#ent-ok').disabled = !pecas;
    });
    corpo.querySelector('#ent-lista').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-rm]');
      if (b) { itens.delete(Number(b.dataset.rm)); desenhar(); leitor.focus(); }
    });
    leitor.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      let txt = leitor.value.trim();
      leitor.value = '';
      if (!txt) return;
      let n = 1;
      const m = txt.match(/^(\d{1,3})\s*[*xX]\s*(.+)$/);
      if (m) { n = Number(m[1]); txt = m[2].trim(); }
      try {
        const p = await api(`/api/produtos/codigo/${encodeURIComponent(txt)}`);
        const it = itens.get(p.id) || { produto: p, quantidade: 0 };
        it.quantidade += n;
        itens.delete(p.id);
        itens.set(p.id, it);
        U.som('ok');
        msg(`+${n} <b>${esc(p.nome)} ${esc([p.tamanho, p.cor].filter(Boolean).join(' '))}</b> — chegaram ${it.quantidade}`, 'ok');
        desenhar();
      } catch (e) {
        U.som('erro');
        if (e.status !== 404) return msg(esc(e.message), 'erro');
        msg(`Código <b>${esc(txt)}</b> não está cadastrado. <button type="button" class="btn btn-peq" id="ent-novo">Cadastrar produto novo com este código</button>`, 'erro');
        corpo.querySelector('#ent-novo').onclick = () => {
          if (itens.size && !confirm('As peças já bipadas nesta entrada serão descartadas. Continuar?')) return;
          formulario(null, { codigo: txt });
        };
      }
      leitor.focus();
    });
    corpo.querySelector('#ent-ok').onclick = async () => {
      const lista = [...itens.values()].filter((x) => x.quantidade > 0);
      try {
        const r = await api('/api/produtos/entrada-lote', {
          metodo: 'POST',
          corpo: { itens: lista.map((x) => ({ produto_id: x.produto.id, quantidade: x.quantidade })), motivo: corpo.querySelector('#ent-motivo').value },
        });
        const pecas = lista.reduce((a, x) => a + x.quantidade, 0);
        if (corpo.querySelector('#ent-etq').checked) lista.forEach((x) => Telas.etiquetas.adicionar(x.produto, x.quantidade));
        fecharModal();
        aviso(`Entrada lançada: ${pecas} peça(s) em ${r.length} produto(s).`);
        if (raiz) carregar();
        Interessadas.abrir(r.map((x) => x.id), { auto: true });
      } catch (e) { erro(e); }
    };
    desenhar();
  }

  /** Liquidação em lote nos produtos que estão na lista (use a busca para filtrar antes). */
  async function liquidacao() {
    const cfg = await U.config();
    const alvo = lista.filter((p) => p.ativo);
    if (!alvo.length) return aviso('Nenhum produto na lista. Use a busca para filtrar (ex.: "vestido").', 'alerta');
    const emLiq = alvo.filter((p) => p.preco_anterior > p.preco_venda);
    const q = raiz.querySelector('#q').value.trim();
    const corpo = abrirModal('Liquidação', `
      <p>Vale para os <b>${alvo.length} produto(s)</b> da lista${q ? ` (busca: "<b>${esc(q)}</b>")` : ' (todos)'}.
        Use a busca para escolher uma categoria, coleção ou referência antes.</p>
      <form class="form grade-form" id="f-liq">
        <label>Desconto (%)<input name="percentual" inputmode="decimal" required autofocus placeholder="ex.: 30"></label>
        <label>Arredondar o preço para
          <select name="arredondar">
            ${[['90', 'terminar em ,90'], ['99', 'terminar em ,99'], ['00', 'terminar em ,00'], ['', 'não arredondar']].map(([v, t]) =>
    `<option value="${v}" ${cfg.arredondar_preco === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select></label>
        <div class="col2 liq-previa" id="liq-previa"></div>
        <label class="check col2"><input type="checkbox" name="etiquetas" checked> Mandar as etiquetas novas (com "De/Por") para a fila de impressão</label>
        <div class="acoes col2">
          ${emLiq.length ? `<button type="button" class="btn btn-perigo-claro" id="encerrar">Encerrar liquidação (${emLiq.length})</button>` : ''}
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button class="btn btn-primario">Aplicar liquidação</button>
        </div>
      </form>`, { largura: '620px' });
    const form = corpo.querySelector('form');
    const previa = () => {
      const pct = Number(String(form.percentual.value).replace(',', '.'));
      const ex = alvo[0];
      const base = ex.preco_anterior > ex.preco_venda ? ex.preco_anterior : ex.preco_venda;
      corpo.querySelector('#liq-previa').innerHTML = pct > 0 && pct < 100
        ? `Exemplo: <b>${esc(ex.nome)}</b> — de <s>${U.brl(base)}</s> por <b>~${U.brl(Math.round(base * (1 - pct / 100)))}</b> (antes de arredondar)` : '';
    };
    form.percentual.oninput = previa;
    const terminar = async (resultado, msg) => {
      fecharModal();
      aviso(msg);
      if (form.etiquetas.checked) {
        resultado.forEach((p) => p.estoque > 0 && Telas.etiquetas.adicionar(p, p.estoque));
        aviso(`Etiquetas na fila: ${resultado.reduce((a, p) => a + Math.max(0, p.estoque), 0)}. Imprima em Etiquetas.`);
      }
      if (raiz) carregar();
    };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        const r = await api('/api/produtos/liquidacao', {
          metodo: 'POST', corpo: { ids: alvo.map((p) => p.id), percentual: form.percentual.value, arredondar: form.arredondar.value },
        });
        terminar(r, `Liquidação aplicada em ${r.length} produto(s).`);
      } catch (e) { erro(e); }
    };
    const enc = corpo.querySelector('#encerrar');
    if (enc) {
      enc.onclick = async () => {
        try {
          const r = await api('/api/produtos/liquidacao/encerrar', { metodo: 'POST', corpo: { ids: emLiq.map((p) => p.id) } });
          terminar(r, `Liquidação encerrada: ${r.length} produto(s) voltaram ao preço normal.`);
        } catch (e) { erro(e); }
      };
    }
  }

  /** Grade visual: tamanhos nas colunas, cores nas linhas, estoque em cada célula. */
  async function grade(p) {
    let g;
    try {
      g = await api(`/api/produtos/grade?nome=${encodeURIComponent(p.nome)}${p.referencia ? `&referencia=${encodeURIComponent(p.referencia)}` : ''}`);
    } catch (e) { return erro(e); }
    const totCor = (cor) => g.tamanhos.reduce((a, t) => a + (g.celulas[`${cor}|${t}`]?.estoque || 0), 0);
    const totTam = (t) => g.cores.reduce((a, cor) => a + (g.celulas[`${cor}|${t}`]?.estoque || 0), 0);
    const classe = (c) => (!c ? 'vazia' : c.estoque <= 0 ? 'zero' : c.estoque <= c.minimo ? 'baixo' : 'ok');
    const corpo = abrirModal(`Grade — ${g.nome}${g.referencia ? ` (Ref ${g.referencia})` : ''}`, `
      <div class="grade-legenda">
        <span><i class="grade-cel ok"></i> com estoque</span><span><i class="grade-cel baixo"></i> no mínimo</span>
        <span><i class="grade-cel zero"></i> esgotado</span><span><i class="grade-cel vazia"></i> não cadastrado</span>
      </div>
      <div class="tabela-rolagem">
        <table class="grade-estoque">
          <thead><tr><th>Cor \\ Tam.</th>${g.tamanhos.map((t) => `<th>${esc(t)}</th>`).join('')}<th>Total</th></tr></thead>
          <tbody>${g.cores.map((cor) => `<tr><th>${esc(cor)}</th>${g.tamanhos.map((t) => {
    const c = g.celulas[`${cor}|${t}`];
    return `<td><button type="button" class="grade-cel ${classe(c)}" ${c && c.ids.length === 1 ? `data-id="${c.ids[0]}"` : 'disabled'}
              title="${c ? `${c.estoque} peça(s)` : 'Não cadastrado'}">${c ? c.estoque : '·'}</button></td>`;
  }).join('')}<td class="grade-total">${totCor(cor)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><th>Total</th>${g.tamanhos.map((t) => `<td class="grade-total">${totTam(t)}</td>`).join('')}<td class="grade-total"><b>${g.total}</b></td></tr></tfoot>
        </table>
      </div>
      <p class="dica so-admin">Clique em um número para lançar entrada ou ajuste daquele tamanho/cor.</p>
      <div class="acoes so-admin"><button type="button" class="btn btn-fantasma" id="grade-vazias" hidden></button>
        <button type="button" class="btn" id="grade-add">+ Adicionar tamanhos ou cores</button></div>`, { largura: '720px' });
    corpo.querySelector('#grade-add').onclick = () => formulario(null, { base: p });
    if (U.sessao.ehAdmin()) {
      api(`/api/produtos/vazias?nome=${encodeURIComponent(p.nome)}${p.referencia ? `&referencia=${encodeURIComponent(p.referencia)}` : ''}`).then((vs) => {
        const b = corpo.querySelector('#grade-vazias');
        if (!vs.length || !b) return;
        b.hidden = false;
        b.innerHTML = `${Icone('lixeira')} Apagar os ${vs.length} que nunca tiveram peça`;
        b.onclick = () => limparVazias(vs, () => grade(p));
      }).catch(() => {});
    }
    corpo.querySelector('tbody').onclick = async (ev) => {
      const b = ev.target.closest('[data-id]');
      if (!b || !U.sessao.ehAdmin()) return;
      try { estoque(await api(`/api/produtos/${b.dataset.id}`)); } catch (e) { erro(e); }
    };
  }

  function estoque(p) {
    const corpo = abrirModal(`Estoque — ${p.nome} ${p.tamanho || ''} ${p.cor || ''}`, `
      <p>Estoque atual: <b>${p.estoque}</b></p>
      <form class="form-linha" id="f-est">
        <label>Movimento<select name="tipo">
          <option value="entrada">Entrada (chegou mercadoria)</option>
          <option value="saida">Saída (perda, brinde, defeito)</option>
          <option value="ajuste">Ajuste (contagem real)</option>
        </select></label>
        <label>Quantidade<input name="quantidade" type="number" min="0" required autofocus></label>
        <label>Motivo<input name="motivo"></label>
        <button class="btn btn-primario">Lançar</button>
      </form>
      <h3>Histórico</h3>
      <div class="tabela-rolagem baixa"><table class="tabela"><tbody id="movs"></tbody></table></div>`, { largura: '720px' });
    api(`/api/produtos/${p.id}/movimentos`).then((movs) => {
      corpo.querySelector('#movs').innerHTML = movs.map((m) => `
        <tr><td>${U.dataHora(m.criado_em)}</td><td>${esc(m.tipo)}</td>
        <td class="r ${m.quantidade < 0 ? 'txt-perigo' : ''}">${m.quantidade > 0 ? '+' : ''}${m.quantidade}</td>
        <td>${esc(m.motivo || '')}</td></tr>`).join('') || '<tr><td class="vazio">Sem movimentos.</td></tr>';
    }).catch(erro);
    corpo.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      const d = U.dadosForm(ev.target);
      try {
        const atualizado = await api(`/api/produtos/${p.id}/estoque`, { metodo: 'POST', corpo: d });
        aviso(`Estoque de "${p.nome}" agora é ${atualizado.estoque}.`);
        if (d.tipo === 'entrada' && await U.confirmar('Etiquetas', `Mandar ${d.quantidade} etiqueta(s) para a fila de impressão?`, { ok: 'Sim' })) {
          Telas.etiquetas.adicionar(atualizado, Number(d.quantidade));
        }
        fecharModal();
        if (raiz) carregar();
      } catch (e) { erro(e); }
    };
  }

  return { abrir, formulario, sair: () => { raiz = null; } };
})();
