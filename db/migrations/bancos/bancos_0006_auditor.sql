-- ═══════════════════════════════════════════════════════════════════════════
-- bancos_0006 · auditor por encima del sistema (issue "fts-bancos: auditor IA", enlazado a #331)
--
-- El auditor es una sesión de Claude Code que lee, juzga y reporta. NO entra al ciclo
-- diario, NO toca datos bancarios, NO manda correos a Gerardo ni a Erick. Aquí sólo:
--   1. rol bancos_auditor (NOLOGIN, se usa con SET ROLE): LEE lo necesario para las tres
--      patas y ESCRIBE únicamente en bancos.auditorias*.
--   2. auditorias_pendientes  cola de disparos por evento. El servicio (bancos_app) sólo
--                             puede INSERTAR; el auditor la lee y la cierra.
--   3. auditorias             una fila por auditoría: tipo, veredicto y conteos SIN datos
--                             bancarios (es lo que se publica en el issue).
--   4. auditorias_informe     el detalle privado por estado y pata (archivo, página,
--                             renglón, montos). Sólo el auditor y la cuenta de administración.
--
-- Reglas: nada se borra (sin DELETE ni TRUNCATE para ningún rol), etiquetas de dólar con
-- nombre, sin datos bancarios en el archivo (repo público), ningún signo de pesos seguido
-- de comilla, acento grave, ampersand, dígito o '<' (§20 #10).
-- OJO: bancos_0001 dejó ALTER DEFAULT PRIVILEGES (SELECT, INSERT a bancos_app en toda
-- tabla nueva). Por eso aquí se REVOCA todo primero y se concede sólo lo que va.
-- ═══════════════════════════════════════════════════════════════════════════

DO $rol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bancos_auditor') THEN
    CREATE ROLE bancos_auditor NOLOGIN;
  END IF;
END
$rol$;
GRANT USAGE ON SCHEMA bancos TO bancos_auditor;

-- ── 1. cola de disparos por evento ──
CREATE TABLE IF NOT EXISTS bancos.auditorias_pendientes (
  id          bigserial   PRIMARY KEY,
  motivo      text        NOT NULL CHECK (motivo IN ('lote_buzon','mes_completo','corrida_fallida','archivo_rechazado',
                                                     'descuadre','correo_fuera_de_lo_esperado','manual')),
  clave       text        NOT NULL UNIQUE,          -- idempotencia: el mismo evento no se encola dos veces
  corrida_id  bigint      REFERENCES bancos.corridas(id),
  archivo_id  bigint      REFERENCES bancos.archivos(id),
  periodo     char(7),
  detalle     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  tomada_en   timestamptz,
  cerrada_en  timestamptz,
  veredicto   text        CHECK (veredicto IN ('VERDE','AMARILLO','ROJO')),
  auditoria_id bigint
);
CREATE INDEX IF NOT EXISTS auditorias_pendientes_abiertas ON bancos.auditorias_pendientes (creada_en) WHERE cerrada_en IS NULL;

-- ── 2. auditorías (lo publicable: veredicto y conteos, sin datos bancarios) ──
CREATE TABLE IF NOT EXISTS bancos.auditorias (
  id            bigserial   PRIMARY KEY,
  tipo          text        NOT NULL CHECK (tipo IN ('evento','barrido_diario','barrido_mensual','salud','prueba')),
  objetivo      integer     NOT NULL DEFAULT 1,
  iniciada_en   timestamptz NOT NULL DEFAULT now(),
  terminada_en  timestamptz,
  veredicto     text        CHECK (veredicto IN ('VERDE','AMARILLO','ROJO')),
  n_estados     integer,
  n_movimientos integer,
  conteos       jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- por pata y por código, sólo números
  salud         jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- sección E, sólo banderas y números
  auditor_version text      NOT NULL,
  sesion        text,                                        -- sesión de Claude Code que la hizo
  execution_id  text,                                        -- ejecución de n8n que la registró
  informe_html  text,                                        -- el informe privado completo
  onedrive_ruta text,
  correo_status integer,                                     -- 202 = Graph aceptó el correo a Esteban
  correo_at     timestamptz
);

-- ── 3. informe privado por estado y pata ──
CREATE TABLE IF NOT EXISTS bancos.auditorias_informe (
  id            bigserial   PRIMARY KEY,
  auditoria_id  bigint      NOT NULL REFERENCES bancos.auditorias(id),
  estado_id     bigint      REFERENCES bancos.estados(id),
  archivo_id    bigint      REFERENCES bancos.archivos(id),
  pata          integer     NOT NULL CHECK (pata IN (1,2,3,5)),   -- 5 = salud del sistema (sección E)
  resultado     text        NOT NULL CHECK (resultado IN ('VERDE','AMARILLO','ROJO','NO_APLICA')),
  codigo        text        NOT NULL,
  evidencia     jsonb       NOT NULL DEFAULT '{}'::jsonb,        -- archivo, página, renglón, montos: PRIVADO
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auditorias_informe_aud ON bancos.auditorias_informe (auditoria_id);

COMMENT ON TABLE bancos.auditorias_pendientes IS 'Cola de auditorías por evento. bancos_app sólo INSERTA (ON CONFLICT DO NOTHING por clave); el auditor la toma y la cierra con veredicto.';
COMMENT ON TABLE bancos.auditorias IS 'Una fila por auditoría. conteos/salud son sólo números y banderas (publicables); informe_html es PRIVADO.';
COMMENT ON TABLE bancos.auditorias_informe IS 'PRIVADO. Evidencia por estado y pata (archivo, página, renglón, montos). Sin acceso para bancos_app ni bancos_lector.';

-- ── 4. permisos ──
REVOKE ALL ON bancos.auditorias_pendientes, bancos.auditorias, bancos.auditorias_informe FROM PUBLIC, bancos_app, bancos_lector;
REVOKE ALL ON SEQUENCE bancos.auditorias_pendientes_id_seq, bancos.auditorias_id_seq, bancos.auditorias_informe_id_seq FROM PUBLIC, bancos_app, bancos_lector;

-- el servicio / n8n como bancos_app: sólo insertar en la cola
GRANT INSERT ON bancos.auditorias_pendientes TO bancos_app;
GRANT USAGE ON SEQUENCE bancos.auditorias_pendientes_id_seq TO bancos_app;

-- el auditor: lee lo necesario para las tres patas y la salud (nunca blobs.contenido)
GRANT SELECT ON bancos.cuentas, bancos.corridas, bancos.corrida_eventos, bancos.archivos, bancos.avistamientos,
                bancos.estados, bancos.estados_vigentes, bancos.validaciones_v3, bancos.duplicados_logicos,
                bancos.movimientos, bancos.huecos, bancos.correos, bancos.parametros, bancos.dias_inhabiles,
                bancos.fuentes_solicitud, bancos.revisiones_manuales TO bancos_auditor;
GRANT SELECT (sha256, bytes, creado_at) ON bancos.blobs TO bancos_auditor;
GRANT EXECUTE ON FUNCTION bancos.hoy_mty(), bancos.es_dia_habil(date), bancos.dias_habiles(date, date),
                          bancos.primer_dia_habil(char), bancos.f_faltantes(date) TO bancos_auditor;
-- y escribe sólo en lo suyo, sin borrar
GRANT SELECT, INSERT ON bancos.auditorias_pendientes, bancos.auditorias, bancos.auditorias_informe TO bancos_auditor;
GRANT UPDATE (tomada_en, cerrada_en, veredicto, auditoria_id) ON bancos.auditorias_pendientes TO bancos_auditor;
GRANT UPDATE (terminada_en, veredicto, n_estados, n_movimientos, conteos, salud, execution_id, informe_html,
              onedrive_ruta, correo_status, correo_at) ON bancos.auditorias TO bancos_auditor;
GRANT USAGE, SELECT ON SEQUENCE bancos.auditorias_pendientes_id_seq, bancos.auditorias_id_seq,
                                bancos.auditorias_informe_id_seq TO bancos_auditor;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA bancos FROM bancos_app, bancos_lector, bancos_auditor;
