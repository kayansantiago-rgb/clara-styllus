'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novoSistema, dadosBasicos, bipar, pagar, confirmar, pular } = require('./ajuda');

const OPC = { skip: pular, timeout: 90000 };

test('troca: bipa o cupom, escolhe a peça, gera o vale e usa numa venda nova', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await bipar(sis, d.vestido.codigo);
    await pagar(sis, 'pix');
    const v = await confirmar(sis);
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForTimeout(400);
    await bipar(sis, `V${v.id}`);
    await sis.pagina.waitForSelector('.tr-itens');
    await sis.pagina.click('.tr-itens [data-mais]');
    assert.match(await sis.pagina.textContent('#troca-total'), /259,90/);
    await sis.pagina.click('#troca-ok');
    await sis.pagina.waitForSelector('.vale-cartao');
    const codigo = (await sis.pagina.textContent('.vale-codigo')).trim();
    assert.match(codigo, /^VT\d+$/);
    assert.equal((await sis.api(`/api/produtos/${d.vestido.id}`)).estoque, 10);
    await sis.pagina.click('#vale-usar');
    await sis.pagina.waitForTimeout(800);
    await bipar(sis, d.blusa.codigo);
    // O vale entra sozinho no pagamento.
    await sis.pagina.click('.p4-formas [data-forma=dinheiro]');
    await sis.pagina.waitForSelector('.pag2');
    assert.equal(await sis.pagina.inputValue('#pag-vale'), codigo);
    await sis.pagina.click('.pag2-add');
    await sis.pagina.waitForTimeout(300);
    const v2 = await confirmar(sis);
    assert.deepEqual(v2.pagamentos.map((p) => p.forma), ['vale']);
    assert.equal((await sis.api(`/api/vales/${codigo}`)).saldo, 25990 - 8990);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('reserva com sinal pelo caixa, retirada e venda paga com o sinal', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await sis.pagina.evaluate((c) => Telas.pdv.usarCliente(c), { id: d.ana.id, nome: d.ana.nome });
    await sis.pagina.waitForTimeout(500);
    await bipar(sis, d.vestido.codigo);
    await sis.pagina.click('#t-reservar');
    await sis.pagina.waitForSelector('#rs-valor');
    assert.equal(await sis.pagina.inputValue('#rs-valor'), '78,00'); // 30% sugerido
    await sis.pagina.click('[data-f=pix]');
    await sis.pagina.click('#rs-ok');
    await sis.pagina.waitForSelector('.vc');
    let r = (await sis.api('/api/reservas'))[0];
    assert.deepEqual([r.total, r.pago, r.falta], [25990, 7800, 18190]);
    assert.equal((await sis.api(`/api/produtos/${d.vestido.id}`)).estoque, 9);
    await sis.pagina.keyboard.press('Escape');

    await sis.ir('reservas');
    await sis.pagina.click('[data-retirar]');
    await sis.pagina.click('#modal-corpo [data-ok]');
    await sis.pagina.waitForTimeout(1200);
    assert.match(await sis.pagina.textContent('#alertas'), /Sinal da reserva/);
    await sis.pagina.click('.p4-formas [data-forma=dinheiro]');
    await sis.pagina.waitForSelector('.pag2');
    await sis.pagina.click('.pag2-add'); // o sinal (vale RS…)
    await sis.pagina.waitForTimeout(300);
    await pagar(sis, 'dinheiro');
    const v = await confirmar(sis);
    assert.equal(v.total, 25990);
    assert.deepEqual(v.pagamentos.map((p) => [p.forma, p.valor]), [['vale', 7800], ['dinheiro', 18190]]);
    assert.equal((await sis.api(`/api/produtos/${d.vestido.id}`)).estoque, 9);
    r = (await sis.api('/api/reservas?status=todas'))[0];
    assert.equal(r.status, 'retirada');
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('lista de espera: anota pelo caixa e avisa quando a peça chega', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await sis.pagina.evaluate((c) => Telas.pdv.usarCliente(c), { id: d.ana.id, nome: d.ana.nome, telefone: d.ana.telefone });
    await sis.pagina.waitForTimeout(500);
    await bipar(sis, d.saia.codigo);
    await sis.pagina.click('[data-espera]');
    await sis.pagina.waitForSelector('#es-ok');
    await sis.pagina.click('#es-ok');
    await sis.pagina.waitForTimeout(500);
    await sis.api(`/api/produtos/${d.saia.id}/estoque`, { metodo: 'POST', corpo: { tipo: 'entrada', quantidade: 2 } });
    await sis.ir('espera');
    assert.match(await sis.pagina.textContent('#bolinha-espera'), /1/);
    assert.match(await sis.pagina.textContent('.es-card'), /Chegou!/);
    await sis.pagina.click('[data-vender]');
    // Ainda tinha a saia no caixa (de quando foi anotado): pergunta antes de trocar a venda.
    await sis.pagina.waitForSelector('#modal-corpo [data-ok]');
    assert.match(await sis.pagina.textContent('#modal-corpo'), /Já tem peças no caixa/);
    await sis.pagina.click('#modal-corpo [data-ok]');
    await sis.pagina.waitForTimeout(1200);
    assert.match(await sis.pagina.textContent('.p4-venda'), /Saia Plissada/);
    assert.equal((await sis.api('/api/espera/resumo')).chegaram, 0);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('condicional: sai pelo caixa, volta uma peça e a outra vai para a venda', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await sis.pagina.evaluate((c) => Telas.pdv.usarCliente(c), { id: d.ana.id, nome: d.ana.nome });
    await sis.pagina.waitForTimeout(500);
    await bipar(sis, d.vestido.codigo);
    await bipar(sis, d.blusa.codigo);
    await sis.pagina.click('#t-condicional');
    await sis.pagina.waitForSelector('#modal-corpo form');
    await sis.pagina.click('#modal-corpo form .btn-primario');
    await sis.pagina.waitForTimeout(800);
    assert.equal((await sis.api(`/api/produtos/${d.vestido.id}`)).estoque, 9);
    await sis.ir('condicional');
    await sis.pagina.click('.cd-card');
    await sis.pagina.waitForSelector('#cd-itens');
    // Sem bipar nada ela fica com tudo; bipa a blusa que voltou (fica com o vestido).
    assert.match(await sis.pagina.textContent('#cd-conf'), /Nenhuma peça bipada/);
    assert.match(await sis.pagina.textContent('#fechar'), /levar 2 peça/);
    await sis.pagina.fill('#cd-bipe', d.blusa.codigo);
    await sis.pagina.press('#cd-bipe', 'Enter');
    await sis.pagina.waitForTimeout(300);
    assert.match(await sis.pagina.textContent('#fechar'), /levar 1 peça/);
    await sis.pagina.click('#fechar');
    await sis.pagina.waitForTimeout(1500);
    assert.equal((await sis.api(`/api/produtos/${d.blusa.id}`)).estoque, 5);
    assert.match(await sis.pagina.textContent('.p4-venda'), /Vestido Midi Floral/);
    assert.doesNotMatch(await sis.pagina.textContent('.p4-venda'), /Blusa Linho/);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('crediário: vende em 3x e recebe uma parcela pela tela', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await sis.pagina.evaluate((c) => Telas.pdv.usarCliente(c), { id: d.ana.id, nome: d.ana.nome });
    await sis.pagina.waitForTimeout(500);
    await bipar(sis, d.blusa.codigo);
    await pagar(sis, 'crediario', { parcelas: 3 });
    const v = await confirmar(sis);
    assert.equal(v.crediario.length, 3);
    await sis.pagina.keyboard.press('Escape');
    await sis.ir('crediario');
    await sis.pagina.click('[data-receber]');
    await sis.pagina.waitForSelector('#modal-corpo form');
    await sis.pagina.fill('#modal-corpo input[name=valor]', '29,97');
    await sis.pagina.click('#modal-corpo form .btn-primario');
    await sis.pagina.waitForTimeout(800);
    const cx = await sis.api('/api/caixa/atual');
    assert.equal(cx.recebimentos_crediario[0].valor, 2997);
    assert.equal(cx.dinheiro_esperado, 10000 + 2997);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('fechar o caixa contando notas: a diferença bate', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.ir('pdv');
    await bipar(sis, d.blusa.codigo);
    await pagar(sis, 'dinheiro', { valor: '100,00' });
    await confirmar(sis);
    await sis.pagina.keyboard.press('Enter');
    await sis.pagina.waitForTimeout(400);
    // Esperado: 100 de troco inicial + 89,90 = 189,90
    await sis.pagina.click('#t-mais');
    await sis.pagina.click('#t-fechar');
    await sis.pagina.waitForSelector('.fc-dif');
    await sis.pagina.fill('#modal-corpo input[name=valor]', '189,90');
    await sis.pagina.dispatchEvent('#modal-corpo input[name=valor]', 'input');
    await sis.pagina.waitForTimeout(200);
    assert.match(await sis.pagina.textContent('#dif'), /batendo|igual ao esperado/i);
    await sis.pagina.click('#modal-corpo .btn-perigo');
    await sis.pagina.waitForTimeout(1200);
    const r = await sis.api('/api/caixa/atual');
    assert.equal(r.caixa, null);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('crediário quitado aparece em "Quitados"; administradora exclui o cadastro da cliente', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.pagina.evaluate(async (x) => {
      await U.api('/api/vendas', { metodo: 'POST', corpo: { cliente_id: x.ana.id, itens: [{ produto_id: x.blusa.id, quantidade: 1 }], pagamentos: [{ forma: 'crediario', valor: 8990, parcelas: 2 }] } });
      await U.api(`/api/crediario/clientes/${x.ana.id}/receber`, { metodo: 'POST', corpo: { valor: 8990, forma: 'pix' } });
    }, d);
    await sis.ir('crediario');
    await sis.pagina.click('[data-sit=quitados]');
    await sis.pagina.waitForTimeout(500);
    assert.match(await sis.pagina.textContent('#lista'), /Ana Paula Souza[\s\S]*quitado[\s\S]*89,90/);
    await sis.pagina.click('.cr-quitado');
    await sis.pagina.waitForSelector('#modal-corpo details[open]');
    await sis.pagina.keyboard.press('Escape');

    await sis.ir('clientes');
    await sis.pagina.click('text=Ana Paula Souza');
    await sis.pagina.waitForSelector('#excluir');
    await sis.pagina.click('#excluir');
    await sis.pagina.click('#modal-corpo [data-ok]');
    await sis.pagina.waitForTimeout(800);
    assert.doesNotMatch(await sis.pagina.textContent('#conteudo'), /Ana Paula Souza/);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('foto pelo celular: QR Code só na primeira vez; depois o pedido vai direto para o celular conectado', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    const { enderecosLocais } = require('../src/celular');
    const ip = (await enderecosLocais())[0];
    if (!ip) return; // máquina sem rede: não dá para simular o celular
    await sis.ir('produtos');
    await sis.pagina.click('[data-acao=editar]');
    await sis.pagina.waitForSelector('#foto-celular');
    const resp = sis.pagina.waitForResponse((r) => r.url().endsWith('/api/celular/sessao') && r.request().method() === 'POST');
    await sis.pagina.click('#foto-celular');
    const { token, parear } = await (await resp).json();
    assert.match(parear, /^[0-9a-f]{32}$/);
    await sis.pagina.waitForSelector('#foto-celular-painel svg.qrcode');

    // "Celular": outra página, entrando pelo endereço da rede (não pelo computador).
    const cel = await sis.navegador.newPage({ viewport: { width: 390, height: 800 } });
    const fotoArq = require('node:path').join(sis.pasta, 'foto.png');
    await cel.setContent('<div style="width:300px;height:300px;background:linear-gradient(45deg,#a14d6f,#f6dd9b)"></div>');
    await cel.screenshot({ path: fotoArq });
    // O celular não consegue abrir o sistema.
    assert.equal((await cel.goto(`http://${ip}:${sis.porta}/`)).status(), 403);
    await cel.goto(`http://${ip}:${sis.porta}/celular#s=${token}&parear=${parear}`);
    await cel.waitForFunction(() => /Blusa/.test(document.getElementById('nome').textContent));
    assert.match(await cel.textContent('#nome'), /Blusa Linho · P · Off/);
    await cel.setInputFiles('#arquivo', fotoArq);
    await cel.waitForSelector('.msg.ok');

    // No computador, a foto aparece sozinha; salvar grava no produto.
    await sis.pagina.waitForSelector('#foto-previa img', { timeout: 8000 });
    assert.match(await sis.pagina.textContent('#foto-celular-painel'), /Foto recebida/);
    await sis.pagina.click('#modal-corpo form .fp-rodape .btn-primario');
    await sis.pagina.waitForTimeout(1000);
    assert.ok((await sis.api(`/api/produtos/${d.blusa.id}`)).foto_versao, 'a foto foi gravada na blusa');

    // Fechou o cadastro: o celular volta a esperar, conectado.
    await cel.waitForFunction(() => /conectado/.test(document.getElementById('titulo').textContent), null, { timeout: 8000 });
    // Próxima peça: sem QR Code, o nome aparece sozinho no celular.
    await sis.pagina.evaluate((v) => Telas.produtos.formulario(v), await sis.api(`/api/produtos/${d.vestido.id}`));
    await sis.pagina.waitForSelector('#foto-celular');
    await sis.pagina.click('#foto-celular');
    await sis.pagina.waitForSelector('.fp-celular-direto');
    assert.equal(await sis.pagina.$('#foto-celular-painel svg.qrcode'), null);
    await cel.waitForFunction(() => /Vestido/.test(document.getElementById('nome').textContent), null, { timeout: 8000 });
    await cel.setInputFiles('#arquivo', fotoArq);
    await sis.pagina.waitForSelector('#foto-previa img', { timeout: 8000 });
    assert.equal((await sis.api('/api/celular/aparelhos')).filter((a) => a.online).length, 1);
    await cel.close();
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('administradora exclui um produto pela tela de edição', OPC, async () => {
  const sis = await novoSistema();
  try {
    await dadosBasicos(sis);
    await sis.ir('produtos');
    const antes = (await sis.api('/api/produtos')).length;
    await sis.pagina.click('[data-acao=editar]');
    await sis.pagina.waitForSelector('#excluir-produto');
    await sis.pagina.click('#excluir-produto');
    await sis.pagina.click('#modal-corpo [data-ok]');
    await sis.pagina.waitForTimeout(800);
    assert.equal((await sis.api('/api/produtos')).length, antes - 1);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('vendedora recebe parcela do crediário pelo caixa (botão Crediário)', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.pagina.evaluate(async (x) => {
      await U.api('/api/vendas', { metodo: 'POST', corpo: { cliente_id: x.ana.id, itens: [{ produto_id: x.blusa.id, quantidade: 1 }], pagamentos: [{ forma: 'crediario', valor: 8990, parcelas: 2 }] } });
      await U.api('/api/usuarios', { metodo: 'POST', corpo: { nome: 'Bia Vendedora', login: 'bia', senha: '1234', perfil: 'vendedor' } });
      await U.api('/api/logout', { metodo: 'POST' });
    }, d);
    await sis.pagina.goto(sis.url);
    await sis.pagina.waitForSelector('#f-login');
    await sis.pagina.fill('#f-login input[name=login]', 'bia');
    await sis.pagina.fill('#f-login input[name=senha]', '1234');
    await sis.pagina.click('#f-login button.btn-primario');
    await sis.pagina.waitForSelector('#t-crediario');
    // Sem cliente na venda: escolhe quem vai pagar na lista de quem deve.
    await sis.pagina.click('#t-crediario');
    await sis.pagina.waitForSelector('#lista-deve .ec-item');
    assert.match(await sis.pagina.textContent('#lista-deve'), /Ana Paula Souza[\s\S]*89,90/);
    await sis.pagina.fill('#q-deve', 'ninguem');
    await sis.pagina.waitForSelector('#lista-deve .ec-vazio');
    await sis.pagina.fill('#q-deve', 'ana');
    await sis.pagina.waitForSelector('#lista-deve .ec-item');
    if (process.env.PRINTS) await sis.pagina.screenshot({ path: `${process.env.PRINTS}/pdv-crediario.png` });
    await sis.pagina.click('#lista-deve .ec-item');
    await sis.pagina.waitForSelector('#modal-corpo form input[name=valor]');
    await sis.pagina.fill('#modal-corpo input[name=valor]', '44,95');
    await sis.pagina.click('#modal-corpo form .btn-primario');
    await sis.pagina.waitForTimeout(800);
    const cx = await sis.api('/api/caixa/atual');
    assert.equal(cx.recebimentos_crediario[0].valor, 4495);
    assert.equal(sis.db.prepare('SELECT operador FROM crediario_recebimentos').get().operador, 'Bia Vendedora');
    // Com a cliente na venda, o F10 já abre o recebimento dela.
    await sis.pagina.evaluate((c) => Telas.pdv.usarCliente(c), { id: d.ana.id, nome: d.ana.nome });
    await sis.pagina.waitForTimeout(500);
    await sis.pagina.keyboard.press('F10');
    await sis.pagina.waitForSelector('#modal-corpo form input[name=valor]');
    assert.match(await sis.pagina.textContent('#modal-titulo'), /Receber — Ana Paula Souza/);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('condicional: confere bipando o que voltou; o que não voltou vai para o caixa', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    const p = sis.pagina;
    await p.evaluate(async (x) => U.api('/api/condicionais', { metodo: 'POST', corpo: {
      cliente_id: x.ana.id, itens: [{ produto_id: x.vestido.id, quantidade: 2 }, { produto_id: x.blusa.id, quantidade: 1 }] } }), d);
    await sis.ir('condicional');
    await p.click('.cd-card');
    await p.waitForSelector('#cd-bipe');
    const bipe = async (cod) => { await p.fill('#cd-bipe', cod); await p.press('#cd-bipe', 'Enter'); await p.waitForTimeout(250); };
    await bipe('7890000000000'); // não é da condicional
    assert.equal(await p.locator('.tr-item.cd-ok').count(), 0);
    await bipe(d.vestido.codigo);
    await bipe(d.blusa.codigo);
    assert.match(await p.textContent('#cd-conf'), /Voltaram 2 de 3[\s\S]*Faltando: Vestido Midi Floral/);
    assert.equal(await p.locator('.tr-item.cd-ok').count(), 1); // a blusa
    assert.equal(await p.locator('.tr-item.cd-falta').count(), 1); // o vestido (1 de 2)
    if (process.env.PRINTS) await p.locator('.modal').screenshot({ path: `${process.env.PRINTS}/condicional-conferencia.png` });
    // Bipar a blusa de novo: ela só levou 1.
    await bipe(d.blusa.codigo);
    assert.match(await p.textContent('#cd-conf'), /Voltaram 2 de 3/);
    // O vestido que não voltou fica com a cliente e vai para o caixa.
    assert.match(await p.textContent('#fechar'), /levar 1 peça/);
    await p.click('#fechar');
    await p.waitForTimeout(1500);
    assert.equal((await sis.api(`/api/produtos/${d.blusa.id}`)).estoque, 5);
    assert.equal((await sis.api(`/api/produtos/${d.vestido.id}`)).estoque, 10); // volta tudo; sai de novo ao concluir a venda
    assert.match(await p.textContent('.p4-venda'), /Vestido Midi Floral/);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('WhatsApp: a mensagem abre para editar antes e dá para guardar como padrão', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    const p = sis.pagina;
    await p.evaluate(async (x) => U.api('/api/vendas', { metodo: 'POST', corpo: { cliente_id: x.ana.id, itens: [{ produto_id: x.blusa.id, quantidade: 1 }], pagamentos: [{ forma: 'crediario', valor: 8990, parcelas: 2 }] } }), d);
    await sis.ir('crediario');
    await p.evaluate((id) => Telas.crediario.detalhe(id), d.ana.id);
    await p.waitForSelector('a[data-zap="crediario"]');
    await p.click('a[data-zap="crediario"]');
    await p.waitForSelector('#zap-texto');
    assert.match(await p.inputValue('#zap-texto'), /^Olá, Ana! Aqui é da Clara Styllus\. Passando para lembrar do seu crediário: saldo de R\$\s?89,90\./);
    await p.fill('#zap-texto', 'Oi Ana, tudo bem? Seu saldo no crediário da Clara Styllus é R$ 89,90. Beijos!');
    await p.check('#zap-salvar');
    if (process.env.PRINTS) await p.locator('.zap-caixa').screenshot({ path: `${process.env.PRINTS}/zap-editor.png` });
    // WhatsApp Web: abre sempre na mesma aba, direto na conversa.
    await p.click('[data-destino=web]');
    await p.context().route('https://web.whatsapp.com/**', (r) => r.fulfill({ body: 'whatsapp' }));
    const [popup] = await Promise.all([p.context().waitForEvent('page'), p.click('#zap-enviar')]);
    await popup.waitForLoadState().catch(() => {});
    assert.match(decodeURIComponent(popup.url()), /web\.whatsapp\.com\/send\?phone=5563988881111&text=Oi Ana, tudo bem\?/);
    await popup.close();
    await p.waitForTimeout(500);
    const salvo = sis.db.prepare("SELECT valor FROM config WHERE chave = 'msg_crediario'").get().valor;
    assert.equal(salvo, 'Oi {nome}, tudo bem? Seu saldo no crediário da {loja} é {saldo}. Beijos!');
    // Na configuração aparece o texto guardado.
    await sis.ir('config');
    assert.equal(await p.inputValue('[name=msg_crediario]'), salvo);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('cobrança em fila: lista de quem cobrar hoje, cobra no WhatsApp e passa para a próxima', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    const p = sis.pagina;
    const bia = await p.evaluate(async (x) => {
      const V = (cli, prod, n) => U.api('/api/vendas', { metodo: 'POST', corpo: { cliente_id: cli.id, itens: [{ produto_id: prod.id, quantidade: 1 }], pagamentos: [{ forma: 'crediario', valor: prod.preco_venda, parcelas: n }] } });
      const b = await U.api('/api/clientes', { metodo: 'POST', corpo: { nome: 'Bia Lima', telefone: '63 97777-2222' } });
      await V(x.ana, x.blusa, 2);
      await V(b, x.vestido, 3);
      return b;
    }, d);
    // Uma parcela da Ana venceu há 5 dias; uma da Bia vence hoje.
    sis.db.prepare(`UPDATE crediario_parcelas SET vencimento = date('now','localtime','-5 days') WHERE id = (SELECT MIN(id) FROM crediario_parcelas WHERE cliente_id = ?)`).run(d.ana.id);
    sis.db.prepare(`UPDATE crediario_parcelas SET vencimento = date('now','localtime') WHERE id = (SELECT MIN(id) FROM crediario_parcelas WHERE cliente_id = ?)`).run(bia.id);
    await sis.ir('inicio');
    assert.match(await p.textContent('#conteudo'), /Hoje tem\s+2 cliente\(s\)\s+para cobrar/);
    await p.click('a[href="#/crediario?aba=cobrar"]');
    await p.waitForSelector('.cb-linha');
    const linhas = await p.$$eval('.cb-linha .cr-nome b', (xs) => xs.map((x) => x.textContent));
    assert.deepEqual(linhas, ['Ana Paula Souza', 'Bia Lima']); // a atrasada primeiro
    assert.match(await p.textContent('.cb-linha'), /atrasada 5 dias/);
    if (process.env.PRINTS) { await p.waitForTimeout(1200); await p.locator('#conteudo').screenshot({ path: `${process.env.PRINTS}/cobranca-fila.png` }); }
    await p.evaluate(() => U.local.gravar('zap_destino', 'web'));
    await p.context().route('https://web.whatsapp.com/**', (r) => r.fulfill({ body: 'whatsapp' }));
    await p.click('.cb-linha [data-zap]');
    await p.waitForSelector('#zap-texto');
    assert.match(await p.inputValue('#zap-texto'), /saldo de R\$\s?89,90, sendo R\$\s?44,95 vencido/);
    const [popup] = await Promise.all([p.context().waitForEvent('page'), p.click('#zap-enviar')]);
    await popup.close();
    await p.waitForTimeout(600);
    assert.equal(sis.db.prepare('SELECT COUNT(*) AS n FROM crediario_cobrancas WHERE cliente_id = ?').get(d.ana.id).n, 1);
    assert.match(await p.textContent('.cb-linha'), /cobrada agora/);
    // A próxima (Bia, vence hoje) já fica selecionada, com a mensagem da parcela do dia.
    assert.equal(await p.evaluate(() => document.activeElement.closest('.cb-linha')?.querySelector('.cr-nome b').textContent), 'Bia Lima');
    await p.keyboard.press('Enter');
    await p.waitForSelector('#zap-texto');
    assert.match(await p.inputValue('#zap-texto'), /hoje vence sua parcela/);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});
