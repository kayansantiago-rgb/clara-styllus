#!/bin/sh
# Inicia o PDV e abre o navegador (Linux/macOS).
cd "$(dirname "$0")"
( sleep 2; (xdg-open http://localhost:3456 || open http://localhost:3456) >/dev/null 2>&1 ) &
exec node --disable-warning=ExperimentalWarning server.js
