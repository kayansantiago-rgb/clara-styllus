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

  async function abrir(raiz) {
    const [r, bk, conds, at] = await Promise.all([
      api('/api/painel'), api('/api/backup/status').catch(() => null), api('/api/condicionais').catch(() => []),
      api('/api/atualizacao').catch(() => null),
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
        <div><h1>${saudacao()}, ${esc(nome)}!</h1><p class="dica">${hojeTxt.charAt(0).toUpperCase() + hojeTxt.slice(1)}</p></div>
      </div>

      ${at && at.disponivel ? `<div class="pdv-alerta ok painel-alerta at-aviso"><i data-icone="nuvem"></i>
        <span>Nova versão <b>${esc(at.disponivel.versao)}</b> do sistema disponível (você está na ${esc(at.versao_atual)}).</span>
        <button class="btn btn-peq btn-primario" id="at-agora">Atualizar agora</button> <a href="#/config?aba=atualizacao">detalhes</a></div>` : ''}
      ${condAtrasadas.length ? `<div class="pdv-alerta alerta painel-alerta"><i data-icone="bolsa"></i> ${condAtrasadas.length} condicional(is) passou do prazo de devolução:
        ${condAtrasadas.slice(0, 3).map((c) => esc(c.cliente_nome)).join(', ')}${condAtrasadas.length > 3 ? '…' : ''}. <a href="#/condicional">Ver condicionais →</a></div>` : ''}
      ${semBackup ? `<div class="pdv-alerta perigo painel-alerta"><i data-icone="nuvem"></i> ${bk.ultimo ? `O último backup foi há ${Math.round(bk.horas_desde_ultimo / 24)} dia(s).` : 'Nenhum backup foi feito ainda.'}
        Se o computador der defeito, os dados podem se perder. <a href="#/config?aba=backup">Fazer backup agora →</a></div>`
    : bk && bk.ultimo_erro ? `<div class="pdv-alerta alerta painel-alerta"><i data-icone="nuvem"></i> ${esc(bk.ultimo_erro)}</div>` : ''}
      <div class="in-atalhos">
        <a class="in-atalho destaque" href="#/pdv">${Icone('sacola')}<b>Vender</b><small>abrir o caixa</small></a>
        <a class="in-atalho" href="#/produtos">${Icone('roupa')}<b>Produtos</b><small>cadastrar e estoque</small></a>
        <a class="in-atalho" href="#/etiquetas">${Icone('etiqueta')}<b>Etiquetas</b><small>imprimir</small></a>
        <a class="in-atalho" href="#/vendas">${Icone('recibo')}<b>Vendas</b><small>histórico e trocas</small></a>
        <a class="in-atalho" href="#/clientes">${Icone('clientes')}<b>Clientes</b><small>fichas e WhatsApp</small></a>
        <a class="in-atalho" href="#/relatorios">${Icone('grafico')}<b>Relatórios</b><small>lucro e gráficos</small></a>
      </div>
      <div class="vd-kpis in-kpis">
        <div class="vd-kpi destaque"><span>${Icone('carteira')} Vendido hoje</span><b>${brl(r.hoje.faturamento)}</b><small>${variacao(r.hoje.faturamento, r.ontem.faturamento)}</small></div>
        <div class="vd-kpi"><span>${Icone('recibo')} Vendas hoje</span><b>${r.hoje.vendas}</b><small>${variacao(r.hoje.vendas, r.ontem.vendas)}</small></div>
        <div class="vd-kpi"><span>${Icone('roupa')} Peças hoje</span><b>${r.hoje.pecas}</b><small>${variacao(r.hoje.pecas, r.ontem.pecas)}</small></div>
        <div class="vd-kpi"><span>${Icone('grafico')} Ticket médio hoje</span><b>${brl(r.hoje.ticket)}</b><small>${variacao(r.hoje.ticket, r.ontem.ticket)}</small></div>
      </div>

      <div class="painel-grade">
        <div class="cartao painel-meta">
          <h3 class="titulo-ico">${Icone('estrela')} Meta do mês
            <button class="btn btn-peq btn-fantasma in-resumo" id="resumo-img" title="Resumo do mês em imagem">${Icone('imagem')} Resumo em imagem</button></h3>
          ${meta ? `
            <div class="meta-numeros"><b>${brl(r.mes.faturamento)}</b><span>de ${brl(meta)}</span></div>
            <div class="meta-barra" role="progressbar" aria-valuenow="${pctMeta}" aria-valuemin="0" aria-valuemax="100">
              <i style="width:${pctMeta}%"></i><span class="meta-marca" style="left:${Math.min(100, (esperadoHoje / meta) * 100)}%" title="Onde deveria estar hoje"></span>
            </div>
            ${r.mes.faturamento >= meta ? '<div class="meta-batida">🎉 Meta batida! Parabéns à equipe.</div>' : ''}
            <div class="meta-rodape"><span><b>${pctMeta}%</b> atingido · ${ritmo}</span>
              <span>Projeção: <b>${brl(r.mes.projecao)}</b></span></div>
            <p class="dica">Faltam ${brl(Math.max(0, meta - r.mes.faturamento))} em ${r.mes.dias - r.mes.dia + 1} dia(s)
              — cerca de <b>${brl(Math.max(0, Math.ceil((meta - r.mes.faturamento) / (r.mes.dias - r.mes.dia + 1))))}</b> por dia.</p>`
    : `<div class="meta-numeros"><b>${brl(r.mes.faturamento)}</b><span>vendido no mês</span></div>
            <p class="dica">Defina uma meta mensal em <a href="#/config?aba=vendas">Configurações → Vendas</a> para acompanhar o progresso aqui.</p>`}
        </div>

        <div class="cartao">
          <h3 class="titulo-ico">${Icone('grafico')} Vendas dos últimos 14 dias</h3>
          ${Graficos.colunas(r.ultimos14.map((d) => ({
    rotulo: d.dia.slice(8),
    valor: d.faturamento,
    destaque: d.dia === U.hoje(),
    dica: `${new Date(d.dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}: ${brl(d.faturamento)} · ${d.vendas} venda(s)`,
  })), { altura: 170 })}
        </div>

        <div class="cartao">
          <h3 class="titulo-ico">${Icone('grafico')} Mais vendidos da semana</h3>
          ${r.mais_vendidos.map((p, i) => `
            <div class="painel-item"><span class="pos">${i + 1}</span>${U.miniatura({ id: p.produto_id, foto_versao: p.foto_versao })}
              <span class="painel-item-txt"><b>${esc(p.nome)}</b><small>${p.quantidade} peça(s) · ${brl(p.total)}</small></span></div>`).join('')
    || U.vazio({ ilu: 'sacola', compacto: true, texto: 'Nenhuma venda nos últimos 7 dias.' })}
        </div>

        <div class="cartao">
          <h3 class="titulo-ico">${Icone('presente')} Aniversariantes</h3>
          ${r.aniversariantes.map((c) => {
    const link = whats(c.telefone, `Feliz aniversário, ${c.nome.split(' ')[0]}! 🎉 A Clara Styllus deseja um dia lindo. Passa aqui na loja que temos um presente para você!`);
    return `<div class="painel-item"><span class="painel-item-txt"><b>${esc(c.nome)}</b>
              <small>${c.em_dias === 0 ? '<b class="txt-rosa">hoje!</b>' : c.em_dias === 1 ? 'amanhã' : `em ${c.em_dias} dias`} · ${c.aniversario.slice(8)}/${c.aniversario.slice(5, 7)}</small></span>
              ${link ? `<a class="btn btn-peq" target="_blank" rel="noopener" href="${link}"><i data-icone="whatsapp"></i> Parabéns</a>` : ''}</div>`;
  }).join('') || U.vazio({ ilu: 'presente', compacto: true, texto: 'Ninguém faz aniversário nos próximos 7 dias.' })}
        </div>

        <div class="cartao">
          <h3 class="titulo-ico">${Icone('caderno')} Crediário</h3>
          <div class="cards cards-mini">
            <div class="card"><small>A receber</small><b>${brl(r.crediario.a_receber)}</b></div>
            <div class="card"><small>Vencido</small><b class="${r.crediario.vencido ? 'txt-perigo' : ''}">${brl(r.crediario.vencido)}</b></div>
            <div class="card"><small>Recebido hoje</small><b>${brl(r.crediario.recebido)}</b></div>
          </div>
          <h4>Vencendo hoje</h4>
          ${r.crediario.vencendo_hoje.map((c) => `<div class="painel-item"><span class="painel-item-txt"><b>${esc(c.nome)}</b><small>${brl(c.valor)}</small></span>
            ${whats(c.telefone, '') ? `<a class="btn btn-peq" target="_blank" rel="noopener" href="${whats(c.telefone, `Olá, ${c.nome.split(' ')[0]}! Aqui é da Clara Styllus. Lembrando que hoje vence sua parcela do crediário de ${brl(c.valor)}. Obrigada!`)}"><i data-icone="whatsapp"></i> Lembrar</a>` : ''}</div>`).join('')
    || U.vazio({ ilu: 'caderno', compacto: true, texto: 'Nenhuma parcela vence hoje.' })}
          <a href="#/crediario">Ver crediário completo →</a>
        </div>

        <div class="cartao">
          <h3 class="titulo-ico">${Icone('caixa')} Estoque</h3>
          ${r.estoque_baixo
    ? `<p><b class="txt-perigo">${r.estoque_baixo}</b> produto(s) no estoque mínimo ou esgotados.</p><a href="#/relatorios">Ver lista para repor →</a>`
    : '<p>Tudo certo com o estoque.</p>'}
        </div>
      </div>`;

    // Meta batida: festa uma vez por mês.
    if (meta && r.mes.faturamento >= meta) {
      const mes = U.hoje().slice(0, 7);
      if (U.local.ler('meta_festa', '') !== mes) {
        U.local.gravar('meta_festa', mes);
        setTimeout(() => {
          Animacoes.confete();
          U.som('meta');
          U.aviso('🎉 Parabéns! A meta do mês foi batida!');
        }, 500);
      }
    }
    raiz.querySelector('#resumo-img').onclick = () => ResumoMes.abrir();
    raiz.querySelector('#at-agora')?.addEventListener('click', (ev) => Atualizacao.instalar(ev.currentTarget));
  }

  return { abrir };
})();
