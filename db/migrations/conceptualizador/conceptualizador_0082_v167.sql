-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0082 · V1.67 (fts-conceptualizador#20, Esteban 10-nov-2026) · LA PANTALLA DE MACHOTES VE LA DELEGACIÓN
--
-- Bloque A de la sesión de permisos (Mauricio como soporte de Richard y Montalvo). La delegación ya existe desde la V1.59
-- (puede_mover:<usuario> en conceptualizador.config, detrás de delegacion_v159) y el SERVIDOR ya la respeta en las dos
-- puertas: comercial/machote-guardar (buscar.sql: `ya.dueno = actor OR puede_mover(actor, ya.dueno)`) y el candado del
-- chat (db/075 puede_escribir_caso). Lo que faltaba es que la PANTALLA de machotes lo supiera: comercial/machotes-leer
-- solo marca `ajeno`, y la pantalla abre todo lo ajeno en solo lectura salvo préstamo o supervisor. Con esto
-- machotes-leer puede preguntar, por machote, si quien pide está autorizado por el dueño.
--
-- Interruptor NUEVO, APAGADO (sin renglón = apagado): delegacion_pantalla_v167 (prendido_para: persona o global).
--   Apagado: delegado_machote() contesta false para todos y la pantalla queda exactamente como hoy.
--   Prendido: true solo si el actor NO es el dueño y el dueño lo autorizó (puede_mover, que a su vez exige delegacion_v159).
-- Es solo para PINTAR (desbloquear campos): quien decide sigue siendo machote-guardar en cada guardado.
-- No da archivar ni ceder: esas puertas (machote-archivar, ceder) no leen puede_mover y no cambian.
-- Nada con nombres de personas. Ninguna tabla nueva. ORDEN: 0081 → 0082. Aditiva e idempotente. Reversa: reversas/082_reversa.sql.
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION conceptualizador.delegado_machote(p_actor text, p_dueno text) RETURNS boolean
LANGUAGE sql STABLE AS $dm82$
  SELECT coalesce(p_actor IS NOT NULL AND p_dueno IS NOT NULL AND btrim(p_actor) <> '' AND p_actor <> p_dueno
    AND conceptualizador.prendido_para('delegacion_pantalla_v167', NULL, p_actor)
    AND conceptualizador.puede_mover(p_actor, p_dueno), false)
$dm82$;
ALTER FUNCTION conceptualizador.delegado_machote(text, text) SECURITY DEFINER SET search_path = conceptualizador, public;
REVOKE ALL ON FUNCTION conceptualizador.delegado_machote(text, text) FROM PUBLIC;

DO $gr82$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    GRANT USAGE ON SCHEMA conceptualizador TO comercial_app;
    GRANT EXECUTE ON FUNCTION conceptualizador.delegado_machote(text, text) TO comercial_app;
  END IF;
END
$gr82$;
