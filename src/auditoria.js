'use strict';

/**
 * Histórico de ações: registra quem fez o quê (cancelou ou excluiu venda, deu desconto,
 * mexeu no estoque, abriu a gaveta, mudou preço…). É montado no despachante da API:
 * cada rota que altera dados tem aqui uma descrição; as que não estão na lista não são registradas.
 */

const brl = (c) => 'R$ ' + ((Number(c) || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nomeProd = (p) => [p?.nome, p?.tamanho, p?.cor].filter(Boolean).join(' ');
const FORMAS = { dinheiro: 'dinheiro', pix: 'PIX', debito: 'débito', credito: 'crédito', crediario: 'crediário', vale: 'vale-troca', outro: 'outro' };

// Nomes amigáveis das configurações mais comuns (as demais aparecem pelo nome técnico).
const NOMES_CONFIG = {
  atualizacao_token: 'token de atualização', atualizacao_auto: 'atualização automática', boas_vindas_ok: 'assistente de boas-vindas',
  loja_nome: 'nome da loja', loja_cnpj: 'CNPJ', impressora_cupom: 'impressora de cupom', impressora_etiqueta: 'impressora de etiqueta',
  impressao_automatica: 'impressão automática', desconto_maximo: 'desconto máximo', meta_mensal: 'meta do mês',
  markup_padrao: 'markup', crediario_max_parcelas: 'parcelas do crediário', backup_pasta: 'pasta de backup',
  taxa_debito: 'taxa do débito', taxa_credito_vista: 'taxa do crédito', taxa_pix: 'taxa do PIX', vale_validade_dias: 'validade do vale',
};

function instalarAuditoria({ db, rota, texto, planos, config, buscarVenda, buscarProduto }) {
  const ins = db.prepare(
    'INSERT INTO auditoria (usuario_id, usuario, tipo, acao, descricao, valor, importante) VALUES (?,?,?,?,?,?,?)'
  );
  function registrar(usuario, { tipo, acao, descricao = null, valor = null, importante = false }) {
    ins.run(usuario?.id ?? null, usuario?.nome ?? null, tipo, acao, descricao, valor, importante ? 1 : 0);
  }

  const seguro = (fn) => { try { return fn(); } catch { return null; } };

  /**
   * Para cada rota: `antes` (opcional) lê o estado anterior; `depois` devolve o registro
   * (ou null para não registrar). ctx tem params, corpo e usuario.
   */
  const REGRAS = {
    'POST /api/primeiro-acesso': { depois: (c, r) => ({ tipo: 'acesso', acao: 'Primeiro acesso', descricao: `Administrador(a) ${r.usuario?.nome} criado(a)`, usuario: r.usuario }) },
    'POST /api/login': { depois: (c, r) => ({ tipo: 'acesso', acao: 'Entrou no sistema', usuario: r.usuario }) },
    'POST /api/minha-senha': { depois: () => ({ tipo: 'acesso', acao: 'Trocou a própria senha' }) },
    'POST /api/usuarios': { depois: (c, r) => ({ tipo: 'usuario', acao: 'Cadastrou usuário', descricao: `${r.nome} (${r.perfil === 'admin' ? 'administrador(a)' : 'vendedor(a)'})`, importante: r.perfil === 'admin' }) },
    'PUT /api/usuarios/:id': {
      antes: (c) => db.prepare('SELECT nome, perfil, ativo FROM usuarios WHERE id = ?').get(c.params.id),
      depois: (c, r, a) => {
        const mud = [];
        if (c.corpo.senha) mud.push('trocou a senha');
        if (a && c.corpo.perfil && c.corpo.perfil !== a.perfil) mud.push(`perfil: ${c.corpo.perfil === 'admin' ? 'administrador(a)' : 'vendedor(a)'}`);
        if (a && 'ativo' in c.corpo && !!c.corpo.ativo !== !!a.ativo) mud.push(c.corpo.ativo ? 'reativou' : 'desativou');
        return { tipo: 'usuario', acao: 'Alterou usuário', descricao: `${r.nome || a?.nome}${mud.length ? ' — ' + mud.join(', ') : ''}`, importante: mud.length > 0 };
      },
    },
    'PUT /api/config': {
      antes: () => config(),
      depois: (c, r, a) => {
        const mudou = Object.keys(c.corpo).filter((k) => !k.startsWith('backup_ultimo') && String(c.corpo[k] ?? '') !== String(a?.[k] ?? ''));
        if (!mudou.length) return null;
        const lista = mudou.map((k) => NOMES_CONFIG[k] || k.replace(/_/g, ' '));
        return { tipo: 'config', acao: 'Alterou configurações', descricao: lista.slice(0, 8).join(', ') + (lista.length > 8 ? ` e mais ${lista.length - 8}` : '') };
      },
    },
    'POST /api/produtos': { depois: (c, r) => ({ tipo: 'produto', acao: 'Cadastrou produto', descricao: `${nomeProd(r)} · ${brl(r.preco_venda)} · estoque ${r.estoque}` }) },
    'POST /api/produtos/grade': {
      depois: (c, r) => {
        const lista = Array.isArray(r) ? r : [];
        const pecas = lista.reduce((a, p) => a + (p.estoque || 0), 0);
        return { tipo: 'produto', acao: 'Cadastrou produto', descricao: `${c.corpo.nome} · ${lista.length} variação(ões) · ${pecas} peça(s) · ${brl(c.corpo.preco_venda)}` };
      },
    },
    'POST /api/produtos/entrada-lote': {
      depois: (c) => {
        const itens = Array.isArray(c.corpo.itens) ? c.corpo.itens : [];
        const pecas = itens.reduce((a, x) => a + (Number(x.quantidade) || 0), 0);
        return { tipo: 'estoque', acao: 'Entrada de mercadoria', descricao: `${pecas} peça(s) em ${itens.length} produto(s)` };
      },
    },
    'PUT /api/produtos/:id': {
      antes: (c) => seguro(() => buscarProduto(c.params.id)),
      depois: (c, r, a) => {
        if (!a) return null;
        const mud = [];
        if (r.preco_venda !== a.preco_venda) mud.push(`preço ${brl(a.preco_venda)} → ${brl(r.preco_venda)}`);
        if (r.preco_custo !== a.preco_custo) mud.push(`custo ${brl(a.preco_custo)} → ${brl(r.preco_custo)}`);
        if ((r.preco_anterior || 0) !== (a.preco_anterior || 0)) mud.push(r.preco_anterior ? `liquidação "De" ${brl(r.preco_anterior)}` : 'tirou da liquidação');
        if (!!r.ativo !== !!a.ativo) mud.push(r.ativo ? 'reativou' : 'desativou');
        if (r.codigo !== a.codigo) mud.push(`código ${a.codigo} → ${r.codigo}`);
        if (r.nome !== a.nome) mud.push(`nome "${a.nome}" → "${r.nome}"`);
        return { tipo: 'produto', acao: 'Editou produto', descricao: `${nomeProd(r)}${mud.length ? ' — ' + mud.join(', ') : ''}`, importante: r.preco_venda < a.preco_venda };
      },
    },
    'POST /api/produtos/liquidacao': { depois: (c) => ({ tipo: 'produto', acao: 'Aplicou liquidação', descricao: `${c.corpo.percentual}% em ${(c.corpo.ids || []).length} produto(s)` }) },
    'POST /api/produtos/liquidacao/encerrar': { depois: (c) => ({ tipo: 'produto', acao: 'Encerrou liquidação', descricao: `${(c.corpo.ids || []).length} produto(s)` }) },
    'DELETE /api/produtos/:id': {
      antes: (c) => seguro(() => buscarProduto(c.params.id)),
      depois: (c, r, a) => ({ tipo: 'produto', acao: 'Desativou produto', descricao: nomeProd(a) }),
    },
    'POST /api/produtos/:id/estoque': {
      antes: (c) => seguro(() => buscarProduto(c.params.id)),
      depois: (c, r, a) => {
        const tipos = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste' };
        return {
          tipo: 'estoque', acao: `${tipos[c.corpo.tipo] || 'Movimento'} de estoque`,
          descricao: `${nomeProd(r)}: ${a?.estoque} → ${r.estoque}${c.corpo.motivo ? ` · ${c.corpo.motivo}` : ''}`,
          importante: c.corpo.tipo !== 'entrada',
        };
      },
    },
    'POST /api/clientes': { depois: (c, r) => ({ tipo: 'cliente', acao: 'Cadastrou cliente', descricao: r.nome }) },
    'PUT /api/clientes/:id': { depois: (c, r) => ({ tipo: 'cliente', acao: 'Editou cliente', descricao: r.nome }) },
    'POST /api/caixa/abrir': { depois: (c, r) => ({ tipo: 'caixa', acao: 'Abriu o caixa', descricao: `Caixa nº ${r.caixa.id} · troco inicial ${brl(r.caixa.valor_abertura)}`, valor: r.caixa.valor_abertura }) },
    'POST /api/caixa/movimento': {
      depois: (c) => ({
        tipo: 'caixa', acao: c.corpo.tipo === 'sangria' ? 'Sangria' : 'Suprimento',
        descricao: `${brl(c.corpo.valor)}${c.corpo.motivo ? ' · ' + c.corpo.motivo : ''}`, valor: Number(c.corpo.valor), importante: c.corpo.tipo === 'sangria',
      }),
    },
    'POST /api/caixa/fechar': {
      depois: (c, r) => ({
        tipo: 'caixa', acao: 'Fechou o caixa',
        descricao: `Caixa nº ${r.caixa.id} · contado ${brl(r.caixa.valor_informado)} · esperado ${brl(r.dinheiro_esperado)}${r.diferenca ? ` · diferença ${r.diferenca > 0 ? '+' : '−'}${brl(Math.abs(r.diferenca))}` : ' · sem diferença'}`,
        valor: r.diferenca, importante: !!r.diferenca,
      }),
    },
    'POST /api/vendas': {
      depois: (c, r) => {
        const bruto = r.subtotal || 0; // subtotal = soma das peças antes dos descontos
        const desc = r.desconto || 0;   // descontos por peça + desconto na venda
        if (!desc) return null;
        const pct = bruto ? Math.round((desc / bruto) * 100) : 0;
        return { tipo: 'venda', acao: 'Deu desconto', descricao: `Venda nº ${r.id} · desconto de ${brl(desc)} (${pct}%) · total ${brl(r.total)}`, valor: desc, importante: pct >= 15 };
      },
    },
    'POST /api/vendas/:id/cancelar': { depois: (c, r) => ({ tipo: 'venda', acao: 'Cancelou venda', descricao: `Venda nº ${r.id} de ${brl(r.total)} · motivo: ${c.corpo.motivo}`, valor: r.total, importante: true }) },
    'DELETE /api/vendas/:id': {
      antes: (c) => seguro(() => buscarVenda(c.params.id)),
      depois: (c, r, a) => ({
        tipo: 'venda', acao: 'Excluiu venda',
        descricao: a ? `Venda nº ${a.id} de ${brl(a.total)} (${a.criado_em.slice(8, 10)}/${a.criado_em.slice(5, 7)}${a.cliente_nome ? ', ' + a.cliente_nome : ''}${a.status === 'cancelada' ? ', já cancelada' : ''})` : `Venda nº ${c.params.id}`,
        valor: a?.total, importante: true,
      }),
    },
    'POST /api/vendas/:id/troca': { depois: (c, r) => ({ tipo: 'troca', acao: 'Fez troca', descricao: `Venda nº ${r.venda_id} · ${(r.itens || []).length} peça(s)${r.vale ? ` · vale ${r.vale.codigo}` : ''} · ${brl(r.valor)}`, valor: r.valor }) },
    'POST /api/vales/:codigo/cancelar': { depois: (c) => ({ tipo: 'troca', acao: 'Cancelou vale-troca', descricao: c.params.codigo, importante: true }) },
    'POST /api/condicionais': { depois: (c, r) => ({ tipo: 'condicional', acao: 'Abriu condicional', descricao: `Nº ${r.id} · ${r.cliente_nome} · ${r.pecas} peça(s) · ${brl(r.valor)}` }) },
    'POST /api/condicionais/:id/fechar': { depois: (c, r) => ({ tipo: 'condicional', acao: 'Fechou condicional', descricao: `Nº ${r.condicional?.id} · ${r.condicional?.cliente_nome} · ficou com ${(r.ficou || []).reduce((a, x) => a + x.quantidade, 0)} peça(s)` }) },
    'POST /api/condicionais/:id/cancelar': { depois: (c, r) => ({ tipo: 'condicional', acao: 'Cancelou condicional', descricao: `Nº ${r.id} · ${r.cliente_nome}` }) },
    'POST /api/crediario/clientes/:id/receber': { depois: (c, r) => ({ tipo: 'crediario', acao: 'Recebeu crediário', descricao: `${r.cliente_nome} · ${brl(r.valor)} no ${FORMAS[r.forma] || r.forma}`, valor: r.valor }) },
    'POST /api/crediario/recebimentos/:id/estornar': { depois: (c, r) => ({ tipo: 'crediario', acao: 'Estornou recebimento', descricao: `${r.cliente_nome} · ${brl(r.valor)}`, valor: r.valor, importante: true }) },
    'POST /api/crediario/clientes/:id/debito': {
      antes: (c) => db.prepare('SELECT nome FROM clientes WHERE id = ?').get(c.params.id),
      depois: (c, r, a) => ({ tipo: 'crediario', acao: 'Lançou débito manual', descricao: `${a?.nome || ''} · ${brl(c.corpo.valor)}${c.corpo.descricao ? ' · ' + c.corpo.descricao : ''}`, valor: Number(c.corpo.valor) }),
    },
    'POST /api/crediario/parcelas/:id/cancelar': { depois: (c) => ({ tipo: 'crediario', acao: 'Cancelou parcela', descricao: `Parcela nº ${c.params.id}`, importante: true }) },
    'POST /api/inventarios': { depois: (c, r) => ({ tipo: 'estoque', acao: 'Começou inventário', descricao: `Nº ${r.id}${r.descricao ? ' · ' + r.descricao : ''}` }) },
    'POST /api/inventarios/:id/finalizar': { depois: (c, r) => ({ tipo: 'estoque', acao: 'Finalizou inventário', descricao: `Nº ${r.id} · ${r.ajustados} produto(s) ajustado(s) · falta ${brl(r.valor_falta)} · sobra ${brl(r.valor_sobra)}`, importante: r.valor_falta > 0 }) },
    'POST /api/inventarios/:id/cancelar': { depois: (c, r) => ({ tipo: 'estoque', acao: 'Cancelou inventário', descricao: `Nº ${r.id}` }) },
    'POST /api/despesas': { depois: (c) => ({ tipo: 'despesa', acao: 'Lançou despesa', descricao: `${c.corpo.descricao} · ${brl(c.corpo.valor)}`, valor: Number(c.corpo.valor) }) },
    'DELETE /api/despesas/:id': {
      antes: (c) => db.prepare('SELECT descricao, valor FROM despesas WHERE id = ?').get(c.params.id),
      depois: (c, r, a) => ({ tipo: 'despesa', acao: 'Apagou despesa', descricao: a ? `${a.descricao} · ${brl(a.valor)}` : `Nº ${c.params.id}` }),
    },
    'POST /api/atualizacao/instalar': { depois: (c, r) => ({ tipo: 'config', acao: 'Atualizou o sistema', descricao: `Para a versão ${r.versao}`, importante: true }) },
    'POST /api/atualizacao/arquivo': { depois: (c, r) => ({ tipo: 'config', acao: 'Atualizou o sistema', descricao: `Para a versão ${r.versao} (arquivo)`, importante: true }) },
    'POST /api/backup/agora': { depois: () => ({ tipo: 'config', acao: 'Fez backup manual' }) },
    'POST /api/imprimir/gaveta': { depois: () => ({ tipo: 'caixa', acao: 'Abriu a gaveta', descricao: 'Sem venda (botão Gaveta)', importante: true }) },
  };

  /** Chamado pelo despachante: devolve uma função que registra depois que a rota deu certo. */
  function preparar(metodo, padrao, ctx) {
    const regra = REGRAS[`${metodo} ${padrao}`];
    if (!regra) return null;
    const antes = regra.antes ? seguro(() => regra.antes(ctx)) : undefined;
    return (resultado) => {
      try {
        const reg = regra.depois(ctx, resultado || {}, antes);
        if (reg) registrar(reg.usuario || ctx.usuario, reg);
      } catch (e) {
        console.error('Histórico: não consegui registrar', metodo, padrao, e.message);
      }
    };
  }

  /** Tentativa de entrar com senha errada (registrada mesmo sem usuário logado). */
  function loginFalhou(login) {
    registrar(null, { tipo: 'acesso', acao: 'Senha errada', descricao: `Usuário "${String(login || '').slice(0, 60)}"`, importante: true });
  }

  rota('GET', '/api/auditoria', ({ query }) => {
    const hoje = new Date().toLocaleDateString('sv-SE');
    const de = texto(query.get('de'), 10) || hoje;
    const ate = texto(query.get('ate'), 10) || hoje;
    const where = ['date(criado_em) BETWEEN ? AND ?'];
    const args = [de, ate];
    const tipo = texto(query.get('tipo'), 30);
    if (tipo) where.push('tipo = ?'), args.push(tipo);
    const usuario = texto(query.get('usuario'), 100);
    if (usuario) where.push('usuario = ?'), args.push(usuario);
    if (query.get('importantes') === '1') where.push('importante = 1');
    const q = texto(query.get('q'), 100);
    if (q) where.push("(acao || ' ' || COALESCE(descricao,'') || ' ' || COALESCE(usuario,'')) LIKE ?"), args.push(`%${q}%`);
    const itens = planos(db.prepare(`SELECT * FROM auditoria WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 1000`).all(...args));
    const usuarios = db.prepare('SELECT DISTINCT usuario FROM auditoria WHERE usuario IS NOT NULL ORDER BY usuario').all().map((u) => u.usuario);
    return { itens, usuarios };
  }, 'admin');

  return { registrar, preparar, loginFalhou };
}

module.exports = { instalarAuditoria };
