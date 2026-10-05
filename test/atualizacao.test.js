'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { compararVersao, lerManifesto, VERSAO } = require('../src/atualizacao');
const { novaApi } = require('./ajuda');

test('compara versões e lê o formato do GitHub', () => {
  assert.ok(compararVersao('1.10.0', '1.9.9') > 0);
  assert.ok(compararVersao('v1.7.4', '1.7.4') === 0);
  assert.ok(compararVersao('1.7.3', '1.7.4') < 0);
  const m = lerManifesto({
    tag_name: 'v2.0.0', body: 'Novidades',
    assets: [{ name: 'ClaraStyllus-PDV-Setup-2.0.0.exe', url: 'https://api/x/1' }, { name: 'ClaraStyllus-PDV-Setup-2.0.0.exe.sha256', url: 'https://api/x/2' }],
  });
  assert.deepEqual([m.versao, m.arquivo, m.url, m.url_sha256], ['2.0.0', 'ClaraStyllus-PDV-Setup-2.0.0.exe', 'https://api/x/1', 'https://api/x/2']);
});

test('procura versão nova, baixa e confere o SHA-256 (servidor de teste)', async () => {
  const exe = Buffer.concat([Buffer.from('MZ'), crypto.randomBytes(200000)]);
  const sha = crypto.createHash('sha256').update(exe).digest('hex');
  let auth = null;
  let versaoServidor = '99.0.0';
  const srv = http.createServer((req, res) => {
    auth = req.headers.authorization || null;
    const base = `http://127.0.0.1:${srv.address().port}`;
    if (req.url === '/latest') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ tag_name: 'v' + versaoServidor, body: 'Melhorias', assets: [
        { name: `ClaraStyllus-PDV-Setup-${versaoServidor}.exe`, url: base + '/exe' },
        { name: `ClaraStyllus-PDV-Setup-${versaoServidor}.exe.sha256`, url: base + '/sha' },
      ] }));
    }
    if (req.url === '/exe') return res.end(exe);
    if (req.url === '/sha') return res.end(`${sha}  arquivo.exe\n`);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  try {
    const { chamar } = novaApi();
    chamar('PUT', '/api/config', { atualizacao_url: `http://127.0.0.1:${srv.address().port}/latest`, atualizacao_token: 'abc' });
    assert.equal(chamar('GET', '/api/config').corpo.atualizacao_token, '••••••••');
    chamar('PUT', '/api/config', { atualizacao_token: '••••••••' }); // salvar a tela não apaga o token
    const s = (await chamar('POST', '/api/atualizacao/verificar')).corpo;
    assert.equal(s.versao_atual, VERSAO);
    assert.equal(s.disponivel.versao, '99.0.0');
    assert.equal(auth, 'Bearer abc');
    // Baixa em segundo plano; a instalação neste sistema (não Windows) é recusada com aviso claro.
    const inst = await chamar('POST', '/api/atualizacao/instalar');
    assert.equal(inst.status, 400);
    assert.match(inst.corpo.erro, /só funciona no Windows/);
    assert.equal((await chamar('GET', '/api/atualizacao')).corpo.baixado, true);

    versaoServidor = '0.0.1';
    const s2 = (await chamar('POST', '/api/atualizacao/verificar')).corpo;
    assert.equal(s2.disponivel, null);
  } finally {
    srv.close();
  }
});

test('atualização por arquivo valida o instalador', async () => {
  const { chamar } = novaApi();
  const r1 = await chamar('POST', '/api/atualizacao/arquivo', { arquivo: Buffer.from('oi'), nome: 'x.exe' });
  assert.equal(r1.status, 400);
  const r2 = await chamar('POST', '/api/atualizacao/arquivo', { arquivo: Buffer.alloc(200000, 1), nome: 'ClaraStyllus-PDV-Setup-9.9.9.exe' });
  assert.match(r2.corpo.erro, /não é um instalador/);
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200000)]);
  const r3 = await chamar('POST', '/api/atualizacao/arquivo', { arquivo: exe, nome: 'outro.exe' });
  assert.match(r3.corpo.erro, /nome do arquivo/);
});
