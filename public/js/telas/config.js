/* Configurações da loja, do cupom, das etiquetas e backup. */
Telas.config = (() => {
  const { esc, api, aviso, erro } = U;

  const opcaoAtual = (nome) =>
    nome ? `<option value="${esc(nome)}" selected>${esc(nome)}</option>` : '<option value="">— escolha —</option>';

  async function carregarImpressoras(raiz, avisar) {
    let lista;
    try {
      lista = await api('/api/impressoras');
    } catch (e) {
      if (avisar) erro(e);
      return;
    }
    raiz.querySelectorAll('[data-impressoras]').forEach((sel) => {
      const atual = sel.value;
      const nomes = [...new Set([...(atual ? [atual] : []), ...lista])];
      sel.innerHTML = '<option value="">— escolha —</option>' +
        nomes.map((n) => `<option ${n === atual ? 'selected' : ''}>${esc(n)}</option>`).join('');
    });
    if (avisar) aviso(lista.length ? `${lista.length} impressora(s) encontrada(s).` : 'Nenhuma impressora instalada no Windows.', lista.length ? 'ok' : 'alerta');
  }

  function lerForm(form) {
    const dados = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      dados[el.name] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
    }
    if (dados.crediario_limite_padrao) dados.crediario_limite_padrao = String(U.paraCentavos(dados.crediario_limite_padrao) || '');
    if (dados.meta_mensal) dados.meta_mensal = String(U.paraCentavos(dados.meta_mensal) || '');
    for (const k of ['taxa_debito', 'taxa_credito_vista', 'taxa_credito_2a6', 'taxa_credito_7a12', 'taxa_pix']) {
      if (dados[k]) dados[k] = dados[k].replace('%', '').trim();
    }
    return dados;
  }

  /**
   * Logo do cupom: a imagem escolhida vira preto e branco (1 bit) do tamanho que a térmica imprime.
   * Guarda os bits para a impressão direta (cupom_logo) e um PNG igual para o navegador (cupom_logo_img).
   */
  function ligarLogo(raiz, form, mudou) {
    const caixa = raiz.querySelector('#logo-caixa');
    const tom = raiz.querySelector('#logo-tom');
    let imagem = null;
    const mostrar = () => {
      const src = form.elements.cupom_logo_img.value;
      caixa.innerHTML = src ? `<img src="${esc(src)}" alt="Logo">` : `<span>${Icone('imagem')}<small>Sem logo</small></span>`;
      raiz.querySelector('#logo-tirar').hidden = !src;
      tom.closest('label').hidden = !imagem;
    };
    /** Recorta as bordas em branco para o logo sair do maior tamanho possível. */
    const recorte = (limite) => {
      const fator = Math.min(1, 1200 / Math.max(imagem.width, imagem.height));
      const w = Math.round(imagem.width * fator);
      const h = Math.round(imagem.height * fator);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(imagem, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < limite) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) return { sx: 0, sy: 0, sw: imagem.width, sh: imagem.height };
      const m = 4;
      x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
      return { sx: x0 / fator, sy: y0 / fator, sw: (x1 - x0 + 1) / fator, sh: (y1 - y0 + 1) / fator };
    };
    const converter = () => {
      const r = recorte(Number(tom.value));
      // 320 pontos de largura (4 cm, cabe no papel de 58 e 80 mm) e até 160 de altura, múltiplo de 8.
      let lg = 320;
      let alt = Math.round((r.sh * lg) / r.sw);
      if (alt > 160) { lg = (r.sw * 160) / r.sh; alt = 160; }
      lg = Math.max(8, Math.floor(lg / 8) * 8);
      alt = Math.max(1, alt);
      const cv = document.createElement('canvas');
      cv.width = lg;
      cv.height = alt;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, lg, alt);
      ctx.drawImage(imagem, r.sx, r.sy, r.sw, r.sh, 0, 0, lg, alt);
      const px = ctx.getImageData(0, 0, lg, alt);
      const bytesLinha = lg / 8;
      const bits = new Uint8Array(bytesLinha * alt);
      const limite = Number(tom.value);
      for (let y = 0; y < alt; y++) {
        for (let x = 0; x < lg; x++) {
          const i = (y * lg + x) * 4;
          const lum = 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
          const preto = lum < limite;
          if (preto) bits[y * bytesLinha + (x >> 3)] |= 0x80 >> (x & 7);
          px.data[i] = px.data[i + 1] = px.data[i + 2] = preto ? 0 : 255;
          px.data[i + 3] = 255;
        }
      }
      ctx.putImageData(px, 0, 0);
      let bin = '';
      bits.forEach((b) => { bin += String.fromCharCode(b); });
      form.elements.cupom_logo.value = JSON.stringify({ l: bytesLinha, h: alt, d: btoa(bin) });
      form.elements.cupom_logo_img.value = cv.toDataURL('image/png');
      mostrar();
      mudou();
    };
    raiz.querySelector('#logo-arq').onchange = (ev) => {
      const arq = ev.target.files[0];
      if (!arq) return;
      const url = URL.createObjectURL(arq);
      const img = new Image();
      img.onload = () => { imagem = img; converter(); URL.revokeObjectURL(url); };
      img.onerror = () => aviso('Não consegui abrir essa imagem.', 'erro');
      img.src = url;
      ev.target.value = '';
    };
    raiz.querySelector('#logo-loja').onclick = () => {
      const img = new Image();
      img.onload = () => { imagem = img; converter(); };
      img.onerror = () => aviso('Não consegui abrir a logo da loja.', 'erro');
      img.src = '/img/logo-cupom.png';
    };
    tom.oninput = U.debounce(() => { if (imagem) converter(); }, 80);
    raiz.querySelector('#logo-tirar').onclick = () => {
      imagem = null;
      form.elements.cupom_logo.value = '';
      form.elements.cupom_logo_img.value = '';
      mostrar();
      mudou();
    };
    mostrar();
  }

  /** Tabela de taxas por parcela e bandeira: os campos montam o JSON do campo escondido taxas_tabela. */
  function ligarTaxas(raiz, form) {
    const oculto = form.elements.taxas_tabela;
    let t = {};
    try { t = JSON.parse(oculto.value || '{}') || {}; } catch { t = {}; }
    const campos = [...raiz.querySelectorAll('#tx-tabela input')];
    campos.forEach((i) => { i.value = (t[i.dataset.b] || {})[i.dataset.l] ?? ''; });
    const simular = () => {
      const cfg = { taxas_tabela: oculto.value, taxa_pix: form.elements.taxa_pix.value, juros_a_partir: form.elements.juros_a_partir.value };
      const v = U.paraCentavos(raiz.querySelector('#tx-valor').value) || 0;
      const f = raiz.querySelector('#tx-forma').value;
      const p = U.taxa(cfg, f === 'debito' ? 'debito' : 'credito', f === 'debito' ? 1 : Number(f), raiz.querySelector('#tx-band').value);
      const n = f === 'debito' ? 1 : Number(f);
      const j = U.juros(cfg, f === 'debito' ? 'debito' : 'credito', n, v, raiz.querySelector('#tx-band').value);
      const tx = Math.round(((v + j) * p) / 100);
      raiz.querySelector('#tx-res').innerHTML = `
        ${j ? `<div><span>Juros (a cliente paga)</span><b>+ ${U.brl(j)}</b></div>` : ''}
        <div><span>Taxa (${U.pctTxt(p)})${j ? '' : ' paga pela loja'}</span><b class="txt-perigo">− ${U.brl(tx)}</b></div>
        <div class="tx-cai"><span>Cai na conta</span><b>${U.brl(v + j - tx)}</b></div>
        ${n > 1 ? `<small>A cliente paga ${n}x de ${U.brl(Math.ceil((v + j) / n))}${j ? ' (com juros)' : ' sem juros'}</small>` : ''}`;
    };
    const juntar = () => {
      const novo = {};
      for (const i of campos) {
        novo[i.dataset.b] = novo[i.dataset.b] || {};
        const v = i.value.replace('%', '').trim();
        if (v) novo[i.dataset.b][i.dataset.l] = v;
      }
      oculto.value = JSON.stringify(novo);
      simular();
    };
    raiz.querySelector('#tx-tabela').addEventListener('input', juntar);
    raiz.querySelector('#tx-tabela').addEventListener('keydown', (ev) => {
      // Enter desce para a linha de baixo, como numa planilha.
      if (ev.key !== 'Enter' || !ev.target.matches('input')) return;
      ev.preventDefault();
      const i = campos.indexOf(ev.target);
      const prox = campos[i + Object.keys(U.BANDEIRAS).length];
      if (prox) { prox.focus(); prox.select(); }
    });
    ['#tx-valor', '#tx-forma', '#tx-band'].forEach((s) => raiz.querySelector(s).addEventListener('input', simular));
    form.elements.taxa_pix.addEventListener('input', simular);
    form.elements.juros_a_partir.addEventListener('change', simular);
    simular();
  }

  /** Pré-visualização do cupom com o que está na tela (antes de salvar). */
  function desenharPrevia(raiz, form) {
    const el = raiz.querySelector('#previa-cupom');
    if (!el) return;
    const v = (n) => (form.elements[n] ? form.elements[n].value : '');
    const linha = (a, b, cls = '') => `<div class="cp-l ${cls}"><span>${a}</span><span>${b}</span></div>`;
    el.innerHTML = `
      ${v('cupom_logo_img') ? `<img class="cp-logo" src="${esc(v('cupom_logo_img'))}" alt="">` : ''}
      <div class="cp-loja">${esc(v('loja_nome') || 'Clara Styllus')}</div>
      ${v('loja_endereco') ? `<div class="cp-c">${esc(v('loja_endereco'))}</div>` : ''}
      ${[v('loja_telefone'), v('loja_instagram')].filter(Boolean).length ? `<div class="cp-c">${esc([v('loja_telefone'), v('loja_instagram')].filter(Boolean).join('  '))}</div>` : ''}
      <div class="cp-sep duplo"></div>
      <div class="cp-c cp-b">COMPROVANTE DE VENDA</div>
      <div class="cp-sep"></div>
      <div>01 Vestido midi floral M</div>${linha('&nbsp;&nbsp;&nbsp;1 x 189,90', '189,90')}
      <div>02 Blusa de linho P</div>${linha('&nbsp;&nbsp;&nbsp;1 x 99,90', '99,90')}
      <div class="cp-sep duplo"></div>
      ${linha('TOTAL', 'R$ 289,80', 'cp-total')}
      <div class="cp-sep duplo"></div>
      ${linha('PIX', '289,80')}
      <div class="cp-sep duplo"></div>
      ${v('cupom_mensagem') ? `<div class="cp-c cp-estrelas">* * *</div><div class="cp-c cp-b">${esc(v('cupom_mensagem'))}</div><div class="cp-c cp-estrelas">* * *</div>` : ''}
      ${v('cupom_qr_texto') ? `${v('cupom_qr_legenda') ? `<div class="cp-c">${esc(v('cupom_qr_legenda'))}</div>` : ''}
        <div class="cp-qr" title="${esc(v('cupom_qr_texto'))}">${QRCode.svg(v('cupom_qr_texto').trim(), { tamanho: 104, margem: 2 })}</div>` : ''}
      <div class="cp-barras"></div>`;
  }

  async function abrir(raiz) {
    const c = await U.config(true);
    const campo = (nome, rotulo, extra = '') =>
      `<label>${rotulo}<input name="${nome}" value="${esc(c[nome])}" ${extra}></label>`;
    const check = (nome, rotulo) =>
      `<label class="check"><input type="checkbox" name="${nome}" ${c[nome] === '1' ? 'checked' : ''}> ${rotulo}</label>`;
    const sel = (nome, rotulo, opcoes) => `<label>${rotulo}<select name="${nome}">${opcoes.map(([v, t]) =>
      `<option value="${v}" ${c[nome] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;

    const ABAS = [
      ['loja', 'loja', 'Loja'], ['cupom', 'recibo', 'Cupom'], ['impressoras', 'impressora', 'Impressoras'],
      ['vendas', 'sacola', 'Vendas'], ['crediario', 'caderno', 'Crediário'], ['backup', 'nuvem', 'Backup'],
      ['atualizacao', 'atualizar', 'Atualização'],
    ];
    const pedida = (/[?&]aba=([\w-]+)/.exec(location.hash) || [])[1];
    let aba = ABAS.some((x) => x[0] === pedida) ? pedida : U.local.ler('config_aba', 'loja');
    if (!ABAS.some((x) => x[0] === aba)) aba = 'loja';
    const secao = (id, conteudo) => `<section class="cfg-aba" data-aba="${id}" ${id === aba ? '' : 'hidden'}>${conteudo}</section>`;

    raiz.innerHTML = `
      <div class="cabecalho-tela"><div><h1>Configurações</h1><p class="dica">Tudo o que muda o jeito do sistema funcionar na sua loja.</p></div></div>
      <nav class="cfg-abas" role="tablist">${ABAS.map(([id, ic, nome]) =>
    `<button type="button" role="tab" class="cfg-aba-btn ${id === aba ? 'sel' : ''}" data-ir="${id}">${Icone(ic)}<span>${nome}</span></button>`).join('')}</nav>
      <form id="f-cfg">
        ${secao('loja', `
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('loja')} Dados da loja <small>aparecem no cupom</small></h3>
          <div class="grade-form">
            ${campo('loja_nome', 'Nome fantasia')}
            ${campo('loja_razao_social', 'Razão social')}
            ${campo('loja_cnpj', 'CNPJ')}
            ${campo('loja_ie', 'Inscrição estadual')}
            ${campo('loja_endereco', 'Endereço')}
            ${campo('loja_cidade', 'Cidade / UF')}
            ${campo('loja_telefone', 'Telefone / WhatsApp')}
            ${campo('loja_instagram', 'Instagram')}
          </div>
        </div>
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('whatsapp')} Mensagens do WhatsApp</h3>
          <p class="dica">Textos que o sistema prepara para mandar às clientes. As palavras entre chaves trocam sozinhas
            (ex.: <code>{nome}</code> vira o primeiro nome). Deixe vazio para usar o texto padrão. Antes de mandar, sempre dá para editar a mensagem.</p>
          <div class="cfg-msgs">${Object.entries(Zap.MODELOS).map(([k, m]) => `
            <label class="cfg-msg"><span><b>${esc(m.titulo)}</b>
              <small>${Object.entries(m.vars).map(([v, d]) => `<code>{${v}}</code> ${esc(d)}`).join(' · ')}</small></span>
              <textarea name="msg_${k}" rows="3" placeholder="${esc(m.padrao)}">${esc(c[`msg_${k}`] || '')}</textarea>
              <button type="button" class="link cfg-msg-padrao" data-msg-padrao="${k}">usar o texto padrão</button></label>`).join('')}</div>
        </div>
        <div class="cartao cfg-rede">
          <h3 class="titulo-ico">${Icone('loja')} Outros computadores da loja</h3>
          <p class="dica">Libera o sistema para outro computador da loja (por exemplo, um para cadastrar produtos enquanto
            este fica no caixa). Os dois usam os <b>mesmos dados</b>, ao mesmo tempo. Só funciona na rede da loja, nunca pela
            internet, e cada pessoa entra com o próprio usuário e senha.</p>
          ${check('rede_computadores', 'Permitir que outros computadores da loja usem o sistema')}
          <div id="rede-info" class="rede-info"></div>
        </div>
        <div class="cartao cfg-celulares">
          <h3 class="titulo-ico">${Icone('telefone')} Celulares para tirar foto</h3>
          <p class="dica">O celular lê o QR Code uma vez só (no cadastro, botão <b>Celular</b>) e fica conectado: depois, é só deixar a
            página aberta nele que o nome da peça aparece sozinho na hora de tirar a foto.</p>
          <div id="cel-lista" class="cel-lista"></div>
        </div>
        `)}
        ${secao('cupom', `
        <div class="cfg-cupom">
          <div class="cartao">
            <h3 class="titulo-ico">${Icone('imagem')} Logo da loja</h3>
            <p class="dica">Sai no topo do cupom, em preto e branco. Prefira o logo em fundo branco ou transparente.</p>
            <input type="hidden" name="cupom_logo" value="${esc(c.cupom_logo)}">
            <input type="hidden" name="cupom_logo_img" value="${esc(c.cupom_logo_img)}">
            <div class="cfg-logo">
              <div class="cfg-logo-caixa" id="logo-caixa"></div>
              <div class="cfg-logo-acoes">
                <label class="btn">${Icone('camera')} Escolher imagem<input type="file" id="logo-arq" accept="image/*" hidden></label>
                <button type="button" class="btn btn-peq" id="logo-loja">${Icone('estrela')} Usar a logo da loja</button>
                <label class="cfg-tom">Tom <input type="range" id="logo-tom" min="60" max="230" value="150"></label>
                <button type="button" class="btn btn-peq" id="logo-tirar">${Icone('lixeira')} Tirar logo</button>
              </div>
            </div>
          </div>
          <div class="cartao">
            <h3 class="titulo-ico">${Icone('recibo')} Final do cupom</h3>
            <div class="grade-form">
              <label class="col2">Mensagem final<textarea name="cupom_mensagem" rows="2">${esc(c.cupom_mensagem)}</textarea></label>
              <label class="col2">QR Code — link do Instagram ou WhatsApp <small>vazio = sem QR Code</small>
                <input name="cupom_qr_texto" value="${esc(c.cupom_qr_texto)}" placeholder="https://instagram.com/clarastyllus  ou  https://wa.me/5563999999999"></label>
              <label class="col2">Frase acima do QR Code<input name="cupom_qr_legenda" value="${esc(c.cupom_qr_legenda)}" placeholder="Siga a gente no Instagram"></label>
            </div>
            <div class="acoes acoes-esq"><button type="button" class="btn" data-teste="cupom">${Icone('impressora')} Imprimir teste de cupom</button></div>
          </div>
          <div class="cfg-previa-col">
            <small class="cfg-previa-tit">Como fica o cupom</small>
            <div class="cfg-previa" id="previa-cupom"></div>
          </div>
        </div>`)}
        ${secao('impressoras', `
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('recibo')} Impressora de cupom</h3>
          <p class="dica"><b>Impressão direta</b> manda o cupom pronto para a térmica (POS-80 genérica, Elgin i7/i8/i9, Epson TM-T20,
            Bematech MP-4200 em modo ESC/POS, Daruma, Tanca, Knup…): sai sempre do mesmo jeito, sem margens nem
            janela de impressão, e ainda abre a gaveta de dinheiro.</p>
          <div class="grade-form">
            ${sel('impressao_cupom_modo', 'Como imprimir', [['direta', 'Direto na impressora térmica (recomendado)'], ['navegador', 'Pela janela do navegador']])}
            <label>Impressora
              <span class="campo-com-botao">
                <select name="impressora_cupom" data-impressoras>${opcaoAtual(c.impressora_cupom)}</select>
                <button type="button" class="btn" data-atualizar-imp title="Procurar impressoras">↻</button>
              </span></label>
            ${sel('cupom_largura_mm', 'Largura do papel', [['80', '80 mm'], ['58', '58 mm']])}
            ${sel('cupom_colunas', 'Letras por linha', [['48', '48 (80 mm, padrão)'], ['42', '42 (80 mm, letra maior)'], ['32', '32 (58 mm)']])}
            ${sel('cupom_acentos', 'Acentos', [['cp850', 'Com acentos (página 850)'], ['sem', 'Sem acentos (se sair caractere estranho)']])}
            ${sel('cupom_vias', 'Vias', [['1', '1 via'], ['2', '2 vias (cliente + loja)']])}
            ${check('impressao_automatica', 'Imprimir o cupom automaticamente ao concluir a venda')}
            ${check('cupom_corte', 'Cortar o papel no final (guilhotina)')}
            ${check('gaveta_abrir', 'Abrir a gaveta de dinheiro em venda com dinheiro')}
            <div class="acoes acoes-esq col2"><button type="button" class="btn" data-teste="cupom">${Icone('impressora')} Imprimir teste de cupom</button></div>
          </div>
        </div>
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('etiqueta')} Impressora de etiquetas</h3>
          <p class="dica"><b>TSPL</b>: Knup, etiquetadoras genéricas, TSC, Gprinter, Xprinter. <b>ZPL</b>: Zebra, Elgin L42 Pro, Argox.
            <b>EPL</b>: Zebra LP/TLP antigas, Elgin L42 e Argox em modo PPLB. <b>Navegador</b>: etiquetas em folha A4.
            O modelo da etiqueta (preço grande, simples…) é escolhido na tela <a href="#/etiquetas">Etiquetas</a>.</p>
          <div class="grade-form tres">
            ${sel('impressao_etiqueta_modo', 'Linguagem', [['zpl', 'ZPL'], ['epl', 'EPL / PPLB'], ['tspl', 'TSPL (Knup, TSC, Gprinter, Xprinter, genéricas)'], ['navegador', 'Folha A4 pelo navegador']])}
            <label class="col2">Impressora
              <span class="campo-com-botao">
                <select name="impressora_etiqueta" data-impressoras>${opcaoAtual(c.impressora_etiqueta)}</select>
                <button type="button" class="btn" data-atualizar-imp title="Procurar impressoras">↻</button>
              </span></label>
            ${sel('etiqueta_dpi', 'Resolução', [['203', '203 dpi (padrão)'], ['300', '300 dpi']])}
            ${campo('etiqueta_largura_mm', 'Largura da etiqueta (mm)', 'type="number" min="15" max="200"')}
            ${campo('etiqueta_altura_mm', 'Altura da etiqueta (mm)', 'type="number" min="10" max="200"')}
            ${campo('etiqueta_colunas', 'Etiquetas lado a lado', 'type="number" min="1" max="8"')}
            ${campo('etiqueta_espaco_mm', 'Espaço entre colunas (mm)', 'type="number" min="0" max="20" step="0.5"')}
            ${campo('etiqueta_margem_mm', 'Margem interna (mm)', 'type="number" min="0" max="10" step="0.5"')}
            ${campo('etiqueta_gap_mm', 'Espaço entre etiquetas no rolo (mm)', 'type="number" min="0" max="20" step="0.5"')}
            ${check('etiqueta_mostrar_loja', 'Mostrar a loja na etiqueta')}
            ${check('etiqueta_logo', 'Usar a logo da loja (em vez do nome escrito)')}
            ${check('etiqueta_mostrar_preco', 'Mostrar preço')}
            <div class="acoes acoes-esq col2"><button type="button" class="btn" data-teste="etiqueta">${Icone('etiqueta')} Imprimir etiqueta de teste</button></div>
          </div>
        </div>`)}
        ${secao('vendas', `
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('sacola')} Regras de venda</h3>
          <div class="grade-form">
            <label>Markup padrão (preço sugerido) <small>ex.: 2,2 = custo × 2,2</small>
              <input name="markup_padrao" inputmode="decimal" value="${esc(c.markup_padrao)}" placeholder="vazio = não sugerir"></label>
            ${sel('arredondar_preco', 'Arredondar preços para', [['90', 'terminar em ,90'], ['99', 'terminar em ,99'], ['00', 'terminar em ,00 (redondo)'], ['', 'não arredondar']])}
            <label>Meta de vendas do mês (R$) <small>aparece no painel Início</small>
              <input name="meta_mensal" inputmode="decimal" value="${c.meta_mensal ? U.num(c.meta_mensal) : ''}"></label>
            ${campo('desconto_maximo_pct', 'Desconto máximo por venda (%)', 'type="number" min="0" max="100"')}
            <label>Botões de desconto no caixa (%) <small>separe por vírgula, ex.: 5, 10, 15, 20</small>
              <input name="desconto_presets" value="${esc(c.desconto_presets)}" placeholder="5, 10, 15, 20"></label>
            ${check('som_bipe', 'Tocar som ao bipar produto e ao concluir a venda')}
            <div class="cfg-sons">${sel('som_volume', 'Volume dos sons', [['baixo', 'Baixo'], ['medio', 'Médio'], ['alto', 'Alto']])}
              <span class="cfg-sons-teste"><small>Ouvir:</small>${[['ok', 'Bipe'], ['sucesso', 'Venda'], ['erro', 'Erro']].map(([k, t]) =>
    `<button type="button" class="btn btn-peq" data-som="${k}">${t}</button>`).join('')}</span></div>
            ${check('estoque_negativo', 'Permitir vender produto sem estoque')}
          </div>
        </div>
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('cartao')} Taxas das maquininhas</h3>
          <p class="dica">A porcentagem que a maquininha desconta em cada forma. O sistema grava a taxa em cada venda
            e mostra nos Relatórios quanto realmente cai na conta. Na hora de passar o cartão, escolha a bandeira.</p>
          <input type="hidden" name="taxas_tabela" value="${esc(c.taxas_tabela)}">
          <div class="tx">
            <table class="tx-tabela" id="tx-tabela">
              <thead><tr><th></th>${Object.entries(U.BANDEIRAS).map(([k, n]) => `<th><span class="tx-band tx-${k}">${n}</span></th>`).join('')}</tr></thead>
              <tbody>${['debito', ...Array.from({ length: 12 }, (_, i) => String(i + 1))].map((l) => `
                <tr><th>${l === 'debito' ? 'Débito' : `Crédito ${l}x`}</th>${Object.keys(U.BANDEIRAS).map((b) =>
    `<td><div class="tx-campo"><input inputmode="decimal" data-b="${b}" data-l="${l}" autocomplete="off"><span>%</span></div></td>`).join('')}</tr>`).join('')}
              </tbody>
            </table>
            <div class="tx-lado">
              <label>Juros para a cliente <small>a taxa do crédito é somada no valor dela</small>
                <select name="juros_a_partir">${[['0', 'Nunca (a loja paga sempre)'], ...Array.from({ length: 11 }, (_, i) => [String(i + 2), `A partir de ${i + 2}x (até ${i + 1}x sem juros)`])].map(([v, t]) =>
    `<option value="${v}" ${String(c.juros_a_partir || '0') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
              <label>PIX (%) <small>vazio = sem taxa</small><input name="taxa_pix" inputmode="decimal" value="${esc(c.taxa_pix)}" placeholder="sem taxa"></label>
              <div class="tx-sim">
                <b>${Icone('carteira')} Simular</b>
                <label>Valor da venda<div class="campo-moeda"><span>R$</span><input id="tx-valor" inputmode="decimal" value="100,00"></div></label>
                <div class="tx-sim-lin">
                  <select id="tx-forma"><option value="debito">Débito</option>${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i === 2 ? 'selected' : ''}>Crédito ${i + 1}x</option>`).join('')}</select>
                  <select id="tx-band">${Object.entries(U.BANDEIRAS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
                </div>
                <div class="tx-sim-res" id="tx-res"></div>
              </div>
            </div>
          </div>
        </div>`)}
        ${secao('crediario', `
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('caderno')} Crediário</h3>
          <div class="grade-form tres">
            ${campo('crediario_max_parcelas', 'Máximo de parcelas', 'type="number" min="1" max="24"')}
            ${campo('crediario_dias_primeira', '1º vencimento (dias após a compra)', 'type="number" min="1" max="120"')}
            ${campo('cobranca_dias_antes', 'Cobrança em fila: avisar também quem vence nos próximos (dias)', 'type="number" min="0" max="15"')}
            <label>Limite padrão por cliente (R$) <small>vazio = sem limite</small>
              <input name="crediario_limite_padrao" data-dinheiro inputmode="decimal" value="${c.crediario_limite_padrao ? U.num(c.crediario_limite_padrao) : ''}"></label>
            ${check('crediario_bloquear_atraso', 'Não vender fiado para quem tem parcela atrasada')}
          </div>
        </div>`)}
        ${secao('backup', `
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('nuvem')} Situação dos backups</h3>
          <div id="backup-status" class="backup-status">${U.esqueleto(2)}</div>
          <div class="acoes acoes-esq">
            <button type="button" class="btn btn-primario" id="backup-agora">${Icone('nuvem')} Fazer backup agora</button>
            <a class="btn" href="/api/backup" download>${Icone('nuvem')} Baixar uma cópia neste computador</a>
          </div>
        </div>
        <div class="cartao">
          <h3 class="titulo-ico">${Icone('ajustes')} Backup automático</h3>
          <p class="dica">Uma cópia dos dados é feita <b>ao fechar o caixa</b> e, se o computador ficar ligado, <b>uma vez por dia</b>.
            Para se proteger de defeito no computador, use a segunda pasta: um <b>pendrive</b> ou uma pasta do
            <b>Google Drive / OneDrive</b> que sincroniza sozinha com a internet.</p>
          <div class="grade-form">
            ${check('backup_auto', 'Fazer backup automático')}
            ${campo('backup_manter', 'Quantas cópias guardar', 'type="number" min="3" max="365"')}
            <label class="col2">Pasta dos backups <small>vazio = pasta padrão do sistema</small>
              <input name="backup_pasta" value="${esc(c.backup_pasta)}" placeholder="padrão: C:\\ProgramData\\ClaraStyllus\\backups"></label>
            <label class="col2">Segunda cópia (pendrive ou Google Drive) <small>opcional</small>
              <input name="backup_pasta_extra" value="${esc(c.backup_pasta_extra)}" placeholder="ex.: E:\\Backup Clara Styllus  ou  C:\\Users\\Clara\\Google Drive\\Backup PDV"></label>
          </div>
        </div>
        <div class="cartao cfg-perigo">
          <h3 class="titulo-ico">${Icone('alerta')} Começar do zero</h3>
          <p class="dica">Apaga os dados para começar a usar o sistema como se fosse novo (por exemplo, depois dos testes).
            Antes de apagar, o sistema guarda uma <b>cópia completa</b> na pasta de backups. Precisa da sua senha.</p>
          <div class="acoes acoes-esq"><button type="button" class="btn btn-perigo" id="zerar">${Icone('lixeira')} Zerar o sistema…</button></div>
        </div>`)}
        ${secao('atualizacao', `
        <div class="cartao" id="atualizacoes">
          <h3 class="titulo-ico">${Icone('atualizar')} Atualizações do sistema</h3>
          <div id="at-status">${U.esqueleto(2)}</div>
          <details class="at-avancado"><summary>Atualização automática e acesso</summary>
            <div class="grade-form">
              ${check('atualizacao_auto', 'Procurar versão nova sozinho (a cada 6 horas, quando tiver internet) e já deixar baixada')}
              <label class="col2">Token de acesso ao GitHub <small>necessário porque o repositório é privado — permissão só de leitura (Contents: read)</small>
                <input name="atualizacao_token" class="campo-senha" autocomplete="off" value="${esc(c.atualizacao_token)}" placeholder="github_pat_…"></label>
              <label class="col2">Endereço de atualização <small>deixe vazio para usar o padrão (GitHub)</small>
                <input name="atualizacao_url" value="${esc(c.atualizacao_url)}" placeholder="https://api.github.com/repos/…/releases/latest"></label>
            </div>
          </details>
        </div>`)}
        <div class="cfg-salvar"><span id="cfg-sujo" hidden>${Icone('alerta')} Há alterações não salvas</span>
          <button class="btn btn-primario btn-grande">${Icone('check')} Salvar configurações</button></div>
      </form>`;

    raiz.querySelector('.cfg-abas').onclick = (ev) => {
      const b = ev.target.closest('[data-ir]');
      if (!b) return;
      aba = b.dataset.ir;
      U.local.gravar('config_aba', aba);
      raiz.querySelectorAll('.cfg-aba-btn').forEach((x) => x.classList.toggle('sel', x === b));
      raiz.querySelectorAll('.cfg-aba').forEach((x) => { x.hidden = x.dataset.aba !== aba; });
    };

    const form = raiz.querySelector('#f-cfg');
    const sujo = raiz.querySelector('#cfg-sujo');
    // O simulador de taxas não muda nada salvo: não conta como alteração.
    const marcar = (ev) => { if (!ev.target.closest('.tx-sim')) sujo.hidden = false; };
    form.addEventListener('input', marcar);
    form.addEventListener('change', marcar);
    ligarLogo(raiz, form, () => { sujo.hidden = false; desenharPrevia(raiz, form); });
    form.addEventListener('input', U.debounce(() => desenharPrevia(raiz, form), 150));
    desenharPrevia(raiz, form);
    carregarImpressoras(raiz, false);
    Atualizacao.desenharStatus(raiz.querySelector('#at-status'));
    const mostrarBackup = (st) => {
      const quando = st.ultimo ? new Date(st.ultimo).toLocaleString('pt-BR') : 'nunca';
      const atrasado = st.horas_desde_ultimo == null || st.horas_desde_ultimo > 72;
      raiz.querySelector('#backup-status').innerHTML = `
        <div class="linha"><span>Último backup</span><b class="${atrasado ? 'txt-perigo' : 'txt-ok'}">${quando}${st.horas_desde_ultimo != null ? ` (há ${st.horas_desde_ultimo} h)` : ''}</b></div>
        <div class="linha"><span>Pasta</span><code>${esc(st.pasta)}</code></div>
        ${st.pasta_extra ? `<div class="linha"><span>Segunda cópia</span><code>${esc(st.pasta_extra)}</code></div>` : ''}
        ${st.ultimo_erro ? `<div class="alerta-box">${esc(st.ultimo_erro)}</div>` : ''}
        <details><summary>${st.arquivos.length} cópia(s) guardada(s)</summary>
          ${st.arquivos.map((a) => `<div class="linha"><small>${esc(a.nome)}</small><small>${(a.tamanho / 1024 / 1024).toFixed(1)} MB</small></div>`).join('')}
        </details>
        <p class="dica">Para restaurar uma cópia: pare o serviço "Clara Styllus PDV" e troque o arquivo
          <code>dados\\clara-styllus.db</code> pela cópia escolhida (renomeando). Se tiver dúvida, peça ajuda antes.</p>`;
    };
    api('/api/backup/status').then(mostrarBackup).catch((e) => { raiz.querySelector('#backup-status').textContent = e.message; });
    raiz.querySelector('#zerar').onclick = zerarSistema;
    mostrarRede(raiz);
    mostrarCelulares(raiz);
    raiz.querySelectorAll('[data-msg-padrao]').forEach((b) => {
      b.onclick = () => {
        const t = raiz.querySelector(`[name="msg_${b.dataset.msgPadrao}"]`);
        t.value = '';
        t.dispatchEvent(new Event('input', { bubbles: true }));
      };
    });
    raiz.querySelector('#backup-agora').onclick = async (ev) => {
      ev.target.disabled = true;
      try {
        const r = await api('/api/backup/agora', { metodo: 'POST' });
        aviso(r.aviso || 'Backup feito.', r.aviso ? 'alerta' : 'ok');
        mostrarBackup(r.status);
      } catch (e) { erro(e); }
      ev.target.disabled = false;
    };
    ligarTaxas(raiz, form);
    raiz.querySelectorAll('[data-som]').forEach((b) => {
      b.onclick = () => U.som(b.dataset.som, true, form.elements.som_volume.value);
    });
    raiz.querySelectorAll('[data-atualizar-imp]').forEach((b) => { b.onclick = () => carregarImpressoras(raiz, true); });
    // Etiquetadoras como a Knup só entendem TSPL: escolheu uma delas, a linguagem já vai junto.
    const impEtq = form.elements.impressora_etiqueta;
    const lingEtq = form.elements.impressao_etiqueta_modo;
    const SO_TSPL = /knup|xprinter|gprinter|\btsc\b|hprt|idprt|beeprt|jadens|munbyn|rongta|etiquetadeira|etiquetadora/i;
    if (impEtq && lingEtq) {
      const conferirTspl = () => {
        if (SO_TSPL.test(impEtq.value) && lingEtq.value !== 'tspl' && lingEtq.value !== 'navegador') {
          lingEtq.value = 'tspl';
          lingEtq.dispatchEvent(new Event('change', { bubbles: true }));
          aviso('Essa etiquetadora usa a linguagem TSPL: já troquei para você. Clique em Salvar configurações.', 'alerta');
        }
      };
      impEtq.addEventListener('change', conferirTspl);
      conferirTspl(); // já estava salva em ZPL (o padrão)
    }
    raiz.querySelectorAll('[data-teste]').forEach((b) => {
      b.onclick = async () => {
        try {
          // Etiqueta feita no editor: desenhada aqui e enviada como imagem.
          if (b.dataset.teste === 'etiqueta' && EtiquetaLayout.ativo(await U.config())) {
            return Impressao.etiquetas([{ quantidade: 1, produto: {
              nome: 'Vestido Midi Canelado', tamanho: 'M', cor: 'Preto', referencia: '1020', preco_venda: 15990, codigo: '2000000000015',
            } }], { config: lerForm(form) });
          }
          // Testa com o que está na tela, mesmo antes de salvar.
          await api('/api/imprimir/teste', { metodo: 'POST', corpo: { alvo: b.dataset.teste, config: lerForm(form) } });
          aviso('Teste enviado para a impressora.');
        } catch (e) { erro(e); }
      };
    });

    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const dados = lerForm(form);
      try {
        await api('/api/config', { metodo: 'PUT', corpo: dados });
        await U.config(true);
        Zap.recarregar();
        sujo.hidden = true;
        aviso('Configurações salvas.');
        Atualizacao.desenharStatus(raiz.querySelector('#at-status'));
        mostrarRede(raiz);
      } catch (e) { erro(e); }
    };
  }

  /** Zerar o sistema: escolhe o que apagar, confirma com a senha da administradora e digitando ZERAR. */
  /** Celulares conectados para tirar foto (com o botão de desconectar). */
  async function mostrarCelulares(raiz) {
    const el = raiz.querySelector('#cel-lista');
    if (!el) return;
    let lista = [];
    try { lista = await api('/api/celular/aparelhos'); } catch { return; }
    el.innerHTML = lista.length ? lista.map((a) => `<div class="cel-item">
        <span class="cel-ponto ${a.online ? 'on' : ''}"></span>
        <div><b>${esc(a.nome)}</b><small>${a.online ? 'Com a página aberta agora' : `Visto em ${esc(U.dataHora(a.visto_em))}`}</small></div>
        <button type="button" class="btn btn-peq btn-fantasma" data-desconectar="${esc(a.token)}">Desconectar</button></div>`).join('')
      : '<small class="txt-suave">Nenhum celular conectado ainda.</small>';
    el.onclick = async (ev) => {
      const b = ev.target.closest('[data-desconectar]');
      if (!b) return;
      try {
        await api(`/api/celular/aparelhos/${b.dataset.desconectar}`, { metodo: 'DELETE' });
        aviso('Celular desconectado.');
        mostrarCelulares(raiz);
      } catch (e) { erro(e); }
    };
  }

  /** Endereço deste computador e o passo a passo para instalar no outro computador. */
  async function mostrarRede(raiz) {
    const el = raiz.querySelector('#rede-info');
    if (!el) return;
    let r;
    try { r = await api('/api/sistema/rede'); } catch { return; }
    const ip = r.enderecos[0];
    el.innerHTML = r.liberado ? `
      <div class="rede-passos">
        <p><b>No outro computador:</b></p>
        <ol>
          <li>Copie o arquivo <b>ClaraStyllus-Computador-Extra-Setup</b> (pendrive ou WhatsApp) e abra.</li>
          <li>Clique em Instalar. O atalho <b>Clara Styllus PDV</b> aparece na área de trabalho.</li>
          <li>Ao abrir, ele procura este computador sozinho. Se pedir, digite o endereço: ${ip ? `<code class="rede-ip">${esc(ip)}</code>` : '<i>(este computador não está conectado a uma rede)</i>'}</li>
        </ol>
        <small>Este computador precisa estar ligado e com o sistema aberto. Dica: deixe o endereço dele fixo no roteador para não mudar.</small>
      </div>`
      : '<small class="txt-suave">Marque a opção acima e clique em <b>Salvar configurações</b> para ver como instalar no outro computador.</small>';
  }

  async function zerarSistema() {
    let n;
    try { n = await U.api('/api/sistema/contagem'); } catch (e) { return U.erro(e); }
    const MODOS = [
      ['movimento', 'Só o movimento', `Apaga ${n.vendas} venda(s), ${n.caixas} caixa(s), crediário, trocas, condicionais, reservas, ${n.despesas} despesa(s) e o histórico.`,
        `Mantém os ${n.produtos} produto(s) (com o estoque de agora), os ${n.clientes} cliente(s), vendedores e configurações.`],
      ['tudo', 'Tudo da loja', 'Apaga o movimento e também produtos, fotos e clientes.', 'Mantém vendedores, senhas e configurações (nome da loja, cupom, impressoras, taxas).'],
      ['fabrica', 'Como novo (de fábrica)', 'Apaga absolutamente tudo, inclusive vendedores, senhas e configurações.', 'O sistema volta à tela de primeiro acesso.'],
    ];
    const corpo = U.abrirModal('Zerar o sistema', `
      <form class="form zr">
        <div class="zr-modos">${MODOS.map(([k, t, apaga, mantem], i) => `
          <label class="zr-modo"><input type="radio" name="modo" value="${k}" ${i === 0 ? 'checked' : ''}>
            <span><b>${t}</b><small class="zr-apaga">${apaga}</small><small>${mantem}</small></span></label>`).join('')}</div>
        ${n.crediario_aberto ? `<p class="zr-alerta">${Icone('alerta')} Tem <b>${n.crediario_aberto} parcela(s) de crediário em aberto</b>. Anote quem deve antes: elas também serão apagadas.</p>` : ''}
        <p class="dica">Uma cópia completa dos dados é guardada antes, na pasta de backups (arquivo "antes-de-zerar"). Não dá para desfazer pela tela.</p>
        <label>Sua senha (administradora)${U.campoSenha('senha', 'required autocomplete="off"')}</label>
        <label><span>Para confirmar, digite <b>ZERAR</b></span><input name="confirmacao" required autocomplete="off" placeholder="ZERAR"></label>
        <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button>
          <button class="btn btn-perigo" id="zr-ok" disabled>${Icone('lixeira')} Zerar agora</button></div>
      </form>`, { largura: '600px' });
    U.ligarOlhos(corpo);
    const form = corpo.querySelector('form');
    const ok = corpo.querySelector('#zr-ok');
    const atualizar = () => { ok.disabled = form.confirmacao.value.trim().toUpperCase() !== 'ZERAR' || !form.senha.value; };
    form.addEventListener('input', atualizar);
    form.onsubmit = U.umaVez(form, async (ev) => {
      ev.preventDefault();
      const d = U.dadosForm(form);
      try {
        const r = await U.api('/api/sistema/zerar', { metodo: 'POST', corpo: d });
        U.fecharModal();
        if (r.fabrica) {
          try { localStorage.clear(); } catch { /* sem armazenamento */ }
          location.hash = '';
          location.reload();
          return;
        }
        U.aviso(`Pronto! O sistema foi zerado. Cópia guardada em: ${r.copia}`);
        try { ['pdv_carrinho', 'pdv_vale_pendente'].forEach((k) => localStorage.removeItem(k)); } catch { /* sem armazenamento */ }
        setTimeout(() => { location.hash = '#/inicio'; location.reload(); }, 1800);
      } catch (e) {
        form.senha.value = '';
        atualizar();
        U.erro(e);
      }
    });
  }

  return { abrir };
})();
