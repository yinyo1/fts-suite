# Decisiones tomadas sin preguntar — noche del 28-sep-2026

Regla aplicada: si ARQUITECTURA.md o #328 lo resuelven, eso manda; si no, lo más
conservador y reversible; a igualdad, lo más simple.

| # | duda | elegí | por qué | cómo revertir |
|---|---|---|---|---|
| N1 | `comercial/db-migrate` exige versión de 3 dígitos (`NOMBRE_INVALIDO` con `memoria_0001`) y su archivo/SHA viven en un nodo `Set` que habría que editar (prohibido tocar workflows existentes) | Workflow nuevo **`memoria/db-migrate`**: misma lógica (sha256, orden, transacción, bitácora, read-back) pero versión `memoria_NNNN`, orden **por módulo**, y archivo/SHA como entrada del disparo | D9 pide numeración por módulo; no se toca el runner de comercial | Archivar `memoria/db-migrate`; las filas `memoria_*` de `schema_migrations` quedan como registro |
