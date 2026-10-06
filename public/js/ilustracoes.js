/* Ilustrações das telas vazias (SVG desenhado aqui, sem arquivos nem internet) e o helper U.vazio. */
const Ilustracao = (() => {
  // Cores: tons da marca (rosa) sobre um "blob" claro, com brilhinhos em volta.
  const R = 'var(--rosa)';
  const RE = 'var(--rosa-escuro)';
  const fundo = `
    <path d="M38 62c-6-24 14-44 40-46 22-2 30 8 46 6 20-2 34 14 32 34-2 18-14 22-14 38 0 18-20 30-42 28-18-2-26-12-44-10-22 2-36-12-34-28 2-12 20-10 16-22z" fill="var(--rosa-claro)"/>
    <g fill="${R}" opacity=".55"><path d="M30 34l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path d="M164 30l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/><circle cx="170" cy="112" r="3"/><circle cx="24" cy="104" r="2.2"/></g>`;
  const traco = `fill="none" stroke="${RE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;

  const DESENHOS = {
    // Sacola de compras (vendas / carrinho)
    sacola: `<path d="M66 58h68l-6 64a6 6 0 0 1-6 5H78a6 6 0 0 1-6-5z" fill="#fff" ${traco}/>
      <path d="M84 66V52a16 16 0 0 1 32 0v14" ${traco}/>
      <path d="M90 92c4 5 16 5 20 0" ${traco}/><circle cx="84" cy="66" r="2.5" fill="${RE}"/><circle cx="116" cy="66" r="2.5" fill="${RE}"/>`,
    // Cabide com vestido (produtos)
    cabide: `<path d="M100 30a7 7 0 1 1 7 7c-4 0-7 3-7 6v4" ${traco}/>
      <path d="M100 47L58 70h84z" ${traco}/>
      <path d="M86 70l-14 56h56l-14-56" fill="#fff" ${traco}/><path d="M86 70c4 8 24 8 28 0" ${traco}/>
      <path d="M78 104h44" stroke="${R}" stroke-width="3" stroke-linecap="round" opacity=".5"/>`,
    // Duas pessoas (clientes)
    clientes: `<circle cx="84" cy="62" r="14" fill="#fff" ${traco}/><path d="M58 118c0-18 12-30 26-30s26 12 26 30" fill="#fff" ${traco}/>
      <circle cx="122" cy="68" r="11" fill="#fff" ${traco}/><path d="M112 92c4-2 7-3 10-3 12 0 22 10 22 26" ${traco}/>`,
    // Caderno com check (crediário em dia)
    caderno: `<rect x="66" y="34" width="70" height="90" rx="6" fill="#fff" ${traco}/>
      <path d="M78 34v90" ${traco}/><path d="M88 56h36M88 70h36" stroke="${R}" stroke-width="3" stroke-linecap="round" opacity=".45"/>
      <circle cx="112" cy="98" r="15" fill="${R}"/><path d="M105 98l5 5 9-10" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    // Bolsa (condicional)
    bolsa: `<path d="M62 72h76l-4 50a6 6 0 0 1-6 5H72a6 6 0 0 1-6-5z" fill="#fff" ${traco}/>
      <path d="M80 72c0-30 40-30 40 0" ${traco}/><rect x="92" y="84" width="16" height="10" rx="3" fill="${R}"/>
      <path d="M62 72c10 10 66 10 76 0" ${traco}/>`,
    // Etiqueta com código de barras (etiquetas)
    etiqueta: `<path d="M62 52l38-18 38 18v66a6 6 0 0 1-6 6H68a6 6 0 0 1-6-6z" fill="#fff" ${traco}/>
      <circle cx="100" cy="52" r="5" ${traco}/>
      <path d="M78 76v28M84 76v28M92 76v28M96 76v28M104 76v28M112 76v28M116 76v28M122 76v28" stroke="${RE}" stroke-width="2.4"/>
      <path d="M78 112h44" stroke="${R}" stroke-width="3" stroke-linecap="round" opacity=".5"/>`,
    // Prancheta (inventário)
    prancheta: `<rect x="66" y="40" width="68" height="86" rx="6" fill="#fff" ${traco}/>
      <rect x="84" y="32" width="32" height="14" rx="4" fill="${R}"/>
      <path d="M80 66l4 4 7-8M80 86l4 4 7-8M80 106l4 4 7-8" fill="none" stroke="${R}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M98 67h22M98 87h22M98 107h14" ${traco}/>`,
    // Gráfico (relatórios)
    grafico: `<rect x="58" y="38" width="84" height="84" rx="8" fill="#fff" ${traco}/>
      <path d="M74 106V90M90 106V74M106 106V82M122 106V60" stroke="${R}" stroke-width="9" stroke-linecap="round"/>`,
    // Lupa (busca sem resultado)
    busca: `<circle cx="92" cy="72" r="26" fill="#fff" ${traco}/><path d="M111 91l22 22" stroke="${RE}" stroke-width="7" stroke-linecap="round"/>
      <path d="M82 68c2-6 8-9 14-8" ${traco} opacity=".6"/>`,
    // Relógio (histórico)
    relogio: `<circle cx="100" cy="78" r="38" fill="#fff" ${traco}/><path d="M100 56v22l14 10" ${traco}/>
      <circle cx="100" cy="78" r="3" fill="${R}"/>`,
    // Presente (aniversários)
    presente: `<rect x="66" y="66" width="68" height="56" rx="5" fill="#fff" ${traco}/><rect x="60" y="54" width="80" height="16" rx="4" fill="#fff" ${traco}/>
      <path d="M100 54v68" stroke="${R}" stroke-width="7"/><path d="M100 54c-6-14-26-16-22-4 2 6 14 6 22 4zM100 54c6-14 26-16 22-4-2 6-14 6-22 4z" ${traco}/>`,
    // Recibo (vendas)
    recibo: `<path d="M70 32h60v94l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-6 6z" fill="#fff" ${traco}/>
      <path d="M82 54h36M82 68h36M82 82h22" stroke="${R}" stroke-width="3" stroke-linecap="round" opacity=".55"/>
      <path d="M82 102h36" ${traco}/>`,
  };

  /** SVG pronto. `tamanho` em px de largura (a altura segue a proporção 200×150). */
  function svg(nome, tamanho = 180) {
    return `<svg class="ilustracao" viewBox="0 0 200 150" width="${tamanho}" height="${Math.round(tamanho * 0.75)}" aria-hidden="true">${fundo}${DESENHOS[nome] || DESENHOS.sacola}</svg>`;
  }

  return { svg, nomes: Object.keys(DESENHOS) };
})();

/**
 * Estado vazio ilustrado.
 * U.vazio({ ilu: 'cabide', titulo: 'Nenhum produto', texto: '...', botao: { rotulo, href } | { rotulo, id }, compacto })
 */
U.vazio = ({ ilu = 'sacola', titulo = '', texto = '', botao = null, compacto = false } = {}) => `
  <div class="vazio-ilu ${compacto ? 'compacto' : ''}">
    ${Ilustracao.svg(ilu, compacto ? 110 : 180)}
    ${titulo ? `<b>${U.esc(titulo)}</b>` : ''}
    ${texto ? `<small>${texto}</small>` : ''}
    ${botao ? (botao.href
    ? `<a class="btn btn-primario" href="${botao.href}">${botao.icone ? Icone(botao.icone) : ''} ${U.esc(botao.rotulo)}</a>`
    : `<button type="button" class="btn btn-primario" id="${botao.id}">${botao.icone ? Icone(botao.icone) : ''} ${U.esc(botao.rotulo)}</button>`) : ''}
  </div>`;
