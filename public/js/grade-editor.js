/*
 * Editor de grade do cadastro de produtos: escolhe tamanhos e cores e digita a quantidade de
 * cada combinação numa tabela. No "modo bipar", cada bipe da etiqueta do fornecedor soma +1
 * na combinação (e o primeiro bipe guarda o código daquela combinação).
 */
const GradeEditor = (() => {
  const { esc, api } = U;

  const PRESETS = [
    ['PP ao GG', ['PP', 'P', 'M', 'G', 'GG']],
    ['P ao XG', ['P', 'M', 'G', 'GG', 'XG']],
    ['34 ao 46', ['34', '36', '38', '40', '42', '44', '46']],
    ['Plus 48 ao 54', ['48', '50', '52', '54']],
    ['Único', ['U']],
  ];
  // Tamanhos mostrados como botões (toque liga/desliga), na ordem da arara.
  const GRUPOS_TAM = [
    ['Letras', ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG']],
    ['Números', ['34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54']],
    ['', ['U']],
  ];
  const ORDEM = GRUPOS_TAM.flatMap(([, l]) => l);
  // Bolinha de cor para as cores conhecidas.
  const TONS = {
    preto: '#151515', branco: '#ffffff', 'off-white': '#f3eee4', offwhite: '#f3eee4', off: '#f3eee4', nude: '#e2bf9f', bege: '#d6c1a1',
    marrom: '#7a5136', caramelo: '#b87a3d', azul: '#2f5fa8', 'azul marinho': '#1f2f55', marinho: '#1f2f55', jeans: '#4d6d8c',
    rosa: '#eaa3bc', pink: '#e2417f', vermelho: '#c0392b', vinho: '#6d1f33', verde: '#3f8f5a', 'verde militar': '#55603b',
    amarelo: '#f1c84b', mostarda: '#c99a2e', laranja: '#e8823a', lilás: '#b99ad6', lilas: '#b99ad6', roxo: '#6c3d91',
    cinza: '#9a9a9a', grafite: '#4a4a4a', dourado: '#c9a548', prata: '#c0c0c0', terracota: '#b5583b',
  };
  const tom = (c) => {
    const k = String(c || '').trim().toLowerCase();
    if (/estampad|floral|xadrez|listrad|animal|onça|onca|poá|poa/.test(k)) return 'conic-gradient(#e8a0b8 0 25%, #f1c84b 0 50%, #3f8f5a 0 75%, #2f5fa8 0)';
    return TONS[k] || null;
  };
  const bolinha = (c) => { const t = tom(c); return `<i class="ge-dot ${t ? '' : 'sem'}" ${t ? `style="background:${t}"` : ''}></i>`; };

  // Cores comuns de loja de roupa (aparecem como sugestão junto com as já usadas).
  const CORES_COMUNS = ['Preto', 'Branco', 'Off-white', 'Nude', 'Bege', 'Marrom', 'Azul', 'Jeans', 'Rosa', 'Vermelho', 'Verde', 'Amarelo', 'Lilás', 'Cinza', 'Estampado'];

  const chave = (t, c) => `${(t || '').toLowerCase()}|${(c || '').toLowerCase()}`;

  /**
   * @param {HTMLElement} el onde desenhar
   * @param {object} op
   * @param {Set<string>} [op.existentes] chaves "tam|cor" que já existem (ficam bloqueadas)
   * @param {string[]} [op.tamanhos] tamanhos já marcados
   * @param {string[]} [op.cores] cores já marcadas
   * @param {string} [op.codigoPendente] código já bipado que vai para a primeira célula clicada
   */
  function criar(el, op = {}) {
    const existentes = op.existentes || new Set();
    let tamanhos = [...(op.tamanhos || [])];
    let cores = [...(op.cores || [])];
    const qtd = new Map(); // chave -> quantidade
    const cod = new Map(); // chave -> código do fornecedor
    let selecionada = null; // chave da célula escolhida para bipar
    let codigoPendente = op.codigoPendente || null;
    let sugestoes = { cores: [], tamanhos: [] };

    el.innerHTML = `
      <div class="ge">
        <div class="ge-bloco">
          <div class="ge-linha"><b>Tamanhos</b>
            <div class="ge-presets"><small>Rápido:</small>${PRESETS.map(([n], i) => `<button type="button" class="chip-preset" data-preset="${i}">${n}</button>`).join('')}</div>
          </div>
          <div class="ge-toggles" id="ge-tam"></div>
          <div class="ge-add"><input id="ge-tam-novo" placeholder="Outro tamanho e Enter (ex.: EXG, 10 anos)" list="ge-tam-lista"><datalist id="ge-tam-lista"></datalist></div>
        </div>
        <div class="ge-bloco">
          <div class="ge-linha"><b>Cores</b><small class="dica">Toque para adicionar. Sem cor = cor única.</small></div>
          <div class="ge-chips" id="ge-cor"></div>
          <div class="ge-add"><input id="ge-cor-novo" placeholder="Outra cor e Enter (ex.: Azul bebê, Estampado)" list="ge-cor-lista"><datalist id="ge-cor-lista"></datalist></div>
        </div>
        <div class="ge-bloco ge-bloco-qtd">
          <div class="ge-linha">
            <b>Quantidades</b>
            <span class="ge-ferramentas">
              <label class="ge-preencher">Todas com <input type="number" min="0" id="ge-n" value="1"> <button type="button" class="btn btn-peq" id="ge-preencher">aplicar</button></label>
              <button type="button" class="btn btn-peq" id="ge-zerar">Zerar</button>
              <button type="button" class="btn btn-peq btn-bipar" id="ge-bipar"><i data-icone="codigo"></i> Bipar etiquetas do fornecedor</button>
            </span>
          </div>
          <div class="ge-bipe" id="ge-bipe" hidden>
            <div class="pdv-busca"><span class="pdv-busca-ico">⌕</span>
              <input id="ge-leitor" autocomplete="off" placeholder="Bipe a etiqueta do fornecedor de cada peça"></div>
            <div class="ge-bipe-info" id="ge-bipe-info"></div>
          </div>
          <div class="tabela-rolagem"><table class="ge-tabela" id="ge-tabela"></table></div>
          <div class="ge-rodape" id="ge-rodape"></div>
        </div>
      </div>`;

    const $ = (s) => el.querySelector(s);

    api('/api/produtos/atributos').then((a) => {
      sugestoes = a;
      $('#ge-cor-lista').innerHTML = a.cores.map((c) => `<option value="${esc(c)}">`).join('');
      $('#ge-tam-lista').innerHTML = a.tamanhos.map((t) => `<option value="${esc(t)}">`).join('');
      desenharChips();
    }).catch(() => {});

    // ------------------------------------------------------------ chips
    function desenharChips() {
      const vistas = new Set();
      const sugCores = [...sugestoes.cores, ...CORES_COMUNS].filter((c) => {
        const k = c.toLowerCase();
        if (vistas.has(k) || cores.some((x) => x.toLowerCase() === k)) return false;
        vistas.add(k);
        return true;
      }).slice(0, 16);
      const on = (t) => tamanhos.some((x) => x.toLowerCase() === t.toLowerCase());
      const extras = tamanhos.filter((t) => !ORDEM.some((o) => o.toLowerCase() === t.toLowerCase()));
      $('#ge-tam').innerHTML = GRUPOS_TAM.map(([g, lista]) => `<div class="ge-grupo">${g ? `<small>${g}</small>` : ''}${lista.map((t) =>
        `<button type="button" class="ge-t ${on(t) ? 'on' : ''}" data-tog-tam="${esc(t)}">${t === 'U' ? 'Único' : esc(t)}</button>`).join('')}</div>`).join('')
        + (extras.length ? `<div class="ge-grupo"><small>Outros</small>${extras.map((t) => `<button type="button" class="ge-t on" data-tog-tam="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : '');
      $('#ge-cor').innerHTML = cores.map((c) => `<span class="chip chip-cor">${bolinha(c)}${esc(c)}<button type="button" data-rm-cor="${esc(c)}" title="Tirar">×</button></span>`).join('')
        + (sugCores.length ? `<span class="ge-sug">${sugCores.map((c) => `<button type="button" class="chip-sug" data-add-cor="${esc(c)}">${bolinha(c)}${esc(c)}</button>`).join('')}</span>` : '');
      desenharTabela();
    }

    const peso = (t) => { const i = ORDEM.findIndex((o) => o.toLowerCase() === String(t).toLowerCase()); return i < 0 ? 999 : i; };
    const ordenar = (lista) => [...lista].sort((a, b) => peso(a) - peso(b));
    const adicionar = (lista, valor) => {
      const v = String(valor || '').trim();
      if (!v || lista.some((x) => x.toLowerCase() === v.toLowerCase())) return lista;
      return [...lista, v];
    };

    el.addEventListener('click', (ev) => {
      const t = ev.target;
      const td = t.closest('[data-cel]');
      if (td && t.tagName !== 'INPUT') td.querySelector('input').focus();
      const bt = t.closest('[data-tog-tam],[data-mais-k],[data-menos-k]');
      if (bt && bt.dataset.togTam !== undefined) {
        const v = bt.dataset.togTam;
        tamanhos = tamanhos.some((x) => x.toLowerCase() === v.toLowerCase()) ? tamanhos.filter((x) => x.toLowerCase() !== v.toLowerCase()) : ordenar(adicionar(tamanhos, v));
        return desenharChips();
      }
      if (bt && (bt.dataset.maisK !== undefined || bt.dataset.menosK !== undefined)) {
        const k = bt.dataset.maisK ?? bt.dataset.menosK;
        qtd.set(k, Math.max(0, (qtd.get(k) || 0) + (bt.dataset.maisK !== undefined ? 1 : -1)));
        const inp = el.querySelector(`.ge-qtd[data-k="${CSS.escape(k)}"]`);
        if (inp) { inp.value = qtd.get(k) || ''; inp.dispatchEvent(new Event('input', { bubbles: true })); }
        return;
      }
      if (t.dataset.preset !== undefined) {
        for (const tam of PRESETS[Number(t.dataset.preset)][1]) tamanhos = adicionar(tamanhos, tam);
        tamanhos = ordenar(tamanhos);
        desenharChips();
      } else if (t.dataset.rmTam !== undefined) {
        tamanhos = tamanhos.filter((x) => x !== t.dataset.rmTam);
        desenharChips();
      } else if (t.dataset.rmCor !== undefined) {
        cores = cores.filter((x) => x !== t.dataset.rmCor);
        desenharChips();
      } else if (t.closest('[data-add-cor]')) {
        cores = adicionar(cores, t.closest('[data-add-cor]').dataset.addCor);
        desenharChips();
      }
    });
    const enterAdiciona = (input, aplicar) => {
      input.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ',') return;
        ev.preventDefault();
        // Aceita vários de uma vez: "P, M, G".
        for (const v of input.value.split(/[,;]/)) aplicar(v);
        input.value = '';
        desenharChips();
      });
      input.addEventListener('blur', () => {
        if (!input.value.trim()) return;
        for (const v of input.value.split(/[,;]/)) aplicar(v);
        input.value = '';
        desenharChips();
      });
    };
    enterAdiciona($('#ge-tam-novo'), (v) => { tamanhos = adicionar(tamanhos, v); });
    enterAdiciona($('#ge-cor-novo'), (v) => { cores = adicionar(cores, v); });

    // ----------------------------------------------------------- tabela
    const linhas = () => (cores.length ? cores : [null]);
    const colunas = () => (tamanhos.length ? tamanhos : [null]);

    function desenharTabela() {
      const tab = $('#ge-tabela');
      tab.innerHTML = `
        <thead><tr><th></th>${colunas().map((t) => `<th>${t && t !== 'U' ? esc(t) : 'Único'}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>${linhas().map((c) => `<tr><th>${c ? `${bolinha(c)}${esc(c)}` : (tamanhos.length ? 'Qtd.' : 'Quantidade')}</th>${colunas().map((t) => {
    const k = chave(t, c);
    if (existentes.has(k)) return '<td><span class="ge-existe" title="Já cadastrado">✓ já existe</span></td>';
    return `<td class="${selecionada === k ? 'ge-sel' : ''}" data-cel="${esc(k)}"><div class="ge-step">
            <button type="button" tabindex="-1" data-menos-k="${esc(k)}">−</button>
            <input type="number" min="0" class="ge-qtd" data-k="${esc(k)}" value="${qtd.get(k) || ''}" placeholder="0">
            <button type="button" tabindex="-1" data-mais-k="${esc(k)}">+</button></div>
            ${cod.get(k) ? `<small class="ge-cod" title="${esc(cod.get(k))}"><i data-icone="etiqueta"></i> ${esc(cod.get(k).slice(-6))}</small>` : ''}</td>`;
  }).join('')}<td class="grade-total">${colunas().reduce((a, t) => a + (qtd.get(chave(t, c)) || 0), 0)}</td></tr>`).join('')}</tbody>`;
      atualizarRodape();
    }

    function atualizarRodape() {
      const vs = variantes(true);
      const comPecas = vs.filter((v) => v.quantidade > 0).length;
      const pecas = vs.reduce((a, v) => a + v.quantidade, 0);
      $('#ge-rodape').innerHTML = `<b>${comPecas}</b> variação(ões) com peças · <b>${pecas}</b> peça(s) no total${vs.length > comPecas && vs.length > 1
        ? ` <small>(as ${vs.length - comPecas} sem quantidade não são cadastradas)</small>` : ''}`;
    }

    el.addEventListener('input', (ev) => {
      const k = ev.target.dataset.k;
      if (k === undefined) return;
      const n = Math.max(0, Math.floor(Number(ev.target.value) || 0));
      qtd.set(k, n);
      const tr = ev.target.closest('tr');
      const totais = [...tr.querySelectorAll('.ge-qtd')].reduce((a, i) => a + (Math.max(0, Number(i.value) || 0)), 0);
      tr.querySelector('.grade-total').textContent = totais;
      atualizarRodape();
    });
    // Clicar numa célula escolhe a combinação que vai receber os bipes.
    el.addEventListener('focusin', (ev) => {
      const td = ev.target.closest('[data-cel]');
      if (!td) return;
      selecionada = td.dataset.cel;
      el.querySelectorAll('[data-cel]').forEach((x) => x.classList.toggle('ge-sel', x === td));
      if (codigoPendente && !cod.get(selecionada)) {
        // Código bipado antes de abrir o cadastro: vai para a célula escolhida.
        cod.set(selecionada, codigoPendente);
        qtd.set(selecionada, (qtd.get(selecionada) || 0) + 1);
        codigoPendente = null;
        desenharTabela();
        return infoBipe(`Código ligado a <b>${esc(nomeCel(selecionada))}</b>. Continue bipando as outras peças.`, 'ok');
      }
      infoBipe();
    });

    $('#ge-preencher').onclick = () => {
      const n = Math.max(0, Number($('#ge-n').value) || 0);
      for (const t of colunas()) for (const c of linhas()) {
        const k = chave(t, c);
        if (!existentes.has(k) && !qtd.get(k)) qtd.set(k, n);
      }
      desenharTabela();
    };
    $('#ge-zerar').onclick = () => { qtd.clear(); desenharTabela(); };

    // ------------------------------------------------------------ bipar
    const nomeCel = (k) => {
      const [t, c] = k.split('|');
      const tt = tamanhos.find((x) => x.toLowerCase() === t) || '';
      const cc = cores.find((x) => x.toLowerCase() === c) || '';
      return [tt && `Tam ${tt}`, cc].filter(Boolean).join(' · ') || 'Único';
    };
    function infoBipe(msg, tipo) {
      if (!msg && codigoPendente) {
        msg = `Código <b>${esc(codigoPendente)}</b> esperando: escolha os tamanhos/cores e <b>clique na célula</b> dessa peça.`;
        tipo = 'alerta';
      }
      $('#ge-bipe-info').innerHTML = msg
        ? `<span class="ge-msg ${tipo || ''}">${msg}</span>`
        : selecionada
          ? `Próximo código novo vai para: <b>${esc(nomeCel(selecionada))}</b>. Bipe todas as peças dessa cor/tamanho; depois clique em outra célula.`
          : 'Clique na célula (tamanho/cor) da peça que vai bipar. Código que já foi bipado soma sozinho na célula certa.';
    }
    $('#ge-bipar').onclick = () => {
      const box = $('#ge-bipe');
      box.hidden = !box.hidden;
      $('#ge-bipar').classList.toggle('ativo', !box.hidden);
      if (!box.hidden) {
        if (!selecionada) {
          const primeira = el.querySelector('[data-cel]');
          if (primeira) { selecionada = primeira.dataset.cel; primeira.classList.add('ge-sel'); }
        }
        infoBipe();
        $('#ge-leitor').focus();
      }
    };
    $('#ge-leitor').addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const codigo = ev.target.value.trim();
      ev.target.value = '';
      if (!codigo) return;
      // 1) Código já ligado a uma combinação: soma +1 nela.
      const jaLigado = [...cod.entries()].find(([, v]) => v === codigo);
      let k = jaLigado ? jaLigado[0] : null;
      if (!k) {
        if (!selecionada) { U.som('erro'); return infoBipe('Clique primeiro na célula (tamanho/cor) dessa peça.', 'erro'); }
        if (cod.get(selecionada)) {
          U.som('erro');
          return infoBipe(`<b>${esc(nomeCel(selecionada))}</b> já tem outro código (${esc(cod.get(selecionada))}). Clique na célula certa para este código novo.`, 'erro');
        }
        // Código que já pertence a um produto cadastrado não pode ser reaproveitado.
        try {
          const p = await api(`/api/produtos/codigo/${encodeURIComponent(codigo)}`);
          U.som('erro');
          return infoBipe(`Este código já é de "${esc(p.nome)} ${esc([p.tamanho, p.cor].filter(Boolean).join(' '))}". Para somar estoque dele use "Entrada por bipagem".`, 'erro');
        } catch (e) {
          if (e.status !== 404) return infoBipe(esc(e.message), 'erro');
        }
        k = selecionada;
        cod.set(k, codigo);
      }
      qtd.set(k, (qtd.get(k) || 0) + 1);
      U.som('ok');
      desenharTabela();
      const td = el.querySelector(`[data-cel="${CSS.escape(k)}"]`);
      if (td) { td.classList.add('ge-pisca'); setTimeout(() => td.classList.remove('ge-pisca'), 400); }
      infoBipe(`+1 em <b>${esc(nomeCel(k))}</b> — agora ${qtd.get(k)} peça(s).`, 'ok');
      $('#ge-leitor').focus();
    });

    /** Lista de variações para gravar. somenteComQtd: ignora as que estão com 0. */
    function variantes(incluirZeradas = true) {
      const out = [];
      for (const c of linhas()) for (const t of colunas()) {
        const k = chave(t, c);
        if (existentes.has(k)) continue;
        const q = qtd.get(k) || 0;
        if (!incluirZeradas && !q) continue;
        out.push({ tamanho: t, cor: c, quantidade: q, codigo: cod.get(k) || undefined });
      }
      return out;
    }

    desenharChips();
    if (codigoPendente) {
      $('#ge-bipe').hidden = false;
      $('#ge-bipar').classList.add('ativo');
      infoBipe();
    }
    return {
      variantes,
      temTamanhoOuCor: () => tamanhos.length + cores.length > 0,
      tamanhos: () => [...tamanhos],
      cores: () => [...cores],
      /** Troca os tamanhos (ex.: os que a loja usa nesta categoria). */
      definirTamanhos: (lista) => { tamanhos = []; for (const t of lista) tamanhos = adicionar(tamanhos, t); tamanhos = ordenar(tamanhos); desenharChips(); },
    };
  }

  return { criar, chave };
})();
