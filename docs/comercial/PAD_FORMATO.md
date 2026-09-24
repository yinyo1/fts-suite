# Cómo se guarda el FORMATO del pad

**Estado: ✅ CONSTRUIDO en la V1.43.** Este documento es la propuesta que el
encargo pidió *antes* de construir —«propón cómo se guarda sin inflar el
documento ni romper lo que ya está guardado, con tu recomendación»— más lo que
cambió al construirlo (§6). Se escribió con las mediciones delante, no con una
estimación.

---

## 1 · El problema, en una frase

Dar formato a las celdas significa que **cada celda ahora guarda estilo, no sólo
valor y fórmula**. Y como el pad viaja **dentro del documento del machote**, que
es **append-only** —cada guardado congela el documento entero como una versión
nueva—, ese estilo **se congela para siempre en cada guardado**.

O sea que el costo no es «unos bytes por celda»: es **unos bytes por celda × el
número de versiones que esa cotización llegue a tener**.

---

## 2 · Lo que se midió antes de decidir

Todo sobre la base de producción, en lectura (workflow TMP `Cl9nrZ8ainxfydTs`,
ejecución `112683`):

| medida | valor |
|---|---|
| versiones vivas en `comercial.machote_version` | **521** |
| tamaño **promedio** del documento | **11,274 bytes** |
| tamaño **máximo** | **30,577 bytes** |
| secciones con `pad` escrito | **1** |
| celdas con algo escrito en todo el sistema | **5** |
| fórmulas guardadas en todo el sistema | **1** (`=A1+B1`) |
| pads con `fmt` | **0** (el campo no existía) |
| bytes del pad más grande | **209** |

Dos cosas salen de ahí y mandan sobre el diseño:

1. **El documento promedio pesa 11 KB.** Un formato que añada 3-4 KB por
   sección lo engorda un tercio, y eso multiplicado por cada versión.
2. **Hoy no hay nada que migrar.** Cero pads con formato, un pad escrito. Así
   que el diseño se puede elegir por lo que convenga a futuro, sin arrastrar
   una forma vieja.

---

## 3 · La recomendación, y por qué

**Diccionario de estilos + RANGOS en orden, con el último ganando.** Vive en
`seccion.pad.fmt`, aparte de `seccion.pad.hoja`:

```
pad: {
  v: 2,                                   ← marca de forma
  hoja: [ ["7","350","=A1*B1","Tramos"], … ],
  fmt: {
    e: [ {b:1}, {b:1, n:"m"}, {g:"FFFF00"} ],   ← los estilos DISTINTOS
    r: [ ["A1:O1", 0], ["C1:C30", 1], ["E4:E4", 2] ]   ← rangos, EN ORDEN
  }
}
```

- **`e`** es el diccionario: cada estilo distinto se guarda **una vez**, por
  más celdas que lo usen.
- **`r`** son los rangos, **en orden de aplicación**. El estilo de una celda es
  la mezcla de todos los rangos que la contienen, clave por clave, **ganando el
  último** — la misma semántica de la cascada de CSS, que es la que ya conoce
  cualquiera que toque el resto del módulo.
- Las claves son **una letra cada una**, y eso no es tacañería gratuita: son
  los bytes que se multiplican por cada versión.

| clave | qué es | valores |
|---|---|---|
| `f` | tipo de letra | índice en el catálogo de 6 |
| `z` | tamaño | puntos (8…24) |
| `b` `i` `u` | negrita · cursiva · subrayado | `1` |
| `c` `g` | color de letra · de relleno | hex de 6 |
| `a` | alineación | `l` `c` `r` |
| `w` | ajustar texto | `1` |
| `n` | formato de número | `g` `m` `p` `s` |
| `d` | decimales | 0…6 |

### Por qué rangos y no una entrada por celda

Es **la** decisión, y se midió en vez de suponerla:

| caso | rangos | por celda |
|---|---|---|
| sin formato ninguno | **0 bytes** (el campo `fmt` ni se escribe) | 0 |
| lo típico: cabecera en negrita, columna de importes en moneda, dos totales de color | **134 bytes** | — |
| **negrita a toda la hoja** (450 celdas) | **34 bytes** | **3,486 bytes** |
| 450 celdas con formato distinto cada una | **2,758 bytes** (y topa) | ~4 KB y subiendo |

«Negrita a toda la hoja» es un clic, y es la diferencia entre **34 bytes** y
**3.5 KB en cada versión para siempre**. Con un documento promedio de 11 KB,
por celda eso es un tercio más de peso por un clic.

### Las cuatro reglas que lo mantienen chico

1. **Un `fmt` vacío NO se escribe.** Una cotización sin formato pesa
   *exactamente* lo que pesaba antes de esta versión. Cero regresión para quien
   no use la cinta.
2. **Al aplicar un rango se tiran todas las entradas anteriores que ese rango
   cubre por completo.** Repetir la misma acción cinco veces deja **una**
   entrada, no cinco. (Y hace falta para algo más: ver §6a.)
3. **`compactar` tira del diccionario los estilos que ya no cita ningún rango**
   y renumera. Sin eso, «negrita y luego sin negrita» dejaría el objeto
   huérfano en el documento para siempre.
4. **Tope de 120 rangos**, y cuando se llega **la pantalla lo dice** en vez de
   callarse: *«La hoja llegó al tope de 120 formatos distintos. Ese último no se
   guardó — el contenido sí está, es sólo el formato.»* Un tope silencioso es
   peor que no tener tope: nadie sabría por qué una celda no se pinta.

---

## 4 · Lo que ya está guardado NO se rompe

Dos mecanismos, y son independientes:

**El formato** no rompe nada porque **`fmt` simplemente no existe** en los pads
de antes. `fmtLeer` de un pad sin `fmt` devuelve el formato vacío, y la hoja se
pinta como siempre. No hace falta migrar ni un byte.

**La forma de la rejilla** sí necesitó migración, y es la parte delicada:

> La forma 1 (V1.41–V1.42) tenía una columna de **rótulo** no referenciable en
> el índice 0, y A…J en los índices 1…10. La forma 2 no la tiene: el índice 0 es
> la A.

Reinterpretar el arreglo sin más **cambiaría el resultado de las fórmulas en
silencio**, que es el peor defecto posible. Medido: la única fórmula guardada en
todo el sistema es `=A1+B1`, y bajo la forma 2 apuntaría una columna a la
izquierda y devolvería **1** donde decía **2**.

Así que la migración hace dos cosas:

1. **el rótulo se queda donde está** —pasa a ser la columna A, la misma posición
   en pantalla— y por fin se puede referenciar;
2. **cada referencia de cada fórmula corre una letra a la derecha** (A→B … J→K),
   para que siga señalando la misma celda.

Se hace **con el tokenizador y no con una expresión regular**: un `replace` de
`A` por `B` también tocaría la `A` de `SUMA`.

Y dos detalles que importan tanto como el mecanismo:

- **`hojaDe` NO escribe.** La migración se sella sola en el **primer tecleo**
  (`escribirCelda` pone `pad.v = 2`). Abrir un machote **en lectura** —un
  prestado, uno ajeno— no lo reescribe.
- **La marca de forma es lo que hace que la migración dure.** Sin ella, cada
  carga correría las fórmulas otra vez y en tres aperturas `=A1` apuntaría a
  `=D1`. Hay una prueba que lo exige en el almacén, no en la pantalla.

Prueba dedicada: *«un pad GUARDADO ANTES de este cambio se abre bien, y la
fórmula sigue valiendo lo mismo»* — siembra ese caso exacto y exige que el
número **no se mueva** (5 antes, 5 después) y que abrir en lectura no reescriba.

---

## 5 · Lo que se descartó, y por qué

| alternativa | por qué no |
|---|---|
| **Un estilo por celda** (`fmt: {"A1": {...}}`) | 3.5 KB por un clic de «negrita a toda la hoja», en cada versión y para siempre. Medido arriba. |
| **Guardar el CSS ya armado** | Más bytes por lo mismo, y ata el documento a una hoja de estilo que va a cambiar. El documento guarda el DATO, la pantalla decide cómo se ve — la misma razón por la que se guarda la fórmula y no su resultado. |
| **Formato por COLUMNA y por FILA nada más** (como una hoja vieja) | Más chico todavía, pero no permite pintar un total suelto — que es exactamente lo que la gente hace primero. |
| **`fmt` en una tabla aparte de Postgres** | Rompe la promesa del documento append-only: el pad dejaría de viajar con su versión, y abrir una versión vieja enseñaría el formato de hoy. |

---

## 6 · Lo que cambió al construirlo

Tres cosas, y las tres salieron de **ejercitar**, no de leer.

### a · La regla de tirar entradas contenidas tiene una SEGUNDA razón

Se escribió como ahorro de espacio. Resultó ser también lo que hace que
**quitar** un formato funcione. Con la condición «mismo estilo» que tenía al
principio, poner negrita y quitarla dejaba la entrada vieja ganando por debajo y
**la negrita se quedaba puesta**. La prueba del modelo lo cazó; leer el código
no. Ahora se tiran todas las entradas que el rango nuevo cubre por completo, sin
mirar su estilo — y es correcto, no un atajo: el estilo nuevo se calculó sobre el
estilo **efectivo** de la primera celda, así que ya trae todo lo que estaba
vigente.

### b · «General» es el número tal cual, y eso se ve

Hasta la V1.42 la celda se pintaba con el formateador de moneda del módulo, así
que **todo** número salía como `$16,200`. Con formato de número de verdad, el de
arranque es **General**, que en Excel es el número sin separador ni signo:
`16200`. La coma y el `$` están a un clic. **Es un cambio visible** y está en la
lista de preguntas para Esteban: si prefiere que la hoja arranque en «Millares»,
es una línea.

### c · El ancho de columna lo decidió el formato, no el diseño

Con moneda puesta, `-$1,234,567.89` **en negrita** mide 125 px con la letra
base. La primera medición se hizo sin negrita, dio 122 px de celda, y la captura
de 1280 enseñó `$2,201,767.0(` en el renglón del total — un importe recortado,
que **se lee como otro importe**. La celda quedó en **136 px** (112 en teléfono)
y la rejilla se desplaza. Detalle y números en el comentario del CSS.

Y de ahí sale la regla que la prueba de recorte aplica ahora: **cero recortes en
las celdas de NÚMERO**; un rótulo largo sí se corta, como en Excel, y para eso
está «Ajustar texto».
