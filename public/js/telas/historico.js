/* Histórico de ações (administrador): quem cancelou, excluiu, deu desconto, mexeu no estoque… */
Telas.historico = (() => {
  const { esc, api, erro } = U;
  let raiz;
  let periodo = 'hoje';
  let tipo = '';

  const TIPOS = {
    venda: ['Vendas', 'recibo'], caixa: ['Caixa', 'carteira'], estoque: ['Estoque', 'caixa'], produto: ['Produtos', 'roupa'],
    crediario: ['Crediário', 'caderno'], troca: ['Trocas', 'troca'], condicional: ['Condicional', 'bolsa'], cliente: ['Clientes', 'clientes'],
    acesso: ['Acesso', 'chave'], usuario: ['Usuários', 'usuario'], config: ['Configurações', 'ajustes'], despesa: ['Despesas', 'carteira'],
  };
  const FILTROS = ['', 'venda', 'caixa', 'estoque', 'produto', 'crediario', 'acesso'];
  const PERIODOS = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Este mês'], ['outro', 'Escolher datas']];

  const iso = (d) => d.toLocaleDateString('sv-SE');
  function intervalo(p) {
    const h = new Date();
    const dia = (n) => { const d = new Date(h); d.setDate(d.getDate() + n); return iso(d); };
    if (p === '7d') return [dia(-6), dia(0)];
    if (p === 'mes') return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), dia(0)];
    return [dia(0), dia(0)];
  }

  async function abrir(el) {
    raiz = el;
    const [de, ate] = intervalo(periodo);
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Histórico de ações</h1>
          <p class="subtitulo">Quem fez o quê: cancelamentos, exclusões, descontos, estoque, caixa e acessos.</p></div>
        <div class="busca-ico">${Icone('busca')}<input id="q" type="search" placeholder="Buscar no histórico" autocomplete="off"></div>
      </div>
      <div class="vd-filtros">
        <div class="segmentos" id="periodos">${PERIODOS.map(([k, t]) => `<button class="segmento ${k === periodo ? 'sel' : ''}" data-periodo="${k}">${t}</button>`).join('')}</div>
        <div class="vd-datas" id="datas" ${periodo === 'outro' ? '' : 'hidden'}><input type="date" id="de" value="${de}"><span>até</span><input type="date" id="ate" value="${ate}"></div>
        <select id="usuario" class="hs-usuario"><option value="">Todas as pessoas</option></select>
      </div>
      <div class="vd-barra-filtros">
        <div class="chips-filtro" id="tipos">${FILTROS.map((k) => `<button class="chip-filtro ${k === tipo ? 'sel' : ''}" data-tipo="${k}">${k ? Icone(TIPOS[k][1]) + TIPOS[k][0] : 'Tudo'}</button>`).join('')}</div>
        <label class="interruptor vd-canceladas"><input type="checkbox" id="importantes"><span class="trilho"></span><span class="txt"><b>Só o que merece atenção</b></span></label>
      </div>
      <div id="lista" class="vd-lista"></div>`;
    raiz.querySelector('#periodos').onclick = (ev) => {
      const b = ev.target.closest('[data-periodo]');
      if (!b) return;
      periodo = b.dataset.periodo;
      raiz.querySelectorAll('.segmento').forEach((x) => x.classList.toggle('sel', x === b));
      raiz.querySelector('#datas').hidden = periodo !== 'outro';
      if (periodo !== 'outro') [raiz.querySelector('#de').value, raiz.querySelector('#ate').value] = intervalo(periodo);
      carregar();
    };
    raiz.querySelector('#tipos').onclick = (ev) => {
      const b = ev.target.closest('[data-tipo]');
      if (!b) return;
      tipo = b.dataset.tipo;
      raiz.querySelectorAll('.chip-filtro').forEach((x) => x.classList.toggle('sel', x === b));
      carregar();
    };
    for (const id of ['de', 'ate', 'usuario', 'importantes']) raiz.querySelector('#' + id).onchange = carregar;
    raiz.querySelector('#q').addEventListener('input', U.debounce(carregar, 250));
    await carregar();
  }

  async function carregar() {
    if (!raiz) return;
    const v = (id) => raiz.querySelector('#' + id).value;
    const qs = new URLSearchParams({ de: v('de'), ate: v('ate'), tipo, usuario: v('usuario'), q: v('q').trim(), importantes: raiz.querySelector('#importantes').checked ? '1' : '' });
    let r;
    try { r = await api('/api/auditoria?' + qs); } catch (e) { return erro(e); }
    const sel = raiz.querySelector('#usuario');
    const atual = sel.value;
    sel.innerHTML = '<option value="">Todas as pessoas</option>' + r.usuarios.map((u) => `<option ${u === atual ? 'selected' : ''}>${esc(u)}</option>`).join('');
    desenhar(r.itens);
  }

  function desenhar(itens) {
    const el = raiz.querySelector('#lista');
    if (!itens.length) {
      el.innerHTML = `<div class="vd-vazio">${Ilustracao.svg('relogio', 150)}<b>Nada registrado</b><br><small>Mude o período ou os filtros.</small></div>`;
      return;
    }
    const dias = new Map();
    for (const it of itens) {
      const d = it.criado_em.split(' ')[0];
      if (!dias.has(d)) dias.set(d, []);
      dias.get(d).push(it);
    }
    const hoje = U.hoje();
    el.innerHTML = [...dias.entries()].map(([d, lista]) => {
      const nome = d === hoje ? 'Hoje' : new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      const atencao = lista.filter((i) => i.importante).length;
      return `<section class="vd-dia">
        <header><b>${esc(nome.charAt(0).toUpperCase() + nome.slice(1))}</b>
          <span>${lista.length} registro(s)${atencao ? ` · <b class="txt-perigo">${atencao} para conferir</b>` : ''}</span></header>
        <div class="hs-linha-tempo">${lista.map(item).join('')}</div>
      </section>`;
    }).join('');
  }

  function item(i) {
    const [, ico] = TIPOS[i.tipo] || ['', 'relogio'];
    return `<div class="hs-item tipo-${esc(i.tipo)} ${i.importante ? 'importante' : ''}">
      <span class="hs-hora">${esc(i.criado_em.split(' ')[1].slice(0, 5))}</span>
      <span class="hs-ico">${Icone(ico)}</span>
      <div class="hs-txt"><b>${esc(i.acao)}</b>${i.importante ? '<span class="hs-atencao">atenção</span>' : ''}
        ${i.descricao ? `<small>${esc(i.descricao)}</small>` : ''}</div>
      <span class="hs-quem">${i.usuario ? `<span class="avatar">${esc(i.usuario.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase())}</span>${esc(i.usuario)}` : '<small>sem login</small>'}</span>
    </div>`;
  }

  return { abrir, sair: () => { raiz = null; } };
})();
