'use strict';

/**
 * Testes de tela: sobe o sistema num banco temporário e abre um navegador (Chromium, via Playwright).
 * Rodar com: npm run test:telas
 *
 * O Playwright não é dependência do projeto. Ele é procurado em node_modules, em PLAYWRIGHT_MODULO
 * ou em /opt/node-tools; se não existir, os testes são pulados (o resto do sistema não precisa dele).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function carregarPlaywright() {
  const caminhos = ['playwright', process.env.PLAYWRIGHT_MODULO, '/opt/node-tools/node_modules/playwright'].filter(Boolean);
  for (const c of caminhos) {
    try {
      return require(c);
    } catch { /* tenta o próximo */ }
  }
  return null;
}

const playwright = carregarPlaywright();
const pular = playwright ? false : 'Playwright não instalado (npm i -D playwright) — testes de tela pulados.';

/** Sistema novo: servidor com banco vazio + navegador, já com a administradora cadastrada e logada. */
async function novoSistema({ logar = true, largura = 1366, altura = 768 } = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-telas-'));
  process.env.PDV_IMPRESSAO_PASTA = path.join(pasta, 'impressoes');
  fs.mkdirSync(process.env.PDV_IMPRESSAO_PASTA, { recursive: true });
  // Carregado só aqui para a variável acima já valer.
  const { abrirBanco } = require('../src/db');
  const { criarServidor } = require('../server');
  const db = abrirBanco(path.join(pasta, 'teste.db'));
  const servidor = criarServidor(db, { pastaBackup: path.join(pasta, 'backups'), pastaAtualizacoes: path.join(pasta, 'atualizacoes') });
  // Escuta na rede também (como na loja), para o teste do celular.
  await new Promise((ok) => servidor.listen(0, '0.0.0.0', ok));
  const porta = servidor.address().port;
  const url = `http://127.0.0.1:${porta}/`;

  const navegador = await playwright.chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: largura, height: altura } });
  // Nos testes o "Desfazer" espera pouco (na loja são 8 segundos).
  await pagina.addInitScript(() => { window.__desfazerSegundos = 0.3; });
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(e.stack || e.message));
  pagina.on('dialog', (d) => d.dismiss());

  const sis = {
    url, porta, navegador, pagina, erros, db, pasta,
    /** Chama a API de dentro da página (com a sessão de quem está logado). */
    api: (caminho, opcoes) => pagina.evaluate(([c, o]) => U.api(c, o), [caminho, opcoes || {}]),
    /** Vai para uma tela e espera ela desenhar. */
    async ir(rota) {
      await pagina.evaluate((r) => { location.hash = r; }, `#/${rota}`);
      await pagina.waitForTimeout(150);
      await pagina.reload();
      await pagina.waitForSelector('#conteudo > *', { timeout: 8000 });
      await pagina.waitForTimeout(400);
    },
    async fechar() {
      await navegador.close();
      await new Promise((ok) => servidor.close(ok));
      db.close();
      fs.rmSync(pasta, { recursive: true, force: true });
    },
  };

  await pagina.goto(url);
  if (logar) {
    await pagina.waitForSelector('#f-primeiro');
    await pagina.fill('#f-primeiro input[name=nome]', 'Clarice Leal');
    await pagina.fill('#f-primeiro input[name=login]', 'clara');
    await pagina.fill('#f-primeiro input[name=senha]', '1234');
    await pagina.fill('#f-primeiro input[name=senha2]', '1234');
    await pagina.click('#f-primeiro button.btn-primario');
    await pagina.waitForSelector('#pular');
    await pagina.click('#pular');
    await pagina.waitForTimeout(500);
  }
  return sis;
}

/** Produtos e cliente de exemplo, criados pela API. */
async function dadosBasicos(sis, { abrirCaixa = true } = {}) {
  return sis.pagina.evaluate(async (abrir) => {
    const P = (c) => U.api('/api/produtos', { metodo: 'POST', corpo: c });
    const vestido = await P({ nome: 'Vestido Midi Floral', tamanho: 'M', cor: 'Preto', preco_venda: 25990, preco_custo: 10000, estoque: 10, estoque_minimo: 1 });
    const blusa = await P({ nome: 'Blusa Linho', tamanho: 'P', cor: 'Off', preco_venda: 8990, preco_custo: 3500, estoque: 5 });
    const saia = await P({ nome: 'Saia Plissada', tamanho: 'G', preco_venda: 13990, estoque: 0 });
    const ana = await U.api('/api/clientes', { metodo: 'POST', corpo: { nome: 'Ana Paula Souza', telefone: '63 98888-1111', cpf: '' } });
    if (abrir) await U.api('/api/caixa/abrir', { metodo: 'POST', corpo: { valor_abertura: 10000 } });
    return { vestido, blusa, saia, ana };
  }, abrirCaixa);
}

/** No caixa: bipa (ou busca) uma peça. */
async function bipar(sis, texto) {
  const campo = sis.pagina.locator('#busca');
  await campo.fill(texto);
  await campo.press('Enter');
  await sis.pagina.waitForTimeout(350);
}

/**
 * Abre o pagamento numa forma, com valor/parcelas/bandeira. No modo direto (o normal) só escolhe;
 * com `dividir`, passa para "dividir em duas formas" e adiciona o pagamento na lista.
 */
async function pagar(sis, forma, { valor, parcelas, bandeira, dividir } = {}) {
  const p = sis.pagina;
  if (!(await p.locator('.pag2').count())) {
    await p.click(`.p4-formas [data-forma=${forma}]`);
    await p.waitForSelector('.pag2');
  } else {
    await p.click(`.pag2 [data-forma=${forma}]`);
  }
  await p.waitForTimeout(150);
  if (dividir && await p.locator('.pag2.direto').count()) {
    await p.click('#pag-modo');
    await p.waitForTimeout(150);
  }
  if (parcelas) await p.selectOption('#pag-parc', String(parcelas));
  if (bandeira) await p.click(`[data-band=${bandeira}]`);
  if (valor !== undefined) {
    await p.fill('#pag-valor', valor);
    await p.dispatchEvent('#pag-valor', 'input');
  }
  if (!(await p.locator('.pag2.direto').count())) await p.click('.pag2-add');
  await p.waitForTimeout(250);
}

/** Confirma a venda e devolve a venda gravada (a última). */
async function confirmar(sis) {
  await sis.pagina.click('#concluir');
  await sis.pagina.waitForSelector('.vc', { timeout: 5000 });
  const vendas = await sis.api('/api/vendas');
  return sis.api(`/api/vendas/${vendas[0].id}`);
}

module.exports = { novoSistema, dadosBasicos, bipar, pagar, confirmar, pular };
