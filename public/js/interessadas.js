/*
 * "Chegou peça nova": mostra as clientes que pediram a peça na lista de espera ou que costumam
 * comprar aquela categoria no tamanho que chegou, cada uma com um botão de WhatsApp com a mensagem pronta.
 */
const Interessadas = (() => {
  const { esc, brl, api, erro, abrirModal } = U;

  const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const telefone = (t) => {
    const d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    return d.length === 10 || d.length === 11 ? `55${d}` : null;
  };

  function mensagemPadrao(peca, loja) {
    const tams = peca.tamanhos.length ? ` (tam ${peca.tamanhos.join(', ')})` : '';
    const preco = peca.preco_anterior ? `de ${brl(peca.preco_anterior)} por ${brl(peca.preco_venda)}` : `por ${brl(peca.preco_venda)}`;
    return `Oi, {nome}! Aqui é da ${loja} 💕 Chegou ${peca.nome}${tams}, ${preco}. Lembrei de você! Quer que eu separe uma pra você?`;
  }

  /**
   * ids: produtos que chegaram. opcoes.auto: aberto sozinho depois de cadastrar/dar entrada
   * (se ninguém combina, não abre nada e devolve false).
   */
  async function abrir(ids, { auto = false } = {}) {
    ids = [...new Set(ids.map(Number).filter(Boolean))];
    if (!ids.length) return false;
    let r;
    let cfg;
    try {
      [r, cfg] = await Promise.all([api(`/api/produtos/interessadas?ids=${ids.join(',')}`), U.config()]);
    } catch (e) { if (!auto) erro(e); return false; }
    if (auto && (!r.clientes.length || !r.peca.estoque)) return false;
    const loja = cfg.loja_nome || 'Clara Styllus';
    const p = r.peca;
    const corpo = abrirModal(`Avisar clientes: chegou ${p.nome}`, `
      <div class="ci">
        <div class="ci-peca">
          <span class="ci-ico">${Icone('presente')}</span>
          <div><b>${esc(p.nome)}</b>
            <small>${esc([p.categoria, p.tamanhos.length && `Tam ${p.tamanhos.join(', ')}`, p.cores.join(', ')].filter(Boolean).join(' · '))}
              · ${p.preco_anterior ? `<s>${brl(p.preco_anterior)}</s> ` : ''}${brl(p.preco_venda)} · ${p.estoque} peça(s)</small></div>
        </div>
        ${r.clientes.length ? `
        <label class="ci-msg"><span>Mensagem (o <code>{nome}</code> vira o primeiro nome da cliente)</span>
          <textarea id="ci-texto" rows="3">${esc(mensagemPadrao(p, loja))}</textarea></label>
        <p class="dica">${r.clientes.length} cliente(s) que podem gostar. Clique em <b>Avisar</b>: o WhatsApp abre com a mensagem pronta, é só enviar.</p>
        <div class="ci-lista">${r.clientes.map((c, i) => `
          <div class="ci-cliente ${c.espera_id ? 'espera' : ''}" data-i="${i}">
            <span class="ci-av">${esc(iniciais(c.nome))}</span>
            <div class="ci-txt"><b>${esc(c.nome)}</b><small>${c.espera_id ? `${Icone('relogio')} ` : ''}${esc(c.motivo)}</small></div>
            ${telefone(c.telefone)
    ? `<a class="btn cl-btn-zap btn-peq" data-avisar="${i}" href="#" target="_blank" rel="noopener">${Icone('whatsapp')} Avisar</a>`
    : '<small class="ci-sem">sem WhatsApp no cadastro</small>'}
          </div>`).join('')}</div>`
    : `<div class="vd-vazio">${Ilustracao.svg('busca', 130)}<b>Nenhuma cliente combina com esta peça ainda</b><br>
        <small>Aparecem aqui quem pediu na lista de espera e quem comprou ${esc((p.categoria || 'peças parecidas').toLowerCase())} nesse tamanho no último ano.</small></div>`}
        <div class="acoes"><button type="button" class="btn" data-fechar>Fechar</button></div>
      </div>`, { largura: '640px' });
    const lista = corpo.querySelector('.ci-lista');
    if (!lista) return true;
    const texto = corpo.querySelector('#ci-texto');
    const link = (c) => `https://wa.me/${telefone(c.telefone)}?text=${encodeURIComponent(texto.value.replace(/\{nome\}/g, c.nome.split(' ')[0]))}`;
    // O link é montado na hora do clique, com a mensagem como estiver no campo.
    lista.addEventListener('click', (ev) => {
      const a = ev.target.closest('[data-avisar]');
      if (!a) return;
      const c = r.clientes[Number(a.dataset.avisar)];
      a.href = link(c);
      // Abre direto no aplicativo / na mesma aba do WhatsApp Web (como as outras mensagens).
      ev.preventDefault();
      Zap.abrirConversa(telefone(c.telefone), texto.value.replace(/\{nome\}/g, c.nome.split(' ')[0]));
      const linha = a.closest('.ci-cliente');
      setTimeout(() => {
        linha.classList.add('avisada');
        a.innerHTML = `${Icone('check')} Avisada`;
      }, 300);
      if (c.espera_id) api(`/api/espera/${c.espera_id}/status`, { metodo: 'POST', corpo: { status: 'avisada' } }).catch(() => {});
    });
    return true;
  }

  return { abrir };
})();
