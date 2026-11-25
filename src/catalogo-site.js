'use strict';

/**
 * Catálogo online: monta um site 3D animado com as peças da loja (fotos, tamanhos, cores e preços),
 * empacota em .zip e publica na Netlify (hospedagem grátis) com um clique.
 *
 * O site é estático: index.html (dados das peças embutidos) + fotos/ + assets/ (logo e fontes).
 * Nada de custo, quantidade exata em estoque ou dados de clientes vai para o site.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MODELO = path.join(__dirname, 'catalogo-site', 'modelo.html');
const PUBLICO = path.join(__dirname, '..', 'public');
const apiNetlify = () => process.env.PDV_NETLIFY_API || 'https://api.netlify.com/api/v1';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ORDEM_TAM = ['RN', 'BB', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'EG', 'EGG', 'XGG', 'G1', 'G2', 'G3', 'G4', 'U', 'ÚNICO', 'UNICO'];

function ordenarTamanhos(ts) {
  return [...ts].sort((a, b) => {
    const na = Number(String(a).replace(',', '.'));
    const nb = Number(String(b).replace(',', '.'));
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    const ia = ORDEM_TAM.indexOf(String(a).toUpperCase());
    const ib = ORDEM_TAM.indexOf(String(b).toUpperCase());
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a).localeCompare(String(b));
  });
}

/** Telefone da loja no formato do wa.me (55 + DDD + número), ou '' se não der para usar. */
function whatsapp(tel) {
  const d = String(tel || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return d.length === 10 || d.length === 11 ? `55${d}` : '';
}

/** Parcelas sem juros (a mesma regra da etiqueta "parcelado"); 0 quando não há. */
function parcelasSemJuros(cfg) {
  const aPartir = Number(cfg.juros_a_partir) || 0;
  const n0 = Math.min(12, Math.max(2, Number(cfg.etiqueta_parcelas) || 3));
  const n = !aPartir ? n0 : aPartir - 1 >= 2 ? Math.min(n0, aPartir - 1) : 0;
  return n >= 2 ? n : 0;
}

/**
 * Peças do catálogo, juntando tamanhos e cores do mesmo modelo (nome + referência).
 * Devolve { pecas, fotos: Map(nomeArquivo → { id, ordem? }) } (ordem = quadro do giro de 360°).
 */
function montarPecas(db, { soEstoque = true } = {}) {
  const produtos = db.prepare(
    `SELECT p.id, p.nome, p.referencia, p.categoria, p.tamanho, p.cor, p.preco_venda, p.preco_anterior, p.estoque, p.foto_versao, p.criado_em,
       p.foto360_versao, p.foto360_n, p.extras_versao, p.extras_n, p.video_versao, f.tipo AS foto_tipo
     FROM produtos p LEFT JOIN produto_fotos f ON f.produto_id = p.id
     WHERE p.ativo = 1 AND p.servico = 0 AND p.atalho = 0 AND p.excluido_em IS NULL ORDER BY p.id`
  ).all();
  const vendas30 = new Map(db.prepare(
    `SELECT lower(p.nome) || '|' || COALESCE(p.referencia, '') AS k, SUM(i.quantidade) AS n
     FROM venda_itens i JOIN vendas v ON v.id = i.venda_id JOIN produtos p ON p.id = i.produto_id
     WHERE v.status = 'concluida' AND v.criado_em >= datetime('now','localtime','-30 days') GROUP BY 1`
  ).all().map((r) => [r.k, r.n]));
  const mapa = new Map();
  for (const p of produtos) {
    const k = `${String(p.nome).toLowerCase()}|${p.referencia || ''}`;
    if (!mapa.has(k)) mapa.set(k, { k, itens: [] });
    mapa.get(k).itens.push(p);
  }
  const top = new Set([...vendas30.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k));
  const fotos = new Map();
  const pecas = [];
  for (const m of mapa.values()) {
    const disp = m.itens.filter((p) => p.estoque > 0);
    if (soEstoque && !disp.length) continue;
    const base = disp.length ? disp : m.itens;
    const p0 = base[0];
    const precos = base.map((p) => p.preco_venda);
    const menor = Math.min(...precos);
    const de = base.filter((p) => p.preco_venda === menor && p.preco_anterior > p.preco_venda).map((p) => p.preco_anterior)[0] || null;
    // Uma foto por cor (até 5), começando pela de quem tem estoque.
    const fotosModelo = [];
    const coresComFoto = new Set();
    for (const p of [...base, ...m.itens]) {
      if (!p.foto_versao || !p.foto_tipo || fotosModelo.length >= 5) continue;
      const chaveCor = (p.cor || '').toLowerCase();
      if (coresComFoto.has(chaveCor)) continue;
      coresComFoto.add(chaveCor);
      const arq = `fotos/${p.id}-${p.foto_versao}.${{ 'image/png': 'png', 'image/webp': 'webp' }[p.foto_tipo] || 'jpg'}`;
      fotos.set(arq, { id: p.id });
      fotosModelo.push(arq);
    }
    // Giro de 360°: as fotos em volta do manequim, de uma das peças do modelo.
    const g = m.itens.find((p) => p.foto360_versao && p.foto360_n > 1);
    const giro = g ? Array.from({ length: g.foto360_n }, (_, i) => {
      const arq = `giro/${g.id}-${g.foto360_versao}-${i}.jpg`;
      fotos.set(arq, { id: g.id, ordem: i });
      return arq;
    }) : [];
    // Vídeo curto (de uma das peças do modelo).
    const vd = m.itens.find((p) => p.video_versao);
    let video = '';
    if (vd) {
      const t = db.prepare('SELECT tipo FROM produto_video WHERE produto_id = ?').get(vd.id);
      if (t) {
        video = `videos/${vd.id}-${vd.video_versao}.${{ 'video/webm': 'webm', 'video/quicktime': 'mov' }[t.tipo] || 'mp4'}`;
        fotos.set(video, { id: vd.id, video: true });
      }
    }
    // Mais fotos (costas, detalhe…), de uma das peças do modelo.
    const ext = { 'image/png': 'png', 'image/webp': 'webp' };
    const e = m.itens.find((p) => p.extras_versao && p.extras_n > 0);
    const mais = e ? db.prepare('SELECT ordem, tipo FROM produto_fotos_extras WHERE produto_id = ? AND ordem < ? ORDER BY ordem').all(e.id, e.extras_n).map((r) => {
      const arq = `mais/${e.id}-${e.extras_versao}-${r.ordem}.${ext[r.tipo] || 'jpg'}`;
      fotos.set(arq, { id: e.id, extra: r.ordem });
      return arq;
    }) : [];
    const criado = m.itens.map((p) => p.criado_em).sort()[0];
    const dias = (Date.now() - new Date(String(criado).replace(' ', 'T')).getTime()) / 864e5;
    const estoque = disp.reduce((a, p) => a + p.estoque, 0);
    pecas.push({
      id: p0.id,
      nome: p0.nome,
      categoria: p0.categoria || 'Outras',
      tamanhos: ordenarTamanhos(new Set(base.map((p) => p.tamanho).filter(Boolean))),
      cores: [...new Set(base.map((p) => p.cor).filter(Boolean))],
      preco: menor,
      de,
      varia: new Set(precos).size > 1,
      fotos: fotosModelo,
      giro,
      mais,
      video,
      // Número fixo do modelo para o link direto da peça (não muda quando um tamanho esgota).
      lk: m.itens[0].id,
      novo: dias <= 15,
      chegou: dias <= 7,
      top: top.has(m.k),
      ultima: estoque === 1,
      // Cada tamanho × cor com estoque, para o pedido saber qual peça separar (sem dizer quantas tem).
      variantes: disp.map((p) => ({ id: p.id, t: p.tamanho || '', c: p.cor || '' })),
      destaque: (top.has(m.k) ? 2 : 0) + (dias <= 15 ? 1 : 0),
    });
  }
  // Ordem: categoria com mais peças primeiro; dentro dela, as com foto e as novidades na frente.
  const porCat = new Map();
  for (const p of pecas) porCat.set(p.categoria, (porCat.get(p.categoria) || 0) + 1);
  pecas.sort((a, b) => porCat.get(b.categoria) - porCat.get(a.categoria) || a.categoria.localeCompare(b.categoria, 'pt-BR')
    || (b.fotos.length > 0) - (a.fotos.length > 0) || b.destaque - a.destaque || a.nome.localeCompare(b.nome, 'pt-BR'));
  pecas.forEach((p, i) => { p.num = String(i + 1).padStart(2, '0'); });
  return { pecas, fotos };
}

const dia = (a, m, d, h = 0, mi = 0, s = 0) => new Date(a, m, d, h, mi, s);
const fimDoDia = (d) => dia(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
/** Black Friday no Brasil: a sexta depois da 4ª quinta-feira de novembro. */
function blackFriday(ano) {
  const d1 = dia(ano, 10, 1);
  const primeiraQuinta = 1 + ((4 - d1.getDay() + 7) % 7);
  return dia(ano, 10, primeiraQuinta + 21 + 1);
}
/** Dia das Mães: 2º domingo de maio. */
function diaDasMaes(ano) {
  const d1 = dia(ano, 4, 1);
  return dia(ano, 4, 1 + ((7 - d1.getDay()) % 7) + 7);
}
const TEMAS = ['classico', 'black_friday', 'natal', 'maes', 'namorados', 'verao'];
/** Tema do site: no "auto", as datas do comércio entram sozinhas na época (com contagem regressiva). */
function temaDoSite(cfg, hoje = new Date()) {
  const escolha = cfg.catalogo_tema || 'auto';
  if (escolha !== 'auto') {
    if (!TEMAS.includes(escolha) || escolha === 'classico') return { id: 'classico', fim: '' };
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cfg.catalogo_tema_fim || '');
    const fim = m ? fimDoDia(dia(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
    return { id: escolha, fim: fim && fim > hoje ? fim.toISOString() : '' };
  }
  const ano = hoje.getFullYear();
  const bf = blackFriday(ano);
  const maes = diaDasMaes(ano);
  const janelas = [
    ['black_friday', dia(ano, 10, bf.getDate() - 14), fimDoDia(dia(ano, 10, bf.getDate() + 2))], // até o domingo depois
    ['natal', dia(ano, 11, 1), dia(ano, 11, 24, 23, 59, 59)],
    ['maes', dia(ano, 4, maes.getDate() - 14), fimDoDia(maes)],
    ['namorados', dia(ano, 5, 1), dia(ano, 5, 12, 23, 59, 59)],
  ];
  const j = janelas.find(([, ini, fim]) => hoje >= ini && hoje <= fim);
  return j ? { id: j[0], fim: j[2].toISOString() } : { id: 'classico', fim: '' };
}

/** Foto de capa do site (guardada no sistema), ou null. */
function capaDoSite(db) {
  const c = db.prepare(`SELECT tipo, versao FROM loja_arquivos WHERE chave = 'capa'`).get();
  return c ? `assets/capa-${c.versao}.${{ 'image/png': 'png', 'image/webp': 'webp' }[c.tipo] || 'jpg'}` : '';
}

/** Dados que vão para o site (o que o JavaScript da página lê). */
function montarDados(db, cfg, opcoes = {}) {
  const { pecas, fotos } = montarPecas(db, opcoes);
  const hoje = opcoes.hoje || new Date();
  const categorias = [...new Set(pecas.map((p) => p.categoria))];
  const loja = cfg.loja_nome || 'Clara Styllus';
  const dados = {
    loja,
    titulo: (cfg.catalogo_titulo || '').trim(),
    kicker: `Catálogo · ${MESES[hoje.getMonth()]} ${hoje.getFullYear()}`,
    subtituloProprio: !!(cfg.catalogo_subtitulo || '').trim(),
    subtitulo: (cfg.catalogo_subtitulo || '').trim() || 'Escolha suas peças favoritas, monte a sua sacola e mande o pedido direto no nosso WhatsApp.',
    whatsapp: whatsapp(cfg.loja_telefone),
    telefone: cfg.loja_telefone || '',
    instagram: cfg.loja_instagram ? `@${String(cfg.loja_instagram).replace(/^@/, '').trim()}` : '',
    endereco: cfg.loja_endereco || '',
    cidade: cfg.loja_cidade || '',
    parcelas: parcelasSemJuros(cfg),
    mostrarPreco: cfg.catalogo_mostrar_preco !== '0',
    // Desconto no Pix e no dinheiro (%), de 0 a 30.
    descontoPix: Math.min(30, Math.max(0, Math.round(Number(String(cfg.catalogo_desconto_pix || '0').replace(',', '.')) || 0))),
    // Caixa de pedidos (Google Apps Script): com ela, a sacola vira pedido que cai no sistema.
    pedidos: /^https:\/\/script\.google(usercontent)?\.com\//.test(cfg.pedidos_url || '') ? cfg.pedidos_url : '',
    prazoReserva: Number(cfg.reserva_prazo_dias) || 7,
    tema: temaDoSite(cfg, hoje),
    medidas: medidasDoSite(cfg),
    capa: capaDoSite(db),
    atualizado: hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    categorias,
    // Para os filtros do site: todos os tamanhos (em ordem) e as cores mais comuns.
    tamanhos: ordenarTamanhos(new Set(pecas.flatMap((p) => p.tamanhos))),
    cores: [...pecas.flatMap((p) => p.cores).reduce((m, c) => m.set(c, (m.get(c) || 0) + 1), new Map())]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 14).map(([c]) => c),
    pecas,
  };
  return { dados, fotos };
}

const escHtml = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** index.html com os dados embutidos. `urlSite` é o endereço publicado (para a imagem de prévia no WhatsApp). */
function montarHtml(dados, { urlSite = '' } = {}) {
  const titulo = dados.titulo ? `${dados.titulo} · ${dados.loja}` : `${dados.loja} · Catálogo`;
  const descricao = `${dados.pecas.length} peças · ${dados.categorias.slice(0, 4).join(', ')}. Peça pelo WhatsApp.`;
  const capa = dados.pecas.find((p) => p.fotos.length);
  // JSON dentro de <script>: "</" e os separadores de linha do Unicode não podem aparecer crus.
  const json = JSON.stringify(dados).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return fs.readFileSync(MODELO, 'utf8')
    .replace(/__TITULO__/g, escHtml(titulo))
    .replace(/__DESCRICAO__/g, escHtml(descricao))
    .replace(/__LOJA__/g, escHtml(dados.loja))
    .replace(/__OG_IMAGEM__/g, capa ? `${urlSite.replace(/\/$/, '')}/${capa.fotos[0]}` : `${urlSite.replace(/\/$/, '')}/assets/logo.png`)
    .replace('__DADOS__', () => json);
}

/** Foto de um produto (bytes como gravados no banco); com `ordem`, um quadro do giro de 360°. */
function lerFoto(db, produtoId, ordem = null) {
  const f = ordem === null || ordem === undefined
    ? db.prepare('SELECT tipo, dados FROM produto_fotos WHERE produto_id = ?').get(produtoId)
    : db.prepare('SELECT tipo, dados FROM produto_360 WHERE produto_id = ? AND ordem = ?').get(produtoId, ordem);
  return f ? { tipo: f.tipo, dados: Buffer.from(f.dados) } : null;
}

/** O vídeo da peça (bytes), ou null. */
function lerVideo(db, produtoId) {
  const v = db.prepare('SELECT tipo, dados FROM produto_video WHERE produto_id = ?').get(produtoId);
  return v ? { tipo: v.tipo, dados: Buffer.from(v.dados) } : null;
}

/** Tabela de medidas que vai para o site (só o que for válido), ou null. */
function medidasDoSite(cfg) {
  let m;
  try { m = JSON.parse(cfg.catalogo_medidas || 'null'); } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  const limpa = (t) => {
    if (!t || !Array.isArray(t.colunas) || !Array.isArray(t.linhas)) return null;
    const colunas = t.colunas.map((c) => String(c || '').trim().slice(0, 20)).filter(Boolean).slice(0, 6);
    const linhas = t.linhas.filter((l) => Array.isArray(l) && String(l[0] || '').trim())
      .map((l) => [String(l[0]).trim().slice(0, 8), ...colunas.map((_, i) => String(l[i + 1] || '').trim().slice(0, 12))]).slice(0, 20);
    return colunas.length && linhas.length ? { colunas, linhas } : null;
  };
  const r = { letras: limpa(m.letras), numeros: limpa(m.numeros) };
  return r.letras || r.numeros ? r : null;
}

/** Uma das "mais fotos" da peça (bytes), ou null. */
function lerExtra(db, produtoId, ordem) {
  const f = db.prepare('SELECT tipo, dados FROM produto_fotos_extras WHERE produto_id = ? AND ordem = ?').get(produtoId, ordem);
  return f ? { tipo: f.tipo, dados: Buffer.from(f.dados) } : null;
}

/** A foto de capa (bytes), ou null. */
function lerCapa(db) {
  const c = db.prepare(`SELECT tipo, dados FROM loja_arquivos WHERE chave = 'capa'`).get();
  return c ? { tipo: c.tipo, dados: Buffer.from(c.dados) } : null;
}

/**
 * Página de cada peça (p/123/): o link que a loja manda no WhatsApp. Mostra a foto e o preço da peça na
 * prévia da conversa e abre o catálogo já nela.
 */
function paginaDaPeca(dados, p, urlSite = '') {
  const base = urlSite.replace(/\/$/, '');
  const destino = `../../#peca-${p.lk}`;
  const img = p.fotos[0] ? (base ? `${base}/${p.fotos[0]}` : `../../${p.fotos[0]}`) : (base ? `${base}/assets/logo.png` : '../../assets/logo.png');
  const brl = (c) => `R$ ${(c / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  const titulo = `${p.nome}${dados.mostrarPreco ? ` · ${brl(p.preco)}` : ''}`;
  const desc = [p.tamanhos.length && `Tamanhos ${p.tamanhos.join(', ')}`, p.cores.length && p.cores.join(', '), `${dados.loja}. Toque para ver e pedir.`].filter(Boolean).join(' · ');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(titulo)} · ${escHtml(dados.loja)}</title>
<meta name="description" content="${escHtml(desc)}">
<meta property="og:type" content="product"><meta property="og:title" content="${escHtml(titulo)}">
<meta property="og:description" content="${escHtml(desc)}"><meta property="og:image" content="${escHtml(img)}">
<meta name="theme-color" content="#2b1d22"><link rel="icon" href="../../assets/icone.png">
<meta http-equiv="refresh" content="0; url=${destino}"><script>location.replace(${JSON.stringify(destino)});</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#2b1d22;font-family:system-ui,sans-serif}a{color:#f3d48a}</style>
</head><body><a href="${destino}">Ver ${escHtml(p.nome)}</a></body></html>
`;
}

const ASSETS = [
  ['assets/logo.png', path.join(PUBLICO, 'img', 'logo.png')],
  ['assets/icone.png', path.join(PUBLICO, 'img', 'icone.png')],
  ['assets/inter.woff2', path.join(PUBLICO, 'fonts', 'inter.woff2')],
  ['assets/playfair-display.woff2', path.join(PUBLICO, 'fonts', 'playfair-display.woff2')],
];

/** Todos os arquivos do site: [{ nome, dados }]. */
function arquivosDoSite(db, cfg, opcoes = {}) {
  const { dados, fotos } = montarDados(db, cfg, opcoes);
  const lista = [{ nome: 'index.html', dados: Buffer.from(montarHtml(dados, opcoes), 'utf8') }];
  for (const [nome, origem] of ASSETS) {
    if (fs.existsSync(origem)) lista.push({ nome, dados: fs.readFileSync(origem) });
  }
  for (const [nome, { id, ordem, extra, video }] of fotos) {
    const f = video ? lerVideo(db, id) : extra === undefined ? lerFoto(db, id, ordem) : lerExtra(db, id, extra);
    if (f) lista.push({ nome, dados: f.dados });
  }
  if (dados.capa) {
    const c = lerCapa(db);
    if (c) lista.push({ nome: dados.capa, dados: c.dados });
  }
  for (const p of dados.pecas) lista.push({ nome: `p/${p.lk}/index.html`, dados: Buffer.from(paginaDaPeca(dados, p, opcoes.urlSite), 'utf8') });
  // Licenças das fontes (OFL pede que acompanhem as fontes).
  for (const lic of ['LICENCA-Inter.txt', 'LICENCA-Playfair-Display.txt']) {
    const origem = path.join(PUBLICO, 'fonts', lic);
    if (fs.existsSync(origem)) lista.push({ nome: `assets/${lic}`, dados: fs.readFileSync(origem) });
  }
  return { arquivos: lista, dados };
}

// ------------------------------------------------------------------ zip
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Arquivo .zip simples (imagens guardadas, textos comprimidos). */
function zipar(arquivos) {
  const partes = [];
  const central = [];
  let offset = 0;
  const agora = new Date();
  const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | Math.floor(agora.getSeconds() / 2);
  const data = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, 'utf8');
    const comprimir = /\.(html|txt|json|css|js)$/.test(a.nome);
    const corpo = comprimir ? zlib.deflateRawSync(a.dados) : a.dados;
    const crc = crc32(a.dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(comprimir ? 8 : 0, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(corpo.length, 18);
    local.writeUInt32LE(a.dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nome, corpo);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(comprimir ? 8 : 0, 10);
    c.writeUInt16LE(hora, 12);
    c.writeUInt16LE(data, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(corpo.length, 20);
    c.writeUInt32LE(a.dados.length, 24);
    c.writeUInt16LE(nome.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nome);
    offset += local.length + nome.length + corpo.length;
  }
  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(tamCentral, 12);
  fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...partes, ...central, fim]);
}

// ------------------------------------------------------------- netlify
/** Nome de site aceito pela Netlify: letras minúsculas, números e hífen. */
function nomeSite(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'catalogo-loja';
}

async function chamarNetlify(token, metodo, caminho, corpo, tipo = 'application/json') {
  const r = await fetch(`${apiNetlify()}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipo },
    body: corpo === undefined ? undefined : tipo === 'application/json' ? JSON.stringify(corpo) : corpo,
  });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta sem JSON */ }
  if (!r.ok) {
    const msg = (json && (json.message || json.error)) || texto.slice(0, 200) || r.statusText;
    const e = new Error(r.status === 401 ? 'A chave da Netlify não foi aceita. Confira a chave em Configurações → Catálogo online.' : `Netlify: ${msg}`);
    e.status = r.status;
    throw e;
  }
  return json;
}

/**
 * Publica o site. Na primeira vez cria o site na Netlify (com o nome escolhido; se já existir, tenta
 * com um número no fim) e devolve { site_id, url } para guardar nas configurações.
 */
async function publicar({ token, siteId, nome, zip }) {
  if (!token) throw new Error('Falta a chave da Netlify (Configurações → Catálogo online).');
  let id = siteId;
  let url = null;
  if (id) {
    try {
      const s = await chamarNetlify(token, 'GET', `/sites/${encodeURIComponent(id)}`);
      url = s.ssl_url || s.url;
    } catch (e) {
      if (e.status !== 404) throw e;
      id = null; // o site foi apagado na Netlify: cria outro
    }
  }
  if (!id) {
    const base = nomeSite(nome);
    let criado = null;
    for (let i = 0; i < 6 && !criado; i++) {
      try {
        criado = await chamarNetlify(token, 'POST', '/sites', { name: i ? `${base}-${Math.floor(Math.random() * 900 + 100)}` : base });
      } catch (e) {
        if (e.status !== 422) throw e; // 422 = nome já usado por outra pessoa
      }
    }
    if (!criado) throw new Error('Não consegui criar o site na Netlify. Tente outro nome.');
    id = criado.id;
    url = criado.ssl_url || criado.url;
  }
  const deploy = await chamarNetlify(token, 'POST', `/sites/${encodeURIComponent(id)}/deploys`, zip, 'application/zip');
  return { site_id: id, url: url || deploy.ssl_url || deploy.url, deploy_id: deploy.id };
}

// -------------------------------------------------------- github pages
const apiGithub = () => process.env.PDV_GITHUB_API || 'https://api.github.com';
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function chamarGithub(token, metodo, caminho, corpo) {
  const r = await fetch(`${apiGithub()}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ClaraStyllus-PDV', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* sem JSON */ }
  if (!r.ok) {
    const msg = (json && json.message) || r.statusText;
    const e = new Error(r.status === 401 ? 'A chave do GitHub não foi aceita. Gere outra (passo a passo em "Site da loja").'
      : r.status === 403 && /scope|permission|Resource not accessible/i.test(msg) ? 'A chave do GitHub não tem permissão. Gere a chave marcando "repo".'
        : `GitHub: ${msg}`);
    e.status = r.status;
    throw e;
  }
  return json;
}

/** Identificador do arquivo no Git (para só enviar o que mudou). */
const shaGit = (dados) => require('node:crypto').createHash('sha1').update(`blob ${dados.length}\0`).update(dados).digest('hex');

/**
 * Publica no GitHub Pages: cria o repositório público na conta da loja (na 1ª vez), manda os arquivos
 * num commit só (apenas os que mudaram) e liga o Pages. Devolve { repo: 'dono/nome', url }.
 */
async function publicarGithub({ token, repo, nome, arquivos, loja = 'Clara Styllus' }) {
  if (!token) throw new Error('Falta a chave do GitHub (passo a passo em "Site da loja").');
  const eu = await chamarGithub(token, 'GET', '/user');
  let [dono, nomeRepo] = String(repo || '').split('/');
  if (!dono || !nomeRepo) { dono = eu.login; nomeRepo = nomeSite(nome); }
  const caminho = `/repos/${encodeURIComponent(dono)}/${encodeURIComponent(nomeRepo)}`;
  let info;
  try {
    info = await chamarGithub(token, 'GET', caminho);
  } catch (e) {
    if (e.status !== 404) throw e;
    if (dono.toLowerCase() !== String(eu.login).toLowerCase()) throw new Error(`O repositório ${dono}/${nomeRepo} não existe.`);
    info = await chamarGithub(token, 'POST', '/user/repos', {
      name: nomeRepo, description: `Catálogo online da ${loja}`, auto_init: true, has_issues: false, has_wiki: false, has_projects: false,
    });
  }
  dono = info.owner.login;
  nomeRepo = info.name;
  const base = `/repos/${encodeURIComponent(dono)}/${encodeURIComponent(nomeRepo)}`;
  const ramo = info.default_branch || 'main';
  // Logo depois de criado, o repositório pode levar uns segundos para ter o primeiro commit.
  let ref = null;
  for (let i = 0; i < 8 && !ref; i++) {
    try { ref = await chamarGithub(token, 'GET', `${base}/git/ref/heads/${encodeURIComponent(ramo)}`); } catch (e) {
      if (e.status !== 404 && e.status !== 409) throw e;
      await esperar(1500);
    }
  }
  if (!ref) throw new Error('O GitHub ainda está criando o repositório. Tente de novo em 1 minuto.');
  const cabeca = ref.object.sha;
  const commit = await chamarGithub(token, 'GET', `${base}/git/commits/${cabeca}`);
  const atual = await chamarGithub(token, 'GET', `${base}/git/trees/${commit.tree.sha}?recursive=1`);
  const existentes = new Map((atual.tree || []).filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));
  const todos = [
    ...arquivos,
    { nome: '.nojekyll', dados: Buffer.alloc(0) },
    { nome: 'README.md', dados: Buffer.from(`# Catálogo online · ${loja}\n\nSite gerado pelo sistema da loja (Clara Styllus PDV). Não edite aqui: as mudanças são apagadas na próxima atualização.\n`) },
  ];
  const arvore = [];
  for (const a of todos) {
    let sha = shaGit(a.dados);
    if (existentes.get(a.nome) !== sha) {
      sha = (await chamarGithub(token, 'POST', `${base}/git/blobs`, { content: a.dados.toString('base64'), encoding: 'base64' })).sha;
    }
    arvore.push({ path: a.nome, mode: '100644', type: 'blob', sha });
  }
  const nova = await chamarGithub(token, 'POST', `${base}/git/trees`, { tree: arvore });
  if (nova.sha !== commit.tree.sha) {
    const c = await chamarGithub(token, 'POST', `${base}/git/commits`, {
      message: `Catálogo atualizado em ${new Date().toLocaleString('pt-BR')}`, tree: nova.sha, parents: [cabeca],
    });
    await chamarGithub(token, 'PATCH', `${base}/git/refs/heads/${encodeURIComponent(ramo)}`, { sha: c.sha });
  }
  let pages;
  try {
    pages = await chamarGithub(token, 'GET', `${base}/pages`);
  } catch (e) {
    if (e.status !== 404) throw e;
    pages = await chamarGithub(token, 'POST', `${base}/pages`, { source: { branch: ramo, path: '/' } });
  }
  const url = (pages && pages.html_url) || `https://${dono.toLowerCase()}.github.io/${nomeRepo}/`;
  return { repo: `${dono}/${nomeRepo}`, url };
}

module.exports = {
  publicarGithub, shaGit, montarDados, montarHtml, arquivosDoSite, lerFoto, lerExtra, lerVideo, medidasDoSite, lerCapa, paginaDaPeca, temaDoSite, blackFriday, diaDasMaes, TEMAS, ASSETS, zipar, publicar, nomeSite, whatsapp, crc32 };
