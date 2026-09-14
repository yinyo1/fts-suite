-- ═══════════════════════════════════════════════════════════════════════════
-- 006_archivar_ceder.sql · archivar en vez de borrar, y ceder la propiedad
-- Issue #140 · V1.29 (2026-09-13).
--
-- Dos cosas que van juntas porque la primera depende de la segunda: SÓLO EL
-- DUEÑO archiva, así que para poder archivar lo de alguien que se fue de FTS
-- tiene que existir primero una forma de que deje de ser suyo.
--
-- ── POR QUÉ UNA COLUMNA NUEVA Y NO `deleted_at` ───────────────────────────
-- `comercial.machote.deleted_at` ya existe desde la 003 y la tentación es
-- reusarla. NO SIRVE, y no es una cuestión de gusto: el índice de la 003 es
--
--   CREATE UNIQUE INDEX machote_id_local_uq ON comercial.machote (id_local)
--     WHERE id_local IS NOT NULL AND deleted_at IS NULL;
--
-- o sea que poner `deleted_at` LIBERA el hueco del `id_local`. Para un borrado
-- es correcto. Para un archivado es fatal: **desarchivar sería imposible** en
-- cuanto exista otra fila viva con ese mismo `id_local`, porque el índice la
-- rechazaría. Y no es hipotético — medido en producción el 13-sep-2026:
-- `M-1041` existe CUATRO veces, una viva (COT-0009, de Montalvo) y tres con
-- `deleted_at`. Un archivado que no se puede desarchivar no es un archivado.
--
-- Con columna propia, un archivado sigue teniendo `deleted_at IS NULL`, así
-- que NO suelta su `id_local` y desarchivar no puede chocar con nada.
-- `deleted_at` se queda siendo lo que de hecho es hoy: la herramienta de
-- mantenimiento (sus 10 filas las escribieron `limpieza-140`,
-- `limpieza-demo-140` y `cc-issue-140-sesion6`, nunca la aplicación).
--
-- EL FOLIO NO SE RECICLA, y no hace falta hacer nada para conseguirlo: la 004
-- lo asigna una secuencia y nada aquí la toca.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ A · ARCHIVAR ═══════════════════════════════════════════════════════════
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS archivado_at  timestamptz;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS archivado_por text;

COMMENT ON COLUMN comercial.machote.archivado_at IS
  'NULL = activo. Lo llena el dueno al archivar. NO es deleted_at: no libera el id_local, para que desarchivar siempre pueda.';
COMMENT ON COLUMN comercial.machote.archivado_por IS
  'Quien archivo. Sale del token verificado en comercial/machote-archivar, nunca del cuerpo.';

-- Las dos juntas o ninguna: un archivado sin autor no se puede auditar, y un
-- autor sin fecha no significa nada. Se fuerza aqui y no en el workflow por lo
-- mismo que el tope de 24 h del prestamo vive en la base (005): una regla en un
-- solo lugar es una que ningun camino nuevo puede saltarse por olvido.
ALTER TABLE comercial.machote DROP CONSTRAINT IF EXISTS machote_archivado_completo_ck;
ALTER TABLE comercial.machote ADD  CONSTRAINT machote_archivado_completo_ck
  CHECK ((archivado_at IS NULL AND archivado_por IS NULL)
      OR (archivado_at IS NOT NULL AND archivado_por IS NOT NULL AND length(btrim(archivado_por)) > 0));

-- La consulta caliente es la lista: "los ACTIVOS", o sea lo no archivado.
CREATE INDEX IF NOT EXISTS machote_activos_ix
  ON comercial.machote (dueno) WHERE deleted_at IS NULL AND archivado_at IS NULL;

-- Y la de direccion: "los archivados, los mas recientes primero".
CREATE INDEX IF NOT EXISTS machote_archivados_ix
  ON comercial.machote (archivado_at DESC) WHERE deleted_at IS NULL AND archivado_at IS NOT NULL;

-- ══ A2 · CEDER LA PROPIEDAD ════════════════════════════════════════════════
-- Tabla NUEVA, no `machote_prestamo`. Un prestamo es un permiso CON VIGENCIA
-- que se revoca; una cesion es instantanea y definitiva. Meterlas en la misma
-- tabla obligaria a un `vence_at` que no significa nada, y el dia que alguien
-- consulte "quien puede escribir" tendria que acordarse de excluir las
-- cesiones. Se reusa el PATRON —append-only, el actor sale del token, el
-- permiso se resuelve en SQL— que es lo que vale del prestamo, no su tabla.
CREATE TABLE IF NOT EXISTS comercial.machote_cesion (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  machote_id  uuid        NOT NULL REFERENCES comercial.machote(id),

  -- De quien era y a quien pasa. Mismo espacio de nombres que `machote.dueno`
  -- y `machote_version.autor`: el `sub` del token.
  de          text        NOT NULL,
  para        text        NOT NULL,

  -- QUIEN EJECUTO. En una cesion voluntaria es el dueno (= `de`); en una
  -- reasignacion por salida es quien tenga direccion, y por eso NO coincide.
  cedido_por  text        NOT NULL,
  cedido_at   timestamptz NOT NULL DEFAULT now(),

  -- ══ LO QUE DISTINGUE UNA CESION FORZADA ══════════════════════════════════
  -- Podria deducirse de `cedido_por <> de`. NO se deduce, se GUARDA: el
  -- historial no debe depender de un razonamiento para decir la verdad. Si el
  -- dato esta, el renglon se lee solo — y se lee igual dentro de un anio,
  -- cuando nadie recuerde la regla.
  forzada     boolean     NOT NULL DEFAULT false,
  motivo      text,

  -- Agrupa una reasignacion en lote. El caso real es "limpiar la cartera de
  -- alguien que se fue" —en la limpieza de Odoo de agosto fueron 331 leads de
  -- cuatro personas—, no un machote suelto. Sin esto, el historial contaria N
  -- sucesos sueltos en vez de UN hecho con N consecuencias.
  lote_id     uuid,

  -- Nadie se cede a si mismo: el renglon no significaria nada y ademas dejaria
  -- "cambios de dueno" que no cambian el dueno. Mismo criterio que
  -- `prestamo_no_a_si_mismo` en la 005.
  CONSTRAINT cesion_no_a_si_mismo CHECK (de <> para),
  CONSTRAINT cesion_de_no_vacio   CHECK (length(btrim(de)) > 0),
  CONSTRAINT cesion_para_no_vacio CHECK (length(btrim(para)) > 0),

  -- Una reasignacion forzada SIN motivo es la que nadie va a poder explicar
  -- despues. Se exige aqui, no en la pantalla.
  CONSTRAINT cesion_forzada_con_motivo
    CHECK (forzada = false OR (motivo IS NOT NULL AND length(btrim(motivo)) > 0))
);

COMMENT ON TABLE comercial.machote_cesion IS
  'Cambios de dueno de un machote. Append-only: cada renglon es un hecho, nunca se edita ni se borra. forzada=true es la reasignacion de direccion cuando el dueno anterior ya no esta en FTS, y lleva motivo obligatorio.';
COMMENT ON COLUMN comercial.machote_cesion.cedido_por IS
  'Quien ejecuto. Sale del token verificado, nunca del cuerpo. En la voluntaria coincide con "de"; en la forzada es quien tiene comercial:admin.';
COMMENT ON COLUMN comercial.machote_cesion.forzada IS
  'true = reasignada por direccion sin la firma del dueno anterior (salida de FTS). Se guarda explicito y no se deduce de cedido_por <> de, para que el historial se lea solo.';
COMMENT ON COLUMN comercial.machote_cesion.lote_id IS
  'Agrupa las cesiones de una misma corrida, p.ej. limpiar la cartera de quien se fue. NULL = cesion suelta.';

CREATE INDEX IF NOT EXISTS machote_cesion_machote_ix
  ON comercial.machote_cesion (machote_id, cedido_at DESC);
CREATE INDEX IF NOT EXISTS machote_cesion_lote_ix
  ON comercial.machote_cesion (lote_id) WHERE lote_id IS NOT NULL;

-- ══ PERMISOS ═══════════════════════════════════════════════════════════════
-- La 001 dejo un ALTER DEFAULT PRIVILEGES, pero eso solo cubre lo que cree el
-- mismo rol que lo puso. Se conceden explicitamente, igual que la 004 hizo con
-- la secuencia del folio.
GRANT SELECT, INSERT ON comercial.machote_cesion TO comercial_app;
