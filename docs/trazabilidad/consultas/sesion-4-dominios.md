# Sesión 4 · cada cifra con su modelo, su dominio y su campo

**2026-09-25.** Sólo lectura. Todas por el MCP de Odoo (`odoo_query`, `odoo_agrupar`,
`odoo_describe`) salvo donde se diga. **Cero escrituras.**

Las cifras de sesiones anteriores **no se vuelven a medir**: están en
`consultas/sesion-2-dominios.md` y `consultas/sesion-3-dominios.md` del PR #290.

---

## 1 · El umbral de anticipo (respuesta 6)

**Universo.** `sale.order` · `state = 'sale'` · `company_id in (1,6)` ·
`date_order >= '2025-01-01'` · **separando por `currency_id` en todas**.

```
[["state","=","sale"],["company_id","=",1],["currency_id","=",33],
 ["date_order",">=","2025-01-01"],["amount_untaxed",">=",200000]]
 → 38 registros · amount_untaxed:sum = 91,652,593.13 MXN

 mismo, con ["amount_untaxed","<",200000]
 → 97 registros · amount_untaxed:sum =  4,427,778.14 MXN
```

**Dólares:** `currency_id = 2`, cías 1 y 6 → **45 órdenes**, leídas **una por una** con
`odoo_query` (campos `name, company_id, currency_id, amount_untaxed, amount_total, date_order`,
`order: amount_untaxed desc`) y sumadas fuera. Total **1,211,721.88 USD**.

🔴 **Defecto del instrumento, detectado y rodeado.** `odoo_agrupar` con **varios agregados del
mismo campo** (`amount_untaxed:sum`, `:avg`, `:max`) devolvió **el mismo valor en las tres
columnas** —el máximo— para los dos grupos:

```
company_id 6 · registros 36 · sum 233,920.00 · avg 233,920.00 · max 233,920.00
company_id 1 · registros  9 · sum 185,200.00 · avg 185,200.00 · max 185,200.00
```

Se detectó porque **36 registros no pueden tener suma == promedio == máximo**. El `__count` sí
era correcto (36 + 9 = 45, que coincide con la lectura cruda). **Las cifras de dólares de esta
sesión están calculadas sobre los 45 renglones crudos**, no sobre ese agregado.

📌 **Para quien vuelva a medir:** pedir **un** agregado por llamada, o contrastar contra la
lectura cruda. Un agregado solo (`amount_untaxed:sum` en la primera consulta de la sesión) sí
dio cifras coherentes.

---

## 2 · El IVA en la PO (respuesta 5)

**Los campos que existen.** `odoo_describe` sobre `sale.order`, filtro `purchase` → **4**:
`purchase_order_count` (integer, nativo, no es esto), `x_studio_purchase_order_file` (binary),
`x_studio_purchase_order_file_filename` (char), `x_studio_purchase_order_number` (char).
**Ninguno con el importe.**

**Órdenes sin impuesto.**
```
[["state","=","sale"],["company_id","in",[1,6]],
 ["date_order",">=","2025-01-01"],["amount_tax","=",0]]
 agrupado por company_id, currency_id
 → cía 6 USD: 19 · cía 1 MXN: 5 · cía 1 USD: 6   (total 30)
```
Contra el universo de **180** órdenes confirmadas del mismo periodo → **16.7 %**.

**La llave de la memoria por cliente.** Mismo universo, agrupado por:
```
partner_id            → 44 grupos
commercial_partner_id → 29 grupos
```
Los cuatro mayores por `commercial_partner_id` suman **99 de 180 órdenes (55 %)**. Un mismo
cliente aparece hasta con **cinco** registros distintos de `partner_id` (la empresa y cuatro
contactos suyos).

---

## 3 · La rentabilidad de cuatro números (respuesta 1)

**La contaminación del libro analítico.**
```
account.analytic.line
[["account_id","!=",false],["date",">=","2025-01-01"],["company_id","=",1]]
agrupado por general_account_id · orderby __count desc
```

| cuenta | renglones |
|---|---|
| `899.01.99` Base Imponible de Impuestos | 4,775 |
| `601.84.01` Otros gastos generales | 3,233 |
| `119.01.01` IVA pendiente de pago | 2,845 |
| `118.01.01` IVA acreditable pagado | 1,585 |
| `101000` Nómina | 592 |
| *(sin `general_account_id`)* | 258 |
| `401.01.01` Ventas y/o servicios gravados | 232 |
| `2023.34` Egreso Nóminas | 108 |
| seis cuentas de comisión (`2023.5*`) | 93 |
| `201.01.01` Proveedores nacionales | 7 |
| *(2 grupos más, no mostrados)* | resto |
| **total del universo** | **13,731** |

**Mecánica de impuesto** = `899.01.99` + `119.01.01` + `118.01.01` = **9,205 = 67.0 %**.
**Costo o ingreso de verdad** = **4,526 = 33.0 %**.

⚠️ `account_id` es el campo del **plan 1** y su etiqueta en esta instancia es *«Gasto Directo a
proyectos»*. Los otros planes viven en columnas propias (`x_plan2_id`, `x_plan18_id`,
`x_plan20_id`, `x_plan22_id`).

---

## 4 · El catálogo de comisiones (respuesta 7)

```
account.analytic.account · [["plan_id","=",20]]
campos: id, code, name, active, partner_id · 32 registros
```

| medición | resultado |
|---|---|
| cuentas en el plan 20 | **32** |
| con `code` poblado | **0** |
| con `partner_id` poblado | **0** |
| con `active = true` | **32** |
| ids | 1153–1180, 3097, 3098, 3099, 3119 |

⚠️ **Trampa de lectura, y por eso se midió dos veces.** La primera consulta pedía
`code, name, active, company_id, partner_id`; como **`code` viene vacío en las 32**, la vista de
texto **recorrió las columnas** y parecía que dos cuentas pertenecían a otra compañía. La
segunda consulta, con `id` al frente y sin `name`, deja la alineación sin ambigüedad. **Lo que
se afirma arriba es lo de la segunda.**

**Empleados.**
```
hr.employee · [["company_id","in",[1,6]]]                        → 29   (activos)
hr.employee · [...,["active","in",[true,false]]] agrupado por active
   → active=True: 29 · sin valor (=False): 89   ·   total 118
```
⚠️ Los **89 archivados son invisibles** para la consulta normal: Odoo aplica `active_test` salvo
que el dominio lleve `active in (true,false)` explícito.

---

## 5 · El asistente nativo de anticipos (respuestas 2 y 6)

```
sale.order.line · [["is_downpayment","=",true]]   ← sin filtro de fecha ni compañía
campos: order_id, name, product_uom_qty, price_unit, price_subtotal, company_id, currency_id
→ 8 renglones, en 2 órdenes (una USD, una MXN)
```

| hallazgo | dato |
|---|---|
| renglones de anticipo en toda la instancia | **8** |
| órdenes que los llevan | **2** |
| **cancelados** (nombre con «Cancelado»/«Canceled») | **7 de 8** |
| intentos cancelados en una sola de las dos órdenes | **3**, con importes distintos |
| forma del renglón | `product_uom_qty = 0.00` y el dinero en **`price_unit`** |

⚠️ **`sale.advance.payment.inv` —el asistente— está FUERA de la allowlist del MCP.** Lo que se
afirma del asistente sale de **lo que dejó escrito en esta instancia**, no de leer su modelo.
**No se pudo comprobar si el modo porcentaje aplica sobre el subtotal o sobre el total**: los
dos usos históricos fueron de **monto fijo**. Comprobarlo exige una corrida de prueba, que es
una **escritura**, y esta sesión no escribe.

---

## 6 · Lo heredado, que NO se volvió a medir

Se cita de las sesiones anteriores, con su fuente:

| cifra | de dónde |
|---|---|
| **38 de 179** órdenes rompen alguna de las seis reglas de cuadre (21.2 %) | `consultas/reglas-cuadre-facturacion.md`, PR #290 |
| **55 %** del costo en pesos sin eje de proyecto · **18** proveedores = **88 %** | #291, R4 del plan maestro |
| **2,633** renglones de IVA con rubro de comisión de quien ya salió | #291 §1.2 |
| **93** renglones de comisión · **26** documentos · **3** viernes de sept-2025 | #291 §1.4 y §1.5 |
| **456** renglones de `budget.line` de comisión, hechos por fuera | #291 §1.3 |
| **63** pagos sin conciliar, 6 referencias duplicadas, 61 con su referencia dentro | #291, R8 |
| **703** leads activos · **24 de 24** machotes sin oportunidad | #291 §4 |
| **19 de 24** machotes con comisiones · **16 de 19** con los cuatro nombres · **3** ya salieron | #291 §1.6 |

---

## 7 · Workflows TMP de esta sesión

**Ninguno.** Todas las mediciones se hicieron con el MCP de Odoo, que es de sólo lectura, y con
lectura de archivos del repositorio. **No hizo falta crear ningún TMP**, así que no se creó.

Los TMP de las sesiones anteriores **siguen sin borrarse**, según los permisos de cada sesión:
`OTPD4IG2gZj5AxEs` · `IIqf4eeEhW5FkpVg` · `tURR0FDHK41kzjS8` · `hrBgqWGZgf1G9ezq` ·
`PzeJ7jAfvgUn70pg` · `rR7bhz8u5JblkIfa` · `F2IMCBa1kBABundZ` · `0o0mEAAblpGFDv8J` ·
`Cl9nrZ8ainxfydTs`.
