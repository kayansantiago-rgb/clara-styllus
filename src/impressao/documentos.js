'use strict';

/** Monta os documentos impressos na térmica (cupom, troca, caixa, crediário). */

const { Cupom } = require('./escpos');

const nomeForma = (f) =>
  ({ dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Cartão de débito', credito: 'Cartão de crédito', crediario: 'Crediário', vale: 'Vale-troca', outro: 'Outro' })[f] || f;

const num = (c) => ((Number(c) || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (c) => 'R$ ' + num(c);
const dataBr = (s) => {
  if (!s) return '';
  const [d, h = ''] = String(s).split(' ');
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}${h ? ' ' + h.slice(0, 5) : ''}`;
};
const docBr = (s) => {
  const d = String(s || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return d;
};

function novo(cfg) {
  return new Cupom({
    colunas: Number(cfg.cupom_colunas) || (Number(cfg.cupom_largura_mm) === 58 ? 32 : 48),
    acentos: cfg.cupom_acentos === 'sem' ? 'sem' : 'cp850',
  });
}

/** Logo guardado nas configurações: { l: bytes por linha, h: altura, d: base64 } (feito no navegador). */
function lerLogo(cfg) {
  if (!cfg.cupom_logo) return null;
  try {
    const j = JSON.parse(cfg.cupom_logo);
    const dados = Buffer.from(j.d, 'base64');
    return j.l > 0 && j.h > 0 && dados.length >= j.l * j.h ? { largura: j.l, altura: j.h, dados } : null;
  } catch {
    return null;
  }
}

function cabecalho(c, cfg) {
  const logo = lerLogo(cfg);
  if (logo) c.imagem(logo).pular(1);
  c.tamanho('grande').negrito().centro(cfg.loja_nome || 'Clara Styllus').negrito(false).tamanho('normal');
  if (cfg.loja_razao_social) c.centro(cfg.loja_razao_social);
  if (cfg.loja_cnpj) c.centro('CNPJ: ' + docBr(cfg.loja_cnpj) + (cfg.loja_ie ? '  IE: ' + cfg.loja_ie : ''));
  if (cfg.loja_endereco) c.centro(cfg.loja_endereco);
  if (cfg.loja_cidade) c.centro(cfg.loja_cidade);
  const contato = [cfg.loja_telefone, cfg.loja_instagram].filter(Boolean).join('  ');
  if (contato) c.centro(contato);
  c.separador('=');
}

/** Mensagem final emoldurada e QR Code (Instagram / WhatsApp) no pé do cupom. */
function rodape(c, cfg) {
  if (cfg.cupom_mensagem) {
    c.pular(1);
    c.centro('* * *');
    c.negrito().centro(cfg.cupom_mensagem).negrito(false);
    c.centro('* * *');
  }
  if (cfg.cupom_qr_texto) {
    c.pular(1);
    if (cfg.cupom_qr_legenda) c.centro(cfg.cupom_qr_legenda);
    c.qrcode(cfg.cupom_qr_texto, Number(cfg.cupom_largura_mm) === 58 ? 5 : 6);
  }
  c.pular(1);
}

function finalizar(c, cfg) {
  if (cfg.cupom_corte !== '0') c.cortar();
  else c.pular(5);
  return c;
}

const descItem = (it) => [it.nome, it.tamanho, it.cor].filter(Boolean).join(' ');

function cupomVenda(venda, cfg, { via = '', abrirGaveta = false } = {}) {
  const c = novo(cfg);
  if (abrirGaveta) c.gaveta();
  cabecalho(c, cfg);
  c.negrito().centro('COMPROVANTE DE VENDA').negrito(false).centro('NÃO É DOCUMENTO FISCAL');
  c.separador();
  c.par(`Venda nº ${venda.id}`, dataBr(venda.criado_em));
  if (venda.vendedor) c.linha(`Vendedor(a): ${venda.vendedor}`);
  if (venda.cliente_nome) c.linha(`Cliente: ${venda.cliente_nome}`);
  const doc = venda.cpf_nota || venda.cliente_cpf;
  if (doc) c.linha(`CPF/CNPJ: ${docBr(doc)}`);
  c.separador();
  c.negrito().par('ITEM DESCRIÇÃO', 'VALOR').negrito(false);
  venda.itens.forEach((it, i) => {
    c.linha(`${String(i + 1).padStart(2, '0')} ${descItem(it)}`);
    const desc = it.desconto ? ` (-${num(it.desconto)})` : '';
    if (it.preco_anterior > it.preco_unitario) c.linha(`   Liquidação: de ${num(it.preco_anterior)} por ${num(it.preco_unitario)}`);
    c.par(`   ${it.codigo}  ${it.quantidade} x ${num(it.preco_unitario)}${desc}`, num(it.total));
  });
  c.separador();
  const pecas = venda.itens.reduce((a, it) => a + it.quantidade, 0);
  c.par('Qtd. de peças', String(pecas));
  c.par('Subtotal', num(venda.subtotal));
  if (venda.desconto) c.par('Descontos', '-' + num(venda.desconto));
  const economia = venda.itens.reduce((a, it) =>
    a + (it.preco_anterior > it.preco_unitario ? (it.preco_anterior - it.preco_unitario) * it.quantidade : 0), 0) + (venda.desconto || 0);
  c.separador('=');
  c.tamanho('grande').negrito().par('TOTAL', brl(venda.total)).negrito(false).tamanho('normal');
  c.separador('=');
  for (const p of venda.pagamentos) {
    c.par(nomeForma(p.forma) + (p.parcelas > 1 ? ` ${p.parcelas}x` : ''), num(p.valor));
  }
  if (venda.troco) c.negrito().par('Troco', num(venda.troco)).negrito(false);
  if (economia > 0) c.separador().negrito().centro(`Você economizou ${brl(economia)}!`).negrito(false);

  if (venda.crediario && venda.crediario.length) {
    c.separador();
    c.negrito().centro('CREDIÁRIO - PARCELAS').negrito(false);
    for (const p of venda.crediario) {
      c.par(`${p.numero}/${p.total_parcelas}  venc. ${dataBr(p.vencimento)}`, num(p.valor));
    }
    c.pular(2);
    c.linha('Reconheço a dívida acima e me comprometo a pagar nas datas de vencimento.');
    c.pular(2);
    c.centro('_'.repeat(Math.min(36, c.cols)));
    c.centro(venda.cliente_nome || 'Assinatura do cliente');
  }

  if (venda.status === 'cancelada') c.separador().tamanho('grande').centro('CANCELADA').tamanho('normal');
  c.separador('=');
  rodape(c, cfg);
  c.codigoBarras('V' + venda.id);
  if (via) c.centro(via);
  return finalizar(c, cfg);
}

function cupomTroca(venda, cfg) {
  const c = novo(cfg);
  cabecalho(c, cfg);
  c.tamanho('grande').negrito().centro('CUPOM DE TROCA').negrito(false).tamanho('normal');
  c.separador();
  c.par(`Venda nº ${venda.id}`, dataBr(venda.criado_em));
  c.separador();
  for (const it of venda.itens) {
    c.linha(`${it.quantidade}x ${descItem(it)}`);
    c.linha(`   Cód. ${it.codigo}`);
  }
  c.separador('=');
  rodape(c, cfg);
  c.codigoBarras('V' + venda.id);
  return finalizar(c, cfg);
}

function fechamentoCaixa(r, cfg) {
  const c = novo(cfg);
  const cx = r.caixa;
  cabecalho(c, cfg);
  c.negrito().centro(`${cx.fechado_em ? 'FECHAMENTO' : 'PARCIAL'} DE CAIXA Nº ${cx.id}`).negrito(false);
  c.separador();
  c.linha(`Operador(a): ${cx.operador || '-'}`);
  c.linha(`Abertura: ${dataBr(cx.aberto_em)}`);
  if (cx.fechado_em) c.linha(`Fechamento: ${dataBr(cx.fechado_em)}`);
  c.separador();
  c.par('Vendas', String(r.vendas.quantidade));
  c.par('Canceladas', String(r.vendas.canceladas));
  c.par('Descontos', num(r.vendas.desconto));
  c.negrito().par('Total vendido', num(r.vendas.total)).negrito(false);
  c.separador();
  c.negrito().linha('Vendas por forma de pagamento').negrito(false);
  for (const f of r.formas) c.par(f.forma === 'crediario' ? 'Crediário (a receber)' : nomeForma(f.forma), num(f.valor));
  if (r.vendas.troco) c.par('(-) Troco', num(r.vendas.troco));
  if (r.recebimentos_crediario && r.recebimentos_crediario.length) {
    c.separador();
    c.negrito().linha('Recebimentos do crediário').negrito(false);
    for (const f of r.recebimentos_crediario) c.par(`${nomeForma(f.forma)} (${f.quantidade})`, num(f.valor));
  }
  if (r.sinais_reserva && r.sinais_reserva.length) {
    c.separador();
    c.negrito().linha('Sinais de reserva').negrito(false);
    for (const f of r.sinais_reserva) c.par(`${nomeForma(f.forma)} (${f.quantidade})`, num(f.valor));
  }
  c.separador();
  c.negrito().linha('Dinheiro na gaveta').negrito(false);
  c.par('Abertura', num(cx.valor_abertura));
  for (const m of r.movimentos) {
    c.par(`${m.tipo === 'sangria' ? 'Sangria' : 'Suprimento'} ${m.motivo || ''}`, (m.tipo === 'sangria' ? '-' : '+') + num(m.valor));
  }
  const dinCred = (r.recebimentos_crediario || []).find((f) => f.forma === 'dinheiro');
  if (dinCred) c.par('Crediário em dinheiro', '+' + num(dinCred.valor));
  const dinSinal = (r.sinais_reserva || []).find((f) => f.forma === 'dinheiro');
  if (dinSinal) c.par('Sinais em dinheiro', '+' + num(dinSinal.valor));
  c.negrito().par('Esperado', num(r.dinheiro_esperado)).negrito(false);
  if (cx.valor_informado != null) {
    c.par('Contado', num(cx.valor_informado));
    c.negrito().par('Diferença', num(r.diferenca)).negrito(false);
  }
  if (cx.observacao) c.separador().linha(cx.observacao);
  c.pular(3);
  c.centro('_'.repeat(Math.min(36, c.cols)));
  c.centro('Assinatura');
  return finalizar(c, cfg);
}

function recebimentoCrediario(rec, cfg) {
  const c = novo(cfg);
  cabecalho(c, cfg);
  c.negrito().centro('RECIBO - CREDIÁRIO').negrito(false);
  if (rec.status === 'estornado') c.tamanho('grande').centro('ESTORNADO').tamanho('normal');
  c.separador();
  c.par(`Recibo nº ${rec.id}`, dataBr(rec.criado_em));
  c.linha(`Cliente: ${rec.cliente_nome}`);
  if (rec.cliente_cpf) c.linha(`CPF: ${docBr(rec.cliente_cpf)}`);
  c.linha(`Recebido por: ${rec.operador || '-'}`);
  c.separador();
  for (const p of rec.parcelas) {
    const resta = p.valor - p.valor_pago;
    c.par(`Parc. ${p.numero}/${p.total_parcelas} venc. ${dataBr(p.vencimento)}`, num(p.valor_recebido));
    if (resta > 0 && rec.status !== 'estornado') c.linha(`   (resta ${num(resta)} desta parcela)`);
  }
  c.separador();
  c.tamanho('grande').negrito().par('PAGO', brl(rec.valor)).negrito(false).tamanho('normal');
  c.par('Forma', nomeForma(rec.forma));
  c.separador();
  c.negrito().par('Saldo devedor', brl(rec.saldo.aberto)).negrito(false);
  if (rec.saldo.proximo_vencimento) c.par('Próximo vencimento', dataBr(rec.saldo.proximo_vencimento));
  c.pular(1);
  c.centro('Obrigada!');
  return finalizar(c, cfg);
}

function valeTroca(t, cfg) {
  const c = novo(cfg);
  cabecalho(c, cfg);
  c.tamanho('grande').negrito().centro('VALE-TROCA').negrito(false).tamanho('normal');
  c.separador();
  c.par(`Troca nº ${t.id}`, dataBr(t.criado_em));
  c.linha(`Venda de origem: nº ${t.venda_id}`);
  if (t.cliente_nome) c.linha(`Cliente: ${t.cliente_nome}`);
  c.separador();
  c.negrito().linha('Peças devolvidas').negrito(false);
  for (const it of t.itens) c.par(`${it.quantidade}x ${descItem(it)}`, num(it.valor));
  c.separador();
  if (t.vale) {
    c.tamanho('grande').negrito().centro(brl(t.vale.valor)).negrito(false).tamanho('normal');
    c.centro(`Código: ${t.vale.codigo}`);
    c.codigoBarras(t.vale.codigo, 70);
    if (t.vale.validade) c.centro(`Válido até ${dataBr(t.vale.validade)}`);
    c.pular(1);
    c.centro('Use este vale como pagamento em uma próxima compra.');
    c.centro('Se sobrar saldo, ele continua valendo.');
  }
  return finalizar(c, cfg);
}

function condicional(cd, cfg, via = '') {
  const c = novo(cfg);
  cabecalho(c, cfg);
  c.tamanho('grande').negrito().centro('CONDICIONAL').negrito(false).tamanho('normal');
  c.separador();
  c.par(`Nº ${cd.id}`, dataBr(cd.criado_em));
  c.linha(`Cliente: ${cd.cliente_nome}`);
  if (cd.cliente_telefone) c.linha(`Telefone: ${cd.cliente_telefone}`);
  c.negrito().linha(`Devolver até: ${dataBr(cd.prazo)}`).negrito(false);
  c.separador();
  for (const it of cd.itens) {
    c.linha(`${it.quantidade}x ${descItem(it)}`);
    c.par(`   ${it.codigo}`, num(it.quantidade * it.preco_venda));
  }
  c.separador();
  c.par(`${cd.pecas} peça(s)`, brl(cd.valor));
  c.pular(1);
  c.linha('Recebi as peças acima para provar. Devolvo até a data combinada ou pago as que ficarem comigo.');
  c.pular(2);
  c.centro('_'.repeat(Math.min(36, c.cols)));
  c.centro(cd.cliente_nome);
  if (via) c.centro(via);
  return finalizar(c, cfg);
}

function reserva(r, cfg, via = '') {
  const c = novo(cfg);
  cabecalho(c, cfg);
  c.tamanho('grande').negrito().centro('RESERVA').negrito(false).tamanho('normal');
  c.separador();
  c.par(`Nº ${r.id}`, dataBr(r.criado_em));
  c.linha(`Cliente: ${r.cliente_nome}`);
  if (r.cliente_telefone) c.linha(`Telefone: ${r.cliente_telefone}`);
  c.negrito().linha(`Buscar até: ${dataBr(r.prazo)}`).negrito(false);
  c.separador();
  for (const it of r.itens) {
    c.linha(`${it.quantidade}x ${descItem(it)}`);
    c.par(`   ${it.codigo}`, num(it.quantidade * it.preco));
  }
  c.separador('=');
  c.par(`${r.pecas} peça(s)`, brl(r.total));
  for (const s of r.sinais) c.par(`Sinal ${dataBr(s.criado_em).slice(0, 5)} (${nomeForma(s.forma)})`, '-' + num(s.valor));
  c.tamanho('grande').negrito().par('FALTA', brl(r.falta)).negrito(false).tamanho('normal');
  c.separador('=');
  c.linha('As peças ficam separadas até a data acima. Se a reserva for cancelada, o sinal vira crédito na loja.');
  if (via === 'Via da loja') {
    c.pular(2);
    c.centro('_'.repeat(Math.min(36, c.cols)));
    c.centro(r.cliente_nome);
  }
  c.codigoBarras('R' + r.id);
  if (via) c.centro(via);
  return finalizar(c, cfg);
}

function teste(cfg) {
  const c = novo(cfg);
  cabecalho(c, cfg);
  c.negrito().centro('TESTE DE IMPRESSÃO').negrito(false);
  c.linha('Acentuação: ÁÉÍÓÚ áéíóú ãõ ç Ç ª º');
  c.par('Esquerda', 'Direita');
  c.separador('=');
  c.linha('1234567890'.repeat(Math.ceil(c.cols / 10)).slice(0, c.cols));
  c.tamanho('grande').centro('R$ 123,45').tamanho('normal');
  rodape(c, cfg);
  c.codigoBarras('CLARA123');
  c.centro(`${c.cols} colunas`);
  return finalizar(c, cfg);
}

module.exports = { cupomVenda, cupomTroca, fechamentoCaixa, recebimentoCrediario, valeTroca, condicional, reserva, teste };
