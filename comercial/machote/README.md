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

## Archivos

| archivo | qué es |
|---|---|
| `js/calc.js` | El motor. Todo número que se ve sale de aquí; ninguna vista calcula. |
| `js/reglas.js` | 28 reglas en un arreglo de configuración, separadas del motor que las corre. |
| `js/demo.js` | Datos de ejemplo. Lo que viene del machote real va marcado `REAL`; lo inventado, `SUPUESTO`. |
| `js/app.js` | Vistas y ruteo. |
| `tests/pruebas-navegador.js` | 21 pruebas de navegador. |

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

## Cómo correr las pruebas

```bash
npm i playwright
node comercial/machote/tests/pruebas-navegador.js
```

Corren contra el archivo local, sin servidor, a 380 px y a 1280 px.

Cuatro fallos que encontraron estas pruebas y que leer el código no habría
encontrado:

1. Marcar una casilla del handoff repintaba la vista entera y arrancaba el nodo
   bajo el cursor, así que el clic siguiente fallaba.
2. `.oc` es una pastilla con `white-space: nowrap`. Usarla para un párrafo
   empujaba el documento a **859 px** dentro de una ventana de 380.
3. Un `<input>` sin `flex` usa su ancho intrínseco (~177 px). Dos en la misma
   fila desbordaban la pantalla del reparto de comisiones.
4. La fila de mano de obra desbordaba 7 px por no dejar encoger los campos.

## Lo que falta para que esto deje de ser prototipo

- Leer y escribir machotes reales: hoy los datos viven en memoria.
- El importador tiene que aceptar que **parte del acervo no usa el machote**
  (`SO11557` es una orden confirmada con un libro libre) y que en las
  cotizaciones grandes **las secciones se renombran** al alcance real.
- Los umbrales de `reglas.js` marcados `SUPUESTO` necesitan números de FTS.
- El cuestionario de diagnóstico es invención: el machote no lo tiene.
