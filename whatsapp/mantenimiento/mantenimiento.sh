#!/bin/sh
# ═══════════════════════════════════════════════════════════════════════════
# memoria-mantenimiento · servicio cron de Railway (imagen postgres:17-alpine)
#
# Cada corrida, en este orden (cada paso reporta; uno que falla no tapa a los demás):
#   1. Contraseñas de los roles memoria_* desde variables de Railway (nunca git,
#      nunca argv: psql las lee del entorno con \getenv y las cita con :'pw').
#   2. Particiones: memoria.asegurar_particiones(3).
#   3. Respaldo: pg_dump -Fc de TODA fts_suite (memoria, comercial, lo que haya)
#      → bucket memoria-respaldos, con manifiesto de conteos → memoria.respaldo.
#   4. Prueba de restauración: baja el dump DEL BUCKET (no el local), levanta un
#      Postgres efímero dentro del contenedor, restaura y compara conteos contra
#      el manifiesto → memoria.respaldo_prueba.
#
# Variables (referencias de Railway, ninguna escrita a mano):
#   PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD      ← ${{fts-suite-db.*}}
#   PW_CAPTURA PW_MOTOR PW_ADMIN PW_PASARELA         ← ${{memoria-receptor.*}} etc.
#   S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_ENDPOINT  ← ${{memoria-respaldos.*}}
# ═══════════════════════════════════════════════════════════════════════════
set -u
trap '' PIPE      # si el psql de la instantánea muere antes de tiempo, el script sigue y lo reporta (revisión 2, #13)
INICIO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
log() { echo "[mantenimiento] $*"; }
q()   { psql -X -v ON_ERROR_STOP=1 -qAt "$@"; }

apk add --no-cache curl >/dev/null 2>&1 || { log "no pude instalar curl"; }

# ── 1. Contraseñas ──────────────────────────────────────────────────────────
roles_ok=0
for par in "memoria_captura:PW_CAPTURA" "memoria_motor:PW_MOTOR" "memoria_admin:PW_ADMIN" "memoria_pasarela:PW_PASARELA"; do
  rol=${par%%:*}; var=${par#*:}
  eval "pw=\${$var:-}"
  if [ -z "$pw" ] || [ ${#pw} -lt 24 ]; then log "rol $rol: variable $var ausente o corta, no se toca"; continue; fi
  if printf '%s' "$pw" | grep -q '\${{'; then log "rol $rol: la referencia no se resolvió, no se toca"; continue; fi
  # psql lee la contraseña del ENTORNO (\getenv): no pasa por argv (/proc/*/cmdline).
  # Y se le pide al servidor no registrar la sentencia si falla (log_min_error_statement):
  # el ALTER ROLE lleva la contraseña en texto. Esos SET exigen superusuario; si no lo es,
  # se ignoran y queda el valor del servidor (revisión, hallazgo 5).
  if q -v rol="$rol" -v var="$var" >/dev/null 2>&1 <<'SQL'
\set ON_ERROR_STOP 0
SET log_min_error_statement = panic;
SET log_statement = none;
\set ON_ERROR_STOP 1
\getenv pw :var
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'rol', :'pw') \gexec
SQL
  then
    roles_ok=$((roles_ok+1))
  else log "rol $rol: ALTER ROLE falló"; fi
done
log "contraseñas aplicadas: $roles_ok"

# ── 2. Particiones ──────────────────────────────────────────────────────────
n=$(q -c "SELECT memoria.asegurar_particiones(3)" 2>&1) && log "particiones nuevas: $n" || log "particiones: FALLO $n"
d=$(q -c "SELECT count(*) FROM memoria.evento_default" 2>/dev/null); log "renglones en evento_default: ${d:-?} (debe ser 0)"

# ── 3. Respaldo ─────────────────────────────────────────────────────────────
s3put() { curl -sS --fail --aws-sigv4 "aws:amz:${S3_REGION:-auto}:s3" --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" -T "$1" "$S3_URL/$2"; }
s3get() { curl -sS --fail --aws-sigv4 "aws:amz:${S3_REGION:-auto}:s3" --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" -o "$2" "$S3_URL/$1"; }
S3_URL="${S3_ENDPOINT%/}/${S3_BUCKET}"      # path-style: funciona igual con virtual-hosted en Tigris
FECHA=$(date -u +%Y/%m/%d)
CLAVE="pg_dump/${FECHA}/fts_suite_$(date -u +%Y%m%dT%H%M%SZ).dump"
DUMP=/tmp/fts_suite.dump
MANIF=/tmp/manifiesto.json

# Instantánea compartida: el manifiesto y pg_dump ven EXACTAMENTE los mismos datos,
# aunque la captura siga insertando. Sin esto, la prueba de restauración daba falsas
# alarmas cada vez que entraba un evento entre el conteo y el dump (revisión, hallazgo 4).
SNAP=""; rm -f /tmp/snap.in /tmp/snap.out; mkfifo /tmp/snap.in
psql -X -qAt < /tmp/snap.in > /tmp/snap.out 2>/tmp/snap.err &
SNAP_PID=$!
exec 3>/tmp/snap.in
echo "BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT pg_export_snapshot();" >&3
for _ in 1 2 3 4 5 6 7 8 9 10; do SNAP=$(head -1 /tmp/snap.out 2>/dev/null); [ -n "$SNAP" ] && break; sleep 1; done
if [ -n "$SNAP" ]; then log "instantánea $SNAP"; SNAP_SQL="SET TRANSACTION SNAPSHOT '$SNAP';"; DUMP_SNAP="--snapshot=$SNAP"
else log "sin instantánea compartida: $(head -c 200 /tmp/snap.err)"; SNAP_SQL=""; DUMP_SNAP=""; fi

# Manifiesto: conteo EXACTO por tabla de usuario (base chica; si crece, se muestrea).
q -c "BEGIN ISOLATION LEVEL REPEATABLE READ" -c "$SNAP_SQL SELECT 1" -c "SELECT coalesce(json_object_agg(format('%I.%I', n.nspname, c.relname),
        (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint
        ORDER BY 1), '{}')
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r','p') AND NOT c.relispartition
        AND n.nspname NOT IN ('pg_catalog','information_schema','memoria_pasarela') AND n.nspname NOT LIKE 'pg_toast%'" -c "COMMIT" > "$MANIF.raw" 2>/tmp/manif.err \
  && grep '^{' "$MANIF.raw" | tail -1 > "$MANIF" \
  || { log "manifiesto FALLO: $(head -c 300 /tmp/manif.err)"; echo '{}' > "$MANIF"; }

ok_dump=false; err=""
# memoria_pasarela (sesión de WhatsApp de Evolution) NO se respalda: son las llaves con las
# que se suplanta el teléfono vinculado, y fts_admin puede ni siquiera leerlas. Si se pierden,
# se vuelve a escanear el QR (revisión 2, #2).
if pg_dump -Fc -Z 6 --exclude-schema=memoria_pasarela $DUMP_SNAP -f "$DUMP" 2>/tmp/dump.err; then
  BYTES=$(wc -c < "$DUMP"); SHA=$(sha256sum "$DUMP" | cut -d' ' -f1)
  if s3put "$DUMP" "$CLAVE" >/dev/null 2>/tmp/put.err; then ok_dump=true; else err="subida: $(head -c 300 /tmp/put.err)"; fi
else BYTES=0; SHA=""; err="pg_dump: $(head -c 300 /tmp/dump.err)"; fi
exec 3>&-; wait "$SNAP_PID" 2>/dev/null || true      # cierra la transacción que sostenía la instantánea
log "respaldo ok=$ok_dump bytes=${BYTES:-0} clave=$CLAVE ${err}"

RID=$(q -v tipo="pg_dump" -v dest="railway_bucket:${S3_BUCKET}/${CLAVE}" -v bytes="${BYTES:-0}" -v sha="${SHA}" \
        -v ok="$ok_dump" -v err="$err" -v ini="$INICIO" -v manif="$(cat "$MANIF")" <<'SQL'
SET ROLE memoria_admin;
INSERT INTO memoria.respaldo (tipo, destino, bytes, sha256, manifiesto, ok, error, inicio)
VALUES (:'tipo', :'dest', nullif(:'bytes','0')::bigint, nullif(:'sha',''), :'manif'::jsonb, :'ok'::boolean, nullif(:'err',''), :'ini'::timestamptz)
RETURNING id;
SQL
)
RID=$(echo "$RID" | tail -1); log "memoria.respaldo id=$RID"

# ── 4. Prueba de restauración (sobre la copia del bucket) ───────────────────
T0=$(date +%s); ver='[]'; ok_rest=false
if [ "$ok_dump" = "true" ]; then
  rm -f /tmp/bajado.dump
  if s3get "$CLAVE" /tmp/bajado.dump 2>/tmp/get.err && [ "$(sha256sum /tmp/bajado.dump | cut -d' ' -f1)" = "$SHA" ]; then
    E=/tmp/efimero; rm -rf "$E"; mkdir -p "$E"; chown postgres "$E"
    su postgres -c "initdb -D $E/data -A trust -U restaurador >/dev/null && pg_ctl -D $E/data -o '-p 55432 -k $E -c listen_addresses=' -l $E/log -w start >/dev/null" \
      && psql -X -h "$E" -p 55432 -U restaurador -d postgres -qc 'CREATE DATABASE prueba' \
      && { pg_restore -h "$E" -p 55432 -U restaurador -d prueba --no-owner --no-privileges /tmp/bajado.dump 2>/tmp/rest.err; true; }
    # Conteos tabla por tabla contra el manifiesto (los roles no existen en el efímero: --no-owner).
    res=$(psql -X -h "$E" -p 55432 -U restaurador -d prueba -qAt -v manif="$(cat "$MANIF")" <<'SQL'
WITH m AS (SELECT key AS tabla, value::bigint AS esperado FROM json_each_text(:'manif'::json)),
     c AS (SELECT tabla, esperado,
             CASE WHEN to_regclass(tabla) IS NULL THEN NULL
                  ELSE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %s', tabla), false, true, '')))[1]::text::bigint END AS obtenido
           FROM m)
SELECT count(*) FILTER (WHERE obtenido IS DISTINCT FROM esperado) || '|' || count(*) || '|' ||
       coalesce(json_agg(json_build_object('check', tabla, 'esperado', esperado, 'obtenido', obtenido))::text, '[]')
FROM c;
SQL
)
    malos=${res%%|*}; resto=${res#*|}; total=${resto%%|*}; ver=${resto#*|}
    [ "${total:-0}" -gt 0 ] && [ "${malos:-1}" = "0" ] && ok_rest=true
    log "restauración: tablas=$total distintas_o_faltantes=$malos ok=$ok_rest"
    su postgres -c "pg_ctl -D $E/data -m fast stop >/dev/null" || true
  else log "restauración: no pude bajar el dump o el sha256 no cuadra: $(head -c 200 /tmp/get.err 2>/dev/null)"; fi
fi
DUR=$(( $(date +%s) - T0 ))
q -v rid="${RID:-}" -v ok="$ok_rest" -v ver="${ver:-[]}" -v dur="$DUR" <<'SQL' >/dev/null && log "memoria.respaldo_prueba registrada" || log "no pude registrar la prueba"
SET ROLE memoria_admin;
INSERT INTO memoria.respaldo_prueba (respaldo_id, ok, verificaciones, duracion_s)
VALUES (nullif(:'rid','')::bigint, :'ok'::boolean, :'ver'::jsonb, :'dur'::int);
SQL
rm -f "$DUMP" /tmp/bajado.dump

# ── 5. Pasarela: asegurar la instancia de Evolution (NUNCA la vincula, NUNCA envía) ──
# Sólo crea/ajusta la instancia 'fts-memoria' y su webhook hacia el receptor por
# red privada. El QR lo escanea una persona (docs/whatsapp/VINCULAR-MANANA.md).
if [ -n "${EVO_URL:-}" ] && [ -n "${EVO_API_KEY:-}" ] && [ -n "${MEMORIA_HMAC_SECRET:-}" ]; then
  apk add --no-cache openssl >/dev/null 2>&1 || true
  TOKEN=$(printf '%s' evolution-webhook | openssl dgst -sha256 -hmac "$MEMORIA_HMAC_SECRET" | awk '{print $NF}' | cut -c1-40)
  WH="${RECEPTOR_URL:-http://memoria-receptor.railway.internal:8080}/v1/evolution/${TOKEN}"
  INST=fts-memoria
  EVENTOS='["MESSAGES_UPSERT","GROUPS_UPSERT","GROUP_UPDATE"]'
  existe=$(curl -sS -m 20 -H "apikey: $EVO_API_KEY" "$EVO_URL/instance/fetchInstances?instanceName=$INST" 2>/dev/null | grep -c "\"$INST\"")
  if [ "${existe:-0}" = "0" ]; then
    code=$(curl -sS -m 30 -o /tmp/evo.out -w '%{http_code}' -X POST -H "apikey: $EVO_API_KEY" -H 'content-type: application/json' "$EVO_URL/instance/create" \
      -d "{\"instanceName\":\"$INST\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":false,
           \"groupsIgnore\":false,\"rejectCall\":false,\"alwaysOnline\":false,\"readMessages\":false,\"readStatus\":false,\"syncFullHistory\":false,
           \"webhook\":{\"url\":\"$WH\",\"byEvents\":false,\"base64\":true,\"events\":$EVENTOS}}")
    log "pasarela: instancia creada http=$code"
  else
    code=$(curl -sS -m 30 -o /tmp/evo.out -w '%{http_code}' -X POST -H "apikey: $EVO_API_KEY" -H 'content-type: application/json' "$EVO_URL/webhook/set/$INST" \
      -d "{\"webhook\":{\"enabled\":true,\"url\":\"$WH\",\"byEvents\":false,\"base64\":true,\"events\":$EVENTOS}}")
    code2=$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X POST -H "apikey: $EVO_API_KEY" -H 'content-type: application/json' "$EVO_URL/settings/set/$INST" \
      -d '{"rejectCall":false,"groupsIgnore":false,"alwaysOnline":false,"readMessages":false,"readStatus":false,"syncFullHistory":false}')
    log "pasarela: instancia ya existía; webhook http=$code settings http=$code2"
  fi
  estado=$(curl -sS -m 20 -H "apikey: $EVO_API_KEY" "$EVO_URL/instance/connectionState/$INST" 2>/dev/null | grep -o '"state":"[a-z]*"')
  log "pasarela: estado de conexión ${estado:-desconocido} (esperado antes del QR: close/connecting)"
else
  log "pasarela: sin EVO_URL/EVO_API_KEY, se omite"
fi

log "fin: respaldo=$ok_dump restauracion=$ok_rest"
[ "$ok_dump" = "true" ] && [ "$ok_rest" = "true" ]
