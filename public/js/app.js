/* Login, navegação entre telas, atalhos globais e status do caixa. */
(() => {
  const { esc, api, aviso, erro } = U;
  const conteudo = document.getElementById('conteudo');
  const ROTAS_ADMIN = ['inicio', 'relatorios', 'usuarios', 'config'];
  let telaAtual = null;

  // --------------------------------------------------------------- login
  async function iniciar() {
    let s;
    try {
      s = await api('/api/sessao');
    } catch (e) {
      conteudo.innerHTML = `<div class="vazio">${esc(e.message)}</div>`;
      return;
    }
    if (s.primeiro_acesso) return telaPrimeiroAcesso(s);
    if (!s.usuario) return telaLogin(s);
    entrar(s.usuario);
  }

  function entrar(usuario) {
    U.sessao.definir(usuario);
    document.body.classList.remove('deslogado');
    document.body.classList.toggle('admin', usuario.perfil === 'admin');
    document.getElementById('usuario-box').innerHTML = `
      <div><b>${esc(usuario.nome)}</b><br><small>${usuario.perfil === 'admin' ? 'Administrador(a)' : 'Vendedor(a)'}</small></div>
      <div class="usuario-acoes">
        <button class="link" id="trocar">Trocar usuário</button>
        <button class="link" id="minha-senha">Minha senha</button>
      </div>`;
    document.getElementById('trocar').onclick = sair;
    document.getElementById('minha-senha').onclick = trocarSenha;
    U.config().catch(() => {}); // carrega a configuração (som do bipe etc.)
    navegar();
  }

  async function sair() {
    try { await api('/api/logout', { metodo: 'POST' }); } catch { /* já está fora */ }
    exigirLogin();
  }

  /** Volta para a tela de login (sessão expirou, usuário desativado ou trocou de usuário). */
  function exigirLogin() {
    if (document.body.classList.contains('deslogado')) return;
    U.sessao.definir(null);
    if (telaAtual && telaAtual.sair) telaAtual.sair();
    telaAtual = null;
    U.fecharModal();
    iniciar();
  }
  window.exigirLogin = exigirLogin;

  function telaLogin(s) {
    document.body.classList.add('deslogado');
    const ultimo = U.local.ler('ultimo_login', '');
    conteudo.className = 'tela-login';
    conteudo.innerHTML = `
      <div class="centro">
        <form class="cartao cartao-estreito form login" id="f-login">
          <div class="login-marca">${esc(s.loja_nome || 'Clara Styllus')}</div>
          <p class="dica">Entre com seu usuário para vender.</p>
          <label>Usuário<input name="login" autocomplete="username" value="${esc(ultimo)}" required></label>
          <label>Senha<input name="senha" type="password" autocomplete="current-password" required></label>
          <button class="btn btn-primario btn-grande">Entrar</button>
        </form>
      </div>`;
    const form = conteudo.querySelector('form');
    (ultimo ? form.senha : form.login).focus();
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        const r = await api('/api/login', { metodo: 'POST', corpo: U.dadosForm(form) });
        U.local.gravar('ultimo_login', r.usuario.login);
        entrar(r.usuario);
      } catch (e) {
        erro(e);
        form.senha.value = '';
        form.senha.focus();
      }
    };
  }

  function telaPrimeiroAcesso(s) {
    document.body.classList.add('deslogado');
    conteudo.className = 'tela-login';
    conteudo.innerHTML = `
      <div class="centro">
        <form class="cartao cartao-estreito form login" id="f-primeiro">
          <div class="login-marca">${esc(s.loja_nome || 'Clara Styllus')}</div>
          <h2>Bem-vinda! Crie o usuário administrador</h2>
          <p class="dica">O administrador cadastra os vendedores, produtos, vê relatórios e muda configurações.</p>
          <label>Nome<input name="nome" required autofocus placeholder="Ex.: Clara"></label>
          <label>Usuário (para entrar)<input name="login" required autocomplete="username" placeholder="Ex.: clara"></label>
          <label>Senha<input name="senha" type="password" minlength="4" required autocomplete="new-password"></label>
          <label>Repita a senha<input name="senha2" type="password" minlength="4" required autocomplete="new-password"></label>
          <button class="btn btn-primario btn-grande">Criar e entrar</button>
        </form>
      </div>`;
    const form = conteudo.querySelector('form');
    form.nome.focus();
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const d = U.dadosForm(form);
      if (d.senha !== d.senha2) return aviso('As senhas não conferem.', 'erro');
      try {
        const r = await api('/api/primeiro-acesso', { metodo: 'POST', corpo: d });
        U.local.gravar('ultimo_login', r.usuario.login);
        aviso('Administrador criado. Cadastre os vendedores em “Vendedores”.');
        entrar(r.usuario);
      } catch (e) { erro(e); }
    };
  }

  function trocarSenha() {
    const corpo = U.abrirModal('Minha senha', `
      <form class="form">
        <label>Senha atual<input name="senha_atual" type="password" required autofocus autocomplete="current-password"></label>
        <label>Nova senha<input name="nova_senha" type="password" minlength="4" required autocomplete="new-password"></label>
        <label>Repita a nova senha<input name="nova2" type="password" minlength="4" required autocomplete="new-password"></label>
        <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">Salvar</button></div>
      </form>`, { largura: '420px' });
    corpo.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      const d = U.dadosForm(ev.target);
      if (d.nova_senha !== d.nova2) return aviso('As senhas não conferem.', 'erro');
      try {
        await api('/api/minha-senha', { metodo: 'POST', corpo: d });
        U.fecharModal();
        aviso('Senha alterada.');
      } catch (e) { erro(e); }
    };
  }

  // ------------------------------------------------------------ navegação
  async function navegar() {
    if (!U.sessao.usuario) return;
    // Sem rota escolhida: administrador abre no painel, vendedor direto no caixa.
    let nome = (location.hash.replace(/^#\/?/, '').split('?')[0] || (U.sessao.ehAdmin() ? 'inicio' : 'pdv'));
    if (!Telas[nome] || (ROTAS_ADMIN.includes(nome) && !U.sessao.ehAdmin())) nome = 'pdv';
    const tela = Telas[nome];
    if (telaAtual && telaAtual.sair) telaAtual.sair();
    telaAtual = tela;
    U.fecharModal();
    document.querySelectorAll('.menu a').forEach((a) =>
      a.classList.toggle('ativo', a.dataset.rota === nome));
    conteudo.innerHTML = '';
    conteudo.className = `tela-${nome}`;
    // No PDV o menu fica estreito (só ícones) para sobrar espaço para a venda.
    document.body.classList.toggle('modo-pdv', nome === 'pdv');
    try {
      await tela.abrir(conteudo);
    } catch (e) {
      if (e.status !== 401) {
        conteudo.innerHTML = `<div class="vazio">Não foi possível abrir a tela: ${esc(e.message)}</div>`;
      }
    }
    atualizarStatusCaixa();
  }

  async function atualizarStatusCaixa() {
    const el = document.getElementById('status-caixa');
    try {
      const r = await api('/api/caixa/atual');
      el.innerHTML = r.caixa
        ? `<span class="ponto ok"></span><span class="status-txt">Caixa nº ${r.caixa.id} aberto<br><small>${esc(r.caixa.operador || '')} · clique para fechar</small></span>`
        : '<span class="ponto"></span><span class="status-txt">Caixa fechado<br><small>clique para abrir</small></span>';
    } catch (e) {
      if (e.status !== 401) el.innerHTML = '<span class="ponto erro"></span>Servidor desligado';
    }
  }
  window.atualizarStatusCaixa = atualizarStatusCaixa;

  document.addEventListener('keydown', (ev) => {
    if (!U.sessao.usuario) return;
    if (ev.key === 'Escape' && U.modalAberto()) {
      ev.preventDefault();
      U.fecharModal();
      return;
    }
    if (ev.key === 'F1') {
      ev.preventDefault();
      location.hash = '#/pdv';
      return;
    }
    if (telaAtual && telaAtual.tecla) telaAtual.tecla(ev);
  });

  window.addEventListener('hashchange', navegar);
  iniciar();
})();
