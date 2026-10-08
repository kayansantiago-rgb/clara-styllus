/*
 * Catálogo em imagem para o Instagram e o WhatsApp: escolhe as peças e o sistema monta as imagens
 * com foto, nome, tamanhos disponíveis, preço (De/Por) e o "3x de" sem juros.
 */
const Catalogo = (() => {
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
      ctx.fillStyle = '#f3dde7';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#c58ea6';
      ctx.textAlign = 'center';
      ctx.font = `600 ${Math.round(w / 9)}px ${SERIF}`;
      ctx.fillText('foto em breve', x + w / 2, y + h / 2);
    }
    ctx.restore();
  }

  function fundo(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fbf4f7');
    g.addColorStop(1, '#f3e1e9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(161,77,111,.06)';
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
    ctx.fillStyle = '#5a2840';
    ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round(alturaMax * 0.62)}px ${SERIF}`;
    ctx.fillText(cfg.loja_nome || 'Clara Styllus', W / 2, y + alturaMax * 0.72);
    return alturaMax;
  }

  function rodape(ctx, W, H, cfg) {
    const contato = [cfg.loja_instagram, cfg.loja_telefone && `WhatsApp ${cfg.loja_telefone}`].filter(Boolean).join('   ·   ');
    if (!contato) return;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8a5a70';
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
    ctx.fillStyle = '#7a3352';
    ctx.font = `800 ${Math.round(84 * escala)}px ${SANS}`;
    ctx.fillText(`${m.varia ? 'a partir de ' : m.de ? 'por ' : ''}${brl(m.preco)}`, x, y + h + 80 * escala);
    h += 96 * escala;
    const n = parcelasSemJuros(cfg);
    if (n) {
      ctx.fillStyle = '#5a2840';
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
      ctx.strokeStyle = '#e7bccf';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#7a3352';
      ctx.textAlign = 'center';
      ctx.fillText(t, x + larg[i] / 2, y + alt * 0.68);
      x += larg[i] + vao;
    });
    return alt;
  }

  /** Uma peça por imagem. */
  async function desenharUma(cv, m, cfg, formato) {
    const [W, H] = FORMATOS[formato];
    const [img, logo] = await Promise.all([carregarImg(m.foto), carregarImg(cfg.cupom_logo_img)]);
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
      ctx.fillStyle = '#7a3352';
      arredondado(ctx, W - 70 - 230, y + 30, 200, 76, 38);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `800 38px ${SANS}`;
      ctx.fillText(`−${pct}%`, W - 70 - 130, y + 82);
    }
    y += fh + (story ? 80 : 60);
    ctx.fillStyle = '#2b2027';
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
    const [imgs, logo] = await Promise.all([Promise.all(lista.map((m) => carregarImg(m.foto))), carregarImg(cfg.cupom_logo_img)]);
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    fundo(ctx, W, H);
    const story = formato === 'story';
    let y = story ? 110 : 44;
    y += cabecalho(ctx, W, y, cfg, logo, story ? 100 : 70) + (story ? 30 : 18);
    if (titulo) {
      ctx.fillStyle = '#7a3352';
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
      ctx.fillStyle = '#2b2027';
      ctx.textAlign = 'center';
      ctx.font = `600 ${story ? 34 : 30}px ${SANS}`;
      ctx.fillText(caber(ctx, m.nome, cw - 40), x + cw / 2, cy + ch - txt + 50);
      ctx.fillStyle = '#8a7d84';
      ctx.font = `500 ${story ? 25 : 22}px ${SANS}`;
      ctx.fillText(caber(ctx, m.tamanhos.length ? `Tam ${m.tamanhos.join(' · ')}` : m.cores.join(' · '), cw - 40), x + cw / 2, cy + ch - txt + (story ? 90 : 84));
      ctx.fillStyle = '#7a3352';
      ctx.font = `800 ${story ? 48 : 42}px ${SANS}`;
      const valor = `${m.varia ? 'a partir de ' : ''}${brl(m.preco)}`;
      ctx.fillText(caber(ctx, valor, cw - 40), x + cw / 2, cy + ch - (story ? 50 : 34));
      if (m.de) {
        ctx.fillStyle = '#7a3352';
        arredondado(ctx, x + cw - 150, cy + 30, 120, 52, 26);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `800 28px ${SANS}`;
        ctx.fillText(`−${Math.round((1 - m.preco / m.de) * 100)}%`, x + cw - 90, cy + 66);
      }
    });
    const n = parcelasSemJuros(cfg);
    if (n) {
      ctx.fillStyle = '#5a2840';
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

  return { abrir, modelos, parcelasSemJuros };
})();
