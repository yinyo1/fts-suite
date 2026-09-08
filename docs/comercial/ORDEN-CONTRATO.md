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

### La salvedad: cuando el cliente pide desglose para armar su PO

Esteban aprobó la línea por sección **con una condición** (8-sep-2026): hay clientes que
exigen desglose para poder armar su orden de compra, así que tiene que poder **abrirse UNA
sección a detalle cuando el cliente lo pida** — sin que sea lo normal, y sin que eso
exponga precios de compra.

Las dos cosas parecen reñidas y no lo están, porque **desglose y costo no son lo mismo**.
El renglón que el cliente necesita para su PO es *«Tablero de control 480 V · 1 pieza ·
$X»*; el precio de compra es lo que a FTS le costó ese tablero. Lo que hoy vive en el
machote es el costo, y el precio de venta del renglón **no está capturado en ningún lado**:
sólo existe el precio de la sección.

Propuesta —**no está construido, y no debería construirse sin que Esteban confirme el
punto 2**:

1. **Una casilla por sección, apagada por omisión**, en la pantalla de pasar a orden:
   *«Desglosar esta sección en la orden»*. Apagada por omisión es lo que hace que siga
   siendo la excepción; una preferencia global se volvería la costumbre en dos semanas.
   Que sea **por sección y no por cotización** es justo lo que pidió Esteban: se abre la
   que el cliente necesita, no todas.
2. **El precio de cada renglón sale a prorrata del costo dentro de su sección** — la misma
   regla con la que el motor ya reparte el precio entre secciones
   (`calcular(m).secciones[i].precio`), un nivel más abajo. Tiene una consecuencia que hay
   que decir en voz alta: **el margen queda implícito, uniforme dentro de la sección**. Un
   cliente que compare el precio unitario contra su propia referencia de mercado puede
   deducir por dónde anda el margen. No es el costo, pero tampoco es opaco. *Ésta es la
   decisión que falta, y es de negocio, no técnica.*
3. **La suma de los renglones desglosados tiene que dar exactamente el precio de la
   sección.** Con una prueba que lo vigile, del mismo tipo que la de V1.16 —invariante, no
   número esperado—: es la única forma de que abrir el desglose no cambie el total.
4. **El costo nunca sale.** Ni `costo`, ni `costoMo`, ni `costoMat`, ni la tarifa de mano de
   obra, ni el multiplicador. La prueba que ya existe (`NO lleva costos internos`) se
   extiende al caso desglosado, que es donde de verdad puede colarse.

Coste estimado: ~2 h, la mitad en la prueba. **Pendiente de la decisión del punto 2.**

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

## El envío al cliente — CAMINO A, construido y probado (8-sep-2026)

Esteban eligió el **camino A**. Lo demás de esta sección queda como estaba porque la
disyuntiva sigue viva para más adelante.

**El correo sale de `sales@fts.mx` con el vendedor en «responder a».** El cliente le
contesta a quien debe; el remitente no es la persona. Cero cambios en Azure. Mandar *como*
cada vendedor (camino B: ampliar la Application Access Policy, o `Mail.Send` delegado con
autorización de cada quien) queda para cuando Esteban quiera pagar ese permiso — es dar
permiso de mandar correo **en nombre de una persona**, y no se pide a la ligera.

El correo del vendedor se resuelve **en el servidor**, no en la pantalla:
`token.empleado_id` → `hr.employee.work_email`. Va firmado dentro del token, así que nadie
puede poner el correo de otro como suyo mandando un cuerpo distinto. Si el empleado no
tiene `work_email` en Odoo, el endpoint **no falla**: manda sin «responder a» y devuelve el
aviso de que la respuesta llegaría a la casilla común.

### El candado de pruebas

Mientras `MODO_PRUEBA` esté en `true` dentro de `Code - Preparar`, el endpoint **sólo
acepta `sales@fts.mx`** y contesta `DESTINO_NO_PERMITIDO` a cualquier otro destinatario.
El candado vive en el **servidor**, no en la pantalla, porque la pantalla se salta con un
`fetch` a mano. Abrirlo es un cambio deliberado de una línea, con nombre, que se ve en el
diff.

Probado en vivo el 8-sep (ejecución `90414`): correo a `sales@fts.mx`, PDF de 204 KB
adjunto, Graph contestó **`202`**, «responder a» = `estebandelacruz@fts.mx`. Y el candado
probado por el lado que importa (ejecución `90412`): un destinatario inventado de cliente
devolvió `DESTINO_NO_PERMITIDO` **sin mandar nada**.

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

**La hoja para imprimir.** El botón abre una hoja lista para imprimir, y desde ahí
«Guardar como PDF» del navegador. No depende de ningún permiso ni de ninguna librería, y
la hoja lleva sello de DEMOSTRACIÓN mientras no haya folio de Odoo.

**El PDF oficial de Odoo.** Botón *«Traer el PDF de Odoo»* → webhook
`comercial/cotizacion` en modo `pdf` → el documento que Odoo le genera al cliente, bajado
como archivo. Es el mismo, byte por byte, que vería el cliente si le mandaran el enlace de
portal.

### Cómo se baja, y los dos caminos que NO sirven

Se midieron tres el 8-sep-2026:

| camino | resultado |
|---|---|
| `POST /web/session/authenticate` con la llave de API | **`Access Denied`** (ejec. `90300`). Las llaves de API de Odoo valen para JSON-RPC, **no** para el login web. |
| `ir.actions.report.render_qweb_pdf` por RPC | **no existe** en este Odoo; el privado `_render_qweb_pdf` lo rechaza: *«Private methods … cannot be called remotely»*. |
| **enlace de portal**: `GET /my/orders/<id>?access_token=…&report_type=pdf&download=true` | **200 · `application/pdf` · `%PDF-`** (ejec. `90304`, SO11498). ✅ |

**El `access_token` es una llave de capacidad**: quien la tenga ve la orden completa sin
entrar a Odoo. Por eso el servidor baja los bytes y devuelve los bytes; **el navegador
nunca ve el token**. Si el enlace se armara en el navegador, la llave quedaría en el
historial, en el portapapeles y en cualquier captura de pantalla.

### El campo que liga el machote con la orden

**`comercial.machote.odoo_so_id`** (migración `003_machote.sql`). Es una referencia externa
**sin llave foránea**, a propósito: el día que un dominio salga de Odoo, el machote no queda
apuntando a un id que dejó de existir.

**Y cuando está vacío, no hay PDF que traer.** Ése es el estado *normal* de un machote
recién capturado, no un error: la cotización todavía no se volvió orden en Odoo, así que el
documento oficial no existe. El endpoint contesta `SIN_ORDEN` con su frase y la pantalla la
pinta en ámbar —no en rojo— y manda a la hoja para imprimir. Probado (ejec. `90405`).

Los otros desenlaces, todos probados el 8-sep:

| situación | respuesta | ejec. |
|---|---|---|
| orden real | `ok` + PDF 204 KB, `%PDF-` | `90404` |
| machote sin `odoo_so_id` | `SIN_ORDEN` | `90405` |
| machote **de otra persona** (existe) | `MACHOTE_NO_ENCONTRADO` | `90406` |
| token vencido | `TOKEN_EXPIRADO` | `90407` |
| sin `comercial:read` | `SCOPE_INSUFICIENTE` | `90408` |
| token basura | `TOKEN_MALFORMADO` | `90409` |
| sin decir cuál | `FALTA_QUE_COTIZACION` | `90410` |
| orden inexistente | `ORDEN_NO_ENCONTRADA` | `90411` |

El renglón de `TOKEN_EXPIRADO` vale doble, por la misma razón que en `ALMACEN.md`: la
cripto tuvo que viajar por el MCP como texto, y un solo carácter cambiado habría dado
`FIRMA_INVALIDA`. Que diga `TOKEN_EXPIRADO` prueba que el HMAC calcula bien.

**El machote de otra persona** se probó contra una fila que **sí existe** — un uuid
inventado habría dado el mismo `MACHOTE_NO_ENCONTRADO` sin probar nada. Se contestan igual
a propósito: distinguirlos convertiría el endpoint en un oráculo que confirma qué ids
existen.

> **El endpoint nace INACTIVO.** Lo enciende Esteban en la UI de n8n. Mientras tanto los
> botones de la pantalla que lo llaman contestan que no hay servidor — que es la verdad.
