-- ═══════════════════════════════════════════════════════════════════════════
-- 009_compromisos_comerciales.sql · el compromiso deja de ser un párrafo
-- Issue #244 (Estación 3) · sesión 3 del 15-sep-2026
--
-- ── EL PROBLEMA, MEDIDO ───────────────────────────────────────────────────
-- Sobre las 176 órdenes confirmadas de 2025-2026 de SERVICIOS FTS y de la LLC:
--
--     sin términos de pago ......  49 de 176
--     con incoterm ..............   0 de 176
--     con fecha comprometida ....   0 de 176
--     con vigencia .............. 176 de 176   (la pone Odoo sola)
--
-- Y la más grande sin términos de pago es SO11771, de 45,854,038.88 MXN.
--
-- El compromiso comercial SÍ existe: vive dentro del texto de las notas de la
-- orden ("Minimum firm commitment: two crew-weeks", "precios sujetos a ajuste
-- si el acero sube 5%", "cotización de carácter budgetary"). Ahí nadie lo
-- puede consultar, ni sumar, ni vigilar. No se puede contestar "cuánto hay
-- vendido a 120 días" ni "qué cotización venció".
--
-- Esta migración lo saca del párrafo y lo vuelve CAMPO.
--
-- ── POR QUÉ COLUMNAS Y NO UN jsonb ────────────────────────────────────────
-- Porque la pregunta que hay que poder contestar es agregada —cuánto, a qué
-- plazo, qué venció—, y eso sobre jsonb se puede pero se escribe mal y se
-- indexa peor. Lo único que va en jsonb son los HITOS, que son una lista de
-- longitud variable y no se consultan de a uno.
--
-- ── LO QUE ESTA MIGRACIÓN NO HACE ─────────────────────────────────────────
-- No toca el catálogo de `account.payment.term` de Odoo (45 términos, con
-- duplicados y un término llamado "."). Esa limpieza es de Esteban y de
-- Gerardo, y va aparte. Aquí sólo se guarda A CUÁL se apuntó.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════


-- ══ 1 · Los cinco compromisos, sobre el machote ════════════════════════════
-- Van en `machote` y no en `machote_version` porque son el compromiso VIGENTE
-- de la cotización, no una foto del costeo. Lo que se congela del momento de
-- emitir vive en la orden de Odoo y en `comercial.confirmacion`.

-- 1) TÉRMINOS DE PAGO. Tres piezas: a qué término de Odoo se apuntó, cuántos
--    días son (desnormalizado A PROPÓSITO: es la columna que contesta "cuánto
--    hay vendido a 120 días" sin salir a Odoo), y los hitos.
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS pago_termino_id    integer;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS pago_termino_texto text;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS pago_dias          integer;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS pago_hitos         jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) TÉRMINOS COMERCIALES. El código del incoterm (EXW, FOB, DDP…), que es lo
--    que se guarda; el id de Odoo se resuelve al emitir.
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS incoterm_code text;

-- 3) TIEMPO DE ENTREGA. Dos formas, y las dos hacen falta: el texto es lo que
--    lee el cliente ("8 a 10 semanas después del anticipo") y la fecha es lo
--    que se puede vigilar. Si sólo se guardara el texto, volveríamos al
--    párrafo — que es justo el problema que esto resuelve.
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS entrega_texto text;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS entrega_fecha date;

-- 4) MONEDA. Ya vive en `machote_version.moneda` desde la 003 y la manda el
--    machote; no se duplica aquí. La orden nace con su `pricelist_id` por esa
--    moneda (sesión 1) y eso se vuelve a comprobar en cada emisión.

-- 5) VIGENCIA de la cotización.
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS vigencia_dias  integer;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS vigencia_hasta date;

-- Quién los capturó y cuándo. Un compromiso sin autor no es un compromiso.
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS compromisos_at  timestamptz;
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS compromisos_por text;

COMMENT ON COLUMN comercial.machote.pago_dias IS
  'Dias de credito, desnormalizado del termino a proposito: es la columna que contesta "cuanto hay vendido a 120 dias" sin salir a Odoo. 0 = contado.';
COMMENT ON COLUMN comercial.machote.pago_hitos IS
  'Lista de {concepto, porcentaje, cuando}. En jsonb porque es de longitud variable y no se consulta de a uno. NO se crea un account.payment.term por trato: asi se llego a 45 terminos en Odoo.';
COMMENT ON COLUMN comercial.machote.entrega_fecha IS
  'La fecha vigilable. El texto es lo que lee el cliente; sin la fecha, el compromiso vuelve a ser un parrafo que nadie puede sumar.';

-- Un compromiso capturado tiene autor, igual que el archivado (006), la orden
-- (007) y la confirmacion (008).
ALTER TABLE comercial.machote DROP CONSTRAINT IF EXISTS machote_compromisos_con_autor_ck;
ALTER TABLE comercial.machote ADD  CONSTRAINT machote_compromisos_con_autor_ck
  CHECK (compromisos_at IS NULL
      OR (compromisos_por IS NOT NULL AND length(btrim(compromisos_por)) > 0));

-- Los hitos son una LISTA. Un objeto suelto aqui seria un dato que la pantalla
-- no sabe pintar y que nadie descubriria hasta que reventara al leerlo.
ALTER TABLE comercial.machote DROP CONSTRAINT IF EXISTS machote_hitos_lista_ck;
ALTER TABLE comercial.machote ADD  CONSTRAINT machote_hitos_lista_ck
  CHECK (jsonb_typeof(pago_hitos) = 'array');

-- Dias de credito negativos no existen. Y un plazo de mas de dos anios es un
-- dedazo, no una politica de credito.
ALTER TABLE comercial.machote DROP CONSTRAINT IF EXISTS machote_pago_dias_ck;
ALTER TABLE comercial.machote ADD  CONSTRAINT machote_pago_dias_ck
  CHECK (pago_dias IS NULL OR (pago_dias >= 0 AND pago_dias <= 730));

ALTER TABLE comercial.machote DROP CONSTRAINT IF EXISTS machote_vigencia_dias_ck;
ALTER TABLE comercial.machote ADD  CONSTRAINT machote_vigencia_dias_ck
  CHECK (vigencia_dias IS NULL OR (vigencia_dias > 0 AND vigencia_dias <= 365));

-- El incoterm es un codigo de tres letras MAYUSCULAS. Se guarda el CODIGO y no
-- el id de Odoo porque el codigo es estable y universal; el id es de esta base.
--
-- Escrito SIN el ancla de fin de la expresion regular, a proposito. Ese ancla
-- pegada a la comilla de cierre es uno de los patrones de reemplazo de
-- JavaScript, y este archivo viaja al runner de migraciones por una expresion
-- de n8n (CLAUDE.md 20 #10). La comprobacion es la misma —tres letras, y todas
-- mayusculas— y el archivo queda con CERO caracteres de ese signo.
ALTER TABLE comercial.machote DROP CONSTRAINT IF EXISTS machote_incoterm_ck;
ALTER TABLE comercial.machote ADD  CONSTRAINT machote_incoterm_ck
  CHECK (incoterm_code IS NULL
      OR (length(incoterm_code) = 3
          AND incoterm_code = upper(incoterm_code)
          AND incoterm_code ~ '[A-Z][A-Z][A-Z]'));

-- Para la pregunta que hoy no se puede contestar: que hay vendido a que plazo,
-- y que esta por vencer.
CREATE INDEX IF NOT EXISTS machote_pago_dias_ix
  ON comercial.machote (pago_dias)
  WHERE deleted_at IS NULL AND pago_dias IS NOT NULL;

CREATE INDEX IF NOT EXISTS machote_vigencia_ix
  ON comercial.machote (vigencia_hasta)
  WHERE deleted_at IS NULL AND vigencia_hasta IS NOT NULL;


-- ══ 2 · El documento propuesto: secciones, lineas y notas ══════════════════
-- La orden que FTS emite no es una linea por seccion. Medido sobre las mismas
-- 176 ordenes: 446 lineas con precio, 308 notas y solo 33 secciones — y apenas
-- 23 de 176 ordenes (13%) llevan alguna seccion, contra 123 (70%) que llevan
-- notas. El contrato vive en las NOTAS.
--
-- Esto guarda el documento que la suite PROPONE y que el equipo EDITA antes de
-- emitir. Se guarda aparte del costeo (`machote_version.documento`) porque son
-- dos cosas distintas: una es lo que cuesta, la otra es lo que se le dice al
-- cliente. Mezclarlas obligaria a versionar el costeo cada vez que alguien
-- corrige una coma de una nota.
CREATE TABLE IF NOT EXISTS comercial.documento_orden (
  machote_id  uuid        PRIMARY KEY REFERENCES comercial.machote(id),

  -- [{tipo:'seccion'|'linea'|'nota', texto, cantidad, precio, producto_id}]
  -- El ORDEN del arreglo es el orden del documento: es lo que el equipo
  -- arrastra en pantalla, y es lo que se escribe en `sequence` al emitir.
  bloques     jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- De que plantilla se partio, para saber si alguien la edito toda o la dejo
  -- tal cual. No decide nada: es para poder mejorar las plantillas mirando
  -- cuales se reescriben siempre.
  plantilla   text,

  actualizado_at  timestamptz NOT NULL DEFAULT now(),
  actualizado_por text,

  CONSTRAINT documento_bloques_lista_ck CHECK (jsonb_typeof(bloques) = 'array')
);

COMMENT ON TABLE comercial.documento_orden IS
  'El documento que la suite PROPONE para la orden -secciones, lineas con precio y notas- y que el equipo edita antes de emitir. Aparte del costeo: una cosa es lo que cuesta y otra lo que se le dice al cliente.';

DROP TRIGGER IF EXISTS documento_orden_touch ON comercial.documento_orden;
CREATE TRIGGER documento_orden_touch BEFORE UPDATE ON comercial.documento_orden
  FOR EACH ROW EXECUTE FUNCTION comercial.touch_updated_at();


-- ══ 3 · Permisos ═══════════════════════════════════════════════════════════
-- Sin DELETE, como en todo este esquema: aqui no se borra.
GRANT SELECT, INSERT, UPDATE ON comercial.documento_orden TO comercial_app;
