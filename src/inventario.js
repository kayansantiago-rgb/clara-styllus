'use strict';

/**
 * Inventário pelo leitor de código de barras.
 *
 * Abre-se um inventário (da loja toda ou de uma categoria), bipa-se cada peça, confere-se
 * faltas e sobras contra o estoque do sistema e, ao finalizar, o estoque passa a ser o contado.
 * As leituras ficam registradas uma a uma para permitir desfazer a última.
 */

function instalarInventario({ db, rota, erro, inteiro, texto, plano, planos, transacao }) {
  const buscar = (id) => {
    const inv = plano(db.prepare('SELECT * FROM inventarios WHERE id = ?').get(id));
    if (!inv) throw erro(404, 'Inventário não encontrado.');
    return inv;
  };
  const aberto = (id) => {
    const inv = buscar(id);
    if (inv.status !== 'aberto') throw erro(409, 'Este inventário já foi encerrado.');
    return inv;
  };

  /** Produtos que entram neste inventário (todos os ativos ou só da categoria). */
  const filtroEscopo = (inv) =>
    inv.categoria ? { sql: 'p.ativo = 1 AND p.categoria = ? COLLATE NOCASE', args: [inv.categoria] } : { sql: 'p.ativo = 1', args: [] };

  const contado = (invId, produtoId) =>
    db.prepare('SELECT COALESCE(SUM(quantidade),0) AS n FROM inventario_leituras WHERE inventario_id = ? AND produto_id = ?')
      .get(invId, produtoId).n;

  function resumo(inv) {
    const f = filtroEscopo(inv);
    const esc = db
      .prepare(`SELECT COUNT(*) AS produtos, COALESCE(SUM(MAX(p.estoque,0)),0) AS esperado FROM produtos p WHERE ${f.sql}`)
      .get(...f.args);
    const cont = db
      .prepare(
        `SELECT COUNT(*) AS produtos, COALESCE(SUM(n),0) AS pecas FROM
           (SELECT produto_id, SUM(quantidade) AS n FROM inventario_leituras WHERE inventario_id = ?
            GROUP BY produto_id HAVING n <> 0)`
      )
      .get(inv.id);
    return {
      produtos_escopo: esc.produtos,
      pecas_esperadas: esc.esperado,
      produtos_contados: cont.produtos,
      pecas_contadas: cont.pecas,
    };
  }

  /** Compara o contado com o estoque de cada produto do escopo. */
  function conferencia(inv) {
    const f = filtroEscopo(inv);
    const itens = planos(
      db
        .prepare(
          `SELECT p.id, p.codigo, p.nome, p.tamanho, p.cor, p.referencia, p.preco_custo, p.preco_venda, p.foto_versao,
             p.estoque, COALESCE(l.n, 0) AS contado, COALESCE(l.n, 0) - p.estoque AS diferenca, l.n IS NOT NULL AS bipado
           FROM produtos p
           LEFT JOIN (SELECT produto_id, SUM(quantidade) AS n FROM inventario_leituras
                      WHERE inventario_id = ? GROUP BY produto_id) l ON l.produto_id = p.id
           WHERE ${f.sql}
           ORDER BY p.nome, p.cor, p.tamanho`
        )
        .all(inv.id, ...f.args)
    );
    const soma = (lista, fn) => lista.reduce((a, x) => a + fn(x), 0);
    const sobras = itens.filter((i) => i.diferenca > 0);
    const faltas = itens.filter((i) => i.diferenca < 0);
    return {
      itens,
      totais: {
        ok: itens.length - sobras.length - faltas.length,
        sobras: sobras.length,
        faltas: faltas.length,
        nao_bipados_com_estoque: itens.filter((i) => !i.bipado && i.estoque > 0).length,
        pecas_sobra: soma(sobras, (i) => i.diferenca),
        pecas_falta: soma(faltas, (i) => -i.diferenca),
        valor_sobra: soma(sobras, (i) => i.diferenca * i.preco_custo),
        valor_falta: soma(faltas, (i) => -i.diferenca * i.preco_custo),
      },
    };
  }

  const ultimasLeituras = (invId) =>
    planos(
      db
        .prepare(
          `SELECT l.id, l.quantidade, l.criado_em, l.usuario, p.id AS produto_id, p.nome, p.tamanho, p.cor, p.codigo, p.foto_versao,
             (SELECT SUM(quantidade) FROM inventario_leituras x WHERE x.inventario_id = l.inventario_id AND x.produto_id = l.produto_id) AS contado,
             p.estoque
           FROM inventario_leituras l JOIN produtos p ON p.id = l.produto_id
           WHERE l.inventario_id = ? ORDER BY l.id DESC LIMIT 30`
        )
        .all(invId)
    );

  // ---------------------------------------------------------------- rotas
  rota('GET', '/api/categorias', () =>
    planos(db.prepare(`SELECT categoria, COUNT(*) AS produtos FROM produtos WHERE ativo = 1 AND categoria IS NOT NULL AND categoria <> ''
      GROUP BY categoria COLLATE NOCASE ORDER BY categoria`).all()));

  rota('GET', '/api/inventarios', () => ({
    aberto: plano(db.prepare(`SELECT * FROM inventarios WHERE status = 'aberto' ORDER BY id DESC LIMIT 1`).get()) || null,
    historico: planos(db.prepare(`SELECT * FROM inventarios ORDER BY id DESC LIMIT 50`).all()),
  }));

  rota('POST', '/api/inventarios', ({ corpo, usuario }) => {
    if (db.prepare(`SELECT 1 FROM inventarios WHERE status = 'aberto'`).get()) {
      throw erro(409, 'Já existe um inventário aberto. Finalize ou cancele antes de começar outro.');
    }
    const categoria = texto(corpo.categoria, 100);
    const descricao = texto(corpo.descricao, 200) || (categoria ? `Inventário de ${categoria}` : 'Inventário da loja toda');
    const r = db.prepare('INSERT INTO inventarios (descricao, categoria, usuario) VALUES (?,?,?)').run(descricao, categoria, usuario.nome);
    const inv = buscar(r.lastInsertRowid);
    return { inventario: inv, resumo: resumo(inv), leituras: [] };
  }, 'admin');

  rota('GET', '/api/inventarios/:id', ({ params }) => {
    const inv = buscar(params.id);
    return { inventario: inv, resumo: resumo(inv), leituras: ultimasLeituras(inv.id) };
  });

  rota('POST', '/api/inventarios/:id/bipar', ({ params, corpo, usuario }) => {
    const inv = aberto(params.id);
    const codigo = texto(corpo.codigo, 100);
    if (!codigo) throw erro(400, 'Informe o código.');
    const quantidade = inteiro(corpo.quantidade, 'quantidade', { min: 1, padrao: 1 });
    const p = plano(db.prepare('SELECT * FROM produtos WHERE codigo = ?').get(codigo));
    if (!p) throw erro(404, `Código ${codigo} não está cadastrado.`);
    if (!p.ativo) throw erro(409, `"${p.nome}" está inativo no cadastro. Reative o produto para contar.`);
    if (inv.categoria && String(p.categoria || '').toLowerCase() !== inv.categoria.toLowerCase()) {
      throw erro(409, `"${p.nome}" é da categoria "${p.categoria || 'sem categoria'}" e este inventário é só de ${inv.categoria}.`);
    }
    db.prepare('INSERT INTO inventario_leituras (inventario_id, produto_id, quantidade, usuario) VALUES (?,?,?,?)')
      .run(inv.id, p.id, quantidade, usuario.nome);
    return { produto: p, contado: contado(inv.id, p.id), resumo: resumo(inv), leituras: ultimasLeituras(inv.id) };
  });

  /** Corrige a contagem de um produto (digitando o número certo). */
  rota('PUT', '/api/inventarios/:id/contagem/:produto', ({ params, corpo, usuario }) => {
    const inv = aberto(params.id);
    const novo = inteiro(corpo.contado, 'contado', { min: 0 });
    const atual = contado(inv.id, params.produto);
    if (novo !== atual) {
      db.prepare('INSERT INTO inventario_leituras (inventario_id, produto_id, quantidade, usuario) VALUES (?,?,?,?)')
        .run(inv.id, params.produto, novo - atual, usuario.nome);
    }
    return { contado: novo, resumo: resumo(inv), leituras: ultimasLeituras(inv.id) };
  });

  rota('POST', '/api/inventarios/:id/desfazer', ({ params }) => {
    const inv = aberto(params.id);
    const ult = db.prepare('SELECT id FROM inventario_leituras WHERE inventario_id = ? ORDER BY id DESC LIMIT 1').get(inv.id);
    if (!ult) throw erro(409, 'Nada para desfazer.');
    db.prepare('DELETE FROM inventario_leituras WHERE id = ?').run(ult.id);
    return { resumo: resumo(inv), leituras: ultimasLeituras(inv.id) };
  });

  rota('GET', '/api/inventarios/:id/conferencia', ({ params }) => {
    const inv = buscar(params.id);
    if (inv.status === 'finalizado') {
      // Inventário encerrado: mostra o retrato do momento em que foi finalizado.
      const itens = planos(
        db
          .prepare(
            `SELECT p.id, p.codigo, p.nome, p.tamanho, p.cor, p.preco_custo, p.foto_versao,
               i.estoque_sistema AS estoque, i.contado, i.contado - i.estoque_sistema AS diferenca, 1 AS bipado
             FROM inventario_itens i JOIN produtos p ON p.id = i.produto_id WHERE i.inventario_id = ?
             ORDER BY p.nome, p.cor, p.tamanho`
          )
          .all(inv.id)
      );
      return { inventario: inv, itens, totais: { valor_sobra: inv.valor_sobra, valor_falta: inv.valor_falta, ajustados: inv.ajustados } };
    }
    return { inventario: inv, ...conferencia(inv) };
  });

  rota('POST', '/api/inventarios/:id/finalizar', ({ params, corpo }) => {
    const inv = aberto(params.id);
    const zerar = corpo.zerar_nao_bipados !== false;
    return transacao(db, () => {
      const { itens } = conferencia(inv);
      let ajustados = 0;
      let valorSobra = 0;
      let valorFalta = 0;
      const insItem = db.prepare(
        'INSERT INTO inventario_itens (inventario_id, produto_id, estoque_sistema, contado) VALUES (?,?,?,?)'
      );
      for (const it of itens) {
        if (!it.bipado && !zerar) continue;
        insItem.run(inv.id, it.id, it.estoque, it.contado);
        if (!it.diferenca) continue;
        ajustados++;
        if (it.diferenca > 0) valorSobra += it.diferenca * it.preco_custo;
        else valorFalta += -it.diferenca * it.preco_custo;
        db.prepare('UPDATE produtos SET estoque = ? WHERE id = ?').run(it.contado, it.id);
        db.prepare(
          `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo) VALUES (?, 'inventario', ?, ?)`
        ).run(it.id, it.diferenca, `Inventário nº ${inv.id}`);
      }
      db.prepare(
        `UPDATE inventarios SET status = 'finalizado', finalizado_em = datetime('now','localtime'),
           ajustados = ?, valor_sobra = ?, valor_falta = ? WHERE id = ?`
      ).run(ajustados, valorSobra, valorFalta, inv.id);
      return buscar(inv.id);
    });
  }, 'admin');

  rota('POST', '/api/inventarios/:id/cancelar', ({ params }) => {
    const inv = aberto(params.id);
    db.prepare(`UPDATE inventarios SET status = 'cancelado', finalizado_em = datetime('now','localtime') WHERE id = ?`).run(inv.id);
    return buscar(inv.id);
  }, 'admin');
}

module.exports = { instalarInventario };
