-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0078 · V1.65 (fts-conceptualizador#20 parte 14, punto 1) · el primer machote por el motor, PROBADO EN ZZ
--
-- El motor guarda la v1 por el camino del robot (comercial/machote-guardar con robot:true → robot_machote_v163e), que desde la 0043
-- rechaza todo caso demo (CASO_DEMO). Medido en ZZ cbaa68f8 (trabajo 1406): sin esta excepción la corrida ZZ no se puede hacer.
--   · robot_machote_v163e: si la respuesta de antes es CASO_DEMO y el caso es de PRUEBA ZZ (demo, autor zz.*, cliente ZZ-PRUEBA A3 2260)
--     y tiene `interruptor:machote_motor_v165@<caso>` = '1' (el renglón del CASO, no el de la persona ni el global), se revisa lo demás
--     igual que la 0043 (archivado, enviado, pausa, forma del id, el machote del caso) y se deja crear o subir versión.
--   · Cualquier otro caso demo sigue en CASO_DEMO. Los casos reales no cambian: la respuesta de antes pasa tal cual.
-- ORDEN: 0077 → 0078. Aditiva e idempotente. Reversa: reversas/078_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════
DO $ren78$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'conceptualizador' AND p.proname = 'robot_machote_v163e_0078prev') THEN
    ALTER FUNCTION conceptualizador.robot_machote_v163e(uuid, text) RENAME TO robot_machote_v163e_0078prev;
  END IF;
END
$ren78$;

CREATE OR REPLACE FUNCTION conceptualizador.zz_motor_machote_v165(p_caso uuid, p_id_local text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $zm78$
DECLARE
  k record;
  m record;
BEGIN
  SELECT c.id, c.autor, c.autor_nombre, c.estado, c.demo, c.archivado_at, c.enviada_at, c.machote_id, c.cliente_odoo_id INTO k
    FROM conceptualizador.caso c WHERE c.id = p_caso;
  IF k.id IS NULL OR NOT coalesce(k.demo, false) OR k.autor NOT LIKE 'zz.%' OR k.cliente_odoo_id IS DISTINCT FROM 2260
     OR (SELECT x.valor FROM conceptualizador.config x WHERE x.clave = 'interruptor:machote_motor_v165@' || k.id::text) IS DISTINCT FROM '1' THEN
    RETURN NULL;
  END IF;
  IF k.archivado_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'CASO_ARCHIVADO', 'mensaje', 'El caso está archivado.'); END IF;
  IF k.estado IS DISTINCT FROM 'abierto' OR k.enviada_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM conceptualizador.accion a WHERE a.caso_id = k.id AND a.tipo = 'enviada' AND a.estado = 'hecha') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CASO_ENVIADO', 'mensaje', 'El caso ya se envió o se cerró: lo enviado no se toca.');
  END IF;
  IF EXISTS (SELECT 1 FROM conceptualizador.agente_pausa z WHERE z.caso_id = k.id AND z.hasta IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CASO_EN_PAUSA', 'mensaje', 'El dueño pausó al agente en este caso.');
  END IF;
  IF coalesce(p_id_local, '') !~ '^M-[0-9]{10,16}\Z' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ID_LOCAL_INVALIDO', 'mensaje', 'El id del machote no tiene la forma M-<epoch>.');
  END IF;
  SELECT x.id, x.dueno INTO m FROM comercial.machote x WHERE x.id_local = p_id_local AND x.deleted_at IS NULL;
  IF k.machote_id IS NOT NULL THEN
    IF m.id IS DISTINCT FROM k.machote_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'OTRO_MACHOTE', 'mensaje', 'El caso ya tiene otro machote: el robot solo le sube versión al suyo.');
    END IF;
  ELSIF m.id IS NOT NULL THEN
    IF m.dueno IS DISTINCT FROM k.autor OR EXISTS (SELECT 1 FROM conceptualizador.caso o WHERE o.machote_id = m.id AND o.id <> k.id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'OTRO_MACHOTE', 'mensaje', 'Ese machote no es del autor del caso o ya es de otro caso.');
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', true, 'modo', 'crear', 'caso_id', k.id, 'autor', k.autor, 'autor_nombre', coalesce(k.autor_nombre, k.autor), 'zz_motor', true);
  END IF;
  IF m.dueno IS DISTINCT FROM k.autor THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NO_ES_TUYO', 'mensaje', 'El machote de prueba es de otro usuario.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'modo', 'actualizar', 'caso_id', k.id, 'autor', k.autor, 'autor_nombre', coalesce(k.autor_nombre, k.autor), 'machote_id', m.id, 'zz_motor', true);
END
$zm78$;

CREATE OR REPLACE FUNCTION conceptualizador.robot_machote_v163e(p_caso uuid, p_id_local text) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $rm78$
DECLARE
  v_r jsonb;
  v_z jsonb;
BEGIN
  v_r := conceptualizador.robot_machote_v163e_0078prev(p_caso, p_id_local);
  IF v_r->>'error' = 'CASO_DEMO' THEN
    v_z := conceptualizador.zz_motor_machote_v165(p_caso, p_id_local);
    IF v_z IS NOT NULL THEN RETURN v_z; END IF;
  END IF;
  RETURN v_r;
END
$rm78$;
ALTER FUNCTION conceptualizador.zz_motor_machote_v165(uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.robot_machote_v163e(uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
ALTER FUNCTION conceptualizador.robot_machote_v163e_0078prev(uuid, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.zz_motor_machote_v165(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.robot_machote_v163e(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.robot_machote_v163e_0078prev(uuid, text) FROM PUBLIC;
DO $gr78$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    REVOKE ALL ON FUNCTION conceptualizador.robot_machote_v163e_0078prev(uuid, text) FROM comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.robot_machote_v163e(uuid, text) TO comercial_app;
  END IF;
END
$gr78$;
