# Paso D — Repuntar lectores a `x_studio_project_id` (LISTO EN LA RAMPA, sin desplegar)

> **Estado:** ✅ construido, ❌ **NO desplegado**. Ver `MIGRACION_PROJECT_ID.md` (Opción 2). Deploy cuando **C se verifique** (primer checkout real con ambos campos = mismo id).
> **Objetivo:** los lectores muestran el **NOMBRE real del proyecto** leyendo `x_studio_project_id` (no el m2o cruzado `x_studio_sales_order_2`).

---

## Cambios

### 1. Workflow `horas-dia` (`pQ3vVbRkMYvfICQf`) — 2 cambios (aplicar por `update_full` al deploy)
Actualmente lee `x_studio_sales_order_2` (nombre de SO cruzado). Cambios:
- **SEARCH** (`Odoo - SEARCH Asistencias`): agregar **`x_studio_project_id`** a `fieldsList`.
- **Build response** (`Code - Build response`): cambiar la línea
  ```js
  const so = m2o(a.x_studio_sales_order_2);   // ANTES
  const so = m2o(a.x_studio_project_id);       // DESPUÉS
  ```
  → `so_id` = id de proyecto · `so_nombre` = **NOMBRE de proyecto** (correcto). El filtro "Ops OR con SO" pasa a usar `x_studio_project_id` (poblado en TODOS por el backfill Paso B + escritura de Paso C).
- El resto del workflow no cambia. Los keys de respuesta siguen siendo `so_id`/`so_nombre` (compat frontend) — ahora con el proyecto correcto.
- ⚠️ `update_full` de 7 nodos: verificar `active:true` en la respuesta.

### 2. Frontend panel Confirmar Horas (`confirmar-horas.js` + `index.html`) — cosmético (ESTE PR)
- Columna **"SO" → "Proyecto"** · "⚠ Sin SO" → "⚠ Sin proyecto" · "✎ SO" → "✎ Proy" · "Corregir SO" → "Corregir Proyecto".
- `CH_BUILD` bumpeado.
- El modal de corrección sigue usando `/kiosk/sos` (catálogo de **proyectos**) → `so_id` = id de proyecto; `confirmar-horas` ya escribe **ambos** campos (Paso C).

### 3. B1 / B2 / kiosk.js / proyectos.js — **SIN cambio**
Ya muestran el NOMBRE correcto: el tag del slot (`SO#<id>|<nombre de proyecto>`) y el catálogo `/kiosk/sos` usan el nombre de `project.project`. El `so_id` que pasan es id de proyecto → consistente con `x_studio_project_id`.
- (Opcional futuro, no urgente: renombrar `so_id`→`project_id` en las respuestas por claridad.)

---

## Checklist de deploy (cuando C se verifique)
1. **Confirmar C:** primer checkout real (mañana PM) tiene `x_studio_project_id` = `x_studio_sales_order_2` (mismo id), resolviendo al **proyecto correcto**.
2. `update_full` a `horas-dia` con los 2 cambios (§1).
3. **Mergear este PR** (relabel + CH_BUILD).
4. **Validar:** panel Confirmar Horas muestra el **nombre de proyecto correcto** (Vertiv, no SO121); pre-llenado B2/B3 igual (ya correcto).
5. **Paso E (aparte):** congelar `x_studio_sales_order_2` (dejar de escribirlo o mantener espejo) + marcar deprecated en `CLAUDE.md §4`.

## Notas
- `horas-dia` es **read-only** → bajo riesgo; aun así se despliega tras verificar C para no mostrar `x_studio_project_id` vacío en attendances nuevas si la escritura de C fallara.
- El backfill (Paso B) ya dejó los 1,433 históricos con `x_studio_project_id` correcto → el panel mostrará bien el histórico desde el minuto 1 del deploy.
