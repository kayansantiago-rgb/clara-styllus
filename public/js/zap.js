/*
 * Mensagens do WhatsApp: modelos com {nome}, {loja}… que a loja pode mudar (Configurações → Loja), e
 * um editor que abre antes de mandar — dá para mudar o texto daquela mensagem e guardar como padrão.
 */
const Zap = (() => {
  const { esc, api, aviso } = U;

  const MODELOS = {
    crediario: {
      titulo: 'Cobrança do crediário',
      padrao: 'Olá, {nome}! Aqui é da {loja}. Passando para lembrar do seu crediário: saldo de {saldo}{vencido}. Qualquer dúvida estamos à disposição!',
      vars: { nome: 'primeiro nome', loja: 'nome da loja', saldo: 'quanto deve', vencido: '", sendo R$ … vencido" (quando tem)' },
    },
    parcela_hoje: {
      titulo: 'Parcela vencendo hoje',
      padrao: 'Olá, {nome}! Aqui é da {loja}. Lembrando que hoje vence sua parcela do crediário de {valor}. Obrigada!',
      vars: { nome: 'primeiro nome', loja: 'nome da loja', valor: 'valor da parcela' },
    },
    condicional: {
      titulo: 'Lembrete da condicional',
      padrao: 'Olá, {nome}! Aqui é da {loja} 💕 Passando para lembrar das peças da condicional (devolver até {prazo}). Gostou de alguma?',
      vars: { nome: 'primeiro nome', loja: 'nome da loja', prazo: 'data para devolver' },
    },
    reserva: {
      titulo: 'Lembrete da reserva',
      padrao: 'Olá, {nome}! Aqui é da {loja} 💕 Suas peças estão separadinhas te esperando (reserva até {prazo}). Falta {falta}. Quando vem buscar?',
      vars: { nome: 'primeiro nome', loja: 'nome da loja', prazo: 'data limite', falta: 'quanto falta pagar' },
    },
    espera: {
      titulo: 'Chegou a peça da lista de espera',
      padrao: 'Oi, {nome}! Aqui é da {loja} 💕 Chegou {peca}{preco} que você pediu! Quer que eu separe para você?',
      vars: { nome: 'primeiro nome', loja: 'nome da loja', peca: 'a peça', preco: '" (R$ …)" quando tem preço' },
    },
    aniversario: {
      titulo: 'Aniversário',
      padrao: 'Feliz aniversário, {nome}! 🎉 A {loja} deseja um dia lindo. Passa aqui na loja que temos um presente para você!',
      vars: { nome: 'primeiro nome', loja: 'nome da loja' },
    },
  };

  let cfg = {};
  const recarregar = async () => { try { cfg = await U.config(true); } catch { /* fica o que tinha */ } };
  const modelo = (chave) => (cfg[`msg_${chave}`] || '').trim() || MODELOS[chave].padrao;
  const preencher = (texto, vars) => texto.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  const telefone = (tel) => {
    const d = String(tel || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    return d.length === 10 || d.length === 11 ? `55${d}` : null;
  };
  const completar = (vars) => ({ loja: cfg.loja_nome || 'Clara Styllus', ...vars, nome: String(vars.nome || '').trim().split(/\s+/)[0] });

  /** Atributos do link do WhatsApp (href + dados para o editor). '' se não tem telefone válido. */
  function attrs(tel, chave, vars) {
    const t = telefone(tel);
    if (!t) return '';
    const v = completar(vars);
    const texto = preencher(modelo(chave), v);
    return `href="https://wa.me/${t}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener" data-zap="${chave}" data-zap-vars="${esc(JSON.stringify(v))}"`;
  }

  /** Volta o texto editado para modelo: troca os valores (Ana, R$ 100,00…) pelas {chaves}. */
  function paraModelo(texto, vars) {
    // "R$ 89,90" digitado tem espaço comum; o do sistema tem espaço que não quebra.
    const norm = (x) => String(x || '').replace(/\u00a0/g, ' ');
    const pares = Object.entries(vars).filter(([, v]) => norm(v).trim().length >= 2).sort((a, b) => norm(b[1]).length - norm(a[1]).length);
    let t = norm(texto);
    for (const [k, v] of pares) t = t.split(norm(v)).join(`{${k}}`);
    return t;
  }

  // ---------------------------------------------------------- editor
  let caixa = null;
  function editor(link) {
    const url = new URL(link.href);
    const numero = url.pathname.replace('/', '');
    const chave = link.dataset.zap && MODELOS[link.dataset.zap] ? link.dataset.zap : null;
    let vars = {};
    try { vars = JSON.parse(link.dataset.zapVars || '{}'); } catch { /* sem variáveis */ }
    const texto = chave ? preencher(modelo(chave), vars) : url.searchParams.get('text') || '';
    const admin = U.sessao.ehAdmin();
    if (!caixa) {
      caixa = document.createElement('div');
      caixa.className = 'zap-fundo';
      document.body.appendChild(caixa);
    }
    caixa.hidden = false;
    caixa.innerHTML = `
      <div class="zap-caixa" role="dialog" aria-modal="true">
        <header><b>${Icone('whatsapp')} Mensagem no WhatsApp</b><button type="button" class="fechar" data-zap-fechar aria-label="Fechar">${Icone('fechar')}</button></header>
        <p class="zap-para">Para <b>${esc(vars.nome || '')}</b> · ${esc(numero.replace(/^55/, '').replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3'))}${chave ? ` · <small>${esc(MODELOS[chave].titulo)}</small>` : ''}</p>
        <textarea id="zap-texto" rows="6">${esc(texto)}</textarea>
        ${chave && admin ? `<label class="check zap-padrao"><input type="checkbox" id="zap-salvar"> Usar este texto como padrão nas próximas mensagens
          <small>(nome, valores e datas trocam sozinhos)</small></label>` : ''}
        <div class="acoes">
          <button type="button" class="btn" data-zap-fechar>Cancelar</button>
          <button type="button" class="btn cl-btn-zap" id="zap-enviar">${Icone('whatsapp')} Abrir no WhatsApp</button>
        </div>
      </div>`;
    const area = caixa.querySelector('#zap-texto');
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
    const fechar = () => { caixa.hidden = true; caixa.innerHTML = ''; };
    caixa.onclick = (ev) => { if (ev.target === caixa || ev.target.closest('[data-zap-fechar]')) fechar(); };
    caixa.onkeydown = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); } };
    caixa.querySelector('#zap-enviar').onclick = async () => {
      const final = area.value.trim();
      if (!final) return aviso('Escreva a mensagem.', 'alerta');
      const salvar = caixa.querySelector('#zap-salvar');
      if (salvar && salvar.checked) {
        const novo = paraModelo(final, vars);
        try {
          await api('/api/config', { metodo: 'PUT', corpo: { [`msg_${chave}`]: novo === MODELOS[chave].padrao ? '' : novo } });
          await recarregar();
          aviso('Texto guardado como padrão.');
        } catch (e) { U.erro(e); }
      }
      window.open(`https://wa.me/${numero}?text=${encodeURIComponent(final)}`, '_blank', 'noopener');
      fechar();
    };
  }

  // Todo link de WhatsApp com mensagem pronta passa pelo editor (menos os que já têm o próprio editor).
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href^="https://wa.me/"]');
    if (!a || !a.href.includes('text=') || a.closest('.ci') || a.dataset.zapDireto !== undefined) return;
    ev.preventDefault();
    recarregar().then(() => editor(a));
  });
  recarregar();

  return { MODELOS, attrs, modelo, preencher, paraModelo, recarregar };
})();
