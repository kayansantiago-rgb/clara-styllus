'use strict';

const { abrirBanco } = require('../src/db');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { criarApi } = require('../src/api');

/** API em memória, já logada como administrador (a não ser que logar = false). */
function novaApi({ logar = true } = {}) {
  const db = abrirBanco(':memory:');
  const pastaBackup = fs.mkdtempSync(path.join(os.tmpdir(), 'pdv-backup-teste-'));
  const despachar = criarApi(db, { pastaBackup });
  let token = null;
  const chamar = (metodo, caminho, corpo) => {
    const url = new URL(caminho, 'http://x');
    const r = despachar(metodo, url.pathname, url.searchParams, corpo, token);
    if (r && typeof r.then === 'function') {
      return r.then((x) => {
        if (x && x.sessao !== undefined) token = x.sessao;
        return x;
      });
    }
    if (r && r.sessao !== undefined) token = r.sessao;
    return r;
  };
  if (logar) {
    chamar('POST', '/api/primeiro-acesso', { nome: 'Clara', login: 'clara', senha: '1234' });
  }
  return { db, chamar, pastaBackup, despachar, sair: () => chamar('POST', '/api/logout') };
}

module.exports = { novaApi };
