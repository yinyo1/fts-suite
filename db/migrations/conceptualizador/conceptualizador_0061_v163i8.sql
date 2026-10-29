-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0061 · V1.63i.8 (fts-conceptualizador#13 y #16 punto 2, Esteban 28-oct-2026 17:35 MT, D228) · que las pruebas no
-- vuelvan a llenar el contenedor, y que si se llena se sepa
--
-- 20-oct: 113 copias del repo en /tmp llenaron el disco. 28-oct: 98 carpetas de pruebas en /dev/shm (9.3 GB) llevaron la memoria del
-- contenedor a 14 de 16 GB y ningún proceso nuevo arrancaba. La limpieza es del código de pruebas (pruebas/lib/temporal.js y .sh); la
-- base solo arma la alarma:
--   · el vigía manda en cada latido salud.disco = {at, raiz_pct, raiz_libre_gb, shm_pct, shm_libre_gb, ram_pct, ram_libre_gb}
--     (herramientas/motor/disco.js), que ya viaja a latido_sesion.salud (0023) sin cambiar api_motor;
--   · alarmas_motor (envoltura, con limpieza_v163i): si la medición más reciente (de las últimas alarma_disco_horas, 6) tiene /, /dev/shm
--     o la memoria ARRIBA de alarma_disco_pct (70; 70 exacto no alarma) → alarma `disco_lleno`, una por medida (clave disco_lleno:raiz|
--     shm|ram). Sale sola en el correo diario (salud-armar: «ALARMAS ABIERTAS», S.arriendo.alarmas) y, con alarmas_v157, como incidente
--     del correo inmediato (encolar_alarmas, 0026: un correo al abrir, recordatorio cada 4 h, «Resuelto» cuando baja). n8n NO cambia.
-- Interruptor nuevo APAGADO: limpieza_v163i. Apagado = igual que antes.
-- ORDEN: 0059 → 0060 → 0061. interruptores_nombres() conserva TODOS los de la 0059 y el rayito_v163i de la 0060, y suma limpieza_v163i;
-- si la 0060 todavía no corrió, aquí se da de alta rayito_v163i apagado (la 0060 no lo pisa: ON CONFLICT DO NOTHING).
-- Aditiva e idempotente. Reversa: reversas/061_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in61$
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
               'candados_v163f','supuesto20_v163f','precios_v163f','avance_robot_v163f',
               'voz_visor_v163g',
               'voz_directo_v163g',
               'estimados_v163h','sentido_v163h',
               'no_esperar_v163g4',
               'superadas_v163g5',
               'criterio_v163i','ruido_v163i','voz_previa_v163i','por_confirmar_v163i','un_paso_v163i','cambio_no_llegado_v163i',
               'frenos_v163i','regla_nueva_v163i','freno_arriba_v163i','fallas_odoo_v163i',
               'idioma_persona_v163i','mic_visible_v163i','rafaga_vacia_v163i',
               'rfc_usa_v163i','cliente_grupo_v163i',
               'ruido_chat_v163i','numero_directo_v163i',
               'sin_ciclo_v163i','alarma_ciclo_v163i','version_vigente_v163i','pdf_odoo_v163i',
               'viaje_oculto_v163i','candado_persona_v163i','pregunta_primero_v163i',
               'rayito_v163i',
               'limpieza_v163i']
$in61$;
INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;
INSERT INTO conceptualizador.config (clave, valor) VALUES ('alarma_disco_pct', '70'), ('alarma_disco_horas', '6')
ON CONFLICT (clave) DO NOTHING;

-- ── alarmas_motor (envoltura): disco_lleno ──
DO $ren61a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'alarmas_motor_0061prev') THEN
    ALTER FUNCTION conceptualizador.alarmas_motor(text) RENAME TO alarmas_motor_0061prev;
  END IF;
END
$ren61a$;

/** Las medidas de la última medición de disco que pasan del umbral (estrictamente: 70 no, 71 sí). Misma regla que disco.js evaluar. */
CREATE OR REPLACE FUNCTION conceptualizador.disco_excedido(p_llave text DEFAULT 'conceptualizador')
RETURNS TABLE (volumen text, pct int, libre_gb numeric, medido_at timestamptz, sesion text, umbral int)
LANGUAGE sql STABLE AS $de61$
  WITH ult AS (
    SELECT s.sesion, s.salud->'disco' AS d,
           CASE WHEN (s.salud->'disco'->>'at') ~ '^[0-9]{10,13}\Z' THEN to_timestamp((s.salud->'disco'->>'at')::bigint / 1000.0) ELSE s.visto_at END AS at
      FROM conceptualizador.latido_sesion s
     WHERE s.llave = p_llave AND jsonb_typeof(s.salud->'disco') = 'object'
       AND s.visto_at > now() - make_interval(hours => coalesce(conceptualizador.cfg('alarma_disco_horas'), 6))
     ORDER BY s.visto_at DESC LIMIT 1),
  u AS (SELECT coalesce(conceptualizador.cfg('alarma_disco_pct'), 70) AS umbral)
  SELECT v.k, (ult.d->>(v.k || '_pct'))::int,
         CASE WHEN (ult.d->>(v.k || '_libre_gb')) ~ '^[0-9]+(\.[0-9]+)?\Z' THEN (ult.d->>(v.k || '_libre_gb'))::numeric END,
         ult.at, ult.sesion, u.umbral
    FROM ult CROSS JOIN u CROSS JOIN (VALUES (1, 'raiz'), (2, 'shm'), (3, 'ram')) v(o, k)
   WHERE (ult.d->>(v.k || '_pct')) ~ '^[0-9]{1,3}\Z' AND (ult.d->>(v.k || '_pct'))::int > u.umbral
   ORDER BY v.o
$de61$;
REVOKE ALL ON FUNCTION conceptualizador.disco_excedido(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am61$
DECLARE
  v_r jsonb := conceptualizador.alarmas_motor_0061prev(p_llave);
  f   record;
BEGIN
  IF NOT conceptualizador.prendido('limpieza_v163i') THEN RETURN v_r; END IF;
  FOR f IN SELECT * FROM conceptualizador.disco_excedido(p_llave) LOOP
    v_r := v_r || conceptualizador.alarma('disco_lleno', f.volumen, f.medido_at,
      CASE f.volumen WHEN 'raiz' THEN 'El disco del contenedor del motor (/)' WHEN 'shm' THEN 'La carpeta /dev/shm del contenedor del motor (cuenta como memoria)'
                     ELSE 'La memoria del contenedor del motor' END ||
        ' está al ' || f.pct || ' %' || coalesce(' (quedan ' || f.libre_gb || ' GB)', '') || ', arriba del ' || f.umbral || ' %. Medido por la sesión ' ||
        coalesce(left(f.sesion, 40), '?') || ' a las ' || coalesce(conceptualizador.hora_local(f.medido_at) || ' CST', '?') ||
        '. Si se llena, ningún proceso nuevo arranca (28-oct) y el motor deja de contestar.',
      'Las pruebas borran solas lo suyo (pruebas/lib/temporal.js). En la sesión del motor: «node pruebas/lib/temporal.js --barrer --informe» quita lo marcado de más de 30 min; ' ||
        'si sigue arriba, mira qué ocupa («du -sh /tmp/* /dev/shm/* | sort -h | tail») y pide a la sesión dueña de cada carpeta que la borre.',
      'disco-lleno', jsonb_build_object('volumen', f.volumen, 'pct', f.pct, 'libre_gb', f.libre_gb, 'umbral', f.umbral, 'sesion', f.sesion));
  END LOOP;
  RETURN v_r;
END
$am61$;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor_0061prev(text) FROM PUBLIC;
