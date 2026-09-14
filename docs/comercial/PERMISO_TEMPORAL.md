# Permiso temporal de escritura

**Estado: CONSTRUIDO COMPLETO en V1.25 (2026-09-10), con las cinco decisiones
de §2 aprobadas por Esteban tal como estaban escritas.** Idea original de
Ricardo; el encargo salió de la sesión V1.24 del issue #140.

> Lo que sigue después de este cuadro es **la propuesta como se escribió**, sin
> retocar: es el razonamiento que sostiene cada decisión y por eso se conserva
> tal cual. Lo construido y cómo se comprobó está en **§6 y §7**.

| | qué | estado |
|---|---|---|
| la tabla `comercial.machote_prestamo` con el tope de 24 h | migración `005` | ✅ aplicada a producción |
| el candado del guardado: «¿es suyo, **o hay préstamo vigente**?» | `machote-guardar` | ✅ **publicado y vivo** |
| el endpoint para prestar y recoger | `comercial/machote-prestar` | ✅ construido · ⏳ **falta publicar** |
| la lista con los préstamos vigentes | `comercial/machotes-leer` | ✅ escrito · ⏳ **falta publicar** |
| la pantalla: prestar, ver a quién, recoger, el aviso de los 15 min | `js/prestamo.js` | ✅ |
| la marca en el historial «versión escrita por quien no es el dueño» | `js/historial.js` | ✅ |

⚠️ **Los dos workflows con ⏳ los publica una persona en la UI de n8n.** El
frontend está hecho para tolerar que todavía no lo estén: sin la columna
`prestamos` no aparece ningún préstamo y la pantalla se comporta como en V1.24,
y si alguien aprieta «Prestar» antes de tiempo, la respuesta dice **que falta
encender el endpoint**, no «no se pudo». Es el lado tolerante primero, como
exige la regla anti-trabón de CLAUDE.md §8.

> El dueño de un machote le da permiso de edición a otra persona, con vigencia,
> con tope de 24 horas, para los casos en que alguien más tenga que meterle mano.

---

## 0. Lo que ya existe y no hay que inventar

Antes de proponer nada conviene decir qué parte del problema ya está resuelta,
porque es más de la que parece. Todo esto está **leído del workflow
`comercial/machote-guardar` (`18FIeK835R6h96K3`) el 9-sep-2026**, no supuesto:

**La autoría ya es un dato aparte de la propiedad.** La tabla
`comercial.machote` tiene `dueno`; la tabla `comercial.machote_version` tiene
`autor` y `autor_nombre`. Son columnas distintas y se llenan de fuentes
distintas: el `autor` de cada versión sale del **token verificado**
(`d.actor` en `Code - Armar parametros`), nunca del cuerpo de la petición.

Esto contesta sola la pregunta más importante del encargo —cómo queda
registrado en el historial que una versión la escribió alguien que no es el
dueño— y la contesta de la mejor manera posible: **ya queda registrado, ya es
infalsificable desde el navegador, y no hace falta migración para ello.** Lo
único que falta es *enseñarlo*: hoy la pantalla de historial pinta el autor de
cada versión, así que un lector atento ya lo vería, pero no hay ninguna marca
que diga «esta versión NO la escribió el dueño». Eso es una línea de render.

Es justo el caso de las comisiones que motivó el histórico: si alguien cambia
el reparto en el machote de otro, la versión queda con su nombre encima.

**La regla de concurrencia ya aguanta dos escritores, y no por casualidad.**
El encargo pide verificarlo. Verificado, leyendo el mecanismo:

1. El cliente manda `version_leida`; el servidor calcula `version_nueva = leida + 1`.
2. El `INSERT` cae sobre `comercial.machote_version`, que tiene un índice único
   sobre `(machote_id, version)` — `mv_machote_version_uq`.
3. Si dos personas leyeron la v15 y las dos guardan, las dos intentan insertar
   la v16. **La base deja pasar una y rechaza la otra**, y el rechazo se
   traduce a `CONFLICTO_DE_VERSION` con el texto *«Alguien más guardó mientras
   tanto. Vuelve a abrir el machote para no pisar su cambio.»*

Lo que importa para esta propuesta: **esa regla no mira quién escribe, mira
sobre qué versión escribe.** Es una condición sobre el machote, no sobre la
persona. Así que dos personas con derecho a escribir se comportan exactamente
igual que una persona con dos pestañas abiertas — un caso que ya ocurre hoy y
que ya está cubierto. No hay que tocarla.

⚠️ **Límite honesto de esta verificación:** está leída del mecanismo (índice
único + traducción del error), no ejercida con dos escritores simultáneos
contra la base. Es la clase de cosa que CLAUDE.md §8 pide no dar por
verificada sin ejecutarla. **Antes de construir esto hay que correr la prueba
de las dos escrituras a la vez**, igual que se midió la secuencia del folio
con veinte conexiones. Lo digo aquí para que no se me olvide después.

**Lo único que de verdad habría que cambiar** es una condición: el nodo
`IF - Es suyo?` compara `machote.dueno === actor` y, si no coincide, contesta
`MACHOTE_DE_OTRA_PERSONA` sin tocar nada. Ese es el candado que habría que
enseñarle a consultar los permisos vigentes.

---

## 1. Recomendación, en una línea

**Construirlo, pero como un préstamo del machote, no como un rol.** Concreto:

> El **dueño** presta **un machote** a **una persona**, por un plazo que él
> elige hasta 24 horas. Mientras dura, esa persona escribe como escribiría el
> dueño y cada versión suya queda con su nombre. El dueño lo puede recoger
> cuando quiera. Al vencer no interrumpe a nadie: la pantalla se traba en el
> siguiente guardado y lo dice.

---

## 2. Las decisiones, una por una

### 2.1 Quién otorga y a quién

**Otorga el dueño, y sólo el dueño.** No dirección, no un administrador.

La razón: el permiso existe porque el dueño no puede o no quiere meterle mano a
su cotización ahora mismo. Quien sabe eso es él. Un permiso que un tercero
pueda dar por encima del dueño ya no es un préstamo, es una intervención, y esa
es otra conversación (una que probablemente no queremos tener con las
comisiones de por medio).

**A cualquiera del módulo**, es decir a quien tenga `comercial:read` — que
desde V1.24 es todo el mundo que entra a Comercial. No hay que elegir de una
lista corta: el universo son las personas que ya aparecen en el filtro de
persona de la lista.

### 2.2 Cómo se revoca antes de que venza

**Un botón, en el mismo sitio donde se otorgó**, y efecto inmediato: la
siguiente vez que el prestatario guarde, el servidor lo rechaza.

No hace falta avisarle en el momento ni cerrarle la pantalla. Lo que sí hace
falta es que el rechazo diga la verdad — *«El dueño recogió el permiso»*, no
*«no se pudo guardar»* — y que la pantalla ofrezca copiar lo que quedó sin
guardar. Que sea el mismo mecanismo del vencimiento (§2.3) es a propósito:
un solo camino de código para dos causas, y el mensaje distingue cuál fue.

### 2.3 Qué pasa si vence a media edición

Ésta es la decisión que puede salir mal, así que la escribo con cuidado.

**El permiso se comprueba al GUARDAR, no al abrir.** Consecuencia directa: se
puede estar tecleando cuando vence, y el trabajo de esos minutos existe sólo en
ese navegador.

Tres maneras de tratarlo, y por qué elijo la tercera:

| | qué hace | por qué no |
|---|---|---|
| a) Trabar la hoja al vencer | un temporizador apaga los campos | el reloj del navegador no es el del servidor; trabaría de más o de menos, y trabar a alguien a media frase es la peor manera de enterarse |
| b) Renovar solo mientras escriba | el permiso se extiende con la actividad | vuelve el tope de 24 h una ficción: quien deje la pestaña abierta escribe para siempre |
| c) **Avisar antes, y al vencer no perder nada** | *(la recomendada)* | — |

**(c) en concreto:** una franja discreta cuando faltan **15 minutos**
—«tu permiso sobre COT-0003 vence a las 4:20 p.m.»— y, si aun así vence
mientras edita, el guardado se rechaza con un mensaje que dice qué pasó y le
deja **su versión a la mano para copiarla o para pedir el permiso de nuevo**.
Nada se borra del navegador; el machote del dueño no cambió.

La regla de fondo, que es la misma del pulso y de la franja: **el sistema puede
negarse a guardar, pero nunca puede tirar lo que alguien tecleó.**

### 2.4 Qué pasa si el dueño edita al mismo tiempo

**Nada nuevo.** Ya está contestado en §0: el que llegue segundo se lleva
`CONFLICTO_DE_VERSION` y el mensaje que le dice que vuelva a abrir. No importa
cuál de los dos sea el dueño — la base compara versiones, no jerarquías.

Lo que sí conviene agregar es **cortesía, no seguridad**: que la pantalla del
dueño diga «prestado a Ricardo hasta las 4:20» mientras el préstamo esté
vigente. Que dos personas choquen y una pierda su cambio es correcto
técnicamente y desagradable en la práctica; saber que el otro está adentro
evita la mayoría de los choques sin candados de por medio.

### 2.5 ¿Del machote o de la oportunidad completa?

**Del machote.** Y no por simplicidad: **porque hoy la oportunidad no existe
como cosa.**

Un machote tiene `id`, `folio`, `dueno` y su historial. No hay tabla de
oportunidades, no hay campo que agrupe varios machotes como alternativas de una
misma venta, y no hay pantalla que los muestre juntos. Un permiso «de la
oportunidad» tendría que inventar primero la oportunidad — y ése es un frente
mucho más grande, con su propia discusión sobre qué es una alternativa y qué es
una cotización distinta.

Prestar de a un machote **no cierra esa puerta**: el día que exista la
oportunidad, un permiso sobre ella se resuelve como «préstamo de todos sus
machotes», y los préstamos individuales siguen valiendo. Al revés no: un
permiso de oportunidad hoy sería un permiso sobre una agrupación imaginaria.

---

## 3. La forma que tendría

Una tabla, cuatro campos que importan:

```
comercial.machote_prestamo
  machote_id     uuid      -> comercial.machote
  para           text      quien recibe el permiso
  otorgado_por   text      siempre el dueño al momento de otorgar
  otorgado_at    timestamptz
  vence_at       timestamptz   -- CHECK (vence_at <= otorgado_at + interval '24 hours')
  revocado_at    timestamptz   -- null mientras siga vivo
```

El tope de 24 horas va como **`CHECK` en la base**, no como validación en la
pantalla ni en el workflow. Es la misma razón por la que el folio es una
secuencia y no un contador en JavaScript: una regla que vive en un solo lugar y
que ningún camino nuevo puede saltarse por olvido.

Y el candado del guardado deja de preguntar «¿es suyo?» para preguntar
**«¿es suyo, o hay un préstamo vigente a su nombre?»** — una condición, en un
nodo que ya existe.

---

## 4. Lo que NO propongo, y por qué

- **Permiso de borrado.** El préstamo es para meterle mano a una cotización, no
  para deshacerse de ella. Borrar sigue siendo del dueño.
- **Permiso de enviar a Odoo.** Mandar una cotización a un cliente a nombre de
  otra persona es una decisión comercial, no una edición. Que la mande el dueño.
- **Cadenas de préstamo.** Quien recibe no puede prestar. Sin esto, a la
  segunda vuelta nadie sabe de quién es la cotización.
- **Permisos sin vencimiento.** El tope de 24 h es la idea de Ricardo y me
  parece la mejor parte de la idea: un permiso permanente es un cambio de dueño
  con otro nombre, y para eso conviene tener un cambio de dueño de verdad,
  explícito y con su registro.

---

## 5. Costo estimado

| pieza | tamaño |
|---|---|
| migración `005_prestamo.sql` + `CHECK` de 24 h | chica |
| endpoint `comercial/machote-prestar` (otorgar / revocar / listar) | mediana |
| condición nueva en `IF - Es suyo?` de `machote-guardar` | **una línea** |
| UI: prestar, ver a quién, recoger, y el aviso de los 15 min | mediana |
| marca en el historial «versión escrita por quien no es el dueño» | chica |
| prueba de dos escrituras simultáneas (deuda de §0) | chica |

Nada de esto es grande. Lo caro de este trabajo no es construirlo: es acordar
las cinco decisiones de §2, que es para lo que existe este documento.

---

## 6. Lo construido, y cómo se comprobó

**La migración `005`** se aplicó a producción por `comercial/db-migrate` tras un
ensayo en seco. El read-back del runner contra la base:

```
aplicada: 005 · sha256 ba5b828e…
migraciones:      001, 002, 003, 004, 005
tablas_comercial: evidencia, expediente, machote, machote_prestamo,
                  machote_version, propuesta
```

Antes de eso se **ejercieron las reglas** contra un clúster local — no basta con
que aplique, tiene que impedir lo que dice que impide:

| se intentó | resultado |
|---|---|
| prestar por 23 h 59 min | pasa |
| prestar por 24 h 01 min | **rechazado** por `prestamo_tope_24h` |
| vencer antes de otorgar | **rechazado** por `prestamo_vence_despues` |
| prestarse a sí mismo | **rechazado** por `prestamo_no_a_si_mismo` |
| dos préstamos vivos a la misma persona | **rechazado** por `machote_prestamo_vivo_uq` |
| prestar de nuevo tras recoger | pasa |

**El candado** se probó con la consulta exacta que quedó en el workflow, contra
los seis casos que puede recibir:

| quién pregunta | `puede_escribir` | `prestamo_pasado` | qué le dice la pantalla |
|---|---|---|---|
| el dueño | `t` | — | (guarda) |
| con préstamo vivo | `t` | — | (guarda) |
| con préstamo vencido | `f` | `vencido` | «Tu permiso venció. Pídelo de nuevo.» |
| un extraño | `f` | — | «Ese machote es de alguien más.» |
| tras recogerle el préstamo | `f` | `recogido` | «El dueño recogió el permiso.» |
| un `id_local` nuevo | `t` (`origen: creado`) | — | (crea y guarda) |

Esa última fila importa: el candado nuevo **no puede romper la creación de un
machote**, que es el camino que usa todo el mundo todos los días.

⚠️ **Lo que seguía SIN comprobar** era la concurrencia con dos escritores
simultáneos de verdad (§0): estaba razonada desde el mecanismo, no ejercida — y
ésa es exactamente la distinción que CLAUDE.md §8 pide no borrar.
**Ya se ejerció: §7.1.**

---

## 7. V1.25 · lo que faltaba, y cómo se comprobó

Esta sección cierra el ⚠️ de §6.

### 7.1 La concurrencia, ejercida contra la base real

Dos escritores de verdad sobre la **misma versión** del mismo machote, en el
Postgres de producción, por el endpoint vivo `comercial/machote-guardar`
(ejecución `93425` del runner temporal, `success`, `2026-09-10T05:30:40Z`
= 23:30:40 CST del 9-sep).

El **read-back contra la base**, leído aparte y después (ejecución `93777`,
`2026-09-10T13:35:28Z` = 07:35 CST), tal como salió del `SELECT`:

```
COT-0008 · id_local M-V125-CONCURRENCIA · dueno zz.prueba.v125.duenio

 tipo      version  autor                    motivo                                  creada_at (UTC)
 version   1        zz.prueba.v125.duenio    —                                       2026-09-10 05:28:49
 version   2        zz.prueba.v125.duenio    concurrencia V1.25 · control-duenio      2026-09-10 05:30:40
 version   3        zz.prueba.v125.presta    concurrencia V1.25 · control-presta      2026-09-10 05:30:41
 version   4        zz.prueba.v125.presta    concurrencia V1.25 · simultanea-presta   2026-09-10 05:30:41

 prestamo  para zz.prueba.v125.presta · otorgado_por zz.prueba.v125.duenio
           vence_at 2026-09-10 07:28:49 UTC (= 01:28 CST del 10-sep) · revocado_at: vivo
```

Cuatro versiones, **no cinco**. Las dos últimas escrituras se mandaron las dos
sobre la versión 3: pasó la del prestatario (quedó como 4) y la del dueño fue
rechazada con

> `CONFLICTO_DE_VERSION` — «La versión que sigue es la 5, no la 4. Alguien más
> guardó mientras tanto: vuelve a abrir el machote.»

Que en la base no exista una quinta fila es la prueba: no es que el mensaje se
haya pintado bonito, es que **el renglón no se escribió**. Lo hace el índice
único `mv_machote_version_uq (machote_id, version)` de la migración 003 — la
regla mira **sobre qué versión** se escribe, no quién escribe, y por eso dos
personas con derecho se comportan igual que una persona con dos pestañas.

Y la **versión 3 quedó a nombre del prestatario con el dueño intacto**: ése es,
textualmente, el caso de las comisiones que motivó el histórico.

Las fases de control (2 y 3, una escritura de cada quien por separado) existen
a propósito: sin ellas, una cripto rota o un token mal armado habrían dado el
mismo «rechazado» y se habría leído como que el candado funciona.

### 7.2 Qué ve el que pierde

Lo que la base rechaza no puede costarle a nadie lo que tecleó. Cómo se
sostiene, en orden:

1. Lo escrito sobre un machote prestado se guarda en un cajón aparte de este
   navegador (`fts_machote_prestado_v1`), **síncrono y antes de llamar al
   servidor** — no después, ni «si todo sale bien».
2. El rechazo pinta un aviso que **distingue las tres causas** —permiso
   vencido, permiso recogido, y alguien más guardó primero— porque llevan a
   tres cosas distintas: pedirlo otra vez, hablar con el dueño, o volver a
   abrir el machote. Es la misma exigencia de CLAUDE.md §20 #12b.
3. Todos los avisos terminan igual: «Lo que escribiste sigue en este navegador
   y no se perdió», con un botón **Copiar lo mío** al lado. Sin el botón, la
   frase es amable y no se puede actuar sobre ella.
4. Al recargar, `bajar()` recupera del cajón lo que no subió y lo vuelve a
   poner en pantalla — mientras el permiso siga vivo. Sin permiso el machote
   vuelve a ser de sólo lectura y lo tecleado se recupera desde el aviso, no
   pisando la pantalla.

El cajón es **una llave distinta** de `fts_machote_v1` a propósito: esa llave
significa «lo mío», dos personas pueden tener el mismo `id_local` (Ricardo
tenía un `M-1041` y Esteban otro), y mezclarlas haría que el machote prestado
subiera como propio en el siguiente empujón.

### 7.3 Las pruebas que quedaron

Ocho pruebas de navegador nuevas, todas en `tests/pruebas-navegador.js`:

| prueba | qué cierra |
|---|---|
| prestar: sale la orden al servidor y el dueño ve que está prestada | el cuerpo NO lleva identidad — dueño y otorgante salen del token |
| prestar y guardar: el prestatario escribe, y guarda con la identidad del DUEÑO | `id_local` del dueño y `version_leida` del servidor; si fuera el suyo, crearía un machote nuevo a su nombre |
| préstamo VENCIDO | el aviso lo dice con esas palabras · lo tecleado sigue en el cajón |
| permiso RECOGIDO | el dueño lo recoge · al prestatario se lo dicen **distinto** de «venció» |
| EXTRAÑO sin préstamo | lo lee, no lo edita, no lo presta y **no entra al empuje** |
| crear una cotización nueva sigue funcionando para cualquiera | el préstamo no le puso una puerta al camino de todos los días |
| el historial DICE quién escribió cada versión | la marca «no es el dueño», y que NO se pinte en las del dueño |
| si el endpoint todavía no está publicado, lo DICE | el hueco del despliegue: el frontend mergea antes de que alguien publique |
| (A) el que PIERDE el choque conserva lo tecleado | sobrevive al rechazo, a recargar, y vuelve a la pantalla |

### 7.4 Tres defectos que sólo se vieron MIRANDO la pantalla

Ninguno se veía releyendo el diff, y los tres son de la superficie que entrega
esta sesión:

1. **El historial borraba su propia marca.** `marcar()` —que corre también al
   abrir, para seleccionar la última versión— reescribía el `className` entero
   de cada renglón, y con eso se llevaba `ajena`. La marca de «no es el dueño»
   moría antes de verse nunca; quedaba sólo el texto. Regla que deja: *una
   función que pinta UN estado no reescribe el `className`, toca SU clase.*
2. **El documento congelado se salía del recuadro.** Las dos columnas del
   historial son celdas de grid, y una celda de grid trae `min-width: auto`:
   crece más que su carril si su contenido no cabe. El `<pre>` medía 700 px y
   colgaba **113 px fuera en escritorio y 368 px en teléfono**. Un
   `min-width: 0` lo arregla y hace que el `overflow:auto` que el `<pre>` ya
   tenía por fin sirva de algo.
3. **«hasta las 10:13 a.m..»** — `toLocaleTimeString('es-MX')` ya trae punto.

Y uno más que no se vio en la pantalla sino en la **suite completa**: la
primera versión de `puedeEscribir()` devolvía `false` para los machotes de
DEMOSTRACIÓN, y con eso trababa la hoja de los cuatro ejemplos que la
aplicación trae de fábrica — o sea, lo primero que ve quien abre por primera
vez. Lo cazaron **41 pruebas**, ninguna de ellas del préstamo. Un ejemplo sí se
escribe: en cuanto alguien teclea encima deja de ser un ejemplo (`tocado()` le
quita el `_demo`); lo que no puede hacer es subir, y eso lo impiden dos
candados distintos que no son éste.
