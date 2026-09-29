-- ═══════════════════════════════════════════════════════════════════════════
-- 011_machote_orden.sql · la liga entre una cotización de la suite y su orden
-- Issue #294 (Estación 3) · sesión del 29-sep-2026
--
-- ── POR QUÉ HACE FALTA UNA TABLA, Y NO UN CAMPO ───────────────────────────
-- Hoy la pregunta «¿a qué orden de venta pertenece este machote?» se contesta
-- de DOS maneras distintas, y las dos están mal para lo que ahora se necesita:
--
--   1. `m.so` — un campo de TEXTO que alguien teclea. Lo dice el propio código
--      («es un campo que alguien TECLEA», `app.js` en `ligadaTxt`). Un texto
--      no liga nada: no se puede navegar, no se puede validar, y dos personas
--      lo escriben distinto.
--
--   2. `odoo_so_id` en la LIBRETA DE SINCRONIZACIÓN del navegador, que sólo
--      escribe el servidor cuando ESTE navegador creó la orden.
--
-- El segundo es el que manda hoy, y tiene el defecto exacto de la regla §20 #13
-- de CLAUDE.md: **un índice que sólo cubre parte del universo contesta «no» por
-- lo que no cubre**. La libreta está indexada por `id_local` y guarda SÓLO lo
-- propio, así que una orden creada por otra persona, o ligada desde el lado de
-- la orden, devuelve `null` — y la pantalla dice «Sin orden ligada» de algo que
-- sí existe. Es la misma forma del `idServidor()` que reportaba «todavía no
-- llega al servidor» de una cotización con quince versiones allá.
--
-- La liga tiene que vivir donde la ven TODOS, o sea aquí.
--
-- ── LA CARDINALIDAD, Y LA DECISIÓN QUE ENCIERRA ───────────────────────────
-- Ya está fijado que una tarjeta de CRM tiene varias órdenes y varios machotes.
-- Lo que faltaba decidir es qué pasa si DOS machotes apuntan a la MISMA orden.
--
-- Esta migración lo **permite**, con una condición. El razonamiento:
--
--   · Impedirlo obliga a DESLIGAR el correcto para poder ligar el otro, y el
--     modo de fallo de eso es que alguien suelte la liga buena para probar.
--     Es la misma lección del descuadre de la PO: un candado sin salida no
--     produce cumplimiento, produce elusión.
--   · Permitirlo sin más deja una ambigüedad que SÍ importa: la Confirmación
--     lee «el» machote para sacar el contacto, el IVA y la PO. Con dos, no se
--     sabe cuál manda, y eso no se puede dejar al azar de un ORDER BY.
--
-- Así que: **varios machotes por orden, y exactamente UNO principal.** El
-- principal es el que lee la Confirmación; los demás quedan ligados, visibles y
-- consultables. Los dos índices de abajo son esa decisión escrita en la base,
-- no en un `if` del navegador.
--
-- Revertir la decisión es cambiar un índice: quitar `machote_orden_principal_uq`
-- deja varios principales (mala idea), y volverlo un UNIQUE sobre `odoo_so_id`
-- a secas prohíbe la multiplicidad. Queda dicho para que la siguiente sesión no
-- tenga que adivinar cuál era la intención.
--
-- ── NADA SE BORRA ─────────────────────────────────────────────────────────
-- Igual que en el resto del esquema. Desligar es escribir `desligado_at` y
-- quién lo hizo: quién ligó qué a qué, y cuándo dejó de estarlo, es justo el
-- rastro que hace falta el día que un importe no cuadre.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ 1 · La liga ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS comercial.machote_orden (
  id            bigserial   PRIMARY KEY,
  machote_id    uuid        NOT NULL REFERENCES comercial.machote(id),

  -- Los dos datos de Odoo. El id es la llave; el nombre es para poder ENSEÑAR
  -- la liga sin ir a Odoo en cada renglón de una lista de ochenta.
  odoo_so_id    integer     NOT NULL,
  odoo_so_name  text,

  -- El que manda para la Confirmación. Ver el razonamiento de arriba.
  principal     boolean     NOT NULL DEFAULT true,

  -- De dónde salió la liga. Importa para el forense: una liga que puso el
  -- servidor al crear la orden es distinta de una que alguien eligió a mano.
  origen        text        NOT NULL DEFAULT 'manual',

  ligado_por    text        NOT NULL,
  ligado_at     timestamptz NOT NULL DEFAULT now(),

  -- Desligar NO borra el renglón.
  desligado_por text,
  desligado_at  timestamptz,
  motivo        text,

  CONSTRAINT machote_orden_origen_ck
    CHECK (origen IN ('manual', 'al_crear', 'migracion')),
  -- Un desligue sin autor es un cambio sin dueño.
  CONSTRAINT machote_orden_desligue_ck
    CHECK ((desligado_at IS NULL) = (desligado_por IS NULL))
);

COMMENT ON TABLE comercial.machote_orden IS
  'Que cotizacion de la suite corresponde a que orden de venta de Odoo. Vive aqui y no en la libreta del navegador porque la libreta solo guarda lo propio y contesta NO por lo que no cubre. Nada se borra: desligar escribe desligado_at.';

COMMENT ON COLUMN comercial.machote_orden.principal IS
  'El machote que lee la Confirmacion cuando una orden tiene mas de uno ligado. Exactamente uno por orden viva.';

-- ── Los dos candados de cardinalidad ──────────────────────────────────────
-- UNA orden viva por machote: un machote no pertenece a dos órdenes a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS machote_orden_machote_uq
  ON comercial.machote_orden (machote_id)
  WHERE desligado_at IS NULL;

-- UN principal por orden. Varios machotes pueden colgar de la misma orden, pero
-- sólo uno manda — y cuál, está escrito, no se deduce.
CREATE UNIQUE INDEX IF NOT EXISTS machote_orden_principal_uq
  ON comercial.machote_orden (odoo_so_id)
  WHERE desligado_at IS NULL AND principal;

-- Por donde se busca desde el lado de la ORDEN, que es la pantalla nueva.
CREATE INDEX IF NOT EXISTS machote_orden_so_ix
  ON comercial.machote_orden (odoo_so_id)
  WHERE desligado_at IS NULL;


-- ══ 2 · Los contactos de prueba que la vista esconde ═══════════════════════
-- Medido el 29-sep-2026 sobre Odoo: hay 9 órdenes de contactos que son basura
-- de prueba, 2 de ellas confirmadas. Son el 0.17% de 5,217.
--
-- ⚠️ Y la lista es de **ids**, no de nombres, a propósito. Filtrar por «el
-- nombre contiene prueba» tiraría por lo menos dos clientes REALES cuya razón
-- social empieza con esa palabra — uno de ellos de subestaciones eléctricas.
-- Un id no se equivoca de cliente; una palabra sí. Es la misma trampa de §20
-- #18: el filtro que no discrimina se ve idéntico al que sí.
--
-- Vive en la base y no en el código para que agregar uno sea un INSERT y no un
-- despliegue.
CREATE TABLE IF NOT EXISTS comercial.odoo_contacto_prueba (
  odoo_partner_id integer     PRIMARY KEY,
  nota            text        NOT NULL,
  agregado_por    text        NOT NULL,
  agregado_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE comercial.odoo_contacto_prueba IS
  'Contactos de Odoo que son basura de prueba. Por ID, nunca por nombre: hay clientes reales cuya razon social contiene la palabra prueba. La vista de ordenes los esconde por omision y los puede ensenar con un interruptor.';

INSERT INTO comercial.odoo_contacto_prueba (odoo_partner_id, nota, agregado_por)
VALUES
  (2260, 'ZZ-PRUEBA A3 — vendor de las pruebas del candado A3 (junio 2026). 6 ordenes, 2 confirmadas.', 'migracion_011'),
  (1560, 'prueba lead — 3 ordenes en borrador.', 'migracion_011')
ON CONFLICT (odoo_partner_id) DO NOTHING;


-- ══ 3 · Permisos ═══════════════════════════════════════════════════════════
-- Sin DELETE, como en todo el esquema.
GRANT SELECT, INSERT, UPDATE ON comercial.machote_orden          TO comercial_app;
GRANT SELECT, INSERT, UPDATE ON comercial.odoo_contacto_prueba   TO comercial_app;
GRANT USAGE, SELECT ON SEQUENCE comercial.machote_orden_id_seq   TO comercial_app;
