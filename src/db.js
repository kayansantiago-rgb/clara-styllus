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
  som_volume: 'medio',
  cupom_logo: '', // logo em 1 bit para a térmica (JSON { l, h, d })
  cupom_logo_img: '', // a mesma imagem em PNG (impressão pelo navegador e pré-visualização)
  cupom_qr_texto: '', // link do Instagram / WhatsApp impresso como QR Code
  cupom_qr_legenda: 'Siga a gente no Instagram',
  etiqueta_largura_mm: '40',
  etiqueta_altura_mm: '30',
  etiqueta_colunas: '1',
  etiqueta_margem_mm: '2',
  etiqueta_mostrar_loja: '1',
  etiqueta_logo: '1', // logo da loja no lugar do nome escrito
  etiqueta_mostrar_preco: '1',
  estoque_negativo: '0',
  desconto_maximo_pct: '30',
  desconto_presets: '5, 10, 15, 20', // botões prontos na janela de desconto (%)
  // Mensagens do WhatsApp (vazio = texto padrão do sistema; {nome}, {loja}… trocam sozinhos)
  msg_crediario: '',
  msg_parcela_hoje: '',
  msg_condicional: '',
  msg_reserva: '',
  msg_espera: '',
  msg_aniversario: '',
  cobranca_dias_antes: '0', // fila de cobrança: avisar também quem vence nos próximos N dias
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
  etiqueta_modelo: 'padrao',
  etiqueta_parcelas: '3', // modelo "parcelado": 3x de R$ …
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
  // Taxas das maquininhas (% por venda)
  taxas_tabela: JSON.stringify(require('./taxas').TABELA_PADRAO), // taxa por parcela e bandeira
  juros_a_partir: '4', // crédito com N parcelas ou mais: a taxa da maquininha é somada no valor da cliente (0 = nunca)
  taxa_debito: '',
  taxa_credito_vista: '',
  taxa_credito_2a6: '',
  taxa_credito_7a12: '',
  taxa_pix: '',
  // Preço sugerido no cadastro
  markup_padrao: '',
  // Foto das peças: tirar o fundo sozinho e qual fundo colocar (rosa, branco, creme)
  foto_sem_fundo: '1',
  foto_fundo: 'rosa',
  arredondar_preco: '90',
  // Backup automático
  backup_auto: '1',
  backup_pasta: '',
  backup_pasta_extra: '',
  backup_manter: '30',
  backup_ultimo: '',
  backup_ultimo_arquivo: '',
  backup_ultimo_motivo: '',
  backup_ultimo_erro: '',
  // Trocas e condicional
  vale_validade_dias: '90',
  // Assistente de boas-vindas (aparece para o administrador até ser concluído ou pulado)
  boas_vindas_ok: '0',
  // Atualização automática do sistema
  atualizacao_auto: '1',
  atualizacao_url: '',
  atualizacao_token: '',
  atualizacao_verificada_em: '',
  condicional_prazo_dias: '3',
  reserva_prazo_dias: '7',
  reserva_sinal_pct: '30', // sinal sugerido (% do total)
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
  // Loja que já estava em uso ao atualizar: não mostra o assistente de boas-vindas.
  if (!db.prepare(`SELECT 1 FROM config WHERE chave = 'boas_vindas_ok'`).get()
    && db.prepare('SELECT COUNT(*) AS n FROM produtos').get().n > 0) inserir.run('boas_vindas_ok', '1');
  for (const [chave, valor] of Object.entries(CONFIG_PADRAO)) inserir.run(chave, valor);

  return db;
}

/** Ajustes em bancos criados por versões anteriores. */
function migrar(db) {
  const colunas = (tabela) => db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  if (!colunas('vendas').includes('usuario_id')) {
    db.exec('ALTER TABLE vendas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)');
  }
  if (!colunas('produtos').includes('servico')) {
    // servico = não controla estoque (ajuste de barra, embrulho…); atalho = botão rápido no PDV
    db.exec('ALTER TABLE produtos ADD COLUMN servico INTEGER NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE produtos ADD COLUMN atalho INTEGER NOT NULL DEFAULT 0');
  }
  if (!colunas('venda_pagamentos').includes('referencia')) {
    db.exec('ALTER TABLE venda_pagamentos ADD COLUMN referencia TEXT'); // código do vale usado
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS vales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      valor INTEGER NOT NULL,
      saldo INTEGER NOT NULL,
      cliente_id INTEGER REFERENCES clientes(id),
      origem TEXT NOT NULL DEFAULT 'troca',
      troca_id INTEGER,
      validade TEXT,
      status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','usado','cancelado')),
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS trocas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL REFERENCES vendas(id),
      cliente_id INTEGER REFERENCES clientes(id),
      usuario TEXT,
      valor INTEGER NOT NULL,
      vale_id INTEGER REFERENCES vales(id),
      motivo TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS troca_itens (
      troca_id INTEGER NOT NULL REFERENCES trocas(id),
      venda_item_id INTEGER NOT NULL REFERENCES venda_itens(id),
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      quantidade INTEGER NOT NULL,
      valor INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_troca_venda ON trocas(venda_id);
    CREATE TABLE IF NOT EXISTS condicionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      usuario TEXT,
      prazo TEXT,
      observacao TEXT,
      status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','fechada','cancelada')),
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      fechada_em TEXT
    );
    CREATE TABLE IF NOT EXISTS condicional_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      condicional_id INTEGER NOT NULL REFERENCES condicionais(id),
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      quantidade INTEGER NOT NULL,
      ficou INTEGER
    );
    -- Lista de espera: a cliente quer uma peça/tamanho que não tem no estoque.
    CREATE TABLE IF NOT EXISTS espera (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      produto_id INTEGER REFERENCES produtos(id),
      descricao TEXT,
      tamanho TEXT,
      cor TEXT,
      observacao TEXT,
      usuario TEXT,
      status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','avisada','atendida','cancelada')),
      avisado_em TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    -- Reserva com sinal: as peças ficam separadas (fora do estoque) até a cliente buscar e pagar o resto.
    CREATE TABLE IF NOT EXISTS reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      usuario TEXT,
      prazo TEXT,
      observacao TEXT,
      status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','retirada','cancelada')),
      destino_sinal TEXT,
      vale_id INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      fechada_em TEXT
    );
    CREATE TABLE IF NOT EXISTS reserva_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id INTEGER NOT NULL REFERENCES reservas(id),
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      quantidade INTEGER NOT NULL,
      preco INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reserva_sinais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserva_id INTEGER NOT NULL REFERENCES reservas(id),
      caixa_id INTEGER REFERENCES caixas(id),
      operador TEXT,
      valor INTEGER NOT NULL,
      forma TEXT NOT NULL,
      bandeira TEXT,
      taxa INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS despesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      categoria TEXT,
      valor INTEGER NOT NULL,
      data TEXT NOT NULL,
      usuario TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    -- Histórico de ações (quem fez o quê): cancelamentos, descontos, estoque, caixa…
    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      usuario_id INTEGER,
      usuario TEXT,
      tipo TEXT NOT NULL,
      acao TEXT NOT NULL,
      descricao TEXT,
      valor INTEGER,
      importante INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria(criado_em);
  `);
  if (!colunas('produtos').includes('preco_anterior')) {
    db.exec('ALTER TABLE produtos ADD COLUMN preco_anterior INTEGER');
  }
  if (!colunas('venda_itens').includes('preco_anterior')) {
    db.exec('ALTER TABLE venda_itens ADD COLUMN preco_anterior INTEGER');
  }
  if (!colunas('venda_pagamentos').includes('taxa')) {
    db.exec('ALTER TABLE venda_pagamentos ADD COLUMN taxa INTEGER');
  }
  if (!colunas('crediario_recebimentos').includes('taxa')) {
    db.exec('ALTER TABLE crediario_recebimentos ADD COLUMN taxa INTEGER');
  }
  // Produto excluído que já tem histórico (vendas, trocas…): some de todas as listas.
  if (!colunas('produtos').includes('excluido_em')) {
    db.exec('ALTER TABLE produtos ADD COLUMN excluido_em TEXT');
  }
  // Cliente excluída que tem histórico (vendas, crediário…): some das listas, o nome fica nas vendas antigas.
  if (!colunas('clientes').includes('excluido_em')) {
    db.exec('ALTER TABLE clientes ADD COLUMN excluido_em TEXT');
  }
  // Cancelamento/estorno feito com outro caixa aberto: o caixa original continua como foi fechado.
  if (!colunas('vendas').includes('cancelada_caixa_id')) {
    db.exec('ALTER TABLE vendas ADD COLUMN cancelada_caixa_id INTEGER');
  }
  if (!colunas('vendas').includes('reserva_id')) {
    db.exec('ALTER TABLE vendas ADD COLUMN reserva_id INTEGER');
  }
  if (!colunas('crediario_recebimentos').includes('estornado_caixa_id')) {
    db.exec('ALTER TABLE crediario_recebimentos ADD COLUMN estornado_caixa_id INTEGER');
  }
  // Juros da maquininha repassados à cliente (crédito parcelado a partir de N vezes).
  if (!colunas('vendas').includes('acrescimo')) {
    db.exec('ALTER TABLE vendas ADD COLUMN acrescimo INTEGER NOT NULL DEFAULT 0');
  }
  if (!colunas('venda_pagamentos').includes('juros')) {
    db.exec('ALTER TABLE venda_pagamentos ADD COLUMN juros INTEGER NOT NULL DEFAULT 0');
  }
  // Grupo de bandeira do cartão (visa_master / elo_amex) para a taxa certa.
  if (!colunas('venda_pagamentos').includes('bandeira')) {
    db.exec('ALTER TABLE venda_pagamentos ADD COLUMN bandeira TEXT');
  }
  if (!colunas('crediario_recebimentos').includes('bandeira')) {
    db.exec('ALTER TABLE crediario_recebimentos ADD COLUMN bandeira TEXT');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT,
      categoria TEXT,
      status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','finalizado','cancelado')),
      usuario TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      finalizado_em TEXT,
      ajustados INTEGER,
      valor_sobra INTEGER,
      valor_falta INTEGER
    );
    CREATE TABLE IF NOT EXISTS inventario_leituras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      quantidade INTEGER NOT NULL,
      usuario TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_inv_leit ON inventario_leituras(inventario_id, produto_id);
    CREATE TABLE IF NOT EXISTS inventario_itens (
      inventario_id INTEGER NOT NULL REFERENCES inventarios(id),
      produto_id INTEGER NOT NULL REFERENCES produtos(id),
      estoque_sistema INTEGER NOT NULL,
      contado INTEGER NOT NULL,
      PRIMARY KEY (inventario_id, produto_id)
    );
  `);
  if (!colunas('produtos').includes('foto_versao')) {
    db.exec('ALTER TABLE produtos ADD COLUMN foto_versao INTEGER');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS produto_fotos (
    produto_id INTEGER PRIMARY KEY REFERENCES produtos(id),
    tipo TEXT NOT NULL,
    dados BLOB NOT NULL
  )`);
  // Despesas: forma de pagamento, para quem foi pago, observação e a sangria (quando saiu da gaveta).
  for (const [col, tipo] of [['forma', 'TEXT'], ['favorecido', 'TEXT'], ['observacao', 'TEXT'], ['sangria_id', 'INTEGER']]) {
    if (!colunas('despesas').includes(col)) db.exec(`ALTER TABLE despesas ADD COLUMN ${col} ${tipo}`);
  }
  // Cobranças do crediário feitas pelo WhatsApp (fila de cobrança).
  db.exec(`CREATE TABLE IF NOT EXISTS crediario_cobrancas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    usuario TEXT,
    vencido INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  // Foto da cliente (tirada no computador ou pelo celular).
  if (!colunas('clientes').includes('foto_versao')) {
    db.exec('ALTER TABLE clientes ADD COLUMN foto_versao INTEGER');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS cliente_fotos (
    cliente_id INTEGER PRIMARY KEY REFERENCES clientes(id),
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
