-- ═══════════════════════════════════════════════════════════════════════════
-- memoria_0002_vinculos_bandeja.sql · F7 (#328)
-- Vínculos genéricos (ligar tarde y hacia atrás), bandeja de grupos,
-- detección de tipo por nombre (espejo SQL de la del receptor) y las
-- primeras vistas del contrato con otros módulos.
-- Idempotente. Sin dólar-dólar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Vínculos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memoria.vinculo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen_tipo   text NOT NULL,
  origen_id     text NOT NULL,
  destino_tipo  text NOT NULL,
  destino_id    text NOT NULL,
  relacion      text NOT NULL,
  confianza     numeric(4,3) NOT NULL DEFAULT 1,
  metodo        text NOT NULL,
  vigente_desde timestamptz NULL,
  retracta_a    uuid NULL REFERENCES memoria.vinculo(id),
  creado_por    text NOT NULL DEFAULT current_user,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vinculo_confianza_ck CHECK (confianza BETWEEN 0 AND 1),
  CONSTRAINT vinculo_relacion_ck CHECK (relacion IN
    ('pertenece_a','evidencia_de','menciona','deriva_de','duplicado_de','respalda','retracta')),
  CONSTRAINT vinculo_retracta_ck CHECK ((relacion = 'retracta') = (retracta_a IS NOT NULL))
);
COMMENT ON TABLE memoria.vinculo IS
  'Sólo inserción. Deshacer un vínculo = insertar otro con relacion=retracta y retracta_a. Referencias a Odoo son texto (odoo:sale.order / 11771), nunca llave foránea.';
CREATE INDEX IF NOT EXISTS vinculo_origen_idx  ON memoria.vinculo (origen_tipo, origen_id);
CREATE INDEX IF NOT EXISTS vinculo_destino_idx ON memoria.vinculo (destino_tipo, destino_id);
CREATE INDEX IF NOT EXISTS vinculo_retracta_idx ON memoria.vinculo (retracta_a) WHERE retracta_a IS NOT NULL;

DROP TRIGGER IF EXISTS vinculo_solo_insert ON memoria.vinculo;
CREATE TRIGGER vinculo_solo_insert BEFORE UPDATE OR DELETE ON memoria.vinculo
  FOR EACH ROW EXECUTE FUNCTION memoria.prohibir_cambio();

CREATE OR REPLACE VIEW memoria.vinculo_vigente AS
  SELECT v.* FROM memoria.vinculo v
  WHERE v.relacion <> 'retracta'
    AND NOT EXISTS (SELECT 1 FROM memoria.vinculo r WHERE r.retracta_a = v.id);

-- Eventos por SO: directos + por canal ligado (hacia atrás si vigente_desde es NULL).
CREATE OR REPLACE VIEW memoria.v_evento_so AS
  SELECT e.seq, e.id AS evento_id, e.ocurrido_en, e.tipo, e.canal_id, v.destino_id AS odoo_so, 'canal'::text AS via, v.confianza
    FROM memoria.evento e
    JOIN memoria.vinculo_vigente v
      ON v.origen_tipo = 'canal' AND v.origen_id = e.canal_id::text
     AND v.destino_tipo = 'odoo:sale.order' AND v.relacion = 'pertenece_a'
     AND (v.vigente_desde IS NULL OR e.ocurrido_en >= v.vigente_desde)
  UNION ALL
  SELECT e.seq, e.id, e.ocurrido_en, e.tipo, e.canal_id, v.destino_id, 'directo', v.confianza
    FROM memoria.evento e
    JOIN memoria.vinculo_vigente v
      ON v.origen_tipo = 'evento' AND v.origen_id = e.id::text
     AND v.destino_tipo = 'odoo:sale.order';

-- ── Detección de tipo por nombre (espejo de whatsapp/receptor/index.ts) ────
CREATE OR REPLACE FUNCTION memoria.detectar_tipo_canal(nombre text, OUT tipo text, OUT regla text, OUT so text)
LANGUAGE plpgsql IMMUTABLE AS $det$
DECLARE n text := lower(translate(coalesce(nombre, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
BEGIN
  so := substring(n from '\mso\s?-?(\d{4,5})\M');
  IF so IS NOT NULL THEN tipo := 'proyecto'; regla := 'nombre:SO####'; so := 'SO' || so; RETURN; END IF;
  IF n ~ '\m(levantamiento|lev|visita|oportunidad|cotizacion)\M' THEN tipo := 'levantamiento'; regla := 'nombre:levantamiento'; RETURN; END IF;
  IF n ~ '\m(compras?|tickets?|gastos?|facturas?)\M' THEN tipo := 'compras'; regla := 'nombre:compras'; RETURN; END IF;
  IF n ~ '\m(materiales?|requis?|requisiciones?|almacen)\M' THEN tipo := 'materiales'; regla := 'nombre:materiales'; RETURN; END IF;
  tipo := 'sin_asignar'; regla := NULL;
END
$det$;

-- Propone el vínculo canal → SO cuando el nombre trae SO####. La propuesta es
-- un vínculo con método regla_nombre y confianza 0.8; la confirmación humana
-- inserta otro con método humano y confianza 1. Idempotente.
CREATE OR REPLACE FUNCTION memoria.vincular_canal_por_nombre(p_canal uuid)
RETURNS uuid LANGUAGE plpgsql AS $vin$
DECLARE c memoria.canal; d record; ya uuid; nuevo uuid;
BEGIN
  SELECT * INTO c FROM memoria.canal WHERE id = p_canal;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO d FROM memoria.detectar_tipo_canal(c.nombre_actual);
  IF d.so IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO ya FROM memoria.vinculo_vigente
   WHERE origen_tipo = 'canal' AND origen_id = p_canal::text
     AND destino_tipo = 'odoo:sale.order' AND destino_id = d.so;
  IF ya IS NOT NULL THEN RETURN ya; END IF;
  INSERT INTO memoria.vinculo (origen_tipo, origen_id, destino_tipo, destino_id, relacion, confianza, metodo, vigente_desde)
  VALUES ('canal', p_canal::text, 'odoo:sale.order', d.so, 'pertenece_a', 0.8, 'regla_nombre', NULL)
  RETURNING id INTO nuevo;
  RETURN nuevo;
END
$vin$;

-- Decisión humana sobre un canal (bandeja). Deja actor en el historial.
CREATE OR REPLACE FUNCTION memoria.canal_decidir(p_canal uuid, p_tipo text, p_estado text, p_actor text)
RETURNS memoria.canal LANGUAGE plpgsql AS $dec$
DECLARE r memoria.canal;
BEGIN
  IF coalesce(btrim(p_actor), '') = '' THEN RAISE EXCEPTION 'canal_decidir: actor obligatorio'; END IF;
  PERFORM set_config('memoria.actor', p_actor, true);
  UPDATE memoria.canal
     SET tipo_confirmado = coalesce(p_tipo, tipo_confirmado),
         estado_captura  = coalesce(p_estado, estado_captura)
   WHERE id = p_canal RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'canal_decidir: canal % no existe', p_canal; END IF;
  RETURN r;
END
$dec$;

-- ── Bandeja de grupos ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW memoria.v_canales_bandeja AS
  SELECT c.id, c.fuente, c.nombre_actual, c.tipo_detectado, c.tipo_confirmado, c.regla_deteccion,
         c.estado_captura, c.es_prueba, c.primera_vez, c.ultimo_evento,
         (SELECT d.so FROM memoria.detectar_tipo_canal(c.nombre_actual) d) AS so_en_nombre,
         (SELECT string_agg(v.destino_tipo || ':' || v.destino_id || '(' || v.metodo || ')', ', ')
            FROM memoria.vinculo_vigente v WHERE v.origen_tipo = 'canal' AND v.origen_id = c.id::text) AS vinculos,
         CASE
           WHEN c.estado_captura = 'pendiente' THEN 'por_aprobar'
           WHEN c.tipo_confirmado IS NULL THEN 'tipo_sin_confirmar'
           WHEN coalesce(c.tipo_confirmado, c.tipo_detectado) IN ('proyecto','levantamiento')
                AND NOT EXISTS (SELECT 1 FROM memoria.vinculo_vigente v
                                 WHERE v.origen_tipo = 'canal' AND v.origen_id = c.id::text
                                   AND v.destino_tipo IN ('odoo:sale.order','odoo:crm.lead')) THEN 'sin_so_ni_lead'
           ELSE 'ok'
         END AS pendiente
    FROM memoria.canal c;

CREATE OR REPLACE VIEW memoria.v_canales_sin_asignar AS
  SELECT * FROM memoria.v_canales_bandeja WHERE pendiente <> 'ok';

-- ── Vista de contrato: eventos sin dato personal ──────────────────────────
CREATE OR REPLACE VIEW memoria.v_evento AS
  SELECT e.seq, e.id AS evento_id, e.ocurrido_en, e.capturado_en, e.fuente, e.tipo,
         e.canal_id, c.nombre_actual AS canal, coalesce(c.tipo_confirmado, c.tipo_detectado) AS tipo_canal, c.es_prueba,
         e.autor_ref, i.odoo_employee_id AS autor_employee_id, i.nombre_mostrado AS autor_nombre,
         e.texto, e.archivo_sha256, e.evento_ref, e.visibilidad
    FROM memoria.evento e
    LEFT JOIN memoria.canal c ON c.id = e.canal_id
    LEFT JOIN memoria.identidad i ON i.autor_ref = e.autor_ref;
COMMENT ON VIEW memoria.v_evento IS
  'Contrato v1. Nunca expone el número de teléfono (identidad.valor_externo). Filtrar es_prueba=false para datos reales.';

-- ── Permisos ──────────────────────────────────────────────────────────────
GRANT SELECT ON memoria.vinculo, memoria.vinculo_vigente, memoria.v_evento_so,
               memoria.v_canales_bandeja, memoria.v_canales_sin_asignar, memoria.v_evento
  TO memoria_motor, memoria_admin;
GRANT INSERT ON memoria.vinculo TO memoria_motor, memoria_admin, memoria_captura;
GRANT SELECT ON memoria.vinculo_vigente TO memoria_captura;
GRANT SELECT ON memoria.v_evento, memoria.v_evento_so TO memoria_lector;
GRANT EXECUTE ON FUNCTION memoria.detectar_tipo_canal(text) TO memoria_captura, memoria_motor, memoria_admin;
GRANT EXECUTE ON FUNCTION memoria.vincular_canal_por_nombre(uuid) TO memoria_motor, memoria_admin;
GRANT EXECUTE ON FUNCTION memoria.canal_decidir(uuid, text, text, text) TO memoria_admin;
