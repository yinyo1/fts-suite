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
| `js/pegar.js` | El pegado de tablas: separador, columnas y revisión previa. |
| `js/almacen.js` | El autoguardado. UNA pieza entre la pantalla y donde viven los datos. |
| `js/clientes.js` | El catálogo de clientes, leído de Odoo. Guarda el id, pinta el nombre. |
| `tests/pruebas-navegador.js` | 109 pruebas de navegador. |

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

## Los multiplicadores son de cada sección

Los cuatro —programador, mano de obra, materiales, servicios— **pertenecen a la
sección**, no a la cotización. Mover el de materiales en `Suministro` no toca el
de `Instalación`.

No es una preferencia: el suministro y la instalación no se venden con el mismo
multiplicador, y cuando eran uno solo, **corregir una sección movía el precio de
todas sin que nadie lo viera**. El campo estaba en la hoja de la sección, así que
parecía de la sección; el dato estaba en el machote.

**Lo único compartido son las dos comisiones**, FTS y cliente: esas se pactan una
vez para la cotización entera. Están en la misma tabla, así que la hoja lo dice
en una línea — dos reglas distintas pegadas una debajo de otra, si no se
explican, se leen como una sola.

Se resuelven en **tres capas: plantilla ← machote ← sección**, y la de abajo
manda. Esa capa intermedia es la que sostiene lo ya capturado: una sección sin
`margenes` propios lee los del machote y muestra exactamente los mismos números
que mostraba. **No hay nada que migrar y ningún machote cambia de precio.** La
primera vez que alguien toca un multiplicador, esa sección —y sólo esa— se
queda con el suyo.

El revisador también cambió de granularidad: los hallazgos de multiplicadores
dicen **en qué sección**, y el botón «Ir a arreglarlo» abre esa hoja. Mientras
fueron del machote daba igual; ahora mandar a la primera sección es mandar a la
equivocada.

**Esto no es una preferencia de diseño: es lo que hace el machote real.** La
tabla vive en `E1:F5` de **cada hoja de sección**, y ahí los cuatro
multiplicadores son **valores literales**; las dos comisiones, en `F6`/`F7`, son
**referencias** a `'DESGLOSE COTIZACION'!B7` y `!B8`. Literal contra referencia
es exactamente la línea entre «se decide por sección» y «se pacta una vez». Lo
confirma la fórmula de horas extras, `=$F$3*2`: `$F$3` es la mano de obra **de
la misma hoja**. Detalle en
[`docs/comercial/MACHOTE-ESTRUCTURA-REAL.md`](../../docs/comercial/MACHOTE-ESTRUCTURA-REAL.md) §2.2.

## La pantalla

La hoja se dibuja con la retícula del machote: pestañas por hoja, el bloque de
`Costos desglosados` y la tabla de márgenes arriba, `COSTO MANO DE OBRA` con sus
diez renglones fijos en tres grupos, y `COSTO MATERIALES Y SERVICIOS` con sus
trece columnas. La hoja `DESGLOSE COTIZACIÓN` trae los tres escenarios, el
`RESUMEN BUDGET`, las diez ranuras de sección, el `BUDGET ODOO` y la tabla de
comisiones.

**En teléfono la retícula desaparece.** Trece columnas con el pulgar no se
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
detrás de once campos etiquetados no se lee.

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
hojas, no sólo el `DESGLOSE`: una hoja entera de campos apagados sin decir por
qué es
exactamente el silencio que este módulo persigue.

⚠️ **Enviar todavía NO escribe en Odoo.** La regla vigente del módulo es que
Odoo sólo se consulta. El estado, el candado y la exigencia de orden ya son
reales; la escritura espera a que Esteban levante esa regla.

## Buscar, y empezar uno nuevo

La pantalla de entrada es un **buscador**, no una lista: busca por nombre,
cliente —el vivo de Odoo y el guardado—, número de orden, id del machote e **id
del cliente en Odoo**, palabra por palabra —«topo chico» y «chico topo»
encuentran lo mismo— y filtra por estado con chips que traen su cuenta. **Los
contadores son del total, no de lo ya filtrado**: un contador que cambia al
filtrar no sirve para saber cuántos hay. Y cuando no hay resultados, dice qué se
buscó, porque una lista vacía sin explicación parece que perdió los machotes.

**Un machote nuevo** nace con:

- la hoja `DESGLOSE COTIZACIÓN`, que siempre existe y no es una sección;
- una `SECCIÓN 1`;
- los **diez** renglones de mano de obra con su tarifa de plantilla y **las horas
  en cero** — la tarifa se pisa, las horas se capturan;
- **treinta** renglones de materiales vacíos, con el `Tipo` sin elegir: Materiales
  o Servicios se decide renglón por renglón, y es la columna que escoge el
  multiplicador.

El machote real trae **~180 renglones en blanco** por sección. Ciento ochenta
vacíos no son fidelidad, son un muro —y en teléfono, ciento ochenta tarjetas—.
Treinta cubren lo que se ve en el acervo y `+ partida` agrega sin límite.

Un renglón en blanco **no se marca como hueco**. «Sin precio» sale sólo en uno
que alguien empezó a llenar; en los treinta vacíos sería una alerta que aparece
siempre, y una alerta que aparece siempre deja de leerse.

## Pegar una tabla

El proveedor ya mandó la lista escrita. Volverla a teclear no es sólo lento: es
donde se cuela el error de dedo **en el precio**, que es el dato que nadie vuelve
a verificar.

`js/pegar.js` interpreta un bloque pegado —de Claude, de un correo, de Excel, de
un PDF— y saca cantidad, unidad, tipo, descripción, precio y moneda. Si la
tabla trae la especificación, el modelo o la marca en columnas aparte, los
**suma a la descripción** separados por `·`, que es donde viven ahora. Elige el separador **por consistencia, no por frecuencia**: gana el que
produce el mismo número de columnas en la mayoría de los renglones, porque uno
que da 3 columnas en una fila y 7 en la siguiente no es el separador, es un
carácter que salía en el texto.

Sin encabezado, adivina por la **forma** de los datos: la columna con más texto
largo es la descripción, y de las numéricas, **la que trae enteros es la cantidad
y la que trae decimales es el precio**. Ordenar por magnitud fallaba en cuanto la
lista traía muchas piezas baratas — «250 cables a 18.50» ponía la cantidad del
lado del precio.

También entiende **listas y texto corrido**, no sólo tablas: viñetas, numeración,
la unidad pegada a la cantidad («4 pzas», «12 mts») y el precio al final. Cuando
no hay columnas, cada renglón se lee por su cuenta — cantidad al principio,
precio al final, descripción en medio.

El orden de preferencia importa y está pensado: un **separador de verdad**
(tabulador, `|`, `;`, coma) manda siempre; si sólo hay espacios pero la primera
fila es un encabezado reconocible, es una **tabla de PDF**; si no, se lee como
**lista**; y los espacios a ciegas quedan de último recurso. Sin ese orden, el
fallback por espacios se comía las listas y dejaba la viñeta y la cantidad
dentro de la descripción.

⚠️ **La coma no se acepta si partió un número.** «$4,200.00» se ve como dos
columnas perfectas —«$4» y «200.00»— en todos los renglones, así que la prueba
de consistencia la aprueba con honores y el resultado es basura. La comprobación
va sólo en `,` y `;`, que son los que viven dentro de una cifra: aplicarla al
tabulador lo descartaba en falso con una descripción que termina en dígito
(«Tubo cédula 40»).

**Empieza donde tú digas.** El botón `⇥` vive **en cada renglón**, no en la
sección: el punto donde arranca el pegado es una decisión del capturista, y casi
siempre hay algo capturado arriba que no se toca. Se elige entre **escribir
debajo** o **escribir arriba** del renglón señalado. En los dos
casos lo que ya estaba **se recorre, no se sobrescribe**: la única decisión es
dónde va, que es la que de verdad importa.

Es la **primera columna** de la tabla, y **se queda fija** al desplazar en
horizontal. Nació al final, después de trece columnas, y ahí quedaba **fuera de
la pantalla**: medido, `x=1473` con la ventana en 1440 px, con 218 px de arrastre
para dar con él. Existía y las pruebas lo alcanzaban —Playwright desplaza solo
antes de hacer clic— así que pasaban en verde mientras nadie lo encontraba.
**Existir y poder encontrarse no son lo mismo**, y ahora hay una prueba que mide
que los dos botones fijos —pegar y borrar— caigan dentro de la ventana a 1440,
1280 y 1024 px, y que a 1440 la tabla no desborde ni un píxel.

**No depende del orden de las columnas.** Hay listas donde el precio va primero
y la cantidad en medio (`$ 890.00 c/u - 8 PZAS - Lámpara LED…`). Leer por
posición rechazaba esa lista entera; ahora cada pedazo del renglón se clasifica
por **lo que es** —un precio trae `$` o dice `c/u`; una cantidad es un número con
su unidad— y la descripción es lo que sobra.

**La columna de unidad se reconoce por su contenido**, no por su encabezado: una
tabla de `5 | PZA | … | 2,450.00` no dice en ningún lado que la segunda columna
sean unidades, y antes se perdía entera. `PZA`, `MTS`, `JGO`, `HORA` se llevan a
`Pieza`, `Metro`, `Juego`, `Horas`; lo que no está en el catálogo **se queda tal
cual**, porque el acervo tiene unidades propias y borrarlas sería peor.

**El Tipo se deduce de la descripción** cuando la lista no lo trae, y sale
marcado como *deducido* en la vista previa. La señal del **principio pesa el
triple**: «Instalación de tubería de cobre» es un servicio aunque traiga dos
sustantivos de material detrás — lo que se cotiza es la acción, y el material es
su objeto. Contando parejo salía Materiales, que es exactamente al revés. Si no
hay señal clara, se queda vacío.

⚠️ **Lo que el pegado no resuelve, no lo borra.** Se hereda del renglón donde
estás pegando. Antes, pegar una lista sin columna de Unidad dejaba en blanco los
`Pieza` y `Horas` ya capturados — reproducido y medido. Un pegado que borra datos
que no venía a tocar es peor que no pegar.

### Las tablas que escribe Claude

Vienen en Markdown, y traían **tres trampas a la vez** que las tiraban enteras a
la lectura por lista —el encabezado terminaba convertido en un renglón, que es
justo lo que se reportó—:

- **El maquillaje.** Claude pone los precios en negritas, `**$76,379**`. El
  asterisco convertía el precio en texto ilegible, así que la fila del
  encabezado dejaba de parecerse a un encabezado. Se quitan `**`, `__` y las
  comillas invertidas antes de mirar nada.
- **La unidad dentro de la cantidad.** La celda dice `1 pza`, `240 m`,
  `10 juegos`. Si la columna de unidad no viene aparte, se parte ahí: número a
  `QTY`, palabra a `Unidad`.
- **La columna del precio viejo.** Un encabezado que diga `anterior`, `previo`,
  `antes` u `original` es el precio de la cotización pasada, y ganaba por estar
  primero. Ahora se descarta a propósito: el que entra es el **nuevo**.

**Nada se aplica solo.** Interpreta, enseña lo que entendió renglón por renglón
con sus avisos, y escribe cuando alguien lo aprueba mirándolo. Un parser que
acierta el 90% y aplica solo mete un 10% de basura que nadie ve.

El `Tipo` que no venga en la tabla **queda vacío**: Materiales o Servicios elige
el multiplicador, y adivinarlo movería el precio.

## El cliente sale de Odoo

Al crear un machote, el cliente se elige de una **lista leída de Odoo en vivo**
—escribiendo se filtra— y lo que se **guarda es el id** (`1247`), no el nombre.
El nombre se lee de Odoo cada vez que se pinta.

No es un detalle de forma. Si a un cliente le cambian la razón social, las
cotizaciones viejas la muestran corregida solas; con el nombre copiado se
quedarían con la versión del día que se capturaron. Y **este repo es público**:
el día que los machotes salgan del navegador, lo que viaje es un número, no la
cartera de clientes.

**El catálogo no se guarda en el repo ni en `localStorage`** — vive en Odoo y se
cachea en memoria mientras la pestaña está abierta. Sólo llegan al navegador las
**empresas** (`is_company`): los otros 483 registros con `customer_rank > 0` son
los **contactos persona** de cada cliente, con nombre y apellido de gente real.
Y de cada uno sale únicamente `id` y `nombre`: ni correo, ni teléfono, ni RFC.

**Si Odoo no contesta, el campo sigue siendo texto libre y se guarda igual**, con
un aviso que dice por qué la lista está vacía. Un prospecto que todavía no está
dado de alta también se acepta, como texto y sin id. Nunca se bloquea crear un
machote porque el catálogo no llegó — el machote casi siempre nace antes que la
orden, y a veces antes que el cliente.

Detalle completo, con el endpoint y lo que quedó sin verificar, en
[`docs/comercial/CLIENTES-DESDE-ODOO.md`](../../docs/comercial/CLIENTES-DESDE-ODOO.md).

## Porcentajes en la pantalla, razones en el archivo

Las comisiones y el margen deseado se **escriben y se leen en por ciento** —
`5.5`, `40`— con el `%` a la derecha del campo. Adentro siguen siendo razones
(`0.055`, `0.4`), que es lo que el motor multiplica y lo que el machote real
guarda.

La conversión vive en **dos lugares y nada más**: `celPct()` al pintar (×100) y
`aplicar()` al guardar (÷100, redondeado a ocho decimales para que `5.5 %` no
vuelva como `0.055000000000000005`). Nadie pedía calcular con `0.055` a mano:
la gente que cotiza piensa en 5.5 %, y verlo en decimales era leerlo mal a la
primera.

**Los multiplicadores no llevan `%`.** `2.5` es «dos veces y media el costo»,
no «dos y medio por ciento»; ponerles el signo habría sido peor que no
convertirlos.

## Que la fila quepa

La tabla de materiales cabe en la pantalla **sin arrastre horizontal**, medido a
1440, 1280 y 1024 px.

Tres cosas la metieron adentro:

- **Fuera `Marca` y `Modelo`.** Eran dos columnas de 200 px que se llevaban el
  ancho que necesita la descripción, que es lo que en realidad se lee. Van
  **dentro de la descripción** —el encabezado lo dice— y el pegado las une ahí
  solo cuando la tabla que se pega las trae por separado.
- **La descripción se queda con el ancho** (`min-width: 260px; width: 40%`) y el
  resto de los campos se acortó a lo que su contenido necesita.
- **Las dos columnas de acciones se fijan a los bordes**: pegar `⇥` a la
  izquierda, y mover/duplicar/borrar a la derecha. Aunque un día la tabla vuelva
  a desbordarse por una descripción larguísima, **el botón de borrar sigue
  visible** — que es exactamente lo que se reportó desde las pruebas con la
  gente.

## Lo que decide el verde

Un renglón se pinta cuando tiene **cantidad y precio**. Con sólo la cantidad está
a medias y no aporta un peso al total; pintarlo diría «listo» de algo que todavía
no suma.

## Nada negativo

Ni horas, ni personas, ni precios, ni multiplicadores. Se corta en el **único
escritor** (`setPath`) y no en cada campo: el `min=0` del input frena las
flechitas y el teclado, pero no frena escribir «-5» ni pegarlo. Un precio
negativo no se ve como un error — se ve como un total más chico, que es peor.

## Borrar un machote

Se borra **En creación** y **En revisión**. **Enviado a Odoo no se borra nunca**:
es el documento con el que se vendió, y si desaparece, desaparece la única
explicación de por qué el precio fue ese. Lo que se hace con él es cambiarle el
estado. El candado está en dos lados —no se pinta el botón, y el manejador lo
vuelve a comprobar— porque el primero es cosmético.

## Quién entra

El libro está detrás de un gate: `shared/auth-jwt.js`, cliente de
**`auth/suite-login`** — el mismo emisor de identidad que usa RH (Fase 0 del
issue #136). Pide el permiso `comercial:read`. El **nombre** de quien entró se
ve en la barra superior —no su usuario: `esteban.delacruz` truncado a
`esteban.delac…` no dice quién está capturando; el usuario exacto queda en el
`title`— y ahí mismo se cierra la sesión.

⚠️ **El gate decide si la pantalla se PINTA, no si el archivo se descarga.**
GitHub Pages es público. Sirve para saber quién está probando y que su input sea
atribuible, no para esconder el machote. Lo que protegerá de verdad es que los
webhooks exijan el token cuando existan datos en servidor.

Cómo dar de alta a alguien, y una trampa del salt que costó un generador entero:
[`docs/comercial/ACCESO.md`](../../docs/comercial/ACCESO.md).

Las pruebas **se autentican solas** sembrando una sesión antes de cargar la
página, en vez de que el gate traiga una excepción para `file://`: una excepción
es un camino que puede quedarse abierto en producción sin que nadie lo note
(CLAUDE.md §11 #14). Que el gate bloquea de verdad se prueba aparte, en páginas
sin esa sesión — sin sesión, con sesión vencida, y con sesión sin el permiso.

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
- **Activar el webhook `comercial/clientes`** (`RyeFlCTdLu301Gjz`) en la UI de
  n8n: el API no deja activarlo por MCP. Mientras esté apagado, el campo de
  cliente funciona como texto libre y lo avisa.
