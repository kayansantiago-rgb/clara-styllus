/* Consulta de vendas, reimpressão, troca, cancelamento e exclusão. */
Telas.vendas = (() => {
  const { esc, brl, num, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;
  let vendas = [];
  let periodo = 'hoje';
  let filtroForma = '';

  const FILTROS_FORMA = [['', 'Todas'], ['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['cartao', 'Cartão'], ['crediario', 'Crediário'], ['vale', 'Vale-troca']];
  const PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['mes', 'Este mês'], ['outro', 'Escolher datas']];

  const CURTO = { debito: 'Débito', credito: 'Crédito', crediario: 'Crediário', vale: 'Vale-troca', dinheiro: 'Dinheiro', pix: 'PIX', outro: 'Outro' };
  const nomeForma = (f) => CURTO[f] || U.FORMAS[f] || f;
  const iso = (d) => d.toLocaleDateString('sv-SE');
  function intervalo(p) {
    const hoje = new Date();
    const dia = (n) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return iso(d); };
    if (p === 'ontem') return [dia(-1), dia(-1)];
    if (p === '7d') return [dia(-6), dia(0)];
    if (p === 'mes') return [iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), dia(0)];
    return [dia(0), dia(0)];
  }

  const hora = (dt) => (dt.split(' ')[1] || '').slice(0, 5);
  const formasDe = (v) => (v.formas || '').split(',').filter(Boolean);

  function chipForma(forma, extra = '') {
    return `<span class="chip-forma forma-${esc(forma)}">${Icone.pag(forma)}${esc(nomeForma(forma))}${extra}</span>`;
  }

  async function abrir(el) {
    raiz = el;
    const [de, ate] = intervalo(periodo);
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div>
          <h1>Vendas</h1>
          <p class="subtitulo">Histórico do caixa: reimprimir cupom, fazer troca ou cancelar.</p>
        </div>
        <div class="busca-ico">${Icone('codigo')}
          <input id="num" placeholder="Nº da venda ou bipe o cupom" autocomplete="off"></div>
      </div>

      <div class="vd-filtros">
        <div class="segmentos" id="periodos">
          ${PERIODOS.map(([k, t]) => `<button class="segmento ${k === periodo ? 'sel' : ''}" data-periodo="${k}">${t}</button>`).join('')}
        </div>
        <div class="vd-datas" id="datas" ${periodo === 'outro' ? '' : 'hidden'}>
          <input type="date" id="de" value="${de}"><span>até</span><input type="date" id="ate" value="${ate}">
        </div>
        <div class="busca-ico vd-filtro-txt">${Icone('busca')}
          <input id="filtro" type="search" placeholder="Filtrar por cliente ou vendedor(a)" autocomplete="off"></div>
      </div>

      <div class="vd-kpis" id="kpis"></div>

      <div class="vd-barra-filtros">
        <div class="chips-filtro" id="formas">
          ${FILTROS_FORMA.map(([k, t]) => `<button class="chip-filtro ${k === filtroForma ? 'sel' : ''}" data-forma="${k}">${k ? Icone.pag(k) : ''}${t}</button>`).join('')}
        </div>
        <label class="interruptor vd-canceladas"><input type="checkbox" id="canceladas" checked><span class="trilho"></span>
          <span class="txt"><b>Mostrar canceladas</b></span></label>
      </div>

      <div id="lista" class="vd-lista"></div>`;

    raiz.querySelector('#periodos').onclick = (ev) => {
      const b = ev.target.closest('[data-periodo]');
      if (!b) return;
      periodo = b.dataset.periodo;
      raiz.querySelectorAll('.segmento').forEach((x) => x.classList.toggle('sel', x === b));
      raiz.querySelector('#datas').hidden = periodo !== 'outro';
      if (periodo !== 'outro') {
        const [d1, d2] = intervalo(periodo);
        raiz.querySelector('#de').value = d1;
        raiz.querySelector('#ate').value = d2;
      }
      carregar();
    };
    raiz.querySelector('#de').onchange = carregar;
    raiz.querySelector('#ate').onchange = carregar;
    raiz.querySelector('#filtro').addEventListener('input', U.debounce(desenhar, 150));
    raiz.querySelector('#canceladas').onchange = desenhar;
    raiz.querySelector('#formas').onclick = (ev) => {
      const b = ev.target.closest('[data-forma]');
      if (!b) return;
      filtroForma = b.dataset.forma;
      raiz.querySelectorAll('.chip-filtro').forEach((x) => x.classList.toggle('sel', x === b));
      desenhar();
    };
    raiz.querySelector('#num').addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const id = ev.target.value.replace(/\D/g, '');
      ev.target.value = '';
      if (id) detalhe(id);
    });
    raiz.querySelector('#lista').onclick = (ev) => {
      const exc = ev.target.closest('[data-excluir]');
      if (exc) return excluir(exc.dataset.excluir);
      const linha = ev.target.closest('[data-id]');
      if (linha) detalhe(linha.dataset.id);
    };
    raiz.querySelector('#lista').onkeydown = (ev) => {
      const linha = ev.target.closest('[data-id]');
      if (linha && ev.key === 'Enter') detalhe(linha.dataset.id);
    };
    await carregar();
  }

  async function carregar() {
    const de = raiz.querySelector('#de').value;
    const ate = raiz.querySelector('#ate').value;
    try {
      vendas = await api(`/api/vendas?de=${de}&ate=${ate}`);
    } catch (e) { return erro(e); }
    desenhar();
  }

  function filtradas() {
    const q = raiz.querySelector('#filtro').value.trim().toLowerCase();
    const comCanceladas = raiz.querySelector('#canceladas').checked;
    return vendas.filter((v) => {
      if (!comCanceladas && v.status === 'cancelada') return false;
      if (q && !`${v.cliente_nome || ''} ${v.vendedor || ''} ${v.id}`.toLowerCase().includes(q)) return false;
      if (filtroForma) {
        const f = formasDe(v);
        if (filtroForma === 'cartao' ? !f.some((x) => x === 'debito' || x === 'credito') : !f.includes(filtroForma)) return false;
      }
      return true;
    });
  }

  function desenhar() {
    if (!raiz) return;
    const lista = filtradas();
    const ok = lista.filter((v) => v.status === 'concluida');
    const total = ok.reduce((a, v) => a + v.total, 0);
    const pecas = ok.reduce((a, v) => a + (v.pecas || 0), 0);
    const canceladas = lista.length - ok.length;

    // Quanto entrou por forma de pagamento (venda com mais de uma forma conta em cada uma).
    const porForma = {};
    for (const v of ok) for (const f of formasDe(v)) porForma[f] = (porForma[f] || 0) + 1;
    const formasOrd = Object.entries(porForma).sort((a, b) => b[1] - a[1]);
    const somaF = formasOrd.reduce((a, [, n]) => a + n, 0) || 1;

    raiz.querySelector('#kpis').innerHTML = `
      <div class="vd-kpi destaque"><span>${Icone('carteira')} Faturamento</span><b>${brl(total)}</b>
        <small>${canceladas ? `${canceladas} cancelada(s) fora da conta` : 'vendas concluídas'}</small></div>
      <div class="vd-kpi vd-kpi-cai"><span>${Icone('dinheiro')} Cai na conta</span><b>${brl(ok.reduce((a, v) => a + (v.liquido ?? v.total), 0))}</b>
        <small>depois das taxas das maquininhas</small></div>
      <div class="vd-kpi"><span>${Icone('recibo')} Vendas</span><b>${ok.length}</b><small>${pecas} peça(s)</small></div>
      <div class="vd-kpi"><span>${Icone('grafico')} Ticket médio</span><b>${brl(ok.length ? Math.round(total / ok.length) : 0)}</b>
        <small>${ok.length ? `${(pecas / ok.length).toFixed(1).replace('.', ',')} peça(s) por venda` : '—'}</small></div>
      <div class="vd-kpi vd-kpi-formas"><span>${Icone('cartao')} Como pagaram</span>
        ${formasOrd.length ? `<div class="vd-barra-formas">${formasOrd.map(([f, n]) =>
    `<i class="forma-${esc(f)}" style="flex:${n}" title="${esc(nomeForma(f))}: ${n}"></i>`).join('')}</div>
          <div class="vd-legenda">${formasOrd.slice(0, 4).map(([f, n]) =>
    `<span><i class="forma-${esc(f)}"></i>${esc(nomeForma(f))} ${Math.round((n / somaF) * 100)}%</span>`).join('')}</div>`
    : '<small>sem vendas no período</small>'}</div>`;

    const el = raiz.querySelector('#lista');
    if (!lista.length) {
      el.innerHTML = `<div class="vd-vazio">${Ilustracao.svg('recibo', 150)}
        <b>Nenhuma venda encontrada</b><br><small>Mude o período ou os filtros acima.</small></div>`;
      return;
    }
    // Agrupa por dia, do mais recente para o mais antigo.
    const dias = new Map();
    for (const v of lista) {
      const d = v.criado_em.split(' ')[0];
      if (!dias.has(d)) dias.set(d, []);
      dias.get(d).push(v);
    }
    const hojeIso = U.hoje();
    const ontemIso = intervalo('ontem')[0];
    el.innerHTML = [...dias.entries()].map(([d, vs]) => {
      const okDia = vs.filter((v) => v.status === 'concluida');
      const data = new Date(d + 'T12:00');
      const nomeDia = d === hojeIso ? 'Hoje' : d === ontemIso ? 'Ontem'
        : data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      return `<section class="vd-dia">
        <header><b>${esc(nomeDia.charAt(0).toUpperCase() + nomeDia.slice(1))}</b>
          <span>${okDia.length} venda(s) · <b>${brl(okDia.reduce((a, v) => a + v.total, 0))}</b></span></header>
        ${vs.map(linha).join('')}
      </section>`;
    }).join('');
  }

  function linha(v) {
    const cancelada = v.status === 'cancelada';
    return `<div class="vd-venda ${cancelada ? 'cancelada' : ''}" data-id="${v.id}" tabindex="0">
      <div class="vd-hora"><b>${hora(v.criado_em)}</b><small>nº ${v.id}</small></div>
      <div class="vd-cliente">
        ${v.cliente_nome ? U.avatarCliente(v.cliente_id, v.cliente_nome, v.cliente_foto) : `<span class="avatar avatar-vazio">${Icone('usuario')}</span>`}
        <span><b>${esc(v.cliente_nome || 'Cliente não identificada')}</b><small>por ${esc(v.vendedor || '—')}</small></span>
      </div>
      <div class="vd-fotos">${(v.fotos || []).map((f) => U.miniatura(f, 'vd-foto')).join('')}${v.pecas > (v.fotos || []).length && (v.fotos || []).length >= 4 ? `<span class="vd-foto-mais">+${v.pecas - 4}</span>` : ''}</div>
      <div class="vd-formas">${formasDe(v).map((f) => chipForma(f)).join('')}</div>
      <div class="vd-pecas">${v.pecas || 0} <small>peça${v.pecas === 1 ? '' : 's'}</small></div>
      <div class="vd-total">${cancelada ? '<span class="selo perigo">Cancelada</span>' : ''}<b>${brl(v.total)}</b></div>
      <div class="vd-acoes so-admin"><button class="btn-ico perigo" data-excluir="${v.id}" title="Excluir venda">${Icone('lixeira')}</button></div>
    </div>`;
  }

  async function detalhe(id) {
    let v;
    try {
      v = await api(`/api/vendas/${id}`);
    } catch (e) { return erro(e); }
    const cancelada = v.status === 'cancelada';
    const pecas = v.itens.reduce((a, it) => a + it.quantidade, 0);
    const corpo = abrirModal(`Venda nº ${v.id}`, `
      <div class="vd-det-topo ${cancelada ? 'cancelada' : ''}">
        ${v.cliente_id ? U.avatarCliente(v.cliente_id, v.cliente_nome, v.cliente_foto, 'avatar vd-det-avatar') : ''}
        <div>
          <small>${dataHora(v.criado_em)}</small>
          <b>${brl(v.total)}</b>
          <span>${pecas} peça(s) · ${v.pagamentos.map((p) => chipForma(p.forma, p.parcelas > 1 ? ` ${p.parcelas}x` : '')).join(' ')}</span>
        </div>
        ${cancelada ? '<span class="selo perigo">Cancelada</span>' : `<span class="selo ok">${Icone('check')} Concluída</span>`}
      </div>
      ${cancelada ? `<div class="alerta-box">Cancelada em ${dataHora(v.cancelada_em)} — ${esc(v.motivo_cancelamento)}</div>` : ''}
      <div class="vd-det-info">
        <div><small>Cliente</small><b>${esc(v.cliente_nome || '—')}</b></div>
        <div><small>Vendedor(a)</small><b>${esc(v.vendedor || '—')}</b></div>
        <div><small>CPF/CNPJ no cupom</small><b>${esc(U.cpf(v.cpf_nota) || '—')}</b></div>
      </div>
      <div class="vd-recibo">
      <div class="vd-recibo-cab"><img src="/img/logo-cupom.png" alt="" onerror="this.remove()"><small>Venda nº ${v.id} · ${dataHora(v.criado_em)}</small></div>
      <div class="vd-det-itens">
        ${v.itens.map((it) => `<div class="vd-item">
          ${U.miniatura({ id: it.produto_id, foto_versao: it.foto_versao })}
          <span class="vd-item-txt"><b>${esc(it.nome)}</b><small>${esc([it.tamanho && 'Tam ' + it.tamanho, it.cor, it.codigo].filter(Boolean).join(' · '))}</small></span>
          <span class="vd-item-qtd">${it.quantidade} × ${num(it.preco_unitario)}${it.desconto ? `<small>desc. ${num(it.desconto)}</small>` : ''}</span>
          <b>${num(it.total)}</b>
        </div>`).join('')}
      </div>
      <div class="vd-det-totais">
        <div class="linha"><span>Subtotal</span><span>${brl(v.subtotal)}</span></div>
        ${v.desconto ? `<div class="linha"><span>Descontos</span><span>−${brl(v.desconto)}</span></div>` : ''}
        ${v.acrescimo ? `<div class="linha"><span>Juros do cartão (pagos pela cliente)</span><span>+${brl(v.acrescimo)}</span></div>` : ''}
        ${v.pagamentos.map((p) => `<div class="linha"><span>${esc(U.FORMAS[p.forma] || p.forma)}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''}${p.bandeira ? ` <small>${esc(U.BANDEIRAS[p.bandeira] || '')}</small>` : ''}${p.referencia ? ` <small>${esc(p.referencia)}</small>` : ''}${
  p.taxa ? ` <small class="txt-perigo">taxa ${brl(p.taxa)}</small>` : ''}</span><span>${brl(p.valor)}</span></div>`).join('')}
        ${v.troco ? `<div class="linha"><span>Troco</span><span>${brl(v.troco)}</span></div>` : ''}
        <div class="linha total"><span>Total</span><span>${brl(v.total)}</span></div>
        ${v.taxas ? `<div class="linha vd-cai"><span>${Icone('carteira')} Cai na conta (sem as taxas)</span><b>${brl(v.liquido)}</b></div>` : ''}
      </div>
      <div class="vd-recibo-pe">Obrigada pela preferência!</div>
      </div>
      ${v.crediario && v.crediario.length ? `<h3 class="titulo-ico">${Icone('caderno')} Parcelas do crediário</h3>
        <div class="vd-parcelas">${v.crediario.map((p) => `<div class="linha"><span>${p.numero}/${p.total_parcelas} · venc. ${p.vencimento.split('-').reverse().join('/')}</span>
          <span>${brl(p.valor)} ${p.status === 'paga' ? '<span class="selo ok">paga</span>' : p.status === 'cancelada' ? '<span class="selo perigo">cancelada</span>' : p.valor_pago ? `<small>pago ${brl(p.valor_pago)}</small>` : ''}</span></div>`).join('')}</div>` : ''}
      <div class="acoes vd-det-acoes">
        ${U.sessao.ehAdmin() ? `<button class="btn btn-fantasma btn-perigo-claro" id="excluir">${Icone('lixeira')} Excluir</button>` : ''}
        ${!cancelada && U.sessao.ehAdmin() ? `<button class="btn btn-fantasma btn-perigo-claro" id="cancelar">${Icone('fechar')} Cancelar venda</button>` : ''}
        <span class="espaco"></span>
        ${!cancelada ? `<button class="btn" id="devolver">${Icone('troca')} Troca / devolução</button>` : ''}
        <button class="btn" id="troca">${Icone('presente')} Cupom de troca</button>
        <button class="btn btn-primario" id="cupom">${Icone('impressora')} Reimprimir cupom</button>
      </div>`, { largura: '860px' });
    corpo.querySelector('#cupom').onclick = () => Impressao.cupom(v);
    corpo.querySelector('#troca').onclick = () => Impressao.cupomTroca(v);
    const dev = corpo.querySelector('#devolver');
    if (dev) dev.onclick = () => Trocas.abrirVenda(v.id);
    const btnExcluir = corpo.querySelector('#excluir');
    if (btnExcluir) btnExcluir.onclick = () => excluir(v.id);
    const btnCancelar = corpo.querySelector('#cancelar');
    if (btnCancelar) {
      btnCancelar.onclick = async () => {
        const motivo = await U.perguntar('Cancelar venda', 'Motivo do cancelamento (as peças voltam para o estoque):');
        if (!motivo) return;
        try {
          await api(`/api/vendas/${v.id}/cancelar`, { metodo: 'POST', corpo: { motivo } });
          aviso(`Venda nº ${v.id} cancelada.`);
          fecharModal();
          if (raiz) carregar();
        } catch (e) { erro(e); }
      };
    }
  }

  /** Excluir de vez (só administrador): para venda lançada errado ou de teste. */
  async function excluir(id) {
    const ok = await U.confirmar('Excluir venda', `A venda nº ${id} será apagada do sistema e não aparecerá mais nos relatórios
      nem no caixa. Se ela não estava cancelada, as peças voltam para o estoque. Essa ação não pode ser desfeita.`,
    { ok: 'Excluir venda', perigo: true });
    if (!ok) return;
    try {
      await api(`/api/vendas/${id}`, { metodo: 'DELETE' });
      aviso(`Venda nº ${id} excluída.`);
      fecharModal();
      if (raiz) carregar();
    } catch (e) { erro(e); }
  }

  return { abrir, detalhe, sair: () => { raiz = null; } };
})();
