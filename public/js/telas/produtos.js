/* Cadastro de produtos, grade (tamanho × cor) e estoque. */
Telas.produtos = (() => {
  const { esc, brl, num, api, aviso, erro, abrirModal, fecharModal } = U;
  let raiz;
  let lista = [];

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <h1>Produtos</h1>
        <div class="ferramentas">
          <input id="q" type="search" placeholder="Buscar por nome, código, referência, cor…" autofocus>
          <label class="check"><input type="checkbox" id="baixo"> Só estoque baixo</label>
          <label class="check so-admin"><input type="checkbox" id="inativos"> Mostrar inativos</label>
          <button class="btn so-admin" id="entrada" title="Somar estoque bipando as peças que chegaram">📦 Entrada por bipagem</button>
          <button class="btn so-admin" id="liquidacao" title="Aplicar ou encerrar liquidação nos produtos da lista">🔥 Liquidação</button>
          <button class="btn btn-primario so-admin" id="novo">+ Novo produto</button>
        </div>
      </div>
      <div class="tabela-rolagem cartao">
        <table class="tabela">
          <thead><tr><th></th><th>Código</th><th>Produto</th><th>Tam.</th><th>Cor</th><th class="r">Custo</th>
            <th class="r">Venda</th><th class="r">Estoque</th><th class="r">Ações</th></tr></thead>
          <tbody id="lista"></tbody>
        </table>
      </div>`;
    const recarregar = U.debounce(carregar, 200);
    raiz.querySelector('#q').addEventListener('input', recarregar);
    raiz.querySelector('#baixo').onchange = carregar;
    raiz.querySelector('#inativos').onchange = carregar;
    raiz.querySelector('#novo').onclick = () => formulario(null);
    raiz.querySelector('#liquidacao').onclick = liquidacao;
    raiz.querySelector('#entrada').onclick = entradaBipagem;
    raiz.querySelector('#lista').onclick = acao;
    await carregar();
  }

  async function carregar() {
    const q = raiz.querySelector('#q').value;
    const baixo = raiz.querySelector('#baixo').checked ? '&estoque_baixo=1' : '';
    const inat = raiz.querySelector('#inativos').checked ? '&inativos=1' : '';
    try {
      lista = await api(`/api/produtos?q=${encodeURIComponent(q)}${baixo}${inat}&limite=1000`);
    } catch (e) { return erro(e); }
    raiz.querySelector('#lista').innerHTML = lista.map((p, i) => `
      <tr class="${p.ativo ? '' : 'inativo'}">
        <td class="td-foto">${U.miniatura(p)}</td>
        <td><code>${esc(p.codigo)}</code>${p.referencia ? `<br><small>Ref ${esc(p.referencia)}</small>` : ''}</td>
        <td><b>${esc(p.nome)}</b><br><small>${esc([p.categoria, p.marca].filter(Boolean).join(' · '))}</small></td>
        <td>${esc(p.tamanho || '')}</td>
        <td>${esc(p.cor || '')}</td>
        <td class="r">${num(p.preco_custo)}</td>
        <td class="r">${p.preco_anterior > p.preco_venda ? `<small class="preco-de">${num(p.preco_anterior)}</small><br><b class="preco-por">${num(p.preco_venda)}</b>` : `<b>${num(p.preco_venda)}</b>`}</td>
        <td class="r ${p.estoque <= p.estoque_minimo ? 'txt-perigo' : ''}"><b>${p.estoque}</b></td>
        <td class="r nowrap">
          <button class="btn-ico" data-acao="grade" data-i="${i}" title="Ver grade de estoque (tamanho × cor)">🔢</button>
          <button class="btn-ico so-admin" data-acao="estoque" data-i="${i}" title="Entrada / ajuste de estoque">📦</button>
          <button class="btn-ico" data-acao="etiqueta" data-i="${i}" title="Mandar para impressão de etiquetas">🏷️</button>
          <button class="btn-ico so-admin" data-acao="editar" data-i="${i}" title="Editar">✏️</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="9" class="vazio">Nenhum produto encontrado.</td></tr>';
  }

  function acao(ev) {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const p = lista[Number(b.dataset.i)];
    if (b.dataset.acao === 'editar') formulario(p);
    if (b.dataset.acao === 'estoque') estoque(p);
    if (b.dataset.acao === 'grade') grade(p);
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
      p = { nome: b.nome, referencia: b.referencia, categoria: b.categoria, marca: b.marca, ncm: b.ncm,
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
    const corpo = abrirModal(novo ? (opcoes.base ? `Adicionar tamanhos/cores — ${p.nome}` : 'Novo produto') : `Editar produto`, `
      <form class="form grade-form" id="f-prod">
        <label class="col2">Nome *<input name="nome" required value="${esc(p.nome)}" autofocus placeholder="Ex.: Vestido midi canelado"></label>
        <label>Referência<input name="referencia" value="${esc(p.referencia)}"></label>
        <label>Categoria<input name="categoria" value="${esc(p.categoria)}" placeholder="Vestido, Blusa, Calça…"></label>
        <label>Marca / fornecedor<input name="marca" value="${esc(p.marca)}"></label>
        <label>NCM<input name="ncm" value="${esc(p.ncm)}" inputmode="numeric" placeholder="Para nota fiscal (opcional)"></label>
        <label>Preço de custo (R$)<input name="preco_custo" inputmode="decimal" value="${p.preco_custo ? num(p.preco_custo) : ''}"></label>
        <label>Preço de venda (R$) *<input name="preco_venda" inputmode="decimal" required value="${p.preco_venda ? num(p.preco_venda) : ''}">
          <span class="sugestao-preco" id="sugestao-preco" hidden></span></label>
        <label class="so-admin">Preço "De" — liquidação (R$) <small>vazio = sem liquidação</small>
          <input name="preco_anterior" inputmode="decimal" value="${p.preco_anterior ? num(p.preco_anterior) : ''}" placeholder="Preço antigo, sai riscado na etiqueta"></label>
        <label>Estoque mínimo<input name="estoque_minimo" type="number" min="0" value="${p.estoque_minimo ?? 0}"></label>
        <div class="col2 foto-campo">
          <div class="foto-previa" id="foto-previa">${U.fotoUrl(p) ? `<img src="${U.fotoUrl(p)}" alt="">` : '<span>👗<br><small>sem foto</small></span>'}</div>
          <div class="foto-acoes">
            <b>Foto da peça</b>
            <small>Aparece na tela de venda para a vendedora conferir se bipou a peça certa.</small>
            <div class="acoes acoes-esq">
              <label class="btn">📷 Escolher foto<input type="file" accept="image/*" capture="environment" id="foto-arquivo" hidden></label>
              <button type="button" class="btn btn-perigo-claro" id="foto-remover" ${U.fotoUrl(p) ? '' : 'hidden'}>Remover</button>
            </div>
            ${novo ? '<small>A foto vale para todos os tamanhos e cores criados agora.</small>'
    : `<label class="check"><input type="checkbox" id="foto-cor" checked> Usar a mesma foto em todos os tamanhos ${p.cor ? `da cor ${esc(p.cor)}` : 'deste produto'}</label>`}
          </div>
        </div>
        ${novo ? `
        <fieldset class="col2">
          <legend>Tamanhos, cores e quantidades</legend>
          <div id="grade-editor"></div>
          <label class="check"><input type="checkbox" id="criar-zeradas" checked> Cadastrar também as combinações com quantidade 0 (para repor depois)</label>
          <p class="dica">Cada combinação vira um produto com seu próprio código de barras. Peças sem etiqueta do fornecedor
            recebem um código da loja automaticamente.</p>
        </fieldset>` : `
        <label>Tamanho<input name="tamanho" value="${esc(p.tamanho)}"></label>
        <label>Cor<input name="cor" value="${esc(p.cor)}"></label>
        <label class="col2">Código de barras<input name="codigo" required value="${esc(p.codigo)}"></label>
        <label class="check col2"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> Produto ativo (aparece no PDV)</label>`}
        <div class="acoes col2">
          <span class="margem" id="margem"></span>
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button class="btn btn-primario">Salvar</button>
        </div>
      </form>`, { largura: novo ? '920px' : '760px' });

    const form = corpo.querySelector('form');
    const editor = novo
      ? GradeEditor.criar(corpo.querySelector('#grade-editor'), { existentes, tamanhos: tamIniciais, cores: corIniciais, codigoPendente: opcoes.codigo })
      : null;
    const margem = () => {
      const c = U.paraCentavos(form.preco_custo.value);
      const v = U.paraCentavos(form.preco_venda.value);
      corpo.querySelector('#margem').textContent = c > 0 && v > 0
        ? `Margem: ${(((v - c) / v) * 100).toFixed(0)}% · Markup: ${(v / c).toFixed(2)}x` : '';
      // Sugestão pelo markup padrão da loja (Configurações → Regras de venda).
      const sug = precoSugerido(c, cfg);
      const el = corpo.querySelector('#sugestao-preco');
      el.hidden = !sug || sug === v;
      if (sug && sug !== v) {
        el.innerHTML = `Sugerido pelo markup ${esc(cfg.markup_padrao)}x: <b>${U.brl(sug)}</b> <button type="button" class="link">usar</button>`;
        el.querySelector('button').onclick = () => { form.preco_venda.value = num(sug); margem(); };
      }
    };
    // Foto: undefined = não mexeu; null = remover; string = nova imagem.
    let foto;
    const previa = corpo.querySelector('#foto-previa');
    corpo.querySelector('#foto-arquivo').onchange = async (ev) => {
      const arq = ev.target.files[0];
      if (!arq) return;
      try {
        foto = await U.reduzirImagem(arq);
        previa.innerHTML = `<img src="${foto}" alt="">`;
        corpo.querySelector('#foto-remover').hidden = false;
      } catch (e) { erro(e); }
    };
    corpo.querySelector('#foto-remover').onclick = () => {
      foto = null;
      previa.innerHTML = '<span>👗<br><small>sem foto</small></span>';
      corpo.querySelector('#foto-remover').hidden = true;
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
        nome: d.nome, referencia: d.referencia, categoria: d.categoria, marca: d.marca, ncm: d.ncm,
        preco_custo: U.paraCentavos(d.preco_custo), preco_venda: U.paraCentavos(d.preco_venda),
        estoque_minimo: Number(d.estoque_minimo || 0),
      };
      if ('preco_anterior' in d) base.preco_anterior = U.paraCentavos(d.preco_anterior);
      if ([base.preco_custo, base.preco_venda, base.preco_anterior ?? 0].some(Number.isNaN)) return aviso('Preço inválido.', 'erro');
      if (base.preco_anterior && base.preco_anterior <= base.preco_venda) {
        return aviso('O preço "De" precisa ser maior que o preço de venda (ou deixe vazio).', 'erro');
      }
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
          const variantes = editor.variantes(corpo.querySelector('#criar-zeradas').checked);
          if (!variantes.length) {
            return aviso(opcoes.base ? 'Escolha pelo menos um tamanho ou cor novo.' : 'Coloque a quantidade de pelo menos uma combinação (ou marque "cadastrar com quantidade 0").', 'erro');
          }
          const criados = await api('/api/produtos/grade', { metodo: 'POST', corpo: { ...base, variantes } });
          await salvarFoto(criados.map((x) => x.id));
          aviso(criados.length > 1 ? `${criados.length} produtos criados.` : 'Produto criado.');
          const qtdEtiquetas = criados.reduce((a, x) => a + x.estoque, 0);
          if (qtdEtiquetas && await U.confirmar('Etiquetas', `Mandar ${qtdEtiquetas} etiqueta(s) para a fila de impressão?`, { ok: 'Sim' })) {
            criados.forEach((x) => x.estoque && Telas.etiquetas.adicionar(x, x.estoque));
          }
        }
        fecharModal();
        if (raiz) carregar();
      } catch (e) { erro(e); }
    };
  }

  /**
   * Entrada de mercadoria bipando: cada bipe soma +1 na peça. Código desconhecido pode virar
   * um produto novo na hora. Ao confirmar, o estoque é atualizado de uma vez.
   */
  function entradaBipagem() {
    const itens = new Map(); // produto_id -> { produto, quantidade }
    const corpo = abrirModal('📦 Entrada por bipagem', `
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
    const corpo = abrirModal('🔥 Liquidação', `
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
      <div class="acoes so-admin"><button type="button" class="btn" id="grade-add">+ Adicionar tamanhos ou cores</button></div>`, { largura: '720px' });
    corpo.querySelector('#grade-add').onclick = () => formulario(null, { base: p });
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
