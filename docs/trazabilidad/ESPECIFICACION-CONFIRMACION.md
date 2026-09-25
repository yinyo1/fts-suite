# Estación 3 · especificación construible de la Confirmación

**Issue:** [#294](https://github.com/yinyo1/fts-suite/issues/294) · investigación
[#291](https://github.com/yinyo1/fts-suite/issues/291) · informes en el PR
[#290](https://github.com/yinyo1/fts-suite/pull/290) (abierto) · machote
[#246](https://github.com/yinyo1/fts-suite/issues/246), hoy en **V1.43**

**Fecha:** 2026-09-25, sesión de **especificación**. **Nada de esto está construido**, salvo
los tres prototipos de `comercial/prototipos/e3/`, que son HTML con datos inventados y **no
tocan producción**. Sólo lectura en Odoo, Postgres y n8n: cero escrituras, cero correos, cero
workflows tocados.

> **Este repositorio es PÚBLICO.** Aquí no hay nombres de persona, de cliente ni de proveedor,
> ni importes de operaciones reales, ni RFC, ni contactos. Todo son ids de Odoo, códigos de
> cuenta, números de documento, conteos y porcentajes.

Esta especificación convierte **las nueve respuestas de Esteban** al §8 del plan maestro en
algo construible, y **destapa lo que esas respuestas abrieron y no estaba en el plan**: el
flujo de aprobación de beneficiario ([`APROBACION-BENEFICIARIO.md`](APROBACION-BENEFICIARIO.md))
y la detección de IVA en la PO ([`IVA-EN-LA-PO.md`](IVA-EN-LA-PO.md)).

Documentos hermanos de esta sesión:
[`APROBACION-BENEFICIARIO.md`](APROBACION-BENEFICIARIO.md) ·
[`IVA-EN-LA-PO.md`](IVA-EN-LA-PO.md) ·
[`COMISIONES-ESCENARIOS.md`](COMISIONES-ESCENARIOS.md) ·
[`PLAN-CONSTRUCCION-V2.md`](PLAN-CONSTRUCCION-V2.md) ·
[`consultas/sesion-4-dominios.md`](consultas/sesion-4-dominios.md)

---

## 0 · Las siete líneas

1. **La respuesta 6 y la respuesta 2 CHOCAN, y hay que decidirlo antes de construir.** Facturar
   poniendo el unitario de cada renglón al 50 % y usar el asistente nativo de anticipos son
   **dos mecanismos distintos que no pueden convivir en la misma orden**: el primero produce
   una factura con N renglones espejo, el segundo **un solo renglón** de monto. Medido: las
   **8** líneas de anticipo nativo de toda la instancia viven en **2** órdenes, y **7 de las 8
   están canceladas**. (§5)
2. **El umbral de $200,000 se recomienda por moneda y convertido, no literal.** Medido sobre
   2025+: en pesos, **38 de 135** órdenes lo cruzan y cargan el **95.4 %** del dinero. En
   dólares, un umbral literal de *200,000 USD* atraparía **1 de 45** órdenes; **12,000 USD**
   —el equivalente redondeado— atrapa **14 de 45** y el **88.2 %** del dinero. (§6)
3. **La detección de IVA en la PO no se puede construir hacia atrás**: no existe ningún campo
   en Odoo con el importe de la PO del cliente. Sólo el número (`char`) y el archivo
   (`binary`). La heurística se alimenta de un dato que **nunca se ha capturado**. (§D)
4. **El catálogo de comisiones no tiene llave legible por máquina.** Las 32 cuentas del plan
   20 tienen **`code` vacío y `partner_id` vacío, las 32**; el «3.1», el «5.2.1» viven dentro
   del **nombre**. Un selector que guarde el id funciona; uno que case por nombre repite la
   enfermedad que se quiere curar. (§7 y `COMISIONES-ESCENARIOS.md`)
5. **La rentabilidad de cuatro números hoy no es legible, y ya se puede decir cuánto:** de los
   **13,731** renglones analíticos con proyecto de la cía 1 desde 2025, **9,205 (67.0 %) son
   mecánica de impuesto** —IVA acreditable, IVA pendiente y base imponible—. Sólo **4,526
   (33.0 %)** son costo o ingreso de verdad. **Dos de cada tres**, exactamente como lo dijo
   Esteban. (§1)
6. **El candado de «facturas que no cuadran» casi nunca dispara en el camino normal**, y hay
   que decirlo: una orden recién creada por la suite está en borrador y **no tiene facturas**.
   Las **38 de 179** órdenes que rompen alguna regla no se van a volver a confirmar. El candado
   sirve en tres casos concretos y, sobre todo, **como vigilante permanente**. (§B-4)
7. **El flujo de aprobación de beneficiario es la pieza más grande que abrieron las
   respuestas**, y su regla de seguridad cabe en una frase: **la liga aprueba un renglón de
   catálogo, no un pago.** Ningún peso se mueve sin un acto humano posterior y separado.
   ([`APROBACION-BENEFICIARIO.md`](APROBACION-BENEFICIARIO.md))

---

## 1 · La respuesta 1, construida: la rentabilidad son CUATRO números

**Decisión de Esteban, adoptada:** el anticipo lleva la analítica del proyecto. *Si se facturó
y se cobró, ese dinero es del proyecto y ahí debe verse.* La distorsión de «ingreso sin avance»
se resuelve **leyendo dos números en vez de uno**, no escondiendo el dinero.

### 1.1 · Los cuatro números, con su origen exacto

| # | número | de dónde sale | modelo · dominio · campo |
|---|---|---|---|
| **1** | **Vendido** | la orden confirmada | `sale.order` · `state = 'sale'` · **`amount_untaxed`** |
| **2** | **Costo planeado** | el machote, congelado al confirmar | `comercial.handoff.presupuesto` (jsonb) → suma de los rubros de costo |
| **3** | **Facturado** (anticipo incluido) | facturas emitidas del proyecto | `account.move` · `move_type in ('out_invoice','out_refund')`, `state='posted'` · **`amount_untaxed_signed`** |
| **4** | **Costo ejercido** | el libro analítico del proyecto | `account.analytic.line` · `account_id = <la analítica>` · **`amount`**, filtrando la mecánica de impuesto (§1.3) |

**Todo sobre el subtotal**, en las cuatro, por la respuesta 6. Y **nunca se suman pesos con
dólares**: los cuatro números se leen por moneda, y la conversión —si se pide— se hace al
final y con la tasa dicha.

### 1.2 · Cómo se leen, que es lo que Esteban pidió

- **A media obra** se lee el desfase entre **facturado (3)** y **ejercido (4)**. Ese par
  responde «¿estoy cobrando al ritmo que estoy gastando?», que es la pregunta de caja, y **no
  se contamina** con el anticipo porque el anticipo está *dentro* del 3 a propósito.
- **Al cierre** hay margen real: **facturado (3) − ejercido (4)**.
- Y **la diferencia contra el planeado** —(3−4) contra (1−2)— es la que dice **si el machote
  cotiza bien**. Es el número que hoy nadie puede ver, y el que justifica toda la cadena.

⚠️ **Los cuatro se muestran SIEMPRE los cuatro, incluso cuando uno vale cero.** Un tablero que
esconde el número faltante convierte «no hay dato» en «vale cero», que es el modo de fallo que
este proyecto persigue en todas partes. El prototipo
[`rentabilidad-4-numeros.html`](../../comercial/prototipos/e3/rentabilidad-4-numeros.html)
lo enseña con su leyenda.

### 1.3 · La advertencia, que va impresa en el reporte

**Hoy este reporte no es legible, y el reporte tiene que decirlo él mismo.** Dos razones,
medidas:

**(a) Dos de cada tres renglones analíticos son mecánica de impuesto.**
`account.analytic.line`, cía 1, `account_id != false`, `date >= 2025-01-01`, agrupado por
`general_account_id`:

| cuenta contable | renglones | % |
|---|---|---|
| `899.01.99` Base Imponible de Impuestos | 4,775 | 34.8 % |
| `601.84.01` Otros gastos generales | 3,233 | 23.5 % |
| `119.01.01` IVA pendiente de pago | 2,845 | 20.7 % |
| `118.01.01` IVA acreditable pagado | 1,585 | 11.5 % |
| `101000` Nómina | 592 | 4.3 % |
| resto (12 cuentas) + sin cuenta | 701 | 5.1 % |
| **total** | **13,731** | |
| **mecánica de impuesto** (899.01.99 + 119.01.01 + 118.01.01) | **9,205** | **67.0 %** |
| **costo o ingreso de verdad** | **4,526** | **33.0 %** |

**Consecuencia para el diseño, y no es cosmética:** el número 4 **no puede ser un `SUM(amount)`
del libro analítico**. Tiene que excluir la mecánica de impuesto por cuenta contable, con la
lista de cuentas **escrita y visible**, no adivinada. Un reporte que sume todo muestra un
costo ejercido inflado por dos tercios de renglones que no son costo.

**(b) La mano de obra subcontratada no llega al proyecto.** Medido en el #291 (R4 del plan
maestro): **55 %** del costo en pesos queda en «sólo rubro», sin eje de proyecto, y **18
proveedores concentran el 88 %** de ese costo. Mientras eso siga así, el número 4 está
**incompleto por abajo** y el margen sale **mejor de lo que es**. La reparación es un *default*
de analítica por proveedor (≈18 filas, trabajo de Gerardo), no código.

📌 **Regla de la pantalla:** mientras (a) o (b) sigan vivos, el reporte pinta una **banda de
advertencia** que dice cuál de los dos está pendiente y qué porcentaje afecta. Cuando se
reparen, la banda desaparece sola porque su condición se mide, no se configura.

---

## 2 · El contrato de datos, campo por campo

Extiende —no sustituye— el borrador de
[`CONTRATO-CONFIRMACION.md`](https://github.com/yinyo1/fts-suite/pull/290/files) del PR #290.
Lo que cambia: las columnas **«de dónde sale»** y **«reversible»**, y los campos que abrieron
las respuestas 5, 6 y 7.

### 2.1 · Lo que la petición recibe

```jsonc
POST /webhook/comercial/confirmacion
{
  "token":        "<JWT de auth/suite-login, scope comercial:confirmar>",
  "modo":         "validar" | "confirmar",
  "folio":        42,                  // el folio del machote, NO el uuid ni el id_local
  "version":      17,                  // la versión EXACTA que el humano está mirando
  "idempotencia": "<uuid del intento>",

  "po_cliente": {
    "numero":         "<numero de la PO>",
    "archivo_b64":    "<...>",         // se valida AQUÍ, no después
    "nombre_archivo": "PO.pdf",
    "importe":        1160000.00       // ← NUEVO (respuesta 5). El total que dice la PO.
  },
  "contacto": {
    "nombre": "...", "telefono": "...", "correo": "...",
    "finanzas": { "nombre": "...", "telefono": "...", "correo": "..." }   // opcional
  },
  "anticipo": {
    "aplica":     true,
    "porcentaje": 0.30,                // sobre el SUBTOTAL (respuesta 6)
    "mecanismo":  "asistente_nativo"   // ← NUEVO. Ver §5: hoy sólo hay un valor válido.
  },
  "impuesto":  { "lleva_iva": true, "tasa": 0.16 },
  "obra":      { "inicio": "2026-10-06", "fin": "2026-12-15", "responsable_id": 112 },
  "entregables": "<texto, borrador del machote, editable>"
}
```

**Por qué `folio` + `version` y no el documento entero:** si el cliente manda el documento, el
cliente decide. Mandando folio y versión, el servidor lee de Postgres lo que de verdad está
guardado, y la versión es la prueba de que el humano confirmó **eso** y no lo que alguien
editó tres segundos después.

**Tres campos nuevos y por qué:**
- `po_cliente.importe` — lo pide la respuesta 5. **No se le pregunta a la persona si su PO trae
  IVA**: se le pide un número que está leyendo de todos modos, y el código deduce la convención
  ([`IVA-EN-LA-PO.md`](IVA-EN-LA-PO.md)).
- `anticipo.mecanismo` — hace explícito lo que hoy es implícito, para que el choque de §5 no se
  resuelva por accidente.
- `obra.responsable_id` — un **id de `hr.employee`**, no un texto. Un nombre sin id es la misma
  enfermedad de las comisiones.

### 2.2 · Campo por campo: origen, captura, destino

**Leyenda de «reversible»:** ✅ se deshace archivando o reescribiendo · ⚠️ se deshace pero deja
rastro · ❌ no se deshace.

| # | campo | ¿de dónde sale? | ¿se captura a mano? | ¿se escribe en Odoo? | rev. |
|---|---|---|---|---|---|
| 1 | cliente | `machote.odoo_partner_id` | no — **candado 4** | `sale.order.partner_id` | ✅ |
| 2 | oportunidad | `machote.odoo_lead_id` | no (se elige en el machote) | `sale.order.opportunity_id` | ✅ |
| 3 | moneda | machote | no | ya está en la orden | ✅ |
| 4 | subtotal / total | motor del machote | no | se **compara**, no se escribe | — |
| 5 | términos de pago | `machote.pago_termino_id` | ya capturado en el machote | `sale.order.payment_term_id` | ✅ |
| 6 | días de pago | `machote.pago_dias` | ídem | nota del documento | ✅ |
| 7 | incoterm | `machote.incoterm_code` | ídem | `sale.order.incoterm` | ✅ |
| 8 | tiempo de entrega | `machote.entrega_texto` / `entrega_fecha` | ídem | `commitment_date` + nota | ✅ |
| 9 | vigencia | `machote.vigencia_dias` / `vigencia_hasta` | ídem | `validity_date` | ✅ |
| 10 | hitos de pago | `machote.pago_hitos` (jsonb) | opcional | nota del documento | ✅ |
| 11 | **PO: número** | — | **sí** | `x_studio_purchase_order_number` | ✅ |
| 12 | **PO: archivo** | — | **sí** | `x_studio_purchase_order_file` (+ `_filename`) | ⚠️ |
| 13 | **PO: importe** | — | **sí** (nuevo) | **no se escribe en Odoo**: va a Postgres | ✅ |
| 14 | contacto (nombre/tel/correo) | — | **sí** | `res.partner` hijo del cliente | ✅ |
| 15 | contacto de finanzas | — | opcional | `res.partner` hijo | ✅ |
| 16 | decisión de IVA + tasa | — | **sí** (o derivada, §D) | impuestos de los renglones | ✅ |
| 17 | leyenda de no-IVA | **el servidor**, nunca el cliente | no | nota del documento | ✅ |
| 18 | fechas de obra | propuestas por la pantalla | **sí, confirmadas** | `project.date_start` / `date` | ✅ |
| 19 | responsable de obra | selector `hr.employee` | **sí** | `project.user_id` + `handoff.responsable_id` | ✅ |
| 20 | entregables | **borrador** del machote | **sí, editable** | `handoff.entregables` | ✅ |
| 21 | presupuesto · Ingreso | motor (`amount_untaxed`) | no | `budget.line` rubro `1171` | ✅ |
| 22 | presupuesto · Mano de Obra | motor | no | `budget.line` rubro `1177` | ✅ |
| 23 | presupuesto · Materiales | motor | no | `budget.line` rubro `1176` | ✅ |
| 24 | **presupuesto · Viajes** | motor (lo separa a propósito) | no | `budget.line` rubro **`3097`** MX / **`3098`** USA | ✅ |
| 25 | **presupuesto · comisiones por beneficiario** | `machote.comisiones` × bolsa | no | `budget.line`, **un renglón por beneficiario** | ✅ |
| 26 | anticipo: aplica / % | machote + umbral | **sí, confirmado** | factura de anticipo | ⚠️ |
| 27 | analítica del proyecto | se crea | no | `account.analytic.account` plan **1** (MX) / **18** (USA) | ✅ |
| 28 | proyecto | se crea | no | `project.project` | ✅ |
| 29 | **folio del machote en la analítica** | `machote.folio` | no | `account.analytic.account.x_studio_machote_folio` ⚠️ campo Studio **nuevo** | ✅ |

**El 24 y el 25 son los que hoy no existen** y son la razón de que el presupuesto de Odoo mienta:
el motor separa el viaje **a propósito** —«para que la línea Materiales no diga que se compraron
materiales por 40 mil pesos»— y ese rubro, creado el 2026-07-09, **no ha recibido una sola
línea**.

**El 29 es la única excepción a la regla de no crear campos Studio**, y se justifica igual que
la que ya se aceptó para `crm.lead.x_studio_machote_folio`: sin ella, desde un bill o un
renglón de nómina no hay camino de vuelta al machote.

### 2.3 · Las ocho escrituras, con su orden y su reversa

El principio no cambia: **lo irreversible al final**. Lo que cambia es que ahora son **ocho**,
porque la comisión entra como paso propio.

| # | escritura | rev. | si falla aquí |
|---|---|---|---|
| **0** | *(Postgres)* reservar el intento con su `idempotencia` | ✅ | aborta; **nada de Odoo tocado** |
| **1** | `res.partner` del contacto si no existe | ✅ archivar | aborta |
| **2** | **cuenta analítica** del plan correcto (1 MX / 18 USA, resuelto en vivo) | ✅ archivar | aborta |
| **3** | **proyecto**, ligado a la analítica **y a la orden por los DOS caminos** | ✅ archivar | se archiva la analítica huérfana |
| **4** | `budget.analytic` + `budget.line` **con montos reales**, con viajes | ✅ archivar | se archivan proyecto y analítica |
| **5** | **`budget.line` de comisión, uno por beneficiario** | ✅ archivar | se archiva lo anterior |
| **6** | escribir en la orden: PO + archivo, términos, incoterm, fecha, contacto, proyecto, analítica | ✅ reescribir | se archiva lo anterior; **la orden queda sin confirmar**, que es el estado seguro |
| **7** | **factura de anticipo por el asistente NATIVO**, si aplica | ⚠️ cancelar | se archiva lo anterior |
| **8** | **`action_confirm` de la orden** | ❌ | es el último: **no hay nada después que pueda fallar** |
| **9** | *(Postgres)* el resultado de los pasos | — | queda «a medias» y **lo ve el vigilante** |

**La regla, en una frase:** ningún paso irreversible corre antes que uno que pueda fallar, así
que una confirmación a medias **nunca deja una orden confirmada sin su proyecto**.

⚠️ **Lo irreversible que NO es el paso 8: el archivo de la PO (paso 6).** Crea un
`ir.attachment` que el MCP **no puede leer ni borrar**. Por eso se valida **antes** de
escribirlo (candado 11) y por eso vive después de todo lo que puede fallar por datos.

⚠️ **Cada paso lleva su read-back.** Un `create` que devuelve id no prueba que los campos se
guardaron, y **un many2one escrito como texto se anula en silencio** — va como número.

---

## 3 · Los candados, uno por uno

Formato: **qué mide · con qué dato · qué ve la persona · a quién se avisa**. Los que abrieron
las respuestas 4, 5, 6 y 7 van marcados **NUEVO**.

### 3.1 · Los que rechazan sin tocar nada

| # | candado | código | qué ve la persona |
|---|---|---|---|
| 1 | el machote existe, vive, y la versión es la última | `VERSION_VIEJA` | «Alguien guardó una versión más nueva mientras mirabas ésta. Vuelve a abrirla; **no se confirmó nada**.» |
| 2 | quien confirma tiene el scope | `SIN_PERMISO` | «Tu cuenta no tiene permiso para confirmar. Pídeselo a Esteban.» |
| 3 | sin reglas **duras** pendientes | `REGLAS_DURAS` | la lista literal de las reglas, con liga a la sección de cada una |
| 4 | **cliente del catálogo**, no tecleado | `SIN_CLIENTE` | «Esta cotización tiene el cliente escrito a mano. Elígelo del catálogo de Odoo para poder crear la orden.» + selector |
| 5 | contacto con teléfono y correo | `SIN_CONTACTO` | «Falta el contacto del cliente con teléfono y correo. Es a quien se le manda la factura.» |
| 6 | días de pago | `SIN_DIAS_PAGO` | «Falta en cuántos días paga el cliente.» |
| 7 | decisión de impuesto tomada | `SIN_DECISION_IVA` | «Di si esta orden lleva IVA. Si no lleva, el sistema escribe la leyenda.» |
| 8 | viáticos resueltos si es foráneo | `VIAJE_SIN_RESOLVER` | ya construido (V1.26) |
| 9 | **oportunidad ligada** — respuesta 3 | `SIN_OPORTUNIDAD` | ver §4 |
| 10 | PO: número presente | `SIN_NUMERO_PO` | «Escribe el número de la orden de compra del cliente.» |
| 11 | PO: archivo presente **y no vacío** | `PO_EN_BLANCO` | «El archivo que subiste tiene N páginas y ningún texto. ¿Es el correcto?» |
| 12 | **el importe de la PO cuadra** — respuesta 5 | `PO_NO_CUADRA` | ver [`IVA-EN-LA-PO.md`](IVA-EN-LA-PO.md) |
| 13 | **anticipo obligatorio arriba del umbral** — respuesta 6 | `SIN_ANTICIPO` | ver §6 |
| 14 | **beneficiario de comisión aprobado** — respuesta 7 | `BENEFICIARIO_SIN_APROBAR` | ver [`APROBACION-BENEFICIARIO.md`](APROBACION-BENEFICIARIO.md) |
| 15 | **las facturas de la orden cuadran** — respuesta 4 | `FACTURAS_NO_CUADRAN` | ver §3.2 |
| 16 | la orden de Odoo existe y sigue cuadrando | `ORDEN_NO_CUADRA` | los dos importes, lado a lado |
| 17 | la orden no está ya confirmada | `YA_CONFIRMADA` | **idempotente: responde OK** y enseña lo que ya se creó |

📌 **Regla transversal de redacción, y va en la especificación a propósito:** ningún mensaje
dice sólo qué falta. **Dice qué falta, por qué importa y dónde se arregla.** Un candado que
dice «SIN_CONTACTO» y nada más es un candado que la gente aprende a rodear.

📌 **Y ninguno dice «error».** Un candado que salta está haciendo su trabajo; la pantalla lo
pinta como una **lista de pendientes**, no como una falla. Es lo que separa una herramienta que
se usa de una que se esquiva.

### 3.2 · Candado 15 · las facturas que no cuadran (respuesta 4) · **NUEVO**

**Decisión de Esteban: bloquea.** Y el diseño tiene que decir dos cosas que la respuesta no
podía saber.

**(a) En el camino normal este candado casi nunca dispara, y eso no lo hace inútil.** Una orden
que la suite acaba de crear está en **borrador y sin facturas**: las seis reglas pasan solas.
Dispara en tres casos reales:

1. una orden **reabierta** a borrador después de haber sido facturada;
2. una orden creada **en Odoo, fuera de la suite**, que alguien trae a la pantalla;
3. una **orden hija** de adicionales sobre un proyecto que ya factura.

**(b) Donde de verdad vive el problema es en las 38 órdenes que ya están así**, y ésas **nadie
las va a volver a confirmar**. Por eso el candado se construye **dos veces con una sola
definición de las reglas**: como candado en la Confirmación, y como **vigilante** que las
recorre y las publica. Si las reglas viven en dos sitios, en un mes dicen cosas distintas.

**Las seis reglas** (medidas sobre las 179 órdenes confirmadas de las cías 1 y 6 desde
2025-01-01; `amount_invoiced` y `amount_to_invoice` son **calculados y sin almacenar**, así que
se **leen y se comparan fuera**, no se filtran):

| regla | definición | órdenes |
|---|---|---|
| **A** | `amount_invoiced > amount_total + 0.01` | 8 |
| **B** | `amount_to_invoice < −0.01` | 1 |
| **C** | `invoiced > 0` **y** `to_invoice > 0` **y** su suma `> total + 0.01` | 11 |
| **D** | `invoice_status == 'invoiced'` **y** `invoiced == 0` **y** `total > 0` | 2 |
| **E** | `invoice_count > 0` **y** `invoiced == 0` **y** `total > 0` | **17** |
| **F** | `invoice_count > 0` **y** `invoiced + to_invoice < total − 0.01` | 2 |
| | **órdenes distintas** | **38 de 179 = 21.2 %** |

**La regla E es la más poblada y la que explica el resto:** una orden con facturas y con
facturado en cero es, sin excepción, **una factura sin `sale_line_ids`** — una factura hecha a
mano en vez de salir de la orden. **Es exactamente lo que el asistente nativo de anticipos
evita**, y por eso las respuestas 2 y 4 son la misma conversación.

**Lo que ve quien confirma:**

> **Esta orden no se puede confirmar todavía: sus facturas no cuadran.**
> La orden dice **\<total\>** y las facturas suman **\<facturado\>**, con **\<pendiente\>** por
> facturar. La suma da **\<diferencia\>** de más.
> Esto **no lo puedes arreglar tú desde aquí**: lo arregla Contabilidad sobre la factura.
> **Ya se le avisó a \<área\>** con el número de esta orden. Te escribimos cuando quede.
> `[ Ver el detalle ]  [ Avisar otra vez ]  [ Volver a la lista ]`

**Y a quién se avisa, que es la mitad de la respuesta 4.** Quien confirma es Comercial; quien
puede arreglar una factura sin `sale_line_ids` es Contabilidad. El aviso:
- se manda **una vez por orden y por día** (no en cada intento: un candado que genera diez
  correos se convierte en ruido y se filtra);
- lleva **el número de orden, la regla que rompió y los tres importes**;
- deja **un renglón en Postgres** con quién lo disparó y cuándo, para que «ya avisé» sea
  comprobable;
- y **se apaga solo** cuando la regla deja de romperse, sin que nadie tenga que cerrarlo.

⚠️ **Un aviso que nadie puede atender es peor que ninguno.** Si el destinatario no está
configurado, el candado **sigue bloqueando** pero el mensaje dice *«no hay a quién avisar
configurado — habla con Esteban»*, en vez de fingir que mandó un correo. Es el mismo criterio
de §12b: no juntar «avisado» y «no había a quién avisar» en un solo estado.

---

## 4 · La respuesta 3, construida: la oportunidad obligatoria **con salida**

**Decisión de Esteban:** obligatoria, con salida. Si no existe, la pantalla **sugiere
candidatas** y, si ninguna sirve, **la crea ahí mismo**. Y **preferentemente la liga nace al
crear el machote**, no al confirmar.

### 4.1 · Las cardinalidades que Esteban precisó, y lo que obligan

| relación | cardinalidad | consecuencia de diseño |
|---|---|---|
| tarjeta de CRM → órdenes | **1 : N** | la oportunidad **no se «consume»** al ligar una orden. Nada de marcarla como usada |
| tarjeta de CRM → machotes | **1 : N** | dos machotes pueden apuntar al mismo lead: **no hay índice único** por `odoo_lead_id` |
| orden → facturas | **1 : N** | el cuadre suma facturas, nunca busca «la» factura |

⚠️ **Esto contradice una tentación natural del diseño** —«una oportunidad, una orden»— y hay
que dejarlo escrito, porque el índice único que parecería correcto **rompería el caso normal de
FTS**: un cliente que pide tres cosas sobre la misma oportunidad.

### 4.2 · El orden de construcción, que importa

1. **Primero el nombre del campo.** `odoo_lead_id` aparece **cero veces** en `comercial/`; la
   pantalla lee `lead_id`, que es `undefined` **siempre**. Si se construye el selector sin
   corregirlo, **la pantalla guarda bien y sigue diciendo «sin oportunidad»**, y alguien va a
   concluir que el guardado falla. **Una línea, y va primero.**
2. **Después el selector**, en el machote (no en la Confirmación), porque la liga nace al
   cotizar.
3. **Al final el candado**, cuando los 24 estén ligados.

### 4.3 · La pantalla de la salida

Tres caminos, en este orden, y **el sistema nunca adivina**:

- **Candidatas.** Leads activos del cliente ya elegido, etapas no cerradas, ordenadas por
  fecha. Cada una con su etapa y su monto para poder distinguirlas.
- **Buscar.** Si ninguna sirve, búsqueda por nombre sobre los **703 leads activos**, arrancando
  con el nombre tecleado del cliente.
- **Crear.** Si tampoco, se crea ahí mismo con el nombre del machote y el cliente, y **se liga
  en los dos sentidos** en la misma operación.

📌 **La liga se escribe en los DOS sentidos y queda en el historial con quién y cuándo.** Una
liga escrita de un solo lado es la razón por la que hoy hay dos verdades parciales del proyecto.

---

## 5 · 🔴 La respuesta 6 contra la respuesta 2: el choque, dicho claro

Esteban pidió expresamente que lo verificara y lo dijera claro. **Chocan.**

### 5.1 · Los dos mecanismos

| | **por renglón** (lo que FTS hace hoy) | **asistente nativo** |
|---|---|---|
| gesto | poner el unitario/cantidad de cada renglón al 50 % y facturar | correr el asistente con un % o un monto |
| forma de la factura | **N renglones**, espejo de la orden, a la mitad | **UN renglón**, «Down payment», por un monto |
| lo que ve el cliente | su alcance desglosado, a mitad | una línea que dice «anticipo» |
| `amount_invoiced` | avanza renglón por renglón | avanza en bloque y **se regulariza** en la factura final |
| analítica | hereda la de **cada renglón** | la del **producto de anticipo** — por eso la respuesta 1 importaba |
| reversa | nota de crédito por renglón | cancelar el anticipo |

### 5.2 · Lo medido en esta instancia

`sale.order.line` con `is_downpayment = true`, **sin filtro de fecha ni de compañía**:

- **8 renglones en toda la instancia**, repartidos en **2 órdenes** (una en USD, otra en MXN);
- **7 de los 8 están cancelados**; sobrevive **uno**;
- en una de las dos órdenes hay **tres intentos cancelados** con importes distintos antes de
  que uno quedara;
- **los 8 tienen `product_uom_qty = 0` y el dinero en `price_unit`**: el asistente crea el
  anticipo como **un monto**, no como una proporción de los renglones.

**Eso confirma las dos mitades:** el asistente existe y funciona, y **el equipo no lo domina**
—tres cancelaciones seguidas en una sola orden no es una herramienta adoptada—.

### 5.3 · La recomendación

**No son alternativas: son dos cosas distintas que se estaban llamando igual.**

- **Anticipo** = dinero que se cobra **antes de ejecutar**. Va con el **asistente nativo**, con
  **porcentaje sobre el subtotal**. Es lo que hace que `amount_invoiced` vuelva a ser creíble y
  lo que **regulariza solo** al facturar el resto.
- **Avance de obra** = facturar la parte **ya ejecutada**. Va **por renglón**, con la cantidad a
  facturar, exactamente como hoy. Nada que cambiar.

**Y no pueden convivir en la misma orden**: si se cobra un anticipo con el asistente *y* además
se factura al 50 % por renglón, **el facturado de la orden se cuenta dos veces**. El candado 13
lo impide: una orden con anticipo nativo **no admite facturación parcial por renglón hasta que
el anticipo esté regularizado**.

⚠️ **Lo que NO pude verificar, y hace falta antes de construir:** que el modo *porcentaje* del
asistente aplique sobre el **subtotal** y no sobre el total con impuesto. Los dos usos
históricos de esta instancia fueron **de monto fijo**, así que **no hay evidencia local**, y el
modelo del asistente está fuera de la allowlist del MCP. **Se comprueba con una corrida de
prueba sobre una orden de juguete** —es una escritura, y esta sesión no escribe—. Va en las
preguntas como lo único de §5 que bloquea.

---

## 6 · La respuesta 6: el umbral y las órdenes en dólares

Esteban dejó esto explícitamente para que lo propusiera yo, **midiendo cuántas órdenes caen de
cada lado**. Medido sobre `sale.order`, `state='sale'`, `company_id in (1,6)`,
`date_order >= 2025-01-01`, **separando por moneda** (`currency_id`).

### 6.1 · Las cifras

**Pesos** (cía 1, `currency_id = 33`), 135 órdenes:

| | órdenes | % órdenes | % del dinero |
|---|---|---|---|
| **≥ 200,000** | **38** | 28 % | **95.4 %** |
| < 200,000 | 97 | 72 % | 4.6 % |

📌 **Los importes absolutos no se escriben aquí** — este repositorio es público. Se
reproducen en un minuto con el dominio de
[`consultas/sesion-4-dominios.md`](consultas/sesion-4-dominios.md), que es lo que hace falta
para auditar la cifra.

**Dólares** (cías 1 y 6, `currency_id = 2`), 45 órdenes:

| umbral | órdenes que lo cruzan | % órdenes | % del dinero |
|---|---|---|---|
| **200,000 USD** (el número, literal) | **1** | 2 % | 19.3 % |
| **12,000 USD** (el equivalente, redondeado) | **14** | 31 % | **88.2 %** |

⚠️ **Instrumento:** `odoo_agrupar` devolvió **el mismo valor en `:sum`, `:avg` y `:max`** al
pedir varios agregados del mismo campo. Se detectó porque 36 registros no pueden tener
`suma == promedio == máximo`. **Las cifras de dólares están calculadas sobre los 45 renglones
crudos**, no sobre ese agregado. Queda anotado en
[`consultas/sesion-4-dominios.md`](consultas/sesion-4-dominios.md).

### 6.2 · La recomendación

**(a) Sobre el subtotal.** Ya está decidido por la respuesta 6 y es coherente con todo lo
demás: el IVA no es dinero de FTS.

**(b) Un umbral POR MONEDA, y el de dólares convertido, no el mismo número.** Recomiendo
**200,000 MXN** y **12,000 USD**.

Y la razón no es la simetría, es el **modo de fallo**: *«el mismo número en las dos monedas»*
suena razonable y **apaga la regla** del lado americano —atraparía **una** orden de 45—.
Nadie lo notaría, porque un candado que no dispara se ve igual que un candado que no hace
falta. Con el equivalente, el lado americano se comporta como el mexicano: **31 % de las
órdenes y 88 % del dinero**, contra **28 % y 95 %**.

**(c) El porcentaje: fijo por omisión, editable por orden, y por cliente sólo si hace falta.**
Propongo **30 %** de arranque, un campo editable en la pantalla con el valor propuesto ya
puesto, y **nada de tabla por cliente todavía**: no hay evidencia de que los anticipos varíen
por cliente, y una tabla vacía que nadie mantiene es deuda desde el primer día. Cuando dos
clientes tengan una regla distinta y estable, se agrega.

**(d) El umbral vive en una TABLA, no en el código.** Mismo criterio que
`comercial.politica_aprobacion`: un número de política comercial que vive en un `const` se
cambia con un despliegue.

```sql
comercial.umbral_anticipo (
  moneda            text PRIMARY KEY,   -- 'MXN', 'USD'
  monto_desde       numeric(18,2) NOT NULL,
  porcentaje_sugerido numeric(6,4) NOT NULL,
  activo            boolean NOT NULL DEFAULT true,
  updated_at, updated_by
)
```

⚠️ **Y una moneda sin renglón NO es «sin umbral»: es un candado que se queda esperando.** Si
mañana aparece una orden en euros, la Confirmación **no la deja pasar en silencio**: dice
*«no hay umbral de anticipo configurado para EUR»* y manda a configurarlo. Un umbral ausente
leído como «no aplica» es exactamente cómo un candado se apaga sin que nadie lo decida.
