/* Navegação entre telas, atalhos globais e status do caixa. */
(() => {
  const conteudo = document.getElementById('conteudo');
  let telaAtual = null;

  async function navegar() {
    const nome = (location.hash.replace(/^#\/?/, '').split('?')[0] || 'pdv');
    const tela = Telas[nome] || Telas.pdv;
    if (telaAtual && telaAtual.sair) telaAtual.sair();
    telaAtual = tela;
    U.fecharModal();
    document.querySelectorAll('.menu a').forEach((a) =>
      a.classList.toggle('ativo', a.dataset.rota === nome));
    conteudo.innerHTML = '';
    conteudo.className = `tela-${nome}`;
    try {
      await tela.abrir(conteudo);
    } catch (e) {
      conteudo.innerHTML = `<div class="vazio">Não foi possível abrir a tela: ${U.esc(e.message)}</div>`;
    }
    atualizarStatusCaixa();
  }

  async function atualizarStatusCaixa() {
    const el = document.getElementById('status-caixa');
    try {
      const r = await U.api('/api/caixa/atual');
      el.innerHTML = r.caixa
        ? `<span class="ponto ok"></span>Caixa nº ${r.caixa.id} aberto<br><small>${U.esc(r.caixa.operador || '')}</small>`
        : '<span class="ponto"></span>Caixa fechado';
    } catch {
      el.innerHTML = '<span class="ponto erro"></span>Servidor desligado';
    }
  }
  window.atualizarStatusCaixa = atualizarStatusCaixa;

  document.addEventListener('keydown', (ev) => {
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
  navegar();
})();
