/*
 * Mais fotos da peça para o site (costas, detalhe do tecido, peça no corpo…), além da foto de cada cor.
 * No site, a cliente passa as fotos com o dedo e abre a lupa para ver de perto.
 */
const FotosExtras = (() => {
  const { api, aviso, erro, abrirModal, fecharModal } = U;
  const MAX = 8;

  /** p: o produto (variante) que guarda as fotos; aoSalvar(): chamado depois de salvar. */
  async function abrir(p, { aoSalvar } = {}) {
    let fotos = [];
    try {
      for (let i = 0; i < (p.extras_n || 0); i += 1) {
        const b = await (await fetch(`/api/produtos/${p.id}/extras/${i}?v=${p.extras_versao}`)).blob();
        fotos.push(await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(b); }));
      }
    } catch (e) { return erro(e); }
    const corpo = abrirModal(`Mais fotos — ${p.nome}`, `
      <p class="dica">Fotos que aparecem no site junto com a foto principal: <b>costas</b>, <b>detalhe do tecido</b>, a peça
        <b>vestida</b>… A cliente passa com o dedo e pode ver de perto com a lupa. Até ${MAX} fotos.</p>
      <div class="fx-grade" id="fx-grade"></div>
      <div class="acoes"><button type="button" class="btn" data-fechar>Cancelar</button>
        <button type="button" class="btn btn-primario" id="fx-salvar">${Icone('check')} Salvar</button></div>`, { largura: '760px', classe: 'modal-fotos-extras' });
    const grade = corpo.querySelector('#fx-grade');
    const desenhar = () => {
      grade.innerHTML = fotos.map((f, i) => `<div class="fx-foto"><img src="${f}" alt="">
        <span class="fx-num">${i + 1}</span>
        <div class="fx-bts">${i ? `<button type="button" data-esq="${i}" title="Passar para antes">‹</button>` : ''}
          <button type="button" data-tirar="${i}" title="Tirar esta foto">${Icone('lixeira')}</button></div></div>`).join('')
        + (fotos.length < MAX ? `<label class="fx-mais">${Icone('mais')}<b>Pôr fotos</b><small>escolha uma ou várias</small><input type="file" accept="image/*" multiple id="fx-arq" hidden></label>` : '');
      const inp = grade.querySelector('#fx-arq');
      if (inp) {
        inp.onchange = async (ev) => {
          const arqs = [...ev.target.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          if (fotos.length + arqs.length > MAX) aviso(`Cabem só ${MAX} fotos: peguei as primeiras.`, 'alerta');
          try {
            for (const a of arqs.slice(0, MAX - fotos.length)) fotos.push(await U.reduzirImagem(a, 1400));
          } catch (e) { erro(e); }
          desenhar();
        };
      }
    };
    desenhar();
    grade.onclick = (ev) => {
      const t = ev.target.closest('[data-tirar]');
      if (t) { fotos.splice(Number(t.dataset.tirar), 1); return desenhar(); }
      const e = ev.target.closest('[data-esq]');
      if (e) { const i = Number(e.dataset.esq); [fotos[i - 1], fotos[i]] = [fotos[i], fotos[i - 1]]; desenhar(); }
    };
    corpo.querySelector('[data-fechar]').onclick = fecharModal;
    const salvar = corpo.querySelector('#fx-salvar');
    salvar.onclick = async () => {
      salvar.disabled = true;
      try {
        for (let i = 0; i < fotos.length; i += 1) {
          salvar.innerHTML = `<span class="girando"></span> Enviando ${i + 1} de ${fotos.length}…`;
          await api(`/api/produtos/${p.id}/extras/${i}`, { metodo: 'PUT', corpo: { imagem: fotos[i] } });
        }
        await api(`/api/produtos/${p.id}/extras`, { metodo: 'POST', corpo: { quantidade: fotos.length } });
        fecharModal();
        U.avisoAcao(fotos.length ? `${fotos.length} foto(s) a mais salvas. Atualize o site para elas aparecerem lá.` : 'Fotos a mais tiradas.', 'Site da loja', () => Catalogo.site());
        if (aoSalvar) aoSalvar();
      } catch (e) {
        erro(e);
        salvar.disabled = false;
        salvar.innerHTML = `${Icone('check')} Salvar`;
      }
    };
  }

  return { abrir };
})();
