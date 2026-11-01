#!/usr/bin/env bash
# Corre TODAS las pruebas de Nómina USA (#448) más las del kiosko de México/USA que ya
# existían: ninguna fase se mergea si algo de aquí falla. Requiere el Postgres de pruebas
# (README.md) y Chromium (ya está en el contenedor; NO correr `playwright install`).
set -u
cd "$(dirname "$0")/../.."
fallas=0
for t in tests/nomina-usa/fase-*.test.js tests/kiosko-usa/zona-usa.test.js tests/kiosko-usa/tz-viaje.test.js \
         tests/kiosko-usa/e2e-kiosko-usa.js tests/nomina-usa/kiosko-e2e.js tests/nomina-usa/pantalla.js; do
  [ -f "$t" ] || continue
  if node "$t" > /tmp/nusa-prueba.log 2>&1; then echo "OK    $t ($(tail -1 /tmp/nusa-prueba.log))"
  else echo "FALLA $t"; tail -15 /tmp/nusa-prueba.log; fallas=$((fallas+1)); fi
done
echo; [ $fallas -eq 0 ] && echo "TODO VERDE" || { echo "$fallas archivo(s) con fallas"; exit 1; }
