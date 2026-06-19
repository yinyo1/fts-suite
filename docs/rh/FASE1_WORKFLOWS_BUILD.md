# RH Alta/Baja — FASE 1: workflows n8n (build, 2026-06-19)

Branch `feat/rh-alta-baja-empleados`. Diseño: [`ALTA_BAJA_EMPLEADOS_DISENO.md`](ALTA_BAJA_EMPLEADOS_DISENO.md) Rev 2.
**FASE 0 cerrada:** un CREATE real de `hr.employee` (id 152, auto-archivado y verificado `active=false`) pasó con el set GRUPO A **sin** campos extra de `hr.version` → riesgo #1 descartado.

**5 workflows generados** por `scripts/local/rh/gen-rh-workflows.js` (gitignored) → JSON en `scripts/local/rh/*.json` (gitignored, en disco de Esteban para importar). Self-check: **40 nodos · 0 conexiones rotas · 0 syntax err · customResource presente en los 10 nodos Odoo del generador**.

> ⚠️ Estos workflows hacen **WRITES a producción** (crear/archivar/reactivar empleados). Quedan **inactivos** hasta que Esteban haga **Publish**. No están en CLAUDE.md §2 todavía (se agregan cuando estén vivos + smoke-tested).

---

## Importar + activar (Esteban, por cada uno de los 5)

1. n8n → **Import from File** → `scripts/local/rh/<archivo>.json`.
2. 🔴 **`customResource` se BLANQUEA al importar** (bug §3). Rellenar a mano en cada nodo Odoo (tabla abajo).
3. Revisar credencial **`Odoo FTS`** en cada nodo Odoo (a veces se desasigna).
4. El **webhook ID se regenera** al importar (ok, el path no cambia).
5. **Publish** (toggle Active) — el API de esta instancia **no** deja activar vía MCP.

### Checklist `customResource` por nodo

| Workflow (archivo) | Nodo Odoo | customResource |
|---|---|---|
| `rhempleadocrear.json` | Odoo - CREATE empleado | `hr.employee` |
| `rhempleadoarchivar.json` | Odoo - SEARCH att abierta | `hr.attendance` |
| `rhempleadoarchivar.json` | Odoo - UPDATE archivar | `hr.employee` |
| `rhempleadoreactivar.json` | Odoo - UPDATE reactivar | `hr.employee` |
| `rhempleadolookups.json` | Odoo - getAll deptos | `hr.department` |
| `rhempleadolookups.json` | Odoo - getAll managers | `hr.employee` |
| `rhempleadolookups.json` | Odoo - getAll jobs | `hr.job` |
| `rhempleadolookups.json` | Odoo - getAll calendars | `resource.calendar` |
| `rhempleadolookups.json` | Odoo - getAll reasons | `hr.departure.reason` |
| `rhempleadolookups.json` | Odoo - getAll companies | `res.company` |
| `rhempleadosarchivados.json` | Odoo - getAll archivados | `hr.employee` |

*(Los nodos UPDATE conservan `operation:update` + `customResourceId` tras importar; solo `customResource` se vacía.)*

---

## Mapa de los 5 workflows

### 1. `rh/empleado/crear` — POST `/webhook/rh/empleado/crear`
`Webhook → Code prep (valida requeridos + normaliza) → Odoo CREATE hr.employee → Code result → HTTP refresh → Respond`
- CREATE **sin** `operation` + `fieldsToCreateOrUpdate` (15 campos GRUPO A + foto + company). Opcionales (`private_email/mobile/work_phone/job_id/x_categoria_nomina/image_1920`) van con `|| false` → Odoo los deja vacíos.
- `image_1920`: el prep quita el prefijo `data:...;base64,`. **PIN manual, SIN validación de unicidad** (decisión #1).
- Respuesta: `{ ok, employee_id, name, pin }`.

### 2. `rh/empleado/archivar` — POST `/webhook/rh/empleado/archivar` (12 nodos)
`Webhook → prep → HTTP GET incidencias → SEARCH att abierta → col → Code checks → IF bloqueado → [true] Respond bloqueo · [false] UPDATE active=false → result → HTTP refresh → Respond ok`
- 🔴 **BLOQUEA (decisión Esteban #1):** si hay attendance sin `check_out` → **NO archiva**, responde `{ ok:false, blocked:true, error, attendance_ids }`. El frontend muestra el error y no cierra el form (RH cierra el turno primero).
- Incidencias `pendiente_*` → solo `warnings[]` (no bloquean).
- Rama no-bloqueada: `UPDATE active=false` + `departure_date` (default hoy) + `departure_reason_id` + `departure_description`. Respuesta `{ ok, empleado_id, departure_date, warnings }`.

### 3. `rh/empleado/reactivar` — POST `/webhook/rh/empleado/reactivar`
`Webhook → Code prep → Odoo UPDATE active=true (+ limpia departure_date/reason) → Code result → HTTP refresh → Respond`  (decisión #8).

### 4. `rh/empleado/lookups` — GET `/webhook/rh/empleado/lookups`
`Webhook → getAll deptos → col → getAll managers → col → getAll jobs → col → getAll calendars → col → getAll reasons → col → getAll companies → Code combine → Respond`
- Todo leído de Odoo en runtime (decisiones #3 deptos, #9 companies). Respuesta: `{ departments, managers, jobs, calendars, reasons, companies }`.
- Nodos `Code col` colapsan a 1 item entre getAll (evita el multiplicado de ejecuciones, patrón watchdog).

### 5. `rh/empleados/archivados` — GET `/webhook/rh/empleados/archivados`
`Webhook → Odoo getAll (filterRequest active=false) → Code map → Respond`
- **Verificado read-only:** dominio explícito `active=false` devuelve los archivados (85) **sin** necesitar `context active_test`.
- Respuesta: `{ total, empleados:[{ id, name, department, job, work_email, departure_date, departure_reason, departure_description, last_check_out, create_date }] }` ordenado por fecha de baja desc.

---

## Re-sync inmediato (decisión #5)
Tras crear/archivar/reactivar, `HTTP - refresh master` hace **POST** a `https://primary-production-5c3c.up.railway.app/webhook/rh/empleados-master/refresh` (best-effort, `onError:continue`). ⚠️ **Verificar el path real** del webhook del workflow `rh/empleados-master/sync` (id `5nzVRsCMlCZlq5s4`) — asumí `/rh/empleados-master/refresh` por CLAUDE.md §2.

---

## Decisiones abiertas / a verificar (FASE 1)

1. ✅ **RESUELTO (decisión Esteban #1): `archivar` BLOQUEA** si hay attendance abierta — no archiva, devuelve `{ok:false, blocked:true, error}`; RH cierra el turno primero. *(Implementado: `Code checks` → `IF bloqueado` → `Respond bloqueo`.)*
2. **Shape de `incidencias-asistencia.json`:** el filtro asume `{ incidencias:[{ empleado_id, status }] }` con `status` que empieza con `pendiente`. El Code es defensivo (prueba `.incidencias` / array / `.data.incidencias`), pero **verificar los nombres reales** en el primer smoke.
3. ✅ **CONFIRMADO (decisión #2): path `/refresh`** = `https://primary-production-5c3c.up.railway.app/webhook/rh/empleados-master/refresh` (POST sin token).
4. **`reactivar`** limpia `departure_date` + `departure_reason_id` (decisión #8) pero **deja `departure_description`** como histórico. ¿Limpiar también? *(Implementado: se conserva.)*
5. **Sin HMAC.** Los 5 webhooks aceptan `token` en el body pero **no lo validan** (deuda preexistente §9). Crear/archivar empleados es sensible → recomendado un shared-secret antes de exponer en producción. **No bloquea MVP.**
6. **`lookups` devuelve TODOS los managers** (empleados activos, incl. cuentas zombie/cajero). El frontend puede filtrar por departamento si se quiere.
7. **Coerción de tipos en el CREATE:** los m2o/float/bool van como expresiones `={{ }}` (ints, floats, booleans nativos). Validado estructuralmente; **el primer alta real es el smoke** que confirma que Odoo acepta el payload tal cual (FASE 0 ya probó el patrón con el set mínimo).

---

## Pendiente FASE 2 (frontend) — requiere confirmación de Esteban
Antes de construir `modulos/rh/empleados/`: **confirmar el mecanismo de auth solo-RH** que usan hoy el visor de checkins y el de incidencias (¿`FTSAuth` + rol? ¿`derivar-roles`? ¿`MP_SESSION_KEY`?), para gatear la escritura. **No exponer alta/baja sin ese gate.**
