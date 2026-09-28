#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# CI del frente memoria (#328). Lo corre .github/workflows/memoria.yml y se puede
# correr igual en local. Todo sintético; contraseñas de roles sólo de prueba.
#   Requiere: bun, psql, un Postgres 17 vacío (PGHOST/PGPORT/PGUSER superusuario,
#   PGDATABASE), y opcionalmente ffmpeg/ffprobe (FFMPEG/FFPROBE).
# ═══════════════════════════════════════════════════════════════════════════
set -eu
RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
cd "$RAIZ"
fallas=0
paso() { echo; echo "── $*"; }
mal() { echo "FALLA: $*"; fallas=$((fallas+1)); }

paso "1. Migraciones memoria_* en orden, cada una en su transacción"
for f in db/migrations/memoria/memoria_*.sql; do
  if grep -nE '[$][0-9]' "$f" >/dev/null; then mal "$f trae \$+dígito (el nodo Postgres de n8n lo toma como parámetro)"; fi
  psql -X -v ON_ERROR_STOP=1 -1 -q -f "$f" >/dev/null 2>/tmp/mig.err || { mal "$f no aplica"; grep -v NOTICE /tmp/mig.err | head -5; }
  echo "ok $(basename "$f")"
done
ULTIMA=$(ls db/migrations/memoria/memoria_*.sql | tail -1)
psql -X -v ON_ERROR_STOP=1 -1 -q -f "$ULTIMA" >/dev/null 2>&1 && echo "ok re-aplicar $(basename "$ULTIMA") (idempotente)" || mal "$ULTIMA no es idempotente"

paso "2. Batería de motores (se revierte sola)"
R=$(psql -X -qAt -c "SELECT (memoria.prueba_motores()) - 'casos'")
echo "$R"
echo "$R" | grep -q '"ok": true' || { mal "batería"; psql -X -qAt -c "SELECT r->>'caso'||' esperado='||(r->>'esperado')||' obtenido='||coalesce(r->>'obtenido','null') FROM jsonb_array_elements((memoria.prueba_motores())->'casos') r WHERE r->>'esperado' IS DISTINCT FROM r->>'obtenido'"; }
RES=$(psql -X -qAt -c "SELECT (SELECT count(*) FROM memoria.propuesta)||'/'||(SELECT count(*) FROM memoria.canal WHERE id_externo LIKE 'prueba-motor%')")
[ "$RES" = "0/0" ] && echo "residuos 0" || mal "la batería dejó residuos ($RES)"

paso "3. Roles de prueba (contraseña sintética, sólo para esta base)"
psql -X -q -c "ALTER ROLE memoria_captura LOGIN PASSWORD 'ci-solo-prueba'" -c "ALTER ROLE memoria_motor LOGIN PASSWORD 'ci-solo-prueba'"

paso "4. Pruebas unitarias (parser, cargador, poda, sha256 de n8n, derivados)"
bun test whatsapp/historico whatsapp/mantenimiento || mal "bun test (parser, cargador, poda)"
bun whatsapp/n8n/sha256.test.js || mal "sha256 de n8n"          # script propio: termina el proceso, va aparte
MEMORIA_TEST_PG=1 PGUSER= MEMORIA_CAPTURA_PASSWORD=ci-solo-prueba MEMORIA_MOTOR_PASSWORD=ci-solo-prueba \
  bun test whatsapp/derivados || mal "derivados"

paso "5. El paquete del receptor corresponde a su fuente"
( cd whatsapp/receptor && bun build --target=bun index.ts --outfile /tmp/receptor-ci.js >/dev/null )   # desde su carpeta: Bun escribe la ruta en el paquete
A=$(sha256sum /tmp/receptor-ci.js | cut -d' ' -f1); B=$(sha256sum whatsapp/receptor/dist/receptor.js | cut -d' ' -f1)
[ "$A" = "$B" ] && echo "dist/receptor.js = build de index.ts ($A)" || mal "dist/receptor.js no es el build de index.ts: vuelve a correr bun build"

paso "6. Autoprueba del receptor contra esta base (13 casos)"
rm -rf /tmp/memoria-local
S=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'); P=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
( cd whatsapp/receptor && PGUSER=memoria_captura HOST=127.0.0.1 PORT=18999 MEMORIA_CAPTURA_PASSWORD=ci-solo-prueba \
    MEMORIA_HMAC_SECRET=$S MEMORIA_PIMIENTA=$P ALMACEN=local AUTOPRUEBA=1 timeout 60 bun index.ts > /tmp/receptor-ci.log 2>&1 ) &
RPID=$!
for _ in $(seq 1 55); do grep -q "\[autoprueba\] corrida=" /tmp/receptor-ci.log 2>/dev/null && break; sleep 1; done
grep "\[autoprueba\]" /tmp/receptor-ci.log || true
grep -q "\[autoprueba\] corrida=.* 13/13 OK" /tmp/receptor-ci.log || { mal "autoprueba del receptor"; grep "\[error\]" /tmp/receptor-ci.log | head -5; }
kill "$RPID" 2>/dev/null || true

echo
[ "$fallas" -eq 0 ] && { echo "CI memoria: TODO VERDE"; exit 0; } || { echo "CI memoria: $fallas falla(s)"; exit 1; }
