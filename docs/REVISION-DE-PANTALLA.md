# Revisión de pantalla: qué se mira, en qué tamaños, y por qué

Es un **paso fijo**, no un acierto. Va en el repo porque tres veces seguidas
salieron cosas que el diff no muestra y la captura sí, y las tres veces se
encontraron por suerte — porque a alguien se le ocurrió mirar.

> **La regla:** toda pantalla nueva o modificada se abre en el navegador y se
> **mira la captura** antes de darla por hecha, aunque el cambio sea de tres
> líneas. El diff no es evidencia de cómo se ve.

## El historial que lo justifica

| cuándo | qué | por qué el diff no lo mostraba |
|---|---|---|
| 7-sep (#140) | Un `const` usado antes de su línea **tiraba la función entera** y la lista salía en blanco | las dos líneas son correctas por separado |
| 7-sep (#140) | `.kpi` reusado: el tablero nuevo salió con tres cajas donde iba una | el CSS nuevo es correcto; el choque está en otra parte del archivo |
| 15-sep (#240) | Un renglón de **218 px** donde los demás miden 31, por una celda que envolvía | la celda cae fuera de la pantalla: se veía un hueco, no un texto |
| 15-sep (#240) | `.fnt` (`display:block`) dentro de una frase: oración partida en tres con una coma colgando | la clase es correcta donde nació |
| 15-sep (#240) | Un `<a>` sin clase con el azul de fábrica (#0000EE), ilegible sobre fondo oscuro | no hay regla que lo pinte: el bug es una **ausencia** |

Cuatro de los cinco son **colisiones o ausencias de CSS**. Un diff enseña lo que
cambió; estos salen de lo que *ya estaba* o de lo que *no está*.

## Los dos tamaños

| tamaño | ancho | qué se busca |
|---|---|---|
| escritorio | **1440 px** | lo normal |
| teléfono | **400 px** | que nada se salga y que los filtros no se apilen mal |

Captura **`fullPage`** en los dos. Media pantalla no sirve: el renglón de 218 px
estaba a dos tercios de la tabla.

## La lista

**1. Errores de consola.** `pageerror` o `console.error` durante la carga es un
**fallo**, no ruido. Los dos bugs del 7-sep lo emitían.

**2. Altura de los renglones.** Medir la **mediana** y el **máximo**. Un máximo
que pasa de ~2× la mediana es una celda que envuelve sin tope. Medido:

```
semáforo ANTES   mediana 31 · max 218  =  7.0x   <- bug
semáforo DESPUÉS mediana 31 · max  52  =  1.7x   <- bien
rentabilidad     mediana 38 · max  71  =  1.9x   <- bien (contenido acotado)
```

**3. Desbordamiento horizontal del cuerpo.** `documentElement.scrollWidth >
innerWidth` a 400 px tiene que ser **falso**. Que la *tabla* desborde dentro de su
`.tablabox` está bien: eso tiene `overflow-x:auto`.

**4. Clases reusadas.** Antes de inventar un nombre, **buscarlo en el archivo**.
Si ya existe, significa otra cosa. Y **ninguna clase `display:block` dentro de una
frase**: hace falta una variante en línea.

**5. Enlaces.** Todo `<a>` tiene que tener color propio. `.wrap a` ya lo cubre en
el armazón; comprobar que ninguno se quedó con el azul del navegador:
`document.querySelectorAll('.wrap a:not([class])')` y mirar su `color` calculado.

**6. Los caminos de error, no sólo el feliz.** Un panel pasa más tiempo
enseñando un aviso que datos el día que algo falla. Se prueban los tres
interceptando la respuesta: **404** (endpoint sin publicar), **red caída**, y
**`SCOPE_INSUFICIENTE`**. Y se comprueba **cuál borra la sesión**: sólo el de
sesión. Si el 404 te saca, el equipo pierde su sesión cada vez que falta un clic.

**7. El estado vacío.** Filtrar hasta 0 filas y leer lo que dice.

**8. Si se tocó un archivo compartido** (`shared/panel/*`), **volver a mirar los
otros paneles**. Un cambio en el armazón es un cambio en todos.

## El arnés

Chromium con Playwright (`NODE_PATH=/opt/node22/lib/node_modules`), un servidor
estático local, y la respuesta del endpoint **interceptada con `page.route`** a
partir de un snapshot real commiteado. Así se mira la pantalla con datos de
verdad **sin llamar a producción y sin mandar un solo correo**.

La sesión se siembra **una vez** con `page.evaluate` + recarga, **nunca** con
`addInitScript`: éste la re-siembra en cada navegación y **enmascara un logout**.
Ya pasó — una prueba del arreglo del login salió verde siendo falsa por eso.
