# S1 · cuerpos de los Code nodes de `ops/watchdog-semaforo` (issue #220)

Copia fiel de los tres `jsCode` que S1 dejó **publicados** en el workflow
`29eaGe2wkS98lRMU`. Están aquí para que el cambio sea revisable en un diff: por el
MCP de n8n el código se manda como un string completo, así que sin esto el único
lugar donde vive es dentro del workflow.

| Archivo | Nodo n8n |
|---|---|
| `Code-MAIN.js` | `Code - MAIN` |
| `Code-buildEmail.js` | `Code - buildEmail` |
| `Code-buildSnapshot.js` | `Code - buildSnapshot` |

## Estado publicado (2026-09-09 19:52 UTC)

- **Versión ACTIVA = borrador**: `versionId == activeVersionId ==`
  `2aac86ca-732e-4aab-9208-68f1e9458777`. `active:true` · `triggerCount:1` ·
  `availableInMCP:true` · `timezone Etc/UTC`. Producción corre este código.
- **Llave de reversa al S1 sin digest:** `88ed2eed-6711-4771-b21d-86c4bac0ab5c`
  (la versión que estuvo activa entre las 15:01 y las 19:52 UTC del 9-sep).
  `restore_workflow_version` sobre ese id quita el digest y la redacción y deja
  el S1 original.
- **Llave de reversa al pre-S1:** `a3781e87-e476-4d23-a891-d11e240e82a8`.

## Lo que agregó esta tanda

1. **Digest de estado completo** en `Code - buildEmail` (función `secDigest`).
   Sale los días que diga `config.digest_dias` de `sla_stages.json` — producción
   `[1]` = lunes; el resto de la semana el correo sigue siendo delta puro. Si la
   llave falta, el código asume `[1]`, así que la config vieja sigue sirviendo sin
   cambios (lado tolerante primero). **Ningún umbral se movió.**
   El día del digest el correo **siempre** sale: la rama de "sin cambios" dejó de
   ser un latido corto y ahora trae el estado completo.
2. **Redacción del campo `cliente`** en `Code - buildSnapshot`, cortando en la
   primera coma antes de publicar al repo público. Los 8 nombres de contacto que
   ya están en los snapshots históricos **NO se limpian**: riesgo aceptado
   conscientemente, no resuelto — borrarlos del archivo no los borra del
   historial de git.
3. `_diag` sube al nivel del snapshot en vez de repetirse en cada fila, y las
   filas ya no llevan `_diag` ni `_flagsNuevas`. Es **preventivo**: `_diag` lo
   introdujo S1 en `Code - MAIN`, así que ningún snapshot publicado lo llegó a
   cargar.

## Prueba en vivo antes de publicar (ejecución `92620`)

`2026-09-09 16:45:48 UTC`, `success` en 9.2 s, contra `sla_stages.TEST.json` de la
rama con `digest_dias:[3]` para forzar el digest un miércoles.

- `HTTP - Enviar correo (Graph)` → output `{}` = **202**, un solo correo a
  `estebandelacruz@fts.mx` (`modo_prueba:true`).
- Asunto: `[Semaforo Operaciones + Admin] 09/Sep/2026 - 1 cambio fuera de
  Comercial · 6 datos por revisar · estado semanal · REVISAR MEDICION`.
- `ESTADO COMPLETO DE LA SEMANA [35]` → 🔴 24 · 🟡 0 · 🟢 11, por días desc,
  encabezando SO7723 (MAGNEKON) con 402d.
- `Code - buildSnapshot` 9 ms; el snapshot decodificado trae `total:35`,
  `_diag` en la raíz, **0** filas con `_diag`/`_flagsNuevas` y **0** clientes con
  coma — 10 razones sociales publicadas, ningún nombre de persona.

⚠️ **Límite del `modo_prueba` que conviene saber:** con `modo_prueba:true` el
grupo se llama `"Operaciones + Admin"` y las filas traen `grupo` `"Operaciones"` o
`"Admin"`, así que **las secciones de delta salen todas en 0 por construcción**
(el filtro por grupo no calza) y el pie dice "0 proyectos en condición estable".
No es una regresión: es el modo prueba. El delta se validó aparte con un harness
local contra los snapshots reales del 4/7/8-sep.

## Hallazgo anotado, NO perseguido (backlog)

**El PUT del snapshot solo puede CREAR, nunca actualizar, y falla en silencio.**
`HTTP - PUT snapshot (GitHub)` manda `{message, content, branch}` sin `sha`, así
que si el archivo del día ya existe GitHub responde **422** (`"sha" wasn't
supplied`) y `onError:continueRegularOutput` lo convierte en dato → el nodo
reporta `success`. Crudo de la ejecución `92620`:

```
HTTP - PUT snapshot (GitHub) · executionStatus: "success"
  json.error.status  = 422
  json.error.message = 422 - {"message":"Invalid request.\n\n\"sha\" wasn't supplied.", ...}
```

En la cadencia normal (una corrida a las 08:00) es invisible e inofensivo: el
archivo no existe todavía y el PUT lo crea. Pero significa que **cualquier
re-corrida del mismo día deja el snapshot viejo**, con un check verde encima. Es
la misma clase de fallo que la regla "el 200 no prueba la escritura"
(CLAUDE.md §8), del lado contrario: un 422 disfrazado de éxito. El arreglo es
leer el `sha` con un GET previo y mandarlo en el PUT.

Consecuencia práctica de hoy: la prueba **no tocó `main`**, y la redacción del
`cliente` se verá en el repo a partir de la corrida del jueves 10-sep 08:00 CST.

## Sin secretos

Ninguno de los tres nodos lee `$env` ni contiene credenciales. Las credenciales
de Odoo, GitHub y Graph viven en los nodos HTTP/Odoo por referencia de id, no en
el código.
