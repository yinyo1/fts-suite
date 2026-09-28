# Una tarjeta cuya señal ya venció al cargarla · diseño

> **🔒 DISEÑO, NO APLICADO.** Nada de este documento está en el código. Es la
> tarea 3 de #336 y espera OK. Lo único que el código hace hoy es **declararlas**
> (`cargar_piloto.py` las reporta como `tarjetas_vencidas_al_cargar`) y **no
> cerrarlas solas**.

## El caso, medido

Coficab/Durango. Señal del **8-dic-2025**, tipo `obra_nueva`, ventana de 120 días:
**caduca el 7-abr-2026**. Se cargó el 28-sep-2026, casi seis meses después de su
propia caducidad.

Y no es un caso raro: es el caso **normal** al arrancar el piloto con cuentas ya
evaluadas. De las nueve cargadas, una nace vencida; cuando se regeneren las cuatro
con hueco, probablemente nazcan más.

## Por qué importa, en dos frases

1. **El tablero la muestra como trabajo vivo.** `toca_hoy` y
   `caducan_con_toques_pendientes` la van a listar, y alguien va a trabajar una
   señal de hace diez meses creyendo que es de esta semana.
2. **Una tarjeta abierta ocupa el único lugar que la cuenta tiene.** El índice
   `tarjeta_una_abierta_por_cuenta` permite una sola abierta por cuenta. Una
   tarjeta muerta ocupando ese lugar **bloquea el reciclaje**: cuando llegue una
   señal nueva de Coficab Durango, el destino 2 no puede reabrir porque ya hay una
   abierta, y quien lo intente va a ver un error de llave duplicada sin entender
   por qué.

> **Ese segundo punto es el que decide.** No es un problema de presentación: es que
> una tarjeta muerta abierta **rompe el mecanismo que el motor 3 existe para
> sostener**.

## Las tres opciones

### Opción A · No se carga

**Cómo:** el cargador la salta y la reporta en una lista aparte.

| A favor | En contra |
|---|---|
| El tablero sólo tiene trabajo vivo | **Se pierde el rastro.** La cuenta desaparece de la base, y el día que llegue una señal nueva no hay historial contra el que reabrir — que es exactamente lo que el destino 2 necesita |
| Cero ambigüedad | La cuenta existió, se evaluó y se gastaron consultas en ella. Borrar eso es tirar el trabajo |

### Opción B · Se carga cerrada, con destino `caduca`

**Cómo:** se crea la tarjeta y un `cierre` con destino `caduca` y motivo escrito.

| A favor | En contra |
|---|---|
| El historial queda, y el reciclaje puede reabrir | 🔴 **Mete un expediente inventado a los tres lazos.** Un `cierre` con destino `caduca`, cero toques, sin canal y sin resultado le dice al lazo 1 que esa fuente *no convirtió* — cuando la verdad es que **nunca se intentó** |
| El lugar de la cuenta queda libre | Con 20 tarjetas de compuerta, tres o cuatro cierres falsos mueven un peso |

> **Ésta es la que rechazo, y es la tentadora.** Deja el tablero limpio y la base
> consistente. Pero el costo es corromper el aprendizaje, y el aprendizaje es la
> única razón por la que el motor 3 existe. **Ensuciar el aprendizaje para que el
> tablero quede limpio es el peor de los dos males.**

### Opción C ← **recomendada** · Estado propio `vencida_sin_trabajar`, fuera de los lazos

**Cómo:** un valor nuevo en `estado_de_tarjeta`, y **no** un `cierre`.

```sql
CREATE TYPE estado_de_tarjeta AS ENUM (
    'abierta', 'cerrada',
    'vencida_sin_trabajar'   -- la señal caducó antes de que nadie la tocara
);
```

Y el índice que sostiene el destino 2 sigue aplicando sólo a `abierta`, así que
**el lugar de la cuenta queda libre** sin borrar nada:

```sql
-- ya es así: el índice es parcial sobre estado = 'abierta'
CREATE UNIQUE INDEX tarjeta_una_abierta_por_cuenta
    ON tarjeta (cuenta_id) WHERE estado = 'abierta';
```

Lo que este estado gana, pieza por pieza:

| | |
|---|---|
| **El historial queda** | la cuenta, su señal y su expediente siguen en la base, así que el destino 2 puede reabrir con historial cuando llegue señal nueva |
| **No entra a los lazos** | no hay `cierre`, así que `cierres_para_el_aprendizaje` no la ve. El lazo 1 no aprende nada falso de ella |
| **El tablero no la muestra como viva** | `toca_hoy` y `caducan_con_toques_pendientes` filtran por `estado = 'abierta'` |
| **Se puede contar** | una vista `vencidas_sin_trabajar` dice cuántas hay, y **eso es una métrica del proceso, no del radar**: mide cuánto tarda el equipo en trabajar lo que el radar detona |
| **Es reversible** | si Esteban decide trabajar una de todas formas, pasa a `abierta` con su caducidad recalculada desde hoy y queda escrito que se reabrió vencida |

### La distinción que este estado hace, y que hoy no existe

> **`cerrada` significa «se trabajó y terminó». `vencida_sin_trabajar` significa
> «nunca se trabajó».** Son cosas distintas y el lazo 1 tiene que poder
> distinguirlas: una cuenta que no convirtió después de tres toques dice algo de la
> fuente; una que nadie tocó no dice nada de la fuente — dice algo del equipo.
>
> Meterlas en el mismo cajón le enseñaría al radar que sus mejores fuentes no
> convierten, cuando lo que pasó es que nadie llamó.

## Lo que además propongo, y es la mitad del valor

**Que el cargador recalcule la caducidad desde hoy cuando el operador decida
trabajarla.** Una señal de obra nueva de hace diez meses no está muerta como
prospecto —la planta sigue comprando— pero su *ventana de especificación* sí
cerró. Reabrirla con la caducidad original la mata en el acto; reabrirla con 120
días desde hoy es honesto sobre lo que se está haciendo: **tratar una señal vieja
como un punto de partida, no como una señal fresca.**

Y que quede escrito en la tarjeta: `reabierta_vencida: true`, con la fecha
original. Si esa tarjeta convierte, el lazo 1 tiene que saber que la señal que la
originó tenía diez meses — porque eso es justo lo que la curva de frescura dice que
no debería funcionar, y un contraejemplo medido vale más que la curva.

## Qué tocaría, si se aprueba

| Archivo | Cambio |
|---|---|
| `datos/esquema-motor3.sql` | un valor en `estado_de_tarjeta`, la vista `vencidas_sin_trabajar`, y dos columnas: `reabierta_vencida`, `caducidad_original` |
| `herramientas/cargar_piloto.py` | cargarlas con el estado nuevo en vez de abiertas |
| `flujo/base_motor3.py` | `resumen_del_piloto` cuenta las vencidas sin trabajar |
| `metodo/prototipo-tablero-motor3.html` | un renglón que las muestre como lo que son |
| pruebas | que no aparezcan en `toca_hoy`, que no lleguen a los lazos, y que no bloqueen el reciclaje |

**Nada de esto se toca hasta tu OK.** Lo que el código hace hoy — declararlas y no
cerrarlas — es el comportamiento correcto mientras la decisión no exista: no miente
y no corrompe nada; sólo deja una tarjeta muerta visible en el tablero, y eso es
un costo de presentación, no de datos.
