/*
 * Catálogo em imagem para o Instagram e o WhatsApp: escolhe as peças e o sistema monta as imagens
 * com foto, nome, tamanhos disponíveis, preço (De/Por) e o "3x de" sem juros.
 */
const Catalogo = (() => {
  const LOGO = '/img/logo.png'; // logo dourada da loja (fundo transparente)
  const { esc, brl, erro, abrirModal, aviso } = U;
  const FORMATOS = { story: [1080, 1920, 'Stories / status (1080 × 1920)'], post: [1080, 1350, 'Post do feed (1080 × 1350)'] };
  const SERIF = '"Playfair Display", Georgia, serif';
  const SANS = 'Inter, "Segoe UI", sans-serif';
  const ORDEM_TAM = ['RN', 'BB', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'EG', 'EGG', 'XGG', 'G1', 'G2', 'G3', 'G4', 'U', 'ÚNICO', 'UNICO'];

  const ordenarTamanhos = (ts) => [...ts].sort((a, b) => {
    const na = Number(String(a).replace(',', '.'));
    const nb = Number(String(b).replace(',', '.'));
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    const ia = ORDEM_TAM.indexOf(String(a).toUpperCase());
    const ib = ORDEM_TAM.indexOf(String(b).toUpperCase());
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a).localeCompare(String(b));
  });

  /** Parcelas sem juros (mesma regra da etiqueta "parcelado"): 0 quando não há parcelamento sem juros. */
  function parcelasSemJuros(cfg) {
    const aPartir = Number(cfg.juros_a_partir) || 0;
    const n0 = Math.min(12, Math.max(2, Number(cfg.etiqueta_parcelas) || 3));
    const n = !aPartir ? n0 : aPartir - 1 >= 2 ? Math.min(n0, aPartir - 1) : 0;
    return n >= 2 ? n : 0;
  }

  /** Junta as variações (tamanho × cor) em modelos. */
  function modelos(produtos) {
    const mapa = new Map();
    for (const p of produtos) {
      if (p.servico || !p.ativo) continue;
      const k = `${p.nome.trim().toLowerCase()}|${(p.referencia || '').trim().toLowerCase()}`;
      const m = mapa.get(k) || { chave: k, nome: p.nome, categoria: p.categoria, variantes: [] };
      m.variantes.push(p);
      mapa.set(k, m);
    }
    return [...mapa.values()].map((m) => {
      const disp = m.variantes.filter((v) => v.estoque > 0);
      const base = disp.length ? disp : m.variantes;
      const comFoto = base.find((v) => v.foto_versao) || m.variantes.find((v) => v.foto_versao) || null;
      const precos = base.map((v) => v.preco_venda);
      const menor = Math.min(...precos);
      const de = base.filter((v) => v.preco_venda === menor && v.preco_anterior > v.preco_venda).map((v) => v.preco_anterior)[0] || null;
      return {
        ...m,
        estoque: disp.reduce((a, v) => a + v.estoque, 0),
        tamanhos: ordenarTamanhos(new Set(disp.map((v) => v.tamanho).filter(Boolean))),
        cores: [...new Set(disp.map((v) => v.cor).filter(Boolean))],
        foto: comFoto ? U.fotoUrl(comFoto) : null,
        preco: menor,
        varia: new Set(precos).size > 1,
        de,
      };
    });
  }

  // ------------------------------------------------------------- desenho
  function arredondado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function caber(ctx, texto, max) {
    let t = String(texto || '');
    if (ctx.measureText(t).width <= max) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t + '…';
  }

  const carregarImg = (src) => new Promise((ok) => {
    if (!src) return ok(null);
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = src;
  });

  /** Foto cortada para preencher a caixa (como object-fit: cover), com cantos arredondados. */
  function foto(ctx, img, x, y, w, h, r) {
    ctx.save();
    arredondado(ctx, x, y, w, h, r);
    ctx.clip();
    if (img) {
      const f = Math.max(w / img.width, h / img.height);
      const iw = img.width * f;
      const ih = img.height * f;
      ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    } else {
      ctx.fillStyle = '#f0e0e4';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#bd96a0';
      ctx.textAlign = 'center';
      ctx.font = `600 ${Math.round(w / 9)}px ${SERIF}`;
      ctx.fillText('foto em breve', x + w / 2, y + h / 2);
    }
    ctx.restore();
  }

  function fundo(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#faf5f6');
    g.addColorStop(1, '#f0e4e7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(149,89,104,.06)';
    for (const [x, y, r] of [[W - 60, 120, 220], [40, H - 140, 260]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Cabeçalho com a logo (ou o nome da loja). Devolve a altura usada. */
  function cabecalho(ctx, W, y, cfg, logo, alturaMax) {
    if (logo) {
      const f = Math.min(380 / logo.width, alturaMax / logo.height);
      ctx.drawImage(logo, (W - logo.width * f) / 2, y, logo.width * f, logo.height * f);
      return logo.height * f;
    }
    ctx.fillStyle = '#532f38';
    ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round(alturaMax * 0.62)}px ${SERIF}`;
    ctx.fillText(cfg.loja_nome || 'Clara Styllus', W / 2, y + alturaMax * 0.72);
    return alturaMax;
  }

  function rodape(ctx, W, H, cfg) {
    const contato = [cfg.loja_instagram, cfg.loja_telefone && `WhatsApp ${cfg.loja_telefone}`].filter(Boolean).join('   ·   ');
    if (!contato) return;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#836169';
    ctx.font = `600 30px ${SANS}`;
    ctx.fillText(caber(ctx, contato, W - 120), W / 2, H - 56);
  }

  /** Bloco de preço: De/Por, valor e parcelas. Devolve a altura usada. */
  function preco(ctx, m, x, y, cfg, escala, alinhar = 'center') {
    ctx.textAlign = alinhar;
    let h = 0;
    if (m.de) {
      ctx.fillStyle = '#8a7d84';
      ctx.font = `500 ${Math.round(34 * escala)}px ${SANS}`;
      const t = `de ${brl(m.de)}`;
      ctx.fillText(t, x, y + 34 * escala);
      const w = ctx.measureText(t).width;
      const x0 = alinhar === 'center' ? x - w / 2 : x;
      ctx.strokeStyle = '#8a7d84';
      ctx.lineWidth = 3 * escala;
      ctx.beginPath();
      ctx.moveTo(x0 + 44 * escala, y + 22 * escala);
      ctx.lineTo(x0 + w, y + 22 * escala);
      ctx.stroke();
      h += 46 * escala;
    }
    ctx.fillStyle = '#703d4a';
    ctx.font = `800 ${Math.round(84 * escala)}px ${SANS}`;
    ctx.fillText(`${m.varia ? 'a partir de ' : m.de ? 'por ' : ''}${brl(m.preco)}`, x, y + h + 80 * escala);
    h += 96 * escala;
    const n = parcelasSemJuros(cfg);
    if (n) {
      ctx.fillStyle = '#532f38';
      ctx.font = `600 ${Math.round(36 * escala)}px ${SANS}`;
      ctx.fillText(`ou ${n}x de ${brl(Math.ceil(m.preco / n))} sem juros`, x, y + h + 40 * escala);
      h += 54 * escala;
    }
    return h;
  }

  /** Pílulas com os tamanhos disponíveis, centralizadas. */
  function tamanhos(ctx, ts, cx, y, escala, larguraMax) {
    if (!ts.length) return 0;
    ctx.font = `700 ${Math.round(32 * escala)}px ${SANS}`;
    const pad = 26 * escala;
    const alt = 58 * escala;
    const vao = 12 * escala;
    const larg = ts.map((t) => Math.max(alt, ctx.measureText(t).width + pad * 2));
    let total = larg.reduce((a, w) => a + w, 0) + vao * (ts.length - 1);
    let lista = ts;
    if (total > larguraMax) { lista = ts.slice(0, 8); total = Math.min(total, larguraMax); }
    let x = cx - total / 2;
    lista.forEach((t, i) => {
      ctx.fillStyle = '#fff';
      arredondado(ctx, x, y, larg[i], alt, alt / 2);
      ctx.fill();
      ctx.strokeStyle = '#e1c2ca';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#703d4a';
      ctx.textAlign = 'center';
      ctx.fillText(t, x + larg[i] / 2, y + alt * 0.68);
      x += larg[i] + vao;
    });
    return alt;
  }

  /** Uma peça por imagem. */
  async function desenharUma(cv, m, cfg, formato) {
    const [W, H] = FORMATOS[formato];
    const [img, logo] = await Promise.all([carregarImg(m.foto), carregarImg(LOGO)]);
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    fundo(ctx, W, H);
    const story = formato === 'story';
    let y = story ? 120 : 52;
    y += cabecalho(ctx, W, y, cfg, logo, story ? 110 : 80) + (story ? 50 : 32);
    const base = (story ? 540 : 470) + (cfg.loja_instagram || cfg.loja_telefone ? 60 : 0);
    const fh = H - y - base;
    foto(ctx, img, 70, y, W - 140, fh, 40);
    if (m.de) {
      const pct = Math.round((1 - m.preco / m.de) * 100);
      ctx.fillStyle = '#703d4a';
      arredondado(ctx, W - 70 - 230, y + 30, 200, 76, 38);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `800 38px ${SANS}`;
      ctx.fillText(`−${pct}%`, W - 70 - 130, y + 82);
    }
    y += fh + (story ? 80 : 60);
    ctx.fillStyle = '#292224';
    ctx.textAlign = 'center';
    ctx.font = `600 ${story ? 66 : 58}px ${SERIF}`;
    ctx.fillText(caber(ctx, m.nome, W - 140), W / 2, y + 20);
    y += story ? 60 : 48;
    if (m.cores.length) {
      ctx.fillStyle = '#8a7d84';
      ctx.font = `500 30px ${SANS}`;
      ctx.fillText(caber(ctx, m.cores.join(' · '), W - 160), W / 2, y + 10);
    }
    y += story ? 40 : 32;
    y += tamanhos(ctx, m.tamanhos, W / 2, y, 1, W - 160) + (story ? 30 : 16);
    preco(ctx, m, W / 2, y, cfg, story ? 1.05 : 0.9);
    rodape(ctx, W, H, cfg);
  }

  /** Quatro peças por imagem (grade 2 × 2). */
  async function desenharGrade(cv, lista, cfg, formato, titulo) {
    const [W, H] = FORMATOS[formato];
    const [imgs, logo] = await Promise.all([Promise.all(lista.map((m) => carregarImg(m.foto))), carregarImg(LOGO)]);
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    fundo(ctx, W, H);
    const story = formato === 'story';
    let y = story ? 110 : 44;
    y += cabecalho(ctx, W, y, cfg, logo, story ? 100 : 70) + (story ? 30 : 18);
    if (titulo) {
      ctx.fillStyle = '#703d4a';
      ctx.textAlign = 'center';
      ctx.font = `600 ${story ? 54 : 44}px ${SERIF}`;
      ctx.fillText(caber(ctx, titulo, W - 140), W / 2, y + (story ? 48 : 38));
      y += story ? 80 : 60;
    }
    const pe = cfg.loja_instagram || cfg.loja_telefone ? (story ? 170 : 100) : 50;
    // Com menos de 4 peças, os cartões crescem para ocupar a imagem toda.
    const gap = 28;
    const cols = lista.length === 1 ? 1 : 2;
    const linhas = Math.ceil(lista.length / cols);
    const cw = (W - 70 * 2 - gap * (cols - 1)) / cols;
    const ch = (H - y - pe - gap * (linhas - 1)) / linhas;
    lista.forEach((m, i) => {
      // Ímpar no fim (3 peças): a última fica centralizada.
      const sozinha = cols === 2 && i === lista.length - 1 && lista.length % 2 === 1;
      const x = sozinha ? (W - cw) / 2 : 70 + (i % cols) * (cw + gap);
      const cy = y + Math.floor(i / cols) * (ch + gap);
      ctx.fillStyle = '#fff';
      arredondado(ctx, x, cy, cw, ch, 30);
      ctx.fill();
      const txt = story ? 210 : 170;
      foto(ctx, imgs[i], x + 14, cy + 14, cw - 28, ch - txt - 14, 22);
      ctx.fillStyle = '#292224';
      ctx.textAlign = 'center';
      ctx.font = `600 ${story ? 34 : 30}px ${SANS}`;
      ctx.fillText(caber(ctx, m.nome, cw - 40), x + cw / 2, cy + ch - txt + 50);
      ctx.fillStyle = '#8a7d84';
      ctx.font = `500 ${story ? 25 : 22}px ${SANS}`;
      ctx.fillText(caber(ctx, m.tamanhos.length ? `Tam ${m.tamanhos.join(' · ')}` : m.cores.join(' · '), cw - 40), x + cw / 2, cy + ch - txt + (story ? 90 : 84));
      ctx.fillStyle = '#703d4a';
      ctx.font = `800 ${story ? 48 : 42}px ${SANS}`;
      const valor = `${m.varia ? 'a partir de ' : ''}${brl(m.preco)}`;
      ctx.fillText(caber(ctx, valor, cw - 40), x + cw / 2, cy + ch - (story ? 50 : 34));
      if (m.de) {
        ctx.fillStyle = '#703d4a';
        arredondado(ctx, x + cw - 150, cy + 30, 120, 52, 26);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `800 28px ${SANS}`;
        ctx.fillText(`−${Math.round((1 - m.preco / m.de) * 100)}%`, x + cw - 90, cy + 66);
      }
    });
    const n = parcelasSemJuros(cfg);
    if (n) {
      ctx.fillStyle = '#532f38';
      ctx.textAlign = 'center';
      ctx.font = `600 28px ${SANS}`;
      ctx.fillText(`Parcele em até ${n}x sem juros`, W / 2, H - (cfg.loja_instagram || cfg.loja_telefone ? (story ? 120 : 100) : 20));
    }
    rodape(ctx, W, H, cfg);
  }

  // ---------------------------------------------------------------- tela
  async function abrir(produtos) {
    const cfg = await U.config();
    await Promise.all([
      document.fonts.load('600 60px "Playfair Display"'), document.fonts.load('800 60px Inter'), document.fonts.load('600 30px Inter'),
    ]).catch(() => {});
    const todos = modelos(produtos).sort((a, b) => (b.estoque > 0) - (a.estoque > 0) || (!!b.foto - !!a.foto));
    if (!todos.length) return aviso('Nenhuma peça na lista. Use a busca ou as categorias para escolher.', 'alerta');
    const marcado = new Set(todos.filter((m) => m.estoque > 0 && m.foto).slice(0, 12).map((m) => m.chave));
    let formato = 'story';
    let modo = 'uma';
    const corpo = abrirModal('Catálogo para Instagram e WhatsApp', `
      <div class="cat">
        <div class="cat-esq">
          <div class="cat-opcoes">
            <div class="segmentos" id="cat-formato">${Object.entries(FORMATOS).map(([k, [, , t]]) => `<button type="button" class="segmento ${k === formato ? 'sel' : ''}" data-f="${k}">${t.split(' (')[0]}</button>`).join('')}</div>
            <div class="segmentos" id="cat-modo"><button type="button" class="segmento sel" data-m="uma">1 peça por imagem</button><button type="button" class="segmento" data-m="grade">4 por imagem</button></div>
            <label id="cat-titulo-l" hidden>Título (opcional)<input id="cat-titulo" maxlength="40" placeholder="Ex.: Novidades da semana"></label>
          </div>
          <div class="cat-sel"><b id="cat-conta"></b><span><button type="button" class="link" id="cat-todos">marcar todas</button> · <button type="button" class="link" id="cat-nenhum">nenhuma</button></span></div>
          <div class="cat-lista">${todos.map((m) => `
            <label class="cat-item ${m.estoque ? '' : 'esgotado'}">
              <input type="checkbox" data-k="${esc(m.chave)}" ${marcado.has(m.chave) ? 'checked' : ''}>
              ${m.foto ? `<img src="${m.foto}" alt="" loading="lazy">` : `<span class="cat-semfoto">${Icone('imagem')}</span>`}
              <span><b>${esc(m.nome)}</b><small>${m.estoque ? `${esc(m.tamanhos.join(', ') || '—')} · ${brl(m.preco)}` : 'esgotado'}${m.foto ? '' : ' · sem foto'}</small></span>
            </label>`).join('')}</div>
        </div>
        <div class="cat-dir">
          <div class="cat-previas" id="cat-previas"></div>
          <div class="cat-acoes">
            <button type="button" class="btn btn-primario" id="cat-baixar">${Icone('nuvem')} Baixar todas</button>
          </div>
          <p class="dica">Dica: no celular, mande as imagens para você mesma no WhatsApp e poste nos stories ou no status.</p>
        </div>
      </div>`, { largura: '1060px' });
    const previas = corpo.querySelector('#cat-previas');
    const conta = corpo.querySelector('#cat-conta');
    let geracao = 0;
    let telas = [];

    const escolhidos = () => todos.filter((m) => marcado.has(m.chave));
    async function gerar() {
      const minha = ++geracao;
      const lista = escolhidos();
      conta.textContent = `${lista.length} peça(s) escolhida(s)`;
      const grupos = modo === 'uma' ? lista.map((m) => [m]) : Array.from({ length: Math.ceil(lista.length / 4) }, (_, i) => lista.slice(i * 4, i * 4 + 4));
      previas.className = `cat-previas ${formato}`;
      if (!grupos.length) { previas.innerHTML = '<div class="vazio">Marque as peças à esquerda.</div>'; telas = []; return; }
      previas.innerHTML = grupos.map((_, i) => `<figure class="cat-previa"><canvas></canvas>
        <figcaption><button type="button" class="btn btn-peq" data-baixar="${i}">${Icone('nuvem')} Baixar</button>
        <button type="button" class="btn btn-peq" data-copiar="${i}">${Icone('imagem')} Copiar</button></figcaption></figure>`).join('');
      telas = [...previas.querySelectorAll('canvas')];
      const titulo = corpo.querySelector('#cat-titulo').value.trim();
      for (let i = 0; i < grupos.length; i++) {
        if (minha !== geracao) return;
        try {
          if (modo === 'uma') await desenharUma(telas[i], grupos[i][0], cfg, formato);
          else await desenharGrade(telas[i], grupos[i], cfg, formato, titulo);
        } catch (e) { erro(e); }
      }
    }
    const nome = (i) => `catalogo-${formato}-${String(i + 1).padStart(2, '0')}.png`;
    const baixar = (i) => {
      const a = document.createElement('a');
      a.href = telas[i].toDataURL('image/png');
      a.download = nome(i);
      a.click();
    };
    previas.onclick = (ev) => {
      const b = ev.target.closest('[data-baixar]');
      if (b) return baixar(Number(b.dataset.baixar));
      const c = ev.target.closest('[data-copiar]');
      if (c) {
        telas[Number(c.dataset.copiar)].toBlob(async (blob) => {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            aviso('Imagem copiada: cole no WhatsApp com Ctrl+V.');
          } catch { aviso('Não deu para copiar neste navegador. Use "Baixar".', 'alerta'); }
        }, 'image/png');
      }
    };
    corpo.querySelector('#cat-baixar').onclick = async () => {
      if (!telas.length) return aviso('Marque pelo menos uma peça.', 'alerta');
      for (let i = 0; i < telas.length; i++) {
        baixar(i);
        await new Promise((ok) => setTimeout(ok, 350));
      }
      aviso(`${telas.length} imagem(ns) salva(s) na pasta Downloads.`);
    };
    const refazer = U.debounce(gerar, 250);
    corpo.querySelector('.cat-lista').onchange = (ev) => {
      const k = ev.target.dataset.k;
      if (!k) return;
      if (ev.target.checked) marcado.add(k); else marcado.delete(k);
      refazer();
    };
    const marcarTodas = (sim) => {
      corpo.querySelectorAll('.cat-lista input').forEach((x) => {
        x.checked = sim;
        if (sim) marcado.add(x.dataset.k); else marcado.delete(x.dataset.k);
      });
      gerar();
    };
    corpo.querySelector('#cat-todos').onclick = () => marcarTodas(true);
    corpo.querySelector('#cat-nenhum').onclick = () => marcarTodas(false);
    corpo.querySelector('#cat-titulo').oninput = refazer;
    corpo.querySelector('#cat-formato').onclick = (ev) => {
      const b = ev.target.closest('[data-f]');
      if (!b) return;
      formato = b.dataset.f;
      corpo.querySelectorAll('#cat-formato .segmento').forEach((x) => x.classList.toggle('sel', x === b));
      gerar();
    };
    corpo.querySelector('#cat-modo').onclick = (ev) => {
      const b = ev.target.closest('[data-m]');
      if (!b) return;
      modo = b.dataset.m;
      corpo.querySelectorAll('#cat-modo .segmento').forEach((x) => x.classList.toggle('sel', x === b));
      corpo.querySelector('#cat-titulo-l').hidden = modo !== 'grade';
      gerar();
    };
    gerar();
  }

  // ------------------------------------------------------ site online (3D)
  /**
   * Catálogo online: prévia do site 3D com as peças da loja, ajustes (título, preço) e publicação na
   * Netlify com um clique. Quem não é administradora só vê, copia e manda o link.
   */
  async function site() {
    const admin = U.sessao.ehAdmin();
    let st;
    let cfg;
    try { [st, cfg] = await Promise.all([U.api('/api/catalogo/site'), U.config(true)]); } catch (e) { return erro(e); }
    const corpo = abrirModal('Site da loja (catálogo online)', `
      <div class="cs">
        <div class="cs-previa">
          <div class="cs-telas segmentos" id="cs-tela"><button type="button" class="segmento sel" data-t="celular">${Icone('telefone')} Celular</button><button type="button" class="segmento" data-t="pc">${Icone('grafico')} Computador</button></div>
          <div class="cs-moldura celular" id="cs-moldura"><iframe id="cs-frame" title="Prévia do site" src="/api/catalogo/site/previa/index.html"></iframe></div>
          <small class="dica">Prévia ao vivo: é assim que a cliente vê. Gire o carrossel, toque nas peças e monte a sacola.</small>
        </div>
        <div class="cs-lado">
          <div class="cs-link" id="cs-link"></div>
          <div class="cs-avisos" id="cs-avisos"></div>
          ${admin ? `
          <details class="cs-bloco" ${st.tem_chave ? '' : 'open'}><summary>${Icone('ajustes')} Textos do site</summary>
            <label>Título<input id="cs-titulo" maxlength="40" value="${esc(cfg.catalogo_titulo || '')}" placeholder="${esc(cfg.loja_nome || 'Clara Styllus')}"></label>
            <label>Frase de apresentação<textarea id="cs-sub" rows="2" maxlength="160" placeholder="Escolha suas peças favoritas, monte a sua sacola e mande o pedido direto no nosso WhatsApp.">${esc(cfg.catalogo_subtitulo || '')}</textarea></label>
            <label class="check"><input type="checkbox" id="cs-preco" ${cfg.catalogo_mostrar_preco !== '0' ? 'checked' : ''}> Mostrar os preços</label>
            <label class="check"><input type="checkbox" id="cs-esgot" ${cfg.catalogo_so_estoque !== '0' ? '' : 'checked'}> Mostrar também peças esgotadas</label>
            <button type="button" class="btn btn-claro btn-peq" id="cs-salvar">${Icone('check')} Salvar e atualizar a prévia</button>
          </details>
          <details class="cs-bloco" ${st.tem_chave ? '' : 'open'}><summary>${Icone('chave')} Onde o site fica hospedado ${st.tem_chave ? '<span class="selo ok">ligado</span>' : ''}</summary>
            <div class="segmentos cs-destino" id="cs-destino">
              <button type="button" class="segmento ${st.destino === 'github' ? 'sel' : ''}" data-d="github">GitHub Pages</button>
              <button type="button" class="segmento ${st.destino === 'netlify' ? 'sel' : ''}" data-d="netlify">Netlify</button>
            </div>
            <div data-mostra="github" ${st.destino === 'github' ? '' : 'hidden'}>
              <ol class="cs-passos">
                <li>Entre no <b>github.com</b> com a conta da loja.</li>
                <li>Clique na sua foto → <b>Settings</b> → <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Tokens (classic)</b> → <b>Generate new token (classic)</b>.</li>
                <li>Em "Note" escreva <b>catalogo</b>, em "Expiration" escolha <b>No expiration</b> e marque só a caixa <b>repo</b>. Clique em <b>Generate token</b> e copie.</li>
                <li>Cole aqui e clique em <b>Publicar</b>: o sistema cria o repositório e liga o GitHub Pages sozinho.</li>
              </ol>
              <label>Chave do GitHub<input id="cs-chave-github" type="password" autocomplete="off" placeholder="${st.destino === 'github' && st.tem_chave ? 'chave guardada (cole outra para trocar)' : 'ghp_…'}"></label>
              <label>Nome do repositório<div class="cs-end"><span>github.com/…/</span><input id="cs-repo" value="${esc((st.repo || '').split('/')[1] || cfg.catalogo_nome_site || `catalogo-${st.nome_site}`)}" ${st.repo ? 'disabled' : ''}></div></label>
              <small class="dica">Fica público (é um site). Obs.: as regras do GitHub Pages não são feitas para lojas virtuais; para um catálogo costuma ir bem, mas se um dia o GitHub reclamar, é só trocar para a Netlify aqui em cima.</small>
            </div>
            <div data-mostra="netlify" ${st.destino === 'netlify' ? '' : 'hidden'}>
              <ol class="cs-passos">
                <li>Crie uma conta grátis em <b>app.netlify.com</b> (pode entrar com o Google).</li>
                <li>Clique na sua foto → <b>User settings</b> → <b>Applications</b> → <b>Personal access tokens</b> → <b>New access token</b>.</li>
                <li>Dê um nome (ex.: "loja"), escolha <b>No expiration</b>, gere e copie a chave.</li>
                <li>Cole aqui embaixo e clique em <b>Publicar</b>.</li>
              </ol>
              <label>Chave da Netlify<input id="cs-chave" type="password" autocomplete="off" placeholder="${st.destino === 'netlify' && st.tem_chave ? 'chave guardada (cole outra para trocar)' : 'cole a chave aqui'}"></label>
              <label>Endereço do site<div class="cs-end"><input id="cs-nome" value="${esc(cfg.catalogo_nome_site || st.nome_site)}" ${st.url && st.destino === 'netlify' ? 'disabled' : ''}><span>.netlify.app</span></div></label>
            </div>
          </details>
          <div class="cs-acoes">
            <button type="button" class="btn btn-primario btn-grande" id="cs-publicar">${Icone('nuvem')} ${st.url ? 'Atualizar o site' : 'Publicar o site'}</button>
            <a class="btn btn-fantasma" href="/api/catalogo/site.zip" download>${Icone('caixa')} Baixar o site (.zip)</a>
          </div>` : '<p class="dica">Só a administradora publica ou atualiza o site. Você pode copiar e mandar o link.</p>'}
        </div>
      </div>`, { largura: '1180px', classe: 'modal-site' });

    const frame = corpo.querySelector('#cs-frame');
    corpo.querySelector('#cs-tela').onclick = (ev) => {
      const b = ev.target.closest('[data-t]');
      if (!b) return;
      corpo.querySelectorAll('#cs-tela .segmento').forEach((x) => x.classList.toggle('sel', x === b));
      corpo.querySelector('#cs-moldura').className = `cs-moldura ${b.dataset.t}`;
    };
    const recarregar = () => { frame.src = `/api/catalogo/site/previa/index.html?t=${Date.now()}`; };
    const desenhar = () => {
      const link = corpo.querySelector('#cs-link');
      const quando = st.publicado_em ? new Date(st.publicado_em.replace(' ', 'T')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      link.innerHTML = st.url ? `
        <small>Link do catálogo</small>
        <a href="${esc(st.url)}" target="_blank" rel="noopener" class="cs-url">${esc(st.url.replace(/^https?:\/\//, ''))}</a>
        <span class="cs-quando">atualizado em ${quando} · ${st.pecas} peça(s)</span>
        <div class="cs-link-acoes">
          <button type="button" class="btn btn-claro btn-peq" id="cs-copiar">${Icone('recibo')} Copiar link</button>
          <a class="btn btn-peq cl-btn-zap" data-zap-direto target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Oi! Olha o nosso catálogo com todas as peças da loja 💕\n${st.url}`)}">${Icone('whatsapp')} Mandar no WhatsApp</a>
        </div>`
        : `<small>Link do catálogo</small><b class="cs-sem">Ainda não publicado</b><span class="cs-quando">${st.pecas} peça(s) vão entrar no site</span>`;
      const c = link.querySelector('#cs-copiar');
      if (c) {
        c.onclick = async () => {
          try { await navigator.clipboard.writeText(st.url); aviso('Link copiado. Cole no WhatsApp com Ctrl+V.'); } catch { aviso(st.url); }
        };
      }
      corpo.querySelector('#cs-avisos').innerHTML = [
        !st.whatsapp_ok && `<div class="cs-aviso perigo">${Icone('whatsapp')}<span>Coloque o <b>telefone da loja</b> em Configurações → Loja: é para ele que os pedidos do site vão.</span></div>`,
        st.pedidos_ok ? `<div class="cs-aviso ok">${Icone('check')}<span><b>Pedidos pelo site ligados:</b> quando a cliente finaliza a sacola, o pedido cai em <a href="#/pedidos" data-fechar>Pedidos online</a> com as peças separadas.</span></div>`
          : `<div class="cs-aviso">${Icone('sacola')}<span>Quer que os pedidos do site caiam direto no sistema? <a href="#/pedidos" data-fechar>Ligue em Pedidos online</a> (grátis) e depois atualize o site.</span></div>`,
        st.sem_foto && `<div class="cs-aviso">${Icone('camera')}<span><b>${st.sem_foto}</b> peça(s) sem foto aparecem com "foto em breve". Tire a foto pelo celular no cadastro.</span></div>`,
        !st.pecas && `<div class="cs-aviso perigo">${Icone('alerta')}<span>Nenhuma peça com estoque para mostrar.</span></div>`,
      ].filter(Boolean).join('');
    };
    desenhar();
    if (!admin) return;

    const salvarTextos = async (extra = {}) => {
      const corpoCfg = {
        catalogo_titulo: corpo.querySelector('#cs-titulo').value.trim(),
        catalogo_subtitulo: corpo.querySelector('#cs-sub').value.trim(),
        catalogo_mostrar_preco: corpo.querySelector('#cs-preco').checked ? '1' : '0',
        catalogo_so_estoque: corpo.querySelector('#cs-esgot').checked ? '0' : '1',
        ...extra,
      };
      corpoCfg.catalogo_destino = destino;
      const chave = corpo.querySelector('#cs-chave').value.trim();
      if (chave) corpoCfg.catalogo_netlify_token = chave;
      const chaveGh = corpo.querySelector('#cs-chave-github').value.trim();
      if (chaveGh) corpoCfg.catalogo_github_token = chaveGh;
      const nome = destino === 'github' ? corpo.querySelector('#cs-repo') : corpo.querySelector('#cs-nome');
      if (!nome.disabled && nome.value.trim()) corpoCfg.catalogo_nome_site = nome.value.trim();
      await U.api('/api/config', { metodo: 'PUT', corpo: corpoCfg });
      U.config(true).catch(() => {});
      st = await U.api('/api/catalogo/site');
      corpo.querySelector('#cs-chave').value = '';
      corpo.querySelector('#cs-chave-github').value = '';
      desenhar();
    };
    let destino = st.destino;
    corpo.querySelector('#cs-destino').onclick = (ev) => {
      const b = ev.target.closest('[data-d]');
      if (!b) return;
      destino = b.dataset.d;
      corpo.querySelectorAll('#cs-destino .segmento').forEach((x) => x.classList.toggle('sel', x === b));
      corpo.querySelectorAll('[data-mostra]').forEach((x) => { x.hidden = x.dataset.mostra !== destino; });
    };
    corpo.querySelector('#cs-salvar').onclick = async () => {
      try { await salvarTextos(); recarregar(); aviso('Textos salvos. A prévia foi atualizada.'); } catch (e) { erro(e); }
    };
    const bPub = corpo.querySelector('#cs-publicar');
    bPub.onclick = async () => {
      try {
        await salvarTextos();
        if (!st.tem_chave) return aviso(`Cole a chave ${destino === 'github' ? 'do GitHub' : 'da Netlify'} (passo a passo logo acima) e clique de novo.`, 'alerta');
        bPub.disabled = true;
        bPub.innerHTML = `${Icone('nuvem')} Publicando… (pode levar até 1 minuto)`;
        if (destino === 'github' && !st.url) aviso('Na primeira vez o GitHub leva 1 a 2 minutos para deixar o link no ar.');
        const r = await U.api('/api/catalogo/site/publicar', { metodo: 'POST' });
        st = await U.api('/api/catalogo/site');
        desenhar();
        recarregar();
        Animacoes.confete();
        U.avisoAcao(`Site no ar com ${r.pecas} peça(s)!`, 'Abrir', () => window.open(r.url, '_blank'));
        corpo.querySelector(destino === 'github' ? '#cs-repo' : '#cs-nome').disabled = true;
      } catch (e) { erro(e); } finally {
        bPub.disabled = false;
        bPub.innerHTML = `${Icone('nuvem')} ${st.url ? 'Atualizar o site' : 'Publicar o site'}`;
      }
    };
  }

  return { abrir, site, modelos, parcelasSemJuros };
})();
