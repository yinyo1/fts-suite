-- ═══════════════════════════════════════════════════════════════════════════
-- conceptualizador_0028 · V1.58 (fts-conceptualizador#12): interruptores de «Destrabar cotizaciones»
--
-- Solo agrega 6 interruptores, todos en '0' (con todos apagados, la pantalla y el motor son los de la V1.57b):
--   piso_v158        el motor escribe `excepcion_margen` en el machote (decreto ESCRITO de Esteban) → el piso de margen deja pasar
--   estado_odoo_v158 tarjeta de estado inmediata en los clics que esperan a Odoo + visor propio del PDF (pdf.js)
--   niveles_v158     N1–N5 con nombre corto, nota al tocarlos y «Cotizar con referencias» en palabras
--   menu_vista_v158  dos entradas en el ⋮: vista para el cliente (directa) e interna (pregunta antes)
--   actualizar_v158  el rayito ofrece «Actualizar SO… en Odoo» cuando la orden salió sin tabla de pagos o sin condición única
--   ligas_v158       liga completa con SKU, tienda y fecha en la vista interna; 🔴 en los renglones viejos sin liga de producto
-- Lo que NO cambia: ningún interruptor existente, ninguna tabla, ningún modo.
-- Reversa: reversas/reversa_0028.sql (la lista de la 0027; los renglones de config se quedan, sin uso).
-- Reglas del runner: sin llaves dobles, sin dos dólares juntos, sin dólar antes de comilla, ampersand, acento grave o dígito;
-- etiquetas con nombre. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION conceptualizador.interruptores_nombres() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $in28$
  SELECT ARRAY['estados_reales','cerrar_colgados','arranque_auto','saltar_sin_novedad','relevo_v152','aviso_motor_caido',
               'experimento_contexto','tope_v152','moneda_decreto','margen_por_seccion','un_solo_dato','menu_hoja',
               'robot_config_base',
               'bajar_solo_nuevo','contestar_guardado','acciones_sin_modelo','robot_al_100','motor_v153','supuesto_usd',
               'decretos_destino','duplicados','vista_decretos','salud_diaria',
               'leer_mas','bolita_acciones','tarjetas_colapsadas','pantalla_v153',
               'condiciones_caso','nucleo_chat','machote_chat','enviar_cliente','rastreo_respuestas',
               'cierre_tarjetas','resumen_v155','aprende_v155','ligas_v155','menos_texto','ficha_cliente',
               'arriendo_v157','alarmas_v157','git_v157','juntar_revisa','acuse_v157','recalculo_v157','tokens_v157',
               'regla15_v157','pago_decreto','horario_autor','tarjeta_v157','correo_v157','vista_cliente',
               'piso_v158','estado_odoo_v158','niveles_v158','menu_vista_v158','actualizar_v158','ligas_v158']
$in28$;

INSERT INTO conceptualizador.config (clave, valor)
SELECT 'interruptor:' || n, '0' FROM unnest(conceptualizador.interruptores_nombres()) n
ON CONFLICT (clave) DO NOTHING;
