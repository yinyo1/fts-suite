# Scripts de limpieza comercial 2026-08

One-shots de la sesión 1 (issue #131). **Todos nacen en dry-run**: sin `--write` no tocan Odoo.

## Uso

```bash
cd comercial/scripts
node lote-1-cancelado-lost.js --dry-run      # default; --write para la corrida real
node lote-4-reasignacion.js --dry-run --fixture   # sin credencial, usa el JSON capturado
```

Para `--write` (y para el dry-run contra Odoo en vivo) hay que exportar la credencial. **Nunca vive en el repo** (CLAUDE.md §9):

```bash
export ODOO_URL=https://serviciosfts.odoo.com
export ODOO_DB=<base>
export ODOO_USER=<login>
export ODOO_KEY=<api key>
```

## Los 7 lotes

| Script | Qué hace | Escribe |
|---|---|---|
| `lote-1-cancelado-lost.js` | 1,173 leads de CANCELADO → perdido + archivar | sí |
| `lote-2-etapas.js` | Consolida 12 etapas → 5 + tags por cliente | sí |
| `lote-3-ganados.js` | Archiva los 532 ganados | sí |
| `lote-4-reasignacion.js` | Reasigna los 50 leads vivos de ex-FTS | sí |
| `lote-5-selection-dndole.js` | Genera el instructivo de Studio + guardarraíl | **no** (Studio es UI) |
| `lote-6-so-moneda.js` | 190 `sale.order` MX marcadas USD → MXN | sí |
| `lote-7-usuarios-huerfanos.js` | Diagnóstico de Taqueria JMZ y sin `user_id` | **no** (solo propone) |

## Orden obligatorio

```
L1 → L2 → L3 → L4 → L5        L6 (independiente)    L7 (no escribe)
```

Cada dependencia tiene razón de ser, no es ceremonia:
- **L2 después de L1**: no remapear etapas de leads que ya salieron del pipeline.
- **L3 después de L2**: los 2 de "Ganado - Con PO" ya están fusionados y se archivan en el mismo paso.
- **L4 después de L3**: solo toca pipeline vivo (50 leads, no 331).
- **L5 al final**: quitar una opción del selection mientras un lead vivo la usa deja el registro con un valor huérfano que la UI no sabe pintar.

## Reglas que respetan estos scripts

- **Archivar, nunca `unlink`.** No hay una sola llamada a `unlink` en todo el directorio.
- **Toda escritura deja nota en chatter** con la marca `[limpieza-2026-08]` (`author_id: 3` — el partner 2 de OdooBot está archivado y el create falla en silencio, CLAUDE.md §18).
- **Read-back después de escribir.** Un `write` que no lanza error NO prueba que el campo quedó: el ORM descarta en silencio lo que no puede escribir (CLAUDE.md §9). L6 relee registro por registro porque toca dinero.
- **Guardarraíl de etapas**: L1 y L2 abortan si `crm.stage` en Odoo ya no coincide con lo que asume `lib/mapping.js`. Un mapping ciego sobre etapas movidas corrompe datos en silencio.
- **Las tablas de decisión viven solo en `lib/mapping.js`.** Si un lote define su propia copia, alguien se salió del carril.

## Rollback

`comercial/data/dump-pre-limpieza-20260829.json` (1,859 leads) y `dump-pre-limpieza-so-usd-20260829.json` (231 SO) traen el estado previo de todos los campos que la limpieza modifica: `stage_id`, `active`, `x_studio_dndole`, `currency_id`.

⚠️ Los many2one del dump están como **nombre mostrado, no id numérico**, y los textos largos vienen truncados a 40 caracteres (tope duro del MCP). No compromete el rollback — ningún lote toca campos de texto largo — pero un restore debe mapear los nombres de vuelta a ids vía `crm.stage` / `res.currency`.
