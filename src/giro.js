'use strict';

/**
 * Giro do estoque e clientes interessadas.
 *
 * - Curva ABC: os modelos (nome + referência, juntando tamanhos e cores) que fazem 80% do faturamento
 *   são "A", os próximos 15% "B" e o resto "C".
 * - Peças paradas: modelos com estoque que não vendem há N dias (ou nunca venderam desde o cadastro).
 * - Interessadas: quando chega peça nova, as clientes que pediram na lista de espera ou que costumam
 *   comprar aquela categoria no tamanho que chegou.
 */

const modelo = (nome, ref) => `${String(nome || '').trim().toLowerCase()}|${String(ref || '').trim().toLowerCase()}`;

function instalarGiro({ db, rota, erro, texto, plano, planos }) {
  const hoje = () => new Date().toLocaleDateString('sv-SE');

  rota('GET', '/api/relatorios/abc', ({ query }) => {
    const de = texto(query.get('de'), 10) || hoje();
    const ate = texto(query.get('ate'), 10) || hoje();
    const linhas = planos(db.prepare(
      `SELECT p.id, p.nome, p.referencia, p.categoria, p.foto_versao, SUM(i.quantidade) AS pecas, SUM(i.total) AS total
       FROM venda_itens i JOIN vendas v ON v.id = i.venda_id JOIN produtos p ON p.id = i.produto_id
       WHERE v.status = 'concluida' AND date(v.criado_em) BETWEEN ? AND ? AND p.servico = 0
       GROUP BY p.id`
    ).all(de, ate));
    const estoques = planos(db.prepare(
      `SELECT nome, referencia, SUM(MAX(estoque, 0)) AS estoque FROM produtos
       WHERE ativo = 1 AND excluido_em IS NULL AND servico = 0 GROUP BY lower(trim(nome)), lower(trim(COALESCE(referencia, '')))`
    ).all());
    const estoquePorModelo = new Map(estoques.map((e) => [modelo(e.nome, e.referencia), e.estoque]));
    const grupos = new Map();
    for (const l of linhas) {
      const k = modelo(l.nome, l.referencia);
      const g = grupos.get(k) || { nome: l.nome, referencia: l.referencia || null, categoria: l.categoria || null, foto_id: null, foto_versao: null, pecas: 0, total: 0 };
      g.pecas += l.pecas;
      g.total += l.total;
      if (!g.foto_versao && l.foto_versao) { g.foto_id = l.id; g.foto_versao = l.foto_versao; }
      grupos.set(k, g);
    }
    const lista = [...grupos.entries()].map(([k, g]) => ({ ...g, estoque: estoquePorModelo.get(k) || 0 }))
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total);
    const soma = lista.reduce((a, g) => a + g.total, 0);
    let acum = 0;
    for (const g of lista) {
      const antes = acum;
      acum += g.total;
      g.percentual = soma ? (g.total / soma) * 100 : 0;
      g.acumulado = soma ? (acum / soma) * 100 : 0;
      // A classe vem de onde o modelo começa: o primeiro que passa de 80% ainda é A.
      const inicio = soma ? (antes / soma) * 100 : 0;
      g.classe = inicio < 80 ? 'A' : inicio < 95 ? 'B' : 'C';
    }
    const resumo = ['A', 'B', 'C'].map((c) => {
      const gs = lista.filter((g) => g.classe === c);
      return { classe: c, modelos: gs.length, total: gs.reduce((a, g) => a + g.total, 0), pecas: gs.reduce((a, g) => a + g.pecas, 0) };
    });
    return { de, ate, total: soma, resumo, modelos: lista };
  }, 'admin');

  rota('GET', '/api/relatorios/paradas', ({ query }) => {
    const dias = Math.min(730, Math.max(15, Number(query.get('dias')) || 90));
    const corte = new Date(Date.now() - dias * 864e5).toLocaleDateString('sv-SE');
    const variantes = planos(db.prepare(
      `SELECT p.id, p.nome, p.referencia, p.categoria, p.tamanho, p.cor, p.estoque, p.preco_custo, p.preco_venda, p.preco_anterior,
         p.foto_versao, p.criado_em,
         (SELECT MAX(v.criado_em) FROM venda_itens i JOIN vendas v ON v.id = i.venda_id
          WHERE i.produto_id = p.id AND v.status = 'concluida') AS ultima_venda
       FROM produtos p WHERE p.ativo = 1 AND p.excluido_em IS NULL AND p.servico = 0`
    ).all());
    const grupos = new Map();
    for (const v of variantes) {
      const k = modelo(v.nome, v.referencia);
      const g = grupos.get(k) || {
        nome: v.nome, referencia: v.referencia || null, categoria: v.categoria || null, foto_id: null, foto_versao: null,
        estoque: 0, valor_custo: 0, valor_venda: 0, ultima_venda: null, cadastrado_em: v.criado_em, em_liquidacao: false, tamanhos: new Set(),
      };
      if (v.estoque > 0) {
        g.estoque += v.estoque;
        g.valor_custo += v.estoque * v.preco_custo;
        g.valor_venda += v.estoque * v.preco_venda;
        if (v.tamanho) g.tamanhos.add(v.tamanho);
        if (v.preco_anterior > v.preco_venda) g.em_liquidacao = true;
      }
      if (v.ultima_venda && (!g.ultima_venda || v.ultima_venda > g.ultima_venda)) g.ultima_venda = v.ultima_venda;
      if (v.criado_em < g.cadastrado_em) g.cadastrado_em = v.criado_em;
      if (!g.foto_versao && v.foto_versao) { g.foto_id = v.id; g.foto_versao = v.foto_versao; }
      grupos.set(k, g);
    }
    const desde = (d) => Math.max(0, Math.floor((Date.now() - Date.parse(String(d).replace(' ', 'T'))) / 864e5));
    const paradas = [...grupos.values()]
      .filter((g) => g.estoque > 0 && (g.ultima_venda || g.cadastrado_em).slice(0, 10) < corte)
      .map((g) => ({ ...g, tamanhos: [...g.tamanhos], dias_parado: desde(g.ultima_venda || g.cadastrado_em) }))
      .sort((a, b) => b.valor_custo - a.valor_custo || b.dias_parado - a.dias_parado);
    return {
      dias,
      pecas: paradas.reduce((a, g) => a + g.estoque, 0),
      valor_custo: paradas.reduce((a, g) => a + g.valor_custo, 0),
      valor_venda: paradas.reduce((a, g) => a + g.valor_venda, 0),
      modelos: paradas.slice(0, 200),
    };
  }, 'admin');

  /**
   * Clientes para avisar quando estas peças chegam. Primeiro quem pediu na lista de espera; depois
   * quem comprou a mesma categoria (ou o mesmo modelo) num dos tamanhos que chegaram, no último ano.
   */
  rota('GET', '/api/produtos/interessadas', ({ query }) => {
    const ids = [...new Set(String(query.get('ids') || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 300);
    if (!ids.length) throw erro(400, 'Nenhuma peça informada.');
    const marcas = ids.map(() => '?').join(',');
    const pecas = planos(db.prepare(`SELECT id, nome, referencia, categoria, tamanho, cor, estoque, preco_venda, preco_anterior
      FROM produtos WHERE id IN (${marcas}) AND excluido_em IS NULL`).all(...ids));
    if (!pecas.length) throw erro(404, 'Produto não encontrado.');
    const comEstoque = pecas.filter((p) => p.estoque > 0);
    const base = comEstoque.length ? comEstoque : pecas;
    const tamanhos = [...new Set(base.map((p) => p.tamanho).filter(Boolean))];
    const cores = [...new Set(base.map((p) => p.cor).filter(Boolean))];
    const categorias = [...new Set(base.map((p) => p.categoria).filter(Boolean))];
    const nomes = [...new Set(base.map((p) => p.nome))];
    const precos = base.map((p) => p.preco_venda);
    const resultado = new Map();
    const juntar = (c, motivo, prioridade, extra = {}) => {
      const atual = resultado.get(c.id);
      if (atual && atual.prioridade <= prioridade) return;
      resultado.set(c.id, { id: c.id, nome: c.nome, telefone: c.telefone || '', motivo, prioridade, ...extra });
    };

    // 1) Lista de espera: pedido ligado a uma destas peças, ou por texto parecido com o nome.
    const esperas = planos(db.prepare(
      `SELECT e.id AS espera_id, e.produto_id, e.descricao, e.tamanho, e.cor, c.id, c.nome, c.telefone
       FROM espera e JOIN clientes c ON c.id = e.cliente_id
       WHERE e.status = 'aguardando' AND c.excluido_em IS NULL`
    ).all());
    for (const e of esperas) {
      const direto = e.produto_id && ids.includes(e.produto_id);
      const desc = String(e.descricao || '').trim().toLowerCase();
      const porTexto = !e.produto_id && desc.length >= 3 && nomes.some((n) => n.toLowerCase().includes(desc))
        && (!e.tamanho || tamanhos.some((t) => t.toLowerCase() === e.tamanho.toLowerCase()));
      if (direto || porTexto) {
        juntar(e, `Pediu na lista de espera${e.tamanho ? ` (tam ${e.tamanho})` : ''}`, 0, { espera_id: e.espera_id });
      }
    }

    // 2) Compras no último ano: mesma categoria ou mesmo modelo, num dos tamanhos que chegaram.
    const desde = new Date(Date.now() - 365 * 864e5).toLocaleDateString('sv-SE');
    const filtroTam = tamanhos.length ? `AND i.tamanho COLLATE NOCASE IN (${tamanhos.map(() => '?').join(',')})` : '';
    const filtroGrupo = [
      categorias.length ? `p.categoria IN (${categorias.map(() => '?').join(',')})` : null,
      `i.nome IN (${nomes.map(() => '?').join(',')})`,
    ].filter(Boolean).join(' OR ');
    const compras = planos(db.prepare(
      `SELECT c.id, c.nome, c.telefone, SUM(i.quantidade) AS pecas, MAX(v.criado_em) AS ultima,
         GROUP_CONCAT(DISTINCT i.tamanho) AS tams, MAX(CASE WHEN i.nome IN (${nomes.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS mesmo_modelo
       FROM venda_itens i JOIN vendas v ON v.id = i.venda_id JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN produtos p ON p.id = i.produto_id
       WHERE v.status = 'concluida' AND date(v.criado_em) >= ? AND c.excluido_em IS NULL
         AND (${filtroGrupo}) ${filtroTam}
       GROUP BY c.id ORDER BY pecas DESC, ultima DESC LIMIT 80`
    ).all(...nomes, desde, ...categorias, ...nomes, ...tamanhos));
    const catTxt = categorias.length === 1 ? categorias[0].toLowerCase() : 'peças parecidas';
    for (const c of compras) {
      const tams = String(c.tams || '').split(',').filter(Boolean).join(', ');
      const motivo = c.mesmo_modelo
        ? `Já comprou esta peça${tams ? ` (tam ${tams})` : ''}`
        : `Compra ${catTxt}${tams ? ` no tam ${tams}` : ''} · ${c.pecas} peça(s) no último ano`;
      juntar(c, motivo, c.mesmo_modelo ? 2 : 1, { pecas: c.pecas, ultima_compra: c.ultima });
    }

    const clientes = [...resultado.values()]
      .sort((a, b) => a.prioridade - b.prioridade || (b.pecas || 0) - (a.pecas || 0))
      .slice(0, 60);
    return {
      peca: {
        nome: nomes.length === 1 ? nomes[0] : nomes.slice(0, 2).join(', '),
        tamanhos, cores, categoria: categorias[0] || null,
        preco_venda: Math.min(...precos),
        preco_anterior: base.find((p) => p.preco_anterior > p.preco_venda)?.preco_anterior || null,
        estoque: comEstoque.reduce((a, p) => a + p.estoque, 0),
      },
      clientes,
    };
  }, 'logado');
}

module.exports = { instalarGiro };
