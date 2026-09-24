# Las seis reglas del cuadre de facturación (§3.2 del informe)

Se evaluaron **las 179 órdenes confirmadas** de las compañías 1 y 6 desde 2025-01-01, leyendo
`amount_total`, `amount_invoiced`, `amount_to_invoice`, `invoice_count` e `invoice_status`.

⚠️ **Hay que LEER, no filtrar**: `amount_invoiced` y `amount_to_invoice` están calculados y sin
almacenar, así que no se pueden poner en un dominio. Se traen en tres páginas de 60 y se
comparan fuera.

```
dominio: [["date_order",">=","2025-01-01 00:00:00"],
          ["company_id","in",[1,6]],
          ["state","=","sale"]]
campos:  name, currency_id, amount_total, amount_invoiced,
         amount_to_invoice, invoice_count, invoice_status
orden:   id   ·   paginado 0/50/110
```

| regla | definición | órdenes |
|---|---|---|
| **A** | `amount_invoiced > amount_total + 0.01` | **8** |
| **B** | `amount_to_invoice < −0.01` | **1** |
| **C** | `amount_invoiced > 0` **y** `amount_to_invoice > 0` **y** su suma `> amount_total + 0.01` | **11** |
| **D** | `invoice_status == 'invoiced'` **y** `amount_invoiced == 0` **y** `amount_total > 0` | **2** |
| **E** | `invoice_count > 0` **y** `amount_invoiced == 0` **y** `amount_total > 0` | **17** |
| **F** | `invoice_count > 0` **y** `amount_invoiced + amount_to_invoice < amount_total − 0.01` | **2** |
| | **órdenes distintas afectadas** | **38 de 179 = 21.2 %** |

Se cuenta aparte, y **no** como anomalía, una clase más: **3 órdenes con `amount_total = 0`**
(órdenes vacías confirmadas).

## Las órdenes que dispara cada regla

Sólo números de documento, sin importes ni clientes.

- **A** · SO10337 · SO10344 · SO10600 · SO11108 · SO11662 · SO11773 · SO11846 · SO11849
- **B** · SO10941
- **C** · SO8935 · SO10344 · SO10579 · SO10821 · SO11092 · SO11118 · SO11199 · SO11227 · SO11547 · SO11762 · SO11854
- **D** · SO10996 · SO11461
- **E** · SO7723 · SO9137 · SO9532 · SO9773 · SO10159 · SO10822 · SO10917 · SO10974 · SO10996 · SO11037 · SO11322 · SO11461 · SO11464 · SO11511 · SO11557 · SO11632 · SO11641
- **F** · SO11320 · SO11646
- **monto cero** · SO10015 · SO10016 · SO10111

## Tolerancias, dichas a propósito

- El umbral es **un centavo**. Cuatro órdenes tienen diferencias de 1–2 centavos entre
  `amount_total` y la suma de facturado más pendiente; **no se cuentan como rotas**, son
  redondeo.
- **No se suman pesos con dólares en ninguna parte**: cada regla compara campos de la misma
  orden, que siempre están en la misma moneda.
- La regla E es la más poblada y la más clara: **una orden con facturas y con facturado en
  cero es, sin excepción, una factura sin `sale_line_ids`**.
