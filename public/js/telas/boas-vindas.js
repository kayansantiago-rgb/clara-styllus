/* Assistente de boas-vindas: deixa a loja pronta logo depois da instalação. */
Telas['boas-vindas'] = (() => {
  const { esc, api, aviso, erro } = U;
  let raiz;
  let passo = 0;
  let cfg = {};

  const PASSOS = [
    { titulo: 'Sua loja', sub: 'Nome e contato que saem no cupom', ico: 'loja' },
    { titulo: 'Impressoras', sub: 'Cupom e etiquetas', ico: 'impressora' },
    { titulo: 'Equipe', sub: 'Login de cada vendedora', ico: 'clientes' },
    { titulo: 'Preços e meta', sub: 'Markup e meta do mês', ico: 'grafico' },
    { titulo: 'Pronto!', sub: 'Começar a vender', ico: 'check' },
  ];

  async function abrir(el) {
    raiz = el;
    cfg = await U.config(true);
    desenhar();
  }

  function desenhar() {
    raiz.innerHTML = `
      <div class="bv">
        <aside class="bv-lado">
          <div class="bv-marca"><span class="marca-logo"><img src="/img/cs.png" alt="CS"></span><div><b>Boas-vindas!</b><small>Vamos deixar a loja pronta em poucos minutos.</small></div></div>
          <ol class="bv-passos">${PASSOS.map((p, i) => `
            <li class="${i === passo ? 'atual' : i < passo ? 'feito' : ''}" data-ir="${i}">
              <span class="bv-num">${i < passo ? Icone('check') : i + 1}</span>
              <span><b>${p.titulo}</b><small>${p.sub}</small></span></li>`).join('')}</ol>
          <button class="link bv-pular" id="pular">${passo === 4 ? 'Ir para o painel' : 'Pular e configurar depois'}</button>
        </aside>
        <section class="bv-conteudo">
          <form id="f-bv" autocomplete="off">
            <div class="bv-cab"><span class="bv-ico">${Icone(PASSOS[passo].ico)}</span>
              <div><small>Passo ${passo + 1} de ${PASSOS.length}</small><h2>${PASSOS[passo].titulo}</h2></div></div>
            <div class="bv-corpo">${[passoLoja, passoImpressoras, passoEquipe, passoPrecos, passoPronto][passo]()}</div>
            <div class="bv-rodape">
              ${passo > 0 && passo < 4 ? '<button type="button" class="btn btn-fantasma" id="voltar">Voltar</button>' : '<span></span>'}
              ${passo < 4 ? `<button class="btn btn-primario btn-grande">${passo === 3 ? 'Concluir' : 'Continuar'} ${Icone('seta')}</button>` : ''}
            </div>
          </form>
        </section>
      </div>`;
    const form = raiz.querySelector('#f-bv');
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      if (!(await salvarPasso(form))) return;
      passo = Math.min(4, passo + 1);
      if (passo === 4) await concluir();
      desenhar();
    };
    raiz.querySelector('#voltar')?.addEventListener('click', () => { passo--; desenhar(); });
    raiz.querySelector('#pular').onclick = async () => {
      await concluir();
      location.hash = '#/inicio';
    };
    raiz.querySelector('.bv-passos').onclick = (ev) => {
      const li = ev.target.closest('[data-ir]');
      if (li && Number(li.dataset.ir) < passo) { passo = Number(li.dataset.ir); desenhar(); }
    };
    [ligarImpressoras, ligarEquipe][passo - 1]?.();
    form.querySelector('input:not([type=checkbox])')?.focus();
  }

  const campo = (nome, rotulo, extra = '') => `<label>${rotulo}<input name="${nome}" value="${esc(cfg[nome])}" ${extra}></label>`;

  // ------------------------------------------------------------ passos
  function passoLoja() {
    return `<p class="dica">Esses dados aparecem no topo do cupom. Dá para mudar depois em Configurações.</p>
      ${campo('loja_nome', 'Nome da loja *', 'required class="campo-destaque"')}
      <div class="fp-grid3">
        ${campo('loja_telefone', 'Telefone / WhatsApp', 'placeholder="(63) 99999-9999"')}
        ${campo('loja_instagram', 'Instagram', 'placeholder="@clarastyllus"')}
        ${campo('loja_cnpj', 'CNPJ', 'placeholder="Opcional"')}
      </div>
      <div class="grade-form">
        ${campo('loja_endereco', 'Endereço', 'placeholder="Rua, número, bairro"')}
        ${campo('loja_cidade', 'Cidade / UF', 'placeholder="Ex.: Palmas - TO"')}
      </div>`;
  }

  function passoImpressoras() {
    const op = (nome, v, t) => `<option value="${v}" ${cfg[nome] === v ? 'selected' : ''}>${t}</option>`;
    return `<p class="dica">Ligue as impressoras no computador e instale o driver de cada uma antes. O sistema imprime direto, sem abrir a janela de impressão.</p>
      <div class="bv-blocos">
        <div class="bv-bloco">
          <h4>${Icone('recibo')} Impressora de cupom</h4>
          <label>Impressora<select name="impressora_cupom" data-impressoras><option value="${esc(cfg.impressora_cupom)}">${esc(cfg.impressora_cupom || 'Procurando…')}</option></select></label>
          <label>Largura do papel<select name="cupom_colunas">${op('cupom_colunas', '48', '80 mm (mais comum)')}${op('cupom_colunas', '32', '58 mm')}</select></label>
          <button type="button" class="btn" data-teste="cupom">${Icone('impressora')} Imprimir teste</button>
        </div>
        <div class="bv-bloco">
          <h4>${Icone('etiqueta')} Impressora de etiquetas</h4>
          <label>Impressora<select name="impressora_etiqueta" data-impressoras><option value="${esc(cfg.impressora_etiqueta)}">${esc(cfg.impressora_etiqueta || 'Procurando…')}</option></select></label>
          <label>Linguagem<select name="impressao_etiqueta_modo">${op('impressao_etiqueta_modo', 'zpl', 'ZPL (Zebra, Elgin L42 Pro)')}${op('impressao_etiqueta_modo', 'epl', 'EPL / PPLB (Argox)')}${op('impressao_etiqueta_modo', 'tspl', 'TSPL (Knup, TSC, Xprinter, genéricas)')}${op('impressao_etiqueta_modo', 'navegador', 'Folha A4 (impressora comum)')}</select></label>
          <div class="grade-form">${campo('etiqueta_largura_mm', 'Largura (mm)', 'type="number" min="15" max="120"')}${campo('etiqueta_altura_mm', 'Altura (mm)', 'type="number" min="10" max="120"')}</div>
          <button type="button" class="btn" data-teste="etiqueta">${Icone('etiqueta')} Imprimir teste</button>
        </div>
      </div>
      <p class="dica">Ainda não tem impressora? Pode continuar — é só configurar depois em Configurações.</p>`;
  }

  async function ligarImpressoras() {
    const form = raiz.querySelector('#f-bv');
    let lista = [];
    try { lista = await api('/api/impressoras'); } catch { /* sem lista */ }
    form.querySelectorAll('[data-impressoras]').forEach((sel) => {
      const atual = cfg[sel.name] || '';
      const nomes = [...new Set([...(atual ? [atual] : []), ...lista])];
      sel.innerHTML = '<option value="">— nenhuma por enquanto —</option>' +
        nomes.map((n) => `<option ${n === atual ? 'selected' : ''}>${esc(n)}</option>`).join('');
    });
    form.querySelectorAll('[data-teste]').forEach((b) => {
      b.onclick = async () => {
        try {
          await api('/api/imprimir/teste', { metodo: 'POST', corpo: { alvo: b.dataset.teste, config: dados(form) } });
          aviso('Teste enviado para a impressora.');
        } catch (e) { erro(e); }
      };
    });
  }

  function passoEquipe() {
    return `<p class="dica">Cada vendedora entra com o próprio usuário: as vendas e o caixa ficam no nome dela. Vendedora não vê relatórios nem configurações.</p>
      <div id="equipe" class="bv-equipe"></div>
      <div class="bv-bloco">
        <h4>${Icone('mais')} Adicionar vendedora</h4>
        <div class="fp-grid3">
          <label>Nome<input id="v-nome" placeholder="Ex.: Ana"></label>
          <label>Usuário<input id="v-login" placeholder="Ex.: ana" autocapitalize="off"></label>
          <label>Senha${U.campoSenha('v-senha', 'minlength="4"')}</label>
        </div>
        <button type="button" class="btn btn-claro" id="v-add">${Icone('mais')} Adicionar</button>
      </div>`;
  }

  async function ligarEquipe() {
    U.ligarOlhos(raiz);
    const box = raiz.querySelector('#equipe');
    const listar = async () => {
      try {
        const us = await api('/api/usuarios');
        box.innerHTML = us.map((u) => `<div class="bv-pessoa"><span class="avatar">${esc(u.nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase())}</span>
          <span><b>${esc(u.nome)}</b><small>${esc(u.login)} · ${u.perfil === 'admin' ? 'administrador(a)' : 'vendedor(a)'}</small></span></div>`).join('');
      } catch (e) { erro(e); }
    };
    raiz.querySelector('#v-add').onclick = async () => {
      const nome = raiz.querySelector('#v-nome').value.trim();
      const login = raiz.querySelector('#v-login').value.trim();
      const senha = raiz.querySelector('[name="v-senha"]').value;
      if (!nome || !login || senha.length < 4) return aviso('Preencha nome, usuário e uma senha de pelo menos 4 caracteres.', 'alerta');
      try {
        await api('/api/usuarios', { metodo: 'POST', corpo: { nome, login, senha, perfil: 'vendedor' } });
        aviso(`${nome} cadastrada.`);
        raiz.querySelectorAll('#v-nome, #v-login, [name="v-senha"]').forEach((x) => { x.value = ''; });
        listar();
      } catch (e) { erro(e); }
    };
    listar();
  }

  function passoPrecos() {
    return `<p class="dica">Com o markup, o sistema sugere o preço de venda quando você digita o custo da peça. A meta aparece no painel Início.</p>
      <div class="grade-form">
        <label>Markup padrão <small>ex.: 2,2 = custo × 2,2</small><input name="markup_padrao" inputmode="decimal" value="${esc(cfg.markup_padrao)}" placeholder="vazio = não sugerir"></label>
        <label>Meta de vendas do mês<div class="campo-moeda"><span>R$</span><input name="meta_mensal" inputmode="decimal" value="${cfg.meta_mensal ? U.num(cfg.meta_mensal) : ''}" placeholder="Ex.: 30.000,00"></div></label>
      </div>`;
  }

  function passoPronto() {
    return `<div class="bv-pronto">
        <div class="caixa-abrir-ico">${Icone('check')}</div>
        <h3>Tudo pronto, ${esc(U.sessao.usuario.nome.split(' ')[0])}!</h3>
        <p>Agora é cadastrar as peças e abrir o caixa. Algumas dicas para começar:</p>
        <div class="bv-dicas">
          <a href="#/produtos" class="bv-dica">${Icone('roupa')}<b>Cadastrar produtos</b><small>Com tamanhos, cores e quantidades de uma vez.</small></a>
          <a href="#/etiquetas" class="bv-dica">${Icone('etiqueta')}<b>Imprimir etiquetas</b><small>Com código de barras para bipar no caixa.</small></a>
          <a href="#/pdv" class="bv-dica destaque">${Icone('sacola')}<b>Abrir o caixa</b><small>Contar o troco e começar a vender.</small></a>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------ salvar
  function dados(form) {
    const d = {};
    for (const el of form.elements) if (el.name && !el.name.startsWith('v-')) d[el.name] = el.value;
    if ('meta_mensal' in d) d.meta_mensal = d.meta_mensal ? String(U.paraCentavos(d.meta_mensal) || '') : '';
    return d;
  }

  async function salvarPasso(form) {
    const d = dados(form);
    if (!Object.keys(d).length) return true;
    try {
      await api('/api/config', { metodo: 'PUT', corpo: d });
      cfg = await U.config(true);
      return true;
    } catch (e) { erro(e); return false; }
  }

  async function concluir() {
    try {
      await api('/api/config', { metodo: 'PUT', corpo: { boas_vindas_ok: '1' } });
      await U.config(true);
    } catch (e) { erro(e); }
  }

  return { abrir, sair: () => { raiz = null; passo = 0; } };
})();
