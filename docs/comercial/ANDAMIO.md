# El andamio de la transición, y qué queda en su lugar

Sesión V1.24 del issue #140. Los 17 machotes ya viven en Postgres, así que las
piezas que existían para el rescate cumplieron y ahora estorban. Esto documenta
qué se retiró, qué se quedó, y —para la franja, que era lo único que hacía algo
que nada más hacía— **qué la reemplaza y por qué alcanza**.

---

## Lo que se fue

### Importar — decisión de Esteban, sin vuelta

Existía para meter a mano el JSON que cada quien tenía suelto en su navegador
mientras no había servidor. Con los machotes ya en la base, su único efecto
posible es **crear duplicados**: el archivo trae `id_local`, el servidor
reconcilia por `id_local`, y dos personas pueden tener el mismo `M-1041`.

Se retiró el botón, el `<input type=file>` y la función que los unía.
`MachoteRespaldo.importarTexto` se queda en su archivo —es una función pura,
con pruebas, y fusionar sin pisar es la parte difícil de esto— pero ya no hay
camino desde la pantalla. La prueba comprueba que no quedó ninguna entrada de
archivo, no sólo que no se vea: un input escondido sigue siendo alcanzable.

### La sección «Confirmar la orden»

Listaba órdenes de `D.ORDENES` —datos de ejemplo, nunca del servidor— debajo de
una lista de cotizaciones reales, y marcaba «confirmada» en un estado en
memoria que no le importa a nadie y que se pierde al recargar. Era andamio del
prototipo. El camino de verdad a una orden es el de la cotización: abrirla y
«Pasar a orden».

### La columna «Revisión» («1 dura», «3 duras»)

Se va con la sección, y por su razón: contaba las validaciones que **impedían
crear la orden desde la lista**, y ese camino ya no sale de la lista. Sin la
sección, el número queda sin referente — un contador en una tabla sin manera de
saber a qué se refiere ni qué hacer con él.

No desapareció la información: las duras siguen dentro del machote, junto al
campo que las causa, que es donde se arreglan. Lo mismo se quitó de la tarjeta
del teléfono, que traía el mismo conteo.

### La franja de sincronización

Se retiró entera, siguiendo el instructivo que ella misma llevaba escrito en su
cabecera (archivo, `<script>`, bloque CSS, dos llamadas en `app.js`, pruebas).
`estadoServidor()` se queda en el almacén: la usa también la vista de control.

---

## Lo que se queda

### Exportar — **recomendación, no decisión: se queda, discreto**

El encargo pedía proponerlo con razón en vez de decidirlo en silencio. Se
implementó la recomendación; si Esteban la corrige, quitarlo son tres líneas.

**Por qué se queda:**

1. **Es la única salida cuando el guardado se rompe.** `avisarNoGuarda()` —la
   barra que aparece cuando el navegador no deja escribir, en modo privado o
   con los datos del sitio bloqueados— ofrece exportar ahí mismo. Quitar
   Exportar dejaría esa barra avisando de un problema sin darle salida a nadie,
   que es sólo asustar.
2. **Llevarse lo propio no le quita nada a nadie.** El archivo trae únicamente
   los machotes de quien lo baja, nunca los ajenos.
3. **El costo de tenerlo es casi cero** ahora que no compite por la atención.

**Por qué baja de rango:** pasó de botón con conteo, al lado de «+ Nuevo», a un
enlace pequeño al pie de la lista. Un respaldo manual junto a la acción
principal sugiere que hace falta respaldar a mano, y ya no hace falta: el
servidor es el respaldo.

**Nota sobre qué clase de respaldo es ahora.** Sin Importar, el archivo dejó de
ser «de aquí se restaura» y pasó a ser «me llevo lo mío» — para revisar fuera,
para archivar, o para tener algo cuando el guardado se rompe. No es una
contradicción con la decisión de quitar Importar: **de donde se restaura es del
servidor.**

---

## Lo que reemplaza a la franja

El encargo decía: *«El pulso quizá alcance; verifícalo en pantalla antes de
afirmarlo.»* Se verificó en pantalla, y **no alcanzaba**. Medido el 9-sep con
la sesión sembrada y la lista pintada:

```
esc (1280 px)  #pulso -> 60 × 17 px · texto "guardado"
tel ( 380 px)  #pulso ->  8 ×  8 px · texto ""        <- sin palabras
```

En el teléfono el pulso es **un punto de ocho píxeles sin texto**. Puede decir
«hay algo raro»; no puede decir *qué* ni *cuál*. Y la franja hacía dos cosas
que el punto no hace: decía **cuántas** faltaban y **las señalaba**.

### Lo que se construyó en su lugar

Un aviso en la lista que **sólo aparece cuando hay algo atorado**, dice cuántas
son, y con «Cuáles son» las marca dentro de la propia lista —sin cambiar de
vista— igual que hacía la franja.

La diferencia de fondo con la franja, y es deliberada:

> **la franja hablaba SIEMPRE, incluso para decir «todo a salvo».
> Esto sólo habla cuando algo no salió de aquí.**

La razón es de honestidad, no de estética. Una marca local **no puede probar
que todo llegó al servidor** —por eso la franja preguntaba allá en cada
carga—, pero **sí puede probar que algo no ha salido de aquí**. Así que el
aviso sólo afirma lo que puede demostrar. El silencio no significa «todo a
salvo»: significa «nada pendiente que yo sepa».

**Y la pregunta que el silencio no contesta —¿está TODO lo mío en el
servidor?— tiene su lugar: la pantalla de Control**, que sí le pregunta al
servidor y compara. Ahí es donde vive ahora esa respuesta.

### Deuda que esto deja apuntada

Control hoy pide `comercial:admin`, **que no tiene nadie**. O sea que la
pregunta «¿está todo lo mío allá?» hoy no la puede hacer ninguna persona del
módulo. No bloquea nada —el aviso cubre el caso que de verdad ocurre, que es
un guardado atorado— pero conviene resolverlo: o se le da la llave a alguien, o
Control deja de pedirla para la parte de «lo mío». **Anotado, no perseguido.**
