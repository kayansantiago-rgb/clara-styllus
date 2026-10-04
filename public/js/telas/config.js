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
          <h3>🧾 Impressora de cupom</h3>
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
            <div class="acoes acoes-esq col2"><button type="button" class="btn" data-teste="cupom">🖨️ Imprimir teste de cupom</button></div>
          </div>
        </div>
        <div class="cartao">
          <h3>🏷️ Impressora de etiquetas</h3>
          <p class="dica"><b>ZPL</b>: Zebra, Elgin L42 Pro, Argox e a maioria das atuais. <b>EPL</b>: Zebra LP/TLP antigas,
            Elgin L42 e Argox em modo PPLB. <b>Navegador</b>: só para etiquetas em folha A4 de impressora comum.</p>
          <div class="grade-form tres">
            ${sel('impressao_etiqueta_modo', 'Linguagem', [['zpl', 'ZPL (recomendado)'], ['epl', 'EPL / PPLB'], ['navegador', 'Folha A4 pelo navegador']])}
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
            <div class="acoes acoes-esq col2"><button type="button" class="btn" data-teste="etiqueta">🏷️ Imprimir etiqueta de teste</button></div>
          </div>
        </div>
        <div class="cartao">
          <h3>📒 Crediário</h3>
          <div class="grade-form tres">
            ${campo('crediario_max_parcelas', 'Máximo de parcelas', 'type="number" min="1" max="24"')}
            ${campo('crediario_dias_primeira', '1º vencimento (dias após a compra)', 'type="number" min="1" max="120"')}
            <label>Limite padrão por cliente (R$) <small>vazio = sem limite</small>
              <input name="crediario_limite_padrao" data-dinheiro inputmode="decimal" value="${c.crediario_limite_padrao ? U.num(c.crediario_limite_padrao) : ''}"></label>
            ${check('crediario_bloquear_atraso', 'Não vender fiado para quem tem parcela atrasada')}
          </div>
        </div>
        <div class="cartao">
          <h3>Regras de venda</h3>
          <div class="grade-form">
            ${campo('desconto_maximo_pct', 'Desconto máximo por venda (%)', 'type="number" min="0" max="100"')}
            ${check('estoque_negativo', 'Permitir vender produto sem estoque')}
          </div>
        </div>
        <div class="acoes"><button class="btn btn-primario btn-grande">Salvar configurações</button></div>
      </form>
      <div class="cartao">
        <h3>Backup</h3>
        <p>Os dados ficam em <code>C:\\ProgramData\\ClaraStyllus\\dados</code> (instalado pelo instalador)
          ou na pasta <code>dados</code> do sistema. Faça backup com frequência e guarde em um pendrive ou na nuvem.</p>
        <a class="btn" href="/api/backup" download>💾 Baixar backup agora</a>
      </div>`;

    const form = raiz.querySelector('#f-cfg');
    carregarImpressoras(raiz, false);
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
      } catch (e) { erro(e); }
    };
  }

  return { abrir };
})();
