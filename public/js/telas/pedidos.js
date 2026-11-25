/* Pedidos online: o que as clientes pediram pelo site. Cada pedido já separa as peças numa reserva. */
Telas.pedidos = (() => {
  const { esc, brl, api, aviso, erro, dataHora } = U;
  let raiz;
  let filtro = 'abertos';
  let dados = null;
  let recemChegados = new Set(); // destacados nesta visita (o "novo" é marcado como visto ao abrir a tela)
  let nomeLoja = 'Clara Styllus';

  const SITUACAO = {
    novo: ['Novo', 'novo'], separado: ['Peças separadas', 'separado'], sem_estoque: ['Sem estoque', 'sem'],
    concluido: ['Concluído', 'ok'], cancelado: ['Cancelado', 'cancelado'],
  };
  const FILTROS = [['abertos', 'Em aberto', (p) => ['novo', 'separado', 'sem_estoque'].includes(p.situacao)],
    ['concluidos', 'Concluídos', (p) => p.situacao === 'concluido'], ['cancelados', 'Cancelados', (p) => p.situacao === 'cancelado']];

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Pedidos online</h1><p class="subtitulo">O que as clientes pedem pelo site da loja. As peças já ficam separadas como reserva.</p></div>
        <div class="ferramentas">
          <button class="btn" id="po-site">${Icone('nuvem')} Site da loja</button>
          <button class="btn btn-primario" id="po-buscar">${Icone('troca')} Buscar pedidos agora</button>
        </div>
      </div>
      <div id="po-estado"></div>
      <div class="segmentos po-filtros" id="po-filtros"></div>
      <div class="po-lista" id="po-lista">${U.esqueleto(4)}</div>`;
    raiz.querySelector('#po-site').onclick = () => Catalogo.site();
    raiz.querySelector('#po-buscar').onclick = () => buscar(true);
    raiz.querySelector('#po-filtros').onclick = (ev) => {
      const b = ev.target.closest('[data-f]');
      if (!b) return;
      filtro = b.dataset.f;
      desenhar();
    };
    raiz.querySelector('#po-lista').onclick = acao;
    await carregar();
    if (dados && dados.configurado) buscar(false);
  }

  async function carregar() {
    try {
      dados = await api('/api/pedidos-site');
      nomeLoja = (await U.config()).loja_nome || nomeLoja;
    } catch (e) { return erro(e); }
    if (!raiz) return;
    // Os novos ficam destacados nesta visita e deixam de contar na bolinha do menu.
    for (const p of dados.pedidos.filter((x) => x.status === 'novo')) {
      recemChegados.add(p.codigo);
      api(`/api/pedidos-site/${encodeURIComponent(p.codigo)}/visto`, { metodo: 'POST' }).catch(() => {});
    }
    desenhar();
    window.atualizarBolinhaEspera && window.atualizarBolinhaEspera();
  }

  async function buscar(manual) {
    const b = raiz && raiz.querySelector('#po-buscar');
    if (b) { b.disabled = true; b.innerHTML = `${Icone('troca')} Buscando…`; }
    try {
      const r = await api('/api/pedidos-site/sincronizar', { metodo: 'POST' });
      if (manual) aviso(r.novos.length ? `${r.novos.length} pedido(s) novo(s) chegaram!` : 'Nenhum pedido novo.');
      await carregar();
    } catch (e) {
      if (manual) erro(e);
      await carregar();
    } finally {
      if (b && b.isConnected) { b.disabled = false; b.innerHTML = `${Icone('troca')} Buscar pedidos agora`; }
    }
  }

  function desenhar() {
    if (!raiz || !dados) return;
    const est = raiz.querySelector('#po-estado');
    if (!dados.configurado) {
      est.innerHTML = configHtml();
      ligarConfig(est);
    } else {
      const quando = dados.ultima_busca ? new Date(dados.ultima_busca.replace(' ', 'T')).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
      est.innerHTML = `<div class="po-status ${dados.erro ? 'erro' : ''}">
        <span class="ponto ${dados.erro ? 'erro' : 'ok'}"></span>
        <span>${dados.erro ? `<b>Não consegui buscar os pedidos:</b> ${esc(dados.erro)}` : `Recebendo pedidos do site · última busca às <b>${quando}</b> · o sistema confere sozinho de 2 em 2 minutos`}</span>
        ${U.sessao.ehAdmin() ? '<button class="link" id="po-reconfig">mudar a caixa de pedidos</button>' : ''}</div>`;
      const rc = est.querySelector('#po-reconfig');
      if (rc) rc.onclick = () => { est.innerHTML = configHtml(true); ligarConfig(est); };
    }
    raiz.querySelector('#po-filtros').innerHTML = FILTROS.map(([k, t, f]) => {
      const n = dados.pedidos.filter(f).length;
      return `<button class="segmento ${k === filtro ? 'sel' : ''}" data-f="${k}">${t}${n ? ` <span class="es-n">${n}</span>` : ''}</button>`;
    }).join('');
    const lista = dados.pedidos.filter(FILTROS.find((x) => x[0] === filtro)[2]);
    raiz.querySelector('#po-lista').innerHTML = lista.map(cartao).join('') || U.vazio({
      ilu: 'sacola',
      titulo: filtro === 'abertos' ? 'Nenhum pedido em aberto' : 'Nada por aqui',
      texto: dados.configurado ? 'Quando uma cliente finalizar a sacola no site, o pedido aparece aqui sozinho.' : 'Ligue a caixa de pedidos acima para receber os pedidos do site.',
    });
  }

  function cartao(p) {
    const [rotulo, classe] = SITUACAO[p.situacao] || SITUACAO.novo;
    const novo = recemChegados.has(p.codigo) && ['novo', 'separado', 'sem_estoque'].includes(p.situacao);
    const quando = p.recebido_em ? new Date(p.recebido_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const aberto = ['novo', 'separado', 'sem_estoque'].includes(p.situacao);
    const separadas = p.itens.filter((i) => i.separadas).map((i) => `${i.separadas > 1 ? `${i.separadas}× ` : ''}${i.descricao}`);
    const msg = `Oi, ${String(p.nome || '').split(' ')[0]}! Aqui é da ${nomeLoja} 💕 Recebemos seu pedido nº ${p.codigo} pelo site.`
      + (separadas.length ? ` Já separamos: ${separadas.join(', ')}${p.total ? ` (total ${brl(p.total)})` : ''}.` : '')
      + (p.faltou ? ` Infelizmente acabou: ${p.faltou}.` : '')
      + ' Como você prefere pagar e retirar?';
    const tel = String(p.telefone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    const linkZap = tel.length >= 10 ? `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}` : null;
    return `<article class="po-card po-${classe} ${novo ? 'chegou' : ''}" data-codigo="${esc(p.codigo)}">
      ${novo ? `<span class="po-fita">${Icone('sino')} Pedido novo!</span>` : ''}
      <header class="po-cab">
        ${U.avatarCliente(p.cliente_id, p.nome, p.cliente_foto)}
        <div class="po-quem"><b>${esc(p.nome || 'Cliente do site')}</b><small>${esc(p.telefone || 'sem telefone')} · ${quando}</small></div>
        <div class="po-num"><small>Pedido</small><b>${esc(p.codigo)}</b></div>
      </header>
      <div class="po-itens">${p.itens.map((i) => `<div class="po-item ${i.separadas < i.quantidade ? 'faltou' : ''}">
        ${U.miniatura({ id: i.produto_id, foto_versao: i.foto_versao }, 'po-foto')}
        <span><b>${esc(i.descricao)}</b><small>${i.separadas < i.quantidade ? (i.separadas ? `só ${i.separadas} de ${i.quantidade} separada(s)` : 'acabou no estoque') : `${i.quantidade > 1 ? `${i.quantidade}× · ` : ''}separada`}</small></span>
        ${i.preco ? `<em>${brl(i.preco * Math.max(1, i.separadas || i.quantidade))}</em>` : ''}</div>`).join('')}</div>
      ${p.observacao ? `<p class="po-obs">“${esc(p.observacao)}”</p>` : ''}
      <footer class="po-pe">
        <span class="po-sit ${classe}">${rotulo}</span>
        ${p.reserva_id && aberto ? `<small>reserva nº ${p.reserva_id}${p.reserva_prazo ? ` · até ${p.reserva_prazo.split('-').reverse().join('/')}` : ''}</small>` : ''}
        <b class="po-total">${brl(p.total)}</b>
      </footer>
      ${aberto ? `<div class="po-acoes">
        ${linkZap ? `<a class="btn cl-btn-zap" href="${linkZap}" target="_blank" rel="noopener" data-zap-direto>${Icone('whatsapp')} Confirmar no WhatsApp</a>` : ''}
        ${p.reserva_id ? `<button class="btn btn-primario" data-acao="caixa">${Icone('sacola')} Passar no caixa</button>` : ''}
        <button class="btn btn-fantasma btn-perigo-claro" data-acao="cancelar">${Icone('fechar')} Cancelar</button>
      </div>` : ''}
    </article>`;
  }

  async function acao(ev) {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const p = dados.pedidos.find((x) => x.codigo === b.closest('[data-codigo]').dataset.codigo);
    if (!p) return;
    if (b.dataset.acao === 'cancelar') {
      const ok = await U.confirmar(`Cancelar o pedido ${p.codigo}?`, p.reserva_id ? 'As peças separadas voltam para o estoque.' : 'O pedido sai da lista de abertos.', { ok: 'Cancelar pedido', perigo: true });
      if (!ok) return;
      try {
        await api(`/api/pedidos-site/${encodeURIComponent(p.codigo)}/cancelar`, { metodo: 'POST' });
        aviso('Pedido cancelado. As peças voltaram para o estoque.');
        carregar();
      } catch (e) { erro(e); }
    }
    if (b.dataset.acao === 'caixa') {
      try {
        const r = await api(`/api/reservas/${p.reserva_id}`);
        await Telas.reservas.retirar(r);
      } catch (e) { erro(e); }
    }
  }

  // ----------------------------------------------- ligar a caixa de pedidos (Google Apps Script)
  function configHtml(mudando = false) {
    if (!U.sessao.ehAdmin()) {
      return `<div class="po-config"><p>${Icone('alerta')} A administradora precisa ligar a caixa de pedidos (é rápido e grátis).</p></div>`;
    }
    return `<div class="po-config">
      <div class="po-config-cab"><span class="po-config-ico">${Icone('caixa')}</span>
        <div><h3>${mudando ? 'Mudar a caixa de pedidos' : 'Ligar os pedidos do site'}</h3>
        <p>Os pedidos ficam guardados numa planilha <b>só sua</b> no Google Drive, e o sistema busca de 2 em 2 minutos. Grátis, uma vez só, uns 5 minutos.</p></div></div>
      <ol class="po-passos">
        <li>Abra <b>script.google.com</b> (com o Google da loja) e clique em <b>Novo projeto</b>.</li>
        <li>Apague o que estiver escrito, clique em <b>Copiar código</b> aqui embaixo e cole lá. Clique no disquete para salvar.
          <div class="po-codigo"><button type="button" class="btn btn-claro btn-peq" id="po-copiar">${Icone('recibo')} Copiar código</button><small>(já vem com a chave secreta da sua loja)</small></div></li>
        <li>Clique em <b>Implantar → Nova implantação</b>, na engrenagem escolha <b>App da Web</b>. Em "Executar como" deixe <b>Eu</b>, e em "Quem pode acessar" escolha <b>Qualquer pessoa</b>. Clique em <b>Implantar</b> e autorize com a sua conta (em "app não verificado": <b>Avançado → Acessar</b>).</li>
        <li>Copie o <b>URL do app da Web</b> (termina com <code>/exec</code>), cole aqui e clique em <b>Ligar</b>:</li>
      </ol>
      <div class="po-url"><input id="po-url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"><button type="button" class="btn btn-primario" id="po-ligar">${Icone('check')} Ligar</button></div>
      <p class="dica">Depois de ligar, clique em <b>Site da loja → Atualizar o site</b> para o botão "Finalizar reserva" aparecer no site.</p>
    </div>`;
  }

  function ligarConfig(el) {
    const c = el.querySelector('#po-copiar');
    if (!c) return;
    c.onclick = async () => {
      try {
        const r = await api('/api/pedidos-site/script');
        await navigator.clipboard.writeText(r.codigo);
        aviso('Código copiado. Cole no script.google.com com Ctrl+V.');
      } catch (e) { erro(e); }
    };
    el.querySelector('#po-ligar').onclick = async () => {
      const url = el.querySelector('#po-url').value.trim();
      if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) return aviso('Cole o URL do app da Web (começa com https://script.google.com/…).', 'alerta');
      try {
        await api('/api/config', { metodo: 'PUT', corpo: { pedidos_url: url } });
        U.config(true).catch(() => {});
        await api('/api/pedidos-site/sincronizar', { metodo: 'POST' });
        aviso('Caixa de pedidos ligada! Agora atualize o site da loja.');
        U.avisoAcao('Atualize o site para mostrar o botão "Finalizar reserva".', 'Site da loja', () => Catalogo.site());
        carregar();
      } catch (e) {
        erro(e);
        carregar();
      }
    };
  }

  return { abrir, sair: () => { raiz = null; recemChegados = new Set(); } };
})();
