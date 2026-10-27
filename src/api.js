'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { transacao, CONFIG_PADRAO } = require('./db');
const { gerarEan13Interno } = require('./codigos');
const { hashSenha, conferirSenha, novoToken } = require('./auth');
const { instalarCrediario } = require('./crediario');
const { instalarInventario } = require('./inventario');
const taxas = require('./taxas');
const { criarBackup } = require('./backup');
const { instalarTrocas } = require('./trocas');
const { instalarCondicional } = require('./condicional');
const { instalarReservas } = require('./reservas');
const { instalarEspera } = require('./espera');
const { instalarCelular, enderecosLocais } = require('./celular');
const { instalarGiro } = require('./giro');
const { instalarAuditoria } = require('./auditoria');
const { instalarAtualizacao, VERSAO } = require('./atualizacao');
const documentos = require('./impressao/documentos');
const { gerarEtiquetas, gerarEtiquetasImagem } = require('./impressao/etiquetas');
const impressora = require('./impressao/impressora');

const HORAS_SESSAO = 14;

const FORMAS_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito', 'crediario', 'vale', 'outro'];

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

/**
 * Arredonda um preço (centavos) para terminar em ,90 / ,99 / ,00.
 * Para cima no preço sugerido; para baixo na liquidação (o desconto nunca fica menor que o anunciado).
 */
function arredondarPreco(centavos, modo, sentido = 'cima') {
  if (!modo || !centavos) return centavos;
  const final = { 90: 90, 99: 99, '00': 0 }[modo];
  if (final === undefined) return centavos;
  let r = Math.floor(centavos / 100) * 100 + final;
  if (sentido === 'cima' && r < centavos) r += 100;
  if (sentido === 'baixo' && r > centavos) r -= 100;
  return Math.max(r, 0);
}

/**
 * @param {object} [opcoes]
 * @param {string} [opcoes.pastaBackup] pasta padrão dos backups automáticos
 */
function criarApi(db, opcoes = {}) {
  const rotas = [];
  /** acesso: 'publico' (sem login), 'logado' (qualquer usuário) ou 'admin'. */
  const rota = (metodo, padrao, fn, acesso = 'logado') => {
    const nomes = [];
    const re = new RegExp(
      '^' + padrao.replace(/:(\w+)/g, (_, n) => (nomes.push(n), '([^/]+)')) + '$'
    );
    rotas.push({ metodo, padrao, re, nomes, fn, acesso });
  };

  const config = () => {
    const c = {};
    for (const r of db.prepare('SELECT chave, valor FROM config').all()) c[r.chave] = r.valor;
    return c;
  };

  const salvarConfig = (valores) => {
    const up = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
    for (const [k, v] of Object.entries(valores)) up.run(k, v == null ? '' : String(v));
  };
  const backup = criarBackup({
    db, config, salvarConfig,
    pastaPadrao: opcoes.pastaBackup || path.join(os.tmpdir(), 'clara-styllus-backups'),
  });

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
    db.prepare(`DELETE FROM sessoes WHERE expira_em <= datetime('now','localtime')`).run(); // limpa as vencidas
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
    versao: VERSAO,
  }), 'publico');

  rota('POST', '/api/primeiro-acesso', (ctx) => {
    if (temUsuarios()) throw erro(409, 'O sistema já tem usuários cadastrados.');
    const u = lerUsuario({ ...ctx.corpo, perfil: 'admin' }, true);
    const r = db
      .prepare('INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?,?,?,?)')
      .run(u.nome, u.login, u.senha_hash, 'admin');
    return abrirSessao(ctx, { ...u, id: Number(r.lastInsertRowid), ativo: 1 });
  }, 'publico');

  // Tentativas de senha: depois de 5 erros seguidos no mesmo usuário, espera 30 s (dobrando até 15 min).
  const tentativas = new Map();
  rota('POST', '/api/login', (ctx) => {
    const login = texto(ctx.corpo.login, 40);
    const chave = String(login || '').toLowerCase();
    const t = tentativas.get(chave) || { falhas: 0, ate: 0 };
    if (t.ate > Date.now()) {
      throw erro(429, `Muitas tentativas erradas. Espere ${Math.ceil((t.ate - Date.now()) / 1000)} segundos e tente de novo.`);
    }
    const u = login && plano(db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login));
    if (!u || !u.ativo || !conferirSenha(ctx.corpo.senha ?? '', u.senha_hash)) {
      t.falhas++;
      if (t.falhas >= 5) t.ate = Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (t.falhas - 5));
      tentativas.set(chave, t);
      auditoria.loginFalhou(login);
      throw erro(401, 'Usuário ou senha incorretos.');
    }
    tentativas.delete(chave);
    return abrirSessao(ctx, u);
  }, 'publico');

  /*
   * Esqueci a senha (sem internet): o sistema grava um código de 6 números num arquivo dentro do
   * computador da loja (C:\ProgramData\ClaraStyllus\REDEFINIR-SENHA.txt, atalho no menu Iniciar).
   * Só quem está no computador consegue ler o código — o celular e a rede não chegam ao arquivo.
   */
  const pastaCodigo = opcoes.pastaDados || path.resolve(opcoes.pastaBackup || require('node:os').tmpdir(), '..');
  const arquivoCodigo = path.join(pastaCodigo, 'REDEFINIR-SENHA.txt');
  let codigoSenha = null; // { codigo, ate, erros }
  const apagarArquivoCodigo = () => { try { fs.unlinkSync(arquivoCodigo); } catch { /* já não existe */ } };
  rota('POST', '/api/senha/codigo', () => {
    const codigo = String(require('node:crypto').randomInt(0, 1e6)).padStart(6, '0');
    codigoSenha = { codigo, ate: Date.now() + 15 * 60e3, erros: 0 };
    const hora = new Date(codigoSenha.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    try {
      fs.mkdirSync(pastaCodigo, { recursive: true });
      fs.writeFileSync(arquivoCodigo, '\ufeff' + [
        'Clara Styllus PDV - redefinir senha',
        '',
        `Código: ${codigo}`,
        '',
        `Vale até as ${hora} e só uma vez. Digite na tela "Esqueci minha senha".`,
        'Se não foi você que pediu, ignore: sem o código ninguém troca a senha.',
        '',
      ].join('\r\n'), 'utf8');
    } catch (e) {
      codigoSenha = null;
      throw erro(500, `Não consegui gravar o código (${e.message}).`);
    }
    return { ok: true, arquivo: arquivoCodigo, validade_min: 15 };
  }, 'publico');

  rota('POST', '/api/senha/redefinir', ({ corpo }) => {
    const c = codigoSenha;
    if (!c || c.ate < Date.now()) { codigoSenha = null; apagarArquivoCodigo(); throw erro(410, 'O código venceu. Gere outro.'); }
    const digitado = String(corpo.codigo || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
    const crypto = require('node:crypto');
    if (!crypto.timingSafeEqual(Buffer.from(digitado), Buffer.from(c.codigo))) {
      c.erros++;
      if (c.erros >= 5) { codigoSenha = null; apagarArquivoCodigo(); throw erro(429, 'Código errado muitas vezes. Gere um código novo.'); }
      throw erro(400, 'Código errado. Confira no arquivo do computador.');
    }
    const login = texto(corpo.login, 40);
    const u = login && db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login);
    if (!u) throw erro(404, 'Usuário não encontrado. Confira como ele está escrito.');
    const { senha_hash: hash } = lerUsuario({ senha: corpo.nova_senha }, false);
    transacao(db, () => {
      db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, u.id);
      db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(u.id);
    });
    tentativas.delete(String(u.login).toLowerCase());
    codigoSenha = null;
    apagarArquivoCodigo();
    return { ok: true, login: u.login, nome: u.nome };
  }, 'publico');

  rota('POST', '/api/logout', (ctx) => {
    if (ctx.token) db.prepare('DELETE FROM sessoes WHERE token = ?').run(ctx.token);
    ctx.definirSessao(null);
    return { ok: true };
  }, 'publico');

  rota('POST', '/api/minha-senha', ({ usuario, corpo, token }) => {
    if (!conferirSenha(corpo.senha_atual ?? '', usuario.senha_hash)) {
      throw erro(400, 'Senha atual incorreta.');
    }
    const { senha_hash: hash } = lerUsuario({ senha: corpo.nova_senha }, false);
    if (!hash) throw erro(400, 'Informe a nova senha.');
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, usuario.id);
    // Senha nova: as outras sessões abertas com a senha antiga saem.
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token <> ?').run(usuario.id, token || '');
    return { ok: true };
  });

  rota('GET', '/api/usuarios', () => {
    // Vendas do mês corrente de cada pessoa (para os cartões da tela Vendedores).
    const mes = new Map(db.prepare(
      `SELECT usuario_id, COUNT(*) AS vendas, COALESCE(SUM(total), 0) AS total, MAX(criado_em) AS ultima
         FROM vendas WHERE status = 'concluida' AND criado_em >= strftime('%Y-%m-01', 'now', 'localtime')
        GROUP BY usuario_id`).all().map((r) => [r.usuario_id, plano(r)]));
    return planos(db.prepare('SELECT * FROM usuarios ORDER BY ativo DESC, nome').all()).map((u) => {
      const m = mes.get(u.id);
      return { ...publico(u), vendas_mes: m ? m.vendas : 0, total_mes: m ? m.total : 0, ultima_venda: m ? m.ultima : null };
    });
  }, 'admin');

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
  const OCULTO = '••••••••';
  // O token de atualização nunca volta para a tela (só aparece que está preenchido).
  rota('GET', '/api/config', () => {
    const c = config();
    if (c.atualizacao_token) c.atualizacao_token = OCULTO;
    return c;
  });

  rota('PUT', '/api/config', ({ corpo }) => {
    const atual = config();
    if (corpo && corpo.atualizacao_token === OCULTO) delete corpo.atualizacao_token;
    const up = db.prepare('UPDATE config SET valor = ? WHERE chave = ?');
    transacao(db, () => {
      for (const [k, v] of Object.entries(corpo || {})) {
        if (k in atual) up.run(v === null || v === undefined ? '' : String(v), k);
      }
    });
    return config();
  }, 'admin');

  /** Outros computadores da loja: se está liberado e o endereço deste computador na rede. */
  rota('GET', '/api/sistema/rede', async () => ({
    liberado: config().rede_computadores === '1',
    enderecos: await enderecosLocais(),
    porta: Number(opcoes.porta || process.env.PORTA || 3456),
  }), 'admin');

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
    if ('servico' in corpo) p.servico = corpo.servico ? 1 : 0;
    if ('atalho' in corpo) p.atalho = corpo.atalho ? 1 : 0;
    if (!parcial || 'preco_anterior' in corpo) {
      // Preço "De" (liquidação): só faz sentido se for maior que o preço atual.
      const ant = inteiro(corpo.preco_anterior, 'preco_anterior', { min: 0, padrao: 0 });
      p.preco_anterior = ant > 0 ? ant : null;
    }
    if (!parcial && !p.nome) throw erro(400, 'Informe o nome do produto.');
    if (parcial && 'nome' in p && !p.nome) throw erro(400, 'Informe o nome do produto.');
    return p;
  };

  const buscarProduto = (id) => {
    const p = plano(db.prepare('SELECT * FROM produtos WHERE id = ?').get(id));
    if (!p) throw erro(404, 'Produto não encontrado.');
    return p;
  };

  // Antes de /api/produtos/:id, para "interessadas" não virar um id.
  instalarGiro({ db, rota, erro, texto, plano, planos });

  rota('GET', '/api/produtos', ({ query }) => {
    const q = texto(query.get('q'));
    const incluirInativos = query.get('inativos') === '1';
    const estoqueBaixo = query.get('estoque_baixo') === '1';
    const limite = Math.min(inteiro(query.get('limite'), 'limite', { min: 1, padrao: 200 }), 1000);
    const where = [];
    const args = [];
    where.push('excluido_em IS NULL');
    if (!incluirInativos) where.push('ativo = 1');
    if (estoqueBaixo) where.push('servico = 0 AND estoque <= estoque_minimo');
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

  /** Cores, tamanhos, categorias e marcas já usados (sugestões no cadastro). */
  /** Produtos marcados como botão rápido no PDV (sacola, ajuste de barra…). */
  rota('GET', '/api/produtos/atalhos', () =>
    planos(db.prepare('SELECT * FROM produtos WHERE ativo = 1 AND atalho = 1 ORDER BY nome LIMIT 12').all()));

  /** Vitrine do caixa: peças mais vendidas nos últimos 30 dias (com estoque); completa com as mais novas. */
  rota('GET', '/api/produtos/populares', ({ query }) => {
    const limite = Math.min(24, Math.max(4, Number(query.get('limite')) || 12));
    const top = planos(db.prepare(
      `SELECT p.*, SUM(i.quantidade) AS vendidas FROM venda_itens i
       JOIN vendas v ON v.id = i.venda_id JOIN produtos p ON p.id = i.produto_id
       WHERE v.status = 'concluida' AND v.criado_em >= datetime('now','localtime','-30 days')
         AND p.ativo = 1 AND p.atalho = 0 AND (p.estoque > 0 OR p.servico = 1)
       GROUP BY p.id ORDER BY vendidas DESC LIMIT ?`
    ).all(limite));
    if (top.length < limite) {
      const ids = top.map((p) => p.id);
      const novos = planos(db.prepare(
        `SELECT * FROM produtos WHERE ativo = 1 AND atalho = 0 AND estoque > 0
         ${ids.length ? `AND id NOT IN (${ids.map(() => '?').join(',')})` : ''} ORDER BY id DESC LIMIT ?`
      ).all(...ids, limite - top.length));
      top.push(...novos);
    }
    return top;
  });

  rota('GET', '/api/produtos/atributos', () => {
    const distintos = (col) => db
      .prepare(`SELECT ${col} AS v, COUNT(*) AS n FROM produtos WHERE ativo = 1 AND ${col} IS NOT NULL AND ${col} <> ''
                GROUP BY ${col} COLLATE NOCASE ORDER BY n DESC, v LIMIT 60`)
      .all().map((r) => r.v);
    return { cores: distintos('cor'), tamanhos: distintos('tamanho'), categorias: distintos('categoria'), marcas: distintos('marca') };
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

  /**
   * Variações "vazias": cadastradas com 0 e que nunca tiveram estoque nem movimento (o cadastro em grade
   * cruza todos os tamanhos com todas as cores). Aparecem como esgotadas sem nunca terem existido.
   */
  const SQL_VAZIAS = `SELECT p.id, p.nome, p.referencia, p.tamanho, p.cor FROM produtos p
    WHERE p.ativo = 1 AND p.excluido_em IS NULL AND p.servico = 0 AND p.estoque = 0
      AND NOT EXISTS (SELECT 1 FROM estoque_movimentos m WHERE m.produto_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM venda_itens x WHERE x.produto_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM troca_itens x WHERE x.produto_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM condicional_itens x WHERE x.produto_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM reserva_itens x WHERE x.produto_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM inventario_itens x WHERE x.produto_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM inventario_leituras x WHERE x.produto_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM espera x WHERE x.produto_id = p.id)`;
  rota('GET', '/api/produtos/vazias', ({ query }) => {
    const nome = texto(query.get('nome'));
    const ref = texto(query.get('referencia'));
    return planos(db.prepare(`${SQL_VAZIAS} ${nome ? 'AND p.nome = ? COLLATE NOCASE AND (? IS NULL OR p.referencia = ?)' : ''}
      ORDER BY p.nome, p.cor, p.tamanho`).all(...(nome ? [nome, ref, ref] : [])));
  }, 'admin');
  rota('POST', '/api/produtos/vazias/apagar', ({ corpo }) => {
    const ids = new Set((Array.isArray(corpo.ids) ? corpo.ids : []).map(Number));
    // Confere de novo: só apaga o que continua vazio agora.
    const alvo = planos(db.prepare(SQL_VAZIAS).all()).filter((p) => ids.has(p.id));
    transacao(db, () => {
      for (const p of alvo) {
        db.prepare('DELETE FROM produto_fotos WHERE produto_id = ?').run(p.id);
        db.prepare('DELETE FROM produtos WHERE id = ?').run(p.id);
      }
    });
    return { apagados: alvo.length };
  }, 'admin');

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

  /** Grava um produto novo (chamar dentro de uma transação). */
  const inserirProduto = (p, estoqueInicial) => {
      if (p.codigo && db.prepare('SELECT 1 FROM produtos WHERE codigo = ?').get(p.codigo)) {
        throw erro(409, `Já existe um produto com o código ${p.codigo}.`);
      }
      const provisorio = p.codigo || `tmp-${process.hrtime.bigint()}`;
      const r = db
        .prepare(
          `INSERT INTO produtos (codigo, referencia, nome, categoria, marca, tamanho, cor,
             preco_custo, preco_venda, estoque, estoque_minimo, ncm, preco_anterior)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(provisorio, p.referencia, p.nome, p.categoria, p.marca, p.tamanho, p.cor,
          p.preco_custo, p.preco_venda, estoqueInicial, p.estoque_minimo, p.ncm,
          p.preco_anterior && p.preco_anterior > p.preco_venda ? p.preco_anterior : null);
      const id = Number(r.lastInsertRowid);
      if (p.servico || p.atalho) {
        db.prepare('UPDATE produtos SET servico = ?, atalho = ? WHERE id = ?').run(p.servico || 0, p.atalho || 0, id);
      }
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
  };

  rota('POST', '/api/produtos', ({ corpo }) => {
    const p = lerProduto(corpo || {});
    const estoqueInicial = inteiro(corpo.estoque, 'estoque', { min: 0, padrao: 0 });
    return transacao(db, () => inserirProduto(p, estoqueInicial));
  }, 'admin');

  /**
   * Cadastro da grade inteira de uma vez: mesmos dados (nome, preço…) e uma lista de
   * variações { tamanho, cor, quantidade, codigo? }. Tudo ou nada (transação).
   */
  rota('POST', '/api/produtos/grade', ({ corpo }) => {
    const base = lerProduto({ ...(corpo || {}), tamanho: null, cor: null, codigo: null });
    const variantes = Array.isArray(corpo.variantes) ? corpo.variantes : [];
    if (!variantes.length) throw erro(400, 'Escolha pelo menos um tamanho ou uma cor.');
    if (variantes.length > 300) throw erro(400, 'Grade grande demais (máximo 300 variações).');
    const chaves = new Set();
    const codigos = new Set();
    const lista = variantes.map((v) => {
      const tamanho = texto(v.tamanho, 20);
      const cor = texto(v.cor, 60);
      const k = `${(tamanho || '').toLowerCase()}|${(cor || '').toLowerCase()}`;
      if (chaves.has(k)) throw erro(400, `Tamanho ${tamanho || '—'} / cor ${cor || '—'} repetido na grade.`);
      chaves.add(k);
      const codigo = texto(v.codigo, 60);
      if (codigo) {
        if (codigos.has(codigo)) throw erro(400, `O código ${codigo} foi usado em duas variações.`);
        codigos.add(codigo);
      }
      return { tamanho, cor, codigo, quantidade: inteiro(v.quantidade, 'quantidade', { min: 0, padrao: 0 }) };
    });
    return transacao(db, () => lista.map((v) => {
      const existe = db
        .prepare(
          `SELECT id FROM produtos WHERE ativo = 1 AND nome = ? COLLATE NOCASE
           AND COALESCE(referencia,'') = COALESCE(?, '') AND COALESCE(tamanho,'') = COALESCE(?, '') COLLATE NOCASE
           AND COALESCE(cor,'') = COALESCE(?, '') COLLATE NOCASE`
        )
        .get(base.nome, base.referencia, v.tamanho, v.cor);
      if (existe) {
        throw erro(409, `Já existe "${base.nome}" ${[v.tamanho, v.cor].filter(Boolean).join(' ')} cadastrado. Use "Entrada por bipagem" para somar estoque.`);
      }
      return inserirProduto({ ...base, tamanho: v.tamanho, cor: v.cor, codigo: v.codigo }, v.quantidade);
    }));
  }, 'admin');

  /** Entrada de mercadoria em lote (ex.: bipando as peças que chegaram). */
  rota('POST', '/api/produtos/entrada-lote', ({ corpo }) => {
    const itens = Array.isArray(corpo.itens) ? corpo.itens : [];
    if (!itens.length) throw erro(400, 'Nenhuma peça bipada.');
    const motivo = texto(corpo.motivo, 200) || 'Entrada por bipagem';
    return transacao(db, () => itens.map((it) => {
      const p = buscarProduto(inteiro(it.produto_id, 'produto_id', { min: 1 }));
      const qtd = inteiro(it.quantidade, 'quantidade', { min: 1 });
      db.prepare(`UPDATE produtos SET estoque = estoque + ?, atualizado_em = datetime('now','localtime') WHERE id = ?`).run(qtd, p.id);
      db.prepare(`INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo) VALUES (?, 'entrada', ?, ?)`)
        .run(p.id, qtd, motivo);
      return buscarProduto(p.id);
    }));
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

  /**
   * Liquidação em lote: guarda o preço atual como "De" e aplica o desconto no preço de venda.
   * Se o produto já está em liquidação, o desconto é calculado sobre o preço "De" original.
   */
  rota('POST', '/api/produtos/liquidacao', ({ corpo }) => {
    const ids = Array.isArray(corpo.ids) ? corpo.ids.map(Number).filter(Number.isInteger) : [];
    if (!ids.length) throw erro(400, 'Nenhum produto selecionado.');
    const pct = Number(String(corpo.percentual ?? '').replace(',', '.'));
    if (!(pct > 0 && pct < 100)) throw erro(400, 'Informe um desconto entre 1% e 99%.');
    const modo = corpo.arredondar ?? config().arredondar_preco;
    return transacao(db, () => ids.map((id) => {
      const p = buscarProduto(id);
      const original = p.preco_anterior && p.preco_anterior > p.preco_venda ? p.preco_anterior : p.preco_venda;
      let novo = arredondarPreco(Math.round(original * (1 - pct / 100)), modo, 'baixo');
      if (novo <= 0 || novo >= original) novo = Math.round(original * (1 - pct / 100));
      db.prepare(`UPDATE produtos SET preco_anterior = ?, preco_venda = ?, atualizado_em = datetime('now','localtime') WHERE id = ?`)
        .run(original, novo, id);
      return buscarProduto(id);
    }));
  }, 'admin');

  /** Encerra a liquidação: volta o preço "De" para preço de venda. */
  rota('POST', '/api/produtos/liquidacao/encerrar', ({ corpo }) => {
    const ids = Array.isArray(corpo.ids) ? corpo.ids.map(Number).filter(Number.isInteger) : [];
    if (!ids.length) throw erro(400, 'Nenhum produto selecionado.');
    return transacao(db, () => ids.map((id) => {
      const p = buscarProduto(id);
      if (p.preco_anterior && p.preco_anterior > p.preco_venda) {
        db.prepare(`UPDATE produtos SET preco_venda = preco_anterior, preco_anterior = NULL, atualizado_em = datetime('now','localtime') WHERE id = ?`).run(id);
      } else if (p.preco_anterior) {
        db.prepare('UPDATE produtos SET preco_anterior = NULL WHERE id = ?').run(id);
      }
      return buscarProduto(id);
    }));
  }, 'admin');

  /**
   * Exclui o produto (administrador). Não deixa se a peça está numa condicional ou reserva aberta.
   * Nunca vendido/trocado: apaga de vez. Com histórico: some de todas as listas (as vendas antigas
   * continuam com o nome) e o código de barras fica livre para outro produto.
   */
  rota('DELETE', '/api/produtos/:id', ({ params }) => {
    const p = buscarProduto(params.id);
    if (p.excluido_em) throw erro(404, 'Produto não encontrado.');
    const conta = (sql) => db.prepare(sql).get(p.id).n;
    if (conta(`SELECT COUNT(*) AS n FROM condicional_itens ci JOIN condicionais c ON c.id = ci.condicional_id WHERE ci.produto_id = ? AND c.status = 'aberta'`)) {
      throw erro(409, 'Esta peça está numa condicional aberta. Feche a condicional antes de excluir.');
    }
    if (conta(`SELECT COUNT(*) AS n FROM reserva_itens ri JOIN reservas r ON r.id = ri.reserva_id WHERE ri.produto_id = ? AND r.status = 'aberta'`)) {
      throw erro(409, 'Esta peça está numa reserva aberta. Retire ou cancele a reserva antes de excluir.');
    }
    if (conta(`SELECT COUNT(*) AS n FROM inventario_itens ii JOIN inventarios i ON i.id = ii.inventario_id WHERE ii.produto_id = ? AND i.status = 'aberto'`)) {
      throw erro(409, 'Tem um inventário em andamento com esta peça. Finalize ou cancele o inventário antes.');
    }
    const historico = ['venda_itens', 'troca_itens', 'condicional_itens', 'reserva_itens', 'inventario_itens', 'inventario_leituras']
      .some((t) => conta(`SELECT COUNT(*) AS n FROM ${t} WHERE produto_id = ?`));
    return transacao(db, () => {
      // Quem estava esperando esta peça continua na lista, com a descrição dela.
      db.prepare(`UPDATE espera SET descricao = COALESCE(descricao, ?), tamanho = COALESCE(tamanho, ?), cor = COALESCE(cor, ?),
        produto_id = NULL WHERE produto_id = ?`).run(p.nome, p.tamanho, p.cor, p.id);
      db.prepare('DELETE FROM produto_fotos WHERE produto_id = ?').run(p.id);
      if (!historico) {
        db.prepare('DELETE FROM estoque_movimentos WHERE produto_id = ?').run(p.id);
        db.prepare('DELETE FROM produtos WHERE id = ?').run(p.id);
        return { ok: true, apagado: true, nome: p.nome };
      }
      db.prepare(`UPDATE produtos SET ativo = 0, atalho = 0, foto_versao = NULL, codigo = codigo || '#excluido' || id,
        excluido_em = datetime('now','localtime') WHERE id = ?`).run(p.id);
      return { ok: true, apagado: false, nome: p.nome };
    });
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

  // Resumo de compras de cada cliente (para a lista e a ficha).
  const RESUMO_CLIENTE = `
    (SELECT COUNT(*) FROM vendas v WHERE v.cliente_id = clientes.id AND v.status = 'concluida') AS compras,
    (SELECT COALESCE(SUM(total),0) FROM vendas v WHERE v.cliente_id = clientes.id AND v.status = 'concluida') AS total_comprado,
    (SELECT MAX(criado_em) FROM vendas v WHERE v.cliente_id = clientes.id AND v.status = 'concluida') AS ultima_compra,
    (SELECT COALESCE(SUM(valor - valor_pago),0) FROM crediario_parcelas p WHERE p.cliente_id = clientes.id AND p.status = 'aberta') AS deve`;

  rota('GET', '/api/clientes', ({ query }) => {
    const q = texto(query.get('q'));
    const ordem = { recentes: 'ultima_compra IS NULL, ultima_compra DESC', valor: 'total_comprado DESC' }[query.get('ordem')] || 'nome';
    if (!q) return planos(db.prepare(`SELECT *, ${RESUMO_CLIENTE} FROM clientes WHERE excluido_em IS NULL ORDER BY ${ordem} LIMIT 300`).all());
    const dig = q.replace(/\D/g, '');
    return planos(
      db
        .prepare(
          `SELECT *, ${RESUMO_CLIENTE} FROM clientes WHERE excluido_em IS NULL AND (nome LIKE ? OR (? <> '' AND (cpf LIKE ? OR telefone LIKE ?)))
           ORDER BY ${ordem} LIMIT 100`
        )
        .all(`%${q}%`, dig, `%${dig}%`, `%${dig}%`)
    );
  });

  /**
   * Exclui o cadastro (administrador). Não deixa excluir quem ainda deve no crediário, tem condicional ou
   * reserva aberta, ou vale com saldo. Sem nenhum histórico, apaga de vez; com histórico (vendas, crediário
   * quitado…), apaga os dados pessoais e tira das listas — o nome continua nas vendas antigas.
   */
  rota('DELETE', '/api/clientes/:id', ({ params }) => {
    const c = plano(db.prepare('SELECT * FROM clientes WHERE id = ? AND excluido_em IS NULL').get(params.id));
    if (!c) throw erro(404, 'Cliente não encontrada.');
    const conta = (sql) => db.prepare(sql).get(c.id).n;
    const deve = crediario.saldo(c.id).aberto;
    if (deve > 0) throw erro(409, `${c.nome} ainda deve R$ ${(deve / 100).toFixed(2).replace('.', ',')} no crediário. Receba ou cancele as parcelas antes de excluir.`);
    if (conta(`SELECT COUNT(*) AS n FROM condicionais WHERE cliente_id = ? AND status = 'aberta'`)) throw erro(409, 'Ela tem condicional aberta. Feche a condicional antes de excluir.');
    if (conta(`SELECT COUNT(*) AS n FROM reservas WHERE cliente_id = ? AND status = 'aberta'`)) throw erro(409, 'Ela tem reserva aberta. Retire ou cancele a reserva antes de excluir.');
    if (conta(`SELECT COUNT(*) AS n FROM vales WHERE cliente_id = ? AND status = 'ativo' AND saldo > 0`)) throw erro(409, 'Ela tem vale com saldo. Use ou cancele o vale antes de excluir.');
    const historico = ['vendas', 'crediario_parcelas', 'crediario_recebimentos', 'condicionais', 'reservas', 'vales', 'trocas']
      .some((t) => conta(`SELECT COUNT(*) AS n FROM ${t} WHERE cliente_id = ?`));
    return transacao(db, () => {
      db.prepare('DELETE FROM espera WHERE cliente_id = ?').run(c.id);
      db.prepare('DELETE FROM cliente_fotos WHERE cliente_id = ?').run(c.id);
      db.prepare('DELETE FROM crediario_cobrancas WHERE cliente_id = ?').run(c.id);
      if (!historico) {
        db.prepare('DELETE FROM clientes WHERE id = ?').run(c.id);
        return { ok: true, apagado: true, nome: c.nome };
      }
      db.prepare(`UPDATE clientes SET cpf = NULL, telefone = NULL, email = NULL, aniversario = NULL, observacao = NULL, foto_versao = NULL,
        excluido_em = datetime('now','localtime') WHERE id = ?`).run(c.id);
      return { ok: true, apagado: false, nome: c.nome };
    });
  }, 'admin');

  rota('GET', '/api/clientes/:id/foto', ({ params }) => {
    const f = db.prepare('SELECT tipo, dados FROM cliente_fotos WHERE cliente_id = ?').get(params.id);
    if (!f) throw erro(404, 'Cliente sem foto.');
    return { __arquivo: true, inline: true, tipo: f.tipo, conteudo: Buffer.from(f.dados) };
  });

  rota('PUT', '/api/clientes/:id/foto', ({ params, corpo }) => {
    if (!db.prepare('SELECT 1 FROM clientes WHERE id = ? AND excluido_em IS NULL').get(params.id)) throw erro(404, 'Cliente não encontrada.');
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(corpo.imagem || '');
    if (!m) throw erro(400, 'Imagem inválida (use JPG, PNG ou WEBP).');
    const dados = Buffer.from(m[2], 'base64');
    if (dados.length > 1e6) throw erro(400, 'Imagem muito grande.');
    const versao = Date.now();
    transacao(db, () => {
      db.prepare('INSERT OR REPLACE INTO cliente_fotos (cliente_id, tipo, dados) VALUES (?,?,?)').run(params.id, m[1], dados);
      db.prepare('UPDATE clientes SET foto_versao = ? WHERE id = ?').run(versao, params.id);
    });
    return { ok: true, foto_versao: versao };
  });

  rota('DELETE', '/api/clientes/:id/foto', ({ params }) => {
    db.prepare('DELETE FROM cliente_fotos WHERE cliente_id = ?').run(params.id);
    db.prepare('UPDATE clientes SET foto_versao = NULL WHERE id = ?').run(params.id);
    return { ok: true };
  });

  rota('GET', '/api/clientes/:id', ({ params }) => {
    const c = plano(db.prepare('SELECT * FROM clientes WHERE id = ?').get(params.id));
    if (!c) throw erro(404, 'Cliente não encontrado.');
    c.crediario = crediario.saldo(c.id);
    c.compras = planos(
      db
        .prepare(
          `SELECT v.id, v.total, v.status, v.criado_em, v.vendedor,
             (SELECT SUM(quantidade) FROM venda_itens i WHERE i.venda_id = v.id) AS pecas
           FROM vendas v WHERE v.cliente_id = ? ORDER BY v.criado_em DESC, v.id DESC LIMIT 50`
        )
        .all(params.id)
    );
    Object.assign(c, plano(db.prepare(`SELECT ${RESUMO_CLIENTE} FROM clientes WHERE id = ?`).get(params.id)));
    // O que ela costuma levar: tamanhos, cores e categorias mais comprados.
    const preferidos = (coluna, de = 'i') => planos(
      db.prepare(
        `SELECT ${de}.${coluna} AS nome, SUM(i.quantidade) AS pecas
         FROM venda_itens i JOIN vendas v ON v.id = i.venda_id LEFT JOIN produtos p ON p.id = i.produto_id
         WHERE v.cliente_id = ? AND v.status = 'concluida' AND COALESCE(${de}.${coluna}, '') <> ''
         GROUP BY ${de}.${coluna} ORDER BY pecas DESC LIMIT 6`
      ).all(params.id)
    );
    c.tamanhos = preferidos('tamanho');
    c.cores = preferidos('cor');
    c.categorias = preferidos('categoria', 'p');
    c.pecas_compradas = planos(
      db.prepare(
        `SELECT i.produto_id, i.nome, i.tamanho, i.cor, i.quantidade, i.total, v.criado_em, p.foto_versao
         FROM venda_itens i JOIN vendas v ON v.id = i.venda_id LEFT JOIN produtos p ON p.id = i.produto_id
         WHERE v.cliente_id = ? AND v.status = 'concluida' ORDER BY v.criado_em DESC, i.id DESC LIMIT 12`
      ).all(params.id)
    );
    c.vales = planos(db.prepare(`SELECT codigo, saldo, validade FROM vales WHERE cliente_id = ? AND status = 'ativo' AND saldo > 0`).all(params.id));
    c.condicionais = planos(db.prepare(`SELECT id, prazo, criado_em FROM condicionais WHERE cliente_id = ? AND status = 'aberta'`).all(params.id));
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
  const reservas = instalarReservas({ db, rota, erro, inteiro, texto, plano, planos, transacao, config, caixaAberto });
  instalarEspera({ db, rota, erro, inteiro, texto, plano, planos });
  instalarCelular({ db, rota, erro, texto });

  // ----------------------------------------------------------------- caixa
  // Venda conta no caixa em que foi feita se está concluída, ou se foi cancelada depois, com outro caixa aberto.
  const VALEU_NO_CAIXA = `(v.status = 'concluida' OR (v.status = 'cancelada' AND v.cancelada_caixa_id IS NOT NULL
    AND v.cancelada_caixa_id <> v.caixa_id))`;
  const resumoCaixa = (caixaId) => {
    const caixa = plano(db.prepare('SELECT * FROM caixas WHERE id = ?').get(caixaId));
    if (!caixa) throw erro(404, 'Caixa não encontrado.');
    const formas = planos(
      db
        .prepare(
          `SELECT p.forma, SUM(p.valor) AS valor, COUNT(DISTINCT v.id) AS vendas
           FROM venda_pagamentos p JOIN vendas v ON v.id = p.venda_id
           WHERE v.caixa_id = ? AND ${VALEU_NO_CAIXA} GROUP BY p.forma`
        )
        .all(caixaId)
    );
    const vendas = plano(
      db
        .prepare(
          `SELECT COUNT(*) AS quantidade, COALESCE(SUM(total),0) AS total,
             COALESCE(SUM(troco),0) AS troco, COALESCE(SUM(desconto),0) AS desconto
           FROM vendas v WHERE caixa_id = ? AND ${VALEU_NO_CAIXA}`
        )
        .get(caixaId)
    );
    const canceladas = db
      .prepare(`SELECT COUNT(*) AS n FROM vendas v WHERE caixa_id = ? AND NOT ${VALEU_NO_CAIXA}`)
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
    const sinais = reservas.sinaisDoCaixa(caixaId);
    const sinalDinheiro = sinais.find((f) => f.forma === 'dinheiro')?.valor || 0;
    const dinheiroEsperado =
      caixa.valor_abertura + suprimentos - sangrias + dinheiro - vendas.troco + recebidoDinheiro + sinalDinheiro;
    return {
      caixa,
      vendas: { ...vendas, canceladas },
      formas,
      recebimentos_crediario: recebimentos,
      sinais_reserva: sinais,
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
    const resumo = resumoCaixa(c.id);
    // Backup automático ao fechar o caixa (não impede o fechamento se falhar).
    if (config().backup_auto !== '0') {
      try {
        const b = backup.fazer('fechamento de caixa');
        resumo.backup = { ok: true, arquivo: b.arquivo, aviso: b.aviso };
      } catch (e) {
        resumo.backup = { ok: false, aviso: `Backup automático falhou: ${e.message}` };
      }
    }
    return resumo;
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
    v.itens = planos(
      db.prepare(
        `SELECT vi.*, p.foto_versao FROM venda_itens vi LEFT JOIN produtos p ON p.id = vi.produto_id
         WHERE vi.venda_id = ? ORDER BY vi.id`
      ).all(id)
    );
    v.pagamentos = planos(
      db.prepare('SELECT * FROM venda_pagamentos WHERE venda_id = ? ORDER BY id').all(id)
    );
    v.crediario = crediario.parcelasDaVenda(id);
    // O que realmente cai na conta: total da venda menos as taxas das maquininhas.
    v.taxas = v.pagamentos.reduce((a, p) => a + (p.taxa || 0), 0);
    v.liquido = v.total - v.taxas;
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

    // Retirada de reserva: vale o preço combinado na reserva (se a peça ficou mais cara depois).
    let reserva = null;
    if (corpo.reserva_id) {
      reserva = plano(db.prepare('SELECT * FROM reservas WHERE id = ?').get(corpo.reserva_id));
      if (!reserva || reserva.status !== 'retirada') throw erro(400, 'Reserva não encontrada ou ainda não retirada.');
      if (db.prepare('SELECT 1 FROM vendas WHERE reserva_id = ?').get(reserva.id)) throw erro(409, 'Esta reserva já virou venda.');
      reserva.precos = new Map(db.prepare('SELECT produto_id, MIN(preco) AS preco FROM reserva_itens WHERE reserva_id = ? GROUP BY produto_id')
        .all(reserva.id).map((r) => [r.produto_id, r.preco]));
    }

    return transacao(db, () => {
      const itens = corpo.itens.map((it, i) => {
        const prod = plano(
          db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(it.produto_id)
        );
        if (!prod) throw erro(400, `Item ${i + 1}: produto não encontrado ou inativo.`);
        if (reserva && reserva.precos.has(prod.id)) prod.preco_venda = Math.min(prod.preco_venda, reserva.precos.get(prod.id));
        // Serviço (ajuste, embrulho…) pode ter o preço informado na hora.
        if (prod.servico && it.preco !== undefined && it.preco !== null && it.preco !== '') {
          prod.preco_venda = inteiro(it.preco, 'preço', { min: 0 });
        }
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
          if (!p.servico && p.estoque < qtd) {
            throw erro(409, `Estoque insuficiente de "${p.nome}" (disponível: ${p.estoque}).`);
          }
        }
      }

      const bruto = itens.reduce((a, it) => a + it.prod.preco_venda * it.quantidade, 0);
      const subtotal = itens.reduce((a, it) => a + it.total, 0);
      const descontoGeral = inteiro(corpo.desconto, 'desconto', { min: 0, padrao: 0 });
      if (descontoGeral > subtotal) throw erro(400, 'Desconto maior que o subtotal.');
      const totalPecas = subtotal - descontoGeral;
      const descontoTotal = bruto - totalPecas;
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
          referencia: p.forma === 'vale' ? texto(p.codigo || p.referencia, 40) : null,
          bandeira: p.forma === 'debito' || p.forma === 'credito' ? taxas.bandeiraValida(p.bandeira) : null,
        };
      });
      // Crédito parcelado a partir de N vezes: a taxa da maquininha é somada no valor da cliente.
      // O caixa manda o valor "da peça"; aqui ele vira o valor cobrado na maquininha.
      let acrescimo = 0;
      for (const p of pagamentos) {
        p.juros = taxas.jurosRepassados(cfg, p.forma, p.parcelas, p.valor, p.bandeira);
        p.valor += p.juros;
        acrescimo += p.juros;
      }
      const total = totalPecas + acrescimo;
      // Vale-troca: confere saldo e validade (o desconto do saldo é feito ao gravar).
      const hojeStr = new Date().toLocaleDateString('sv-SE');
      if (pagamentos.some((x) => x.forma === 'vale' && !x.referencia)) throw erro(400, 'Informe o código do vale-troca.');
      for (const p of pagamentos.filter((x) => x.forma === 'vale')) {
        const vale = db.prepare('SELECT * FROM vales WHERE codigo = ? COLLATE NOCASE').get(p.referencia);
        if (!vale) throw erro(404, `Vale ${p.referencia} não encontrado.`);
        if (vale.status !== 'ativo') throw erro(409, `O vale ${vale.codigo} já foi ${vale.status === 'usado' ? 'usado' : 'cancelado'}.`);
        if (vale.validade && vale.validade < hojeStr) throw erro(409, `O vale ${vale.codigo} venceu em ${vale.validade.split('-').reverse().join('/')}.`);
        const usado = pagamentos.filter((x) => x.forma === 'vale' && x.referencia.toLowerCase() === p.referencia.toLowerCase())
          .reduce((a, x) => a + x.valor, 0);
        if (usado > vale.saldo) throw erro(409, `O vale ${vale.codigo} tem só R$ ${(vale.saldo / 100).toFixed(2).replace('.', ',')} de saldo.`);
        p.referencia = vale.codigo;
      }
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
             total, troco, acrescimo, reserva_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(caixa.id, clienteId, soDigitos(corpo.cpf_nota), usuario.nome, usuario.id,
          bruto, descontoTotal, total, troco, acrescimo, reserva ? reserva.id : null);
      const vendaId = Number(r.lastInsertRowid);

      const insItem = db.prepare(
        `INSERT INTO venda_itens (venda_id, produto_id, codigo, nome, tamanho, cor, quantidade,
           preco_unitario, desconto, total, preco_anterior) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      );
      const baixa = db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?');
      const mov = db.prepare(
        `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo, venda_id)
         VALUES (?, 'venda', ?, ?, ?)`
      );
      for (const it of itens) {
        const p = it.prod;
        insItem.run(vendaId, p.id, p.codigo, p.nome, p.tamanho, p.cor, it.quantidade,
          p.preco_venda, it.desconto, it.total,
          p.preco_anterior && p.preco_anterior > p.preco_venda ? p.preco_anterior : null);
        if (!p.servico) {
          baixa.run(it.quantidade, p.id);
          mov.run(p.id, -it.quantidade, `Venda #${vendaId}`, vendaId);
        }
      }
      const insPag = db.prepare(
        'INSERT INTO venda_pagamentos (venda_id, forma, valor, parcelas, taxa, referencia, bandeira, juros) VALUES (?,?,?,?,?,?,?,?)'
      );
      for (const p of pagamentos) {
        insPag.run(vendaId, p.forma, p.valor, p.parcelas, taxas.calcular(cfg, p.forma, p.parcelas, p.valor, p.bandeira),
          p.referencia, p.bandeira, p.juros);
        if (p.forma === 'vale') {
          db.prepare(`UPDATE vales SET saldo = saldo - ?, status = CASE WHEN saldo - ? <= 0 THEN 'usado' ELSE 'ativo' END
                      WHERE codigo = ?`).run(p.valor, p.valor, p.referencia);
        }
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
             (SELECT GROUP_CONCAT(DISTINCT forma) FROM venda_pagamentos p WHERE p.venda_id = v.id) AS formas,
             v.total - COALESCE((SELECT SUM(taxa) FROM venda_pagamentos p WHERE p.venda_id = v.id), 0) AS liquido
           FROM vendas v LEFT JOIN clientes c ON c.id = v.cliente_id
           ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
           ORDER BY v.criado_em DESC, v.id DESC LIMIT 500`
        )
        .all(...args)
    );
  });

  rota('GET', '/api/vendas/:id', ({ params }) => buscarVenda(params.id));

  /** Devolve aos vales o que foi usado na venda (um vale cancelado pelo administrador continua cancelado). */
  const devolverVales = (venda) => {
    for (const p of venda.pagamentos.filter((x) => x.forma === 'vale' && x.referencia)) {
      db.prepare(`UPDATE vales SET saldo = saldo + ?, status = CASE WHEN status = 'usado' THEN 'ativo' ELSE status END
                  WHERE codigo = ?`).run(p.valor, p.referencia);
    }
  };

  rota('POST', '/api/vendas/:id/cancelar', ({ params, corpo }) => {
    const venda = buscarVenda(params.id);
    if (venda.status === 'cancelada') throw erro(409, 'Venda já está cancelada.');
    const motivo = texto(corpo.motivo, 500);
    if (!motivo) throw erro(400, 'Informe o motivo do cancelamento.');
    if (db.prepare('SELECT 1 FROM trocas WHERE venda_id = ?').get(venda.id)) {
      throw erro(409, 'Esta venda já teve troca/devolução. Não dá para cancelar a venda inteira.');
    }
    // Venda de um caixa que já foi fechado: o fechamento dele não muda; o dinheiro devolvido
    // sai do caixa aberto agora (sangria).
    const aberto = caixaAberto();
    const dinheiroDaVenda = venda.pagamentos.filter((p) => p.forma === 'dinheiro').reduce((a, p) => a + p.valor, 0) - venda.troco;
    const outroCaixa = !aberto || aberto.id !== venda.caixa_id;
    if (outroCaixa && dinheiroDaVenda > 0 && !aberto) {
      throw erro(409, 'Abra o caixa para devolver o dinheiro desta venda.');
    }
    return transacao(db, () => {
      crediario.cancelarDaVenda(venda.id);
      devolverVales(venda);
      db.prepare(
        `UPDATE vendas SET status = 'cancelada', motivo_cancelamento = ?,
           cancelada_em = datetime('now','localtime'), cancelada_caixa_id = ? WHERE id = ?`
      ).run(motivo, aberto ? aberto.id : null, venda.id);
      if (outroCaixa && dinheiroDaVenda > 0) {
        db.prepare(`INSERT INTO caixa_movimentos (caixa_id, tipo, valor, motivo) VALUES (?, 'sangria', ?, ?)`)
          .run(aberto.id, dinheiroDaVenda, `Devolução da venda nº ${venda.id} (cancelada)`);
      }
      for (const it of venda.itens) {
        if (db.prepare('SELECT servico FROM produtos WHERE id = ?').get(it.produto_id)?.servico) continue;
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

  /**
   * Exclui a venda de vez (só administrador): venda lançada por engano ou de teste.
   * Se ainda não estava cancelada, devolve antes o estoque, os vales usados e cancela o crediário.
   */
  rota('DELETE', '/api/vendas/:id', ({ params }) => {
    const venda = buscarVenda(params.id);
    if (db.prepare('SELECT 1 FROM trocas WHERE venda_id = ?').get(venda.id)) {
      throw erro(409, 'Esta venda teve troca/devolução e não pode ser excluída.');
    }
    return transacao(db, () => {
      if (venda.status !== 'cancelada') {
        crediario.cancelarDaVenda(venda.id); // recusa se já tem parcela recebida
        devolverVales(venda);
        for (const it of venda.itens) {
          if (db.prepare('SELECT servico FROM produtos WHERE id = ?').get(it.produto_id)?.servico) continue;
          db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(it.quantidade, it.produto_id);
          db.prepare(
            `INSERT INTO estoque_movimentos (produto_id, tipo, quantidade, motivo) VALUES (?, 'exclusao', ?, ?)`
          ).run(it.produto_id, it.quantidade, `Venda #${venda.id} excluída`);
        }
      }
      db.prepare(
        `DELETE FROM crediario_recebimento_parcelas
         WHERE parcela_id IN (SELECT id FROM crediario_parcelas WHERE venda_id = ?)`
      ).run(venda.id);
      db.prepare('DELETE FROM crediario_parcelas WHERE venda_id = ?').run(venda.id);
      db.prepare('UPDATE estoque_movimentos SET venda_id = NULL WHERE venda_id = ?').run(venda.id);
      db.prepare('DELETE FROM venda_pagamentos WHERE venda_id = ?').run(venda.id);
      db.prepare('DELETE FROM venda_itens WHERE venda_id = ?').run(venda.id);
      db.prepare('DELETE FROM vendas WHERE id = ?').run(venda.id);
      return { ok: true };
    });
  }, 'admin');

  // ------------------------------------------------------- trocas e condicional
  const trocas = instalarTrocas({ db, rota, erro, inteiro, texto, plano, planos, transacao, config, buscarVenda });
  const condicional = instalarCondicional({ db, rota, erro, inteiro, texto, plano, planos, transacao, config });

  // -------------------------------------------------------------- despesas
  const FORMAS_DESPESA = ['dinheiro', 'pix', 'cartao', 'boleto', 'transferencia', 'outro'];
  /** Compra de mercadoria não entra no lucro real: o custo das peças vendidas já entra lá. */
  const CATEGORIA_MERCADORIA = 'Compras de mercadoria';
  const lerDespesa = (corpo) => {
    const descricao = texto(corpo.descricao, 200);
    if (!descricao) throw erro(400, 'Informe a descrição da despesa.');
    const valor = inteiro(corpo.valor, 'valor', { min: 1 });
    const data = texto(corpo.data, 10) || new Date().toLocaleDateString('sv-SE');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw erro(400, 'Data inválida.');
    const forma = FORMAS_DESPESA.includes(corpo.forma) ? corpo.forma : null;
    return {
      descricao, valor, data, forma,
      categoria: texto(corpo.categoria, 60) || null,
      favorecido: texto(corpo.favorecido, 120) || null,
      observacao: texto(corpo.observacao, 500) || null,
    };
  };

  rota('GET', '/api/despesas', ({ query }) => {
    const hoje = new Date().toLocaleDateString('sv-SE');
    const de = texto(query.get('de'), 10) || hoje.slice(0, 8) + '01';
    const ate = texto(query.get('ate'), 10) || hoje;
    return planos(db.prepare('SELECT * FROM despesas WHERE data BETWEEN ? AND ? ORDER BY data DESC, id DESC').all(de, ate));
  }, 'admin');

  /** Nomes já usados em "para quem" (funcionárias, fornecedores), para escolher sem digitar de novo. */
  rota('GET', '/api/despesas/favorecidos', () => db.prepare(
    `SELECT favorecido, COUNT(*) AS n FROM despesas WHERE favorecido IS NOT NULL AND favorecido <> ''
     GROUP BY lower(favorecido) ORDER BY n DESC, favorecido LIMIT 60`
  ).all().map((r) => r.favorecido), 'admin');

  rota('POST', '/api/despesas', ({ corpo, usuario }) => {
    const d = lerDespesa(corpo);
    const repetir = Math.min(24, Math.max(1, inteiro(corpo.repetir, 'repetir', { min: 1, padrao: 1 })));
    // Pago com o dinheiro da gaveta: sai do caixa aberto como sangria (uma vez só).
    const doCaixa = !!corpo.do_caixa;
    let caixa = null;
    if (doCaixa) {
      if (repetir > 1) throw erro(400, 'Despesa que se repete todo mês não pode sair da gaveta de uma vez.');
      caixa = caixaAberto();
      if (!caixa) throw erro(409, 'Não tem caixa aberto para tirar o dinheiro da gaveta.');
    }
    // Sangria que já saiu do caixa e agora vira despesa (relatório → "Lançar como despesa").
    let sangriaExistente = null;
    if (!doCaixa && corpo.sangria_id) {
      sangriaExistente = db.prepare(`SELECT * FROM caixa_movimentos WHERE id = ? AND tipo = 'sangria'`).get(corpo.sangria_id);
      if (!sangriaExistente) throw erro(404, 'Sangria não encontrada.');
      if (db.prepare('SELECT 1 FROM despesas WHERE sangria_id = ?').get(sangriaExistente.id)) throw erro(409, 'Esta sangria já foi lançada como despesa.');
      if (repetir > 1) throw erro(400, 'Sangria não pode ser repetida todo mês.');
    }
    return transacao(db, () => {
      const [a, m, dia] = d.data.split('-').map(Number);
      let sangriaId = sangriaExistente ? sangriaExistente.id : null;
      if (caixa) {
        sangriaId = Number(db.prepare('INSERT INTO caixa_movimentos (caixa_id, tipo, valor, motivo) VALUES (?,?,?,?)')
          .run(caixa.id, 'sangria', d.valor, `Despesa: ${d.descricao}`.slice(0, 200)).lastInsertRowid);
      }
      for (let i = 0; i < repetir; i++) {
        // Repetição mensal (ex.: aluguel), mantendo o dia ou o último dia do mês.
        const ult = new Date(a, m - 1 + i + 1, 0).getDate();
        const dt = new Date(a, m - 1 + i, Math.min(dia, ult)).toLocaleDateString('sv-SE');
        db.prepare(`INSERT INTO despesas (descricao, categoria, valor, data, usuario, forma, favorecido, observacao, sangria_id)
          VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(d.descricao, d.categoria, d.valor, dt, usuario.nome, sangriaId ? 'dinheiro' : d.forma, d.favorecido, d.observacao, sangriaId);
      }
      return { ok: true, lancadas: repetir, do_caixa: !!caixa };
    });
  }, 'admin');

  rota('PUT', '/api/despesas/:id', ({ params, corpo }) => {
    const atual = db.prepare('SELECT * FROM despesas WHERE id = ?').get(params.id);
    if (!atual) throw erro(404, 'Despesa não encontrada.');
    const d = lerDespesa(corpo);
    if (atual.sangria_id && d.valor !== atual.valor) {
      throw erro(409, 'Esta despesa saiu da gaveta do caixa: para mudar o valor, apague e lance de novo.');
    }
    db.prepare(`UPDATE despesas SET descricao = ?, categoria = ?, valor = ?, data = ?, forma = ?, favorecido = ?, observacao = ? WHERE id = ?`)
      .run(d.descricao, d.categoria, d.valor, d.data, atual.sangria_id ? 'dinheiro' : d.forma, d.favorecido, d.observacao, params.id);
    return plano(db.prepare('SELECT * FROM despesas WHERE id = ?').get(params.id));
  }, 'admin');

  /** Para onde foi o dinheiro: despesas do período por categoria, mês a mês, e as sangrias do caixa. */
  rota('GET', '/api/relatorios/despesas', ({ query }) => {
    const hoje = new Date().toLocaleDateString('sv-SE');
    const de = texto(query.get('de'), 10) || hoje.slice(0, 8) + '01';
    const ate = texto(query.get('ate'), 10) || hoje;
    const lancamentos = planos(db.prepare('SELECT * FROM despesas WHERE data BETWEEN ? AND ? ORDER BY data DESC, id DESC').all(de, ate));
    const total = lancamentos.reduce((a, d) => a + d.valor, 0);
    const porCategoria = planos(db.prepare(
      `SELECT COALESCE(NULLIF(categoria, ''), 'Outras') AS categoria, SUM(valor) AS valor, COUNT(*) AS qtd FROM despesas
       WHERE data BETWEEN ? AND ? GROUP BY 1 ORDER BY valor DESC`
    ).all(de, ate));
    // Mesmo tamanho de período, logo antes, para comparar.
    const dias = Math.round((new Date(ate + 'T12:00') - new Date(de + 'T12:00')) / 864e5) + 1;
    const desloca = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE'); };
    const anterior = db.prepare('SELECT COALESCE(SUM(valor),0) AS v FROM despesas WHERE data BETWEEN ? AND ?').get(desloca(de, -dias), desloca(de, -1)).v;
    // Últimos 6 meses até o fim do período.
    const fim = new Date(ate + 'T12:00');
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const ini = new Date(fim.getFullYear(), fim.getMonth() - i, 1);
      const ult = new Date(fim.getFullYear(), fim.getMonth() - i + 1, 0);
      const v = db.prepare('SELECT COALESCE(SUM(valor),0) AS v FROM despesas WHERE data BETWEEN ? AND ?')
        .get(ini.toLocaleDateString('sv-SE'), ult.toLocaleDateString('sv-SE')).v;
      meses.push({ mes: ini.toLocaleDateString('sv-SE').slice(0, 7), valor: v });
    }
    const sangrias = planos(db.prepare(
      `SELECT m.id, m.valor, m.motivo, m.criado_em, c.id AS caixa_id, c.operador FROM caixa_movimentos m JOIN caixas c ON c.id = m.caixa_id
       WHERE m.tipo = 'sangria' AND date(m.criado_em) BETWEEN ? AND ?
         AND NOT EXISTS (SELECT 1 FROM despesas d WHERE d.sangria_id = m.id) ORDER BY m.criado_em DESC`
    ).all(de, ate));
    return { de, ate, total, anterior, por_categoria: porCategoria, meses, lancamentos, sangrias };
  }, 'admin');

  rota('DELETE', '/api/despesas/:id', ({ params }) => {
    const d = db.prepare('SELECT * FROM despesas WHERE id = ?').get(params.id);
    if (!d) return { ok: true };
    return transacao(db, () => {
      db.prepare('DELETE FROM despesas WHERE id = ?').run(params.id);
      // Saiu da gaveta e o caixa ainda está aberto: o dinheiro volta (a sangria some). Caixa fechado não muda.
      let devolvido = false;
      if (d.sangria_id) {
        const aberto = caixaAberto();
        const s = db.prepare('SELECT * FROM caixa_movimentos WHERE id = ?').get(d.sangria_id);
        // Só a sangria criada por esta despesa ("Despesa: …"); sangria antiga que virou despesa fica.
        if (s && aberto && s.caixa_id === aberto.id && String(s.motivo || '').startsWith('Despesa: ')) {
          db.prepare('DELETE FROM caixa_movimentos WHERE id = ?').run(s.id);
          devolvido = true;
        }
      }
      return { ok: true, devolvido_ao_caixa: devolvido };
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
             COALESCE(SUM(desconto),0) AS descontos, COALESCE(SUM(acrescimo),0) AS juros_repassados
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
        const taxa = (r.taxa || 0) + taxas.calcular(cfg, r.forma, r.parcelas, r.sem_taxa || 0, r.bandeira);
        if (!taxa && !['debito', 'credito', 'pix'].includes(r.forma)) continue;
        linhasTaxa.push({
          origem, forma: r.forma, parcelas: r.parcelas, bandeira: r.bandeira || null, bruto: r.valor, taxa, liquido: r.valor - taxa,
          percentual: taxas.percentual(cfg, r.forma, r.parcelas, r.bandeira || undefined),
        });
      }
    };
    const cfg = config();
    juntar('vendas', planos(
      db
        .prepare(
          `SELECT p.forma, p.parcelas, p.bandeira, SUM(p.valor) AS valor, SUM(p.taxa) AS taxa,
             SUM(CASE WHEN p.taxa IS NULL THEN p.valor END) AS sem_taxa
           FROM venda_pagamentos p JOIN vendas v ON v.id = p.venda_id
           WHERE ${filtro} GROUP BY p.forma, p.parcelas, p.bandeira ORDER BY p.forma, p.parcelas, p.bandeira`
        )
        .all(de, ate)
    ));
    juntar('crediario', planos(
      db
        .prepare(
          `SELECT forma, 1 AS parcelas, bandeira, SUM(valor) AS valor, SUM(taxa) AS taxa,
             SUM(CASE WHEN taxa IS NULL THEN valor END) AS sem_taxa
           FROM crediario_recebimentos WHERE status = 'ok' AND date(criado_em) BETWEEN ? AND ?
           GROUP BY forma, bandeira`
        )
        .all(de, ate)
    ));
    juntar('reserva', planos(
      db
        .prepare(
          `SELECT forma, 1 AS parcelas, bandeira, SUM(valor) AS valor, SUM(taxa) AS taxa,
             SUM(CASE WHEN taxa IS NULL THEN valor END) AS sem_taxa
           FROM reserva_sinais WHERE date(criado_em) BETWEEN ? AND ?
           GROUP BY forma, bandeira`
        )
        .all(de, ate)
    ));
    const totalTaxas = linhasTaxa.reduce((a, l) => a + l.taxa, 0);
    // Quanto das vendas realmente cai na conta (vendas antigas sem taxa gravada usam a taxa atual).
    totais.cai_na_conta = totais.faturamento - linhasTaxa.filter((l) => l.origem === 'vendas').reduce((a, l) => a + l.taxa, 0);
    totais.taxas = totalTaxas;
    totais.lucro_apos_taxas = totais.lucro_bruto - totalTaxas;
    // Lucro real = vendas − trocas (com o custo das peças que voltaram) − custo − taxas − despesas.
    const tr = db
      .prepare(
        `SELECT COALESCE(SUM(ti.valor),0) AS valor, COALESCE(SUM(ti.quantidade * p.preco_custo),0) AS custo
         FROM troca_itens ti JOIN trocas t ON t.id = ti.troca_id JOIN produtos p ON p.id = ti.produto_id
         WHERE date(t.criado_em) BETWEEN ? AND ?`
      )
      .get(de, ate);
    const despesasPorCategoria = planos(
      db
        .prepare(
          `SELECT COALESCE(categoria, 'Outras') AS categoria, SUM(valor) AS valor FROM despesas
           WHERE data BETWEEN ? AND ? GROUP BY COALESCE(categoria, 'Outras') ORDER BY valor DESC`
        )
        .all(de, ate)
    );
    const despesas = despesasPorCategoria.filter((d) => d.categoria !== CATEGORIA_MERCADORIA).reduce((a, d) => a + d.valor, 0);
    totais.compras_mercadoria = despesasPorCategoria.find((d) => d.categoria === CATEGORIA_MERCADORIA)?.valor || 0;
    totais.trocas = tr.valor;
    totais.custo_trocas = tr.custo;
    totais.despesas = despesas;
    // Sinal de reserva cancelada que ficou com a loja: entra como receita no dia do cancelamento.
    totais.sinais_retidos = db.prepare(
      `SELECT COALESCE(SUM(s.valor),0) AS v FROM reserva_sinais s JOIN reservas r ON r.id = s.reserva_id
       WHERE r.status = 'cancelada' AND r.destino_sinal = 'loja' AND date(r.fechada_em) BETWEEN ? AND ?`
    ).get(de, ate).v;
    totais.lucro_real = totais.faturamento + totais.sinais_retidos - tr.valor - (totais.custo - tr.custo) - totalTaxas - despesas;
    // Horário de pico, dia da semana e categorias.
    const porHora = planos(db.prepare(
      `SELECT CAST(strftime('%H', criado_em) AS INTEGER) AS hora, COUNT(*) AS vendas, SUM(total) AS faturamento
       FROM vendas v WHERE ${filtro} GROUP BY hora ORDER BY hora`
    ).all(de, ate));
    const porSemana = planos(db.prepare(
      `SELECT CAST(strftime('%w', criado_em) AS INTEGER) AS dia, COUNT(*) AS vendas, SUM(total) AS faturamento
       FROM vendas v WHERE ${filtro} GROUP BY dia ORDER BY dia`
    ).all(de, ate));
    const porSemanaHora = planos(db.prepare(
      `SELECT CAST(strftime('%w', criado_em) AS INTEGER) AS dia, CAST(strftime('%H', criado_em) AS INTEGER) AS hora,
         COUNT(*) AS vendas, SUM(total) AS faturamento
       FROM vendas v WHERE ${filtro} GROUP BY dia, hora`
    ).all(de, ate));
    const porCategoria = planos(db.prepare(
      `SELECT COALESCE(NULLIF(p.categoria, ''), 'Sem categoria') AS categoria, SUM(i.quantidade) AS pecas, SUM(i.total) AS total
       FROM venda_itens i JOIN vendas v ON v.id = i.venda_id LEFT JOIN produtos p ON p.id = i.produto_id
       WHERE ${filtro} GROUP BY 1 ORDER BY total DESC`
    ).all(de, ate));
    // Período anterior do mesmo tamanho, para comparar.
    const dias = Math.round((new Date(ate + 'T12:00') - new Date(de + 'T12:00')) / 864e5) + 1;
    const desloca = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE'); };
    const anterior = plano(db.prepare(
      `SELECT COUNT(*) AS vendas, COALESCE(SUM(total),0) AS faturamento FROM vendas v WHERE ${filtro}`
    ).get(desloca(de, -dias), desloca(de, -1)));
    anterior.de = desloca(de, -dias);
    anterior.ate = desloca(de, -1);
    return {
      por_hora: porHora, por_semana: porSemana, por_semana_hora: porSemanaHora, por_categoria: porCategoria, anterior,
      de, ate, totais, formas, por_dia: porDia, top_produtos: topProdutos, por_vendedor: porVendedor,
      crediario: crediario.resumoGeral(de, ate),
      despesas_por_categoria: despesasPorCategoria,
      taxas: {
        linhas: linhasTaxa,
        total: totalTaxas,
        bruto: linhasTaxa.reduce((a, l) => a + l.bruto, 0),
      },
    };
  }, 'admin');

  // ----------------------------------------------------------------- painel
  /**
   * Resumo da loja em palavras (Início): esta semana × a anterior, o mais vendido, como as clientes pagam,
   * o melhor dia e horário, crediário atrasado e estoque para repor. A frase é montada na tela.
   */
  rota('GET', '/api/painel/resumo', () => {
    const dia = (desloc) => new Date(Date.now() + desloc * 864e5).toLocaleDateString('sv-SE');
    const periodo = (de, ate) => {
      const t = db.prepare(`SELECT COUNT(*) AS vendas, COALESCE(SUM(total),0) AS faturamento FROM vendas
        WHERE status = 'concluida' AND date(criado_em) BETWEEN ? AND ?`).get(de, ate);
      const pecas = db.prepare(`SELECT COALESCE(SUM(i.quantidade),0) AS n FROM venda_itens i JOIN vendas v ON v.id = i.venda_id
        WHERE v.status = 'concluida' AND date(v.criado_em) BETWEEN ? AND ?`).get(de, ate).n;
      return { vendas: Number(t.vendas), faturamento: Number(t.faturamento), pecas: Number(pecas),
        ticket: t.vendas ? Math.round(Number(t.faturamento) / Number(t.vendas)) : 0 };
    };
    const semana = periodo(dia(-6), dia(0));
    const anterior = periodo(dia(-13), dia(-7));
    const formas = planos(db.prepare(`SELECT p.forma, SUM(p.valor) AS valor FROM venda_pagamentos p JOIN vendas v ON v.id = p.venda_id
      WHERE v.status = 'concluida' AND date(v.criado_em) BETWEEN ? AND ? GROUP BY p.forma ORDER BY valor DESC`).all(dia(-6), dia(0)));
    const top = plano(db.prepare(`SELECT i.nome, SUM(i.quantidade) AS quantidade FROM venda_itens i JOIN vendas v ON v.id = i.venda_id
      WHERE v.status = 'concluida' AND date(v.criado_em) BETWEEN ? AND ? GROUP BY i.nome ORDER BY quantidade DESC LIMIT 1`).get(dia(-6), dia(0)) || null);
    const diaSemana = plano(db.prepare(`SELECT CAST(strftime('%w', criado_em) AS INTEGER) AS d, SUM(total) AS valor FROM vendas
      WHERE status = 'concluida' AND date(criado_em) >= ? GROUP BY d ORDER BY valor DESC LIMIT 1`).get(dia(-27)) || null);
    const hora = plano(db.prepare(`SELECT CAST(strftime('%H', criado_em) AS INTEGER) AS h, COUNT(*) AS n FROM vendas
      WHERE status = 'concluida' AND date(criado_em) >= ? GROUP BY h ORDER BY n DESC LIMIT 1`).get(dia(-27)) || null);
    const atrasado = plano(db.prepare(`SELECT COUNT(DISTINCT cliente_id) AS clientes, COALESCE(SUM(valor - valor_pago),0) AS valor
      FROM crediario_parcelas WHERE status = 'aberta' AND vencimento < ?`).get(dia(0)));
    const repor = db.prepare(`SELECT COUNT(*) AS n FROM produtos WHERE ativo = 1 AND excluido_em IS NULL AND servico = 0
      AND estoque <= estoque_minimo AND (estoque > 0 OR id IN (SELECT produto_id FROM venda_itens))`).get().n;
    return { semana, anterior, formas, top, dia_semana: diaSemana, hora, atrasado, repor: Number(repor) };
  }, 'admin');

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
                 WHERE v2.status = 'concluida' AND date(v2.criado_em) = ?),0) AS pecas,
               COALESCE((SELECT SUM(p.taxa) FROM venda_pagamentos p JOIN vendas v2 ON v2.id = p.venda_id
                 WHERE v2.status = 'concluida' AND date(v2.criado_em) = ?),0) AS taxas
             FROM vendas WHERE status = 'concluida' AND date(criado_em) = ?`
          )
          .get(d, d, d)
      );
      t.ticket = t.vendas ? Math.round(t.faturamento / t.vendas) : 0;
      t.liquido = t.faturamento - t.taxas;
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
      db.prepare(`SELECT id, nome, telefone, aniversario FROM clientes WHERE excluido_em IS NULL AND aniversario IS NOT NULL AND aniversario <> ''`).all()
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
      .prepare('SELECT COUNT(*) AS n FROM produtos WHERE ativo = 1 AND servico = 0 AND estoque <= estoque_minimo')
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
  rota('GET', '/api/backup/status', () => backup.status(), 'admin');

  rota('POST', '/api/backup/agora', () => {
    try {
      return { ...backup.fazer('manual'), status: backup.status() };
    } catch (e) {
      throw erro(500, `Não consegui fazer o backup: ${e.message}`);
    }
  }, 'admin');

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

  // ------------------------------------------------------- começar do zero
  /*
   * Zerar o sistema (só a administradora, com a senha dela). Antes, guarda uma cópia completa
   * "antes-de-zerar-…db" na pasta de backups (fora do rodízio, não é apagada sozinha).
   *  - movimento: apaga vendas, caixa, crediário, trocas, condicionais, reservas, despesas, estoque
   *    lançado e histórico; mantém produtos (com o estoque de agora), clientes, vendedores e configurações.
   *  - tudo: também produtos e clientes; mantém vendedores e configurações.
   *  - fabrica: apaga tudo, inclusive vendedores e configurações (volta ao primeiro acesso).
   */
  const MOVIMENTO = ['venda_pagamentos', 'venda_itens', 'vendas', 'caixa_movimentos', 'crediario_recebimento_parcelas',
    'crediario_recebimentos', 'crediario_parcelas', 'troca_itens', 'trocas', 'vales', 'condicional_itens', 'condicionais',
    'reserva_sinais', 'reserva_itens', 'reservas', 'espera', 'despesas', 'estoque_movimentos', 'inventario_leituras',
    'inventario_itens', 'inventarios', 'caixas', 'auditoria', 'crediario_cobrancas'];
  const CADASTROS = ['produto_fotos', 'produtos', 'cliente_fotos', 'clientes'];
  const tentativasZerar = { falhas: 0, ate: 0 };

  rota('GET', '/api/sistema/contagem', () => {
    const n = (t, w = '') => db.prepare(`SELECT COUNT(*) AS n FROM ${t} ${w}`).get().n;
    return {
      vendas: n('vendas'), produtos: n('produtos', 'WHERE excluido_em IS NULL'), clientes: n('clientes', 'WHERE excluido_em IS NULL'),
      crediario_aberto: n('crediario_parcelas', "WHERE status = 'aberta'"), despesas: n('despesas'), caixas: n('caixas'),
      usuarios: n('usuarios'),
    };
  }, 'admin');

  rota('POST', '/api/sistema/zerar', ({ corpo, usuario, definirSessao }) => {
    if (tentativasZerar.ate > Date.now()) throw erro(429, 'Senha errada muitas vezes. Espere alguns minutos.');
    const modo = ['movimento', 'tudo', 'fabrica'].includes(corpo.modo) ? corpo.modo : null;
    if (!modo) throw erro(400, 'Escolha o que apagar.');
    if (String(corpo.confirmacao || '').trim().toUpperCase() !== 'ZERAR') throw erro(400, 'Digite ZERAR para confirmar.');
    if (!conferirSenha(corpo.senha ?? '', usuario.senha_hash)) {
      tentativasZerar.falhas++;
      if (tentativasZerar.falhas >= 5) { tentativasZerar.ate = Date.now() + 5 * 60e3; tentativasZerar.falhas = 0; }
      throw erro(401, 'Senha da administradora incorreta.');
    }
    tentativasZerar.falhas = 0;
    // Cópia completa antes de apagar.
    const pasta = (config().backup_pasta || '').trim() || opcoes.pastaBackup || path.join(os.tmpdir(), 'clara-styllus-backups');
    const p2 = (x) => String(x).padStart(2, '0');
    const d = new Date();
    const base = `antes-de-zerar-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    let copia = path.join(pasta, `${base}.db`);
    for (let i = 2; fs.existsSync(copia); i++) copia = path.join(pasta, `${base}_${i}.db`);
    try {
      fs.mkdirSync(pasta, { recursive: true });
      db.prepare('VACUUM INTO ?').run(copia);
    } catch (e) {
      throw erro(500, `Não apaguei nada: não consegui fazer a cópia de segurança antes (${e.message}).`);
    }
    const tabelas = modo === 'movimento' ? MOVIMENTO : [...MOVIMENTO, ...CADASTROS];
    // As tabelas são esvaziadas inteiras: a ordem das chaves estrangeiras não importa aqui.
    db.exec('PRAGMA foreign_keys = OFF');
    try {
    transacao(db, () => {
      if (modo === 'movimento') {
        // Peças que estavam em condicional ou reserva aberta voltam para o estoque.
        db.prepare(`UPDATE produtos SET estoque = estoque + (SELECT COALESCE(SUM(ci.quantidade), 0)
          FROM condicional_itens ci JOIN condicionais c ON c.id = ci.condicional_id WHERE c.status = 'aberta' AND ci.produto_id = produtos.id)`).run();
        db.prepare(`UPDATE produtos SET estoque = estoque + (SELECT COALESCE(SUM(ri.quantidade), 0)
          FROM reserva_itens ri JOIN reservas r ON r.id = ri.reserva_id WHERE r.status = 'aberta' AND ri.produto_id = produtos.id)`).run();
      }
      for (const t of tabelas) db.prepare(`DELETE FROM ${t}`).run();
      if (modo === 'movimento') {
        // Excluídos que só ficavam por causa das vendas antigas agora podem sair de vez.
        db.prepare('DELETE FROM produto_fotos WHERE produto_id IN (SELECT id FROM produtos WHERE excluido_em IS NOT NULL)').run();
        db.prepare('DELETE FROM produtos WHERE excluido_em IS NOT NULL').run();
        db.prepare('DELETE FROM cliente_fotos WHERE cliente_id IN (SELECT id FROM clientes WHERE excluido_em IS NOT NULL)').run();
        db.prepare('DELETE FROM clientes WHERE excluido_em IS NOT NULL').run();
      }
      if (modo === 'fabrica') {
        db.prepare('DELETE FROM sessoes').run();
        db.prepare('DELETE FROM usuarios').run();
        db.prepare('DELETE FROM config').run();
        const ins = db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?)');
        for (const [k, v] of Object.entries(CONFIG_PADRAO)) ins.run(k, v);
      }
      // Numeração (venda nº 1, caixa nº 1…) recomeça.
      const zerarSeq = db.prepare('DELETE FROM sqlite_sequence WHERE name = ?');
      for (const t of [...tabelas, ...(modo === 'fabrica' ? ['usuarios'] : [])]) zerarSeq.run(t);
    });
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
    try { db.exec('VACUUM'); } catch { /* só para diminuir o arquivo */ }
    if (modo === 'fabrica' && definirSessao) definirSessao(null); // ninguém mais logado: volta ao primeiro acesso
    return { ok: true, modo, copia, fabrica: modo === 'fabrica' };
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

  /**
   * Impressora de cupom: a escolhida em Configurações ou, se ainda não escolheram,
   * a térmica encontrada no Windows (fica salva para as próximas vezes).
   */
  const imprimirCupom = async (cfg, dados, nome) => {
    let nomeImpressora = cfg.impressora_cupom;
    if (!nomeImpressora) {
      try {
        nomeImpressora = await impressora.detectarImpressoraCupom();
      } catch { /* sem lista de impressoras: cai no erro de "nenhuma impressora" */ }
      if (nomeImpressora) salvarConfig({ impressora_cupom: nomeImpressora });
    }
    return imprimir(nomeImpressora, dados, nome);
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
      return imprimirCupom(cfg, documentos.cupomTroca(venda, cfg).bytes(), `troca-${venda.id}`);
    }
    const vias = Math.max(1, Number(cfg.cupom_vias) || 1);
    const nomes = ['Via do cliente', 'Via da loja'];
    const pagouDinheiro = venda.pagamentos.some((p) => p.forma === 'dinheiro');
    const partes = [];
    // Crediário também sai só na via da cliente (a não ser que a loja tenha escolhido 2 vias).
    const total = vias;
    for (let i = 0; i < total; i++) {
      partes.push(documentos.cupomVenda(venda, cfg, {
        via: total > 1 ? nomes[i] || `Via ${i + 1}` : '',
        abrirGaveta: i === 0 && corpo.gaveta !== false && pagouDinheiro && cfg.gaveta_abrir === '1',
      }).bytes());
    }
    return imprimirCupom(cfg, Buffer.concat(partes), `venda-${venda.id}`);
  });

  rota('POST', '/api/imprimir/caixa/:id', ({ params }) => {
    const cfg = config();
    return imprimirCupom(cfg, documentos.fechamentoCaixa(resumoCaixa(params.id), cfg).bytes(), `caixa-${params.id}`);
  });

  rota('POST', '/api/imprimir/recebimento/:id', ({ params }) => {
    const cfg = config();
    const rec = crediario.buscarRecebimento(params.id);
    return imprimirCupom(cfg, documentos.recebimentoCrediario(rec, cfg).bytes(), `recibo-${rec.id}`);
  });

  rota('POST', '/api/imprimir/troca/:id', ({ params }) => {
    const cfg = config();
    const t = trocas.buscarTroca(params.id);
    return imprimirCupom(cfg, documentos.valeTroca(t, cfg).bytes(), `troca-${t.id}`);
  });

  rota('POST', '/api/imprimir/condicional/:id', ({ params }) => {
    const cfg = config();
    const c = condicional.buscar(params.id);
    // Só a via da cliente.
    return imprimirCupom(cfg, documentos.condicional(c, cfg, 'Via da cliente').bytes(), `condicional-${c.id}`);
  });

  rota('POST', '/api/imprimir/reserva/:id', ({ params }) => {
    const cfg = config();
    const r = reservas.buscar(params.id);
    // Só a via da cliente.
    return imprimirCupom(cfg, documentos.reserva(r, cfg, 'Via da cliente').bytes(), `reserva-${r.id}`);
  });

  rota('POST', '/api/imprimir/gaveta', () => {
    const cfg = config();
    return imprimirCupom(cfg, Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]), 'gaveta');
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

  /** Etiqueta personalizada: já vem desenhada pelo editor, em pontos pretos e brancos. */
  rota('POST', '/api/imprimir/etiquetas-imagem', ({ corpo }) => {
    const cfg = config();
    const lista = corpo && Array.isArray(corpo.imagens) ? corpo.imagens : [];
    if (!lista.length || lista.length > 1000) throw erro(400, 'Nenhuma etiqueta para imprimir.');
    let total = 0;
    const imagens = lista.map((im) => {
      const l = inteiro(im.l, 'largura', { min: 1 });
      const h = inteiro(im.h, 'altura', { min: 1 });
      const copias = inteiro(im.copias, 'quantidade', { min: 1 });
      if (l > 250 || h > 2400) throw erro(400, 'Etiqueta grande demais.');
      const bits = Buffer.from(String(im.d || ''), 'base64');
      if (bits.length !== l * h) throw erro(400, 'Desenho da etiqueta inválido.');
      total += copias;
      return { l, h, bits, copias };
    });
    if (total > 2000) throw erro(400, 'Muitas etiquetas de uma vez (máximo 2000).');
    return imprimir(cfg.impressora_etiqueta, gerarEtiquetasImagem(imagens, cfg), 'etiquetas');
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
    return imprimirCupom(cfg, documentos.teste(cfg).bytes(), 'teste-cupom');
  });

  /**
   * Resolve uma requisição; devolve { status, corpo, sessao } ou null se a rota não existir.
   * `sessao` vem preenchido (token, ou null para apagar) quando o cookie precisa mudar.
   */
  const auditoria = instalarAuditoria({ db, rota, texto, planos, config, buscarVenda, buscarProduto });
  const atualizacao = instalarAtualizacao({
    rota, erro, config, salvarConfig,
    pasta: opcoes.pastaAtualizacoes || path.join(os.tmpdir(), 'clara-styllus-atualizacoes'),
  });

  const semCusto = (x) => {
    if (Array.isArray(x)) return x.map(semCusto);
    if (x && typeof x === 'object' && 'preco_custo' in x) {
      const { preco_custo: _c, ...resto } = x;
      return resto;
    }
    return x;
  };

  function despachar(metodo, caminho, query, corpo, token) {
    for (const r of rotas) {
      if (r.metodo !== metodo) continue;
      const m = caminho.match(r.re);
      if (!m) continue;
      const params = {};
      try {
        r.nomes.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
      } catch {
        return { status: 400, corpo: { erro: 'Endereço inválido.' } };
      }
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
        const auditar = metodo === 'GET' ? null : auditoria.preparar(metodo, r.padrao, ctx);
        const resultado = r.fn(ctx);
        if (resultado && typeof resultado.then === 'function') {
          // Rota assíncrona (impressão): devolve uma Promise com a mesma forma de resposta.
          return resultado.then(
            (c) => { if (auditar) auditar(c); return { ...resposta, corpo: c }; },
            (e) => {
              if (e instanceof ErroHttp) return { status: e.status, corpo: { erro: e.message } };
              throw e;
            }
          );
        }
        // Preço de custo (e a margem da loja) só para o administrador.
        resposta.corpo = metodo === 'GET' && ctx.usuario && ctx.usuario.perfil !== 'admin' && r.padrao.startsWith('/api/produtos')
          ? semCusto(resultado) : resultado;
        if (auditar) auditar(resultado);
        return resposta;
      } catch (e) {
        if (e instanceof ErroHttp) return { status: e.status, corpo: { erro: e.message } };
        throw e;
      }
    }
    return null;
  }
  despachar.backup = backup; // usado pelo servidor para o backup diário
  despachar.usuarioDoToken = usuarioDoToken; // o envio do instalador confere o login antes de receber o arquivo
  despachar.atualizacao = atualizacao; // verificação periódica de versão nova
  return despachar;
}

module.exports = { criarApi, FORMAS_PAGAMENTO, arredondarPreco };
