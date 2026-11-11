# Reversas de la sesión nocturna del 11-nov-2026 (#485, #486)

Cada cambio de producción de esa noche con su reversa a la mano. El detalle, los read-backs
y las pruebas viven en los comentarios de #485 / #486 (y el Bloque 1 en un issue privado).

| Bloque | Qué | Reversa |
|---|---|---|
| 1 | `fts_bancos_estado_resultados` (`LW3DVENZjlI3Kurp`): disparador manual desconectado y deshabilitado | `restore_workflow_version` a `16c158d9-9b90-4918-acfe-b79042dd5ca9` + publish |
| 2 | Mi Perfil verifica el PIN en el servidor (PR #493) | revert del squash de #493 |
| 2 | `suite/acceso-registro` (`siUVKt5xGqt4wqGn`) + tabla `acceso_eventos` | `unpublish_workflow siUVKt5xGqt4wqGn` |
| 3 | P0 de seguridad (PR #488) | revert del squash de #488 |
| 4 | Revocación de sesión en 14 workflows de la etapa 1 | receta sin historial en #485 («Bloque 4 · reversa sin historial»): quitar los 3 nodos y reconectar verificador → IF |
| 5 | `conceptualizador/salud-diaria` (`sbC0wXNoEJyvmvGe`): sección «Accesos y kiosko» | `restore_workflow_version` a `7c3f3c82-0a89-4748-b3a0-2fade73d0311` + publish |
| 6 | `chats_0013`, chats/alta, orden-odoo, pantalla RH (PR #496) | `db/migrations/chats/reversas/chats_0013_reversa.sql`; chats/alta → `1104ad10…`; orden-odoo → ver #485; revert de #496. Interruptores `rh_usuarios_v1` y `emision_por_perfil_v1` siguen en false |
| 7 | `comercial/orden-crear` v1 (`0jun4SLxAPTtIkHf`) despublicado | `publish_workflow` versión `487f615a-fae3-4d3a-8329-e01d268b3d05` |
| 10 | Entrada dual del portal (PR #494, #495) | `login_dual_v1: false` en `shared/public-config.json` |

Nota: el historial de versiones de n8n se poda. Siete de los catorce workflows del Bloque 4 ya no
tienen su versión anterior; por eso su reversa es por nodos, no por versión.
