/* Configurações da loja, do cupom, das etiquetas e backup. */
Telas.config = (() => {
  const { esc, api, aviso, erro } = U;

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
          <h3>Cupom</h3>
          <div class="grade-form">
            ${sel('cupom_largura_mm', 'Largura do papel', [['80', '80 mm'], ['58', '58 mm']])}
            ${sel('cupom_vias', 'Vias', [['1', '1 via'], ['2', '2 vias (cliente + loja)']])}
            <label class="col2">Mensagem no rodapé<textarea name="cupom_mensagem" rows="2">${esc(c.cupom_mensagem)}</textarea></label>
            ${check('impressao_automatica', 'Imprimir o cupom automaticamente ao concluir a venda')}
          </div>
        </div>
        <div class="cartao">
          <h3>Etiquetas</h3>
          <p class="dica">Rolo de impressora térmica (Argox, Elgin, Zebra…): use 1 coluna e o tamanho da etiqueta.
            Folha A4 adesiva: informe o tamanho de cada etiqueta e o número de colunas da folha.</p>
          <div class="grade-form tres">
            ${campo('etiqueta_largura_mm', 'Largura (mm)', 'type="number" min="15" max="200"')}
            ${campo('etiqueta_altura_mm', 'Altura (mm)', 'type="number" min="10" max="200"')}
            ${campo('etiqueta_colunas', 'Colunas', 'type="number" min="1" max="8"')}
            ${campo('etiqueta_margem_mm', 'Margem interna (mm)', 'type="number" min="0" max="10" step="0.5"')}
            ${check('etiqueta_mostrar_loja', 'Mostrar nome da loja')}
            ${check('etiqueta_mostrar_preco', 'Mostrar preço')}
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

    raiz.querySelector('#f-cfg').onsubmit = async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      const dados = {};
      for (const el of form.elements) {
        if (!el.name) continue;
        dados[el.name] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
      }
      try {
        await api('/api/config', { metodo: 'PUT', corpo: dados });
        await U.config(true);
        aviso('Configurações salvas.');
      } catch (e) { erro(e); }
    };
  }

  return { abrir };
})();
