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

## Límites / método
- Números Odoo vía MCP read-only (UID 2). Depto→empleados activos y cuentas plan 2 medidos hoy 2026-07-08.
- No se tocó Odoo, ni workflows productivos, ni frontend. Único artefacto: one-shot **inactivo** `97Qj9v46ILOWV9Lf`.
- Ingeniería (17) hoy sin empleados activos (los ingenieros históricos figuran en Operaciones) → el hueco de cuenta es latente, no bloqueante.

🤖 Diagnóstico + diseño read-only (Fase 1.5) — sin cambios a Odoo/workflows/frontend salvo el one-shot inactivo de limpieza.
