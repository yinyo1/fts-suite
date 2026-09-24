# Consultas reproducibles de la sesión 0

Cada número del informe sale de una de estas consultas. **Todas son de sólo lectura**
(`search_read`, `read_group`, `fields_get`). Ninguna escribe.

- [`odoo-aristas.json`](odoo-aristas.json) — una entrada por arista: modelo, dominio, campo y
  el resultado medido el 2026-09-24. Se re-corre con el MCP de Odoo (`odoo_agrupar` /
  `odoo_query`) o por XML-RPC.
- [`postgres-almacen.sql`](postgres-almacen.sql) — el SQL que corrió el TMP
  `OTPD4IG2gZj5AxEs` contra el esquema `comercial`.
- [`reglas-cuadre-facturacion.md`](reglas-cuadre-facturacion.md) — las seis reglas A–F del
  §3.2, con su definición exacta y las órdenes que dispara cada una.

## Cómo volver a medir sin equivocarse

1. **Siempre `company_id`.** El nombre de un documento no es único entre compañías: las diez
   facturas que se revisaron devolvieron dos registros cada una.
2. **Nunca sumes pesos con dólares.** `odoo_agrupar` obliga a meter `currency_id` en el
   `groupby` cuando hay dinero; hazlo.
3. **`amount_invoiced`, `amount_to_invoice` y `has_invalid_analytics` NO se pueden filtrar.**
   Están calculados y sin almacenar: un dominio que los use revienta con un error del ORM.
   Hay que leerlos y comparar fuera. `analytic_coverage` sí es filtrable.
4. **Controla el instrumento.** Antes de creerle a un conteo de "rotas", corre el mismo
   dominio invertido y comprueba que los dos suman el universo. Un dominio mal escrito
   devuelve cero y se ve igual que "todo bien".
