/* Reservas com sinal: peças separadas para a cliente buscar depois, com o que já foi pago e o que falta. */
Telas.reservas = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, dataHora, local } = U;
  let raiz;
  let lista = [];
  let status = 'aberta';

  const diasAte = (d) => Math.round((Date.parse(d + 'T00:00') - Date.parse(U.hoje() + 'T00:00')) / 864e5);
  const dataBr = (d) => d.split('-').reverse().join('/');
  const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const FORMAS_SINAL = [['dinheiro', 'dinheiro', 'Dinheiro'], ['pix', 'pix', 'PIX'], ['debito', 'cartao', 'Débito'], ['credito', 'cartao', 'Crédito']];

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Reservas</h1><p class="subtitulo">Peças separadas com sinal, esperando a cliente buscar.</p></div>
        <div class="ferramentas">
          <div class="segmentos" id="status">
            <button class="segmento ${status === 'aberta' ? 'sel' : ''}" data-st="aberta">Abertas</button><button class="segmento ${status === 'todas' ? 'sel' : ''}" data-st="todas">Todas</button>
          </div>
          <a class="btn btn-primario" href="#/pdv" title="Bipe as peças no caixa, escolha a cliente e clique em Reservar">${Icone('reserva')} Nova reserva</a>
        </div>
      </div>
      <div id="kpis"></div>
      <div class="cd-como">${Icone('reserva')}<span><b>Como reservar:</b> no caixa, bipe as peças, escolha a cliente e clique em <b>Reservar</b>.
        As peças saem do estoque e o sinal entra no caixa. Quando ela vier buscar, clique em <b>Retirar</b>: as peças vão para o caixa e o sinal já entra como pagamento.</span></div>
      <div class="cd-grade" id="lista"></div>`;
    raiz.querySelector('#status').onclick = (ev) => {
      const b = ev.target.closest('[data-st]');
      if (!b) return;
      status = b.dataset.st;
      raiz.querySelectorAll('#status .segmento').forEach((x) => x.classList.toggle('sel', x === b));
      carregar();
    };
    raiz.querySelector('#lista').onclick = (ev) => {
      if (ev.target.closest('[data-zap]')) return; // o WhatsApp cuida
      const card = ev.target.closest('[data-i]');
      if (!card) return;
      const r = lista[Number(card.dataset.i)];
      if (ev.target.closest('[data-retirar]')) retirar(r);
      else detalhe(r.id);
    };
    await carregar();
  }

  async function carregar() {
    if (!raiz) return;
    try { lista = await api(`/api/reservas?status=${status}`); } catch (e) { return erro(e); }
    if (!raiz) return; // saiu da tela enquanto carregava
    const abertas = lista.filter((r) => r.status === 'aberta');
    const vencidas = abertas.filter((r) => diasAte(r.prazo) < 0).length;
    raiz.querySelector('#kpis').innerHTML = status === 'aberta' ? `
      <div class="vd-kpis">
        <div class="vd-kpi destaque"><span>${Icone('reserva')} Reservas abertas</span><b>${abertas.length}</b><small>${abertas.reduce((a, r) => a + r.pecas, 0)} peça(s) separadas</small></div>
        <div class="vd-kpi"><span>${Icone('carteira')} Sinais recebidos</span><b>${brl(abertas.reduce((a, r) => a + r.pago, 0))}</b><small>já estão no caixa</small></div>
        <div class="vd-kpi"><span>${Icone('dinheiro')} Falta receber</span><b>${brl(abertas.reduce((a, r) => a + r.falta, 0))}</b><small>quando as clientes buscarem</small></div>
        <div class="vd-kpi"><span>${Icone('alerta')} Passaram do prazo</span><b class="${vencidas ? 'txt-perigo' : ''}">${vencidas}</b><small>${vencidas ? 'mande um lembrete' : 'tudo em dia'}</small></div>
      </div>` : '';
    raiz.querySelector('#lista').innerHTML = lista.map((r, i) => {
      const n = diasAte(r.prazo);
      const st = r.status !== 'aberta' ? 'encerrada' : n < 0 ? 'atrasada' : n <= 1 ? 'perto' : 'ok';
      const prazo = r.status === 'retirada' ? 'Retirada' : r.status === 'cancelada' ? 'Cancelada'
        : n < 0 ? `Venceu há ${-n} dia(s)` : n === 0 ? 'Busca hoje' : n === 1 ? 'Busca amanhã' : `Faltam ${n} dias`;
      const pct = r.total ? Math.round((r.pago / r.total) * 100) : 0;
      return `<div class="cd-card rs-card cd-${st}" data-i="${i}" tabindex="0">
        <div class="cd-topo">${U.avatarCliente(r.cliente_id, r.cliente_nome, r.cliente_foto)}
          <div><b>${esc(r.cliente_nome)}${r.origem === 'site' ? ' <span class="pr-selo pr-selo-novidade mini">Site</span>' : ''}</b><small>nº ${r.id} · ${dataHora(r.criado_em).split(' ')[0]}</small></div>
          <span class="cd-prazo">${prazo}<small>até ${dataBr(r.prazo)}</small></span></div>
        ${r.status === 'aberta' ? `<div class="cd-tempo" title="Tempo até o prazo"><i style="width:${U.pctPrazo(r.criado_em, r.prazo)}%"></i></div>` : ''}
        <div class="cd-fotos">${r.itens.slice(0, 5).map((it) => U.miniatura({ id: it.produto_id, foto_versao: it.foto_versao }, 'cd-foto')).join('')}
          ${r.itens.length > 5 ? `<span class="cd-mais">+${r.itens.length - 5}</span>` : ''}</div>
        <div class="rs-pago">
          <div class="rs-barra"><i style="width:${pct}%"></i></div>
          <div class="rs-valores"><span>Pago <b>${brl(r.pago)}</b></span><span>Falta <b>${brl(r.falta)}</b></span></div>
        </div>
        <div class="cd-rodape"><span><b>${r.pecas}</b> peça(s) · <b>${brl(r.total)}</b></span>
          <span class="cd-acoes">${r.status === 'aberta' && Zap.attrs(r.cliente_telefone, 'reserva', { nome: r.cliente_nome, prazo: dataBr(r.prazo), falta: brl(r.falta) })
    ? `<a class="btn-ico cd-zap" title="Lembrar no WhatsApp" ${Zap.attrs(r.cliente_telefone, 'reserva', { nome: r.cliente_nome, prazo: dataBr(r.prazo), falta: brl(r.falta) })}>${Icone('whatsapp')}</a>` : ''}
          ${r.status === 'aberta' ? `<button class="btn btn-primario btn-peq" data-retirar>${Icone('sacola')} Retirar</button>` : ''}</span></div>
      </div>`;
    }).join('') || `<div class="vd-vazio cd-vazio">${Ilustracao.svg('presente', 150)}<b>Nenhuma reserva ${status === 'aberta' ? 'aberta' : ''}</b><br>
      <small>No caixa: bipe as peças, escolha a cliente e clique em <b>Reservar</b>.</small></div>`;
  }

  /** A cliente veio buscar: as peças vão para o caixa e o sinal entra como pagamento (vale da reserva). */
  async function retirar(r) {
    const ok = await U.confirmar(`Retirar a reserva nº ${r.id}?`,
      `As ${r.pecas} peça(s) vão para o caixa. ${r.pago ? `O sinal de ${brl(r.pago)} já entra no pagamento e falta receber ${brl(r.falta)}.` : `Falta receber ${brl(r.total)}.`}`);
    if (!ok || !(await Telas.pdv.podeSubstituirVenda())) return;
    try {
      const res = await api(`/api/reservas/${r.id}/retirar`, { metodo: 'POST' });
      const produtos = await Promise.all(res.itens.map((it) => api(`/api/produtos/${it.produto_id}`)));
      // Vale o preço combinado na reserva (o servidor confere pela reserva_id).
      const itens = res.itens.map((it, i) => ({
        produto: { ...produtos[i], preco_venda: Math.min(produtos[i].preco_venda, it.preco) },
        quantidade: it.quantidade,
      }));
      if (res.vale) local.gravar('pdv_vale_pendente', { codigo: res.vale.codigo, saldo: res.vale.saldo });
      fecharModal();
      aviso(res.vale ? `Reserva retirada: o sinal (${brl(res.vale.saldo)}) entra no pagamento.` : 'Reserva retirada: receba o pagamento no caixa.');
      Telas.pdv.carregarVenda({ itens, reservaId: r.id, cliente: { id: res.reserva.cliente_id, nome: res.reserva.cliente_nome, cpf: res.reserva.cliente_cpf } });
    } catch (e) { erro(e); }
  }

  /** Escolha da forma de pagamento (e bandeira do cartão) usada no sinal. */
  function camposPagamento(prefixo, valor) {
    return `
      <label>Valor<div class="campo-moeda"><span>R$</span><input id="${prefixo}-valor" inputmode="decimal" value="${valor ? U.num(valor) : ''}"></div></label>
      <div class="rs-formas" id="${prefixo}-formas">${FORMAS_SINAL.map(([k, , n], i) =>
    `<button type="button" class="rs-forma ${i === 0 ? 'sel' : ''}" data-f="${k}">${Icone.pag(k)}<span>${n}</span></button>`).join('')}</div>
      <div class="rs-band" id="${prefixo}-band" hidden><div class="segmentos">${Object.entries(U.BANDEIRAS).map(([k, n], i) =>
    `<button type="button" class="segmento ${i === 0 ? 'sel' : ''}" data-b="${k}">${n}</button>`).join('')}</div></div>`;
  }
  function lerPagamento(corpo, prefixo) {
    const sel = (s) => corpo.querySelector(`#${prefixo}-${s} .sel`);
    return {
      valor: U.paraCentavos(corpo.querySelector(`#${prefixo}-valor`).value) || 0,
      forma: sel('formas').dataset.f,
      bandeira: sel('band') ? sel('band').dataset.b : undefined,
    };
  }
  function ligarPagamento(corpo, prefixo, aoMudar = () => {}) {
    corpo.querySelector(`#${prefixo}-formas`).onclick = (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      corpo.querySelectorAll(`#${prefixo}-formas .rs-forma`).forEach((x) => x.classList.toggle('sel', x === b));
      corpo.querySelector(`#${prefixo}-band`).hidden = !['debito', 'credito'].includes(b.dataset.f);
      aoMudar();
    };
    corpo.querySelector(`#${prefixo}-band`).onclick = (e) => {
      const b = e.target.closest('[data-b]');
      if (!b) return;
      corpo.querySelectorAll(`#${prefixo}-band .segmento`).forEach((x) => x.classList.toggle('sel', x === b));
      aoMudar();
    };
    corpo.querySelector(`#${prefixo}-valor`).addEventListener('input', aoMudar);
  }

  /** Cria a reserva a partir das peças do caixa (chamado pela tela de venda). */
  async function criar({ itens, cliente, aoCriar }) {
    const cfg = await U.config();
    const prazo = new Date(Date.now() + (Number(cfg.reserva_prazo_dias) || 7) * 864e5).toLocaleDateString('sv-SE');
    const total = itens.reduce((a, it) => a + it.produto.preco_venda * it.quantidade, 0);
    const pct = Number(cfg.reserva_sinal_pct) || 30;
    const sugerido = Math.round((total * pct) / 100 / 100) * 100;
    const corpo = abrirModal('Reservar peças', `
      <div class="rs-novo">
        <div class="rs-quem"><span class="avatar">${esc(iniciais(cliente.nome))}</span>
          <div><b>${esc(cliente.nome)}</b><small>${itens.reduce((a, it) => a + it.quantidade, 0)} peça(s) · ${brl(total)}</small></div>
          <div class="cd-fotos">${itens.slice(0, 4).map((it) => U.miniatura(it.produto, 'cd-foto')).join('')}</div></div>
        <div class="p4-passo"><span>1</span>Sinal <small>&nbsp;sugestão: ${pct}% = ${brl(sugerido)}</small></div>
        ${camposPagamento('rs', sugerido)}
        <div class="p4-passo"><span>2</span>Até quando fica separado</div>
        <div class="grade-form">
          <label>Buscar até<input type="date" id="rs-prazo" value="${prazo}" required></label>
          <label>Observação<input id="rs-obs" placeholder="Ex.: vai buscar depois do pagamento"></label>
        </div>
        <div class="rs-resumo" id="rs-resumo"></div>
        <div class="acoes"><button type="button" class="btn" data-fechar>Voltar</button>
          <button class="btn btn-primario btn-grande" id="rs-ok">${Icone('reserva')} Reservar e imprimir</button></div>
      </div>`, { largura: '620px' });
    const resumo = () => {
      const p = lerPagamento(corpo, 'rs');
      const falta = Math.max(0, total - p.valor);
      corpo.querySelector('#rs-resumo').innerHTML = `
        <div><small>Total</small><b>${brl(total)}</b></div>
        <div><small>Sinal agora</small><b class="txt-ok">${brl(Math.min(p.valor, total))}</b></div>
        <div class="rs-falta"><small>Falta na retirada</small><b>${brl(falta)}</b></div>`;
    };
    ligarPagamento(corpo, 'rs', resumo);
    resumo();
    corpo.querySelector('#rs-valor').select();
    corpo.querySelector('#rs-ok').onclick = U.umaVez(corpo.querySelector('#rs-ok'), async (ev) => {
      const p = lerPagamento(corpo, 'rs');
      if (p.valor > total) return aviso('O sinal não pode ser maior que o total.', 'erro');
      try {
        const r = await api('/api/reservas', {
          metodo: 'POST',
          corpo: {
            cliente_id: cliente.id, prazo: corpo.querySelector('#rs-prazo').value, observacao: corpo.querySelector('#rs-obs').value,
            itens: itens.map((it) => ({ produto_id: it.produto.id, quantidade: it.quantidade })),
            sinal: p.valor ? p : null,
          },
        });
        U.som('sucesso');
        Impressao.reserva(r);
        if (aoCriar) aoCriar(r);
        concluida(r);
      } catch (e) {
        erro(e);
      }
    });
  }

  function concluida(r) {
    const corpo = abrirModal(`Reserva nº ${r.id} registrada`, `
      <div class="vc">
        <div class="vc-ico">${Icone('reserva')}</div>
        <div class="vc-rotulo">Peças separadas para ${esc(r.cliente_nome.split(' ')[0])}</div>
        <div class="vc-valor">${brl(r.falta)}</div>
        <div class="vc-det">falta pagar na retirada · sinal de ${brl(r.pago)} · buscar até ${dataBr(r.prazo)}</div>
      </div>
      <div class="vc-acoes">
        <button class="btn" id="imp">${Icone('impressora')} Imprimir de novo</button>
        <button class="btn btn-primario btn-grande vc-nova" data-fechar autofocus>${Icone('sacola')} Próxima venda <kbd>Enter</kbd></button>
      </div>`, { largura: '520px' });
    corpo.querySelector('#imp').onclick = () => Impressao.reserva(r);
  }

  async function detalhe(id) {
    let r;
    try { r = await api(`/api/reservas/${id}`); } catch (e) { return erro(e); }
    const aberta = r.status === 'aberta';
    const tel = String(r.cliente_telefone || '').replace(/\D/g, '').replace(/^55/, '');
    const DESTINO = { venda: 'retirada e paga', vale: `sinal virou crédito (vale ${esc(r.vale_codigo || '')})`, dinheiro: 'sinal devolvido em dinheiro', loja: 'a loja ficou com o sinal', nenhum: 'sem sinal' };
    const corpo = abrirModal(`Reserva nº ${r.id} — ${r.cliente_nome}`, `
      <div class="tr-cab">
        <span>${Icone('relogio')} ${dataHora(r.criado_em)}${r.usuario ? ` por ${esc(r.usuario)}` : ''}</span>
        <span>${Icone('reserva')} buscar até <b>&nbsp;${dataBr(r.prazo)}</b></span>
        ${!aberta ? `<span class="selo">${r.status} · ${DESTINO[r.destino_sinal] || ''}</span>` : ''}
      </div>
      ${r.observacao ? `<p class="dica">${esc(r.observacao)}</p>` : ''}
      <div class="tr-itens">${r.itens.map((it) => `
        <div class="tr-item">
          ${U.miniatura({ id: it.produto_id, foto_versao: it.foto_versao }, 'p4-item-foto')}
          <div class="p4-item-txt"><b>${esc(it.nome)}</b>
            <span class="p4-tags">${it.tamanho ? `<span class="p4-tag">Tam ${esc(it.tamanho)}</span>` : ''}${it.cor ? `<span class="p4-tag">${esc(it.cor)}</span>` : ''}<small>${it.quantidade} x ${brl(it.preco)}</small></span></div>
          <b>${brl(it.quantidade * it.preco)}</b><span></span>
        </div>`).join('')}</div>
      <div class="rs-det">
        <div class="rs-linha-tempo">${r.sinais.map((s) => `<div><i></i><span><b>${brl(s.valor)}</b> · ${U.FORMAS[s.forma] || s.forma}${s.bandeira ? ` (${U.BANDEIRAS[s.bandeira]})` : ''}<small>${dataHora(s.criado_em)}${s.operador ? ` · ${esc(s.operador)}` : ''}</small></span></div>`).join('') || '<small>Nenhum sinal pago.</small>'}</div>
        <div class="rs-resumo"><div><small>Total</small><b>${brl(r.total)}</b></div><div><small>Pago</small><b class="txt-ok">${brl(r.pago)}</b></div><div class="rs-falta"><small>Falta</small><b>${brl(r.falta)}</b></div></div>
      </div>
      <div class="acoes">
        ${aberta ? `<button class="btn btn-fantasma btn-perigo-claro" id="cancelar" style="margin-right:auto">${Icone('fechar')} Cancelar</button>` : ''}
        ${aberta && Zap.attrs(tel, 'reserva', { nome: r.cliente_nome, prazo: dataBr(r.prazo), falta: brl(r.falta) })
    ? `<a class="btn cl-btn-zap" ${Zap.attrs(tel, 'reserva', { nome: r.cliente_nome, prazo: dataBr(r.prazo), falta: brl(r.falta) })}>${Icone('whatsapp')} Lembrar</a>` : ''}
        ${aberta ? `<button class="btn" id="prazo">${Icone('relogio')} Mudar prazo</button>` : ''}
        ${aberta && r.falta ? `<button class="btn" id="sinal">${Icone('mais')} Receber mais</button>` : ''}
        <button class="btn" id="reimprimir">${Icone('impressora')} Imprimir</button>
        ${aberta ? `<button class="btn btn-primario btn-grande" id="retirar">${Icone('sacola')} Retirar</button>` : ''}
      </div>`, { largura: '820px' });
    corpo.querySelector('#reimprimir').onclick = () => Impressao.reserva(r);
    if (!aberta) return;
    corpo.querySelector('#retirar').onclick = () => retirar(r);
    corpo.querySelector('#cancelar').onclick = () => cancelar(r);
    corpo.querySelector('#prazo').onclick = async () => {
      const v = await U.perguntar('Novo prazo', 'Até quando a reserva fica separada? (dd/mm/aaaa)', { valor: dataBr(r.prazo) });
      if (!v) return;
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
      if (!m) return aviso('Use o formato dd/mm/aaaa.', 'erro');
      try {
        await api(`/api/reservas/${r.id}/prazo`, { metodo: 'POST', corpo: { prazo: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` } });
        aviso('Prazo alterado.');
        detalhe(r.id);
        carregar();
      } catch (e) { erro(e); }
    };
    const bSinal = corpo.querySelector('#sinal');
    if (bSinal) bSinal.onclick = () => receberMais(r);
  }

  function receberMais(r) {
    const corpo = abrirModal(`Receber mais — reserva nº ${r.id}`, `
      <p>Falta <b>${brl(r.falta)}</b>. Quanto a cliente está pagando agora?</p>
      ${camposPagamento('mais', r.falta)}
      <div class="acoes"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn btn-primario" id="ok">${Icone('check')} Receber</button></div>`, { largura: '520px' });
    ligarPagamento(corpo, 'mais');
    corpo.querySelector('#mais-valor').select();
    corpo.querySelector('#ok').onclick = U.umaVez(corpo.querySelector('#ok'), async () => {
      try {
        const nova = await api(`/api/reservas/${r.id}/sinal`, { metodo: 'POST', corpo: lerPagamento(corpo, 'mais') });
        aviso(`Recebido. Falta ${brl(nova.falta)}.`);
        Impressao.reserva(nova);
        detalhe(r.id);
        carregar();
      } catch (e) { erro(e); }
    });
  }

  function cancelar(r) {
    const corpo = abrirModal(`Cancelar reserva nº ${r.id}`, `
      <p>As peças voltam para o estoque.${r.pago ? ` E o sinal de <b>${brl(r.pago)}</b>?` : ''}</p>
      ${r.pago ? `<div class="rs-destinos">
        <label class="rs-destino sel"><input type="radio" name="d" value="vale" checked>${Icone('vale')}<span><b>Vira crédito na loja</b><small>Gera um vale no nome da cliente (recomendado)</small></span></label>
        <label class="rs-destino"><input type="radio" name="d" value="dinheiro">${Icone('dinheiro')}<span><b>Devolver em dinheiro</b><small>Sai da gaveta como sangria</small></span></label>
        <label class="rs-destino"><input type="radio" name="d" value="loja">${Icone('carteira')}<span><b>A loja fica com o sinal</b><small>Quando foi combinado que não devolve</small></span></label>
      </div>` : ''}
      <div class="acoes"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn btn-perigo" id="ok">${Icone('fechar')} Cancelar reserva</button></div>`, { largura: '540px' });
    corpo.querySelectorAll('.rs-destino input').forEach((i) => {
      i.onchange = () => corpo.querySelectorAll('.rs-destino').forEach((l) => l.classList.toggle('sel', l.contains(corpo.querySelector('.rs-destino input:checked'))));
    });
    corpo.querySelector('#ok').onclick = U.umaVez(corpo.querySelector('#ok'), async () => {
      const d = corpo.querySelector('.rs-destino input:checked');
      try {
        const res = await api(`/api/reservas/${r.id}/cancelar`, { metodo: 'POST', corpo: { destino: d ? d.value : undefined } });
        fecharModal();
        aviso(res.vale ? `Reserva cancelada. Vale ${res.vale.codigo} de ${brl(res.vale.saldo)} no nome da cliente.` : 'Reserva cancelada.');
        carregar();
      } catch (e) { erro(e); }
    });
  }

  return { abrir, criar, retirar, sair: () => { raiz = null; } };
})();
