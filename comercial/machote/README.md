# Estación del machote — prototipo

Prototipo navegable de las estaciones 2.0 (armar la cotización) y 3.0 (cerrar la
orden) del módulo comercial. HTML, CSS y JS planos, sin framework y sin servidor:
se abre `index.html` con doble clic.

**El motor de precio no es una maqueta.** Reproduce el machote real de FTS,
levantado de SharePoint el 2026-09-03. Sobre `Paso de Gato MXN - SO11782.xlsx`
devuelve `Factor_req = 1.730103806`, idéntico a la celda `H14` del archivo.
La estructura está documentada en
[`docs/comercial/MACHOTE-ESTRUCTURA-REAL.md`](../../docs/comercial/MACHOTE-ESTRUCTURA-REAL.md).

Los **datos** de las cuatro cotizaciones de ejemplo sí son inventados.

---

## Versión

**Esquema: `V<mayor>.<menor de dos dígitos>` — un incremento de 0.01 por cada
merge a `main`.** Al pasar de `.99` sube el mayor y el menor vuelve a `00`:

```
V1.00 · V1.01 · … · V1.99 · V2.00 · V2.01 · …
```

Se ve al pie de la lista y en la barra superior de cada cotización. Sirve para
distinguir *"ya lo cambié"* de *"estás viendo el caché"*, que sin esto no se
puede sin abrir las herramientas de desarrollo.

⚠️ **El esquema no es de toda la suite.** El repo tiene varios conviviendo:

| módulo | esquema |
|---|---|
| `comercial/machote` | `V1.xx` (este) |
| `finanzas` | `V1.xx` desde el 2026-09-03 — antes `0.5.36` + cadena de build |
| `operaciones/planeacion` | `2.4.1` + build |
| `operaciones/kiosk`, `confirmar-horas` | sólo cadena de build |
| siete módulos más | `1.0.0` puesto una vez y nunca movido |

`finanzas` se pasó a `V1.xx` por instrucción directa de Esteban el 2026-09-03
(«quiero que la versión sea de tipo V1.00 hasta V1.99 … en cada merge que
hagamos controlarlo», sobre el módulo que iba en 5.3x). Corrige la decisión que
había quedado escrita aquí unas horas antes en el issue #148 — que era «no
propagar». **A los demás módulos sigue sin propagarse**: cada uno lleva su
propio contador y el de este módulo NO es el de finanzas.

### Cómo bumpearla (obligatorio en todo merge)

1. `comercial/machote/version.json` → sube `version` en 0.01 y **antepón** la
   entrada nueva a `historial` con su número de PR.
2. `comercial/machote/js/app.js` → la constante `VERSION`, con el mismo valor.

Dos pruebas lo vigilan: una falla si los dos lugares se separan o si el formato
no calza, y otra si el historial **salta o repite** un número. Una versión que
salta deja de decir cuántos despliegues van, y una pantalla que miente sobre su
versión es peor que no tener indicador.

## Archivos

| archivo | qué es |
|---|---|
| `version.json` | La versión vigente y su historial. |
| `js/calc.js` | El motor. Todo número que se ve sale de aquí; ninguna vista calcula. |
| `js/reglas.js` | 30 reglas en un arreglo de configuración, separadas del motor que las corre. |
| `js/demo.js` | Datos de ejemplo. Lo que viene del machote real va marcado `REAL`; lo inventado, `SUPUESTO`. |
| `js/app.js` | Vistas y ruteo. |
| `js/almacen.js` | El autoguardado. UNA pieza entre la pantalla y donde viven los datos. |
| `tests/pruebas-navegador.js` | 60 pruebas de navegador. |

## Cómo se calcula el precio

El margen **no** es un porcentaje sobre el total: es un **multiplicador por
concepto**, aplicado renglón por renglón.

```
partida de materiales   precio = costo × 1,8
partida de servicios    precio = costo × 1,7
mano de obra            precio = costo × 2,5     (costo = tarifa × personas × horas)
programador             precio = costo × 4,4
horas extras            precio = costo × 5,0     (= mano de obra × 2)
```

Encima van dos comisiones en cascada — FTS y cliente — y de ahí salen los tres
escenarios que el machote ofrece: **Costo**, **Con utilidad** y **Margen deseado**.

Bajo *margen deseado* el precio es `costo / (1 − margen − comisiones)` y se
reparte entre secciones **a prorrata del costo**. Por eso mover un multiplicador
en ese escenario no cambia el precio: sólo cambia el reparto. Es una propiedad
del machote, no un error, y hay una prueba que la fija.

## La pantalla

La hoja se dibuja con la retícula del machote: pestañas por hoja, el bloque de
`Costos desglosados` y la tabla de márgenes arriba, `COSTO MANO DE OBRA` con sus
diez renglones fijos en tres grupos, y `COSTO MATERIALES Y SERVICIOS` con sus
trece columnas. La hoja `DESGLOSE COTIZACIÓN` trae los tres escenarios, el
`RESUMEN BUDGET`, las diez ranuras de sección, el `BUDGET ODOO` y la tabla de
comisiones.

**En teléfono la retícula desaparece.** Catorce columnas con el pulgar no se
capturan: cada renglón se vuelve una tarjeta con sus campos etiquetados, los
renglones de mano de obra en cero se pliegan detrás de un interruptor que dice
cuántos hay, y nada de lo que se toca mide menos de 44 px. En pantalla ancha
vuelve a ser la retícula completa. Hay pruebas para las dos formas.

Reproducir el Excel en un teléfono habría sido fidelidad mal entendida.

## Captura contra cálculo

En Excel se sabe qué celda es fórmula porque la barra la muestra. Aquí no había
ninguna señal: la celda editable era transparente y sólo sacaba borde al pasar
el mouse — que **en un teléfono no existe**. En el dispositivo donde más se
captura, la distinción no estaba.

Ahora se distinguen por **tres cosas a la vez**, no sólo por color, para que
siga sirviendo sin distinguir colores:

| | forma | fondo | marca |
|---|---|---|---|
| **se captura** | caja con borde y esquinas | blanco | — |
| **lo calcula la hoja** | sin caja | gris papel | barra de fórmula a la izquierda |
| **margen escrito a mano** | caja con borde ámbar | ámbar | `≠ 2.5` con el valor que le tocaría |

Al teclear, los derivados del renglón **se mueven al instante y el cursor no se
pierde**: la hoja se renderiza a un nodo suelto, se comparan las celdas `.calc`
una a una y sólo se copian las que cambiaron. Las que cambiaron parpadean medio
segundo, y con `prefers-reduced-motion` el parpadeo se cambia por un borde.

## Editar la estructura

El machote real no es una plantilla fija: las secciones **se renombran** al
alcance de cada obra y los renglones se copian del parecido. La herramienta hace
lo mismo.

- **Secciones:** renombrar (la pestaña sigue al nombre), duplicar `⧉` — queda al
  lado como "(copia)" —, reordenar `←` `→`, eliminar `×`.
- **Renglones de materiales y servicios:** duplicar, subir, bajar, eliminar.
- **Unidad:** captura libre con catálogo sugerido. Un `<select>` no deja escribir
  "tramo de 6 m", que es de lo que está lleno el acervo.

**Los renglones de mano de obra no aceptan filas nuevas.** Son exactamente diez
por sección en los cinco machotes 2026 del acervo (90 = 10×9, 70 = 10×7,
50 = 10×5). Agregar filas rompería el regreso al Excel.

**Sobre las diez ranuras:** se permite pasar de diez secciones, pero queda
marcado en tres lados — la pestaña sobrante se pinta distinta, la hoja lo dice, y
el revisador lo levanta como hallazgo **duro** listando cuáles no llegarían al
precio. No se bloquea porque el negocio ya lo hace (el USD de calbee 2026 tiene
once). Lo que se bloquea es el **silencio**, que es lo que hoy cuesta dinero: las
ranuras se llenan **por posición, no por nombre**, así que mover una sección
cambia a qué renglón del `RESUMEN` cae.

## Moneda

La cotización nace en la moneda de la **empresa** — Servicios FTS en MXN, FTS
Full Technology Systems LLC en USD — y la moneda del documento sigue a la empresa
mientras no se toque a mano. Cada renglón puede ir en otra moneda; ahí sí se
convierte (el Excel las suma sin convertir, y ese es uno de los hallazgos del
acervo).

Cuando se convierte hay que decir **de dónde salió el tipo de cambio** — DOF del
día, Banxico FIX, el del banco, acordado con el cliente, o texto libre. Si no se
dice, el revisador lo levanta: en tres meses nadie puede reconstruir el precio
sin ese dato.

## Los colores

⚠️ **Son una aproximación, no una medición.** El conector de SharePoint
devuelve los valores y las fórmulas del libro pero **nada de estilo** — se
comprobó contra `SO11836`: cero información de relleno. Así que la paleta está
puesta a ojo con los colores de Office que usan esas plantillas, no leída del
archivo.

Corregirla es cambiar **ocho variables** al principio de `css/machote.css`
(`--x-banda`, `--x-cab`, `--x-grupo`, `--x-total`, `--x-fila-ok`…) y nada más:
ningún color de tabla está escrito en otro lado, y hay una prueba que lo vigila.
El día que lleguen los colores reales, el cambio es de un minuto.

## El renglón capturado

**Verde = este renglón ya tiene cantidad** (`QTY ≥ 1`). Con diez renglones de
mano de obra fijos por sección, la mayoría en blanco casi siempre, distinguir de
un vistazo lo capturado de lo que falta es la diferencia entre revisar una hoja
y leerla entera.

En teléfono la marca es el **borde** de la tarjeta, no el fondo: un fondo verde
detrás de catorce campos etiquetados no se lee.

## Autoguardado

No hay botón de guardar, y no debe haberlo. Cada cambio —una cifra, el nombre de
una sección, agregar un renglón— programa el guardado medio segundo después de
la última tecla; y al cambiar de pantalla, al cambiar de pestaña del navegador y
al cerrar, lo pendiente se guarda de inmediato. Un punto de color en la barra
superior dice en cuál de los tres estados está: **guardado**, **sin guardar**,
**guardando**.

⚠️ **Hoy guarda en el NAVEGADOR, no en un servidor.** Lo que se captura en una
laptop no lo ve nadie más, y se pierde si se limpian los datos del sitio. Sirve
para que el gesto sea real mientras se valida el backend. Todo eso vive detrás
de `js/almacen.js`, que es **la única pieza que cambia** el día que entre el
Postgres de la suite (`fts-suite-db`, issue #140) — la pantalla no sabe contra
qué guarda. Lo que falta para ese salto está listado dentro de ese archivo.

## El flujo, y el candado

```
En creación  →  En revisión  →  Enviado a Odoo
                                 ↑ exige orden · congela
```

El machote **nace sin orden** — casi siempre nace antes que la orden — y por eso
la SO es opcional mientras se arma. Al enviarlo a Odoo ya no: enviar **es**
confirmar la venta, y una venta sin orden no existe. Si se intenta, el selector
se revierte y dice por qué.

Un machote enviado queda **congelado**: los campos se apagan y desaparecen los
botones de estructura, pero la hoja se sigue viendo — es el documento con el que
se vendió y hay que poder consultarlo. La banda de estado encabeza **todas** las
hojas, no sólo el `DESGLOSE`: catorce campos apagados sin decir por qué son
exactamente el silencio que este módulo persigue.

⚠️ **Enviar todavía NO escribe en Odoo.** La regla vigente del módulo es que
Odoo sólo se consulta. El estado, el candado y la exigencia de orden ya son
reales; la escritura espera a que Esteban levante esa regla.

## Cómo correr las pruebas

```bash
npm i playwright
node comercial/machote/tests/pruebas-navegador.js
```

Corren contra el archivo local, sin servidor, a 380 px y a 1280 px.

⚠️ **No instales `@playwright/cli` en este repo sin fijar la versión.** Arrastra
un `playwright-core` de prerelease cuyo protocolo no habla con el Chromium del
contenedor de Claude Code: el navegador arranca y nunca contesta, y el fallo se
ve como un cuelgue sin mensaje.

Cuatro fallos que encontraron estas pruebas y que leer el código no habría
encontrado:

1. Marcar una casilla del handoff repintaba la vista entera y arrancaba el nodo
   bajo el cursor, así que el clic siguiente fallaba.
2. `.oc` es una pastilla con `white-space: nowrap`. Usarla para un párrafo
   empujaba el documento a **859 px** dentro de una ventana de 380.
3. Un `<input>` sin `flex` usa su ancho intrínseco (~177 px). Dos en la misma
   fila desbordaban la pantalla del reparto de comisiones.
4. La fila de mano de obra desbordaba 7 px por no dejar encoger los campos.
5. `shared/fts-styles.css` define `.btn{width:100%}` para el kiosko. En la barra
   fija eso hacía que "Revisar" se comiera el ancho entero y el precio quedara
   en **cero px**: la pantalla se veía bien y el dato no estaba.
6. `td[colspan]{display:none}` ocultaba también los títulos de grupo de las
   tarjetas, que son justo lo que las ordena.
7. Repintar el libro desde el `change` del nombre de sección reventaba con
   *"the node to be removed is no longer a child of this node"*: ese `change`
   llega **durante el blur** del campo, y el repintado arranca el nodo que el
   navegador todavía está soltando. La pestaña se corrige en su lugar.

## Lo que falta para que esto deje de ser prototipo

- Leer y escribir machotes reales: hoy los datos viven en memoria.
- El importador tiene que aceptar que **parte del acervo no usa el machote**
  (`SO11557` es una orden confirmada con un libro libre) y que en las
  cotizaciones grandes **las secciones se renombran** al alcance real.
- Los umbrales de `reglas.js` marcados `SUPUESTO` necesitan números de FTS.
- El cuestionario de diagnóstico es invención: el machote no lo tiene.
