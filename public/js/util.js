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
    outro: 'Outro',
  };

  // ----------------------------------------------------- usuário logado
  let usuarioAtual = null;
  const sessao = {
    get usuario() { return usuarioAtual; },
    definir(u) { usuarioAtual = u; },
    ehAdmin: () => !!usuarioAtual && usuarioAtual.perfil === 'admin',
  };

  return {
    sessao,
    api, brl, num, paraCentavos, esc, dataHora, hoje, cpf, cpfValido, aviso, erro,
    abrirModal, fecharModal, modalAberto, confirmar, perguntar, local, config, debounce,
    dadosForm, FORMAS,
  };
})();

/** Registro das telas; cada arquivo em js/telas adiciona a sua. */
const Telas = {};
