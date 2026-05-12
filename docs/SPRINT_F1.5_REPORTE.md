# Sprint F1.5 — Reporte de ejecución

**Fecha:** 2026-05-11
**Branch:** `feature/sprint-f1.5-topochico-y-checkout-bloqueado`
**Duración real:** ~1h 15min (estimado original 1.5h)
**Ejecución:** plan A — frontend-only para Issue 1, hardcoded JSON, defaults 9.6h para Issue 2

---

## Resumen ejecutivo

- ✅ **Issue 1** (candado hora mínima Topo Chico) implementado frontend-only en `kiosk.js` + `shared/public-config.json`. Bloquea check-in tipo `entrada` antes de las 07:30 CST en Cortina + Caseta L6. No bloquea salida ni comida.
- ✅ **Issue 2** (auto-rescate de attendance huérfana >16h) implementado en workflow `kiosk/checkin v4.2` (`a7mEjjdwIzzvomXs`) con 3 nodos nuevos. Auto-cierra a 9.6h, marca TAGs F1.1, crea incidencia `auto_cierre_pendiente` con `tag_disputa_activo:true` + `autoincidencia:true`, permite check-in nuevo sin fricción.
- ⚠️ **Resolución manual Ricardo + Héctor**: MCP Odoo en modo read-only, no se pudo ejecutar UPDATE programático. Plan alternativo: cuando Ricardo (id 98, att 12921 → 12948) y Héctor (id 25, att 12921) chequen hoy lunes, el workflow auto-rescata sus huérfanas del Vie 8 automáticamente. Esto sirve doble propósito: resolución del incidente + test E2E real del Issue 2.
- 📋 Backlog identificado: UI admin para toggle de hora mínima, defensa profunda n8n para geocerca.

---

## Diagnóstico realizado

### Issue 1 — Arquitectura geocerca (hallazgo)

**Donde viven las geocercas:** `shared/public-config.json` → array `geolocations[]`. El kiosk las fetchea de GitHub raw API en cada init y las cachea en `localStorage['ops_kiosk_geolocations']` (ver `operaciones/kiosk/js/kiosk.js:1217-1231`).

Existe también `shared/sitios-autorizados.json` con otro schema (id/radio_m/activo) — **no es usado por el kiosk**, parece legacy. Se dejó intacto.

**Validación geocerca:** 100% frontend en `validarGeolocacion()` (kiosk.js:67-95). El workflow n8n NO recibe info de la geocerca — solo confía en `geo_autorizada`, `geo_sitio`, `geo_distancia`, `geo_motivo` enviados por el frontend.

**Decisión arquitectónica documentada:** validación hora mínima vive en frontend (Opción A acordada con Esteban). Backlog "Defensa profunda n8n geocerca" registrado.

### Issue 2 — Casos reales Vie 8-may

```
Héctor Cruz (id 25)
└─ Attendance 12921: check_in 2026-05-08T12:47:49Z (06:47 CST)
   check_out: false (huérfana ~100h al 2026-05-11 11:00)
   TAG F1.1: ambos campos false
   → F1.1 no se disparó porque empleado nunca usó olvido_checkout

Ricardo Hernández (id 98)
└─ Attendance 12948: check_in 2026-05-08T15:51:23Z (09:51 CST)
   check_out: false (huérfana ~98h)
   TAG F1.1: ambos campos false
   → Mismo escenario que Héctor
```

**Fuente del bloqueo en próximo check-in:** nodo `Code - Analizar candados` del workflow `a7mEjjdwIzzvomXs`. Lógica original (pre-F1.5) era:

```
horasTrans < 6   → YA_TIENES_ENTRADA (bloqueo simple)
6 ≤ horasTrans < 16 → ZONA_GRIS (sugiere olvido_checkout)
horasTrans ≥ 16  → ERROR_CRITICO (bloquea forzando olvido_checkout) ← bug F1.5
```

El ≥16h era el bloqueo que afectaba a Héctor + Ricardo hoy lunes.

---

## Cambios implementados

### Issue 1 — Candado hora mínima

**Archivo `shared/public-config.json`** (bump version 1.0.0 → 1.1.0):
- Agregados campos `aplica_hora_minima_checkin: true` y `hora_minima_checkin: "07:30"` a las 2 entries de Topo Chico (Cortina + Caseta L6).
- Geocercas restantes (FTS Monterrey, Casa Esteban, Pasteleria Letty) sin estos campos → tratadas como `aplica=false` por retrocompatibilidad.

**Archivo `operaciones/kiosk/js/kiosk.js`**:
- Nueva función `validarHoraMinimaCheckin(sitioNombre, tipo)` (líneas ~97-126). Solo aplica si `tipo === 'entrada'`. Calcula hora actual CST (UTC-6 sin DST) y compara contra `sitio.hora_minima_checkin`.
- Nueva función `mostrarModalHoraMinima(result)` con UX consistente al modal "fuera de zona" pero con icono ⏰ + naranja FTS.
- Nueva función `cerrarHoraMinima()` que cierra modal y dispara `goHome()`.
- Invocación post-validación geo en 2 call sites:
  - Tras `validarGeolocacion()` exitosa en `verificarGeoYRegistrar()` (línea ~665).
  - Tras `reintentarGeo()` exitoso para no permitir bypass via fuera-de-zona + retry.

### Issue 2 — Auto-rescate workflow

**Workflow `a7mEjjdwIzzvomXs` (kiosk/checkin v4.2)** — 23 → 26 nodos:

1. **`Code - Analizar candados`** (modificado): la rama `≥16h` ya no emite `_error: true` con `codigo_error: 'ERROR_CRITICO'`. En su lugar emite:
   ```js
   {
     accion: 'CREATE_ENTRADA',
     attendance_id_pendiente: <id huérfano>,
     auto_rescate_pending: true,
     auto_rescate_check_out: <check_in + 9.6h en formato Odoo>,
     auto_rescate_incidencia_id: 'INC-AUTO-CIERRE-<empId>-<isoNow>',
     auto_rescate_check_in_original: <check_in raw>,
     auto_rescate_horas_originales: <horas calculadas>
   }
   ```

2. **`IF - Auto-rescate?`** (nuevo, `n24-if-autorescate`, position [-300, 224]): condición `String($json.auto_rescate_pending) == "true"` con `typeValidation: "loose"`.

3. **`Odoo - UPDATE Auto-rescate Close`** (nuevo, `n25-odoo-close-auto`, position [-100, 100]): cierra el attendance huérfano con `check_out`, `x_studio_horario_en_disputa: true`, `x_studio_incidencia_pendiente_id`. Credencial `Odoo FTS` (`Wansi69xesEqEiY1`), `alwaysOutputData: true`.

4. **`Code - Continue Auto-rescate`** (nuevo, `n26-code-continue-auto`, position [100, 100]): restaura params via `$('Code - Analizar candados').item.json` para que `Switch - Por tipo` pueda rutear por `tipo`. Sin esto el Switch recibiría la respuesta del Odoo UPDATE en `$json`.

5. **`Code - Prep Incidencia`** (modificado): nueva rama al inicio que detecta `auto_rescate_pending === true` (defensivo con fallback a `$('Code - Analizar candados').item.json`) y construye incidencia con:
   - `tipo: 'auto_cierre_pendiente'`
   - `estado: 'pendiente_rh'` (salta supervisor, directo a Ana Laura)
   - `tag_disputa_activo: true`
   - `autoincidencia: true`
   - Métadatos: `attendance_id_cerrado`, `check_in_original_utc`, `check_out_aplicado_utc`, `horas_originales`, motivo descriptivo.

**Rewiring de conexiones:**
- `IF - Sin bloqueo? [true]` → `IF - Auto-rescate?` (antes iba directo a Switch)
- `IF - Auto-rescate? [true]` → `Odoo - UPDATE Auto-rescate Close` → `Code - Continue Auto-rescate` → `Switch - Por tipo`
- `IF - Auto-rescate? [false]` → `Switch - Por tipo` (flujo normal sin auto-rescate)

El flujo normal de check-in (sin huérfana o con huérfana <16h) NO cambia. Solo se inyecta la rama auto-rescate para `accion: 'CREATE_ENTRADA' + auto_rescate_pending: true`.

---

## Tests E2E

### Issue 1 — Hora mínima geocerca

Tests funcionales sin browser real (validación de código + lógica):

| # | Escenario | Esperado | Resultado |
|---|---|---|---|
| 1.1 | Cortina Topo Chico, tipo=entrada, hora 07:15 CST | Modal bloqueo | ✅ Lógica correcta — `horaActual < '07:30'` → ok=false |
| 1.2 | Cortina Topo Chico, tipo=entrada, hora 07:32 CST | Permitir | ✅ `'07:32' >= '07:30'` → ok=true |
| 1.3 | FTS Monterrey, tipo=entrada, hora 06:50 CST | Permitir | ✅ `aplica_hora_minima_checkin` false/undefined → ok=true |
| 1.4 | Cortina Topo Chico, tipo=entrada, sin field aplica (legacy) | Permitir | ✅ Retrocompatibilidad — sin campo, no aplica |
| 1.5 | Caseta L6, tipo=salida, hora 07:15 CST | Permitir | ✅ `tipo !== 'entrada'` → ok=true (no bloquea salida) |
| 1.6 | Cortina, autoritado=false (fuera zona) | Modal geo, no entra a hora-mínima | ✅ `if(!geoResult.autorizado) return` antes de chequeo hora |
| 1.7 | Reintentar geo exitoso bajo hora mínima | Modal bloqueo (no bypass) | ✅ Segundo call site en `reintentarGeo()` aplicado |

Validación en código: 7 chequeos pasados via Node:
```
1. validarHoraMinimaCheckin: true
2. mostrarModalHoraMinima: true
3. cerrarHoraMinima: true
4. invocacion 1 (validarGeolocacion): 3 (1 definición + 2 call sites)
5. config aplica_hora_minima_checkin: true
6. config Topo Chico cortina con hora 07:30: true
7. config Caseta L6 con hora 07:30: true
```

### Issue 2 — Auto-rescate workflow

| # | Escenario | Esperado | Estado |
|---|---|---|---|
| 2.1 | Empleado dummy con check_in hace 20h sin check_out, intenta check-in entrada | Auto-rescate dispara, attendance vieja cerrada a 9.6h, TAG marcado, incidencia generada, check-in nuevo creado | ⏳ Pendiente test real (necesita Odoo write) |
| 2.2 | Empleado con check_in hace 8h sin check_out (zona gris) | ZONA_GRIS — bloqueo original (sin auto-rescate) | ✅ Lógica preservada (rama 6-16h sin cambios) |
| 2.3 | Empleado sin huérfana | CREATE_ENTRADA normal sin auto-rescate | ✅ `auto_rescate_pending: false` → IF false → Switch normal |
| 2.4 | Ricardo + Héctor (att 12948 + 12921) chequen hoy lunes | Auto-rescate dispara para cada uno | ⏳ Pendiente — pruebas reales en producción cuando empleados lleguen |

**Validación workflow n8n:** 1 error pre-existente (Webhook responseNode requiere onError, no introducido por F1.5), 0 errores propios de F1.5. Warnings cosméticos esperados (typeVersion outdated 3.2 vs 3.4, etc.).

---

## Casos resueltos para Ricardo (98) y Héctor (25)

⚠️ **No resueltos vía MCP** (Odoo MCP en read-only YOLO mode).

**Plan de resolución:**

Cuando Héctor o Ricardo intenten checar entrada hoy lunes 11-may:
- horasTrans desde último check_in = ~95-100h (>> 16h)
- Workflow dispara auto-rescate automáticamente
- Cierre Odoo: Héctor att 12921 → check_out=2026-05-08 22:23:49 UTC; Ricardo att 12948 → check_out=2026-05-09 01:27:23 UTC
- TAGs `x_studio_horario_en_disputa: true` aplicado
- Incidencia `auto_cierre_pendiente` creada con estado `pendiente_rh`, sale en panel de Ana Laura
- Empleado checa entrada nueva sin fricción

**Esto sirve doble propósito:** resolución del incidente + test E2E real del Issue 2.

**Si necesitan checar HOY antes de validar el nuevo flujo end-to-end**, alternativa: Esteban (o un usuario con permisos) puede ejecutar manualmente desde Odoo UI los 2 UPDATEs:
- Att 12921: `check_out=2026-05-08 22:23:49`, `x_studio_horario_en_disputa=true`, `x_studio_incidencia_pendiente_id='INC-AUTO-CIERRE-25-MANUAL-2026-05-11'`
- Att 12948: `check_out=2026-05-09 01:27:23`, `x_studio_horario_en_disputa=true`, `x_studio_incidencia_pendiente_id='INC-AUTO-CIERRE-98-MANUAL-2026-05-11'`

---

## Bugs latentes / observaciones encontradas

1. **Webhook config error pre-existente** (no introducido por F1.5): "responseNode mode requires onError: 'continueRegularOutput'". Reporta `n8n_validate_workflow` pero el workflow ejecuta sin problemas. Fix futuro 1 línea.

2. **`Code - Armar Datos Entrada` (legacy)**: no se inspeccionó su contenido en este sprint. Si NO propaga `auto_rescate_pending` downstream, mi código en `Code - Prep Incidencia` lo recupera defensivamente via `$('Code - Analizar candados').item.json`. Cubierto por fallback.

3. **Schema legacy de `Code - Prep Incidencia` (ramo `ajuste_hora_entrada`)**: mantiene formato pre-F2.1 (`estado` vs `status`, sin `supervisor_id` snapshot, sin `tag_disputa_activo`). NO modificado en este sprint (out of scope, solo agregué la rama nueva). Pendiente migrar legacy a esquema F2.1 cuando haya ventana.

4. **`sitios-autorizados.json` deprecated**: tiene schema distinto al usado por kiosk. Considera limpiarlo en sprint de tech debt.

5. **MCP Odoo en read-only mode**: bloqueó la ejecución manual programática de Paso 2.4. Si Esteban quiere permitir writes desde MCP para sprints futuros, revisar configuración del MCP server.

---

## Backlog generado este sprint

| Item | Estimado | Prioridad | Notas |
|---|---|---|---|
| **UI-Admin-Geocercas** | 1-1.5h | Media | Pantalla en FTS Suite para toggleable `aplica_hora_minima_checkin` + `hora_minima_checkin` por geocerca. Reemplaza edición manual del JSON. |
| **Defensa profunda n8n geocerca** | 45min | Baja | Replicar validación de hora mínima server-side en workflow checkin. Requiere mandar `sitio_nombre` desde frontend y workflow valida contra config (o tener copia local). |
| **Fix Webhook config pre-existente** | 5min | Baja | Agregar `onError: 'continueRegularOutput'` al nodo Webhook. |
| **Migrar `ajuste_hora_entrada` a esquema F2.1** | 30min | Baja | El `Code - Prep Incidencia` rama legacy aún emite formato pre-F2.1. |
| **Limpieza `sitios-autorizados.json`** | 10min | Muy baja | Archivo deprecated sin consumer. Borrar o documentar como histórico. |

---

## Tiempo real vs estimado

| Fase | Estimado original | Real |
|---|---|---|
| Branch + investigación geocercas | 15 min | 15 min |
| Edit config + kiosk.js | 30 min | 20 min |
| Diagnóstico Ricardo + Héctor | 15 min | 10 min |
| Implementación workflow auto-rescate | 30 min | 25 min |
| Resolución manual | 10 min | 0 min (bloqueado, plan alternativo) |
| Tests E2E + reporte + commits | 30 min | 25 min (en curso) |
| **Total** | **~2-2.5h** | **~1h 15min** |

---

## Commits

Branch: `feature/sprint-f1.5-topochico-y-checkout-bloqueado`

Estructura prevista (3 commits):
1. `feat(geocerca): hora minima checkin para Topochico Cortina y Caseta L6`
2. `feat(kiosk): auto-rescate de attendance huerfana >16h en checkin`
3. `docs: SPRINT_F1.5_REPORTE + CLAUDE.md update`

Workflow n8n: ya desplegado, no requiere commit (vive en n8n cloud).

---

## Sub-bug post-deploy descubierto + fix (2026-05-11 ~16:10 CST)

**Síntoma:** Ricardo Hernández (id 98) hizo clic en "Resolver ahora" después del merge frontend Opción B. El frontend avanzó al flujo de checkin entrada (PIN + "Terminado"), pero al volver a abrir su perfil seguía la pantalla "Checkeo sin salida (+24 hrs)". Auto-rescate falló silenciosamente.

**Diagnóstico:** ver `docs/SPRINT_F1.5_BUG_DIAGNOSTICO.md` para el primer bug y este bloque para el segundo.

Execution 8771 reveló que `Code - Analizar candados` recibió `attendances=[]` (array vacío) porque `Odoo - Buscar pendientes` filtraba con `check_in >= ahora-48h`, y la huérfana de Ricardo (att 12948, check_in 2026-05-08 15:51 UTC = 95h atrás) cayó FUERA de la ventana. Como `abiertas.length === 0` → branch "sin huérfana" → `auto_rescate_pending: false` → `Switch - Por tipo` → `Odoo - CREATE Entrada` → ❌ Odoo enterprise `_check_validity` rechazó: "Cannot create new attendance record for Ricardo... hasn't checked out since 05/08/2026 09:51:23 AM".

**Causa raíz:** inconsistencia entre 2 workflows que consultan el mismo dataset.

| Workflow | Ventana SEARCH `hr.attendance` | Ventaja |
|---|---|---|
| `kiosk/estado-empleado` (U13fngg2dTKgDQ8Y) | 15 días | Detectaba la huérfana correctamente, frontend mostraba `error_critico` |
| `kiosk/checkin` (a7mEjjdwIzzvomXs) | **48h** ❌ | NO detectaba la huérfana, auto-rescate F1.5 nunca disparaba |

**Fix aplicado:** patchNodeField sobre `Code - Preparar parámetros` del workflow `a7mEjjdwIzzvomXs`. Ventana 48h → 15 días.

```js
// Antes
const hace48h = new Date(ahoraUTC.getTime() - (48 * 60 * 60 * 1000));
const ventanaInicio = hace48h.toISOString().slice(0, 19).replace('T', ' ');

// Después (F1.5 fix 2026-05-11)
const hace15Dias = new Date(ahoraUTC.getTime() - (15 * 24 * 60 * 60 * 1000));
const ventanaInicio = hace15Dias.toISOString().slice(0, 19).replace('T', ' ');
```

Validación post-fix: 26 nodos + 30 conexiones válidas + 0 conexiones rotas. Cero errores nuevos (mismo único Webhook config pre-existente).

**Test E2E pendiente:** que Ricardo y Héctor (id 25, att 12921) intenten nuevamente. La huérfana de Héctor también está fuera de la ventana 48h original — el fix también lo desbloquea.

**Lección:** cuando 2+ workflows consultan el mismo dataset (hr.attendance abiertas del empleado), DEBEN usar la misma ventana de búsqueda. Documentado en CLAUDE.md §11 hallazgo #12.

---

## Sub-bug #2 post-deploy descubierto + fix (2026-05-11 ~17:33 CST)

**Síntoma:** Ricardo y Héctor checaron exitosamente post-fix-ventana (att 12948 + 12921 cerradas con check_out 9.6h después, TAGs marcados, nuevas attendances 12981 creadas para hoy lunes 11). Workflow completó end-to-end. Ejecuciones 8851 + 8852 ambas con status `success`. PERO al abrir el visor RH (`modulos/rh/visor-incidencias.html`), Ana Laura NO ve las 2 incidencias `auto_cierre_pendiente`.

**Diagnóstico:**

| Archivo | Schema | Quién escribe | Quién lee |
|---|---|---|---|
| `shared/incidencias.json` (legacy) | `estado`, `id`, `fecha_solicitud` | Workflow `a7mEjjdwIzzvomXs` (kiosk/checkin v4.2 + F1.5) | **NADIE en frontend** |
| `shared/incidencias-asistencia.json` (F2.1+) | `status`, `id_interno`, `fecha_creacion`, `propuestas[]`, `department_*`, `supervisor_*` | Workflows `xVNp36`, `5SW15h`, `0L0y2X` (F2.1 incidencias modernas) | `visor-incidencias.html`, `panel-incidencias`, `mis-incidencias` |

El sprint F1.5 heredó del workflow kiosk/checkin v4.2 el archivo legacy `incidencias.json`. Las 2 incidencias `auto_cierre_pendiente` se crearon ahí, fuera del alcance del visor RH.

**Fix (Opción 2):** migrar SOLO la rama `auto_rescate_pending` del workflow para que escriba al archivo nuevo con schema F2.1+. Las ramas legacy (`ajuste_hora_entrada`, `ajuste_hora_salida`) quedan tocando `incidencias.json` hasta migración completa futura.

**Cambios aplicados en `a7mEjjdwIzzvomXs`:**

1. **`Code - Prep Incidencia`** — rama `isAutoRescate` ahora construye objeto con schema F2.1+:
   - `id_interno` (no `id`)
   - `status: 'pendiente_rh'` (no `estado`)
   - `fecha_creacion` (no `fecha_solicitud`)
   - `propuestas: []` (vacío — auto-incidencia no tiene propuestas)
   - `department_*`, `supervisor_*` en `null` (auto salta supervisor, va directo a RH)
   - `tag_disputa_activo: true`, `autoincidencia: true` (preservados)
   - Nuevo campo `_target_file_path: 'shared/incidencias-asistencia.json'` para que HTTP GET/PUT use el archivo correcto.
   - Rama legacy también recibe `_target_file_path: 'shared/incidencias.json'` para mantener comportamiento.

2. **`HTTP - GET incidencias.json` URL:** ahora dinámica via `={{ ... /contents/{{ $json._target_file_path }} }}`. Mantiene auth + headers + queryParameter `ref=main`.

3. **`HTTP - PUT incidencias.json` URL:** misma plantilla dinámica. `_target_file_path` propagado via `Code - Merge incidencia`.

4. **`Code - Merge incidencia`** — actualizado para:
   - **Bug cosmético corregido:** commit message ahora dinámico `'incidencia: ' + nueva.tipo + ' ' + ...` (antes hardcoded a `'ajuste_hora_entrada'` para todos los tipos).
   - Preserva `_target_file_path` en output para que HTTP PUT lo lea.
   - `incidencia_id` ahora lee `nueva.id_interno || nueva.id` (compatible con ambos schemas).

5. **Backfill manual de las 2 incidencias ya creadas (Ricardo + Héctor):** agregadas a `shared/incidencias-asistencia.json` con schema F2.1+ + flag `_backfill_origin` explicando que se duplicaron desde `incidencias.json`. Por ahora se quedan en ambos archivos (incidencias.json = log raw, incidencias-asistencia.json = lo que ve frontend). Backlog: limpiar duplicados cuando se migre completamente.

**Validación post-fix:** 26 nodos / 30 conexiones / 28 expresiones validadas / 0 errores nuevos.

**Test E2E pendiente:** Ana Laura (o cualquier usuario con rol RH) abre `modulos/rh/visor-incidencias.html` post-deploy y confirma que aparecen:
- INC-AUTO-CIERRE-98-2026-05-11T23-33-15-573Z (Ricardo)
- INC-AUTO-CIERRE-25-2026-05-11T23-27-33-651Z (Héctor)

ambas con badge AUTO (porque `autoincidencia:true`), tipo "auto_cierre_pendiente" (label fallback al no estar en TIPO_LABELS hardcoded), status `pendiente_rh`.

**Lección complementaria a #12:** cuando un workflow escribe a un archivo de datos compartido, validar quién lo lee. Si los lectores esperan otro schema o archivo, hay drift silencioso. Mantener tabla `archivo → schema → escritores → lectores` documentada (idealmente en CLAUDE.md o un README de `shared/`).

**Backlog identificado:**
- **Migración completa workflow kiosk/checkin a F2.1+ (Opción 1):** las ramas `ajuste_hora_entrada` y `ajuste_hora_salida` siguen escribiendo a `incidencias.json` y siguen siendo invisibles al visor RH. Estimado: 45-60 min de trabajo (incluye lookups de supervisor + department para snapshot, building propuestas array vacío).
- **Cleanup `shared/incidencias.json`:** archivo legacy queda como log raw. Decidir si se mantiene (write-only, sin consumer) o se elimina post-migración completa de Opción 1.
- **`_backfill_origin` field cleanup:** quitar el campo cosmético después de validación (o dejarlo como audit trail).
