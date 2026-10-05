/* Cadastro de vendedores e administradores (só administrador). */
Telas.usuarios = (() => {
  const { esc, api, aviso, erro, abrirModal, fecharModal } = U;
  let raiz;
  let lista = [];

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <h1>Vendedores</h1>
        <div class="ferramentas"><button class="btn btn-primario" id="novo">+ Novo vendedor(a)</button></div>
      </div>
      <p class="dica">Cada pessoa entra com seu usuário e senha; as vendas ficam registradas no nome de quem estava logado.
        <b>Vendedor(a)</b> vende, abre/fecha caixa, consulta vendas e clientes.
        <b>Administrador(a)</b> também cadastra produtos, cancela vendas, vê relatórios e muda configurações.</p>
      <div class="cartao">
        <table class="tabela">
          <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Situação</th></tr></thead>
          <tbody id="lista"></tbody>
        </table>
      </div>`;
    raiz.querySelector('#novo').onclick = () => formulario(null);
    raiz.querySelector('#lista').onclick = (ev) => {
      const tr = ev.target.closest('[data-i]');
      if (tr) formulario(lista[Number(tr.dataset.i)]);
    };
    await carregar();
  }

  async function carregar() {
    if (!raiz) return;
    try {
      lista = await api('/api/usuarios');
    } catch (e) { return erro(e); }
    raiz.querySelector('#lista').innerHTML = lista.map((u, i) => `
      <tr class="clicavel ${u.ativo ? '' : 'inativo'}" data-i="${i}">
        <td><b>${esc(u.nome)}</b></td><td>${esc(u.login)}</td>
        <td>${u.perfil === 'admin' ? 'Administrador(a)' : 'Vendedor(a)'}</td>
        <td>${u.ativo ? '<span class="selo ok">Ativo</span>' : '<span class="selo perigo">Desativado</span>'}</td>
      </tr>`).join('');
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
