-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0028 · V1.58 (fts-conceptualizador#12): interruptores de «Destrabar cotizaciones»
--
-- Solo agrega 6 interruptores, todos en '0' (con todos apagados, la pantalla y el motor son los de la V1.57b):
--   piso_v158        el motor escribe `excepcion_margen` en el machote (decreto ESCRITO de Esteban) → el piso de margen deja pasar
--   estado_odoo_v158 tarjeta de estado inmediata en los clics que esperan a Odoo + visor propio del PDF (pdf.js)
--   niveles_v158     N1–N5 con nombre corto, nota al tocarlos y «Cotizar con referencias» en palabras
--   menu_vista_v158  dos entradas en el ⋮: vista para el cliente (directa) e interna (pregunta antes)
--   actualizar_v158  el rayito ofrece «Actualizar SO… en Odoo» cuando la orden salió sin tabla de pagos o sin condición única
--   ligas_v158       liga completa con SKU, tienda y fecha en la vista interna; 🔴 en los renglones viejos sin liga de producto
-- Además (piso_v158, al final): permisos de LECTURA de columnas mínimas para comercial_app (caso dueño del machote, autor
--   y rol del mensaje citado y si trae audio) y `piso_v158_prendido()`, para que orden-odoo frene un margen abajo del piso
--   sin decreto escrito de Esteban; y `salud` suma `excepciones_piso` (envoltura api_motor 0028) para el correo de las 7:00.
-- Lo que NO cambia: ningún interruptor existente, ninguna tabla, ningún modo.
-- Reversa: reversas/reversa_0028.sql (la lista de la 0027; los renglones de config se quedan, sin uso).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito;
-- etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in28$
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
               'piso_v158','estado_odoo_v158','niveles_v158','menu_vista_v158','actualizar_v158','ligas_v158']
$in28$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;

-- ── V1.58 · el PISO de margen en el servidor (piso_v158) ─────────────────────────────────────────────────────────────
-- conceptualizador/orden-odoo (credencial comercial_app) comprueba, con el interruptor prendido, que un machote abajo del
-- piso (8 %) traiga `excepcion_margen` y que su decreto apunte a un mensaje ESCRITO de Esteban del MISMO caso. Para eso lee
-- solo estas columnas: el caso dueño del machote (caso.machote_id), el mensaje (id, caso, rol, autor; nunca el texto) y si
-- ese mensaje trae audio (adjunto: mensaje, tipo, clase; nunca el contenido). Y el interruptor, por una función propia:
-- la tabla config entera no se abre a comercial_app.
CREATE OR REPLACE FUNCTION conceptualizador.piso_v158_prendido() RETURNS boolean
LANGUAGE sql STABLE AS $pv28$
  SELECT conceptualizador.prendido('piso_v158')
$pv28$;
ALTER FUNCTION conceptualizador.piso_v158_prendido() SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.piso_v158_prendido() FROM PUBLIC;

DO $pis28$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT USAGE ON SCHEMA conceptualizador TO comercial_app;
    GRANT SELECT (id, machote_id) ON conceptualizador.caso TO comercial_app;
    GRANT SELECT (id, caso_id, rol, autor) ON conceptualizador.mensaje TO comercial_app;
    GRANT SELECT (mensaje_id, tipo, clase) ON conceptualizador.adjunto TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.piso_v158_prendido() TO comercial_app;
  END IF;
END
$pis28$;

-- ── Correo de salud: «Excepciones de piso usadas (24 h)» ─────────────────────────────────────────────────────────────
-- Machotes con orden en Odoo, tocados en las últimas 24 h, cuya versión vigente va abajo del piso con `excepcion_margen`.
-- Si la base no tiene las tablas de comercial (las bases de prueba), sale el error como dato y el correo sigue igual.
CREATE OR REPLACE FUNCTION conceptualizador.excepciones_piso_24h() RETURNS jsonb
LANGUAGE plpgsql STABLE AS $ep28$
DECLARE v jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('orden', m.odoo_so_name, 'orden_id', m.odoo_so_id, 'folio', m.folio,
           'caso', k.titulo, 'dueno', k.autor, 'margen', u.margen,
           'decreto', u.documento->'excepcion_margen'->'decreto'->>'id', 'msg', u.documento->'excepcion_margen'->'decreto'->>'msg',
           'at', m.updated_at) ORDER BY m.updated_at DESC), '[]'::jsonb) INTO v
    FROM comercial.machote m
    JOIN LATERAL (SELECT x.margen, x.documento FROM comercial.machote_version x WHERE x.machote_id = m.id ORDER BY x.version DESC LIMIT 1) u ON true
    LEFT JOIN LATERAL (SELECT c.titulo, c.autor FROM conceptualizador.caso c WHERE c.machote_id = m.id ORDER BY c.created_at DESC LIMIT 1) k ON true
   WHERE m.deleted_at IS NULL AND m.odoo_so_id IS NOT NULL AND m.updated_at > now() - interval '24 hours'
     AND u.margen < 0.08 AND jsonb_typeof(u.documento->'excepcion_margen') = 'object';
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLSTATE);
END
$ep28$;
REVOKE ALL ON FUNCTION conceptualizador.excepciones_piso_24h() FROM PUBLIC;

-- api_motor (envoltura 0028): el modo `salud` suma `excepciones_piso`. Todo lo demás pasa tal cual a la de antes.
DO $ren28m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'api_motor_0028prev') THEN
    ALTER FUNCTION conceptualizador.api_motor(jsonb) RENAME TO api_motor_0028prev;
  END IF;
END
$ren28m$;

CREATE OR REPLACE FUNCTION conceptualizador.api_motor(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $mot28$
DECLARE v_r jsonb;
BEGIN
  v_r := conceptualizador.api_motor_0028prev(p);
  IF p->>'modo' = 'salud' AND coalesce((v_r->>'ok')::boolean, false) AND jsonb_typeof(v_r->'salud') = 'object' THEN
    v_r := jsonb_set(v_r, '{salud,excepciones_piso}', conceptualizador.excepciones_piso_24h());
  END IF;
  RETURN v_r;
END
$mot28$;

ALTER FUNCTION conceptualizador.api_motor(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.api_motor_0028prev(jsonb) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0028prev(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.api_motor_0028prev(jsonb) FROM conceptualizador_app;
GRANT EXECUTE ON FUNCTION conceptualizador.api_motor(jsonb) TO conceptualizador_app;
