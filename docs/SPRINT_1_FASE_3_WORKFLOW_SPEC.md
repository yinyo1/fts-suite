# Sprint 1 Fase 3 — Workflow Spec: sync automático Odoo → JSON

**Fecha:** 2026-05-11 (spec en Fase 0, implementación en Fase 3)
**Workflow target name:** `rh/empleados-master/sync`
**Dependencias:** Sprint 1 Fase 1 completo (campos custom creados) + Fase 2 (campos poblados).
**Propósito:** eliminar `auto_update_status: "manual_snapshot_temporary"` de `shared/config/empleados-master.json` → cambiar a `auto_synced`.

---

## Razón de existir

El principio autoprogresivo (PLAN §0.5) exige que cuando entra empleado nuevo en Odoo, el sistema lo refleje sin intervención manual. Hoy `empleados-master.json` es un snapshot estático generado por Claude vía MCP read-only — anti-patrón temporal documentado.

Este workflow lo elimina con un mecanismo híbrido:

1. **On-change (latencia 0):** cuando Ana Laura edita un empleado en el panel admin RH, el frontend invoca workflow → escribe Odoo + actualiza JSON en GitHub. Cambio visible inmediatamente.
2. **Cron 6am respaldo:** workflow scheduled diario que re-dumpea Odoo a JSON. Captura empleados nuevos creados directamente en Odoo (sin pasar por panel admin) y cualquier campo que Odoo recalcule internamente (`x_studio_retardos_15_dias`, etc.).

---

## Arquitectura propuesta

### Workflow A — `rh/empleados-master/sync` (cron 6am diario)

Nodos:

```
[Schedule Trigger 6am CST] 
  → [Odoo SEARCH hr.employee active=true (paginated)]
  → [Code - Build empleados-master payload]
  → [HTTP GET shared/config/empleados-master.json (current SHA)]
  → [Code - Diff + decidir commit]  
      → [IF cambios > 0]:
          → [HTTP PUT shared/config/empleados-master.json]
          → [Code - Notify si cambios estructurales (empleados nuevos / archivados)]
      → [IF cambios = 0]:
          → [Respond success no-op]
```

**Detalle nodos:**

| Nodo | Tipo | Notas |
|---|---|---|
| Schedule Trigger 6am CST | `n8n-nodes-base.scheduleTrigger` | Cron `0 6 * * *` America/Monterrey. **Primer cron del sistema** (Bloque B también lo necesitará para auto-cierre 2am). |
| Odoo SEARCH | `n8n-nodes-base.odoo` | `resource: 'custom'`, `customResource: 'hr.employee'`, `operation: 'getAll'`, `returnAll: true`, filter `[['active','=',true]]`, fields: `id, name, department_id, parent_id, resource_calendar_id, work_email, work_phone, mobile_phone, x_studio_hora_entrada, x_studio_retardos_15_dias, x_categoria_nomina, x_he_tipo, x_aplica_ppa, x_dias_laborables`. Credential `Odoo FTS`. |
| Code - Build payload | `n8n-nodes-base.code` | Construye objeto con `_meta` (timestamp, counters) + `empleados[]` ordenado por id asc. Normaliza many2one `[id, name]` a `id` + `name` separados. Marca `auto_update_status: 'auto_synced'`. |
| HTTP GET | `n8n-nodes-base.httpRequest` | `https://api.github.com/repos/yinyo1/fts-suite/contents/shared/config/empleados-master.json?ref=main` — captura SHA actual para PUT. Auth: `GitHub FTS Suite` (Header Auth). |
| Code - Diff | `n8n-nodes-base.code` | Decodifica base64 current → JSON.parse → compara count + IDs vs nuevo payload. Si idéntico (sin tocar `generated_at`), retorna `_skip: true`. Si difiere, prepara base64 nuevo + commit message dinámico ("sync: N empleados [X nuevos, Y archivados, Z editados]"). |
| HTTP PUT | `n8n-nodes-base.httpRequest` | `PUT contents/shared/config/empleados-master.json` con body `{message, content, sha, branch: 'main'}`. Auth: `GitHub FTS Suite`. |
| Code - Notify cambios estructurales | `n8n-nodes-base.code` | Si hay empleados nuevos / archivados (no solo updates), POST a webhook de notificación (email/Slack/WhatsApp). |

### Workflow B — `rh/empleados-master/update` (on-change desde panel admin)

Nodos:

```
[Webhook POST] (auth HMAC)
  → [Code - Validar payload]
  → [IF tipo == 'update_empleado']:
      → [Odoo UPDATE hr.employee {empleado_id, fields}]
      → [Trigger Workflow A] (re-dumpa JSON tras update)
      → [Respond OK]
```

**Body schema esperado por webhook:**

```json
{
  "tipo": "update_empleado",
  "empleado_id": 112,
  "fields_to_update": {
    "x_categoria_nomina": "confianza",
    "x_studio_hora_entrada": 7.0
  },
  "actor": "ana.acevedo",
  "timestamp": "2026-05-15T10:23:45Z",
  "hmac_sig": "abc123..."
}
```

**HMAC:** mismo patrón que `pmo/chat-apply`. Secret hardcoded en `Code - Validar payload` (consistencia con CLAUDE.md §3).

**Trigger Workflow A internal:** después del UPDATE Odoo, llamar al workflow A via `n8n-nodes-base.executeWorkflow` para que se re-dumpee inmediato. Latencia total panel admin → JSON deployado: ~10-15s + 90s GitHub Pages deploy.

---

## Schema empleados-master.json (post-sync)

Cambio único vs snapshot manual: `auto_update_status` y `generated_at` se reescriben dinámicamente. Resto del schema permanece igual.

```json
{
  "_meta": {
    "version": 1,
    "generated_at": "<ISO timestamp del último sync>",
    "source": "Odoo hr.employee live sync via workflow rh/empleados-master/sync",
    "auto_update_status": "auto_synced",
    "last_sync_run_id": "<n8n execution id del workflow A>",
    "last_change_summary": "1 nuevo, 2 actualizados, 0 archivados",
    "sync_cadence": "cron 6am CST + on-change vía rh/empleados-master/update",
    "total_active": 44,
    ...
  },
  "empleados": [...]
}
```

---

## Edge cases a manejar

1. **GitHub PUT race con auto-commits** del workflow `kiosk/checkin` (que escribe a `incidencias.json`/`incidencias-asistencia.json`): commits paralelos al mismo repo. GitHub maneja concurrency vía SHA — si SHA cambió entre GET y PUT, el PUT falla 409. **Solución:** retry hasta 3 veces con re-fetch del SHA. Implementar en `Code - Diff` o nodo Retry n8n.

2. **Odoo many2one normalization:** `department_id` viene como `[id, name]` o `false`. Code node debe normalizar a `null` o `{id, name}` consistentemente.

3. **Empleados archivados:** workflow A SOLO trae `active=true` por filtro. Empleados archivados desaparecen del JSON (intencional). Si un consumer asume "empleado siempre existe", debe handle `null` lookup.

4. **GitHub Pages deploy lag:** después del PUT, ~90-120s hasta que se sirva el nuevo JSON via `yinyo1.github.io`. Kiosk + panel admin deben tener cache localStorage + retry con backoff.

5. **Workflow A falla silenciosamente:** si Odoo cae, el cron 6am salta sin error visible. **Solución:** error handling con onError continueRegularOutput + log a `shared/audit-log.json` cuando falla. Notificación a Esteban si N fallos consecutivos.

6. **Schema migration futuro:** cuando se agreguen más campos custom a `hr.employee` post-Sprint 1, actualizar el fields list del Odoo SEARCH node + la lógica del Code - Build payload. Sin esto, los nuevos campos NO aparecen en el JSON aunque existan en Odoo.

---

## Testing E2E (a ejecutar al final de Fase 3)

| # | Escenario | Esperado |
|---|---|---|
| 1 | Ana edita `x_categoria_nomina` de un empleado en panel admin | Workflow B dispara → Odoo UPDATE → Workflow A re-dumpea → JSON refleja en <15s + deploy GitHub Pages en ~90s |
| 2 | Esteban crea empleado nuevo directo en Odoo Studio | Empleado NO aparece en JSON hasta el siguiente cron 6am. Mañana 6am: aparece automáticamente. |
| 3 | Cron 6am corre sin cambios en Odoo | Workflow detecta sin diff, NO crea commit. log dice "no-op sync, 0 cambios". |
| 4 | Esteban archiva empleado en Odoo | Próximo cron 6am lo remueve del JSON. Notificación a Ana de baja. |
| 5 | Odoo cae durante cron 6am | Workflow falla con error capturado. Log en audit-log.json. Notificación a Esteban si 3 fallos consecutivos. |
| 6 | 2 admins editan a la vez (Ana + Esteban) | Workflow B procesa secuencial vía n8n queue. Sin race condition. |
| 7 | Empleado fantasma (autoprogresivo): Ana crea Juan Pérez 9 AM | Cron 6am siguiente lo agrega al JSON. Pero también puede entrar al kiosk a las 9:15 AM porque kiosk consulta `kiosk/empleados v3.1` workflow LIVE (no JSON cache). ✅ Autoprogresivo. |

---

## Implementación: orden de tareas

1. Crear workflow A en n8n con todos los nodos arriba.
2. Validar runtime + test trigger manual.
3. Activar trigger 6am (deactivar al inicio para evitar dispare antes de testing).
4. Smoke test: trigger manual → verificar JSON commit en GitHub.
5. Crear workflow B.
6. HMAC secret + endpoint.
7. Frontend panel admin invoca workflow B (Sprint 1 Fase 3 paralelo).
8. E2E: editar en panel → JSON reflejado en <15s.
9. Activar trigger 6am de workflow A.
10. Actualizar `auto_update_status: "manual_snapshot_temporary"` → `"auto_synced"` en JSON.
11. Eliminar este doc del backlog (mover a "✅ DONE").

**Tiempo estimado total:** ~3h workflow + ~2h frontend panel admin + ~1h testing E2E = **~6h Fase 3** (vs estimado original 2h en PLAN, ajuste post-spec detallado).

---

## Dependencias del lado de panel admin (frontend)

El panel admin `modulos/rh/config-empleados/` debe:
- Cargar `empleados-master.json` vía fetch + cache localStorage (5 min TTL).
- Render tabla editable con celdas `x_categoria_nomina`, `x_studio_hora_entrada`, `x_aplica_ppa`, etc.
- En save: POST a webhook `rh/empleados-master/update` con HMAC sig.
- Mostrar status feedback "Guardando... ✓ Guardado, deploy en ~90s".
- Refresh JSON tras 2 min para validar deploy.

Permisos via `FTSAuth.role`: solo `admin`, `master`, `rh` pueden invocar webhook.

---

## Backlog post-Fase 3

- **Workflow C: festivos-mx-YYYY auto-generator** (Sprint 4 backlog) — cron 15-nov anual genera el JSON del año siguiente y abre PR. Reutiliza GitHub PUT pattern de este workflow.
- **Workflow D: schedules-base auto-sync** — si los perfiles de horarios-base.json se mueven a Odoo (e.g., como custom model `x_perfil_horario`), workflow similar sincroniza repo.
