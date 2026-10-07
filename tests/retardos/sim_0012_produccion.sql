-- Simulación en producción de retardos_0012 + B2, SIN RASTRO (#386).
-- Se ejecuta DESPUÉS del texto de la migración, en la MISMA transacción, y termina con
-- RAISE EXCEPTION: la transacción completa se revierte (migración incluida). Sólo consume
-- números de secuencia. El resultado viaja en el mensaje del error.
-- No manda correos: nada llama a por_enviar ni a Graph. Sin datos personales en el resultado.
DO $sim$
DECLARE r jsonb := '{}'::jsonb; v jsonb; n integer; t text;
        b2 text[]; abiertos_despues jsonb;
BEGIN
  -- ── B2: cancelar con motivo los casos de agosto y septiembre en DETECTADO + RET-2026-0003 ──
  SELECT array_agg(folio ORDER BY folio) INTO b2 FROM retardos.caso
   WHERE (estado = 'DETECTADO' AND periodo IN ('2026-08','2026-09')) OR folio = 'RET-2026-0003';
  SELECT count(*) INTO n FROM retardos.caso c,
         LATERAL (SELECT retardos.transicionar(c.id, 'CANCELADO_POR_RH', 'sistema', 'Reinicio de conteo, decisión de Dirección 7-oct',
                    jsonb_build_object('decision', 'Dirección 7-oct-2026', 'issue', 386))) x
   WHERE c.folio = ANY (b2);
  SELECT jsonb_object_agg(k, m) INTO abiertos_despues FROM (
    SELECT periodo || ':' || estado AS k, count(*) AS m FROM retardos.caso
     WHERE estado NOT IN ('CERRADO','CANCELADO_POR_RH','ACCION_VERIFICADA') GROUP BY 1) z;
  r := r || jsonb_build_object('b2', jsonb_build_object('folios', to_jsonb(b2), 'cancelados', n,
          'envios_nuevos_por_cancelar', (SELECT count(*) FROM retardos.envio e JOIN retardos.caso c ON c.id = e.caso_id
                                          WHERE c.folio = ANY (b2) AND e.creado_at >= now()),
          'abiertos_despues', abiertos_despues));

  -- ── Antes del merge: nadie en pista real ──
  r := r || jsonb_build_object('antes_merge', jsonb_build_object(
          'pista_piloto', (SELECT jsonb_agg(retardos.pista_de(x::int)) FROM jsonb_array_elements_text(retardos.cfg('piloto_employee_ids')) x),
          'acta_habilitada', retardos.nivel_habilitado(3::smallint)));

  -- ── Merge simulado: la marca habilita el piloto (por_enviar con la marca, sin mandar nada) ──
  UPDATE retardos.config SET valor = to_jsonb(now()::text), actualizado_por = 'simulacion' WHERE clave = 'piloto_inicio';
  r := r || jsonb_build_object('tras_merge', jsonb_build_object(
          'inicio_real_piloto', (SELECT jsonb_agg(DISTINCT to_char(retardos.a_local(retardos.inicio_real(x::int)), 'YYYY-MM-DD HH24:MI'))
                                   FROM jsonb_array_elements_text(retardos.cfg('piloto_employee_ids')) x),
          'retardos_oct_piloto_contados', (SELECT count(*) FROM retardos.retardo t WHERE t.estado = 'contado' AND t.periodo = '2026-10'
                                            AND t.employee_id IN (SELECT x::int FROM jsonb_array_elements_text(retardos.cfg('piloto_employee_ids')) x)),
          'de_esos_cuentan_en_real', (SELECT count(*) FROM retardos.retardo t WHERE t.estado = 'contado' AND t.periodo = '2026-10'
                                       AND retardos.inicio_real(t.employee_id) IS NOT NULL
                                       AND retardos.retardo_instante(t.fecha, t.seg_local, t.hora_local) >= retardos.inicio_real(t.employee_id)),
          'casos_reales_abiertos', jsonb_array_length(retardos.escalar_pista_real(NULL)),
          'semana_piloto_02oct', retardos.pista_semana(63, '2026-10-02'), 'semana_piloto_09oct', retardos.pista_semana(63, '2026-10-09'),
          'semana_resto_09oct', retardos.pista_semana(55, '2026-10-09'),
          'acta_habilitada', retardos.nivel_habilitado(3::smallint)));

  -- ── verificar() y alertas con los casos de sombra que quedan abiertos ──
  v := retardos.verificar();
  r := r || jsonb_build_object('verificar', jsonb_build_object('vencidos', v->'vencidos', 'escalados', v->'escalados',
          'recordatorios_rh', v->'recordatorios_rh', 'alertas', v->'alertas', 'alertas_modo_nuevas', v->'alertas_nuevas'));

  -- ── Go-live simulado: la bandera ──
  UPDATE retardos.config SET valor = '"real"'::jsonb, actualizado_por = 'simulacion' WHERE clave = 'modo';
  r := r || jsonb_build_object('tras_golive', jsonb_build_object(
          'real_desde', retardos.cfg_txt('real_desde'), 'real_inicio_escrito', retardos.cfg_txt('real_inicio') IS NOT NULL,
          'inicio_real_resto', to_char(retardos.a_local(retardos.inicio_real(55)), 'YYYY-MM-DD HH24:MI'),
          'inicio_real_piloto', to_char(retardos.a_local(retardos.inicio_real(63)), 'YYYY-MM-DD HH24:MI'),
          'casos_reales_abiertos', jsonb_array_length(retardos.escalar_pista_real(NULL)),
          'semana_resto_09oct', retardos.pista_semana(55, '2026-10-09'), 'semana_resto_16oct', retardos.pista_semana(55, '2026-10-16'),
          'acta_habilitada', retardos.nivel_habilitado(3::smallint),
          'jornada_desde', retardos.cfg_txt('jornada_desde')));

  -- ── Casos de RH ──
  r := r || jsonb_build_object('casos_rh', jsonb_build_object(
          'ana', retardos.responsable_rh(101) - 'atiende_usuario' - 'atiende_nombre',
          'magaly', retardos.responsable_rh(63) - 'atiende_usuario' - 'atiende_nombre',
          'copia_configurada', jsonb_array_length(retardos.copia_caso_rh()) > 0,
          'cc_aviso_ana_incluye_copia', (retardos.destinos_aviso(101)->'cc') @> retardos.copia_caso_rh()));
  BEGIN
    PERFORM retardos.exigir_responsable_rh(101, 'cualquiera');
    t := 'NO_LANZO';
  EXCEPTION WHEN raise_exception THEN t := split_part(SQLERRM, ' ', 1);
  END;
  r := r || jsonb_build_object('guardia_sin_usuario', t);

  r := r || jsonb_build_object('conteo_panel', retardos.conteo_info(),
          'migraciones_en_tx', (SELECT count(*) FROM public.schema_migrations WHERE version LIKE 'retardos_%'));
  RAISE EXCEPTION 'SIMULACION_386B %', r::text;
END
$sim$;
