/*
 * Vídeo curto da peça para o site (o caimento do tecido, a peça vestida). No site, aparece junto com as
 * fotos (botão "vídeo") e nas novidades em estilo stories.
 */
const VideoPeca = (() => {
  const { api, aviso, erro, abrirModal, fecharModal } = U;
  const LIMITE = 40e6;

  /** p: o produto (variante) que guarda o vídeo; aoSalvar(): chamado depois de salvar ou tirar. */
  function abrir(p, { aoSalvar } = {}) {
    const atual = p.video_versao ? `/api/produtos/${p.id}/video?v=${p.video_versao}` : '';
    const corpo = abrirModal(`Vídeo — ${p.nome}`, `
      <div class="f3">
        <div class="f3-palco vp-palco" id="vp-palco">${atual ? `<video src="${atual}" controls loop muted playsinline></video>`
    : `<div class="f3-vazio">${Icone('camera')}<b>Sem vídeo ainda</b><small>Escolha um vídeo ao lado.</small></div>`}</div>
        <div class="f3-lado">
          <ol class="f3-passos">
            <li>Grave a peça <b>vestida</b> (ou no manequim) mostrando o caimento, de <b>5 a 15 segundos</b>.</li>
            <li>Grave com o celular <b>em pé</b> e, se der, em <b>720p</b> (fica mais leve para a cliente abrir).</li>
            <li>Escolha o vídeo aqui embaixo (MP4, até 40 MB).</li>
          </ol>
          <label class="btn btn-claro">${Icone('camera')} Escolher o vídeo<input type="file" accept="video/mp4,video/webm,video/quicktime,video/*" id="vp-arq" hidden></label>
          <p class="dica" id="vp-info">${atual ? 'Esta peça já tem vídeo. No site, ele aparece no botão <b>vídeo</b> e nas novidades.' : ''}</p>
          <div class="f3-botoes"><button type="button" class="btn btn-fantasma btn-peq btn-perigo-claro" id="vp-tirar" ${atual ? '' : 'hidden'}>${Icone('lixeira')} Tirar o vídeo</button></div>
          <div class="acoes"><button type="button" class="btn" data-fechar>Fechar</button>
            <button type="button" class="btn btn-primario" id="vp-salvar" disabled>${Icone('check')} Salvar</button></div>
        </div>
      </div>`, { largura: '820px', classe: 'modal-360' });
    const info = corpo.querySelector('#vp-info');
    const salvar = corpo.querySelector('#vp-salvar');
    let arquivo = null;
    corpo.querySelector('[data-fechar]').onclick = fecharModal;
    corpo.querySelector('#vp-arq').onchange = (ev) => {
      const a = ev.target.files[0];
      ev.target.value = '';
      if (!a) return;
      if (a.size > LIMITE) return aviso(`Este vídeo tem ${Math.round(a.size / 1e6)} MB. O máximo é 40 MB: grave mais curto ou em 720p.`, 'alerta');
      const url = URL.createObjectURL(a);
      corpo.querySelector('#vp-palco').innerHTML = `<video src="${url}" controls autoplay loop muted playsinline></video>`;
      const v = corpo.querySelector('#vp-palco video');
      v.onloadedmetadata = () => {
        const seg = Math.round(v.duration);
        info.innerHTML = `<b>${seg} segundos</b> · ${(a.size / 1e6).toFixed(1)} MB.${seg > 20 ? ' É um pouco longo: no site os stories mostram só os primeiros 15 segundos.' : ''} Clique em <b>Salvar</b>.`;
      };
      v.onerror = () => { info.innerHTML = 'Este computador não conseguiu abrir o vídeo. Se for do iPhone, grave em "Mais compatível" (Ajustes → Câmera → Formatos).'; };
      arquivo = a;
      salvar.disabled = false;
    };
    salvar.onclick = () => {
      if (!arquivo) return;
      salvar.disabled = true;
      // Envio com barra de progresso (o vídeo pode demorar alguns segundos).
      const x = new XMLHttpRequest();
      x.open('POST', `/api/produtos/${p.id}/video`);
      x.setRequestHeader('Content-Type', arquivo.type || 'application/octet-stream');
      x.setRequestHeader('X-Nome-Arquivo', encodeURIComponent(arquivo.name));
      x.upload.onprogress = (e) => { if (e.lengthComputable) salvar.innerHTML = `<span class="girando"></span> Enviando ${Math.round((e.loaded / e.total) * 100)}%`; };
      x.onload = () => {
        let r = {};
        try { r = JSON.parse(x.responseText); } catch { /* sem corpo */ }
        if (x.status >= 400) {
          erro(new Error(r.erro || 'Não consegui salvar o vídeo.'));
          salvar.disabled = false;
          salvar.innerHTML = `${Icone('check')} Salvar`;
          return;
        }
        fecharModal();
        U.avisoAcao('Vídeo salvo. Atualize o site para ele aparecer lá.', 'Site da loja', () => Catalogo.site());
        if (aoSalvar) aoSalvar();
      };
      x.onerror = () => { erro(new Error('Não consegui enviar o vídeo.')); salvar.disabled = false; salvar.innerHTML = `${Icone('check')} Salvar`; };
      x.send(arquivo);
    };
    corpo.querySelector('#vp-tirar').onclick = async () => {
      if (!(await U.confirmar('Tirar o vídeo', `A peça "${p.nome}" fica só com as fotos no site.`, { ok: 'Tirar', perigo: true }))) return;
      try {
        await api(`/api/produtos/${p.id}/video`, { metodo: 'DELETE' });
        aviso('Vídeo tirado.');
        if (aoSalvar) aoSalvar();
      } catch (e) { erro(e); }
    };
  }

  return { abrir };
})();
