/* Geração de código de barras em SVG (EAN-13 e Code 128-B), sem dependências. */
(function () {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011',
    '0110001', '0101111', '0111011', '0110111', '0001011'];
  const R = L.map((p) => p.replace(/./g, (b) => (b === '0' ? '1' : '0')));
  const G = R.map((p) => p.split('').reverse().join(''));
  const PARIDADE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
    'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
    '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122',
    '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122',
    '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123',
    '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331',
    '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311',
    '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411',
    '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412',
    '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211',
    '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113',
    '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];

  function ean13Valido(codigo) {
    if (!/^\d{13}$/.test(codigo)) return false;
    let soma = 0;
    for (let i = 0; i < 12; i++) soma += Number(codigo[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (soma % 10)) % 10 === Number(codigo[12]);
  }

  /** Devolve uma string de módulos ('1' barra, '0' espaço). */
  function modulosEan13(codigo) {
    const par = PARIDADE[Number(codigo[0])];
    let s = '101';
    for (let i = 1; i <= 6; i++) s += (par[i - 1] === 'L' ? L : G)[Number(codigo[i])];
    s += '01010';
    for (let i = 7; i <= 12; i++) s += R[Number(codigo[i])];
    return s + '101';
  }

  function modulosCode128(texto) {
    const valores = [104];
    for (const ch of texto) {
      const c = ch.charCodeAt(0);
      valores.push(c >= 32 && c <= 126 ? c - 32 : 0);
    }
    let soma = valores[0];
    for (let i = 1; i < valores.length; i++) soma += valores[i] * i;
    valores.push(soma % 103, 106);
    let s = '';
    for (const v of valores) {
      C128[v].split('').forEach((w, i) => (s += (i % 2 === 0 ? '1' : '0').repeat(Number(w))));
    }
    return s;
  }

  /**
   * SVG do código de barras. Usa EAN-13 quando o código é um EAN válido,
   * senão Code 128. A largura acompanha o elemento pai.
   */
  function svgCodigoBarras(codigo, { altura = '100%' } = {}) {
    codigo = String(codigo || '');
    const mod = ean13Valido(codigo) ? modulosEan13(codigo) : modulosCode128(codigo);
    const quiet = 6;
    let barras = '';
    let x = 0;
    while (x < mod.length) {
      if (mod[x] === '1') {
        let w = 1;
        while (mod[x + w] === '1') w++;
        barras += `<rect x="${x + quiet}" y="0" width="${w}" height="10"/>`;
        x += w;
      } else x++;
    }
    const largura = mod.length + quiet * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} 10" preserveAspectRatio="none" ` +
      `width="100%" height="${altura}" shape-rendering="crispEdges" fill="#000">${barras}</svg>`;
  }

  window.CodigoBarras = { svg: svgCodigoBarras, ean13Valido };
})();
