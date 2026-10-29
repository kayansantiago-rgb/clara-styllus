/* Resumo do mês em imagem (1080×1350, formato de post do Instagram) para guardar ou mandar no WhatsApp. */
const ResumoMes = (() => {
  const { brl, api, erro, abrirModal, aviso } = U;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const W = 1080;
  const H = 1350;

  const iso = (d) => d.toLocaleDateString('sv-SE');
  const limites = (ano, mes) => {
    const fimMes = new Date(ano, mes + 1, 0);
    const hoje = new Date();
    return [iso(new Date(ano, mes, 1)), iso(fimMes < hoje ? fimMes : hoje)];
  };

  async function dados(ano, mes) {
    const [de, ate] = limites(ano, mes);
    const [pa, pm] = mes === 0 ? [ano - 1, 11] : [ano, mes - 1];
    const [pde, pate] = limites(pa, pm);
    const [r, ant, cfg] = await Promise.all([
      api(`/api/relatorios?de=${de}&ate=${ate}`),
      api(`/api/relatorios?de=${pde}&ate=${pate}`),
      U.config(),
    ]);
    const melhorDia = [...r.por_dia].sort((a, b) => b.faturamento - a.faturamento)[0] || null;
    const vendedora = [...r.por_vendedor].filter((v) => v.vendedor && v.vendedor !== '—').sort((a, b) => b.total - a.total)[0] || null;
    return {
      ano, mes, de, ate, cfg,
      faturamento: r.totais.faturamento,
      vendas: r.totais.vendas,
      pecas: r.totais.pecas || 0,
      ticket: r.totais.ticket_medio,
      anterior: ant.totais.faturamento,
      melhorDia,
      vendedora,
      campea: r.top_produtos[0] || null,
      porDia: r.por_dia,
      meta: Number(cfg.meta_mensal) || 0,
    };
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

  async function desenhar(cv, d) {
    await Promise.all([
      document.fonts.load('600 80px "Playfair Display"'), document.fonts.load('700 40px Inter'), document.fonts.load('500 30px Inter'),
    ]).catch(() => {});
    const logo = await carregarImg('/img/logo.png');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    const SERIF = '"Playfair Display", Georgia, serif';
    const SANS = 'Inter, "Segoe UI", sans-serif';

    // Fundo: degradê ameixa → rosa, com círculos suaves.
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#29191d');
    g.addColorStop(0.55, '#653843');
    g.addColorStop(1, '#a86979');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const [x, y, r, a] of [[940, 140, 260, 0.08], [80, 1180, 320, 0.07], [1000, 1000, 140, 0.06], [140, 260, 90, 0.05]]) {
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cabeçalho: logo dourada da loja (ou o nome, se não carregar).
    let y = 70;
    const nomeLoja = d.cfg.loja_nome || 'Clara Styllus';
    if (logo) {
      const fator = Math.min(320 / logo.width, 160 / logo.height);
      const lw = logo.width * fator;
      const lh = logo.height * fator;
      ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
      y += lh + 70;
    } else {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = `600 64px ${SERIF}`;
      ctx.fillText(nomeLoja, W / 2, y + 50);
      y += 110;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = `600 26px ${SANS}`;
    ctx.letterSpacing = '6px';
    ctx.fillText('RESUMO DO MÊS', W / 2, y);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#fff';
    ctx.font = `600 66px ${SERIF}`;
    const titulo = `${MESES[d.mes].charAt(0).toUpperCase() + MESES[d.mes].slice(1)} de ${d.ano}`;
    ctx.fillText(titulo, W / 2, y + 74);
    y += 150;

    // Faturamento em destaque + comparação com o mês anterior.
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.font = `500 30px ${SANS}`;
    ctx.fillText('Vendido no mês', W / 2, y);
    ctx.fillStyle = '#fff';
    ctx.font = `800 118px ${SANS}`;
    ctx.fillText(brl(d.faturamento), W / 2, y + 120);
    y += 170;
    if (d.anterior) {
      const pct = Math.round(((d.faturamento - d.anterior) / d.anterior) * 100);
      const txt = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% em relação a ${MESES[d.mes === 0 ? 11 : d.mes - 1]}`;
      ctx.font = `600 28px ${SANS}`;
      const tw = ctx.measureText(txt).width + 48;
      ctx.fillStyle = pct >= 0 ? 'rgba(126,231,170,.2)' : 'rgba(255,170,170,.2)';
      arredondado(ctx, (W - tw) / 2, y - 36, tw, 54, 27);
      ctx.fill();
      ctx.fillStyle = pct >= 0 ? '#a8f0c6' : '#ffc2c2';
      ctx.fillText(txt, W / 2, y);
    }
    if (!d.anterior) y -= 50;
    if (d.meta) {
      const pctMeta = Math.round((d.faturamento / d.meta) * 100);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.font = `500 26px ${SANS}`;
      ctx.fillText(pctMeta >= 100 ? `Meta batida: ${pctMeta}% de ${brl(d.meta)}` : `${pctMeta}% da meta de ${brl(d.meta)}`, W / 2, y + 62);
    }
    y += 110;

    // Quatro cartões.
    const cartoes = [
      ['Vendas', String(d.vendas)],
      ['Peças vendidas', String(d.pecas)],
      ['Ticket médio', brl(d.ticket)],
      ['Melhor dia', d.melhorDia ? `${d.melhorDia.dia.slice(8)}/${d.melhorDia.dia.slice(5, 7)}` : '—'],
    ];
    const cw = 452;
    const ch = 140;
    cartoes.forEach(([rot, val], i) => {
      const x = 64 + (i % 2) * (cw + 48);
      const cy = y + Math.floor(i / 2) * (ch + 28);
      ctx.fillStyle = 'rgba(255,255,255,.1)';
      arredondado(ctx, x, cy, cw, ch, 26);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.16)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = `500 26px ${SANS}`;
      ctx.fillText(rot, x + 32, cy + 50);
      ctx.fillStyle = '#fff';
      ctx.font = `700 50px ${SANS}`;
      ctx.fillText(caber(ctx, val, cw - 64), x + 32, cy + 110);
      if (rot === 'Melhor dia' && d.melhorDia) {
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.font = `500 26px ${SANS}`;
        ctx.fillText(brl(d.melhorDia.faturamento), x + cw - 32, cy + 108);
      }
    });
    y += 2 * ch + 28 + 56;

    // Destaques: vendedora e peça campeã.
    const destaques = [
      ['★', 'Vendedora destaque', d.vendedora ? d.vendedora.vendedor : '—', d.vendedora ? `${brl(d.vendedora.total)} · ${d.vendedora.vendas} vendas` : ''],
      ['♥', 'Peça campeã', d.campea ? [d.campea.nome, d.campea.tamanho].filter(Boolean).join(' ') : '—', d.campea ? `${d.campea.quantidade} peça(s) vendida(s)` : ''],
    ];
    for (const [ico, rot, nome, sub] of destaques) {
      ctx.fillStyle = '#fff';
      arredondado(ctx, 64, y, W - 128, 124, 26);
      ctx.fill();
      ctx.fillStyle = '#f3e6e9';
      ctx.beginPath();
      ctx.arc(64 + 66, y + 62, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#955968';
      ctx.textAlign = 'center';
      ctx.font = `700 38px ${SANS}`;
      ctx.fillText(ico, 64 + 66, y + 76);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#8a7d84';
      ctx.font = `500 24px ${SANS}`;
      ctx.fillText(rot, 64 + 128, y + 48);
      ctx.fillStyle = '#292224';
      ctx.font = `700 36px ${SANS}`;
      ctx.fillText(caber(ctx, nome, 520), 64 + 128, y + 92);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#955968';
      ctx.font = `600 26px ${SANS}`;
      ctx.fillText(sub, W - 64 - 32, y + 92);
      y += 146;
    }

    // Rodapé.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = `500 22px ${SANS}`;
    const contato = [d.cfg.loja_instagram, d.cfg.loja_telefone].filter(Boolean).join('  ·  ');
    ctx.fillText(contato ? `${nomeLoja}  ·  ${contato}` : nomeLoja, W / 2, H - 44);
  }

  // ---------------------------------------------------------------- tela
  async function abrir(ano, mes) {
    const h = new Date();
    if (ano == null) { ano = h.getFullYear(); mes = h.getMonth(); }
    const corpo = abrirModal('Resumo do mês em imagem', `
      <div class="rm">
        <div class="rm-mes">
          <button type="button" class="btn-ico" id="rm-ant" title="Mês anterior">${Icone('seta')}</button>
          <b id="rm-titulo"></b>
          <button type="button" class="btn-ico" id="rm-prox" title="Próximo mês">${Icone('seta')}</button>
        </div>
        <div class="rm-tela"><canvas id="rm-cv"></canvas><div class="rm-carregando" id="rm-carr"><span class="girando"></span></div></div>
        <p class="dica" style="text-align:center">Imagem no formato de post (1080 × 1350). Guarde no computador ou mande para a sócia no WhatsApp.</p>
        <div class="vc-acoes">
          <button class="btn" id="rm-copiar">${Icone('imagem')} Copiar imagem</button>
          <button class="btn btn-primario btn-grande" id="rm-baixar">${Icone('nuvem')} Baixar imagem</button>
        </div>
      </div>`, { largura: '560px' });
    const cv = corpo.querySelector('#rm-cv');
    let atual = null;
    const carregar = async () => {
      corpo.querySelector('#rm-titulo').textContent = `${MESES[mes]} de ${ano}`;
      corpo.querySelector('#rm-prox').disabled = ano === h.getFullYear() && mes === h.getMonth();
      corpo.querySelector('#rm-carr').hidden = false;
      try {
        atual = await dados(ano, mes);
        await desenhar(cv, atual);
      } catch (e) { erro(e); }
      corpo.querySelector('#rm-carr').hidden = true;
    };
    corpo.querySelector('#rm-ant').onclick = () => { if (--mes < 0) { mes = 11; ano--; } carregar(); };
    corpo.querySelector('#rm-prox').onclick = () => { if (++mes > 11) { mes = 0; ano++; } carregar(); };
    const nomeArq = () => `resumo-${ano}-${String(mes + 1).padStart(2, '0')}.png`;
    corpo.querySelector('#rm-baixar').onclick = () => {
      const a = document.createElement('a');
      a.href = cv.toDataURL('image/png');
      a.download = nomeArq();
      a.click();
    };
    corpo.querySelector('#rm-copiar').onclick = () => {
      cv.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          aviso('Imagem copiada: cole no WhatsApp com Ctrl+V.');
        } catch {
          aviso('Não deu para copiar neste navegador. Use "Baixar imagem".', 'alerta');
        }
      }, 'image/png');
    };
    carregar();
  }

  return { abrir, dados, desenhar };
})();
