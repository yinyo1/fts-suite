# Sesión 1 de #364: cambios al workflow `fts_bancos_estado_resultados` (`LW3DVENZjlI3Kurp`)

Este archivo describe los cambios del workflow; **no** trae el JSON (el workflow tiene direcciones de correo y
este repo es público). El JSON publicado antes del cambio está en `bancos.respaldos_workflow` id 1.

Se aplican **después del merge** del PR de la sesión 1, en un solo `update_workflow` y una sola publicación.

1. `Code - Disparo`: `CALC_SHA` → el commit mergeado que trae `calcular.js` v1.3.1 (se lee el valor vivo antes).
2. `Odoo - Asistencias`: `fieldsList` = `id,employee_id,check_in,worked_hours,x_studio_sales_order_2,x_studio_many2one_field_GUbBF,x_studio_project_id`.
3. Nodo nuevo `PG - Candado` (Postgres, `fts-suite-db · fts_admin`, `executeOnce`, `alwaysOutputData`):
   ```sql
   SET LOCAL ROLE bancos_er;
   SELECT bancos.er_tomar_candado($1, 16) AS candado;
   ```
   con `queryReplacement` = `={{ $('Code - Disparo').first().json.execution_id }}`.
4. Nodo nuevo `IF - Candado?` (validación `loose`): `={{ $json.candado && $json.candado.ok === true ? 'si' : 'no' }}` igual a `si`.
5. Conexiones: `IF - Recalcular?` (sí) → `PG - Candado` → `IF - Candado?`; (sí) → `PG - Movimientos`; (no) → `Sin cambios (no recalcula)`.
   Se quita `IF - Recalcular?` (sí) → `PG - Movimientos`.
6. `Code - Calcular`: la última corrida y la última versión salen del candado cuando se tomó.
   ```js
   const f0 = $('PG - Firma').first().json;
   let cand = null; try { cand = $('PG - Candado').first().json.candado; } catch (e) { cand = null; }
   const f = cand && cand.ok ? Object.assign({}, f0, { ultimo: cand.ultimo, ultima_version: cand.ultima_version }) : f0;
   ```
   (reemplaza `const f = $('PG - Firma').first().json;`).
7. `PG - Guardar`: suelta el candado en la misma sentencia que inserta en `er_calculos`.
   ```sql
   solt AS (SELECT bancos.er_soltar_candado(p.j->>'execution_id') AS s FROM p)
   ...
   RETURNING ..., (SELECT sum(s) FROM solt) AS candado_soltado;
   ```

Verificación: read-back de `active`, `versionId == activeVersionId`, `fieldsList` y `CALC_SHA`; una corrida de prueba
(`prueba: true`) y una de publicación con `motivo: "cambio de lector, sin efecto material"`.

Rollback: `CALC_SHA` → `5fa7c37` y restaurar el JSON de `bancos.respaldos_workflow` id 1 (tabla sólo para el
administrador de la base). Las funciones y tablas de `bancos_0012` pueden quedarse: sin los nodos nuevos nadie las llama.
