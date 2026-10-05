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
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <h1>Etiquetas</h1>
        <div class="ferramentas">
          <input id="q" placeholder="Bipe o código ou digite o nome e Enter" autofocus>
          <button class="btn" id="limpar">Limpar fila</button>
          <button class="btn btn-primario" id="imprimir"><i data-icone="impressora"></i> Imprimir</button>
        </div>
      </div>
      <div class="duas-colunas">
        <div class="cartao">
          <table class="tabela">
            <thead><tr><th>Produto</th><th class="r">Preço</th><th class="c">Qtd. etiquetas</th><th></th></tr></thead>
            <tbody id="fila"></tbody>
          </table>
        </div>
        <div class="cartao">
          <h3>Pré-visualização</h3>
          <p class="dica">Etiqueta de ${esc(cfg.etiqueta_largura_mm)} × ${esc(cfg.etiqueta_altura_mm)} mm,
            ${cfg.impressao_etiqueta_modo === 'navegador'
    ? (cfg.etiqueta_colunas === '1' ? 'rolo, pelo navegador' : `folha A4 com ${esc(cfg.etiqueta_colunas)} colunas, pelo navegador`)
    : `rolo com ${esc(cfg.etiqueta_colunas)} coluna(s), direto na impressora (${cfg.impressao_etiqueta_modo.toUpperCase()}${cfg.impressora_etiqueta ? ' · ' + esc(cfg.impressora_etiqueta) : ' · escolha a impressora!'})`}.
            Mude em <a href="#/config">Configurações</a>.</p>
          <div id="previa" class="previa-etiqueta"></div>
        </div>
      </div>`;
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
      const b = ev.target.closest('[data-rm]');
      if (!b) return;
      const f = fila();
      f.splice(Number(b.dataset.rm), 1);
      gravar(f);
      desenhar();
    });
    desenhar();
  }

  async function desenhar() {
    const f = fila();
    raiz.querySelector('#fila').innerHTML = f.map((x, i) => `
      <tr>
        <td><b>${esc(x.produto.nome)}</b> ${esc([x.produto.tamanho, x.produto.cor].filter(Boolean).join(' · '))}
          <br><small>${esc(x.produto.codigo)}</small></td>
        <td class="r">${brl(x.produto.preco_venda)}</td>
        <td class="c"><input type="number" min="0" class="qtd-input" data-i="${i}" value="${x.quantidade}"></td>
        <td><button class="mini perigo" data-rm="${i}">×</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="vazio">Fila vazia. Bipe produtos aqui ou use <i data-icone="etiqueta"></i> na tela de Produtos.</td></tr>';
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
    raiz.querySelector('#imprimir').innerHTML = `<i data-icone="impressora"></i> Imprimir ${total} etiqueta${total === 1 ? '' : 's'}`;
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
