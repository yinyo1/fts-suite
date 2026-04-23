# Backup workflows n8n antes del sprint

**Ejecutar ESTO antes de que Claude Code modifique cualquier workflow.** Toma 10 segundos y queda versionado en git.

## Requisitos

- `curl` (ya lo tienes)
- `jq` (instalar si falta: `brew install jq` / `apt install jq`)
- Variable de entorno `N8N_API_KEY` con la API key generada en n8n

## Setear la API key en el shell (temporalmente)

```bash
export N8N_API_KEY="pega_aqui_tu_api_key_n8n"
```

> No commitees este valor. `export` solo dura la sesión del shell actual.

## Correr el backup

Desde la raíz del repo `fts-suite`:

```bash
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" \
  "https://primary-production-5c3c.up.railway.app/api/v1/workflows?limit=250" \
  | jq '.' > docs/n8n-backup-$(date +%F).json

git add docs/n8n-backup-$(date +%F).json
git commit -m "backup: workflows n8n pre-sprint $(date +%F)"
git push origin main
```

Esto crea un archivo `docs/n8n-backup-2026-04-23.json` con TODOS los workflows (definición completa, nodos, conexiones, credenciales referenciadas por ID pero no los secretos).

## Verificación rápida

```bash
jq '.data | length' docs/n8n-backup-*.json
```

Debe retornar el número de workflows que tienes en n8n (si ves un número pequeño raro, revisa la API key o el límite del query).

Confirmar que incluye los workflows del kiosk:

```bash
jq '.data[] | select(.name | test("kiosk"; "i")) | .name' docs/n8n-backup-*.json
```

Esperado (aprox): `kiosk/checkin v4.x`, `kiosk/cerrar-registro v2.x`, `kiosk/empleados vN`, `kiosk/estado-empleado`, `kiosk/sos vN`.

## Restaurar un workflow desde el backup

Si Claude o tú rompen un workflow, puedes reimportarlo:

1. Extrae el workflow específico:
   ```bash
   jq '.data[] | select(.name == "kiosk/checkin v4.2")' docs/n8n-backup-2026-04-23.json > /tmp/kiosk-checkin-restore.json
   ```
2. En n8n UI → Workflows → `...` → **Import from File** → subir `/tmp/kiosk-checkin-restore.json`.
3. Verificar que quedó con el mismo `name` y `active` original.

> **Nota:** el import crea un workflow nuevo con `id` diferente. Si quieres restaurar IN-PLACE, usa el API directamente:
> ```bash
> curl -X PUT -H "X-N8N-API-KEY: $N8N_API_KEY" \
>   -H "Content-Type: application/json" \
>   --data @/tmp/kiosk-checkin-restore.json \
>   "https://primary-production-5c3c.up.railway.app/api/v1/workflows/<ID>"
> ```
> Reemplaza `<ID>` con el id del workflow a restaurar.

## Credenciales

El backup **NO incluye secretos** (tokens, API keys). Solo referencias por nombre/ID. Esto es intencional por seguridad. Si reimportas en un n8n nuevo, tendrás que re-conectar las credenciales manualmente.

## Cuándo correr este backup

- **Obligatorio**: una vez al iniciar el sprint (antes del primer prompt que toque workflows).
- **Recomendado**: al final de cada día del sprint, como snapshot incremental (`$(date +%F-%H%M)` en el nombre).
- **Antes de un cambio grande**: si vas a reescribir un workflow importante, haz snapshot justo antes.
