# Contrato de la tabla `kiosk_intentos` (B1, #269)

Data table de n8n `kiosk_intentos`, id `oftRi4tGtdGfgcvX`, proyecto personal `eWfPdSbGqqG91Eja`.
La escribe `kiosk/checkin` (`a7mEjjdwIzzvomXs`) desde el borrador B1. La leen `kiosk/intento`
(`XEKlSvOKtCdEPU3q`), `kiosk/alerta-fallas` (`DUhj6mByBcmPsIYI`) y, más adelante, el watchdog de B10.

Un renglón por intento de checada. La llave es `intento_id`: el kiosko nuevo manda un UUID v4 por
intento y lo repite en cada reintento del mismo intento; un kiosko viejo no manda nada y el
servidor genera `srv-<id de ejecución>`.

## Columnas

| Columna | Tipo | Qué guarda |
|---|---|---|
| `intento_id` | string | UUID v4 del kiosko, o `srv-<ejecución>` si el kiosko no mandó uno |
| `empleado_id` | number | `hr.employee` id |
| `tipo` | string | `entrada`, `salida`, `salida_comida`, `regreso_comida` |
| `estado` | string | ver abajo |
| `codigo` | string | `codigo_error` de la respuesta; vacío si `ok` |
| `mensaje` | string | el `mensaje` que se le mostró a la persona |
| `attendance_id` | number | `hr.attendance` id escrito; 0 si no hubo |
| `respuesta` | string | JSON de la respuesta enviada al kiosko, sin `empleado_nombre` |
| `ejecucion` | string | id de ejecución de n8n |
| `workflow` | string | siempre `kiosk/checkin` por ahora |
| `origen_id` | string | `kiosko` si el id vino del cliente, `servidor` si lo generó n8n |
| `fecha_cst` | string | `AAAA-MM-DD` en CST (UTC-6) al entrar la petición |
| `inicio_utc` | date | hora UTC en que entró la petición |
| `fin_utc` | date | hora UTC en que se respondió; vacío mientras `en_proceso` |

## Estados

| `estado` | Significa | Qué hace un reintento con el mismo `intento_id` |
|---|---|---|
| `en_proceso` | la petición entró y todavía no responde | si tiene menos de 60 s: responde `EN_PROCESO` sin escribir; si tiene más, se considera muerta y se vuelve a correr |
| `ok` | Odoo guardó la checada (o es la comida placeholder) | devuelve la respuesta guardada con `idempotente:true`, sin volver a escribir |
| `error` | falla del sistema: `ODOO_RECHAZO`, `ODOO_NO_RESPONDE`, `ERROR_INTERNO`, `TIEMPO_AGOTADO` | se vuelve a correr |
| `rechazo_regla` | regla de negocio: `YA_TIENES_ENTRADA`, `ZONA_GRIS`, `NO_HAY_ENTRADA`, etc. | se vuelve a correr (las reglas se reevalúan) |

## Reglas para quien lea la tabla (B10)

1. Una falla de sistema es `estado = 'error'`. `rechazo_regla` NO es falla: es el kiosko funcionando.
2. Un `en_proceso` con `inicio_utc` de hace más de 60 s es una ejecución que murió sin responder.
   El workflow global de errores (`ops/alerta-errores`, `Ogo64mR0v8CP1JnM`) debió avisar; el
   watchdog debe contarlo como falla.
3. Contar por día con `fecha_cst`, no con `inicio_utc`.
4. `srv-...` son kioskos con el frontend viejo: no tienen reintento idempotente.
5. La tabla no guarda nombres, GPS ni fotos. No agregarlos.

## Límites conocidos

- Dos peticiones simultáneas con el mismo `intento_id` que lleguen antes de que la primera marque
  `en_proceso` pueden correr las dos. El kiosko no manda en paralelo (reintenta en serie), así que
  no se espera en la práctica.
- Las filas no se borran solas. Retención y limpieza quedan para B10.
- Filas de prueba del 2026-09-24 con `empleado_id = 999001` (empleado inexistente, usado en las
  pruebas con pin data): se pueden borrar sin consecuencia.
