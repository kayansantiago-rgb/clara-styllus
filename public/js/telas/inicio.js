/* Painel inicial da dona: vendas de hoje × ontem, meta do mês, mais vendidos, aniversários e crediário. */
Telas.inicio = (() => {
  const { esc, brl, api } = U;

  /** Variação percentual com seta; "—" quando não dá para comparar. */
  function variacao(atual, anterior) {
    if (!anterior) return atual ? '<span class="var sobe">▲ novo</span>' : '<span class="var">—</span>';
    const pct = Math.round(((atual - anterior) / anterior) * 100);
    if (pct === 0) return '<span class="var">= ontem</span>';
    return `<span class="var ${pct > 0 ? 'sobe' : 'desce'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs ontem</span>`;
  }

  const saudacao = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  };

  const whats = (tel, msg) => {
    const d = String(tel || '').replace(/\D/g, '').replace(/^55/, '');
    return d.length >= 10 ? `https://wa.me/55${d}?text=${encodeURIComponent(msg)}` : null;
  };

  function graficoDias(dias) {
    const max = Math.max(1, ...dias.map((d) => d.faturamento));
    const hoje = U.hoje();
    const melhor = dias.reduce((a, d) => (d.faturamento > a.faturamento ? d : a), dias[0]);
    return `
      <div class="grafico-dias" role="img" aria-label="Faturamento dos últimos 14 dias">
        ${dias.map((d) => {
    const [, m, dia] = d.dia.split('-');
    const sem = new Date(d.dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const h = d.faturamento ? Math.max(3, (d.faturamento / max) * 100) : 0;
    const rotulo = d.dia === hoje || (d === melhor && d.faturamento) ? `<span class="barra-valor">${brl(d.faturamento).replace(',00', '')}</span>` : '';
    return `<div class="dia ${d.dia === hoje ? 'hoje' : ''}" tabindex="0"
              data-dica="${sem} ${dia}/${m} · ${brl(d.faturamento)} · ${d.vendas} venda${d.vendas === 1 ? '' : 's'}">
            <div class="coluna"><i style="height:${h}%">${rotulo}</i></div>
            <small>${dia}</small></div>`;
  }).join('')}
        <div class="dica-grafico" hidden></div>
      </div>
      <table class="sr-only"><caption>Faturamento por dia</caption>
        ${dias.map((d) => `<tr><td>${d.dia}</td><td>${brl(d.faturamento)}</td><td>${d.vendas}</td></tr>`).join('')}</table>`;
  }

  async function abrir(raiz) {
    const [r, bk, conds] = await Promise.all([
      api('/api/painel'), api('/api/backup/status').catch(() => null), api('/api/condicionais').catch(() => []),
    ]);
    const condAtrasadas = conds.filter((c) => c.prazo < U.hoje());
    const semBackup = bk && (bk.horas_desde_ultimo == null || bk.horas_desde_ultimo > 72);
    const nome = (U.sessao.usuario.nome || '').split(' ')[0];
    const hojeTxt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const meta = r.mes.meta;
    const pctMeta = meta ? Math.min(100, Math.round((r.mes.faturamento / meta) * 100)) : 0;
    const esperadoHoje = meta ? Math.round((meta / r.mes.dias) * r.mes.dia) : 0;
    const ritmo = meta ? (r.mes.faturamento >= esperadoHoje ? 'no ritmo' : 'abaixo do ritmo') : '';

    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>${saudacao()}, ${esc(nome)}!</h1><p class="dica" style="text-transform:capitalize">${hojeTxt}</p></div>
        <div class="ferramentas"><a class="btn btn-primario btn-grande" href="#/pdv">🛍️ Ir para o caixa</a></div>
      </div>

      ${condAtrasadas.length ? `<div class="pdv-alerta alerta painel-alerta">👜 ${condAtrasadas.length} condicional(is) passou do prazo de devolução:
        ${condAtrasadas.slice(0, 3).map((c) => esc(c.cliente_nome)).join(', ')}${condAtrasadas.length > 3 ? '…' : ''}. <a href="#/condicional">Ver condicionais →</a></div>` : ''}
      ${semBackup ? `<div class="pdv-alerta perigo painel-alerta">💾 ${bk.ultimo ? `O último backup foi há ${Math.round(bk.horas_desde_ultimo / 24)} dia(s).` : 'Nenhum backup foi feito ainda.'}
        Se o computador der defeito, os dados podem se perder. <a href="#/config">Fazer backup agora →</a></div>`
    : bk && bk.ultimo_erro ? `<div class="pdv-alerta alerta painel-alerta">💾 ${esc(bk.ultimo_erro)}</div>` : ''}
      <div class="cards painel-kpis">
        <div class="card destaque"><small>Vendido hoje</small><b>${brl(r.hoje.faturamento)}</b>${variacao(r.hoje.faturamento, r.ontem.faturamento)}</div>
        <div class="card"><small>Vendas hoje</small><b>${r.hoje.vendas}</b>${variacao(r.hoje.vendas, r.ontem.vendas)}</div>
        <div class="card"><small>Peças hoje</small><b>${r.hoje.pecas}</b>${variacao(r.hoje.pecas, r.ontem.pecas)}</div>
        <div class="card"><small>Ticket médio hoje</small><b>${brl(r.hoje.ticket)}</b>${variacao(r.hoje.ticket, r.ontem.ticket)}</div>
      </div>

      <div class="painel-grade">
        <div class="cartao painel-meta">
          <h3>Meta do mês</h3>
          ${meta ? `
            <div class="meta-numeros"><b>${brl(r.mes.faturamento)}</b><span>de ${brl(meta)}</span></div>
            <div class="meta-barra" role="progressbar" aria-valuenow="${pctMeta}" aria-valuemin="0" aria-valuemax="100">
              <i style="width:${pctMeta}%"></i><span class="meta-marca" style="left:${Math.min(100, (esperadoHoje / meta) * 100)}%" title="Onde deveria estar hoje"></span>
            </div>
            <div class="meta-rodape"><span><b>${pctMeta}%</b> atingido · ${ritmo}</span>
              <span>Projeção: <b>${brl(r.mes.projecao)}</b></span></div>
            <p class="dica">Faltam ${brl(Math.max(0, meta - r.mes.faturamento))} em ${r.mes.dias - r.mes.dia + 1} dia(s)
              — cerca de <b>${brl(Math.max(0, Math.ceil((meta - r.mes.faturamento) / (r.mes.dias - r.mes.dia + 1))))}</b> por dia.</p>`
    : `<div class="meta-numeros"><b>${brl(r.mes.faturamento)}</b><span>vendido no mês</span></div>
            <p class="dica">Defina uma meta mensal em <a href="#/config">Configurações</a> para acompanhar o progresso aqui.</p>`}
        </div>

        <div class="cartao">
          <h3>Vendas dos últimos 14 dias</h3>
          ${graficoDias(r.ultimos14)}
        </div>

        <div class="cartao">
          <h3>🏆 Mais vendidos da semana</h3>
          ${r.mais_vendidos.map((p, i) => `
            <div class="painel-item"><span class="pos">${i + 1}</span>${U.miniatura({ id: p.produto_id, foto_versao: p.foto_versao })}
              <span class="painel-item-txt"><b>${esc(p.nome)}</b><small>${p.quantidade} peça(s) · ${brl(p.total)}</small></span></div>`).join('')
    || '<div class="vazio">Nenhuma venda nos últimos 7 dias.</div>'}
        </div>

        <div class="cartao">
          <h3>🎂 Aniversariantes</h3>
          ${r.aniversariantes.map((c) => {
    const link = whats(c.telefone, `Feliz aniversário, ${c.nome.split(' ')[0]}! 🎉 A Clara Styllus deseja um dia lindo. Passa aqui na loja que temos um presente para você!`);
    return `<div class="painel-item"><span class="painel-item-txt"><b>${esc(c.nome)}</b>
              <small>${c.em_dias === 0 ? '<b class="txt-rosa">hoje!</b>' : c.em_dias === 1 ? 'amanhã' : `em ${c.em_dias} dias`} · ${c.aniversario.slice(8)}/${c.aniversario.slice(5, 7)}</small></span>
              ${link ? `<a class="btn btn-peq" target="_blank" rel="noopener" href="${link}">📱 Parabéns</a>` : ''}</div>`;
  }).join('') || '<div class="vazio">Ninguém faz aniversário nos próximos 7 dias.</div>'}
        </div>

        <div class="cartao">
          <h3>📒 Crediário</h3>
          <div class="cards cards-mini">
            <div class="card"><small>A receber</small><b>${brl(r.crediario.a_receber)}</b></div>
            <div class="card"><small>Vencido</small><b class="${r.crediario.vencido ? 'txt-perigo' : ''}">${brl(r.crediario.vencido)}</b></div>
            <div class="card"><small>Recebido hoje</small><b>${brl(r.crediario.recebido)}</b></div>
          </div>
          <h4>Vencendo hoje</h4>
          ${r.crediario.vencendo_hoje.map((c) => `<div class="painel-item"><span class="painel-item-txt"><b>${esc(c.nome)}</b><small>${brl(c.valor)}</small></span>
            ${whats(c.telefone, '') ? `<a class="btn btn-peq" target="_blank" rel="noopener" href="${whats(c.telefone, `Olá, ${c.nome.split(' ')[0]}! Aqui é da Clara Styllus. Lembrando que hoje vence sua parcela do crediário de ${brl(c.valor)}. Obrigada!`)}">📱 Lembrar</a>` : ''}</div>`).join('')
    || '<div class="vazio">Nenhuma parcela vence hoje.</div>'}
          <a href="#/crediario">Ver crediário completo →</a>
        </div>

        <div class="cartao">
          <h3>📦 Estoque</h3>
          ${r.estoque_baixo
    ? `<p><b class="txt-perigo">${r.estoque_baixo}</b> produto(s) no estoque mínimo ou esgotados.</p><a href="#/relatorios">Ver lista para repor →</a>`
    : '<p>Tudo certo com o estoque. ✅</p>'}
        </div>
      </div>`;

    // Dica ao passar o mouse (ou focar com o teclado) nas barras.
    const grafico = raiz.querySelector('.grafico-dias');
    const dica = grafico.querySelector('.dica-grafico');
    const mostrar = (ev) => {
      const d = ev.target.closest('.dia');
      if (!d) { dica.hidden = true; return; }
      dica.textContent = d.dataset.dica;
      dica.hidden = false;
      const g = grafico.getBoundingClientRect();
      const b = d.getBoundingClientRect();
      dica.style.left = `${Math.min(g.width - 180, Math.max(0, b.left - g.left + b.width / 2 - 90))}px`;
    };
    grafico.addEventListener('mouseover', mostrar);
    grafico.addEventListener('focusin', mostrar);
    grafico.addEventListener('mouseleave', () => { dica.hidden = true; });
  }

  return { abrir };
})();
