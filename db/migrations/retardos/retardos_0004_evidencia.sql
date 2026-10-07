-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0004 · El panel puede VER la hoja firmada (#334)
--
-- RH valida la firma mirando el archivo. La puerta del webhook (retardos/lib/sesion.js)
-- ya trataba 'evidencia' como lectura, pero retardos.panel() no la implementaba:
-- contestaba ACCION_DESCONOCIDA. Se despacha aquí, en panel_seguro, sin tocar panel().
-- Leer una hoja deja rastro en la bitácora (quién la vio y cuándo): es un dato
-- personal y la bitácora es inmutable.
-- Sin llaves dobles ni patrones de reemplazo de JS (retardos_0001 reglas 7 y 8).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION retardos.panel_evidencia(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE e retardos.evidencia; c retardos.caso;
BEGIN
  SELECT * INTO c FROM retardos.caso WHERE folio = p->>'folio';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'FOLIO_INEXISTENTE'); END IF;
  SELECT * INTO e FROM retardos.evidencia WHERE id = (p->>'id')::bigint AND caso_id = c.id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'EVIDENCIA_INEXISTENTE'); END IF;
  PERFORM retardos.log(c.id, 'evidencia_vista', coalesce(p->>'actor', 'desconocido'), 'Consulta desde el panel',
                       jsonb_build_object('evidencia_id', e.id, 'sha256', e.sha256));
  RETURN jsonb_build_object('ok', true, 'nombre', e.nombre, 'mime', e.mime, 'bytes', e.bytes, 'sha256', e.sha256,
                            'contenido_b64', encode(e.contenido, 'base64'));
END
$fn$;

CREATE OR REPLACE FUNCTION retardos.panel_seguro(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    INSERT INTO retardos.nonce (nonce, actor, accion) VALUES (p->>'nonce', coalesce(p->>'actor', '?'), p->>'accion');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'REPLAY');
  END;
  IF p->>'accion' = 'evidencia' THEN
    RETURN retardos.panel_evidencia(p);
  END IF;
  RETURN retardos.panel(p);
EXCEPTION WHEN raise_exception THEN
  RETURN jsonb_build_object('ok', false, 'error', split_part(SQLERRM, ' ', 1), 'detalle', left(SQLERRM, 200));
END
$fn$;

GRANT EXECUTE ON FUNCTION retardos.panel_evidencia(jsonb) TO retardos_app;
GRANT EXECUTE ON FUNCTION retardos.panel_seguro(jsonb) TO retardos_app;
