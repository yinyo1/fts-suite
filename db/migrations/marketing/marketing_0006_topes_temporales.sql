-- ═══════════════════════════════════════════════════════════════════════════
-- marketing_0006_topes_temporales.sql · Topes de tokens que cuadran con lo medido (#413)
--
-- ADITIVA y sin estructura nueva: solo cambia dos valores de marketing.config.
-- Medido con consumo.js en la prueba de producción del 15-oct (#413): una ficha de planta
-- limpia gastó 3,586,275 tokens, arriba del tope por ficha de 2.5 M (marketing_0004).
--
--   tope_tokens_ficha   2,500,000 → 4,000,000   (temporal)
--   tope_tokens_dia    15,000,000 → 25,000,000  por persona (temporal)
--
-- TEMPORALES: los definitivos se proponen en el #413 con la medición de la ficha en dos
-- modelos (búsqueda en Sonnet, criterio en Opus) y se aplican con otra migración.
-- Solo escribe si el valor sigue siendo el de marketing_0004: si alguien ya lo cambió a mano,
-- no se pisa. Correrla dos veces no hace nada la segunda.
-- Reversa: volver a poner 2500000 y 15000000 (otra migración).
-- Sin datos personales. Reglas de db/README.md (sin llaves dobles ni dólar).
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE marketing.config SET valor = v.valor, nota = v.nota
FROM (VALUES
  ('tope_tokens_ficha', '2500000',  '4000000',  'tokens por ficha (todo incluido), TEMPORAL desde marketing_0006 (#413): la ficha limpia midió 3.59 M'),
  ('tope_tokens_dia',   '15000000', '25000000', 'tokens por persona y día, TEMPORAL desde marketing_0006 (#413)')
) AS v(clave, antes, valor, nota)
WHERE marketing.config.clave = v.clave AND marketing.config.valor = v.antes;
