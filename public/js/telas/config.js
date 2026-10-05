/* Configurações da loja, do cupom, das etiquetas e backup. */
Telas.config = (() => {
  const { esc, api, aviso, erro } = U;

  const opcaoAtual = (nome) =>
    nome ? `<option value="${esc(nome)}" selected>${esc(nome)}</option>` : '<option value="">— escolha —</option>';

  async function carregarImpressoras(raiz, avisar) {
    let lista;
    try {
      lista = await api('/api/impressoras');
    } catch (e) {
      if (avisar) erro(e);
      return;
    }
    raiz.querySelectorAll('[data-impressoras]').forEach((sel) => {
      const atual = sel.value;
      const nomes = [...new Set([...(atual ? [atual] : []), ...lista])];
      sel.innerHTML = '<option value="">— escolha —</option>' +
        nomes.map((n) => `<option ${n === atual ? 'selected' : ''}>${esc(n)}</option>`).join('');
    });
    if (avisar) aviso(lista.length ? `${lista.length} impressora(s) encontrada(s).` : 'Nenhuma impressora instalada no Windows.', lista.length ? 'ok' : 'alerta');
  }

  function lerForm(form) {
    const dados = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      dados[el.name] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
    }
    if (dados.crediario_limite_padrao) dados.crediario_limite_padrao = String(U.paraCentavos(dados.crediario_limite_padrao) || '');
    if (dados.meta_mensal) dados.meta_mensal = String(U.paraCentavos(dados.meta_mensal) || '');
    for (const k of ['taxa_debito', 'taxa_credito_vista', 'taxa_credito_2a6', 'taxa_credito_7a12', 'taxa_pix']) {
      if (dados[k]) dados[k] = dados[k].replace('%', '').trim();
    }
    return dados;
  }

  async function abrir(raiz) {
    const c = await U.config(true);
    const campo = (nome, rotulo, extra = '') =>
      `<label>${rotulo}<input name="${nome}" value="${esc(c[nome])}" ${extra}></label>`;
    const check = (nome, rotulo) =>
      `<label class="check"><input type="checkbox" name="${nome}" ${c[nome] === '1' ? 'checked' : ''}> ${rotulo}</label>`;
    const sel = (nome, rotulo, opcoes) => `<label>${rotulo}<select name="${nome}">${opcoes.map(([v, t]) =>
      `<option value="${v}" ${c[nome] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;

    raiz.innerHTML = `
      <div class="cabecalho-tela"><h1>Configurações</h1></div>
      <form id="f-cfg">
        <div class="cartao">
          <h3>Dados da loja (aparecem no cupom)</h3>
          <div class="grade-form">
            ${campo('loja_nome', 'Nome fantasia')}
            ${campo('loja_razao_social', 'Razão social')}
            ${campo('loja_cnpj', 'CNPJ')}
            ${campo('loja_ie', 'Inscrição estadual')}
            ${campo('loja_endereco', 'Endereço')}
            ${campo('loja_cidade', 'Cidade / UF')}
            ${campo('loja_telefone', 'Telefone / WhatsApp')}
            ${campo('loja_instagram', 'Instagram')}
          </div>
        </div>
        <div class="cartao">
          <h3><i data-icone="recibo"></i> Impressora de cupom</h3>
          <p class="dica"><b>Impressão direta</b> manda o cupom pronto para a térmica (Elgin i7/i8/i9, Epson TM-T20,
            Bematech MP-4200 em modo ESC/POS, Daruma, Tanca, Knup…): sai sempre do mesmo jeito, sem margens nem
            janela de impressão, e ainda abre a gaveta de dinheiro.</p>
          <div class="grade-form">
            ${sel('impressao_cupom_modo', 'Como imprimir', [['direta', 'Direto na impressora térmica (recomendado)'], ['navegador', 'Pela janela do navegador']])}
            <label>Impressora
              <span class="campo-com-botao">
                <select name="impressora_cupom" data-impressoras>${opcaoAtual(c.impressora_cupom)}</select>
                <button type="button" class="btn" data-atualizar-imp title="Procurar impressoras">↻</button>
              </span></label>
            ${sel('cupom_largura_mm', 'Largura do papel', [['80', '80 mm'], ['58', '58 mm']])}
            ${sel('cupom_colunas', 'Letras por linha', [['48', '48 (80 mm, padrão)'], ['42', '42 (80 mm, letra maior)'], ['32', '32 (58 mm)']])}
            ${sel('cupom_acentos', 'Acentos', [['cp850', 'Com acentos (página 850)'], ['sem', 'Sem acentos (se sair caractere estranho)']])}
            ${sel('cupom_vias', 'Vias', [['1', '1 via'], ['2', '2 vias (cliente + loja)']])}
            <label class="col2">Mensagem no rodapé<textarea name="cupom_mensagem" rows="2">${esc(c.cupom_mensagem)}</textarea></label>
            ${check('impressao_automatica', 'Imprimir o cupom automaticamente ao concluir a venda')}
            ${check('cupom_corte', 'Cortar o papel no final (guilhotina)')}
            ${check('gaveta_abrir', 'Abrir a gaveta de dinheiro em venda com dinheiro')}
            <div class="acoes acoes-esq col2"><button type="button" class="btn" data-teste="cupom"><i data-icone="impressora"></i> Imprimir teste de cupom</button></div>
          </div>
        </div>
        <div class="cartao">
          <h3><i data-icone="etiqueta"></i> Impressora de etiquetas</h3>
          <p class="dica"><b>ZPL</b>: Zebra, Elgin L42 Pro, Argox e a maioria das atuais. <b>EPL</b>: Zebra LP/TLP antigas,
            Elgin L42 e Argox em modo PPLB. <b>Navegador</b>: só para etiquetas em folha A4 de impressora comum.</p>
          <div class="grade-form tres">
            ${sel('impressao_etiqueta_modo', 'Linguagem', [['zpl', 'ZPL (recomendado)'], ['epl', 'EPL / PPLB'], ['tspl', 'TSPL (etiquetadoras genéricas, TSC, Gprinter, Xprinter)'], ['navegador', 'Folha A4 pelo navegador']])}
            <label class="col2">Impressora
              <span class="campo-com-botao">
                <select name="impressora_etiqueta" data-impressoras>${opcaoAtual(c.impressora_etiqueta)}</select>
                <button type="button" class="btn" data-atualizar-imp title="Procurar impressoras">↻</button>
              </span></label>
            ${sel('etiqueta_dpi', 'Resolução', [['203', '203 dpi (padrão)'], ['300', '300 dpi']])}
            ${campo('etiqueta_largura_mm', 'Largura da etiqueta (mm)', 'type="number" min="15" max="200"')}
            ${campo('etiqueta_altura_mm', 'Altura da etiqueta (mm)', 'type="number" min="10" max="200"')}
            ${campo('etiqueta_colunas', 'Etiquetas lado a lado', 'type="number" min="1" max="8"')}
            ${campo('etiqueta_espaco_mm', 'Espaço entre colunas (mm)', 'type="number" min="0" max="20" step="0.5"')}
            ${campo('etiqueta_margem_mm', 'Margem interna (mm)', 'type="number" min="0" max="10" step="0.5"')}
            ${campo('etiqueta_gap_mm', 'Espaço entre etiquetas no rolo (mm)', 'type="number" min="0" max="20" step="0.5"')}
            ${check('etiqueta_mostrar_loja', 'Mostrar nome da loja')}
            ${check('etiqueta_mostrar_preco', 'Mostrar preço')}
            <div class="acoes acoes-esq col2"><button type="button" class="btn" data-teste="etiqueta"><i data-icone="etiqueta"></i> Imprimir etiqueta de teste</button></div>
          </div>
        </div>
        <div class="cartao">
          <h3><i data-icone="cartao"></i> Taxas das maquininhas</h3>
          <p class="dica">Coloque a porcentagem que a maquininha (Stone, Cielo, PagSeguro, Mercado Pago…) desconta.
            O sistema grava a taxa em cada venda e mostra nos Relatórios quanto realmente cai na conta.
            Deixe vazio o que não tem taxa.</p>
          <div class="grade-form tres">
            ${campo('taxa_debito', 'Débito (%)', 'inputmode="decimal" placeholder="ex.: 1,99"')}
            ${campo('taxa_credito_vista', 'Crédito à vista (%)', 'inputmode="decimal" placeholder="ex.: 3,19"')}
            ${campo('taxa_credito_2a6', 'Crédito 2 a 6x (%)', 'inputmode="decimal" placeholder="ex.: 4,59"')}
            ${campo('taxa_credito_7a12', 'Crédito 7 a 12x (%)', 'inputmode="decimal" placeholder="ex.: 5,99"')}
            ${campo('taxa_pix', 'PIX (%)', 'inputmode="decimal" placeholder="geralmente 0"')}
          </div>
        </div>
        <div class="cartao">
          <h3><i data-icone="caderno"></i> Crediário</h3>
          <div class="grade-form tres">
            ${campo('crediario_max_parcelas', 'Máximo de parcelas', 'type="number" min="1" max="24"')}
            ${campo('crediario_dias_primeira', '1º vencimento (dias após a compra)', 'type="number" min="1" max="120"')}
            <label>Limite padrão por cliente (R$) <small>vazio = sem limite</small>
              <input name="crediario_limite_padrao" data-dinheiro inputmode="decimal" value="${c.crediario_limite_padrao ? U.num(c.crediario_limite_padrao) : ''}"></label>
            ${check('crediario_bloquear_atraso', 'Não vender fiado para quem tem parcela atrasada')}
          </div>
        </div>
        <div class="cartao">
          <h3><i data-icone="nuvem"></i> Backup automático</h3>
          <p class="dica">Uma cópia dos dados é feita <b>ao fechar o caixa</b> e, se o computador ficar ligado, <b>uma vez por dia</b>.
            Para se proteger de defeito no computador, use a segunda pasta: um <b>pendrive</b> ou uma pasta do
            <b>Google Drive / OneDrive</b> que sincroniza sozinha com a internet.</p>
          <div class="grade-form">
            ${check('backup_auto', 'Fazer backup automático')}
            ${campo('backup_manter', 'Quantas cópias guardar', 'type="number" min="3" max="365"')}
            <label class="col2">Pasta dos backups <small>vazio = pasta padrão do sistema</small>
              <input name="backup_pasta" value="${esc(c.backup_pasta)}" placeholder="padrão: C:\\ProgramData\\ClaraStyllus\\backups"></label>
            <label class="col2">Segunda cópia (pendrive ou Google Drive) <small>opcional</small>
              <input name="backup_pasta_extra" value="${esc(c.backup_pasta_extra)}" placeholder="ex.: E:\\Backup Clara Styllus  ou  C:\\Users\\Clara\\Google Drive\\Backup PDV"></label>
          </div>
        </div>
        <div class="cartao">
          <h3>Regras de venda</h3>
          <div class="grade-form">
            <label>Markup padrão (preço sugerido) <small>ex.: 2,2 = custo × 2,2</small>
              <input name="markup_padrao" inputmode="decimal" value="${esc(c.markup_padrao)}" placeholder="vazio = não sugerir"></label>
            ${sel('arredondar_preco', 'Arredondar preços para', [['90', 'terminar em ,90'], ['99', 'terminar em ,99'], ['00', 'terminar em ,00 (redondo)'], ['', 'não arredondar']])}
            <label>Meta de vendas do mês (R$) <small>aparece no painel Início</small>
              <input name="meta_mensal" inputmode="decimal" value="${c.meta_mensal ? U.num(c.meta_mensal) : ''}"></label>
            ${check('som_bipe', 'Tocar som ao bipar produto e ao concluir a venda')}
            ${campo('desconto_maximo_pct', 'Desconto máximo por venda (%)', 'type="number" min="0" max="100"')}
            ${check('estoque_negativo', 'Permitir vender produto sem estoque')}
          </div>
        </div>
        <div class="cartao" id="atualizacoes">
          <h3><i data-icone="atualizar"></i> Atualizações do sistema</h3>
          <div id="at-status">Carregando…</div>
          <details class="at-avancado"><summary>Atualização automática e acesso</summary>
            <div class="grade-form">
              ${check('atualizacao_auto', 'Procurar versão nova sozinho (a cada 6 horas, quando tiver internet) e já deixar baixada')}
              <label class="col2">Token de acesso ao GitHub <small>necessário porque o repositório é privado — permissão só de leitura (Contents: read)</small>
                <input name="atualizacao_token" class="campo-senha" autocomplete="off" value="${esc(c.atualizacao_token)}" placeholder="github_pat_…"></label>
              <label class="col2">Endereço de atualização <small>deixe vazio para usar o padrão (GitHub)</small>
                <input name="atualizacao_url" value="${esc(c.atualizacao_url)}" placeholder="https://api.github.com/repos/…/releases/latest"></label>
            </div>
          </details>
        </div>
        <div class="acoes"><button class="btn btn-primario btn-grande">Salvar configurações</button></div>
      </form>
      <div class="cartao">
        <h3><i data-icone="nuvem"></i> Backups</h3>
        <div id="backup-status" class="backup-status">Carregando…</div>
        <div class="acoes acoes-esq">
          <button type="button" class="btn btn-primario" id="backup-agora"><i data-icone="nuvem"></i> Fazer backup agora</button>
          <a class="btn" href="/api/backup" download><i data-icone="nuvem"></i> Baixar uma cópia neste computador</a>
        </div>
      </div>`;

    const form = raiz.querySelector('#f-cfg');
    carregarImpressoras(raiz, false);
    Atualizacao.desenharStatus(raiz.querySelector('#at-status'));
    const mostrarBackup = (st) => {
      const quando = st.ultimo ? new Date(st.ultimo).toLocaleString('pt-BR') : 'nunca';
      const atrasado = st.horas_desde_ultimo == null || st.horas_desde_ultimo > 72;
      raiz.querySelector('#backup-status').innerHTML = `
        <div class="linha"><span>Último backup</span><b class="${atrasado ? 'txt-perigo' : 'txt-ok'}">${quando}${st.horas_desde_ultimo != null ? ` (há ${st.horas_desde_ultimo} h)` : ''}</b></div>
        <div class="linha"><span>Pasta</span><code>${esc(st.pasta)}</code></div>
        ${st.pasta_extra ? `<div class="linha"><span>Segunda cópia</span><code>${esc(st.pasta_extra)}</code></div>` : ''}
        ${st.ultimo_erro ? `<div class="alerta-box">${esc(st.ultimo_erro)}</div>` : ''}
        <details><summary>${st.arquivos.length} cópia(s) guardada(s)</summary>
          ${st.arquivos.map((a) => `<div class="linha"><small>${esc(a.nome)}</small><small>${(a.tamanho / 1024 / 1024).toFixed(1)} MB</small></div>`).join('')}
        </details>
        <p class="dica">Para restaurar uma cópia: pare o serviço "Clara Styllus PDV" e troque o arquivo
          <code>dados\\clara-styllus.db</code> pela cópia escolhida (renomeando). Se tiver dúvida, peça ajuda antes.</p>`;
    };
    api('/api/backup/status').then(mostrarBackup).catch((e) => { raiz.querySelector('#backup-status').textContent = e.message; });
    raiz.querySelector('#backup-agora').onclick = async (ev) => {
      ev.target.disabled = true;
      try {
        const r = await api('/api/backup/agora', { metodo: 'POST' });
        aviso(r.aviso || 'Backup feito.', r.aviso ? 'alerta' : 'ok');
        mostrarBackup(r.status);
      } catch (e) { erro(e); }
      ev.target.disabled = false;
    };
    raiz.querySelectorAll('[data-atualizar-imp]').forEach((b) => { b.onclick = () => carregarImpressoras(raiz, true); });
    raiz.querySelectorAll('[data-teste]').forEach((b) => {
      b.onclick = async () => {
        try {
          // Testa com o que está na tela, mesmo antes de salvar.
          await api('/api/imprimir/teste', { metodo: 'POST', corpo: { alvo: b.dataset.teste, config: lerForm(form) } });
          aviso('Teste enviado para a impressora.');
        } catch (e) { erro(e); }
      };
    });

    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const dados = lerForm(form);
      try {
        await api('/api/config', { metodo: 'PUT', corpo: dados });
        await U.config(true);
        aviso('Configurações salvas.');
        Atualizacao.desenharStatus(raiz.querySelector('#at-status'));
      } catch (e) { erro(e); }
    };
  }

  return { abrir };
})();
