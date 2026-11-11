-- Reversa de conceptualizador_0082 (V1.67, #20). Quita la función que machotes-leer usa para pintar la delegación.
-- ORDEN: primero regresar comercial/machotes-leer a la versión anterior (si no, su consulta falla), luego esto.
DROP FUNCTION IF EXISTS conceptualizador.delegado_machote(text, text);
