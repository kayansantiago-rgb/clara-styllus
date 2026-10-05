'use strict';

/**
 * Envio direto para a impressora (sem o diálogo de impressão do navegador).
 *
 * Windows: compila uma vez o ImprimirRaw.cs com o csc.exe do .NET Framework (vem com o
 * Windows 10/11) e usa o spooler em modo RAW. Linux/macOS: usa o CUPS (`lp -o raw`).
 * Com a variável PDV_IMPRESSAO_PASTA definida, grava os arquivos numa pasta em vez de imprimir
 * (útil para testar sem impressora).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const FONTE_CS = path.join(__dirname, 'ImprimirRaw.cs');

function executar(cmd, args, opcoes = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30000, windowsHide: true, encoding: 'utf8', ...opcoes }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || '').trim() || err.message;
        return reject(new Error(msg));
      }
      resolve(stdout);
    });
  });
}

let compilando = null;

/** Caminho do ImprimirRaw.exe, compilando na primeira vez (ou quando o fonte mudar). */
function ferramentaWindows() {
  if (compilando) return compilando;
  compilando = (async () => {
    const fonte = fs.readFileSync(FONTE_CS);
    const hash = crypto.createHash('sha1').update(fonte).digest('hex').slice(0, 10);
    const pasta = path.join(os.tmpdir(), 'clara-styllus-pdv');
    const exe = path.join(pasta, `ImprimirRaw-${hash}.exe`);
    if (fs.existsSync(exe)) return exe;
    fs.mkdirSync(pasta, { recursive: true });
    const windir = process.env.WINDIR || 'C:\\Windows';
    const candidatos = [
      path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
      path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
    ];
    const csc = candidatos.find((c) => fs.existsSync(c));
    if (!csc) throw new Error('Não encontrei o .NET Framework 4 (csc.exe) para a impressão direta.');
    await executar(csc, ['/nologo', '/optimize', '/codepage:65001', '/target:exe', `/out:${exe}`, FONTE_CS]);
    return exe;
  })();
  compilando.catch(() => { compilando = null; });
  return compilando;
}

async function listarImpressoras() {
  const pasta = process.env.PDV_IMPRESSAO_PASTA;
  if (pasta) return ['Arquivo (teste)'];
  if (process.platform === 'win32') {
    const saida = await executar(await ferramentaWindows(), ['listar']);
    return saida.replace(/\uFEFF/g, '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  try {
    const saida = await executar('lpstat', ['-e']);
    return saida.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Envia o buffer para a impressora. `nome` serve para o arquivo de teste. */
async function enviar(impressora, dados, nome = 'impressao') {
  if (!impressora) {
    throw new Error('Nenhuma impressora escolhida. Configure em Configurações → Impressão.');
  }
  const pasta = process.env.PDV_IMPRESSAO_PASTA;
  if (pasta) {
    fs.mkdirSync(pasta, { recursive: true });
    const arq = path.join(pasta, `${Date.now()}-${nome}.bin`);
    fs.writeFileSync(arq, dados);
    return { arquivo: arq };
  }
  const tmp = path.join(os.tmpdir(), `clara-styllus-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.prn`);
  fs.writeFileSync(tmp, dados);
  try {
    if (process.platform === 'win32') {
      await executar(await ferramentaWindows(), ['enviar', impressora, tmp]);
    } else {
      await executar('lp', ['-d', impressora, '-o', 'raw', tmp]);
    }
  } finally {
    fs.rm(tmp, { force: true }, () => {});
  }
  return { ok: true };
}

/** Nomes típicos de impressoras térmicas de cupom (Elgin, Bematech, Epson TM, Daruma, POS-80...). */
const TERMICA = /(elgin|bematech|epson\s*tm|\btm-?t|daruma|tanca|sweda|control\s*id|diebold|knup|jetway|gertec|pos[-\s]?(58|80)|\b(58|80)\s*mm|thermal|t[eé]rmica|receipt|cupom|i9|i7|mp-?4200|generic.*text|gen[eé]rica.*texto)/i;

/** Procura entre as impressoras instaladas uma que pareça ser a térmica de cupom. */
async function detectarImpressoraCupom() {
  const lista = await listarImpressoras();
  return lista.find((n) => TERMICA.test(n)) || (lista.length === 1 ? lista[0] : '');
}

module.exports = { listarImpressoras, enviar, detectarImpressoraCupom };
