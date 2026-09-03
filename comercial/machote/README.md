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

El build se ve en pantalla: al pie de la lista y en la barra superior de cada
cotización. Sirve para una cosa concreta — distinguir *"ya lo cambié"* de
*"estás viendo el caché"*, que sin esto no se puede sin abrir las herramientas
de desarrollo.

Convención de `CLAUDE.md` §8: `YYYYMMDD-<modulo>-<hito>`.

⚠️ **El build vive en dos lugares y hay que moverlos juntos:** la constante
`BUILD` en `js/app.js` y `version.json`. Hay una prueba que falla si se
separan, porque una pantalla que miente sobre su versión es peor que no tener
indicador.

## Archivos

| archivo | qué es |
|---|---|
| `version.json` | El build vigente y su historial. |
| `js/calc.js` | El motor. Todo número que se ve sale de aquí; ninguna vista calcula. |
| `js/reglas.js` | 28 reglas en un arreglo de configuración, separadas del motor que las corre. |
| `js/demo.js` | Datos de ejemplo. Lo que viene del machote real va marcado `REAL`; lo inventado, `SUPUESTO`. |
| `js/app.js` | Vistas y ruteo. |
| `tests/pruebas-navegador.js` | 33 pruebas de navegador. |

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

## Lo que falta para que esto deje de ser prototipo

- Leer y escribir machotes reales: hoy los datos viven en memoria.
- El importador tiene que aceptar que **parte del acervo no usa el machote**
  (`SO11557` es una orden confirmada con un libro libre) y que en las
  cotizaciones grandes **las secciones se renombran** al alcance real.
- Los umbrales de `reglas.js` marcados `SUPUESTO` necesitan números de FTS.
- El cuestionario de diagnóstico es invención: el machote no lo tiene.
