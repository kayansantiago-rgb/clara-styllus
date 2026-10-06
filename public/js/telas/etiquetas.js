/* Fila e impressão de etiquetas com código de barras. */
Telas.etiquetas = (() => {
  const { esc, brl, api, aviso, erro, local } = U;
  const CHAVE = 'fila_etiquetas';
  let raiz;

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
    : `${esc(cfg.etiqueta_colunas)} coluna(s) · ${cfg.impressao_etiqueta_modo.toUpperCase()}${cfg.impressora_etiqueta ? ' · ' + esc(cfg.impressora_etiqueta) : ' · <b class="txt-perigo">escolha a impressora em Configurações</b>'}`}</p>
            <div class="so-admin">
              <h4>Modelo da etiqueta</h4>
              <div class="et-modelos" id="modelos">
                ${[['padrao', 'Padrão', 'Loja, nome, tamanho e preço'], ['preco', 'Preço em destaque', 'Preço bem grande'],
    ['parcelado', 'Parcelado', 'Preço e "3x de R$ …" sem juros'], ['simples', 'Simples', 'Sem o nome da loja']].map(([k, t, d]) =>
    `<button class="et-modelo ${k === modelo ? 'sel' : ''}" data-modelo="${k}"><b>${t}</b><small>${d}</small></button>`).join('')}
              </div>
              <label class="et-parcelas" id="et-parcelas" ${modelo === 'parcelado' ? '' : 'hidden'}>Parcelas na etiqueta
                <select id="parcelas">${Array.from({ length: 11 }, (_, i) => i + 2).map((n) =>
    `<option value="${n}" ${String(n) === String(cfg.etiqueta_parcelas || '3') ? 'selected' : ''}>${n}x sem juros</option>`).join('')}</select></label>
            </div>
          </div>
        </aside>
      </div>`;
    raiz.querySelector('#modelos').onclick = async (ev) => {
      const b = ev.target.closest('[data-modelo]');
      if (!b) return;
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
      const b = ev.target.closest('[data-rm]');
      if (!b) return;
      f.splice(Number(b.dataset.rm), 1);
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
        <button class="p4-remover" data-rm="${i}" title="Tirar da fila">${Icone('lixeira')}</button>
      </div>`).join('') || `<div class="p4-vazio">${Ilustracao.svg('etiqueta', 150)}<b>Fila vazia</b>
        <p>Bipe a peça acima, ou use o botão de etiqueta na tela de Produtos.<br>Ao cadastrar um produto, o sistema também oferece mandar as etiquetas para cá.</p></div>`;
    atualizarBotao();

    const cfg = await U.config();
    const exemplo = f[0]?.produto || { nome: 'Vestido Midi Canelado', tamanho: 'M', cor: 'Preto', referencia: '1020', preco_venda: 15990, codigo: '2000000000015' };
    const previa = raiz.querySelector('#previa');
    previa.innerHTML = `<div class="previa-folha" style="width:${cfg.etiqueta_largura_mm}mm;height:${cfg.etiqueta_altura_mm}mm"></div>`;
    // Isola o CSS da etiqueta num shadow root para não afetar a página.
    const sombra = previa.firstElementChild.attachShadow({ mode: 'open' });
    sombra.innerHTML = `<style>${Impressao.cssEtiquetas({ ...cfg, etiqueta_colunas: '2' }).replace(/@page[^}]*}/g, '')}
      .etq { outline: none; background: #fff; }</style>${Impressao.htmlEtiqueta(exemplo, cfg)}`;
  }

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

  return { abrir, adicionar, sair: () => { raiz = null; } };
})();
