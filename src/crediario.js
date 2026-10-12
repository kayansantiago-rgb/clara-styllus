'use strict';

/**
 * Crediário (venda fiada / carnê da loja).
 *
 * Uma compra no crediário vira N parcelas com vencimento mensal. O recebimento é
 * lançado no caixa aberto e abate as parcelas em aberto da mais antiga para a mais nova.
 */

/** Soma meses a uma data 'AAAA-MM-DD' mantendo o dia (ou o último dia do mês). */
function somarMeses(data, meses) {
  const [a, m, d] = data.split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimo));
  return alvo.toLocaleDateString('sv-SE');
}

function somarDias(data, dias) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(a, m - 1, d + dias).toLocaleDateString('sv-SE');
}

const hoje = () => new Date().toLocaleDateString('sv-SE');
const dataValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));

/** Divide o valor em n parcelas; os centavos que sobram vão para a primeira. */
function dividir(valor, n) {
  const base = Math.floor(valor / n);
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? valor - base * n : 0));
}

const taxas = require('./taxas');

function instalarCrediario({ db, rota, erro, inteiro, texto, plano, planos, transacao, config, caixaAberto }) {
  const saldo = (clienteId) => {
    const r = db
      .prepare(
        `SELECT COALESCE(SUM(valor - valor_pago),0) AS aberto,
           COALESCE(SUM(CASE WHEN vencimento < ? THEN valor - valor_pago END),0) AS vencido,
           MIN(vencimento) AS proximo_vencimento
         FROM crediario_parcelas WHERE cliente_id = ? AND status = 'aberta'`
      )
      .get(hoje(), clienteId);
    return { ...r };
  };

  const limiteDe = (cliente) => {
    if (cliente.limite_credito != null) return cliente.limite_credito;
    const padrao = config().crediario_limite_padrao;
    return padrao === '' || padrao == null ? null : Number(padrao);
  };

  /** Valida e cria as parcelas (chamar dentro de uma transação). */
  function lancarParcelas({ clienteId, vendaId = null, valor, parcelas, primeiroVencimento, descricao, validarLimite = true }) {
    const cfg = config();
    const cliente = plano(db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId));
    if (!cliente) throw erro(400, 'Cliente não encontrado.');
    const max = Number(cfg.crediario_max_parcelas) || 12;
    if (parcelas < 1 || parcelas > Math.max(max, 1)) {
      throw erro(400, `O crediário aceita de 1 a ${max} parcelas.`);
    }
    if (validarLimite) {
      const s = saldo(clienteId);
      if (cfg.crediario_bloquear_atraso === '1' && s.vencido > 0) {
        throw erro(409, `${cliente.nome} tem parcelas em atraso no crediário. Receba antes de vender fiado.`);
      }
      const limite = limiteDe(cliente);
      if (limite != null && s.aberto + valor > limite) {
        const disp = Math.max(0, limite - s.aberto);
        throw erro(409, `Limite de crédito de ${cliente.nome} excedido (disponível: R$ ${(disp / 100).toFixed(2).replace('.', ',')}).`);
      }
    }
    const primeiro = primeiroVencimento || somarDias(hoje(), Number(cfg.crediario_dias_primeira) || 30);
    if (!dataValida(primeiro)) throw erro(400, 'Data do primeiro vencimento inválida.');
    const ins = db.prepare(
      `INSERT INTO crediario_parcelas (cliente_id, venda_id, descricao, numero, total_parcelas, valor, vencimento)
       VALUES (?,?,?,?,?,?,?)`
    );
    dividir(valor, parcelas).forEach((v, i) => {
      ins.run(clienteId, vendaId, descricao, i + 1, parcelas, v, somarMeses(primeiro, i));
    });
  }

  const parcelasDaVenda = (vendaId) =>
    planos(db.prepare('SELECT * FROM crediario_parcelas WHERE venda_id = ? ORDER BY numero').all(vendaId));

  /** Cancela as parcelas de uma venda cancelada (só se nada foi pago ainda). */
  function cancelarDaVenda(vendaId) {
    const pagas = db
      .prepare(`SELECT COUNT(*) AS n FROM crediario_parcelas WHERE venda_id = ? AND valor_pago > 0`)
      .get(vendaId).n;
    if (pagas) {
      throw erro(409, 'Esta venda tem parcelas do crediário já recebidas. Estorne os recebimentos antes de cancelar.');
    }
    db.prepare(`UPDATE crediario_parcelas SET status = 'cancelada' WHERE venda_id = ?`).run(vendaId);
  }

  /** Recebimentos do crediário em um caixa, por forma de pagamento. */
  const recebimentosDoCaixa = (caixaId) =>
    planos(
      db
        .prepare(
          `SELECT forma, SUM(valor) AS valor, COUNT(*) AS quantidade FROM crediario_recebimentos
           WHERE caixa_id = ? AND (status = 'ok' OR (status = 'estornado' AND estornado_caixa_id IS NOT NULL
             AND estornado_caixa_id <> caixa_id)) GROUP BY forma`
        )
        .all(caixaId)
    );

  const buscarRecebimento = (id) => {
    const r = plano(
      db
        .prepare(
          `SELECT r.*, c.nome AS cliente_nome, c.cpf AS cliente_cpf FROM crediario_recebimentos r
           JOIN clientes c ON c.id = r.cliente_id WHERE r.id = ?`
        )
        .get(id)
    );
    if (!r) throw erro(404, 'Recebimento não encontrado.');
    r.parcelas = planos(
      db
        .prepare(
          `SELECT p.*, rp.valor AS valor_recebido FROM crediario_recebimento_parcelas rp
           JOIN crediario_parcelas p ON p.id = rp.parcela_id WHERE rp.recebimento_id = ? ORDER BY p.vencimento`
        )
        .all(id)
    );
    r.saldo = saldo(r.cliente_id);
    return r;
  };

  function resumoGeral(de, ate) {
    const h = hoje();
    const a = db
      .prepare(
        `SELECT COALESCE(SUM(valor - valor_pago),0) AS a_receber,
           COALESCE(SUM(CASE WHEN vencimento < ? THEN valor - valor_pago END),0) AS vencido,
           COUNT(DISTINCT cliente_id) AS clientes,
           COUNT(DISTINCT CASE WHEN vencimento < ? THEN cliente_id END) AS clientes_atraso
         FROM crediario_parcelas WHERE status = 'aberta'`
      )
      .get(h, h);
    const rec = db
      .prepare(
        `SELECT COALESCE(SUM(valor),0) AS recebido FROM crediario_recebimentos
         WHERE status = 'ok' AND date(criado_em) BETWEEN ? AND ?`
      )
      .get(de || h, ate || h);
    return { ...a, recebido: rec.recebido };
  }

  // ---------------------------------------------------------------- rotas
  rota('GET', '/api/crediario/resumo', ({ query }) =>
    resumoGeral(texto(query.get('de'), 10), texto(query.get('ate'), 10)));

  /** Crediários já quitados: clientes que compraram no crediário e não devem mais nada. */
  /**
   * Fila de cobrança: quem tem parcela vencida, vencendo hoje (ou nos próximos N dias, em
   * Configurações), com a última cobrança feita — para cobrar todo mundo no WhatsApp em sequência.
   */
  rota('GET', '/api/crediario/cobrar', () => {
    const h = hoje();
    const dias = Math.max(0, Math.min(15, Number(config().cobranca_dias_antes) || 0));
    const limite = new Date(Date.now() + dias * 864e5).toLocaleDateString('sv-SE');
    const lista = planos(db.prepare(
      `SELECT c.id, c.nome, c.telefone,
         SUM(p.valor - p.valor_pago) AS saldo,
         COALESCE(SUM(CASE WHEN p.vencimento < ? THEN p.valor - p.valor_pago END), 0) AS vencido,
         COALESCE(SUM(CASE WHEN p.vencimento >= ? AND p.vencimento <= ? THEN p.valor - p.valor_pago END), 0) AS a_vencer,
         MIN(CASE WHEN p.vencimento >= ? THEN p.vencimento END) AS proximo_vencimento,
         CAST(julianday(?) - julianday(MIN(CASE WHEN p.vencimento < ? THEN p.vencimento END)) AS INTEGER) AS dias_atraso,
         (SELECT MAX(criado_em) FROM crediario_cobrancas cc WHERE cc.cliente_id = c.id) AS ultima_cobranca
       FROM crediario_parcelas p JOIN clientes c ON c.id = p.cliente_id
       WHERE p.status = 'aberta' AND c.excluido_em IS NULL
       GROUP BY c.id
       HAVING vencido > 0 OR a_vencer > 0`
    ).all(h, h, limite, h, h, h));
    for (const c of lista) c.cobrada_hoje = !!(c.ultima_cobranca && c.ultima_cobranca.slice(0, 10) === h);
    // Primeiro quem ainda não foi cobrada hoje; depois os mais atrasados.
    lista.sort((a, b) => a.cobrada_hoje - b.cobrada_hoje || (b.dias_atraso || 0) - (a.dias_atraso || 0) || b.vencido - a.vencido);
    return { dias_antes: dias, clientes: lista, pendentes: lista.filter((c) => !c.cobrada_hoje).length };
  });

  rota('POST', '/api/crediario/cobrancas', ({ corpo, usuario }) => {
    const clienteId = inteiro(corpo.cliente_id, 'cliente', { min: 1 });
    if (!db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(clienteId)) throw erro(404, 'Cliente não encontrada.');
    const vencido = db.prepare(`SELECT COALESCE(SUM(valor - valor_pago), 0) AS v FROM crediario_parcelas
      WHERE cliente_id = ? AND status = 'aberta' AND vencimento < ?`).get(clienteId, hoje()).v;
    const r = db.prepare('INSERT INTO crediario_cobrancas (cliente_id, usuario, vencido) VALUES (?,?,?)').run(clienteId, usuario.nome, vencido);
    return { ok: true, id: Number(r.lastInsertRowid) };
  });

  rota('GET', '/api/crediario/quitados', ({ query }) => {
    const q = texto(query.get('q'));
    const args = [];
    let filtro = '';
    if (q) {
      const dig = q.replace(/\D/g, '');
      filtro = `AND (c.nome LIKE ? OR (? <> '' AND (c.cpf LIKE ? OR c.telefone LIKE ?)))`;
      args.push(`%${q}%`, dig, `%${dig}%`, `%${dig}%`);
    }
    return planos(
      db
        .prepare(
          `SELECT c.id, c.nome, c.cpf, c.telefone, COUNT(*) AS parcelas, SUM(p.valor) AS total,
             MIN(p.criado_em) AS desde, MAX(p.pago_em) AS quitado_em,
             COUNT(DISTINCT COALESCE(p.venda_id, -p.id)) AS compras
           FROM crediario_parcelas p JOIN clientes c ON c.id = p.cliente_id
           WHERE p.status <> 'cancelada' ${filtro}
           GROUP BY c.id HAVING SUM(p.status = 'aberta') = 0
           ORDER BY quitado_em DESC LIMIT 300`
        )
        .all(...args)
    );
  });

  rota('GET', '/api/crediario', ({ query }) => {
    const q = texto(query.get('q'));
    const soAtraso = query.get('atraso') === '1';
    const h = hoje();
    const args = [h, h, h];
    let filtro = '';
    if (q) {
      const dig = q.replace(/\D/g, '');
      filtro = `AND (c.nome LIKE ? OR (? <> '' AND (c.cpf LIKE ? OR c.telefone LIKE ?)))`;
      args.push(`%${q}%`, dig, `%${dig}%`, `%${dig}%`);
    }
    const lista = planos(
      db
        .prepare(
          `SELECT c.id, c.nome, c.cpf, c.telefone, c.limite_credito,
             SUM(p.valor - p.valor_pago) AS saldo,
             COALESCE(SUM(CASE WHEN p.vencimento < ? THEN p.valor - p.valor_pago END),0) AS vencido,
             MIN(p.vencimento) AS proximo_vencimento,
             CAST(julianday(?) - julianday(MIN(CASE WHEN p.vencimento < ? THEN p.vencimento END)) AS INTEGER) AS dias_atraso,
             COUNT(*) AS parcelas
           FROM crediario_parcelas p JOIN clientes c ON c.id = p.cliente_id
           WHERE p.status = 'aberta' ${filtro}
           GROUP BY c.id ORDER BY vencido DESC, proximo_vencimento`
        )
        .all(...args)
    );
    return soAtraso ? lista.filter((c) => c.vencido > 0) : lista;
  });

  rota('GET', '/api/crediario/clientes/:id', ({ params }) => {
    const cliente = plano(db.prepare('SELECT * FROM clientes WHERE id = ?').get(params.id));
    if (!cliente) throw erro(404, 'Cliente não encontrado.');
    return {
      cliente,
      saldo: saldo(cliente.id),
      limite: limiteDe(cliente),
      parcelas: planos(
        db
          .prepare(
            `SELECT * FROM crediario_parcelas WHERE cliente_id = ? AND status <> 'cancelada'
             ORDER BY status = 'paga', vencimento, id LIMIT 300`
          )
          .all(cliente.id)
      ),
      recebimentos: planos(
        db
          .prepare('SELECT * FROM crediario_recebimentos WHERE cliente_id = ? ORDER BY id DESC LIMIT 100')
          .all(cliente.id)
      ),
      cobrancas: planos(db.prepare('SELECT * FROM crediario_cobrancas WHERE cliente_id = ? ORDER BY id DESC LIMIT 10').all(cliente.id)),
    };
  });

  rota('POST', '/api/crediario/clientes/:id/receber', ({ params, corpo, usuario }) => {
    const caixa = caixaAberto();
    if (!caixa) throw erro(409, 'Abra o caixa para receber.');
    const valor = inteiro(corpo.valor, 'valor', { min: 1 });
    const forma = corpo.forma || 'dinheiro';
    if (!['dinheiro', 'pix', 'debito', 'credito', 'outro'].includes(forma)) {
      throw erro(400, 'Forma de pagamento inválida.');
    }
    const bandeira = forma === 'debito' || forma === 'credito' ? taxas.bandeiraValida(corpo.bandeira) : null;
    return transacao(db, () => {
      const abertas = planos(
        db
          .prepare(
            `SELECT * FROM crediario_parcelas WHERE cliente_id = ? AND status = 'aberta'
             ORDER BY vencimento, id`
          )
          .all(params.id)
      );
      const devido = abertas.reduce((a, p) => a + p.valor - p.valor_pago, 0);
      if (!devido) throw erro(409, 'Este cliente não tem débito no crediário.');
      if (valor > devido) {
        throw erro(400, `Valor maior que o saldo devedor (R$ ${(devido / 100).toFixed(2).replace('.', ',')}).`);
      }
      const r = db
        .prepare(
          `INSERT INTO crediario_recebimentos (cliente_id, caixa_id, usuario_id, operador, valor, forma, observacao, taxa, bandeira)
           VALUES (?,?,?,?,?,?,?,?,?)`
        )
        .run(params.id, caixa.id, usuario.id, usuario.nome, valor, forma, texto(corpo.observacao, 500),
          taxas.calcular(config(), forma, 1, valor, bandeira), bandeira);
      const recId = Number(r.lastInsertRowid);
      let resta = valor;
      for (const p of abertas) {
        if (!resta) break;
        const abate = Math.min(resta, p.valor - p.valor_pago);
        resta -= abate;
        const quitada = p.valor_pago + abate === p.valor;
        db.prepare(
          `UPDATE crediario_parcelas SET valor_pago = valor_pago + ?,
             status = CASE WHEN ? THEN 'paga' ELSE status END,
             pago_em = CASE WHEN ? THEN datetime('now','localtime') ELSE pago_em END
           WHERE id = ?`
        ).run(abate, quitada ? 1 : 0, quitada ? 1 : 0, p.id);
        db.prepare(
          'INSERT INTO crediario_recebimento_parcelas (recebimento_id, parcela_id, valor) VALUES (?,?,?)'
        ).run(recId, p.id, abate);
      }
      return buscarRecebimento(recId);
    });
  });

  rota('GET', '/api/crediario/recebimentos/:id', ({ params }) => buscarRecebimento(params.id));

  rota('POST', '/api/crediario/recebimentos/:id/estornar', ({ params }) => {
    const rec = buscarRecebimento(params.id);
    if (rec.status === 'estornado') throw erro(409, 'Recebimento já estornado.');
    // Recebimento de um caixa já fechado: o fechamento dele não muda; o dinheiro devolvido sai do caixa aberto.
    const aberto = caixaAberto();
    const outroCaixa = !aberto || aberto.id !== rec.caixa_id;
    if (outroCaixa && rec.forma === 'dinheiro' && !aberto) throw erro(409, 'Abra o caixa para devolver o dinheiro.');
    return transacao(db, () => {
      if (outroCaixa && rec.forma === 'dinheiro') {
        db.prepare(`INSERT INTO caixa_movimentos (caixa_id, tipo, valor, motivo) VALUES (?, 'sangria', ?, ?)`)
          .run(aberto.id, rec.valor, `Estorno do recebimento nº ${rec.id} do crediário`);
      }
      for (const p of rec.parcelas) {
        db.prepare(
          `UPDATE crediario_parcelas SET valor_pago = valor_pago - ?, status = 'aberta', pago_em = NULL
           WHERE id = ?`
        ).run(p.valor_recebido, p.id);
      }
      db.prepare(
        `UPDATE crediario_recebimentos SET status = 'estornado', estornado_em = datetime('now','localtime'),
           estornado_caixa_id = ? WHERE id = ?`
      ).run(aberto ? aberto.id : null, rec.id);
      return buscarRecebimento(rec.id);
    });
  }, 'admin');

  /** Lança um débito avulso (ex.: dívidas do caderno antigo). */
  rota('POST', '/api/crediario/clientes/:id/debito', ({ params, corpo }) => {
    const valor = inteiro(corpo.valor, 'valor', { min: 1 });
    const parcelas = inteiro(corpo.parcelas, 'parcelas', { min: 1, padrao: 1 });
    const descricao = texto(corpo.descricao, 200) || 'Débito lançado manualmente';
    const primeiro = texto(corpo.primeiro_vencimento, 10);
    transacao(db, () =>
      lancarParcelas({ clienteId: Number(params.id), valor, parcelas, primeiroVencimento: primeiro, descricao, validarLimite: false }));
    return saldo(params.id);
  }, 'admin');

  /** Cancela uma parcela lançada por engano (só se nada foi pago nela). */
  rota('POST', '/api/crediario/parcelas/:id/cancelar', ({ params }) => {
    const p = plano(db.prepare('SELECT * FROM crediario_parcelas WHERE id = ?').get(params.id));
    if (!p) throw erro(404, 'Parcela não encontrada.');
    if (p.venda_id) throw erro(409, 'Parcela de venda: cancele a venda inteira na tela de Vendas.');
    if (p.valor_pago > 0) throw erro(409, 'Parcela já tem pagamento. Estorne o recebimento antes.');
    db.prepare(`UPDATE crediario_parcelas SET status = 'cancelada' WHERE id = ?`).run(p.id);
    return { ok: true };
  }, 'admin');

  return { lancarParcelas, parcelasDaVenda, cancelarDaVenda, recebimentosDoCaixa, buscarRecebimento, saldo, resumoGeral, limiteDe };
}

module.exports = { instalarCrediario, somarMeses, dividir };
