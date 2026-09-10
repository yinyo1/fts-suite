# Permiso temporal de escritura — propuesta

**Estado: PROPUESTA. Nada de esto está construido.** Es para que Esteban la
corrija antes de que exista código. Idea original de Ricardo; el encargo es de
la sesión V1.24 del issue #140.

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
