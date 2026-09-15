# Las guardas del motor: cuáles avisan de verdad y cuáles no — y qué cambiar

Issue #240. Propuesta **no aplicada**: el motor es producción.

> ## ⚠️ Corrección a la primera versión de este documento
>
> Dije **6 de 9 ambiguas** y dije que **`msg94` es disparable por un martes
> tranquilo**. **Las dos cosas están mal**, y el error fue de método: clasifiqué
> por el *consumidor* de cada lectura sin mirar si su consulta tenía **ventana de
> fecha**. Al tabularlas:
>
> **`msg94` y `msgComment` no tienen filtro de fecha**: leen el histórico
> completo. Su vacío no significa «hoy no pasó», significa **«no ha pasado
> nunca»**, y eso con 36 proyectos no es un martes tranquilo: es un fallo.
> `msg94` **merece su `critico:true`** y no hay que tocarlo.
>
> Lo que sí se sostiene, y es lo que importa, es **el centinela `[0]`**: la
> cascada es estructural, no casual. Y el número real de guardas ambiguas es
> **3 seguras y 1 discutible**, no 6.

---

## La evidencia: 5 disparos registrados, 4 falsos

Los cuatro snapshots que llevan `_diag` (el campo es reciente):

| fecha | proyectos | `create_date` | guardas que dispararon |
|---|---|---|---|
| 2026-09-10 | 35 | **35 (100%)** | `msg94` **[CRITICO]**, `attachments` |
| 2026-09-11 | 36 | 2 (6%) | `attachments` |
| 2026-09-13 | 36 | 2 (6%) | `attachments` |
| 2026-09-14 | 36 | 2 (6%) | `attachments` |

- **`attachments`: 4 de 4 días. Las cuatro, falsas.**
- **`msg94`: 1 de 1. Verdadera** — el 10-sep la lectura murió de verdad y los 35
  contadores cayeron a la edad del proyecto.

O sea: la única guarda con historial de falsa alarma es `attachments`, y su
disparo es a la vez **cascada** de `msgComment` y **consumidor apagado**. La
proporción de `create_date` (100% contra 6%) separa perfectamente el día roto de
los días sanos — es la señal buena, y hoy no la usa ninguna guarda.

---

## Las nueve, con su ventana

La ventana es lo que decide si «0 filas» es ambiguo. Sin ventana, el vacío
significa «jamás»; con ventana corta, significa «no en estos días».

| # | nodo | filtro / ventana | ambiguo | `critico` hoy |
|---|---|---|---|---|
| 1 | `projects` | `stage_id in [...]` + 3 más | **no** | `true` |
| 2 | `SO` | `id in prep.soIds` · **centinela** | **sí** | `false` |
| 3 | `partners` | `id in prep.partnerIds` · centinela | **no** | `false` |
| 4 | `termlines` | **sin filtro**, tabla entera | **no** | `false` |
| 5 | `msg94` | `subtype_id=94`, **sin fecha** | **no** | `true` |
| 6 | `msgComment` | `message_type=comment`, **sin fecha** | discutible | `false` |
| 7 | `trackedMsgs` | **`date >= corte` (30 días)** | **sí** | `false` |
| 8 | `trackingVals` | `id in extractIds.trkIds` · **centinela** | **sí** | `false` |
| 9 | `attachments` | `id in extractIds.attIds` · **centinela** | **sí** | `false` |

**#3 `partners` no es ambiguo** porque los proyectos se filtran con
`partner_id != false`: si hay proyectos, hay partners. **#4 `termlines` tampoco**:
lee la tabla completa sin filtro.

**#6 `msgComment` es el discutible.** No tiene ventana, así que su vacío es «ningún
proyecto ha tenido jamás un comentario humano». Con 36 proyectos es improbable,
pero no imposible — los log notes del watchdog son `message_type=notification` y
**no cuentan aquí**, así que un equipo que nunca escribe en el chatter produce ese
cero legítimamente.

### El centinela `[0]`: por qué la cascada es de diseño

`Code - prep` y `Code - extractIds` sustituyen la lista vacía por `[0]`:

```js
soIds: soIds.length?soIds:[0]      trkIds: trkIds.length?trkIds:[0]
partnerIds: ...:[0]                attIds: attIds.length?attIds:[0]
```

El centinela es **correcto** por su cuenta — sin él, `id in []` en Odoo devolvería
la tabla entera. Pero nadie se lo dijo a la guarda, así que:

```
#7 trackedMsgs vacío (30 días sin mensajes)  ->  trkIds=[0]  ->  #8 trackingVals 0 filas, SIEMPRE
#6 msgComment sin adjuntos                   ->  attIds=[0]  ->  #9 attachments   0 filas, SIEMPRE
```

Una condición produce dos avisos. Eso no sólo avisa de más: **entrena al lector a
ignorar la sección**, que es cómo una guarda deja de servir sin dejar de existir.

---

## La propuesta, guarda por guarda

`rowsOf` recibe un predicado `vacioEsperado` por nodo, y devuelve **tres estados**
en vez de un booleano: `no_se_pudo_leer` (el `$()` lanzó — siempre alarma),
`vacio_esperado` (silencio) y `vacio_inesperado` (alarma).

| # | nodo | qué lo dispara HOY | qué lo dispararía DESPUÉS | `critico` |
|---|---|---|---|---|
| 1 | `projects` | 0 filas | igual: 0 filas | **`true`**, sin cambio |
| 2 | `SO` | 0 filas, incluso con `soIds=[0]` | 0 filas **sólo si `soIds != [0]`** | `false` |
| 3 | `partners` | 0 filas | igual | **subir a `true`** (ver abajo) |
| 4 | `termlines` | 0 filas | igual | **subir a `true`** (ver abajo) |
| 5 | `msg94` | 0 filas | igual, **más** un aviso nuevo: `create_date / total >= 50%` aunque haya devuelto filas | **`true`**, sin cambio |
| 6 | `msgComment` | 0 filas | igual, con el texto cambiado a «ningún comentario humano en todo el histórico» | `false` |
| 7 | `trackedMsgs` | 0 filas | 0 filas, con el texto diciendo **«en los últimos 30 días»** | `false` |
| 8 | `trackingVals` | 0 filas, incluso con `trkIds=[0]` | 0 filas **sólo si `trkIds != [0]`** | `false` |
| 9 | `attachments` | 0 filas, incluso con `attIds=[0]` **y con AP apagado** | 0 filas **sólo si `attIds != [0]` Y `ap_confirmacion.aplica_stages` no está vacío** | `false` |

Efecto medido sobre los 4 snapshots: **los 4 disparos de `attachments`
desaparecen** (centinela + consumidor apagado) y **el de `msg94` se queda**.
De 5 avisos, quedaría 1 — el verdadero.

### Los dos `critico` que propongo subir, y por qué

No es cosmética: su vacío **cambia números en silencio**.

- **`partners`** alimenta `partnerTerm` y `commercial_company_name`. Si viene
  vacío: (a) todos los proyectos «En plazo de crédito» pasan al plazo por
  omisión, o sea el color cambia sin que nadie lo sepa; y (b) el recorte del
  contacto pierde el nombre limpio de la empresa y **cae al corte por la primera
  coma** — el que mutila `EMPRESA, S.A. DE C.V.`. Eso es degradación de la
  redacción, y va a un snapshot público.
- **`termlines`** alimenta `termDays`. Vacío = el plazo de crédito de todos pasa a
  `credit_fallback_days`. Mismo tipo de daño: el semáforo sigue pintando colores,
  con otro criterio, sin decirlo.

Las dos son **inambiguas** (una lee la tabla entera, la otra no puede estar vacía
si hay proyectos), así que subirlas no mete ruido: si suenan, pasó algo.

### El aviso nuevo de `msg94`, que hoy no existe

`msg94` sólo avisa si devuelve **cero** filas. Un fallo **parcial** —la lectura
trae algunas y pierde otras— es invisible hoy: el contador de los perdidos cae a
`create_date` y nadie lo dice. La proporción lo detecta, y es la misma señal que
el parche S4 ya usa **del lado del correo**. Ponerla en el motor la arregla para
todos los consumidores a la vez: el correo, el snapshot y el panel.

---

## Lo que NO propongo

- **No tocar el centinela `[0]`.** Es correcto; el problema es que la guarda no
  lo mira.
- **No filtrar los diagnósticos en cada consumidor.** El correo ya lo hace para
  `attachments` (parche S4) y el panel del semáforo decidió **no** hacerlo. Tapar
  el síntoma en cada pantalla es cómo se llega a cuatro versiones de la verdad.
  El arreglo va en `rowsOf`.
- **No quitar ninguna guarda.** Las nueve siguen; cambia cuándo hablan.

---

Medido el 15-sep-2026 sobre el `jsCode` vivo de `Code - MAIN` en
`ops/semaforo-motor` (`RtP77DIATk4nogR5`, `versionId == activeVersionId ==
85f1b1c7-11dc-48de-8435-13a5f4b977e7`) y sobre los 4 snapshots de
`shared/operaciones/semaforo_snapshots/` que llevan `_diag`.
