# El Cotizador con nombre completo — propuesta, NO ejecutada

**Issue #294 · medido el 30-sep-2026 · decisión 1 de Esteban.**

> Esteban: *«Monty SÍ es Francisco Montalvo. Y va más allá de traducirlo en la
> vista: quiero que en todos los sistemas se maneje el NOMBRE COMPLETO, no el
> apodo.»*

Este documento dice **cómo se haría** y **en qué orden**. El cambio es de Studio
y de datos de Odoo, así que lo ejecuta Esteban; aquí no se ejecutó nada.

---

## 1 · Lo que hay hoy, medido

`sale.order.x_studio_cotizador` es un **`selection`** — una lista de opciones
escrita a mano en Studio, no un enlace a `hr.employee`. Eso es la raíz de todo
lo demás: un `selection` guarda **texto**, así que no hay ninguna llave por la
que una máquina pueda saber a quién apunta «Monty».

Órdenes por valor, **todos los estados**, leído el 30-sep:

| valor | cancel | draft | sale | sent | **total** |
|---|---:|---:|---:|---:|---:|
| Aldo | 33 | 103 | 53 | 48 | **237** |
| Angel | 1 | 75 | 96 | 55 | **227** |
| Monty | 9 | 45 | 27 | 2 | **83** |
| Ricardo | — | 14 | 13 | 2 | **29** |
| Esteban | — | — | 1 | — | **1** |
| Marcus | — | 1 | — | — | **1** |

Y el padrón, para el caso que nos ocupa:

```
hr.employee 8 · Francisco Montalvo Ramirez · activo · departamento Comercial
```

📌 **El detalle que decide la forma del arreglo: hay DOS empleados activos con el
apellido Montalvo Ramirez**, en departamentos distintos. Así que «Montalvo»
tampoco desambigua — el nombre completo no es una preferencia de estilo, es lo
mínimo que identifica. Y el apodo viene de su cuenta de correo, que empieza por
el apellido; de ahí que se quedara pegado.

---

## 2 · Qué pasa con las 83 órdenes que ya dicen «Monty»

Esta es la pregunta que hay que contestar **antes** de tocar el catálogo, porque
la respuesta cambia el orden de los pasos.

Un `selection` de Odoo guarda en la columna el **valor técnico** de la opción.
Si en Studio se *edita* la opción «Monty» para que se llame «Francisco Montalvo
Ramirez», hay dos cosas que pueden pasar y **no son lo mismo**:

- Si Studio conserva el valor técnico y sólo cambia la etiqueta → las 83
  órdenes siguen apuntando bien y en pantalla dicen el nombre nuevo. Ideal.
- Si Studio cambia el valor técnico → las 83 órdenes se quedan con un valor que
  **ya no está en la lista**. Odoo no borra el dato: lo muestra en crudo o
  vacío según la vista, y **dejan de salir en los filtros y agrupaciones** por
  ese campo. O sea, huérfanas silenciosas: el dato está y las cuentas no cuadran.

⚠️ **Cuál de las dos ocurre NO lo sé, y no lo voy a afirmar.** Depende de cómo
Studio trate la edición de una opción, y eso se comprueba probándolo — que es
justo la lección de la `ir.rule` 815 (§9): el momento del enlace no se deduce
del perfil del campo. **Así que el plan de abajo está escrito para que el orden
sea seguro en los DOS casos.**

---

## 3 · El orden seguro, en cuatro pasos

**Paso 1 — medir el antes, para poder comparar.** Contar las órdenes por valor
del campo (la tabla de arriba) y guardar el conteo con su hora. Sin ese número
no hay forma de saber si el paso 2 rompió algo: §20 #18, la fila que desaparece
de un filtro se lee como «se corrigió» cuando puede significar «se rompió».

**Paso 2 — AGREGAR las opciones nuevas, sin quitar las viejas.** En Studio, sumar
a la lista los seis nombres completos. Las opciones viejas se quedan. Desde ese
momento lo nuevo se captura bien y **nada de lo viejo se mueve**. Este paso es
reversible y no puede romper nada.

**Paso 3 — comprobar que el conteo no se movió**, y sólo entonces migrar los
datos: pasar las 578 órdenes del valor viejo al nuevo. Es un `write` por lote
sobre `x_studio_cotizador`, y **cada lote se relee** — un `write` que devuelve
éxito no prueba que el campo quedó (§9). Aquí sí hay que mover las 83 de Monty,
las 237 de Aldo, etc.

**Paso 4 — quitar las opciones viejas del catálogo**, ya con cero órdenes
apuntando a ellas. Y comprobar el conteo otra vez: la suma por nombre completo
tiene que dar exactamente lo que daba por apodo.

**Por qué este orden y no «renombrar y ver qué pasa»:** porque agregar es
reversible y renombrar puede no serlo. Si el paso 2 resulta que bastaba (Studio
conservó los valores técnicos), el paso 3 es un no-op y se nota en el conteo.
Es el mismo criterio del discriminador de la `ir.rule` 814 (§9): **se elige el
camino cuyo fallo es soportable, no el más corto.**

---

## 4 · Lo que arreglaría esto de raíz, y por qué es otro frente

El problema de fondo no es que diga «Monty»: es que el campo sea **texto** en
vez de un enlace a `hr.employee`. Mientras sea texto, alguien va a volver a
escribir un apodo, y tres de los seis valores en uso van a seguir nombrando a
gente archivada sin que nada avise.

Convertirlo en `many2one` a `hr.employee` lo resolvería para siempre —y de paso
le daría a la vista de órdenes el dato que hoy no existe: *quién cotizó*, como
id y no como costumbre—. Pero es un cambio de tipo de campo con 578 órdenes
colgando, o sea su propio frente con su propia migración.

**Queda anotado, no perseguido** (§8). Lo de arriba es lo que se puede hacer
esta semana sin abrir eso.

---

## 5 · Mientras tanto, en la suite

La vista de órdenes ya **enseña el nombre completo** de Francisco Montalvo y
dejó de marcarlo con «¿quién?». Está en `comercial/machote/js/ordenes.js`, en la
constante `APODOS`, y **es un puente con fecha de caducidad**: se borra el día
que el paso 4 esté hecho.

El valor crudo de Odoo se sigue enseñando al lado, en gris. No es adorno: quien
lee la pantalla tiene que poder ver que eso es una **traducción** y no el dato,
o el día que el puente se equivoque nadie sabrá dónde mirar.

Los otros cinco valores se siguen pintando tal cual, con su marca cuando no
casan con nadie activo. Traducirlos a ciegas sería inventar una atribución, y
eso es peor que no tenerla.
