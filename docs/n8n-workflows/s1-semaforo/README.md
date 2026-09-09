# S1 · cuerpos de los Code nodes de `ops/watchdog-semaforo` (issue #220)

Copia fiel de los dos `jsCode` que S1 desplegó en el **borrador** del workflow
`29eaGe2wkS98lRMU`. Están aquí para que el cambio sea revisable en un diff: por el
MCP de n8n el código se manda como un string completo, así que sin esto el único
lugar donde vive es dentro del workflow.

| Archivo | Nodo n8n |
|---|---|
| `Code-MAIN.js` | `Code - MAIN` |
| `Code-buildEmail.js` | `Code - buildEmail` |

## Estado al cerrar S1 (2026-09-09 15:01 UTC)

- **Borrador** (`versionId 88ed2eed-6711-4771-b21d-86c4bac0ab5c`): este código, con la
  URL de config apuntando a `main`.
- **Versión ACTIVA** (`activeVersionId a3781e87-e476-4d23-a891-d11e240e82a8`): el código
  PREVIO. Producción sigue corriendo lo de antes.
- **Llave de reversa:** `a3781e87-e476-4d23-a891-d11e240e82a8`, que además es la versión
  activa hoy. `restore_workflow_version` sobre ese id deshace todo.

⚠️ **Hallazgo de método que corrige a CLAUDE.md §17 quirk #2:** `update_workflow` del MCP
`n8n_FTS` escribe el **borrador**, no la versión activa. Tras el edit queda
`versionId != activeVersionId` y **producción sigue corriendo el código viejo** hasta que
alguien llame `publish_workflow`. §17 dice que este MCP «escribe · preserva active ✓» —
cierto, pero incompleto: preserva `active` porque *no toca la versión activa en absoluto*.
El read-back del flag `active` (regla dura de §3) **no basta** para saber si un cambio está
vivo; hay que comparar `versionId` contra `activeVersionId`.

## Sin secretos

Ninguno de los dos nodos lee `$env` ni contiene credenciales. Las credenciales de Odoo,
GitHub y Graph viven en los nodos HTTP/Odoo por referencia de id, no en el código.
