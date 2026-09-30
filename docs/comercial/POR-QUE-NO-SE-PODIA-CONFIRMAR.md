# Por qué la suite no podía confirmar una orden — dos defectos, medidos

> ⚠️ **CORREGIDO a las 02:30 del 30-sep.** La primera versión de este documento
> decía que `orden-crear-v2` «no puede completar». **Es falso, y lo desmintió el
> propio Odoo:** las dos ejecuciones que yo había dado por colgadas **terminaron
> en `success`** a los **28 min 41 s** y **28 min 46 s**, y dejaron SO11905 y
> SO11906 con su producto creado. El defecto no es que no termine: es que tarda
> media hora, y eso resulta ser **peor**. Está corregido abajo, en el defecto 1.
>
> Es exactamente §20 #19 mordiéndome a mí: medí «cero productos creados» a los
> tres minutos de arrancar y lo leí como «no llega», cuando significaba «todavía
> no». Un vacío se leyó como una respuesta.

**Issue #294 · 30-sep-2026 · salió de recorrer el ciclo, no de leer el código.**

El encargo decía: *«Si al recorrerlo aparece algo que no se veía leyendo, ese es
el hallazgo de la sesión.»* Apareció. Son dos, están en workflows **activos**, y
entre los dos explican por qué **nunca** se había podido confirmar una orden
desde la suite: cada camino falla en un punto distinto.

Los dos cambios son de workflow activo, así que **no los apliqué**. Están
escritos para copiarse.

---

## Defecto 1 · `comercial/orden-crear-v2` tarda ~29 minutos en crear una orden

**Id `H2HOG8LqoYUVg3hU`, activo. Es el que llama el frontend**
(`almacen.js`: `URL_ORDEN = BASE + '/comercial/orden-crear-v2'`).

Sus cuatro lecturas de Odoo van **encadenadas en línea** y **ninguna lleva
`executeOnce`**:

```
Postgres - Reservar y leer   → 1 fila
Odoo - getAll listas de precio  → 6 items
Odoo - getAll impuestos         → corre 6 veces  → 6 × 178 = 1,068 items
Odoo - getAll terminos de pago  → corre 1,068 veces → × 44 = 46,992 items
Odoo - getAll incoterms         → corre 46,992 veces → × 11 = 516,912 items
```

O sea **~47,000 idas y vueltas a Odoo por cada intento de crear una orden**, y
medio millón de items en memoria de un proceso de 8 GB que además sirve el
kiosko (§20 #14).

**Medido, no deducido.** Reproducir el caso completo habría costado 47,000
llamadas, así que se probó la regla con **dos** nodos (ejecución `119876`):

```
listas_de_precio     6
impuestos_recibidos  1068      ← 6 × 178
impuestos_en_odoo    178
multiplico           true
factor               6
veredicto  "MULTIPLICA: el segundo getAll corrio una vez por item del primero."
```

Y por separado se comprobó que las cuatro lecturas **no están rotas**: con
`executeOnce` puesto devuelven 6 / 178 / 44 / 11 en **4.7 segundos** sin un
error (ejecución `119874`). El problema es la topología, no Odoo.

### Y lo que pasa de verdad, que es peor que un fallo

Mis dos invocaciones (`119858` y `119865`) **terminaron bien**:

```
119858   01:36:34 → 02:05:15   = 28 min 41 s   success   → SO11905
119865   01:39:23 → 02:08:09   = 28 min 46 s   success   → SO11906
```

O sea que la v2 **funciona**. Y por eso es peor:

1. **El navegador aborta a los 10 segundos.** `n8nFetch` lleva un
   `AbortController` con ese tope. Quien apriete «emitir la orden» va a ver un
   error… y la orden va a aparecer en Odoo **media hora después**, sin que nadie
   la esté esperando. Un fallo limpio se arregla; una orden fantasma se descubre
   facturando.
2. **La reserva dura 2 minutos y la corrida 29.** El candado de idempotencia es
   `odoo_so_claim_at < now() - interval '2 minutes'`, leído de su propio SQL. Con
   una corrida de 28m45s, la reserva caduca **27 minutos antes** de que la orden
   exista. Quien vea el error a los 10 s y vuelva a apretar pasados dos minutos
   —o sea, cualquiera— dispara una segunda corrida que creará **una segunda
   orden** para la misma cotización.

⚠️ El punto 2 es aritmética sobre dos números medidos (la ventana del `claim` y
la duración real), **no lo ejercí**: comprobarlo cuesta media hora de reloj. Lo
digo como lo que es, una consecuencia, no una observación.

### El cambio exacto

Tres banderas. La primera lectura recibe **una** fila de la reserva, así que no
necesita nada; las otras tres sí:

```
update_workflow  H2HOG8LqoYUVg3hU
  setNodeSettings  "Odoo - getAll impuestos"          { executeOnce: true }
  setNodeSettings  "Odoo - getAll terminos de pago"   { executeOnce: true }
  setNodeSettings  "Odoo - getAll incoterms"          { executeOnce: true }
```

`Code - Decidir`, que va después, es un Code node en modo «una vez para todos
los items», así que recibir 11 items de incoterms no lo hace correr 11 veces. No
hace falta tocarlo — pero conviene **comprobarlo en el read-back** en vez de
creerme.

⚠️ Y después del edit, las dos verificaciones de §3 y §17 2b: `active` sigue en
`true`, **y** `versionId == activeVersionId`. Con este MCP un `update_workflow`
deja el cambio **guardado y sin publicar** (§17 2c), así que hace falta rematar
con `publish_workflow` — y eso es un clic tuyo, porque a mí publicar workflows
me está vedado en esta sesión.

---

## Defecto 2 · `comercial/orden-crear` (v1) crea borradores que NO se pueden confirmar

**Id `0jun4SLxAPTtIkHf`, activo.** Es la versión anterior, y es la que de hecho
funciona: sólo encadena dos lecturas y la de impuestos va **filtrada** a las de
venta de las empresas 1 y 6, así que se queda en 6 × 16 — molesto y sano.

Con ella recorrí el ciclo entero. Y ahí salió lo otro: sus líneas de orden nacen
**sin `product_id`**. Odoo deja **crearlas** así, pero **no deja confirmar** la
orden:

```
5-confirmar · http 200 · ok false · error CONFIRMACION_A_MEDIAS
  paso_alcanzado 5 de 7
  detalle de Odoo:
  "Some order lines are missing a product, you need to correct them
   before going further."
```

El propio nodo de v1 lo dice con todas sus letras: *«Odoo acepta la linea sin
`product_id` (probado, linea 26996)»*. Y es verdad **al crear**. La frase es
cierta y la conclusión no: el candado de Odoo no está en el `create`, está en el
`action_confirm`.

📌 **Esto es exactamente por lo que existe la v2:** tiene `Code - Productos a
crear` + `Odoo - CREATE producto` precisamente para que la orden se pueda
confirmar. O sea que **la v2 es el arreglo de este defecto** — un arreglo
correcto, construido, activo… y que tarda media hora, así que desde la pantalla
nunca llegó a usarse. El arreglo existía y no había llegado a las manos de
nadie.

### El cambio

Ninguno en v1. **v1 no se arregla: se deja de usar** en cuanto la v2 funcione.
Si por lo que sea hay que dejar v1 servible mientras tanto, lo mínimo es que sus
líneas lleven producto — pero eso es reimplementar la v2 dentro de la v1, y no
vale la pena.

---

## Lo que los dos juntos significan

| camino | crea el borrador | se puede confirmar | utilizable desde la suite |
|---|---|---|---|
| **v2** (la que llama la suite) | ✅ sí, **con producto** | ✅ sí | ❌ tarda ~29 min · el navegador corta a los 10 s |
| **v1** (la anterior) | ✅ sí, en segundos | ❌ Odoo lo rechaza | ❌ el borrador no sirve |

**Ningún camino sirve hoy, por razones opuestas.** Los dos están activos, los dos
responden 200, y ninguno avisa: la v1 entrega un borrador que se ve perfecto
hasta que alguien intenta confirmarlo, y la v2 entrega un error de red mientras
crea la orden a escondidas media hora después.

📌 **Y la buena noticia sale de ahí:** como la v2 **sí** deja órdenes con
producto, el ciclo completo se pudo cerrar sobre una de ellas —SO11905— sin
parchear nada a mano. Los siete pasos, con read-back, están al final de este
documento.

📌 **Por qué no se sabía, que es la parte que vale para la próxima vez.** Las dos
mitades se probaron por separado y las dos «pasaron»: crear la orden se probó
creando órdenes (v1, 14–15 de septiembre, SO11887–11891), y la confirmación se
probó leyendo el diseño. Nadie recorrió las dos seguidas sobre la misma orden
hasta hoy. **Es el mismo modo de fallo del contrato frontend↔servidor de §8
—una mitad verificada y la otra supuesta— pero dentro del servidor**, entre dos
workflows que nunca se habían mirado juntos.

Y el orden de la investigación importó: el primer síntoma fue «mi arnés se
cuelga», que invita a arreglar el arnés. Lo que lo desvió fue medir el instrumento
antes que el objeto (§20 #19) — la sonda de tramos corrió en 202 ms y probó que
nada de lo mío estaba roto.

---

## Lo que sí quedó probado del ciclo

Con la v1 se llegó hasta el paso 5 de 7, y **el diseño de la confirmación
aguantó tal como está escrito en su propio nodo**:

```
0 leer la orden      OK  "SO11904 en draft, 1000 MXN"
2 cuenta analitica   OK  "creada 3133 en el plan 1"
3 proyecto           OK  "creado 2384"
4 presupuesto        OK  "presupuesto 433 con 3 lineas (3 nuevas), eje en account_id"
5 bandera del radar  OK  "puesta, con el proyecto 2384"
6 CONFIRMAR          ✗   Odoo: falta producto en las lineas
7 junta de arranque  —   no llegó
```

La orden **se quedó en borrador** (lo único irreversible no ocurrió), lo creado
quedó guardado para reusarse (`{analitica:3133, proyecto:2384, presupuesto:433}`)
y hay renglón de bitácora (`b3ee7d66-8a31-4173-a516-3a72459908c7`). La bandera
del radar quedó puesta **antes** de confirmar, que es lo que evita que el radar
de cada 5 minutos cree un segundo proyecto.

O sea: **la confirmación a medias no dejó nada colgando, y no hubo que
provocarla** — pasó sola.

⚠️ **Lo que NO está probado:** que un reintento **reuse** en vez de duplicar. Lo
intenté y el arnés se frenó antes, en `CONFLICTO_DE_VERSION`, porque manda
`version_leida: 0` fijo (el candado optimista funcionando, de paso). Lo que sí
está medido es su condición previa: los tres ids quedaron escritos en la base y
la Compuerta 2 los lee en `destino.ya_creado`. La propiedad está en el diseño y
**sin ejercer**.

---

## Defecto 3 · la Compuerta 2 no devuelve lo que el candado necesita mirar

**Id `Cyapm1EfPPbTxSi5` (`comercial/confirmar`), activo.** Este no cuelga ni
rechaza nada: le falta un dato de salida, y por eso el candado de la suite tiene
un agujero que no se puede tapar desde el navegador.

La puerta única (`G.PuertaConfirmar`, V1.46) compone dos comprobaciones: los seis
candados del machote —contacto, decisión de IVA, número y archivo de la PO,
cuadre contra la PO, anticipo— y lo que contesta el servidor. Pero los seis
candados **necesitan el machote**, y el navegador sólo tiene los que se
capturaron en él (§20 #13). Cuando la cotización es de otra persona, la puerta no
puede comprobar y lo dice en ámbar.

**Esto ya no es una deducción: está medido contra una respuesta viva.** Las
llaves que devolvió la Compuerta 2 en la ejecución `119882`:

```
_meta, actor, actor_nombre, cliente, cliente_id, cuadra, dentro_politica,
destino, dueno, dueno_nombre, empresa, empresa_id, estado_orden, folio,
handoff, impuesto_odoo, lista_precios, lleva_impuesto, machote_id, margen,
mensaje, modo, moneda, moneda_correcta, moneda_odoo, monto_usd, motivos,
niveles_disparados, nombre, odoo_so_id, odoo_so_name, ok, oportunidad,
oportunidad_id, politica_vigente, por_que_no, renglones, se_puede_confirmar,
secciones, subtotal_odoo, tc, total_machote, total_odoo, version
```

Cuarenta y tres llaves, y **ninguna** es `contacto`, `iva`, `po` ni `anticipo`.

### El cambio

`Postgres - Leer para evaluar` **ya trae el documento del machote** — de ahí sale
`total_machote`, `margen` y `nombre`. Así que no hace falta una consulta nueva:
basta con que `Code - Compuerta 2` copie al objeto de respuesta lo que ya tiene
delante, en una llave propia:

```js
// en Code - Compuerta 2, junto a total_machote / margen:
confirmacion: (doc && doc.confirmacion) || null,
```

Con eso, la puerta puede aplicar los seis candados **venga la cotización de
donde venga**, y el caso ámbar «no está en este navegador» desaparece. Mientras
no esté, el comportamiento es el de antes de la V1.46: el servidor decide.

📌 **Y el orden importa, por la regla anti-trabón de §8:** este lado es el
**tolerante** (agregar una llave que nadie exige todavía), así que va primero y
solo. El frontend ya está listo para usarla sin exigirla — lee
`s.confirmacion` sólo si viene. Nunca al revés.

---

## ⚠️ Estado desde la V1.48 (30-sep-2026): las dos escrituras están APAGADAS

**Ya no urge aplicar nada de lo de abajo, y a cambio nada de esto se puede
encender sin ello.** Desde la V1.48 las dos escrituras irreversibles están
apagadas en el código del cliente:

| función | archivo | qué hacía | interruptor |
|---|---|---|---|
| `crearOrden` | `comercial/machote/js/almacen.js` | crear la orden en Odoo (`orden-crear-v2`) | `EMITIR_ENCENDIDO` |
| `confirmar` | `comercial/machote/js/almacen.js` | confirmarla (`confirmar`, modo `confirmar`) | `CONFIRMAR_ENCENDIDO` |

Se apagan **en la única puerta por la que salen**, no en el botón que las llama:
un botón deshabilitado es una sugerencia —queda la consola, queda otra pantalla,
queda el siguiente que escriba un camino nuevo sin enterarse—, la puerta no. Hay
una prueba que las llama **directo**, saltándose la interfaz, y exige que ni
siquiera toquen la red (`V1.48 · las dos escrituras irreversibles no salen ni
forzándolas`).

El flujo **se recorre entero**: el botón del machote se llama ahora *Confirmar
orden*, abre el paso 1 (elegir el par), pasa al checklist, y llega al paso 3,
que se ve, dice que está apagado y no escribe.

**Los tres cambios de abajo son la CONDICIÓN para encenderlo.** En cuanto estén
aplicados y verificados, encender es poner esos dos `false` en `true` —una línea
cada uno— y volver a recorrer el ciclo completo exigiendo que el paso 6 pase.
Son workflows **ACTIVOS**: los aplica Esteban, no una rama.

---

## Resumen de lo que hay que aplicar, en orden

| # | workflow | cambio | riesgo |
|---|---|---|---|
| 1 | `Cyapm1EfPPbTxSi5` confirmar | una llave más en la respuesta de `Code - Compuerta 2` | el más bajo: es aditivo y nadie lo exige |
| 2 | `H2HOG8LqoYUVg3hU` orden-crear-v2 | tres `executeOnce: true` | bajo, y es lo que la desatasca |
| 3 | — | dejar de usar `comercial/orden-crear` (v1) en cuanto 2 funcione | ninguno, es no usarla |

Después de **cada** edit: read-back de `active`, y `versionId` contra
`activeVersionId` (§3 y §17 2b). Y `publish_workflow` al final, que con este MCP
un `update_workflow` deja el cambio guardado **y sin publicar** (§17 2c).

⚠️ **Lo primero que hay que probar después del 2 es el ciclo completo otra vez**,
y exigir que el paso 6 pase. Un `insertadas: 0` se ve igual que un éxito (§9): si
la v2 contesta rápido pero la orden no queda en `sale`, no se arregló nada.

---

## Y el ciclo SÍ se cerró: los siete pasos, sobre SO11905

Como la v2 —lenta pero correcta— dejó dos órdenes **con producto**, se pudo
confirmar una de ellas y cerrar el ciclo de punta a punta **sin parchear nada a
mano**. Ejecución `119956`:

```
paso 0  leer la orden       OK  "SO11905 en draft, 1000 MXN"
paso 2  cuenta analitica    OK  "creada 3134 en el plan 1"
paso 3  proyecto            OK  "creado 2385"
paso 4  presupuesto         OK  "presupuesto 434 con 3 lineas (3 nuevas), eje en account_id"
paso 5  bandera del radar   OK  "puesta, con el proyecto 2385"
paso 6  confirmar la orden  OK  "SO11905 quedo en sale"
paso 7  junta de arranque   OK  "tarea 4719 el 2026-10-01 20:00:00 UTC (14:00 CST)"
```

`paso_alcanzado: 7` · `kickoff_ok: true` · `confirmada_por: esteban.delacruz` ·
bitácora `c37612b3-e689-4fbb-b152-bcc11f712435`.

Y el read-back en Odoo, que es lo que lo hace cierto:

| | leído de Odoo |
|---|---|
| `sale.order` 12104 | **`state: sale`** · `x_studio_project_created: si` · proyecto ligado · 1,000 + 160 = 1,160 MXN |
| `account.analytic.account` 3134 | plan 1, de la orden |
| `project.project` 2385 | con su `account_id` = 3134 |
| `budget.line` 2609/2610/2611 | **los dos ejes en la misma línea**: Ingreso +1,000 · Mano de Obra −400 · Materiales −300 |
| `project.task` 4719 | «Junta de arranque · SO11905», 2026-10-01 20:00→21:00 UTC |

**O sea que la maquinaria de la confirmación está bien.** Lo único roto es cómo
se llega a ella: un camino tarda media hora y el otro entrega un borrador que
Odoo no acepta. Arreglados los tres puntos de arriba, esto funciona.
