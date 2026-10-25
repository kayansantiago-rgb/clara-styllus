/*
 * Editor da etiqueta: arrasta, aumenta e diminui cada item (logo, nome, preço, código de barras,
 * textos, linhas, imagens), escolhe fonte, tamanho, negrito, alinhamento e quando cada item aparece.
 * O desenho é o mesmo que vai para a impressora (EtiquetaLayout).
 */
Telas['editor-etiqueta'] = (() => {
  const { esc, api, aviso, erro, local } = U;
  const L = EtiquetaLayout;
  const PASSO = 0.25; // mm (encaixe ao arrastar e setas do teclado)
  const EXEMPLO = {
    id: 0, nome: 'Vestido Midi Canelado', tamanho: 'M', cor: 'Preto', referencia: '1020', categoria: 'Vestidos',
    preco_venda: 15990, preco_anterior: null, codigo: '2000000000015',
  };

  let raiz = null;
  let cfg = {};
  let layout = null;
  let sel = null; // id do item escolhido
  let produto = EXEMPLO;
  let pxmm = 16;
  let historico = [];
  let refazer = [];
  let alterado = false;
  let verImpressora = false;
  let liquidacao = false;

  const W = () => L.tamanho(cfg).w;
  const H = () => L.tamanho(cfg).h;
  const item = () => layout.elementos.find((e) => e.id === sel) || null;
  const arred = (v) => Math.round(v / PASSO) * PASSO;
  const num = (v, casas = 2) => Number(v.toFixed(casas));
  const produtoVisto = () => (liquidacao
    ? { ...produto, preco_anterior: Math.round((produto.preco_venda * 1.4) / 100) * 100 } : produto);

  function guardar() {
    historico.push(JSON.stringify(layout));
    if (historico.length > 80) historico.shift();
    refazer = [];
    marcarAlterado();
  }
  function marcarAlterado() {
    alterado = true;
    const b = raiz && raiz.querySelector('#ee-salvar');
    if (b) b.classList.add('pulsar');
    const s = raiz && raiz.querySelector('#ee-status');
    if (s) s.textContent = 'Alterações não salvas';
  }
  function desfazer() {
    if (!historico.length) return;
    refazer.push(JSON.stringify(layout));
    layout = JSON.parse(historico.pop());
    if (!item()) sel = null;
    marcarAlterado();
    tudo();
  }
  function refaz() {
    if (!refazer.length) return;
    historico.push(JSON.stringify(layout));
    layout = JSON.parse(refazer.pop());
    if (!item()) sel = null;
    marcarAlterado();
    tudo();
  }

  // ------------------------------------------------------------ tela
  async function abrir(el) {
    raiz = el;
    cfg = await U.config(true);
    layout = JSON.parse(JSON.stringify(L.ler(cfg)));
    sel = null;
    historico = [];
    refazer = [];
    alterado = false;
    const f = local.ler('fila_etiquetas', []);
    produto = (f[0] && f[0].produto) || EXEMPLO;
    raiz.innerHTML = `
      <div class="cabecalho-tela ee-cab">
        <div><h1>Editor de etiqueta</h1>
          <p class="subtitulo">Arraste os itens, mude o tamanho pelos cantinhos e escolha a letra ao lado. Etiqueta de
            <b>${esc(W())} × ${esc(H())} mm</b> <small>(o tamanho muda em <a href="#/config?aba=impressoras">Configurações → Impressoras</a>)</small></p></div>
        <div class="ee-acoes-topo">
          <span class="ee-status" id="ee-status"></span>
          <a class="btn" href="#/etiquetas">← Voltar</a>
          <button class="btn" id="ee-teste">${Icone('impressora')} Imprimir teste</button>
          <button class="btn btn-primario" id="ee-salvar">${Icone('check')} Salvar e usar esta etiqueta</button>
        </div>
      </div>
      <div class="ee">
        <div class="ee-ferramentas" id="ee-add">
          <span class="ee-ferr-tit">Adicionar</span>
          <button class="btn btn-peq" data-add="texto">${Icone('lapis')} Texto</button>
          <label class="ee-campo-add"><select id="ee-add-campo"><option value="">${'+ Campo da peça…'}</option>
            ${L.CAMPOS.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></label>
          <button class="btn btn-peq" data-add="logo">${Icone('estrela')} Logo</button>
          <button class="btn btn-peq" data-add="cs">CS Monograma</button>
          <button class="btn btn-peq" data-add="barras">${Icone('codigo')} Código de barras</button>
          <button class="btn btn-peq" data-add="linha">— Linha</button>
          <button class="btn btn-peq" data-add="caixa">▢ Moldura</button>
          <label class="btn btn-peq">${Icone('imagem')} Imagem…<input type="file" id="ee-img" accept="image/*" hidden></label>
          <span class="ee-sep"></span>
          <button class="btn btn-peq" id="ee-desfazer" title="Desfazer (Ctrl+Z)">↶ Desfazer</button>
          <button class="btn btn-peq" id="ee-refazer" title="Refazer (Ctrl+Y)">↷ Refazer</button>
          <label class="ee-modelo"><select id="ee-modelo"><option value="">Recomeçar de um modelo…</option>
            <option value="padrao">Padrão</option><option value="preco">Preço em destaque</option><option value="parcelado">Parcelado</option></select></label>
        </div>
        <div class="ee-meio">
          <div class="ee-palco" id="ee-palco">
            <div class="ee-folha" id="ee-folha"><canvas id="ee-canvas"></canvas><div class="ee-camada" id="ee-camada"></div></div>
          </div>
          <div class="ee-rodape">
            <label class="ee-peca">${Icone('codigo')}<input id="ee-peca" placeholder="Ver com outra peça: bipe ou digite o código e Enter"></label>
            <label class="check"><input type="checkbox" id="ee-liq"> Ver em liquidação (com "De")</label>
            <label class="check"><input type="checkbox" id="ee-imp"> Ver como a impressora imprime</label>
          </div>
          <p class="dica ee-dica">Dica: clique num item e use as <kbd>setas</kbd> para mover devagar (<kbd>Shift</kbd> = mais rápido),
            <kbd>Delete</kbd> apaga, <kbd>Ctrl</kbd>+<kbd>D</kbd> duplica, <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfaz.</p>
        </div>
        <aside class="ee-painel" id="ee-painel"></aside>
      </div>`;

    raiz.querySelector('#ee-add').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-add]');
      if (!b) return;
      const t = b.dataset.add;
      if (t === 'logo') adicionarItem(L.novo('imagem', cfg, { src: 'logo' }));
      else if (t === 'cs') adicionarItem(L.novo('imagem', cfg, { src: 'cs', w: 7, h: 6 }));
      else adicionarItem(L.novo(t, cfg));
    });
    raiz.querySelector('#ee-add-campo').onchange = (ev) => {
      const k = ev.target.value;
      ev.target.value = '';
      if (!k) return;
      const grande = k === 'preco' || k === 'parcela';
      const texto = k === 'parcela' ? '{parcelas}x de {parcela}' : k === 'preco_de' ? 'De {preco_de}' : `{${k}}`;
      adicionarItem(L.novo('texto', cfg, {
        texto, tam: grande ? 15 : 8, h: grande ? 6 : 3.6, negrito: grande || k === 'nome',
        riscado: k === 'preco_de', quando: k === 'preco_de' ? 'liquidacao' : k === 'parcela' ? 'parcelado' : 'sempre',
      }));
    };
    raiz.querySelector('#ee-img').onchange = (ev) => {
      const arq = ev.target.files[0];
      ev.target.value = '';
      if (!arq) return;
      const url = URL.createObjectURL(arq);
      const img = new Image();
      img.onload = () => {
        // Guarda pequena (cabe na configuração): no máximo 480 px.
        const f = Math.min(1, 480 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * f);
        c.height = Math.round(img.height * f);
        const x = c.getContext('2d');
        x.fillStyle = '#fff';
        x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const src = c.toDataURL('image/png');
        const alt = Math.min(H() - 2, 10);
        L.imagem(src).then(() => adicionarItem(L.novo('imagem', cfg, { src, h: alt, w: Math.min(W() - 2, (alt * c.width) / c.height) })));
      };
      img.onerror = () => aviso('Não consegui abrir essa imagem.', 'erro');
      img.src = url;
    };
    raiz.querySelector('#ee-desfazer').onclick = desfazer;
    raiz.querySelector('#ee-refazer').onclick = refaz;
    raiz.querySelector('#ee-modelo').onchange = async (ev) => {
      const m = ev.target.value;
      ev.target.value = '';
      if (!m) return;
      if (!await U.confirmar('Recomeçar de um modelo?', 'A etiqueta atual será trocada pelo modelo escolhido (dá para desfazer).', { ok: 'Recomeçar' })) return;
      guardar();
      layout = L.modelo(m, cfg);
      sel = null;
      await L.pronto(layout);
      tudo();
    };
    raiz.querySelector('#ee-liq').onchange = (ev) => { liquidacao = ev.target.checked; desenhar(); };
    raiz.querySelector('#ee-imp').onchange = (ev) => { verImpressora = ev.target.checked; desenhar(); };
    raiz.querySelector('#ee-peca').addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      const q = ev.target.value.trim();
      if (!q) return;
      try {
        let p;
        try { p = await api(`/api/produtos/codigo/${encodeURIComponent(q)}`); } catch (e) {
          if (e.status !== 404) throw e;
          const lista = await api(`/api/produtos?q=${encodeURIComponent(q)}&limite=1`);
          if (!lista.length) return aviso('Nenhum produto encontrado.', 'erro');
          p = lista[0];
        }
        produto = p;
        ev.target.value = '';
        desenhar();
        aviso(`Mostrando: ${p.nome}`);
      } catch (e) { erro(e); }
    });
    raiz.querySelector('#ee-salvar').onclick = salvar;
    raiz.querySelector('#ee-teste').onclick = async () => {
      await L.pronto(layout);
      Impressao.etiquetas([{ produto: produtoVisto(), quantidade: 1 }], { layout });
    };
    ligarPalco();
    document.addEventListener('keydown', teclas);
    window.addEventListener('resize', ajustarZoom);
    await L.pronto(layout);
    ajustarZoom();
    tudo();
  }

  function sair() {
    document.removeEventListener('keydown', teclas);
    window.removeEventListener('resize', ajustarZoom);
    raiz = null;
  }

  async function salvar() {
    try {
      await api('/api/config', { metodo: 'PUT', corpo: { etiqueta_layout: JSON.stringify(layout), etiqueta_modelo: 'personalizado' } });
      cfg = await U.config(true);
      historico = historico.slice(-80);
      alterado = false;
      raiz.querySelector('#ee-salvar').classList.remove('pulsar');
      raiz.querySelector('#ee-status').textContent = 'Salva ✓';
      aviso('Etiqueta salva. Ela já é usada nas próximas impressões.');
    } catch (e) { erro(e); }
  }

  function adicionarItem(e) {
    guardar();
    layout.elementos.push(e);
    sel = e.id;
    L.pronto(layout).then(tudo);
  }

  // ------------------------------------------------------------ desenho
  function ajustarZoom() {
    if (!raiz) return;
    const palco = raiz.querySelector('#ee-palco');
    const livreW = palco.clientWidth - 60;
    const livreH = Math.max(260, window.innerHeight - palco.getBoundingClientRect().top - 120);
    pxmm = Math.max(6, Math.min(24, livreW / W(), livreH / H()));
    desenhar();
  }

  function tudo() {
    desenhar();
    painel();
  }

  function desenhar() {
    if (!raiz) return;
    const cv = raiz.querySelector('#ee-canvas');
    const dpr = window.devicePixelRatio || 1;
    const larg = W() * pxmm;
    const alt = H() * pxmm;
    cv.style.width = `${larg}px`;
    cv.style.height = `${alt}px`;
    raiz.querySelector('#ee-folha').style.width = `${larg}px`;
    raiz.querySelector('#ee-folha').style.height = `${alt}px`;
    if (verImpressora) {
      const c = L.canvasImpressora(layout, produtoVisto(), cfg);
      cv.width = c.width;
      cv.height = c.height;
      cv.getContext('2d').drawImage(c, 0, 0);
      cv.style.imageRendering = 'pixelated';
    } else {
      cv.width = Math.round(larg * dpr);
      cv.height = Math.round(alt * dpr);
      cv.style.imageRendering = '';
      L.desenhar(cv.getContext('2d'), layout, produtoVisto(), cfg, pxmm * dpr);
    }
    // Caixinhas por cima de cada item: clicar, arrastar e os cantinhos de tamanho.
    const d = L.dados(produtoVisto(), cfg);
    raiz.querySelector('#ee-camada').innerHTML = layout.elementos.map((e) => {
      const oculto = e.tipo === 'texto' && L.textoFinal(e, d) === null;
      return `<div class="ee-item ${e.id === sel ? 'sel' : ''} ${oculto ? 'oculto' : ''}" data-id="${e.id}"
        style="left:${e.x * pxmm}px;top:${e.y * pxmm}px;width:${Math.max(4, e.w * pxmm)}px;height:${Math.max(4, e.h * pxmm)}px"
        title="${esc(nomeItem(e))}${oculto ? ' (não aparece nesta peça)' : ''}">
        ${e.id === sel ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => `<i class="ee-alca ${h}" data-alca="${h}"></i>`).join('') : ''}
      </div>`;
    }).join('') + '<div class="ee-guia" id="ee-guia" hidden></div>';
  }

  function nomeItem(e) {
    if (e.tipo === 'texto') return `Texto: ${String(e.texto || '').replace(/\{(\w+)\}/g, (m, k) => `[${(L.CAMPOS.find((c) => c[0] === k) || [0, k])[1]}]`)}`;
    if (e.tipo === 'imagem') return e.src === 'logo' ? 'Logo da loja' : e.src === 'cs' ? 'Monograma CS' : 'Imagem';
    return { barras: 'Código de barras', linha: 'Linha', caixa: 'Moldura' }[e.tipo] || e.tipo;
  }

  // ------------------------------------------------------------ arrastar e redimensionar
  function ligarPalco() {
    const camada = raiz.querySelector('#ee-camada');
    raiz.querySelector('#ee-palco').addEventListener('pointerdown', (ev) => {
      if (!ev.target.closest('.ee-item')) { sel = null; tudo(); }
    });
    camada.addEventListener('pointerdown', (ev) => {
      const box = ev.target.closest('.ee-item');
      if (!box) return;
      ev.preventDefault();
      ev.stopPropagation();
      const id = box.dataset.id;
      const alca = ev.target.dataset.alca || null;
      if (sel !== id) { sel = id; tudo(); }
      const e = item();
      const ini = { x: e.x, y: e.y, w: e.w, h: e.h, px: ev.clientX, py: ev.clientY };
      let mexeu = false;
      const guia = () => raiz && raiz.querySelector('#ee-guia');
      const mover = (mv) => {
        const dx = (mv.clientX - ini.px) / pxmm;
        const dy = (mv.clientY - ini.py) / pxmm;
        if (!mexeu && Math.abs(dx) + Math.abs(dy) < 0.15) return;
        if (!mexeu) { guardar(); mexeu = true; }
        const min = e.tipo === 'linha' ? 0.2 : 1;
        if (!alca) {
          e.x = arred(ini.x + dx);
          e.y = arred(ini.y + dy);
          // Ímã no meio da etiqueta (fica centralizado fácil).
          const meio = W() / 2;
          const g = guia();
          if (Math.abs(e.x + e.w / 2 - meio) < 0.6) {
            e.x = num(meio - e.w / 2);
            if (g) { g.hidden = false; g.style.left = `${meio * pxmm}px`; }
          } else if (g) g.hidden = true;
        } else {
          if (alca.includes('e')) e.w = Math.max(min, arred(ini.w + dx));
          if (alca.includes('s')) e.h = Math.max(min / (e.tipo === 'linha' ? 1 : 1), arred(ini.h + dy));
          if (alca.includes('w')) { const w = Math.max(min, arred(ini.w - dx)); e.x = num(ini.x + ini.w - w); e.w = w; }
          if (alca.includes('n')) { const h = Math.max(min, arred(ini.h - dy)); e.y = num(ini.y + ini.h - h); e.h = h; }
        }
        desenhar();
        const g2 = guia();
        if (g2 && !alca && Math.abs(e.x + e.w / 2 - W() / 2) < 0.01) { g2.hidden = false; g2.style.left = `${(W() / 2) * pxmm}px`; }
        atualizarPosicao();
      };
      const soltar = () => {
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', soltar);
        const g = guia();
        if (g) g.hidden = true;
      };
      window.addEventListener('pointermove', mover);
      window.addEventListener('pointerup', soltar);
    });
  }

  function teclas(ev) {
    if (!raiz) return;
    const dentroCampo = ev.target.closest && ev.target.closest('input, textarea, select');
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !dentroCampo) { ev.preventDefault(); return ev.shiftKey ? refaz() : desfazer(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y' && !dentroCampo) { ev.preventDefault(); return refaz(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); return salvar(); }
    const e = item();
    if (!e || dentroCampo || document.querySelector('.modal-fundo:not([hidden])')) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { ev.preventDefault(); return duplicar(); }
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); return apagar(); }
    if (ev.key === 'Escape') { sel = null; return tudo(); }
    const passo = ev.shiftKey ? 1 : PASSO;
    const mv = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[ev.key];
    if (!mv) return;
    ev.preventDefault();
    if (!ev.repeat) guardar();
    e.x = num(e.x + mv[0]);
    e.y = num(e.y + mv[1]);
    desenhar();
    atualizarPosicao();
  }

  function duplicar() {
    const e = item();
    if (!e) return;
    const c = { ...JSON.parse(JSON.stringify(e)), id: `e${Date.now().toString(36)}d`, x: num(e.x + 1), y: num(e.y + 1) };
    adicionarItem(c);
  }
  function apagar() {
    const e = item();
    if (!e) return;
    guardar();
    layout.elementos = layout.elementos.filter((x) => x !== e);
    sel = null;
    tudo();
  }

  // ------------------------------------------------------------ painel de propriedades
  function atualizarPosicao() {
    const e = item();
    if (!e || !raiz) return;
    for (const k of ['x', 'y', 'w', 'h']) {
      const inp = raiz.querySelector(`#ee-painel [data-prop="${k}"]`);
      if (inp && document.activeElement !== inp) inp.value = num(e[k], 2);
    }
  }

  function painel() {
    const p = raiz && raiz.querySelector('#ee-painel');
    if (!p) return;
    const e = item();
    const lista = `
      <div class="ee-bloco"><h4>Itens da etiqueta</h4>
        <div class="ee-lista">${layout.elementos.map((x, i) => `<button class="ee-li ${x.id === sel ? 'sel' : ''}" data-escolher="${x.id}">
          <span>${esc(nomeItem(x))}${x.quando && x.quando !== 'sempre' ? `<em>${esc(L.QUANDO[x.quando] || '')}</em>` : ''}</span><small>${i + 1}</small></button>`).join('') || '<small>Nenhum item. Use "Adicionar" acima.</small>'}</div></div>`;
    if (!e) {
      p.innerHTML = `<div class="ee-bloco ee-nada"><b>Clique num item da etiqueta</b><small>para mudar texto, letra, tamanho e posição.</small></div>${lista}`;
      ligarPainel(p, null);
      return;
    }
    const pos = `
      <div class="ee-grade4">
        <label>Da esquerda<input data-prop="x" type="number" step="0.25" value="${num(e.x)}"><small>mm</small></label>
        <label>Do topo<input data-prop="y" type="number" step="0.25" value="${num(e.y)}"><small>mm</small></label>
        <label>Largura<input data-prop="w" type="number" step="0.25" min="0.2" value="${num(e.w)}"><small>mm</small></label>
        <label>Altura<input data-prop="h" type="number" step="0.25" min="0.2" value="${num(e.h)}"><small>mm</small></label>
      </div>
      <div class="ee-linha-bot">
        <button class="btn btn-peq" data-acao="centro" title="Centralizar na largura">↔ Centralizar</button>
        <button class="btn btn-peq" data-acao="frente" title="Trazer para a frente">⇡ Frente</button>
        <button class="btn btn-peq" data-acao="duplicar">⧉ Duplicar</button>
        <button class="btn btn-peq btn-perigo-leve" data-acao="apagar">${Icone('lixeira')} Apagar</button>
      </div>`;
    let props = '';
    if (e.tipo === 'texto') {
      props = `
        <label class="ee-texto">Texto
          <textarea data-prop="texto" rows="2">${esc(e.texto)}</textarea></label>
        <div class="ee-chips"><small>Inserir campo:</small>${L.CAMPOS.map(([k, n]) => `<button class="ee-chip" data-campo="${k}" title="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        <div class="ee-grade2">
          <label>Letra<select data-prop="fonte">${Object.entries(L.FONTES).map(([k, f]) => `<option value="${k}" ${e.fonte === k ? 'selected' : ''} style="font-family:${esc(f.css)}">${esc(f.nome)}</option>`).join('')}</select></label>
          <label>Tamanho<span class="ee-tam"><button class="mini" data-tam="-1">−</button><input data-prop="tam" type="number" step="0.5" min="3" max="80" value="${num(e.tam, 1)}"><button class="mini" data-tam="1">+</button></span></label>
        </div>
        <div class="ee-toggles">
          <button class="ee-tog ${e.negrito ? 'on' : ''}" data-tog="negrito" title="Negrito"><b>N</b></button>
          <button class="ee-tog ${e.riscado ? 'on' : ''}" data-tog="riscado" title="Riscado"><s>R$</s></button>
          <button class="ee-tog ${e.maiusculas ? 'on' : ''}" data-tog="maiusculas" title="Tudo maiúsculo">AA</button>
          <span class="ee-sep"></span>
          ${[['esquerda', '⇤'], ['centro', '↔'], ['direita', '⇥']].map(([k, s]) => `<button class="ee-tog ${(e.alinhar || 'centro') === k ? 'on' : ''}" data-alinhar="${k}" title="Alinhar ${k}">${s}</button>`).join('')}
        </div>
        <label>Quando aparece<select data-prop="quando">${Object.entries(L.QUANDO).map(([k, n]) => `<option value="${k}" ${(e.quando || 'sempre') === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-check="encolher" ${e.encolher !== false ? 'checked' : ''}> Diminuir a letra se o texto não couber</label>`;
    } else if (e.tipo === 'barras') {
      props = `<label class="check"><input type="checkbox" data-check="numero" ${e.numero ? 'checked' : ''}> Mostrar o número embaixo</label>
        <p class="dica">As barras ficam na largura que a impressora imprime com nitidez. Deixe o código com pelo menos 7 mm de altura para o leitor bipar fácil.</p>`;
    } else if (e.tipo === 'imagem') {
      props = `<p class="dica">A imagem mantém o formato dentro da caixa. Sai em preto e branco.</p>
        <label>Imagem<select data-prop="src">
          <option value="logo" ${e.src === 'logo' ? 'selected' : ''}>Logo da loja (CS + nome)</option>
          <option value="cs" ${e.src === 'cs' ? 'selected' : ''}>Monograma CS</option>
          ${e.src !== 'logo' && e.src !== 'cs' ? '<option value="__propria" selected>Imagem escolhida</option>' : ''}</select></label>`;
    } else if (e.tipo === 'caixa') {
      props = `<label>Espessura da borda<span class="ee-tam"><input data-prop="espessura" type="number" step="0.1" min="0.1" max="3" value="${num(e.espessura || 0.3, 1)}"><small>mm</small></span></label>`;
    } else if (e.tipo === 'linha') {
      props = '<p class="dica">Para engrossar a linha, aumente a altura (ou a largura, para linha em pé).</p>';
    }
    p.innerHTML = `<div class="ee-bloco"><h4>${esc(nomeItem(e).split(':')[0])}</h4>${props}${pos}</div>${lista}`;
    ligarPainel(p, e);
  }

  function ligarPainel(p, e) {
    p.onclick = (ev) => {
      const esc2 = ev.target.closest('[data-escolher]');
      if (esc2) { sel = esc2.dataset.escolher; return tudo(); }
      if (!e) return;
      const campo = ev.target.closest('[data-campo]');
      if (campo) {
        guardar();
        const ta = p.querySelector('[data-prop="texto"]');
        const ins = `{${campo.dataset.campo}}`;
        const ini = ta.selectionStart ?? ta.value.length;
        const fim = ta.selectionEnd ?? ta.value.length;
        e.texto = ta.value.slice(0, ini) + ins + ta.value.slice(fim);
        ta.value = e.texto;
        ta.focus();
        ta.setSelectionRange(ini + ins.length, ini + ins.length);
        return desenhar();
      }
      const tog = ev.target.closest('[data-tog]');
      if (tog) { guardar(); e[tog.dataset.tog] = !e[tog.dataset.tog]; return tudo(); }
      const al = ev.target.closest('[data-alinhar]');
      if (al) { guardar(); e.alinhar = al.dataset.alinhar; return tudo(); }
      const tam = ev.target.closest('[data-tam]');
      if (tam) { guardar(); e.tam = Math.max(3, num((Number(e.tam) || 9) + Number(tam.dataset.tam), 1)); return tudo(); }
      const ac = ev.target.closest('[data-acao]');
      if (!ac) return;
      if (ac.dataset.acao === 'apagar') return apagar();
      if (ac.dataset.acao === 'duplicar') return duplicar();
      guardar();
      if (ac.dataset.acao === 'centro') e.x = num((W() - e.w) / 2);
      if (ac.dataset.acao === 'frente') layout.elementos = [...layout.elementos.filter((x) => x !== e), e];
      tudo();
    };
    if (!e) { p.oninput = null; p.onchange = null; return; }
    let guardou = false;
    p.oninput = (ev) => {
      const k = ev.target.dataset.prop;
      if (!k) return;
      if (!guardou) { guardar(); guardou = true; }
      const v = ev.target.value;
      if (['x', 'y', 'w', 'h', 'tam', 'espessura'].includes(k)) {
        if (v === '' || Number.isNaN(Number(v))) return;
        e[k] = Number(v);
      } else if (k === 'src') {
        if (v === '__propria') return;
        e.src = v;
        return L.pronto(layout).then(desenhar);
      } else e[k] = v;
      desenhar();
    };
    p.onchange = (ev) => {
      guardou = false;
      const c = ev.target.dataset.check;
      if (c) { guardar(); e[c] = ev.target.checked; desenhar(); }
      if (ev.target.dataset.prop === 'fonte') L.pronto(layout).then(desenhar);
    };
  }

  return { abrir, sair, temAlteracao: () => alterado };
})();
