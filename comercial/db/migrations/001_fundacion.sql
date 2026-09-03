-- ═══════════════════════════════════════════════════════════════════════════
-- 001_fundacion.sql · esquema comercial, rol de aplicación y bitácora
-- Issue #140 · reglas de fundación 1, 2, 4 y 5
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Bitácora de migraciones (regla 2) ──
-- Vive en public porque es de toda la suite, no solo de comercial.
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version      text        PRIMARY KEY,
  nombre       text        NOT NULL,
  sha256       text        NOT NULL,
  aplicada_at  timestamptz NOT NULL DEFAULT now(),
  aplicada_por text        NOT NULL DEFAULT current_user
);
COMMENT ON TABLE public.schema_migrations IS
  'Una fila por archivo de comercial/db/migrations/ aplicado. La base debe poder recrearse corriendo los archivos en orden.';

-- ── Esquema por dominio (regla 1) ──
-- Nada vive en public salvo la bitácora. operaciones/, rrhh/ entran igual el día que toque.
CREATE SCHEMA IF NOT EXISTS comercial;
COMMENT ON SCHEMA comercial IS 'Taller del módulo comercial: lo que Odoo NO modela. Nunca duplica Odoo (regla 6).';

-- ── Rol de aplicación con permisos mínimos (regla 5) ──
-- NOLOGIN a propósito: la contraseña NO vive en git. El único paso manual del
-- almacén es que un humano corra, una vez:
--     ALTER ROLE comercial_app WITH LOGIN PASSWORD '<generada en Railway>';
-- Ver docs/comercial/ALMACEN.md §"El único paso que no está en git".
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comercial_app') THEN
    CREATE ROLE comercial_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA comercial TO comercial_app;

-- ⚠ NO se otorga DELETE, a propósito (regla 4).
-- "Nada se borra" no queda encomendado a que el código se acuerde: la base
-- simplemente no acepta un DELETE de esta aplicación. El borrado lógico es
-- un UPDATE de deleted_at.
ALTER DEFAULT PRIVILEGES IN SCHEMA comercial
  GRANT SELECT, INSERT, UPDATE ON TABLES TO comercial_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA comercial
  GRANT USAGE, SELECT ON SEQUENCES TO comercial_app;

-- ── Auditoría automática (regla 4) ──
-- updated_at por trigger y no por el que escribe: un campo de auditoría que
-- depende de que cada INSERT/UPDATE se acuerde de ponerlo, tarde o temprano
-- no se pone.
CREATE OR REPLACE FUNCTION comercial.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- El renglon de public.schema_migrations lo inserta el runner, con el sha256
-- REAL del archivo. Un archivo no puede contener su propio hash, y un
-- checksum inventado es peor que no tenerlo.
