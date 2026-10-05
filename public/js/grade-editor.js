/*
 * Editor de grade do cadastro de produtos: escolhe tamanhos e cores e digita a quantidade de
 * cada combinação numa tabela. No "modo bipar", cada bipe da etiqueta do fornecedor soma +1
 * na combinação (e o primeiro bipe guarda o código daquela combinação).
 */
const GradeEditor = (() => {
  const { esc, api } = U;

  const PRESETS = [
    ['Letras', ['PP', 'P', 'M', 'G', 'GG']],
    ['Letras + XG', ['P', 'M', 'G', 'GG', 'XG']],
    ['Numeração 34–46', ['34', '36', '38', '40', '42', '44', '46']],
    ['Plus 48–54', ['48', '50', '52', '54']],
    ['Tamanho único', ['U']],
  ];

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
        <div class="ge-linha">
          <b>1. Tamanhos</b>
          <div class="ge-presets">${PRESETS.map(([n], i) => `<button type="button" class="chip-preset" data-preset="${i}">${n}</button>`).join('')}</div>
        </div>
        <div class="ge-chips" id="ge-tam"></div>
        <div class="ge-add"><input id="ge-tam-novo" placeholder="Outro tamanho e Enter (ex.: 36, EXG, 10 anos)" list="ge-tam-lista"><datalist id="ge-tam-lista"></datalist></div>

        <div class="ge-linha"><b>2. Cores</b></div>
        <div class="ge-chips" id="ge-cor"></div>
        <div class="ge-add"><input id="ge-cor-novo" placeholder="Digite a cor e Enter (ex.: Preto, Off-white, Estampado)" list="ge-cor-lista"><datalist id="ge-cor-lista"></datalist></div>

        <div class="ge-linha">
          <b>3. Quantidade de cada uma</b>
          <span class="ge-ferramentas">
            <label class="ge-preencher">Preencher vazias com <input type="number" min="0" id="ge-n" value="1"> <button type="button" class="btn btn-peq" id="ge-preencher">ok</button></label>
            <button type="button" class="btn btn-peq" id="ge-zerar">Zerar</button>
            <button type="button" class="btn btn-peq btn-bipar" id="ge-bipar"><i data-icone="camera"></i> Modo bipar</button>
          </span>
        </div>
        <div class="ge-bipe" id="ge-bipe" hidden>
          <div class="pdv-busca"><span class="pdv-busca-ico">⌕</span>
            <input id="ge-leitor" autocomplete="off" placeholder="Bipe a etiqueta do fornecedor de cada peça"></div>
          <div class="ge-bipe-info" id="ge-bipe-info"></div>
        </div>
        <div class="tabela-rolagem"><table class="ge-tabela" id="ge-tabela"></table></div>
        <div class="ge-rodape" id="ge-rodape"></div>
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
      const sugCores = sugestoes.cores.filter((c) => !cores.some((x) => x.toLowerCase() === c.toLowerCase())).slice(0, 8);
      $('#ge-tam').innerHTML = tamanhos.map((t) => `<span class="chip">${esc(t)}<button type="button" data-rm-tam="${esc(t)}" title="Tirar">×</button></span>`).join('')
        || '<small class="dica">Nenhum tamanho (peça sem tamanho). Use um botão acima ou digite abaixo.</small>';
      $('#ge-cor').innerHTML = cores.map((c) => `<span class="chip chip-cor">${esc(c)}<button type="button" data-rm-cor="${esc(c)}" title="Tirar">×</button></span>`).join('')
        + (sugCores.length ? `<span class="ge-sug">usadas antes: ${sugCores.map((c) => `<button type="button" class="link" data-add-cor="${esc(c)}">${esc(c)}</button>`).join(' ')}</span>` : '')
        || '<small class="dica">Nenhuma cor (peça de cor única).</small>';
      desenharTabela();
    }

    const adicionar = (lista, valor) => {
      const v = String(valor || '').trim();
      if (!v || lista.some((x) => x.toLowerCase() === v.toLowerCase())) return lista;
      return [...lista, v];
    };

    el.addEventListener('click', (ev) => {
      const t = ev.target;
      const td = t.closest('[data-cel]');
      if (td && t.tagName !== 'INPUT') td.querySelector('input').focus();
      if (t.dataset.preset !== undefined) {
        for (const tam of PRESETS[Number(t.dataset.preset)][1]) tamanhos = adicionar(tamanhos, tam);
        desenharChips();
      } else if (t.dataset.rmTam !== undefined) {
        tamanhos = tamanhos.filter((x) => x !== t.dataset.rmTam);
        desenharChips();
      } else if (t.dataset.rmCor !== undefined) {
        cores = cores.filter((x) => x !== t.dataset.rmCor);
        desenharChips();
      } else if (t.dataset.addCor !== undefined) {
        cores = adicionar(cores, t.dataset.addCor);
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
        <thead><tr><th>${cores.length ? 'Cor \\ Tam.' : ''}</th>${colunas().map((t) => `<th>${t ? esc(t) : 'Único'}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>${linhas().map((c) => `<tr><th>${c ? esc(c) : (tamanhos.length ? 'Qtd.' : 'Quantidade')}</th>${colunas().map((t) => {
    const k = chave(t, c);
    if (existentes.has(k)) return '<td><span class="ge-existe" title="Já cadastrado">✓ já existe</span></td>';
    return `<td class="${selecionada === k ? 'ge-sel' : ''}" data-cel="${esc(k)}">
            <input type="number" min="0" class="ge-qtd" data-k="${esc(k)}" value="${qtd.get(k) || ''}" placeholder="0">
            ${cod.get(k) ? `<small class="ge-cod" title="${esc(cod.get(k))}"><i data-icone="etiqueta"></i> ${esc(cod.get(k).slice(-6))}</small>` : ''}</td>`;
  }).join('')}<td class="grade-total">${colunas().reduce((a, t) => a + (qtd.get(chave(t, c)) || 0), 0)}</td></tr>`).join('')}</tbody>`;
      atualizarRodape();
    }

    function atualizarRodape() {
      const vs = variantes(true);
      const pecas = vs.reduce((a, v) => a + v.quantidade, 0);
      $('#ge-rodape').innerHTML = `<b>${vs.length}</b> variação(ões) · <b>${pecas}</b> peça(s) no total`;
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
    return { variantes, temTamanhoOuCor: () => tamanhos.length + cores.length > 0 };
  }

  return { criar, chave };
})();
