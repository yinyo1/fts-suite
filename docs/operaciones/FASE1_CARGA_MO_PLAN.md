# Fase 1 — Carga MO: horas limpias y atribuibles · PASO 0 (auditoría)

> **Estado:** 📋 **PASO 0 — Auditoría read-only. NADA construido.** STOP tras este doc, esperando aprobación de Esteban.
> **Fecha:** 2026-07-06. **Base:** `docs/finanzas/DIAGNOSTICO_CARGA_MO.md` (decisión #1 = opción **(a)**: la nómina bancaria 2023.34→1177 sigue siendo el costo; attendance solo **atribuye**).
> **Regla dura Fase 1:** cero `analytic.line`, cero `distribution.model`, cero budgets, **cero campos nuevos en Odoo** — solo reutilizar campos/modelos existentes.
> **Objetivo Fase 1:** plan de Felipe persistido → SO pre-llenada en checkout → candado SO operativos → confirmación diaria de Felipe.

---

## 0. Resumen del Paso 0

La cadena Fase 1 es **construible sin tocar dinero ni crear campos**. Los 4 bloques (B1–B4) enganchan en puntos ya existentes y bien delimitados. Hay **2 decisiones de diseño reales** que Esteban debe resolver antes de B1:
- **D1 — cómo ligar la SO al `planning.slot`** (`sale_line_id` nativo vs `project_id` vs tag en `name`) — porque la SO del plan es un `sale.order` y `planning.slot` liga por `sale.order.line`, y los SOs-bucket (Mondelez/Rittal) no tienen línea de servicio limpia.
- **D2 — confirmar que `x_studio_manager_approval` es el campo correcto** para "horas confirmadas por Felipe" (semánticamente encaja; hay 75 registros históricos en `true` de origen manual).

Todo lo demás es turnkey. Estimación total Fase 1: **~14–19 h CC** repartidas en 4 PRs.

---

## 1. kiosk.js — flujo del modal SO en checkout + puntos de enganche

**Archivo:** `operaciones/kiosk/js/kiosk.js`. **Cliente webhooks:** `operaciones/kiosk/js/odoo.js`.

### 1.1 Flujo actual (confirmado)
1. En `procesarCheckin` (~L811): **el modal SO (`ks-project`) se muestra SOLO en `K.tipo === 'salida'`.** Entrada/comida/regreso → `K.soSeleccionada = null; registrarAsistencia()` directo (L816-817).
2. Lista SO: `loadSOs()` (L512) → `OdooKiosk.getSOs()` → **`POST /webhook/kiosk/sos`** `{company_id}` → `K.sos` (`{id, nombre|name, cliente, num}`).
3. `searchSOs(q)` (L822) filtra → `renderSOs` (L832) pinta cards → **`selectSO(id)` (L849)** setea `K.soSeleccionada` y llama `registrarAsistencia()`.
4. `registrarAsistencia()` (L875) arma `payload` (L900-917): `so_id = K.soSeleccionada?.id || null`, `so_nombre`. POST vía `registrarCheckin` (L972).

### 1.2 ⚠️ Anti-patrón Hallazgo #15 (dónde NO tocar)
`registrarAsistencia` muestra la pantalla de confirmación (`showScreen('ks-confirm')`, **L920**) **ANTES** del `await registrarCheckin(payload)` (**L972**). **B3 NO debe tocar ese tramo.** Todos los hooks de B3 viven **aguas arriba**, en el ruteo del modal SO (L811-818) y en `selectSO`/un botón "sin SO" — que son **pre-POST**. El candado es un *gate* antes de `registrarAsistencia`, nunca un mensaje de éxito anticipado.

### 1.3 Payload de empleado — ¿trae categoría y depto? **SÍ** (confirmado)
- `K.seleccionado` = objeto crudo de `/webhook/kiosk/empleados` (v3.1). Ese webhook **retorna `department_id`, `x_categoria_nomina`, `x_aplica_ppa`, `x_studio_hora_entrada`** — verificado en `planeacion/js/empleados.js` `_normalizar` (L54-80) que los preserva, y es el **mismo webhook** que consume el kiosk (comentario L2-3 de ese archivo).
- ⚠️ Matiz: el kiosk guarda `K.seleccionado = emp` **crudo** (no normaliza), así que el ruteo B3 debe leer defensivamente: `emp.x_categoria_nomina` y parsear `emp.department_id` (puede venir `[id,name]`, `{id}` o `id`). El helper `_extraerDeptoId` de `horarios-base.js` (L96-103) es el patrón a copiar.

### 1.4 Puntos de enganche B3 (ruteo por categoría/depto)
Regla de ruteo (usar `x_categoria_nomina`; fallback por depto vía tabla PLAN_NOMINA §0.5):

| Perfil | Categorías / depto | Comportamiento checkout salida |
|---|---|---|
| **Operativo** | `hourly_doble`/`hourly_sencilla`, o depto 3 Operaciones sin override | **(b) candado: SO obligatoria** |
| **Administrativo** | `confianza`/`ceo`, deptos 5/9/16/18 | **(c) sin modal** (`soSeleccionada=null` → registrar directo) |
| **Comercial** | `no_he_comercial`, depto 6 | **(d) modal opcional** (permite "sin SO") |

- **(a) Pre-llenado desde plan:** en el bloque `if(K.tipo==='salida')` (L811), antes de `showScreen('ks-project')`, consultar el plan de HOY del empleado (B2, §5). Si trae SO → pre-seleccionar `K.soSeleccionada` y mostrar UI "✔ Confirmar `SO` en 1 tap / Cambiar". Si no → modal normal.
- **(b) Candado operativos:** si perfil=operativo y `K.tipo==='salida'` y no hay SO elegida → **bloquear `registrarAsistencia`** con modal "Selecciona la SO para registrar tu salida" (patrón `mostrarModalHoraMinima`, L807). Gate puro pre-POST.
- **(c) Skip administrativos:** en L811, si perfil=administrativo → saltar `ks-project`, `soSeleccionada=null`, `registrarAsistencia()` directo (como hoy hacen entrada/comida).
- **(d) Opcional comercial:** mostrar `ks-project` pero añadir botón "Registrar sin SO" que hace `soSeleccionada=null; registrarAsistencia()`.
- **Exponer helpers:** `selectSO` ya está en `window` (L2115). Añadir handlers nuevos al mismo patrón.

---

## 2. Módulo `planeacion/` (F1–F3) — shape exacto del plan (contrato del POST)

**Archivos:** `planeacion/js/planeacion.js` (app + asignaciones), `turnos.js` (agrupación), `exportar.js` (WA/PNG), `empleados.js`, `horarios-base.js`, `jornada.js`.

### 2.1 Objeto `asignacion` (fuente del contrato) — confirmado en `planeacion.js` L45-68 / L467-485
```js
{
  empleado_id:      Number,      // hr.employee.id
  empleado_nombre:  String,
  empleado_dept:    String,      // nombre depto
  empleado_dept_id: Number,      // id depto
  empleado_job:     String,
  externo:          Boolean,     // "jalado" de otro depto
  requiere_check:   Boolean,     // campo/oficina
  confirmado:       Boolean,     // check del supervisor en la UI
  origen:           String,      // "FTS Monterrey" | sitio
  entrada:          "HH:MM",
  salida:           "HH:MM",
  so_id:            Number|null, // ⭐ sale.order.id (de /webhook/kiosk/sos)
  so_nombre:        String,      // ej "SO2286"
  sitio:            String,
  actividad:        String,
  he:               Number,      // horas extra planeadas
  horario_base:     { entrada:"HH:MM", salida:"HH:MM" }
}
```
- El plan vive en memoria como `PlaneacionApp.asignaciones[]` + `PlaneacionApp.fechaActual` (`"YYYY-MM-DD"`, L18).
- **`so_id` es un `sale.order` id** — el mismo universo que consume el kiosk (`PLANEACION_PROYECTOS` carga de `/webhook/kiosk/sos`, `proyectos.js` L14). ✅ Coincide con lo que el checkout escribe en `x_studio_sales_order_2`.
- Supervisor: `FTSAuth.getSession().nombre` (L544).
- `jornada.js` `calcularNeta(entrada,salida)` da horas netas (base del `allocated_hours` del slot).

### 2.2 Contrato propuesto `POST /webhook/planeacion/guardar` (B1)
```json
{
  "fecha": "2026-07-07",
  "supervisor": { "username": "felipe.perez", "nombre": "Felipe Pérez" },
  "asignaciones": [
    { "empleado_id": 124, "so_id": 2302, "so_nombre": "SO2286",
      "entrada": "07:00", "salida": "17:06", "he": 0,
      "sitio": "Topo Chico", "actividad": "...", "origen": "FTS Monterrey",
      "externo": false, "empleado_dept_id": 3, "horas_netas": 9.6 }
  ]
}
```
- **Enganche UI:** un botón nuevo "💾 Publicar plan" en `renderExportZone` (`planeacion.js` L494), junto a los de export. `disabled` hasta que `renderProgresoBanner` marque todos confirmados (L120). POST vía `fetch` (patrón `n8nFetch`).
- **Solo persistir asignaciones con `so_id != null`** (las "sin SO" quedan fuera del costeo; `turnos.js` `asignacionesSinSO` ya las separa).

---

## 3. `planning.slot` en Odoo — campos mínimos para create vía n8n

**`fields_get` (74 campos) + 3 slots reales de 2025 auditados.**

### 3.1 Campos para crear (B1)
| Campo | Tipo | Nota para create |
|---|---|---|
| `resource_id` | m2o `resource.resource` | ⚠️ **`employee_id` es READONLY/computed** → hay que setear `resource_id` = `hr.employee.resource_id` (lookup previo). En los datos, resource y employee comparten id, **pero NO asumir**: leer `resource_id` del empleado. |
| `start_datetime` / `end_datetime` | datetime | **UTC** (los slots 2025 traen `13:00–23:00Z` = 07:00–17:00 CST). Convertir `fecha`+`entrada/salida` CST→UTC (+6). |
| `company_id` | m2o (**required**) | `1` (FTS MX). |
| `sale_line_id` | m2o `sale.order.line` | ⭐ liga la SO (ver **D1**). `sale_order_id`, `project_id`, `partner_id` se **derivan solos** de la línea (readonly). |
| `allocated_hours` | float | horas netas del plan (`jornada.calcularNeta`). |
| `state` | selection | `draft` o `published`. |
| `role_id` | m2o `planning.role` | opcional (histórico "Tecnico Electromecanico"). |
| `name` | text (Note) | opcional / posible tag SO (ver D1 opción c). |

Ejemplo real (slot 800): `resource_id [79]`, `start 2025-10-28T13:00Z`, `end T23:00Z`, `company 1`, `sale_line_id 23308` → derivó `sale_order_id 11002 (SO10821)` + `project_id 198`. `allocated_hours 10`, `state draft/published`.

### 3.2 ⭐ D1 — cómo ligar la SO del plan al slot (DECISIÓN)
El plan trae `so_id` = **`sale.order`**; el slot liga por **`sale.order.line`**. Los slots 2025 usaban una línea de servicio "*Mandar Proyecto a Project/Operaciones*". **Los SOs-bucket de alto volumen (Mondelez SO2286 draft, Rittal SO160/121) probablemente NO tienen esa línea limpia** → `sale_line_id` no siempre resoluble.

| Opción | Mecanismo | Pro | Contra |
|---|---|---|---|
| **(a) `sale_line_id`** | resolver `so_id` → una `sale.order.line` (ej. 1ª línea de servicio) | nativo; deriva project/partner gratis; sirve a futuro costeo | falla en SOs-bucket sin línea; ¿cuál línea? |
| **(b) `project_id`** | setear el proyecto del SO | limpio para SOs post-A1 con proyecto | SOs viejos/bucket no tienen proyecto |
| **(c) tag en `name`** ⭐ | guardar `so_id\|so_nombre` en `name` (Note) | **robusto para TODA SO incl. buckets**; cero dinero; B2 lo parsea | no-semántico; no liga project nativo |

**Recomendación Fase 1: (c)** — el único consumidor del slot en Fase 1 es el pre-llenado del kiosk (solo necesita `so_id`), y (c) funciona para el 100% de SOs incluidos los buckets que hoy concentran el 83% de las horas. **Opcionalmente además (a)** cuando la línea sea resoluble (para no perder el enlace nativo). Migrar a (a)/(b) puro en Fase 2, cuando el cleanup de SOs (proyectos reales, matar buckets) esté hecho. **Esteban decide.**

### 3.3 Idempotencia B1 (upsert)
`search planning.slot` por `resource_id` + rango del día (`start_datetime` ∈ [fecha 00:00, +1d)) → si existe: `update`; si no: `create`. Reglas n8n CLAUDE.md §3 (operation `update` + `customResourceId`, un solo `=`, "Always Output Data" ON).

### 3.4 Estado del modelo hoy
762 slots (387 con `sale_line_id`), **abandonado desde nov-2025** (0 en 2026). Reactivarlo vía B1 no colisiona con nada vivo.

---

## 4. `x_studio_manager_approval` en hr.attendance — ¿repurposear?

### 4.1 Datos duros
- Campo **existe**: `x_studio_manager_approval` (boolean, "Manager Approval", writable).
- **75 en `true` / 9,986 en `false`** (0.75%).
- Muestra de los 75: **todos `write_uid=2`** (usuario API `Odoo FTS` = el mismo que usan los workflows *y* Esteban en UI — indistinguible), `out_mode` mayormente `manual`, algunos con `check_out=false` (jornada abierta), fechas dispersas may–jul 2026.
- **Grep del repo = 0 referencias** → ningún frontend ni código del repo lo escribe.
- **Existe una cadena de aprobación Studio de 3 pasos** en `hr.attendance`: `x_studio_manager_approval` (Manager) → `x_studio_human_resources_approval` (HR) → `x_studio_horas_pagadas` ("Check finanzas pagado"). Felipe = manager de Operaciones → **el paso 1 de esta cadena ES "confirmado por el manager".**

### 4.2 Veredicto: ✅ usable, es el campo correcto (no es "repurpose", es su uso previsto)
- Semánticamente `x_studio_manager_approval = "el manager (Felipe) aprobó estas horas"` — exactamente "horas confirmadas por Felipe". Encaja en la cadena existente Manager→HR→Finanzas.
- **No colisiona con el cleanup de abril/mayo:** ese usó `x_studio_horario_en_disputa` (TAG) + `x_studio_incidencia_pendiente_id`, NO `manager_approval`. Grep repo = 0 → nada del código depende del campo.
- **Caveats (D2):**
  1. Los **75 `true` históricos** son de origen manual/desconocido → antes de go-live, decidir si se **resetean a false** (para que "confirmado" signifique solo lo de Felipe) o se dejan.
  2. El campo es booleano sin **quién/cuándo** → si se requiere auditoría, el workflow B4 debe **postear una nota al chatter** (`mail.message`) al confirmar (patrón ya validado en el watchdog §18: **omitir `author_id`**, Odoo lo auto-asigna a uid 2). *No crear campo nuevo para el timestamp.*
  3. La confirmación de Felipe debería aplicar solo a attendances **cerradas y sin disputa** (`check_out != false` y `x_studio_horario_en_disputa != true`).
- **Alternativa sin campo nuevo (si Esteban no quiere tocar `manager_approval`):** derivar "confirmado" = `x_studio_sales_order_2 poblado` + no-disputa, y usar el chatter como registro. Menos explícito; **se recomienda usar `manager_approval`.**

---

## 5. Panel «Confirmar horas» de Felipe (B4) — patrones a reusar de panel-incidencias

**Archivo referencia:** `shared/mi-perfil/panel-incidencias/index.html`.

| Necesidad B4 | Patrón reusable (línea) |
|---|---|
| **Auth** Felipe + master | `FTSAuth.getSession()` + gate `role==='master' \|\| username==='felipe.perez'` (idéntico a `planeacion.js` L621-628). Panel-incidencias usa además `/webhook/panel/derivar-roles` (L390) por rol — para B4 basta el gate simple Felipe/master. |
| **Acción → workflow** | `fetch(RESOLVER_URL, {POST})` a `/webhook/incidencias/resolver` (L888, L1101). B4 clona el patrón: `POST /webhook/planeacion/confirmar-horas`. |
| **Tabla + tabs + render** | estructura de tabla/tarjetas + tabs por estado de panel-incidencias (reutilizar CSS/markup). |
| **Cliente n8n** | `n8nFetch` de `odoo.js` (retry 2× + timeout 10s) — reusar tal cual. |

### 5.1 Datos que B4 necesita (read) y escribe (via workflow)
- **Leer** attendances de un rango (default = ayer): endpoint existente **`/webhook/kiosk/asistencia-rango`** (`odoo.js` L62) `{empleado_id, fecha_desde, fecha_hasta}` — o un endpoint batch nuevo por depto Operaciones. Mostrar por **empleado × SO × horas**, con **plan vs real** (plan viene de `planning.slot` del día vía B2; real de la attendance).
- **Acciones por fila:** ✔ *Confirmar* (set `x_studio_manager_approval=true` + chatter) · ✎ *Corregir SO* (update `x_studio_sales_order_2`).
- **Workflow nuevo `planeacion/confirmar-horas` (UPDATE hr.attendance):** `operation update`, `customResourceId = attendance_id`, campos `x_studio_manager_approval` y/o `x_studio_sales_order_2`. Reglas n8n §3.

---

## 6. Contratos de datos (resumen)

| Endpoint (nuevo) | Método | Body | Efecto |
|---|---|---|---|
| `/webhook/planeacion/guardar` (B1) | POST | `{fecha, supervisor, asignaciones[]}` (§2.2) | upsert `planning.slot` por empleado+fecha |
| `/webhook/planeacion/dia` (B2) | POST | `{fecha, empleado_id?}` | GET plan del día (por empleado o batch) → `[{empleado_id, so_id, so_nombre, entrada, salida, ...}]` para el kiosk |
| `/webhook/planeacion/confirmar-horas` (B4) | POST | `{attendance_id, manager_approval?, so_id?}` | update `hr.attendance` (`x_studio_manager_approval`, `x_studio_sales_order_2`) + chatter |

Endpoints existentes reusados: `/webhook/kiosk/empleados` (categoría+depto), `/webhook/kiosk/sos`, `/webhook/kiosk/asistencia-rango`, `/webhook/kiosk/checkin` (sin cambios).

---

## 7. Riesgos

| # | Riesgo | Mitigación |
|---|--------|-----------|
| RF1-1 | **D1: `sale_line_id` no resoluble** para SOs-bucket (83% de las horas) | Opción (c) tag en `name` para Fase 1 (§3.2) |
| RF1-2 | **Anti-patrón #15** al tocar kiosk.js | B3 solo enganche pre-POST (L811-818, `selectSO`); no tocar L920-972 |
| RF1-3 | **Ruteo por categoría falla** si `x_categoria_nomina` null | Fallback por `department_id` (PLAN_NOMINA §0.5); fail-open = mostrar modal SO |
| RF1-4 | 75 `manager_approval=true` históricos contaminan "confirmado" | Decidir reset (D2); B4 solo actúa sobre cerradas+sin-disputa |
| RF1-5 | **`employee_id` readonly** en planning.slot | Setear `resource_id` (lookup `hr.employee.resource_id`) |
| RF1-6 | Webhooks nuevos sin auth | **HMAC pendiente** (anotar en CLAUDE.md §9 al construir); Fase 1 hereda el modelo actual sin secreto |
| RF1-7 | Discrepancia plan (memoria) vs Odoo si Felipe edita tarde | B1 upsert idempotente; B2 lee siempre el último slot |

---

## 8. Estimación por bloque (post-aprobación, PRs separados)

| Bloque | Alcance | Est. |
|---|---|---|
| **B1** `planeacion/guardar` (workflow n8n + botón "Publicar" en planeacion.js) | upsert planning.slot idempotente; resolver resource_id; D1 | **4–5 h** |
| **B2** `planeacion/dia` (workflow n8n GET + cache corto en kiosk) | leer plan del día por empleado/batch | **2–3 h** |
| **B3** kiosk.js pre-llenado + candado + ruteo por categoría | (a)(b)(c)(d) §1.4; sin tocar zona #15 | **4–5 h** |
| **B4** panel «Confirmar horas» (frontend + workflow UPDATE + chatter) | tabla plan vs real, ✔/✎, `x_studio_manager_approval` | **4–6 h** |
| **B5** (no-op) — no tocar checkout/analytic/budget | verificación | — |

**Total: ~14–19 h CC.** Dependencias: B2 depende de B1; B3 depende de B2; B4 independiente (puede ir en paralelo).

---

## 9. Decisiones — RESUELTAS (Esteban, 2026-07-06)

1. **D1 — enlace SO↔slot: ✅ (c) tag en `name`.** B1 guarda `so_id`/`so_nombre` en `planning.slot.name` (estructura parseable); B2 lo lee. Robusto para SOs-bucket. `sale_line_id`/`project_id` = Fase 2 tras cleanup de SOs. (§3.2)
2. **D2 — `x_studio_manager_approval`: ✅ SÍ + resetear los 75.** Se usa como "confirmado por Felipe" (paso 1 de la cadena Manager→HR→Finanzas). **Los 75 `true` históricos se resetean a `false` antes del go-live de B4** (vía workflow/one-shot, NO por MCP que es read-only). B4 solo actúa sobre attendances cerradas + sin disputa; confirma con nota al chatter (omitir `author_id`). (§4.2)
3. **D3 — candado B3: ✅ BLANDO primero.** Operativos: permitir salida sin SO pero avisar/registrar (fase blanda como A3); endurecer tras 2–4 semanas de adopción. (§1.4-b)

### Pendiente de confirmar antes de arrancar
4. **Orden de PRs:** recomendado **B1 → B2 → B3** (secuencial por dependencia) con **B4 en paralelo**. Alternativa: **B4 primero** (da visibilidad a Felipe antes del candado). ← confirmar.
5. **Momento del reset de los 75:** junto con el deploy de B4.

**STOP — construcción pendiente de "adelante" explícito de Esteban.**
