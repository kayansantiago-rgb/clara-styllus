/* Cadastro de clientes. */
Telas.clientes = (() => {
  const { esc, brl, api, aviso, erro, abrirModal, fecharModal, dataHora } = U;
  let raiz;
  let lista = [];

  async function abrir(el) {
    raiz = el;
    raiz.innerHTML = `
      <div class="cabecalho-tela">
        <h1>Clientes</h1>
        <div class="ferramentas">
          <input id="q" type="search" placeholder="Nome, CPF ou telefone" autofocus>
          <button class="btn btn-primario" id="novo">+ Nova cliente</button>
        </div>
      </div>
      <div class="tabela-rolagem cartao">
        <table class="tabela">
          <thead><tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>Aniversário</th><th>E-mail</th></tr></thead>
          <tbody id="lista"></tbody>
        </table>
      </div>`;
    raiz.querySelector('#q').addEventListener('input', U.debounce(carregar));
    raiz.querySelector('#novo').onclick = () => formulario(null, () => carregar());
    raiz.querySelector('#lista').onclick = (ev) => {
      const tr = ev.target.closest('[data-i]');
      if (tr) formulario(lista[Number(tr.dataset.i)], () => carregar());
    };
    await carregar();
  }

  async function carregar() {
    if (!raiz) return;
    try {
      lista = await api(`/api/clientes?q=${encodeURIComponent(raiz.querySelector('#q').value)}`);
    } catch (e) { return erro(e); }
    raiz.querySelector('#lista').innerHTML = lista.map((c, i) => `
      <tr class="clicavel" data-i="${i}">
        <td><b>${esc(c.nome)}</b></td><td>${esc(U.cpf(c.cpf))}</td><td>${esc(c.telefone || '')}</td>
        <td>${c.aniversario ? esc(c.aniversario.split('-').reverse().join('/')) : ''}</td><td>${esc(c.email || '')}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhuma cliente.</td></tr>';
  }

  /** Abre o formulário; chama aoSalvar(cliente) depois de gravar. */
  async function formulario(c, aoSalvar) {
    let compras = [];
    let crediario = null;
    if (c) {
      try {
        const d = await api(`/api/clientes/${c.id}`);
        compras = d.compras;
        crediario = d.crediario;
        c = d;
      } catch (e) { erro(e); }
    }
    c = c || {};
    const corpo = abrirModal(c.id ? 'Editar cliente' : 'Nova cliente', `
      <form class="form grade-form">
        <label class="col2">Nome *<input name="nome" required value="${esc(c.nome)}" autofocus></label>
        <label>CPF<input name="cpf" inputmode="numeric" value="${esc(U.cpf(c.cpf))}"></label>
        <label>Telefone / WhatsApp<input name="telefone" value="${esc(c.telefone)}"></label>
        <label>E-mail<input name="email" type="email" value="${esc(c.email)}"></label>
        <label>Aniversário<input name="aniversario" type="date" value="${esc(c.aniversario)}"></label>
        <label class="col2">Observações (tamanhos, preferências…)<textarea name="observacao" rows="2">${esc(c.observacao)}</textarea></label>
        <label class="so-admin">Limite no crediário (R$) <small>vazio = sem limite</small>
          <input name="limite_credito" inputmode="decimal" value="${c.limite_credito != null ? U.num(c.limite_credito) : ''}"></label>
        ${crediario && crediario.aberto ? `<div class="alerta-box col2" style="margin:0">Deve no crediário: <b>${brl(crediario.aberto)}</b>${
  crediario.vencido ? ` · <b>${brl(crediario.vencido)} vencido</b>` : ''} — <a href="#/crediario" data-fechar>ver crediário</a></div>` : ''}
        ${compras.length ? `<div class="col2"><h3>Últimas compras</h3>${compras.map((v) =>
    `<div class="linha"><span>Nº ${v.id} · ${dataHora(v.criado_em)}${v.status === 'cancelada' ? ' (cancelada)' : ''}</span><span>${brl(v.total)}</span></div>`).join('')}
          <p><b>Total comprado: ${brl(compras.filter((v) => v.status === 'concluida').reduce((a, v) => a + v.total, 0))}</b></p></div>` : ''}
        <div class="acoes col2">
          <button type="button" class="btn" data-fechar>Cancelar</button>
          <button class="btn btn-primario">Salvar</button>
        </div>
      </form>`, { largura: '680px' });
    corpo.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault();
      const d = U.dadosForm(ev.target);
      if (d.cpf && !U.cpfValido(d.cpf)) return aviso('CPF inválido.', 'erro');
      if (d.limite_credito) {
        d.limite_credito = U.paraCentavos(d.limite_credito);
        if (Number.isNaN(d.limite_credito)) return aviso('Limite inválido.', 'erro');
      }
      try {
        const salvo = await api(c.id ? `/api/clientes/${c.id}` : '/api/clientes', { metodo: c.id ? 'PUT' : 'POST', corpo: d });
        aviso('Cliente salva.');
        fecharModal();
        if (aoSalvar) aoSalvar(salvo);
      } catch (e) { erro(e); }
    };
  }

  return { abrir, formulario, sair: () => { raiz = null; } };
})();
