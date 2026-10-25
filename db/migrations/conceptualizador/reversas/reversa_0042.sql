-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0042 (V1.63e, #12): `acuse` vuelve a la de la db/003 (la _0042prev).
-- Con `analisis_v163e` en '0' no hace falta correrla: apagado, el acuse sale igual que antes.
-- ═══════════════════════════════════════════════════════════════════════════

DO $rv42$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'conceptualizador' AND p.proname = 'acuse_0042prev') THEN
    DROP FUNCTION conceptualizador.acuse(jsonb, text, boolean, boolean, boolean);
    ALTER FUNCTION conceptualizador.acuse_0042prev(jsonb, text, boolean, boolean, boolean) RENAME TO acuse;
  END IF;
END
$rv42$;
