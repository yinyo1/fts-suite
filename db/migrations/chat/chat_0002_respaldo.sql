-- ═══════════════════════════════════════════════════════════════════════════
-- chat_0002_respaldo.sql · el motor de respaldo del núcleo de chat (Marketing · MVP, #407)
--
-- Igual que el conceptualizador (su db/003): si el motor principal de un producto no
-- late, o un trabajo lleva esperando más de `espera_respaldo_segundos`, el workflow
-- chat/respaldo dispara la rutina de ese producto con SOLO el id del trabajo. La
-- rutina lo toma con chat/motor como cualquier motor (lease y candado por sesión).
--
-- Aditiva: tres columnas nuevas en chat.trabajo, dos claves de config y una función.
-- No toca filas existentes ni otros esquemas.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE chat.trabajo ADD COLUMN IF NOT EXISTS respaldo_disparado_at timestamptz;
ALTER TABLE chat.trabajo ADD COLUMN IF NOT EXISTS respaldo_disparos     int NOT NULL DEFAULT 0;
ALTER TABLE chat.trabajo ADD COLUMN IF NOT EXISTS respaldo_resultado    text;

INSERT INTO chat.config (producto, clave, valor) VALUES
  ('marketing', 'espera_respaldo_segundos',    '180'),   -- con el principal vivo, el respaldo solo entra si nadie tomó en 3 min
  ('marketing', 'reintento_respaldo_segundos', '600')    -- un disparo sin resultado se repite a los 10 min
ON CONFLICT (producto, clave) DO NOTHING;

-- req: { producto, modo: 'buscar' | 'resultado', trabajo_id?, ok?, detalle? }
-- Un producto sin rutina configurada simplemente no se busca: el workflow manda el producto.
CREATE OR REPLACE FUNCTION chat.api_respaldo(req jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = chat, public AS $resp$
DECLARE prod text := req->>'producto'; v_vivo boolean; v_ids jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM chat.producto WHERE clave = prod) THEN RETURN chat.err('PRODUCTO_DESCONOCIDO'); END IF;
  v_vivo := (chat.estado_motor(prod)->>'vivo')::boolean;
  IF coalesce(req->>'modo', 'buscar') = 'buscar' THEN
    WITH elegidos AS (
      SELECT t.id FROM chat.trabajo t
       WHERE t.producto = prod AND t.estado = 'pendiente'
         AND t.intentos < chat.cfg(prod, 'max_intentos')
         -- una sesión a la vez: ni uno con otro vivo, ni uno que se brinque a uno anterior
         AND NOT EXISTS (SELECT 1 FROM chat.trabajo o WHERE o.sesion_id = t.sesion_id AND o.id <> t.id AND o.estado = 'tomado' AND o.lease_hasta >= now())
         AND NOT EXISTS (SELECT 1 FROM chat.trabajo o WHERE o.sesion_id = t.sesion_id AND o.id < t.id AND o.estado = 'pendiente')
         AND (NOT v_vivo OR t.created_at < now() - make_interval(secs => chat.cfg(prod, 'espera_respaldo_segundos')))
         AND (t.respaldo_disparado_at IS NULL OR t.respaldo_disparado_at < now() - make_interval(secs => chat.cfg(prod, 'reintento_respaldo_segundos')))
       ORDER BY t.id LIMIT 5
       FOR UPDATE SKIP LOCKED),
    marcados AS (
      UPDATE chat.trabajo t SET respaldo_disparado_at = now(), respaldo_disparos = respaldo_disparos + 1
        FROM elegidos e WHERE t.id = e.id RETURNING t.id)
    SELECT coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_ids FROM marcados;
    RETURN jsonb_build_object('ok', true, 'principal_vivo', v_vivo, 'disparar', v_ids);
  ELSIF req->>'modo' = 'resultado' THEN
    -- 429 (límite de 30 por hora de la rutina) o cualquier falla: se libera para el siguiente ciclo.
    UPDATE chat.trabajo SET respaldo_resultado = left(coalesce(req->>'detalle', ''), 300),
           respaldo_disparado_at = CASE WHEN (req->>'ok')::boolean THEN respaldo_disparado_at ELSE NULL END
     WHERE id = nullif(req->>'trabajo_id', '')::bigint AND producto = prod;
    RETURN jsonb_build_object('ok', true);
  END IF;
  RETURN chat.err('MODO_DESCONOCIDO');
END
$resp$;
ALTER FUNCTION chat.api_respaldo(jsonb) OWNER TO chat_app;
REVOKE ALL ON FUNCTION chat.api_respaldo(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION chat.api_respaldo(jsonb) TO CURRENT_USER;

-- ── El avance renueva el arrendamiento ──────────────────────────────────────
-- Una lista de 10 fichas tarda más que `lease_segundos`. Mientras el motor siga publicando
-- su paso (api_motor modo `avance`), el trabajo no se vence ni se lo lleva el respaldo.
CREATE OR REPLACE FUNCTION chat.renovar_lease() RETURNS trigger
LANGUAGE plpgsql AS $ren$
BEGIN
  IF NEW.estado = 'tomado' AND NEW.paso_at IS DISTINCT FROM OLD.paso_at THEN
    NEW.lease_hasta := greatest(coalesce(NEW.lease_hasta, now()), now() + make_interval(secs => chat.cfg(NEW.producto, 'lease_segundos')));
  END IF;
  RETURN NEW;
END
$ren$;
ALTER FUNCTION chat.renovar_lease() OWNER TO chat_app;
DROP TRIGGER IF EXISTS trabajo_renovar_lease ON chat.trabajo;
CREATE TRIGGER trabajo_renovar_lease BEFORE UPDATE OF paso_at ON chat.trabajo
  FOR EACH ROW EXECUTE FUNCTION chat.renovar_lease();
