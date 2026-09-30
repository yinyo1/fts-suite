# Prototipos de la Estación 3

Cuatro **maquetas**. Se abren con doble clic, no necesitan servidor y **no están
conectadas a nada**: no leen Odoo, no leen Postgres, no llaman a ningún webhook y
ningún botón escribe. Todos los nombres e importes están **inventados** — este
repositorio es público (CLAUDE.md §20 #7).

Sirven para decidir **la forma y el texto** antes de construir la pantalla.

| archivo | qué enseña |
|---|---|
| [`confirmacion.html`](confirmacion.html) | **El importante.** Los **17 candados** de `docs/trazabilidad/ESPECIFICACION-CONFIRMACION.md` §3.1, cada uno en su estado real, con su código y su texto real, y los 9 pasos de escritura. Se recorre tocándolo: los candados rojos tienen botones que los resuelven y el botón de confirmar se enciende solo cuando pasan. |
| [`ordenes.html`](ordenes.html) | La lista de órdenes de venta con la densidad de Odoo 19, el filtro anunciado como banda, y la liga machote ↔ orden. |
| [`comision-selector.html`](comision-selector.html) | El reparto de comisión y el flujo de autorización del beneficiario, en sus cuatro estados. |
| [`rentabilidad-4-numeros.html`](rentabilidad-4-numeros.html) | Vendido · costo planeado · facturado · costo ejercido, siempre los cuatro. |

## Los estados de los candados, y por qué se distinguen

`pasa` · `frena` · `avisa` son lo que se espera. Los otros dos existen a propósito:

- **`no construido`** (morado) — el candado **hoy no revisa nada**. Pintarlo igual
  que `pasa` sería el vacío que se lee como respuesta (CLAUDE.md §20 #11).
- **`del servidor`** (gris) — se revisa al confirmar, allá, no en el navegador.

## El estilo va DENTRO del archivo, y es a propósito

`_comun.css` es la **fuente única** del estilo, pero **no se enlaza**: va copiado
dentro de cada HTML.

La razón es que **GitHub Pages construye con Jekyll y Jekyll no publica los
archivos cuyo nombre empieza con `_`**. Enlazarlo se ve perfecto en el disco y
llega vacío al dominio: es lo que tuvo los cuatro prototipos en Times New Roman,
sin tarjetas y sin el propio aviso de que son maquetas —porque el aviso también
es CSS—. El repo ya tiene un `.nojekyll` en la raíz que corta esa clase de fallo
para todo el sitio, y aun así el estilo va inline: para algo que tiene que verse
igual en un disco, en una rama y en el dominio, lo sólido es **no tener una
segunda petición que pueda faltar**.

Para cambiar el estilo:

```bash
# edita _comun.css y luego
node comercial/prototipos/e3/sellar.js            # lo mete en los cuatro
node comercial/prototipos/e3/sellar.js --revisar  # sólo avisa si alguno quedó desfasado (sale 1)
```

`sellar.js` se niega a guardar un archivo que después de sellarlo siga pidiendo
algo de fuera. No edites el bloque `<style id="comun">` a mano: lo sobreescribe.
