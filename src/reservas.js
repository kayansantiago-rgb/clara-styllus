'use strict';

/**
 * Reserva com sinal: a cliente escolhe as peças, paga uma parte (sinal) e as peças ficam separadas
 * (fora do estoque) até ela buscar.
 *
 *  - O sinal entra no caixa do dia em que foi pago (dinheiro soma na gaveta) e a taxa do cartão é gravada.
 *  - Na retirada, as peças voltam ao estoque e o sinal vira um vale da cliente: as peças vão para o caixa
 *    e o vale paga a parte já adiantada (a venda conta no faturamento só nesse dia).
 *  - Se ela desistir: o sinal vira vale-crédito, é devolvido em dinheiro (sai da gaveta) ou fica com a loja.
 */

const taxas = require('./taxas');

const FORMAS_SINAL = ['dinheiro', 'pix', 'debito', 'credito'];

function instalarReservas({ db, rota, erro, inteiro, texto, plano, planos, transacao, config, caixaAberto }) {
  function buscar(id) {
    const r = plano(
      db
        .prepare(
          `SELECT r.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.cpf AS cliente_cpf, c.foto_versao AS cliente_foto, v.codigo AS vale_codigo
           FROM reservas r JOIN clientes c ON c.id = r.cliente_id LEFT JOIN vales v ON v.id = r.vale_id WHERE r.id = ?`
        )
        .get(id)
    );
    if (!r) throw erro(404, 'Reserva não encontrada.');
    r.itens = planos(
      db
        .prepare(
          `SELECT ri.*, p.nome, p.tamanho, p.cor, p.codigo, p.preco_venda, p.foto_versao, p.estoque
           FROM reserva_itens ri JOIN produtos p ON p.id = ri.produto_id WHERE ri.reserva_id = ? ORDER BY ri.id`
        )
        .all(id)
    );
    r.sinais = planos(db.prepare('SELECT * FROM reserva_sinais WHERE reserva_id = ? ORDER BY id').all(id));
    r.pecas = r.itens.reduce((a, i) => a + i.quantidade, 0);
    r.total = r.itens.reduce((a, i) => a + i.quantidade * i.preco, 0);
    r.pago = r.sinais.reduce((a, s) => a + s.valor, 0);
    r.falta = Math.max(0, r.total - r.pago);
    return r;
  }

  const lerSinal = (s) => {
    const valor = inteiro(s && s.valor, 'valor do sinal', { min: 0, padrao: 0 });
    if (!valor) return null;
    const forma = String(s.forma || 'dinheiro');
    if (!FORMAS_SINAL.includes(forma)) throw erro(400, 'Forma de pagamento do sinal inválida.');
    const parcelas = forma === 'credito' ? inteiro(s.parcelas, 'parcelas', { min: 1, padrao: 1 }) : 1;
    const bandeira = forma === 'debito' || forma === 'credito' ? taxas.bandeiraValida(s.bandeira) : null;
    return { valor, forma, parcelas, bandeira };
  };

  function gravarSinal(reservaId, s, usuario) {
    const caixa = caixaAberto();
    if (!caixa) throw erro(409, 'Abra o caixa para receber o sinal.');
    db.prepare(
      `INSERT INTO reserva_sinais (reserva_id, caixa_id, operador, valor, forma, bandeira, taxa) VALUES (?,?,?,?,?,?,?)`
    ).run(reservaId, caixa.id, usuario.nome, s.valor, s.forma, s.bandeira,
      taxas.calcular(config(), s.forma, s.parcelas, s.valor, s.bandeira));
  }

  const devolverEstoque = (r, motivo) => {
    for (const it of r.itens) {
      db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(it.quantidade, it.produto_id);
      db.prepare(`INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo) VALUES (?, 'reserva', ?, ?)`)
        .run(it.produto_id, it.quantidade, motivo);
    }
  };

  /** O que já foi pago vira um vale da cliente (código RS000123). */
  function criarVale(r, origem) {
    if (!r.pago) return null;
    const rv = db
      .prepare(`INSERT INTO vales (codigo, valor, saldo, cliente_id, origem) VALUES (?,?,?,?,?)`)
      .run(`tmp-rs-${r.id}-${Date.now()}`, r.pago, r.pago, r.cliente_id, origem);
    const id = Number(rv.lastInsertRowid);
    const codigo = `RS${String(id).padStart(6, '0')}`;
    db.prepare('UPDATE vales SET codigo = ? WHERE id = ?').run(codigo, id);
    db.prepare('UPDATE reservas SET vale_id = ? WHERE id = ?').run(id, r.id);
    return { id, codigo, saldo: r.pago };
  }

  rota('GET', '/api/reservas', ({ query }) => {
    const status = texto(query.get('status')) || 'aberta';
    const ids = db
      .prepare(`SELECT id FROM reservas WHERE (? = 'todas' OR status = ?) ORDER BY status = 'aberta' DESC, prazo, id DESC LIMIT 200`)
      .all(status, status);
    return ids.map((r) => buscar(r.id));
  });

  rota('GET', '/api/reservas/:id', ({ params }) => buscar(params.id));

  /**
   * Cria a reserva: as peças saem do estoque e ficam separadas até o prazo. Usada pelo balcão e pelos
   * pedidos que chegam do site (origem 'site').
   */
  function criarReserva({ clienteId, itens, prazo, observacao, usuarioNome, sinal, origem = null }) {
    if (!db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(clienteId)) throw erro(400, 'Cliente não encontrada.');
    if (!itens.length) throw erro(400, 'Bipe as peças que vão ficar reservadas.');
    const cfg = config();
    const dias = Number(cfg.reserva_prazo_dias) || 7;
    const ate = prazo || new Date(Date.now() + dias * 864e5).toLocaleDateString('sv-SE');
    return transacao(db, () => {
      const r = db.prepare('INSERT INTO reservas (cliente_id, usuario, prazo, observacao, origem) VALUES (?,?,?,?,?)')
        .run(clienteId, usuarioNome, ate, observacao || null, origem);
      const id = Number(r.lastInsertRowid);
      let total = 0;
      for (const it of itens) {
        const p = plano(db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(it.produto_id));
        if (!p) throw erro(400, 'Produto não encontrado.');
        if (p.servico) throw erro(400, `"${p.nome}" é serviço e não pode ser reservado.`);
        const qtd = inteiro(it.quantidade, 'quantidade', { min: 1 });
        if (p.estoque < qtd && cfg.estoque_negativo !== '1') {
          throw erro(409, `Estoque insuficiente de "${p.nome} ${[p.tamanho, p.cor].filter(Boolean).join(' ')}" (disponível: ${p.estoque}).`);
        }
        total += qtd * p.preco_venda;
        db.prepare('INSERT INTO reserva_itens (reserva_id, produto_id, quantidade, preco) VALUES (?,?,?,?)').run(id, p.id, qtd, p.preco_venda);
        db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(qtd, p.id);
        db.prepare(`INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo) VALUES (?, 'reserva', ?, ?)`)
          .run(p.id, -qtd, `Reserva nº ${id}`);
      }
      if (sinal) {
        if (sinal.valor > total) throw erro(400, 'O sinal não pode ser maior que o total da reserva.');
        gravarSinal(id, sinal, { nome: usuarioNome });
      }
      return buscar(id);
    });
  }

  rota('POST', '/api/reservas', ({ corpo, usuario }) => criarReserva({
    clienteId: inteiro(corpo.cliente_id, 'cliente', { min: 1 }),
    itens: Array.isArray(corpo.itens) ? corpo.itens : [],
    prazo: texto(corpo.prazo, 10),
    observacao: texto(corpo.observacao, 300),
    usuarioNome: usuario.nome,
    sinal: lerSinal(corpo.sinal),
  }));

  /** Mais um pagamento (a cliente adiantou mais um pouco). */
  rota('POST', '/api/reservas/:id/sinal', ({ params, corpo, usuario }) => {
    const r = buscar(params.id);
    if (r.status !== 'aberta') throw erro(409, 'Esta reserva já foi encerrada.');
    const sinal = lerSinal(corpo);
    if (!sinal) throw erro(400, 'Informe o valor.');
    if (sinal.valor > r.falta) throw erro(400, `Falta só R$ ${(r.falta / 100).toFixed(2).replace('.', ',')} para quitar a reserva.`);
    return transacao(db, () => {
      gravarSinal(r.id, sinal, usuario);
      return buscar(r.id);
    });
  });

  rota('POST', '/api/reservas/:id/prazo', ({ params, corpo }) => {
    const r = buscar(params.id);
    if (r.status !== 'aberta') throw erro(409, 'Esta reserva já foi encerrada.');
    const prazo = texto(corpo.prazo, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo || '')) throw erro(400, 'Data inválida.');
    db.prepare('UPDATE reservas SET prazo = ? WHERE id = ?').run(prazo, r.id);
    return buscar(r.id);
  });

  /**
   * A cliente veio buscar: as peças voltam ao estoque e vão para o caixa; o que ela já pagou vira vale.
   * Devolve as peças (com o preço combinado) e o vale para o caixa montar a venda.
   */
  rota('POST', '/api/reservas/:id/retirar', ({ params }) => {
    const r = buscar(params.id);
    if (r.status !== 'aberta') throw erro(409, 'Esta reserva já foi encerrada.');
    return transacao(db, () => {
      devolverEstoque(r, `Reserva nº ${r.id} retirada`);
      const vale = criarVale(r, 'reserva');
      db.prepare(`UPDATE reservas SET status = 'retirada', destino_sinal = 'venda', fechada_em = datetime('now','localtime') WHERE id = ?`).run(r.id);
      return {
        reserva: buscar(r.id),
        vale,
        itens: r.itens.map((it) => ({ produto_id: it.produto_id, quantidade: it.quantidade, preco: it.preco })),
      };
    });
  });

  /** Desistência. destino: 'vale' (crédito na loja), 'dinheiro' (devolve da gaveta) ou 'loja' (a loja fica com o sinal). */
  rota('POST', '/api/reservas/:id/cancelar', ({ params, corpo }) => {
    const r = buscar(params.id);
    if (r.status !== 'aberta') throw erro(409, 'Esta reserva já foi encerrada.');
    const destino = r.pago ? String(corpo.destino || '') : 'nenhum';
    if (r.pago && !['vale', 'dinheiro', 'loja'].includes(destino)) throw erro(400, 'Escolha o que fazer com o sinal.');
    return transacao(db, () => {
      devolverEstoque(r, `Reserva nº ${r.id} cancelada`);
      let vale = null;
      if (destino === 'vale') vale = criarVale(r, 'reserva');
      if (destino === 'dinheiro') {
        const caixa = caixaAberto();
        if (!caixa) throw erro(409, 'Abra o caixa para devolver o sinal em dinheiro.');
        db.prepare(`INSERT INTO caixa_movimentos (caixa_id, tipo, valor, motivo) VALUES (?, 'sangria', ?, ?)`)
          .run(caixa.id, r.pago, `Devolução do sinal da reserva nº ${r.id} (${r.cliente_nome})`);
      }
      db.prepare(`UPDATE reservas SET status = 'cancelada', destino_sinal = ?, fechada_em = datetime('now','localtime') WHERE id = ?`)
        .run(destino, r.id);
      return { reserva: buscar(r.id), vale };
    });
  });

  /** Sinais recebidos num caixa, por forma (entram no fechamento; dinheiro soma na gaveta). */
  const sinaisDoCaixa = (caixaId) =>
    planos(
      db
        .prepare('SELECT forma, SUM(valor) AS valor, COUNT(*) AS quantidade FROM reserva_sinais WHERE caixa_id = ? GROUP BY forma')
        .all(caixaId)
    );

  /** Cancela uma reserva que não tem sinal pago (ex.: pedido do site que a cliente desistiu). */
  function cancelarSemSinal(id, motivo) {
    const r = buscar(id);
    if (r.status !== 'aberta') return r;
    if (r.pago) throw erro(409, 'Esta reserva tem sinal pago: cancele pela tela de Reservas para escolher o que fazer com o sinal.');
    return transacao(db, () => {
      devolverEstoque(r, motivo || `Reserva nº ${r.id} cancelada`);
      db.prepare(`UPDATE reservas SET status = 'cancelada', destino_sinal = 'nenhum', fechada_em = datetime('now','localtime') WHERE id = ?`).run(r.id);
      return buscar(r.id);
    });
  }

  return { buscar, sinaisDoCaixa, criarReserva, cancelarSemSinal };
}

module.exports = { instalarReservas };
