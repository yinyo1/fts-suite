# Retardos v2 · Blindaje

Cómo sabemos que el sistema está vivo, qué pasa cuando algo falla y qué hacer. Issue #334,
integración con los watchdogs en #220.

El sistema anterior murió en silencio: sus acciones se borraron de Odoo y durante cinco meses
nadie lo notó, porque cero correos se ve igual que cero retardos. Todo este documento existe
para que eso no se repita.

## 1. Las tres redes

| Red | Qué detecta | Cómo avisa |
|---|---|---|
| **Error workflow** `retardos/error` | Cualquier workflow `retardos/*` que truene en producción | Registra la corrida con `ok = false` y manda correo directo por Graph |
| **Latido** `retardos/latido` | Lo que no truena pero está mal: no corrió, leyó cero, el outbox no se vacía, semanas sin un retardo | `retardos.salud()` 10:40 y 20:40 todos los días; si hay problemas, correo directo por Graph |
| **Pruebas de contrato** | Odoo cambió un campo o su forma | `detectar` falla con `CONTRATO_ROTO:<modelo>.<campo>` y lo atrapa la primera red |

Las alertas **no pasan por el outbox**: si el outbox está atorado, la alerta no puede depender
de él. Salen de `sales@fts.mx` a `retardos.config.alertas_destinatarios`. Si Postgres también está
caído, el error workflow usa un destinatario de respaldo escrito en el nodo.

### Códigos de `retardos.salud()`

| Código | Qué significa | Qué revisar |
|---|---|---|
| `DETECTAR_NUNCA_CORRIO` | No hay ninguna corrida exitosa de `detectar` | Que el workflow esté publicado (`active` y `versionId == activeVersionId`) |
| `DETECTAR_SIN_CORRER` | En día hábil, la última corrida exitosa tiene más de 30 h | Ejecuciones de `retardos/detectar`; si truena, el error workflow ya avisó con el nodo |
| `DETECTAR_LEYO_CERO` | La última corrida leyó 0 checadas | Odoo caído, llave RPC rotada (`ODOO_RPC_KEY`), o cambió el dominio de la consulta |
| `CORRIDAS_CON_ERROR` | Alguna corrida `retardos/*` con error en 24 h | `retardos.corrida` (columna `error`) y la ejecución de n8n que ahí se cita |
| `OUTBOX_ATORADO` | Correos pendientes o fallidos con más de 3 h | `retardos.envio.error`; lo típico es Graph 400 (destinatario) o 401 (credencial) |
| `SILENCIO_SOSPECHOSO` | 5 días hábiles seguidos sin un solo retardo | Con 378 retardos en 90 días medidos, cero en una semana es un síntoma, no una buena noticia |

Los umbrales viven en `retardos.config` (`latido_horas_detectar`, `latido_horas_outbox`,
`latido_dias_sin_retardos`) y se cambian con un `UPDATE`, sin tocar workflows.

## 2. Prueba de falla controlada (28-sep-2026)

Se hizo fallar a propósito un workflow temporal (`TMP retardos/falla-controlada`,
`xrSOyXPIVWVlodpd`, con `retardos/error` como error workflow) en modo producción:

1. Ejecución 116488 truena con `PRUEBA_CONTROLADA_334`.
2. `retardos/error` corre solo (ejecución 116489): escribe la corrida 6 con `ok = false`
   y Graph acepta la alerta (respuesta vacía, 202).
3. `retardos/latido` (ejecución 116493) encuentra `CORRIDAS_CON_ERROR` y manda su propia alerta.

El temporal quedó despublicado. Hallazgo de la prueba: la primera corrida del latido
(116492) topó con `current transaction is aborted` en una conexión del pool de Postgres.
El reintento pasó. Se agregaron 3 reintentos al nodo `Postgres - Salud`. En producción,
de todos modos, esa falla habría disparado el error workflow.

## 3. Integración con los watchdogs (#220)

`retardos.salud()` devuelve un JSON estable (`ok`, `problemas[]`, `modo`,
`ultima_deteccion`, `casos_abiertos`, `outbox_pendiente`) pensado para que la plataforma de
paneles de #220 lo lea igual que los demás watchdogs. El panel de RH ya lo pinta. Cuando
#220 tenga su lector, basta con una consulta de sólo lectura a esa función; no hace falta un
workflow nuevo.

## 4. Pruebas

`tests/retardos/simulador.test.js`, sobre un Postgres 16 real
(`RETARDOS_PG="-h … -p … -U postgres" node --test tests/retardos/simulador.test.js`).
Aplica todas las migraciones en una base plantilla y cada prueba trabaja en una copia.
30 casos, entre ellos:

- permiso;
- horario en disputa;
- trabajo en USA;
- olvido de entrada;
- festivo;
- tolerancia exacta;
- empleado sin correo;
- respuesta sin adjunto;
- adjunto ilegible;
- otro remitente;
- folio equivocado;
- doble envío;
- cron repetido;
- Odoo caído;
- credencial expirada;
- cambio de campo en Odoo;
- latido sin corrida;
- reincidencia;
- suspensión fuera de rango;
- bitácora inmutable;
- transición inválida;
- anti-replay;
- redirección en sombra;
- `reply-to` nulo.

También hay una prueba que impide que una migración traiga `{{` o `$'`. Ver §6.

`tests/visual-retardos.js` abre el panel en modo de ejemplo a 380, 760, 900 y 1280 px, en
claro y en oscuro, recorre lista, detalle, validación y reglas, y falla ante cualquier
`pageerror`, desborde horizontal, o si el panel acepta 9 días de suspensión.

## 5. Workflows exportados

Viven en `retardos/n8n/` **sin credenciales ni secretos**. Los nodos nombran sus
credenciales por id y leen los secretos con `$env` en un nodo Set.

- Cada `.sdk.js` lleva marcadores (`__LEER__`, `__PREPARAR__`…) en lugar del código de sus
  Code nodes.
- El código de cada nodo está en `retardos/n8n/code/`.
- Las librerías están en `retardos/lib/`, una sola vez: `pdf.js`, `normalizar.js` y `sesion.js`.

`node retardos/n8n/armar.js <workflow>` reconstruye el SDK completo para el MCP de n8n. Se
comprobó que lo reconstruido es idéntico a lo desplegado, salvo los escapes unicode.

| Workflow | id | Disparo |
|---|---|---|
| `retardos/detectar` | `q6JkF2l0l73hK3oi` | L-V 12:15 y 19:15 (Monterrey) |
| `retardos/enviar` | `UqhsvXDZjOmatEql` | cada 20 min, L-V 7 a 20 |
| `retardos/verificar` | `bAsUnSWeZuiABTBH` | L-V 09:05; también cruza descuentos de jornada con `nom_semana_persona` |
| `retardos/jornada` | `m4S4Cm0zrUG7rLMn` | viernes 08:00: corte de la semana FTS que cerró (viernes a jueves). El latido alerta `JORNADA_SIN_CORTE` si no corrió |
| `retardos/resumen-semanal` | `BaqYNzeHm08TkNo3` | viernes 10:00, después del corte |
| `retardos/latido` | `FxLo4CVLO6ZL1LM0` | 10:40 y 20:40 todos los días |
| `retardos/lector` | `fIlzbfLCSHS4nHrx` | cada 15 min, L-V 7 a 21 (no hace nada sin buzón) |
| `retardos/panel` | `03tPk8lM3cFIs7lF` | webhook POST `/webhook/retardos/panel` |
| `retardos/error` | `uaaAiB2EQiLDDAyT` | error workflow de todos los anteriores |
| `retardos/db-migrate` | `7u2IPDSuX5x40TGY` | a mano, inactivo |

Todos llevan `timezone = America/Monterrey` y `errorWorkflow = uaaAiB2EQiLDDAyT`. El panel
no guarda ejecuciones exitosas porque su entrada trae el token de quien llama.

**Después de cualquier edit** a uno de estos workflows hay que hacer el read-back de
`active` y de `versionId == activeVersionId`, y publicar si difieren (CLAUDE.md §3 y §17 2b).

## 6. Dos trampas del nodo Postgres de n8n (medidas en esta construcción)

El nodo Postgres recibe el texto de la consulta por una expresión, y eso tiene dos efectos:

1. **Evalúa `{{ }}` dentro del SQL.** Una plantilla con `{{folio}}` se convierte en una
   expresión de n8n y truena. Por eso las plantillas usan `[[folio]]`.
2. **Mete el resultado con `String.replace`**, así que `$'`, `$&`, `` $` ``, `$1` y `$$`
   dentro del SQL se sustituyen en silencio. Un `CHECK (x ~ '^RET-[0-9]{4}$')` llegó a la
   base mutilado (`Syntax error … near umbral`). Se reprodujo aislándolo con un workflow
   de bisección y un `SELECT 1/0` forzado.

   Por eso las expresiones regulares no llevan ancla de fin: se usa `char_length` más
   clases negadas, y `reverse()` para el dominio del correo.

El runner rechaza cualquier archivo con `{{` o `$$`, y la prueba del simulador vigila las dos
cosas. Los datos siempre viajan como **parámetro** (`queryReplacement` con
`JSON.stringify` y `$1::jsonb`), nunca pegados al SQL.

## 7. Runbook

**"Llegó una alerta de Retardos."** Leer el código (§1). Abrir la ejecución que cita la
alerta en n8n pidiendo **sólo nodos de lógica**, nunca el Set de secretos (CLAUDE.md §9).

**"Un correo no le llegó a alguien."**

```sql
SELECT id, tipo, estado, modo_envio, error, intentos
  FROM retardos.envio
 WHERE caso_id = (SELECT id FROM retardos.caso WHERE folio = 'RET-…');
```

En sombra, nunca le llega a la persona: es lo esperado.

**"Un retardo no debió contar."** Agregar la exclusión en el panel (Reglas y días que no cuentan)
y, si ya abrió caso, cancelarlo con motivo. El siguiente `detectar` recalcula; el retardo queda
con su motivo de exclusión.

**"Hay que apagar todo ya."** Despublicar `retardos/enviar` en la UI de n8n. Nada sale y todo
queda en el outbox para después. Para volver a sombra desde real:

```sql
UPDATE retardos.config SET valor = '"sombra"' WHERE clave = 'modo';
```

**"Hay que deshacer la construcción."**

1. Despublicar los 8 workflows.
2. `ALTER SCHEMA retardos RENAME TO retardos_retirado`, que no borra nada.
3. No mergear el PR.

Nada de esto tocó Odoo.

## 8. Dueños

| Qué | Dueño |
|---|---|
| Reglas, escalera y textos | Dirección con RH y Legal |
| Validar hojas, negativas, impugnaciones, suspensiones | RH |
| Alertas del latido y del error workflow | Dirección hasta que se nombre otro en `alertas_destinatarios` |
| Workflows, migraciones y pruebas | quien mantenga la suite (este repo) |
