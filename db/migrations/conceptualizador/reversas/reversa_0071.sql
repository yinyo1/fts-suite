-- ═══════════════════════════════════════════════════════════════════════════
-- reversa de la conceptualizador_0071 (#20 parte 9): prendido_caso vuelve a la definición de la 0063 (caso → global, sin persona).
-- Los renglones interruptor:<n>@<persona> NO se borran (el motor los sigue leyendo): se apagan aparte.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.prendido_caso(p_nombre text, p_caso uuid) RETURNS boolean
LANGUAGE sql STABLE AS $pc63$
  SELECT coalesce(
    (SELECT btrim(c.valor) = '1' FROM conceptualizador.config c WHERE p_caso IS NOT NULL AND c.clave = 'interruptor:' || p_nombre || '@' || p_caso::text),
    conceptualizador.prendido(p_nombre))
$pc63$;
ALTER FUNCTION conceptualizador.prendido_caso(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.prendido_caso(text, uuid) FROM PUBLIC;
