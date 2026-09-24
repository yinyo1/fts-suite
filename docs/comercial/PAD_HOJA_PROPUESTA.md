# El pad como hoja de cálculo — propuesta

**Estado: ✅ CONSTRUIDA en la V1.41.** Este documento se escribió como propuesta y se
aprobó así; queda como el porqué de las decisiones. Lo que cambió al construirlo está en
§8 al final — dos cosas, y las dos por medir, no por opinar.

Lo que hay hoy (V1.36–V1.40) es un **área de texto libre** por sección, anclada al borde
inferior, con un concepto, un importe y un botón «Pasar a renglón». Lo que Esteban y
Montalvo quieren es **una hoja de verdad**: celdas, columnas, filas, y cuentas dentro.

---

## 1 · Hasta dónde llega la primera versión

**Recomendación: rejilla con referencias entre celdas y UNA función, `SUMA`. Nada más.**

| entra en la v1 | NO entra |
|---|---|
| Rejilla de 4 columnas (una de rótulo + tres de número) × filas que crecen solas | Más de una hoja por sección |
| Números y texto en cualquier celda | Formatos (negritas, colores, anchos) |
| Fórmulas con `=`: `+ − × ÷`, paréntesis, y **referencias** (`=A1*B1*450`) | Referencias a OTRA sección o a otro machote |
| **Una** función: `=SUMA(C1:C5)` | Cualquier otra función (PROMEDIO, SI, BUSCAR…) |
| Detección de referencia circular, con aviso en la celda | Recálculo incremental (se recalcula todo: son ≤ 60 celdas) |
| Elegir una celda y pasarla a un renglón | Gráficas, ordenar, filtrar, pegar desde Excel |

**Por qué las referencias SÍ, aunque sean lo caro.** Esteban tiene razón en que sumar una
columna y tener referencias son cosas distintas. Pero en el momento en que se dibuja una
rejilla, quien la usa espera escribir `=A1*B1`: es lo que significa «hoja». Una rejilla sin
referencias es una calculadora con renglones, y la petición dice *hoja de cálculo de
verdad*. El caso real que Montalvo ya escribe a mano en el pad de texto —
`3 tramos × 12 m × $450/m + 8 soportes × $1,200 = 25,800` — es exactamente dos filas con
referencias y un total.

**Por qué `SUMA` y ninguna otra.** Es la única que aparece en lo que la gente hace hoy. Cada
función extra es un caso más que mantener y una expectativa más («¿y PROMEDIO?»). Se agregan
cuando alguien las pida, no antes.

---

## 2 · Sin dependencias. Y no por gusto

**Recomendación: cero bibliotecas.** Se escribe a mano, ~250 líneas en `js/pad-hoja.js`.

Las candidatas serias pesan entre **200 KB y más de 1 MB** minificadas (Handsontable,
jspreadsheet, x-spreadsheet, Luckysheet), varias con licencia comercial o GPL, y todas traen
su propio modelo de datos y su propio ciclo de render — que es justo lo que pelearía con el
documento append-only de abajo. Sería la primera dependencia de escala de framework en un
módulo que hoy son archivos estáticos sin build.

Lo único difícil es el evaluador de fórmulas, y son ~150 líneas: tokenizador + descenso
recursivo, más un orden topológico para saber qué celda calcular antes que cuál.

🔴 **Y hay una razón dura, no de gusto: `eval` y `new Function` quedan PROHIBIDOS aquí.** El
contenido del pad lo escribe una persona, se guarda en el servidor y lo abre otra —incluido
quien recibe un machote prestado o cedido—. Evaluar ese texto es ejecutar código de otro en
una página que tiene la sesión abierta. O sea que el parser tiene que ser de verdad, y eso
descarta el atajo de dos líneas que haría tentador no escribirlo.

---

## 3 · Qué se pasa al renglón

**La inclinación de Esteban es la correcta, con un matiz.**

- Se pasa **el valor de la celda que la persona elija**. La hoja entera no: un renglón tiene
  un importe, no una tabla.
- El **comentario del renglón lleva cómo salió**: el rótulo de la fila, la fórmula tal como
  se escribió, y el valor al que resolvió. Por ejemplo:
  `Tramos · =A1*B1*450 (3 × 12 × 450) = 16,200`.
- **No** se vuelca la hoja completa al comentario. Hoy se pasa el texto entero porque el pad
  ES un texto; con celdas, volcarlo todo haría comentarios de veinte renglones que nadie lee.

Lo que se conserva del contrato actual: el renglón se lleva el importe y **el comentario
explica de dónde salió**, que es la razón de ser del pad («para que dentro de seis meses se
sepa de dónde salió»). Cambia el formato, no la promesa.

---

## 4 · Cómo se guarda, sin romper el append-only

La hoja vive **dentro de `seccion.pad`**, donde ya vive el texto:

```
pad: {
  hoja:  [ ["Tramos","3","12","=A1*B1*450"], ["Soportes","8","1200","=A2*B2"], … ],
  elegida: "C3",
  concepto: "Canalización tramo norte"
}
```

Tres reglas, y las tres importan:

1. **Se guarda lo que se escribió, nunca lo que se calculó.** Las fórmulas van como texto y
   los valores se recalculan al abrir. Un valor guardado se separa en silencio de sus
   entradas el día que alguien cambia una celda por otro camino — es la misma familia del
   `200` que no prueba la escritura (§8): un número almacenado no prueba su propia cuenta.
2. **Entra en la huella del documento**, igual que el texto de hoy, así que «falta por subir»
   sigue diciendo la verdad cuando lo único que cambió fue la hoja.
3. **Tamaño**: una hoja de 4 × 20 con celdas cortas son ~1–2 KB. El machote real de Montalvo
   («Caseta para Antonio», v55) pesa **14,036 bytes** con sus 60 renglones, así que una hoja
   por sección no mueve la aguja. Si alguna creciera, se topa el número de filas y se dice.

Nada de esto toca el mecanismo de versiones: cada guardado congela el documento entero como
ya lo hace, y la hoja viaja dentro.

---

## 5 · A 380 px — medido, no prometido

Maqueta de 4 columnas dentro del panel anclado, con las alturas reales:

```
ancho   panel            celdas (rótulo, A, B, C)   alto celda   desborde horizontal
1280    319px de 900 (35%)   500 / 250 / 250 / 250      40px          no
 760    319px de 900 (35%)   292 / 146 / 146 / 146      40px          no
 380    319px de 740 (43%)   140 /  70 /  70 /  70      40px          no
 320    333px de 640 (52%)   116 /  58 /  58 /  58      40px          no
```

**Lo bueno:** cabe. Cuatro columnas, cinco filas visibles, sin desborde horizontal a ningún
ancho, y cada celda cumple los 40 px del mínimo táctil. El panel ocupa 43% de la pantalla a
380, por debajo del tope del 80% que ya vigila la prueba de la V1.36.

🔴 **Lo malo, y es el hallazgo:** en una celda de 70 px **los números caben y las fórmulas
no**. En la captura, `=SUMA(C1:C2)` se ve como `=SUMA((`. Escribirla a ciegas es inaceptable.

**Solución, que es la que usan todas las hojas en teléfono: una barra de fórmula.** Una línea
de ancho completo arriba de la rejilla que muestra y edita el contenido de la celda elegida.
En el teléfono es donde se teclea de verdad; la rejilla queda para navegar y ver resultados.
En escritorio se edita en la celda y la barra sólo acompaña.

Sin esa barra, la hoja a 380 es una promesa que no se cumple. **Con ella, el costo sube ~30
líneas y una fila más de panel.** Va incluida en la recomendación.

---

## 6 · Que se encuentre

La lección de la V1.39: el defecto no fue que el pad no existiera, fue que nadie llegaba.
Hoy ya está resuelto a medias — se aterriza en la sección y el botón dice «Pad de trabajo» —
y para la hoja hace falta una cosa más:

- El botón conserva el **punto neutro** cuando la hoja tiene algo escrito, como hoy.
- Y cuando tiene algo, el botón dice **cuántas filas**: «Pad de trabajo · 3». Un punto dice
  que hay algo; un número dice cuánto, y es la diferencia entre abrirlo y no.

---

## 7 · Costo y orden

| paso | qué | estimado |
|---|---|---|
| 1 | Rejilla + celdas + barra de fórmula, SIN fórmulas (sólo números y texto) | media sesión |
| 2 | Evaluador: tokenizador, descenso recursivo, referencias, `SUMA`, ciclos | una sesión |
| 3 | Pasar la celda elegida a renglón, con el comentario nuevo | media sesión |
| 4 | Guardado, migración del texto viejo a la primera columna, pruebas | media sesión |

**La migración del pad de texto que ya existe**: hoy hay **0 pads escritos** en las 45
secciones vivas (medido). Así que no hay nada que migrar — pero el código tiene que seguir
abriendo un `pad.texto` viejo sin romperse, porque el día que alguien escriba uno antes de
este cambio, ese texto es suyo.

---

## Lo que hace falta decidir antes de construir

1. **¿Referencias en la v1, o sólo sumar columnas?** Mi recomendación es referencias; es lo
   que separa una hoja de una calculadora, y es lo que Montalvo ya escribe a mano.
2. **¿La hoja SUSTITUYE al texto libre, o conviven?** Mi recomendación es que lo sustituya:
   dos superficies para pensar en la misma sección es el error que acabamos de deshacer con
   la banda de comisión. La primera columna de la rejilla es el sitio del texto.
3. **¿Cuántas filas de tope?** Propongo 20, con las filas creciendo solas y un aviso al
   llegar. Sin tope, una hoja larga vuelve el panel inservible en el teléfono.


---

## 8 · Lo que cambió al construirlo

Dos cosas, y las dos salieron de medir, no de opinar.

### a · Se cayó el campo «Concepto» aparte

La propuesta conservaba el campo de concepto del pad de texto. Al armar la rejilla quedó
claro que **la primera columna ya es eso**: el rótulo de la fila explica la cuenta, y es lo
que tiene que llegar al renglón como descripción. Mantener los dos sería otra vez dos
sitios para el mismo dato — el error que se acababa de deshacer con la banda de comisión.

Así que «Pasar a renglón» toma el rótulo de la fila de la celda elegida. Si esa fila no
tiene rótulo, lo pide antes de pasar nada.

### b · La rejilla recortaba los importes a 380 px, y la maqueta no lo había visto

La medición de la propuesta (§5) dio celdas de 70 px y concluyó que los números cabían y
las fórmulas no. **Con la rejilla de verdad la celda quedó en 54 px** —la columna del
número de fila, que la maqueta no tenía, se comió 26— y entonces **tampoco cabían los
importes**: `$16,200` se leía `$16,2(`.

Un importe recortado es peor que uno ausente: se lee como otro número. **Se vio en la
captura, no en el diff ni en los conteos, que daban todos verdes.**

Se corrigió apretando lo que sobraba en teléfono —rótulo de 38% a 32%, número de fila a
22 px, cuerpo a 12 px—, sin tocar el mínimo táctil. La celda pasó de 54 a 61 px y los tres
importes caben. Y la prueba **ya no lo mira a ojo**: compara `scrollWidth` contra
`clientWidth` de cada celda a los cuatro anchos, que es lo único que detecta un recorte de
un carácter.

### Lo que NO cambió

El alcance (referencias + `SUMA`), las cero dependencias, la prohibición de `eval`, el
guardado de la fórmula como texto, la barra de fórmula y la detección de ciclos quedaron
como estaban escritos. El único hallazgo del evaluador fue que las celdas **río abajo de un
ciclo** enseñaban `0` con confianza; ahora el error se propaga y se marcan todas.
