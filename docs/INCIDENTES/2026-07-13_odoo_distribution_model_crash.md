# Incidente P1 — Odoo `Expected singleton: account.analytic.plan()` al agregar líneas en PO/SO (2026-07-13)

> **Severidad:** P1 (bloqueaba captura en compras y ventas) · **Estado:** ✅ RESUELTO (workaround aplicado; fix oficial de Odoo pendiente de build)
> **Plataforma:** Odoo 19 SaaS `serviciosfts.odoo.com` (19.0+e, rolling release)
> **Issue Odoo:** [odoo/odoo#275850](https://github.com/odoo/odoo/issues/275850)
> **Commit que rompió:** [`6fe806bcae0b`](https://github.com/odoo/odoo/commit/6fe806bcae0baf2a9cd30462250659c70358582d) (2026-07-10, "[FIX] sale_project: merge analytic distro from models")
> **Commit del fix oficial:** [`4620ce9df986`](https://github.com/odoo/odoo/commit/4620ce9df98690e4367a7ff0ed5fb2c5ce2c1b32) (2026-07-13, "[FIX] analytic: merge empty distribution model", closes #275850)
> **Workaround aplicado por nosotros:** `unlink` del `account.analytic.distribution.model` **id 53** (vacío). Verificado OK en SO y PO.
> Documento de handoff verificado en producción HOY (2026-07-13). Reproducido íntegro abajo + §9 correcciones a Fase 2.

---

## 1. El incidente (resuelto)
- **Síntoma:** desde la mañana del 2026-07-13, agregar cualquier producto a una línea de PO (Gerardo) o SO (Luis Ángel) tronaba con `ValueError: Expected singleton: account.analytic.plan()` en el onchange, vía `_compute_analytic_distribution` → `account.analytic.distribution.model._get_distribution`.
- **Causa raíz (confirmada con código fuente y commits de Odoo):**
  - Odoo commit `6fe806bcae0b` (2026-07-10, rama 19.0, "[FIX] sale_project: merge analytic distro from models") reescribió `_get_distribution` con un loop de merge que NO filtraba distribution models vacíos.
  - El rolling release de Odoo Online desplegó ese build a nuestra instancia el fin de semana.
  - En nuestra BD existía un `account.analytic.distribution.model` **id 53, completamente vacío** (analytic_distribution=false, sin partner, sin categoría, company_id=1 SERVICIOS FTS), creado 2026-02-17 07:18 UTC por uid 2. Al no tener criterios, matcheaba TODAS las líneas de la compañía 1.
  - Mecánica del crash: modelo vacío → `distribution_analytic_account_ids` vacío → `current_plans` = recordset vacío → en Odoo 19 `mapped(callable)` pasa el recordset COMPLETO a la lambda (models.py:6182) → `p._column_name()` → `self.root_id._strict_column_name()` → `ensure_one()` sobre vacío → boom.
  - Odoo parchó oficialmente HOY: commit `4620ce9df986` (2026-07-13, "[FIX] analytic: merge empty distribution model", closes odoo/odoo#275850), agregando el guard `if current_plans and ...`. Nos llegará con el próximo build.
- **Fix aplicado por nosotros:** `unlink` del distribution model id 53 vía consola F12. Verificado: onchange SO OK, onchange PO OK, confirmado en UI por Esteban.
- **Nadie del equipo causó el incidente** — regresión de plataforma Odoo + dato latente inofensivo de febrero.

## 2. CAMBIOS EFECTUADOS EN PRODUCCIÓN HOY (importante para cualquier trabajo futuro)
1. **`account.analytic.distribution.model` id 53 ELIMINADO** (el fix real). Quedan 52 modelos, todos con keys válidas.
2. **`account.analytic.applicability` ids 40, 58, 76, 94, 148, 166, 184, 202 ELIMINADOS** — eran 8 filas con `analytic_plan_id=false`, business_domain=sale_order, una por compañía, creadas automáticamente el 2024-10-31 04:29:51 UTC. Fueron sospechosas durante el diagnóstico pero resultaron INERTES (el código confirma que `_get_distribution` no consulta applicability). No hay que restaurarlas — no hacían nada.
3. **Plan analítico id 7 "Materiales": `parent_id` cambiado de 5 (Assets) a `false`** — ahora es plan raíz con parent_path "7/". Era el único plan hijo del sistema y fue hipótesis descartada. NO se revirtió. Está vacío (0 cuentas) y duplica el nombre del plan 9 "Materiales". Pendiente decidir: fusionar con 9, eliminar, o dejar.

## 3. MAPA VERIFICADO DE PLANES ANALÍTICOS (18 planes, leído hoy de producción)
| id | nombre | column_name | notas |
|----|--------|-------------|-------|
| 1 | Gasto Directo a proyectos | **account_id** (columna nativa) | ES el "project plan": ir.config_parameter `analytic.project_plan` = "1". 28 cuentas |
| 2 | Gasto Indirecto en FTS | x_plan2_id | 33 cuentas |
| 3 | Gastos personales Esteban | x_plan3_id | 1 cuenta |
| 5 | Assets | x_plan5_id | 147 cuentas |
| 7 | Materiales | x_plan7_id | HOY promovido a raíz; vacío; duplica al 9 |
| 8 | Combustible | x_plan8_id | 23 cuentas |
| 9 | Materiales | x_plan9_id | — |
| 11 | Inmuebles | x_plan11_id | 29 cuentas |
| 12 | Gastos FTS USA | x_plan12_id | 1 cuenta |
| 13 | Flota | x_plan13_id | 1 cuenta |
| 14 | Ajuste contable | x_plan14_id | 2 cuentas |
| 15 | Plan for FTS USA | x_plan15_id | 2 cuentas |
| 16 | Default | x_plan16_id | no aparece en get_relevant_plans |
| 17 | Gasto FTS Brasil | x_plan17_id | 1 cuenta |
| 18 | Gasto directo a proyectos USA | x_plan18_id | 7 cuentas |
| 19 | Project | x_plan19_id | no aparece en get_relevant_plans |
| 20 | **Upgraded Budget Plan** | **x_plan20_id** | 31 cuentas; contiene los RUBROS del presupuesto (ver §4) |
| 21 | Gasto Indirecto FTS USA | x_plan21_id | 1 cuenta |

- **Planes BORRADOS históricamente: ids 4, 6, 10** (no existen; nada los referencia — verificado).
- `account.analytic.plan` en v19 **NO tiene campos `active` ni `company_id`** (verificado vía ir.model.fields) — los planes no se archivan.
- `root_id` es computed no-stored: primer segmento de parent_path. `root_plan_id` en account.analytic.account es related stored (`plan_id.root_id`).
- Integridad total verificada hoy: 0 planes con root vacío, 0 cuentas con root_plan_id vacío o colgante, 0 keys muertas en distribution models, 0 refs a planes 4/6/10.

## 4. RUBROS DEL PLAN 20 (relevantes para costeo de mano de obra) — ids 1153–1180, todos activos, root=20, referenciados en distribution models
1153 Utilidad · 1154 Materiales · 1155 Combustible · 1156 3.4 Comisiones Montalvo · 1157 3.2 Comisiones Diego · 1158 3.3 Comisiones Luis Angel · 1159 4.1 Bono Supervisores · 1160 4.2 Bono Técnicos · 1161 5.1.1 Comisiones Budenheim Landa · 1162 5.2.1 Comisiones Clarios Andres Valencia · 1163 5.2.2 Comisiones Clarios Sergio Ongay · 1164 5.2.3 Comisiones Clarios Tamayo · 1165 5.3.1 Comisiones GEPP Jéssica · 1166 5.4.1 Comisiones Magnekon Juventino · 1167 5.5.1 Comisiones Nalco Luis Rene · 1168 5.5.2 Comisiones Nalco Misael · 1169 5.6.1 Comisiones COE Roberto Aguilar · 1170 3 Comisiones FTS interno · 1171 1. Ingreso Untaxed Amount · 1172 5.7.1 Comisiones Bridgestone Noe · 1173 5. Comisiones Clientes externo · 1174 5.8 Comisiones Hiram Clarios · 1175 5.9 Comisiones Robert Barrera · 1176 2.2 Materiales · **1177 2.1 Mano de Obra** · 1178 3.1 Comisiones Aldo · 1179 3.1.1 Comisiones Rissia · 1180 3.5 Comisiones Ricardo

## 5. COMPAÑÍAS (ids verificados hoy)
1 SERVICIOS FTS · 2 JUAN DE LA CRUZ MALDONADO · 3 Jesus Esteban De La Cruz Calderon · 4 TECNOLOGIAS Y PRODUCTOS YIN · 5 "....," (compañía sin nombre real — candidata a limpieza) · 6 FTS FULL TECHNOLOGY SYSTEMS LLC · 8 XIMENA MARICELY LUGO PEREZ · 10 Taqueria los Jimenez

## 6. HALLAZGOS TÉCNICOS DE ODOO 19 (aprendidos/verificados hoy — aplicables a Fase 2)
- `_get_distribution` construye planes desde `distribution_analytic_account_ids.root_plan_id` de los distribution models que matchean; el compute filtra cuentas con `.exists()`. La tabla applicability NO participa en _get_distribution (solo en get_relevant_plans / mandatory).
- `mapped(callable)` en v19 aplica la función al recordset COMPLETO, no por registro.
- Métodos privados (prefijo `_`) YA NO son llamables por RPC en v19 ("Private methods cannot be called remotely").
- `ir.property` NO existe en v19 (404) — defaults ahora company-dependent.
- `res.config.settings` es transient: no sirve para forense de "quién guardó Ajustes".
- Los logins de uid 2 ocurren cada ~5 min exactos (patrón :33/:06) — es n8n/MCP autenticándose; el historial de sesiones de uid 2 NO sirve para atribuir acciones humanas.
- El onchange puede simularse por RPC para reproducir/verificar bugs sin tocar la UI (patrón usado hoy con sale.order.line / purchase.order.line + fields_spec).
- Rolling release: Odoo empuja builds sin aviso (systray `RollingReleaseSystray` visible). Ante errores "de lunes en la mañana" sin cambios de datos: revisar commits recientes de la rama 19.0 en los módulos del traceback (github.com/odoo/odoo/commits/19.0/addons/<módulo>.atom).

## 7. CORRECCIÓN A REGISTRO PREVIO
El "Phase 0" de limpieza analítica archivó **~41 cuentas** (batch principal 2026-07-09 05:52 UTC, uid 2), no 7 como se tenía registrado. Todas quedaron con root_plan_id válido. Pendiente auditar ese alcance por separado.

## 8. PENDIENTES ABIERTOS
1. Ticket a soporte Odoo referenciando issue #275850 + commits 6fe806b/4620ce9 + traceback 2026-07-13 16:32 GMT (constancia de downtime, ETA del build con fix).
2. Decidir destino del plan 7 (fusionar con 9 / eliminar / dejar como raíz).
3. Auditoría del alcance real del Phase 0 (41 cuentas archivadas).
4. Regla operativa nueva: NUNCA guardar distribution models vacíos ni filas de applicability sin plan; al crear modelos para mano de obra (Fase 2), siempre llenar analytic_distribution antes de guardar.
5. Confirmación pendiente de Gerardo/Luis Ángel en factura de proveedor (mismo motor).

---

## 9. Correcciones a Fase 2 (Carga MO) derivadas del incidente
Se incorporan al spec del distribuidor V1.

**a. Neutralización del double-count = UNLINK, NUNCA vaciar.**
La forma de "apagar" un distribution model de MO es **`unlink` (borrar el registro)**, JAMÁS dejar `analytic_distribution` vacío. Un model vacío matchea TODAS las líneas de su company y **crashea el onchange de PO/SO** (es exactamente lo que provocó este P1 con el id 53). En el **mismo cutover** de la Carga MO: `unlink` de **#47** (BBVA Nomina `102.01.00008` → 1177, el que auto-etiqueta la nómina) **+ #48** (`2023.34` → 1177) **+ #9** (`101000` → 1177), dejando al distribuidor V1 como ÚNICA fuente del rubro 1177.
- ⚠️ **Reconciliar antes del cutover (discrepancia de fecha):** `DIAGNOSTICO_CARGA_MO.md` §4 (2026-07-06) atribuye la fuga a **#48 (GL `2023.34`, journal BNK1, 203 líneas)**; mi Audit C (2026-07-12) encontró **#48 dormido** (no existe `account.account` con code `2023.34*`) y **#47 (BBVA Nomina `102.01.00008`) activo**. Unlinkear **los 3 (47/48/9)** resuelve el double-count sin importar cuál esté vivo; la reconciliación es para el registro (query: `account.analytic.line` rubro 1177 recientes → `move_id` → GL → qué prefijo matchea).

**b. Invariante nueva FASE2 (regla dura):**
- Jamás guardar un `account.analytic.distribution.model` sin `analytic_distribution` poblada.
- Jamás guardar un `account.analytic.applicability` sin `analytic_plan_id`.
- Todo model de MO nace con su `{proyecto/bolsa , 1177: 100}` (o el rubro correcto) **antes** de guardar.

**c. Auditoría A ajustada (planes v19 no se archivan):**
- `account.analytic.plan` **no tiene `active`** → "archivar" no aplica. **T1 para planes 16 "Default" y 19 "Project" = ELIMINACIÓN** (0 cuentas, 0 applicability), no archivado.
- **Plan 7 "Materiales" hoy es raíz** (se promovió durante el diagnóstico). **T2 sigue vigente:** eliminar planes 7 + 9 (ambos "Materiales", vacíos) **tras** quitar sus **12 reglas applicability** (plan 7: ids 24,42,60,78,132,150 · plan 9: ids 25,43,61,79,133,151). *(Nota: las 8 applicability de `analytic_plan_id=false` — ids 40,58,76,94,148,166,184,202 — ya se borraron hoy y son distintas de estas 12.)*

**d. Corrección de registro Phase 0:** archivó **~41 cuentas**, no 7. **Pendiente:** auditar ese alcance y **cruzarlo con las 19 cuentas activas "sin proyecto vivo" de Auditoría B.4** (candidatas a archivado Frente B) para no dejar cuentas de proyecto cerrado con budget MO abierto.

**e. Lección operativa (post-mortem técnico):** ante un error que aparece **sin cambios de datos internos** (típico "lunes en la mañana"), **revisar primero el rolling release de Odoo** — commits recientes de la rama 19.0 del módulo que aparece en el traceback (`github.com/odoo/odoo/commits/19.0/addons/<módulo>.atom`) — ANTES de asumir bug propio. Nos ahorró horas de cacería de "corrupción" que no existía.
