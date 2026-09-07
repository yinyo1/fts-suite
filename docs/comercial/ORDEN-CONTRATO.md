# De la cotización a la orden — el contrato de salida

**Estado: DISEÑO. No hay una sola línea de esto en producción.** El webhook
`comercial/orden-crear` no existe, y nadie tiene todavía permiso de escribir órdenes en
Odoo desde la suite.

Lo que sí existe es un **cascarón recorrible** en el módulo del machote
(`comercial/machote/js/orden.js`): se abre desde cualquier cotización con el botón
**Pasar a orden**, prellena con datos reales del motor y enseña, en la propia pantalla, el
JSON que mandaría. Este documento es el respaldo escrito de eso — con el detalle que no
cabe en una pantalla.

Issue [#140]. Sesión del 7-sep-2026.

---

## Por qué se escribe el contrato antes que el código

El 18 de julio el panel de Confirmar Horas quedó **trabado en producción** porque el
servidor empezó a exigir un campo (`origen`) que el frontend desplegado todavía no
mandaba. Las dos mitades se construyeron por separado y se desplegó primero la estricta.
La regla que salió de ahí está en `CLAUDE.md` §8 y dice, en corto: *cuando un cambio
altera el contrato entre una pantalla y un workflow, no se aplica una mitad sin la otra*.

La forma barata de cumplirla es **escribir el contrato primero**, cuando todavía no hay
nada desplegado que romper. Eso es este documento.

---

## Qué sale del machote y qué se captura a mano

Ésta es la parte que importa, y la que no se ve leyendo el código de Odoo: **el machote es
un documento de COSTEO**. Una orden de venta necesita cosas que el costeo nunca tuvo,
porque son de la **negociación**. Nadie las puede derivar: se preguntan.

### Del machote (nadie las teclea otra vez)

| Campo del contrato | De dónde sale | Nota |
|---|---|---|
| `machote_id` | `m.id` | la identidad de la cotización |
| `version_leida` | la versión que la pantalla está mirando | el servidor rechaza si otro ya guardó encima — mismo bloqueo optimista que el historial |
| `empresa_id` | `m.empresa_id` | 1 = Servicios FTS (MXN) · 6 = FTS USA (USD) |
| `moneda` | se deriva de la empresa | no se elige aparte: la empresa la decide |
| `tc` · `tc_fuente` | `C.tcEfectivo(m)` · `m.tc_fuente` | congelados, como en cada versión del historial |
| `partner_id` | `m.cliente_id` | **el id de Odoo**, no el nombre. Si el machote nació antes del catálogo, esto viene vacío y la orden no se puede crear |
| `lineas[]` | del **motor**, una por sección | ver abajo |

### A mano, siempre

| Campo | Por qué no puede salir del machote |
|---|---|
| `condiciones_pago` | se negocia por cliente y por proyecto |
| `validez_hasta` | 30 días por omisión; con material volátil suele ser menos |
| `referencia_cliente` | la OC del cliente, que casi nunca existe al cotizar |
| `tiempo_entrega` | depende de compras, no del costeo |
| `notas` | va en el cuerpo de la cotización; **no** es la nota interna |

---

## Por qué una línea por SECCIÓN y no una por renglón

El machote tiene hasta diez secciones, y cada sección hasta treinta renglones de
materiales con su precio unitario. Esos precios son **de compra**: es el costeo interno.

Mandar el detalle renglón por renglón a la orden significaría enseñárselo al cliente en la
cotización impresa. La sección, en cambio, es la unidad que el cliente reconoce
(«Suministro y fabricación», «Instalación en sitio») y **el motor ya sabe valuarla sola**:
`calcular(m).secciones[i].precio` reparte el precio total a prorrata del costo de cada
sección, que es exactamente la tabla RESUMEN del machote de Excel.

Verificado contra un machote real de la demo: las dos líneas del cascarón
(`$1,566,510.73` y `$227,792.39`) son idénticas a la columna *MARGEN DESEADO · PRECIO DE
VENTA* de su RESUMEN POR SECCIÓN, y suman su PRECIO DE VENTA (`$1,794,303`).

La prueba `cascarón: la cotización para imprimir NO lleva costos internos` vigila que
ningún costo se cuele en la hoja del cliente. Es la peor falla posible de esta pantalla y
no la cazaría ninguna revisión de «se ve bien».

---

## El cuerpo

```
POST /webhook/comercial/orden-crear
```

```json
{
  "token": "‹el de la sesión, en el CUERPO, no en un header›",
  "machote_id": "M-1041",
  "version_leida": 3,
  "empresa_id": 1,
  "partner_id": 4471,
  "moneda": "MXN",
  "tc": 18.9520,
  "condiciones_pago": "Anticipo 50% / 50% contra entrega",
  "validez_hasta": "2026-10-07",
  "referencia_cliente": "OC-2026-4471",
  "tiempo_entrega": "6 semanas a partir del anticipo",
  "notas": "",
  "lineas": [
    { "nombre": "Suministro y fabricación", "cantidad": 1, "precio_unitario": 1566510.73 },
    { "nombre": "Instalación en sitio",     "cantidad": 1, "precio_unitario": 227792.39 }
  ]
}
```

El token va en el **cuerpo** y no en un header `Authorization`, por lo mismo que en
Finanzas y en los dos webhooks del machote: un header fuerza un preflight CORS que el
webhook de n8n puede no contestar (`CLAUDE.md` §15 #5).

## La respuesta

```json
{ "ok": true, "odoo_so_id": 11836, "odoo_so_name": "SO11836", "estado": "enviado" }
```

`odoo_so_id` es lo que **ata** la cotización a la orden. Sin él la pantalla no puede decir
que la mandó — por la misma razón por la que no puede decirlo un clic.

Errores previstos, con su mensaje propio: `SIN_CLIENTE`, `CONFLICTO_DE_VERSION`
(alguien guardó encima mientras tanto), `SIN_PERMISO_ODOO`, `ODOO_RECHAZO` (con el texto
de Odoo tal cual).

---

## Lo que falta antes de construirlo

1. **La decisión de que la suite emita órdenes.** Cuidado con cómo se cuenta esto: la
   credencial de Odoo en n8n **sí escribe** — ya crea proyectos, cuentas analíticas y
   presupuestos al confirmar una SO (`CLAUDE.md` §17). Lo que no existe es la decisión de
   que una cotización de la suite se convierta en una venta sin que un humano la revise en
   Odoo. Es un impedimento de criterio, no técnico, y decirlo al revés inventaría un
   candado que no está.
2. **Un scope `comercial:orden`**, separado de `comercial:read`. No todo el que cotiza
   debería poder emitir la orden.
3. **Decidir qué pasa con el machote al crearla.** La propuesta: pasa a `enviado`, que ya
   existe y ya congela el documento (`ESTADOS.enviado.congelado`). El `odoo_so_id` se
   guarda en la columna que la migración `003` ya dejó lista para eso.

---

## El envío al cliente — el tapón real

El cascarón tiene una segunda pantalla (**Mandarla al cliente**) y ahí está el bloqueo
que ningún código resuelve:

**La aplicación de Microsoft Graph que ya usa la suite (`n8n-mail-sender`) tiene una
Application Access Policy que la limita a UN buzón: `sales@fts.mx`.** Mandar como
Montalvo o como Ricardo exige permisos nuevos en Azure que hoy no existen.

Dos caminos, y hay que elegir uno antes de construir:

- **A · Desde el buzón de siempre.** Sale de `sales@fts.mx` con el vendedor en «responder
  a». Cero cambios en Azure. El cliente le contesta a quien debe, pero el remitente no es
  la persona.
- **B · Como cada vendedor.** Ampliar la Application Access Policy a los buzones de
  comercial, o dar `Mail.Send` delegado y que cada quien autorice su cuenta. Requiere a
  Esteban en Azure. Es lo que se ve natural, y también es dar permiso de mandar correo en
  nombre de una persona.

### La regla que gobierna la marca de «enviada»

> **La marca de enviada la dispara el envío confirmado, nunca el clic.**

Es la lección del kiosko (`CLAUDE.md` hallazgo #15, el anti-patrón más grave del incidente
del 27 de mayo): la pantalla pintaba «✓ SALIDA» *antes* del POST, y hubo gente que se fue
a su casa creyendo que había checado. Corrupción silenciosa.

El orden correcto, cuando exista:

```
la pantalla pide → el servidor manda por Graph → Graph contesta 202 con el id del mensaje
→ el servidor escribe la marca → la devuelve → la pantalla la pinta RELEYENDO
```

La pantalla nunca pinta «enviada» porque se acuerde de haber apretado el botón. En el
cascarón de hoy el botón **no marca nada** y lo dice con todas sus letras: se para en
«esperando la confirmación del servidor» y explica quién escribiría la marca.

Hay una prueba que lo vigila (`el botón NO marca la cotización como enviada`): compara el
machote guardado antes y después de apretar y exige que no haya cambiado.

---

## Lo que sí funciona hoy

**Bajar la cotización en PDF.** El botón abre una hoja lista para imprimir, y desde ahí
«Guardar como PDF» del navegador. No depende de ningún permiso ni de ninguna librería, y
la hoja lleva sello de DEMOSTRACIÓN mientras no haya folio de Odoo.
