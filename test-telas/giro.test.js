'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novoSistema, dadosBasicos, pular } = require('./ajuda');

const OPC = { skip: pular, timeout: 90000 };
// PRINTS=pasta salva as telas para conferir o visual.
const print = (sis, nome, el) => process.env.PRINTS && (el || sis.pagina).screenshot({ path: `${process.env.PRINTS}/${nome}.png` });

/** Foto de mentira (um retângulo colorido) para a peça. */
const fotoFalsa = (sis, id, cor) => sis.pagina.evaluate(async ([pid, c]) => {
  const cv = document.createElement('canvas');
  cv.width = 600; cv.height = 800;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#efe7e2'; ctx.fillRect(0, 0, 600, 800);
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(220, 120); ctx.lineTo(380, 120); ctx.lineTo(500, 740); ctx.lineTo(100, 740); ctx.closePath(); ctx.fill();
  await U.api(`/api/produtos/${pid}/foto`, { metodo: 'PUT', corpo: { imagem: cv.toDataURL('image/jpeg', 0.8) } });
}, [id, cor]);

test('relatórios: mapa de calor, curva ABC e peças paradas', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.pagina.evaluate(async ([v, b]) => {
      const vender = (p, q) => U.api('/api/vendas', { metodo: 'POST', corpo: { itens: [{ produto_id: p.id, quantidade: q }], pagamentos: [{ forma: 'pix', valor: p.preco_venda * q }] } });
      await vender(v, 3);
      await vender(b, 1);
    }, [d.vestido, d.blusa]);
    sis.db.prepare(`UPDATE produtos SET criado_em = datetime('now','localtime','-200 days')`).run();
    sis.db.prepare(`UPDATE produtos SET estoque = 4, preco_custo = 6000 WHERE nome = 'Saia Plissada'`).run();
    await sis.ir('relatorios');
    await sis.pagina.waitForSelector('.g-calor');
    assert.match(await sis.pagina.textContent('.cartao:has(.g-calor) .dica'), /1º/);
    await sis.pagina.waitForSelector('#abc .abc-tabela');
    assert.deepEqual(await sis.pagina.$$eval('#abc .abc-tag', (xs) => xs.map((x) => x.textContent)), ['A', 'B']);
    await sis.pagina.waitForSelector('#paradas .pp-resumo');
    assert.match(await sis.pagina.textContent('#paradas'), /Saia Plissada[\s\S]*nunca vendeu/);
    await sis.pagina.selectOption('#pp-dias', '30');
    await sis.pagina.waitForTimeout(400);
    await print(sis, 'rel-calor', sis.pagina.locator('.cartao:has(.g-calor)'));
    await print(sis, 'rel-abc', sis.pagina.locator('#abc'));
    await print(sis, 'rel-paradas', sis.pagina.locator('#paradas'));
    // Clicar no modelo abre Produtos já filtrado.
    await sis.pagina.click('#abc .abc-modelo');
    await sis.pagina.waitForSelector('.pr-lista, .pr-vitrine, .pr-modelos');
    await sis.pagina.waitForTimeout(400);
    assert.equal(await sis.pagina.inputValue('#q'), 'Vestido Midi Floral');
    assert.deepEqual(sis.erros, []);
  } finally { await sis.fechar(); }
});

test('catálogo: escolhe as peças e gera as imagens (1 por imagem e 4 por imagem)', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await fotoFalsa(sis, d.vestido.id, '#1f1a1c');
    await fotoFalsa(sis, d.blusa.id, '#d9c7a8');
    await sis.pagina.evaluate(async (v) => U.api(`/api/produtos/${v.id}`, { metodo: 'PUT', corpo: { preco_anterior: 32990 } }), d.vestido);
    await sis.ir('produtos');
    await sis.pagina.click('#catalogo');
    await sis.pagina.waitForSelector('.cat-previa canvas');
    await sis.pagina.waitForTimeout(800);
    assert.equal(await sis.pagina.locator('.cat-previa').count(), 2); // as duas com foto e estoque
    const tamanho = await sis.pagina.$eval('.cat-previa canvas', (c) => [c.width, c.height]);
    assert.deepEqual(tamanho, [1080, 1920]);
    await print(sis, 'cat-modal');
    const salvar = async (nome, i = 0) => {
      if (!process.env.PRINTS) return;
      const url = await sis.pagina.$$eval('.cat-previa canvas', (cs, n) => cs[n].toDataURL('image/png'), i);
      require('node:fs').writeFileSync(`${process.env.PRINTS}/${nome}.png`, Buffer.from(url.split(',')[1], 'base64'));
    };
    await salvar('cat-story-1');
    await salvar('cat-story-2', 1);
    await sis.pagina.click('#cat-formato [data-f=post]');
    await sis.pagina.click('#cat-modo [data-m=grade]');
    await sis.pagina.fill('#cat-titulo', 'Novidades da semana');
    await sis.pagina.waitForTimeout(1200);
    assert.equal(await sis.pagina.locator('.cat-previa').count(), 1);
    assert.deepEqual(await sis.pagina.$eval('.cat-previa canvas', (c) => [c.width, c.height]), [1080, 1350]);
    await salvar('cat-post-grade');
    assert.deepEqual(sis.erros, []);
  } finally { await sis.fechar(); }
});

test('chegou peça: depois da entrada, mostra as clientes para avisar no WhatsApp', OPC, async () => {
  const sis = await novoSistema();
  try {
    const d = await dadosBasicos(sis);
    await sis.pagina.evaluate(async ([b, ana]) => U.api('/api/vendas', { metodo: 'POST', corpo: { cliente_id: ana.id, itens: [{ produto_id: b.id, quantidade: 1 }], pagamentos: [{ forma: 'pix', valor: b.preco_venda }] } }), [d.blusa, d.ana]);
    await sis.ir('produtos');
    await sis.pagina.click('#entrada');
    await sis.pagina.waitForSelector('#ent-leitor');
    await sis.pagina.fill('#ent-leitor', d.blusa.codigo);
    await sis.pagina.press('#ent-leitor', 'Enter');
    await sis.pagina.waitForTimeout(300);
    await sis.pagina.click('#ent-ok');
    await sis.pagina.waitForSelector('.ci-cliente');
    assert.match(await sis.pagina.textContent('.ci-cliente'), /Ana Paula Souza[\s\S]*Já comprou esta peça/);
    assert.match(await sis.pagina.inputValue('#ci-texto'), /Chegou Blusa Linho \(tam P\)/);
    await print(sis, 'avisar', sis.pagina.locator('.modal'));
    // O botão monta o link do WhatsApp com o primeiro nome.
    const [popup] = await Promise.all([
      sis.pagina.context().waitForEvent('page').catch(() => null),
      sis.pagina.click('.ci-cliente [data-avisar]'),
    ]);
    const href = await sis.pagina.getAttribute('.ci-cliente [data-avisar]', 'href');
    assert.match(href, /^https:\/\/wa\.me\/5563988881111\?text=Oi%2C%20Ana!/);
    if (popup) await popup.close();
    await sis.pagina.waitForSelector('.ci-cliente.avisada');
    assert.deepEqual(sis.erros, []);
  } finally { await sis.fechar(); }
});

test('foto da peça: tira o fundo sozinho, troca o fundo e volta para a original', OPC, async () => {
  const sis = await novoSistema();
  try {
    const p = sis.pagina;
    await sis.ir('produtos');
    await p.click('#novo');
    await p.waitForSelector('#foto-arquivo', { state: 'attached' });
    await p.setInputFiles('#foto-arquivo', require('node:path').join(__dirname, 'fotos/camiseta-listrada.jpg'));
    await p.waitForSelector('.fp-processando');
    await p.waitForSelector('.fp-fundo-cor', { timeout: 30000 });
    assert.equal(await p.locator('.fp-processando').count(), 0);
    const tam = await p.$eval('#foto-previa img', (i) => [i.naturalWidth, i.naturalHeight]);
    assert.deepEqual(tam, [900, 1200]);
    // Canto da foto = fundo rosa da loja (o fundo original era bege).
    const canto = await p.$eval('#foto-previa img', (i) => {
      const c = document.createElement('canvas'); c.width = 900; c.height = 1200;
      const ctx = c.getContext('2d'); ctx.drawImage(i, 0, 0);
      return [...ctx.getImageData(10, 10, 1, 1).data].slice(0, 3);
    });
    assert.ok(Math.abs(canto[0] - 0xfb) < 6 && Math.abs(canto[2] - 0xf7) < 6, `canto ${canto}`);
    await print(sis, 'foto-sem-fundo', p.locator('.fp-lateral'));
    if (process.env.PRINTS) {
      const url = await p.$eval('#foto-previa img', (i) => i.src);
      require('node:fs').writeFileSync(`${process.env.PRINTS}/foto-final.jpg`, Buffer.from(url.split(',')[1], 'base64'));
    }
    await p.click('[data-fundo=branco]');
    assert.equal(await p.locator('[data-fundo=branco].sel').count(), 1);
    await p.click('[data-fundo=original]');
    assert.notDeepEqual(await p.$eval('#foto-previa img', (i) => [i.naturalWidth, i.naturalHeight]), [900, 1200]);
    await p.click('[data-fundo=rosa]');
    // Salva: a foto sem fundo vai para o produto; o fundo escolhido fica guardado.
    await p.fill('#f-prod [name=nome]', 'Camiseta Listrada');
    await p.fill('#f-prod [name=preco_venda]', '59,90');
    await p.check('#criar-zeradas');
    await p.click('#f-prod .fp-rodape .btn-primario');
    await p.waitForTimeout(800);
    const prod = sis.db.prepare(`SELECT id, foto_versao FROM produtos WHERE nome = 'Camiseta Listrada'`).get();
    assert.ok(prod && prod.foto_versao);
    assert.equal(sis.db.prepare(`SELECT valor FROM config WHERE chave = 'foto_fundo'`).get().valor, 'rosa');
    // Desligar o "tirar o fundo sozinho" vale para as próximas fotos.
    await sis.ir('produtos');
    await p.click('#novo');
    await p.setInputFiles('#foto-arquivo', require('node:path').join(__dirname, 'fotos/vestido-cabide.jpg'));
    await p.waitForSelector('.fp-fundo-cor', { timeout: 30000 });
    await p.uncheck('#foto-auto');
    await p.waitForTimeout(300);
    assert.equal(sis.db.prepare(`SELECT valor FROM config WHERE chave = 'foto_sem_fundo'`).get().valor, '0');
    await print(sis, 'foto-vestido', p.locator('.fp-lateral'));
    assert.deepEqual(sis.erros, []);
  } finally { await sis.fechar(); }
});

test('cadastro em grade só cria o que tem peça; aviso limpa tamanhos/cores vazios antigos', OPC, async () => {
  const sis = await novoSistema();
  try {
    const p = sis.pagina;
    await sis.ir('produtos');
    await p.click('#novo');
    await p.fill('#f-prod [name=nome]', 'Blusa Teste');
    await p.fill('#f-prod [name=preco_venda]', '79,90');
    for (const t of ['P', 'M']) { await p.fill('#ge-tam-novo', t); await p.press('#ge-tam-novo', 'Enter'); }
    for (const c of ['Preto', 'Azul']) { await p.fill('#ge-cor-novo', c); await p.press('#ge-cor-novo', 'Enter'); }
    await p.evaluate(() => {
      const por = (t, c, n) => {
        const i = document.querySelector(`.ge-qtd[data-k="${GradeEditor.chave(t, c)}"]`);
        i.value = n;
        i.dispatchEvent(new Event('input', { bubbles: true }));
      };
      por('P', 'Preto', 2);
      por('M', 'Azul', 1);
    });
    assert.match(await p.textContent('#ge-rodape'), /2 variação\(ões\) com peças · 3 peça\(s\)[\s\S]*2 sem quantidade não são cadastradas/);
    await p.click('#f-prod .fp-rodape .btn-primario');
    await p.waitForTimeout(900);
    const criados = sis.db.prepare(`SELECT tamanho, cor, estoque FROM produtos WHERE nome = 'Blusa Teste' ORDER BY tamanho`).all().map((x) => ({ ...x }));
    assert.deepEqual(criados, [{ tamanho: 'M', cor: 'Azul', estoque: 1 }, { tamanho: 'P', cor: 'Preto', estoque: 2 }]);
    // Dados antigos: combinação criada com 0 que nunca teve peça.
    await sis.api('/api/produtos/grade', { metodo: 'POST', corpo: { nome: 'Blusa Teste', preco_venda: 7990, variantes: [{ tamanho: 'P', cor: 'Azul', quantidade: 0 }] } });
    await sis.ir('produtos');
    await p.waitForSelector('.pr-vazias');
    assert.match(await p.textContent('.pr-vazias'), /1 tamanho\(s\)\/cor\(es\) aparecem como esgotados/);
    await print(sis, 'vazias-aviso', p.locator('.pr-vazias'));
    await p.click('#ver-vazias');
    await p.waitForSelector('.vz-item');
    await print(sis, 'vazias-modal', p.locator('.modal'));
    await p.click('#vz-apagar');
    await p.waitForTimeout(800);
    assert.equal(sis.db.prepare(`SELECT COUNT(*) AS n FROM produtos WHERE nome = 'Blusa Teste'`).get().n, 2);
    assert.equal(await p.locator('.pr-vazias').count(), 0);
    assert.deepEqual(sis.erros, []);
  } finally { await sis.fechar(); }
});

test('foto da cliente pelo celular: QR Code no cadastro, aparece na lista e na ficha', OPC, async () => {
  const sis = await novoSistema();
  try {
    const p = sis.pagina;
    const { enderecosLocais } = require('../src/celular');
    const ip = (await enderecosLocais())[0];
    await sis.ir('clientes');
    await p.click('#novo');
    await p.fill('#modal-corpo [name=nome]', 'Joana Prado');
    if (ip) {
      const resp = p.waitForResponse((r) => r.url().endsWith('/api/celular/sessao') && r.request().method() === 'POST');
      await p.click('#cl-foto-celular');
      const { token } = await (await resp).json();
      await p.waitForSelector('#cl-celular-painel svg.qrcode');
      await print(sis, 'cliente-qr', p.locator('.modal'));
      const cel = await sis.navegador.newPage({ viewport: { width: 390, height: 800 } });
      const fotoArq = require('node:path').join(sis.pasta, 'rosto.png');
      await cel.setContent('<div style="width:400px;height:300px;background:radial-gradient(circle,#e9b9a0 40%,#6b4a3a 41%)"></div>');
      await cel.screenshot({ path: fotoArq });
      await cel.goto(`http://${ip}:${sis.porta}/celular#${token}`);
      await cel.waitForFunction(() => document.getElementById('nome').textContent !== 'Carregando…');
      assert.equal(await cel.textContent('#titulo'), 'Foto da cliente');
      assert.match(await cel.textContent('#nome'), /Joana Prado/);
      await cel.setInputFiles('#arquivo', fotoArq);
      await cel.waitForSelector('.msg.ok');
      await cel.close();
      await p.waitForSelector('#cl-foto-previa img[src^="data:image/jpeg"]', { timeout: 8000 });
    } else {
      await p.setInputFiles('#cl-foto-arquivo', require('node:path').join(__dirname, 'fotos/vestido-cabide.jpg'));
      await p.waitForSelector('#cl-foto-previa img[src^="data:image/jpeg"]');
    }
    // Foto quadrada.
    assert.deepEqual(await p.$eval('#cl-foto-previa img', (i) => i.naturalWidth === i.naturalHeight), true);
    await p.click('#modal-corpo .fp-rodape .btn-primario');
    await p.waitForTimeout(800);
    const c = sis.db.prepare(`SELECT id, foto_versao FROM clientes WHERE nome = 'Joana Prado'`).get();
    assert.ok(c.foto_versao);
    await p.waitForSelector('.cl-linha img.cl-foto');
    await print(sis, 'cliente-lista', p.locator('#lista'));
    assert.deepEqual(sis.erros, []);
  } finally { await sis.fechar(); }
});

test('relatório: despesas da loja (categorias, lançamentos, sangria vira despesa) e campos sem sugestões', OPC, async () => {
  const sis = await novoSistema();
  try {
    const p = sis.pagina;
    await dadosBasicos(sis);
    const hoje = new Date().toLocaleDateString('sv-SE');
    await sis.pagina.evaluate(async (h) => {
      const D = (c) => U.api('/api/despesas', { metodo: 'POST', corpo: { data: h, ...c } });
      await D({ descricao: 'Aluguel de outubro', categoria: 'Aluguel', valor: 150000 });
      await D({ descricao: 'Conta de luz', categoria: 'Energia', valor: 32000 });
      await D({ descricao: 'Sacolas', categoria: 'Embalagens', valor: 8000 });
      await U.api('/api/caixa/movimento', { metodo: 'POST', corpo: { tipo: 'sangria', valor: 5000, motivo: 'Pagou o motoboy' } });
    }, hoje);
    await sis.ir('relatorios');
    await p.waitForSelector('#desp-resumo .dp-cat');
    assert.match(await p.textContent('#desp-resumo .dp-kpis'), /1\.900,00[\s\S]*Aluguel de outubro/);
    assert.equal(await p.locator('#desp-lista .dp-tabela').first().locator('tbody tr').count(), 3);
    await print(sis, 'despesas-resumo', p.locator('#desp-resumo'));
    // Filtra por categoria.
    await p.click('.dp-cat[data-cat="Energia"]');
    await p.waitForTimeout(400);
    assert.equal(await p.locator('#desp-lista .dp-tabela').first().locator('tbody tr').count(), 1);
    assert.match(await p.textContent('#desp-lista h3'), /Energia/);
    await p.click('#dp-todas');
    await p.waitForTimeout(400);
    await print(sis, 'despesas-lista', p.locator('#desp-lista'));
    // Sangria vira despesa (já preenchida), com categoria escolhida na lista.
    await p.click('[data-sangria="0"]');
    await p.waitForSelector('#modal-corpo form [name=descricao]');
    assert.equal(await p.inputValue('#modal-corpo [name=descricao]'), 'Pagou o motoboy');
    assert.equal(await p.inputValue('#modal-corpo [name=valor]'), '50,00');
    await p.click('#modal-corpo [data-c="__outra"]');
    await p.fill('#modal-corpo [name=categoria_outra]', 'Entregas');
    // Nenhum campo com sugestão do navegador.
    assert.equal(await p.getAttribute('#modal-corpo [name=descricao]', 'autocomplete'), 'off');
    assert.equal(await p.getAttribute('#modal-corpo [name=descricao]', 'spellcheck'), 'false');
    await p.click('#modal-corpo .btn-primario');
    await p.waitForTimeout(800);
    const motoboy = sis.db.prepare(`SELECT categoria, sangria_id, forma FROM despesas WHERE descricao = 'Pagou o motoboy'`).get();
    assert.equal(motoboy.categoria, 'Entregas');
    assert.ok(motoboy.sangria_id, 'ligada à sangria');
    assert.equal(motoboy.forma, 'dinheiro');
    // A sangria já lançada sai da lista (e o caixa não perde o dinheiro de novo).
    assert.equal(await p.locator('[data-sangria]').count(), 0);
    assert.equal(sis.db.prepare(`SELECT COUNT(*) AS n FROM caixa_movimentos WHERE tipo = 'sangria'`).get().n, 1);
    await sis.ir('pdv');
    assert.equal(await p.getAttribute('#busca', 'autocomplete'), 'off');
    assert.deepEqual(sis.erros, []);
  } finally { await sis.fechar(); }
});

test('aba Despesas: lança compra e salário, tira da gaveta, filtra, edita e apaga devolvendo ao caixa', OPC, async () => {
  const sis = await novoSistema();
  try {
    const p = sis.pagina;
    await dadosBasicos(sis); // caixa aberto com R$ 100,00
    await sis.ir('despesas');
    await p.waitForSelector('#nova');
    // Salário pago com dinheiro da gaveta.
    await p.click('#nova');
    await p.waitForSelector('#dsp-cats');
    await p.click('#dsp-cats [data-c="Funcionários"]');
    assert.match(await p.textContent('#dsp-cat-dica'), /Salário, comissão/);
    await p.fill('#modal-corpo [name=descricao]', 'Vale da Bia');
    await p.fill('#modal-corpo [name=valor]', '50,00');
    await p.fill('#modal-corpo [name=favorecido]', 'Bia');
    await p.click('#dsp-forma [data-forma=dinheiro]');
    await p.check('#modal-corpo [name=do_caixa]');
    await print(sis, 'despesa-form', p.locator('.modal'));
    await p.click('#modal-corpo .acoes .btn-primario');
    await p.waitForTimeout(700);
    let cx = await sis.api('/api/caixa/atual');
    assert.equal(cx.dinheiro_esperado, 10000 - 5000);
    // Compra de mercadoria por PIX.
    await p.click('#nova');
    await p.waitForSelector('#dsp-cats');
    await p.click('#dsp-cats [data-c="Compras de mercadoria"]');
    await p.fill('#modal-corpo [name=descricao]', 'Coleção verão');
    await p.fill('#modal-corpo [name=valor]', '1.500,00');
    await p.click('#dsp-fav [data-f="Bia"]').catch(() => {});
    await p.fill('#modal-corpo [name=favorecido]', 'Fornecedor Moda SP');
    await p.click('#dsp-forma [data-forma=pix]');
    assert.equal(await p.isVisible('#dsp-gaveta'), false);
    await p.click('#modal-corpo .acoes .btn-primario');
    await p.waitForTimeout(700);
    assert.match(await p.textContent('.dsp-kpis'), /1\.550,00[\s\S]*1\.500,00[\s\S]*50,00[\s\S]*50,00/);
    await print(sis, 'despesas-aba', p.locator('#conteudo'));
    // Filtra por categoria e pela busca.
    await p.click('.dp-cat[data-cat="Funcionários"]');
    assert.equal(await p.locator('.dp-tabela tbody tr').count(), 1);
    await p.click('#todas');
    await p.fill('#q', 'moda sp');
    await p.waitForTimeout(300);
    assert.equal(await p.locator('.dp-tabela tbody tr').count(), 1);
    await p.fill('#q', '');
    await p.waitForTimeout(300);
    // Edita a compra.
    const compra = sis.db.prepare(`SELECT id FROM despesas WHERE descricao = 'Coleção verão'`).get();
    await p.click(`[data-editar="${compra.id}"]`);
    await p.waitForSelector('#modal-corpo [name=descricao]');
    await p.fill('#modal-corpo [name=descricao]', 'Coleção verão 2027');
    await p.click('#modal-corpo .acoes .btn-primario');
    await p.waitForTimeout(600);
    assert.equal(sis.db.prepare('SELECT descricao FROM despesas WHERE id = ?').get(compra.id).descricao, 'Coleção verão 2027');
    // Compra de mercadoria não entra no lucro real.
    const rel = await sis.api('/api/relatorios');
    assert.equal(rel.totais.despesas, 5000);
    assert.equal(rel.totais.compras_mercadoria, 150000);
    // Apagar o vale: o dinheiro volta para a gaveta (caixa ainda aberto).
    const vale = sis.db.prepare(`SELECT id FROM despesas WHERE descricao = 'Vale da Bia'`).get();
    await p.click(`[data-apagar="${vale.id}"]`);
    await p.click('#modal-corpo .btn-perigo, #modal-corpo .btn-primario');
    await p.waitForTimeout(700);
    cx = await sis.api('/api/caixa/atual');
    assert.equal(cx.dinheiro_esperado, 10000);
    assert.deepEqual(sis.erros, []);
  } finally { await sis.fechar(); }
});
