-- reversa de la conceptualizador_0067 (#20 punto 2): se quitan las dos funciones del permiso de prueba. El renglón
-- interruptor:machote_zz_v164 se queda y no prende nada. ANTES de aplicarla, regresar machote-guardar y machotes-leer a su
-- versión sin comercial:zz (si ya se cambiaron), o esos workflows fallarían al llamar una función que ya no existe.
DROP FUNCTION IF EXISTS conceptualizador.zz_machote_ok(text, uuid, text);
DROP FUNCTION IF EXISTS conceptualizador.zz_machotes_visibles(text);
