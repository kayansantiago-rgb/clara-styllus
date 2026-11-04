/* Cadastro de produtos, grade (tamanho × cor) e estoque. */
Telas.produtos = (() => {
  const { esc, brl, num, api, aviso, erro, abrirModal, fecharModal } = U;
  let raiz;
  let lista = [];

  let modo = (() => { try { return localStorage.getItem('produtos_modo') || 'modelos'; } catch { return 'modelos'; } })();
  let ordem = (() => { try { return localStorage.getItem('produtos_ordem') || 'nome'; } catch { return 'nome'; } })();
  let categoria = '';
  let filtro = ''; // '' | 'estoque' | 'baixo' | 'zero' | 'inativos'

  async function abrir(el) {
    raiz = el;
    const seg = (k, t, ico) => `<button class="segmento ${modo === k ? 'sel' : ''}" data-modo="${k}" title="${t}">${Icone(ico)} ${t}</button>`;
    const f = (k, t) => `<button class="pr2-f ${filtro === k ? 'sel' : ''} ${k === 'inativos' ? 'so-admin' : ''}" data-f="${k}">${t}</button>`;
    raiz.innerHTML = `
      <div class="pr2">
        <div class="cabecalho-tela pr2-topo">
          <div><h1>Produtos</h1><p class="subtitulo" id="pr-resumo">Estoque, preços e etiquetas da loja.</p></div>
          <div class="ferramentas pr2-acoes">
            <button class="btn" id="catalogo" title="Imagens das peças da lista para postar no Instagram e mandar no WhatsApp">${Icone('imagem')} Catálogo</button>
            <button class="btn so-admin" id="liquidacao" title="Aplicar ou encerrar liquidação nos produtos da lista">${Icone('fogo')} Liquidação</button>
            <button class="btn so-admin" id="entrada" title="Somar estoque bipando as peças que chegaram">${Icone('codigo')} Entrada por bipagem</button>
            <button class="btn btn-primario btn-grande so-admin" id="novo">${Icone('mais')} Nova peça</button>
          </div>
        </div>
        <div class="pr2-kpis" id="pr-kpis"></div>
        <div class="pr2-barra">
          <div class="busca-ico pr-busca pr2-busca">${Icone('busca')}<input id="q" type="search" placeholder="Buscar por nome, código, referência, cor, marca…" autofocus autocomplete="off"></div>
          <div class="pr2-filtros" id="filtros">${f('', 'Todos')}${f('estoque', 'Com estoque')}${f('baixo', 'Para repor')}${f('zero', 'Esgotados')}${f('inativos', 'Inativos')}</div>
          <label class="pr2-ordem" title="Ordenar"><select id="ordem">${[['nome', '↕ Nome (A–Z)'], ['recentes', '↕ Mais novos'], ['mais', '↕ Mais estoque'], ['menos', '↕ Menos estoque'], ['caro', '↕ Maior preço'], ['barato', '↕ Menor preço']]
    .map(([k, t]) => `<option value="${k}" ${ordem === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <div class="segmentos" id="modo">${seg('modelos', 'Modelos', 'roupa')}${seg('lista', 'Lista', 'prancheta')}${seg('vitrine', 'Vitrine', 'imagem')}</div>
        </div>
        <div class="pr2-cats pr-categorias" id="categorias"></div>
        <div id="vazias-aviso"></div>
        <div id="lista"></div>
      </div>`;
    const recarregar = U.debounce(carregar, 200);
    raiz.querySelector('#q').addEventListener('input', recarregar);
    raiz.querySelector('#filtros').onclick = (ev) => {
      const b = ev.target.closest('[data-f]');
      if (!b) return;
      escolherFiltro(b.dataset.f);
    };
    raiz.querySelector('#ordem').onchange = (ev) => {
      ordem = ev.target.value;
      try { localStorage.setItem('produtos_ordem', ordem); } catch { /* sem armazenamento */ }
      desenhar();
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
    raiz.querySelector('#pr-kpis').onclick = (ev) => {
      const b = ev.target.closest('[data-kpi-f]');
      if (b) escolherFiltro(b.dataset.kpiF);
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

  function escolherFiltro(f) {
    const antes = filtro;
    filtro = f;
    raiz.querySelectorAll('#filtros [data-f]').forEach((x) => x.classList.toggle('sel', x.dataset.f === f));
    // Só busca de novo quando muda o que vem do servidor (inativos / estoque baixo).
    const servidor = (x) => (x === 'baixo' || x === 'inativos' ? x : '');
    if (servidor(antes) !== servidor(f)) carregar(); else desenhar();
  }

  let todos = [];
  let selos = {};
  let ultimaBusca = 0;
  // Selos do modelo: novidade, mais vendida, última peça, parada.
  const SELOS = {
    novidade: ['Novidade', 'estrela'], mais_vendida: ['Mais vendida', 'fogo'], ultima: ['Última peça', 'alerta'], parada: ['Parada', 'relogio'],
  };
  const selosDe = (p) => selos[`${String(p.nome).toLowerCase()}|${p.referencia || ''}`] || [];
  const selosHtml = (p, classe = '') => selosDe(p).map((k) => `<span class="pr-selo pr-selo-${k} ${classe}" title="${{
    novidade: 'Chegou há menos de 15 dias', mais_vendida: 'Entre as 5 que mais venderam nos últimos 30 dias',
    ultima: 'Só tem 1 peça deste modelo', parada: 'Sem vender há mais de 60 dias',
  }[k]}">${Icone(SELOS[k][1])}${SELOS[k][0]}</span>`).join('');
  async function carregar() {
    if (!raiz) return;
    const q = raiz.querySelector('#q').value;
    const extra = filtro === 'baixo' ? '&estoque_baixo=1' : filtro === 'inativos' ? '&inativos=1' : '';
    const pedido = ++ultimaBusca;
    try {
      const [r, sl] = await Promise.all([
        api(`/api/produtos?q=${encodeURIComponent(q)}${extra}&limite=1000`),
        api('/api/produtos/selos').catch(() => ({})),
      ]);
      if (pedido !== ultimaBusca) return; // chegou uma busca mais nova
      todos = r;
      selos = sl;
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
    <button class="btn-ico so-admin" data-acao="parecido" data-i="${i}" title="Cadastrar parecido (mesma categoria, preços e tamanhos)">${Icone('mais')}</button>
    <button class="btn-ico so-admin" data-acao="editar" data-i="${i}" title="Editar">${Icone('lapis')}</button>`;

  // Ordem das araras: tamanhos por letra, depois numeração.
  const ORDEM_TAM = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EXG', 'U'];
  const pesoTam = (t) => {
    const s = String(t || '').toUpperCase();
    const i = ORDEM_TAM.indexOf(s);
    if (i >= 0) return i;
    const n = parseFloat(s.replace(',', '.'));
    return Number.isNaN(n) ? 500 : 100 + n;
  };
  const TONS = { preto: '#151515', branco: '#fff', 'off-white': '#f3eee4', off: '#f3eee4', nude: '#e2bf9f', bege: '#d6c1a1', marrom: '#7a5136',
    azul: '#2f5fa8', jeans: '#4d6d8c', rosa: '#eaa3bc', vermelho: '#c0392b', vinho: '#6d1f33', verde: '#3f8f5a', amarelo: '#f1c84b',
    'lilás': '#b99ad6', lilas: '#b99ad6', cinza: '#9a9a9a', caramelo: '#b87a3d', laranja: '#e8823a', roxo: '#6c3d91', floral: 'conic-gradient(#e8a0b8 0 25%,#f1c84b 0 50%,#3f8f5a 0 75%,#2f5fa8 0)',
    estampado: 'conic-gradient(#e8a0b8 0 25%,#f1c84b 0 50%,#3f8f5a 0 75%,#2f5fa8 0)' };
  const bolinha = (c) => { const t = TONS[String(c || '').trim().toLowerCase()]; return `<i class="ge-dot ${t ? '' : 'sem'}" ${t ? `style="background:${t}"` : ''}></i>`; };

  function ordenar(arr, chave = (p) => p) {
    const v = (p) => chave(p);
    const cmp = {
      nome: (a, b) => v(a).nome.localeCompare(v(b).nome, 'pt-BR') || pesoTam(v(a).tamanho) - pesoTam(v(b).tamanho),
      recentes: (a, b) => v(b).id - v(a).id,
      mais: (a, b) => v(b).estoque - v(a).estoque,
      menos: (a, b) => v(a).estoque - v(b).estoque,
      caro: (a, b) => v(b).preco_venda - v(a).preco_venda,
      barato: (a, b) => v(a).preco_venda - v(b).preco_venda,
    }[ordem] || (() => 0);
    return [...arr].sort(cmp);
  }

  /** Números do topo: peças, valor em estoque, lucro previsto e o que precisa repor. */
  function desenharKpis(base, filtrado) {
    const fisicos = base.filter((p) => !p.servico);
    const pecas = fisicos.reduce((a, p) => a + Math.max(0, p.estoque), 0);
    const valor = fisicos.reduce((a, p) => a + Math.max(0, p.estoque) * p.preco_venda, 0);
    const custo = fisicos.reduce((a, p) => a + Math.max(0, p.estoque) * (p.preco_custo || 0), 0);
    const comCusto = fisicos.filter((p) => p.preco_custo > 0 && p.estoque > 0);
    const vendaComCusto = comCusto.reduce((a, p) => a + p.estoque * p.preco_venda, 0);
    const custoComCusto = comCusto.reduce((a, p) => a + p.estoque * p.preco_custo, 0);
    const modelos = new Set(base.map((p) => `${p.nome}|${p.referencia || ''}`)).size;
    const repor = fisicos.filter((p) => p.estoque > 0 && p.estoque <= p.estoque_minimo).length;
    const zerados = fisicos.filter((p) => p.estoque <= 0).length;
    const admin = U.sessao.ehAdmin();
    raiz.querySelector('#pr-kpis').innerHTML = `
      <div class="pr2-kpi destaque"><span class="pr2-kpi-ico">${Icone('roupa')}</span><div><small>Peças em estoque${filtrado ? ' (nesta busca)' : ''}</small>
        <b data-contar>${pecas}</b><em>${modelos} ${modelos === 1 ? 'modelo' : 'modelos'} · ${base.length} ${base.length === 1 ? 'variação' : 'variações'}</em></div></div>
      <div class="pr2-kpi"><span class="pr2-kpi-ico">${Icone('dinheiro')}</span><div><small>Valor em estoque</small>
        <b>${brl(valor)}</b><em>${admin && custo ? `custo ${brl(custo)}` : 'pelo preço de venda'}</em></div></div>
      ${admin ? `<div class="pr2-kpi"><span class="pr2-kpi-ico">${Icone('grafico')}</span><div><small>Lucro previsto</small>
        <b>${vendaComCusto ? brl(vendaComCusto - custoComCusto) : '—'}</b><em>${vendaComCusto ? `margem média ${Math.round(((vendaComCusto - custoComCusto) / vendaComCusto) * 100)}%` : 'cadastre o custo das peças'}</em></div></div>` : ''}
      <button type="button" class="pr2-kpi alerta ${repor + zerados ? '' : 'tudo-ok'}" data-kpi-f="${repor ? 'baixo' : 'zero'}" title="Ver o que precisa repor">
        <span class="pr2-kpi-ico">${Icone('alerta')}</span><div><small>Para repor</small>
        <b>${repor + zerados}</b><em>${repor} acabando · ${zerados} esgotado(s)</em></div></button>`;
  }

  function desenhar() {
    // Categorias que existem na busca atual (com contagem de peças).
    const cats = new Map();
    for (const p of todos) { const c = p.categoria || 'Sem categoria'; cats.set(c, (cats.get(c) || 0) + 1); }
    if (categoria && !cats.has(categoria)) categoria = '';
    raiz.querySelector('#categorias').innerHTML = cats.size > 1
      ? `<button class="pr2-cat ${categoria ? '' : 'sel'}" data-cat="">Todas <small>${todos.length}</small></button>` +
        [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `<button class="pr2-cat ${categoria === c ? 'sel' : ''}" data-cat="${esc(c)}">${esc(c)} <small>${n}</small></button>`).join('')
      : '';
    let base = categoria ? todos.filter((p) => (p.categoria || 'Sem categoria') === categoria) : todos;
    if (filtro === 'estoque') base = base.filter((p) => p.servico || p.estoque > 0);
    if (filtro === 'zero') base = base.filter((p) => !p.servico && p.estoque <= 0);
    lista = ordenar(base);
    const filtrado = !!(categoria || filtro || raiz.querySelector('#q').value.trim());
    desenharKpis(lista, filtrado);
    raiz.querySelector('#pr-resumo').textContent = filtrado ? `${lista.length} variação(ões) nesta busca.` : 'Estoque, preços e etiquetas da loja.';
    const el = raiz.querySelector('#lista');
    if (!lista.length) {
      el.className = 'pr-lista';
      el.innerHTML = `<div class="vd-vazio">${Ilustracao.svg('cabide', 150)}<b>${todos.length ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado ainda'}</b><br><small>${todos.length ? 'Mude a busca ou os filtros.' : 'Clique em <b>Nova peça</b> para cadastrar a primeira.'}</small></div>`;
      return;
    }
    if (modo === 'modelos') return desenharModelos(el);
    if (modo === 'vitrine') {
      el.className = 'pr-vitrine';
      el.innerHTML = lista.map((p, i) => `
        <div class="pr-card ${p.ativo ? '' : 'inativo'}">
          <div class="pr-card-foto" data-acao="ficha" data-i="${i}">${U.miniatura(p, 'pr-foto-g')}${pilula(p)}${selosDe(p).length ? `<div class="pr-selos pr-selos-foto">${selosHtml(p)}</div>` : ''}</div>
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
        <div class="pr-nome" data-acao="ficha" data-i="${i}"><b>${esc(p.nome)}</b>${selosHtml(p, 'mini')}<small>${esc([p.categoria, p.marca, p.referencia && 'Ref ' + p.referencia].filter(Boolean).join(' · '))} <code>${esc(p.codigo)}</code></small></div>
        <div class="p4-tags">${p.tamanho ? `<span class="p4-tag">${esc(p.tamanho)}</span>` : ''}${p.cor ? `<span class="p4-tag">${bolinha(p.cor)}${esc(p.cor)}</span>` : ''}</div>
        <div class="r pr-custo">${p.preco_custo ? num(p.preco_custo) : '—'}</div>
        <div class="r pr-preco">${precoHtml(p)}</div>
        <div class="r">${pilula(p)}</div>
        <div class="r nowrap pr-acoes">${acoesHtml(i)}</div>
      </div>`).join('');
  }

  /** Um cartão por modelo (todas as cores e tamanhos juntos), com o estoque de cada um. */
  let grupos = [];
  function desenharModelos(el) {
    const mapa = new Map();
    lista.forEach((p, i) => {
      const k = `${p.nome}|${p.referencia || ''}`;
      if (!mapa.has(k)) mapa.set(k, { nome: p.nome, itens: [] });
      mapa.get(k).itens.push({ p, i });
    });
    grupos = [...mapa.values()];
    el.className = 'pr-modelos';
    el.innerHTML = grupos.map((g, gi) => {
      const ps = g.itens.map((x) => x.p);
      const p0 = ps.find((p) => p.foto_versao) || ps[0];
      const i0 = g.itens[0].i;
      const pecas = ps.reduce((a, p) => a + (p.servico ? 0 : Math.max(0, p.estoque)), 0);
      const valor = ps.reduce((a, p) => a + (p.servico ? 0 : Math.max(0, p.estoque) * p.preco_venda), 0);
      const precos = [...new Set(ps.map((p) => p.preco_venda))];
      const cores = new Map();
      for (const x of g.itens) {
        const c = x.p.cor || '';
        if (!cores.has(c)) cores.set(c, []);
        cores.get(c).push(x);
      }
      const linhasCor = [...cores.entries()].map(([c, xs]) => `<div class="pm-cor">${c ? `<span class="pm-cor-nome">${bolinha(c)}${esc(c)}</span>` : ''}
        <div class="pm-tams">${xs.sort((a, b) => pesoTam(a.p.tamanho) - pesoTam(b.p.tamanho)).map(({ p, i }) => {
          const st = situacao(p);
          return `<button type="button" class="pm-v ${st}" data-acao="${U.sessao.ehAdmin() ? 'estoque' : 'grade'}" data-i="${i}"
            title="${esc([p.tamanho && `Tam ${p.tamanho}`, p.cor].filter(Boolean).join(' · ') || p.nome)}: ${p.servico ? 'serviço' : `${p.estoque} peça(s)`}">
            <span>${esc(p.tamanho || 'Único')}</span><b>${p.servico ? '∞' : p.estoque}</b></button>`;
        }).join('')}</div></div>`).join('');
      const inativo = ps.every((p) => !p.ativo);
      return `<article class="pm ${inativo ? 'inativo' : ''} ${pecas ? '' : 'sem-estoque'}">
        <button type="button" class="pm-foto" data-acao="ficha" data-i="${i0}" title="Ver a ficha da peça">${U.miniatura(p0, 'pm-img')}</button>
        <div class="pm-info">
          <div class="pm-topo"><div><small class="pm-cat">${esc([p0.categoria, p0.marca].filter(Boolean).join(' · '))}</small>
            <b class="pm-nome" data-acao="ficha" data-i="${i0}" title="Ver a ficha da peça">${esc(g.nome)}</b>${p0.preco_unico ? ' <span class="pr-unico">Preço único</span>' : ''}
            ${selosDe(p0).length ? `<div class="pr-selos">${selosHtml(p0)}</div>` : ''}${p0.referencia ? `<small class="pm-ref">Ref ${esc(p0.referencia)}</small>` : ''}</div>
            <div class="pm-preco">${precos.length > 1 ? `<small>a partir de</small><b>${brl(Math.min(...precos))}</b>` : precoHtml(p0)}</div></div>
          ${linhasCor}
        </div>
        <div class="pm-lado">
          <div class="pm-estoque ${pecas ? '' : 'zero'}"><b>${pecas}</b><small>${pecas === 1 ? 'peça' : 'peças'}</small>${pecas ? `<em>${brl(valor)}</em>` : '<em>esgotado</em>'}</div>
          <div class="pm-acoes">
            <button class="btn-ico" data-acao="etiquetas-modelo" data-g="${gi}" title="Etiquetas de todas as peças deste modelo">${Icone('etiqueta')}</button>
            <button class="btn-ico" data-acao="avisar" data-i="${i0}" title="Avisar clientes que podem gostar (WhatsApp)">${Icone('whatsapp')}</button>
            <button class="btn-ico so-admin" data-acao="parecido" data-i="${i0}" title="Cadastrar parecido">${Icone('mais')}</button>
            <button class="btn-ico so-admin" data-acao="editar" data-i="${i0}" title="Editar">${Icone('lapis')}</button>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  function acao(ev) {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const p = lista[Number(b.dataset.i)];
    if (!p && b.dataset.acao !== 'etiquetas-modelo') return;
    if (b.dataset.acao === 'editar') formulario(p);
    if (b.dataset.acao === 'parecido') formulario(null, { modelo: p });
    if (b.dataset.acao === 'estoque') estoque(p);
    if (b.dataset.acao === 'grade') grade(p);
    if (b.dataset.acao === 'ficha') ficha(p);
    if (b.dataset.acao === 'avisar') {
      // O modelo inteiro (todos os tamanhos e cores com estoque), não só esta variação.
      const mesmo = todos.filter((x) => x.nome === p.nome && (x.referencia || '') === (p.referencia || '') && x.estoque > 0);
      Interessadas.abrir((mesmo.length ? mesmo : [p]).map((x) => x.id));
    }
    if (b.dataset.acao === 'etiquetas-modelo') {
      const g = grupos[Number(b.dataset.g)];
      const comPeca = g.itens.map((x) => x.p).filter((x) => x.estoque > 0 && !x.servico);
      if (!comPeca.length) return aviso('Este modelo não tem peças em estoque.', 'alerta');
      comPeca.forEach((x) => Telas.etiquetas.adicionar(x, x.estoque));
      const n = comPeca.reduce((a, x) => a + x.estoque, 0);
      return U.avisoAcao(`${n} etiqueta(s) de "${g.nome}" na fila.`, 'Ver fila', () => { location.hash = '#/etiquetas'; });
    }
    if (b.dataset.acao === 'etiqueta') {
      Telas.etiquetas.adicionar(p, Math.max(1, p.estoque));
      aviso(`${Math.max(1, p.estoque)} etiqueta(s) de "${p.nome}" na fila de impressão.`);
    }
  }

  /** Preço sugerido = custo × markup, arredondado para cima (,90 / ,99 / ,00). */
  function precoSugerido(custo, cfg, markup) {
    const mk = markup || Number(String(cfg.markup_padrao || '').replace(',', '.'));
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
    // "Cadastrar parecido": mesmos dados de um produto que já existe (nome, categoria, preços, tamanhos).
    if (novo && opcoes.modelo) {
      const b = opcoes.modelo;
      p = { nome: b.nome, categoria: b.categoria, marca: b.marca, preco_custo: b.preco_custo, preco_venda: b.preco_venda, estoque_minimo: b.estoque_minimo };
      try {
        const g = await api(`/api/produtos/grade?nome=${encodeURIComponent(b.nome)}${b.referencia ? `&referencia=${encodeURIComponent(b.referencia)}` : ''}`);
        tamIniciais = g.tamanhos.filter((t) => t !== '—');
      } catch { /* sem grade */ }
    }
    // "Cadastrar e fazer outro": continua na mesma categoria, marca e tamanhos.
    if (novo && opcoes.repetir) {
      p = { categoria: opcoes.repetir.categoria, marca: opcoes.repetir.marca };
      tamIniciais = opcoes.repetir.tamanhos || [];
    }
    p = p || {};
    const atributos = await api('/api/produtos/atributos').catch(() => ({ categorias: [], marcas: [] }));
    const CATS_PADRAO = ['Vestido', 'Blusa', 'Calça', 'Saia', 'Short', 'Conjunto', 'Body', 'Cropped', 'Macacão', 'Casaco'];
    const categorias = [...new Map([...atributos.categorias, ...CATS_PADRAO].map((c) => [c.toLowerCase(), c])).values()].slice(0, 12);
    const semFoto = `<span class="foto-vazia">${Icone('imagem')}<small>sem foto</small></span>`;
    const moeda = (nome, valor, extra = '') =>
      `<div class="campo-moeda"><span>R$</span><input name="${nome}" inputmode="decimal" value="${valor ? num(valor) : ''}" ${extra}></div>`;
    const titulo = novo ? (opcoes.base ? `Adicionar tamanhos/cores — ${p.nome}` : 'Nova peça') : 'Editar peça';
    const passo = (n, t, sub) => `<div class="cad-passo-cab"><span class="cad-num" data-passo="${n}">${n}</span><div><h3>${t}</h3>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
    const corpo = abrirModal(titulo, `
      <form class="fp cad" id="f-prod" autocomplete="off">
        <div class="cad-corpo">
          <aside class="cad-vitrine fp-lateral">
            <div class="cad-foto">
              <div class="foto-previa" id="foto-previa">${U.fotoUrl(p) ? `<img src="${U.fotoUrl(p)}" alt="">` : semFoto}</div>
              <div class="cad-foto-botoes">
                <label class="btn btn-claro">${Icone('camera')} ${U.fotoUrl(p) ? 'Trocar' : 'Foto'}<input type="file" accept="image/*" capture="environment" id="foto-arquivo" hidden></label>
                <button type="button" class="btn btn-claro" id="foto-celular" title="Tirar a foto com o celular (mesmo Wi-Fi da loja)">${Icone('telefone')} Celular</button>
                <button type="button" class="btn btn-claro btn-perigo-claro" id="foto-remover" title="Tirar a foto" ${U.fotoUrl(p) ? '' : 'hidden'}>${Icone('lixeira')}</button>
              </div>
            </div>
            <div class="fp-fundo" id="foto-fundo" ${U.fotoUrl(p) ? '' : 'hidden'}></div>
            <div class="fp-celular" id="foto-celular-painel" hidden></div>
            ${novo ? '' : `<label class="check fp-ajuda"><input type="checkbox" id="foto-cor" checked> Mesma foto em todos os tamanhos ${p.cor ? `da cor ${esc(p.cor)}` : 'deste produto'}</label>`}
            <div class="cad-resumo">
              <small class="cad-resumo-cat" id="cad-v-cat"></small>
              <b class="cad-resumo-nome" id="cad-v-nome"></b>
              <div class="cad-resumo-preco" id="cad-v-preco"></div>
              <div class="fp-margem cad-margem" id="margem-box" hidden>
                <div class="cad-margem-topo"><small>Margem</small><b id="margem-pct"></b></div>
                <div class="cad-barra"><i id="cad-barra"></i></div>
                <span id="margem"></span>
              </div>
            </div>
            <div class="cad-etq-previa"><small>Etiqueta</small><div id="cad-etq"></div>
              ${novo ? `<div class="fp-etq">${Telas.etiquetas.escolhaHtml({ curto: true })}</div>` : ''}</div>
          </aside>

          <div class="cad-passos fp-principal">
            ${novo && !opcoes.base ? `<div class="cad-tipo" id="cad-tipo">
              <button type="button" class="cad-tipo-op ${opcoes.repetir && opcoes.repetir.unico ? '' : 'sel'}" data-tipo="grade">${Icone('roupa')}<span><b>Peça com tamanhos</b><small>Vestido, calça… cada tamanho e cor com seu código</small></span></button>
              <button type="button" class="cad-tipo-op ${opcoes.repetir && opcoes.repetir.unico ? 'sel' : ''}" data-tipo="unico">${Icone('etiqueta')}<span><b>Várias peças, preço único</b><small>Brincos, meias, bijuterias… um código e uma etiqueta para todas</small></span></button>
            </div>` : ''}
            <section class="cad-passo">
              ${passo(1, '<span id="cad-t1">Qual é a peça?</span>', 'Nome e categoria')}
              <input name="nome" class="cad-nome" required value="${esc(p.nome)}" autofocus placeholder="Ex.: Vestido midi canelado">
              <div class="cad-cats fp-cats" id="fp-cats">${categorias.map((c) => `<button type="button" class="cad-cat ${String(p.categoria || '').toLowerCase() === c.toLowerCase() ? 'sel' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
              <details class="cad-mais" ${p.marca || p.referencia ? 'open' : ''}><summary>Categoria, marca e referência</summary>
                <div class="fp-grid3">
                  <label>Categoria<input name="categoria" value="${esc(p.categoria)}" placeholder="Outra categoria" list="lista-categorias"></label>
                  <label>Marca / fornecedor<input name="marca" value="${esc(p.marca)}" placeholder="Opcional" list="lista-marcas"></label>
                  <label>Referência<input name="referencia" value="${esc(p.referencia)}" placeholder="Cód. do fornecedor"></label>
                </div>
              </details>
            </section>

            <section class="cad-passo">
              ${passo(2, 'Preço', 'O sistema sugere o preço pelo custo')}
              <div class="cad-precos">
                <label class="cad-preco">Custo (quanto pagou)${moeda('preco_custo', p.preco_custo, 'placeholder="0,00"')}</label>
                <span class="cad-seta">→</span>
                <label class="cad-preco cad-preco-venda">Preço de venda *${moeda('preco_venda', p.preco_venda, 'placeholder="0,00"')}</label>
              </div>
              <div class="cad-markups" id="cad-markups"></div>
              <span class="sugestao-preco" id="sugestao-preco" hidden></span>
              <details class="cad-mais" ${p.preco_anterior ? 'open' : ''}><summary>Liquidação e estoque mínimo</summary>
                <div class="fp-grid3">
                  <label class="so-admin fp-liquidacao">Preço "De" (liquidação)${moeda('preco_anterior', p.preco_anterior, 'placeholder="Preço antigo"')}</label>
                  <label>Estoque mínimo<input name="estoque_minimo" type="number" min="0" value="${p.estoque_minimo ?? 0}" title="Avisa quando o estoque chegar neste número"></label>
                </div>
              </details>
            </section>

            ${novo && !opcoes.base ? `
            <section class="cad-passo fp-unico" hidden>
              ${passo(3, 'Quantas peças chegaram?', 'Todas com o mesmo código e a mesma etiqueta')}
              <div class="cad-unico">
                <span class="qtd-ctrl cad-unico-qtd"><button type="button" class="mini" data-un="-1">${Icone('menos')}</button>
                  <input name="qtd_unico" type="number" min="0" inputmode="numeric" value="${opcoes.repetir && opcoes.repetir.unico ? '' : ''}" placeholder="0">
                  <button type="button" class="mini" data-un="1">${Icone('mais')}</button></span>
                <div class="cad-unico-chips">${[5, 10, 20, 30, 50].map((n) => `<button type="button" class="cad-mk" data-unq="${n}"><b>${n}</b></button>`).join('')}</div>
              </div>
              <p class="cad-unico-dica">${Icone('etiqueta')} Sai <b>uma etiqueta só</b> com PREÇO ÚNICO e o preço bem grande (dá para imprimir mais na fila). No caixa, bipe uma vez para cada peça vendida.</p>
            </section>` : ''}
            ${novo ? `
            <section class="cad-passo fp-grade">
              ${passo(3, 'Tamanhos, cores e quantidades', 'Toque nos tamanhos e nas cores que chegaram')}
              <div id="grade-editor"></div>
              <label class="check cad-zeradas"><input type="checkbox" id="criar-zeradas"> Cadastrar também as combinações com 0 (aparecem como esgotadas)</label>
            </section>` : `
            <section class="cad-passo">
              ${passo(3, 'Esta variação', 'Tamanho, cor e código de barras')}
              <div class="fp-grid3">
                <label>Tamanho<input name="tamanho" value="${esc(p.tamanho)}"></label>
                <label>Cor<input name="cor" value="${esc(p.cor)}"></label>
                <label>Código de barras<input name="codigo" required value="${esc(p.codigo)}"></label>
              </div>
              <label class="interruptor"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}><span class="trilho"></span>
                <span class="txt"><b>Produto ativo</b><small>Desligado, a peça some do caixa e das buscas.</small></span></label>
              <label class="interruptor"><input type="checkbox" name="preco_unico" ${p.preco_unico ? 'checked' : ''}><span class="trilho"></span>
                <span class="txt"><b>Preço único (várias peças)</b><small>Etiqueta "PREÇO ÚNICO" para peças parecidas com o mesmo preço.</small></span></label>
            </section>`}

            <details class="cad-mais cad-outras fp-opcoes" ${p.atalho || p.servico ? 'open' : ''}><summary>Outras opções (botão rápido no caixa, serviço)</summary>
              <label class="interruptor"><input type="checkbox" name="atalho" ${p.atalho ? 'checked' : ''}><span class="trilho"></span>
                <span class="txt"><b>Botão rápido no caixa</b><small>Para sacola, embrulho e itens vendidos toda hora.</small></span></label>
              <label class="interruptor"><input type="checkbox" name="servico" ${p.servico ? 'checked' : ''}><span class="trilho"></span>
                <span class="txt"><b>É um serviço</b><small>Não controla estoque (ajuste de barra…). Com preço 0, o valor é perguntado na hora.</small></span></label>
            </details>
          </div>
        </div>

        <datalist id="lista-categorias">${[...new Set([...atributos.categorias, 'Vestido', 'Blusa', 'Camisa', 'Calça', 'Saia', 'Short', 'Macacão', 'Conjunto', 'Body', 'Cropped', 'Jaqueta', 'Casaco', 'Moda praia', 'Lingerie', 'Acessório', 'Bolsa', 'Calçado'])]
    .map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <datalist id="lista-marcas">${atributos.marcas.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>

        <div class="fp-rodape cad-rodape">
          ${novo ? `<div class="cad-total" id="cad-total"></div>` : `
            <button type="button" class="btn btn-fantasma btn-perigo-claro fp-excluir" id="excluir-produto">${Icone('lixeira')} Excluir</button>
            <button type="button" class="btn btn-fantasma" id="parecido" title="Abre um cadastro novo com os mesmos dados (categoria, preços, tamanhos)">⧉ Cadastrar parecido</button>
            <span class="cad-espaco"></span>`}
          <button type="button" class="btn" data-fechar>Cancelar</button>
          ${novo && !opcoes.base ? `<button type="submit" class="btn" data-outro="1" title="Salva e já abre outro cadastro na mesma categoria (Ctrl+Shift+Enter)">${Icone('mais')} Salvar e fazer outro</button>` : ''}
          <button type="submit" class="btn btn-primario" title="Ctrl+Enter">${Icone('check')} ${novo ? 'Cadastrar peça' : 'Salvar alterações'}</button>
        </div>
      </form>`, { largura: '1180px', classe: 'modal-cadastro' });

    const form = corpo.querySelector('form');
    Telas.etiquetas.ligarEscolha(corpo);
    const editor = novo
      ? GradeEditor.criar(corpo.querySelector('#grade-editor'), { existentes, tamanhos: tamIniciais, cores: corIniciais, codigoPendente: opcoes.codigo })
      : null;
    // ---------------------------------------------------- tipo: grade ou preço único
    let unico = !novo && !!p.preco_unico;
    const tipoBox = corpo.querySelector('#cad-tipo');
    const qtdUnico = () => Math.max(0, Number(form.qtd_unico && form.qtd_unico.value) || 0);
    const mudarTipo = (t) => {
      unico = t === 'unico';
      tipoBox.querySelectorAll('[data-tipo]').forEach((b) => b.classList.toggle('sel', b.dataset.tipo === t));
      corpo.querySelector('.fp-grade').hidden = unico;
      corpo.querySelector('.fp-unico').hidden = !unico;
      corpo.querySelector('#cad-t1').textContent = unico ? 'Que peças são?' : 'Qual é a peça?';
      form.nome.placeholder = unico ? 'Ex.: Brincos variados, Meias, Bijuterias' : 'Ex.: Vestido midi canelado';
      vitrine();
    };
    if (tipoBox) {
      tipoBox.onclick = (ev) => { const b = ev.target.closest('[data-tipo]'); if (b) { mudarTipo(b.dataset.tipo); form.nome.focus(); } };
      corpo.querySelector('.fp-unico').onclick = (ev) => {
        const b = ev.target.closest('[data-un],[data-unq]');
        if (!b) return;
        form.qtd_unico.value = b.dataset.unq ? b.dataset.unq : Math.max(0, qtdUnico() + Number(b.dataset.un));
        vitrine();
      };
    }
    // ---------------------------------------------------- vitrine (lado esquerdo, ao vivo)
    const vitrine = U.debounce(() => desenharVitrine(), 120);
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
        const barra = corpo.querySelector('#cad-barra');
        barra.style.width = `${Math.max(4, Math.min(100, pct))}%`;
        barra.className = pct < 30 ? 'baixa' : pct < 50 ? 'media' : 'boa';
      }
      // Markup em um clique: x2, x2,2, x2,5, x3 (e o da loja, se for outro).
      const mkLoja = Number(String(cfg.markup_padrao || '').replace(',', '.'));
      const mks = [...new Set([mkLoja, 2, 2.2, 2.5, 3].filter((m) => m > 1))];
      corpo.querySelector('#cad-markups').innerHTML = c > 0 ? `<small>Preço pelo custo:</small>${mks.map((m) => {
        const pv = precoSugerido(c, cfg, m);
        return `<button type="button" class="cad-mk ${pv === v ? 'sel' : ''}" data-mk="${pv}"><span>×${String(m).replace('.', ',')}${m === mkLoja ? ' (loja)' : ''}</span><b>${U.brl(pv)}</b></button>`;
      }).join('')}` : '';
      corpo.querySelector('#sugestao-preco').hidden = true;
      vitrine();
    };
    corpo.querySelector('#cad-markups').onclick = (ev) => {
      const b = ev.target.closest('[data-mk]');
      if (!b) return;
      form.preco_venda.value = num(Number(b.dataset.mk));
      form.preco_venda.dataset.mexeu = '1';
      margem();
    };
    const desenharVitrine = async () => {
      if (!form.isConnected) return; // a janela já fechou (ou abriu outro cadastro)
      const nome = form.nome.value.trim();
      const cat = form.categoria.value.trim();
      const v = U.paraCentavos(form.preco_venda.value) || 0;
      const de = U.paraCentavos(form.preco_anterior ? form.preco_anterior.value : '') || 0;
      corpo.querySelector('#cad-v-nome').textContent = nome || 'Nome da peça';
      corpo.querySelector('#cad-v-nome').classList.toggle('cad-vazio', !nome);
      corpo.querySelector('#cad-v-cat').textContent = [cat, form.marca.value.trim()].filter(Boolean).join(' · ');
      corpo.querySelector('#cad-v-preco').innerHTML = v > 0
        ? `${de > v ? `<s>${brl(de)}</s>` : ''}<b>${brl(v)}</b>` : '<span class="cad-vazio">R$ 0,00</span>';
      // Passos completos ganham o ✓.
      const feito = [!!nome, v > 0, unico && novo ? qtdUnico() > 0 : editor ? editor.variantes(false).length > 0 : !!form.codigo.value];
      corpo.querySelectorAll('[data-passo]').forEach((el) => {
        const ok = feito[Number(el.dataset.passo) - 1];
        el.classList.toggle('ok', ok);
        el.textContent = ok ? '✓' : el.dataset.passo;
      });
      if (editor && unico) {
        const n = qtdUnico();
        corpo.querySelector('#cad-total').innerHTML = n
          ? `<b>${n}</b> peça(s) · preço único${v ? ` · <span>${brl(v * n)} em estoque</span>` : ''}`
          : '<span class="txt-suave">Nenhuma peça ainda</span>';
      } else if (editor) {
        const vs = editor.variantes(false);
        const pecas = vs.reduce((a, x) => a + x.quantidade, 0);
        corpo.querySelector('#cad-total').innerHTML = pecas
          ? `<b>${pecas}</b> peça(s) · ${vs.length} variação(ões)${v ? ` · <span>${brl(v * pecas)} em estoque</span>` : ''}`
          : '<span class="txt-suave">Nenhuma peça ainda</span>';
      }
      // Etiqueta como vai sair, com os dados digitados.
      const pr = {
        nome: nome || 'Nome da peça', categoria: cat, preco_venda: v, preco_anterior: de > v ? de : null,
        tamanho: editor ? (editor.tamanhos()[0] || '') : form.tamanho.value, cor: editor ? (editor.cores()[0] || '') : form.cor.value,
        referencia: form.referencia.value, codigo: (!editor && form.codigo.value) || '2000000000015',
        preco_unico: novo ? unico : !!(form.preco_unico && form.preco_unico.checked),
      };
      if (pr.preco_unico) { pr.tamanho = ''; pr.cor = ''; }
      const caixa = corpo.querySelector('#cad-etq');
      const larg = Number(cfg.etiqueta_largura_mm) || 40;
      const alt = Number(cfg.etiqueta_altura_mm) || 30;
      if (EtiquetaLayout.ativo(cfg)) {
        const layout = EtiquetaLayout.ler(cfg);
        await EtiquetaLayout.pronto(layout);
        caixa.innerHTML = '';
        const cv = EtiquetaLayout.canvas(layout, pr, cfg, 12);
        cv.className = 'cad-etq-canvas';
        caixa.appendChild(cv);
      } else {
        if (!caixa.firstElementChild || !caixa.firstElementChild.shadowRoot) {
          caixa.innerHTML = `<div class="cad-etq-folha" style="width:${larg}mm;height:${alt}mm"></div>`;
          caixa.firstElementChild.attachShadow({ mode: 'open' });
        }
        const sombra = caixa.firstElementChild.shadowRoot;
        sombra.innerHTML = `<style>${Impressao.cssEtiquetas({ ...cfg, etiqueta_colunas: '2' }).replace(/@page[^}]*}/g, '')}
          .etq { outline: none; background: #fff; }</style>${Impressao.htmlEtiqueta(pr, cfg)}`;
        const z = Math.min(1.6, 300 / (larg * 3.78));
        caixa.firstElementChild.style.zoom = z.toFixed(3);
      }
    };
    form.addEventListener('input', vitrine);
    form.addEventListener('click', () => setTimeout(vitrine, 0));
    // Categoria em um clique; os tamanhos que a loja costuma usar nela entram sozinhos.
    const TAMS = 'tamanhos_por_categoria';
    const escolherCategoria = (c, { auto = false } = {}) => {
      form.categoria.value = c;
      corpo.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('sel', b.dataset.cat.toLowerCase() === c.toLowerCase()));
      const usados = (U.local.ler(TAMS, {}) || {})[c.toLowerCase()];
      if (editor && usados && usados.length && !editor.tamanhos().length) editor.definirTamanhos(usados);
      if (auto) form.categoria.classList.add('fp-auto');
    };
    corpo.querySelector('#fp-cats').onclick = (ev) => {
      const b = ev.target.closest('[data-cat]');
      if (b) { escolherCategoria(b.dataset.cat); form.preco_custo.focus(); }
    };
    form.categoria.addEventListener('change', () => { form.categoria.classList.remove('fp-auto'); escolherCategoria(form.categoria.value.trim()); });
    // Nome "Vestido midi..." já escolhe a categoria Vestido (se ainda estiver vazia).
    const semAc = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    form.nome.addEventListener('input', () => {
      if (form.categoria.value && !form.categoria.classList.contains('fp-auto')) return;
      const primeira = semAc(form.nome.value.trim().split(/\s+/)[0] || '');
      if (primeira.length < 3) return;
      const todas = [...categorias, ...atributos.categorias];
      const achou = todas.find((c) => { const k = semAc(c); return primeira === k || primeira === `${k}s` || `${primeira}s` === k; });
      if (achou) escolherCategoria(achou, { auto: true });
      else if (form.categoria.classList.contains('fp-auto')) { form.categoria.value = ''; corpo.querySelectorAll('[data-cat]').forEach((b) => b.classList.remove('sel')); }
    });
    // Primeira letra maiúscula no nome.
    form.nome.addEventListener('blur', () => {
      const v = form.nome.value.trim();
      if (v) form.nome.value = v.charAt(0).toUpperCase() + v.slice(1);
    });
    if (novo && p.categoria) escolherCategoria(p.categoria);
    // Ctrl+Enter salva; Ctrl+Shift+Enter salva e abre outro.
    form.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' || !(ev.ctrlKey || ev.metaKey)) return;
      ev.preventDefault();
      const b = ev.shiftKey && form.querySelector('[data-outro]');
      form.requestSubmit(b || form.querySelector('.fp-rodape .btn-primario'));
    });
    const bParecido = corpo.querySelector('#parecido');
    if (bParecido) bParecido.onclick = () => formulario(null, { modelo: p });
    const bExcluir = corpo.querySelector('#excluir-produto');
    if (bExcluir) {
      bExcluir.onclick = async () => {
        const desc = [p.nome, p.tamanho && `tam ${p.tamanho}`, p.cor].filter(Boolean).join(' · ');
        const ok = await U.confirmar('Excluir produto?',
          `${desc} sai do cadastro, da busca e do caixa. Se a peça já foi vendida, ela continua aparecendo nas vendas antigas. Logo depois dá para desfazer.`,
          { ok: 'Excluir produto', perigo: true });
        if (!ok) return formulario(p, opcoes);
        // Some da lista na hora; a exclusão de verdade só acontece se não clicar em "Desfazer".
        todos = todos.filter((x) => x.id !== p.id);
        if (raiz) desenhar();
        U.desfazivel(`${desc} foi excluído.`, {
          executar: (fechando) => api(`/api/produtos/${p.id}`, { metodo: 'DELETE', keepalive: fechando }),
          aoDesfazer: () => carregar(),
          depois: () => carregar(),
        });
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
    if (tipoBox && opcoes.repetir && opcoes.repetir.unico) mudarTipo('unico');

    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const fazerOutro = !!(ev.submitter && ev.submitter.dataset.outro);
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
        if (novo && unico) {
          // Várias peças com o mesmo preço: um produto só, com a quantidade toda no estoque.
          const n = qtdUnico();
          if (!n) return aviso('Diga quantas peças chegaram.', 'erro');
          const criado = await api('/api/produtos', { metodo: 'POST', corpo: { ...base, preco_unico: true, estoque: n } });
          await salvarFoto([criado.id]);
          aviso(`${criado.nome}: ${n} peça(s) com preço único cadastradas.`);
          // Uma etiqueta só para todas (dá para imprimir mais na fila, se quiser uma por peça).
          Telas.etiquetas.depoisDaEntrada([{ produto: criado, quantidade: 1 }]);
          if (raiz) carregar();
          if (fazerOutro) return formulario(null, { repetir: { categoria: base.categoria, marca: base.marca, unico: true } });
          return fecharModal();
        }
        if (!novo) {
          await api(`/api/produtos/${p.id}`, {
            metodo: 'PUT',
            corpo: { ...base, tamanho: d.tamanho, cor: d.cor, codigo: d.codigo, ativo: !!d.ativo, preco_unico: !!d.preco_unico },
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
          // Lembra os tamanhos desta categoria para os próximos cadastros.
          if (base.categoria && editor.tamanhos().length) {
            const mapa = U.local.ler('tamanhos_por_categoria', {}) || {};
            mapa[base.categoria.toLowerCase()] = editor.tamanhos();
            U.local.gravar('tamanhos_por_categoria', mapa);
          }
          Telas.etiquetas.depoisDaEntrada(criados.map((x) => ({ produto: x, quantidade: x.estoque })));
          chegaram = criados.filter((x) => x.estoque > 0).map((x) => x.id);
        }
        if (raiz) carregar();
        if (fazerOutro) {
          return formulario(null, { repetir: { categoria: base.categoria, marca: base.marca, tamanhos: editor.tamanhos() } });
        }
        fecharModal();
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
      ${Telas.etiquetas.escolhaHtml()}
      <label>Observação<input id="ent-motivo" placeholder="Ex.: NF 1234 do fornecedor"></label>
      <div class="acoes">
        <button class="btn" data-fechar>Cancelar</button>
        <button class="btn btn-primario btn-grande" id="ent-ok" disabled>Confirmar entrada</button>
      </div>`, { largura: '820px' });
    Telas.etiquetas.ligarEscolha(corpo);
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
        || `<tr><td colspan="5">${U.vazio({ ilu: 'etiqueta', compacto: true, texto: 'Nenhuma peça bipada ainda.' })}</td></tr>`;
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
        fecharModal();
        avisoEntrada(`Entrada lançada: ${pecas} peça(s) em ${r.length} produto(s).`, lista.map((x) => ({ produto: x.produto, quantidade: x.quantidade })));
        // Etiquetas com os dados atualizados (preço de agora).
        Telas.etiquetas.depoisDaEntrada(lista.map((x) => ({ produto: r.find((y) => y.id === x.produto.id) || x.produto, quantidade: x.quantidade })));
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

  /** Aviso da entrada com "Desfazer": tira as peças do estoque de novo e as etiquetas da fila. */
  function avisoEntrada(msg, itens) {
    U.avisoAcao(msg, '↶ Desfazer', async () => {
      try {
        for (const { produto, quantidade } of itens) {
          await api(`/api/produtos/${produto.id}/estoque`, { metodo: 'POST', corpo: { tipo: 'saida', quantidade, motivo: 'Entrada desfeita' } });
        }
        const f = U.local.ler('fila_etiquetas', []);
        for (const { produto, quantidade } of itens) {
          const it = f.find((y) => y.produto.id === produto.id);
          if (it) it.quantidade = Math.max(0, it.quantidade - quantidade);
        }
        U.local.gravar('fila_etiquetas', f.filter((y) => y.quantidade > 0));
        aviso('Entrada desfeita: as peças saíram do estoque e as etiquetas da fila.');
        if (raiz) carregar();
      } catch (e) { erro(e); }
    });
  }

  /** Grade visual: tamanhos nas colunas, cores nas linhas, estoque em cada célula. */
  /** Ficha do modelo: foto grande, grade colorida, vendas do mês, há quanto tempo está na loja e o lucro por peça. */
  async function ficha(p) {
    const q = `nome=${encodeURIComponent(p.nome)}${p.referencia ? `&referencia=${encodeURIComponent(p.referencia)}` : ''}`;
    let f;
    let g;
    try { [f, g] = await Promise.all([api(`/api/produtos/ficha?${q}`), api(`/api/produtos/grade?${q}`)]); } catch (e) { return erro(e); }
    const doModelo = todos.filter((x) => x.nome === p.nome && (x.referencia || '') === (p.referencia || ''));
    const vars = doModelo.length ? doModelo : [p];
    const p0 = vars.find((x) => x.foto_versao) || p;
    const admin = U.sessao.ehAdmin();
    const dias = Math.max(0, Math.floor((Date.now() - new Date(String(f.criado_em).replace(' ', 'T')).getTime()) / 864e5));
    const diasTxt = dias === 0 ? 'hoje' : dias === 1 ? '1 dia' : dias < 60 ? `${dias} dias` : `${Math.round(dias / 30)} meses`;
    const ultima = f.ultima_venda ? Math.max(0, Math.floor((Date.now() - new Date(f.ultima_venda.replace(' ', 'T')).getTime()) / 864e5)) : null;
    const lucro = p0.preco_custo > 0 ? p0.preco_venda - p0.preco_custo : null;
    const margem = lucro !== null && p0.preco_venda ? Math.round((lucro / p0.preco_venda) * 100) : null;
    const classe = (c) => (!c ? 'vazia' : c.estoque <= 0 ? 'zero' : c.estoque <= c.minimo ? 'baixo' : 'ok');
    const semCor = g.cores.length === 1 && g.cores[0] === '—';
    const corpo = abrirModal('Ficha da peça', `
      <div class="pf">
        <div class="pf-foto">${U.miniatura(p0, 'pf-img')}<div class="pr-selos pr-selos-foto">${selosHtml(p0)}</div></div>
        <div class="pf-info">
          <small class="pf-cat">${esc([p0.categoria, p0.marca, f.referencia && `Ref ${f.referencia}`].filter(Boolean).join(' · '))}</small>
          <h2>${esc(f.nome)}</h2>
          <div class="pf-preco">${p0.preco_anterior > p0.preco_venda ? `<s>${brl(p0.preco_anterior)}</s>` : ''}<b>${brl(p0.preco_venda)}</b></div>
          <div class="pf-nums">
            <div><small>Vendeu em 30 dias</small><b>${f.vendidas_30} <span>peça${f.vendidas_30 === 1 ? '' : 's'}</span></b><em>${brl(f.total_30)}</em></div>
            <div><small>Na loja há</small><b>${diasTxt}</b><em>${ultima === null ? 'ainda não vendeu' : ultima === 0 ? 'vendeu hoje' : `última venda há ${ultima} dia(s)`}</em></div>
            ${admin ? `<div><small>Lucro por peça</small><b class="${margem !== null && margem < 30 ? 'txt-perigo' : 'txt-ok'}">${lucro === null ? '—' : brl(lucro)}</b><em>${margem === null ? 'sem custo cadastrado' : `margem de ${margem}%`}</em></div>` : ''}
            <div><small>Em estoque</small><b>${g.total} <span>peça${g.total === 1 ? '' : 's'}</span></b><em>${brl(g.total * p0.preco_venda)}</em></div>
          </div>
          <h4>Tamanhos e cores</h4>
          <div class="pf-grade" style="--cols:${g.tamanhos.length}">
            ${semCor ? '' : '<span></span>'}${g.tamanhos.map((t) => `<span class="pf-th">${esc(t)}</span>`).join('')}
            ${g.cores.map((cor) => `${semCor ? '' : `<span class="pf-cor">${bolinha(cor)}${esc(cor)}</span>`}${g.tamanhos.map((t) => {
    const c = g.celulas[`${cor}|${t}`];
    return `<span class="pf-cel ${classe(c)}" title="${c ? `${c.estoque} peça(s)` : 'não cadastrado'}">${c ? c.estoque : '·'}</span>`;
  }).join('')}`).join('')}
          </div>
          ${f.por_tamanho.length ? `<p class="pf-sai">Sai mais: ${f.por_tamanho.slice(0, 4).map((x) => `<b>${esc(x.tamanho)}</b> (${x.pecas})`).join(' · ')}</p>` : ''}
          <h4>Vendas nas últimas 8 semanas</h4>
          ${f.semanas.some((n) => n) ? Graficos.colunas(f.semanas.map((n, i) => ({ rotulo: i === 7 ? 'esta' : `${7 - i}s`, valor: n, destaque: i === 7,
    dica: `${i === 7 ? 'Esta semana' : `${7 - i} semana(s) atrás`}: ${n} peça(s)` })), { altura: 90, formato: (n) => `${Math.round(n)}` })
    : '<p class="dica">Ainda não vendeu nas últimas 8 semanas.</p>'}
        </div>
      </div>
      <div class="acoes pf-acoes">
        <button class="btn" id="pf-etq">${Icone('etiqueta')} Etiquetas</button>
        <button class="btn" id="pf-zap">${Icone('whatsapp')} Avisar clientes</button>
        <button class="btn so-admin" id="pf-grade">${Icone('grade')} Estoque por tamanho</button>
        <button class="btn btn-primario so-admin" id="pf-editar">${Icone('lapis')} Editar</button>
      </div>`, { largura: '900px', classe: 'modal-ficha-produto' });
    corpo.querySelector('#pf-editar').onclick = () => formulario(p);
    corpo.querySelector('#pf-grade').onclick = () => grade(p);
    corpo.querySelector('#pf-zap').onclick = () => {
      const comPeca = vars.filter((x) => x.estoque > 0);
      Interessadas.abrir((comPeca.length ? comPeca : vars).map((x) => x.id));
    };
    corpo.querySelector('#pf-etq').onclick = () => {
      const comPeca = vars.filter((x) => x.estoque > 0 && !x.servico);
      if (!comPeca.length) return aviso('Este modelo não tem peças em estoque.', 'alerta');
      comPeca.forEach((x) => Telas.etiquetas.adicionar(x, x.preco_unico ? 1 : x.estoque));
      U.avisoAcao(`Etiquetas de "${f.nome}" na fila.`, 'Ver fila', () => { location.hash = '#/etiquetas'; });
    };
  }

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
      <div id="est-etq">${Telas.etiquetas.escolhaHtml()}</div>
      <h3>Histórico</h3>
      <div class="tabela-rolagem baixa"><table class="tabela"><tbody id="movs"></tbody></table></div>`, { largura: '720px' });
    Telas.etiquetas.ligarEscolha(corpo);
    // A escolha das etiquetas só vale para entrada.
    corpo.querySelector('[name=tipo]').onchange = (ev) => { corpo.querySelector('#est-etq').hidden = ev.target.value !== 'entrada'; };
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
        if (d.tipo === 'entrada') avisoEntrada(`Estoque de "${p.nome}" agora é ${atualizado.estoque}.`, [{ produto: atualizado, quantidade: Number(d.quantidade) }]);
        else aviso(`Estoque de "${p.nome}" agora é ${atualizado.estoque}.`);
        fecharModal();
        if (d.tipo === 'entrada') Telas.etiquetas.depoisDaEntrada([{ produto: atualizado, quantidade: Number(d.quantidade) }]);
        if (raiz) carregar();
      } catch (e) { erro(e); }
    };
  }

  return { abrir, formulario, sair: () => { raiz = null; } };
})();
