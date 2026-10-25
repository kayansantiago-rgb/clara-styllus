#!/usr/bin/env bash
# Gera o instalador do Windows: dist/ClaraStyllus-PDV-Setup-<versão>.exe
# Requisitos (Linux ou WSL): bash, curl, unzip, sha256sum, node e makensis (pacote "nsis").
set -euo pipefail

NODE_VERSAO=22.23.3
NODE_SHA256=2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71
WINSW_VERSAO=2.12.0
WINSW_SHA256=b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$RAIZ/instalador/.cache"
DIST="$RAIZ/dist"
STAGING="$DIST/staging"
VERSAO="$(node -p "require('$RAIZ/package.json').version")"

baixar() { # url destino sha256
  if [ ! -f "$2" ] || ! echo "$3  $2" | sha256sum -c --quiet - 2>/dev/null; then
    echo "Baixando $1"
    curl -fsSL --retry 3 -o "$2.tmp" "$1"
    echo "$3  $2.tmp" | sha256sum -c --quiet -
    mv "$2.tmp" "$2"
  fi
}

mkdir -p "$CACHE"
NODE_ZIP="$CACHE/node-v$NODE_VERSAO-win-x64.zip"
WINSW_EXE="$CACHE/WinSW-$WINSW_VERSAO.NET461.exe"
baixar "https://nodejs.org/dist/v$NODE_VERSAO/node-v$NODE_VERSAO-win-x64.zip" "$NODE_ZIP" "$NODE_SHA256"
baixar "https://github.com/winsw/winsw/releases/download/v$WINSW_VERSAO/WinSW.NET461.exe" "$WINSW_EXE" "$WINSW_SHA256"

echo "Montando arquivos da versão $VERSAO"
rm -rf "$STAGING"
mkdir -p "$STAGING/app" "$STAGING/node"
cp -r "$RAIZ/server.js" "$RAIZ/package.json" "$RAIZ/src" "$RAIZ/public" "$STAGING/app/"
unzip -q -j "$NODE_ZIP" "node-v$NODE_VERSAO-win-x64/node.exe" "node-v$NODE_VERSAO-win-x64/LICENSE" -d "$STAGING/node"
cp "$WINSW_EXE" "$STAGING/ClaraStyllusPDV.exe"
cp "$RAIZ/instalador/ClaraStyllusPDV.xml" "$RAIZ/instalador/icone.ico" "$STAGING/"
cat > "$STAGING/LICENCAS.txt" <<TXT
Clara Styllus PDV $VERSAO

Componentes de terceiros incluídos:
- Node.js $NODE_VERSAO (licença MIT e outras; veja node\\LICENSE) — https://nodejs.org
- WinSW $WINSW_VERSAO (licença MIT) — https://github.com/winsw/winsw
- Fontes Inter e Playfair Display (SIL Open Font License 1.1; veja app\\public\\fonts)
- ONNX Runtime Web (licença MIT) e modelo U^2-Net para tirar o fundo das fotos (Apache 2.0; veja app\\public\\vendor)
TXT

SAIDA="$DIST/ClaraStyllus-PDV-Setup-$VERSAO.exe"
makensis -V2 -DVERSAO="$VERSAO" -DSTAGING="$STAGING" -DSAIDA="$SAIDA" "$RAIZ/instalador/clara-styllus.nsi"
( cd "$DIST" && sha256sum "$(basename "$SAIDA")" > "$(basename "$SAIDA").sha256" )
echo "Pronto: $SAIDA ($(du -h "$SAIDA" | cut -f1))"

# Instalador do computador extra: só a tela que procura o caixa na rede (logo e ícone embutidos).
mkdir -p "$STAGING/extra"
node -e '
const fs = require("fs");
const [modelo, cs, icone, saida] = process.argv.slice(1);
const uri = (f) => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
fs.writeFileSync(saida, fs.readFileSync(modelo, "utf8").replace("{{LOGO}}", uri(cs)).replace("{{ICONE}}", uri(icone))
  .replace("{{PORTA}}", "3456").replace("{{ENDERECO}}", ""));
' "$RAIZ/instalador/extra/abrir.modelo.html" "$RAIZ/public/img/cs.png" "$RAIZ/public/img/icone.png" "$STAGING/extra/abrir.html"
SAIDA_EXTRA="$DIST/ClaraStyllus-Computador-Extra-Setup-$VERSAO.exe"
makensis -V2 -DVERSAO="$VERSAO" -DSTAGING="$STAGING" -DSAIDA="$SAIDA_EXTRA" "$RAIZ/instalador/extra.nsi"
echo "Pronto: $SAIDA_EXTRA ($(du -h "$SAIDA_EXTRA" | cut -f1))"
