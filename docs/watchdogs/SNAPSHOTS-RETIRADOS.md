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

## A dónde van ahora

A un repo **privado** dedicado, `fts-suite-snapshots`. Conserva git, `grep` y `diff` —que
era la razón para no usar SharePoint— y quita la exposición.

El endpoint del módulo los lee con la credencial del servidor; el navegador nunca ve la
ruta.

## Antes de repuntar el nodo

`HTTP - PUT snapshot (GitHub)` del workflow `ops/watchdog-semaforo` (`29eaGe2wkS98lRMU`)
apunta todavía a este repo. **No se repunta hasta verificar que el PAT de la credencial
`GitHub FTS Suite` alcance el repo nuevo**: si es fine-grained y está acotado a
`fts-suite`, el PUT falla y se pierde un snapshot diario.

Con la guarda de escritura arreglada (#230 A3), ese fallo **sí saldría impreso en el
correo** en vez de morir en silencio — pero la verificación va antes, no después.

## Quién los leía

**Nadie, programáticamente.** Barrido del repo completo: sólo menciones en prosa en cuatro
`.md`. El único que tocaba la ruta era el nodo que escribe.
