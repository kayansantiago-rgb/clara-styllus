/* Utilidades compartilhadas pelas telas. */
const U = (() => {
  async function api(caminho, { metodo = 'GET', corpo } = {}) {
    let res;
    try {
      res = await fetch(caminho, {
        method: metodo,
        headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      throw new Error('Sem conexão com o servidor do PDV. Ele está aberto?');
    }
    const dados = await res.json().catch(() => ({}));
    if (res.status === 401 && !caminho.startsWith('/api/login') && window.exigirLogin) {
      window.exigirLogin();
    }
    if (!res.ok) {
      const e = new Error(dados.erro || `Erro ${res.status}`);
      e.status = res.status;
      throw e;
    }
    return dados;
  }

  const fmtBrl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (centavos) => fmtBrl.format((Number(centavos) || 0) / 100);
  const num = (centavos) =>
    ((Number(centavos) || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  /** "1.234,56" | "1234.56" | "12" -> centavos (inteiro). Retorna NaN se inválido. */
  function paraCentavos(valor) {
    let s = String(valor ?? '').trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.500" = mil e quinhentos
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  }

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function dataHora(s) {
    if (!s) return '';
    const [d, h = ''] = s.split(' ');
    const [a, m, dia] = d.split('-');
    return `${dia}/${m}/${a}${h ? ' ' + h.slice(0, 5) : ''}`;
  }

  const hoje = () => new Date().toLocaleDateString('sv-SE');

  function cpf(s) {
    const d = String(s || '').replace(/\D/g, '');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return d;
  }

  function cpfValido(s) {
    const d = String(s || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (const t of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
      if (((soma * 10) % 11) % 10 !== Number(d[t])) return false;
    }
    return true;
  }

  function aviso(msg, tipo = 'ok') {
    const el = document.createElement('div');
    el.className = `aviso aviso-${tipo}`;
    el.textContent = msg;
    document.getElementById('avisos').append(el);
    setTimeout(() => el.remove(), tipo === 'erro' ? 6000 : 3000);
  }

  const erro = (e) => aviso(e.message || String(e), 'erro');

  // --------------------------------------------------------------- modal
  let aoFecharModal = null;
  function abrirModal(titulo, html, { largura, aoFechar } = {}) {
    document.getElementById('modal-titulo').textContent = titulo;
    const corpo = document.getElementById('modal-corpo');
    corpo.innerHTML = html;
    const fundo = document.getElementById('modal-fundo');
    fundo.querySelector('.modal').style.maxWidth = largura || '';
    fundo.hidden = false;
    aoFecharModal = aoFechar || null;
    const foco = corpo.querySelector('[autofocus]') || corpo.querySelector('input, select, button');
    if (foco) setTimeout(() => foco.focus(), 0);
    return corpo;
  }
  function fecharModal() {
    const fundo = document.getElementById('modal-fundo');
    if (fundo.hidden) return;
    fundo.hidden = true;
    document.getElementById('modal-corpo').innerHTML = '';
    const cb = aoFecharModal;
    aoFecharModal = null;
    if (cb) cb();
  }
  const modalAberto = () => !document.getElementById('modal-fundo').hidden;

  function confirmar(titulo, mensagem, { ok = 'Confirmar', perigo = false } = {}) {
    return new Promise((resolve) => {
      let resposta = false;
      const corpo = abrirModal(titulo, `
        <p>${esc(mensagem)}</p>
        <div class="acoes">
          <button class="btn" data-fechar>Voltar</button>
          <button class="btn ${perigo ? 'btn-perigo' : 'btn-primario'}" data-ok autofocus>${esc(ok)}</button>
        </div>`, { aoFechar: () => resolve(resposta), largura: '420px' });
      corpo.querySelector('[data-ok]').onclick = () => {
        resposta = true;
        fecharModal();
      };
    });
  }

  function perguntar(titulo, rotulo, { valor = '', tipo = 'text', obrigatorio = true } = {}) {
    return new Promise((resolve) => {
      let resposta = null;
      const corpo = abrirModal(titulo, `
        <form class="form">
          <label>${esc(rotulo)}<input name="v" type="${tipo}" value="${esc(valor)}" autofocus
            ${obrigatorio ? 'required' : ''}></label>
          <div class="acoes">
            <button type="button" class="btn" data-fechar>Voltar</button>
            <button class="btn btn-primario">OK</button>
          </div>
        </form>`, { aoFechar: () => resolve(resposta), largura: '420px' });
      corpo.querySelector('form').onsubmit = (ev) => {
        ev.preventDefault();
        resposta = ev.target.v.value;
        fecharModal();
      };
    });
  }

  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-fechar]') || ev.target.id === 'modal-fundo') fecharModal();
  });

  // ----------------------------------------------------- armazenamento
  const local = {
    ler(chave, padrao) {
      try {
        const v = localStorage.getItem(chave);
        return v ? JSON.parse(v) : padrao;
      } catch {
        return padrao;
      }
    },
    gravar(chave, valor) {
      try {
        localStorage.setItem(chave, JSON.stringify(valor));
      } catch { /* sem armazenamento local: ignora */ }
    },
  };

  // --------------------------------------------------------- config
  let cacheConfig = null;
  async function config(recarregar = false) {
    if (!cacheConfig || recarregar) cacheConfig = await api('/api/config');
    return cacheConfig;
  }

  function debounce(fn, ms = 250) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  /** Serializa um <form> em objeto simples. */
  const dadosForm = (form) => Object.fromEntries(new FormData(form).entries());

  const FORMAS = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    debito: 'Cartão de débito',
    credito: 'Cartão de crédito',
    crediario: 'Crediário',
    vale: 'Vale-troca',
    outro: 'Outro',
  };

  // ----------------------------------------------------- usuário logado
  let usuarioAtual = null;
  const sessao = {
    get usuario() { return usuarioAtual; },
    definir(u) { usuarioAtual = u; },
    ehAdmin: () => !!usuarioAtual && usuarioAtual.perfil === 'admin',
  };

  // --------------------------------------------------------------- som
  // Sons sintetizados (sem arquivos): timbre de "marimba" suave, com um eco curto para soar mais redondo.
  let audio = null;
  let saida = null;
  const VOLUME = { baixo: 0.35, medio: 0.7, alto: 1 };
  const SONS = {
    ok: [[1568, 0, 0.16, 0.5]], // bipe: uma nota curta (sol)
    sucesso: [[1047, 0, 0.5, 0.45], [1319, 0.09, 0.5, 0.42], [1568, 0.18, 0.7, 0.45], [2093, 0.3, 0.9, 0.3]], // acorde subindo
    erro: [[523, 0, 0.22, 0.55], [392, 0.14, 0.35, 0.55]], // duas notas descendo, sem chiado
    alerta: [[880, 0, 0.18, 0.4], [880, 0.2, 0.25, 0.4]],
    meta: [[784, 0, 0.3, 0.4], [988, 0.1, 0.3, 0.4], [1175, 0.2, 0.3, 0.4], [1568, 0.32, 1.1, 0.5], [1976, 0.32, 1.1, 0.25]],
  };
  function nota(freq, ini, dur, vol) {
    const t = audio.currentTime + ini;
    const g = audio.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(saida);
    // Fundamental + harmônico suave dão o timbre de "madeira/vidro".
    for (const [mult, tipo, peso] of [[1, 'sine', 1], [2.76, 'sine', 0.18], [1, 'triangle', 0.25]]) {
      const o = audio.createOscillator();
      const gp = audio.createGain();
      o.type = tipo;
      o.frequency.value = freq * mult;
      gp.gain.value = peso;
      o.connect(gp).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
  /** Som de retorno: 'ok' (bipe), 'erro', 'sucesso' (venda concluída), 'alerta' ou 'meta'. */
  function som(tipo = 'ok', forcar = false, volume = null) {
    const cfg = cacheConfig || {};
    if (!forcar && cfg.som_bipe === '0') return;
    try {
      if (!audio) {
        audio = new (window.AudioContext || window.webkitAudioContext)();
        const mestre = audio.createGain();
        const eco = audio.createDelay();
        const ecoVol = audio.createGain();
        eco.delayTime.value = 0.09;
        ecoVol.gain.value = 0.18;
        mestre.connect(audio.destination);
        mestre.connect(eco).connect(ecoVol).connect(audio.destination);
        saida = mestre;
      }
      if (audio.state === 'suspended') audio.resume();
      saida.gain.value = 0.22 * (VOLUME[volume || cfg.som_volume] || VOLUME.medio);
      for (const [f, ini, dur, vol] of SONS[tipo] || SONS.ok) nota(f, ini, dur, vol);
    } catch { /* sem áudio: segue sem som */ }
  }

  // ------------------------------------------------------- clique duplo
  /**
   * Evita gravar duas vezes (clique duplo, Enter repetido): enquanto `fn` roda, os botões de `el`
   * ficam desativados e novos envios são ignorados.
   */
  function umaVez(el, fn) {
    return async (...args) => {
      if (el._ocupado) {
        if (args[0] && args[0].preventDefault) args[0].preventDefault();
        return undefined;
      }
      el._ocupado = true;
      const botoes = el.matches('button') ? [el] : [...el.querySelectorAll('button:not([data-fechar])')];
      botoes.forEach((b) => { b.disabled = true; });
      try {
        return await fn(...args);
      } finally {
        el._ocupado = false;
        botoes.forEach((b) => { b.disabled = false; });
      }
    };
  }

  // -------------------------------------------------------------- taxas
  // Mesma regra de src/taxas.js: taxa por parcela e grupo de bandeira (tabela da maquininha).
  const BANDEIRAS = { visa_master: 'Visa / Master', elo_amex: 'Elo / Amex' };
  const pct = (v) => {
    const n = Number(String(v ?? '').replace('%', '').replace(',', '.').trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  function taxa(cfg, forma, parcelas = 1, bandeira = 'visa_master') {
    if (forma === 'pix') return pct(cfg.taxa_pix);
    if (forma !== 'debito' && forma !== 'credito') return 0;
    let t = null;
    try { t = JSON.parse(cfg.taxas_tabela || 'null'); } catch { t = null; }
    const linha = t && (t[bandeira] || t.visa_master);
    if (linha) {
      const k = forma === 'debito' ? 'debito' : String(Math.min(12, Math.max(1, Number(parcelas) || 1)));
      if (linha[k] !== undefined && linha[k] !== '') return pct(linha[k]);
    }
    if (forma === 'debito') return pct(cfg.taxa_debito);
    if (parcelas <= 1) return pct(cfg.taxa_credito_vista);
    if (parcelas <= 6) return pct(cfg.taxa_credito_2a6);
    return pct(cfg.taxa_credito_7a12);
  }
  /** Juros repassados à cliente (crédito com `juros_a_partir` parcelas ou mais). Igual a src/taxas.js. */
  function juros(cfg, forma, parcelas, valor, bandeira) {
    const aPartir = Number(cfg.juros_a_partir) || 0;
    if (forma !== 'credito' || !aPartir || (Number(parcelas) || 1) < aPartir) return 0;
    const p = taxa(cfg, forma, parcelas, bandeira);
    if (!p || p >= 100) return 0;
    return Math.ceil(valor / (1 - p / 100) - 1e-9) - valor;
  }
  const pctTxt = (n) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

  // ------------------------------------------------------------ sem zoom
  // A tela não amplia nem diminui (Ctrl + rodinha, Ctrl +/−, pinça no touchpad ou na tela de toque).
  // Ctrl + 0 continua funcionando: volta para 100% se a tela já estava com zoom.
  window.addEventListener('wheel', (ev) => { if (ev.ctrlKey) ev.preventDefault(); }, { passive: false });
  window.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ['+', '-', '=', '_', 'Add', 'Subtract'].includes(ev.key)) ev.preventDefault();
    if ((ev.ctrlKey || ev.metaKey) && ['NumpadAdd', 'NumpadSubtract', 'Equal', 'Minus'].includes(ev.code)) ev.preventDefault();
  }, true);
  for (const tipo of ['gesturestart', 'gesturechange']) document.addEventListener(tipo, (ev) => ev.preventDefault());
  document.addEventListener('touchmove', (ev) => { if (ev.touches && ev.touches.length > 1) ev.preventDefault(); }, { passive: false });

  // ------------------------------------------------ sem sugestões do navegador
  // Nenhum campo do sistema mostra a lista de palavras/números digitados antes, nem corretor
  // ortográfico. As listas próprias do sistema (ex.: tamanhos e cores na grade) continuam.
  const SEM_TIPO = /^(checkbox|radio|file|hidden|range|color|submit|button|password)$/;
  function semSugestoes(el) {
    if (!el || el.nodeType !== 1) return;
    const campos = el.matches('input, textarea, form') ? [el] : [];
    campos.push(...el.querySelectorAll('input, textarea, form'));
    for (const c of campos) {
      if (c.tagName === 'INPUT' && SEM_TIPO.test(c.type)) continue;
      if (c.getAttribute('autocomplete') !== 'off') c.setAttribute('autocomplete', 'off');
      if (c.tagName !== 'FORM') {
        c.setAttribute('spellcheck', 'false');
        c.setAttribute('autocorrect', 'off');
      }
    }
  }
  semSugestoes(document.body);
  new MutationObserver((mudancas) => {
    for (const m of mudancas) for (const n of m.addedNodes) semSugestoes(n);
  }).observe(document.body, { childList: true, subtree: true });

  // -------------------------------------------------------------- fotos
  const fotoUrl = (p) => (p && p.foto_versao ? `/api/produtos/${p.id}/foto?v=${p.foto_versao}` : null);

  /** Miniatura da peça (ou um ícone quando não tem foto). */
  const miniatura = (p, classe = 'mini-foto') => {
    const url = fotoUrl(p);
    return url ? `<img class="${classe}" src="${url}" alt="" loading="lazy">` : `<span class="${classe} sem-foto">${Icone('roupa')}</span>`;
  };

  /** Lê um arquivo de imagem e devolve um JPEG reduzido (dataURL) para não pesar no banco. */
  function reduzirImagem(arquivo, lado = 480) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, lado / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Não consegui abrir a imagem.'));
      img.src = URL.createObjectURL(arquivo);
    });
  }

  return {
    som, fotoUrl, miniatura, reduzirImagem,
    sessao,
    api, brl, num, paraCentavos, esc, dataHora, hoje, cpf, cpfValido, aviso, erro,
    abrirModal, fecharModal, modalAberto, confirmar, perguntar, local, config, debounce,
    dadosForm, FORMAS, taxa, juros, pctTxt, BANDEIRAS, umaVez,
  };
})();

/** Registro das telas; cada arquivo em js/telas adiciona a sua. */
const Telas = {};
