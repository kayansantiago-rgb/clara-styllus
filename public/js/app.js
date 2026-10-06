/* Login, navegação entre telas, atalhos globais e status do caixa. */
(() => {
  const { esc, api, aviso, erro } = U;
  const conteudo = document.getElementById('conteudo');
  const ROTAS_ADMIN = ['inicio', 'relatorios', 'usuarios', 'config', 'historico', 'boas-vindas'];
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

  const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  function entrar(usuario) {
    U.sessao.definir(usuario);
    pararRelogioLogin();
    document.body.classList.remove('deslogado');
    document.body.classList.toggle('admin', usuario.perfil === 'admin');
    document.getElementById('usuario-box').innerHTML = `
      <span class="avatar" title="${esc(usuario.nome)}">${esc(iniciais(usuario.nome))}</span>
      <span class="usuario-txt"><b>${esc(usuario.nome)}</b><small>${usuario.perfil === 'admin' ? 'Administrador(a)' : 'Vendedor(a)'}</small></span>
      <span class="usuario-acoes">
        <button class="btn-ico" id="minha-senha" title="Trocar minha senha">${Icone('chave')}</button>
        <button class="btn-ico perigo" id="trocar" title="Sair / trocar usuário">${Icone('sair')}</button>
      </span>`;
    document.getElementById('trocar').onclick = sair;
    document.getElementById('minha-senha').onclick = trocarSenha;
    U.config().then((cfg) => {
      // Primeira vez do administrador: abre o assistente de boas-vindas.
      if (usuario.perfil === 'admin' && cfg.boas_vindas_ok !== '1') location.hash = '#/boas-vindas';
    }).catch(() => {}).finally(navegar);
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

  /**
   * Campo de senha que o navegador NÃO oferece para salvar: é um campo de texto com os
   * caracteres mascarados por CSS (o gerenciador de senhas só age em type="password").
   */
  const campoSenha = (nome, attrs = '') => `
    <div class="campo-ico">${Icone('cadeado')}
      <input name="${nome}" class="campo-senha" type="text" autocomplete="off" autocapitalize="off"
        spellcheck="false" data-lpignore="true" data-form-type="other" ${attrs}>
      <button type="button" class="olho" tabindex="-1" title="Mostrar / esconder">${Icone('olho')}</button>
    </div>`;

  function ligarOlhos(raiz) {
    raiz.querySelectorAll('.olho').forEach((b) => {
      b.onclick = () => {
        const inp = b.parentElement.querySelector('input');
        const mostrar = inp.classList.toggle('mostrar');
        b.innerHTML = Icone(mostrar ? 'olhoFechado' : 'olho');
        inp.focus();
      };
    });
  }
  U.campoSenha = (nome, attrs) => campoSenha(nome, attrs);
  U.ligarOlhos = ligarOlhos;

  let relogioLogin = null;
  const pararRelogioLogin = () => { clearInterval(relogioLogin); relogioLogin = null; };

  function moldeLogin(s, formulario) {
    pararRelogioLogin();
    document.body.classList.add('deslogado');
    conteudo.className = 'tela-login';
    conteudo.innerHTML = `
      <div class="login-tela">
        <section class="login-arte">
          <span class="marca-logo">CS</span>
          <div class="login-arte-meio">
            <h1>${esc(s.loja_nome || 'Clara Styllus')}</h1>
            <p>Ponto de venda da loja: vendas, estoque, crediário e caixa no mesmo lugar.</p>
          </div>
          <div class="login-relogio" id="login-relogio"></div>
        </section>
        <section class="login-lado">${formulario}</section>
      </div>`;
    const rel = conteudo.querySelector('#login-relogio');
    const tic = () => {
      const d = new Date();
      rel.innerHTML = `<b>${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b>
        <span>${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>`;
    };
    tic();
    relogioLogin = setInterval(tic, 10000);
    ligarOlhos(conteudo);
    return conteudo.querySelector('form');
  }

  function telaLogin(s) {
    const ultimo = U.local.ler('ultimo_login', '');
    const form = moldeLogin(s, `
      <form class="login" id="f-login" autocomplete="off">
        <div>
          <h2>Entrar</h2>
          <p class="dica">Use o seu usuário e senha para abrir o caixa.</p>
        </div>
        <div class="login-erro" id="login-erro" hidden></div>
        <label>Usuário
          <div class="campo-ico">${Icone('usuario')}
            <input name="login" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(ultimo)}" required placeholder="Ex.: clara">
          </div></label>
        <label>Senha ${campoSenha('senha', 'required placeholder="Sua senha"')}</label>
        <button class="btn btn-primario btn-grande">Entrar</button>
        <div class="login-rodape"><span class="ponto ok"></span> Funciona sem internet · os dados ficam neste computador</div>
      </form>`);
    (ultimo ? form.senha : form.login).focus();
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const caixaErro = form.querySelector('#login-erro');
      const dados = U.dadosForm(form);
      form.senha.value = ''; // não deixa a senha na tela
      try {
        const r = await api('/api/login', { metodo: 'POST', corpo: dados });
        U.local.gravar('ultimo_login', r.usuario.login);
        entrar(r.usuario);
      } catch (e) {
        caixaErro.textContent = e.message;
        caixaErro.hidden = false;
        form.classList.remove('tremer');
        void form.offsetWidth;
        form.classList.add('tremer');
        form.senha.focus();
      }
    };
  }

  function telaPrimeiroAcesso(s) {
    const form = moldeLogin(s, `
      <form class="login" id="f-primeiro" autocomplete="off">
        <div>
          <h2>Primeiro acesso</h2>
          <p class="dica">Crie o usuário administrador. Ele cadastra os vendedores e os produtos, vê os relatórios e muda as configurações.</p>
        </div>
        <label>Nome<input name="nome" required placeholder="Ex.: Clara"></label>
        <label>Usuário (para entrar)<input name="login" required autocomplete="off" autocapitalize="off" placeholder="Ex.: clara"></label>
        <label>Senha ${campoSenha('senha', 'minlength="4" required placeholder="Mínimo 4 caracteres"')}</label>
        <label>Repita a senha ${campoSenha('senha2', 'minlength="4" required')}</label>
        <button class="btn btn-primario btn-grande">Criar e entrar</button>
      </form>`);
    form.nome.focus();
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const d = U.dadosForm(form);
      if (d.senha !== d.senha2) return aviso('As senhas não conferem.', 'erro');
      try {
        const r = await api('/api/primeiro-acesso', { metodo: 'POST', corpo: d });
        U.local.gravar('ultimo_login', r.usuario.login);
        aviso('Administrador criado.');
        entrar(r.usuario);
      } catch (e) { erro(e); }
    };
  }

  function trocarSenha() {
    const corpo = U.abrirModal('Minha senha', `
      <form class="form" autocomplete="off">
        <label>Senha atual ${campoSenha('senha_atual', 'required')}</label>
        <label>Nova senha ${campoSenha('nova_senha', 'minlength="4" required')}</label>
        <label>Repita a nova senha ${campoSenha('nova2', 'minlength="4" required')}</label>
        <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn btn-primario">Salvar</button></div>
      </form>`, { largura: '420px' });
    ligarOlhos(corpo);
    corpo.querySelector('input').focus();
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
    document.body.classList.toggle('modo-boas-vindas', nome === 'boas-vindas');
    try {
      await tela.abrir(conteudo);
      if (telaAtual === tela) {
        Animacoes.entrarTela(conteudo);
        Animacoes.contar(conteudo);
      }
    } catch (e) {
      if (e.status !== 401) {
        conteudo.innerHTML = `<div class="vazio">Não foi possível abrir a tela: ${esc(e.message)}</div>`;
      }
    }
    atualizarStatusCaixa();
    atualizarBolinhaEspera();
  }

  /** Bolinha no menu "Lista de espera" com quantas peças pedidas já chegaram. */
  async function atualizarBolinhaEspera() {
    const el = document.getElementById('bolinha-espera');
    try {
      const r = await api('/api/espera/resumo');
      el.hidden = !r.chegaram;
      el.textContent = r.chegaram;
      el.title = `${r.chegaram} peça(s) da lista de espera chegaram`;
    } catch { el.hidden = true; }
  }
  window.atualizarBolinhaEspera = atualizarBolinhaEspera;

  async function atualizarStatusCaixa() {
    const el = document.getElementById('status-caixa');
    try {
      const r = await api('/api/caixa/atual');
      el.innerHTML = r.caixa
        ? `<span class="ponto ok"></span><span class="status-txt"><b>Caixa nº ${r.caixa.id} aberto</b><br><small>${esc(r.caixa.operador || '')}</small></span>`
        : '<span class="ponto"></span><span class="status-txt"><b>Caixa fechado</b><br><small>clique para abrir</small></span>';
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

  // ------------------------------------------------------- menu recolhível
  (() => {
    const botao = document.getElementById('menu-recolher');
    const dica = document.getElementById('menu-dica');
    const aplicar = (sim) => {
      document.body.classList.toggle('menu-recolhido', sim);
      botao.querySelector('span').textContent = sim ? 'Abrir menu' : 'Recolher menu';
      botao.title = sim ? 'Abrir menu' : 'Recolher menu (só ícones)';
    };
    aplicar(!!U.local.ler('menu_recolhido', false));
    botao.onclick = () => {
      const sim = !document.body.classList.contains('menu-recolhido');
      U.local.gravar('menu_recolhido', sim);
      aplicar(sim);
      dica.hidden = true;
    };
    // Com o menu recolhido, o nome da tela aparece num balãozinho ao passar o mouse no ícone.
    const menu = document.querySelector('.menu');
    menu.addEventListener('mouseover', (ev) => {
      const a = ev.target.closest('nav a, .menu-recolher, .status-caixa');
      if (!a || !document.body.classList.contains('menu-recolhido')) return;
      const r = a.getBoundingClientRect();
      dica.textContent = a.classList.contains('status-caixa') ? a.innerText.split('\n')[0] : a.textContent.trim().replace(/F1$/, '').trim();
      dica.style.top = `${r.top + r.height / 2}px`;
      dica.style.left = `${r.right + 10}px`;
      dica.hidden = false;
    });
    menu.addEventListener('mouseleave', () => { dica.hidden = true; });
  })();

  window.addEventListener('hashchange', navegar);
  iniciar();
})();
