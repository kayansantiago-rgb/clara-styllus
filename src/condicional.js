'use strict';

/**
 * Venda condicional ("malinha"): a cliente leva peças para provar em casa.
 *
 * Ao sair, as peças saem do estoque (para ninguém vender a mesma peça). Ao fechar, tudo volta
 * para o estoque e as peças que ela ficou vão para o caixa como uma venda normal.
 */

function instalarCondicional({ db, rota, erro, inteiro, texto, plano, planos, transacao, config }) {
  function buscar(id) {
    const c = plano(
      db
        .prepare(
          `SELECT c.*, cl.nome AS cliente_nome, cl.telefone AS cliente_telefone, cl.cpf AS cliente_cpf, cl.foto_versao AS cliente_foto
           FROM condicionais c JOIN clientes cl ON cl.id = c.cliente_id WHERE c.id = ?`
        )
        .get(id)
    );
    if (!c) throw erro(404, 'Condicional não encontrada.');
    c.itens = planos(
      db
        .prepare(
          `SELECT ci.*, p.nome, p.tamanho, p.cor, p.codigo, p.preco_venda, p.preco_anterior, p.foto_versao, p.estoque
           FROM condicional_itens ci JOIN produtos p ON p.id = ci.produto_id WHERE ci.condicional_id = ? ORDER BY ci.id`
        )
        .all(id)
    );
    c.pecas = c.itens.reduce((a, i) => a + i.quantidade, 0);
    c.valor = c.itens.reduce((a, i) => a + i.quantidade * i.preco_venda, 0);
    return c;
  }

  const devolverEstoque = (c, motivo) => {
    for (const it of c.itens) {
      db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(it.quantidade, it.produto_id);
      db.prepare(`INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo) VALUES (?, 'condicional', ?, ?)`)
        .run(it.produto_id, it.quantidade, motivo);
    }
  };

  rota('GET', '/api/condicionais', ({ query }) => {
    const status = texto(query.get('status')) || 'aberta';
    const ids = db
      .prepare(`SELECT id FROM condicionais WHERE (? = 'todas' OR status = ?) ORDER BY status = 'aberta' DESC, prazo, id DESC LIMIT 200`)
      .all(status, status);
    return ids.map((r) => buscar(r.id));
  });

  rota('GET', '/api/condicionais/:id', ({ params }) => buscar(params.id));

  rota('POST', '/api/condicionais', ({ corpo, usuario }) => {
    const clienteId = inteiro(corpo.cliente_id, 'cliente', { min: 1 });
    if (!db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(clienteId)) throw erro(400, 'Cliente não encontrado.');
    const itens = Array.isArray(corpo.itens) ? corpo.itens : [];
    if (!itens.length) throw erro(400, 'Bipe as peças que a cliente vai levar.');
    const dias = Number(config().condicional_prazo_dias) || 3;
    const prazo = texto(corpo.prazo, 10) || new Date(Date.now() + dias * 864e5).toLocaleDateString('sv-SE');
    return transacao(db, () => {
      const r = db.prepare('INSERT INTO condicionais (cliente_id, usuario, prazo, observacao) VALUES (?,?,?,?)')
        .run(clienteId, usuario.nome, prazo, texto(corpo.observacao, 300));
      const id = Number(r.lastInsertRowid);
      for (const it of itens) {
        const p = plano(db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(it.produto_id));
        if (!p) throw erro(400, 'Produto não encontrado.');
        if (p.servico) throw erro(400, `"${p.nome}" é serviço e não vai na condicional.`);
        const qtd = inteiro(it.quantidade, 'quantidade', { min: 1 });
        if (p.estoque < qtd && config().estoque_negativo !== '1') {
          throw erro(409, `Estoque insuficiente de "${p.nome} ${[p.tamanho, p.cor].filter(Boolean).join(' ')}" (disponível: ${p.estoque}).`);
        }
        db.prepare('INSERT INTO condicional_itens (condicional_id, produto_id, quantidade) VALUES (?,?,?)').run(id, p.id, qtd);
        db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(qtd, p.id);
        db.prepare(`INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo) VALUES (?, 'condicional', ?, ?)`)
          .run(p.id, -qtd, `Condicional nº ${id}`);
      }
      return buscar(id);
    });
  });

  /**
   * Fecha a condicional: itens = [{ id, ficou }]. Tudo volta ao estoque e devolve a lista das
   * peças que a cliente ficou, para a venda ser feita no caixa.
   */
  rota('POST', '/api/condicionais/:id/fechar', ({ params, corpo }) => {
    const c = buscar(params.id);
    if (c.status !== 'aberta') throw erro(409, 'Esta condicional já foi encerrada.');
    const escolhas = new Map((Array.isArray(corpo.itens) ? corpo.itens : []).map((x) => [Number(x.id), x.ficou]));
    return transacao(db, () => {
      const ficou = [];
      for (const it of c.itens) {
        const n = Math.min(it.quantidade, inteiro(escolhas.get(it.id) ?? 0, 'ficou', { min: 0 }));
        db.prepare('UPDATE condicional_itens SET ficou = ? WHERE id = ?').run(n, it.id);
        if (n) ficou.push({ produto_id: it.produto_id, quantidade: n });
      }
      devolverEstoque(c, `Condicional nº ${c.id} devolvida`);
      db.prepare(`UPDATE condicionais SET status = 'fechada', fechada_em = datetime('now','localtime') WHERE id = ?`).run(c.id);
      return { condicional: buscar(c.id), ficou };
    });
  });

  rota('POST', '/api/condicionais/:id/cancelar', ({ params }) => {
    const c = buscar(params.id);
    if (c.status !== 'aberta') throw erro(409, 'Esta condicional já foi encerrada.');
    return transacao(db, () => {
      devolverEstoque(c, `Condicional nº ${c.id} cancelada`);
      db.prepare(`UPDATE condicionais SET status = 'cancelada', fechada_em = datetime('now','localtime') WHERE id = ?`).run(c.id);
      return buscar(c.id);
    });
  }, 'admin');

  return { buscar };
}

module.exports = { instalarCondicional };
