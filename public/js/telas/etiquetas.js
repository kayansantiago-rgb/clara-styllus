/* Fila e impressão de etiquetas com código de barras. */
Telas.etiquetas = (() => {
  const { esc, brl, api, aviso, erro, local } = U;
  const CHAVE = 'fila_etiquetas';
  let raiz;
  let escolhida = 0; // peça da fila mostrada na prévia grande

  const fila = () => local.ler(CHAVE, []);
  const gravar = (f) => local.gravar(CHAVE, f);

  function adicionar(produto, quantidade = 1) {
    const f = fila();
    const ex = f.find((x) => x.produto.id === produto.id);
    if (ex) {
      ex.quantidade += quantidade;
      ex.produto = produto;
    } else f.push({ produto, quantidade });
    gravar(f);
    if (raiz) desenhar();
  }

  async function abrir(el) {
    raiz = el;
    const cfg = await U.config();
    const modelo = cfg.etiqueta_modelo || 'padrao';
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Etiquetas</h1><p class="subtitulo">Monte a fila, confira a etiqueta e imprima com código de barras.</p></div>
      </div>
      <div class="et">
        <section class="et-fila">
          <div class="busca-ico et-busca">${Icone('codigo')}<input id="q" placeholder="Bipe o código ou digite o nome da peça e Enter" autofocus autocomplete="off"></div>
          <div class="et-fila-cab"><b>Fila de impressão</b><button class="btn btn-fantasma btn-peq" id="limpar">${Icone('lixeira')} Limpar fila</button></div>
          <div class="et-lista" id="fila"></div>
          <button class="btn btn-primario btn-grande et-imprimir" id="imprimir">${Icone('impressora')} Imprimir</button>
        </section>
        <aside class="et-lado">
          <div class="cartao">
            <h3 class="titulo-ico">${Icone('etiqueta')} Como vai sair</h3>
            <div id="previa" class="previa-etiqueta et-previa"></div>
            <p class="dica">${esc(cfg.etiqueta_largura_mm)} × ${esc(cfg.etiqueta_altura_mm)} mm ·
              ${cfg.impressao_etiqueta_modo === 'navegador'
    ? (cfg.etiqueta_colunas === '1' ? 'rolo, pelo navegador' : `folha A4 com ${esc(cfg.etiqueta_colunas)} colunas`)
    : `${esc(cfg.etiqueta_colunas)} coluna(s) · ${(cfg.impressao_etiqueta_modo === 'zpl' && /knup|xprinter|gprinter|\btsc\b|hprt|idprt|beeprt|jadens|munbyn|rongta|etiquetadeira|etiquetadora/i.test(cfg.impressora_etiqueta || '') ? 'tspl' : cfg.impressao_etiqueta_modo).toUpperCase()}${cfg.impressora_etiqueta ? ' · ' + esc(cfg.impressora_etiqueta) : ' · <b class="txt-perigo">escolha a impressora em Configurações</b>'}`}</p>
            <div class="so-admin">
              <h4>Modelo da etiqueta</h4>
              <div class="et-modelos" id="modelos">
                ${[['padrao', 'Padrão', 'Loja, nome, tamanho e preço'], ['preco', 'Preço em destaque', 'Preço bem grande'],
    ['parcelado', 'Parcelado', 'Preço e "3x de R$ …" sem juros no cartão'], ['simples', 'Simples', 'Sem o nome da loja'],
    ['personalizado', 'Minha etiqueta', cfg.etiqueta_layout ? 'Feita no editor, do seu jeito' : 'Monte do seu jeito no editor']].map(([k, t, d]) =>
    `<button class="et-modelo ${k === modelo ? 'sel' : ''} ${k === 'personalizado' ? 'et-modelo-meu' : ''}" data-modelo="${k}"><b>${t}</b><small>${d}</small></button>`).join('')}
              </div>
              <a class="btn btn-grande et-editar" href="#/editor-etiqueta">${Icone('lapis')} Editar etiqueta (editor completo)</a>
              <label class="et-parcelas" id="et-parcelas" ${modelo === 'parcelado' ? '' : 'hidden'}>Parcelas na etiqueta
                <select id="parcelas">${Array.from({ length: 11 }, (_, i) => i + 2).filter((n) => !(Number(cfg.juros_a_partir) > 2) || n < Number(cfg.juros_a_partir)).map((n) =>
    `<option value="${n}" ${String(n) === String(cfg.etiqueta_parcelas || '3') ? 'selected' : ''}>${n}x sem juros</option>`).join('')}</select></label>
            </div>
          </div>
        </aside>
      </div>`;
    raiz.querySelector('#modelos').onclick = async (ev) => {
      const b = ev.target.closest('[data-modelo]');
      if (!b) return;
      // "Minha etiqueta" ainda não feita: abre o editor direto.
      if (b.dataset.modelo === 'personalizado' && !(await U.config()).etiqueta_layout) { location.hash = '#/editor-etiqueta'; return; }
      try {
        await api('/api/config', { metodo: 'PUT', corpo: { etiqueta_modelo: b.dataset.modelo } });
        await U.config(true);
        raiz.querySelectorAll('.et-modelo').forEach((x) => x.classList.toggle('sel', x === b));
        raiz.querySelector('#et-parcelas').hidden = b.dataset.modelo !== 'parcelado';
        desenhar();
      } catch (e) { erro(e); }
    };
    raiz.querySelector('#parcelas').onchange = async (ev) => {
      try {
        await api('/api/config', { metodo: 'PUT', corpo: { etiqueta_parcelas: ev.target.value } });
        await U.config(true);
        desenhar();
      } catch (e) { erro(e); }
    };
    raiz.querySelector('#q').addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      const q = ev.target.value.trim();
      if (!q) return;
      try {
        let p;
        try {
          p = await api(`/api/produtos/codigo/${encodeURIComponent(q)}`);
        } catch (e) {
          if (e.status !== 404) throw e;
          const lista = await api(`/api/produtos?q=${encodeURIComponent(q)}&limite=50`);
          if (!lista.length) return aviso('Nenhum produto encontrado.', 'erro');
          if (lista.length > 1) {
            lista.forEach((x) => adicionar(x, 1));
            aviso(`${lista.length} produtos adicionados (1 etiqueta cada). Ajuste as quantidades.`);
            ev.target.value = '';
            return;
          }
          p = lista[0];
        }
        adicionar(p, 1);
        ev.target.value = '';
      } catch (e) { erro(e); }
    });
    raiz.querySelector('#limpar').onclick = () => { gravar([]); desenhar(); };
    raiz.querySelector('#imprimir').onclick = imprimir;
    raiz.querySelector('#fila').addEventListener('input', (ev) => {
      const i = ev.target.dataset.i;
      if (i === undefined) return;
      const f = fila();
      f[i].quantidade = Math.max(0, Number(ev.target.value) || 0);
      gravar(f);
      atualizarBotao();
    });
    raiz.querySelector('#fila').addEventListener('click', (ev) => {
      const f = fila();
      const mv = ev.target.closest('[data-mais],[data-menos]');
      if (mv) {
        const i = Number(mv.dataset.mais ?? mv.dataset.menos);
        f[i].quantidade = Math.max(0, f[i].quantidade + (mv.dataset.mais !== undefined ? 1 : -1));
        gravar(f);
        raiz.querySelector(`input[data-i="${i}"]`).value = f[i].quantidade;
        atualizarBotao();
        return;
      }
      const mini = ev.target.closest('[data-mini]');
      if (mini) { escolhida = Number(mini.dataset.mini); desenhar(); return; }
      const b = ev.target.closest('[data-rm]');
      if (!b) return;
      f.splice(Number(b.dataset.rm), 1);
      if (escolhida >= f.length) escolhida = 0;
      gravar(f);
      desenhar();
    });
    desenhar();
  }

  async function desenhar() {
    const f = fila();
    raiz.querySelector('#fila').innerHTML = f.map((x, i) => `
      <div class="et-item">
        ${U.miniatura(x.produto, 'pr-foto')}
        <div class="p4-item-txt"><b>${esc(x.produto.nome)}</b>
          <span class="p4-tags">${x.produto.tamanho ? `<span class="p4-tag">Tam ${esc(x.produto.tamanho)}</span>` : ''}${x.produto.cor ? `<span class="p4-tag">${esc(x.produto.cor)}</span>` : ''}<small>${brl(x.produto.preco_venda)}</small></span></div>
        <span class="qtd-ctrl p4-qtd"><button class="mini" data-menos="${i}">${Icone('menos')}</button>
          <input type="number" min="0" class="et-qtd" data-i="${i}" value="${x.quantidade}"><button class="mini" data-mais="${i}">${Icone('mais')}</button></span>
        <div class="et-mini" data-mini="${i}" title="Como esta etiqueta vai sair (clique para ver grande)"></div>
        <button class="p4-remover" data-rm="${i}" title="Tirar da fila">${Icone('lixeira')}</button>
      </div>`).join('') || `<div class="p4-vazio">${Ilustracao.svg('etiqueta', 150)}<b>Fila vazia</b>
        <p>Bipe a peça acima, ou use o botão de etiqueta na tela de Produtos.<br>Ao cadastrar um produto, o sistema também oferece mandar as etiquetas para cá.</p></div>`;
    atualizarBotao();

    const cfg = await U.config();
    const exemplo = f[escolhida]?.produto || f[0]?.produto || { nome: 'Vestido Midi Canelado', tamanho: 'M', cor: 'Preto', referencia: '1020', preco_venda: 15990, codigo: '2000000000015' };
    const previa = raiz.querySelector('#previa');
    previa.innerHTML = `<div class="previa-folha" style="width:${cfg.etiqueta_largura_mm}mm;height:${cfg.etiqueta_altura_mm}mm"></div>`;
    ajustarPrevia(cfg);
    await pintarEtiqueta(previa.firstElementChild, exemplo, cfg, 16);
    // Miniatura de cada etiqueta da fila, do jeito que vai sair.
    const px = 96 / 25.4;
    const zoom = Math.min(0.62, 96 / ((Number(cfg.etiqueta_largura_mm) || 40) * px), 64 / ((Number(cfg.etiqueta_altura_mm) || 30) * px));
    for (const el of raiz.querySelectorAll('[data-mini]')) {
      const x = f[Number(el.dataset.mini)];
      if (!x) continue;
      el.classList.toggle('sel', Number(el.dataset.mini) === escolhida);
      el.innerHTML = `<div class="previa-folha" style="width:${cfg.etiqueta_largura_mm}mm;height:${cfg.etiqueta_altura_mm}mm;zoom:${zoom.toFixed(3)}"></div>`;
      await pintarEtiqueta(el.firstElementChild, x.produto, cfg, 8);
    }
  }

  /** Desenha a etiqueta de uma peça dentro de "folha" (modelo pronto ou "Minha etiqueta"). */
  async function pintarEtiqueta(folha, produto, cfg, escala) {
    if (EtiquetaLayout.ativo(cfg)) {
      const layout = EtiquetaLayout.ler(cfg);
      await EtiquetaLayout.pronto(layout);
      const c = EtiquetaLayout.canvas(layout, produto, cfg, escala);
      c.className = 'et-previa-canvas';
      folha.appendChild(c);
      return;
    }
    // Isola o CSS da etiqueta num shadow root para não afetar a página.
    const sombra = folha.attachShadow({ mode: 'open' });
    sombra.innerHTML = `<style>${Impressao.cssEtiquetas({ ...cfg, etiqueta_colunas: '2' }).replace(/@page[^}]*}/g, '')}
      .etq { outline: none; background: #fff; }</style>${Impressao.htmlEtiqueta(produto, cfg)}`;
  }

  /** Aumenta a prévia o quanto cabe no quadro (etiqueta de 40, 50, 60 mm… nunca passa da borda). */
  function ajustarPrevia(cfg) {
    const previa = raiz && raiz.querySelector('#previa');
    const folha = previa && previa.firstElementChild;
    if (!folha) return;
    const px = 96 / 25.4;
    const w = (Number(cfg.etiqueta_largura_mm) || 40) * px;
    const h = (Number(cfg.etiqueta_altura_mm) || 30) * px;
    const livre = previa.clientWidth - 52;
    folha.style.zoom = Math.max(0.5, Math.min(2.6, livre / w, 300 / h)).toFixed(3);
  }
  window.addEventListener('resize', U.debounce(async () => { if (raiz) ajustarPrevia(await U.config()); }, 150));

  function atualizarBotao() {
    const total = fila().reduce((a, x) => a + x.quantidade, 0);
    const btn = raiz.querySelector('#imprimir');
    btn.innerHTML = `${Icone('impressora')} Imprimir ${total} etiqueta${total === 1 ? '' : 's'}`;
    btn.disabled = !total;
  }

  async function imprimir() {
    const f = fila().filter((x) => x.quantidade > 0);
    if (!f.length) return aviso('A fila está vazia.', 'alerta');
    try {
      // Busca os dados atuais (preço pode ter mudado desde que entrou na fila).
      const atual = await Promise.all(f.map(async (x) => ({
        produto: await api(`/api/produtos/${x.produto.id}`),
        quantidade: x.quantidade,
      })));
      await Impressao.etiquetas(atual);
      if (await U.confirmar('Etiquetas', 'As etiquetas saíram certinho? Limpar a fila?', { ok: 'Sim, limpar' })) {
        gravar([]);
        if (raiz) desenhar();
      }
    } catch (e) { erro(e); }
  }

  // ------------------------------------------------- etiquetas ao dar entrada
  // O que fazer com as etiquetas quando chega mercadoria (cadastro novo ou entrada de estoque).
  // Fica lembrado neste computador: fila (padrão), imprimir na hora ou não fazer nada.
  const PREF = 'etiquetas_ao_entrar';
  const OPCOES_AUTO = [['fila', 'Mandar para a fila'], ['imprimir', 'Imprimir agora'], ['nao', 'Não']];
  const modoAuto = () => (OPCOES_AUTO.some(([k]) => k === local.ler(PREF, 'fila')) ? local.ler(PREF, 'fila') : 'fila');

  /** Escolha "Etiquetas: fila / imprimir agora / não" para colocar nos formulários de entrada. */
  function escolhaHtml({ curto = false } = {}) {
    const m = modoAuto();
    return `<div class="etq-auto" data-etq-auto><span>${Icone('etiqueta')} ${curto ? 'Etiquetas:' : 'Etiquetas das peças que chegaram:'}</span>
      <div class="segmentos">${OPCOES_AUTO.map(([k, t]) => `<button type="button" class="segmento ${k === m ? 'sel' : ''}" data-etq-modo="${k}">${curto ? { fila: 'Para a fila', imprimir: 'Imprimir já', nao: 'Não' }[k] : t}</button>`).join('')}</div></div>`;
  }
  function ligarEscolha(el) {
    const box = el.querySelector('[data-etq-auto]');
    if (!box) return;
    box.onclick = (ev) => {
      const b = ev.target.closest('[data-etq-modo]');
      if (!b) return;
      local.gravar(PREF, b.dataset.etqModo);
      box.querySelectorAll('[data-etq-modo]').forEach((x) => x.classList.toggle('sel', x === b));
    };
  }

  /** Depois da entrada: manda as etiquetas para a fila (com botão "imprimir agora") ou imprime direto. */
  async function depoisDaEntrada(lista) {
    lista = lista.filter((x) => x.produto && x.quantidade > 0 && !x.produto.servico);
    const total = lista.reduce((a, x) => a + x.quantidade, 0);
    if (!total) return;
    const m = modoAuto();
    if (m === 'nao') return;
    if (m === 'imprimir') { await Impressao.etiquetas(lista); return; }
    lista.forEach((x) => adicionar(x.produto, x.quantidade));
    U.avisoAcao(`${total} etiqueta(s) na fila de impressão.`, 'Imprimir agora', async () => {
      if (await Impressao.etiquetas(lista) === false) return;
      // Saíram: tira da fila o que acabou de imprimir.
      const f = fila();
      for (const x of lista) {
        const it = f.find((y) => y.produto.id === x.produto.id);
        if (it) it.quantidade = Math.max(0, it.quantidade - x.quantidade);
      }
      gravar(f.filter((y) => y.quantidade > 0));
      if (raiz) desenhar();
    });
  }

  return { abrir, adicionar, escolhaHtml, ligarEscolha, depoisDaEntrada, sair: () => { raiz = null; } };
})();
