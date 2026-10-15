-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0007_cache_ponderada_topes.sql · La caché leída cuenta a 0.1 y topes definitivos (#413, Marketing v3)
--
-- ADITIVA. Dos cosas:
--   1. marketing.tokens_de() cuenta la caché leída a una décima (configurable en
--      marketing.config, clave cache_leida_milesimas = 100, o sea 0.100). Lo demás
--      (entrada, salida, caché escrita) cuenta completo, igual que antes.
--   2. Topes definitivos con ese conteo: 1,500,000 por ficha y 12,000,000 por persona y día.
--
-- Medido con consumo.js (chat.consumo, trabajo 7, 15-oct-2026 05:26 UTC), ficha de una planta
-- limpia del noreste en dos fases (Sonnet busca, Opus decide), actor de prueba:
--   total 1,625,441 = entrada 40 + salida 316 + caché leída 1,477,180 + caché escrita 147,905
--   Sonnet 984,327 · Opus 641,114 · 5 consultas web · 55.6 s · ficha lista con 3 decisores
--   con la caché leída a 0.1: 295,979  → cabe 5 veces en el tope de 1.5 M
-- Referencia: el trabajo 6 (todo Opus) midió 3,604,697; con este conteo serían unos 0.5 M.
--
-- Los topes solo se escriben si el valor sigue siendo el de marketing_0006 (o el de 0004,
-- por si 0006 no se aplicó): si alguien ya los cambió a mano, no se pisan.
-- Correrla dos veces no hace nada la segunda.
-- Reversa: otra migración que regrese tokens_de al cuerpo de 0004 y los topes a 4 M / 25 M.
-- Sin datos personales. Reglas de db/README.md: etiquetas de dólar con nombre, sin llaves dobles.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO marketing.config (clave, valor, nota) VALUES
  ('cache_leida_milesimas', '100', 'peso de la caché leída en tokens_de, en milésimas (100 = 0.1). marketing_0007 (#413)')
ON CONFLICT (clave) DO NOTHING;

-- STABLE (ya no IMMUTABLE) porque lee marketing.config. Nadie la usa en un índice.
CREATE OR REPLACE FUNCTION marketing.tokens_de(t jsonb) RETURNS bigint
LANGUAGE sql STABLE AS $tk7$
  SELECT coalesce((t->>'input')::bigint,0) + coalesce((t->>'output')::bigint,0) + coalesce((t->>'cache_escrita')::bigint,0)
       + round(coalesce((t->>'cache_leida')::bigint,0) * coalesce(marketing.cfg('cache_leida_milesimas'), 1000) / 1000.0)::bigint
$tk7$;

UPDATE marketing.config SET valor = v.valor, nota = v.nota
FROM (VALUES
  ('tope_tokens_ficha', ARRAY['4000000','2500000'],   '1500000',  'tokens por ficha con la caché leída a 0.1 (marketing_0007, #413). Medido: 0.30 M en dos fases'),
  ('tope_tokens_dia',   ARRAY['25000000','15000000'], '12000000', 'tokens por persona y día con la caché leída a 0.1 (marketing_0007, #413)')
) AS v(clave, antes, valor, nota)
WHERE marketing.config.clave = v.clave AND marketing.config.valor = ANY (v.antes);
