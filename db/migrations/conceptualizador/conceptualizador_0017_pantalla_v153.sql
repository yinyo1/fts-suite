-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0017 · V1.53b (fts-conceptualizador#6, alcance definitivo V1.53b)
--
-- Solo INTERRUPTORES de pantalla, todos en '0' (con todos apagados = V1.53a): la pantalla los lee del panel y los respeta.
--   leer_mas             «Leer más» / «Leer menos» a 5 renglones en los mensajes del agente (pieza del núcleo shared/chat)
--   bolita_acciones      las sugerencias en la bolita ⚡ arriba del micrófono; abajo solo la pastilla de espera
--   tarjetas_colapsadas  las tarjetas de datos salen cerradas (título + una línea); la que pide un clic, abierta
--   pantalla_v153        bolita «+», nombre «Cliente corto · proyecto», tarjeta de estado vigente, una sola señal, permiso
--                        del robot con la razón arriba, textos sin contradicciones, «Dame los generales» y el PDF del visor
-- Lo que NO cambia: ninguna tabla, ningún modo, ningún valor de config existente.
-- Reversa: db/reversas/017_reversa.sql (la lista de la 0016 y borra solo estas 4 claves si siguen en '0').
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, &, acento grave o dígito;
-- etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in17$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153']
$in17$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;
