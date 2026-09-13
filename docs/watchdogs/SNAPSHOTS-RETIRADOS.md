# Snapshots del semáforo: retirados del árbol (2026-09-10)

Los snapshots diarios del semáforo **ya no viven en este repo**. Decisión de Esteban.

## Por qué

`yinyo1/fts-suite` es **público** y sirve Pages. El dataset completo del semáforo
—proyecto, cliente, etapa, días, banderas— era legible por cualquiera sin credenciales:

```
$ curl https://raw.githubusercontent.com/yinyo1/fts-suite/main/shared/operaciones/semaforo_snapshots/2026-09-10.json
HTTP 200   bytes=29964
```

Y el módulo Semáforo (#226) se diseñó con acceso **por usuario** y JWT en el endpoint.
Las dos cosas no pueden convivir: poner un candado en el endpoint mientras el mismo dato
se publica al lado es teatro.

## Qué se borró y qué se conserva

- **61 archivos**, del `2026-06-17` al `2026-09-09` (~1.3 MB). Retirados del árbol.
- **59 de los 61 traen nombres de contacto de clientes** (`Mission Foods, Robert Barrera`),
  que es justo lo que prohíbe la regla de datos personales en repo público. La redacción
  del campo `cliente` entró con S1 el 2026-09-09; el primer archivo limpio es el del
  2026-09-10.

**El historial NO se reescribió, y es una decisión deliberada.** Mismo criterio que se
aplicó al secreto HMAC (#228): reescribir historia mata ~1,593 SHAs y con ellos todas las
referencias de commits que viven en los issues, y **el valor sobrevive igual en forks y
clones**. Sacarlos de la vista quita el acceso casual, que es el 99% del riesgo real.

> **Riesgo aceptado y documentado:** los 61 archivos siguen siendo recuperables desde el
> historial de git por quien sepa buscarlos. No es un descuido: es una decisión tomada
> con el costo a la vista.

## A dónde van ahora — ⚠️ CORREGIDO el 2026-09-11: a ningún lado

> Este apartado decía que los snapshots se mudaban a un repo privado dedicado,
> `fts-suite-snapshots`, y que el nodo `HTTP - PUT snapshot (GitHub)` se repuntaría ahí.
> **Esa decisión se revirtió antes de ejecutarse: el repo privado NO se crea.**

La medición del chatter demostró que el **log note de Odoo sirve de línea base** —es
event-driven, tiene 90+ días de ventana y lo escribe el propio watchdog—, así que el
snapshot dejó de ser necesario para calcular el delta, que era su única razón de existir
como archivo completo. Lo que queda del snapshot se reduce a **agregados y diagnósticos**,
sin fila por proyecto y por lo tanto **sin nombres**.

**Nada que repuntar, nada que verificar del PAT.** El párrafo sobre el alcance de la
credencial `GitHub FTS Suite` queda sin objeto.

## Quién los leía

**Nadie, programáticamente.** Barrido del repo completo: sólo menciones en prosa en cuatro
`.md`. El único que tocaba la ruta era el nodo que escribe.

---

# Anexo (2026-09-12): los mismos nombres, en el prototipo del semáforo

Al montar el prototipo dentro del armazón de paneles (#237) salió que
`docs/watchdogs/prototipo/semaforo-modulo.html` traía **12 menciones de nombre de contacto
de cliente**, dentro del campo `name` del proyecto, con el patrón de Odoo
`… - Empresa, Persona`.

**Son 6 personas de 4 clientes, y son LAS MISMAS que ya estaban en los snapshots
retirados** — no es una filtración nueva, es un pedazo de la misma, recortado a otro
archivo. Medido contra el último snapshot antes del retiro:

```
$ git show f3a7f23^:shared/operaciones/semaforo_snapshots/2026-09-08.json \
    | grep -o "Omar De la Garza\|Robert Barrera\|Ruben Robledo\|Martín Infante\|Tito Everardo Ordaz\|Daniel Sanudo" \
    | sort | uniq -c
      2 Daniel Sanudo
      2 Martín Infante
      8 Omar De la Garza
      2 Robert Barrera
      2 Ruben Robledo
      8 Tito Everardo Ordaz
```

Los nombres de **empresa** no son el problema y se quedan. Los de **persona** se quitaron
del árbol con un reemplazo verificado (12 menciones en cada archivo, 35 filas intactas,
cero rastros al rebarrer), en el commit `0f92eb7`.

## Qué se publicó y por cuánto tiempo

Tres commits del **2026-09-10**, todos del mismo día:

```
7cb6f73  feat(semaforo): prototipo del modulo Semaforo en vivo (#226)
c21516a  feat(semaforo): prototipo con el formato corregido de la parte A (#226 #230)
6f90d63  fix(semaforo): prototipo CANONICO, 5 secciones, con las 4 correcciones (#226 #230)
```

El otro prototipo, `semaforo-vivo.html`, **está anonimizado desde su primer commit**
(`93d79e2`) y no participa: cero menciones.

## Decisión de Esteban (2026-09-12): se aceptan, sin reescribir historia

**Mismo criterio y mismas razones que con los 61 snapshots**, y por eso vive aquí y no en
un documento aparte: reescribir historia mata los SHAs y con ellos las referencias de
commits que viven en los issues, **y el valor sobrevive igual en forks y clones**. Sacarlos
de la vista quita el acceso casual, que es el 99% del riesgo real.

> **Riesgo aceptado y documentado:** las 12 menciones siguen siendo recuperables desde el
> historial de git por quien sepa buscarlas. No es un descuido: es una decisión tomada con
> el costo a la vista.

## Lo que SÍ se arregla: el corte va en el motor

Quitarlos de un archivo no arregla nada, porque **la causa está aguas arriba**: el `name`
del proyecto en Odoo trae el contacto pegado, así que **cualquier cosa que publique nombres
de proyecto vuelve a publicar contactos**. Hoy el correo diario los imprime, y el endpoint
`ops/semaforo` los devolvería.

**El corte va en el MOTOR, no en cada consumidor.** Si vive en el consumidor, el próximo
panel los vuelve a publicar — y el próximo panel siempre llega. Un solo lugar recorta
`, Persona` del `name` antes de que salga, y **las dos superficies —correo y endpoint—
quedan limpias por construcción**, no por disciplina.

---

## APLICADO (2026-09-13): el recorte vive en el motor

Nodo nuevo **`Code - recorte contacto`**, el **último** de `ops/semaforo-motor`
(`RtP77DIATk4nogR5`). Por ser el último, todo lo que salga del motor —hoy y lo que se
conecte después— sale recortado; no hay forma de añadir un consumidor que se lo salte.

### Eran DOS campos, no uno

El corte que existía vivía en `Code - buildSnapshot` del padre y cortaba **sólo `cliente`**.
Medido sobre el snapshot público del 13-sep (commit `0172c20`):

```
name    con contacto:  12 de 36
cliente con contacto:   0 de 36   <- ya lo cortaba buildSnapshot
```

Y `Code - buildEmail` **no tiene redacción de ninguna clase**, así que los contactos no sólo
estaban en el snapshot: **salían en el correo diario al equipo**. Son **tres** superficies
—snapshot, correo, futuro endpoint— y por eso el corte tenía que ir aguas arriba de las tres.

### Por qué NO se corta en la primera coma

Era el camino obvio y es el equivocado. Dos casos reales del mismo corte de 36 proyectos
lo prueban, y los dos **sobrevivieron intactos** con el mecanismo que se eligió:

| proyecto | campo | valor | qué habría hecho el corte por coma |
|---|---|---|---|
| 2349 | `name` | `SO11762 - Mejoras a sistema TOPOCHICO, MTY. - Nalco de Mexico` | truncar en `…TOPOCHICO` |
| 2359 | `name` | `SO11771 - Subestación PI Aurora - Conmet de México, S.A. de C.V.` | truncar el `S.A. de C.V.` |

`EMPRESA, S.A. DE C.V.` es un nombre legal normal, y el nombre de un proyecto puede traer
comas legítimas. **En vez de adivinar, se le pregunta a Odoo:**
`res.partner.commercial_company_name` ya trae la empresa limpia, y está poblado **tanto
para un contacto como para un partner que ES empresa** (medido en los dos casos). La coma
queda sólo como último recurso si ese campo no llega — y ese recurso **también recorta**, o
sea que si el nodo de partners viniera vacío la fuga seguiría cerrada. Falla hacia el lado
tolerable, que es el criterio de §9 de `CLAUDE.md`.

Para `name` el recorte **no trunca**: sustituye la aparición literal del `display_name`
completo por la parte de empresa. Si el partner ya es la empresa (`display_name` ==
`commercial_company_name`), el nodo **no toca nada**.

### Verificación (ejecución `97445` del motor, 2026-09-13 16:19 UTC = 10:19 CST)

36 filas, `lastNodeExecuted: Code - recorte contacto`, **cero nombres de persona**. Y la
equivalencia de cálculo se sostiene: `racha_nota:2` + `sin_avance:true` en los proyectos
2362 y 212 —el canario que exige que sigan corriendo los bigramas y los diacríticos
invisibles del `Code - MAIN`—, más `fuente_a`, banderas con su `ev` y `_diag` idénticos.

`Code - MAIN` **no se tocó**: sus 13 KB traen dos regex con diacríticos combinantes
invisibles (`[̀-ͯ]`) y editarlo por MCP obliga a reenviar el cuerpo completo, o
sea a transcribirlo. Un nodo nuevo no transcribe nada.

### Cuántas personas: 8 hoy, y la cuenta PUEDE CRECER

**8 personas identificadas** en los 14 proyectos cuyo partner es un contacto (7 medidas por
`res.partner` + la contacto de MAGNEKON). **La cuenta no es una lista: es un patrón de
captura.** Cada vez que alguien elija el contacto en vez de la empresa al crear la SO,
aparece uno nuevo — y el recorte lo cubre sin que nadie lo agregue a ningún lado, porque no
depende de conocer los nombres.

> Aviso de método: partner `2035` tiene el mismo nombre de persona que el `1907` pero sin
> empresa padre, y **no lo usa ninguno de los 36**. Apareció sólo por buscar por nombre.
> Un duplicado así es justo cómo un conteo por nombre se infla.

### Hallazgo operativo para Esteban (NO es una propuesta de cambio)

**La causa real está en Odoo: el partner de estos proyectos es el CONTACTO, no la empresa.**
Mientras eso siga así, **el recorte es un parche permanente** — correcto, en un solo lugar,
pero permanente. Clientes donde ocurre hoy:

```
Nalco de Mexico              6 proyectos
Calbee America Incorporated  4
Mission Foods                3
Bridgestone México           1
MAGNEKON S.A. DE C.V.        1
```

No se propone aquí ningún cambio en Odoo: no es decisión de esta sesión.

### Backlog anotado (no se persigue)

- `redactCliente()` de `Code - buildSnapshot` queda **redundante** y corta por coma: el día
  que exista un cliente llamado `EMPRESA, S.A. DE C.V.` lo truncaría en el snapshot.
  Cosmético, y ya no es la defensa de nada. Retirarlo cuando se toque el padre.
- `buildSnapshot` **no tiene compuerta de modo**: cualquier corrida manual commitea al repo
  público. Es lo que hizo el snapshot del 13-sep.
