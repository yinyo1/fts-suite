-- ═══════════════════════════════════════════════════════════════════════════
-- 005_prestamo.sql · el permiso temporal de escritura
-- Issue #140 · sesión 7 (2026-09-10). Idea original de Ricardo.
--
-- El dueño de un machote le presta la escritura a otra persona, por un plazo
-- que él elige, con tope de 24 horas. Mientras dura, esa persona guarda como
-- guardaría el dueño; cada versión suya queda con SU nombre.
--
-- El diseño completo, con las cinco decisiones y lo que se descartó, está en
-- `docs/comercial/PERMISO_TEMPORAL.md`. Aquí sólo va lo que la base tiene que
-- hacer cumplir.
--
-- ── LO QUE NO HACE FALTA INVENTAR ─────────────────────────────────────────
-- La autoría YA está separada de la propiedad y no hay que tocarla:
--   comercial.machote.dueno          de quién es la cotización
--   comercial.machote_version.autor  quién escribió ESA versión
-- El segundo sale del token verificado en `machote-guardar`, nunca del cuerpo
-- de la petición, así que ya es infalsificable desde el navegador. Ésa es la
-- pregunta del caso de las comisiones —cómo queda registrado que una versión
-- la escribió alguien que no es el dueño— y ya estaba contestada.
--
-- La concurrencia tampoco se toca: el índice único
-- `mv_machote_version_uq (machote_id, version)` de la 003 deja pasar a uno y
-- rechaza al otro. Esa regla mira SOBRE QUÉ VERSIÓN se escribe, no quién
-- escribe, así que dos personas con derecho a escribir se comportan igual que
-- una persona con dos pestañas — que ya pasa hoy.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS comercial.machote_prestamo (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  machote_id    uuid        NOT NULL REFERENCES comercial.machote(id),

  -- A quién se le presta y quién prestó. Los dos son el `actor` del token,
  -- texto, igual que `machote.dueno` — no hay tabla de usuarios en este
  -- esquema y no la va a haber sólo por esto.
  para          text        NOT NULL,
  otorgado_por  text        NOT NULL,

  otorgado_at   timestamptz NOT NULL DEFAULT now(),
  vence_at      timestamptz NOT NULL,

  -- NULL mientras siga vivo. Recoger un préstamo NO lo borra: la traza de que
  -- existió es justamente lo que hace auditable el permiso.
  revocado_at   timestamptz,
  revocado_por  text,

  -- ══ EL TOPE DE 24 HORAS VIVE AQUÍ ═══════════════════════════════════════
  -- En la base y no en la pantalla ni en el workflow, por la misma razón que
  -- el folio es una secuencia y no un contador en JavaScript: una regla que
  -- vive en un solo lugar es una regla que ningún camino nuevo puede saltarse
  -- por olvido. Un endpoint futuro que preste desde otro lado la hereda sin
  -- enterarse.
  CONSTRAINT prestamo_tope_24h  CHECK (vence_at <= otorgado_at + interval '24 hours'),
  CONSTRAINT prestamo_vence_despues CHECK (vence_at > otorgado_at),

  -- Nadie se presta a sí mismo. No es una tontería defensiva: sin esto, un
  -- dueño podría "prestarse" su propio machote y el registro diría que una
  -- versión suya la escribió con permiso prestado, que es falso.
  CONSTRAINT prestamo_no_a_si_mismo CHECK (para <> otorgado_por)
);

COMMENT ON TABLE comercial.machote_prestamo IS
  'Permiso temporal de ESCRITURA sobre un machote, otorgado por su dueno. Tope de 24 horas, forzado por CHECK. Revocar no borra el renglon: la traza es parte del permiso.';
COMMENT ON COLUMN comercial.machote_prestamo.para IS
  'Actor que recibe el permiso. Es el mismo espacio de nombres que machote.dueno y machote_version.autor.';
COMMENT ON COLUMN comercial.machote_prestamo.revocado_at IS
  'NULL = sigue vivo. Recoger el prestamo lo llena; no borra el renglon.';

-- ══ UN SOLO PRÉSTAMO VIVO POR MACHOTE Y POR PERSONA ════════════════════════
-- Parcial sobre los no revocados. Sin esto, «prestar» dos veces seguidas
-- dejaría dos renglones vivos y «recoger» tendría que adivinar cuál cerrar —
-- y adivinaría mal justo cuando importa, porque el que quedara abierto sería
-- el que da acceso.
--
-- OJO: NO incluye `vence_at > now()`. Un índice parcial no puede depender de
-- `now()` (no es inmutable) y además no debe: un préstamo vencido y uno
-- revocado son cosas distintas, y prestar de nuevo tras el vencimiento tiene
-- que poder crear un renglón nuevo. Por eso la unicidad es sobre lo NO
-- REVOCADO y el vencimiento se filtra al consultar.
CREATE UNIQUE INDEX IF NOT EXISTS machote_prestamo_vivo_uq
  ON comercial.machote_prestamo (machote_id, para)
  WHERE revocado_at IS NULL;

-- La consulta caliente es «¿este actor puede escribir en este machote AHORA?»,
-- que corre en CADA guardado. Va por (machote_id, para) y filtra por vigencia.
CREATE INDEX IF NOT EXISTS machote_prestamo_busca_ix
  ON comercial.machote_prestamo (machote_id, para, vence_at DESC)
  WHERE revocado_at IS NULL;

-- Y la de «¿a quién le presté?», para pintarlo en la pantalla del dueño.
CREATE INDEX IF NOT EXISTS machote_prestamo_por_dueno_ix
  ON comercial.machote_prestamo (otorgado_por, vence_at DESC)
  WHERE revocado_at IS NULL;

-- ══ Permisos ═══════════════════════════════════════════════════════════════
-- UPDATE es para revocar (llenar `revocado_at`). SIN DELETE, igual que el
-- resto del esquema: un préstamo no se borra, se recoge — y la 001 ya no le
-- da DELETE a este rol en ningún lado.
GRANT SELECT, INSERT, UPDATE ON comercial.machote_prestamo TO comercial_app;

-- El renglon de public.schema_migrations lo inserta el runner, con el sha256
-- REAL del archivo.
