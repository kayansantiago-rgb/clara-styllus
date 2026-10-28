'use strict';

/**
 * Lista de espera: a cliente pede uma peça (ou tamanho/cor) que acabou.
 * Quando a peça volta ao estoque, o pedido aparece como "Chegou!" para a loja avisar pelo WhatsApp.
 *
 * O pedido pode estar ligado a um produto do cadastro (aviso exato) ou ser só um texto
 * ("vestido midi floral", tamanho M): nesse caso o sistema procura no estoque algo parecido.
 */

const STATUS = ['aguardando', 'avisada', 'atendida', 'cancelada'];

function instalarEspera({ db, rota, erro, inteiro, texto, plano, planos }) {
  const BASE = `SELECT e.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.cpf AS cliente_cpf, c.foto_versao AS cliente_foto,
      p.nome AS produto_nome, p.tamanho AS produto_tamanho, p.cor AS produto_cor, p.estoque AS produto_estoque,
      p.preco_venda AS produto_preco, p.foto_versao AS produto_foto_versao, p.codigo AS produto_codigo
    FROM espera e JOIN clientes c ON c.id = e.cliente_id LEFT JOIN produtos p ON p.id = e.produto_id`;

  /** Peça do estoque que atende um pedido feito só por texto (nome + tamanho/cor). */
  const procurarParecido = db.prepare(
    `SELECT id, nome, tamanho, cor, estoque, preco_venda, foto_versao, codigo FROM produtos
     WHERE ativo = 1 AND servico = 0 AND estoque > 0 AND nome LIKE ?
       AND (? = '' OR tamanho = ? COLLATE NOCASE) AND (? = '' OR cor LIKE ?)
     ORDER BY estoque DESC LIMIT 1`
  );

  function completar(e) {
    e = plano(e);
    e.chegou = null;
    if (e.status !== 'aguardando' && e.status !== 'avisada') return e;
    if (e.produto_id) {
      if (e.produto_estoque > 0) {
        e.chegou = {
          id: e.produto_id, nome: e.produto_nome, tamanho: e.produto_tamanho, cor: e.produto_cor,
          estoque: e.produto_estoque, preco_venda: e.produto_preco, foto_versao: e.produto_foto_versao, codigo: e.produto_codigo,
        };
      }
    } else if (e.descricao) {
      const t = e.tamanho || '';
      const c = e.cor || '';
      e.chegou = plano(procurarParecido.get(`%${e.descricao.trim()}%`, t, t, c, `%${c}%`)) || null;
    }
    return e;
  }

  const buscar = (id) => {
    const e = db.prepare(`${BASE} WHERE e.id = ?`).get(id);
    if (!e) throw erro(404, 'Pedido da lista de espera não encontrado.');
    return completar(e);
  };

  rota('GET', '/api/espera', ({ query }) => {
    const status = texto(query.get('status')) || 'abertos';
    const cliente = Number(query.get('cliente_id')) || 0;
    const filtro = status === 'abertos' ? `e.status IN ('aguardando','avisada')`
      : status === 'todos' ? '1' : 'e.status = ?';
    const args = STATUS.includes(status) ? [status] : [];
    const rows = db.prepare(`${BASE} WHERE ${filtro} ${cliente ? 'AND e.cliente_id = ?' : ''}
      ORDER BY e.criado_em DESC LIMIT 500`).all(...args, ...(cliente ? [cliente] : []));
    return rows.map(completar);
  });

  /** Quantos pedidos abertos já têm a peça no estoque (bolinha no menu e aviso no Início). */
  rota('GET', '/api/espera/resumo', () => {
    const abertos = db.prepare(`${BASE} WHERE e.status IN ('aguardando','avisada')`).all().map(completar);
    return {
      abertos: abertos.length,
      chegaram: abertos.filter((e) => e.chegou && e.status === 'aguardando').length,
      nomes: abertos.filter((e) => e.chegou && e.status === 'aguardando').slice(0, 3).map((e) => e.cliente_nome),
    };
  });

  rota('POST', '/api/espera', ({ corpo, usuario }) => {
    const clienteId = inteiro(corpo.cliente_id, 'cliente', { min: 1 });
    if (!db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(clienteId)) throw erro(400, 'Cliente não encontrada.');
    let produtoId = corpo.produto_id ? inteiro(corpo.produto_id, 'produto', { min: 1 }) : null;
    if (produtoId && !db.prepare('SELECT 1 FROM produtos WHERE id = ?').get(produtoId)) throw erro(400, 'Produto não encontrado.');
    const descricao = texto(corpo.descricao, 120);
    if (!produtoId && !descricao) throw erro(400, 'Escolha a peça ou descreva o que a cliente quer.');
    const r = db
      .prepare('INSERT INTO espera (cliente_id, produto_id, descricao, tamanho, cor, observacao, usuario) VALUES (?,?,?,?,?,?,?)')
      .run(clienteId, produtoId, descricao, texto(corpo.tamanho, 20), texto(corpo.cor, 40), texto(corpo.observacao, 300), usuario.nome);
    return buscar(Number(r.lastInsertRowid));
  });

  rota('POST', '/api/espera/:id/status', ({ params, corpo }) => {
    buscar(params.id);
    const status = String(corpo.status || '');
    if (!STATUS.includes(status)) throw erro(400, 'Situação inválida.');
    db.prepare(`UPDATE espera SET status = ?, avisado_em = CASE WHEN ? = 'avisada' THEN datetime('now','localtime') ELSE avisado_em END WHERE id = ?`)
      .run(status, status, params.id);
    return buscar(params.id);
  });

  return { buscar };
}

module.exports = { instalarEspera };
