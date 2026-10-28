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


  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

  /** A loja em poucas frases, em português simples (o que mudou, o que vende, o que precisa de atenção). */
  function frases(x) {
    const out = [];
    const s = x.semana;
    const a = x.anterior;
    if (!s.vendas) {
      out.push(['sacola', a.vendas ? `Ainda não teve venda nos últimos 7 dias (na semana anterior foram ${brl(a.faturamento)}).`
        : 'Ainda não tem vendas para comparar. Assim que a loja vender, o resumo aparece aqui.']);
    } else {
      if (a.faturamento) {
        const pct = Math.round(((s.faturamento - a.faturamento) / a.faturamento) * 100);
        out.push(['grafico', pct >= 5 ? `Nos últimos 7 dias você vendeu <b>${pct}% a mais</b> que na semana anterior: ${brl(s.faturamento)} contra ${brl(a.faturamento)}.`
          : pct <= -5 ? `Nos últimos 7 dias as vendas ficaram <b>${-pct}% abaixo</b> da semana anterior (${brl(s.faturamento)} contra ${brl(a.faturamento)}). Que tal um <a href="#/produtos">catálogo no Instagram</a> ou uma liquidação?`
            : `As vendas dos últimos 7 dias estão parecidas com as da semana anterior: <b>${brl(s.faturamento)}</b>.`]);
      } else {
        out.push(['grafico', `Nos últimos 7 dias a loja vendeu <b>${brl(s.faturamento)}</b> em ${s.vendas} venda(s) e ${s.pecas} peça(s).`]);
      }
      if (x.top) out.push(['roupa', `A peça que mais saiu foi <b>${esc(x.top.nome)}</b> (${x.top.quantidade} ${x.top.quantidade === 1 ? 'peça' : 'peças'}).`]);
      const total = x.formas.reduce((t, f) => t + f.valor, 0);
      if (total && x.formas[0]) {
        const f = x.formas[0];
        const pct = Math.round((f.valor / total) * 100);
        out.push(['cartao', `<b>${esc(U.FORMAS[f.forma] || f.forma)}</b> foi a forma de pagamento mais usada: ${pct >= 50 ? 'mais da metade' : `${pct}%`} do que entrou.`]);
      }
      if (a.ticket && s.ticket) {
        const pct = Math.round(((s.ticket - a.ticket) / a.ticket) * 100);
        if (Math.abs(pct) >= 10) out.push(['recibo', `Cada cliente está gastando em média <b>${brl(s.ticket)}</b> por compra, ${pct > 0 ? `${pct}% a mais` : `${-pct}% a menos`} que na semana anterior.`]);
      }
      if (x.dia_semana && x.hora) {
        out.push(['relogio', `O melhor dia da loja costuma ser <b>${DIAS[x.dia_semana.d]}</b>, e o movimento é maior por volta das <b>${x.hora.h}h</b>.`]);
      }
    }
    if (x.atrasado.clientes) {
      out.push(['caderno', `<b>${x.atrasado.clientes} ${x.atrasado.clientes === 1 ? 'cliente está' : 'clientes estão'}</b> com o crediário atrasado (${brl(x.atrasado.valor)}). <a href="#/crediario?aba=cobrar">Cobrar agora</a>`, 'alerta']);
    } else {
      out.push(['check', 'Ninguém está com o crediário atrasado.', 'ok']);
    }
    if (x.repor) out.push(['caixa', `<b>${x.repor} ${x.repor === 1 ? 'peça está' : 'peças estão'}</b> acabando ou esgotaram. <a href="#/produtos">Ver o que repor</a>`, 'alerta']);
    return out;
  }

  // Uma frase por dia, para começar o expediente.
  const FRASES = [
    'Cada cliente que entra é uma história nova. Capriche no atendimento!',
    'Vitrine arrumada vende sozinha.',
    'Sorriso no rosto e peça certa na mão: venda feita.',
    'Hoje é um ótimo dia para bater a meta.',
    'Quem lembra do nome da cliente, ganha a cliente.',
    'Uma mensagem no WhatsApp pode virar a venda do dia.',
    'Moda é sobre como a cliente se sente. Ajude ela a se sentir linda.',
    'Peça parada é dinheiro parado: que tal uma promoção?',
    'Atendimento bom faz a cliente voltar. Atendimento ótimo faz ela trazer as amigas.',
    'Pequenas vendas somadas fazem um grande mês.',
    'Ofereça um acessório: completa o look e o ticket.',
    'Cliente satisfeita é a melhor propaganda da loja.',
    'Organização hoje, tranquilidade no fechamento do caixa.',
    'Novidade chegou? Avise quem estava esperando!',
    'Cada “não” deixa você mais perto do próximo “sim”.',
    'Faça cada cliente sair mais feliz do que entrou.',
    'Provador cheio é sinal de venda chegando.',
    'Seu jeito de atender é o que a cliente vai lembrar.',
    'Um bom dia começa com o caixa aberto e a loja cheirosa.',
    'Sugira o tamanho certo: confiança vende mais que desconto.',
    'Hoje é dia de fazer alguém se sentir especial.',
  ];
  const fraseDoDia = () => {
    const d = new Date();
    const dia = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
    return FRASES[dia % FRASES.length];
  };

  async function abrir(raiz) {
    const resumoP = api('/api/painel/resumo').catch(() => null);
    const [r, bk, conds, at, esp, res] = await Promise.all([
      api('/api/painel'), api('/api/backup/status').catch(() => null), api('/api/condicionais').catch(() => []),
      api('/api/atualizacao').catch(() => null), api('/api/espera/resumo').catch(() => null), api('/api/reservas').catch(() => []),
    ]);
    const cob = await api('/api/crediario/cobrar').catch(() => null);
    const resVencidas = res.filter((x) => x.prazo < U.hoje());
    const condAtrasadas = conds.filter((c) => c.prazo < U.hoje());
    const semBackup = bk && (bk.horas_desde_ultimo == null || bk.horas_desde_ultimo > 72);
    const nome = (U.sessao.usuario.nome || '').split(' ')[0];
    const hojeTxt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const meta = r.mes.meta;
    const pctMeta = meta ? Math.min(100, Math.round((r.mes.faturamento / meta) * 100)) : 0;
    const esperadoHoje = meta ? Math.round((meta / r.mes.dias) * r.mes.dia) : 0;
    const ritmo = meta ? (r.mes.faturamento >= esperadoHoje ? 'no ritmo' : 'abaixo do ritmo') : '';

    const resumo = await resumoP;
    raiz.innerHTML = `
      <section class="in2-hero">
        <div class="in2-hero-txt">
          <small class="in2-data">${hojeTxt.charAt(0).toUpperCase() + hojeTxt.slice(1)}</small>
          <h1>${saudacao()}, ${esc(nome)}!</h1>
          <p class="in3-frase">“${esc(fraseDoDia())}”</p>
          <div class="in2-resumo" id="in-resumo">
            <b class="in2-resumo-tit">${Icone('estrela')} Como está a loja</b>
            <ul>${resumo ? frases(resumo).map(([ico, t, tipo]) => `<li class="${tipo || ''}">${Icone(ico)}<span>${t}</span></li>`).join('') : '<li>Não consegui montar o resumo agora.</li>'}</ul>
          </div>
        </div>
        <div class="in2-hoje">
          <small>Vendido hoje</small>
          <b class="in2-hoje-valor">${brl(r.hoje.faturamento)}</b>
          <span class="in2-hoje-var">${variacao(r.hoje.faturamento, r.ontem.faturamento)}</span>
          <div class="in2-hoje-mini">
            <span><b>${r.hoje.vendas}</b><small>vendas</small></span>
            <span><b>${r.hoje.pecas}</b><small>peças</small></span>
            <span><b>${brl(r.hoje.ticket)}</b><small>ticket médio</small></span>
          </div>
          ${r.hoje.taxas ? `<small class="in2-hoje-liq">Cai na conta ${brl(r.hoje.liquido)}</small>` : ''}
          <a class="btn in2-vender" href="#/pdv">${Icone('sacola')} Abrir o caixa</a>
        </div>
      </section>
      <div class="in2-alertas">

      ${at && at.disponivel ? `<div class="pdv-alerta ok painel-alerta at-aviso"><i data-icone="nuvem"></i>
        <span>Nova versão <b>${esc(at.disponivel.versao)}</b> do sistema disponível (você está na ${esc(at.versao_atual)}).</span>
        <button class="btn btn-peq btn-primario" id="at-agora">Atualizar agora</button> <a href="#/config?aba=atualizacao">detalhes</a></div>` : ''}
      ${cob && cob.pendentes ? `<div class="pdv-alerta alerta painel-alerta"><i data-icone="whatsapp"></i> Hoje tem <b>&nbsp;${cob.pendentes} cliente(s)&nbsp;</b> para cobrar no crediário.
        <a class="link" href="#/crediario?aba=cobrar">Cobrar agora →</a></div>` : ''}
      ${esp && esp.chegaram ? `<div class="pdv-alerta ok painel-alerta"><i data-icone="sino"></i> Chegaram ${esp.chegaram} peça(s) da lista de espera
        (${esp.nomes.map(esc).join(', ')}${esp.chegaram > 3 ? '…' : ''}). <a href="#/espera">Avisar as clientes →</a></div>` : ''}
      ${resVencidas.length ? `<div class="pdv-alerta alerta painel-alerta"><i data-icone="reserva"></i> ${resVencidas.length} reserva(s) passaram do prazo de retirada:
        ${resVencidas.slice(0, 3).map((x) => esc(x.cliente_nome)).join(', ')}${resVencidas.length > 3 ? '…' : ''}. <a href="#/reservas">Ver reservas →</a></div>` : ''}
      ${condAtrasadas.length ? `<div class="pdv-alerta alerta painel-alerta"><i data-icone="bolsa"></i> ${condAtrasadas.length} condicional(is) passou do prazo de devolução:
        ${condAtrasadas.slice(0, 3).map((c) => esc(c.cliente_nome)).join(', ')}${condAtrasadas.length > 3 ? '…' : ''}. <a href="#/condicional">Ver condicionais →</a></div>` : ''}
      ${semBackup ? `<div class="pdv-alerta perigo painel-alerta"><i data-icone="nuvem"></i> ${bk.ultimo ? `O último backup foi há ${Math.round(bk.horas_desde_ultimo / 24)} dia(s).` : 'Nenhum backup foi feito ainda.'}
        Se o computador der defeito, os dados podem se perder. <a href="#/config?aba=backup">Fazer backup agora →</a></div>`
    : bk && bk.ultimo_erro ? `<div class="pdv-alerta alerta painel-alerta"><i data-icone="nuvem"></i> ${esc(bk.ultimo_erro)}</div>` : ''}
      </div>
      <div class="in-atalhos in2-atalhos in3-atalhos">
        <a class="in-atalho" href="#/pdv">${Icone('sacola')}<b>Vender</b><small>abrir o caixa</small></a>
        <a class="in-atalho" href="#/produtos">${Icone('roupa')}<b>Produtos</b><small>cadastrar e estoque</small></a>
        <a class="in-atalho" href="#/etiquetas">${Icone('etiqueta')}<b>Etiquetas</b><small>imprimir</small></a>
        <a class="in-atalho" href="#/vendas">${Icone('recibo')}<b>Vendas</b><small>histórico e trocas</small></a>
        <a class="in-atalho" href="#/clientes">${Icone('clientes')}<b>Clientes</b><small>fichas e WhatsApp</small></a>
        <a class="in-atalho" href="#/relatorios">${Icone('grafico')}<b>Relatórios</b><small>lucro e gráficos</small></a>
      </div>
      <div class="painel-grade in2-grade">
        <div class="cartao painel-meta">
          <h3 class="titulo-ico">${Icone('estrela')} Meta do mês
            <button class="btn btn-peq btn-fantasma in-resumo" id="resumo-img" title="Resumo do mês em imagem">${Icone('imagem')} Resumo em imagem</button></h3>
          ${meta ? `
            <div class="meta-numeros"><b>${brl(r.mes.faturamento)}</b><span>de ${brl(meta)}</span></div>
            <div class="meta-barra" role="progressbar" aria-valuenow="${pctMeta}" aria-valuemin="0" aria-valuemax="100">
              <i style="width:${pctMeta}%"></i><span class="meta-marca" style="left:${Math.min(100, (esperadoHoje / meta) * 100)}%" title="Onde deveria estar hoje"></span>
            </div>
            ${r.mes.faturamento >= meta ? `<div class="meta-batida">${Icone('check')} Meta batida! Parabéns à equipe.</div>` : ''}
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
            <div class="painel-item in3-top"><span class="pos rl-pos rl-pos-${i + 1}">${i + 1}º</span>${U.miniatura({ id: p.produto_id, foto_versao: p.foto_versao }, 'in3-top-foto')}
              <span class="painel-item-txt"><b>${esc(p.nome)}</b><small>${p.quantidade} peça(s) · ${brl(p.total)}</small></span></div>`).join('')
    || U.vazio({ ilu: 'sacola', compacto: true, texto: 'Nenhuma venda nos últimos 7 dias.' })}
        </div>

        <div class="cartao">
          <h3 class="titulo-ico">${Icone('presente')} Aniversariantes</h3>
          ${r.aniversariantes.map((c) => {
    const link = Zap.attrs(c.telefone, 'aniversario', { nome: c.nome });
    return `<div class="painel-item in3-niver ${c.em_dias === 0 ? 'hoje' : ''}">${U.avatarCliente(c.id, c.nome, c.foto_versao)}<span class="painel-item-txt"><b>${esc(c.nome)}</b>
              <small>${c.em_dias === 0 ? '<b class="txt-rosa">hoje!</b>' : c.em_dias === 1 ? 'amanhã' : `em ${c.em_dias} dias`} · ${c.aniversario.slice(8)}/${c.aniversario.slice(5, 7)}</small></span>
              ${link ? `<a class="btn btn-peq" ${link}><i data-icone="whatsapp"></i> Parabéns</a>` : ''}</div>`;
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
          ${r.crediario.vencendo_hoje.map((c) => `<div class="painel-item">${U.avatarCliente(c.id, c.nome, c.foto_versao)}<span class="painel-item-txt"><b>${esc(c.nome)}</b><small>${brl(c.valor)}</small></span>
            ${Zap.attrs(c.telefone, 'parcela_hoje', { nome: c.nome, valor: brl(c.valor) }) ? `<a class="btn btn-peq" ${Zap.attrs(c.telefone, 'parcela_hoje', { nome: c.nome, valor: brl(c.valor) })}><i data-icone="whatsapp"></i> Lembrar</a>` : ''}</div>`).join('')
    || U.vazio({ ilu: 'caderno', compacto: true, texto: 'Nenhuma parcela vence hoje.' })}
          <a href="#/crediario">Ver crediário completo →</a>
        </div>

        <div class="cartao">
          <h3 class="titulo-ico">${Icone('caixa')} Estoque</h3>
          ${r.estoque_baixo
    ? `<div class="in3-estoque alerta"><b>${r.estoque_baixo}</b><span>produto(s) no estoque mínimo ou esgotados</span></div><a href="#/relatorios">Ver lista para repor →</a>`
    : `<div class="in3-estoque ok">${Icone('check')}<span>Tudo certo com o estoque.</span></div>`}
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
          U.aviso('Parabéns! A meta do mês foi batida.');
        }, 500);
      }
    }
    raiz.querySelector('#resumo-img').onclick = () => ResumoMes.abrir();
    raiz.querySelector('#at-agora')?.addEventListener('click', (ev) => Atualizacao.instalar(ev.currentTarget));
  }

  return { abrir };
})();
