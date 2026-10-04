'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL DEFAULT 'vendedor' CHECK (perfil IN ('admin','vendedor')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  expira_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  referencia TEXT,
  nome TEXT NOT NULL,
  categoria TEXT,
  marca TEXT,
  tamanho TEXT,
  cor TEXT,
  preco_custo INTEGER NOT NULL DEFAULT 0,
  preco_venda INTEGER NOT NULL DEFAULT 0,
  estoque INTEGER NOT NULL DEFAULT 0,
  estoque_minimo INTEGER NOT NULL DEFAULT 0,
  ncm TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos(nome);
CREATE INDEX IF NOT EXISTS idx_produtos_ref ON produtos(referencia);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cpf TEXT,
  telefone TEXT,
  email TEXT,
  aniversario TEXT,
  observacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome);
CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf);

CREATE TABLE IF NOT EXISTS caixas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operador TEXT,
  aberto_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  valor_abertura INTEGER NOT NULL DEFAULT 0,
  fechado_em TEXT,
  valor_informado INTEGER,
  observacao TEXT
);

CREATE TABLE IF NOT EXISTS caixa_movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caixa_id INTEGER NOT NULL REFERENCES caixas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('sangria','suprimento')),
  valor INTEGER NOT NULL,
  motivo TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS vendas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caixa_id INTEGER NOT NULL REFERENCES caixas(id),
  cliente_id INTEGER REFERENCES clientes(id),
  cpf_nota TEXT,
  vendedor TEXT,
  subtotal INTEGER NOT NULL,
  desconto INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  troco INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'concluida' CHECK (status IN ('concluida','cancelada')),
  motivo_cancelamento TEXT,
  cancelada_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(criado_em);

CREATE TABLE IF NOT EXISTS venda_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id INTEGER NOT NULL REFERENCES vendas(id),
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  tamanho TEXT,
  cor TEXT,
  quantidade INTEGER NOT NULL,
  preco_unitario INTEGER NOT NULL,
  desconto INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_itens_venda ON venda_itens(venda_id);

CREATE TABLE IF NOT EXISTS venda_pagamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id INTEGER NOT NULL REFERENCES vendas(id),
  forma TEXT NOT NULL,
  valor INTEGER NOT NULL,
  parcelas INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_pag_venda ON venda_pagamentos(venda_id);

CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  tipo TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  motivo TEXT,
  venda_id INTEGER REFERENCES vendas(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_estmov_prod ON estoque_movimentos(produto_id);

-- Crediário: cada compra fiada vira parcelas; recebimentos abatem as parcelas mais antigas.
CREATE TABLE IF NOT EXISTS crediario_parcelas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  venda_id INTEGER REFERENCES vendas(id),
  descricao TEXT,
  numero INTEGER NOT NULL DEFAULT 1,
  total_parcelas INTEGER NOT NULL DEFAULT 1,
  valor INTEGER NOT NULL,
  valor_pago INTEGER NOT NULL DEFAULT 0,
  vencimento TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','cancelada')),
  pago_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_parc_cliente ON crediario_parcelas(cliente_id, status);
CREATE INDEX IF NOT EXISTS idx_parc_venda ON crediario_parcelas(venda_id);

CREATE TABLE IF NOT EXISTS crediario_recebimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  caixa_id INTEGER NOT NULL REFERENCES caixas(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  operador TEXT,
  valor INTEGER NOT NULL,
  forma TEXT NOT NULL,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','estornado')),
  estornado_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_receb_cliente ON crediario_recebimentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_receb_caixa ON crediario_recebimentos(caixa_id);

CREATE TABLE IF NOT EXISTS crediario_recebimento_parcelas (
  recebimento_id INTEGER NOT NULL REFERENCES crediario_recebimentos(id),
  parcela_id INTEGER NOT NULL REFERENCES crediario_parcelas(id),
  valor INTEGER NOT NULL
);
`;

const CONFIG_PADRAO = {
  loja_nome: 'Clara Styllus',
  loja_razao_social: '',
  loja_cnpj: '',
  loja_ie: '',
  loja_endereco: '',
  loja_cidade: '',
  loja_telefone: '',
  loja_instagram: '',
  cupom_mensagem: 'Obrigada pela preferência! Trocas em até 30 dias com etiqueta e este comprovante.',
  cupom_largura_mm: '80',
  cupom_vias: '1',
  etiqueta_largura_mm: '40',
  etiqueta_altura_mm: '30',
  etiqueta_colunas: '1',
  etiqueta_margem_mm: '2',
  etiqueta_mostrar_loja: '1',
  etiqueta_mostrar_preco: '1',
  estoque_negativo: '0',
  desconto_maximo_pct: '30',
  impressao_automatica: '1',
  // Impressão direta (sem o diálogo do navegador)
  impressao_cupom_modo: 'direta',
  impressora_cupom: '',
  cupom_colunas: '48',
  cupom_acentos: 'cp850',
  cupom_corte: '1',
  gaveta_abrir: '1',
  impressao_etiqueta_modo: 'zpl',
  impressora_etiqueta: '',
  etiqueta_dpi: '203',
  etiqueta_espaco_mm: '2',
  etiqueta_gap_mm: '3',
  // Crediário
  crediario_dias_primeira: '30',
  crediario_max_parcelas: '6',
  crediario_bloquear_atraso: '1',
  crediario_limite_padrao: '',
  // Painel e tela de venda
  meta_mensal: '',
  som_bipe: '1',
};

function abrirBanco(arquivo) {
  if (arquivo !== ':memory:') {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  }
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  migrar(db);

  const inserir = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
  for (const [chave, valor] of Object.entries(CONFIG_PADRAO)) inserir.run(chave, valor);

  return db;
}

/** Ajustes em bancos criados por versões anteriores. */
function migrar(db) {
  const colunas = (tabela) => db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  if (!colunas('vendas').includes('usuario_id')) {
    db.exec('ALTER TABLE vendas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)');
  }
  if (!colunas('produtos').includes('foto_versao')) {
    db.exec('ALTER TABLE produtos ADD COLUMN foto_versao INTEGER');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS produto_fotos (
    produto_id INTEGER PRIMARY KEY REFERENCES produtos(id),
    tipo TEXT NOT NULL,
    dados BLOB NOT NULL
  )`);
  if (!colunas('clientes').includes('limite_credito')) {
    db.exec('ALTER TABLE clientes ADD COLUMN limite_credito INTEGER');
  }
  if (!colunas('caixas').includes('usuario_id')) {
    db.exec('ALTER TABLE caixas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)');
  }
  db.exec("DELETE FROM sessoes WHERE expira_em < datetime('now','localtime')");
}

/** Executa fn dentro de uma transação; desfaz tudo se lançar erro. */
function transacao(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { abrirBanco, transacao, CONFIG_PADRAO };
