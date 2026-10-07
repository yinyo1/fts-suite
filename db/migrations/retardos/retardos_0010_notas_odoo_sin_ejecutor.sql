-- ═══════════════════════════════════════════════════════════════════════════
-- retardos_0010_notas_odoo_sin_ejecutor · El go-live sigue siendo UNA bandera (#386)
--
-- Los envíos tipo 'odoo_nota' (nota en el chatter del empleado cuando llega una
-- hoja firmada) no tienen ejecutor: ningún workflow los manda. En sombra
-- por_enviar los marca 'omitido'; en real se quedaban 'pendiente' para siempre y
-- a las 3 h el latido reportaba OUTBOX_ATORADO (PASO_A_REAL.md §5). O sea que
-- cambiar modo a real exigía además un paso a mano.
--
-- Arreglo: mientras odoo_nota_ejecutor no sea true, un odoo_nota NACE omitido en
-- cualquier modo, con el motivo escrito. No se pierde nada: la hoja y su bitácora
-- quedan en Postgres; sólo no se copia la nota a Odoo. El día que exista el
-- ejecutor se pone odoo_nota_ejecutor = true y vuelven a quedar pendientes.
-- Sin guiones largos. Sin datos personales.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO retardos.config (clave, valor, descripcion, confirmado, actualizado_por) VALUES
 ('odoo_nota_ejecutor', 'false'::jsonb,
  'Hay un workflow que escribe en Odoo las notas de tipo odoo_nota. false: esas notas nacen omitidas en cualquier modo, para que no se atoren en el outbox (#386).',
  true, 'retardos_0010')
ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION retardos.trg_odoo_nota_sin_ejecutor() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.tipo = 'odoo_nota' AND NEW.estado = 'pendiente'
     AND NOT coalesce((retardos.cfg('odoo_nota_ejecutor') #>> '{}')::boolean, false) THEN
    NEW.estado := 'omitido';
    NEW.error := 'Sin ejecutor de notas en Odoo (odoo_nota_ejecutor = false). La hoja queda en Postgres (#386)';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS envio_odoo_nota ON retardos.envio;
CREATE TRIGGER envio_odoo_nota BEFORE INSERT ON retardos.envio
  FOR EACH ROW WHEN (NEW.tipo = 'odoo_nota') EXECUTE FUNCTION retardos.trg_odoo_nota_sin_ejecutor();

-- Lo que ya estuviera pendiente (en producción hoy: 0, porque en sombra se omiten).
UPDATE retardos.envio
   SET estado = 'omitido', error = 'Sin ejecutor de notas en Odoo (odoo_nota_ejecutor = false). La hoja queda en Postgres (#386)'
 WHERE tipo = 'odoo_nota' AND estado IN ('pendiente','fallido')
   AND NOT coalesce((retardos.cfg('odoo_nota_ejecutor') #>> '{}')::boolean, false);

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA retardos TO retardos_app;
