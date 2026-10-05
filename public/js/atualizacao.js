/* Atualização do sistema: procurar, instalar (internet ou arquivo) e esperar o sistema voltar. */
const Atualizacao = (() => {
  const { esc, api, aviso, erro } = U;

  /** Tela de espera enquanto o instalador roda; recarrega quando o sistema volta na versão nova. */
  function aguardar(versaoNova) {
    const capa = document.createElement('div');
    capa.className = 'at-capa';
    capa.innerHTML = `<div class="at-caixa">
      <div class="at-giro">${Icone('atualizar')}</div>
      <h2>Atualizando o sistema${versaoNova ? ` para a versão ${esc(versaoNova)}` : ''}</h2>
      <p>Não desligue o computador. Em 1 ou 2 minutos a tela volta sozinha.<br>Os dados da loja ficam guardados (e é feito um backup antes).</p>
      <small id="at-estado">Preparando…</small></div>`;
    document.body.appendChild(capa);
    const inicio = Date.now();
    let caiu = false;
    const est = capa.querySelector('#at-estado');
    const checar = async () => {
      try {
        const r = await fetch('/api/sessao', { cache: 'no-store' });
        const s = await r.json();
        if (caiu || (versaoNova && s.versao === versaoNova)) {
          est.textContent = 'Pronto! Abrindo a versão nova…';
          setTimeout(() => location.reload(), 1500);
          return;
        }
        est.textContent = 'Instalando…';
      } catch {
        caiu = true; // o serviço parou para atualizar: quando responder de novo, terminou
        est.textContent = 'Instalando a versão nova…';
      }
      if (Date.now() - inicio > 10 * 60000) {
        est.innerHTML = 'Está demorando mais que o normal. Feche e abra o programa de novo; se não abrir, reinicie o computador.';
        return;
      }
      setTimeout(checar, 4000);
    };
    setTimeout(checar, 6000);
  }

  async function instalar(botao) {
    if (!(await U.confirmar('Atualizar o sistema', 'O sistema fecha por 1 ou 2 minutos para instalar a versão nova. Faça isso com o caixa parado (sem venda em andamento).', { ok: 'Atualizar agora' }))) return;
    if (botao) botao.disabled = true;
    try {
      const r = await api('/api/atualizacao/instalar', { metodo: 'POST' });
      aguardar(r.versao);
    } catch (e) {
      erro(e);
      if (botao) botao.disabled = false;
    }
  }

  async function enviarArquivo(arquivo) {
    if (!/ClaraStyllus-PDV-Setup-\d+\.\d+\.\d+\.exe$/i.test(arquivo.name)) {
      return aviso('Escolha o arquivo ClaraStyllus-PDV-Setup-x.y.z.exe.', 'erro');
    }
    if (!(await U.confirmar('Atualizar com arquivo', `Instalar ${arquivo.name}? O sistema fecha por 1 ou 2 minutos.`, { ok: 'Instalar' }))) return;
    aviso('Enviando o instalador…', 'alerta');
    try {
      const r = await fetch('/api/atualizacao/arquivo', {
        method: 'POST', body: arquivo, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Nome-Arquivo': encodeURIComponent(arquivo.name) },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Falha ao enviar o instalador.');
      aguardar(j.versao);
    } catch (e) { erro(e); }
  }

  /** Cartão de Configurações → Atualizações. */
  async function desenharStatus(el) {
    let s;
    try { s = await api('/api/atualizacao'); } catch (e) { el.textContent = e.message; return; }
    const quando = s.verificado_em ? new Date(s.verificado_em).toLocaleString('pt-BR') : 'nunca';
    el.innerHTML = `
      <div class="at-status ${s.disponivel ? 'nova' : ''}">
        <span class="at-status-ico">${Icone(s.disponivel ? 'nuvem' : 'check')}</span>
        <div><b>${s.disponivel ? `Versão ${esc(s.disponivel.versao)} disponível` : 'O sistema está atualizado'}</b>
          <small>Versão instalada: ${esc(s.versao_atual)} · última procura: ${quando}${s.baixando ? ' · baixando…' : s.baixado ? ' · pronta para instalar' : ''}</small>
          ${s.erro ? `<small class="txt-perigo">${esc(s.erro)}</small>` : ''}</div>
        ${s.disponivel ? `<button type="button" class="btn btn-primario" id="at-instalar">${Icone('atualizar')} Atualizar agora</button>` : ''}
      </div>
      ${s.disponivel && s.disponivel.notas ? `<details class="at-notas"><summary>O que mudou</summary><pre>${esc(s.disponivel.notas)}</pre></details>` : ''}
      <div class="acoes acoes-esq">
        <button type="button" class="btn" id="at-procurar">${Icone('busca')} Procurar agora</button>
        <label class="btn">${Icone('caixa')} Atualizar com arquivo (sem internet)<input type="file" accept=".exe" id="at-arquivo" hidden></label>
      </div>`;
    el.querySelector('#at-procurar').onclick = async (ev) => {
      ev.currentTarget.disabled = true;
      try { await api('/api/atualizacao/verificar', { metodo: 'POST' }); } catch (e) { erro(e); }
      desenharStatus(el);
    };
    el.querySelector('#at-instalar')?.addEventListener('click', (ev) => instalar(ev.currentTarget));
    el.querySelector('#at-arquivo').onchange = (ev) => ev.target.files[0] && enviarArquivo(ev.target.files[0]);
  }

  return { aguardar, instalar, enviarArquivo, desenharStatus };
})();
