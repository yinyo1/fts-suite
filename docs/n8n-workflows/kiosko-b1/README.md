# B1 Visibilidad: workflows n8n (#269)

Todo lo de esta carpeta está **guardado como borrador en n8n y SIN publicar**. Nada entra en
producción hasta que Esteban lo publique con su "va", en el orden de #269.
Ningún archivo trae secretos: las credenciales se referencian por id.

## Workflows nuevos (inactivos, nunca publicados)

| Workflow | Id | Archivo | Qué hace |
|---|---|---|---|
| `kiosk/intento (B1 #269)` | `XEKlSvOKtCdEPU3q` | `kiosk-intento.sdk.js` | Solo lectura. Dice si un `intento_id` se procesó y con qué resultado |
| `kiosk/alerta-fallas (B1 #269)` | `DUhj6mByBcmPsIYI` | `kiosk-alerta-fallas.sdk.js` | 2 o más fallas de sistema de un empleado en el día: correo a Esteban y al supervisor (`parent_id`), máximo 1 por empleado por hora |
| `ops/alerta-errores (B1 #269)` | `Ogo64mR0v8CP1JnM` | `ops-alerta-errores.sdk.js` | Error Trigger global. Correo a Esteban con workflow, nodo, ejecución, empleado si viene en el mensaje, y el error. Máximo 1 por workflow y empleado por hora |

## Workflows productivos con borrador (versión activa intacta)

| Workflow | Id | Llave de reversa (versión activa hoy) | Archivo |
|---|---|---|---|
| `kiosk/checkin` | `a7mEjjdwIzzvomXs` | `feb04c42-18f0-4b45-9368-b35e69049d7e` | `kiosk-checkin.borrador.json` (export completo del borrador) |
| `incidencias/resolver` | `Oc2ceMHX2O0L0y2X` | `410443c4-596f-4291-b309-d04b4008f39f` | `resolver.ops.json` (operaciones aplicadas) |
| `planeacion/confirmar-horas` | `7D3lgaYmH2DmqCWy` | `7a45cadc-9af3-4f1f-8346-c49a7892b34d` | `confirmar-horas.ops.json` |
| `planeacion/corregir-bolsa` | `O61Abp4s26yYpFEq` | `183acaa5-420f-4f24-aa58-5b1412cc7463` | `corregir-bolsa.ops.json` |

`crear-olvido-entrada` (`JLiuczUd61xVNp36`) y `crear-olvido-checkout` (`IRtG38Aknb5SW15h`) no
cambian: solo reciben `errorWorkflow` al publicar.

Tabla de datos: `kiosk_intentos` (`oftRi4tGtdGfgcvX`), contrato en
`docs/kiosko/blindaje/b1-kiosk-intentos-contrato.md`. Tabla `ops_alertas` (`ZT1IDsbWXl9Hd8cQ`)
guarda cuándo salió cada alerta, para el límite de una por hora.

## Regla aprendida en el arnés (ejecuciones 111538, 111542, 111544 y 111545)

- **`alwaysOutputData: true` + `onError: continueErrorOutput` corre LAS DOS ramas**: además del
  item de error, n8n manda un item vacío por la salida normal. Con dos nodos Respond en juego, podía
  ganar la respuesta de éxito. Por eso los nodos Odoo de ESCRITURA quedan con
  `alwaysOutputData: false` (una escritura exitosa siempre devuelve `{id}`), y el de LECTURA
  (`Odoo - Validar empleado`) conserva `alwaysOutputData` con un guard en el nodo siguiente.
- **`$('Nodo').all(1)` NO es "la salida de error"**: si la salida 1 viene vacía, devuelve la
  salida 0 (ejecución 111545). El guard busca el campo `error`, no cuenta items.
- El texto de error de un Code node que lanza se corta en el primer `:`. El de un nodo Odoo
  (NodeApiError) llega completo: ejecución 109267, y la rama A de 111538.
