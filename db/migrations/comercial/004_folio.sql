-- ═══════════════════════════════════════════════════════════════════════════
-- 004_folio.sql · el número con el que se habla de una cotización
-- Issue #140 · sesión 6 (2026-09-09)
--
-- El problema: un machote tenía dos identificadores y ninguno servía para
-- hablar de él. El `id_local` lo inventa el navegador (`M-1788841740067`) y
-- nadie lo dicta por teléfono; el uuid del servidor menos. Hacía falta un
-- número corto, legible y que no choque.
--
-- LA TENSIÓN, y cómo se resuelve: un folio sin choques tiene que asignarlo el
-- servidor, pero un machote recién capturado y todavía sin subir no tiene
-- servidor. La respuesta NO es que el navegador proponga uno —dos personas
-- capturando a la vez chocarían, y el choque saldría justo al subir, que es
-- el peor momento—: es que **mientras no ha subido, no tiene folio**, y la
-- pantalla lo dice con esas palabras.
--
-- Lo asigna una SECUENCIA como DEFAULT de la columna. Así ningún código tiene
-- que acordarse de pedirlo, y `nextval` es atómico: dos INSERT simultáneos
-- reciben números distintos aunque ocurran en el mismo milisegundo. El índice
-- único de abajo es la red por si algún día alguien escribe el folio a mano.
--
-- POR QUÉ NO LLEVA AÑO Y NO SE REINICIA: si se reiniciara cada año, el año
-- sería obligatorio para desambiguar y la forma hablada quedaría larga para
-- siempre. Y si llevara año sin reiniciarse, el año sería adorno: la gente lo
-- dejaría de decir, y entonces «el 142» no se sabría si lo lleva o no.
-- Un solo contador, sin año, es lo más corto que sigue siendo único.
--
-- UN NÚMERO NO SE REUSA. `deleted_at` no libera el folio, y la secuencia no
-- devuelve lo que ya entregó. Los huecos que se vean son la prueba de que
-- nada se recicla — incluidos los huecos de una transacción que falló, que es
-- comportamiento normal de una secuencia y aquí es una característica.
--
-- Idempotente: se puede correr dos veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ La columna ═════════════════════════════════════════════════════════════
-- Se agrega SIN default para que las filas que ya existen queden en NULL, y
-- el default se pone después. Al revés, Postgres rellenaría las viejas en el
-- orden que se le antojara y el folio dejaría de seguir a la fecha de alta.
ALTER TABLE comercial.machote ADD COLUMN IF NOT EXISTS folio integer;

CREATE SEQUENCE IF NOT EXISTS comercial.machote_folio_seq
  AS integer START WITH 1 OWNED BY comercial.machote.folio;

ALTER TABLE comercial.machote
  ALTER COLUMN folio SET DEFAULT nextval('comercial.machote_folio_seq');

-- ⚠ SIN ESTE GRANT, GUARDAR DEJA DE FUNCIONAR PARA TODOS.
-- El INSERT de `machote-guardar` no nombra `folio`, así que dispara el
-- default, y disparar el default es llamar `nextval` — que necesita USAGE
-- sobre la secuencia. La 001 ya dejó un ALTER DEFAULT PRIVILEGES que lo
-- cubre, pero eso sólo aplica a lo que crea el MISMO rol que lo declaró: si
-- mañana la base se recrea con otro dueño, la migración tiene que bastarse
-- sola. Explícito y redundante es barato; que nadie pueda guardar, no.
GRANT USAGE, SELECT ON SEQUENCE comercial.machote_folio_seq TO comercial_app;

COMMENT ON COLUMN comercial.machote.folio IS
  'Numero corto y unico con el que se habla de la cotizacion. Lo asigna el servidor al crear la identidad, via nextval. NULL = murio antes de que existieran los folios; no se rellena.';

-- ══ Los que ya existen ═════════════════════════════════════════════════════
-- Se numeran por fecha de alta, para que el orden del folio sea el orden en
-- que nacieron. SOLO LOS VIVOS: los que ya estaban borrados nunca tuvieron
-- folio y no van a tener uno — quedan en NULL, que es lo que significa
-- «murió antes de que esto existiera». No se está reusando ningún número
-- porque nunca se entregó ninguno.
--
-- La alternativa era numerar los 17 y dejar que los 10 muertos se llevaran
-- los primeros diez números; se descartó porque el efecto visible habría sido
-- que la cotización más vieja de Esteban arrancara en COT-0011, y el precio
-- de esa rareza se paga cada vez que alguien lee un folio en voz alta.
--
-- El `WHERE folio IS NULL` es lo que la hace idempotente: correrla otra vez
-- no renumera nada.
WITH orden AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
    FROM comercial.machote
   WHERE deleted_at IS NULL AND folio IS NULL
)
UPDATE comercial.machote m
   SET folio = orden.n
  FROM orden
 WHERE m.id = orden.id;

-- Y la secuencia arranca DESPUÉS del último repartido. Sin esto, el primer
-- machote nuevo pediría el 1 y chocaría contra el índice único de abajo.
-- El tercer argumento (`is_called`) distingue los dos casos: con folios ya
-- repartidos el siguiente es max+1; sin ninguno, el siguiente es el 1.
SELECT setval(
  'comercial.machote_folio_seq',
  GREATEST(COALESCE((SELECT max(folio) FROM comercial.machote), 0), 1),
  (SELECT count(*) FROM comercial.machote WHERE folio IS NOT NULL) > 0
);

-- ══ Que no haya dos iguales ════════════════════════════════════════════════
-- Parcial sobre los no nulos: los muertos sin folio no compiten entre sí.
-- Y NO es parcial por `deleted_at` a propósito —al revés que
-- `machote_id_local_uq`—: borrar un machote NO debe liberar su folio, que es
-- justamente la regla que este índice hace cumplir.
CREATE UNIQUE INDEX IF NOT EXISTS machote_folio_uq
  ON comercial.machote (folio) WHERE folio IS NOT NULL;

-- ══ Cómo se escribe ════════════════════════════════════════════════════════
-- La forma legible vive en la BASE, no en cada pantalla. Si la calculara el
-- navegador, el panel, el correo y el PDF tendrían tres definiciones de lo
-- mismo y bastaría con que una se quedara atrás para que dos documentos del
-- mismo machote citaran folios distintos (CLAUDE.md §20 #4: un solo escritor).
--
-- `COT-` y no `SO`: tiene que distinguirse de un folio de Odoo (`SO11498`) al
-- verlo Y al dictarlo — «cotización ciento cuarenta y dos» no se confunde con
-- «orden once mil cuatrocientos noventa y ocho».
-- Cuatro dígitos: ordena bien como texto y llega a 9,999; al ritmo actual
-- (17 machotes en tres meses) eso es más de una década.
ALTER TABLE comercial.machote
  ADD COLUMN IF NOT EXISTS folio_txt text
  GENERATED ALWAYS AS ('COT-' || lpad(folio::text, 4, '0')) STORED;

COMMENT ON COLUMN comercial.machote.folio_txt IS
  'El folio como se escribe y se dicta: COT-0042. Generado por la base para que exista UNA sola definicion del formato. NULL cuando folio es NULL.';

-- El renglon de public.schema_migrations lo inserta el runner, con el sha256
-- REAL del archivo.
