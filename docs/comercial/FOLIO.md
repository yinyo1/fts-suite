# El folio del machote — propuesta y decisiones

**Issue #140 · sesión 6 (2026-09-09) · V1.23**

Esteban pidió *proponer antes de construir* y dejar la propuesta escrita y separada
para poder corregirla. Esto es esa propuesta. **Ya está construida** en la misma sesión
—porque el encargo también decía que no esperara— pero cada decisión está aquí con su
porqué y con lo que costaría cambiarla, que es lo que hace que se pueda corregir.

---

## El problema

Un machote tenía dos identificadores y ninguno servía para hablar de él:

| | de dónde sale | por qué no sirve |
|---|---|---|
| `M-1788841740067` | lo inventa el navegador (`'M-' + Date.now()`) | trece dígitos; nadie lo dicta por teléfono |
| `24c87dc4-3824-…` | uuid de Postgres | peor |

Hacía falta un número corto, legible y sin choques.

---

## La tensión, y por qué se resuelve así

**Un folio sin choques tiene que asignarlo el servidor. Un machote recién capturado y
todavía sin subir no tiene servidor.**

Las tres salidas posibles:

| salida | qué pasa cuando falla |
|---|---|
| el navegador propone un folio | dos personas capturando a la vez se llevan el mismo número, **y el choque sale justo al subir** — el peor momento, con el trabajo ya hecho |
| se reserva un bloque de números por navegador | huecos enormes, y un navegador que se limpia se lleva su bloque a la tumba |
| **mientras no ha subido, no tiene folio** | la pantalla enseña el id de captura y dice por qué. Nadie pierde nada |

**Se eligió la tercera.** No es un rodeo: es que el folio *significa* «esto ya existe
para la empresa», y un machote que sólo vive en un navegador todavía no lo es.

Y el mecanismo no es «que el workflow se acuerde de pedir un número»: es una
**secuencia de Postgres como `DEFAULT` de la columna**. Ningún código tiene que
acordarse de nada, y `nextval` es atómico — dos `INSERT` en el mismo milisegundo
reciben números distintos. Encima hay un índice único, por si algún día alguien
escribe un folio a mano.

> **Medido, no supuesto:** 20 conexiones simultáneas insertando a la vez →
> 20 folios distintos, 0 duplicados. Y un `UPDATE` que intenta repetir un folio
> lo rechaza `machote_folio_uq`.

---

## La forma: `COT-0042`

- **`COT-`** y no `SO`: tiene que distinguirse de un folio de Odoo (`SO11498`) **al
  verlo y al dictarlo**. «cotización ciento cuarenta y dos» no se confunde con «orden
  once mil cuatrocientos noventa y ocho».
- **Cuatro dígitos**: ordena bien como texto y llega a 9,999. Al ritmo actual
  (17 machotes en tres meses) eso es más de una década.
- **La forma vive en la BASE**, como columna generada
  (`'COT-' || lpad(folio::text,4,'0')`), no en cada pantalla. Si la calculara el
  navegador, el panel, el correo y el PDF tendrían tres definiciones de lo mismo y
  bastaría con que una se quedara atrás para que dos documentos del mismo machote
  citaran folios distintos. Un solo escritor por campo (CLAUDE.md §20 #4).

---

## Sin año, sin reinicio, sin reúso

**No lleva año.** Las dos alternativas se descartaron por la misma razón, la forma
hablada:

- *Con reinicio anual*, el año sería **obligatorio** para desambiguar —hay un
  `COT-0001` cada enero— y la forma hablada quedaría larga para siempre.
- *Con año pero sin reinicio*, el año sería **adorno**: la gente lo dejaría de decir,
  y entonces «el 142» no se sabría si lo lleva o no.

Un solo contador, sin año, es lo más corto que sigue siendo único.

**Un número no se reusa.** `deleted_at` no lo libera: el índice único `machote_folio_uq`
**no** es parcial por `deleted_at` —al revés que `machote_id_local_uq`, que sí lo es a
propósito—, y la secuencia no devuelve lo que ya entregó. Los huecos que se vean son
la prueba de que nada se recicla, incluidos los huecos que deja una transacción que
falló, que es comportamiento normal de una secuencia y aquí es una característica.

---

## ¿El folio es del machote o de la cotización? ¿Hacen falta dos niveles?

La pregunta de Esteban, y la respuesta honesta: **hoy el machote ES la cotización, y
un solo nivel alcanza — pero no para siempre.**

**Lo que las versiones YA resuelven.** `machote_version` es append-only: la revisión 2
de una cotización no es un machote nuevo, es una versión del mismo. Así que
«la siguiente versión de una cotización» **no** debe crear un folio nuevo: el folio
nombra la *conversación con el cliente*, no la foto de un momento. Eso ya funciona.

**Lo que las versiones NO resuelven, y por eso algún día harán falta dos niveles:**

1. **Alternativas vivas a la vez** — opción A en inoxidable, opción B en carbón, las
   dos sobre la mesa hasta que el cliente elija. No son versiones: ninguna sustituye
   a la otra.
2. **La oportunidad** que agrupa varias cotizaciones distintas del mismo cliente.

**Recomendación: un solo nivel ahora**, pero con la forma elegida de modo que el
segundo se pueda agregar **sin renumerar nada**:

- una alternativa, cuando exista, será **`COT-0142-A` / `COT-0142-B`** — sufijo
  derivado del padre, para que se lean como hermanas;
- una oportunidad, si llega a existir, tendrá **su propia serie** (`OP-0007`) en vez
  de deformar la de cotizaciones.

⚠️ **Lo que hoy NO existe, y conviene no creer que sí:** no hay ningún vínculo entre
dos cotizaciones que se sustituyen o compiten. El folio no lo crea. Si mañana Esteban
manda dos precios al mismo cliente, hoy son dos machotes sin relación entre ellos.

---

## Duplicar

**Hoy no existe «duplicar machote».** Lo que existe es duplicar una *sección* o un
*renglón* (dentro del mismo machote, sin folio nuevo) y **importar un respaldo**, que
sí crea identidades nuevas: el entrante nunca pisa, entra al lado con
`id_local = M-1041-imp8k3f-1` y `_copia_de`.

La regla, y es la misma en los dos casos futuros:

> **Una copia es otra identidad, así que se lleva su propio folio.** Y está bien: es
> otra cotización.

Si algún día se agrega «duplicar para hacer una alternativa», ése es el momento en que
el sufijo `-A` / `-B` se gana su lugar — y no antes.

---

## Los que ya existían

Se numeraron **por fecha de alta**, para que el orden del folio sea el orden en que
nacieron, y **sólo los vivos**:

```
COT-0001  M-1788553038746   esteban.delacruz     Suministro de Pantalla HMI Automation Direct
COT-0002  M-1788841740067   esteban.delacruz     Machote de prueba Lifter robert
COT-0003  M-1788797168486   ricardo.hernandez    Lifter leveling - VIP Service
COT-0004  M-1788476839675   ricardo.hernandez    Baggers replacement - MF Rancho
COT-0005  M-1788565324195   francisco.montalvo   Movimiento de chiller
COT-0006  M-1788547694616   francisco.montalvo   Instalacion electrica Maquina en clarios componentes
COT-0007  M-1788474993070   francisco.montalvo   Osmosis mondelez salinas
```

Los diez ya borrados quedan en `folio = NULL` **y así se quedan**. Nunca tuvieron
folio, así que no se está reusando ningún número: no se entregó ninguno.

> **La alternativa que se descartó** era numerar los 17 y dejar que los diez muertos
> —dos filas de prueba y ocho ejemplos— se llevaran los primeros diez números. Es más
> «puro» (el folio seguiría a la fecha de alta sin excepción) y el efecto visible
> habría sido que la cotización más vieja de Esteban arrancara en **COT-0011**. Ese
> precio se paga cada vez que alguien lee un folio en voz alta, y se paga para siempre.

---

## Dónde se ve

| dónde | qué se ve |
|---|---|
| tabla (1280 px) | `COT-0003 · Cliente · SO11772` en la línea de abajo del nombre |
| tarjeta (380 px) | lo mismo, en la línea chica |
| encabezado al abrir | **botón grande con el folio**, se copia de un toque, junto al nombre |
| buscador | se encuentra tecleando `COT-0003` **o** `3` |
| sin folio | el id de captura, apagado, con el porqué en el `title`; y en el encabezado, «sin folio» |

El botón de copiar usa `navigator.clipboard` con respaldo a `execCommand` —obsoleto y
funciona, que es lo que importa cuando alguien está en el celular a media planta— y si
las dos fallan lo dice y enseña el folio para copiarlo a mano. Un botón que no hace
nada y no avisa es peor que no tenerlo.

---

## Lo que queda abierto para Esteban

1. **¿`COT-` es el prefijo que quieres?** Cambiarlo hoy es una migración de una línea
   (la columna generada). Dentro de un mes, cuando el número esté en correos y en
   PDFs, ya no.
2. **¿Cuatro dígitos o tres?** `COT-042` es más corto de dictar y llega a 999 — unos
   cinco años al ritmo actual.
3. **Los dos niveles** (alternativas y oportunidad) están diseñados pero **no
   construidos**. Se construyen cuando aparezca el primer caso real, no antes.
