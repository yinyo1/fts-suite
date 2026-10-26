-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0047 · V1.63f (fts-conceptualizador#12, C1): candados de decisión humana
--
-- Esteban, 25-oct-2026 19:10 y 19:50 CST: «candados de decisión humana en la base (caso, qué fija —renglón o sección—, valor, autor,
-- fecha, mensaje de origen, alcance)». Origen: 21fec6 (la decisión de Esteban vivía repartida en decretos.json, la spec y la versión
-- guardada; ninguna de las rutas que escriben precio la leía como «lo que el humano fijó»).
--   · tabla `candado`: una fila por caso y clave (la última decisión humana sobre esa clave). La llena el motor (herramientas/motor/
--     candados.js → api_motor modo `candados`); lo que ya no viene se borra, como `decreto_destino`.
--   · api_motor modo `candados`: escribe los candados de un caso (máx. 100).
--   · api_motor modo `salud`: además trae `candados` por caso abierto o enviado con su orden, para que el workflow diario los compare
--     renglón por renglón contra la orden real de Odoo (C4).
--   · api_motor modo `asumir_conjeturas` con `analisis_v163e`: cierra sin exigir dejar 5 abiertas (D154 superada; nunca la vista de
--     Odoo). Apagado, lo de la 0012.
--   · interruptores en '0': `candados_v163f` (el motor no frena escrituras ni publica candados mientras esté apagado) y
--     `supuesto20_v163f` (#12 2d: un supuesto del robot que mueve más de 20 % del total no se aplica solo) y
--     `precios_v163f` (#12 parte 3: la búsqueda de precio que no se rinde, el precio meta y su medición en el correo) y
--     `avance_robot_v163f` (#12 2e: el aviso dice el % de lo que puede hacer el robot y lo que depende de la persona).
-- Aditiva: no cambia ningún valor ni ninguna fila existente. Reversa: reversas/047_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in47$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153',
               'condiciones_caso','nucleo_chat','machote_chat','enviar_cliente','rastreo_respuestas',
               'cierre_tarjetas','resumen_v155','aprende_v155','ligas_v155','menos_texto','ficha_cliente',
               'arriendo_v157','alarmas_v157','git_v157','juntar_revisa','acuse_v157','recalculo_v157','tokens_v157',
               'regla15_v157','pago_decreto','horario_autor','tarjeta_v157','correo_v157','vista_cliente',
               'piso_v158','estado_odoo_v158','niveles_v158','menu_vista_v158','actualizar_v158','ligas_v158',
               'delegacion_v159','vendedor_v159','bom_observado_v159','tarjetas_v159',
               'lista_v160','chat_limpio_v160','seleccion_v160',
               'barra_v161',
               'cuadre_v162','tarjetas_v162','oportunidad_v162','n0_v162','ruido_v162',
               'guardar_agente_v162b','todo_hecho_v162b','pdf_v162b','revision_v162b',
               'barrido_v162',
               'pdf_menu_v163','flujo_v163','pdf_v163','vendedor_v163','rechazos_v163','una_orden_v163',
               'freno_robot_v163','oportunidad_v163','machote_n5_v163',
               'libro_v163','procura_v163','secciones_v163','oportunidad_nace_v163','aviso_personas_v163',
               'pdf_unico_v163',
               'fin_semana_v163e',
               'analisis_v163e','tarifas_usa_v163e','deshacer_v163e',
               'borrador_n5_v163e','borrador_robot_v163e',
               'machote_robot_v163e',
               'alarmas_robot_v163e',
               'terminos_robot_v163e','sin_avance_v163e',
               'equipo_estimado_v163e','viaticos_costo_v163e',
               'candados_v163f','supuesto20_v163f','precios_v163f','avance_robot_v163f']
$in47$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS conceptualizador.candado (
  caso_id        uuid        NOT NULL REFERENCES conceptualizador.caso(id),
  clave          text        NOT NULL CHECK (char_length(clave) BETWEEN 1 AND 160),
  tipo           text        NOT NULL CHECK (tipo IN ('renglon','seccion','comision','moneda','pago','exclusion','n0','version')),
  objetivo       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  campo          text        CHECK (campo IS NULL OR char_length(campo) <= 40),
  valor          jsonb,
  autor          text        CHECK (autor IS NULL OR char_length(autor) <= 80),
  fecha          timestamptz,
  origen         text        CHECK (origen IS NULL OR char_length(origen) <= 120),
  decreto        text        CHECK (decreto IS NULL OR char_length(decreto) <= 40),
  alcance        text        NOT NULL DEFAULT 'caso' CHECK (alcance IN ('caso')),
  texto          text        CHECK (texto IS NULL OR char_length(texto) <= 300),
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (caso_id, clave)
);
REVOKE ALL ON conceptualizador.candado FROM PUBLIC;

DO $ren47m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0047prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0047prev;
  END IF;
END
$ren47m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot47$
DECLARE
  v_r      jsonb;
  v_caso   uuid;
  v_e      jsonb;
  v_n      int := 0;
  v_claves text[] := '{}';
  v_fecha  timestamptz;
BEGIN
  IF p->>'modo' = 'candados' THEN
    IF coalesce(p->>'motor', '') NOT IN ('principal','respaldo') THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;
    BEGIN v_caso := (p->>'caso_id')::uuid; EXCEPTION WHEN others THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_INVALIDO'); END;
    IF NOT EXISTS (SELECT 1 FROM conceptualizador.caso WHERE id = v_caso) THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_NO_EXISTE'); END IF;
    IF jsonb_typeof(p->'candados') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'candados') > 100 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'CANDADOS_INVALIDOS');
    END IF;
    FOR v_e IN SELECT * FROM jsonb_array_elements(p->'candados') LOOP
      CONTINUE WHEN coalesce(v_e->>'clave', '') = '' OR coalesce(v_e->>'tipo', '') NOT IN ('renglon','seccion','comision','moneda','pago','exclusion','n0','version');
      BEGIN v_fecha := nullif(v_e->>'fecha', '')::timestamptz; EXCEPTION WHEN others THEN v_fecha := NULL; END;
      v_claves := v_claves || left(v_e->>'clave', 160);
      INSERT INTO conceptualizador.candado (caso_id, clave, tipo, objetivo, campo, valor, autor, fecha, origen, decreto, texto, actualizado_at)
      VALUES (v_caso, left(v_e->>'clave', 160), v_e->>'tipo', CASE WHEN jsonb_typeof(v_e->'objetivo') = 'object' THEN v_e->'objetivo' ELSE '{}'::jsonb END,
              left(v_e->>'campo', 40), CASE WHEN length(coalesce(v_e->'valor', 'null'::jsonb)::text) <= 4000 THEN v_e->'valor' END,
              left(v_e->>'autor', 80), v_fecha, left(v_e->>'origen', 120), left(v_e->>'decreto', 40), left(v_e->>'texto', 300), now())
      ON CONFLICT (caso_id, clave) DO UPDATE SET tipo = EXCLUDED.tipo, objetivo = EXCLUDED.objetivo, campo = EXCLUDED.campo, valor = EXCLUDED.valor,
             autor = EXCLUDED.autor, fecha = EXCLUDED.fecha, origen = EXCLUDED.origen, decreto = EXCLUDED.decreto, texto = EXCLUDED.texto, actualizado_at = now();
      v_n := v_n + 1;
    END LOOP;
    DELETE FROM conceptualizador.candado WHERE caso_id = v_caso AND NOT (clave = ANY (v_claves));
    RETURN jsonb_build_object('ok', true, 'guardados', v_n);
  END IF;
  -- V1.63f (#12 2c) · con el modo análisis (D154 superada: a lo más UNA pregunta abierta) el robot cierra como supuesto SIN dejar 5
  -- abiertas: antes la base contestaba QUEDARIAN_MENOS_DE_5 (y el robot decía «cerré N» mientras seguían abiertas). Nunca cierra la
  -- vista de Odoo («Esto voy a poner en Odoo», campo odoo.vista): esa la confirma la persona.
  IF p->>'modo' = 'asumir_conjeturas' AND conceptualizador.prendido('analisis_v163e') THEN
    IF coalesce(p->>'motor', '') NOT IN ('principal','respaldo') THEN RETURN jsonb_build_object('ok', false, 'error', 'MOTOR_INVALIDO'); END IF;
    BEGIN v_caso := nullif(p->>'caso_id','')::uuid; EXCEPTION WHEN others THEN v_caso := NULL; END;
    IF v_caso IS NULL OR jsonb_typeof(p->'conjeturas') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('ok', false, 'error', 'PARAMETROS'); END IF;
    FOR v_e IN SELECT * FROM jsonb_array_elements(p->'conjeturas') LOOP
      IF char_length(btrim(coalesce(v_e->>'supuesto',''))) < 8 OR char_length(btrim(coalesce(v_e->>'fuente',''))) < 3 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'SUPUESTO_SIN_TEXTO_O_FUENTE', 'accion_id', v_e->>'accion_id');
      END IF;
    END LOOP;
    FOR v_e IN SELECT * FROM jsonb_array_elements(p->'conjeturas') LOOP
      UPDATE conceptualizador.accion a
         SET estado = 'descartada', hecha_por = 'motor', hecha_at = now(),
             resultado = jsonb_build_object('asumida', true, 'supuesto', left(btrim(v_e->>'supuesto'), 600), 'fuente', left(btrim(v_e->>'fuente'), 300))
       WHERE a.id::text = coalesce(v_e->>'accion_id', '') AND a.caso_id = v_caso AND a.tipo = 'conjetura' AND a.estado = 'propuesta'
         AND coalesce(a.datos->>'campo','') !~ '^(proyecto|diagnostico)[.]' AND coalesce(a.datos->>'campo','') <> 'odoo.vista';
      IF FOUND THEN v_n := v_n + 1; END IF;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'asumidas', v_n, 'abiertas', (SELECT count(*) FROM conceptualizador.accion a
      WHERE a.caso_id = v_caso AND a.tipo = 'conjetura' AND a.estado = 'propuesta'));
  END IF;
  v_r := conceptualizador.api_motor_0047prev(p);
  IF p->>'modo' = 'salud' AND coalesce((v_r->>'ok')::boolean, false) AND jsonb_typeof(v_r->'salud') = 'object' THEN
    v_r := jsonb_set(v_r, '{salud,candados}', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('caso_id', c.id, 'caso', c.titulo, 'carpeta', c.carpeta, 'dueno', c.autor, 'estado_caso', c.estado,
                    'orden_id', c.orden_id, 'orden', c.orden_nombre,
                    'candados', (SELECT jsonb_agg(jsonb_build_object('clave', k.clave, 'tipo', k.tipo, 'objetivo', k.objetivo, 'campo', k.campo, 'valor', k.valor,
                                   'autor', k.autor, 'fecha', k.fecha, 'origen', k.origen, 'decreto', k.decreto) ORDER BY k.clave)
                                   FROM conceptualizador.candado k WHERE k.caso_id = c.id)) ORDER BY c.titulo), '[]'::jsonb)
        FROM conceptualizador.caso c
       WHERE c.estado IN ('abierto','enviada') AND NOT c.demo AND EXISTS (SELECT 1 FROM conceptualizador.candado k WHERE k.caso_id = c.id)));
  END IF;
  RETURN v_r;
END
$mot47$;
ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0047prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0047prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0047prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
