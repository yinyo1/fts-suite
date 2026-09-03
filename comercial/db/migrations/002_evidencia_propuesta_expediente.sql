-- ═══════════════════════════════════════════════════════════════════════════
-- 002_evidencia_propuesta_expediente.sql · las tres tablas de 1.0
-- Issue #140 alcance B · reglas de fundación 3, 4 y 6
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── evidencia ──────────────────────────────────────────────────────────────
-- Lo que alguien dijo o escribió, sin interpretar. La materia prima de la
-- capa de ingesta (ROADMAP §3).
CREATE TABLE IF NOT EXISTS comercial.evidencia (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),   -- regla 3: PK propia
  odoo_lead_id   integer     NULL,        -- REFERENCIA externa, nunca llave. NULL = huérfana.
  fuente         text        NOT NULL,
  fecha          timestamptz NOT NULL,    -- cuándo ocurrió el hecho, no cuándo se capturó
  autor          text        NOT NULL,
  texto_literal  text        NOT NULL,    -- la cita. Sin esto no hay propuesta (ROADMAP §3).
  archivo_url    text        NULL,
  hash           text        NOT NULL,    -- sha256 del texto_literal, para dedupe
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text        NOT NULL,
  updated_at     timestamptz NULL,
  updated_by     text        NULL,
  deleted_at     timestamptz NULL,
  CONSTRAINT evidencia_fuente_ck CHECK (
    fuente IN ('manual','correo','teams','plaud','whatsapp')),
  CONSTRAINT evidencia_texto_no_vacio_ck CHECK (length(btrim(texto_literal)) > 0)
);

COMMENT ON COLUMN comercial.evidencia.odoo_lead_id IS
  'Referencia externa al crm.lead de Odoo. NO es llave foránea: el día que un dominio salga de Odoo, la evidencia no queda huérfana (regla 3).';
COMMENT ON COLUMN comercial.evidencia.texto_literal IS
  'La cita literal. El motor no puede proponer sin ella (ROADMAP §3).';

-- Dedupe: la misma cita no entra dos veces. Parcial, para que el borrado
-- lógico libere el hash.
CREATE UNIQUE INDEX IF NOT EXISTS evidencia_hash_uq
  ON comercial.evidencia (hash) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS evidencia_lead_idx
  ON comercial.evidencia (odoo_lead_id) WHERE deleted_at IS NULL;
-- Las huérfanas son una bandeja de trabajo, no basura: ahí aparecen los leads
-- nuevos (ROADMAP §3). Por eso tienen su propio índice.
CREATE INDEX IF NOT EXISTS evidencia_huerfanas_idx
  ON comercial.evidencia (fecha DESC) WHERE odoo_lead_id IS NULL AND deleted_at IS NULL;

-- ── propuesta ──────────────────────────────────────────────────────────────
-- Lo que el motor sugiere hacer con una evidencia. Nunca se aplica sola.
CREATE TABLE IF NOT EXISTS comercial.propuesta (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_lead_id  integer       NULL,
  evidencia_id  uuid          NOT NULL REFERENCES comercial.evidencia(id),
  accion        text          NOT NULL,
  valor_nuevo   jsonb         NULL,
  confianza     numeric(4,3)  NOT NULL,
  estado        text          NOT NULL DEFAULT 'pendiente',
  resuelto_por  text          NULL,
  resuelto_at   timestamptz   NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  created_by    text          NOT NULL,
  updated_at    timestamptz   NULL,
  updated_by    text          NULL,
  deleted_at    timestamptz   NULL,
  CONSTRAINT propuesta_confianza_ck CHECK (confianza >= 0 AND confianza <= 1),
  CONSTRAINT propuesta_estado_ck CHECK (
    estado IN ('pendiente','aprobada','corregida','rechazada','aplicada')),
  CONSTRAINT propuesta_accion_ck CHECK (accion IN (
    'nuevo_lead','follow_up','cotizacion_enviada','cambio_fecha_cierre','visita',
    'compromiso','cliente_en_revision','perdida')),
  -- Una propuesta resuelta sabe quién y cuándo. Las dos o ninguna.
  CONSTRAINT propuesta_resolucion_completa_ck CHECK (
    (estado = 'pendiente' AND resuelto_por IS NULL AND resuelto_at IS NULL)
    OR (estado <> 'pendiente' AND resuelto_por IS NOT NULL AND resuelto_at IS NOT NULL))
);

COMMENT ON COLUMN comercial.propuesta.evidencia_id IS
  'NOT NULL a propósito: "sin cita literal no hay propuesta" (ROADMAP §3) es una regla del esquema, no del código.';

CREATE INDEX IF NOT EXISTS propuesta_bandeja_idx
  ON comercial.propuesta (created_at DESC)
  WHERE estado = 'pendiente' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS propuesta_lead_idx
  ON comercial.propuesta (odoo_lead_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS propuesta_evidencia_idx
  ON comercial.propuesta (evidencia_id);

-- ── expediente ─────────────────────────────────────────────────────────────
-- SOLO lo que Odoo no sabe modelar (regla 6). Ni cliente, ni monto, ni etapa:
-- eso vive en Odoo y se referencia, no se copia.
CREATE TABLE IF NOT EXISTS comercial.expediente (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_lead_id      integer     NOT NULL,
  planta            text        NULL,   -- sitio concreto del cliente; Odoo solo tiene el partner
  compromiso_texto  text        NULL,   -- qué se prometió, en palabras
  compromiso_fecha  date        NULL,
  compromiso_dueno  text        NULL,   -- valor del selection dndole
  competidor        text        NULL,   -- contra quién se perdió
  perdida_monto     numeric(14,2) NULL, -- por cuánto
  notas_internas    text        NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        text        NOT NULL,
  updated_at        timestamptz NULL,
  updated_by        text        NULL,
  deleted_at        timestamptz NULL,
  -- Un compromiso sin fecha ni dueño no es un compromiso.
  CONSTRAINT expediente_compromiso_ck CHECK (
    compromiso_texto IS NULL
    OR (compromiso_fecha IS NOT NULL AND compromiso_dueno IS NOT NULL))
);

COMMENT ON TABLE comercial.expediente IS
  'Lo que Odoo NO modela. Prohibido espejear partner, monto, etapa u orden: se referencia por odoo_lead_id (regla 6).';

CREATE UNIQUE INDEX IF NOT EXISTS expediente_lead_uq
  ON comercial.expediente (odoo_lead_id) WHERE deleted_at IS NULL;

-- ── Triggers de auditoría (regla 4) ──
DROP TRIGGER IF EXISTS evidencia_touch ON comercial.evidencia;
CREATE TRIGGER evidencia_touch BEFORE UPDATE ON comercial.evidencia
  FOR EACH ROW EXECUTE FUNCTION comercial.touch_updated_at();
DROP TRIGGER IF EXISTS propuesta_touch ON comercial.propuesta;
CREATE TRIGGER propuesta_touch BEFORE UPDATE ON comercial.propuesta
  FOR EACH ROW EXECUTE FUNCTION comercial.touch_updated_at();
DROP TRIGGER IF EXISTS expediente_touch ON comercial.expediente;
CREATE TRIGGER expediente_touch BEFORE UPDATE ON comercial.expediente
  FOR EACH ROW EXECUTE FUNCTION comercial.touch_updated_at();

-- ── Permisos explícitos sobre lo ya creado (regla 5) ──
-- ALTER DEFAULT PRIVILEGES de 001 solo aplica a tablas FUTURAS.
GRANT SELECT, INSERT, UPDATE ON comercial.evidencia  TO comercial_app;
GRANT SELECT, INSERT, UPDATE ON comercial.propuesta  TO comercial_app;
GRANT SELECT, INSERT, UPDATE ON comercial.expediente TO comercial_app;
-- Sin DELETE. Ver 001.

-- El renglon de public.schema_migrations lo inserta el runner, con el sha256
-- REAL del archivo. Un archivo no puede contener su propio hash, y un
-- checksum inventado es peor que no tenerlo.
