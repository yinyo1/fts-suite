-- fts_po_radar / módulo comercial — esquema completo
-- Destino: servicio Postgres `fts-suite-db` (Railway, proyecto cheerful-comfort).
-- Issues: #142 (po_radar) y #127 (comercial).
--
-- CÓMO SE EJECUTA (sesión 2 no pudo: no hay credencial Postgres en n8n y el
-- servicio no tiene proxy TCP público, así que solo se alcanza desde la red
-- privada de Railway):
--   1. En n8n → Credentials → New → Postgres, apuntando a fts-suite-db por su
--      RAILWAY_PRIVATE_DOMAIN, con POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB.
--   2. Un workflow con un nodo Postgres en modo "Execute Query" corre este archivo.
--   3. Después se cargan los datos (ver docs/po-radar/README.md).
--
-- Nada de este archivo contiene datos: es solo estructura.

CREATE SCHEMA IF NOT EXISTS comercial;   -- el taller del módulo comercial (#127)
CREATE SCHEMA IF NOT EXISTS po_radar;    -- el detector de órdenes de compra (#142)

-- ===========================================================================
-- po_radar — diccionario de identidad
-- ===========================================================================

-- Un grupo = una empresa real, aunque Odoo la tenga partida en varios partners.
CREATE TABLE IF NOT EXISTS po_radar.grupos_cliente (
  id             serial PRIMARY KEY,
  nombre         text NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  partner_ids    int[]  NOT NULL DEFAULT '{}',
  rfcs           text[] NOT NULL DEFAULT '{}',
  dominios       text[] NOT NULL DEFAULT '{}',
  notas          text
);
CREATE INDEX IF NOT EXISTS grupos_rfcs     ON po_radar.grupos_cliente USING gin (rfcs);
CREATE INDEX IF NOT EXISTS grupos_dominios ON po_radar.grupos_cliente USING gin (dominios);

-- Formatos de folio por grupo. Reemplaza al CSV formatos-folio.csv.
CREATE TABLE IF NOT EXISTS po_radar.formato_folio (
  id            serial PRIMARY KEY,
  grupo_id      int REFERENCES po_radar.grupos_cliente(id) ON DELETE CASCADE,
  grupo_nombre  text NOT NULL,
  regex         text NOT NULL,
  ejemplos      text[] NOT NULL DEFAULT '{}',
  dominios_obs  text[] NOT NULL DEFAULT '{}',
  es_po         boolean NOT NULL DEFAULT true,  -- false = flete / nota de factura
  notas         text
);

-- Corpus histórico de folios desde Odoo. Reemplaza a corpus-po-folios.csv.
CREATE TABLE IF NOT EXISTS po_radar.corpus_folio (
  id            bigserial PRIMARY KEY,
  so            text NOT NULL,
  folio_crudo   text,
  folio_norm    text,
  partner_odoo  text,
  partner_id    int,
  grupo_id      int REFERENCES po_radar.grupos_cliente(id),
  fecha_order   date,
  UNIQUE (so, folio_crudo)
);
CREATE INDEX IF NOT EXISTS corpus_folio_norm ON po_radar.corpus_folio (folio_norm);

-- ===========================================================================
-- po_radar — corpus de correo (FASE B)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS po_radar.corpus_correo (
  id                  bigserial PRIMARY KEY,
  snapshot_id         text        NOT NULL,
  internet_message_id text        NOT NULL,
  graph_message_id    text        NOT NULL,
  conversation_id     text,
  recibido_en         timestamptz NOT NULL,
  remitente           text        NOT NULL,
  remitente_dominio   text        NOT NULL,
  remitente_interno   boolean     NOT NULL DEFAULT false,
  asunto              text,
  cuerpo_texto        text,
  n_adjuntos          int         NOT NULL DEFAULT 0,
  sp_path             text,
  UNIQUE (snapshot_id, internet_message_id)
);
CREATE INDEX IF NOT EXISTS correo_hilo  ON po_radar.corpus_correo (conversation_id);
CREATE INDEX IF NOT EXISTS correo_fecha ON po_radar.corpus_correo (recibido_en DESC);

CREATE TABLE IF NOT EXISTS po_radar.corpus_adjunto (
  id            bigserial PRIMARY KEY,
  correo_id     bigint  NOT NULL REFERENCES po_radar.corpus_correo(id) ON DELETE CASCADE,
  nombre        text    NOT NULL,
  extension     text,
  content_type  text,
  bytes         int,
  sha256        char(64) NOT NULL,
  texto_chars   int,
  paginas       int,
  es_imagen_sin_texto boolean
);
CREATE INDEX IF NOT EXISTS adjunto_sha ON po_radar.corpus_adjunto (sha256);

-- LA VERDAD del set etiquetado. La pone un humano, no el sistema.
-- Reemplaza a casos-prueba.csv.
CREATE TABLE IF NOT EXISTS po_radar.etiqueta (
  correo_id      bigint  PRIMARY KEY REFERENCES po_radar.corpus_correo(id) ON DELETE CASCADE,
  es_po          boolean NOT NULL,
  clase          text    NOT NULL,
  es_revision    boolean NOT NULL DEFAULT false,
  grupo_cliente  text,
  folio          text,
  etiquetado_por text    NOT NULL,
  etiquetado_en  timestamptz NOT NULL DEFAULT now(),
  nota           text,
  CONSTRAINT clase_valida CHECK (clase IN (
    'po_nueva','po_revision','po_duplicada','po_sin_adjunto',
    'no_cotizacion','no_factura','no_contrato','no_rfq','no_aviso_plataforma',
    'no_notificacion_propia','no_compra_fts','no_operativo','no_publicidad','no_otro'
  ))
);

-- ===========================================================================
-- po_radar — bitácora de producción y medición
-- ===========================================================================

CREATE TABLE IF NOT EXISTS po_radar.bitacora (
  id                  bigserial PRIMARY KEY,
  procesado_en        timestamptz NOT NULL DEFAULT now(),
  internet_message_id text        NOT NULL,
  graph_message_id    text        NOT NULL,
  conversation_id     text,
  recibido_en         timestamptz NOT NULL,
  remitente           text        NOT NULL,
  remitente_dominio   text        NOT NULL,
  asunto              text,
  folio_crudo         text,
  folio_normalizado   text,
  grupo_cliente_id    int         REFERENCES po_radar.grupos_cliente(id),
  cliente_probable    text,
  rfc                 text,
  moneda              char(3),
  monto               numeric(16,2),
  score_estructural   int         NOT NULL,
  confianza_llm       numeric(4,3),
  precision_publicada int         NOT NULL,
  razones             jsonb,
  senales             jsonb,
  estado              text        NOT NULL,
  etiqueta_dedupe     text,
  motivo_no_envio     text,
  so_odoo             text,
  enviado_a           text[],
  enviado_en          timestamptz,
  CONSTRAINT estado_valido CHECK (estado IN (
    'enviado','enviado_probable','ignorado','descartado_etapa1',
    'error_envio','error_clasificador')),
  CONSTRAINT etiqueta_valida CHECK (etiqueta_dedupe IS NULL OR etiqueta_dedupe IN (
    'nueva','revision','duplicado_archivo','duplicado_hilo','ya_registrada_odoo'))
);
CREATE UNIQUE INDEX IF NOT EXISTS bitacora_msgid_uq ON po_radar.bitacora (internet_message_id);
CREATE INDEX IF NOT EXISTS bitacora_folio_grupo ON po_radar.bitacora (folio_normalizado, grupo_cliente_id)
  WHERE folio_normalizado IS NOT NULL;

CREATE TABLE IF NOT EXISTS po_radar.adjuntos (
  id          bigserial PRIMARY KEY,
  bitacora_id bigint  NOT NULL REFERENCES po_radar.bitacora(id) ON DELETE CASCADE,
  nombre      text    NOT NULL,
  content_type text,
  bytes       int,
  sha256      char(64) NOT NULL,
  es_pdf      boolean  NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS adjuntos_sha ON po_radar.adjuntos (sha256);

-- Cuarentena anti-bucle: hilos que nacen de una notificación propia.
CREATE TABLE IF NOT EXISTS po_radar.hilos_propios (
  conversation_id text PRIMARY KEY,
  motivo          text NOT NULL,
  registrado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS po_radar.corrida (
  id          bigserial PRIMARY KEY,
  snapshot_id text NOT NULL,
  corrida_en  timestamptz NOT NULL DEFAULT now(),
  version     text NOT NULL,
  notas       text
);

CREATE TABLE IF NOT EXISTS po_radar.prediccion (
  corrida_id    bigint NOT NULL REFERENCES po_radar.corrida(id) ON DELETE CASCADE,
  correo_id     bigint NOT NULL REFERENCES po_radar.corpus_correo(id) ON DELETE CASCADE,
  score_etapa1  int,
  confianza_llm numeric(4,3),
  precision_pub int,
  decision      text NOT NULL,
  grupo_pred    text,
  folio_pred    text,
  PRIMARY KEY (corrida_id, correo_id)
);

-- ===========================================================================
-- Listas negras. En tabla y no en código: cambian sin tocar el workflow.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS po_radar.exclusiones (
  tipo   text NOT NULL,
  valor  text NOT NULL,
  motivo text,
  PRIMARY KEY (tipo, valor)
);

INSERT INTO po_radar.exclusiones (tipo, valor, motivo) VALUES
  ('rfc','XEXX010101000','RFC generico de extranjero: lo comparten varios partners'),
  ('rfc','XAXX010101000','RFC generico nacional'),
  ('rfc','SFT170905L43','RFC propio: Servicios FTS'),
  ('rfc','TPY2106282I5','RFC propio: Tecnologias y Productos YIN'),
  ('dominio','fts.mx','Dominio propio. El partner CBRE tiene email @fts.mx en Odoo'),
  ('dominio','ariba.com','Plataforma, no es el cliente'),
  ('dominio','ansmtp.ariba.com','Plataforma'),
  ('dominio','eusmtp.ariba.com','Plataforma'),
  ('dominio','concursolutions.com','Plataforma'),
  ('dominio','coupa.com','Plataforma'),
  ('dominio','jaggaer.com','Plataforma'),
  ('dominio','tradeshift.com','Plataforma'),
  ('dominio','docusign.net','Plataforma')
ON CONFLICT DO NOTHING;
