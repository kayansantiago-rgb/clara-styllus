'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { transacao } = require('./db');
const { gerarEan13Interno } = require('./codigos');
const { hashSenha, conferirSenha, novoToken } = require('./auth');
const { instalarCrediario } = require('./crediario');
const { instalarInventario } = require('./inventario');
const taxas = require('./taxas');
const documentos = require('./impressao/documentos');
const { gerarEtiquetas } = require('./impressao/etiquetas');
const impressora = require('./impressao/impressora');

const HORAS_SESSAO = 14;

const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito', 'crediario', 'outro'];

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
  /** acesso: 'publico' (sem login), 'logado' (qualquer usuário) ou 'admin'. */
  const rota = (metodo, padrao, fn, acesso = 'logado') => {
    const nomes = [];
    const re = new RegExp(
      '^' + padrao.replace(/:(\w+)/g, (_, n) => (nomes.push(n), '([^/]+)')) + '$'
    );
    rotas.push({ metodo, re, nomes, fn, acesso });
  };

  const config = () => {
    const c = {};
    for (const r of db.prepare('SELECT chave, valor FROM config').all()) c[r.chave] = r.valor;
    return c;
  };

  const caixaAberto = () =>
    plano(db.prepare('SELECT * FROM caixas WHERE fechado_em IS NULL ORDER BY id DESC LIMIT 1').get());

  // ---------------------------------------------------------- usuários
  const publico = (u) => u && { id: u.id, nome: u.nome, login: u.login, perfil: u.perfil, ativo: u.ativo };
  const temUsuarios = () => !!db.prepare('SELECT 1 FROM usuarios LIMIT 1').get();

  const usuarioDoToken = (token) => {
    if (!token) return null;
    return plano(
      db
        .prepare(
          `SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
           WHERE s.token = ? AND u.ativo = 1 AND s.expira_em > datetime('now','localtime')`
        )
        .get(token)
    );
  };

  const abrirSessao = (ctx, usuario) => {
    const token = novoToken();
    db.prepare(
      `INSERT INTO sessoes (token, usuario_id, expira_em)
       VALUES (?, ?, datetime('now','localtime','+${HORAS_SESSAO} hours'))`
    ).run(token, usuario.id);
    ctx.definirSessao(token);
    return { usuario: publico(usuario) };
  };

  const lerUsuario = (c, novo) => {
    const u = {};
    if (novo || 'nome' in c) {
      u.nome = texto(c.nome, 60);
      if (!u.nome) throw erro(400, 'Informe o nome.');
    }
    if (novo) {
      u.login = texto(c.login, 40);
      if (!u.login || !/^[\w.@-]+$/.test(u.login)) {
        throw erro(400, 'Usuário inválido: use letras, números, ponto ou traço, sem espaços.');
      }
      u.login = u.login.toLowerCase();
    }
    if (novo || 'perfil' in c) {
      u.perfil = c.perfil === 'admin' ? 'admin' : 'vendedor';
    }
    if ('ativo' in c) u.ativo = c.ativo ? 1 : 0;
    if (novo || (c.senha !== undefined && c.senha !== '')) {
      const senha = String(c.senha ?? '');
      if (senha.length < 4) throw erro(400, 'A senha precisa ter pelo menos 4 caracteres.');
      u.senha_hash = hashSenha(senha);
    }
    return u;
  };

  const adminsAtivos = (excetoId) =>
    db.prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE perfil = 'admin' AND ativo = 1 AND id <> ?`)
      .get(excetoId ?? 0).n;

  rota('GET', '/api/sessao', ({ usuario }) => ({
    usuario: publico(usuario),
    primeiro_acesso: !temUsuarios(),
    loja_nome: config().loja_nome,
  }), 'publico');

  rota('POST', '/api/primeiro-acesso', (ctx) => {
    if (temUsuarios()) throw erro(409, 'O sistema já tem usuários cadastrados.');
    const u = lerUsuario({ ...ctx.corpo, perfil: 'admin' }, true);
    const r = db
      .prepare('INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?,?,?,?)')
      .run(u.nome, u.login, u.senha_hash, 'admin');
    return abrirSessao(ctx, { ...u, id: Number(r.lastInsertRowid), ativo: 1 });
  }, 'publico');

  rota('POST', '/api/login', (ctx) => {
    const login = texto(ctx.corpo.login, 40);
    const u = login && plano(db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login));
    if (!u || !u.ativo || !conferirSenha(ctx.corpo.senha ?? '', u.senha_hash)) {
      throw erro(401, 'Usuário ou senha incorretos.');
    }
    return abrirSessao(ctx, u);
  }, 'publico');

  rota('POST', '/api/logout', (ctx) => {
    if (ctx.token) db.prepare('DELETE FROM sessoes WHERE token = ?').run(ctx.token);
    ctx.definirSessao(null);
    return { ok: true };
  }, 'publico');

  rota('POST', '/api/minha-senha', ({ usuario, corpo }) => {
    if (!conferirSenha(corpo.senha_atual ?? '', usuario.senha_hash)) {
      throw erro(400, 'Senha atual incorreta.');
    }
    const { senha_hash: hash } = lerUsuario({ senha: corpo.nova_senha }, false);
    if (!hash) throw erro(400, 'Informe a nova senha.');
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, usuario.id);
    return { ok: true };
  });

  rota('GET', '/api/usuarios', () =>
    planos(db.prepare('SELECT * FROM usuarios ORDER BY ativo DESC, nome').all()).map(publico), 'admin');

  rota('POST', '/api/usuarios', ({ corpo }) => {
    const u = lerUsuario(corpo, true);
    if (db.prepare('SELECT 1 FROM usuarios WHERE login = ?').get(u.login)) {
      throw erro(409, `Já existe o usuário "${u.login}".`);
    }
    const r = db
      .prepare('INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?,?,?,?)')
      .run(u.nome, u.login, u.senha_hash, u.perfil);
    return publico(plano(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(r.lastInsertRowid)));
  }, 'admin');

  rota('PUT', '/api/usuarios/:id', ({ params, corpo }) => {
    const atual = plano(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(params.id));
    if (!atual) throw erro(404, 'Usuário não encontrado.');
    const u = lerUsuario(corpo, false);
    const deixaDeSerAdmin = atual.perfil === 'admin' && atual.ativo &&
      ((u.perfil && u.perfil !== 'admin') || u.ativo === 0);
    if (deixaDeSerAdmin && adminsAtivos(atual.id) === 0) {
      throw erro(409, 'É preciso ter pelo menos um administrador ativo.');
    }
    const chaves = Object.keys(u);
    if (chaves.length) {
      db.prepare(`UPDATE usuarios SET ${chaves.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...chaves.map((c) => u[c]), atual.id);
    }
    // Desativado ou senha trocada: derruba as sessões abertas desse usuário.
    if (u.ativo === 0 || u.senha_hash) {
      db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(atual.id);
    }
    return publico(plano(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(atual.id)));
  }, 'admin');

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
  }, 'admin');

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

  /** Ordem natural dos tamanhos de roupa (PP, P, M, G… e numeração). */
  const ORDEM_TAM = ['RN', 'BB', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EXG', 'G1', 'G2', 'G3', 'G4', 'U', 'UN', 'UNICO', 'ÚNICO'];
  const pesoTamanho = (t) => {
    const s = String(t || '').trim().toUpperCase();
    const i = ORDEM_TAM.indexOf(s);
    if (i >= 0) return i;
    const n = parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) ? 100 + n : 1000;
  };

  rota('GET', '/api/produtos/grade', ({ query }) => {
    const nome = texto(query.get('nome'));
    if (!nome) throw erro(400, 'Informe o nome do produto.');
    const ref = texto(query.get('referencia'));
    const itens = planos(
      db
        .prepare(
          `SELECT * FROM produtos WHERE ativo = 1 AND nome = ? COLLATE NOCASE
           AND (? IS NULL OR referencia = ?)`
        )
        .all(nome, ref, ref)
    );
    const tamanhos = [...new Set(itens.map((p) => p.tamanho || '—'))].sort((a, b) => pesoTamanho(a) - pesoTamanho(b) || a.localeCompare(b));
    const cores = [...new Set(itens.map((p) => p.cor || '—'))].sort((a, b) => a.localeCompare(b));
    const celulas = {};
    for (const p of itens) {
      const k = `${p.cor || '—'}|${p.tamanho || '—'}`;
      const c = celulas[k] || (celulas[k] = { estoque: 0, minimo: 0, ids: [] });
      c.estoque += p.estoque;
      c.minimo += p.estoque_minimo;
      c.ids.push(p.id);
    }
    return { nome: itens[0]?.nome || nome, referencia: ref, tamanhos, cores, celulas, total: itens.reduce((a, p) => a + p.estoque, 0) };
  });

  rota('GET', '/api/produtos/:id/foto', ({ params }) => {
    const f = db.prepare('SELECT tipo, dados FROM produto_fotos WHERE produto_id = ?').get(params.id);
    if (!f) throw erro(404, 'Produto sem foto.');
    return { __arquivo: true, inline: true, tipo: f.tipo, conteudo: Buffer.from(f.dados) };
  });

  rota('PUT', '/api/produtos/:id/foto', ({ params, corpo }) => {
    buscarProduto(params.id);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(corpo.imagem || '');
    if (!m) throw erro(400, 'Imagem inválida (use JPG, PNG ou WEBP).');
    const dados = Buffer.from(m[2], 'base64');
    if (dados.length > 1.5e6) throw erro(400, 'Imagem muito grande.');
    transacao(db, () => {
      db.prepare('INSERT OR REPLACE INTO produto_fotos (produto_id, tipo, dados) VALUES (?,?,?)').run(params.id, m[1], dados);
      db.prepare('UPDATE produtos SET foto_versao = ? WHERE id = ?').run(Date.now(), params.id);
    });
    return buscarProduto(params.id);
  }, 'admin');

  rota('DELETE', '/api/produtos/:id/foto', ({ params }) => {
    db.prepare('DELETE FROM produto_fotos WHERE produto_id = ?').run(params.id);
    db.prepare('UPDATE produtos SET foto_versao = NULL WHERE id = ?').run(params.id);
    return buscarProduto(params.id);
  }, 'admin');

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
  }, 'admin');

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
  }, 'admin');

  rota('DELETE', '/api/produtos/:id', ({ params }) => {
    buscarProduto(params.id);
    db.prepare('UPDATE produtos SET ativo = 0 WHERE id = ?').run(params.id);
    return { ok: true };
  }, 'admin');

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
  }, 'admin');

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
      limite_credito: c.limite_credito === '' || c.limite_credito == null
        ? null : inteiro(c.limite_credito, 'limite_credito', { min: 0 }),
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
    c.crediario = crediario.saldo(c.id);
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

  rota('POST', '/api/clientes', ({ corpo, usuario }) => {
    const c = lerCliente(corpo || {});
    if (usuario.perfil !== 'admin') c.limite_credito = null; // limite só o administrador define
    const r = db
      .prepare(
        `INSERT INTO clientes (nome, cpf, telefone, email, aniversario, observacao, limite_credito)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(c.nome, c.cpf, c.telefone, c.email, c.aniversario, c.observacao, c.limite_credito);
    return plano(db.prepare('SELECT * FROM clientes WHERE id = ?').get(r.lastInsertRowid));
  });

  rota('PUT', '/api/clientes/:id', ({ params, corpo, usuario }) => {
    const c = lerCliente(corpo || {});
    if (usuario.perfil !== 'admin') {
      const atual = db.prepare('SELECT limite_credito FROM clientes WHERE id = ?').get(params.id);
      c.limite_credito = atual ? atual.limite_credito : null;
    }
    const r = db
      .prepare(
        `UPDATE clientes SET nome=?, cpf=?, telefone=?, email=?, aniversario=?, observacao=?,
           limite_credito=? WHERE id = ?`
      )
      .run(c.nome, c.cpf, c.telefone, c.email, c.aniversario, c.observacao, c.limite_credito, params.id);
    if (!r.changes) throw erro(404, 'Cliente não encontrado.');
    return plano(db.prepare('SELECT * FROM clientes WHERE id = ?').get(params.id));
  });

  // ------------------------------------------------------------- crediário
  const crediario = instalarCrediario({
    db, rota, erro, inteiro, texto, plano, planos, transacao, config, caixaAberto,
  });

  instalarInventario({ db, rota, erro, inteiro, texto, plano, planos, transacao });

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
    const recebimentos = crediario.recebimentosDoCaixa(caixaId);
    const recebidoDinheiro = recebimentos.find((f) => f.forma === 'dinheiro')?.valor || 0;
    const dinheiroEsperado =
      caixa.valor_abertura + suprimentos - sangrias + dinheiro - vendas.troco + recebidoDinheiro;
    return {
      caixa,
      vendas: { ...vendas, canceladas },
      formas,
      recebimentos_crediario: recebimentos,
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

  rota('POST', '/api/caixa/abrir', ({ corpo, usuario }) => {
    if (caixaAberto()) throw erro(409, 'Já existe um caixa aberto.');
    const valor = inteiro(corpo.valor_abertura, 'valor_abertura', { min: 0, padrao: 0 });
    const r = db
      .prepare('INSERT INTO caixas (operador, usuario_id, valor_abertura) VALUES (?, ?, ?)')
      .run(usuario.nome, usuario.id, valor);
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
    v.crediario = crediario.parcelasDaVenda(id);
    return v;
  };

  rota('POST', '/api/vendas', ({ corpo, usuario }) => {
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
        const parcelado = p.forma === 'credito' || p.forma === 'crediario';
        return {
          forma: p.forma,
          valor: inteiro(p.valor, 'valor do pagamento', { min: 1 }),
          parcelas: parcelado ? inteiro(p.parcelas, 'parcelas', { min: 1, padrao: 1 }) : 1,
          primeiro_vencimento: p.forma === 'crediario' ? texto(p.primeiro_vencimento, 10) : null,
        };
      });
      if (pagamentos.filter((p) => p.forma === 'crediario').length > 1) {
        throw erro(400, 'Use só um lançamento de crediário por venda.');
      }
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
      const fiado = pagamentos.find((p) => p.forma === 'crediario');
      if (fiado && !clienteId) throw erro(400, 'Para vender no crediário, identifique o cliente.');

      const r = db
        .prepare(
          `INSERT INTO vendas (caixa_id, cliente_id, cpf_nota, vendedor, usuario_id, subtotal, desconto,
             total, troco) VALUES (?,?,?,?,?,?,?,?,?)`
        )
        .run(caixa.id, clienteId, soDigitos(corpo.cpf_nota), usuario.nome, usuario.id,
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
        'INSERT INTO venda_pagamentos (venda_id, forma, valor, parcelas, taxa) VALUES (?,?,?,?,?)'
      );
      for (const p of pagamentos) {
        insPag.run(vendaId, p.forma, p.valor, p.parcelas, taxas.calcular(cfg, p.forma, p.parcelas, p.valor));
      }
      if (fiado) {
        crediario.lancarParcelas({
          clienteId, vendaId, valor: fiado.valor, parcelas: fiado.parcelas,
          primeiroVencimento: fiado.primeiro_vencimento, descricao: `Venda nº ${vendaId}`,
        });
      }

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
      crediario.cancelarDaVenda(venda.id);
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
  }, 'admin');

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
    // Taxas das maquininhas: usa a taxa gravada na venda; vendas antigas (sem taxa gravada)
    // são calculadas com as taxas atuais.
    const linhasTaxa = [];
    const juntar = (origem, rows) => {
      for (const r of rows) {
        const taxa = (r.taxa || 0) + taxas.calcular(cfg, r.forma, r.parcelas, r.sem_taxa || 0);
        if (!taxa && !['debito', 'credito', 'pix'].includes(r.forma)) continue;
        linhasTaxa.push({
          origem, forma: r.forma, parcelas: r.parcelas, bruto: r.valor, taxa, liquido: r.valor - taxa,
          percentual: taxas.percentual(cfg, r.forma, r.parcelas),
        });
      }
    };
    const cfg = config();
    juntar('vendas', planos(
      db
        .prepare(
          `SELECT p.forma, p.parcelas, SUM(p.valor) AS valor, SUM(p.taxa) AS taxa,
             SUM(CASE WHEN p.taxa IS NULL THEN p.valor END) AS sem_taxa
           FROM venda_pagamentos p JOIN vendas v ON v.id = p.venda_id
           WHERE ${filtro} GROUP BY p.forma, p.parcelas ORDER BY p.forma, p.parcelas`
        )
        .all(de, ate)
    ));
    juntar('crediario', planos(
      db
        .prepare(
          `SELECT forma, 1 AS parcelas, SUM(valor) AS valor, SUM(taxa) AS taxa,
             SUM(CASE WHEN taxa IS NULL THEN valor END) AS sem_taxa
           FROM crediario_recebimentos WHERE status = 'ok' AND date(criado_em) BETWEEN ? AND ?
           GROUP BY forma`
        )
        .all(de, ate)
    ));
    const totalTaxas = linhasTaxa.reduce((a, l) => a + l.taxa, 0);
    totais.taxas = totalTaxas;
    totais.lucro_apos_taxas = totais.lucro_bruto - totalTaxas;
    return {
      de, ate, totais, formas, por_dia: porDia, top_produtos: topProdutos, por_vendedor: porVendedor,
      crediario: crediario.resumoGeral(de, ate),
      taxas: {
        linhas: linhasTaxa,
        total: totalTaxas,
        bruto: linhasTaxa.reduce((a, l) => a + l.bruto, 0),
      },
    };
  }, 'admin');

  // ----------------------------------------------------------------- painel
  rota('GET', '/api/painel', () => {
    const cfg = config();
    const dia = (desloc) => new Date(Date.now() + desloc * 864e5).toLocaleDateString('sv-SE');
    const hoje = dia(0);
    const totaisDia = (d) => {
      const t = plano(
        db
          .prepare(
            `SELECT COUNT(*) AS vendas, COALESCE(SUM(total),0) AS faturamento,
               COALESCE((SELECT SUM(i.quantidade) FROM venda_itens i JOIN vendas v2 ON v2.id = i.venda_id
                 WHERE v2.status = 'concluida' AND date(v2.criado_em) = ?),0) AS pecas
             FROM vendas WHERE status = 'concluida' AND date(criado_em) = ?`
          )
          .get(d, d)
      );
      t.ticket = t.vendas ? Math.round(t.faturamento / t.vendas) : 0;
      return t;
    };
    const inicioMes = hoje.slice(0, 8) + '01';
    const mes = db
      .prepare(
        `SELECT COALESCE(SUM(total),0) AS faturamento, COUNT(*) AS vendas FROM vendas
         WHERE status = 'concluida' AND date(criado_em) BETWEEN ? AND ?`
      )
      .get(inicioMes, hoje);
    const [a, m] = hoje.split('-').map(Number);
    const diasNoMes = new Date(a, m, 0).getDate();
    const diaDoMes = Number(hoje.slice(8));
    const porDia = planos(
      db
        .prepare(
          `SELECT date(criado_em) AS dia, SUM(total) AS faturamento, COUNT(*) AS vendas FROM vendas
           WHERE status = 'concluida' AND date(criado_em) >= ? GROUP BY dia ORDER BY dia`
        )
        .all(dia(-13))
    );
    const ultimos14 = Array.from({ length: 14 }, (_, i) => {
      const d = dia(i - 13);
      const r = porDia.find((x) => x.dia === d);
      return { dia: d, faturamento: r ? r.faturamento : 0, vendas: r ? r.vendas : 0 };
    });
    const maisVendidos = planos(
      db
        .prepare(
          `SELECT i.produto_id, i.nome, SUM(i.quantidade) AS quantidade, SUM(i.total) AS total, p.foto_versao
           FROM venda_itens i JOIN vendas v ON v.id = i.venda_id LEFT JOIN produtos p ON p.id = i.produto_id
           WHERE v.status = 'concluida' AND date(v.criado_em) >= ?
           GROUP BY i.nome ORDER BY quantidade DESC, total DESC LIMIT 5`
        )
        .all(dia(-6))
    );
    // Aniversariantes de hoje até 7 dias (comparando só mês-dia).
    const proximos = new Map(Array.from({ length: 8 }, (_, i) => [dia(i).slice(5), i]));
    const aniversariantes = planos(
      db.prepare(`SELECT id, nome, telefone, aniversario FROM clientes WHERE aniversario IS NOT NULL AND aniversario <> ''`).all()
    )
      .filter((c) => proximos.has(c.aniversario.slice(5)))
      .map((c) => ({ ...c, em_dias: proximos.get(c.aniversario.slice(5)) }))
      .sort((x, y) => x.em_dias - y.em_dias);
    const vencendoHoje = planos(
      db
        .prepare(
          `SELECT c.id, c.nome, c.telefone, SUM(p.valor - p.valor_pago) AS valor
           FROM crediario_parcelas p JOIN clientes c ON c.id = p.cliente_id
           WHERE p.status = 'aberta' AND p.vencimento = ? GROUP BY c.id ORDER BY c.nome`
        )
        .all(hoje)
    );
    const estoqueBaixo = db
      .prepare('SELECT COUNT(*) AS n FROM produtos WHERE ativo = 1 AND estoque <= estoque_minimo')
      .get().n;
    const meta = cfg.meta_mensal ? Number(cfg.meta_mensal) : null;
    return {
      hoje: totaisDia(hoje),
      ontem: totaisDia(dia(-1)),
      mes: { ...mes, meta, dia: diaDoMes, dias: diasNoMes,
        projecao: diaDoMes ? Math.round((mes.faturamento / diaDoMes) * diasNoMes) : 0 },
      ultimos14,
      mais_vendidos: maisVendidos,
      aniversariantes,
      crediario: { ...crediario.resumoGeral(hoje, hoje), vencendo_hoje: vencendoHoje },
      estoque_baixo: estoqueBaixo,
    };
  }, 'admin');

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
  }, 'admin');

  // -------------------------------------------------------------- impressão
  const imprimir = async (cfgImpressora, dados, nome) => {
    try {
      await impressora.enviar(cfgImpressora, dados, nome);
    } catch (e) {
      throw erro(502, `Não consegui imprimir: ${e.message}`);
    }
    return { ok: true };
  };

  rota('GET', '/api/impressoras', async () => {
    try {
      return await impressora.listarImpressoras();
    } catch (e) {
      throw erro(502, `Não consegui listar as impressoras: ${e.message}`);
    }
  });

  rota('POST', '/api/imprimir/venda/:id', ({ params, corpo }) => {
    const cfg = config();
    const venda = buscarVenda(params.id);
    if (corpo.tipo === 'troca') {
      return imprimir(cfg.impressora_cupom, documentos.cupomTroca(venda, cfg).bytes(), `troca-${venda.id}`);
    }
    const vias = Math.max(1, Number(cfg.cupom_vias) || 1);
    const comCrediario = venda.crediario.length > 0;
    const nomes = ['Via do cliente', 'Via da loja'];
    const pagouDinheiro = venda.pagamentos.some((p) => p.forma === 'dinheiro');
    const partes = [];
    // Venda no crediário sempre sai em 2 vias: uma fica assinada com a loja.
    const total = comCrediario ? Math.max(2, vias) : vias;
    for (let i = 0; i < total; i++) {
      partes.push(documentos.cupomVenda(venda, cfg, {
        via: total > 1 ? nomes[i] || `Via ${i + 1}` : '',
        abrirGaveta: i === 0 && corpo.gaveta !== false && pagouDinheiro && cfg.gaveta_abrir === '1',
      }).bytes());
    }
    return imprimir(cfg.impressora_cupom, Buffer.concat(partes), `venda-${venda.id}`);
  });

  rota('POST', '/api/imprimir/caixa/:id', ({ params }) => {
    const cfg = config();
    return imprimir(cfg.impressora_cupom, documentos.fechamentoCaixa(resumoCaixa(params.id), cfg).bytes(), `caixa-${params.id}`);
  });

  rota('POST', '/api/imprimir/recebimento/:id', ({ params }) => {
    const cfg = config();
    const rec = crediario.buscarRecebimento(params.id);
    return imprimir(cfg.impressora_cupom, documentos.recebimentoCrediario(rec, cfg).bytes(), `recibo-${rec.id}`);
  });

  rota('POST', '/api/imprimir/gaveta', () => {
    const cfg = config();
    return imprimir(cfg.impressora_cupom, Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]), 'gaveta');
  });

  rota('POST', '/api/imprimir/etiquetas', ({ corpo }) => {
    const cfg = config();
    if (!Array.isArray(corpo.itens) || !corpo.itens.length) throw erro(400, 'Nenhuma etiqueta para imprimir.');
    const itens = corpo.itens.map((it) => ({
      produto: buscarProduto(it.produto_id),
      quantidade: Math.min(inteiro(it.quantidade, 'quantidade', { min: 0 }), 999),
    }));
    const dados = gerarEtiquetas(itens, cfg);
    if (!dados) throw erro(400, 'Nenhuma etiqueta para imprimir.');
    return imprimir(cfg.impressora_etiqueta, dados, 'etiquetas');
  });

  /** Prévia em texto do cupom (para conferir sem gastar papel). */
  rota('GET', '/api/imprimir/previa/venda/:id', ({ params, query }) => {
    const cfg = config();
    const venda = buscarVenda(params.id);
    const doc = query.get('tipo') === 'troca' ? documentos.cupomTroca(venda, cfg) : documentos.cupomVenda(venda, cfg);
    return { texto: doc.texto, colunas: doc.colunas };
  });

  rota('POST', '/api/imprimir/teste', ({ corpo }) => {
    const cfg = { ...config(), ...(corpo.config || {}) };
    if (corpo.alvo === 'etiqueta') {
      const exemplo = {
        nome: 'Vestido Midi Canelado', tamanho: 'M', cor: 'Preto', referencia: '1020',
        preco_venda: 15990, codigo: '2000000000015',
      };
      return imprimir(cfg.impressora_etiqueta, gerarEtiquetas([{ produto: exemplo, quantidade: 1 }], cfg), 'teste-etiqueta');
    }
    return imprimir(cfg.impressora_cupom, documentos.teste(cfg).bytes(), 'teste-cupom');
  });

  /**
   * Resolve uma requisição; devolve { status, corpo, sessao } ou null se a rota não existir.
   * `sessao` vem preenchido (token, ou null para apagar) quando o cookie precisa mudar.
   */
  return function despachar(metodo, caminho, query, corpo, token) {
    for (const r of rotas) {
      if (r.metodo !== metodo) continue;
      const m = caminho.match(r.re);
      if (!m) continue;
      const params = {};
      r.nomes.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
      const resposta = { status: 200 };
      const ctx = {
        params, query, corpo: corpo || {}, token,
        usuario: usuarioDoToken(token),
        definirSessao: (t) => (resposta.sessao = t),
      };
      try {
        if (r.acesso !== 'publico' && !ctx.usuario) throw erro(401, 'Faça login para continuar.');
        if (r.acesso === 'admin' && ctx.usuario.perfil !== 'admin') {
          throw erro(403, 'Só o administrador pode fazer isso.');
        }
        const resultado = r.fn(ctx);
        if (resultado && typeof resultado.then === 'function') {
          // Rota assíncrona (impressão): devolve uma Promise com a mesma forma de resposta.
          return resultado.then(
            (c) => ({ ...resposta, corpo: c }),
            (e) => {
              if (e instanceof ErroHttp) return { status: e.status, corpo: { erro: e.message } };
              throw e;
            }
          );
        }
        resposta.corpo = resultado;
        return resposta;
      } catch (e) {
        if (e instanceof ErroHttp) return { status: e.status, corpo: { erro: e.message } };
        throw e;
      }
    }
    return null;
  };
}

module.exports = { criarApi, FORMAS_PAGAMENTO };
