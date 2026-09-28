# Retardos v2 · Paso a real

Runbook para pasar de **sombra** a **real**. Issue #334. **Nada de esto se ha ejecutado.** Lo corre Esteban, o alguien con acceso de administración a `fts-suite-db`, cuando se cumplan las condiciones de la sección 0.

Todas las consultas están parametrizadas por dos valores que se escriben **una sola vez** al principio de cada bloque:

- `DATE 'AAAA-MM-DD'`: la **fecha de arranque**. Es el primer día cuyos retardos cuentan. Conviene un lunes.
- `'quien.ejecuta'`: el usuario que queda en la bitácora.

**Probado en una copia local del esquema** (Postgres 16, las 5 migraciones y un caso de sombra con su correo pendiente) el 28-sep-2026. Los 7 bloques corrieron sin error y el read-back 2 salió como se describe. No se ha corrido en producción.

Dónde correrlas: en la consola de consultas de Postgres de Railway (servicio `fts-suite-db`) o en `psql`. **No por el nodo Postgres de n8n**, porque ese nodo altera el texto de la consulta (`BLINDAJE.md` §6).

## 0. Condiciones antes de empezar

| # | Condición | Cómo se comprueba |
|---|---|---|
| 1 | PR #344 mergeado y el panel V1.01 o posterior visible en Pages | Recarga dura del panel |
| 2 | Permisos `retardos:read` y `retardos:write` asignados a RH | RH entra al panel |
| 3 | RH revisó la hora de entrada de cada persona (pestaña Calidad de datos) | Consulta 0.a |
| 4 | Legal confirmó escalera, textos y Reglamento | Comentario en #334 |
| 5 | Buzón receptor autorizado en Graph y escrito en `buzon_receptor` | Consulta 0.a |
| 6 | `rh_destinatarios` y `alertas_destinatarios` con los buzones reales | Consulta 0.a |
| 7 | El sistema está sano | Consulta 0.a: `salud.ok = true` |
| 8 | No está corriendo `detectar` | No ejecutarlo a las 12:15 ni a las 19:15. Buena hora: 10:00 a 11:30 |

**0.a Estado previo, sólo lectura:**

```sql
SELECT jsonb_build_object(
  'modo',            retardos.cfg_txt('modo'),
  'buzon_receptor',  retardos.cfg('buzon_receptor'),
  'rh',              retardos.cfg('rh_destinatarios'),
  'alertas',         retardos.cfg('alertas_destinatarios'),
  'sin_confirmar',   (SELECT jsonb_agg(clave ORDER BY clave) FROM retardos.config WHERE NOT confirmado),
  'escalera',        (SELECT jsonb_agg(jsonb_build_object('nivel', nivel, 'umbral', umbral, 'activo', activo, 'confirmado', confirmado) ORDER BY nivel) FROM retardos.escalera),
  'revisados',       (SELECT count(*) FROM retardos.calidad_revision WHERE revisado) || ' de ' || (SELECT count(*) FROM retardos.v_calidad),
  'casos_sombra_abiertos', (SELECT count(*) FROM retardos.caso WHERE modo_al_abrir = 'sombra' AND estado NOT IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA')),
  'envios_pendientes',     (SELECT count(*) FROM retardos.envio WHERE estado IN ('pendiente','fallido')),
  'salud',           retardos.salud());
```

Guarda este resultado. Es la foto de "antes".

## 1. Confirmar los valores acordados

Se hace antes y aparte del cambio de modo. Escribe los valores que RH y Legal acordaron **en lugar de los de ejemplo**:

```sql
BEGIN;
-- Escalera acordada. Ejemplo con 3/6/9 sin aviso; ajusta los umbrales y el activo.
UPDATE retardos.escalera SET umbral = 3, activo = false, confirmado = true WHERE nivel = 1;   -- aviso
UPDATE retardos.escalera SET umbral = 3, activo = true,  confirmado = true WHERE nivel = 2;   -- carta compromiso
UPDATE retardos.escalera SET umbral = 6, activo = true,  confirmado = true WHERE nivel = 3;   -- acta
UPDATE retardos.escalera SET umbral = 9, activo = true,  confirmado = true WHERE nivel = 4;   -- suspensión

-- Reglas. Cambia el valor sólo si se acordó otro; confirmado=true en todos los casos.
UPDATE retardos.config SET valor = '20'::jsonb,            confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'tolerancia_min';
UPDATE retardos.config SET valor = '"hora_entrada"'::jsonb, confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'hora_fuente';
UPDATE retardos.config SET valor = '"mes"'::jsonb,          confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'periodo';
UPDATE retardos.config SET valor = '30'::jsonb,            confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'reincidencia_dias';
UPDATE retardos.config SET valor = '2'::jsonb,             confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'dias_validacion_rh';
-- Arranque suave: hasta carta compromiso y sin suspensiones, hasta que Legal confirme el Reglamento.
UPDATE retardos.config SET valor = '2'::jsonb,     confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'nivel_maximo_habilitado';
UPDATE retardos.config SET valor = 'false'::jsonb, confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'suspensiones_habilitadas';
-- Destinatarios, buzón, días hábiles y latido: confirmar SÓLO después de revisar en 0.a que tienen el valor real.
UPDATE retardos.config SET confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave IN ('rh_destinatarios', 'alertas_destinatarios', 'sombra_destinatarios', 'buzon_receptor', 'dias_habiles', 'latido_dias_sin_retardos');
COMMIT;
```

**Read-back 1:**

```sql
SELECT (SELECT jsonb_agg(clave ORDER BY clave) FROM retardos.config WHERE NOT confirmado) AS config_sin_confirmar,
       (SELECT jsonb_agg(nivel) FROM retardos.escalera WHERE NOT confirmado) AS escalera_sin_confirmar,
       (SELECT jsonb_object_agg(nivel, retardos.nivel_habilitado(nivel)) FROM retardos.escalera) AS niveles_que_se_notifican;
```

Lo esperado es que `config_sin_confirmar` sólo liste `contar_desde`, que se confirma en el paso 2. `escalera_sin_confirmar` debe salir `null`.

## 2. El cambio: una sola transacción

Los pasos van juntos a propósito. **El orden importa**: el outbox resuelve los destinatarios al momento de enviar, así que cualquier correo de un caso de sombra que siga pendiente le llegaría a la persona real en cuanto el modo diga `real`. Por eso primero se anulan esos correos y se cancelan los casos, y hasta el final se cambia el modo. Todo o nada.

```sql
BEGIN;

-- 2.1 Anular los correos todavía no enviados de casos de la etapa de sombra.
WITH p AS (SELECT 'quien.ejecuta'::text AS actor)
UPDATE retardos.envio e
   SET estado = 'omitido',
       error  = 'Caso de la etapa de sombra: se anula al pasar a real (#334)'
  FROM p
 WHERE e.estado IN ('pendiente','fallido')
   AND e.caso_id IN (SELECT id FROM retardos.caso WHERE modo_al_abrir = 'sombra');

-- 2.2 Cancelar con motivo los casos abiertos de la etapa de sombra (pasa por la máquina de
--     estados: deja bitácora con actor y motivo, y respeta las transiciones válidas).
WITH p AS (SELECT 'quien.ejecuta'::text AS actor)
SELECT count(*) AS casos_cancelados
  FROM retardos.caso c, p,
       LATERAL (SELECT retardos.transicionar(c.id, 'CANCELADO_POR_RH', p.actor,
                'Caso de la etapa de sombra: se cancela al pasar a real (#334)')) t
 WHERE c.modo_al_abrir = 'sombra'
   AND c.estado NOT IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA');

-- 2.3 Mover contar_desde a la fecha de arranque: nada anterior abre casos.
WITH p AS (SELECT DATE 'AAAA-MM-DD' AS arranque, 'quien.ejecuta'::text AS actor)
UPDATE retardos.config c
   SET valor = to_jsonb(p.arranque::text), confirmado = true, actualizado_por = p.actor, actualizado_at = now()
  FROM p
 WHERE c.clave = 'contar_desde';

-- 2.4 Cambiar el modo. Desde aquí, lo que se encole le llega a la persona.
UPDATE retardos.config
   SET valor = '"real"'::jsonb, confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'modo';

-- 2.5 Constancia en la bitácora del cambio de modo.
SELECT retardos.log(NULL, 'paso_a_real', 'quien.ejecuta', 'Cambio de sombra a real (#334)',
       jsonb_build_object('contar_desde', retardos.cfg('contar_desde'), 'nivel_maximo_habilitado', retardos.cfg('nivel_maximo_habilitado')));

COMMIT;
```

Si cualquier sentencia truena, la transacción se revierte completa y nada cambió. Por ejemplo, `TRANSICION_INVALIDA` si algún caso quedó en un estado no previsto. En ese caso, copia el error en #334.

**Read-back 2** (tiene que salir exactamente así):

```sql
SELECT jsonb_build_object(
  'modo',                    retardos.cfg_txt('modo'),                                                  -- real
  'contar_desde',            retardos.cfg_txt('contar_desde'),                                          -- la fecha de arranque
  'casos_sombra_abiertos',   (SELECT count(*) FROM retardos.caso WHERE modo_al_abrir = 'sombra'
                               AND estado NOT IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA')), -- 0
  'envios_sombra_vivos',     (SELECT count(*) FROM retardos.envio WHERE estado IN ('pendiente','fallido')
                               AND caso_id IN (SELECT id FROM retardos.caso WHERE modo_al_abrir = 'sombra')), -- 0
  'config_sin_confirmar',    (SELECT jsonb_agg(clave) FROM retardos.config WHERE NOT confirmado),       -- null
  'bitacora_paso',           (SELECT max(creado_at) FROM retardos.bitacora WHERE evento = 'paso_a_real'));
```

## 3. Verificación después del primer `detectar` en real

Después de las 12:15 del día de arranque:

```sql
SELECT jsonb_build_object(
  'ultima_corrida',  (SELECT jsonb_build_object('id', id, 'ok', ok, 'leidos', leidos, 'at', iniciada_at) FROM retardos.corrida WHERE workflow = 'retardos/detectar' ORDER BY id DESC LIMIT 1),
  'casos_reales',    (SELECT jsonb_object_agg(estado, n) FROM (SELECT estado, count(*) AS n FROM retardos.caso WHERE modo_al_abrir = 'real' GROUP BY 1) z),
  'envios_reales',   (SELECT jsonb_object_agg(estado, n) FROM (SELECT estado, count(*) AS n FROM retardos.envio WHERE modo_envio = 'real' GROUP BY 1) z),
  'salud',           retardos.salud());
```

Lo esperado:

- la corrida con `ok = true` y `leidos > 0`;
- los casos nuevos con `modo_al_abrir = 'real'`;
- los niveles 3 y 4 en `RETENIDO` mientras dure el arranque suave;
- los envíos con `modo_envio = 'real'` y estado `enviado`.

**Un cero no prueba nada** (CLAUDE.md §9): si no hubo retardos ese día, espera al siguiente antes de dar la verificación por buena.

## 4. Volver a sombra

En cualquier momento, sin perder nada:

```sql
UPDATE retardos.config SET valor = '"sombra"'::jsonb, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'modo';
SELECT retardos.log(NULL, 'vuelta_a_sombra', 'quien.ejecuta', 'Regreso a sombra (#334)');
SELECT retardos.cfg_txt('modo');   -- read-back: sombra
```

- Lo que esté pendiente en el outbox se desvía otra vez a Dirección y RH con `[SOMBRA]`.
- Los casos ya abiertos siguen en el estado en que estaban.
- Los correos que ya salieron en real no se pueden recuperar.
- **Para parar todo de inmediato:** despublicar `retardos/enviar` (`UqhsvXDZjOmatEql`) en la UI de n8n. Nada sale y todo queda en el outbox.

## 5. Pendiente conocido antes del paso a real

- **Notas en Odoo.** Hoy no hay un ejecutor para los envíos de tipo `odoo_nota`. En sombra se marcan `omitido`. En real se quedarían `pendiente` y el latido reportaría `OUTBOX_ATORADO` a las 3 horas. Antes del paso a real hay que hacer una de dos cosas:
  - construir el ejecutor, que es un workflow que escribe la nota en el chatter del empleado por n8n;
  - o marcarlas `omitido` también en real.

  Está anotado en la deuda de #334.
