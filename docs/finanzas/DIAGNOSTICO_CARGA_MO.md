# Diagnóstico — Carga de Mano de Obra a proyectos

> **Estado:** 🚧 **WIP (parcial).** Solo secciones que NO requieren Odoo están completas.
> Las secciones marcadas **⛔ PENDIENTE (Odoo)** quedaron bloqueadas porque el servidor
> **Odoo MCP no estaba conectado en runtime** durante esta sesión (el probe de `claude mcp list`
> reportaba "Connected" pero el cliente en-sesión devolvía `Server "odoo" is not connected` en
> 3 intentos: resource read, count, fields). Se completarán en una segunda pasada tras reconectar Odoo.
> **Fecha:** 2026-07-06. **Read-only.** No se tocó Odoo, código ni workflows n8n.
> **Fuentes leídas:** `CLAUDE.md`, `docs/finanzas/FRENTE_A_PLAN.md`, `docs/PLAN_NOMINA_FTS_SUITE.md`.

---

## 0. Resumen ejecutivo (parcial — 10 líneas)

1. **Objetivo:** cadena completa de carga de MO: planeación (Felipe) → checkout con SO pre-llenada → horas confirmadas → $ estimado (costo/hora) → $ real (CONTPAQi Ulises) → `analytic.line` compuesta (proyecto plan 1 × rubro 1177 MO) impactando los budgets que A1 ya crea.
2. **Hoy NO se captura nada de MO en costo.** El checkout solo estampa `check_out` + geo + SO opcional; no hay horas confirmadas, ni costo/hora, ni escritura de `analytic.line`.
3. **Hallazgo clave §1:** la SO en checkout es **nullable y no se pre-llena en backend** — si el técnico no elige SO se escribe `null` en `x_studio_sales_order_2`. El eje proyecto de la MO nace roto desde la captura.
4. **Hallazgo clave §6:** el módulo `operaciones/planeacion/` está en **F3 (in_development)**; **F4 (backend `/planeacion/guardar`) no existe** → la planeación de Felipe no persiste a Odoo todavía. El costeo MO a proyectos que promete su README es aspiracional.
5. **Riesgo central aún sin cuantificar (§4 doble conteo):** si la nómina real ya entra a Odoo vía `account.move` con distribución analítica automática, escribir nuestras propias `analytic.line` de MO desde attendance **duplicaría el gasto**. ⛔ pendiente Odoo.
6. **⛔ Pendiente Odoo:** §1 números (60d attendances/SO), §2 (`hourly_cost` + campos custom `hr.employee`), §3 (líneas 1177), §4 (nómina real), §5 (budgets post-A1), §6 Odoo (planning.slot, resource.calendar), §7 (cuentas plan 2 por depto).
7. Frente A ya dejó A3 (candado atribución) y A1 (budgets al confirmar SO) en producción — el rubro **1177 Mano de Obra** ya existe como línea de budget (−`x_studio_presupuesto_mano_de_obra`), así que el "presupuesto MO" ya tiene destino; falta el "consumo real MO".
8. La convención LFT ya está documentada (9.6 h netas + 0.5 h comida; HE > 9.6 h/día) — base para convertir horas → $ estimado.
9. Administrativos deben cargar default a su cuenta de departamento (plan 2 Gasto Indirecto); el mapeo `hr.department → cuenta plan 2` es ⛔ pendiente de verificar (¿existe campo o hay que crearlo?).
10. **No proponer implementación aún** — este doc es solo diagnóstico; falta ~70% de los datos duros.

---

## 1. Captura de horas por SO (`hr.attendance`)

### 1.a — ✅ Qué escribe HOY el workflow `kiosk/checkin` en checkout (leído del workflow activo)

Workflow **`kiosk/checkin` (v4.2, id `a7mEjjdwIzzvomXs`, ACTIVE, 26 nodos)**. Ruta de checkout:
`Switch - Por tipo` → **`Odoo - UPDATE Salida`** → `Code - Armar Datos Salida`.

El nodo **`Odoo - UPDATE Salida`** hace `hr.attendance` **update** sobre `customResourceId = attendance_id_pendiente`, escribiendo exactamente **5 campos**:

| Campo Odoo | Valor (expresión n8n) | Nota |
|---|---|---|
| `check_out` | `={{ $json.fechaOdoo }}` | server time UTC (o hora declarada si `es_estimado`) |
| `out_latitude` | `={{ $json.lat }}` | geo salida |
| `out_longitude` | `={{ $json.lng }}` | geo salida |
| `out_mode` | `"kiosk"` | **constante** — discriminador kiosk/manual del Hallazgo #15 |
| `x_studio_sales_order_2` | `={{ $json.so_id }}` | **link SO (el campo de costeo MO)** |

**No escribe:** horas trabajadas, costo, categoría, ni `analytic_distribution`. El checkout es puramente `check_out` + geo + SO.

### 1.b — ⭐ Hallazgo: la SO es **nullable y NO se pre-llena en backend**

En `Code - Preparar parámetros` (primer Code del workflow):

```js
// SO (solo en salida)
const so_id = body.so_id ? parseInt(body.so_id) : null;
const so_nombre = String(body.so_nombre || '');
```

Consecuencias para la cadena MO:
- El `so_id` **viene solo de lo que el frontend (`kiosk.js`) mande**, y **solo tiene sentido en `tipo='salida'`**. No hay lógica de default/pre-llenado en n8n.
- Si el técnico **no elige SO**, se escribe **`null`** en `x_studio_sales_order_2` → el attendance queda sin eje proyecto → **la MO de esa jornada es inatribuible** (mismo patrón R3 de Frente A, pero del lado de la mano de obra).
- Cualquier "SO pre-llenada en checkout" (objetivo del diseño) tendría que implementarse en el **frontend** (kiosk) tomándola de la **planeación** — que hoy no persiste (§6). Es el eslabón faltante planeación→checkout.
- La lista de SOs seleccionables viene del webhook `/webhook/kiosk/sos` (visto en `planeacion/js/proyectos.js` y `kiosk/js/odoo.js`), filtrada por `company_id`.

### 1.c — ⛔ PENDIENTE (Odoo): números de captura

Requieren consulta a `hr.attendance` (read-only). Falta responder:
- Últimos 60 días: total attendances **cerradas**; **% con `x_studio_sales_order_2` poblado** vs vacío.
- Distribución por SO (top 10) y **cuánto cae en SO11547 Topo Chico** (catch-all cuenta 3034).
- ¿Desde qué fecha aprox. se dejó de capturar SO (si hay corte visible)?

---

## 2. Costo por empleado (`hr.employee`) — ⛔ PENDIENTE (Odoo)

Requiere `hr.employee` + `fields_get`. Falta responder:
- ¿Existe **`hourly_cost`** (nativo timesheet)? ¿En cuántos empleados activos está poblado y con qué valores?
- ¿Existe **`x_codigo_nomina`** o equivalente para match con **CONTPAQi**? ¿Otro campo de costo/salario custom?
- Lista de campos custom `hr.employee` relevantes a nómina (ya conocidos por doc: `x_categoria_nomina`, `x_aplica_ppa`, `x_studio_hora_entrada`).

**Contexto ya conocido (de `PLAN_NOMINA_FTS_SUITE.md`, no requiere Odoo):**
- Categorización por `x_categoria_nomina` con default por depto (`ceo`, `confianza`, `hourly_doble`, `hourly_sencilla`, `no_he_comercial`).
- Overrides explícitos ya asignados: Esteban(32)=`ceo`; Felipe(112)/Mateo(75)=`confianza`; Gerardo(59)/Teresa(60)/Gibrán(62)/Jésus M(68)/Abraham(135)=`hourly_sencilla`.
- Base horaria: 9.6 h netas/día, quincena 96 h, mensual ~208 h (para derivar `hourly_cost` si no existe nativo).

---

## 3. Estado del rubro 1177 MO en la analítica — ⛔ PENDIENTE (Odoo)

Requiere `account.analytic.line`. Falta responder (12 meses):
- Líneas con rubro **1177** (`x_plan20_id`): cuántas, monto total.
- Cuántas **COMPUESTAS** (traen también proyecto en `account_id`) vs **rubro-solo**.
- ¿De dónde nacen? (¿todas de bills al GL `2023.34` vía `distribution.model`?)

**Contexto ya conocido (Frente A):** el rubro `1177 "2.1 Mano de Obra"` es del plan 20 (eje RUBRO), signo **negativo** (costo). La `distribution.model` que inyecta 1177 está mapeada al prefijo GL `2023.34` (según §3 de FRENTE_A_PLAN). A1 ya crea la `budget.line` 1177 con `−x_studio_presupuesto_mano_de_obra`.

---

## 4. Cómo entra HOY la nómina real a Odoo (RIESGO doble conteo) — ⛔ PENDIENTE (Odoo)

> **Esta es la sección de mayor riesgo del diseño.** Sin ella no se puede diseñar la escritura de `analytic.line` de MO.

Requiere `account.move` + `account.move.line` + `account.journal`. Falta responder:
- ¿Hay `account.move` periódicos de nómina? ¿A qué GL pegan (`601.01.01` Wages, `2023.34`, provisión `210.01.01`)? ¿Qué journal?
- ¿Generan `analytic.line` automáticas por `distribution.model`?
- **Veredicto doble conteo:** si la nómina ya produce `analytic.line` con rubro 1177, escribir las nuestras desde attendance **duplicaría** el costo MO en la analítica y el budget. Documentar el flujo actual completo antes de diseñar.

---

## 5. Presupuesto MO en budgets (post-A1) — ⛔ PENDIENTE (Odoo)

Requiere `budget.analytic` + `budget.line` + `sale.order`. Falta responder:
- SOs confirmadas después del **2026-06-17**: ¿cuántas traen `x_studio_presupuesto_mano_de_obra` real vs `−1` placeholder?
- Estado de las líneas **1177** en sus `budget.line` (monto `budget_amount`, `achieved_amount`).

**Contexto ya conocido (CLAUDE.md §17 A1):** desde 2026-06-17 el workflow `u7Ni2cRAxu3zfBid` crea al confirmar SO la línea `1177 Mano de Obra = −x_studio_presupuesto_mano_de_obra`. Muchos budgets legacy son esqueletos placeholder (`budget_amount = −1`).

---

## 6. Planeación (módulo + Odoo)

### 6.a — ✅ Estado real de `operaciones/planeacion/` en el repo

- **Versión:** `version.json` → **v2.2.0**, `build 20260428-planeacion-f3-export-v3`, **`status: "in_development"`, `fase: "F3"`**, `rebuilt_from_scratch: true`. Reemplaza un módulo viejo (commit `2d09ef9`) borrado por incompatible con costeo a proyectos.
- **Archivos (13):** `index.html`, `css/planeacion.css`, y JS: `planeacion.js` (entry + auth gate), `empleados.js`, `jornada.js` (validador 9.6h), `turnos.js`, `exportar.js` (WhatsApp + PNG), `horarios-base.js`, `config.js`, `proyectos.js` (SOs desde `/webhook/kiosk/sos`), `sitios.js`, `version.json`, `README.md`.
- **Qué funciona (F1–F3):** auth gate (solo `ftsmaster` + `felipe.perez`, gate por `session.username`/`role==='master'`), carga de empleados desde Odoo, validador de jornada 9.6h con sugerencia, agrupación por sub-turnos, exportación a texto WhatsApp + PNG (html2canvas).
- **Qué NO existe (placeholder / pendiente):**
  - **F4 — backend workflow `/planeacion/guardar` NO EXISTE.** El README lo lista como fase pendiente. ⇒ **la planeación de Felipe no persiste a Odoo ni a ningún store**; es captura + export visual.
  - El propósito #2 del README ("habilitar costeo de MO por proyecto vía `account.analytic.line`") es **aspiracional, no implementado**. No hay escritura de `planning.slot`, `analytic.line`, ni vínculo persistente empleado→SO.
- **Deuda autoprogresiva viva:** `js/horarios-base.js:68` mantiene fallback hardcoded `oficinaIdsLegacy = [89, 91, 113]` (marcado "eliminar cuando 100% de operaciones_oficina tengan `x_categoria_nomina='hourly_sencilla'`"). Confirma que la categorización aún no es 100% autoprogresiva.

**Implicación para la cadena MO:** el eslabón "planeación → checkout con SO pre-llenada" está **cortado en el primer nodo** — no hay plan persistido del cual el kiosk pueda leer la SO asignada a cada empleado.

### 6.b — ⛔ PENDIENTE (Odoo): planning.slot + resource.calendar

- `planning.slot` en Odoo: ¿hay registros? ¿alguien lo ha usado?
- `resource.calendar`: calendarios activos y cuántos empleados asignados.

---

## 7. Cuentas destino para administrativos (plan 2) — ⛔ PENDIENTE (Odoo)

Requiere `account.analytic.account` (plan 2) + `hr.department`. Falta responder:
- Plan 2 "Gasto Indirecto": lista de cuentas activas por departamento (513 Administración, 478 RH, etc.).
- ¿Existe mapeo posible `hr.department → cuenta plan 2`? ¿Hay campo o habría que crearlo?

**Contexto ya conocido (Frente A §10):** plan 2 tiene 31 cuentas activas (~$7.3M/12m); ejemplos: `513 Administración`, `636 Oficina/Taller`, `478 RH`, `509 Gasolina`, `744 EPP`, `604 Nóminas`. El eje plan 2 vive en `account.analytic.line.x_plan2_id`.

---

## 8. Riesgos detectados (parcial)

| # | Riesgo | Severidad | Estado |
|---|--------|-----------|--------|
| R-MO-1 | **Doble conteo de MO en analítica** si la nómina real ya genera `analytic.line` 1177 y además escribimos las nuestras desde attendance. | 🔴 ALTA | ⛔ sin cuantificar (§4) |
| R-MO-2 | **SO nullable en checkout** (`so_id ? : null`, sin pre-llenado backend) → jornadas sin eje proyecto = MO inatribuible. | 🟠 MEDIA-ALTA | ✅ confirmado (§1.b) |
| R-MO-3 | **Planeación no persiste (F4 inexistente)** → imposible pre-llenar SO en checkout desde el plan. Eslabón inicial de la cadena cortado. | 🟠 MEDIA-ALTA | ✅ confirmado (§6.a) |
| R-MO-4 | Categorización aún con fallback hardcoded (`[89,91,113]`) → costo/hora por categoría no 100% autoprogresivo. | 🟡 MEDIA | ✅ confirmado (§6.a) |
| R-MO-5 | `hourly_cost` puede no existir/estar despoblado → sin base para $ estimado. | 🟡 MEDIA | ⛔ verificar (§2) |

---

## 9. Decisiones que Esteban debe tomar antes del diseño (preliminar)

> Se ampliará al completar las secciones Odoo. Por ahora, las que ya se pueden anticipar:

1. **$ estimado — fuente del costo/hora:** ¿`hourly_cost` nativo de Odoo, o campo custom nuevo derivado de sueldo/208h? (depende de §2).
2. **Doble conteo — quién es la fuente de verdad del costo MO en analítica:** ¿la nómina contable (`account.move`) o nuestras `analytic.line` desde attendance? **No pueden coexistir ambas en el rubro 1177.** (depende de §4 — decisión bloqueante).
3. **SO en checkout — obligatoria o no:** ¿se hace `so_id` requerido para operativos (candado tipo A3), o se permite null con default a cuenta de proyecto/indirecto? (§1.b).
4. **Administrativos — mapeo depto→cuenta plan 2:** ¿crear campo `hr.department.x_cuenta_plan2` o hardcodear un map? (§7).
5. **Planeación F4 — construir persistencia** (`/planeacion/guardar`) como prerequisito de "SO pre-llenada en checkout", o desacoplar (kiosk lee SO de otra fuente). (§6).
6. **$ real CONTPAQi — llave de match:** ¿`x_codigo_nomina` u otro identificador para reconciliar el Excel de Ulises con `hr.employee`? (§2).

---

## 10. Qué falta para cerrar este diagnóstico

Reconectar **Odoo MCP** (`/mcp` → odoo → Reconnect, o reiniciar Claude Code) y correr read-only:
`hr.attendance` (§1), `hr.employee` + fields (§2), `account.analytic.line` (§3), `account.move`/`account.move.line`/`account.journal` (§4), `budget.analytic`/`budget.line`/`sale.order` (§5), `planning.slot`/`resource.calendar` (§6.b), `account.analytic.account` plan 2 + `hr.department` (§7).
