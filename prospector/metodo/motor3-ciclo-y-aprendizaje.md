# Motor 3 · el ciclo y los tres lazos de aprendizaje

> **Qué se construyó ya (#325):** el expediente de la señal, la caducidad viva,
> la llave de reciclaje, el desmentido, los tres lazos, el esquema de Postgres,
> el diagnóstico de regeneración y el prototipo del tablero.
> **Qué espera OK explícito de Esteban:** **la etapa 2 — toda escritura a Odoo.**
> La regla vigente sigue siendo que la herramienta **lee** Odoo y nunca escribe.
> **Qué espera n8n:** el cron de la cadencia, y n8n espera que el Worker esté
> desplegado.

Este documento **no reemplaza** a [`motor3-crm-odoo.md`](motor3-crm-odoo.md): lo
continúa. Ahí está la forma de la tarjeta (§4a), los plazos (§4b), la cadencia
(§4c) y las dos vías de escritura (§4e). Aquí está el **ciclo completo** y el
**aprendizaje**, que es lo que ese documento dejó como un solo lazo en prosa.

---

## 0 · Lo que la auditoría encontró, y por qué importa antes de diseñar nada

El diseño de `motor3-crm-odoo.md` estaba bien escrito. Lo que no estaba era la
**cadena que describe**. Auditando el código antes de proponer:

| | Lo que el diseño dice | Lo que el código hacía |
|---|---|---|
| **H1** | El registro de aprendizaje lleva `senal.fuente` y `puntaje_del_evaluador` | `paquete.armar()` emitía 24 llaves y **ninguna** era fuente, tipo, puntaje ni desglose. El radar puntuaba con seis factores, sembraba `angulo` —una cadena— y **el puntaje se tiraba** |
| **H2** | Siete plazos de caducidad por tipo de señal | La tabla se buscaba por `paquete["fuente"]`, llave que nunca se emitió, y caía a `origen` (`radar`/`manual`). **Medido: toda tarjeta caducaba a los 60 días y las once filas nunca eligieron ninguna** |
| **H3** | `medium_id` = la fuente de la señal | Caía a `origen`, así que repetía `source_id` y la fuente se perdía |
| **H4** | «La misma empresa» se reconoce por `dominio_correo + ciudad`, **no** por nombre | El paquete emitía `empresa/ciudad`. El destino 2 —«la decisión de diseño más importante del motor 3»— no se podía implementar |
| **H5** | Un rebote «tiene que volver al motor 2… es la evidencia que `Dato.nivel` necesita» | `Dato.nivel` **se deriva** de observaciones, y un rebote no es una observación. No existía forma de bajar un nivel: el motor 2 nunca se enteraba de si sus correos llegaban |
| **H6** | *(no lo dice)* | El evaluador no tiene vocabulario para **planta nueva**. Ver §6, decisión D3 |

Las cinco primeras están arregladas y con prueba. **H6 es una decisión de
Esteban**, no un arreglo: cambiar el vocabulario del radar cambia qué detona.

### La lección que vale más que los cinco arreglos

Los cinco hallazgos son **la misma falla**: un dato que el diseño da por
transportado y que nadie transporta. Y ninguno fallaba ruidosamente — la
caducidad devolvía una fecha perfectamente válida, sólo que siempre la misma.

> **Un lazo de aprendizaje tiene cuatro piezas, y si falta una el lazo está
> abierto sin que nada truene:**
> 1. un **evento** que ocurre en el mundo *(la tarjeta cerró)*
> 2. un **registro** que lo captura sin interpretar
> 3. una **compuerta** que dice cuándo alcanza
> 4. un **destino concreto** en el código
>
> La pieza 4 es la que se olvida. Un documento que dice «el aprendizaje ajustará
> los pesos» sin nombrar la constante produce un archivo de datos que nadie lee
> nunca. En este documento **cada lazo nombra su archivo y su constante.**

---

## 1 · El expediente de la señal: lo que hace posible todo lo demás

```
  radar.evaluar()                Corrida.senal_origen           paquete
  ┌──────────────┐               ┌──────────────────┐          ┌─────────┐
  │ puntaje 46   │──────────────>│ fuente, tipo     │─────────>│ fuente  │
  │ desglose{6}  │  la FOTO      │ fecha, puntaje   │          │ tipo    │
  │ veredicto    │  completa     │ desglose, familia│          │ puntaje │
  └──────────────┘               └──────────────────┘          └─────────┘
       ANTES: sólo viajaba `angulo` (una cadena) y `origen: "radar"`
```

`Corrida.senal_origen` guarda el veredicto del evaluador **tal como fue**, y
`./prospector senal` lo declara cuando la cuenta entró a mano.

**Se guarda el desglose, no sólo el total.** Un 72 no dice si vino de un match de
catálogo fuerte con señal vieja o de lo contrario, y **son dos lecciones
opuestas** para el lazo 1.

**Es una foto y no se recalcula.** Al cargar una corrida el expediente se
restaura tal cual. Recalcularlo cambiaría la frescura —la señal envejece— y el
lazo compararía el desenlace contra un número que nadie usó para decidir gastar
60 consultas. Cuando el puntaje **sí** se recalcula (`senal --reevaluar`, para
regenerar una cuenta vieja) queda marcado `puntaje_reevaluado_hoy` con su aviso:
sirve para los pesos por familia y **no** para corregir la curva de frescura —se
estaría corrigiendo la curva con un número que la curva ya afectó.

### Dos ejes que el diseño anterior mezclaba

| | Contesta | Gobierna |
|---|---|---|
| **fuente** | ¿cuánto creerle? | `FUERZA_DE_FUENTE`, el puntaje |
| **tipo** | ¿cuándo se vence? | el reloj de caducidad |

La misma obra nueva puede llegar por prensa (poco fiable) o por el correo del
cliente (muy fiable), y en los dos casos su ventana de especificación es la
misma. Y el buzón puede traer una convocatoria que cierra el jueves o una
necesidad para el año que entra. Mezclarlos es lo que dejó muerta la tabla de
caducidad: diez de sus once llaves eran fuentes y una sola era tipo.

Los ocho tipos: `obra_nueva` · `ampliacion_de_capacidad` ·
`convocatoria_abierta` · `necesidad_declarada` · `vacante_tecnica` ·
`presencia_en_evento` · `navegacion` · `reconocimiento_de_mercado`.

---

## 2 · El reloj de caducidad, con precedencia explícita

1. **la fecha de cierre de una convocatoria** — el plazo no lo decide FTS
2. **la fecha del evento + 15 días** — el evento *es* el canal
3. **el plazo del tipo de señal**, contado **desde la fecha de la señal**
4. **el plazo de la fuente**, sólo para cuentas viejas sin tipo
5. **60 días por omisión, y se dice que fue por omisión**

**El reloj arranca en la señal, no en hoy.** Una nota de hace 80 días con plazo
de 120 le quedan 40. Arrancar en hoy le regalaba a la señal vieja la misma
ventana que a la fresca —que es justo la información que el factor de frescura
del evaluador se molesta en medir.

El caso 5 se declara en el lognote: *«esta tarjeta no trae ni tipo ni fuente de
señal, así que su plazo no significa nada.»* Un plazo por omisión que se lee
igual que un plazo razonado es peor que ningún plazo.

### La precisión de la fecha de la señal, y por qué se cuenta desde el día 1

**[calculado]** La prensa fecha al mes: *«anunciada nov-2023»*, *«arranque de obra
marzo-2025»*. Ésa es una precisión válida y se declara
(`fecha_senal_precision`: `dia` · `mes` · `anio`), pero el reloj necesita un día,
así que el mes se normaliza al **día 1**.

> **Al día 1 y no al 15 ni al último.** Hace la señal hasta 30 días **más vieja**
> de lo que podría ser, nunca más fresca. Una ventana de caducidad que se equivoca
> tiene que equivocarse del lado de **cerrarse antes**, y una fecha que sólo se sabe
> al mes no debería poder ganarle puntos a una que se sabe al día.

Y **una fecha ilegible no es lo mismo que no tener fecha.** Hasta el 28-sep-2026,
`razon_de_caducidad` sólo leía `AAAA-MM-DD`: cualquier otra cosa caía a un `except`
y el reloj arrancaba en **hoy** sin decir por qué. Medido: una señal de **nov-2023**
salía caducando en **enero de 2027** — tres años y dos meses de ventana inventada.
Es la misma familia que #302, donde no reconocer la fecha *escondía* la antigüedad.
Hoy se leen las tres precisiones, una cadena que no se puede interpretar se
**rechaza** al declarar la señal, y el `por_que` distingue *«no hay fecha»* de *«la
fecha no se pudo leer»*.

---

## 2b · La cadencia: los primeros toques se escalonan (D8)

La tabla de cadencia vive en el §4c del diseño del CRM; lo que sigue es la regla
que la gobierna, porque **nada en el tablero la muestra** y una regla invisible se
rompe sin querer.

**Máximo un toque #1 por cuenta por día, con al menos 2 días hábiles entre
contactos**, empezando por el nivel de confianza más alto y el canal más directo.

> **Por qué.** Antes los cuatro contactos de una tarjeta recibían su toque #1 el
> mismo día, por cuatro canales distintos. Desde la planta eso no se ve como
> cadencia: se ve como enjambre. Cuatro personas de la misma empresa comentando el
> mismo día que les escribió el mismo proveedor es exactamente la conversación que
> no queremos provocar.

| | |
|---|---|
| Separación entre primeros toques | **2 días hábiles** (`SEPARACION_ENTRE_PRIMEROS_TOQUES`) |
| Orden de arranque | nivel de confianza, luego canal (correo directo → LinkedIn → conmutador → evento), luego cercanía a la decisión |
| Quien está en revisión humana | **no consume día de escalonamiento**, porque no se le programa toque |
| Los toques 2 y 3 | siguen la espera de su canal, no el escalonamiento |

La prueba que **documentaba el enjambre** quedó invertida: ahora exige que los
primeros toques no caigan el mismo día.

---

## 3 · El destino 2, convertido en restricción

```sql
CREATE UNIQUE INDEX tarjeta_una_abierta_por_cuenta
    ON tarjeta (cuenta_id) WHERE estado = 'abierta';
```

Índice único parcial y **no** un trigger: una regla que el motor de la base
sostiene no se puede rodear desde un flujo de n8n a las 3 de la mañana.

La llave que reconoce «la misma cuenta» es `dominio_correo|ciudad`, y **el
dominio tiene que ser observado** —sólo de correos ancla. Cuando no hay ninguno,
la llave es `NULL`, y eso **es la respuesta correcta**: una llave inventada se
usaría para fundir o partir cuentas sin que nadie lo notara. Reciclar por nombre
falla en las dos direcciones y las dos son caras:

* **no reconoce** — «Coficab» y «COFICAB MX Suc Monterrey» producirían dos
  tarjetas de la misma planta;
* **reconoce de más** — dos empresas con nombre parecido se funden, y el
  historial de una contamina a la otra.

---

## 4 · Los tres lazos

Son tres porque tienen **tres destinos distintos en el código**. Tres lazos con
el mismo destino serían un lazo con tres nombres.

| | Pregunta | Destino | Compuerta |
|---|---|---|---|
| **Lazo 1** | ¿a quién vale la pena tocar? | `flujo/radar.py` | 20 cierres **por celda** |
| **Lazo 2** | ¿con qué datos se toca? | `flujo/confianza.py`, `flujo/paquete.py` | **1** desmentido · 3 para un patrón |
| **Lazo 3** | ¿cuándo y por qué canal? | `flujo/importacion_odoo.py` | 10 respuestas **por tipo** |

### Por qué las compuertas son distintas, y no es inconsistencia

Las tres preguntas se contestan con **evidencia de naturaleza distinta**.

El lazo 2 aprende de **un** rebote: un rebote es un *hecho* sobre un correo
concreto, no una tasa. Esperar veinte sería seguir escribiéndole a diecinueve
buzones que ya se sabe que rebotan. El lazo 1 necesita veinte cierres para que
una tasa de conversión signifique algo —la misma razón por la que Chao1 tiene el
veredicto `prematuro`. Meterlos en la misma compuerta obligaría a elegir: o el
lazo 1 se mueve con ruido, o el lazo 2 se queda esperando veinte rebotes antes de
corregir un patrón que ya se sabe malo.

**Y el 20 del lazo 1 es por celda, no global.** Veinte tarjetas repartidas en
once fuentes son menos de dos por fuente, y dos cierres no dicen nada de una
fuente. Si se va a mover el peso de `prensa_industrial`, hacen falta veinte
cierres **de prensa industrial**.

### Una compuerta que dice «alcanza» y no puede concluir nada es un defecto

Construyendo el lazo 1 apareció: con 55 cierres la compuerta de frescura abría, y
en el mismo renglón su propuesta decía *«todos del mismo lado de la curva: no hay
con qué compararla»*. La cuenta de esa compuerta son los cierres **comparables**,
no todos. Es la misma familia que el `mismo_tamano_sin_hash` que se leía como
verificado, y que el `FALTA_BARRER` con f2=1.

### Lazo 1 · al radar

| Celda | Qué mueve | Qué la abre |
|---|---|---|
| `fuerza_de_fuente[f]` | `FUERZA_DE_FUENTE` | 20 cierres de **esa** fuente |
| `escala_frescura` | `ESCALA_FRESCURA` | 20 cierres **comparables** — señal fresca **y** vieja |
| `padron_empata` | `PADRON_EMPATA` | 20 cierres con **los dos lados** poblados |

`padron_empata` es **la única celda que puede llegar a valer cero**, y es el hueco
del §3d con número: si las que convierten **no** están en el padrón, los +8 están
sesgando el radar contra la obra nueva —el mejor prospecto que existe.

### Lazo 2 · al motor 2

El nivel nuevo es **`DESMENTIDO`**, y se revisa **primero** en `Dato.nivel`.
Puesto después de `choca` o de `n_raices >= 2`, un correo que rebotó seguiría
saliendo `CONFIRMADO` porque dos fuentes lo dijeron —y las dos estaban mal. Un
desmentido le gana a cualquier cantidad de observaciones porque no es otra
opinión sobre el dato: **es el resultado de usarlo.**

| Desmiente | Por qué |
|---|---|
| `rebote` | el buzón está mal, sin importar cuántas fuentes lo dijeran |
| `persona_equivocada` | el emparejamiento nombre/puesto está mal |
| `ya_no_trabaja_aqui` | fue cierto y dejó de serlo |

| **No** desmiente | Por qué |
|---|---|
| `sin_respuesta` | **el silencio no es contra-evidencia.** El correo pudo llegar perfectamente y la persona no contestar. Contarlo acabaría descartando los correos buenos de las cuentas que no contestan |
| `respuesta_negativa` | habla del **negocio**, no del dato: el correo llegó y era quien. Es la mejor prueba de que el dato estaba bien |

Y la ficha cambia de voz: donde decía *«correo probable — confírmalo en la
primera llamada»* ahora dice **«NO LO USES: este correo REBOTÓ»**. Para un buzón
que ya rebotó, la redacción vieja era al revés de lo que pasó.

### Lazo 3 · al motor 3 mismo

Los plazos del §4b están escritos «para poder corregirlos con datos». Éstos son
los datos: mediana y p90 de los días hasta la primera respuesta, por tipo de
señal, contra el plazo vigente.

Con **cero respuestas** el lazo no propone mover el plazo: dice que *si esto se
sostiene, el plazo no es el problema —el tipo de señal no sirve, y ésa es lección
del lazo 1, no de éste.* Un lazo que atribuye a su propia constante un fracaso
que es de otra capa aprende lo contrario de lo que pasó.

### Ningún lazo mueve una constante

`los_tres_lazos()` calcula lo que **movería**, con la cuenta a la vista, y lo
deja escrito. Un evaluador que se reajusta solo es un evaluador que nadie puede
auditar, y su puntaje decide si se gastan 60 consultas por cuenta. En Postgres:

```sql
CONSTRAINT solo_se_aplica_lo_que_alcanza
    CHECK (aplicado_el IS NULL OR veredicto = 'alcanza'),
CONSTRAINT un_ajuste_aplicado_tiene_nombre
    CHECK ((aplicado_el IS NULL) = (aplicado_por IS NULL))
```

---

## 5 · Postgres: la lógica en el repo, las personas fuera

[`datos/esquema-motor3.sql`](../datos/esquema-motor3.sql). **Se aplicó contra
Postgres 16 y sus seis restricciones se probaron una por una rechazando lo que
dicen rechazar** —un `CHECK` mal escrito se lee igual que uno bien escrito.

Un esquema es **lógica**: dice qué forma tiene un dato y qué reglas lo gobiernan,
y no contiene ninguna fila. Por eso puede vivir en un repo público, y por eso
**no hay archivo de semillas al lado** —una prueba truena si un `.sql` de
`datos/` trae un `INSERT`.

### Las personas viven en dos tablas y sólo dos

```
  ┌─ operativo: se exporta, se grafica, se respalda ──────────────┐
  │  cuenta · senal · tarjeta · tarjeta_senal · TOQUE · cierre   │
  │  ajuste_propuesto                                            │
  └──────────────────────────────────────────────────────────────┘
  ┌─ [PII]: trato aparte ─────────────────────────────────────────┐
  │  contacto · toque_destinatario                                │
  └──────────────────────────────────────────────────────────────┘
```

`toque` —la tabla que los tres lazos leen— lleva canal, fecha, **nivel** y
resultado, y **no lleva a nadie**. Quién fue va aparte, en
`toque_destinatario`.

**La separación no es purismo.** Es lo que permite sacar el corte de aprendizaje
con un `SELECT * FROM toque` sin que nadie tenga que acordarse de excluir
columnas. **Un corte que hay que recordar limpiar es un corte que un día sale sin
limpiar** —y este proyecto ya tiene un issue entero sobre eso (#324).

Cada columna está marcada `[PII]` u `[operativo]`, y una prueba verifica que
ninguna vista del tablero toque las dos tablas de personas. Por eso el tablero se
puede abrir en una junta.

**`celular_personal` no existe** como valor del enum ni como columna en ninguna
tabla, y una prueba lo caza si aparece fuera de los comentarios que explican que
no existe.

### La regla que la base sostiene sobre el correo candidato

`correo_que_si_se_puede_enviar` saca un correo desmentido **aunque su
`nivel_correo` siga diciendo `confirmado`** —verificado en Postgres: la fila no se
edita y el correo ya no sale. De donde Odoo envía no sale un correo derivado de un
patrón: eso es un rebote con el dominio de FTS, o peor, un correo a la persona
equivocada.

---

## 6 · Regeneración de las cuentas ya evaluadas

**Lo que el plan no propone: correr todo otra vez.** Las cuentas evaluadas antes
de #325 tienen la ficha bien —gancho, contactos, Chao1, aviso. Lo que les falta es
el expediente de señal, y **de los tres arreglos dos no cuestan ni una consulta**:

| Nivel | Qué hace | Consultas | Deja servir para |
|---|---|---|---|
| **1 · declarar** | el operador declara fuente y tipo: se acuerda de dónde salió la cuenta | **0** | lazo 1 parcial (conversión por fuente) y lazo 3 **completo** |
| **2 · reevaluar** | con el texto guardado, el evaluador puntúa leyendo el catálogo local, sin salir a internet | **0** | \+ pesos por familia. **No** la curva de frescura |
| **3 · volver a correr** | sólo cuando no hay ni texto de señal | **60**, fuera de horario de producción | todo |

`./prospector regenera` lo diagnostica y **ordena por lo barato primero** —empezar
por las caras dejaría el aprendizaje esperando el presupuesto. Y dice no sólo
**qué** falta sino **qué se pierde** por faltarle: «le falta la fuente» no le dice
a nadie por qué debería importarle.

**El comando que arregla una cuenta no adivina la fuente**: deja el hueco marcado.
De esa fuente sale el peso que el lazo 1 va a mover, así que inventarla es
inventar la procedencia de la cuenta.

**Regla de oro: no se borra la ficha vieja.** Una cuenta regenerada tiene que
poder compararse contra lo que dijo antes; si la nueva dice otra cosa, eso es un
hallazgo, no un accidente que nadie notó.

### Lo que salió al regenerar Coficab Pesquería, y es un hallazgo

Se regeneró de verdad (`fuente: prensa_industrial`, tipo derivado `obra_nueva`) y
el evaluador la puntuó en **22.7 → `archiva`**, muy por debajo del umbral
`guarda` de 40 y del `pasa` de 60. Con la señal más fuerte disponible de esa
cuenta —los tres proyectos de agua helada del grupo, vía `expansion_odoo`— sube a
**51.6 → `guarda`**, y tampoco llega a `pasa`.

> **La cuenta en la que se gastaron 21 búsquedas y una ficha completa no habría
> pasado el radar.** Lo cual no está mal en sí —entró como `manual`, por criterio
> del dueño— pero significa que **el radar, calibrado como está hoy, no habría
> encontrado la mejor cuenta viva de FTS.**

Y el desglose dice exactamente por qué: `tipo_de_obra: 0.0`. Ver D3.

---

## 7 · El piloto

Cuatro semanas, **cero escrituras a Odoo**, y cada semana entrega algo que se
puede juzgar sin la siguiente.

| Semana | Qué se hace | Qué se entrega | Riesgo |
|---|---|---|---|
| **1** · 29-sep a 3-oct | Levantar Postgres con el esquema. Regenerar las cuentas de nivel 1 y 2 (cero consultas). | La base viva y el reporte de `regenera` con cero pendientes baratos | ninguno: cero consultas, cero escrituras |
| **2** · 6-oct a 10-oct | Cargar a mano **10 tarjetas** de cuentas ya evaluadas, con su expediente. Generar su CSV de importación y que **Esteban revise las 10 tarjetas** antes de subir ninguna. | 10 CSV revisados, con la lista de lo que Esteban corrigió | el riesgo está aquí, y es el bueno: se descubre que la forma de la tarjeta está mal **antes** de escribir |
| **3** · 13-oct a 17-oct | Esteban sube los CSV que aprobó. Rissia y Pablo trabajan la cadencia con el tablero, y **cada toque se cierra con su resultado** en Postgres. | los primeros toques reales registrados | que nadie registre los toques. Se mide: si a la semana 3 hay menos de 15 toques cerrados, el problema es el flujo de captura, no el motor |
| **4** · 20-oct a 24-oct | Primer `./prospector aprendizaje`. **Se espera que las tres compuertas digan `prematuro`**, y eso es el éxito de la semana 4. | el reporte, con las tres compuertas y lo que faltaría | que alguien mueva un peso con 10 cierres |

### Lo que el piloto tiene que demostrar, y no es «que funcione»

1. que **el operador de verdad declara la fuente** cuando abre una cuenta —si no
   lo hace, ningún lazo se alimenta y todo lo demás es decoración;
2. que **los toques se cierran con su resultado** —un toque sin resultado es un
   toque que no enseñó nada;
3. que la **forma de la tarjeta** aguanta la revisión de Esteban sin diez
   correcciones.

Ninguna de las tres necesita escribir en Odoo, y las tres pueden fallar. Si la
número 1 falla, el problema no se arregla con más código: se arregla decidiendo
si el operador es quien declara o si el radar es el único que abre cuentas.

### Por qué 20 cierres tardan, y qué hacer mientras

A 10 tarjetas por quincena, el lazo 1 alcanza su compuerta **por celda** en unos
**cinco meses** —y sólo para las fuentes más usadas. Es el precio de no aprender
con ruido, y hay dos cosas que se pueden hacer mientras:

* **el lazo 2 ya funciona desde la semana 3.** Abre con un rebote, y los rebotes
  llegan solos.
* **las 44 cuentas del censo que nunca se han evaluado** son el camino más rápido
  a los 20 cierres. Pero cuestan 60 consultas cada una y horario fuera de
  producción: es decisión de presupuesto, no de diseño.

---

## 8 · Lo que decide Esteban

### D1 · ¿Quién declara la fuente de la señal, y qué pasa si nadie la declara?

Hoy `senal` **exige** una fuente del evaluador y se niega sin ella, pero nada
obliga a correr `senal`. Una cuenta sin expediente se trabaja igual y no enseña
nada.

* **(a)** dejarlo así — el operador declara cuando se acuerda; se pierde
  aprendizaje en silencio;
* **(b) recomendado** — que `ficha` **avise** cuando la cuenta no trae
  expediente, igual que avisa del padrón y de la cuenta fría. No bloquea, y el
  hueco deja de ser invisible;
* **(c)** que `ficha` se **niegue** sin expediente. Es la más estricta y la que
  puede detener una ficha urgente un viernes.

### D2 · Los números de las compuertas: 20, 1, 3, 10

Son razonados, no medidos —como los plazos del §4b. El **20** viene del diseño.
El **1** del lazo 2 es el que más discusión merece: ¿un solo rebote basta para
bajar un correo a `DESMENTIDO`? *Mi lectura: sí* —un rebote duro es definitivo, y
el costo de equivocarse es pedir el correo otra vez por conmutador, contra el
costo de seguir escribiendo a un buzón muerto. Pero es tu llamada.

### D3 · El hueco del vocabulario: una planta nueva puntúa cero en tipo de obra

**Medido:** `tipos_que_nombra()` no reconoce «segunda planta», «planta nueva»,
«ampliación de nave» ni «construye una planta». Una **planta nueva —la señal más
fuerte que FTS puede recibir, porque necesita todo— contribuye 0 al factor de
tipo de obra.** Y cuando sí hay match (`nave industrial`) apunta a
`trabajos_civiles`, de la familia **estructura (11.7%)**, una de las más chicas:
una planta nueva se puntúa como un trabajo civil pequeño.

Es la misma clase de hueco que la DECISIÓN 1 de #305, donde el radar no tenía
eléctrico —su familia más grande.

* **(a) recomendado** — agregar los términos de obra nueva apuntando a un tipo
  que refleje que la obra **la necesita toda**: es una línea en
  `TERMINOS_DE_TIPO` más una decisión de a qué tipo apunta;
* **(b)** dejarlo, y aceptar que las plantas nuevas entran por criterio del dueño
  y no por el radar.

**No lo cambié**: cambiar el vocabulario del radar cambia qué detona, y la
DECISIÓN 1 de #305 fue una decisión explícita tuya.

### D4 · La etapa 2 sigue esperando alcance exacto

Cuando la forma de la tarjeta esté validada (semana 2 del piloto), la etapa 2
necesita de ti: **qué modelos, qué usuario, qué se audita.** La recomendación de
`motor3-crm-odoo.md` §4e no cambia —vía A, con el flujo **fuera** del n8n
actual— y sigue en pie lo que no recomiendo: usar la credencial de Odoo que ya
existe en la suite.

### D5 · Un detalle del guardia de datos personales

`DOMINIO_EJEMPLO` está anclado con `$`, así que `ejemplo.mx` **no** queda
permitido por dominio —sólo pasan los locales de la lista (`test@`, `demo@`,
`nombre.apellido@`). El guardia quedó **más estricto** de lo que su docstring
sugiere, que es la dirección segura. Lo dejo así y lo reporto: **aflojar un
guardia de datos personales es decisión tuya, no mía.**

---

## 9 · Qué espera qué

| Pieza | Estado |
|---|---|
| El expediente de la señal (`senal_origen`, `./prospector senal`) | **construido**, con prueba |
| El reloj de caducidad con sus cinco niveles de precedencia | **construido**, los siete tipos tienen plazo |
| La llave de reciclaje `dominio\|ciudad` | **construido**, y devuelve `NULL` cuando no hay dominio observado |
| `DESMENTIDO` y `Dato.desmentir()` | **construido**, y la ficha ya dice «NO LO USES» |
| Los tres lazos (`flujo/aprendizaje.py`) | **construido**, y ninguno mueve una constante |
| El esquema de Postgres | **construido y aplicado** contra Postgres 16 |
| `./prospector regenera` y `./prospector aprendizaje` | **construidos** |
| El prototipo del tablero | **construido**, sin datos personales |
| El cron de la cadencia | **espera n8n** — y n8n espera el Worker desplegado |
| **Etapa 2: escritura a Odoo** | **espera tu OK con alcance exacto** |
| D1, D2, D3, D5 | **esperan tu decisión** |
