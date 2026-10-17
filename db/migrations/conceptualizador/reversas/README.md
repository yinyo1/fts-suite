# Reversas de emergencia del conceptualizador

Cada archivo deshace UNA migración de la secuencia (`reversa_0014.sql` deshace la 0014, `reversa_0015.sql` la 0015).
**No se aplican salvo que Esteban lo pida** (fts-conceptualizador#5). Copias idénticas de
`fts-conceptualizador/db/reversas/`.

Viven fuera de la secuencia a propósito: el runner `conceptualizador/db-migrate` exige las migraciones en orden
(`FUERA_DE_ORDEN` si falta una anterior), así que una reversa numerada y sin aplicar frenaría la siguiente migración.
Hasta el 17-oct la reversa de la 0014 era `conceptualizador_0015_reversa_0014.sql`; se movió aquí (mismo contenido,
sha256 `d644f4d9…`) para que la V1.52.1 pudiera ser la 0015. Con la 0015 aplicada, primero va la reversa de la 0015.

Para aplicar una: copiarla a `db/migrations/conceptualizador/` con el SIGUIENTE número libre
(`conceptualizador_00NN_reversa_00MM.sql`), ensayo con `dry_run = true` y luego de verdad, con read-back.
