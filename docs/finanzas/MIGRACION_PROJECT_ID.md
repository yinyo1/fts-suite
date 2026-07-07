# Migración — `x_studio_project_id` en `hr.attendance` (Opción 2)

> **Estado:** 📋 PLAN. **STOP antes de ejecutar.** Decisión Esteban (2026-07-07): Opción 2.
> **Contexto:** ver `DIAGNOSTICO_CARGA_MO.md §11` — el kiosk guarda un id de `project.project` en `x_studio_sales_order_2` (m2o a `sale.order`) → nombre falso. El id es correcto (proyecto); el campo destino es el equivocado.
> **Objetivo:** `x_studio_project_id` (m2o `project.project`) = fuente de verdad del proyecto en cada attendance. `x_studio_sales_order_2` queda **congelado** (no se borra).
> ⚠️ **Odoo MCP es READ-ONLY** — la creación del campo la hace **Esteban en Studio**; CC verifica read-only y construye los workflows (inactivos). Todo write a Odoo va por n8n.

---

## 0. Regla de oro (para no romper producción a media migración)
1. **Escribir** el campo nuevo (backfill + checkin) **ANTES** de que cualquier consumer lo **lea**.
2. **No dejar de escribir** el campo viejo (`x_studio_sales_order_2`) **hasta que nadie lo lea**.
3. Cada paso se valida **antes** de pasar al siguiente.

---

## 1. Secuencia exacta

### PASO A — Crear el campo (Esteban, Studio) 🔴 bloqueante
- Modelo **`hr.attendance`** → campo nuevo:
  - Nombre técnico: **`x_studio_project_id`**
  - Tipo: **Many2one** → **`project.project`**
  - Label: "Proyecto"
- Sin default, sin required. **No toca datos existentes** (campo vacío).
- **Validación (CC, MCP read-only):** leer fields de `hr.attendance` → confirmar que `x_studio_project_id` existe, `ttype=many2one`, `relation=project.project`. ✅ antes de seguir.

### PASO B — Backfill de los ~1,432 (CC construye one-shot n8n; Esteban activa; CC dispara)
- Workflow one-shot `admin/backfill-project-id`:
  1. `getAll` `hr.attendance` donde `x_studio_sales_order_2 != false`, campos `[id, x_studio_sales_order_2]` (returnAll, ~1,432).
  2. (Seguridad) `getAll` `project.project` ids válidos → set. Para cada attendance: `pid = x_studio_sales_order_2[0]`; si `pid ∈ proyectos válidos` → `UPDATE x_studio_project_id = pid`; si no → **skip + log** (no debería pasar; el catálogo solo sirve proyectos).
  3. Contar: actualizados / saltados.
- **Copia el mismo número** (id de proyecto) del campo viejo al nuevo — ahora interpretado como `project.project` (correcto).
- **Validación (CC, MCP):**
  - `count(x_studio_sales_order_2 != false)` ≈ `count(x_studio_project_id != false)` (cuadran, menos los saltados).
  - Spot-check 3: att con `project_id` resuelve al **proyecto correcto** — 121→Vertiv, 160→Magnekon, 2302→Topo Chico (el m2o ahora muestra el **nombre real del proyecto**).
- ✅ antes de seguir. (Los consumers siguen leyendo el campo viejo → nada cambia en prod todavía.)

### PASO C — Repuntar los que ESCRIBEN (CC edita workflows; nacen sin activar / se validan)
Durante la transición **escriben AMBOS** campos (nuevo + viejo) para no romper lectores del viejo:
- **`kiosk/checkin`** (`a7mEjjdwIzzvomXs`), nodo `Odoo - UPDATE Salida`: agregar campo `x_studio_project_id = {{ $json.so_id }}` (junto al `x_studio_sales_order_2` existente).
- **`planeacion/confirmar-horas`** (`7D3lgaYmH2DmqCWy`), rama `correct_so`: agregar `x_studio_project_id = so_id` junto al SO.
- **Validación:** crear 1 attendance de prueba vía kiosk (salida con SO) → MCP: **ambos** campos poblados con el **mismo id**, y `x_studio_project_id` resuelve al proyecto correcto. Limpiar la attendance de prueba después.
- ✅ antes de seguir.

### PASO D — Repuntar los que LEEN (CC edita workflows/frontend)
Cambiar de `x_studio_sales_order_2` → `x_studio_project_id` (nombre correcto de proyecto):
- **`planeacion/horas-dia`** (`pQ3vVbRkMYvfICQf`): en `SEARCH` agregar `x_studio_project_id` a fields; en `Build response` mapear `so_id`/`so_nombre` desde `x_studio_project_id` (proyecto real) en vez del m2o viejo. (Mantener el campo de respuesta `so_id`/`so_nombre` por compatibilidad del frontend, o renombrar a `project_id`/`project_nombre`.)
- **`planeacion/dia`** (B2, `3NjfelLFVcIWOe9N`): ya devuelve el nombre correcto (viene del **tag** del slot, que trae el nombre de proyecto del catálogo). El `so_id` es id de proyecto → una vez checkin escribe `x_studio_project_id`, es consistente. Renombre `so_*`→`project_*` **opcional** (cosmético).
- **Frontend panel Confirmar Horas** (`confirmar-horas.js`) y **kiosk** (`kiosk.js`/`proyectos.js`): ya muestran el **nombre del catálogo** (nombre de proyecto = correcto). Solo cambia de dónde viene el nombre en `horas-dia`. Renombrar labels "SO"→"Proyecto" **opcional** (cosmético, bumpear build).
- **Validación (browser):** panel Confirmar Horas muestra el **proyecto correcto** (Vertiv, no SO121); pre-llenado B2/B3 muestra proyecto correcto.
- ✅ antes de seguir.

### PASO E — Congelar `x_studio_sales_order_2` (deprecated, NO borrar)
- Una vez **nadie lee** el campo viejo (grep repo + revisión de workflows): `checkin`/`confirmar-horas` pueden **dejar de escribirlo** (o mantenerlo como espejo congelado).
- **No borrar el campo** (histórico + rollback). Marcar **deprecated** en `CLAUDE.md §4` (modelos críticos): "`x_studio_sales_order_2` = LEGACY, contiene ids de proyecto mal tipados; usar `x_studio_project_id`".
- **Validación:** grep `x_studio_sales_order_2` en repo → 0 lecturas; confirmar que ningún workflow lo lee.

---

## 2. Qué hace quién

| Paso | Quién | Qué |
|---|---|---|
| A | **Esteban (Studio)** | crea `x_studio_project_id` (m2o project.project) |
| A-verif | CC (MCP read-only) | confirma el campo |
| B | CC (build) + Esteban (activar) + CC (disparar) | one-shot backfill ~1,432 |
| C | CC (edit workflows) | checkin/confirmar-horas escriben ambos |
| D | CC (edit workflows + frontend, PRs) | horas-dia/B2 leen el nuevo; panel/kiosk cosmético |
| E | CC | congelar viejo + deprecated en CLAUDE.md |

---

## 3. Validación por paso (resumen)
- **A:** MCP → campo existe, m2o project.project.
- **B:** MCP → counts cuadran (viejo≈nuevo); spot-check 3 ids → proyecto correcto.
- **C:** attendance de prueba → ambos campos = mismo id, resuelve a proyecto correcto (limpiar después).
- **D:** browser → panel + pre-llenado muestran proyecto real (no SO cruzado).
- **E:** grep → 0 lecturas del campo viejo.

## 4. Riesgos / notas
- **Backfill masivo (~1,432 updates):** una sola corrida, idempotente (re-correr solo re-escribe el mismo id). Puede tardar (como el reset de 75, ×19). Monitorear.
- **Ids válidos:** todos los `x_studio_sales_order_2` provienen del catálogo `project.project` → deberían ser proyectos válidos; el backfill igual filtra por proyectos existentes (skip + log si alguno no existe).
- **`sale_line_id` (D1 de B1):** NO se toca aquí — B1 sigue guardando el tag `SO#<id>` en `planning.slot.name` (el `<id>` es id de proyecto; el nombre del tag ya es correcto). Coherente con esta migración.
- **No romper el kiosk en operación:** Pasos C/D son cambios a workflows productivos — validar en horario sin operación (como B3).
- **Rollback:** el campo viejo sigue poblado hasta Paso E → si algo falla en D, revertir el read-consumer al campo viejo.

## 5. Fuera de alcance (aparte)
- **Arreglar el catálogo `/kiosk/sos`** para que sea explícito que devuelve proyectos (renombrar `sos`→`proyectos` conceptualmente; el frontend usa "SO" por historia). No urgente; el id ya es correcto.
- **Fase 3 (costeo $):** una vez `x_studio_project_id` es la fuente, la atribución MO por proyecto es directa (el id ya es el proyecto correcto).
