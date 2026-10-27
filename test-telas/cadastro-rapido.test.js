'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novoSistema, dadosBasicos, pular } = require('./ajuda');

const OPC = { skip: pular, timeout: 90000 };
const print = (sis, nome) => process.env.PRINTS && sis.pagina.screenshot({ path: `${process.env.PRINTS}/${nome}.png` });
const fila = (sis) => sis.pagina.evaluate(() => U.local.ler('fila_etiquetas', []));

test('cadastro rápido: categoria pelo nome, tamanhos lembrados, "fazer outro" e etiquetas na fila', OPC, async () => {
  const sis = await novoSistema({ largura: 1440, altura: 900 });
  const p = sis.pagina;
  try {
    await dadosBasicos(sis);
    await sis.ir('produtos');
    await p.click('#novo');
    await p.waitForSelector('#f-prod');
    // Nome já escolhe a categoria.
    await p.fill('[name=nome]', 'vestido longo estampado');
    assert.equal(await p.inputValue('[name=categoria]'), 'Vestido');
    await p.fill('[name=preco_venda]', '199,90');
    await p.click('[data-preset="0"]'); // PP P M G GG
    await p.click('[data-add-cor="Preto"]');
    await p.fill('#ge-n', '2');
    await p.click('#ge-preencher');
    await print(sis, 'cadastro-rapido');
    await p.click("[data-outro]");
    // Abriu outro cadastro na mesma categoria, com os mesmos tamanhos.
    await p.waitForFunction(() => document.querySelector('[name=nome]') && document.querySelector('[name=nome]').value === '');
    assert.equal(await p.inputValue('[name=categoria]'), 'Vestido');
    assert.equal(await p.$$eval("#ge-tam .ge-t.on", (xs) => xs.length), 5);
    // As 10 etiquetas (5 tamanhos x 2) foram para a fila sem perguntar.
    assert.equal((await fila(sis)).reduce((a, x) => a + x.quantidade, 0), 10);
    assert.match(await p.textContent('#avisos'), /10 etiqueta\(s\) na fila/);
    assert.ok(await p.$('.aviso-acao button'));

    // Escolher "Não" vale para as próximas entradas.
    await p.click('[data-etq-modo="nao"]');
    await p.fill('[name=nome]', 'Vestido curto');
    await p.fill('[name=preco_venda]', '99,90');
    await p.click('[data-add-cor="Branco"]');
    await p.fill('#ge-n', '1');
    await p.click('#ge-preencher');
    await p.click('.fp-rodape .btn-primario');
    await p.waitForSelector('#f-prod', { state: 'detached' });
    assert.equal((await fila(sis)).reduce((a, x) => a + x.quantidade, 0), 10);

    // Entrada por bipagem com "Mandar para a fila".
    const prods = await sis.api('/api/produtos?q=curto&limite=10');
    await p.click('#entrada');
    await p.click('[data-etq-modo="fila"]');
    await p.fill('#ent-leitor', `3*${prods[0].codigo}`);
    await p.press('#ent-leitor', 'Enter');
    await p.waitForSelector('#ent-ok:not([disabled])');
    await p.click('#ent-ok');
    await p.waitForTimeout(500);
    assert.equal((await fila(sis)).reduce((a, x) => a + x.quantidade, 0), 13);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});
