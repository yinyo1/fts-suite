-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0071 · V1.64a parte 9 (fts-conceptualizador#20 punto 2, va de Esteban 1-nov-2026) · la base lee el interruptor
-- POR PERSONA (el dueño del caso)
--
-- Medido en la parte 8 (#20, nota de traspaso, requisito 0): en la base, `voz_chat_v164` y `una_cotizacion_v164` se resuelven con
-- prendido_caso (db/063: caso → global, SIN persona). El motor ya resuelve caso → dueño del caso → global (659b202e,
-- herramientas/motor/interruptores.js), así que un renglón `interruptor:<n>@ricardo.hernandez` prendía el lado del motor pero no
-- hacía que la nota del chat de Ricardo entrara como ráfaga. Esta migración:
--   prendido_caso(nombre, caso): 1 · el renglón `interruptor:<n>@<caso>` manda si existe (prende O apaga ese caso);
--                                2 · si no, el renglón `interruptor:<n>@<autor del caso>` (el dueño), si existe;
--                                3 · si no, el global.
--   Es la misma regla que prendido_para(nombre, caso, actor) de la 0064 con actor = dueño del caso, y que el motor.
-- Nada más cambia: misma firma, mismos llamadores (orden_del_caso_v164, religar_orden_v164, ligar_machote_robot_v163e, api_suite,
-- voz_rafaga_de_chat). Sin renglones `@persona` de esos nombres el resultado es idéntico al de la 0063 (medido: hoy no hay ninguno
-- de una_cotizacion_v164 ni de voz_chat_v164, ver #20).
-- ORDEN: 0070 → 0071. Aditiva e idempotente. Reversa: reversas/071_reversa.sql (vuelve a la definición de la 0063).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.prendido_caso(p_nombre text, p_caso uuid) RETURNS boolean
LANGUAGE sql STABLE AS $pc71$
  SELECT coalesce(
    (SELECT btrim(c.valor) = '1' FROM conceptualizador.config c WHERE p_caso IS NOT NULL AND c.clave = 'interruptor:' || p_nombre || '@' || p_caso::text),
    (SELECT btrim(c.valor) = '1' FROM conceptualizador.caso k JOIN conceptualizador.config c ON c.clave = 'interruptor:' || p_nombre || '@' || k.autor
      WHERE p_caso IS NOT NULL AND k.id = p_caso AND k.autor IS NOT NULL AND btrim(k.autor) <> ''),
    conceptualizador.prendido(p_nombre))
$pc71$;
ALTER FUNCTION conceptualizador.prendido_caso(text, uuid) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.prendido_caso(text, uuid) FROM PUBLIC;
