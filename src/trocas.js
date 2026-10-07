'use strict';

/**
 * Troca e devolução com vale-troca.
 *
 * A cliente devolve peças de uma venda: o estoque volta e é gerado um vale com o valor que ela
 * pagou por essas peças (já considerando descontos da venda). O vale é usado como forma de
 * pagamento ("vale") numa próxima compra; se sobrar saldo, continua valendo.
 */

function instalarTrocas({ db, rota, erro, inteiro, texto, plano, planos, transacao, config, buscarVenda }) {
  /** Itens da venda com o quanto ainda pode voltar e o valor pago por unidade. */
  function itensTrocaveis(venda) {
    const somaItens = venda.itens.reduce((a, it) => a + it.total, 0);
    // Aplica o desconto geral da venda (os juros do cartão repassados à cliente não voltam no vale).
    const fator = somaItens ? (venda.total - (venda.acrescimo || 0)) / somaItens : 1;
    return venda.itens.map((it) => {
      const devolvido = db
        .prepare('SELECT COALESCE(SUM(quantidade),0) AS n FROM troca_itens WHERE venda_item_id = ?')
        .get(it.id).n;
      return {
        ...it,
        devolvido,
        pode_voltar: it.quantidade - devolvido,
        valor_unitario_pago: Math.round((it.total / it.quantidade) * fator),
      };
    });
  }

  const novoCodigo = (id) => `VT${String(id).padStart(6, '0')}`;

  const buscarVale = (codigo) => {
    const v = plano(
      db
        .prepare(
          `SELECT v.*, c.nome AS cliente_nome FROM vales v LEFT JOIN clientes c ON c.id = v.cliente_id
           WHERE v.codigo = ? COLLATE NOCASE`
        )
        .get(codigo)
    );
    if (!v) throw erro(404, `Vale ${codigo} não encontrado.`);
    return v;
  };

  function buscarTroca(id) {
    const t = plano(db.prepare('SELECT * FROM trocas WHERE id = ?').get(id));
    if (!t) throw erro(404, 'Troca não encontrada.');
    t.itens = planos(
      db
        .prepare(
          `SELECT ti.*, vi.nome, vi.tamanho, vi.cor, vi.codigo FROM troca_itens ti
           JOIN venda_itens vi ON vi.id = ti.venda_item_id WHERE ti.troca_id = ?`
        )
        .all(id)
    );
    t.vale = t.vale_id ? plano(db.prepare('SELECT * FROM vales WHERE id = ?').get(t.vale_id)) : null;
    const v = db.prepare('SELECT c.nome FROM clientes c WHERE c.id = ?').get(t.cliente_id ?? 0);
    t.cliente_nome = v ? v.nome : null;
    return t;
  }

  rota('GET', '/api/vendas/:id/troca', ({ params }) => {
    const venda = buscarVenda(params.id);
    if (venda.status !== 'concluida') throw erro(409, 'Venda cancelada não pode ter troca.');
    return { venda, itens: itensTrocaveis(venda) };
  });

  rota('POST', '/api/vendas/:id/troca', ({ params, corpo, usuario }) => {
    const venda = buscarVenda(params.id);
    if (venda.status !== 'concluida') throw erro(409, 'Venda cancelada não pode ter troca.');
    const pedidos = (Array.isArray(corpo.itens) ? corpo.itens : []).filter((x) => Number(x.quantidade) > 0);
    if (!pedidos.length) throw erro(400, 'Escolha as peças que estão voltando.');
    const trocaveis = itensTrocaveis(venda);
    const cfg = config();
    return transacao(db, () => {
      let valor = 0;
      const linhas = pedidos.map((p) => {
        const it = trocaveis.find((x) => x.id === Number(p.venda_item_id));
        if (!it) throw erro(400, 'Item não pertence a esta venda.');
        const qtd = inteiro(p.quantidade, 'quantidade', { min: 1 });
        if (qtd > it.pode_voltar) throw erro(409, `"${it.nome}": só ${it.pode_voltar} peça(s) podem voltar.`);
        const v = it.valor_unitario_pago * qtd;
        valor += v;
        return { it, qtd, v };
      });
      const r = db
        .prepare('INSERT INTO trocas (venda_id, cliente_id, usuario, valor, motivo) VALUES (?,?,?,?,?)')
        .run(venda.id, venda.cliente_id, usuario.nome, valor, texto(corpo.motivo, 300));
      const trocaId = Number(r.lastInsertRowid);
      for (const { it, qtd, v } of linhas) {
        db.prepare('INSERT INTO troca_itens (troca_id, venda_item_id, produto_id, quantidade, valor) VALUES (?,?,?,?,?)')
          .run(trocaId, it.id, it.produto_id, qtd, v);
        const servico = db.prepare('SELECT servico FROM produtos WHERE id = ?').get(it.produto_id)?.servico;
        if (!servico) {
          db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(qtd, it.produto_id);
          db.prepare(`INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo, venda_id) VALUES (?, 'troca', ?, ?, ?)`)
            .run(it.produto_id, qtd, `Troca nº ${trocaId} (venda ${venda.id})`, venda.id);
        }
      }
      if (valor > 0) {
        const dias = Number(cfg.vale_validade_dias) || 0;
        const validade = dias ? new Date(Date.now() + dias * 864e5).toLocaleDateString('sv-SE') : null;
        const rv = db
          .prepare(`INSERT INTO vales (codigo, valor, saldo, cliente_id, origem, troca_id, validade) VALUES (?,?,?,?, 'troca', ?, ?)`)
          .run(`tmp-${trocaId}`, valor, valor, venda.cliente_id, trocaId, validade);
        const valeId = Number(rv.lastInsertRowid);
        db.prepare('UPDATE vales SET codigo = ? WHERE id = ?').run(novoCodigo(valeId), valeId);
        db.prepare('UPDATE trocas SET vale_id = ? WHERE id = ?').run(valeId, trocaId);
      }
      return buscarTroca(trocaId);
    });
  });

  rota('GET', '/api/trocas/:id', ({ params }) => buscarTroca(params.id));

  rota('GET', '/api/vales', ({ query }) => {
    const q = texto(query.get('q'));
    const ativos = query.get('ativos') !== '0';
    return planos(
      db
        .prepare(
          `SELECT v.*, c.nome AS cliente_nome FROM vales v LEFT JOIN clientes c ON c.id = v.cliente_id
           WHERE (? = 0 OR v.status = 'ativo') AND (? IS NULL OR v.codigo LIKE ? OR c.nome LIKE ?)
           ORDER BY v.id DESC LIMIT 200`
        )
        .all(ativos ? 1 : 0, q, `%${q}%`, `%${q}%`)
    );
  });

  rota('GET', '/api/vales/:codigo', ({ params }) => buscarVale(params.codigo));

  rota('POST', '/api/vales/:codigo/cancelar', ({ params }) => {
    const v = buscarVale(params.codigo);
    db.prepare(`UPDATE vales SET status = 'cancelado' WHERE id = ?`).run(v.id);
    return buscarVale(v.codigo);
  }, 'admin');

  return { buscarTroca, buscarVale };
}

module.exports = { instalarTrocas };
