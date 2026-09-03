# L5 — Depuración del selector "Dándole" (`x_studio_dndole`)

**Estado: instructivo, no automatizable. Lo aplica Esteban en Odoo Studio.**

Las opciones de un campo `selection` de Studio viven en `ir.model.fields.selection`, la
capa meta de Odoo. Tocarla por RPC es justo el tipo de cambio que rompe en silencio
(CLAUDE.md §9 documenta un caso donde el ORM descartó campos sin avisar), y además el
MCP tiene esa capa en denylist: no se puede ni leer para verificar. Escribirla a ciegas
sería repetir el error de L6.

---

## Por qué L5 va al final

Si se quita una opción del selector mientras un lead **vivo** todavía la usa, ese
registro queda con un valor huérfano que la UI no sabe pintar. Por eso el orden
`L1 → L3 → L4 → L5` no es ceremonia:

- **L1** archiva los 1,173 de CANCELADO.
- **L3** archiva los 532 ganados.
- **L4** reasigna los 50 leads vivos que tenían dándole de ex-FTS.

Después de esos tres, ningún lead vivo debería usar un valor de ex-FTS. **Ese es el
guardarraíl, y hay que comprobarlo antes de tocar Studio** (el conteo verificado va en
el reporte de la corrida, en el issue #131).

Los leads **archivados** conservan su valor viejo a propósito: es su historia. Quitar la
opción del selector no borra el dato ya guardado.

---

## Qué hacer en Studio

Odoo → cualquier vista de **CRM** → botón **Studio** (arriba a la derecha) → seleccionar
el campo **"Dándole"** → panel de propiedades → **Values / Valores**.

### Quitar (personas que ya no están en FTS)

| Opción | Nota |
|---|---|
| `Angel` | los leads históricos conservan el valor |
| `Yusti` | idem |
| `Diego` | idem |
| `Bethania` | idem |

### Conservar / agregar — los 5 usuarios de 1.0 (#131 dec.4)

| Opción | Acción |
|---|---|
| `Esteban` | conservar |
| `Aldo Mendez` | conservar — **ojo: en Odoo es "Aldo Mendez", en la hoja de cartera es "Aldo"** |
| `Montalvo` | conservar |
| `Ricardo` | conservar |
| `Pablo` | **agregar** (no existe todavía) |

### Decidir

| Opción | Nota |
|---|---|
| `Oscar` | queda 1 lead con este valor. Decisión de Esteban: agregarlo a los 5 usuarios, o reasignarlo y quitar la opción. |

---

## Dos advertencias

1. **SUPUESTO:** el selector puede tener opciones que ningún lead usa y que por lo tanto
   no aparecen en ningún conteo (la capa meta no es legible por RPC acotado). Al abrir
   Studio, **comparar la lista real contra esta tabla** en vez de asumir que coinciden.
2. **No renombrar opciones, quitarlas.** Renombrar un valor de selection reescribe el
   dato en todos los registros que lo usan, incluidos los archivados — y ahí se pierde
   la historia que L1/L3 preservaron a propósito.

---

## Rollback

Volver a agregar la opción con el **mismo texto exacto** la restaura: el valor guardado
en cada lead es la cadena, no un id. Un lead cuyo valor quedó fuera del selector se
vuelve a pintar solo en cuanto la opción existe de nuevo.
