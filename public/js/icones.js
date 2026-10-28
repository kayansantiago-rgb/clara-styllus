/*
 * Ícones de traço (SVG) usados no menu, no caixa e nos botões. Desenho no estilo Lucide (ISC).
 * Uso: Icone('sacola') → string <svg>, herda a cor do texto (currentColor).
 */
const Icone = (() => {
  const P = {
    inicio: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/>',
    sacola: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    roupa: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
    etiqueta: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/>',
    prancheta: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    recibo: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    bolsa: '<path d="M8 8V6a4 4 0 0 1 8 0v2"/><path d="M4 8h16l-1.2 12.1a2 2 0 0 1-2 1.9H7.2a2 2 0 0 1-2-1.9Z"/>',
    caderno: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M9 7h6"/>',
    clientes: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    carteira: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    grafico: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    ajustes: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4"/>',
    busca: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
    usuario: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    dinheiro: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    pix: '<path d="m12 2.5 9.5 9.5-9.5 9.5L2.5 12Z"/><path d="m7.5 12 3-3 3 3 3-3M7.5 12l3 3 3-3 3 3" stroke-width="1.6"/>',
    cartao: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20M6 15h4"/>',
    lixeira: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
    impressora: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    presente: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    telaCheia: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    cadeado: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    retirar: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    colocar: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/>',
    troca: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    gaveta: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    menos: '<path d="M5 12h14"/>',
    sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    olhoFechado: '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.6 6.6A18.4 18.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M14.12 14.12a3 3 0 1 1-4.24-4.24M2 2l20 20"/>',
    caixa: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    lapis: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    codigo: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 7v10M12 7v10M16 7v10"/>',
    grade: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
    imagem: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    vale: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    fogo: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    raio: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    tesoura: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>',
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    atualizar: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
    nuvem: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M12 12v6M9 15l3 3 3-3"/>',
    estrela: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
    whatsapp: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9 10c.5 2 2 3.5 4 4l1-1 2 1v1.5c-3 .5-7.5-3.5-7-7H10l1 2Z" stroke-width="1.4"/>',
    telefone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    bolo: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01"/>',
    seta: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    lua: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    reserva: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>',
    recolher: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M16 9l-3 3 3 3"/>',
    loja: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4M2 7h20M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
  };

  function Icone(nome, classe = '') {
    const d = P[nome];
    if (!d) return '';
    return `<svg class="i ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  }


  /*
   * Ícones coloridos das formas de pagamento (cédula, símbolo do Pix, cartões com chip…).
   * Uso: Icone.pag('pix') → <svg class="pgi pgi-pix">. Cores fixas, sem gradientes com id
   * (assim funcionam mesmo repetidos várias vezes na página).
   */
  const chip = (x, y) => `<rect x="${x}" y="${y}" width="8" height="6.4" rx="1.4" fill="#f3cf72"/><path d="M${x} ${y + 3.2}h8M${x + 2.7} ${y}v6.4M${x + 5.3} ${y}v6.4" stroke="#c99a3e" stroke-width=".7"/>`;
  const cartao = (cor, escura, nome) => `
    <rect x="2" y="3" width="44" height="28" rx="4.5" fill="${cor}"/>
    <path d="M2 21C14 15 30 25 46 12v14.5A4.5 4.5 0 0 1 41.5 31h-35A4.5 4.5 0 0 1 2 26.5Z" fill="${escura}" opacity=".55"/>
    <path d="M24 3h17.5A4.5 4.5 0 0 1 46 7.5V9C38 5 30 6 24 3Z" fill="#fff" opacity=".12"/>
    ${chip(7, 10)}
    <path d="M19.5 11.2a4 4 0 0 1 0 5.6M22 9.6a6.4 6.4 0 0 1 0 8.8" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>
    <g fill="#fff" opacity=".9"><rect x="7" y="22" width="6" height="2" rx="1"/><rect x="15" y="22" width="6" height="2" rx="1"/><rect x="23" y="22" width="6" height="2" rx="1"/><rect x="31" y="22" width="6" height="2" rx="1"/></g>
    <text x="42" y="10.5" text-anchor="end" font-family="Arial, sans-serif" font-size="4.6" font-weight="800" letter-spacing=".3" fill="#fff" opacity=".9">${nome}</text>`;
  const PAG = {
    dinheiro: `
      <rect x="7" y="2" width="39" height="21" rx="3" fill="#8fd1ad" transform="rotate(-6 26 12)"/>
      <rect x="2" y="8" width="42" height="22" rx="3" fill="#2f9e6a"/>
      <rect x="4.5" y="10.5" width="37" height="17" rx="2" fill="none" stroke="#c9ecd8" stroke-width=".8" opacity=".8"/>
      <ellipse cx="32" cy="19" rx="7" ry="7.2" fill="#d9f3e4"/>
      <circle cx="32" cy="17" r="2.6" fill="#2f9e6a"/><path d="M27 25a5 4.2 0 0 1 10 0Z" fill="#2f9e6a"/>
      <text x="8" y="17.5" font-family="Arial, sans-serif" font-size="6.5" font-weight="800" fill="#e6f8ee">100</text>
      <text x="8" y="25.5" font-family="Arial, sans-serif" font-size="4.6" font-weight="700" fill="#c9ecd8">REAIS</text>`,
    pix: `<g transform="translate(9 1) scale(1.25)" fill="#32bcad"><path d="M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156"/></g>`,
    debito: cartao('#2f5fa8', '#1d3f78', 'DÉBITO'),
    credito: cartao('#3a2a4e', '#1b1226', 'CRÉDITO'),
    crediario: `
      <rect x="9" y="2" width="31" height="29" rx="3" fill="#b06d80"/>
      <rect x="36" y="4" width="5" height="25" rx="1.5" fill="#f4e6ea"/>
      <rect x="9" y="2" width="6" height="29" rx="2" fill="#8e5063"/>
      <g fill="#f4e6ea"><circle cx="9" cy="8" r="1.5"/><circle cx="9" cy="14" r="1.5"/><circle cx="9" cy="20" r="1.5"/><circle cx="9" cy="26" r="1.5"/></g>
      <rect x="19" y="8" width="14" height="8" rx="1.5" fill="#fff"/>
      <path d="M21.5 11h9M21.5 13.5h6" stroke="#b06d80" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M19 21h14M19 25h10" stroke="#f4e6ea" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>`,
    vale: `
      <path d="M3 7a3 3 0 0 1 3-3h36a3 3 0 0 1 3 3v6a3.5 3.5 0 0 0 0 7v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-6a3.5 3.5 0 0 0 0-7Z" fill="#d4a24a"/>
      <path d="M32 6v22" stroke="#fff4dc" stroke-width="1.2" stroke-dasharray="2 2"/>
      <path d="M3 13a3.5 3.5 0 0 1 0 7" fill="none"/>
      <path d="m17.5 9.5 1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6Z" fill="#fff8e6"/>
      <path d="M36 11.5h5M36 16.5h5M36 21.5h4" stroke="#fff4dc" stroke-width="1.3" stroke-linecap="round"/>`,
    outro: `
      <rect x="4" y="6" width="38" height="24" rx="4" fill="#7a5a48"/>
      <path d="M4 10a4 4 0 0 1 4-4h28l-2-3.5a1.5 1.5 0 0 0-2-.6L8 9" fill="#5e4334"/>
      <rect x="30" y="13" width="14" height="10" rx="3" fill="#5e4334"/><circle cx="35" cy="18" r="2" fill="#f3cf72"/>`,
  };
  PAG.cartao = PAG.debito;
  Icone.pag = (forma, classe = '') => `<svg class="pgi pgi-${forma} ${classe}" viewBox="0 0 48 32" aria-hidden="true">${PAG[forma] || PAG.outro}</svg>`;

  /** Troca <i data-icone="nome"></i> pelo SVG (usado no HTML fixo da página). */
  Icone.aplicar = (raiz = document) => {
    raiz.querySelectorAll('i[data-icone]').forEach((el) => { if (el.parentNode) el.outerHTML = Icone(el.dataset.icone, el.className); });
  };
  // Qualquer <i data-icone="nome"> que aparecer na página (telas, janelas) vira ícone sozinho.
  new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (!n.isConnected) continue; // já saiu da página antes de chegar aqui
        if (n.matches('i[data-icone]')) { if (n.parentNode) n.outerHTML = Icone(n.dataset.icone, n.className); }
        else if (n.querySelector('i[data-icone]')) Icone.aplicar(n);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  return Icone;
})();
