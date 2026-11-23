/*
 * Giro de 360° de uma peça (para o site): várias fotos tiradas em volta do manequim, na ordem.
 * No site, a cliente arrasta o dedo e a roupa gira. Aqui a loja escolhe as fotos, confere girando e salva.
 */
const Foto360 = (() => {
  const { api, aviso, erro, abrirModal, fecharModal } = U;

  /** Visualizador simples: arrastar troca o quadro; gira sozinho até mexer. */
  function girar(el, quadros) {
    const n = quadros.length;
    el.innerHTML = `<img alt="" draggable="false"><span class="f3-dica">${Icone('atualizar')} arraste para girar</span>`;
    const img = el.querySelector('img');
    let q = 0;
    const mostrar = (i) => { q = ((i % n) + n) % n; img.src = quadros[q]; };
    mostrar(0);
    let auto = true;
    let t0 = performance.now();
    const passo = (t) => {
      if (!auto || !el.isConnected) return;
      mostrar(Math.floor((t - t0) / 110));
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    let arr = null;
    el.onpointerdown = (e) => { auto = false; el.classList.add('mexeu'); arr = { x: e.clientX, q }; el.setPointerCapture(e.pointerId); };
    el.onpointermove = (e) => { if (arr) mostrar(arr.q - Math.round((e.clientX - arr.x) / Math.max(6, (el.clientWidth * 1.2) / n))); };
    el.onpointerup = el.onpointercancel = () => { arr = null; };
  }

  /** p: o produto (variante) que guarda o giro; aoSalvar(): chamado depois de salvar ou tirar. */
  function abrir(p, { aoSalvar } = {}) {
    const tem = p.foto360_n > 1 && p.foto360_versao;
    let quadros = tem ? Array.from({ length: p.foto360_n }, (_, i) => `/api/produtos/${p.id}/360/${i}?v=${p.foto360_versao}`) : [];
    let novos = null; // fotos escolhidas agora (ainda não salvas)
    const corpo = abrirModal(`Giro 360° — ${p.nome}`, `
      <div class="f3">
        <div class="f3-palco" id="f3-palco"></div>
        <div class="f3-lado">
          <ol class="f3-passos">
            <li>Vista a peça no <b>manequim</b>, num lugar com luz boa e fundo liso.</li>
            <li>Tire de <b>12 a 36 fotos</b> dando a volta no manequim, sempre na <b>mesma distância e altura</b> (um passinho de cada vez).</li>
            <li>Escolha <b>todas as fotos de uma vez</b> aqui embaixo. Elas ficam na ordem do nome do arquivo.</li>
          </ol>
          <label class="btn btn-claro">${Icone('imagem')} Escolher as fotos<input type="file" accept="image/*" multiple id="f3-arquivos" hidden></label>
          <p class="dica" id="f3-info"></p>
          <div class="f3-botoes">
            <button type="button" class="btn btn-fantasma btn-peq" id="f3-inverter" hidden>${Icone('troca')} Girando ao contrário? Inverter</button>
            <button type="button" class="btn btn-fantasma btn-peq btn-perigo-claro" id="f3-tirar" ${tem ? '' : 'hidden'}>${Icone('lixeira')} Tirar o giro</button>
          </div>
          <div class="acoes"><button type="button" class="btn" data-fechar>Fechar</button>
            <button type="button" class="btn btn-primario" id="f3-salvar" disabled>${Icone('check')} Salvar</button></div>
        </div>
      </div>`, { largura: '860px', classe: 'modal-360' });
    const palco = corpo.querySelector('#f3-palco');
    const info = corpo.querySelector('#f3-info');
    const salvar = corpo.querySelector('#f3-salvar');
    const desenhar = () => {
      if (quadros.length > 1) girar(palco, quadros);
      else palco.innerHTML = `<div class="f3-vazio">${Icone('camera')}<b>Nenhum giro ainda</b><small>Escolha as fotos ao lado para ver a peça girando.</small></div>`;
      info.innerHTML = novos ? `<b>${novos.length} fotos</b> escolhidas. Arraste na imagem para conferir e clique em <b>Salvar</b>.`
        : tem ? `Esta peça já tem um giro com <b>${p.foto360_n} fotos</b>. Aparece no site com o selo <b>360°</b>.` : '';
      corpo.querySelector('#f3-inverter').hidden = !novos;
      salvar.disabled = !novos;
    };
    desenhar();
    corpo.querySelector('[data-fechar]').onclick = fecharModal;
    corpo.querySelector('#f3-arquivos').onchange = async (ev) => {
      const arqs = [...ev.target.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      ev.target.value = '';
      if (arqs.length < 6) return aviso('Escolha pelo menos 6 fotos (o ideal é de 12 a 36).', 'alerta');
      if (arqs.length > 72) return aviso('No máximo 72 fotos.', 'alerta');
      info.innerHTML = '<span class="girando"></span> Preparando as fotos…';
      try {
        novos = [];
        for (const a of arqs) novos.push(await U.reduzirImagem(a, 900));
        quadros = novos;
        desenhar();
      } catch (e) { novos = null; erro(e); }
    };
    corpo.querySelector('#f3-inverter').onclick = () => { novos.reverse(); quadros = novos; desenhar(); aviso('Sentido invertido.'); };
    salvar.onclick = async () => {
      salvar.disabled = true;
      try {
        for (let i = 0; i < novos.length; i += 1) {
          salvar.innerHTML = `<span class="girando"></span> Enviando ${i + 1} de ${novos.length}…`;
          await api(`/api/produtos/${p.id}/360/${i}`, { metodo: 'PUT', corpo: { imagem: novos[i] } });
        }
        await api(`/api/produtos/${p.id}/360`, { metodo: 'POST', corpo: { quadros: novos.length } });
        fecharModal();
        U.avisoAcao(`Giro 360° salvo. Atualize o site para ele aparecer lá.`, 'Site da loja', () => Catalogo.site());
        if (aoSalvar) aoSalvar();
      } catch (e) {
        erro(e);
        salvar.disabled = false;
        salvar.innerHTML = `${Icone('check')} Salvar`;
      }
    };
    corpo.querySelector('#f3-tirar').onclick = async () => {
      if (!(await U.confirmar('Tirar o giro 360°', `A peça "${p.nome}" volta a aparecer só com as fotos normais no site.`, { ok: 'Tirar', perigo: true }))) return;
      try {
        await api(`/api/produtos/${p.id}/360`, { metodo: 'DELETE' });
        aviso('Giro tirado.');
        if (aoSalvar) aoSalvar();
      } catch (e) { erro(e); }
    };
  }

  return { abrir, girar };
})();
