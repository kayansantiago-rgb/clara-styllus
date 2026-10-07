/*
 * Impressão de cupom, cupom de troca, fechamento de caixa, recibo do crediário e etiquetas.
 *
 * Modo padrão ("direta"): o servidor manda os comandos (ESC/POS, ZPL ou EPL) direto para a
 * impressora escolhida em Configurações — sem o diálogo do navegador, sem margens nem escala.
 * O modo "navegador" continua disponível como alternativa (ex.: etiquetas em folha A4).
 */
const Impressao = (() => {
  const { esc, brl, num, dataHora, cpf, FORMAS } = U;

  /** Imprime um documento HTML num iframe escondido (abre o diálogo de impressão do navegador). */
  function imprimirHtml(css, corpo) {
    const frame = document.getElementById('frame-impressao');
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
      <body>${corpo}</body></html>`);
    doc.close();
    // Pequena espera para o navegador montar o layout antes de imprimir.
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    }, 150);
  }

  // ---------------------------------------------------------------- cupom
  function cssCupom(cfg) {
    const largura = Number(cfg.cupom_largura_mm) || 80;
    const util = largura - (largura >= 80 ? 8 : 6); // área imprimível aproximada
    const fonte = largura >= 80 ? 12 : 10;
    return `
      @page { size: ${largura}mm auto; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: 'Courier New', monospace; font-size: ${fonte}px; color: #000; }
      .cupom { width: ${util}mm; padding: 3mm 0; margin: 0 auto; }
      .cupom + .cupom { page-break-before: always; }
      .c { text-align: center; }
      .r { text-align: right; }
      .b { font-weight: bold; }
      .g { font-size: 1.35em; }
      .loja { font-family: Georgia, serif; font-size: 1.6em; font-weight: bold; letter-spacing: .5px; }
      hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; }
      td { vertical-align: top; padding: 0; }
      .linha { display: flex; justify-content: space-between; gap: 4px; }
      .item-nome { word-break: break-word; }
      .codbar { height: 12mm; margin: 4px 6mm 0; }
      .peq { font-size: .85em; }
      .logo { max-width: 60%; max-height: 22mm; margin-bottom: 2mm; }
      hr.duplo { border-top: 3px double #000; }
      .msg { font-weight: bold; margin: 6px 0; }
      .msg::before, .msg::after { content: '* * *'; display: block; font-weight: normal; }
      .qr-txt { margin-top: 4px; word-break: break-all; }
    `;
  }

  function cabecalho(cfg) {
    const l = [];
    if (cfg.cupom_logo_img) l.push(`<div class="c"><img class="logo" src="${esc(cfg.cupom_logo_img)}" alt=""></div>`);
    l.push(`<div class="c loja">${esc(cfg.loja_nome || 'Clara Styllus')}</div>`);
    if (cfg.loja_razao_social) l.push(`<div class="c">${esc(cfg.loja_razao_social)}</div>`);
    if (cfg.loja_cnpj) l.push(`<div class="c">CNPJ: ${esc(cpf(cfg.loja_cnpj))}</div>`);
    if (cfg.loja_ie) l.push(`<div class="c">IE: ${esc(cfg.loja_ie)}</div>`);
    if (cfg.loja_endereco) l.push(`<div class="c">${esc(cfg.loja_endereco)}</div>`);
    if (cfg.loja_cidade) l.push(`<div class="c">${esc(cfg.loja_cidade)}</div>`);
    const contato = [cfg.loja_telefone, cfg.loja_instagram].filter(Boolean).join(' · ');
    if (contato) l.push(`<div class="c">${esc(contato)}</div>`);
    return l.join('');
  }

  const descItem = (it) => [it.nome, it.tamanho, it.cor].filter(Boolean).join(' ');

  /** Mensagem final e o link do Instagram/WhatsApp (o QR Code sai só na impressão direta). */
  const rodape = (cfg) => `
      ${cfg.cupom_mensagem ? `<div class="c msg">${esc(cfg.cupom_mensagem)}</div>` : ''}
      ${cfg.cupom_qr_texto ? `<div class="c qr-txt">${cfg.cupom_qr_legenda ? `${esc(cfg.cupom_qr_legenda)}<br>` : ''}<b>${esc(cfg.cupom_qr_texto)}</b></div>` : ''}`;

  function htmlCupom(venda, cfg, via) {
    const itens = venda.itens.map((it, i) => `
      <div class="item-nome">${String(i + 1).padStart(3, '0')} ${esc(it.codigo)} ${esc(descItem(it))}</div>
      <div class="linha"><span>&nbsp;&nbsp;${it.quantidade} x ${num(it.preco_unitario)}${
        it.desconto ? ` (-${num(it.desconto)})` : ''}</span><span>${num(it.total)}</span></div>`).join('');

    const pagamentos = venda.pagamentos.map((p) => `
      <div class="linha"><span>${esc(FORMAS[p.forma] || p.forma)}${
        p.parcelas > 1 ? ` ${p.parcelas}x` : ''}</span><span>${num(p.valor)}</span></div>`).join('');
    const pecas = venda.itens.reduce((a, it) => a + it.quantidade, 0);
    const cliente = venda.cliente_nome
      ? `<div>Cliente: ${esc(venda.cliente_nome)}</div>` : '';
    const doc = venda.cpf_nota || venda.cliente_cpf;

    return `<div class="cupom">
      ${cabecalho(cfg)}
      <hr class="duplo">
      <div class="c b">COMPROVANTE DE VENDA</div>
      <div class="c peq">NÃO É DOCUMENTO FISCAL</div>
      <hr>
      <div class="linha"><span>Venda nº ${venda.id}</span><span>${esc(dataHora(venda.criado_em))}</span></div>
      ${venda.vendedor ? `<div>Vendedor(a): ${esc(venda.vendedor)}</div>` : ''}
      ${cliente}
      ${doc ? `<div>CPF/CNPJ: ${esc(cpf(doc))}</div>` : ''}
      <hr>
      <div class="linha b"><span>ITEM CÓD DESCRIÇÃO</span><span>VALOR</span></div>
      ${itens}
      <hr>
      <div class="linha"><span>Qtd. de peças</span><span>${pecas}</span></div>
      <div class="linha"><span>Subtotal</span><span>${num(venda.subtotal)}</span></div>
      ${venda.desconto ? `<div class="linha"><span>Descontos</span><span>-${num(venda.desconto)}</span></div>` : ''}
      ${venda.acrescimo ? `<div class="linha"><span>Juros do cartão</span><span>+${num(venda.acrescimo)}</span></div>` : ''}
      <hr class="duplo">
      <div class="linha b g"><span>TOTAL</span><span>${brl(venda.total)}</span></div>
      <hr class="duplo">
      ${pagamentos}
      ${venda.troco ? `<div class="linha b"><span>Troco</span><span>${num(venda.troco)}</span></div>` : ''}
      ${venda.status === 'cancelada' ? '<hr><div class="c b g">*** VENDA CANCELADA ***</div>' : ''}
      <hr class="duplo">
      ${rodape(cfg)}
      <div class="codbar">${CodigoBarras.svg('V' + venda.id)}</div>
      <div class="c peq">${via ? esc(via) : ''}</div>
    </div>`;
  }

  async function cupomNavegador(venda) {
    const cfg = await U.config();
    const vias = Math.max(1, Number(cfg.cupom_vias) || 1);
    const nomes = ['Via do cliente', 'Via da loja'];
    let html = '';
    for (let i = 0; i < vias; i++) html += htmlCupom(venda, cfg, vias > 1 ? nomes[i] || `Via ${i + 1}` : '');
    imprimirHtml(cssCupom(cfg), html);
  }

  /** Cupom de troca: lista as peças sem mostrar preço (para presente). */
  async function cupomTrocaNavegador(venda) {
    const cfg = await U.config();
    const itens = venda.itens.map((it) => `
      <div class="linha"><span class="item-nome">${it.quantidade}x ${esc(descItem(it))}</span></div>
      <div class="peq">&nbsp;&nbsp;Cód. ${esc(it.codigo)}</div>`).join('');
    imprimirHtml(cssCupom(cfg), `<div class="cupom">
      ${cabecalho(cfg)}
      <hr>
      <div class="c b g">CUPOM DE TROCA</div>
      <hr>
      <div class="linha"><span>Venda nº ${venda.id}</span><span>${esc(dataHora(venda.criado_em))}</span></div>
      <hr>
      ${itens}
      <hr class="duplo">
      ${rodape(cfg)}
      <div class="codbar">${CodigoBarras.svg('V' + venda.id)}</div>
    </div>`);
  }

  async function fechamentoCaixaNavegador(r) {
    const cfg = await U.config();
    const c = r.caixa;
    const formas = r.formas.map((f) =>
      `<div class="linha"><span>${esc(FORMAS[f.forma] || f.forma)}</span><span>${num(f.valor)}</span></div>`).join('');
    const movs = r.movimentos.map((m) =>
      `<div class="linha"><span>${m.tipo === 'sangria' ? 'Sangria' : 'Suprimento'} ${esc(m.motivo || '')}</span>
       <span>${m.tipo === 'sangria' ? '-' : ''}${num(m.valor)}</span></div>`).join('');
    imprimirHtml(cssCupom(cfg), `<div class="cupom">
      ${cabecalho(cfg)}
      <hr>
      <div class="c b">${c.fechado_em ? 'FECHAMENTO' : 'PARCIAL'} DE CAIXA nº ${c.id}</div>
      <hr>
      <div>Operador(a): ${esc(c.operador || '—')}</div>
      <div>Abertura: ${esc(dataHora(c.aberto_em))}</div>
      ${c.fechado_em ? `<div>Fechamento: ${esc(dataHora(c.fechado_em))}</div>` : ''}
      <hr>
      <div class="linha"><span>Vendas</span><span>${r.vendas.quantidade}</span></div>
      <div class="linha"><span>Canceladas</span><span>${r.vendas.canceladas}</span></div>
      <div class="linha"><span>Descontos</span><span>${num(r.vendas.desconto)}</span></div>
      <div class="linha b"><span>Total vendido</span><span>${num(r.vendas.total)}</span></div>
      <hr>
      <div class="b">Recebimentos</div>
      ${formas || '<div>—</div>'}
      ${r.vendas.troco ? `<div class="linha"><span>(-) Troco</span><span>${num(r.vendas.troco)}</span></div>` : ''}
      <hr>
      <div class="b">Dinheiro na gaveta</div>
      <div class="linha"><span>Abertura</span><span>${num(c.valor_abertura)}</span></div>
      ${movs}
      <div class="linha b"><span>Esperado</span><span>${num(r.dinheiro_esperado)}</span></div>
      ${c.valor_informado != null ? `
        <div class="linha"><span>Contado</span><span>${num(c.valor_informado)}</span></div>
        <div class="linha b"><span>Diferença</span><span>${num(r.diferenca)}</span></div>` : ''}
      ${c.observacao ? `<hr><div>${esc(c.observacao)}</div>` : ''}
      <br><br><div class="c">______________________________</div><div class="c">Assinatura</div>
    </div>`);
  }

  // ------------------------------------------------------------ etiquetas
  function htmlEtiqueta(p, cfg) {
    const detalhes = [p.tamanho && `Tam ${p.tamanho}`, p.cor, p.referencia && `Ref ${p.referencia}`]
      .filter(Boolean).join(' · ');
    const modelo = cfg.etiqueta_modelo || 'padrao';
    return `<div class="etq modelo-${esc(modelo)}">
      ${cfg.etiqueta_mostrar_loja === '1' && modelo !== 'simples' ? `<div class="loja">${esc(cfg.loja_nome || 'Clara Styllus')}</div>` : ''}
      <div class="nome">${esc(p.nome)}</div>
      ${detalhes ? `<div class="det">${esc(detalhes)}</div>` : ''}
      ${cfg.etiqueta_mostrar_preco !== '1' ? ''
    : modelo === 'parcelado' ? (() => {
      const aPartir = Number(cfg.juros_a_partir) || 0;
      const n0 = Math.min(12, Math.max(2, Number(cfg.etiqueta_parcelas) || 3));
      const n = aPartir > 2 ? Math.min(n0, aPartir - 1) : n0;
      return `${p.preco_anterior > p.preco_venda
        ? `<div class="de">de <s>${brl(p.preco_anterior)}</s> por ${brl(p.preco_venda)}</div>`
        : `<div class="avista">${brl(p.preco_venda)}</div>`}
        <div class="parcela">${n}x de ${brl(Math.ceil(p.preco_venda / n))}</div><div class="sjuros">sem juros</div>`;
    })()
    : p.preco_anterior > p.preco_venda
      ? `<div class="de">de <s>${brl(p.preco_anterior)}</s></div><div class="preco">por ${brl(p.preco_venda)}</div>`
      : `<div class="preco">${brl(p.preco_venda)}</div>`}
      <div class="barras">${CodigoBarras.svg(p.codigo)}</div>
      <div class="cod">${esc(p.codigo)}</div>
    </div>`;
  }

  function cssEtiquetas(cfg) {
    const w = Number(cfg.etiqueta_largura_mm) || 40;
    const h = Number(cfg.etiqueta_altura_mm) || 30;
    const m = Number(cfg.etiqueta_margem_mm) || 0;
    const colunas = Math.max(1, Number(cfg.etiqueta_colunas) || 1);
    const base = `
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
      .etq { width: ${w}mm; height: ${h}mm; padding: ${m}mm; overflow: hidden;
             display: flex; flex-direction: column; align-items: center; text-align: center; }
      .loja { font-family: Georgia, serif; font-size: ${Math.max(6, h * 0.22)}pt; font-weight: bold; line-height: 1.1; }
      .nome { font-size: ${Math.max(6, h * 0.2)}pt; font-weight: bold; line-height: 1.1;
              max-height: 2.2em; overflow: hidden; width: 100%; }
      .det { font-size: ${Math.max(5, h * 0.17)}pt; line-height: 1.15; }
      .preco { font-size: ${Math.max(8, h * 0.36)}pt; font-weight: bold; line-height: 1.1; }
      .de { font-size: ${Math.max(5, h * 0.17)}pt; line-height: 1.1; }
      .de + .preco { font-size: ${Math.max(7, h * 0.3)}pt; }
      .barras { flex: 1; min-height: 5mm; width: 100%; padding: 0.5mm 1mm 0; }
      .cod { font-size: ${Math.max(5, h * 0.17)}pt; letter-spacing: 1px; line-height: 1.1; }
      .modelo-preco .loja { font-size: ${Math.max(5, h * 0.17)}pt; }
      .modelo-preco .nome { font-size: ${Math.max(5, h * 0.17)}pt; }
      .modelo-preco .preco { font-size: ${Math.max(9, h * 0.52)}pt; }
      .modelo-preco .de + .preco { font-size: ${Math.max(8, h * 0.42)}pt; }
      .avista { font-size: ${Math.max(6, h * 0.24)}pt; font-weight: bold; line-height: 1.1; }
      .parcela { font-size: ${Math.max(8, h * 0.36)}pt; font-weight: 900; line-height: 1.05; white-space: nowrap; }
      .sjuros { font-size: ${Math.max(5, h * 0.15)}pt; text-transform: uppercase; letter-spacing: .5px; line-height: 1.1; }
    `;
    if (colunas === 1) {
      // Rolo de etiquetas (impressora térmica): uma etiqueta por página.
      return base + `
        @page { size: ${w}mm ${h}mm; margin: 0; }
        .etq { page-break-after: always; break-after: page; }
        .etq:last-child { page-break-after: auto; break-after: auto; }`;
    }
    // Folha A4 com várias colunas (ex.: etiquetas adesivas tipo Pimaco).
    return base + `
      @page { size: A4; margin: 8mm 5mm; }
      .folha { display: grid; grid-template-columns: repeat(${colunas}, ${w}mm);
               grid-auto-rows: ${h}mm; gap: 0 2mm; justify-content: center; }
      .etq { outline: 0.1mm dotted #bbb; break-inside: avoid; }`;
  }

  /** lista: [{ produto, quantidade }] */
  async function etiquetasNavegador(lista) {
    const cfg = await U.config();
    const html = lista
      .flatMap(({ produto, quantidade }) => Array(quantidade).fill(htmlEtiqueta(produto, cfg)))
      .join('');
    const colunas = Math.max(1, Number(cfg.etiqueta_colunas) || 1);
    imprimirHtml(cssEtiquetas(cfg), colunas > 1 ? `<div class="folha">${html}</div>` : html);
  }

  // ------------------------------------------------------- impressão direta
  const direta = (cfg) => cfg.impressao_cupom_modo !== 'navegador';

  async function enviar(caminho, corpo, sucesso) {
    try {
      await U.api(caminho, { metodo: 'POST', corpo: corpo || {} });
      if (sucesso) U.aviso(sucesso);
      return true;
    } catch (e) {
      U.aviso(e.message + (e.status === 502 ? ' Confira a impressora em Configurações → Impressão.' : ''), 'erro');
      return false;
    }
  }

  async function cupom(venda, { gaveta = true } = {}) {
    const cfg = await U.config();
    if (!direta(cfg)) return cupomNavegador(venda);
    return enviar(`/api/imprimir/venda/${venda.id}`, { gaveta });
  }

  async function cupomTroca(venda) {
    const cfg = await U.config();
    if (!direta(cfg)) return cupomTrocaNavegador(venda);
    return enviar(`/api/imprimir/venda/${venda.id}`, { tipo: 'troca' }, 'Cupom de troca enviado para a impressora.');
  }

  async function fechamentoCaixa(r) {
    const cfg = await U.config();
    if (!direta(cfg)) return fechamentoCaixaNavegador(r);
    return enviar(`/api/imprimir/caixa/${r.caixa.id}`, {}, 'Resumo do caixa enviado para a impressora.');
  }

  async function recebimento(rec) {
    const cfg = await U.config();
    if (!direta(cfg)) return U.aviso('Recibo do crediário só sai na impressão direta (Configurações → Impressão).', 'alerta');
    return enviar(`/api/imprimir/recebimento/${rec.id}`, {});
  }

  async function troca(t) {
    const cfg = await U.config();
    if (!direta(cfg)) return U.aviso(`Vale-troca ${t.vale ? t.vale.codigo : ''}: configure a impressão direta para imprimir o vale.`, 'alerta');
    return enviar(`/api/imprimir/troca/${t.id}`, {}, 'Vale-troca enviado para a impressora.');
  }

  async function reserva(r) {
    const cfg = await U.config();
    if (!direta(cfg)) return U.aviso('Comprovante da reserva só sai na impressão direta (Configurações → Impressoras).', 'alerta');
    return enviar(`/api/imprimir/reserva/${r.id}`, {}, 'Comprovante da reserva enviado (2 vias).');
  }

  async function condicional(c) {
    const cfg = await U.config();
    if (!direta(cfg)) return U.aviso('Comprovante da condicional só sai na impressão direta (Configurações → Impressão).', 'alerta');
    return enviar(`/api/imprimir/condicional/${c.id}`, {}, 'Comprovante da condicional enviado (2 vias).');
  }

  async function abrirGaveta() {
    return enviar('/api/imprimir/gaveta', {}, 'Gaveta aberta.');
  }

  /** lista: [{ produto, quantidade }] */
  async function etiquetas(lista) {
    const cfg = await U.config();
    if (cfg.impressao_etiqueta_modo === 'navegador') return etiquetasNavegador(lista);
    const total = lista.reduce((a, x) => a + x.quantidade, 0);
    return enviar('/api/imprimir/etiquetas',
      { itens: lista.map((x) => ({ produto_id: x.produto.id, quantidade: x.quantidade })) },
      `${total} etiqueta(s) enviada(s) para a impressora.`);
  }

  return {
    cupom, cupomTroca, fechamentoCaixa, recebimento, abrirGaveta, troca, condicional, reserva, etiquetas, htmlEtiqueta, cssEtiquetas,
  };
})();
