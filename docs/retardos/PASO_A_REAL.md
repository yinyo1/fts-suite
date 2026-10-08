# Retardos v2 · Paso a real

Runbook para pasar de **sombra** a **real**. Issues #334 y #386. **El paso a real no se ha ejecutado.** Desde `retardos_0009` (7-oct-2026) es **una sola bandera** (sección 2); el piloto de cinco personas es aparte (`PILOTO.md`). Lo corre Esteban, o alguien con acceso de administración a `fts-suite-db`, cuando se cumplan las condiciones de la sección 0.

En todas las consultas, `'quien.ejecuta'` es el usuario que queda en la bitácora. Ya no hay fecha de arranque que escribir: la pone la base al cambiar el modo.

**Probado en una copia local del esquema** (Postgres 16) con las 10 migraciones, el 7-oct-2026: las pruebas de `tests/retardos` cubren el cambio de bandera, la reversa, el piloto y los destinatarios (65 de 65). La bandera no se ha cambiado en producción.

**Suspensiones: aparte.** Pasar a real **no** activa suspensiones. El sistema sigue en `modo_sanciones = sin_suspension`: el nivel 4 queda como "nivel de suspensión alcanzado, no aplicado". Activarlas es otro runbook, con su propio checklist: `MODO_SUSPENSION.md`.

Dónde correrlas: en la consola de consultas de Postgres de Railway (servicio `fts-suite-db`) o en `psql`. **No por el nodo Postgres de n8n**, porque ese nodo altera el texto de la consulta (`BLINDAJE.md` §6).

## 0. Condiciones antes de empezar

| # | Condición | Cómo se comprueba |
|---|---|---|
| 1 | PR #344 mergeado y el panel V1.04 o posterior visible en Pages | Recarga dura del panel |
| 2 | Permisos `retardos:read` y `retardos:write` asignados a RH | RH entra al panel |
| 3 | RH revisó la hora de entrada de cada persona (pestaña Calidad de datos) | Consulta 0.a |
| 4 | Legal confirmó escalera, textos y Reglamento | Comentario en #334 |
| 4b | RH validó cada texto de correo (`estado_texto = validado_rh`) y el de la hoja del tercer aviso de jornada | Read-back 1: `textos_sin_validar` en `null` |
| 4c | RH limpió olvidos y ausencias de las semanas recientes en Jornada por revisar, y se decidió qué hacer con el calendario de 10 horas contra la regla de 10.1 (PROPUESTA.md §11.5) | Pestaña Jornada semanal |
| 5 | Buzón receptor autorizado en Graph y escrito en `buzon_receptor` | Consulta 0.a |
| 6 | `rh_destinatarios` y `alertas_destinatarios` con los buzones reales | Consulta 0.a |
| 7 | El sistema está sano | Consulta 0.a: `salud.ok = true` |
| 5b | RH sabe imprimir, recolectar y subir hojas, y confirmar en "Hojas por confirmar" | Una práctica en el modo de ejemplo del panel |
| 5c | El lector de hojas está sano: `retardos-hojas` en Railway responde `/salud` y el workflow `retardos/hojas` está publicado | Consulta 0.a: `salud` sin `HOJAS_*` ni `PROCESADOR_CON_ERRORES` |
| 5d | Si se usa carpeta: `hojas_carpeta` escrita y el permiso de Graph sobre esa carpeta concedido | Consulta 0.a |
| 8 | No está corriendo `detectar` | No ejecutarlo a las 12:15 ni a las 19:15. Buena hora: 10:00 a 11:30 |

**0.a Estado previo, sólo lectura:**

```sql
SELECT jsonb_build_object(
  'modo',            retardos.cfg_txt('modo'),
  'buzon_receptor',  retardos.cfg('buzon_receptor'),
  'rh',              retardos.cfg('rh_destinatarios'),
  'alertas',         retardos.cfg('alertas_destinatarios'),
  'modo_sanciones',  retardos.cfg_txt('modo_sanciones'),
  'hojas_carpeta',   retardos.cfg('hojas_carpeta'),
  'correos',         (SELECT jsonb_build_object('con_destinatario', count(*) FILTER (WHERE jsonb_array_length(retardos.destinatarios(employee_id)) > 0), 'sin', count(*) FILTER (WHERE jsonb_array_length(retardos.destinatarios(employee_id)) = 0)) FROM retardos.empleado WHERE activo),
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
-- Reglas R3 (28-sep-2026): 15 minutos al segundo, lunes a viernes, hora del centro.
UPDATE retardos.config SET valor = '15'::jsonb,            confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'tolerancia_min';
UPDATE retardos.config SET confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'zona_horaria';
UPDATE retardos.config SET valor = '"hora_entrada"'::jsonb, confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'hora_fuente';
UPDATE retardos.config SET valor = '"mes"'::jsonb,          confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'periodo';
UPDATE retardos.config SET valor = '30'::jsonb,            confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'reincidencia_dias';
UPDATE retardos.config SET valor = '2'::jsonb,             confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'dias_validacion_rh';
-- Sanciones: arranca sin suspensiones (MODO_SUSPENSION.md). Aviso, carta y acta funcionan.
UPDATE retardos.config SET valor = '"sin_suspension"'::jsonb, confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'modo_sanciones';
-- RH recolecta la firma: plazo, a quién se manda y qué firmas hacen falta.
UPDATE retardos.config SET valor = '3'::jsonb,            confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'dias_recoleccion_rh';
UPDATE retardos.config SET valor = '"preferente"'::jsonb, confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'correo_modo';
UPDATE retardos.config SET confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave IN ('correo_dominios_empresa', 'correos_genericos', 'firmas_requeridas', 'hojas_horas_alerta', 'hojas_errores_alerta');
-- Disparadores de la alerta de modo: confirmar SÓLO después de la calibración de MODO_SUSPENSION.md §3.
UPDATE retardos.config SET confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'alerta_disparadores';
-- Carpeta de hojas: confirmar aunque sea null (null = no se barre carpeta; se sube por panel o correo).
UPDATE retardos.config SET confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'hojas_carpeta';
-- Obsoletas desde retardos_0006 (ya no se leen): se confirman para que no aparezcan como pendientes.
UPDATE retardos.config SET confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave IN ('nivel_maximo_habilitado', 'suspensiones_habilitadas');
-- Jornada semanal FTS (PROPUESTA.md §11). Cambia el valor sólo si se acordó otro.
-- jornada_desde: primera semana FTS (viernes) que abre avisos. Arranque recomendado: 2026-10-02.
UPDATE retardos.config SET valor = '"2026-10-02"'::jsonb, confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'jornada_desde';
UPDATE retardos.config SET valor = '48'::jsonb,           confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'jornada_umbral_horas';
UPDATE retardos.config SET valor = '30'::jsonb,           confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'jornada_comida_min';
-- Comida en fin de semana: pregunta 15 de PARA_LEGAL.md. 'desde_horas' | 'siempre' | 'nunca'.
UPDATE retardos.config SET valor = '"desde_horas"'::jsonb, confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'jornada_comida_fin_de_semana';
-- 'inmediato' (viernes del corte) o 'lunes' (espera a que Nómina termine de capturar).
UPDATE retardos.config SET valor = '"inmediato"'::jsonb,  confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'jornada_envio';
-- Medidas del 3er aviso: se quedan 'retenidas' hasta que Legal conteste la pregunta 14 (arts. 107 y 110 LFT).
UPDATE retardos.config SET valor = '"retenidas"'::jsonb,  confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'modo_medidas_jornada';
UPDATE retardos.config SET confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave IN ('jornada_comida_fds_min_horas', 'jornada_usar_calendario', 'jornada_tolerancia_calendario_h', 'jornada_horas_max_asistencia',
                 'jornada_ventana_dias', 'jornada_plazo_correccion_dias', 'jornada_tipos_nomina_prorrateo', 'jornada_tipo_nomina_descuento');
-- Comunicado de arranque: sólo si se va a mandar desde el sistema (PLANTILLAS.md §5). Si RH lo manda desde su buzón, confirmar vacío.
UPDATE retardos.config SET confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now() WHERE clave = 'comunicado_destinatarios';
-- Destinatarios, buzón, días hábiles y latido: confirmar SÓLO después de revisar en 0.a que tienen el valor real.
UPDATE retardos.config SET confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave IN ('rh_destinatarios', 'alertas_destinatarios', 'sombra_destinatarios', 'buzon_receptor', 'dias_habiles', 'latido_dias_sin_retardos');
COMMIT;
```

**Read-back 1:**

```sql
SELECT (SELECT jsonb_agg(clave ORDER BY clave) FROM retardos.config WHERE NOT confirmado) AS config_sin_confirmar,
       (SELECT jsonb_agg(nivel) FROM retardos.escalera WHERE NOT confirmado) AS escalera_sin_confirmar,
       (SELECT jsonb_object_agg(nivel, retardos.nivel_habilitado(nivel)) FROM retardos.escalera) AS niveles_que_se_notifican,
       (SELECT jsonb_agg(nivel) FROM retardos.escalera_jornada WHERE NOT confirmado) AS avisos_jornada_sin_confirmar,
       (SELECT jsonb_agg(clave ORDER BY clave) FROM retardos.plantilla WHERE estado_texto <> 'validado_rh') AS textos_sin_validar;
```

Lo esperado es que `config_sin_confirmar` sólo liste `antecedentes_previos_cuentan`, `contar_desde`, `modo_suspension_desde` y `real_desde`. `real_desde` la escribe sola la base en el paso 2 y `contar_desde` se confirma tal cual (la pista real ya no depende de ella); las dos de suspensión se quedan sin confirmar a propósito, porque las escribe `MODO_SUSPENSION.md`. `escalera_sin_confirmar` debe salir `null`. `avisos_jornada_sin_confirmar` se confirma con `UPDATE retardos.escalera_jornada SET confirmado = true WHERE nivel IN (1,2,3);` cuando RH acuerde los tres avisos. `textos_sin_validar` debe salir `null` antes de pasar a real: cada texto se valida con `PLANTILLAS.md`.

## 2. El cambio: UNA bandera (desde `retardos_0009`, #386)

Desde el 7-oct-2026 el paso a real **es una sola sentencia**. Ya no hay que anular correos ni mover fechas a mano: la base separa cada caso en **pista sombra** y **pista real**, y lo hace sola. Lo único aparte es limpiar los casos de sombra que queden abiertos (§2b), con el "va" de Esteban.

```sql
UPDATE retardos.config
   SET valor = '"real"'::jsonb, confirmado = true, actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'modo';
```

Lo que pasa en ese instante, sin que nadie más haga nada:

- Un trigger (`config_modo`) escribe `real_inicio = now()` (sólo bitácora) y deja `paso_a_real` en la bitácora. **Ya no toca `real_desde`** (`retardos_0012`).
- **Desde cuándo cuenta: `real_desde`, fecha fija a las 00:00 hora del centro: lunes 12-oct-2026.** El UPDATE sólo habilita. Si se corre a las 10:30 del 12, los retardos de las 7:xx de ese día cuentan; si se corre el 13, los del 12 también.
- **Retardos:** para toda la plantilla cuentan en la pista real sólo los de llegada desde `real_desde`. Nada anterior suma a retardos del mes, cartas, actas, reincidencia ni jornada. Nadie recibe como primer correo real una carta armada con retardos de la etapa de sombra.
- **Jornada:** cuentan las semanas FTS que **empiezan** desde `real_desde`: la primera es la del viernes 16 al jueves 22 (S43), y su corte es el viernes 23.
- **Acta administrativa:** se habilita en este momento (`acta_solo_en_real`).
- **Casos de sombra:** no vencen, no escalan ni generan recordatorios (`verificar` sólo mira la pista real).
- **Casos de sombra:** el UPDATE no los toca: se quedan en sombra y sus correos pendientes **siguen saliendo como sombra**, nunca a la persona. Los abiertos se cancelan aparte, en el §2b, sólo con el "va" de Esteban.
- **Personas del piloto** que ya estaban en pista real: no cambian nada, siguen en real.
- **Destinatarios** de todo aviso a la persona: Para la persona; CC `aviso_cc_rh` y su jefe directo según Odoo. Si no tiene jefe, CC `aviso_cc_rh` + `aviso_cc_sin_jefe` y la leyenda "Falta asignarle jefe en Odoo" arriba del correo.
- **Notas en Odoo** (`odoo_nota`): nacen omitidas mientras `odoo_nota_ejecutor = false` (`retardos_0010`), así que no se atora el outbox.

**Read-back 2** (correrlo justo después):

```sql
SELECT jsonb_build_object(
  'modo',          retardos.cfg_txt('modo'),                      -- real
  'real_inicio',   retardos.cfg('real_inicio'),                   -- la hora del UPDATE
  'real_desde',    retardos.cfg_txt('real_desde'),                -- 2026-10-12: el UPDATE no la mueve
  'acta',          retardos.nivel_habilitado(3::smallint),        -- true
  'bitacora_paso', (SELECT max(creado_at) FROM retardos.bitacora WHERE evento = 'paso_a_real'),
  'modo_sanciones', retardos.cfg_txt('modo_sanciones'),           -- sin_suspension
  'salud',         retardos.salud());
```

**Buena hora:** de 10:00 a 11:30 CST, lejos de `detectar` (12:15 y 19:15).

## 2b. Lunes 12: cancelar los casos abiertos de sombra (SÓLO con el "va" de Esteban ese día)

Decisión del 7-oct-2026 (#386). La sombra fue ensayo: sus casos abiertos se cancelan con motivo para que el panel arranque limpio. **No se corre sin el "va" de Esteban del mismo lunes 12**, aunque todo lo demás esté listo.

**Va DESPUÉS del UPDATE del §2, nunca antes.** `abrir_caso` no abre casos de sombra para quien ya está en pista real (`retardos_0012`, `IF p_pista IS NULL AND retardos.pista_de(p_emp) = 'real' THEN RETURN NULL`). Con `modo = real` toda la plantilla está en pista real, así que lo cancelado ya no se vuelve a abrir. Si se corre antes, la siguiente `detectar` puede reabrir casos de sombra, como pasó el 7-oct a las 12:15 CST.

**1. Vista previa (sólo lectura).** Revisar el conteo y la lista antes de tocar nada:

```sql
SELECT count(*) AS a_cancelar, jsonb_agg(jsonb_build_object('folio', folio, 'estado', estado, 'periodo', periodo) ORDER BY folio) AS casos,
       (SELECT count(*) FROM retardos.caso WHERE pista = 'real' AND estado NOT IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA')) AS reales_abiertos_no_se_tocan
  FROM retardos.caso
 WHERE pista = 'sombra' AND estado NOT IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA');
```

**2. La cancelación.** Sólo pista sombra y sólo abiertos; actor `sistema` y el motivo en la bitácora. Cancelar es terminal: no hay reversa.

```sql
SELECT count(*) AS cancelados, jsonb_agg(folio ORDER BY folio) AS folios
  FROM retardos.caso c,
       LATERAL (SELECT retardos.transicionar(c.id, 'CANCELADO_POR_RH', 'sistema',
                  'Inicio de go-live, la sombra fue ensayo',
                  jsonb_build_object('decision', 'Dirección 7-oct-2026', 'issue', 386))) x
 WHERE c.pista = 'sombra' AND c.estado NOT IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA');
```

Lo esperado: `cancelados` igual a `a_cancelar` de la vista previa. Si difiere, parar y reportar.

**3. Read-back:**

```sql
SELECT jsonb_build_object(
  'sombra_abiertos', (SELECT count(*) FROM retardos.caso WHERE pista = 'sombra' AND estado NOT IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA')),  -- 0
  'real_abiertos',   (SELECT count(*) FROM retardos.caso WHERE pista = 'real'   AND estado NOT IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA')),  -- igual que antes
  'envios_reales_nuevos', (SELECT count(*) FROM retardos.envio WHERE modo_envio = 'real' AND creado_at >= now() - interval '10 minutes'),       -- 0: cancelar no manda correos
  'outbox_pendiente', (SELECT count(*) FROM retardos.envio WHERE estado IN ('pendiente','fallido')),
  'salud', retardos.salud());
```

Y repetir `sombra_abiertos` después de la `detectar` de las 12:15 CST: tiene que seguir en 0.

## 3. Verificación después del primer `detectar` en real

```sql
SELECT jsonb_build_object(
  'ultima_corrida',  (SELECT jsonb_build_object('id', id, 'ok', ok, 'leidos', leidos, 'at', iniciada_at) FROM retardos.corrida WHERE workflow = 'retardos/detectar' ORDER BY id DESC LIMIT 1),
  'casos_reales',    (SELECT jsonb_object_agg(estado, n) FROM (SELECT estado, count(*) AS n FROM retardos.caso WHERE pista = 'real' GROUP BY 1) z),
  'envios_reales',   (SELECT jsonb_object_agg(estado, n) FROM (SELECT estado, count(*) AS n FROM retardos.envio WHERE modo_envio = 'real' GROUP BY 1) z),
  'salud',           retardos.salud());
```

Lo esperado: la corrida con `ok = true` y `leidos > 0`; casos con `pista = 'real'` sólo por retardos desde `real_desde`; envíos `modo_envio = 'real'` en `enviado`.

**Un cero no prueba nada** (CLAUDE.md §9): si nadie llegó tarde ese día, la verificación espera al siguiente.

## 4. Revertir: la misma bandera

```sql
UPDATE retardos.config
   SET valor = '"sombra"'::jsonb, actualizado_por = 'quien.ejecuta', actualizado_at = now()
 WHERE clave = 'modo';
SELECT retardos.cfg_txt('modo');   -- read-back: sombra
```

- El trigger deja `regreso_a_sombra` en la bitácora.
- **Lo que esté pendiente de la pista real vuelve a salir como sombra** al instante: se desvía a `sombra_destinatarios` con `[SOMBRA]`.
- Las personas del piloto siguen en real mientras `piloto_habilitado = true` (ver `PILOTO.md` para apagarlo).
- Los casos ya abiertos siguen en el estado en que estaban. Los correos que ya salieron no se pueden recuperar.
- `real_desde` no se mueve al revertir: si se vuelve a poner `real`, vuelve a contar desde esa misma fecha. Para empezar de cero otra vez hay que mover `real_desde` a mano. El acta vuelve a quedar retenida.

**Para parar todo de inmediato:** despublicar `retardos/enviar` (`UqhsvXDZjOmatEql`) en la UI de n8n. Nada sale y todo queda en el outbox.

## 5. Notas en Odoo

Resuelto en `retardos_0010`: sin ejecutor, un `odoo_nota` nace `omitido` en cualquier modo, con el motivo escrito. La hoja y su bitácora quedan en Postgres. El día que exista el workflow que escribe la nota en el chatter del empleado, se pone `odoo_nota_ejecutor = true`.

## 6. Después del paso a real

- **Suspensiones:** siguen apagadas. Si una alerta "Recomendación: activar modo suspensión" aparece, se atiende en el panel (pestaña Reincidencia) y el cambio, si se decide, sigue `MODO_SUSPENSION.md`.
- **Disparadores globales:** empiezan a contar desde `real_desde`; el primero puede sonar a las 8 semanas.
