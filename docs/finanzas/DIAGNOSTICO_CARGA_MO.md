# Diagnóstico — Carga de Mano de Obra a proyectos

> **Estado:** ✅ **COMPLETO** (read-only). Las 7 secciones respondidas contra Odoo `serviciosfts.odoo.com` (MCP UID 2, READ-ONLY) + workflow n8n activo + repo.
> **Fecha:** 2026-07-06. **Ventanas:** 60 días = desde 2026-05-07; 12 meses = desde 2025-07-06. No se tocó Odoo, código ni workflows.
> **Fuentes:** `CLAUDE.md`, `docs/finanzas/FRENTE_A_PLAN.md`, `docs/PLAN_NOMINA_FTS_SUITE.md`.
> **NO propone implementación** — solo diagnóstico + decisiones a tomar.

> ⚠️ **CORRECCIONES POST-INCIDENTE 2026-07-13** (ver [`docs/INCIDENTES/2026-07-13_odoo_distribution_model_crash.md`](../INCIDENTES/2026-07-13_odoo_distribution_model_crash.md) §9):
> 1. **Neutralización del double-count MO = `unlink` del distribution model, NUNCA vaciarlo.** Un model vacío matchea todo y crashea el onchange de PO/SO (fue el P1 del 13-jul, id 53). Cutover: unlink **#47 (BBVA Nomina 102.01.00008) + #48 (2023.34) + #9 (101000)**, los 3 inyectan 1177.
> 2. **⚠️ Reconciliar:** este §4 atribuye la fuga a **#48 (GL 2023.34)**; el Audit C del 2026-07-12 encontró **#48 dormido** (no existe `account.account` code `2023.34*`) y **#47 (BBVA Nomina) activo**. Unlinkear los 3 lo resuelve igual; verificar cuál está vivo antes del cutover.
> 3. **Invariante dura:** jamás guardar distribution model sin `analytic_distribution` ni applicability sin plan.

---

## 0. Resumen ejecutivo (10 líneas)

1. **Objetivo:** cadena MO = planeación (Felipe) → checkout con SO → horas confirmadas → $ estimado (costo/hora) → $ real (CONTPAQi Ulises) → `analytic.line` compuesta (proyecto × rubro 1177 MO) impactando los budgets que A1 crea.
2. **🔴 EL RIESGO SE MATERIALIZÓ (§4):** la nómina real **YA entra a la analítica en el rubro 1177**. El 100% de las 203 líneas 1177 de los últimos 12m (−$2.70M) nacen de los **pagos bancarios de nómina BBVA** (journal `BNK1`, GL `2023.34`), auto-etiquetados 1177 por `distribution.model #48`. **Escribir nuestras propias `analytic.line` de MO desde attendance DUPLICARÍA el gasto.** Este es el hallazgo que gobierna el diseño.
3. **§1 — La captura de horas por SO NO está muerta: arrancó ~abril 2026 y va al 96%.** En 60d: 1,231 attendances cerradas, **89.9% con SO** (124 sin SO). El "hoy no se captura nada" es falso para horas-por-SO.
4. **⚠️ CORRECCIÓN (§11):** lo que parecía "catch-all de buckets recurrentes (Mondelez/Rittal)" era un **misread por un bug**: `x_studio_sales_order_2` guarda un id de `project.project` en un campo m2o a `sale.order` → nombre falso. Las horas **sí van a proyectos reales** (Topo Chico, Magnekon, Vertiv). Es un problema de **tipo de campo**, no de atribución. Fix = **Opción 2** (`MIGRACION_PROJECT_ID.md`).
5. **§2 — `hourly_cost` existe nativo pero solo 12/34 activos lo tienen (35%), con valores placeholder** (casi todos $140/h). No hay costo/hora real cargado. **No existe `x_codigo_nomina`** ni llave para CONTPAQi (candidato débil: `registration_number`, 9/34 poblado).
6. **§3 — rubro 1177:** 203 líneas / −$2.70M/12m, **43% compuesto (con proyecto) / 57% rubro-solo (−$1.54M sin proyecto)**. Todas de nómina bancaria (ninguna de bill de subcontratista).
7. **§5 — budgets MO:** existe la línea 1177 en 100 budgets, pero muchos son placeholder `budget_amount=−1` y **`achieved_amount=0` en TODOS** (incluido Topo Chico con −$555,800 presupuestado) → el consumo MO no se está trackeando.
8. **§6 — planeación cortada por ambos lados:** el módulo repo `operaciones/planeacion/` está en F3 sin backend (F4 no existe, no persiste). El `planning.slot` nativo tiene 762 slots (387 ligados a SO) pero **abandonado desde nov-2025** (cero en 2026).
9. **§7 — administrativos:** plan 2 "Gasto Indirecto" tiene 31 cuentas activas, mapeables por nombre a deptos (478 RH, 608 Ventas, 513 Admin, 636 Oficina…), **pero NO existe campo `hr.department → cuenta`** — habría que crearlo o mantener un map.
10. **Decisión #1 bloqueante:** definir la **fuente única de verdad del costo MO en la analítica** (nómina bancaria actual vs attendance×costo/hora) antes de escribir una sola línea — coexistir ambas duplica.

---

## 1. Captura de horas por SO (`hr.attendance`)

### 1.a — ✅ Campos que escribe HOY `kiosk/checkin` en checkout (workflow `a7mEjjdwIzzvomXs`, ACTIVE)

Ruta: `Switch - Por tipo` → **`Odoo - UPDATE Salida`** (update `hr.attendance` sobre `attendance_id_pendiente`). Escribe **5 campos**:

| Campo Odoo | Valor | Nota |
|---|---|---|
| `check_out` | server time UTC (o hora declarada si `es_estimado`) | |
| `out_latitude` / `out_longitude` | geo de salida | |
| `out_mode` | `"kiosk"` (constante) | discriminador kiosk/manual (Hallazgo #15) |
| `x_studio_sales_order_2` | `so_id` | **link SO — único campo de costeo MO** |

**No escribe:** horas, costo, categoría, ni `analytic_distribution`.
**SO nullable, sin pre-llenado backend:** en `Code - Preparar parámetros`, `const so_id = body.so_id ? parseInt(body.so_id) : null;`. Solo en `tipo='salida'`. Si el técnico no elige SO → `null`. Cualquier pre-llenado tendría que vivir en `kiosk.js` (frontend) leyendo del plan — que hoy no persiste (§6).

### 1.b — ✅ Números 60 días (attendances cerradas, desde 2026-05-07)

- **Total cerradas: 1,231.**
- **Con `x_studio_sales_order_2`: 1,107 (89.9%). Sin SO: 124 (10.1%).**
- **Top "SOs" por # attendances (top-3 = 83%):**

> ⚠️ **CORRECCIÓN 2026-07-07 (ver §11 BUG):** el número guardado en `x_studio_sales_order_2` es un **id de `project.project`**, NO de `sale.order`. Odoo lo resuelve como el `sale.order` que coincide por número → **nombre falso**. La selección real fue un **proyecto correcto**.

| id guardado | # att (60d) | PROYECTO real (lo elegido) | Se muestra como (MAL) |
|---|---:|---|---|
| 2302 | 378 | **SO11547 Topo Chico** (Nalco) | SO2286 Mondelez |
| 160 | 359 | **SO10300 Magnekon** | SO160 Rittal |
| 121 | 284 | **SO9428 Vertiv** (Nalco) | SO121 Rittal |
| 212 | 53 | **SO10337 Bridgestone** | SO212 Mondelez |

❌ **NO existe "catch-all de buckets recurrentes"** — fue un misread causado por el bug. Las horas **sí van a proyectos reales**; lo roto es el **tipo del campo destino** (m2o a `sale.order` en vez de `project.project`). Ver **§11** (causa raíz) y **`MIGRACION_PROJECT_ID.md`** (migración, Opción 2).

### 1.c — ✅ Corte temporal: la captura de SO ARRANCÓ, no paró

Attendances cerradas con SO poblado, por mes:

| Mes | cerradas | con SO | % con SO |
|---|---:|---:|---:|
| jul 2025 – mar 2026 | ~5,700 | **0** (1 en ago) | ~0% |
| abr 2026 | 671 | 184 | 27% |
| may 2026 | 648 | 547 | 84% |
| jun 2026 | 625 | 597 | 96% |
| jul 2026 (parcial) | 83 | 80 | 96% |

**El feature de seleccionar SO en checkout nació ~abril 2026** y se adoptó rápido (27→84→96%). La captura de horas-por-SO está **sana y madura**; lo que falta es que la SO seleccionada sea un **proyecto real** (§1.b) y que se convierta a **costo** (§2–§4).

---

## 2. Costo por empleado (`hr.employee`)

### 2.a — ✅ `hourly_cost` (nativo timesheet) EXISTE

Campo monetary nativo `hourly_cost`. **Poblado en solo 12 de 34 empleados activos (35%)**, con valores que parecen placeholder:

| Empleado | Depto | hourly_cost |
|---|---|---:|
| Héctor Cruz (25) | Ingeniería | 300 |
| Mateo Salazar (75) | Operaciones | 200 |
| Francisco Montalvo (8) | Comercial | 140 |
| Luis Ángel García (48) | Comercial | 140 |
| Juan Manuel Sánchez (55) | Ingeniería | 140 |
| Carlos Manzanares (76), Gibrán Solís (62), José Luis Romero (79), Jésus Montalvo (68), Leonel Cruz (6), Samuel Ulises (57) | Operaciones | 140 c/u |
| Gerardo Lozano (59) | Operaciones | 100 |

- **22/34 en `hourly_cost = 0`** — incluye CEO (32), **Felipe (112)**, todos los admins, casi todo Comercial, y varios operativos de campo (Cesar 127, Enoc 128, Germán 124, Ramiro 154, Rolando 130, Stephany 121, Tomás L 138, Tomás V 131).
- Valores agrupados en **$140** = default manual, no costo cargado real (sin prestaciones/IMSS). `hourly_wage`, `wage` = 0 en todos; `wage_type` = `monthly` (Payroll Odoo no se usa, ver §4).

### 2.b — ✅ Llave para CONTPAQi: NO existe campo dedicado

- **No hay `x_codigo_nomina`.** Campos custom `hr.employee`: `x_categoria_nomina` (selección), `x_aplica_ppa`, `x_studio_hora_entrada`, `x_studio_link_nomina` (char, **vacío en todos**), `x_studio_retardos_15_dias`, `x_studio_ultimo_retardo_notificado`, `x_studio_adjunto`, `x_currency_id`.
- **Candidatos de match:** `registration_number` ("Employee Reference") — poblado en **9/34** con enteros chicos ("2","3","5","6","13","19","20","22","24"); `identification_id` = vacío en todos; `barcode` (Badge ID). Ninguno es una llave confiable/completa hacia CONTPAQi hoy.
- Otros campos de costo nativos disponibles si se activa Payroll: `wage` (mensual), `contract_wage`, `hourly_wage`, `wage_type` (monthly/hourly) — todos en 0.

---

## 3. Estado del rubro 1177 MO en la analítica

### 3.a — ✅ Volumen (12 meses, `x_plan20_id = 1177`)

- **203 líneas / −$2,704,275 MXN.**
- **Compuestas (con `account_id` de proyecto): 99 líneas / −$1,163,325 (43%).**
- **Rubro-solo (sin proyecto): 104 líneas / −$1,540,950 (57%).**

> Ojo: al revés que Materiales (1176, que Frente A midió 88% compuesto), la MO es **mayoría rubro-solo** → la MO no llega al proyecto.

Top proyectos compuestos: Vertiv 2da (576) −$539,866; Budenheim ergo (662) −$233,049; Optima JCI (697) −$64,292; Magnekon techo (668) −$47,342; extractores Optima (751) −$46,116.

### 3.b — ✅ De dónde nacen: 100% NÓMINA BANCARIA (no bills)

- **Las 203 líneas provienen de una sola cuenta GL: `270 = "2023.34 *FTS_Egreso Nominas_BBVA"`.** Cero de bills de proveedor.
- Cada movimiento fuente es `BNK1/2025/xxxx` (Bank Statement), partner **BBVA México**, nombre "Open balance … nomina/Nominas". Es el **pago de la nómina** que Ulises/finanzas concilia en el banco.
- El rubro 1177 se inyecta por **`account.analytic.distribution.model #48`**: `account_prefix "2023.34" → {"1177":100}`, company 1.
- Las **compuestas** (Vertiv, Budenheim) son pagos de nómina que **alguien atribuyó a mano a un proyecto** al conciliar; las **rubro-solo** son la nómina sin proyecto.

⇒ **El rubro 1177 = la nómina real ya contabilizada.** No es subcontratación (esa va a 1176/otros vía `601.84.01`).

---

## 4. 🔴 Cómo entra HOY la nómina real a Odoo — RIESGO DE DOBLE CONTEO

### 4.a — ✅ Flujo actual completo

1. **Payroll de Odoo (`hr.payslip`) NO se usa** (todos los `wage`=0, `wage_type=monthly` inerte). La nómina se calcula **fuera** (CONTPAQi, Ulises).
2. La nómina entra a Odoo **solo como el desembolso bancario**: líneas de `account.bank.statement.line` en journal **`BNK1`**, contra GL **`2023.34 *FTS_Egreso Nominas_BBVA`** (partner BBVA).
3. `distribution.model #48` (`2023.34 → {1177:100}`) hace que **cada** pago de nómina genere automáticamente una `account.analytic.line` con rubro **1177 Mano de Obra**.
4. Resultado (12m): **−$2.70M de MO ya vive en la analítica** (43% atribuido a proyecto, 57% no).
5. Existe además una cuenta GL de gasto `Mano de Obra` (id 224, code "Timesheet", type expense) — vestigio de un intento de timesheet-costing; **no está en el flujo real** (la nómina va por 2023.34 bancario).

### 4.b — ✅ Veredicto doble conteo

**SÍ, riesgo ALTO y confirmado.** Si el diseño de "carga de MO desde attendance" escribe `analytic.line` de MO a rubro **1177** por proyecto (horas × costo/hora), esas líneas se **sumarían** a las que ya genera la nómina bancaria → **doble conteo** en:
- el rubro 1177 (−$2.70M se volvería ~−$5.4M), y
- el `achieved_amount` del budget 2-ejes de cada proyecto.

**El diseño DEBE elegir UNA sola fuente de verdad del costo MO** (opciones en §9 decisión #1). No pueden coexistir la nómina bancaria (2023.34→1177) y las líneas desde attendance en el mismo rubro.

---

## 5. Presupuesto MO en budgets (post-A1)

### 5.a — ✅ SOs confirmadas después de 2026-06-17 (company 1+6): solo 7

| SO | amount_untaxed | `x_studio_presupuesto_mano_de_obra` | proyecto |
|---|---:|---:|---|
| SO11761 (test) | 100 | 10 | false |
| SO11762 Nalco TopoChico | **1,505,182** | **0** | 2349 |
| SO11746 Mission | 8,300 | 2,000 | 2345 |
| SO11699 Bridgestone | 16,145 | 1,420 | 2352 |
| SO11779 Bebidas | 12,474 | **0** | 2353 |
| SO11673 Mission | 37,406 | **1** (placeholder) | 2355 |
| SO11773 Mission | 8,199 | 2,000 | 2356 |

→ De 7: **4 con MO real, 2 con MO=0, 1 con MO=1 placeholder**. Incluso un proyecto de $1.5M (SO11762) salió con MO presupuestada = 0. El campo se llena inconsistentemente.

### 5.b — ✅ Estado de las líneas 1177 en `budget.line` (100 líneas)

- Mezcla de reales (Topo Chico SO11547 **−$555,800**, SO11511 −$20,400, SO11557 −$4,320, SO11507 −$4,300…) y **muchos placeholder `budget_amount = −1`** (SO11673, SO11644, SO11636, SO11634, SO11631, SO11521…).
- **`achieved_amount = 0` y `committed_amount = 0` en el 100%** de las líneas 1177 — incluido Topo Chico con −$555,800 presupuestado. El consumo de MO no se descuenta de ningún budget hoy (porque las `analytic.line` 1177 que existen son nómina rubro-solo o atribuida a OTROS proyectos viejos, y no casan la cuenta/fecha de estos budgets nuevos).

---

## 6. Planeación (módulo repo + Odoo)

### 6.a — ✅ Módulo repo `operaciones/planeacion/` — F3, sin persistencia

- `version.json`: **v2.2.0, `status:"in_development"`, `fase:"F3"**`, rebuilt from scratch. Auth gate: solo `ftsmaster` + `felipe.perez`.
- Funciona F1–F3: carga empleados de Odoo, validador 9.6h, agrupación por turnos, exportación WhatsApp + PNG. SOs vía `/webhook/kiosk/sos`.
- **F4 (backend `/planeacion/guardar`) NO EXISTE** → **la planeación NO persiste** (ni Odoo ni store). El "costeo MO vía `analytic.line`" que promete su README es **aspiracional**.
- Deuda viva: `horarios-base.js:68` fallback hardcoded `oficinaIdsLegacy=[89,91,113]`.

### 6.b — ✅ `planning.slot` nativo Odoo — usado en 2025, abandonado

- **762 slots** existen; **387 (51%) tienen `sale_line_id`** (se intentó ligar planeación↔SO para costeo).
- **Abandonado:** actividad solo abr–nov 2025 (may 244, jun 230, jul 122, oct 72, **nov 11**), **cero en 2026**. Es el módulo Planning nativo, independiente del frontend custom.

### 6.c — ✅ `resource.calendar` — empleados activos por calendario

| Calendario (company 1) | h/día | empleados activos |
|---|---:|---:|
| Horas operaciones (id 2) | 10 | 17 |
| Horas de oficina (id 6) | 10 | 16 |
| Standard 40 hours/week (id 13) | 8 | 1 |

Los 34 activos están en calendarios de 10 h/día (ops/oficina). Hay 16 calendarios en total (el resto son de otras companies 2–11, varias basura "…BORRAR…").

---

## 7. Cuentas destino para administrativos (plan 2 "Gasto Indirecto")

### 7.a — ✅ 31 cuentas activas; mapeables por nombre a departamento

| Depto FTS | Cuenta plan 2 candidata (id) |
|---|---|
| Recursos Humanos (16) | 478 "CENTRO DE COSTOS RH" (+ 772 "RH DE ADMINISTRACION") |
| Comercial (6) | 608 "CENTRO DE COSTO VENTAS" |
| Legal (9) | 768 "LEGAL" |
| Admin y Finanzas (18) | 513 "Administración" · 636 "OFICINA ADMINISTRACION Y TALLER" |
| Compras | 771 "COMPRAS" · 383 "Dpto Compras" |
| (nómina genérica) | 604 "NOMINAS FTS" |
| Operaciones overhead | 632 Caja Herramientas · 744 EPP · 509 Gasolina (compartidos, no por-persona) |

### 7.b — ✅ Mapeo `hr.department → cuenta`: NO existe campo

- **No hay campo en `hr.department`** que ligue a una cuenta analítica plan 2. El match es solo **por nombre** y es **incompleto**: no hay cuenta indirecta dedicada para **Dirección (5)**, **Ingeniería (17)** ni para **Operaciones como overhead** (Ops va directo a proyecto).
- Para "administrativos cargan default a su cuenta de departamento" habría que **crear** el mapeo: campo nuevo `hr.department.x_cuenta_indirecta` (m2o a `account.analytic.account`) o un JSON de configuración. **Decisión para Esteban.**

---

## 8. Riesgos detectados

| # | Riesgo | Sev | Estado |
|---|--------|-----|--------|
| R-MO-1 | **Doble conteo MO en rubro 1177** — la nómina bancaria (2023.34→1177) ya aporta −$2.70M/12m; sumar attendance×costo duplica gasto y `achieved`. | 🔴 ALTA | ✅ confirmado (§4) |
| R-MO-2 | **Catch-all de MO** — 83% de horas a 3 SOs recurrentes sin proyecto (Mondelez/Rittal) → horas capturadas pero inatribuibles a budget. | 🟠 MEDIA-ALTA | ✅ confirmado (§1.b) |
| R-MO-3 | **Costo/hora inexistente o placeholder** — `hourly_cost` 35% poblado, valores $140 default; sin costo cargado real. | 🟠 MEDIA-ALTA | ✅ confirmado (§2) |
| R-MO-4 | **Sin llave CONTPAQi** — no hay `x_codigo_nomina`; `registration_number` 9/34, `x_studio_link_nomina` vacío. | 🟠 MEDIA | ✅ confirmado (§2.b) |
| R-MO-5 | **Planeación no persiste** — F4 inexistente + `planning.slot` abandonado → no hay plan del cual pre-llenar SO en checkout. | 🟠 MEDIA | ✅ confirmado (§6) |
| R-MO-6 | **Budget MO ciego** — `achieved=0` en el 100% de líneas 1177; MO presupuestada inconsistente (0/−1/real). | 🟡 MEDIA | ✅ confirmado (§5) |
| R-MO-7 | **SO nullable en checkout** — sin candado, 10% de jornadas sin SO. | 🟡 MEDIA | ✅ confirmado (§1.a) |

---

## 9. Decisiones que Esteban debe tomar antes del diseño

1. **🔴 (BLOQUEANTE) Fuente única de verdad del costo MO en la analítica.** Elegir UNA:
   - **(a)** Mantener la **nómina bancaria** (2023.34→1177) como el costo real, y usar attendance solo para **atribuir a proyecto** ese gasto (reemplazar la atribución manual del pago BBVA por una automática basada en horas) — NO crear líneas nuevas.
   - **(b)** Cambiar a **attendance×costo/hora** como costo MO por proyecto, y **quitar** el rubro 1177 del `distribution.model #48` (que la nómina bancaria deje de generar 1177).
   - **(c)** Usar **rubros distintos**: 1177 = real (nómina), y un rubro nuevo "MO estimada" para el cálculo desde attendance (reporte, no budget).
   - *Coexistir (a)+(b) en el mismo rubro = doble conteo garantizado.*
2. **Costo/hora — fuente.** ¿Poblar `hourly_cost` nativo (costo cargado con prestaciones, derivado de CONTPAQi/sueldo÷horas), o campo custom? Hoy 35% poblado con placeholders.
3. **Llave CONTPAQi.** ¿Crear `x_codigo_nomina` en `hr.employee` y poblarlo, o reutilizar `registration_number`? Define el match del Excel de Ulises.
4. **SO en checkout — ¿obligatoria?** ¿Candado (tipo A3) que exija SO en salida para operativos, o permitir null con default? Y **matar el catch-all** Mondelez/Rittal (que sean proyectos reales o un centro de costo).
5. **Administrativos — mapeo depto→cuenta plan 2.** ¿Crear campo `hr.department.x_cuenta_indirecta` (m2o) o JSON? Falta cuenta indirecta para Dirección/Ingeniería/Operaciones-overhead.
6. **Planeación — prerequisito.** ¿Construir F4 (`/planeacion/guardar`) para pre-llenar SO en checkout, o desacoplar (kiosk lee SO de otra fuente)? ¿Revivir `planning.slot` nativo (ya soporta `sale_line_id`) o seguir con el frontend custom?
7. **Alcance de "horas confirmadas".** ¿Quién confirma horas antes de costear (supervisor/Felipe), y sobre qué — el attendance crudo o un paso de validación (el validador 9.6h de planeación)?

---

## 10. Notas de método / límites

- Números de Odoo vía MCP read-only (UID 2). `hr.attendance` cerradas = `check_out != false`. "Compuesto" = `analytic.line` con `x_plan20_id=1177` **y** `account_id` (proyecto) poblado; "rubro-solo" = `account_id=false`.
- Activos = `hr.employee active=true` → 34 (vs "40" histórico en CLAUDE.md; discrepancia menor ya apuntada en Bloque B pendiente #5).
- La ventana de 60d incluye el arranque de captura SO (abr–may), por eso los 124 sin-SO son mayormente del inicio; el corriente (jun–jul) va al 96%.
- `planning.slot` y `hr.attendance` son modelos distintos: Planning (previsión) vs Attendance (real). El costeo hoy no usa ninguno — usa el pago bancario de nómina.

---

## 11. 🔴 BUG CRÍTICO — id de `project.project` en campo m2o a `sale.order` (2026-07-07)

**Síntoma:** un técnico elige "SO9428 Vertiv" en el kiosk y el attendance queda con "SO121 Rittal". Repetido en 3 casos (kiosk viejo pre-B3, banner pre-llenado B3, modal smoke test). Aparece por modal **Y** por plan → misma fuente.

**Causa raíz:** el catálogo `/webhook/kiosk/sos` (workflow `kiosk/sos v3.4`, `m6dyGa0yV1zYPwJF`) hace `getAll` de **`project.project`** y mapea **`id: p.id` = id de PROYECTO** + `name: p.name` (nombre del proyecto, correcto). El kiosk escribe ese id en **`x_studio_sales_order_2`**, m2o a **`sale.order`**. Como los espacios de id se solapan por número, Odoo lo resuelve al `sale.order` con ese id → **nombre equivocado**. El `id` (proyecto) es correcto; el **campo destino** es el equivocado.

**Camino del dato:** `kiosk/sos` (project.project → `id:p.id`) → `renderSOs`/`selectSO` (pasa id proyecto) → payload `so_id` → `kiosk/checkin` escribe `x_studio_sales_order_2 = id proyecto` → Odoo lo lee como sale.order. **El mismo catálogo alimenta `proyectos.js`** (planeación) → el tag de B1 y la respuesta de B2 arrastran el mismo id.

**Dimensión (desde abril 2026):** **~1,432 attendances** con "SO" poblada → el **100% son ids de `project.project`** en el campo de sale.order. El nombre mostrado está mal en todas; **el id sí es el proyecto correcto** (dato recuperable, no perdido). Distribución real: Topo Chico 546 · Magnekon 448 · Vertiv 332 · Bridgestone 57 · +13 proyectos (~49).

**Consumers afectados** (muestran nombre equivocado; el dato interno es OK): panel Confirmar Horas (resuelve `x_studio_sales_order_2` como SO), tag de B1, pre-llenado de B2/B3. B1/B2/B3 son **internamente consistentes** (pasan el id de proyecto) — solo el nombre desplegado es falso.

**Decisión (Esteban, 2026-07-07): Opción 2** — crear `x_studio_project_id` (m2o `project.project`) en `hr.attendance`, backfill de los ~1,432, repuntar consumers, congelar `x_studio_sales_order_2` (no borrar). Plan paso a paso en **`docs/finanzas/MIGRACION_PROJECT_ID.md`**.
