-- ═══════════════════════════════════════════════════════════════════════════
-- 007_orden_y_compuerta.sql · la orden en Odoo, y la compuerta al enviar
-- Issue #244 (Estación 3) · sesión del 14-sep-2026
--
-- Dos cosas que llegan juntas porque se necesitan mutuamente: la cotización
-- de la suite deja de ser un documento y se vuelve una ORDEN en Odoo, y al
-- salir tiene que pasar por una compuerta que mire el margen y el monto.
--
-- ── LO QUE YA EXISTÍA Y NO SE REPITE ──────────────────────────────────────
-- La 003 ya dejó `odoo_lead_id`, `odoo_so_id` y `odoo_partner_id` como
-- referencias externas SIN llave foránea. Están vacías las tres (medido el
-- 14-sep: 13 machotes vivos, 0 con `odoo_so_id`, 0 con `odoo_lead_id`), pero
-- existen, así que aquí no se vuelven a crear: se les agrega lo que les falta
-- para poder USARLAS.
--
-- ── POR QUÉ UNA COLUMNA DE RESERVA Y NO UN BOTÓN DESHABILITADO ────────────
-- «Que no se creen dos órdenes» no se resuelve en la pantalla. Dos pestañas
-- abiertas, un doble clic, o un reintento tras un timeout que en realidad sí
-- llegó, producen dos POST — y el botón gris de la primera pestaña no sabe
-- nada de la segunda. La única forma de que no haya dos órdenes es que la
-- BASE deje pasar sólo a uno, y eso es un UPDATE condicional: quien logra
-- poner su marca en `odoo_so_claim_at` crea la orden, y el que llega después
-- lee 0 filas afectadas y devuelve la que ya existe.
--
-- La reserva CADUCA (`interval '2 minutes'`) a propósito. Si el proceso muere
-- entre la reserva y la escritura del id —n8n se reinicia, Odoo tarda—, sin
-- caducidad ese machote quedaría bloqueado para siempre y nadie sabría por
-- qué. Con caducidad, el peor caso es esperar dos minutos.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ══ 1 · La orden, del lado del machote ═════════════════════════════════════

ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS odoo_so_name     text;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS odoo_so_claim_at timestamptz;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS orden_creada_at  timestamptz;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS orden_creada_por text;

COMMENT ON COLUMN comercial.machote.odoo_so_name IS
  'El nombre con el que Odoo bautizo la orden (SO11887). Se guarda para no tener que ir a Odoo solo para pintarlo; la referencia de verdad es odoo_so_id.';
COMMENT ON COLUMN comercial.machote.odoo_so_claim_at IS
  'Reserva para crear la orden. Quien logra ponerla crea; el que llega despues lee la orden que ya existe. Caduca a los 2 minutos para que un proceso muerto no bloquee el machote para siempre.';

-- El id y el nombre van juntos o no van. Un nombre sin id seria un letrero
-- sin nada detras, y un id sin nombre obliga a ir a Odoo para pintarlo.
ALTER TABLE comercial.machote DROP CONSTRAINT IF EXISTS machote_orden_completa_ck;
ALTER TABLE comercial.machote ADD  CONSTRAINT machote_orden_completa_ck
  CHECK ((odoo_so_id IS NULL AND odoo_so_name IS NULL)
      OR (odoo_so_id IS NOT NULL AND odoo_so_name IS NOT NULL
          AND length(btrim(odoo_so_name)) > 0));

-- Y si hay orden, hay constancia de quien la creo y cuando. Es el mismo
-- criterio que el archivado de la 006: un hecho sin autor no es un hecho.
ALTER TABLE comercial.machote DROP CONSTRAINT IF EXISTS machote_orden_con_autor_ck;
ALTER TABLE comercial.machote ADD  CONSTRAINT machote_orden_con_autor_ck
  CHECK (odoo_so_id IS NULL
      OR (orden_creada_at IS NOT NULL AND orden_creada_por IS NOT NULL
          AND length(btrim(orden_creada_por)) > 0));

-- UNA orden, UN machote. Sin esto, un reintento que se cuele por la ventana
-- de la reserva dejaria dos machotes apuntando a la misma SO y nadie sabria
-- cual es el bueno. Parcial, como todos los de este esquema, para que el
-- borrado logico libere el hueco.
CREATE UNIQUE INDEX IF NOT EXISTS machote_odoo_so_uq
  ON comercial.machote (odoo_so_id)
  WHERE odoo_so_id IS NOT NULL AND deleted_at IS NULL;

-- Para el camino inverso —de una orden de Odoo al machote que la origino—,
-- que es justo el que hoy no existe y por el que la pantalla de confirmacion
-- no puede enseñar de donde vino la orden.
CREATE INDEX IF NOT EXISTS machote_lead_ix
  ON comercial.machote (odoo_lead_id)
  WHERE odoo_lead_id IS NOT NULL AND deleted_at IS NULL;


-- ══ 2 · La politica de aprobacion (Compuerta 1) ════════════════════════════
-- Las cifras de julio existen en el papel desde el 17-jul-2026 y nunca se
-- aplicaron: revision de Esteban si pasa de 500 mil dolares o si el margen baja de 35%.
-- Aqui dejan de ser papel.
--
-- POR QUE UNA TABLA Y NO UNA CONSTANTE EN EL CODIGO: porque los niveles se
-- van a editar, y un numero de politica comercial que vive en un `const` se
-- cambia con un despliegue. Esto se cambia desde el panel.
--
-- POR QUE EL APROBADOR PUEDE IR VACIO: Esteban pidio construir el panel
-- primero y llenar los niveles despues. Un nivel sin aprobador NO aprueba
-- nada: marca, que es exactamente lo que esta version hace de todos modos.
CREATE TABLE IF NOT EXISTS comercial.politica_aprobacion (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- El orden de escalacion. 1 es el primero que se toca.
  nivel        integer     NOT NULL,
  nombre       text        NOT NULL,

  -- Los dos disparadores. NULL = ese criterio NO aplica en este nivel, que no
  -- es lo mismo que cero: un umbral de monto en 0 dispararia con todo.
  monto_desde  numeric(18,2),
  margen_bajo  numeric(6,4),

  -- Quien aprueba. Puede ir vacio (ver arriba).
  aprobador        text,
  aprobador_nombre text,

  activo       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   text,

  CONSTRAINT politica_nivel_positivo_ck CHECK (nivel > 0),
  CONSTRAINT politica_nombre_no_vacio_ck CHECK (length(btrim(nombre)) > 0),
  -- Un nivel que no mira ni monto ni margen no mira nada.
  CONSTRAINT politica_con_criterio_ck
    CHECK (monto_desde IS NOT NULL OR margen_bajo IS NOT NULL),
  -- Un margen es una fraccion: 0.35 es 35%. Un 35 aqui seria 3500% y pasaria
  -- desapercibido porque "35" se ve bien.
  CONSTRAINT politica_margen_fraccion_ck
    CHECK (margen_bajo IS NULL OR (margen_bajo > 0 AND margen_bajo < 1)),
  CONSTRAINT politica_monto_positivo_ck
    CHECK (monto_desde IS NULL OR monto_desde > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS politica_nivel_uq
  ON comercial.politica_aprobacion (nivel);

COMMENT ON TABLE comercial.politica_aprobacion IS
  'Los niveles de aprobacion de la Compuerta 1. Editable solo por comercial:admin. Un nivel sin aprobador marca pero no bloquea.';
COMMENT ON COLUMN comercial.politica_aprobacion.margen_bajo IS
  'Fraccion, no porcentaje: 0.35 = por debajo de 35%. El CHECK lo exige para que un 35 mal tecleado no pase por bueno.';

DROP TRIGGER IF EXISTS politica_touch ON comercial.politica_aprobacion;
CREATE TRIGGER politica_touch BEFORE UPDATE ON comercial.politica_aprobacion
  FOR EACH ROW EXECUTE FUNCTION comercial.touch_updated_at();

-- Los valores de arranque: las cifras del 17-jul, tal cual, con el aprobador
-- vacio. Solo si la tabla esta vacia — correr dos veces no los duplica ni
-- pisa lo que alguien ya edito.
INSERT INTO comercial.politica_aprobacion (nivel, nombre, monto_desde, margen_bajo, updated_by)
SELECT 1, 'Revision de direccion', 500000.00, 0.3500, 'migracion-007'
 WHERE NOT EXISTS (SELECT 1 FROM comercial.politica_aprobacion);


-- ══ 3 · Lo que la compuerta vio, cada vez ══════════════════════════════════
-- APPEND-ONLY, como el historial de versiones. En esta version fuera de
-- politica SE MARCA y se envia igual, asi que el unico rastro de que la
-- compuerta miro es este; si no se guarda, "se envio marcada" es una frase
-- que nadie puede comprobar despues.
CREATE TABLE IF NOT EXISTS comercial.compuerta_envio (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  machote_id   uuid        NOT NULL REFERENCES comercial.machote(id),
  odoo_so_id   integer,

  -- Lo que se midio, congelado. Si mañana cambia la politica, este renglon
  -- sigue diciendo con que reglas paso.
  monto        numeric(18,2),
  moneda       text,
  monto_usd    numeric(18,2),
  margen       numeric(8,5),
  cuadra       boolean     NOT NULL,
  dentro_politica boolean  NOT NULL,
  motivos      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  politica     jsonb,

  actor        text        NOT NULL,
  actor_nombre text,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT compuerta_actor_no_vacio_ck CHECK (length(btrim(actor)) > 0),
  CONSTRAINT compuerta_motivos_lista_ck  CHECK (jsonb_typeof(motivos) = 'array')
);

CREATE INDEX IF NOT EXISTS compuerta_machote_ix
  ON comercial.compuerta_envio (machote_id, created_at DESC);

COMMENT ON TABLE comercial.compuerta_envio IS
  'Append-only: que vio la Compuerta 1 cada vez que alguien mando una cotizacion. Con la politica vigente congelada, para que el renglon siga siendo legible cuando la politica cambie.';


-- ══ 4 · Permisos ═══════════════════════════════════════════════════════════
-- `comercial_app` lee la politica y escribe la bitacora; la politica la EDITA
-- tambien, porque el panel de dirección vive detras del mismo rol y el
-- candado de quien puede es del token (comercial:admin), no del rol de base.
GRANT SELECT, INSERT, UPDATE         ON comercial.politica_aprobacion TO comercial_app;
GRANT SELECT, INSERT                 ON comercial.compuerta_envio     TO comercial_app;
