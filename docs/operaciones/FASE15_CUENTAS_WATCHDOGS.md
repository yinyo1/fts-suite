# Fase 1.5 — Cuentas de departamento + Checkout por perfil + Watchdogs de confirmación

> **Estado:** 📋 **DIAGNÓSTICO + DISEÑO — read-only. NADA construido salvo el one-shot de limpieza 0a (inactivo).** STOP para aprobación de Esteban.
> **Fecha:** 2026-07-08 (día 1 de Felipe usando planeación + confirmar horas con la operación real).
> **Base:** `DIAGNOSTICO_CARGA_MO.md` (§7 cuentas plan 2, §11 bug), `MIGRACION_PROJECT_ID.md`, `FASE1_CARGA_MO_PLAN.md`, `SEMAFORO_WATCHDOG.md` (infra watchdog).
> **Regla dura:** cero writes a Odoo, cero cambios a workflows/frontend productivos. El único artefacto creado es el one-shot inactivo `admin/cleanup-datos-prueba-esteban` (0a), que Esteban activa con 1 clic.
> **MCP Odoo:** verificado vivo (UID 2, read-only) — `hr.attendance` total 10,119, última id 14215.

---

## 0. Verificación de sesión + limpieza (0a) + vigilancia (0b)

### 0.a — Datos de prueba a borrar ✅ verificados (one-shot construido, INACTIVO)

| Modelo | id | Detalle verificado |
|---|---|---|
| `hr.attendance` | **14158** | emp 32 (Esteban) · 2026-07-07 · `x_studio_project_id=[160,Magnekon]` = `x_studio_sales_order_2` (mismo id) · out_mode kiosk |
| `hr.attendance` | **14159** | emp 32 · 2026-07-07 · `x_studio_project_id=[121,Vertiv]` = `x_studio_sales_order_2` (mismo id) · out_mode kiosk |
| `planning.slot` | **842** | resource 32 · martes 7-jul · name `SO#121\|…VERTIV… · ejemplo` · published |
| `planning.slot` | **843** | resource 32 · **lunes 6-jul** · name `SO#121\|…VERTIV… · prueba` · published (creado 7-jul en la noche) |

- Son los **únicos 2** `planning.slot` de resource 32 (verificado). El "del lunes 6-jul" es el **843**.
- **`x_categoria_nomina` de emp 32 = `'ceo'`** ✅ (sigue correcto; depto 5 Dirección).

**One-shot construido:** workflow n8n **`admin/cleanup-datos-prueba-esteban (one-shot 0a)`** — **id `97Qj9v46ILOWV9Lf`, INACTIVO**, 5 nodos, validado (0 errores). Manual Trigger → 2 ramas paralelas: `Odoo DELETE hr.attendance` (14158, 14159) + `Odoo DELETE planning.slot` (842, 843). `onError:continue` + `alwaysOutputData`. **Esteban lo activa/ejecuta con el Manual Trigger** (o toggle Active) y luego lo borra. No toca nada más.

### 0.b — Primer checkout real con plan de Felipe — ⏳ PENDIENTE DE OBSERVACIÓN

- Al momento del diagnóstico (~10:47 CST) **hay 28 empleados con jornada abierta hoy** (Ops mayoría + Comercial + Admin + Legal + RH; Mateo emp 75 = att 14202) y **CERO checkouts cerrados aún**.
- **La doble escritura YA está viva** (evidencia: att 14158/14159 de prueba tienen `x_studio_project_id` = `x_studio_sales_order_2`, mismo id, proyecto correcto — Migración Paso A/C desplegado).
- **Acción:** en cuanto cierre el primer checkout real con plan, verificar por MCP: `x_studio_project_id` poblado con el proyecto del plan, igual a `x_studio_sales_order_2`, y que fue el pre-llenado (banner) el que lo puso. **Reportaré ese primer caso a Esteban** (queda para el turno de la tarde/noche — se puede re-consultar bajo pedido).

---

## PARTE 1 — Cuentas de departamento (plan 2 "Gasto Indirecto en FTS")

### 1.1 — Cuentas plan 2 ACTIVAS hoy (refresh §7): **31 cuentas**, plan_id 2 = "Gasto Indirecto en FTS"

Mapeo propuesto **hr.department → cuenta** para TODOS los departamentos con empleados activos:

| Depto (id) | # activos | Cuenta plan 2 propuesta (id) | Estado |
|---|---:|---|---|
| **Operaciones (3)** | 19 | — (carga a **PROYECTO**, no a cuenta indirecta) · overhead disponible: 636 Oficina/Taller, 632 Caja Herramientas, 744 EPP, 509 Gasolina | ✅ (por proyecto) |
| **Comercial (6)** | 8 | **608** "SO7596 - CENTRO DE COSTO VENTAS" | ✅ existe |
| **Administracion y Finanzas (18)** | 2 | **513** "SO8439 Administración" (alt. 636 Oficina/Taller) | ✅ existe |
| **Legal (9)** | 1 | **768** "SO7598 – LEGAL" | ✅ existe |
| **Recursos Humanos (16)** | 1 | **478** "SO7595-CENTRO DE COSTOS RH" (alt. 772 RH de Administración) | ✅ existe |
| **Dirección (5)** | 1 (Esteban) | — | 🔴 **HUECO — no hay cuenta** |
| **Ingeniería (17)** | **0** | — | 🟡 sin empleados hoy → sin urgencia |
| _sin depto (148, 81)_ | 2 | — (pseudo-empleados "Administracion FTS-YIN" / "CAJERO 1", NO personas) | ignorar |

### 1.2 — Huecos confirmados (cuentas que Esteban debe crear en Odoo)

1. **🔴 Dirección (5):** no existe cuenta indirecta. Hoy solo la usa Esteban (CEO). **Sugerido crear:** `SOxxxx - DIRECCION` (o reusar 513 Administración si se prefiere no separar). Convención de las existentes: prefijo `SOxxxx - <NOMBRE MAYÚSCULAS>`.
2. **🟡 "Admin de Operaciones" (día administrativo de un operativo):** el requerimiento de Parte 6 (Mateo un día administrativo carga a "Admin de Operaciones") **no tiene cuenta hoy**. Opciones: (a) reusar **636** "Oficina Administración y Taller FTS" como el bucket de días-admin de Ops; (b) crear `SOxxxx - ADMIN DE OPERACIONES` dedicada. **Recomiendo (b)** si se quiere separar el overhead admin de Ops del de oficina.
3. **Ingeniería (17):** sin empleados activos → **no crear ahora**; anotar como hueco latente (si vuelve a haber ingeniería con jornada propia, crear `SOxxxx - INGENIERIA`).

> **Cuáles faltan, exactamente, para que Esteban las cree:** (1) `DIRECCION`, y (2) `ADMIN DE OPERACIONES` (si elige separarla). Todo lo demás ya existe.

### 1.3 — Verificación del supuesto: **ninguna cuenta plan 2 tiene proyecto** ✅

- Búsqueda `project.project WHERE account_id in [las 31 cuentas plan 2]` → **0 resultados**. Son cuentas analíticas puras (centros de costo indirectos), **sin `project.project` asociado**. Confirma el supuesto de la Parte 1.2 del brief.

### 1.4 — 🧭 DECISIÓN DE ESQUEMA: ¿dónde vive la cuenta en el attendance? (proponer, NO implementar)

El attendance ya tiene `x_studio_project_id` (m2o `project.project`) para trabajo a proyecto. Para trabajo indirecto (admin/comercial) falta un destino. Tres opciones:

| Opción | Mecanismo | Reasignación Felipe | Watchdogs (P3) | Fase 3 (nómina CONTPAQi) | Campos Studio |
|---|---|---|---|---|---|
| **(a) Campo nuevo m2o** `x_studio_cuenta_indirecta` → `account.analytic.account` en `hr.attendance` | El attendance guarda la cuenta indirecta cuando NO es proyecto | ✅ Felipe cambia el valor en el panel (proyecto ↔ cuenta) | ✅ W1 lee 1 campo: "sin proyecto Y sin cuenta" = ambos vacíos | ✅ regla única: destino = `project.account_id` si hay proyecto, si no `cuenta_indirecta`, si no fallback por depto | **+1 campo** |
| **(b) Derivar siempre de `hr.department`** al distribuir (nada nuevo en attendance) | La cuenta se calcula en Fase 3 leyendo el depto del empleado | ❌ **NO puede** — no hay dónde guardar el override de un día puntual (Mateo → "Admin de Operaciones") | ⚠️ W1 no distingue "sin atribución" limpio; hay que recomputar el mapa en cada watchdog | ✅ pero rígido (siempre el default del depto) | 0 campos |
| **(c) Híbrido (RECOMENDADO)** = (a) + **write-through**: al checkout se escribe el default del depto en el campo; el campo es override + registro explícito | Campo siempre poblado (default o elegido) | ✅ igual que (a), y el panel muestra un valor concreto que Felipe edita | ✅ el mejor: attendance auto-descriptivo, W1 = campo vacío solo en huecos reales | ✅ regla única; el campo ES la verdad, el depto es solo el fallback de arranque | **+1 campo** |

**RECOMENDACIÓN: (c)** — un solo campo `x_studio_cuenta_indirecta` (m2o `account.analytic.account`), poblado al checkout con el default del depto (write-through), editable por Felipe. Cumple "campos mínimos en Studio" (1 campo), habilita reasignación, hace los watchdogs triviales, y es **autoprogresivo** (empleado nuevo → cae al default de su depto sin intervención). El mapa `depto→cuenta` vive en **`shared/config/departamentos-cuentas.json`** (una sola fuente que leen el checkin, el panel y Fase 3).

- **Por qué NO (b):** el requerimiento explícito "Felipe puede reasignar la cuenta de alguien" y "todos los perfiles pueden cambiar a una cuenta de departamento" **exige** un lugar donde persistir esa elección. (b) no lo tiene.
- **Nota:** `x_studio_project_id` y `x_studio_cuenta_indirecta` son mutuamente excluyentes por fila (proyecto O cuenta). La regla de distribución Fase 3 los ordena: proyecto gana; si no hay proyecto, la cuenta.

---

## PARTE 6 — Bug de ruteo (caso Mateo) — 🔴 PRIORIDAD ALTA

### 6.1 — Causa raíz confirmada en código + datos

- **`kiosk.js` `iniciarSalida()` (L865-908):** llama `perfilEmpleado(emp)` **primero**; si el perfil es `admin` → `soSeleccionada=null; registrarAsistencia()` (L871-876) **sin jamás consultar el plan** (`getPlanDia` solo se llama en la rama operativo/comercial, L892). Por eso el proyecto que Felipe le puso a Mateo en el plan se ignora.
- **`perfilEmpleado()` (L850-863):** `x_categoria_nomina === 'confianza'` → `'admin'`. Mateo (75) es `confianza` + Operaciones + Supervisor Sr de CAMPO → mal clasificado como admin → salta el modal.
- **Dato que agrava el diseño:** `x_categoria_nomina` está **VACÍO (`false`) en 27 de 34 empleados activos** (solo 7 la tienen). El proxy de nómina es poco fiable; la mayoría cae al fallback por departamento. Los únicos `confianza` son Mateo (75) y **Felipe (112)** — ambos de campo → ambos mal ruteados a admin.

### 6.2 — Rediseño: **EL PLAN GANA SOBRE EL PERFIL** (dos fixes que se refuerzan)

**Fix 1 — Consultar el plan SIEMPRE (primary):**
- `iniciarSalida()` llama `getPlanDia(emp.id)` **para todos los perfiles** (mostrando `ks-project` en estado CARGANDO), ANTES de descartar el modal.
- Si `plan.so_id` existe → **Estado CON PLAN** (banner confirmar/cambiar) **sin importar el perfil**. Mateo con plan → confirma su proyecto en 1 tap.
- Si NO hay plan → se ramifica por perfil para la pantalla SIN PLAN (§Parte 2).
- **Costo:** 1 llamada extra `getPlanDia` en los checkouts de admin (~5/día: RH/Legal/Admin/Dirección). Trivial. Ya hay timeout defensivo de 6s (L883) que cae a "sin plan".

**Fix 2 — `perfilEmpleado()` por DEPARTAMENTO, no por categoría (refuerzo):**
- Derivar el perfil primariamente del `department_id` (poblado en 34/34 reales), con `x_categoria_nomina` degradada a desempate opcional:
  - depto **3** (Operaciones) → **operativo** (aunque sea `confianza`/`ceo` — los supervisores de campo cargan a proyecto).
  - depto **6** (Comercial) → **comercial**.
  - depto **5/9/16/18** (Dirección/Legal/RH/Admin) → **admin**.
  - default → **operativo** (fail-open al flujo de SO).
- Esto arregla a Mateo **también los días sin plan** (hoy caería en admin y a la cuenta de Ops que no existe; con el fix es operativo → lista de proyectos + opción cuenta).

> Los dos fixes son independientes y ambos recomendados. El Fix 1 solo ya elimina la fricción cuando hay plan (el caso de hoy); el Fix 2 endurece los días sin plan.

**Matriz integrada en Parte 2.** Prioridad: **PR-1 (Mateo) va primero** en la secuencia.

---

## PARTE 2 — Checkout por perfil (matriz completa)

Regla maestra: **1) siempre se consulta el plan; 2) si el plan trae proyecto → CON PLAN (gana); 3) si no → por perfil; 4) TODOS pueden cambiar a una cuenta de departamento.**

| Perfil | CON plan (slot con proyecto HOY) | SIN plan | Se escribe en el attendance |
|---|---|---|---|
| **Operativo** (depto 3) | Banner **CON PLAN**: "✔ Confirmar proyecto" / "Cambiar" | Lista de proyectos + "Registrar sin proyecto" (candado **blando**) **+ opción "Cargar a cuenta de departamento"** (p.ej. día admin → Admin de Operaciones) | proyecto→`x_studio_project_id`; cuenta→`x_studio_cuenta_indirecta`; sin nada→ambos vacíos (dispara W1) |
| **Comercial** (depto 6) | Banner **CON PLAN** (proyecto del plan gana) | Banner con su cuenta **"Comercial" (608) PRE-SELECCIONADA** (estilo plan) + "¿Apoyaste en un proyecto? Elígelo" | proyecto elegido→`project_id`; default→`cuenta_indirecta=608` |
| **Admin** (deptos 5/9/16/18) | Banner **CON PLAN** (si Felipe los jaló al plan → proyecto gana) | Pantalla muestra **su cuenta de depto** (ej. "Administración") en vez de "—", **sin fricción** + opción "Cambiar (proyecto u otra cuenta)" | default→`cuenta_indirecta` = cuenta del depto; si cambia→proyecto o la cuenta elegida |

- **Común a todos:** control "Cambiar a cuenta de departamento" (selector de cuentas plan 2) — habilita el caso "hoy fue día administrativo".
- **Admin hoy = "—":** el cambio es **solo visibilidad + escritura del default** (mínima fricción). No se le pide nada; se le muestra a dónde va y puede cambiarlo.
- **Anti-patrón #15 respetado:** todos los hooks son PRE-POST (ruteo del modal + selección), NUNCA tocan `registrarAsistencia` (pantalla de confirmación después del OK del fetch).

**Dependencias:** la columna "cuenta" (comercial default, admin default, opción cambiar) **depende del campo `x_studio_cuenta_indirecta` (Parte 1.3) + un catálogo de cuentas** (endpoint tipo `/kiosk/sos` pero para cuentas plan 2, o extender `/kiosk/empleados` para devolver la cuenta default del depto). El **fix "plan gana" (Parte 6) NO depende de esto** → se puede shippear primero.

---

## PARTE 4 — Panel «Confirmar Horas» (extensión)

### 4.1 — Cambio de filtro (ver a otros deptos SIN proyecto)

- **Hoy:** en `planeacion/horas-dia` (`pQ3vVbRkMYvfICQf`), nodo `Code - Build response`, la línea `if (!esOps && !tieneSO) return null;` deja fuera a los no-Ops sin proyecto.
- **El SEARCH ya trae TODAS las attendances del rango** (sin filtro de depto; el corte es solo en Code) y **ya lee `x_studio_project_id`**. Cambio mínimo: **relajar/quitar** esa línea → Felipe ve a todos los del día (todos los deptos), con o sin proyecto.
- Añadir `x_studio_cuenta_indirecta` a `fieldsList` del SEARCH y exponer `cuenta_id`/`cuenta_nombre` en cada `row`.

### 4.2 — Nueva acción: asignar cuenta de departamento O proyecto

- `confirmar-horas.js` ya tiene la acción `correct_so` (escribe proyecto). Añadir acción **`assign_account`** (escribe `x_studio_cuenta_indirecta`) — depende del campo (Parte 1.3).
- Backend: extender el workflow `planeacion/confirmar-horas` (`7D3lgaYmH2DmqCWy`) con la rama `assign_account` (`update hr.attendance` → `x_studio_cuenta_indirecta`), junto a las ramas `correct_so`/`manager_approval` existentes.
- El panel ya pinta un badge `department_name` para filas no-Ops (`es_operaciones===false`) → agregar la columna cuenta (mostrar + editar).

---

## PARTE 3 — Watchdogs (correo vía n8n)

### 3.0 — Infra reutilizada de `SEMAFORO_WATCHDOG.md`

| Pieza | Reuso |
|---|---|
| **Schedule trigger** | cron n8n `0 14 * * 1-5` (8 AM CST). ⚠️ **`settings.timezone="UTC"` a mano tras importar** (n8n lo descarta → default UTC-4 = mediodía CST). Ver lección §9.10. |
| **Envío de correo** | nodo HTTP Graph `POST /users/sales@fts.mx/sendMail`, cred **`Microsoft Graph - sales`** (`Mh5kBNduMzOl3nzT`), 202 = OK. |
| **Config desde GitHub raw** | patrón `HTTP load config` (Response Format = JSON). Nuevo `shared/operaciones/watchdogs_mo.json` (destinatarios + umbrales + go-live date). |
| **Idempotencia** | `staticData` (set previo) para anti-spam / event-driven. |
| **Activación** | **solo toggle Active en UI** (MCP no activa) + confirmar `active:true` + `triggerCount:1`. |

**Recomendación de empaque:** **1 workflow nuevo `ops/watchdog-carga-mo`** con W1+W2 (ambos leen el mismo dataset diario de `hr.attendance`), + **W3/W4 integrados dentro de `planeacion/confirmar-horas`** (event-driven, ver abajo).

### 3.1 — W1 · Checkout sin cuenta NI proyecto

- **Disparador:** diario ~9:00 AM CST (cubre el día anterior).
- **Condición:** `hr.attendance` `check_out != false` **AND** `check_in >= <go_live>` (a partir de hoy 2026-07-08) **AND** `x_studio_project_id = false` **AND** `x_studio_cuenta_indirecta = false` **AND** `x_studio_horario_en_disputa != true`.
- **Correo:** lista `empleado · fecha · horas (worked_hours)`. Solo envía si hay ≥1.
- **Destinatarios (propuesta):** Esteban + Felipe.
- **Depende de:** campo `x_studio_cuenta_indirecta` (Parte 1.3). Sin el campo, W1 = "sin proyecto" (menos preciso).

### 3.2 — W2 · Horas del día anterior SIN confirmar por Felipe

- **Disparador:** diario ~10:30 AM CST, **solo si quedan pendientes**.
- **Condición:** attendances con `check_in` = ayer (CST), `check_out != false`, `x_studio_manager_approval != true`, `x_studio_horario_en_disputa != true`.
- **Correo:** lista de pendientes + conteo ("N jornadas de ayer sin confirmar").
- **Destinatarios:** Felipe (+ Esteban).
- **Listo hoy:** `x_studio_manager_approval` ya existe y B4 lo escribe → W2 no depende de campos nuevos.

### 3.3 — W3 · Reasignación cross-depto (aviso inmediato)

- **Naturaleza:** event-driven ("aviso inmediato", transparencia, no bloqueo).
- **Mecanismo (recomendado):** rama nueva **dentro de `planeacion/confirmar-horas`**: tras un `correct_so`/`assign_account`, si el **depto del empleado ≠ Operaciones (3)** → correo Graph inmediato. (Lookup del depto del empleado en el mismo workflow.) Más limpio y realmente inmediato que un poll.
- **Correo:** "Felipe reasignó a `<empleado>` (`<depto>`) → `<proyecto/cuenta>`".
- **Destinatarios (propuesta):** Esteban (+ Ana Laura RH, configurable).

### 3.4 — W4 · Doble confirmación / re-modificación de attendance ya confirmado (anti-manipulación, SIN campos nuevos)

- **Detección primaria (recomendada, sin campos nuevos):** **guardia read-before-write en `planeacion/confirmar-horas`** — antes de escribir, READ del attendance; si `x_studio_manager_approval` **ya era `true`** y llega un cambio (SO/cuenta/horas o re-confirmación) → **flag + correo** anti-manipulación. Cero campos nuevos.
- **Detección secundaria (opcional):** scan diario del **chatter** (`mail.message` sobre `hr.attendance`) buscando toggles repetidos de `manager_approval` — reusa el patrón `mail.tracking.value` del semáforo (§5.4). Requiere que el campo tenga tracking activo; si no, la guardia in-workflow basta.
- **Destinatarios (propuesta):** Esteban + Ana Laura.

### 3.5 — Config de destinatarios (propuesta)

`shared/operaciones/watchdogs_mo.json` — **destinatarios decididos por Esteban (2026-07-08):** Esteban en todos; **W2 también Felipe**; **W3/W4 también Ana Laura**.
```json
{
  "go_live": "2026-07-08",
  "w1_sin_atribucion": { "activo": true, "hora_cst": 9,  "to": ["estebandelacruz@fts.mx"] },
  "w2_sin_confirmar":  { "activo": true, "hora_cst": 10, "to": ["estebandelacruz@fts.mx", "felipe@fts.mx"] },
  "w3_cross_depto":    { "activo": true, "to": ["estebandelacruz@fts.mx", "ana.laura@fts.mx"] },
  "w4_re_confirmacion":{ "activo": true, "to": ["estebandelacruz@fts.mx", "ana.laura@fts.mx"] }
}
```
(Correos exactos de Felipe/Ana Laura a confirmar; los del semáforo ya usan sus alias — reusar los mismos.)

---

## PARTE 5 — Campo "cantidad de horas" en planeación (mini-investigación)

### Hallazgo: es el campo de **HE (Horas Extra), independiente — SE QUEDA**

- El único campo numérico manual en la tarjeta/modal de asignación es **`m-he`** = **"Horas extras planeadas (h)"** (`planeacion.js` L325, min 0 / max 6 / step 0.5). **No existe** ningún campo literal "cantidad de horas" ni un total de horas manual (grep confirmado).
- **NO es un duplicado de las horas netas.** Las horas netas se calculan aparte (`J.calcularNeta(entrada, salida)`, validador 9.6h). `he` es un dato **independiente**: overtime planeado.
- **Sí se consume** (no es campo muerto): exportación **WhatsApp** (`exportar.js` L39/L63 — línea "+Xh Horas extras" + total) y **PNG** (L95/L118-119/L149 — columna "H. extras" + total), banner de totales (`totalHE`) y badge por tarjeta. Va en el payload B1 (`he`).
- **Recomendación:** **conservarlo.** No viola "una sola fuente de verdad" (netas = entrada→salida; HE = overtime planeado, otra dimensión). Único nit cosmético opcional: el label ya dice "Horas extras planeadas" — si a Felipe le confunde, aclarar copy; no hay nada que eliminar.

---

## Secuencia de PRs sugerida (Mateo priorizado)

| # | PR | Alcance | Depende de | Odoo (Esteban) | Est. |
|---|---|---|---|---|---|
| **0a** | (no-PR) activar one-shot | borrar prueba emp 32 (att 14158/14159 + slots 842/843) | — | activar `97Qj9v46ILOWV9Lf` (1 clic) | 2 min |
| **PR-1** 🔴 | **kiosk.js — PLAN GANA + perfil por depto** | Parte 6 Fix 1 + Fix 2. Frontend puro. **Arregla a Mateo YA.** | B2 `getPlanDia` (ya vivo) | **ninguno** | 3–4 h |
| **PR-2** | Checkout UX cuenta (admin muestra cuenta, comercial default, "cambiar a cuenta" para todos) | Parte 2 columna cuenta | campo + catálogo cuentas + checkin escribe cuenta | crear campo + cuentas | 4–5 h |
| **PR-3** | Panel Confirmar Horas (filtro todos-deptos + acción asignar cuenta) | Parte 4 | campo + `confirmar-horas` workflow | (el campo de PR-2) | 3–4 h |
| **PR-4** | Watchdogs W1–W4 (n8n) | Parte 3 | W1 ← campo; W2 listo; W3/W4 ← `confirmar-horas` | config JSON | 4–6 h |
| **Parte 5** | — | ninguno (HE se queda) | — | — | — |

**Ruta crítica de Mateo:** **PR-1 no depende de Odoo ni del campo** → se puede shippear **de inmediato** (fricción diaria de Mateo desde ya). El resto espera la creación del campo/cuentas.

**Total CC estimado:** **~14–19 h** repartidas en 4 PRs (fuera 0a).

---

## Qué toca Esteban en Odoo (Studio, MCP es read-only)

1. **Activar** el one-shot `97Qj9v46ILOWV9Lf` (limpieza 0a) → borra prueba → borrar el workflow.
2. **Crear campo** (si aprueba esquema (c)): `hr.attendance` → `x_studio_cuenta_indirecta`, **Many2one → `account.analytic.account`**, label "Cuenta indirecta", sin required.
3. **Crear cuentas plan 2 faltantes:** `DIRECCION`; y `ADMIN DE OPERACIONES` si separa el día-admin de Ops del bucket oficina (636). (Ingeniería: diferir, 0 empleados.)
4. Confirmar correos exactos de Felipe / Ana Laura para los watchdogs.

## Decisiones que Esteban debe tomar (antes de construir)

1. **🔴 Esquema Parte 1.3:** (a) campo · (b) derivar · **(c) campo + write-through (recomendado)**.
2. **Cuentas a crear:** ¿`DIRECCION` con ese nombre? ¿`ADMIN DE OPERACIONES` dedicada o reusar 636?
3. **Comercial default:** 608 pre-seleccionada y cambiable (recomendado) vs. forzada.
4. **Watchdog W1 go-live:** confirmar "a partir de hoy" = 2026-07-08.
5. **Destinatarios por watchdog:** ✅ RESUELTO (2026-07-08) — Esteban en todos; W2 +Felipe; W3/W4 +Ana Laura.
6. **Orden de PRs:** confirmar **PR-1 (Mateo) primero**, independiente del resto.

---

## PARTE 7 — Proceso permanente de cierre (budget→done + cuenta→archivada) — DISEÑO

> Formaliza el cierre ejecutado por consola (2026-07-09: 27 budgets `action_budget_done` + 40 cuentas archivadas). El **flujo extendido de Frente B** (`project/archive-budget-cierre`, id `RW7KnoeEzYLvavI0`) debe hacer **AMBOS en el mismo disparo de etapa terminal**: `budget.state→done` **y** `account.analytic.account.active→false`. Hoy Frente B solo archiva la cuenta (falta el `action_budget_done`).

### 7.1 — Ciclo confirmado (método oficial)
- **Budget:** `action_budget_done` (método del modelo `budget.analytic`) → `state='done'`. Es el camino oficial (funcionó en el cierre por consola). Complementa/valida el patrón A1 (que crea el budget en `state='confirmed'`).
- **Cuenta:** `active=False` (prevención dura nativa — el widget analítico oculta cuentas inactivas en captura). Ya validado por Frente B (53 cuentas en go-live).
- **Ambos en el mismo trigger de stage** para no dejar budgets abiertos con cuenta archivada (o viceversa).

### 7.2 — Incluir stage **14 "Incobrables"** (gap detectado)
- Frente B archiva hoy `stage_id in [8,13,10,4]`. **Falta `14`** → las cuentas de proyectos incobrables nunca se archivan solas (6 detectadas en la auditoría). **Agregar `14` a la lista.**
- ⚠️ **Caso especial AR:** un incobrable **por definición NO llega a AR=0** (el residual queda abierto = deuda incobrable). Si el gate de archivado exige `AR=0`, un incobrable **jamás** se archivaría. → Para stage **14**, archivar **sin exigir AR=0** (solo `AP=0`, o directo). El write-off ya asume que no se cobra.

### 7.3 — 🔀 Trade-off en crédito (stage 13): archivar al ENTRAR vs al AR=0

| | **(A) Archivar al ENTRAR a crédito** (tu regla: cero gasto nuevo desde plazo de crédito) | **(B) Archivar al AR=0** (comportamiento actual de Frente B) |
|---|---|---|
| Gasto nuevo | **Bloqueado duro** (cuenta inactiva → no seleccionable en captura) | Permitido hasta que se liquide todo |
| Cobranza (AR) | No se afecta (el AR vive en `account.move`/partner, no en el flag `active` de la cuenta) | Igual |
| Semáforo crédito (stage 13) | Sigue funcionando (mide stage + vencimiento factura, no el flag de la cuenta) | Igual |
| **Factura tardía legítima de proveedor** | 🔴 **PROBLEMA:** la cuenta está archivada → la Bill **no puede** atribuirse al proyecto → el costo queda **huérfano (fuga R3)** o hay que **des-archivar → postear → re-archivar** (fricción + riesgo). El candado A3 la forzaría a un indirecto (plan 2) → costo mal atribuido, rentabilidad del proyecto subcontada. | ✅ La Bill mantiene `AP≠0` → la cuenta sigue activa → **el costo tardío se atribuye correcto** al proyecto → luego se archiva liquidado. Captura el costo REAL completo. |
| Alineación con Frente A | ⚠️ Riesgo de **subcontar** el costo del proyecto (late bills stranded) → peor rentabilidad | ✅ Rentabilidad más fiel (costo completo) |

**RECOMENDACIÓN: híbrido (lo mejor de ambos).**
1. **Al ENTRAR a crédito (stage 13):** `budget→done` **inmediato** (congela el plan; no más cambios de budget) + **log note** al chatter ("entró a crédito — no capturar gasto nuevo salvo factura tardía justificada"). **NO archivar la cuenta todavía.**
2. **Archivar la cuenta** solo cuando **`AR=0 Y AP=0`** (gate actual de Frente B) → preserva la atribución de la factura tardía legítima (mientras `AP≠0`, la cuenta sigue viva).
3. **Enforcement "cero gasto nuevo" = BLANDO por visibilidad:** el detective ya existente **`fin/detect-gasto-cierre`** (id `zLmmY0pqYC9kjLaw`) ya vigila Bills posteadas sobre proyectos en stages de cierre `[7,9,10,13,8,4]` → **correo a Esteban** cuando entra gasto en crédito. Así el control es "flag + rendición de cuentas", no un bloqueo duro que estrangule costos legítimos.

**Por qué híbrido y no (A) puro:** el objetivo de Frente A es la **rentabilidad fiel por proyecto**. Archivar al entrar a crédito optimiza higiene pero **sacrifica exactitud** (late bills legítimos quedan fuera). El detective da el control sin ese costo. Si en la práctica el gasto-en-crédito resulta ser casi siempre mala atribución (no late bills legítimos), se endurece a (A) — decisión basada en lo que el detective reporte las primeras semanas.

### 7.4 — Resumen del trigger terminal (para construir en Frente B, cuando se apruebe)
| Al entrar a stage | budget | cuenta | nota |
|---|---|---|---|
| **8** Complete / **4** Canceled | → `done` | → `active=False` si `AR=0 Y AP=0` | terminal, sin ambigüedad |
| **14** Incobrables (nuevo) | → `done` | → `active=False` si `AP=0` (**ignorar AR**) | write-off; AR nunca llega a 0 |
| **13** En plazo de crédito | → `done` **al entrar** | → `active=False` cuando `AR=0 Y AP=0` (no al entrar) | híbrido §7.3; detective flag-ea gasto nuevo |
| **1/2/5/3/7** ejecución/admin | — | — | gasto legítimo, no cerrar |

⚠️ **No implementar aún** — diseño para aprobación. Toca el workflow productivo `RW7KnoeEzYLvavI0` (Frente B).

---

## PARTE 8 — Auditoría de arquitectura analítica + diseño del catálogo de centros de costo (read-only)

> **Objetivo:** que la estructura analítica sirva para un **estado de resultados por área gerencial**, no solo para el checkout. Todo read-only (MCP UID 2). Ventana volumen = 12m (desde 2025-07-09). **STOP antes de crear/mover/archivar nada.**

### 8.A — Campos Studio reusables (`hr.attendance`) — ✅ VEREDICTO: REUSAR, cero campos nuevos

| Campo | Label actual | Poblados | Rango | Contenido | Leído por |
|---|---|---:|---|---|---|
| `x_studio_analytic_2` | "Analytic 2" | **2,381** | ago-2025 → **29-ene-2026** | centros de costo (608 Ventas, 768 Legal, 771 Compras, 772 RH) + algunos proyectos | **nadie** (grep repo=0; `horas-dia` fieldsList NO lo incluye) |
| `x_studio_many2one_field_GUbBF` | "Analytic 1" | **2,381** | idem | **valores IDÉNTICOS** a Analytic 2 (duplicado) | nadie |

- Son **duplicados** (mismos 2,381 attendances, mismos valores). Fue el tagging histórico de centro de costo, **abandonado desde 29-ene-2026** (antes del feature SO-en-checkout de ~abril). Ningún workflow/vista/repo los lee o escribe.
- **✅ REUSAR `x_studio_analytic_2`** como "Cuenta Indirecta": solo **renombrar la etiqueta en Studio** → "Cuenta Indirecta". **Cero campos nuevos.** El otro (`GUbBF`) queda deprecated (ignorar o archivar). Los valores viejos (mix con algún proyecto) no molestan: nadie los lee y las escrituras nuevas serán indirecto-only. (Opcional: limpiar los 2,381 viejos; no urge.)
- ⇒ **La Parte 1.3 se resuelve sin crear `x_studio_cuenta_indirecta`.** Reusar Analytic 2.

### 8.B — Auditoría de planes analíticos (17 planes; 3 vivos-core + estructura)

**Volumen real (12m) y veredicto por plan:**

| Plan (id) | Cuentas act/arch | Líneas 12m | $ 12m (neto) | Pregunta de negocio | Veredicto | Dependencias al tocar |
|---|---:|---:|---:|---|---|---|
| **1** Gasto Directo a proyectos | 27 / 316 | 9,593 | +$860k | **costo/ingreso por PROYECTO** | ✅ **EJE 1 (Proyectos)** | budgets `account_id`, rentabilidad nativa, A3 OK_ROOTS, `x_studio_project_id` |
| **2** Gasto Indirecto en FTS | 31 / 13 | 3,950 | **−$9.11M** | **costo por CENTRO DE COSTO / área** | ✅ **EJE 2 (Centros de costo)** | distribution.models, A3, `x_studio_analytic_2` |
| **20** Upgraded Budget Plan | 28 / 0 | 9,267 | −$3.6M | **naturaleza del gasto (RUBRO)** | ✅ **EJE 3 (Rubros)** — pero **ampliar** (ver 8.D) | budget.line `x_plan20_id`, distribution.models |
| **18** Gasto directo proyectos USA | 7 / 1 | 31 | +$16k | eje 1 para FTS USA | ✅ mantener (eje 1 · USA) | A3 OK_ROOTS, multicompany |
| **21** Gasto Indirecto FTS USA | 1 / 0 | 5 | −$314 | eje 2 para FTS USA | ✅ mantener (eje 2 · USA, poblar) | — |
| **5** Assets | 147 / 115 | 384 | −$1.65M | registro de activos / CAPEX | 🟠 **REVISAR:** ¿4º eje CAPEX o fold a rubro? material | **A3 OK_ROOTS**, 147 cuentas |
| **11** Inmuebles | 29 / 1 | 324 | −$256k | costo por inmueble | 🟠 consolidar → centro de costo (plan 2) salvo que quieras P&L por inmueble | A3 OK_ROOTS |
| **8** Combustible | 23 / 0 | 13 | −$12k (YIN) | gasto combustible | 🟠 **CONSOLIDAR** → rubro 1155 (ya existe) + centro costo; **triple overlap** (plan 8 + rubro 1155 + cuenta 509 Gasolina) | A3 OK_ROOTS |
| **13** Flota | 1 / 0 | 7 | −$8.7k | gasto flota | 🟠 consolidar → plan 2 (308/527 ya existen) | A3 OK_ROOTS |
| **3** Gastos personales Esteban | 1 / 1 | 74 | −$377k | gastos personales (NO P&L operativo) | ⚪ mantener SEPARADO (finanzas) | — |
| **14** Ajuste contable | 2 / 0 | 95 | ±$13M gross | ajustes/préstamos contables | ⚪ mantener (mecanismo finanzas, no es "área") | — |
| **12** Gastos FTS USA | 1 / 0 | minor | minor | gastos USA | 🟠 consolidar con 21 (dup USA) | — |
| **15** Plan for FTS USA | 2 / 0 | minor | minor | USA | 🟠 revisar/archivar (dup USA) | — |
| **17** Gasto FTS Brasil | 1 / 0 | minor | minor | Brasil | ⚪ mantener si hay ops Brasil; si no, archivar | — |
| **7** Materiales (child de Assets) | **0** | ~0 | ~0 | — | 🔴 **ARCHIVAR (muerto, 0 cuentas)** — overlap con 9 / rubro 1154 / rubro 1176 | ninguna |
| **9** Materiales (root) | **0** | ~0 | ~0 | — | 🔴 **ARCHIVAR (muerto)** | ninguna |
| **16** Default | **0** | ~0 | ~0 | — | 🔴 **ARCHIVAR (vanity)** | ninguna |
| **19** Project | **0** | ~0 | ~0 | — | 🔴 **ARCHIVAR (vanity, dup conceptual de plan 1)** | ninguna |

**Hallazgos:**
- **Hipótesis de 3 ejes VALIDADA** para el P&L operativo: **1 Proyectos · 2 Centros de costo · 20 Rubros** son los 3 vivos y de mayor volumen. Los demás son (a) el **espejo USA** (18/21), (b) **sub-ejes de activo/gasto** que se solapan (5/8/11/13), (c) **finanzas puras** (3/14), (d) **muertos** (7/9/16/19).
- **4 planes muertos** (7/9/16/19, 0 cuentas) → archivar, cero dependencias.
- **Overlaps reales:** Combustible en 3 lugares (plan 8 + rubro 1155 + cuenta 509); Flota en 2 (plan 13 + cuentas 308/527); "Materiales" en 4 (plan 7, plan 9, rubro 1154, rubro 1176). Consolidar hacia el modelo 2-ejes (centro de costo × rubro).
- ⚠️ **Dependencia crítica — A3 (candado Reglas 56/57):** `OK_ROOTS={1,18,2,5,8,11,13}`. Incluye **5/8/11/13**. Si consolidas/archivas esos planes, **hay que actualizar OK_ROOTS** o el candado A3 empezará a rechazar bills legítimos. → mover 5/8/11/13 NO es "solo archivar"; toca el candado. Recomendado: **fase 2** (primero estabilizar el modelo 2-ejes; luego migrar 8/13→plan2, decidir 5/11, y recién ahí ajustar OK_ROOTS).
- **Quién alimenta cada eje:** plan 1 ← checkout (`x_studio_project_id`) + PO/Bill + budgets; plan 2 ← Bill/PO manual + (futuro) checkout `x_studio_analytic_2`; plan 20 ← **distribution.models** (GL-prefijo→rubro) + budget.line. Cambiar 2/20 impacta las ~53 distribution.models y los budgets 2-ejes.

### 8.C — Organigrama real (por MCP) vs Odoo

**Departamentos Odoo = 7, PLANOS** (sin `parent_id`; jerarquía real vive en `hr.employee.parent_id`):

```
Esteban (32, CEO · Dirección)
├─ Rissia (97, Sales Leader · Comercial)
│   ├─ Arturo (143, Supervisor Comercial) → Ricardo (98, Ing. Comercial)
│   ├─ Aldo (78) · Luis (48) · Marcus (150) — Ing. Comercial
│   ├─ Francisco Montalvo (8, Sr Technical Sales)
│   └─ Pablo Bayly (108, MARKETING Specialist)     ← marketing vive en Comercial
├─ Felipe (112, Operations Manager · Operaciones)
│   ├─ Mateo (75, Supervisor Sr Ops)               ← campo (a proyecto)
│   ├─ Gibrán (62, SUPPLY CHAIN Specialist) → Ramiro (154, Chofer)   ← Compras/SC dentro de Ops
│   ├─ Jésus Montalvo (68, Auxiliar de COMPRAS)     ← Compras dentro de Ops
│   ├─ Gerardo Lozano (59, Auxiliar CONTABLE)       ← rol admin, MAL ubicado en Ops
│   └─ 11 técnicos/soldadores/seguristas            ← campo (a proyecto)
├─ Erick Belmont (149, Financial Analyst · Admin&Finanzas)
│   └─ Eduardo Garza (153, Consultant)
├─ Magaly (63, Gerente Legal · Legal)
│   └─ Ana Laura (101, HR Generalist · RH)          ← RH reporta a Legal
```

**Mapa persona → depto Odoo → área gerencial propuesta:**
| Persona | Depto Odoo | Área gerencial (P&L) |
|---|---|---|
| Techs/soldadores/seguristas Ops (11) + Mateo + Felipe | Operaciones | **Proyectos** (MO directa, a proyecto) |
| **Gibrán (62), Jésus Montalvo (68)** (Compras/SC) + **Gerardo Lozano (59)** (contable) + Ramiro (154) | Operaciones | **ADMIN DE OPERACIONES** (indirecto) |
| Rissia, Arturo, Ricardo, Aldo, Luis, Marcus, Francisco, **Pablo (marketing)** | Comercial | **VENTAS/COMERCIAL** |
| Esteban | Dirección | **DIRECCIÓN** |
| Erick + Eduardo | Admin y Finanzas | **ADMIN & FINANZAS** |
| Magaly (Legal) + Ana Laura (RH) | Legal + RH | **LEGAL + RH** (cluster; RH cuelga de Legal) |

- ⚠️ **Compras/Supply Chain NO es un depto Odoo** — vive dentro de Operaciones (Gibrán + Jésus Montalvo). Existen cuentas plan-2 771 COMPRAS + 383 Dpto Compras, pero sin MO atribuida (esas personas, siendo Ops, hoy irían a "operativo→proyecto" en el checkout).
- ⚠️ **Anomalía:** Gerardo Lozano (59) es "Auxiliar Contable" pero está en **Operaciones** (categoría nómina `hourly_sencilla`). Su MO debería ir a ADMIN DE OPERACIONES / Admin, no a un proyecto.

### 8.D — Diseño del catálogo de centros de costo (plan 2, sobre la arquitectura 8.B)

**Reglas:** NO duplicar (ya hay 608 VENTAS, 513 Administración, 771 COMPRAS…). Contraste con las 31 cuentas plan-2 existentes: reusar / renombrar / obsoleta / falta.

| Centro de costo (target) | Qué agrega | Rubros (plan 20) | Depto(s) Odoo | Existente / acción |
|---|---|---|---|---|
| **ADMIN DE OPERACIONES** | Compras (Gibrán 62, Jésus Montalvo 68) + Supply Chain + contable Ops (Gerardo 59) + Ramiro (154) + día-admin de Mateo | MO (1177) + EPP/herramienta/combustible | Operaciones (roles no-billables) | **CONSOLIDAR** 771 COMPRAS + 383 Dpto Compras + 636 Oficina/Taller → 1 cuenta, o **NUEVA** "ADMIN DE OPERACIONES" y archivar las otras |
| **VENTAS / COMERCIAL** | Toda la bolsa: MO equipo, **viajes**, **leads/marketing** (Pablo 108), comisiones | plan2 × plan20; **FALTAN rubros: Viajes, Marketing/Leads** | Comercial (6) | **REUSAR/RENOMBRAR 608** "CENTRO DE COSTO VENTAS" |
| **DIRECCIÓN** | Esteban (32) + gastos de dirección | MO + rubros | Dirección (5) | **NUEVA** (hueco confirmado Fase 1.5 P1) |
| **ADMIN & FINANZAS** | Erick (149) + Eduardo (153) | MO + rubros | Admin y Finanzas (18) | **REUSAR 513** "Administración" |
| **LEGAL + RH** | Magaly (63) + Ana Laura (101) | MO + rubros | Legal (9) + RH (16) | reusar **768 LEGAL** + **478 RH**; **decisión materialidad** (2 personas) → ¿2 cuentas o 1 "Corporativo"? |

**Materialidad (criterio $ anual):** Dirección (1), Legal (1), RH (1), Admin&Finanzas (2) = áreas de 1-2 personas. Recomendación: **DIRECCIÓN separada** (tu costo, lo quieres ver); **VENTAS** y **ADMIN DE OPERACIONES** separadas (materiales); **RH+Legal** candidatas a **1 cuenta "Corporativo/Backoffice"** si el $ no amerita 2 (decisión tuya).

**Rubros faltantes en plan 20 para el desglose de Ventas:** el plan 20 actual es **margen-de-proyecto** (Ingreso, MO, Materiales, Comisiones por vendedor/cliente, Bonos, Utilidad) — **NO tiene rubros de naturaleza de gasto** como **Viajes**, **Marketing/Leads**, **Renta**, **Servicios**. Para "Ventas desglosado MO/viajes/leads" hay que **agregar esos rubros** al plan 20 (o abrir un sub-set de rubros de gasto indirecto). El patrón **plan 2 (centro) × plan 20 (rubro)** SÍ resuelve el desglose, una vez existan los rubros.

**Las 31 cuentas plan-2 existentes — clasificación rápida:**
- ✅ **Centros de costo reales (reusar):** 608 Ventas, 513 Administración, 768 Legal, 478 RH, 772 RH Admin, 771 Compras, 383 Dpto Compras, 636 Oficina/Taller, 509 Gasolina, 744 EPP, 632 Caja Herramientas, 604 Nóminas FTS, 308 Mtto carros.
- 🟠 **One-offs / proyectos internos MAL ubicados en plan 2 (revisar → archivar o mover):** 623 Chiler PRO, 698 Rack Packouts, 649 Sala Operaciones, 778/767 Remodelaciones, 621 Comedor, 788 Torneo Fútbol 2025, 828 Estacionamiento, 294 Quinta, 369 Cristian Ortiz, 293 Licencias, 784 Mtto/limpieza, 769 YIN, 770 BDM, 527 Créditos camiones YIN, 619 Servicios FTS, 296 Honorarios, 40 Gastos Personales Esteban (¿duplicado del plan 3?).
- ⇒ Plan 2 hoy **mezcla** centros de costo recurrentes (bien) con eventos/proyectos puntuales (ruido) → higiene en 2ª pasada.

### 8.E — Validación: ¿el conjunto responde tus 3 preguntas de P&L?

| Pregunta | ¿Se responde? | Qué falta |
|---|---|---|
| **1. ¿Cuánto cuesta Admin de Operaciones (incl. Compras+SC)?** | 🟠 **Parcial** | Crear/consolidar la cuenta ADMIN DE OPERACIONES **y** que la MO de Gibrán/Jésus Montalvo/Gerardo/Ramiro caiga ahí (hoy, siendo Ops, el checkout PR-1 los rutea a "operativo→proyecto"). **Requiere override por-persona** en el checkout (default a cuenta indirecta, no a proyecto) — nota para PR-2. |
| **2. ¿Cuánto cuesta Ventas, desglosado MO/viajes/leads?** | 🟠 **Parcial** | MO sí (rubro 1177). **Faltan rubros Viajes + Marketing/Leads** en plan 20. Con ellos, 608 × rubros resuelve el desglose. |
| **3. ¿Cuánto cuesta cada área vs lo que factura el negocio?** | ✅ **Sí** (con el modelo 2-ejes completo) | Costo por área = Σ plan 2 por centro; ingreso = Σ `out_invoice` (o rubro 1171 Ingreso). Ratio área-costo / ingreso = overhead. Requiere que la MO indirecta se atribuya (Q1) y los rubros de Ventas (Q2). |

**Conclusión 8:** tu hipótesis de 3 ejes es **correcta y suficiente** para el P&L por área. El trabajo NO es crear más planes, sino: (1) **poblar el eje 2** (centros de costo) con la MO indirecta vía checkout (reusando `x_studio_analytic_2`), (2) **ampliar el eje 3** (rubros Viajes/Marketing/Leads), (3) **consolidar los sub-ejes solapados** (5/8/11/13) hacia 2-ejes en fase 2 (ojo A3 OK_ROOTS), (4) **archivar los 4 planes muertos** (7/9/16/19), (5) **higiene** de las cuentas plan-2 mal ubicadas. **El checkout (PR-2) debe esperar a que definas el catálogo y el override por-persona de Ops-admin.**

⚠️ **NO crear/mover/archivar nada aún** — todo esto es diseño para tu decisión.

---

## PARTE 9 — Consolidación multicompany de planes (3 planes vía `company_id`) — read-only

> **Visión target (Esteban):** solo 3 planes (1 Directo, 2 Indirecto, 20 Rubros) funcionando **multicompany** — USA/Brasil viven en los mismos 3 planes distinguidos por `company_id`; los espejos 18/21/12/15/17 desaparecen. ¿Lo soporta Odoo 19 SaaS y qué cuesta?

### 9.1 — Mecánica: ✅ SÍ lo soporta; los planes-país fueron decisión ORGANIZATIVA, no técnica
- **`account.analytic.plan` NO tiene `company_id`** (verificado: el campo no existe) → un plan **no** está atado a una compañía.
- **El scope de compañía vive en `account.analytic.account.company_id`** (verificado): cada cuenta se estampa con su compañía (los espejos USA = company **6**), y Odoo filtra los selectores por compañía → **cada company ve solo sus cuentas** aunque compartan plan.
- Plan 1 hoy: todas sus cuentas son company **1**. Meter cuentas company 6 al plan 1 (con su `company_id=6`) las deja **visibles solo para USA** en captura. ⇒ **un plan multicompany es nativo y correcto en Odoo 19.** No hay razón técnica para los planes-país; fueron una separación manual.

### 9.2 — Inventario de los espejos + dependencias

| Plan | Cuentas activas | `company_id` real | Líneas (all-time) | Budgets | En A3 OK_ROOTS |
|---|---|---|---:|---|---|
| **18** Directo proyectos USA | 7 | **6 (USA)** | 31 | sí — pero por `account_id` (plan-agnóstico) | **SÍ** (18 ∈ OK_ROOTS) |
| **21** Indirecto USA | 1 (3089 Sales FTS USA) | 6 (USA) | 5 | no | no |
| **12** Gastos FTS USA | 1 (663) | **1 (¡MX!)** mislabeled | ~58 | no | **NO** → A3 rechazaría bills company-1 a 663 |
| **15** Plan for FTS USA | 2 (823 FTS USA LLC **bal $2.7M**, 835 proyecto) | 6 (USA) | 12 | no | no |
| **17** Gasto FTS Brasil | 1 (842) | **1 (¡MX!)** mislabeled | 24 | no | **NO** → A3 rechazaría bills company-1 a 842 |

**Dependencias mapeadas:**
- **Budgets: ✅ plan-agnósticos.** `budget.line.account_id` es un m2o genérico — los budgets de proyectos USA (396/397/404…) ya guardan la cuenta plan-18 en `account_id` + rubro en `x_plan20_id`, **igual que los MX**. Mover el plan **NO toca budgets**.
- **distribution.models: ✅ ninguno depende de los espejos.** Los 2 modelos company-6 inyectan el rubro plan-20 `1175`, no cuentas plan-18/21.
- **A3 (Reglas 56/57): ⚠️** solo dispara para `OK_COMPANIES={1}` → USA (company 6) está **exento**, así que 18/21/15 no le afectan. Pero **12 y 17 son company-1** y **NO** están en OK_ROOTS → hoy un bill company-1 atribuido a 663/842 **sería rechazado** (latente).
- **Reportes: ⚠️ la rentabilidad nativa USA ya está rota.** Los actuals USA viven en la columna `x_plan18_id`, pero el budget usa `account_id` → el `achieved` de proyectos USA no casa (mismo tipo de desajuste R1/R2 pero estructural por columna).
- **Actuals a migrar (histórico):** 18→31 · 21→5 · 12→~58 · 15→12 · 17→24 = **~130 líneas** en total. Minúsculo.

### 9.3 — Plan de migración (si se hace)
Target: 18/15(proyectos)→**plan 1**; 21/12/17/15(holding 823)→**plan 2**; todo conservando `company_id` por cuenta.
1. **Repuntar la fuente (A1):** hoy A1 crea USA con `company===6?18:1`. Cambiar a **siempre plan 1** (con `company_id=6`) para proyectos y plan 2 para indirecto → **deja de crecer el espejo**. (Cheap, alto impacto.)
2. **Mover cuentas:** `write` de `plan_id` en la cuenta **es posible** (campo stored) → recomputa `root_plan_id` → **las líneas NUEVAS** caen en la columna nueva (`account_id`). 
3. **⚠️ Migrar el histórico (el punto duro):** las líneas viejas quedan en `x_plan18_id`, NO en `account_id` → historia **partida**. Consolidarla exige reescribir cada `analytic.line` (mover el valor de columna) — **y aquí está el riesgo real:** `account.analytic.line` suele **derivarse del `analytic_distribution` del asiento fuente**; puede ser **no reescribible directo** (se recomputa). **Go/no-go = probar el write en 1 sola línea antes de comprometer** (no lo hice: es write, MCP read-only).
4. **OK_ROOTS:** tras mover USA a plan 1, quitar `18` de OK_ROOTS (o dejarlo, inocuo); 1 y 2 ya están → cubre lo movido. Fix colateral: 12/17 (company-1) al pasar a plan 2 quedan cubiertos (2 ∈ OK_ROOTS) → **arregla el latente**.
5. **Archivar** los planes espejo vacíos (la columna `x_plan18_id` permanece en el esquema → el histórico no se pierde).

### 9.4 — Riesgos
- 🔴 **Reescritura de `analytic.line` (columna de plan) posiblemente NO soportada en SaaS** (campo computado desde el asiento). Si no se puede, "consolidar el histórico" obligaría a tocar asientos fuente = invasivo y semi-irreversible. **Es el único bloqueante real.**
- 🟠 **Historia partida** durante la migración (actuals viejos en columna vieja, nuevos en la nueva) hasta terminar.
- 🟠 **Fuga cross-company** si al mover una cuenta se pierde `company_id` (USA vería MX y viceversa). Mitigable: nunca limpiar `company_id`.
- 🟢 Archivar un plan es **reversible** (des-archivar); la columna no se borra.
- **Irreversible de verdad:** solo si se tocan asientos fuente para forzar la migración de columna. Todo lo demás es reversible.

### 9.5 — 🎯 Recomendación (sin rodeos)
**La capacidad multicompany ya está probada y es nativa** (company_id por cuenta + budgets plan-agnósticos). Pero **el histórico USA es 31 líneas** (todo plan-18) y ~130 en total → **el jugo no vale el exprimido de una migración de columnas de `analytic.line` en SaaS (bloqueante incierto).**

**Recomendado — en 3 pasos, NO big-bang:**
1. **AHORA (cheap, alto valor, fase 2 con 5/8/11/13):** **forward-fix de A1** → proyectos USA a **plan 1** (company 6), indirecto USA a **plan 2**. Deja de crecer el espejo y valida el modelo 3-planes-multicompany para **todo lo nuevo**. Bajo riesgo, sin migración.
2. **Cheap-win inmediato:** **mover 663 (plan 12) y 842 (plan 17) a plan 2** — son cuentas **company-1** mal etiquetadas "USA/Brasil" (no son otra compañía); esto **además arregla el latente de A3** (hoy fuera de OK_ROOTS). Son 2 cuentas, ~82 líneas — probar la reescritura aquí primero (test go/no-go del punto 9.3.3).
3. **Backfill del histórico USA real (31+5+12 líneas): OPCIONAL, baja prioridad** — solo si te importa una historia USA limpia, y **solo tras confirmar** que la línea es reescribible. Si no lo es, **deja los espejos archivados** con su histórico intacto (el reporte nuevo ya sería limpio vía el forward-fix).

**En una línea:** consolidar el **flujo futuro** sí (barato, ya soportado); **migrar el histórico** no vale la pena por 130 líneas salvo que la reescritura resulte trivial — pruébalo en 663/842 y decide. **No consolidar en big-bang ahora.**

⚠️ **Read-only — nada movido.** El único write pendiente para decidir es un test de 1 línea (lo hace Esteban o un one-shot).

---

## PARTE 10 — Bolsa default en `hr.employee` + rediseño fino de PR-2 (checkout lee el campo)

> Requisito nuevo (Esteban): cada empleado tiene su **cuenta indirecta DEFAULT** en su ficha (de qué bolsa sale su nómina si NO carga a proyecto). El checkout **LEE** este campo — ya no infiere por departamento. Garantía "**nadie sin bolsa**".

### 10.1 — Campo: NO hay reusable → **campo nuevo m2o** (recomendado)
- **Campos custom de `hr.employee` hoy:** `x_studio_adjunto` (binary), `x_studio_hora_entrada` (float), `x_studio_link_nomina` (char, vacío), `x_studio_retardos_15_dias` (int), `x_studio_ultimo_retardo_notificado` (date), + `x_categoria_nomina`, `x_aplica_ppa`, `x_currency_id`. **Ninguno es m2o a `account.analytic.account`.**
- **Único nativo relacionado:** `distribution_analytic_account_ids` (**m2m** "Distribution Analytic Account", propósito Odoo = distribución analítica default de gastos/timesheets). Reusarlo es posible pero **semántica de m2m (múltiples cuentas con %)** y Odoo podría usarlo para otras features → ambiguo para "la bolsa única default".

| Opción | Pro | Contra |
|---|---|---|
| **(a) Campo nuevo m2o** `x_studio_cuenta_indirecta_default` → `account.analytic.account` (RECOMENDADO) | 1 campo, semántica clara, **garantiza "nadie sin bolsa"** (se puebla en los 34), lectura directa checkout/W1/Fase 3 | +1 campo Studio |
| (b) Derivar de `hr.department` (map depto→cuenta) | 0 campos | ❌ no permite override por-persona (Gerardo contable en Ops, híbridos); depto no distingue tech vs admin-de-ops dentro de Operaciones |
| (c) Reusar m2m nativo `distribution_analytic_account_ids` | 0 campos nuevos | semántica m2m/%; colisiona con features nativas; frágil |

- **Recomendación: (a) campo nuevo m2o.** Es la excepción justificada a "campos mínimos": el requisito "nadie sin bolsa" **exige** un valor por-persona que el depto no puede dar (dentro de Operaciones conviven techs→proyecto y admin-de-ops→bolsa). Es **1 solo campo**.

### 10.2 — Cómo lo consumen
- **Checkout (PR-2):** cuando NO hay plan del día y el empleado NO elige proyecto → default = `x_studio_cuenta_indirecta_default`. Si está vacío (techs) → no hay default → candado blando "elige proyecto" / registrar sin proyecto → dispara W1.
- **Watchdog W1:** "nadie sin bolsa NI proyecto" = checkout cerrado con `x_studio_project_id` vacío **Y** `x_studio_analytic_2` (Cuenta Indirecta) vacío. El default del empleado hace que W1 solo salte en huecos reales (techs sin proyecto, o alguien sin default).
- **Fase 3 (distribución de nómina):** para MO no atribuida a proyecto, la nómina del empleado cae a su bolsa default. Regla de resolución: `attendance.x_studio_project_id` (proyecto) → si no, `attendance.x_studio_analytic_2` (bolsa elegida ese día) → si no, `employee.x_studio_cuenta_indirecta_default` → si no, W1/pendiente.

### 10.3 — Poblado inicial de los 34 (mapeo aprobado)
| Empleados | Bolsa default | id cuenta |
|---|---|---|
| **Esteban (32)** | DIRECCION | **3095** |
| **Felipe (112), Mateo (75), Gibrán (62), Jésus Montalvo (68), Ramiro (154)** (híbridos) | ADMIN DE OPERACIONES | **3096** |
| **Comercial 8** (Rissia 97, Arturo 143, Ricardo 98, Aldo 78, Luis 48, Marcus 150, Francisco 8, Pablo 108) | VENTAS | 608 |
| **Erick (149), Eduardo (153), Gerardo Lozano (59)** | Administración | 513 |
| **Magaly (63)** | LEGAL | 768 |
| **Ana Laura (101)** | RH | 478 |
| **13 técnicos/soldadores/seguristas Ops** (Carlos 76, Cesar 127, Enoc 128, Germán 124, Héctor 25, José Luis 79, Juan Manuel 55, Leonel 6, Rolando 130, Samuel 57, Stephany 121, Tomas L 138, Tomas V 131) | **VACÍO** (siempre a proyecto) | — |
| _pseudo (148, 81)_ | ignorar | — |

- **⭐ Decisión técnicos (5c): VACÍO + watchdog, NO ADMIN DE OPERACIONES como red de seguridad.** Razón: si el default fuera ADMIN DE OPERACIONES, un tech que olvida elegir proyecto **silenciosamente** manda su costo a admin-ops → **contamina la bolsa y esconde el hueco** de atribución (justo lo que Frente A quiere evitar). Con **vacío**, W1 **surface-a** el hueco ("Tomás cerró sin proyecto") → se corrige. La red de seguridad es la **visibilidad (W1)**, no un default que oculta. (32 poblados con bolsa, 2 pseudo ignorados; los 13 techs a propósito vacíos.)

### 10.4 — PR-2 fino: el ruteo LEE el campo (supera la inferencia por depto de PR-1)
**Prioridad de fuentes en checkout (salida):** `plan del día` **>** `selección manual` **>** `default del empleado`.

1. **Consultar plan del día** (ya en PR-1). Si trae proyecto → banner CON PLAN (gana). *(plan del día)*
2. Si NO hay plan → mostrar pantalla según el **campo default del empleado** (ya NO por `perfilEmpleado`/depto):
   - **Con default bag** (admin, comercial, híbridos, dirección) → banner "Tu bolsa: `<cuenta>`" pre-seleccionada + "¿Trabajaste en un proyecto? Elígelo" + "¿Otra bolsa?". *(default del empleado, cambiable → selección manual)*
   - **Sin default bag** (13 techs) → lista de proyectos + "registrar sin proyecto" (candado blando) → si nada, W1. *(selección manual obligada)*
3. **Cualquier perfil** puede elegir proyecto o cambiar de bolsa → eso es la **selección manual**, que gana sobre el default pero NO sobre el plan.
- **Qué se escribe:** proyecto → `x_studio_project_id`; bolsa (default o elegida) → `x_studio_analytic_2` (Cuenta Indirecta); nada → ambos vacíos → W1.
- **`perfilEmpleado` (PR-1) queda como fallback** solo si el empleado no tiene el campo default poblado aún (defensa durante el rollout). Tras poblar los 34, el campo manda.
- **Costo:** el checkout ya trae el empleado crudo de `/kiosk/empleados` (v3.1) → **agregar `x_studio_cuenta_indirecta_default` a ese webhook** (1 campo más en la respuesta, como se hizo con categoría/depto). Sin llamada extra.

⚠️ **Nada construido — diseño para tu aprobación.** PR-1 (#68) sigue OPEN; PR-2 depende de: (a) el campo nuevo en Studio, (b) poblar los 34, (c) `/kiosk/empleados` devuelve el campo.

---

## Límites / método
- Números Odoo vía MCP read-only (UID 2). Depto→empleados activos y cuentas plan 2 medidos hoy 2026-07-08.
- No se tocó Odoo, ni workflows productivos, ni frontend. Único artefacto: one-shot **inactivo** `97Qj9v46ILOWV9Lf`.
- Ingeniería (17) hoy sin empleados activos (los ingenieros históricos figuran en Operaciones) → el hueco de cuenta es latente, no bloqueante.

🤖 Diagnóstico + diseño read-only (Fase 1.5) — sin cambios a Odoo/workflows/frontend salvo el one-shot inactivo de limpieza.
