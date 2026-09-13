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
