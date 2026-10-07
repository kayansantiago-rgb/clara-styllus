'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { novoSistema, dadosBasicos, pular } = require('./ajuda');

const TELAS = ['inicio', 'pdv', 'produtos', 'etiquetas', 'inventario', 'vendas', 'condicional', 'reservas', 'espera',
  'crediario', 'clientes', 'caixa', 'relatorios', 'historico', 'usuarios', 'config'];

test('todas as telas abrem sem erro, com o sistema vazio e com dados', { skip: pular, timeout: 120000 }, async () => {
  const sis = await novoSistema();
  try {
    for (const fase of ['vazio', 'com dados']) {
      if (fase === 'com dados') await dadosBasicos(sis);
      for (const t of TELAS) {
        await sis.ir(t);
        const texto = await sis.pagina.textContent('#conteudo');
        assert.doesNotMatch(texto, /Não foi possível abrir a tela/, `${t} (${fase})`);
        assert.ok(texto.trim().length > 20, `${t} (${fase}) ficou em branco`);
      }
    }
    // Abas das configurações
    await sis.ir('config');
    for (const aba of ['loja', 'cupom', 'impressoras', 'vendas', 'crediario', 'backup', 'atualizacao']) {
      await sis.pagina.click(`[data-ir=${aba}]`);
      assert.equal(await sis.pagina.isVisible(`.cfg-aba[data-aba=${aba}]`), true, `aba ${aba}`);
    }
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('vendedora não vê nem abre as telas de administrador', { skip: pular, timeout: 60000 }, async () => {
  const sis = await novoSistema();
  try {
    await sis.api('/api/usuarios', { metodo: 'POST', corpo: { nome: 'Bia Vendedora', login: 'bia', senha: '1234', perfil: 'vendedor' } });
    await sis.pagina.evaluate(() => U.api('/api/logout', { metodo: 'POST' }));
    await sis.pagina.goto(sis.url);
    await sis.pagina.waitForSelector('#f-login');
    await sis.pagina.fill('#f-login input[name=login]', 'bia');
    await sis.pagina.fill('#f-login input[name=senha]', '1234');
    await sis.pagina.click('#f-login button.btn-primario');
    await sis.pagina.waitForTimeout(800);
    for (const rota of ['relatorios', 'config', 'usuarios', 'historico']) {
      assert.equal(await sis.pagina.isVisible(`.menu a[data-rota=${rota}]`), false, `menu ${rota}`);
    }
    // Digitando o endereço, cai no caixa.
    await sis.pagina.evaluate(() => { location.hash = '#/config'; });
    await sis.pagina.waitForTimeout(600);
    assert.equal(await sis.pagina.locator('#f-cfg').count(), 0);
    const r = await sis.pagina.evaluate(() => U.api('/api/config', { metodo: 'PUT', corpo: { loja_nome: 'X' } }).then(() => 'ok', (e) => e.status));
    assert.equal(r, 403);
    assert.deepEqual(sis.erros, []);
  } finally {
    await sis.fechar();
  }
});

test('menu recolhível lembra a escolha', { skip: pular, timeout: 60000 }, async () => {
  const sis = await novoSistema();
  try {
    await sis.ir('produtos');
    await sis.pagina.click('#menu-recolher');
    assert.ok(await sis.pagina.evaluate(() => document.body.classList.contains('menu-recolhido')));
    await sis.pagina.reload();
    await sis.pagina.waitForTimeout(500);
    assert.ok(await sis.pagina.evaluate(() => document.body.classList.contains('menu-recolhido')));
  } finally {
    await sis.fechar();
  }
});
