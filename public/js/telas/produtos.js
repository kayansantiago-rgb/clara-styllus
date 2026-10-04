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
          <label class="check"><input type="checkbox" id="inativos"> Mostrar inativos</label>
          <button class="btn btn-primario" id="novo">+ Novo produto</button>
        </div>
      </div>
      <div class="tabela-rolagem cartao">
        <table class="tabela">
          <thead><tr><th>Código</th><th>Produto</th><th>Tam.</th><th>Cor</th><th class="r">Custo</th>
            <th class="r">Venda</th><th class="r">Estoque</th><th class="r">Ações</th></tr></thead>
          <tbody id="lista"></tbody>
        </table>
      </div>`;
    const recarregar = U.debounce(carregar, 200);
    raiz.querySelector('#q').addEventListener('input', recarregar);
    raiz.querySelector('#baixo').onchange = carregar;
    raiz.querySelector('#inativos').onchange = carregar;
    raiz.querySelector('#novo').onclick = () => formulario(null);
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
        <td><code>${esc(p.codigo)}</code>${p.referencia ? `<br><small>Ref ${esc(p.referencia)}</small>` : ''}</td>
        <td><b>${esc(p.nome)}</b><br><small>${esc([p.categoria, p.marca].filter(Boolean).join(' · '))}</small></td>
        <td>${esc(p.tamanho || '')}</td>
        <td>${esc(p.cor || '')}</td>
        <td class="r">${num(p.preco_custo)}</td>
        <td class="r"><b>${num(p.preco_venda)}</b></td>
        <td class="r ${p.estoque <= p.estoque_minimo ? 'txt-perigo' : ''}"><b>${p.estoque}</b></td>
        <td class="r nowrap">
          <button class="btn-ico" data-acao="estoque" data-i="${i}" title="Entrada / ajuste de estoque">📦</button>
          <button class="btn-ico" data-acao="etiqueta" data-i="${i}" title="Mandar para impressão de etiquetas">🏷️</button>
          <button class="btn-ico" data-acao="editar" data-i="${i}" title="Editar">✏️</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="8" class="vazio">Nenhum produto encontrado.</td></tr>';
  }

  function acao(ev) {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const p = lista[Number(b.dataset.i)];
    if (b.dataset.acao === 'editar') formulario(p);
    if (b.dataset.acao === 'estoque') estoque(p);
    if (b.dataset.acao === 'etiqueta') {
      Telas.etiquetas.adicionar(p, Math.max(1, p.estoque));
      aviso(`${Math.max(1, p.estoque)} etiqueta(s) de "${p.nome}" na fila de impressão.`);
    }
  }

  const listaCsv = (s) => String(s || '').split(/[,;/]/).map((x) => x.trim()).filter(Boolean);

  function formulario(p) {
    const novo = !p;
    p = p || {};
    const corpo = abrirModal(novo ? 'Novo produto' : `Editar produto`, `
      <form class="form grade-form" id="f-prod">
        <label class="col2">Nome *<input name="nome" required value="${esc(p.nome)}" autofocus placeholder="Ex.: Vestido midi canelado"></label>
        <label>Referência<input name="referencia" value="${esc(p.referencia)}"></label>
        <label>Categoria<input name="categoria" value="${esc(p.categoria)}" placeholder="Vestido, Blusa, Calça…"></label>
        <label>Marca / fornecedor<input name="marca" value="${esc(p.marca)}"></label>
        <label>NCM<input name="ncm" value="${esc(p.ncm)}" inputmode="numeric" placeholder="Para nota fiscal (opcional)"></label>
        <label>Preço de custo (R$)<input name="preco_custo" inputmode="decimal" value="${p.preco_custo ? num(p.preco_custo) : ''}"></label>
        <label>Preço de venda (R$) *<input name="preco_venda" inputmode="decimal" required value="${p.preco_venda ? num(p.preco_venda) : ''}"></label>
        <label>Estoque mínimo<input name="estoque_minimo" type="number" min="0" value="${p.estoque_minimo ?? 0}"></label>
        ${novo ? `
        <fieldset class="col2">
          <legend>Tamanho e cor</legend>
          <p class="dica">Para cadastrar a <b>grade</b> de uma vez, separe por vírgula. Ex.: tamanhos <i>P, M, G, GG</i> e cores <i>Preto, Off-white</i>
            criam 8 produtos, cada um com seu código de barras.</p>
          <div class="grade-campos">
            <label>Tamanho(s)<input name="tamanho" placeholder="P, M, G, GG"></label>
            <label>Cor(es)<input name="cor" placeholder="Preto, Off-white"></label>
            <label>Estoque inicial (cada)<input name="estoque" type="number" min="0" value="0"></label>
          </div>
          <label>Código de barras <small>(deixe vazio para gerar automático; só para produto único)</small>
            <input name="codigo" placeholder="Bipe aqui o código do fornecedor, se houver"></label>
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
      </form>`, { largura: '760px' });

    const form = corpo.querySelector('form');
    const margem = () => {
      const c = U.paraCentavos(form.preco_custo.value);
      const v = U.paraCentavos(form.preco_venda.value);
      corpo.querySelector('#margem').textContent = c > 0 && v > 0
        ? `Margem: ${(((v - c) / v) * 100).toFixed(0)}% · Markup: ${(v / c).toFixed(2)}x` : '';
    };
    form.preco_custo.oninput = margem;
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
      if ([base.preco_custo, base.preco_venda].some(Number.isNaN)) return aviso('Preço inválido.', 'erro');
      try {
        if (!novo) {
          await api(`/api/produtos/${p.id}`, {
            metodo: 'PUT',
            corpo: { ...base, tamanho: d.tamanho, cor: d.cor, codigo: d.codigo, ativo: !!d.ativo },
          });
          aviso('Produto atualizado.');
        } else {
          const tamanhos = listaCsv(d.tamanho);
          const cores = listaCsv(d.cor);
          const combos = [];
          for (const t of tamanhos.length ? tamanhos : [null]) {
            for (const c of cores.length ? cores : [null]) combos.push({ tamanho: t, cor: c });
          }
          if (combos.length > 1 && d.codigo) return aviso('Código de barras manual só vale para um produto único.', 'erro');
          const criados = [];
          for (const c of combos) {
            criados.push(await api('/api/produtos', {
              metodo: 'POST',
              corpo: { ...base, ...c, codigo: d.codigo, estoque: Number(d.estoque || 0) },
            }));
          }
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
