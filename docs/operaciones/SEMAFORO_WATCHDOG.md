# Semáforo de producción + Watchdog operativo — Diagnóstico + Diseño

> **Estado:** DIAGNÓSTICO read-only (2026-06-17). NADA construido.
> **Objetivo:** un vigilante que empuje órdenes/proyectos por etapa — si pasan X días sin movimiento en una etapa, alerta al responsable para darle seguimiento; + un semáforo de KPIs (verde/amarillo/rojo) que Operaciones vea de un vistazo.
> **Stack previsto:** igual al resto del Suite — GitHub Pages (frontend) + n8n (watchdog cron + endpoint) + Odoo (datos, read-only).

---

## 1. Diagnóstico read-only

### 1.1 ⭐ Dónde viven las etapas — `project.project.stage_id` (NO en tareas, NO en SO)

El pipeline real de producción vive en **`project.project.stage_id`** → modelo **`project.project.stage`**. **11 stages**, en orden de `sequence`, con conteo de proyectos activos hoy:

| seq | id | Nombre EXACTO (como está en Odoo) | Proyectos activos | Dueño implícito |
|----:|---:|------------------------------------|------------------:|-----------------|
| 0 | 1 | `To Do` | 41 | Operaciones |
| 1 | 2 | `In Progress` | 13 | Operaciones |
| 2 | 5 | `Hold` | 3 | Operaciones (parado intencional) |
| 3 | 3 | `Done Operations` | 11 | Operaciones → Admin |
| 4 | 7 | `Admin - In progress` | 15 | Admin |
| 5 | 9 | `Revisión rentabilidad (Richard)` | 21 | **Richard** (Ricardo, PMO) |
| 6 | 10 | `Aprobado Pago Comisiones (Gera)` | 4 | **Gera** (Gerardo, Accounting) |
| 8 | 13 | `Comisiones Cerradas (Gera)` | 1 | Gera (casi-terminal) |
| 9 | 8 | `Complete TOTAL (Gera)` | 85 | terminal (cerrado) |
| 10 | 4 | `Canceled` | 9 | terminal |
| 11 | 6 | `Templates` | — | sistema (excluir) |

- **Los nombres ya codifican al responsable** (Richard, Gera) → el ruteo de alertas del watchdog está medio-resuelto por el propio stage.
- **Coincide con Frente B:** los stages de cierre [8,13,10,4] que el workflow `project/archive-budget-cierre` ya archiva. ⇒ el watchdog vigila los **in-flight** (~108 proyectos: stages 1,2,5,3,7,9,10); los terminales (8 Complete, 4 Canceled, 6 Templates) se excluyen.

**`project.task.type` (stages de tareas) NO sirve:** 120 registros, mayormente `New` duplicado por proyecto + ruido (`Papelería`, `LINEA 4`, `TAREA`, `Inbox`…). Son kanbans por-proyecto, fragmentados — **no es un pipeline global**. El semáforo NO debe usar task stages.

**`sale.order.state` es solo lifecycle** (`draft` 2,449 · `sent` 1,157 · `sale` 6,518 · `cancel` 239) — sirve para "cotizaciones estancadas" (eje secundario de ventas), pero el pipeline de producción es a nivel proyecto.

### 1.2 ⚠️ Campo de "última actividad / sin movimiento" — el hallazgo crítico

- **`project.project` NO tiene `date_last_stage_update`** (confirmado: campo inexistente). No hay timestamp nativo de "entró a esta etapa".
- **`write_date` está CONTAMINADO por operaciones masivas.** Muestra real: los 21 proyectos en `Revisión rentabilidad` tienen **todos el mismo `write_date` = 2026-06-16 20:03:39** → un job masivo (probablemente el archivado/reopen de Frente B u otra edición batch) reescribe muchos proyectos a la vez. ⇒ **`write_date` NO refleja actividad genuina por proyecto** y se reinicia con jobs batch. Mal proxy para "días estancado".
- **`last_update_status`** (selection nativa de "Project Updates": `on_track`/`at_risk`/`off_track`/`on_hold`/`to_define`/`done`) + `last_update_color`: existe, pero es **manual** y hoy está casi todo en `on_track`/`to_define` (default). → señal SECUNDARIA (si alguien marca `off_track` → rojo), no la base del watchdog automático.

**⇒ Recomendación (MVP):** el watchdog mantiene su **propio "ledger" de entrada-a-etapa** (snapshot diario: `project_id → stage_id → fecha_entrada`). Cada corrida compara contra el snapshot previo; si el stage cambió, resetea la fecha; "días en etapa" = hoy − fecha_entrada del ledger. **Inmune a la contaminación de `write_date`** y self-contained (sin cambiar el esquema de Odoo). El ledger **es** el "snapshot histórico" del diseño.
- *Alternativa "nativa visible":* agregar un campo Studio `x_fecha_entrada_stage` (date) + una Automation Rule que lo estampe al cambiar `stage_id` → "días en etapa" leíble en Odoo. Requiere construir (campo + regla). Para después.
- *Alternativa sin schema:* parsear `mail.message`/`tracking_value_ids` (Odoo loguea "Stage: X → Y") — más pesado (query por proyecto). El ledger es más simple.

### 1.3 Relación SO ↔ proyecto/tareas

- **`sale.order.project_id`** → `project.project` (link nativo que setea el workflow A1).
- **`project.project.sale_order_id`** (many2one `sale.order`, "Order Reference") — link inverso nativo. ✅
- **`project.project.x_studio_many2one_field_RjLNg`** (many2one `sale.order`) — dual-write custom de A1 (idempotencia).
- ⇒ Relación **1:1 bidireccional SO↔proyecto**. **Unidad del semáforo = `project.project`**; la SO da contexto (cliente, monto) vía `sale_order_id`. Tareas (`project.task`) NO se vigilan (ruido).

### 1.4 "Facturas sin aprobar por AP"

- **`account.move` NO tiene campo de aprobación AP nativo** (no existe `to_check` ni `approval_state` en esta instancia — solo `state` draft/posted/cancel + `payment_state`).
- ⇒ **Proxy de "pendiente de aprobación AP" = factura de proveedor (`in_invoice`/`in_refund`) en `state='draft'`** (capturada pero NO posteada/aprobada al libro). Una vez `posted`, está "aprobada" contablemente.
- Backlog conocido (A3): ~31 borradores de bill company 1. ⚠️ Si Esteban tiene un proceso de aprobación AP distinto (firma, etapa custom), no aparece en el esquema — confirmar. Para el KPI del semáforo, el proxy `in_invoice` `draft` es lo medible hoy.
- (Distinto de "pendiente de PAGO" = posted + `payment_state in (not_paid, partial)` — ese es otro KPI.)

### 1.5 Repo — arranca de CERO

No hay nada de semáforo/watchdog en `fts-suite` (los 3 hits de grep son de `analisis-taqueria-jimenez`, un análisis ajeno). No existe `shared/sla_stages.json`, módulo `semaforo`, ni endpoint `/ops/semaforo`. **Diseño desde cero.**

---

## 2. Diseño aterrizado (propuesta, sin construir)

### 2.1 Config SLA por etapa — `shared/operaciones/sla_stages.json`

Una fila por stage in-flight: `stage_id → {umbral_amarillo_días, umbral_rojo_días, responsable_email, label}`. **Propuesta de defaults** (Esteban ajusta):

| stage_id | Stage | 🟡 amarillo | 🔴 rojo | Responsable (propuesto) |
|---:|---|---:|---:|---|
| 1 | To Do | 7 | 14 | Operaciones |
| 2 | In Progress | 14 | 30 | Operaciones |
| 5 | Hold | 30 | 60 | Operaciones (o excluir — parado intencional) |
| 3 | Done Operations | 5 | 10 | Operaciones/Admin |
| 7 | Admin - In progress | 7 | 14 | Admin |
| 9 | Revisión rentabilidad (Richard) | 7 | 14 | Ricardo (PMO) |
| 10 | Aprobado Pago Comisiones (Gera) | 7 | 14 | Gerardo (Accounting) |
| 13 | Comisiones Cerradas (Gera) | 14 | 30 | Gerardo (o excluir) |
| — | 8 Complete / 4 Canceled / 6 Templates | — | — | **excluidos** (terminales) |

### 2.2 Watchdog — n8n cron (diario)

`ops/watchdog-semaforo` (Schedule diario, ej. 7am CST):
1. **Lee** proyectos activos in-flight: `project.project` `[active=true, stage_id in <in-flight>]` → `id, name, stage_id, sale_order_id, last_update_status`.
2. **Ledger de etapas** (en `staticData` del workflow o un JSON en repo `shared/operaciones/stage_ledger.json`): para cada proyecto compara `stage_id` vs el snapshot previo. Si cambió → `fecha_entrada = hoy`. Si igual → conserva `fecha_entrada`. Nuevos → `fecha_entrada = hoy`.
3. **Calcula** `días_en_etapa = hoy − fecha_entrada` y el color por SLA (`< amarillo` 🟢 · `≥ amarillo` 🟡 · `≥ rojo` 🔴). Override a 🔴/🟡 si `last_update_status ∈ {off_track, at_risk}`.
4. **Alerta** (correo, vía Graph como el handoff A1): por **responsable**, lista de proyectos 🔴 en sus stages ("estos N proyectos llevan ≥X días en <stage>, dales seguimiento"). Idempotencia: solo re-alerta si cambió el set (evitar spam diario) — `staticData`.
5. **Snapshot histórico:** persiste el estado del día (stage counts + lista) → tendencia para el frontend.

### 2.3 Endpoint del semáforo — `/ops/semaforo` (n8n webhook GET)

Devuelve el JSON que pinta la grilla: por stage → `{label, count, verde, amarillo, rojo, responsable}` + lista de proyectos 🔴/🟡 con `días_en_etapa, cliente, monto SO` + tiles de KPI (ver 2.5). Auth: reutilizar el patrón de Finanzas (JWT) o un token simple si es interno.

### 2.4 Frontend — `operaciones/semaforo/`

Grilla de columnas = stages (en orden de `sequence`), cada una con su conteo y un badge 🟢/🟡/🔴 (peor color de la columna). Click en columna → drill-down a los proyectos estancados (días, cliente, link a Odoo). Tiles arriba con los KPIs. Consume `/ops/semaforo`. Estilo igual al resto del Suite (HTML+JS modular).

### 2.5 KPIs del semáforo (tiles) — propuesta
- **Proyectos 🔴** (estancados sobre umbral rojo) — total + por responsable.
- **AP sin aprobar:** `in_invoice` `draft` (proxy §1.4) — count + $.
- **Proyectos `off_track`** (`last_update_status`) — señal manual.
- **Cotizaciones estancadas:** `sale.order` `state=sent` con `date_order` viejo (eje ventas, opcional).
- **(Sinergia Frente B)** proyectos en stage de cierre con gasto/factura pendiente — ya lo detecta `fin/detect-gasto-cierre`; se puede surfacear aquí.

---

## 3. Decisiones que necesito de Esteban

1. **Umbrales por etapa** (🟡/🔴 días): ¿OK los defaults de §2.1 o los ajustas? (especialmente `To Do` con 41 proyectos — ¿son backlog real o "sin arrancar"? eso define el umbral).
2. **Responsables por etapa** (email del destinatario de la alerta): confirmar Operaciones=? (¿Felipe / Montalvo?), Admin=?, `Revisión rentabilidad`=Ricardo?, `Comisiones`=Gerardo? — los stages nombran a "Richard"/"Gera" pero necesito el email exacto.
3. **¿`Hold` y `Comisiones Cerradas` se vigilan o se excluyen?** (Hold = parado intencional; Comisiones Cerradas = casi-terminal con 1 proyecto).
4. **"Días sin movimiento":** ¿ledger del watchdog (recomendado, inmune a `write_date`) o aceptamos `write_date` simple (más fácil pero contaminado por jobs batch)? ¿O construimos el campo Studio + Automation Rule (visible en Odoo)?
5. **AP approval:** ¿el proxy `in_invoice` `draft` representa "sin aprobar por AP", o tienen otro proceso (firma/etapa) que deba identificar?
6. **Frecuencia + canal de alerta:** ¿correo diario al responsable? ¿un solo digest a Operaciones? ¿WhatsApp?
7. **Auth del endpoint** `/ops/semaforo`: ¿JWT (como Finanzas) o token interno simple?

---

## 4. Resumen para construir (cuando se apruebe)
1. `shared/operaciones/sla_stages.json` (config con stages reales + umbrales + responsables).
2. Workflow n8n `ops/watchdog-semaforo` (cron + ledger + alertas + snapshot).
3. Workflow n8n `ops/semaforo` (webhook GET → datos de la grilla).
4. Frontend `operaciones/semaforo/` (grilla + drill-down + tiles).
5. (Opcional nativo) campo Studio `x_fecha_entrada_stage` + Automation Rule.

🤖 Diagnóstico read-only generado con [Claude Code](https://claude.com/claude-code) — sin cambios a Odoo ni n8n.
