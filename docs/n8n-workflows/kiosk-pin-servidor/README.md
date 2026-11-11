# Kiosko · PIN en el servidor (fts-suite#486)

Cambios a `kiosk/checkin` (`a7mEjjdwIzzvomXs`). Se construyen **sobre la versión publicada
`a0c4b0e8-3391-4b6d-9e8b-89699b312641`**, no sobre el borrador `bff52177` (#396, Postgres),
que queda intacto en el historial.

| nodo | cambio |
|---|---|
| `Odoo - Validar empleado` | `fieldsList` + `pin` |
| `Code - Validar empleado` | `validar-empleado.js` (antes: `validar-empleado.ANTES.js`) |
| `Code - Respuesta Error` | `respuesta-error.js` (antes: `respuesta-error.ANTES.js`): agrega `pin_verificado`, `minutos_bloqueo`, `intentos_restantes` |

Interruptor: `const PIN_MODO = 'tolerante'` en `Code - Validar empleado` → `'estricto'` en el paso 4.

Prueba local: `node docs/n8n-workflows/kiosk-pin-servidor/prueba.js` (PINs inventados).

## Reversa (escrita ANTES de publicar)
```
publish_workflow  a7mEjjdwIzzvomXs  versionId: a0c4b0e8-3391-4b6d-9e8b-89699b312641
```
Read-back: `active:true` y `activeVersionId == a0c4b0e8…`. El kiosko vuelve exactamente a lo de
antes (sin PIN en el servidor). El frontend nuevo sigue funcionando con la reversa: manda `pin`
y el servidor viejo lo ignora; `solo_verificar_pin` en el servidor viejo **escribiría** una
checada, por eso el frontend solo lo usa si el servidor contesta `pin_verificado` (ver kiosk.js).

## Versiones publicadas (read-back `versionId == activeVersionId` en cada una)
| versión | qué | reversa |
|---|---|---|
| `dd2513ed-d05d-47a9-8847-4e16932f0336` | paso 1: PIN en el servidor, tolerante | `a0c4b0e8…` (sin PIN) |
| `f9c51072-6b09-4545-bf9f-714040aa5b89` | + `tipo:'metricas_pin'` (contadores del día) | `dd2513ed…` |

`metricas_pin`: `POST /webhook/kiosk/checkin {"empleado_id":1,"tipo":"metricas_pin"}` →
`pin_metricas: { "AAAA-MM-DD": { con_pin, sin_pin, ok, malo, bloqueado, sin_pin_odoo, error } }`
(días en CST, últimos 35). Solo números. Es la fuente de la alarma (`alarma.js`).
