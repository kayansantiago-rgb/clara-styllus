'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { transacao } = require('./db');
const { gerarEan13Interno } = require('./codigos');

const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito', 'outro'];

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

const erro = (status, msg) => new ErroHttp(status, msg);

function inteiro(v, campo, { min = -Infinity, padrao } = {}) {
  if ((v === undefined || v === null || v === '') && padrao !== undefined) return padrao;
  const n = Number(v);
  if (!Number.isInteger(n)) throw erro(400, `Campo "${campo}" deve ser um número inteiro.`);
  if (n < min) throw erro(400, `Campo "${campo}" deve ser maior ou igual a ${min}.`);
  return n;
}

function texto(v, max = 200) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s.slice(0, max);
}

function soDigitos(v) {
  const s = texto(v);
  return s ? s.replace(/\D/g, '') || null : null;
}

/** Converte linhas do node:sqlite (objetos sem protótipo) em objetos comuns. */
const plano = (r) => (r ? { ...r } : r);
const planos = (rs) => rs.map(plano);

function criarApi(db) {
  const rotas = [];
  const rota = (metodo, padrao, fn) => {
    const nomes = [];
    const re = new RegExp(
      '^' + padrao.replace(/:(\w+)/g, (_, n) => (nomes.push(n), '([^/]+)')) + '$'
    );
    rotas.push({ metodo, re, nomes, fn });
  };

  const config = () => {
    const c = {};
    for (const r of db.prepare('SELECT chave, valor FROM config').all()) c[r.chave] = r.valor;
    return c;
  };

  const caixaAberto = () =>
    plano(db.prepare('SELECT * FROM caixas WHERE fechado_em IS NULL ORDER BY id DESC LIMIT 1').get());

  // ---------------------------------------------------------------- config
  rota('GET', '/api/config', () => config());

  rota('PUT', '/api/config', ({ corpo }) => {
    const atual = config();
    const up = db.prepare('UPDATE config SET valor = ? WHERE chave = ?');
    transacao(db, () => {
      for (const [k, v] of Object.entries(corpo || {})) {
        if (k in atual) up.run(v === null || v === undefined ? '' : String(v), k);
      }
    });
    return config();
  });

  // -------------------------------------------------------------- produtos
  const lerProduto = (corpo, parcial = false) => {
    const p = {};
    const campos = ['codigo', 'referencia', 'nome', 'categoria', 'marca', 'tamanho', 'cor', 'ncm'];
    for (const c of campos) if (!parcial || c in corpo) p[c] = texto(corpo[c]);
    if (p.ncm) p.ncm = soDigitos(p.ncm);
    for (const c of ['preco_custo', 'preco_venda', 'estoque_minimo']) {
      if (!parcial || c in corpo) p[c] = inteiro(corpo[c], c, { min: 0, padrao: 0 });
    }
    if ('ativo' in corpo) p.ativo = corpo.ativo ? 1 : 0;
    if (!parcial && !p.nome) throw erro(400, 'Informe o nome do produto.');
    if (parcial && 'nome' in p && !p.nome) throw erro(400, 'Informe o nome do produto.');
    return p;
  };

  const buscarProduto = (id) => {
    const p = plano(db.prepare('SELECT * FROM produtos WHERE id = ?').get(id));
    if (!p) throw erro(404, 'Produto não encontrado.');
    return p;
  };

  rota('GET', '/api/produtos', ({ query }) => {
    const q = texto(query.get('q'));
    const incluirInativos = query.get('inativos') === '1';
    const estoqueBaixo = query.get('estoque_baixo') === '1';
    const limite = Math.min(inteiro(query.get('limite'), 'limite', { min: 1, padrao: 200 }), 1000);
    const where = [];
    const args = [];
    if (!incluirInativos) where.push('ativo = 1');
    if (estoqueBaixo) where.push('estoque <= estoque_minimo');
    if (q) {
      where.push(
        '(nome LIKE ? OR codigo = ? OR referencia LIKE ? OR categoria LIKE ? OR cor LIKE ? OR marca LIKE ?)'
      );
      const like = `%${q}%`;
      args.push(like, q, like, like, like, like);
    }
    const sql = `SELECT * FROM produtos ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY nome, tamanho LIMIT ${limite}`;
    return planos(db.prepare(sql).all(...args));
  });

  rota('GET', '/api/produtos/codigo/:codigo', ({ params }) => {
    const p = plano(
      db.prepare('SELECT * FROM produtos WHERE codigo = ? AND ativo = 1').get(params.codigo)
    );
    if (!p) throw erro(404, `Nenhum produto com o código ${params.codigo}.`);
    return p;
  });

  rota('GET', '/api/produtos/:id', ({ params }) => buscarProduto(params.id));

  rota('GET', '/api/produtos/:id/movimentos', ({ params }) => {
    buscarProduto(params.id);
    return planos(
      db
        .prepare('SELECT * FROM estoque_movimentos WHERE produto_id = ? ORDER BY id DESC LIMIT 200')
        .all(params.id)
    );
  });

  rota('POST', '/api/produtos', ({ corpo }) => {
    const p = lerProduto(corpo || {});
    const estoqueInicial = inteiro(corpo.estoque, 'estoque', { min: 0, padrao: 0 });
    return transacao(db, () => {
      if (p.codigo && db.prepare('SELECT 1 FROM produtos WHERE codigo = ?').get(p.codigo)) {
        throw erro(409, `Já existe um produto com o código ${p.codigo}.`);
      }
      const provisorio = p.codigo || `tmp-${process.hrtime.bigint()}`;
      const r = db
        .prepare(
          `INSERT INTO produtos (codigo, referencia, nome, categoria, marca, tamanho, cor,
             preco_custo, preco_venda, estoque, estoque_minimo, ncm)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(provisorio, p.referencia, p.nome, p.categoria, p.marca, p.tamanho, p.cor,
          p.preco_custo, p.preco_venda, estoqueInicial, p.estoque_minimo, p.ncm);
      const id = Number(r.lastInsertRowid);
      if (!p.codigo) {
        db.prepare('UPDATE produtos SET codigo = ? WHERE id = ?').run(gerarEan13Interno(id), id);
      }
      if (estoqueInicial) {
        db.prepare(
          `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo)
           VALUES (?, 'entrada', ?, 'Estoque inicial')`
        ).run(id, estoqueInicial);
      }
      return buscarProduto(id);
    });
  });

  rota('PUT', '/api/produtos/:id', ({ params, corpo }) => {
    buscarProduto(params.id);
    const p = lerProduto(corpo || {}, true);
    if ('codigo' in p) {
      if (!p.codigo) throw erro(400, 'O código de barras não pode ficar vazio.');
      const dono = db.prepare('SELECT id FROM produtos WHERE codigo = ?').get(p.codigo);
      if (dono && Number(dono.id) !== Number(params.id)) {
        throw erro(409, `Já existe um produto com o código ${p.codigo}.`);
      }
    }
    const chaves = Object.keys(p);
    if (chaves.length) {
      db.prepare(
        `UPDATE produtos SET ${chaves.map((c) => `${c} = ?`).join(', ')},
           atualizado_em = datetime('now','localtime') WHERE id = ?`
      ).run(...chaves.map((c) => p[c]), params.id);
    }
    return buscarProduto(params.id);
  });

  rota('DELETE', '/api/produtos/:id', ({ params }) => {
    buscarProduto(params.id);
    db.prepare('UPDATE produtos SET ativo = 0 WHERE id = ?').run(params.id);
    return { ok: true };
  });

  rota('POST', '/api/produtos/:id/estoque', ({ params, corpo }) => {
    const produto = buscarProduto(params.id);
    const tipo = corpo.tipo;
    if (!['entrada', 'saida', 'ajuste'].includes(tipo)) {
      throw erro(400, 'Tipo de movimento inválido (use entrada, saida ou ajuste).');
    }
    const qtd = inteiro(corpo.quantidade, 'quantidade', { min: tipo === 'ajuste' ? 0 : 1 });
    const motivo = texto(corpo.motivo) || null;
    return transacao(db, () => {
      let delta;
      if (tipo === 'entrada') delta = qtd;
      else if (tipo === 'saida') delta = -qtd;
      else delta = qtd - produto.estoque; // ajuste: qtd é a contagem real
      db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(delta, params.id);
      db.prepare(
        'INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo) VALUES (?,?,?,?)'
      ).run(params.id, tipo, delta, motivo);
      return buscarProduto(params.id);
    });
  });

  // -------------------------------------------------------------- clientes
  const lerCliente = (c) => {
    const nome = texto(c.nome);
    if (!nome) throw erro(400, 'Informe o nome do cliente.');
    return {
      nome,
      cpf: soDigitos(c.cpf),
      telefone: texto(c.telefone, 30),
      email: texto(c.email),
      aniversario: texto(c.aniversario, 10),
      observacao: texto(c.observacao, 1000),
    };
  };

  rota('GET', '/api/clientes', ({ query }) => {
    const q = texto(query.get('q'));
    if (!q) return planos(db.prepare('SELECT * FROM clientes ORDER BY nome LIMIT 300').all());
    const dig = q.replace(/\D/g, '');
    return planos(
      db
        .prepare(
          `SELECT * FROM clientes WHERE nome LIKE ? OR (? <> '' AND (cpf LIKE ? OR telefone LIKE ?))
           ORDER BY nome LIMIT 100`
        )
        .all(`%${q}%`, dig, `%${dig}%`, `%${dig}%`)
    );
  });

  rota('GET', '/api/clientes/:id', ({ params }) => {
    const c = plano(db.prepare('SELECT * FROM clientes WHERE id = ?').get(params.id));
    if (!c) throw erro(404, 'Cliente não encontrado.');
    c.compras = planos(
      db
        .prepare(
          `SELECT id, total, status, criado_em FROM vendas WHERE cliente_id = ?
           ORDER BY id DESC LIMIT 50`
        )
        .all(params.id)
    );
    return c;
  });

  rota('POST', '/api/clientes', ({ corpo }) => {
    const c = lerCliente(corpo || {});
    const r = db
      .prepare(
        `INSERT INTO clientes (nome, cpf, telefone, email, aniversario, observacao)
         VALUES (?,?,?,?,?,?)`
      )
      .run(c.nome, c.cpf, c.telefone, c.email, c.aniversario, c.observacao);
    return plano(db.prepare('SELECT * FROM clientes WHERE id = ?').get(r.lastInsertRowid));
  });

  rota('PUT', '/api/clientes/:id', ({ params, corpo }) => {
    const c = lerCliente(corpo || {});
    const r = db
      .prepare(
        `UPDATE clientes SET nome=?, cpf=?, telefone=?, email=?, aniversario=?, observacao=?
         WHERE id = ?`
      )
      .run(c.nome, c.cpf, c.telefone, c.email, c.aniversario, c.observacao, params.id);
    if (!r.changes) throw erro(404, 'Cliente não encontrado.');
    return plano(db.prepare('SELECT * FROM clientes WHERE id = ?').get(params.id));
  });

  // ----------------------------------------------------------------- caixa
  const resumoCaixa = (caixaId) => {
    const caixa = plano(db.prepare('SELECT * FROM caixas WHERE id = ?').get(caixaId));
    if (!caixa) throw erro(404, 'Caixa não encontrado.');
    const formas = planos(
      db
        .prepare(
          `SELECT p.forma, SUM(p.valor) AS valor, COUNT(DISTINCT v.id) AS vendas
           FROM venda_pagamentos p JOIN vendas v ON v.id = p.venda_id
           WHERE v.caixa_id = ? AND v.status = 'concluida' GROUP BY p.forma`
        )
        .all(caixaId)
    );
    const vendas = plano(
      db
        .prepare(
          `SELECT COUNT(*) AS quantidade, COALESCE(SUM(total),0) AS total,
             COALESCE(SUM(troco),0) AS troco, COALESCE(SUM(desconto),0) AS desconto
           FROM vendas WHERE caixa_id = ? AND status = 'concluida'`
        )
        .get(caixaId)
    );
    const canceladas = db
      .prepare(`SELECT COUNT(*) AS n FROM vendas WHERE caixa_id = ? AND status = 'cancelada'`)
      .get(caixaId).n;
    const movimentos = planos(
      db.prepare('SELECT * FROM caixa_movimentos WHERE caixa_id = ? ORDER BY id').all(caixaId)
    );
    const soma = (t) => movimentos.filter((m) => m.tipo === t).reduce((a, m) => a + m.valor, 0);
    const dinheiro = formas.find((f) => f.forma === 'dinheiro')?.valor || 0;
    const sangrias = soma('sangria');
    const suprimentos = soma('suprimento');
    const dinheiroEsperado =
      caixa.valor_abertura + suprimentos - sangrias + dinheiro - vendas.troco;
    return {
      caixa,
      vendas: { ...vendas, canceladas },
      formas,
      movimentos,
      sangrias,
      suprimentos,
      dinheiro_esperado: dinheiroEsperado,
      diferenca: caixa.valor_informado == null ? null : caixa.valor_informado - dinheiroEsperado,
    };
  };

  rota('GET', '/api/caixa/atual', () => {
    const c = caixaAberto();
    return c ? resumoCaixa(c.id) : { caixa: null };
  });

  rota('GET', '/api/caixas', () =>
    planos(db.prepare('SELECT * FROM caixas ORDER BY id DESC LIMIT 100').all())
  );

  rota('GET', '/api/caixas/:id', ({ params }) => resumoCaixa(params.id));

  rota('POST', '/api/caixa/abrir', ({ corpo }) => {
    if (caixaAberto()) throw erro(409, 'Já existe um caixa aberto.');
    const valor = inteiro(corpo.valor_abertura, 'valor_abertura', { min: 0, padrao: 0 });
    const r = db
      .prepare('INSERT INTO caixas (operador, valor_abertura) VALUES (?, ?)')
      .run(texto(corpo.operador), valor);
    return resumoCaixa(r.lastInsertRowid);
  });

  rota('POST', '/api/caixa/movimento', ({ corpo }) => {
    const c = caixaAberto();
    if (!c) throw erro(409, 'Nenhum caixa aberto.');
    if (!['sangria', 'suprimento'].includes(corpo.tipo)) throw erro(400, 'Tipo inválido.');
    const valor = inteiro(corpo.valor, 'valor', { min: 1 });
    db.prepare('INSERT INTO caixa_movimentos (caixa_id, tipo, valor, motivo) VALUES (?,?,?,?)').run(
      c.id, corpo.tipo, valor, texto(corpo.motivo)
    );
    return resumoCaixa(c.id);
  });

  rota('POST', '/api/caixa/fechar', ({ corpo }) => {
    const c = caixaAberto();
    if (!c) throw erro(409, 'Nenhum caixa aberto.');
    const informado = inteiro(corpo.valor_informado, 'valor_informado', { min: 0 });
    db.prepare(
      `UPDATE caixas SET fechado_em = datetime('now','localtime'), valor_informado = ?,
         observacao = ? WHERE id = ?`
    ).run(informado, texto(corpo.observacao, 1000), c.id);
    return resumoCaixa(c.id);
  });

  // ---------------------------------------------------------------- vendas
  const buscarVenda = (id) => {
    const v = plano(
      db
        .prepare(
          `SELECT v.*, c.nome AS cliente_nome, c.cpf AS cliente_cpf
           FROM vendas v LEFT JOIN clientes c ON c.id = v.cliente_id WHERE v.id = ?`
        )
        .get(id)
    );
    if (!v) throw erro(404, 'Venda não encontrada.');
    v.itens = planos(db.prepare('SELECT * FROM venda_itens WHERE venda_id = ? ORDER BY id').all(id));
    v.pagamentos = planos(
      db.prepare('SELECT * FROM venda_pagamentos WHERE venda_id = ? ORDER BY id').all(id)
    );
    return v;
  };

  rota('POST', '/api/vendas', ({ corpo }) => {
    corpo = corpo || {};
    const cfg = config();
    const caixa = caixaAberto();
    if (!caixa) throw erro(409, 'Abra o caixa antes de vender.');
    if (!Array.isArray(corpo.itens) || corpo.itens.length === 0) {
      throw erro(400, 'A venda não tem itens.');
    }
    if (!Array.isArray(corpo.pagamentos) || corpo.pagamentos.length === 0) {
      throw erro(400, 'Informe a forma de pagamento.');
    }

    return transacao(db, () => {
      const itens = corpo.itens.map((it, i) => {
        const prod = plano(
          db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(it.produto_id)
        );
        if (!prod) throw erro(400, `Item ${i + 1}: produto não encontrado ou inativo.`);
        const quantidade = inteiro(it.quantidade, 'quantidade', { min: 1 });
        const bruto = prod.preco_venda * quantidade;
        const desconto = inteiro(it.desconto, 'desconto', { min: 0, padrao: 0 });
        if (desconto > bruto) throw erro(400, `Desconto maior que o valor de "${prod.nome}".`);
        return { prod, quantidade, desconto, total: bruto - desconto };
      });

      // Confere estoque somando quantidades do mesmo produto em linhas diferentes.
      if (cfg.estoque_negativo !== '1') {
        const porProduto = new Map();
        for (const it of itens) {
          porProduto.set(it.prod.id, (porProduto.get(it.prod.id) || 0) + it.quantidade);
        }
        for (const [id, qtd] of porProduto) {
          const p = itens.find((it) => it.prod.id === id).prod;
          if (p.estoque < qtd) {
            throw erro(409, `Estoque insuficiente de "${p.nome}" (disponível: ${p.estoque}).`);
          }
        }
      }

      const bruto = itens.reduce((a, it) => a + it.prod.preco_venda * it.quantidade, 0);
      const subtotal = itens.reduce((a, it) => a + it.total, 0);
      const descontoGeral = inteiro(corpo.desconto, 'desconto', { min: 0, padrao: 0 });
      if (descontoGeral > subtotal) throw erro(400, 'Desconto maior que o subtotal.');
      const total = subtotal - descontoGeral;
      const descontoTotal = bruto - total;
      const maxPct = Number(cfg.desconto_maximo_pct || 100);
      if (bruto > 0 && (descontoTotal * 100) / bruto > maxPct + 1e-9) {
        throw erro(403, `Desconto acima do máximo permitido (${maxPct}%).`);
      }

      const pagamentos = corpo.pagamentos.map((p) => {
        if (!FORMAS_PAGAMENTO.includes(p.forma)) {
          throw erro(400, `Forma de pagamento inválida: ${p.forma}`);
        }
        return {
          forma: p.forma,
          valor: inteiro(p.valor, 'valor do pagamento', { min: 1 }),
          parcelas: p.forma === 'credito' ? inteiro(p.parcelas, 'parcelas', { min: 1, padrao: 1 }) : 1,
        };
      });
      const pago = pagamentos.reduce((a, p) => a + p.valor, 0);
      if (pago < total) throw erro(400, 'Valor pago é menor que o total da venda.');
      const troco = pago - total;
      const emDinheiro = pagamentos
        .filter((p) => p.forma === 'dinheiro')
        .reduce((a, p) => a + p.valor, 0);
      if (troco > emDinheiro) throw erro(400, 'Troco só pode ser dado sobre pagamento em dinheiro.');

      let clienteId = null;
      if (corpo.cliente_id) {
        clienteId = inteiro(corpo.cliente_id, 'cliente_id', { min: 1 });
        if (!db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(clienteId)) {
          throw erro(400, 'Cliente não encontrado.');
        }
      }

      const r = db
        .prepare(
          `INSERT INTO vendas (caixa_id, cliente_id, cpf_nota, vendedor, subtotal, desconto, total, troco)
           VALUES (?,?,?,?,?,?,?,?)`
        )
        .run(caixa.id, clienteId, soDigitos(corpo.cpf_nota), texto(corpo.vendedor),
          bruto, descontoTotal, total, troco);
      const vendaId = Number(r.lastInsertRowid);

      const insItem = db.prepare(
        `INSERT INTO venda_itens (venda_id, produto_id, codigo, nome, tamanho, cor, quantidade,
           preco_unitario, desconto, total) VALUES (?,?,?,?,?,?,?,?,?,?)`
      );
      const baixa = db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?');
      const mov = db.prepare(
        `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo, venda_id)
         VALUES (?, 'venda', ?, ?, ?)`
      );
      for (const it of itens) {
        const p = it.prod;
        insItem.run(vendaId, p.id, p.codigo, p.nome, p.tamanho, p.cor, it.quantidade,
          p.preco_venda, it.desconto, it.total);
        baixa.run(it.quantidade, p.id);
        mov.run(p.id, -it.quantidade, `Venda #${vendaId}`, vendaId);
      }
      const insPag = db.prepare(
        'INSERT INTO venda_pagamentos (venda_id, forma, valor, parcelas) VALUES (?,?,?,?)'
      );
      for (const p of pagamentos) insPag.run(vendaId, p.forma, p.valor, p.parcelas);

      return buscarVenda(vendaId);
    });
  });

  rota('GET', '/api/vendas', ({ query }) => {
    const de = texto(query.get('de'), 10);
    const ate = texto(query.get('ate'), 10);
    const where = [];
    const args = [];
    const caixaId = query.get('caixa_id');
    if (de) where.push('date(v.criado_em) >= ?'), args.push(de);
    if (ate) where.push('date(v.criado_em) <= ?'), args.push(ate);
    if (caixaId) where.push('v.caixa_id = ?'), args.push(caixaId);
    return planos(
      db
        .prepare(
          `SELECT v.*, c.nome AS cliente_nome,
             (SELECT SUM(quantidade) FROM venda_itens i WHERE i.venda_id = v.id) AS pecas,
             (SELECT GROUP_CONCAT(DISTINCT forma) FROM venda_pagamentos p WHERE p.venda_id = v.id) AS formas
           FROM vendas v LEFT JOIN clientes c ON c.id = v.cliente_id
           ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
           ORDER BY v.id DESC LIMIT 500`
        )
        .all(...args)
    );
  });

  rota('GET', '/api/vendas/:id', ({ params }) => buscarVenda(params.id));

  rota('POST', '/api/vendas/:id/cancelar', ({ params, corpo }) => {
    const venda = buscarVenda(params.id);
    if (venda.status === 'cancelada') throw erro(409, 'Venda já está cancelada.');
    const motivo = texto(corpo.motivo, 500);
    if (!motivo) throw erro(400, 'Informe o motivo do cancelamento.');
    return transacao(db, () => {
      db.prepare(
        `UPDATE vendas SET status = 'cancelada', motivo_cancelamento = ?,
           cancelada_em = datetime('now','localtime') WHERE id = ?`
      ).run(motivo, venda.id);
      for (const it of venda.itens) {
        db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(
          it.quantidade, it.produto_id
        );
        db.prepare(
          `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo, venda_id)
           VALUES (?, 'cancelamento', ?, ?, ?)`
        ).run(it.produto_id, it.quantidade, `Cancelamento da venda #${venda.id}`, venda.id);
      }
      return buscarVenda(venda.id);
    });
  });

  // ------------------------------------------------------------ relatórios
  rota('GET', '/api/relatorios', ({ query }) => {
    const hoje = new Date().toLocaleDateString('sv-SE');
    const de = texto(query.get('de'), 10) || hoje;
    const ate = texto(query.get('ate'), 10) || hoje;
    const filtro = `v.status = 'concluida' AND date(v.criado_em) BETWEEN ? AND ?`;
    const totais = plano(
      db
        .prepare(
          `SELECT COUNT(*) AS vendas, COALESCE(SUM(total),0) AS faturamento,
             COALESCE(SUM(desconto),0) AS descontos
           FROM vendas v WHERE ${filtro}`
        )
        .get(de, ate)
    );
    const custo = db
      .prepare(
        `SELECT COALESCE(SUM(i.quantidade * p.preco_custo),0) AS custo, COALESCE(SUM(i.quantidade),0) AS pecas
         FROM venda_itens i JOIN vendas v ON v.id = i.venda_id JOIN produtos p ON p.id = i.produto_id
         WHERE ${filtro}`
      )
      .get(de, ate);
    totais.pecas = custo.pecas;
    totais.custo = custo.custo;
    totais.lucro_bruto = totais.faturamento - custo.custo;
    totais.ticket_medio = totais.vendas ? Math.round(totais.faturamento / totais.vendas) : 0;

    // Pagamentos: desconta o troco do dinheiro para mostrar o valor que realmente entrou.
    const formas = planos(
      db
        .prepare(
          `SELECT p.forma, SUM(p.valor) - CASE WHEN p.forma = 'dinheiro'
               THEN (SELECT COALESCE(SUM(troco),0) FROM vendas v WHERE ${filtro}) ELSE 0 END AS valor
           FROM venda_pagamentos p JOIN vendas v ON v.id = p.venda_id
           WHERE ${filtro} GROUP BY p.forma ORDER BY valor DESC`
        )
        .all(de, ate, de, ate)
    );
    const porDia = planos(
      db
        .prepare(
          `SELECT date(criado_em) AS dia, COUNT(*) AS vendas, SUM(total) AS faturamento
           FROM vendas v WHERE ${filtro} GROUP BY dia ORDER BY dia`
        )
        .all(de, ate)
    );
    const topProdutos = planos(
      db
        .prepare(
          `SELECT i.nome, i.tamanho, i.cor, SUM(i.quantidade) AS quantidade, SUM(i.total) AS total
           FROM venda_itens i JOIN vendas v ON v.id = i.venda_id
           WHERE ${filtro} GROUP BY i.produto_id ORDER BY quantidade DESC, total DESC LIMIT 20`
        )
        .all(de, ate)
    );
    const porVendedor = planos(
      db
        .prepare(
          `SELECT COALESCE(vendedor, '—') AS vendedor, COUNT(*) AS vendas, SUM(total) AS total
           FROM vendas v WHERE ${filtro} GROUP BY vendedor ORDER BY total DESC`
        )
        .all(de, ate)
    );
    return { de, ate, totais, formas, por_dia: porDia, top_produtos: topProdutos, por_vendedor: porVendedor };
  });

  // ---------------------------------------------------------------- backup
  rota('GET', '/api/backup', () => {
    const tmp = path.join(os.tmpdir(), `clara-styllus-backup-${Date.now()}.db`);
    db.prepare('VACUUM INTO ?').run(tmp);
    const conteudo = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    const data = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-');
    return {
      __arquivo: true,
      nome: `backup-clara-styllus-${data}.db`,
      tipo: 'application/octet-stream',
      conteudo,
    };
  });

  /** Resolve uma requisição; devolve { status, corpo } ou null se a rota não existir. */
  return function despachar(metodo, caminho, query, corpo) {
    for (const r of rotas) {
      if (r.metodo !== metodo) continue;
      const m = caminho.match(r.re);
      if (!m) continue;
      const params = {};
      r.nomes.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
      try {
        return { status: 200, corpo: r.fn({ params, query, corpo: corpo || {} }) };
      } catch (e) {
        if (e instanceof ErroHttp) return { status: e.status, corpo: { erro: e.message } };
        throw e;
      }
    }
    return null;
  };
}

module.exports = { criarApi, FORMAS_PAGAMENTO };
