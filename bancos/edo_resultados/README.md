# Estado de resultados 2026 v0 (issue #348)

Estado de resultados **preliminar** de Servicios FTS SA de CV (`company_id = 1`) construido desde la
base bancaria propia (#331) y Odoo en **solo lectura**. Enero a agosto de 2026 con banco, mes por
mes y acumulado; septiembre sólo ventas ("sin banco hasta el 1-oct"). **Todo sin IVA.**

Este repo es público: aquí no hay montos, cuentas ni contrapartes. Los números viven sólo en el HTML
y los CSV privados de OneDrive (`FTS Finanzas - Bancos/02 Base maestra de transacciones/Estados de resultados/`).

## Piezas

| pieza | qué es |
|---|---|
| `calcular.js` | el motor. Determinista (centavos enteros, JSON canónico, SHA-256 en JS puro). Corre igual en node y en un Code node de n8n |
| `db/migrations/bancos/bancos_0007_reglas_edo_resultados.sql` | tabla editable `bancos.reglas_edo_resultados`: a qué renglón va cada egreso. Sólo SELECT para `bancos_lector` |
| workflow n8n `TMP · fts-bancos ER 2026 v0` | inactivo, se ejecuta por MCP. Lee las vistas `v_*` con `SET LOCAL ROLE bancos_lector` y Odoo con el nodo Odoo (lectura); baja `calcular.js` **fijado por commit** y lo ejecuta; si `publicar=true` sube el HTML y los CSV a OneDrive por Graph; si `enviar_correo=true` manda el correo **sólo** a Esteban desde sales@ |

Disparo (webhook del TMP, por MCP): `{ "sha": "<commit de calcular.js>", "publicar": bool, "enviar_correo": bool }`.

## Reglas (Vista A)

1. **Ventas** = `sale.order` confirmadas (`state = 'sale'`), `amount_untaxed`, mes de `date_order` en hora de Monterrey. USD al tipo de cambio de Odoo de la fecha (el FIX de Banxico no es alcanzable: supuesto S1). Se excluyen órdenes de prueba (cliente `ZZ-PRUEBA`).
2. **Costo de ventas** = todo egreso que no sea administrativo literal.
3. **Jeeves** = consumos de la tarjeta (diario 61, `account.bank.statement.line` con monto negativo, sin `[FONDEO]`), no los fondeos desde BBVA. Devoluciones de comercio restan dentro del renglón.
4. **Payana** = pagos del diario 74 cotejados contra su factura (`BILL…`): con analítica de proyecto (plan 1/18) → costo; proveedor administrativo → gastos; lo demás → costo "por clasificar", con su lista.

Ajustes: **A** traspasos, fondeos, impuestos y cuotas, financiamiento y devoluciones fuera del resultado (renglones informativos); **B** nómina = fondeos General→Nómina (+ pagos directos de nómina desde la General), renglón propio; **C** IVA por factura de proveedor (pago en Odoo del mismo monto o factura con el mismo total, ±15 días), si no hay, bruto y "sin CFDI"; **D** administrativo literal en la tabla editable; **E** Conmet (SO11771) en renglones propios, Vista B sin Conmet; **F** meses con estado faltante se marcan INCOMPLETO, no se estiman.

## Verificaciones que trae el resultado

- **Puente** salidas del banco → exclusiones → egresos que entran → + Jeeves + Payana − IVA = costo + gastos, con la diferencia mes por mes (debe ser 0).
- **Movimientos = resumen del PDF**: los cargos leídos de cada estado suman el total de cargos del resumen (V1).
- **Huella de resultados** (SHA-256 de vistas A, B, puente y cuadre) y **huella de insumos**: dos corridas con los mismos insumos dan la misma huella; la corrida local con node y la de n8n también.
