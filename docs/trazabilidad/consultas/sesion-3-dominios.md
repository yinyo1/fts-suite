# Sesión 3 · cada cifra con su modelo, su dominio y su campo

Todo es **sólo lectura**: `search_read`, `read`, `read_group` sobre Odoo 19, tres `SELECT` con
el rol `comercial_app` sobre Postgres, y `git show origin/main:<ruta>` sobre el repo. Los
importes y los nombres **no se publican aquí** (repositorio público): estas consultas los
devuelven al ejecutarlas, y el detalle nominal se regenera en
`docs/trazabilidad/_privado/sesion-3-comisiones.md`, que está en `.gitignore`.

Convenciones respetadas: **nunca se suman pesos con dólares** (`currency_id` en el agrupado),
**`company_id` en toda consulta por número de documento**, **no se filtra por campos
calculados**, y **`odoo_query` con `ids` NO respeta el orden de la lista** (§10 de la sesión 2)
— para mapear id → nombre se usa el agrupado, que imprime el `[id=N]`.

---

## §1 · Las comisiones

### Los tres catálogos
```
account.account   [code like '2023.5']
                  fields code, name, account_type, company_ids, reconcile
                  -> 8 cuentas, todas company 1, todas expense
   ⚠️ `deprecated` NO existe en este modelo: pedirlo revienta con KeyError.
   ⚠️ TRAMPA: 'like 2023.5' atrapa también la cuenta `2023.5`, que es de OTRO negocio
      (CLAUDE.md §9). Para las comisiones hay que ENUMERAR los seis códigos usados:
      ['2023.51','2023.52','2023.52.11','2023.52.12','2023.52.13','2023.52.14']

account.analytic.account  [plan_id = 20]      fields id, name, company_id, active
                  -> 32 cuentas; 19 de comisión/bono, 2 de viajes, 1 de utilidad,
                     1 de marketing, 2 de otra compañía
account.analytic.account  ids [3097,3098,3099,3119,1153,1171,1176,1177]
                  fields create_date, create_uid
                  -> los rubros de VIAJES (MX y USA) y MARKETING/LEADS creados 2026-07-09;
                     el rubro de comisión más nuevo, 2026-08-29. Los viejos sin create_date.

account.analytic.distribution.model  []
                  fields account_prefix, analytic_distribution, company_id, partner_id, product_id
                  order "account_prefix asc"                            -> 49 filas
                  -> 5 filas con prefijo '119.01.01' · 13 con '2023.51' · 18 con '1.1' ·
                     3 con '2023.52' · una por cada cuenta de persona
```

### El bug de las reglas ambiguas
```
account.analytic.line  [x_plan20_id != false]   group_by x_plan20_id · __count
                  -> SÓLO 12 de los 32 rubros tienen líneas
account.analytic.line  [x_plan20_id = <el rubro que gana>]
                  group_by general_account_id, journal_id · __count, amount:sum
                  -> 2,633 de 2,666 son IVA (119.01.01 y 118.01.01); 16 son comisiones
account.analytic.line  [general_account_id.code = '119.01.01', x_plan20_id != false]
                  group_by x_plan20_id, date:year · __count
                  -> 2,448 (2025) + 187 (2026) + 2 (2024) en UN rubro de persona;
                     4 líneas en cada uno de los otros cuatro
```

### Las 93 líneas
```
account.analytic.line  [company_id in (1,6), general_account_id.code in <los seis>]
  group_by general_account_id, currency_id · __count, amount:sum   -> 6 grupos, 93 líneas
  group_by date:year, journal_id  · __count, amount:sum            -> 2025: 79+13 · 2026: 1
  group_by general_account_id, partner_id · __count, amount:sum    -> 14 grupos
  group_by x_plan20_id, general_account_id · __count, amount:sum   -> pareo 1:1 PERFECTO
  group_by account_id, x_plan20_id · __count, amount:sum           -> 89 grupos
  group_by account_id · __count                                    -> **29 proyectos**
  [... , date >= '2026-01-01']  fields date, name, amount, account_id, x_plan20_id,
                                       general_account_id, journal_id, partner_id, ref,
                                       move_line_id                -> **1 sola línea**
```
**Control:** el conteo **sin** filtrar por `account_id` da los mismos 93 que el de la sesión 2
**con** `account_id != false` → **todas las líneas de comisión llevan proyecto**.

### El presupuesto por persona
```
budget.line  [x_plan20_id in <los 22 rubros de comisión y bono>]
             group_by x_plan20_id · __count, budget_amount:sum, achieved_amount:sum
             -> 456 renglones en 18 rubros; los DOCE rubros del lado cliente con
                achieved_amount = 0.00
budget.line  [x_plan20_id in <...>]  fields budget_analytic_id, x_plan20_id, account_id,
                                            budget_amount, achieved_amount, committed_amount
```

### Cómo se paga
```
account.move.line  [company_id in (1,6), account_id.code in <los OCHO códigos>]
                   group_by move_id, parent_state · __count, balance:sum
                   -> **26 documentos**: 23 BILL, 3 asientos de banco, 1 en borrador
account.move  ids [<los 26>]  fields name, move_type, state, invoice_date, date, partner_id,
                                     amount_total, currency_id, payment_state, journal_id, ref
                   -> las facturas por persona son de tres viernes consecutivos de
                      septiembre de 2025; después no hay ninguna
```

### Quién ya no está
```
hr.employee  [active in (true,false), OR(<los seis nombres>)]
             group_by active, department_id · __count      -> 3 activos / 3 archivados
hr.employee  [active = false, OR(<los seis>)]
             fields name, active, job_title, departure_date, departure_reason_id, write_date
             -> los tres con su fecha de salida y su motivo
```
⚠️ En la vista de `odoo_query`, `active = false` se imprime como celda **vacía**, no como
`false`. Una celda vacía **no es un valor** (§20 #18): hay que confirmarlo con un dominio
explícito, que es lo que se hizo.

### El machote — workflow TMP `tURR0FDHK41kzjS8`, ejecución `112471`
Tres `SELECT`, todos sobre `comercial.machote` + `comercial.machote_version`, tomando la
**última versión por machote** con `DISTINCT ON (machote_id) ... ORDER BY machote_id, version DESC`
y `WHERE m.deleted_at IS NULL`:
1. **`PG - Personas de comision por machote`** — `jsonb_array_elements` de `equipo_venta`,
   `equipo_operaciones` y `equipo_cliente` unidos con `UNION ALL`, agrupado por lado y nombre,
   con `count(DISTINCT folio_txt)` y el rango de porcentaje.
2. **`PG - Seccion de comisiones machote por machote`** — por machote: `comision_fts`,
   `comision_cliente`, `reparto`, los nombres concatenados con `string_agg(... ORDER BY ord)`
   y **la suma de porcentajes por lado** (`round(sum((e->>'pct')::numeric),4)`).
3. **`PG - Cuantas versiones tocaron las comisiones`** — sobre **las 490 versiones**:
   cuántas traen `equipo_venta`, **cuántas combinaciones distintas de equipo**, cuántos
   valores distintos de `comision_fts`, y cuántas traen comisión de cliente distinta de cero.

⚠️ Escrito **sin un solo `\` y sin un solo `$$`** (comprobado con
`(s.match(/\\/g)||[]).length === 0`), por §20 #10: lo que viaja por una expresión de n8n
puede perder un nivel de escape.

### El código del machote
```
grep -rn "comision|reparto|equipo_venta" comercial/machote/js/calc.js
  -> COMISION_FTS_PLANTILLA = 0.055 · REPARTO_PLANTILLA = {venta:0.73, operaciones:0.27}
  -> EQUIPO_VENTA_PLANTILLA (calc.js:257-260): cuatro nombres de pila, 25 % cada uno
  -> EQUIPO_OPS_PLANTILLA (261-264): cuatro etiquetas genéricas
  -> equipo_cliente por omisión: un placeholder al 100 %
grep -rn "<los cuatro nombres>" --include=*.js --include=*.json --include=*.html .
  -> SÓLO la plantilla, la demo y una prueba. **No hay catálogo ni tabla de mapeo.**
sed -n '186,205p' comercial/machote/js/reglas.js
  -> `comision-sin-nombre` es severidad **blanda** y sólo mira el lado cliente
```

---

## §2 · Fase 1 — lo que ya existe
```
n8n get_workflow_details  Cyapm1EfPPbTxSi5  detailLevel execution
  -> active true · versionId 4cb4ad58… == activeVersionId · 21 nodos
n8n get_workflow_details  H2HOG8LqoYUVg3hU  detailLevel execution
  -> active true · versionId c8b06545… == activeVersionId · 25 nodos
```
**La validación de los compromisos** se leyó de la copia del repo
`docs/n8n-workflows/orden-crear-v2.sdk.js` (no del MCP, para no traer al contexto las
implementaciones de SHA-256 inline). Comprobado antes que el archivo **no trae secretos
literales**, sólo la referencia `$env.SUITE_JWT_SECRET`.
El bloque dice `var c = p.compromisos || {}` → **los compromisos se leen del CUERPO**. Cuatro
son obligatorios; `pago_hitos` se lee con `Array.isArray(...) ? ... : []` → **opcional**.

**Lo que la pantalla teclea a mano** se leyó de `comercial/machote/js/confirmar.js`:
`RUBROS` en las líneas 208-212 (tres rubros), y los inputs de handoff en 272-330
(`cfIni`, `cfFin`, `cfResp`, `cfRespId`, `cfEnt`, y los `.cf-rubro`).
**Lo que el motor ya calcula** se leyó de `comercial/machote/js/calc.js`: `costoMo`,
`costoMat` y `costoViaje` por sección (711-770) y sumados (825); y el comentario de 713-715
que dice por qué el viaje se cuenta **aparte** de materiales.

---

## §3 · La forma real de una orden
```
sale.order.line  [order_id.company_id in (1,6), order_id.state='sale',
                  order_id.date_order>='2025-01-01']
                 group_by display_type · __count
                 -> producto 449 · line_note 312 · line_section 34   (795 en total)
                 + [display_type='line_section'] group_by order_id  -> **24 órdenes**
                 + [display_type='line_note']    group_by order_id  -> **126 órdenes**
                 + [display_type=false] group_by product_id · __count
                 -> **328 productos distintos**; el más usado en 71 renglones
```
Y `shared/comercial/plantillas-notas.json` (generado 2026-09-15 por la #244) ya traía
**308 notas / 287 textos distintos** sobre 176 órdenes. Hoy son 312 / 179: **crece igual**.

---

## §4 · Fase 3 — los dos agujeros, contra `origin/main`
```
git log --oneline origin/main -1        -> 3b84d67
for f in comercial/machote/js/*.js; do git show origin/main:$f | grep -n lead_id; done
  -> almacen.js:1391 (lo MANDA) · orden.js:790 y :953 (lo LEEN). Ninguna escritura.
for f in comercial/**.{js,html} (sin tests); do git show origin/main:$f | grep -c odoo_lead_id; done
  -> **0 en todos**
```
Lo verificado es el **árbol remoto**, no el clon local: `git show origin/main:<ruta>`.

---

## §5 · Plan 20 y los planes empatados
Medido en la sesión 2 y **no re-medido aquí**: los planes **1** y **22** empatan en
`sequence = 10`; el 22 tiene **una** cuenta, creada el **2026-09-23**, y **un** renglón
analítico. Dominios en [`sesion-2-dominios.md`](sesion-2-dominios.md) §10.
Nuevo de esta sesión: el plan 20 tiene **32** cuentas y **dos de ellas son de otra compañía**,
así que el plan rubro **no está limpio por empresa**.
