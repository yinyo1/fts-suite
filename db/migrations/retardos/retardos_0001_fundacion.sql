-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0001 · fundación del esquema `retardos` (Retardos v2, issue #334)
--
-- Ciclo cerrado de retardos: detectar → notificar → exigir hoja firmada →
-- validar (RH) → acción → verificar → escalar. Odoo es registro; la lógica
-- vive aquí y en n8n. Cero código custom en Odoo.
--
-- Numeración POR MÓDULO (retardos_0001, retardos_0002…): la aplica el runner
-- `retardos/db-migrate`, no `comercial/db-migrate`.
--
-- Reglas de este esquema:
--   1. SIN DATOS PERSONALES en este archivo: el repo es público. La semilla
--      sólo trae configuración (umbrales, textos, banderas).
--   2. Nada se borra. El rol de aplicación no tiene DELETE ni TRUNCATE.
--   3. La bitácora es inmutable: un trigger rechaza UPDATE y DELETE.
--   4. Idempotencia por llaves únicas: un retardo = una (persona, fecha);
--      un caso = una (persona, periodo, nivel); un correo = una clave_dedupe.
--   5. Configuración en tablas, nunca en nodos de n8n.
--   6. Etiquetas de dólar CON NOMBRE ($fn$, $trg$…), nunca dos signos de
--      dólar juntos (db/README.md regla 4).
--   7. NUNCA dos llaves juntas en el .sql: el nodo Postgres de n8n evalúa como
--      expresión cualquier par de llaves dentro del query, aunque venga de un
--      dato. Medido el 28-sep-2026 al aplicar esta migración: los marcadores
--      de plantilla con llaves rompieron el SQL. Por eso los marcadores son [[x]].
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS retardos;
COMMENT ON SCHEMA retardos IS
  'Retardos v2 (#334): detección, casos con folio, evidencia firmada, verificación y latido. Odoo es registro; la lógica vive aquí y en n8n.';

-- ── Rol de aplicación ──────────────────────────────────────────────────────
DO $rol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'retardos_app') THEN
    CREATE ROLE retardos_app NOLOGIN;
  END IF;
END
$rol$;
GRANT USAGE ON SCHEMA retardos TO retardos_app;

-- ══ CONFIGURACIÓN ═════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS retardos.config (
  clave            text        PRIMARY KEY,
  valor            jsonb       NOT NULL,
  descripcion      text        NOT NULL,
  confirmado       boolean     NOT NULL DEFAULT false,
  actualizado_por  text        NOT NULL DEFAULT 'semilla',
  actualizado_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE retardos.config IS 'Toda la configuración del módulo. confirmado=false marca los valores por defecto que Esteban/RH aún no validan.';

-- Escalera de consecuencias. Umbral = retardos contados en el periodo.
CREATE TABLE IF NOT EXISTS retardos.escalera (
  nivel             smallint    PRIMARY KEY CHECK (nivel BETWEEN 1 AND 9),
  accion            text        NOT NULL CHECK (accion IN ('aviso','carta_compromiso','acta','suspension')),
  nombre            text        NOT NULL,
  umbral            smallint    NOT NULL CHECK (umbral >= 1),
  requiere_firma    boolean     NOT NULL,
  requiere_testigos boolean     NOT NULL DEFAULT false,
  dias_plazo_firma  smallint    NOT NULL DEFAULT 3,
  dias_suspension   smallint    CHECK (dias_suspension IS NULL OR dias_suspension BETWEEN 1 AND 8),
  origen            text        NOT NULL CHECK (origen IN ('recuperado','propuesto')),
  confirmado        boolean     NOT NULL DEFAULT false,
  activo            boolean     NOT NULL DEFAULT true,
  nota              text
);
COMMENT ON TABLE retardos.escalera IS 'Niveles de la escalera. La suspensión máxima es 8 días (LFT art. 423 fr. X) y siempre la decide RH: el sistema sólo la propone y la verifica.';

-- Exclusiones por persona y rango: USA, campo, permisos, incapacidad…
CREATE TABLE IF NOT EXISTS retardos.exclusion (
  id           bigserial   PRIMARY KEY,
  employee_id  integer     NOT NULL,
  desde        date        NOT NULL,
  hasta        date        NOT NULL,
  tipo         text        NOT NULL CHECK (tipo IN ('usa','campo','permiso','vacaciones','incapacidad','horario_especial','no_aplica','otro')),
  motivo       text        NOT NULL CHECK (char_length(motivo) >= 3),
  activo       boolean     NOT NULL DEFAULT true,
  creado_por   text        NOT NULL,
  creado_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (hasta >= desde)
);
CREATE INDEX IF NOT EXISTS exclusion_emp ON retardos.exclusion (employee_id, desde, hasta) WHERE activo;

CREATE TABLE IF NOT EXISTS retardos.festivo (
  fecha      date        PRIMARY KEY,
  nombre     text        NOT NULL,
  creado_por text        NOT NULL DEFAULT 'semilla',
  creado_at  timestamptz NOT NULL DEFAULT now()
);

-- ══ ESPEJO DE ODOO (sólo lo necesario para decidir) ═══════════════════════
CREATE TABLE IF NOT EXISTS retardos.empleado (
  employee_id     integer     PRIMARY KEY,
  nombre          text,                -- dato personal: vive sólo en la base privada, nunca en el repo
  puesto          text,
  company_id      integer,
  activo          boolean     NOT NULL,
  hora_entrada    numeric(5,2),
  hora_calendario numeric(5,2),
  email           text,
  email_valido    boolean     NOT NULL DEFAULT false,
  parent_id       integer,
  departamento    text,
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE retardos.empleado IS 'Fotografía del padrón que manda detectar en cada corrida. No es fuente de verdad: Odoo lo es.';

CREATE TABLE IF NOT EXISTS retardos.checada (
  attendance_id   integer     PRIMARY KEY,
  employee_id     integer     NOT NULL,
  fecha           date        NOT NULL,           -- día local (America/Monterrey)
  hora_local      numeric(6,4) NOT NULL,          -- horas decimales locales
  check_in_utc    timestamptz NOT NULL,
  disputa         boolean     NOT NULL DEFAULT false,
  olvido_entrada  boolean     NOT NULL DEFAULT false,
  visto_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checada_emp_fecha ON retardos.checada (employee_id, fecha);

-- ══ CORRIDAS (latido) ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS retardos.corrida (
  id            bigserial   PRIMARY KEY,
  workflow      text        NOT NULL,
  iniciada_at   timestamptz NOT NULL DEFAULT now(),
  terminada_at  timestamptz,
  ok            boolean,
  leidos        integer     NOT NULL DEFAULT 0,
  resumen       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error         text
);
CREATE INDEX IF NOT EXISTS corrida_wf ON retardos.corrida (workflow, iniciada_at DESC);

-- ══ RETARDOS Y CASOS ══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS retardos.retardo (
  id              bigserial   PRIMARY KEY,
  employee_id     integer     NOT NULL,
  fecha           date        NOT NULL,
  attendance_id   integer     NOT NULL,
  hora_local      numeric(6,4) NOT NULL,
  hora_esperada   numeric(5,2) NOT NULL,
  tolerancia_min  smallint    NOT NULL,
  minutos_tarde   integer     NOT NULL,
  estado          text        NOT NULL CHECK (estado IN ('contado','excluido','anulado')),
  motivo          text,
  periodo         text        NOT NULL,           -- 'AAAA-MM'
  corrida_id      bigint      REFERENCES retardos.corrida(id),
  creado_at       timestamptz NOT NULL DEFAULT now(),
  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, fecha)
);
CREATE INDEX IF NOT EXISTS retardo_periodo ON retardos.retardo (employee_id, periodo) WHERE estado = 'contado';

CREATE TABLE IF NOT EXISTS retardos.folio_seq (
  anio   integer PRIMARY KEY,
  ultimo integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS retardos.caso (
  id               bigserial   PRIMARY KEY,
  folio            text        NOT NULL UNIQUE CHECK (folio ~ '^RET-[0-9]{4}-[0-9]{4}$'),
  employee_id      integer     NOT NULL,
  periodo          text        NOT NULL,
  nivel            smallint    NOT NULL REFERENCES retardos.escalera(nivel),
  accion           text        NOT NULL,
  motivo_apertura  text        NOT NULL CHECK (motivo_apertura IN ('umbral','reincidencia')),
  estado           text        NOT NULL CHECK (estado IN (
                     'DETECTADO','NOTIFICADO','ESPERANDO_FIRMA','FIRMA_RECIBIDA','VALIDADO_RH',
                     'ACCION_PROGRAMADA','ACCION_VERIFICADA','CERRADO',
                     'VENCIDO','ESCALADO','SE_NEGO_A_FIRMAR','IMPUGNADO','CANCELADO_POR_RH')),
  requiere_firma   boolean     NOT NULL,
  ruta             text        NOT NULL DEFAULT 'correo' CHECK (ruta IN ('correo','supervisor')),
  vence_at         timestamptz,
  recordatorios    smallint    NOT NULL DEFAULT 0,
  retardos_n       smallint    NOT NULL,
  accion_desde     date,
  accion_hasta     date,
  modo_al_abrir    text        NOT NULL CHECK (modo_al_abrir IN ('sombra','real')),
  validado_at      timestamptz,
  validado_por     text,
  abierto_at       timestamptz NOT NULL DEFAULT now(),
  actualizado_at   timestamptz NOT NULL DEFAULT now(),
  cerrado_at       timestamptz,
  UNIQUE (employee_id, periodo, nivel)
);
CREATE INDEX IF NOT EXISTS caso_estado ON retardos.caso (estado);

CREATE TABLE IF NOT EXISTS retardos.caso_retardo (
  caso_id    bigint NOT NULL REFERENCES retardos.caso(id),
  retardo_id bigint NOT NULL REFERENCES retardos.retardo(id),
  PRIMARY KEY (caso_id, retardo_id)
);

-- Transiciones permitidas de la máquina de estados.
CREATE TABLE IF NOT EXISTS retardos.transicion_valida (
  de  text NOT NULL,
  a   text NOT NULL,
  PRIMARY KEY (de, a)
);

-- ══ BITÁCORA INMUTABLE ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS retardos.bitacora (
  id         bigserial   PRIMARY KEY,
  caso_id    bigint      REFERENCES retardos.caso(id),
  evento     text        NOT NULL,
  de         text,
  a          text,
  actor      text        NOT NULL,
  motivo     text,
  evidencia  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  creado_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bitacora_caso ON retardos.bitacora (caso_id, id);

CREATE OR REPLACE FUNCTION retardos.bitacora_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $trg$
BEGIN
  RAISE EXCEPTION 'retardos.bitacora es inmutable: % no permitido', TG_OP;
END
$trg$;
DROP TRIGGER IF EXISTS bitacora_no_update ON retardos.bitacora;
CREATE TRIGGER bitacora_no_update BEFORE UPDATE OR DELETE ON retardos.bitacora
  FOR EACH ROW EXECUTE FUNCTION retardos.bitacora_inmutable();
DROP TRIGGER IF EXISTS bitacora_no_truncate ON retardos.bitacora;
CREATE TRIGGER bitacora_no_truncate BEFORE TRUNCATE ON retardos.bitacora
  FOR EACH STATEMENT EXECUTE FUNCTION retardos.bitacora_inmutable();

-- ══ EVIDENCIA Y CORREO ENTRANTE ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS retardos.evidencia (
  id            bigserial   PRIMARY KEY,
  caso_id       bigint      NOT NULL REFERENCES retardos.caso(id),
  sha256        text        NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  nombre        text        NOT NULL,
  mime          text        NOT NULL,
  bytes         integer     NOT NULL,
  contenido     bytea,                -- mientras no exista bucket (pendiente de clic)
  bucket_ruta   text,                 -- cuando exista bucket
  origen        text        NOT NULL CHECK (origen IN ('correo','panel')),
  tipo          text        NOT NULL DEFAULT 'hoja_firmada' CHECK (tipo IN ('hoja_firmada','negativa_testigos','impugnacion','comprobante_accion','otro')),
  remitente     text,
  message_id    text,
  subido_por    text,
  creado_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (caso_id, sha256)
);

CREATE TABLE IF NOT EXISTS retardos.correo_entrante (
  message_id      text        PRIMARY KEY,
  recibido_at     timestamptz NOT NULL,
  remitente       text        NOT NULL,
  asunto          text        NOT NULL,
  folio           text,
  caso_id         bigint      REFERENCES retardos.caso(id),
  adjuntos        smallint    NOT NULL DEFAULT 0,
  clasificacion   text        NOT NULL CHECK (clasificacion IN (
                    'ok','sin_folio','folio_inexistente','remitente_distinto','sin_adjunto',
                    'adjunto_invalido','caso_cerrado','duplicado')),
  procesado_at    timestamptz NOT NULL DEFAULT now()
);

-- ══ OUTBOX (correos y notas a Odoo) ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS retardos.envio (
  id                bigserial   PRIMARY KEY,
  clave_dedupe      text        NOT NULL UNIQUE,
  caso_id           bigint      REFERENCES retardos.caso(id),
  tipo              text        NOT NULL CHECK (tipo IN (
                      'notificacion','recordatorio','escalamiento','pide_hoja','aviso_rh',
                      'revision_rh','ruta_supervisor','resumen','alerta','odoo_nota')),
  para              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  cc                jsonb       NOT NULL DEFAULT '[]'::jsonb,
  asunto            text        NOT NULL,
  cuerpo_html       text        NOT NULL,
  pdf               text        CHECK (pdf IS NULL OR pdf IN ('aviso','carta_compromiso','acta','suspension')),
  estado            text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviado','fallido','omitido')),
  intentos          smallint    NOT NULL DEFAULT 0,
  modo_envio        text,
  para_efectivo     jsonb,
  enviado_at        timestamptz,
  error             text,
  creado_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS envio_pend ON retardos.envio (estado, creado_at) WHERE estado IN ('pendiente','fallido');

-- ══ ANTI-REPLAY del webhook del panel (#123) ═════════════════════════════
CREATE TABLE IF NOT EXISTS retardos.nonce (
  nonce     text        PRIMARY KEY CHECK (nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  actor     text        NOT NULL,
  accion    text,
  creado_at timestamptz NOT NULL DEFAULT now()
);

-- ══ PLANTILLAS DE CORREO (editables sin tocar n8n) ═══════════════════════
CREATE TABLE IF NOT EXISTS retardos.plantilla (
  clave           text        PRIMARY KEY,
  asunto          text        NOT NULL,
  cuerpo_html     text        NOT NULL,
  actualizado_por text        NOT NULL DEFAULT 'semilla',
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE retardos.plantilla IS 'Textos de los correos con marcadores [[folio]], [[nombre]], [[detalle]]… Sin guiones largos.';

-- ══ PERMISOS ══════════════════════════════════════════════════════════════
GRANT SELECT ON ALL TABLES IN SCHEMA retardos TO retardos_app;
GRANT INSERT, UPDATE ON retardos.empleado, retardos.checada, retardos.corrida, retardos.retardo,
  retardos.folio_seq, retardos.caso, retardos.caso_retardo, retardos.evidencia,
  retardos.correo_entrante, retardos.envio, retardos.exclusion, retardos.festivo, retardos.nonce TO retardos_app;
GRANT INSERT ON retardos.bitacora TO retardos_app;
GRANT UPDATE ON retardos.config, retardos.escalera, retardos.plantilla TO retardos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA retardos TO retardos_app;

-- ══ SEMILLA DE CONFIGURACIÓN (sin datos personales) ═══════════════════════
INSERT INTO retardos.config (clave, valor, descripcion, confirmado) VALUES
 ('modo',                 '"sombra"', 'sombra: todo correo va a sombra_destinatarios con [SOMBRA] en el asunto y el destinatario real en el cuerpo; nada se escribe en Odoo. real: correos a empleados y notas en Odoo.', true),
 ('empresa_ids',          '[1]',      'Empresas de Odoo que se vigilan. El filtro es por empresa, nunca por id de empleado.', true),
 ('tolerancia_min',       '20',       'Minutos de tolerancia sobre la hora de entrada. Recuperado del sistema de Odoo (dic-2025 a abr-2026). Confirmar contra el Reglamento Interior.', false),
 ('hora_fuente',          '"hora_entrada"', 'De dónde sale la hora esperada: hora_entrada (hr.employee.x_studio_hora_entrada, lo que usaba Odoo) o calendario (resource.calendar).', false),
 ('periodo',              '"mes"',    'Periodo de conteo: mes calendario. El sistema viejo usaba ventana móvil de 30 días, que dejaba a la gente en acta permanente.', false),
 ('reincidencia_dias',    '30',       'Si hay un caso con firma validada y la persona vuelve a llegar tarde dentro de estos días, se abre el siguiente nivel.', false),
 ('contar_desde',         '"2026-09-01"', 'Fecha a partir de la cual los retardos cuentan para casos. Al pasar a modo real se mueve al día del cambio para no sancionar en retroactivo.', false),
 ('primera_checada_solo', 'true',     'Solo la primera checada del día cuenta (regla recuperada).', true),
 ('dias_habiles',         '[1,2,3,4,5]', 'Días ISO que cuentan (1=lunes). Recuperado: lunes a viernes.', false),
 ('dias_validacion_rh',   '2',        'Días hábiles para que RH valide una hoja recibida antes del recordatorio.', false),
 ('remitente',            '"sales@fts.mx"', 'Buzón que envía. Nunca estebandelacruz@fts.mx.', true),
 ('sombra_destinatarios', '["estebandelacruz@fts.mx"]', 'A quién llega todo en modo sombra. Agregar el buzón de RH cuando exista.', false),
 ('rh_destinatarios',     '[]',       'Buzones de RH/Legal que reciben copia y avisos de validación en modo real. Vacío hasta que Esteban lo llene.', false),
 ('escalamiento_cc',      '["estebandelacruz@fts.mx"]', 'Copia cuando una firma se vence por segunda vez.', true),
 ('alertas_destinatarios','["estebandelacruz@fts.mx"]', 'Quién recibe las alertas del latido y del error workflow. Agregar RH.', false),
 ('buzon_receptor',       'null',     'Buzón donde los empleados responden con la hoja firmada. null = lector apagado (sin permiso de lectura todavía).', false),
 ('latido_horas_detectar','30',       'Horas máximas sin una corrida exitosa de detectar en día hábil antes de alertar.', true),
 ('latido_dias_sin_retardos','5',     'Días hábiles seguidos con cero retardos detectados que disparan alerta (históricamente hay ~6 por día hábil).', false),
 ('latido_horas_outbox',  '3',        'Horas que un correo puede estar pendiente antes de alertar.', true)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO retardos.escalera (nivel, accion, nombre, umbral, requiere_firma, requiere_testigos, dias_plazo_firma, dias_suspension, origen, confirmado, nota) VALUES
 (1, 'aviso',            'Aviso de retardo',       1, false, false, 0, NULL, 'recuperado', false, 'El sistema viejo avisaba desde el primer retardo. Aquí es UN aviso por periodo, no uno por retardo.'),
 (2, 'carta_compromiso', 'Carta compromiso',       3, true,  false, 3, NULL, 'propuesto',  false, 'El viejo saltaba a acta al tercero. Se propone una carta compromiso firmada antes del acta.'),
 (3, 'acta',             'Acta administrativa',    5, true,  true,  3, NULL, 'recuperado', false, 'Recuperado: acta con fundamento LFT arts. 20, 134 fr. I, III y V, 47. Umbral propuesto 5.'),
 (4, 'suspension',       'Suspensión sin goce',    7, true,  true,  2, 1,    'propuesto',  false, 'Nunca existió en el sistema viejo. RH decide días (1 a 8, LFT 423 fr. X) y fechas; el sistema verifica que se aplicó.')
ON CONFLICT (nivel) DO NOTHING;

INSERT INTO retardos.transicion_valida (de, a) VALUES
 ('DETECTADO','NOTIFICADO'), ('DETECTADO','CANCELADO_POR_RH'),
 ('NOTIFICADO','ESPERANDO_FIRMA'), ('NOTIFICADO','CERRADO'), ('NOTIFICADO','CANCELADO_POR_RH'),
 ('ESPERANDO_FIRMA','FIRMA_RECIBIDA'), ('ESPERANDO_FIRMA','VENCIDO'), ('ESPERANDO_FIRMA','SE_NEGO_A_FIRMAR'),
 ('ESPERANDO_FIRMA','IMPUGNADO'), ('ESPERANDO_FIRMA','CANCELADO_POR_RH'),
 ('VENCIDO','FIRMA_RECIBIDA'), ('VENCIDO','ESCALADO'), ('VENCIDO','SE_NEGO_A_FIRMAR'), ('VENCIDO','IMPUGNADO'), ('VENCIDO','CANCELADO_POR_RH'),
 ('ESCALADO','FIRMA_RECIBIDA'), ('ESCALADO','SE_NEGO_A_FIRMAR'), ('ESCALADO','IMPUGNADO'), ('ESCALADO','CANCELADO_POR_RH'),
 ('FIRMA_RECIBIDA','VALIDADO_RH'), ('FIRMA_RECIBIDA','ESPERANDO_FIRMA'), ('FIRMA_RECIBIDA','IMPUGNADO'), ('FIRMA_RECIBIDA','CANCELADO_POR_RH'),
 ('SE_NEGO_A_FIRMAR','VALIDADO_RH'), ('SE_NEGO_A_FIRMAR','CANCELADO_POR_RH'),
 ('IMPUGNADO','ESPERANDO_FIRMA'), ('IMPUGNADO','VALIDADO_RH'), ('IMPUGNADO','CANCELADO_POR_RH'),
 ('VALIDADO_RH','ACCION_PROGRAMADA'), ('VALIDADO_RH','CERRADO'), ('VALIDADO_RH','CANCELADO_POR_RH'),
 ('ACCION_PROGRAMADA','ACCION_VERIFICADA'), ('ACCION_PROGRAMADA','CANCELADO_POR_RH'),
 ('ACCION_VERIFICADA','CERRADO')
ON CONFLICT DO NOTHING;
