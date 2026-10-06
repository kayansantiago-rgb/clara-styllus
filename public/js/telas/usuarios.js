/* Cadastro de vendedores e administradores (só administrador). */
Telas.usuarios = (() => {
  const { esc, api, aviso, erro, abrirModal, fecharModal } = U;
  let raiz;
  let lista = [];

  const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <div><h1>Vendedores</h1><p class="dica">Quem usa o sistema e quanto cada pessoa vendeu este mês.</p></div>
        <div class="ferramentas"><button class="btn btn-primario" id="novo">${Icone('mais')} Novo vendedor(a)</button></div>
      </div>
      <div id="ranking"></div>
      <div class="us-grade" id="lista"></div>
      <div class="us-ajuda">
        <div>${Icone('sacola')}<span><b>Vendedor(a)</b> vende, abre e fecha o caixa, consulta vendas e clientes.</span></div>
        <div>${Icone('chave')}<span><b>Administrador(a)</b> também cadastra produtos, cancela vendas, vê relatórios e muda configurações.</span></div>
      </div>`;
    raiz.querySelector('#novo').onclick = () => formulario(null);
    raiz.querySelector('#lista').onclick = (ev) => {
      const c = ev.target.closest('[data-i]');
      if (c) formulario(lista[Number(c.dataset.i)]);
    };
    await carregar();
  }

  async function carregar() {
    if (!raiz) return;
    try {
      lista = await api('/api/usuarios');
    } catch (e) { return erro(e); }
    const maior = Math.max(1, ...lista.map((u) => u.total_mes));
    const totalLoja = lista.reduce((a, u) => a + u.total_mes, 0);
    const ativos = lista.filter((u) => u.ativo);
    const top = [...ativos].sort((a, b) => b.total_mes - a.total_mes)[0];
    const mesTxt = new Date().toLocaleDateString('pt-BR', { month: 'long' });
    raiz.querySelector('#ranking').innerHTML = `
      <div class="vd-kpis">
        <div class="vd-kpi destaque"><span>${Icone('carteira')} Vendido em ${mesTxt}</span><b>${U.brl(totalLoja)}</b><small>somando toda a equipe</small></div>
        <div class="vd-kpi"><span>${Icone('clientes')} Pessoas ativas</span><b>${ativos.length}</b><small>${lista.length - ativos.length} desativada(s)</small></div>
        <div class="vd-kpi"><span>${Icone('estrela')} Destaque do mês</span><b>${top && top.total_mes ? esc(top.nome.split(' ')[0]) : '—'}</b>
          <small>${top && top.total_mes ? `${U.brl(top.total_mes)} em ${top.vendas_mes} venda(s)` : 'nenhuma venda ainda'}</small></div>
      </div>`;
    raiz.querySelector('#lista').innerHTML = lista.map((u, i) => {
      const pct = Math.round((u.total_mes / maior) * 100);
      const eu = U.sessao.usuario.id === u.id;
      return `
      <button type="button" class="us-card ${u.ativo ? '' : 'inativo'} ${top && top.id === u.id && u.total_mes ? 'top' : ''}" data-i="${i}">
        <div class="us-cab">
          <span class="avatar us-avatar">${esc(iniciais(u.nome))}</span>
          <span class="us-nome"><b>${esc(u.nome)}${eu ? ' <small>(você)</small>' : ''}</b><small>@${esc(u.login)}</small></span>
          ${top && top.id === u.id && u.total_mes ? `<span class="us-coroa" title="Quem mais vendeu no mês">${Icone('estrela')}</span>` : ''}
        </div>
        <div class="us-selos">
          <span class="us-perfil ${u.perfil}">${u.perfil === 'admin' ? `${Icone('chave')} Administrador(a)` : `${Icone('sacola')} Vendedor(a)`}</span>
          <span class="us-situacao ${u.ativo ? 'ok' : 'off'}"><i></i>${u.ativo ? 'Ativo' : 'Desativado'}</span>
        </div>
        <div class="us-mes">
          <div><small>Vendas no mês</small><b>${u.vendas_mes}</b></div>
          <div><small>Total no mês</small><b>${U.brl(u.total_mes)}</b></div>
        </div>
        <div class="us-barra"><i style="width:${pct}%"></i></div>
        <div class="us-rodape"><span>${u.ultima_venda ? `última venda ${U.dataHora(u.ultima_venda)}` : 'sem vendas este mês'}</span>
          <span class="us-editar">${Icone('lapis')} Editar</span></div>
      </button>`;
    }).join('');
  }

  function formulario(u) {
    const novo = !u;
    u = u || { perfil: 'vendedor', ativo: 1 };
    const corpo = abrirModal(novo ? 'Novo vendedor(a)' : `Editar ${u.nome}`, `
      <form class="form" autocomplete="off">
        <label>Nome (aparece no cupom e nos relatórios)<input name="nome" required value="${esc(u.nome)}" autofocus></label>
        <label>Usuário (para entrar)<input name="login" required value="${esc(u.login)}" ${novo ? '' : 'disabled'}
          autocomplete="off" placeholder="Ex.: ana"></label>
        <label>${novo ? 'Senha' : 'Nova senha <small>(deixe vazio para não mudar)</small>'}
          ${U.campoSenha('senha', `minlength="4" ${novo ? 'required' : ''}`)}</label>
        <label>Perfil<select name="perfil">
          <option value="vendedor" ${u.perfil === 'vendedor' ? 'selected' : ''}>Vendedor(a)</option>
          <option value="admin" ${u.perfil === 'admin' ? 'selected' : ''}>Administrador(a)</option>
        </select></label>
        ${novo ? '' : `<label class="check"><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Ativo (desmarque quando a pessoa sair da loja)</label>`}
        <div class="acoes">
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button class="btn btn-primario">Salvar</button>
        </div>
      </form>`, { largura: '460px' });
    U.ligarOlhos(corpo);
    corpo.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      const d = U.dadosForm(ev.target);
      if (!novo) d.ativo = !!d.ativo;
      try {
        await api(novo ? '/api/usuarios' : `/api/usuarios/${u.id}`, { metodo: novo ? 'POST' : 'PUT', corpo: d });
        aviso(novo ? 'Vendedor(a) cadastrado(a).' : 'Dados salvos.');
        fecharModal();
        carregar();
      } catch (e) { erro(e); }
    };
  }

  return { abrir, sair: () => { raiz = null; } };
})();
