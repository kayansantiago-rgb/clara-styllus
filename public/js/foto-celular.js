/*
 * Foto pelo celular: abre uma sessão no PDV e mostra um QR Code com o endereço na rede da loja.
 * O celular tira a foto e ela chega sozinha. Usado no cadastro de produto e no de cliente.
 */
const FotoCelular = (() => {
  const { esc, api, aviso, erro } = U;

  /**
   * painel: elemento onde o QR Code aparece (fica escondido quando fecha).
   * nome: o que aparece no celular ("Vestido · M · Preto", "Foto de Ana Souza").
   * aoReceber(blob): chamado a cada foto que chega.
   */
  async function abrir(painel, { nome, tipo = 'produto', aoReceber, qr = false }) {
    if (!painel.hidden && !qr) return;
    let s;
    try {
      s = await api('/api/celular/sessao', { metodo: 'POST', corpo: { nome, tipo, qr } });
    } catch (e) { return erro(e); }
    if (!s.celular && !s.enderecos.length) {
      return aviso('Este computador não está conectado a uma rede (Wi-Fi ou cabo). Ligue a rede para usar o celular.', 'erro');
    }
    const porta = location.port ? `:${location.port}` : '';
    // Quem ler o QR Code fica conectado: nas próximas fotos, o pedido vai direto para o celular.
    const url = (ip) => `http://${ip}${porta}/celular#s=${s.token}${s.parear ? `&parear=${s.parear}` : ''}`;
    painel.hidden = false;
    painel.innerHTML = s.celular ? `
      <div class="fp-celular-direto">
        <span class="fp-celular-ico">${Icone('telefone')}</span>
        <div class="fp-celular-txt">
          <b>Pedido enviado para o ${esc(s.celular.nome)}</b>
          <small>No celular, toque em <b>Tirar foto</b>. A foto aparece aqui sozinha.</small>
          <span class="fp-celular-status" id="cel-status"><span class="girando"></span> Esperando a foto…</span>
          <span class="fp-celular-links"><button type="button" class="link" id="cel-qr-outro">Usar outro celular (QR Code)</button>
            <button type="button" class="link" id="cel-fechar">Fechar</button></span>
        </div>
      </div>` : `
      <div class="fp-celular-qr" id="cel-qr"></div>
      <code class="fp-celular-end" id="cel-end"></code>
      <div class="fp-celular-txt">
        <b>Aponte a câmera do celular para o QR Code</b>
        <small>Só na primeira vez: depois o celular fica conectado e as próximas fotos vão direto para ele (deixe a página aberta).</small>
        <span class="fp-celular-status" id="cel-status"><span class="girando"></span> Esperando a foto…</span>
        ${s.enderecos.length > 1 ? `<small>Não abriu no celular? Troque o endereço:</small>
          <div class="fp-celular-ends">${s.enderecos.slice(0, 4).map((ip, i) => `<button type="button" class="fp-celular-ip${i ? '' : ' ativo'}" data-ip="${esc(ip)}">${esc(ip)}</button>`).join('')}</div>` : ''}
        <button type="button" class="link" id="cel-fechar">Fechar</button>
      </div>`;
    const outro = painel.querySelector('#cel-qr-outro');
    if (outro) {
      outro.onclick = () => {
        ativo = false;
        api(`/api/celular/sessao/${s.token}`, { metodo: 'DELETE' }).catch(() => {});
        abrir(painel, { nome, tipo, aoReceber, qr: true });
      };
    }
    // Mostra o QR Code de um endereço (e o endereço escrito, para digitar no celular se precisar).
    const mostrar = (ip) => {
      if (!painel.querySelector('#cel-qr')) return;
      painel.querySelector('#cel-qr').innerHTML = QRCode.svg(url(ip), { tamanho: 148, margem: 2 });
      painel.querySelector('#cel-end').textContent = url(ip).split('#')[0];
      painel.querySelectorAll('[data-ip]').forEach((b) => b.classList.toggle('ativo', b.dataset.ip === ip));
    };
    if (!s.celular) mostrar(s.enderecos[0]);
    painel.querySelectorAll('[data-ip]').forEach((b) => { b.onclick = () => mostrar(b.dataset.ip); });
    let ativo = true;
    const parar = () => {
      ativo = false;
      painel.hidden = true;
      api(`/api/celular/sessao/${s.token}`, { metodo: 'DELETE' }).catch(() => {});
    };
    painel.querySelector('#cel-fechar').onclick = parar;
    const verificar = async () => {
      if (!ativo) return;
      if (!painel.isConnected) { parar(); return; } // fechou o cadastro
      try {
        const r = await api(`/api/celular/foto/${s.token}`);
        if (r.foto) {
          const st = painel.querySelector('#cel-status');
          if (st) st.innerHTML = `${Icone('check')} Foto recebida! Se quiser outra, é só tirar de novo no celular.`;
          U.som('ok');
          await aoReceber(await (await fetch(r.foto)).blob());
        }
      } catch (e) {
        if (e.status === 404) { const st = painel.querySelector('#cel-status'); if (st) st.textContent = 'O pedido venceu. Feche e clique em Celular de novo.'; return; }
      }
      setTimeout(verificar, 1500);
    };
    setTimeout(verificar, 1500);
  }

  return { abrir };
})();
