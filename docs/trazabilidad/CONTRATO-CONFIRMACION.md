# Borrador del contrato de datos · módulo de Confirmación

**Borrador de sesión 0. No se construyó nada.** Sigue el patrón que ya usan
`comercial/orden-crear-v2` y `comercial/confirmar`: el cuerpo nunca decide, el actor sale del
token, y lo que vale es el documento congelado del machote.

---

## 1 · Qué recibe

```jsonc
POST /webhook/comercial/confirmacion
{
  "token": "<JWT de auth/suite-login, scope comercial:confirmar>",
  "modo":  "validar" | "confirmar",
  "folio": 42,                    // el folio del machote. NO el uuid, NO el id_local
  "version": 17,                  // la versión EXACTA que el humano está mirando
  "idempotencia": "<uuid del intento>",

  // Lo que NO está en el machote y el humano captura en la pantalla:
  "po_cliente": {
    "numero": "<numero de la PO del cliente>",
    "archivo_b64": "<...>",       // se valida AQUÍ, no después
    "nombre_archivo": "PO.pdf"
  },
  "contacto": {
    "nombre": "...", "telefono": "...", "correo": "...",
    "finanzas": { "nombre": "...", "telefono": "...", "correo": "..." }  // opcional
  },
  "anticipo": { "aplica": true, "porcentaje": 0.30 },
  "impuesto": { "lleva_iva": true, "tasa": 0.16 } // o {"lleva_iva": false} -> leyenda obligatoria
}
```

**Por qué `folio` + `version` y no el documento entero:** si el cliente manda el documento,
el cliente decide. Mandando folio y versión, el servidor lee de Postgres lo que de verdad
está guardado, y la versión es la prueba de que el humano confirmó **eso** y no lo que
alguien editó tres segundos después. Es el mismo candado de concurrencia de la migración
`003`.

---

## 2 · Qué valida, candado por candado

El orden importa: **primero lo que se puede rechazar sin tocar nada**.

| # | candado | de dónde sale el dato | rechaza con |
|---|---|---|---|
| 1 | el machote existe, está vivo y la versión es la última | Postgres | `VERSION_VIEJA` |
| 2 | quien confirma tiene el scope | token | `SIN_PERMISO` |
| 3 | el machote no tiene reglas **duras** pendientes | `reglas.js`, las 16 duras | `REGLAS_DURAS` + la lista |
| 4 | **cliente del catálogo** (no tecleado a mano) | `machote.odoo_partner_id` | `SIN_CLIENTE` |
| 5 | **contacto con teléfono y correo** | cuerpo | `SIN_CONTACTO` |
| 6 | **días de pago** presentes | `machote.pago_dias` | `SIN_DIAS_PAGO` |
| 7 | **decisión de impuesto** tomada | cuerpo | `SIN_DECISION_IVA` |
| 8 | si no lleva IVA, la leyenda va en el documento | servidor, no el cliente | — |
| 9 | **viáticos resueltos si es foráneo** | ya lo evalúa `reglas.js` | `VIAJE_SIN_RESOLVER` |
| 10 | **PO del cliente: número presente** | cuerpo | `SIN_NUMERO_PO` |
| 11 | **PO del cliente: archivo presente y NO vacío** | cuerpo, midiendo bytes y páginas | `PO_EN_BLANCO` |
| 12 | **el monto de la PO cuadra al centavo** con el machote | cuerpo vs Postgres | `PO_NO_CUADRA` + los dos importes |
| 13 | **anticipo obligatorio arriba del umbral** | `machote` + umbral configurable | `SIN_ANTICIPO` |
| 14 | la orden de Odoo existe y **sigue cuadrando** con el machote | Odoo, releído | `ORDEN_NO_CUADRA` |
| 15 | la orden no está ya confirmada | Odoo | `YA_CONFIRMADA` (idempotente, responde OK) |

**El 11 es el que no se puede posponer.** `ir.attachment` no es legible desde el MCP, así que
**un PDF en blanco sólo se puede detectar en el momento en que se sube.** Si se deja para un
watchdog posterior, no hay forma de saberlo.

**El 12 necesita una decisión de negocio:** ¿"al centavo" contra el subtotal o contra el total
con impuestos? La PO del cliente suele traer el total. Va en las preguntas.

---

## 3 · Qué crea en Odoo, en qué orden y por qué

El orden es el de la sesión 2 de #244, con **lo irreversible al final**:

| # | escritura | reversible | si falla |
|---|---|---|---|
| 1 | reservar el intento en `comercial.confirmacion` | sí (es nuestra base) | se aborta, nada tocado |
| 2 | `res.partner` del contacto si no existe | sí | se aborta |
| 3 | **cuenta analítica** del plan correcto (1 en MX, 18 en EUA, resuelto en vivo) | sí (archivar) | se aborta |
| 4 | **proyecto** ligado a la analítica **y a la orden por los DOS caminos** | sí (archivar) | se borra la analítica huérfana |
| 5 | `budget.analytic` + `budget.line` **con los montos reales del machote** | sí | se archiva lo anterior |
| 6 | escribir en la orden: PO, archivo, términos, contacto, proyecto, analítica | sí | se archiva lo anterior |
| 7 | **factura de anticipo por el asistente NATIVO** si aplica | sí (cancelar) | se archiva lo anterior |
| 8 | **`action_confirm` de la orden** | **NO** | nada que deshacer: es el último |
| 9 | marcar en Postgres `confirmada_at`, `confirmada_por` y el resultado | — | queda el renglón «a medias» para el watchdog |

**Tres diferencias contra lo que hay hoy, y son las que reparan el grafo:**

1. **El paso 4 escribe las DOS aristas de proyecto** (`sale.order.project_id` **y**
   `x_studio_project_id_created_1`, más `project.sale_order_id`). Hoy el radar sólo escribe
   la de Studio, y por eso hay dos verdades parciales.
2. **El paso 5 escribe montos, no `−1`.** El machote los tiene; el esqueleto existe porque el
   radar no los tenía a la mano.
3. **El paso 7 usa el asistente nativo de anticipos.** Es lo que hace que la factura nazca
   con `sale_line_ids` y que `amount_invoiced` quede bien **para siempre**, sin watchdog.

---

## 4 · Qué devuelve

```jsonc
{
  "ok": true,
  "folio": 42,
  "orden": "SO11900",
  "proyecto_id": 2360,
  "analitica_id": 3102,
  "budget_id": 392,
  "anticipo_factura": "INV2030",       // o null
  "pasos": [ {"n":1,"ok":true}, ... ], // los 9, con su resultado
  "a_medias": false
}
```

Y ante el fallo del paso N: `{"ok": false, "fallo_en": N, "deshecho": [...], "a_medias": bool}`.
**Nunca un 200 vacío**: el 200 no prueba la escritura (CLAUDE.md §8), así que cada paso lleva
su read-back.

---

## 5 · El hilo, y el único campo Studio nuevo

La analítica es el hilo (ver `INFORME.md` §5.2). Para cerrar el círculo hacia arriba hace
falta **un** campo:

```
account.analytic.account.x_studio_machote_folio   (char)
```

Con eso, desde cualquier nodo de abajo —un bill, una PO, un renglón de nómina— se llega a la
analítica, y de la analítica al machote, y del machote a la oportunidad. **Es la excepción
justificada de la regla de no crear campos Studio**, del mismo tipo que la que ya se aceptó
para `crm.lead.x_studio_machote_folio` (que, por cierto, sigue vacío en todos los leads).
