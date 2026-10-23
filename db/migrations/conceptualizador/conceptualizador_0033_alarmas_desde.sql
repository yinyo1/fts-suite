-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0033 · V1.62a (fts-conceptualizador#12): las alarmas y el aviso de tarjetas cuentan desde que se prendió su
-- interruptor, no desde hace 24 h.
--
-- Por qué: al prender ruido_v162 en producción (23-oct 05:19 UTC = 23:19 CST del 22-oct) salió de inmediato la alarma
-- ruido:1104, un «Sin cambios pendientes» de las 17:26 CST publicado con el interruptor APAGADO. Condición de paro: se apagó en
-- 45 s (config_cambio 65 y 66). Medido el mismo defecto en los demás (ejecución 612802):
--   · tarjetas_v162 · 12 tarjetas propuestas de 16 al 21-oct: alarma tarjeta_vieja inmediata y 12 avisos al chat a las 7:00
--                     diciendo «lleva 158 h sin aplicarse» de tarjetas que nadie pudo ver avisadas;
--   · cuadre_v162   · la falla 1 (NO_CUADRA de Nalco, 22-oct 15:33 CST) y el ciclo de Nalco (3 CONFLICTO_DE_PRECIOS) alarmaban
--                     sin que pasara nada nuevo;
--   · ruido_v162    · 31 «Sin cambios» de las 24 h previas.
-- Arreglo: prendido_desde(nombre) = la última vez que config_cambio lo puso en '1' (-infinity si nunca se registró: igual que
-- la 0032). Cada alarma solo cuenta lo que pasó DESPUÉS, y la tarjeta vieja cuenta sus horas desde
-- greatest(creada, prendido). Apagados, todo sale igual que con la 0032 (las ramas ni corren). Reversa: reversas/033_reversa.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.prendido_desde(p_nombre text) RETURNS timestamptz
LANGUAGE sql STABLE AS $pd33$
  SELECT coalesce((SELECT max(c.created_at) FROM conceptualizador.config_cambio c
                    WHERE c.clave = 'interruptor:' || p_nombre AND btrim(c.despues) = '1'), '-infinity'::timestamptz)
$pd33$;
REVOKE ALL ON FUNCTION conceptualizador.prendido_desde(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION conceptualizador.alarmas_motor(p_llave text DEFAULT 'conceptualizador') RETURNS jsonb
LANGUAGE plpgsql STABLE AS $am33$
DECLARE
  v_r jsonb := conceptualizador.alarmas_motor_0032prev(p_llave);
  v_h int := coalesce(conceptualizador.cfg('tarjeta_sin_aplicar_horas'), 24);
  x   record;
BEGIN
  IF p_llave <> 'conceptualizador' THEN RETURN v_r; END IF;
  IF conceptualizador.prendido('tarjetas_v162') THEN
    SELECT a.id, a.created_at, a.titulo, k.carpeta INTO x FROM conceptualizador.accion a JOIN conceptualizador.caso k ON k.id = a.caso_id
     WHERE a.estado = 'propuesta' AND a.tipo IN ('crear_machote','crear_borrador','enviada') AND NOT k.demo AND k.estado IN ('abierto','enviada')
       AND greatest(a.created_at, conceptualizador.prendido_desde('tarjetas_v162')) < now() - make_interval(hours => v_h + 24) ORDER BY a.id LIMIT 1;
    IF x.id IS NOT NULL THEN
      v_r := v_r || conceptualizador.alarma('tarjeta_vieja', x.id::text, x.created_at,
        'La tarjeta «' || left(coalesce(x.titulo, ''), 80) || '» (acción ' || x.id || ') lleva más de ' || (v_h + 24) || ' h sin aplicarse; su dueño ya tuvo el aviso en el chat.',
        'Pregúntale al dueño si ese cambio sigue: si sí, que toque la tarjeta; si no, que la descarte.', 'tarjeta-vieja', jsonb_build_object('accion_id', x.id, 'caso', x.carpeta));
    END IF;
  END IF;
  IF conceptualizador.prendido('oportunidad_v162') THEN
    SELECT k.id, (k.oportunidad_elegida->>'at')::timestamptz AS at, k.carpeta INTO x FROM conceptualizador.caso k
     WHERE k.oportunidad_elegida->>'modo' = 'crear' AND k.oportunidad_id IS NULL AND NOT k.demo
       AND (k.oportunidad_elegida->>'at')::timestamptz < now() - interval '1 hour'
       AND (k.oportunidad_elegida->>'at')::timestamptz > conceptualizador.prendido_desde('oportunidad_v162') ORDER BY k.id LIMIT 1;
    IF x.id IS NOT NULL THEN
      v_r := v_r || conceptualizador.alarma('oportunidad_perdida', x.id::text, x.at,
        'Una oportunidad que la persona pidió crear lleva más de 1 h sin crearse (caso ' || coalesce(x.carpeta, x.id::text) || ').',
        'La elección está guardada en el caso: el siguiente «Crear borrador» la crea. Si la orden sigue frenada, revisa su falla de Odoo.', 'oportunidad-perdida',
        jsonb_build_object('caso', x.carpeta));
    END IF;
  END IF;
  IF conceptualizador.prendido('cuadre_v162') THEN
    SELECT f.id, f.at, f.codigo, k.carpeta INTO x FROM conceptualizador.falla_odoo f JOIN conceptualizador.caso k ON k.id = f.caso_id
     WHERE f.codigo IN ('NO_CUADRA','PAGO_NO_CUADRA') AND f.at > greatest(now() - interval '24 hours', conceptualizador.prendido_desde('cuadre_v162')) AND NOT k.demo ORDER BY f.id DESC LIMIT 1;
    IF x.id IS NOT NULL THEN
      v_r := v_r || conceptualizador.alarma('no_cuadra', x.id::text, x.at,
        'Una cotización no salió a Odoo por ' || x.codigo || ' (caso ' || coalesce(x.carpeta, '?') || '): el machote, la cotización o los hitos no dicen lo mismo.',
        'La persona tiene el botón que lo arregla en su chat. Si se repite en el mismo caso, revisa por qué el motor propone algo que no cuadra.', 'no-cuadra',
        jsonb_build_object('falla_id', x.id, 'codigo', x.codigo, 'caso', x.carpeta));
    END IF;
  END IF;
  IF conceptualizador.prendido('cuadre_v162') THEN
    FOR x IN SELECT k.id, k.carpeta, conceptualizador.ciclo_de(k.id) AS c FROM conceptualizador.caso k
              WHERE NOT k.demo AND k.estado IN ('abierto','enviada')
                AND EXISTS (SELECT 1 FROM conceptualizador.falla_odoo f WHERE f.caso_id = k.id AND f.at > greatest(now() - interval '24 hours', conceptualizador.prendido_desde('cuadre_v162'))) LOOP
      CONTINUE WHEN x.c IS NULL;
      v_r := v_r || conceptualizador.alarma('ciclo', x.id::text, (x.c->>'hasta')::timestamptz,
        'El caso ' || coalesce(x.carpeta, x.id::text) || ' cayó ' || (x.c->>'veces') || ' veces en ' || (x.c->>'codigo') || ' sobre la misma cotización en 24 h.',
        'El motor ya no propone ese botón y dice la causa con las dos cifras. Si sigue, revisa la versión vigente del machote contra la cotización.', 'ciclo',
        jsonb_build_object('caso', x.carpeta, 'codigo', x.c->>'codigo', 'veces', (x.c->>'veces')::int));
      EXIT;
    END LOOP;
  END IF;
  IF conceptualizador.prendido('ruido_v162') THEN
    SELECT m.id, m.created_at, k.carpeta INTO x FROM conceptualizador.mensaje m JOIN conceptualizador.caso k ON k.id = m.caso_id
     WHERE m.rol = 'motor' AND m.texto = 'Sin cambios pendientes en este caso.' AND m.created_at > greatest(now() - interval '24 hours', conceptualizador.prendido_desde('ruido_v162')) ORDER BY m.id DESC LIMIT 1;
    IF x.id IS NOT NULL THEN
      v_r := v_r || conceptualizador.alarma('ruido', x.id::text, x.created_at,
        'Se publicó un «Sin cambios pendientes» con ruido_v162 prendido (caso ' || coalesce(x.carpeta, '?') || ').',
        'Revisa que procesa.js mande `silencio` (un motor con código viejo no lo manda).', 'ruido', jsonb_build_object('mensaje_id', x.id));
    END IF;
  END IF;
  RETURN v_r;
END
$am33$;

CREATE OR REPLACE FUNCTION conceptualizador.tarjetas_viejas_avisar(p_ahora timestamptz DEFAULT now()) RETURNS int
LANGUAGE plpgsql AS $tv33$
DECLARE
  v_h int := coalesce(conceptualizador.cfg('tarjeta_sin_aplicar_horas'), 24);
  a   record;
  v_n int := 0;
BEGIN
  IF NOT conceptualizador.prendido('tarjetas_v162') OR NOT conceptualizador.en_ventana('07:00', '21:00', p_ahora) THEN RETURN 0; END IF;
  FOR a IN SELECT x.id, x.caso_id, x.tipo, x.titulo, x.created_at
             FROM conceptualizador.accion x JOIN conceptualizador.caso k ON k.id = x.caso_id
            WHERE x.estado = 'propuesta' AND x.tipo IN ('crear_machote','crear_borrador','enviada') AND x.aviso_viejo_at IS NULL
              AND greatest(x.created_at, conceptualizador.prendido_desde('tarjetas_v162')) < p_ahora - make_interval(hours => v_h) AND NOT k.demo AND k.estado IN ('abierto','enviada')
            ORDER BY x.id LIMIT 20 FOR UPDATE OF x SKIP LOCKED LOOP
    UPDATE conceptualizador.accion SET aviso_viejo_at = now() WHERE id = a.id;
    INSERT INTO conceptualizador.mensaje (caso_id, rol, autor, texto) VALUES (a.caso_id, 'sistema', 'tarjetas',
      'La tarjeta «' || left(coalesce(a.titulo, a.tipo), 120) || '» lleva ' || floor(extract(epoch FROM p_ahora - a.created_at) / 3600)::int ||
      ' h sin aplicarse, así que ese cambio no ha llegado ' || CASE WHEN a.tipo = 'crear_machote' THEN 'al machote' ELSE 'a Odoo' END ||
      '. Si todavía va, tócala; si ya no, descártala.');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$tv33$;

REVOKE ALL ON FUNCTION conceptualizador.alarmas_motor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION conceptualizador.tarjetas_viejas_avisar(timestamptz) FROM PUBLIC;
