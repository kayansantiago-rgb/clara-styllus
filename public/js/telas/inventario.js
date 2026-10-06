/* Inventário: bipar todas as peças, conferir faltas/sobras e ajustar o estoque. */
Telas.inventario = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;
  let atual = null; // { inventario, resumo, leituras }

  async function abrir(el) {
    raiz = el;
    const r = await api('/api/inventarios');
    if (r.aberto) {
      atual = await api(`/api/inventarios/${r.aberto.id}`);
      return telaContagem();
    }
    telaInicio(r.historico);
  }

  // -------------------------------------------------------------- início
  async function telaInicio(historico) {
    const cats = await api('/api/categorias').catch(() => []);
    raiz.innerHTML = `
      <div class="cabecalho-tela"><div><h1>Inventário</h1><p class="subtitulo">Conte as peças da loja com o leitor e acerte o estoque do sistema.</p></div></div>
      <div class="duas-colunas">
        <div class="cartao inv-comecar">
          <div class="caixa-abrir-ico">${Icone('prancheta')}</div>
          <h2>Começar um inventário</h2>
          <div class="inv-passos">
            <div><i>1</i><span>Escolha se vai contar a <b>loja toda</b> ou só uma categoria.</span></div>
            <div><i>2</i><span>Bipe <b>todas as peças</b> com o leitor (use <b>3*</b>código para várias iguais).</span></div>
            <div><i>3</i><span>Confira faltas e sobras e finalize: o estoque vira o que foi contado.</span></div>
          </div>
          <p class="dica">Dica: faça com a loja fechada ou sem vender durante a contagem.</p>
          <form id="f-inv" class="form so-admin">
            <label>O que vai ser contado
              <select name="categoria">
                <option value="">A loja toda</option>
                ${cats.map((c) => `<option value="${esc(c.categoria)}">Só ${esc(c.categoria)} (${c.produtos} produtos)</option>`).join('')}
              </select></label>
            <label>Descrição (opcional)<input name="descricao" placeholder="Ex.: Inventário de fim de mês"></label>
            <button class="btn btn-primario btn-grande"><i data-icone="prancheta"></i> Começar inventário</button>
          </form>
          ${U.sessao.ehAdmin() ? '' : '<p class="alerta-box">Só o administrador pode começar um inventário.</p>'}
        </div>
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('relogio')} Inventários anteriores</h3>
          <table class="tabela">
            <thead><tr><th>Nº</th><th>Descrição</th><th>Data</th><th class="r">Ajustes</th><th class="r">Falta (custo)</th><th class="r">Sobra (custo)</th></tr></thead>
            <tbody id="hist">${historico.map((i) => `
              <tr class="${i.status === 'finalizado' ? 'clicavel' : 'inativo'}" data-id="${i.id}">
                <td>${i.id}</td><td>${esc(i.descricao || '')}${i.status === 'cancelado' ? ' <span class="selo perigo">cancelado</span>' : ''}</td>
                <td>${dataHora(i.finalizado_em || i.criado_em)}</td>
                <td class="r">${i.ajustados ?? ''}</td>
                <td class="r txt-perigo">${i.valor_falta ? brl(i.valor_falta) : ''}</td>
                <td class="r">${i.valor_sobra ? brl(i.valor_sobra) : ''}</td>
              </tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum inventário ainda.</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
    const form = raiz.querySelector('#f-inv');
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        atual = await api('/api/inventarios', { metodo: 'POST', corpo: U.dadosForm(form) });
        telaContagem();
      } catch (e) { erro(e); }
    };
    raiz.querySelector('#hist').onclick = (ev) => {
      const tr = ev.target.closest('tr.clicavel');
      if (tr) conferir(Number(tr.dataset.id), true);
    };
  }

  // ------------------------------------------------------------- contagem
  function telaContagem() {
    const inv = atual.inventario;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Inventário nº ${inv.id}</h1><p class="dica">${esc(inv.descricao || '')} · começou ${dataHora(inv.criado_em)} por ${esc(inv.usuario || '')}</p></div>
        <div class="ferramentas">
          <button class="btn btn-fantasma btn-perigo-claro so-admin" id="cancelar">${Icone('fechar')} Cancelar</button>
          <button class="btn" id="desfazer">${Icone('troca')} Desfazer última leitura</button>
          <button class="btn btn-primario" id="conferir">${Icone('check')} Conferir e finalizar</button>
        </div>
      </div>
      <div class="inv-progresso" id="progresso"></div>
      <div class="inv-grade">
        <div>
          <div class="pdv-busca p4-busca inv-busca">
            <span class="pdv-busca-ico">${Icone('codigo')}</span>
            <input id="leitor" autocomplete="off" placeholder="Bipe cada peça aqui (ou 3*código)" autofocus>
          </div>
          <div class="inv-ultimo" id="ultimo"></div>
        </div>
        <div class="cartao inv-leituras">
          <h3 class="titulo-ico">${Icone('relogio')} Últimas leituras</h3>
          <div id="leituras"></div>
        </div>
      </div>`;
    const leitor = raiz.querySelector('#leitor');
    leitor.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      let txt = leitor.value.trim();
      leitor.value = '';
      if (!txt) return;
      let quantidade = 1;
      const m = txt.match(/^(\d{1,3})\s*[*xX]\s*(.+)$/);
      if (m) { quantidade = Number(m[1]); txt = m[2].trim(); }
      try {
        const r = await api(`/api/inventarios/${inv.id}/bipar`, { metodo: 'POST', corpo: { codigo: txt, quantidade } });
        atual = { ...atual, resumo: r.resumo, leituras: r.leituras };
        U.som('ok');
        desenhar({ produto: r.produto, contado: r.contado });
      } catch (e) {
        U.som('erro');
        desenhar(null, e.message);
      }
    });
    raiz.querySelector('#desfazer').onclick = async () => {
      try {
        const r = await api(`/api/inventarios/${inv.id}/desfazer`, { metodo: 'POST' });
        atual = { ...atual, ...r };
        aviso('Última leitura desfeita.');
        desenhar();
      } catch (e) { erro(e); }
      leitor.focus();
    };
    raiz.querySelector('#conferir').onclick = () => conferir(inv.id, false);
    raiz.querySelector('#cancelar').onclick = async () => {
      if (!(await U.confirmar('Cancelar inventário', 'Descartar toda a contagem? O estoque não será alterado.', { ok: 'Cancelar inventário', perigo: true }))) return;
      try {
        await api(`/api/inventarios/${inv.id}/cancelar`, { metodo: 'POST' });
        aviso('Inventário cancelado.');
        if (raiz) abrir(raiz);
      } catch (e) { erro(e); }
    };
    raiz.querySelector('#leituras').onclick = (ev) => {
      const b = ev.target.closest('[data-corrigir]');
      if (b) corrigir(Number(b.dataset.corrigir), b.dataset.nome, Number(b.dataset.contado));
    };
    desenhar();
    leitor.focus();
  }

  function desenhar(lido, mensagemErro) {
    if (!raiz) return;
    const r = atual.resumo;
    const pct = r.pecas_esperadas ? Math.min(100, Math.round((r.pecas_contadas / r.pecas_esperadas) * 100)) : 0;
    raiz.querySelector('#progresso').innerHTML = `
      <div class="inv-andamento">
        <div class="inv-pct"><b>${pct}%</b><small>contado</small></div>
        <div class="inv-barra-g"><div class="inv-barra-trilho"><i style="width:${pct}%"></i></div>
          <div class="inv-barra-txt"><span><b>${r.pecas_contadas}</b> de ${r.pecas_esperadas} peças</span><span><b>${r.produtos_contados}</b> de ${r.produtos_escopo} produtos</span></div></div>
      </div>`;
    const ult = raiz.querySelector('#ultimo');
    if (mensagemErro) {
      ult.className = 'inv-ultimo erro';
      ult.innerHTML = `<div class="inv-ultimo-txt"><small>Não contou</small><span>${esc(mensagemErro)}</span></div>`;
    } else if (lido) {
      const p = lido.produto;
      ult.className = `inv-ultimo ${lido.contado > p.estoque ? 'alerta' : 'ok'}`;
      ult.innerHTML = `${U.miniatura(p, 'ultimo-foto')}
        <div class="inv-ultimo-txt"><small>Contado</small><span>${esc(p.nome)}</span>
          <small>${esc([p.tamanho && 'Tam ' + p.tamanho, p.cor].filter(Boolean).join(' · '))}</small></div>
        <div class="inv-contagem"><b>${lido.contado}</b><small>de ${p.estoque} no sistema</small></div>`;
    } else if (!ult.innerHTML) {
      ult.className = 'inv-ultimo';
      ult.innerHTML = '<div class="inv-ultimo-txt"><small>Pronto</small><span>Bipe a primeira peça</span></div>';
    }
    raiz.querySelector('#leituras').innerHTML = atual.leituras.map((l) => `
      <div class="painel-item">${U.miniatura({ id: l.produto_id, foto_versao: l.foto_versao })}
        <span class="painel-item-txt"><b>${esc(l.nome)} ${esc([l.tamanho, l.cor].filter(Boolean).join(' · '))}</b>
          <small>${l.quantidade > 0 ? '+' : ''}${l.quantidade} · total contado ${l.contado} (sistema ${l.estoque}) · ${esc(l.usuario || '')} ${l.criado_em.slice(11, 16)}</small></span>
        <button class="btn btn-peq btn-fantasma" data-corrigir="${l.produto_id}" data-nome="${esc(l.nome)}" data-contado="${l.contado}">Corrigir</button>
      </div>`).join('') || '<div class="vazio">Nenhuma peça bipada ainda.</div>';
  }

  async function corrigir(produtoId, nome, contado) {
    const v = await U.perguntar('Corrigir contagem', `Quantas peças de "${nome}" existem de verdade?`, { valor: String(contado), tipo: 'number' });
    if (v === null) return;
    try {
      const r = await api(`/api/inventarios/${atual.inventario.id}/contagem/${produtoId}`, { metodo: 'PUT', corpo: { contado: Number(v) } });
      atual = { ...atual, resumo: r.resumo, leituras: r.leituras };
      desenhar();
    } catch (e) { erro(e); }
    raiz && raiz.querySelector('#leitor')?.focus();
  }

  // ---------------------------------------------------------- conferência
  async function conferir(id, somenteVer) {
    let c;
    try { c = await api(`/api/inventarios/${id}/conferencia`); } catch (e) { return erro(e); }
    const t = c.totais;
    const faltas = c.itens.filter((i) => i.diferenca < 0);
    const sobras = c.itens.filter((i) => i.diferenca > 0);
    const naoBipados = c.itens.filter((i) => !i.bipado && i.estoque > 0);
    const linha = (i) => `<div class="inv-dif">
      ${U.miniatura(i, 'pr-foto')}
      <div class="p4-item-txt"><b>${esc(i.nome)}</b><span class="p4-tags">${i.tamanho ? `<span class="p4-tag">Tam ${esc(i.tamanho)}</span>` : ''}${i.cor ? `<span class="p4-tag">${esc(i.cor)}</span>` : ''}<small>${esc(i.codigo)}</small></span></div>
      <div class="inv-dif-num"><small>sistema</small><b>${i.estoque}</b></div>
      <div class="inv-dif-num"><small>contado</small><b>${i.contado}</b></div>
      <span class="inv-dif-selo ${i.diferenca < 0 ? 'falta' : 'sobra'}">${i.diferenca > 0 ? '+' : ''}${i.diferenca}<small>${brl(Math.abs(i.diferenca) * (i.preco_custo || 0))}</small></span>
    </div>`;
    const tabela = (lista, vazio) => `<div class="inv-difs">${lista.map(linha).join('') || `<div class="vazio">${vazio}</div>`}</div>`;

    const corpo = abrirModal(`${somenteVer ? 'Resultado do' : 'Conferência do'} inventário nº ${id}`, `
      <div class="inv-res">
        <div class="falta"><small>${Icone('alerta')} Faltando</small><b>${faltas.reduce((a, i) => a - i.diferenca, 0)} peça(s)</b><span>${brl(t.valor_falta || 0)} de custo</span></div>
        <div class="sobra"><small>${Icone('mais')} Sobrando</small><b>${sobras.reduce((a, i) => a + i.diferenca, 0)} peça(s)</b><span>${brl(t.valor_sobra || 0)} de custo</span></div>
        <div class="ok"><small>${Icone('check')} Batendo</small><b>${c.itens.length - faltas.length - sobras.length}</b><span>produto(s) certinhos</span></div>
      </div>
      <div class="abas" id="abas">
        <button class="aba sel" data-aba="faltas">Faltando (${faltas.length})</button>
        <button class="aba" data-aba="sobras">Sobrando (${sobras.length})</button>
        ${somenteVer ? '' : `<button class="aba" data-aba="nao">Não bipados (${naoBipados.length})</button>`}
      </div>
      <div data-painel="faltas">${tabela(faltas, 'Nada faltando.')}</div>
      <div data-painel="sobras" hidden>${tabela(sobras, 'Nada sobrando.')}</div>
      ${somenteVer ? '' : `<div data-painel="nao" hidden>${tabela(naoBipados, 'Todos os produtos com estoque foram bipados.')}</div>
      <div class="finalizar-inv so-admin">
        <label class="check"><input type="checkbox" id="zerar" ${naoBipados.length ? 'checked' : ''}>
          Zerar o estoque dos ${naoBipados.length} produto(s) que não foram bipados (contei tudo)</label>
        <p class="dica">Desmarque se contou só uma parte da loja: aí só os produtos bipados são ajustados.</p>
        <div class="acoes">
          <button class="btn" data-fechar>Voltar a contar</button>
          <button class="btn btn-primario btn-grande" id="finalizar"><i data-icone="check"></i> Finalizar e ajustar estoque</button>
        </div>
      </div>`}`, { largura: '900px' });

    corpo.querySelector('#abas').onclick = (ev) => {
      const b = ev.target.closest('[data-aba]');
      if (!b) return;
      corpo.querySelectorAll('.aba').forEach((x) => x.classList.toggle('sel', x === b));
      corpo.querySelectorAll('[data-painel]').forEach((p) => { p.hidden = p.dataset.painel !== b.dataset.aba; });
    };
    const fin = corpo.querySelector('#finalizar');
    if (fin) {
      fin.onclick = async () => {
        const zerar = corpo.querySelector('#zerar').checked;
        if (!(await U.confirmar('Finalizar inventário', 'O estoque do sistema vai passar a ser o que foi contado. Isso não pode ser desfeito. Confirmar?', { ok: 'Finalizar e ajustar' }))) return;
        try {
          const r = await api(`/api/inventarios/${id}/finalizar`, { metodo: 'POST', corpo: { zerar_nao_bipados: zerar } });
          aviso(`Inventário finalizado: ${r.ajustados} produto(s) ajustado(s).`);
          if (raiz) abrir(raiz);
        } catch (e) { erro(e); }
      };
    }
  }

  return { abrir, sair: () => { raiz = null; } };
})();
