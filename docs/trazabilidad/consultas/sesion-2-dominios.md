# Sesión 2 · cada cifra con su modelo, su dominio y su campo

Todo es **sólo lectura**: `search_read`, `read`, `search_count` y `read_group` sobre Odoo 19,
más tres `SELECT` con el rol `comercial_app` sobre Postgres. Los importes **no se publican
aquí** (repositorio público): estas consultas los devuelven al ejecutarlas, y el detalle
nominal se regenera en `docs/trazabilidad/_privado/`, que está en `.gitignore`.

Convenciones que se respetaron en todas: **nunca se suman pesos con dólares** (siempre
`currency_id` en el agrupado), **toda consulta por número de documento lleva
`company_id`**, **no se filtra por campos calculados no almacenados**, y se pagina.

---

## §1 · YIN

```
sale.order      [company_id=4, state=sale, date_order>=2025-01-01]
                group_by currency_id · agg amount_untaxed:sum, amount_total:sum, __count
sale.order      [company_id in (1,6), state=sale, date_order>=2025-01-01]
                group_by company_id, currency_id · mismos agregados
account.analytic.line   [company_id=4]            group_by account_id · __count
project.project         []                        group_by company_id · __count
project.project         [company_id=4]            fields name, active, account_id, create_date, partner_id
purchase.order          [company_id=4, date_order>=2025-01-01]   group_by state · __count
purchase.order          [company_id=4, state=purchase, date_order>=2025-01-01]
                        fields name, partner_id, origin, amount_untaxed, currency_id, invoice_status, project_id
account.move            [company_id=4, date>=2025-01-01]   group_by journal_id, move_type · __count
sale.order              [company_id=4, state=sale, date_order>=2025-01-01]   group_by partner_id · __count
sale.order              [company_id in (1,6), state=sale, date_order>=2025-01-01]  group_by partner_id · __count
```

⚠️ `group_by plan_id` sobre `account.analytic.line` **revienta** con un traceback del
servidor. Se agrupó por `account_id`.

⚠️ El promedio y la suma de `amount_untaxed` de YIN salieron idénticos en la sesión anterior
porque **una de las dos era el promedio**: `suma / 1753` da el otro número exacto. Cualquier
total se pide con `amount_untaxed:sum` y se comprueba dividiendo entre `__count`.

---

## §2 · El machote y la oportunidad

```
crm.lead   [active=true]                                   group_by company_id · __count      -> 703 en (1,6)
crm.lead   [company_id in (1,6), active=true]              group_by type, stage_id · __count
crm.lead   [company_id in (1,6), active=true, x_studio_machote_folio != false]
                                                            group_by stage_id · __count        -> 0 grupos
crm.lead   [company_id in (1,6), active=true, x_studio_machote_folio = false]
                                                            group_by stage_id · __count        -> los 703  (CONTROL)
crm.lead   [active in (true,false), x_studio_machote_folio != false]
                                                            group_by company_id · __count      -> 0 grupos
crm.lead   [company_id in (1,6), active=true, create_date>=2025-01-01]  group_by stage_id      -> 207
crm.lead   [company_id in (1,6), active=true, x_studio_field_UMzY2 != false]
                                                            fields name, x_studio_field_UMzY2, x_studio_many2one_field_6dQyA, create_date, stage_id
crm.lead   [company_id in (1,6), active=true, x_studio_many2one_field_6dQyA != false]
                                                            fields name, ..., create_date, write_date
sale.order [company_id in (1,6), state=sale, date_order>=2025-01-01]   group_by opportunity_id -> 68 sin valor de 179
```

`odoo_describe crm.lead filtro x_studio` → 19 campos, dos de ellos `many2one` a `sale.order`.
`odoo_describe sale.order filtro machote` → **0 campos**: la orden no tiene dónde guardar el
folio del machote.

**Postgres**, workflow `IIqf4eeEhW5FkpVg`, nodo `PG - Los 24 machotes con sus ligas`:

```sql
WITH ult AS (SELECT DISTINCT ON (machote_id) machote_id, version, documento, total, moneda, estado
             FROM comercial.machote_version ORDER BY machote_id, version DESC)
SELECT m.folio_txt, m.id_local, m.dueno, m.archivado_at IS NOT NULL AS archivado,
       m.odoo_partner_id, m.odoo_lead_id, m.odoo_so_id, m.odoo_so_name, m.odoo_project_id,
       m.odoo_analytic_id, m.confirmada_at IS NOT NULL AS confirmada,
       m.created_at::date, m.updated_at::date, u.version, u.estado, u.moneda, round(u.total,2),
       (u.documento->>'cliente_id'), (u.documento->>'empresa_id'),
       m.pago_dias, m.pago_termino_id, jsonb_array_length(coalesce(m.pago_hitos,'[]'::jsonb)),
       m.incoterm_code, (m.entrega_texto IS NOT NULL), m.vigencia_dias,
       (m.compromisos_at IS NOT NULL)
  FROM comercial.machote m JOIN ult u ON u.machote_id = m.id
 WHERE m.deleted_at IS NULL ORDER BY m.folio_txt NULLS LAST, m.created_at;
```

Nodo `PG - Claves del documento por machote`: `jsonb_object_keys` del documento de la última
versión, agrupado → **32 llaves**, ninguna `iva`.

Nodo `PG - Confirmaciones y handoff`: **tronó** con `column h.odoo_so_id does not exist`.
`comercial.handoff` no guarda la orden.

**Código** (repositorio, rama `main`):
`grep -rn "lead_id" comercial/machote/js/*.js` sin pruebas → 3 líneas, las 3 de lectura.
`grep -rn "odoo_lead_id" comercial/ --include=*.js` sin pruebas → **0**.
`comercial/machotes-leer` (`Lze4jmkW9pg7Tvad`), nodo `Code - Armar respuesta`, devuelve
`odoo_lead_id`.

---

## §3 · Las órdenes que no cuadran

Universo, en cuatro páginas de 50/50/50/29:

```
sale.order [company_id in (1,6), state=sale, date_order>=2025-01-01]  order "id asc"
  fields name, company_id, currency_id, amount_total, amount_invoiced, amount_to_invoice,
         invoice_count, invoice_status, date_order
```

⚠️ `amount_invoiced` y `amount_to_invoice` **no son filtrables** (no almacenados): se leen y
se comparan fuera. Las seis reglas, con **tolerancia 0.5** en la moneda de la orden y **sin
descontar solapamientos**:

```
A  inv - tot          >  TOL
B  ti                 < -TOL
C  (inv + ti) - tot   >  TOL
D  estado = 'invoiced'  y  |inv| <= TOL
E  invoice_count > 0    y  |inv| <= TOL
F  invoice_count > 0    y  tot - (inv + ti) > TOL
```

→ A 8 · B 1 · C 18 · D 3 · E 18 · F 3 · **40 órdenes distintas de 179**.

Reconstrucción de cada caso:

```
sale.order       [name in (...), company_id in (1,6)]
                 fields invoice_ids, project_id, project_account_id, opportunity_id, user_id
account.move     [company_id=1, invoice_origin like '<SOnnnnn>']
                 fields name, move_type, state, invoice_date, currency_id, amount_total,
                        amount_total_signed, invoice_currency_rate, amount_residual,
                        amount_residual_signed, payment_state, reversed_entry_id,
                        reversal_move_ids, l10n_mx_edi_cfdi_origin
account.move     ids [...]  (los invoice_ids, leídos por id)
account.move.line[move_id.name='<INVnnnn>', company_id=1, display_type='product']
                 fields name, quantity, price_unit, price_subtotal, sale_line_ids, analytic_distribution
account.move.line[company_id=1, move_id.invoice_origin like '<SO>', display_type='product']
                 group_by move_id · __count, price_subtotal:sum
account.move.line[sale_line_ids in (<ids de renglón de orden>)]
                 group_by move_id · __count, price_subtotal:sum, price_total:sum
account.move.line[sale_line_ids in (<un id>)]
                 fields move_id, currency_id, quantity, price_unit, price_subtotal,
                        amount_currency, balance, parent_state
sale.order.line  [order_id.name in (...), order_id.company_id=1, display_type=false]
                 fields is_downpayment, product_uom_qty, qty_invoiced, qty_to_invoice,
                        price_subtotal, untaxed_amount_invoiced, untaxed_amount_to_invoice
sale.order.line  ids [...]  fields untaxed_amount_invoiced, untaxed_amount_to_invoice, currency_id
account.move     [company_id=1, invoice_origin like '<SO>']  group_by currency_id, state · __count, amount_total:sum
```

**El mecanismo de §3.2, comprobado al centavo en dos órdenes:**
`amount_to_invoice == Σ(qty_to_invoice × price_unit) × (1 + tasa)` y
`amount_invoiced == Σ(untaxed_amount_invoiced) × (1 + tasa)`.

⚠️ **La regla E cuenta facturas canceladas**, porque `invoice_count` las cuenta. Un watchdog
tiene que exigir `move_id.state = 'posted'`.

⚠️ **`invoice_count` se deriva de la liga de renglón**: una orden con factura posteada y
pagada pero sin liga reporta `invoice_count = 0`, así que **ninguna de las seis reglas puede
verla**. Las 40 son un piso.

---

## §4 · Contaminación del libro analítico

```
account.analytic.line [company_id in (1,6), account_id != false]
   group_by general_account_id · __count            (orderby __count desc y asc: 37 grupos, 19,687 renglones)
   group_by journal_id, currency_id · __count, amount:sum
   group_by account_id · __count                    (281 grupos)
account.analytic.line [company_id in (1,6), account_id != false, date>=2025-01-01]
   group_by general_account_id · __count            (18 grupos, 13,735 renglones)
   group_by account_id · __count                    (132 grupos)
account.analytic.line [company_id in (1,6), account_id != false,
                       general_account_id.code in ('899.01.99','118.01.01','119.01.01')]
   group_by journal_id · __count                    -> 2 diarios, 9,178 renglones
   group_by date:year · __count                     -> 2024:5 · 2025:5,709 · 2026:3,464
   group_by account_id · __count                    (125 grupos)
   fields date, account_id, general_account_id, amount, journal_id, name · order "date asc" · limit 4
account.analytic.line [account_id.name like '<SO>']  group_by journal_id, general_account_id · __count, amount:sum
account.analytic.line [company_id in (1,6), account_id != false, general_account_id.code like '2023.5']
   group_by general_account_id, currency_id · __count, amount:sum    -> 6 cuentas, 93 renglones
account.account [code in ('899.01.99','118.01.01','119.01.01')]  fields code, name, account_type, company_ids
```

**Los dos ceros exactos** (§4): sobre un proyecto, los renglones de `899.01.99` suman
`0.00` y el par de IVA del diario `Effectively Paid` suma `0.00`. Los de `119.01.01` del
diario de facturas de proveedor **no** se revierten.

---

## §5 · Anticipos

```
sale.order.line [order_id.company_id in (1,6), is_downpayment=true]  group_by order_id · __count
                -> 2 órdenes, las dos anteriores a 2025
account.move    [company_id in (1,6), move_type in ('out_invoice','out_refund'), invoice_date>=2025-01-01]
                group_by state, move_type · __count     -> 210 posteadas (197 + 13)
                group_by create_uid, journal_id · __count   (sólo posteadas)
account.move.line [company_id in (1,6), move_id.move_type in ('out_invoice','out_refund'),
                   move_id.invoice_date>=2025-01-01, move_id.state='posted', display_type='product',
                   OR(name ilike 'anticipo', name ilike 'down payment', name ilike 'advance')]
                group_by move_id · __count, price_subtotal:sum    -> 7 renglones
sale.order.line [order_id.company_id in (1,6), order_id.state='sale',
                 order_id.date_order>=2025-01-01, untaxed_amount_to_invoice < 0]
                fields order_id, name, price_subtotal, untaxed_amount_invoiced,
                       untaxed_amount_to_invoice, qty_invoiced          -> 15 renglones / 11 órdenes
account.move.line [... display_type='product', sale_line_ids = false]   group_by move_id  -> 53 documentos
account.move.line [... display_type='product', sale_line_ids != false]  group_by move_id  -> 160 documentos
```

⚠️ `untaxed_amount_to_invoice` **sí** es filtrable (a diferencia de los dos campos de
cabecera). Y dos de las 11 órdenes que salen con pendiente negativo lo tienen **porque su
renglón de orden es negativo**, no por sobrefacturar: hay que mirar `price_subtotal`
antes de concluir (§20 #18).

---

## §6 · Pagos a proveedor sin conciliar

```
account.payment [company_id in (1,6), partner_type='supplier']   group_by state · __count
                -> paid 1994 · in_process 1452 · canceled 63 · draft 27
account.payment [company_id in (1,6), partner_type='supplier', state='in_process', is_reconciled=false]
                group_by journal_id, currency_id · __count, amount:sum    -> 321 en 8 diarios
                group_by date:year, journal_id · __count, amount:sum       -> 12 grupos, 2024-2026
account.payment [... , journal_id in (8,58)]
                fields date, journal_id, partner_id, amount, currency_id, memo,
                       payment_method_line_id · order "amount desc" · 15 + 48
```

El campo del número de factura es **`memo`**. 61 de los 63 lo traen.

---

## §7 · Bills sin proyecto

Base común: `account.move.line [company_id in (1,6), move_id.move_type in
('in_invoice','in_refund'), move_id.state='posted', move_id.invoice_date>='2025-01-01',
display_type='product']`, agrupado por `currency_id` con `__count` y `price_subtotal:sum`.

```
+ nada                                                          -> 6,369  (cuadra con el #290)
+ distribution_analytic_account_ids.root_plan_id in (1,18)       -> 2,615  (cuadra con el #290)
+ NOT(... in (1,18))  AND  ... in (2,5,8,11,13)                  -> 2,117
+ analytic_distribution = false                                  ->   234
+ analytic_distribution != false AND NOT(1,18) AND NOT(2,..,13)   -> 1,403
```

Las cuatro cubetas son disjuntas por construcción y suman 6,369. **Control (§20 #19):** la
cuarta se calculó primero por resta y después con su propio dominio; dio el mismo conteo y el
mismo importe al centavo.

```
+ cubeta 4, currency_id=33, group_by partner_id, orderby price_subtotal:sum desc, limit 18
+ cubeta 1, currency_id=33, group_by partner_id, orderby price_subtotal:sum desc, limit 12
+ cubeta 1, currency_id=33, partner_id in (<11 ids de la cubeta 4>), group_by partner_id
  -> **0 grupos**: ninguno de esos proveedores tiene un renglón con proyecto
```

---

## §8 · Refactura

```
account.move [company_id in (1,6), move_type in ('out_invoice','out_refund'),
              l10n_mx_edi_cfdi_origin != false]
   group_by move_type, state · __count      -> 27 documentos
   fields name, move_type, state, invoice_date, amount_total, l10n_mx_edi_cfdi_origin,
          reversed_entry_id, invoice_origin, l10n_mx_edi_cfdi_uuid · order "invoice_date desc"
account.move [l10n_mx_edi_cfdi_uuid in (<los 9 uuids de los '04|'>)]
   fields name, company_id, move_type, state, invoice_date, amount_total, invoice_origin,
          l10n_mx_edi_cfdi_uuid            -> 4 de 9 resuelven, los 4 de 2026
```

Prefijos: `01|` 15 (las 15 con `reversed_entry_id`) · `04|` 8 (ninguna con
`reversed_entry_id`) · `07|` 1 · sin prefijo 1.

---

## §9 · Rentabilidad

```
sale.order              [name in ('SO11547','SO11771','SO10300'), company_id=1]
                        fields amount_total, project_id, project_account_id,
                               x_studio_project_id_created_1, partner_id
account.analytic.account [OR(name like 'SO11771', name like 'SO11547', name like 'SO10300')]
                        fields id, name, plan_id, company_id, active, code
account.analytic.line   [OR(account_id.name like ...)]
                        group_by account_id, general_account_id · __count, amount:sum   (18 grupos)
account.analytic.line   [account_id=<id>, general_account_id.code='601.84.01']
                        fields date, name, amount, journal_id, partner_id, ref · order "amount asc"
account.analytic.line   [account_id=<id>, general_account_id=false]
                        fields date, name, amount, unit_amount, journal_id, x_plan20_id, employee_id
account.analytic.line   [company_id in (1,6), account_id != false, general_account_id=224]
                        group_by date:year · __count, amount:sum, unit_amount:sum
                        -> 1,067 renglones, TODOS de 2023
purchase.order.line     [company_id in (1,6), order_id.state in ('purchase','done'),
                         analytic_distribution in (<los 3 ids de cuenta analítica>)]
                        group_by currency_id · __count, price_subtotal:sum   -> 1,134 renglones
account.analytic.line   [company_id in (1,6), general_account_id.code=false, account_id != false]
                        group_by general_account_id · __count, amount:sum
```

El operador `'in'` sobre `analytic_distribution` (jsonb) **sí** funciona con el id de cuenta,
como dice CLAUDE.md §17.

---

## §10 · Los planes

```
account.analytic.plan  []            fields name, sequence, parent_id, default_applicability, account_count
                                     order "sequence asc, id asc"      -> 19 planes
account.analytic.plan  ids [1]       fields name, sequence, account_count
account.analytic.account []          group_by plan_id · __count         -> 15 planes con cuentas, CON EL id IMPRESO
account.analytic.account [plan_id=22] fields name, code, plan_id, company_id, active, create_date
account.analytic.line   [x_plan22_id != false]  group_by x_plan22_id · __count   -> 1 renglón
project.project         [company_id in (1,6), account_id != false]  group_by company_id · __count  -> 173 + 31
budget.analytic         []           group_by company_id · __count      -> 131 (cia 1) + 27 (cia 6) + 1 (cia 4)
```

🔴 **`account.analytic.plan` no tiene campo `company_id`** — pedirlo revienta con `KeyError`.

🔴 **`odoo_query` con `ids` NO devuelve las filas en el orden de la lista de ids**: las
devuelve en el orden por defecto del modelo. Leer un campo por posición de un read con `ids`
atribuye el valor al registro equivocado. **Para mapear id → nombre hay que usar el agrupado,
que imprime el `[id=N]` junto al valor**, o leer un id por llamada.

---

## §11 · El machote contra los candados

Del nodo `PG - Los 24 machotes con sus ligas` y `PG - Claves del documento por machote` del
workflow `IIqf4eeEhW5FkpVg` (arriba), más la agregación de la sesión 0 en `OTPD4IG2gZj5AxEs`
(re-ejecutada sin modificarla): 24 machotes no borrados, 19 vivos, 5 archivados,
`con_lead 0`, `con_so_id 2`, `confirmadas 1`, y los siete campos de compromiso en **0**.

Y del repositorio: `comercial/machote/js/compromisos.js` (421+ líneas) y el panel de
`comercial/machote/js/orden.js` existen; la descripción de `comercial/orden-crear-v2`
(`H2HOG8LqoYUVg3hU`) dice que **exige los cinco compromisos**.
