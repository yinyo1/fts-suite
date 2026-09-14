-- ═══════════════════════════════════════════════════════════════════════════
-- 008_confirmacion_y_handoff.sql · la confirmación manda desde la suite
-- Issue #244 (Estación 3) · sesión 2 del 14-sep-2026
--
-- Hasta hoy el equipo confirmaba en Odoo y un radar lo descubría hasta cinco
-- minutos después. A partir de esto la suite manda: la confirmación es el
-- disparador, en el momento, y arrastra proyecto, analíticas, presupuesto y
-- junta de arranque.
--
-- ── EL PROBLEMA QUE ESTA MIGRACIÓN EXISTE PARA RESOLVER ───────────────────
-- Confirmar son VARIAS escrituras a Odoo y cada llamada hace commit por su
-- cuenta: no hay transacción que las abarque. Así que «todo o nada» no existe
-- por este camino, y compensar borrando está prohibido —y sería peor: borrar
-- el proyecto de una orden ya confirmada—.
--
-- Lo que sí se puede elegir es el ORDEN, y ahí está casi toda la solución.
-- De todo lo que hay que hacer, SÓLO UNA COSA ES IRREVERSIBLE: confirmar la
-- orden. Crear una analítica, un proyecto o un presupuesto y que la orden se
-- quede en borrador no rompe nada — queda una pieza inerte que el siguiente
-- intento REUTILIZA en vez de duplicar. Por eso el orden es:
--
--     1. reserva            (aquí, en la base: mata el doble clic)
--     2. cuenta analítica   ┐
--     3. proyecto           │ si algo falla aquí, la orden sigue en BORRADOR
--     4. presupuesto        │ y lo creado se reutiliza al reintentar
--     5. marcar la bandera  ┘ ← saca la orden del radar ANTES de confirmar
--     6. CONFIRMAR          ← lo único irreversible, al final
--     7. junta de arranque  ← best-effort: si falla, se avisa, no se deshace
--
-- El paso 5 antes del 6 no es cosmético: el radar busca órdenes en `sale` con
-- la bandera en `false`, así que confirmar primero abriría una ventana de
-- hasta 5 minutos en la que el radar crearía un SEGUNDO proyecto, otra
-- analítica y otro presupuesto. Marcando antes, nunca la ve libre.
--
-- ── Y POR QUÉ HACE FALTA UNA BITÁCORA ADEMÁS DEL ORDEN ────────────────────
-- El orden evita el daño; no evita que un intento se quede a medias. Sin
-- registro, una confirmación que murió en el paso 4 es indistinguible de una
-- que nunca se intentó: el proyecto existe, la orden está en borrador, y nadie
-- sabe si eso es un trabajo a medias o el estado normal. La bitácora guarda
-- hasta dónde llegó cada intento, para que se pueda VER y REANUDAR.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ══ 1 · Lo que la confirmación produce, del lado del machote ═══════════════
-- Referencias externas SIN llave foránea, igual que `odoo_so_id` (003): el día
-- que un dominio salga de Odoo, el machote no queda apuntando a un id muerto.

ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS odoo_project_id   integer;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS odoo_analytic_id  integer;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS odoo_budget_id    integer;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS confirmada_at     timestamptz;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS confirmada_por    text;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS confirma_claim_at timestamptz;

COMMENT ON COLUMN comercial.machote.odoo_analytic_id IS
  'Cuenta analitica creada al confirmar. Se guarda para REUTILIZARLA si un intento se queda a medias: sin esto, el reintento crearia otra.';
COMMENT ON COLUMN comercial.machote.confirma_claim_at IS
  'Reserva para confirmar, misma idea que odoo_so_claim_at: quien logra ponerla confirma. Caduca a los 5 minutos porque confirmar toca Odoo varias veces y tarda mas que crear la orden.';

-- Una orden confirmada tiene autor y fecha, o no esta confirmada. Mismo
-- criterio que el archivado (006) y la orden (007): un hecho sin autor no es
-- un hecho.
ALTER TABLE comercial.machote DROP CONSTRAINT IF EXISTS machote_confirmada_con_autor_ck;
ALTER TABLE comercial.machote ADD  CONSTRAINT machote_confirmada_con_autor_ck
  CHECK (confirmada_at IS NULL
      OR (confirmada_por IS NOT NULL AND length(btrim(confirmada_por)) > 0));

-- No se puede confirmar lo que no es orden todavia.
ALTER TABLE comercial.machote DROP CONSTRAINT IF EXISTS machote_confirmada_con_orden_ck;
ALTER TABLE comercial.machote ADD  CONSTRAINT machote_confirmada_con_orden_ck
  CHECK (confirmada_at IS NULL OR odoo_so_id IS NOT NULL);

-- UN proyecto, UN machote. Sin esto, dos intentos que se crucen dejarian dos
-- machotes apuntando al mismo proyecto y nadie sabria cual manda. Parcial,
-- como todos los de este esquema, para que el borrado logico libere el hueco.
CREATE UNIQUE INDEX IF NOT EXISTS machote_odoo_project_uq
  ON comercial.machote (odoo_project_id)
  WHERE odoo_project_id IS NOT NULL AND deleted_at IS NULL;


-- ══ 2 · El handoff: la mitad que el machote no sabe ════════════════════════
-- El costeo no dice quien dirige la obra, que se entrega ni cuando empieza.
-- Eso se captura al confirmar y es lo que operaciones necesita para arrancar.
--
-- UNO por machote y EDITABLE hasta que se confirma: es un borrador de captura,
-- no un hecho historico. Lo que queda congelado del momento de confirmar es el
-- renglon de `comercial.confirmacion`, que se guarda aparte y no se toca.
CREATE TABLE IF NOT EXISTS comercial.handoff (
  machote_id   uuid        PRIMARY KEY REFERENCES comercial.machote(id),

  -- Fechas de obra. Van al proyecto (`date_start` / `date`) y son las que
  -- pone el correo de arranque.
  fecha_inicio date,
  fecha_fin    date,

  -- Quien dirige. Se guarda el id de Odoo (hr.employee) y el nombre como
  -- respaldo para pintar, misma regla que el cliente: el id manda, el texto
  -- es para que la pantalla no quede muda si Odoo no contesta.
  responsable_id     integer,
  responsable_nombre text,

  -- Que se hace y que se entrega. Texto largo a proposito: son parrafos, no
  -- etiquetas.
  alcance      text,
  entregables  text,

  -- El presupuesto por rubro, tal como se va a escribir en budget.line.
  -- jsonb y no columnas porque los rubros del plan 20 cambian sin avisar, y
  -- una columna por rubro seria una migracion cada vez.
  presupuesto  jsonb       NOT NULL DEFAULT '[]'::jsonb,

  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_por text,

  CONSTRAINT handoff_presupuesto_lista_ck CHECK (jsonb_typeof(presupuesto) = 'array'),
  -- Una obra que termina antes de empezar es un dedazo, no un plan.
  CONSTRAINT handoff_fechas_ck
    CHECK (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

COMMENT ON TABLE comercial.handoff IS
  'Lo que se captura al confirmar y el costeo no sabe: fechas de obra, responsable, alcance, entregables y el presupuesto por rubro. Editable hasta confirmar; lo congelado vive en comercial.confirmacion.';
COMMENT ON COLUMN comercial.handoff.presupuesto IS
  'Lista de {rubro_id, rubro_nombre, monto, signo}. jsonb y no columnas porque los rubros del plan 20 cambian sin que eso deba costar una migracion.';


-- ══ 3 · La bitacora de confirmacion ════════════════════════════════════════
-- APPEND-ONLY, un renglon por INTENTO. Es lo que vuelve visible y reanudable
-- una confirmacion a medias, y lo que contesta "quien confirmo y con que
-- numeros" igual que las versiones del machote contestan quien capturo que.
CREATE TABLE IF NOT EXISTS comercial.confirmacion (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  machote_id   uuid        NOT NULL REFERENCES comercial.machote(id),
  odoo_so_id   integer     NOT NULL,

  -- Hasta donde llego. El numero es el paso del plan de arriba (2..7); 0 es
  -- "ni empezo". `completa` es el unico campo que dice que TODO salio.
  paso_alcanzado integer   NOT NULL DEFAULT 0,
  completa       boolean   NOT NULL DEFAULT false,

  -- Que quedo creado, por si hay que reutilizarlo o revisarlo a mano.
  odoo_analytic_id integer,
  odoo_project_id  integer,
  odoo_budget_id   integer,
  kickoff_ok       boolean,

  -- Los numeros CON LOS QUE se confirmo, congelados. Si mañana alguien edita
  -- la orden en Odoo, este renglon sigue diciendo que se aprobo aquel dia.
  version      integer,
  moneda       text,
  subtotal     numeric(18,2),
  impuesto     numeric(18,2),
  total        numeric(18,2),
  margen       numeric(8,5),

  -- Lo que vio la Compuerta 2, congelado igual que en la 1.
  cuadra          boolean,
  dentro_politica boolean,
  motivos         jsonb   NOT NULL DEFAULT '[]'::jsonb,

  -- El detalle paso por paso: [{paso, nombre, ok, detalle}]. Es lo que la
  -- pantalla lee para decir "quedo a medias en el paso 4" en vez de un
  -- "fallo" que no le sirve a nadie.
  pasos        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  error        text,

  actor        text        NOT NULL,
  actor_nombre text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT confirmacion_actor_no_vacio_ck CHECK (length(btrim(actor)) > 0),
  CONSTRAINT confirmacion_pasos_lista_ck    CHECK (jsonb_typeof(pasos) = 'array'),
  CONSTRAINT confirmacion_motivos_lista_ck  CHECK (jsonb_typeof(motivos) = 'array'),
  -- Una confirmacion completa llego hasta el paso 6 (confirmar). El 7 es la
  -- junta y es best-effort: que falle no la vuelve incompleta.
  CONSTRAINT confirmacion_completa_ck
    CHECK (NOT completa OR (paso_alcanzado >= 6 AND odoo_project_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS confirmacion_machote_ix
  ON comercial.confirmacion (machote_id, created_at DESC);

-- Para la pantalla de "confirmaciones a medias": las que no llegaron.
CREATE INDEX IF NOT EXISTS confirmacion_a_medias_ix
  ON comercial.confirmacion (created_at DESC)
  WHERE NOT completa;

COMMENT ON TABLE comercial.confirmacion IS
  'Append-only, un renglon por INTENTO de confirmar. Guarda hasta que paso llego y que quedo creado, para que una confirmacion a medias se pueda ver y reanudar en vez de quedar huerfana.';


-- ══ 4 · Permisos ═══════════════════════════════════════════════════════════
-- Sin DELETE en ninguna, como en todo este esquema: aqui no se borra.
GRANT SELECT, INSERT, UPDATE ON comercial.handoff      TO comercial_app;
GRANT SELECT, INSERT         ON comercial.confirmacion TO comercial_app;
