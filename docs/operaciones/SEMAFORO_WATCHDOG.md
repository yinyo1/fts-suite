# Semáforo de producción + Watchdog operativo — Diagnóstico + Diseño

> **Estado:** DIAGNÓSTICO read-only. NADA construido. **v2 (2026-06-17)** — stages reconfigurados por Esteban + **modelo de 2 métricas vía chatter** (mejora el diseño v1 que dependía de `write_date`).
> **Objetivo:** un vigilante que empuje proyectos por etapa — alertar al responsable cuando un proyecto pasa demasiado tiempo en una etapa o sin seguimiento; + un semáforo 🟢🟡🔴 que Ops/Admin vean de un vistazo. KPI de gestión: **≥90% del semáforo en VERDE dentro del mes**.
> **Stack:** GitHub Pages + n8n (watchdog cron + endpoint) + Odoo (read-only para datos; write SOLO para el log note al chatter).

---

## 1. Diagnóstico read-only (v2)

### 1.1 Stages actuales — `project.project.stage_id` (reconfigurados)

**9 stages**; **7 vigilados** en 2 grupos + 2 terminales/sistema. Conteo de proyectos **activos** hoy:

| seq | id | Nombre EXACTO en Odoo | Activos | Grupo |
|----:|---:|------------------------|--------:|-------|
| 0 | 1 | `To Do` | 42 | **OPERACIONES** |
| 1 | 2 | `In Progress` | 13 | **OPERACIONES** |
| 2 | 5 | `Hold` | 3 | **OPERACIONES** (parado intencional) |
| 3 | 3 | `Done Operations` | 11 | **ADMIN** |
| 4 | 7 | `Admin - In progress` | 15 | **ADMIN** |
| 8 | 13 | `En plazo de credito` | 18 | **ADMIN** (espera de cobro) |
| 9 | 8 | `Complete TOTAL (Gera)` | 93 | ADMIN — **¿terminal?** (decisión §3) |
| 10 | 4 | `Canceled` | 9 | terminal (excluir) |
| 11 | 6 | `Templates` | 12 | sistema (excluir) |

- ⚠️ **El stage que dijiste "En plazo de Pago" en Odoo se llama `En plazo de credito`** (id 13, reusó el id del viejo "Comisiones Cerradas"). Los stages viejos `Revisión rentabilidad (Richard)` (9) y `Aprobado Pago Comisiones (Gera)` (10) **fueron eliminados**.
- **Vigilados (7):** Ops = {1,2,5}; Admin = {3,7,13, y 8 si no es terminal}. **Excluidos:** `Canceled` (4), `Templates` (6), y muy probablemente `Complete TOTAL` (8) como terminal.

### 1.2 ⭐ LAS DOS MÉTRICAS — ambas se resuelven con el CHATTER (no con `write_date`)

El chatter de `project.project` (`mail.message`) tiene la verdad de ambas métricas de forma **nativa y confiable**:

**(A) TIEMPO EN STAGE** = hoy − fecha del **último mensaje subtype `94 "Project Stage Changed"`** del proyecto.
- Odoo **loguea automáticamente** un mensaje (`message_type='notification'`, `subtype_id=94`) **cada vez que cambia `stage_id`**. El más reciente = cuándo entró a su etapa actual.
- ✅ Nativo, exacto, inmune a ediciones masivas. (Fallback si un proyecto nunca cambió de stage: su `create_date`.)

**(B) TIEMPO SIN SEGUIMIENTO** = hoy − fecha del **último mensaje real de seguimiento** = `message_type='comment'` **de autor humano** (excluyendo bots/watchdog).
- En el chatter: una nota humana ("Log note"/"Send message") = `message_type='comment'`. Los automáticos (cambios de stage subtype 94, notas de OdooBot/Sales) = `message_type='notification'`. ⇒ **el discriminador es `message_type='comment'`** + `author_id NOT IN (bots, watchdog)`.

**Ejemplo real — proyecto 112:**
- Último subtype-94 (cambio de stage): **2026-06-17** → `días_en_stage ≈ 0`.
- Último `comment` humano: **2025-10-02** → `días_sin_seguimiento ≈ 258`. 
- ⇒ Las 2 métricas son DISTINTAS y ambas relevantes: lo movieron de etapa ayer, pero nadie le pone una nota real desde hace ~8 meses.

**Descartados:**
- `write_date`: **contaminado** — confirmado de nuevo (21 proyectos con el MISMO timestamp por un job batch). No refleja seguimiento real.
- `date_last_stage_update`: **no existe** en `project.project` (re-confirmado). Por eso el subtype-94 del chatter es el sustituto correcto.
- `last_update_status` (`on_track`/`at_risk`/`off_track`…): existe, manual, casi todo default → **señal secundaria** (override a 🔴/🟡 si alguien lo marca), no la base.

**Perf:** NO hace falta query por proyecto. Para los ~100 vigilados: **2 búsquedas** a `mail.message` — una `[model=project.project, res_id in <vigilados>, subtype_id=94] order date desc`, otra `[... message_type='comment', author_id not in <bots>] order date desc` — y reducir a "última por `res_id`" en un Code node.

### 1.3 Chatter / log note — el watchdog SÍ puede postear (requisito de registro)

Confirmado: se escribe al chatter de `project.project` creando un `mail.message`. Subtypes relevantes: **`2 "Note"`** (internal=true, el log note), `94 "Project Stage Changed"`, `1 "Discussions"`.
- **Mecanismo** (validado en Frente B §17): nodo Odoo **CREATE `mail.message`** con `model='project.project'`, `res_id=<proj>`, `body=<html>`, `subtype_id=2` (Note), `author_id=<bot>`, **`message_type='notification'`**.
- ⭐ **Clave:** el watchdog postea con **`message_type='notification'`** (no `'comment'`) → su propio log note **NO cuenta como "seguimiento"** en la métrica B (que filtra `comment`). Doble seguro: la métrica B también excluye el `author_id` del watchdog. Así el registro permanente queda en el chatter sin reiniciar el reloj de "sin seguimiento".

### 1.4 "En plazo de credito" (stage 13, ADMIN)

= **"dentro del plazo de crédito"**: proyecto entregado, factura de cliente emitida, **esperando el cobro dentro de los términos de crédito** del cliente (30/60 días). 18 proyectos, ligados a SO + cliente (Nalco, Budenheim, Magnekon…).
- ⇒ Conecta con **AR / factura de cliente** (`out_invoice`): su `invoice_date_due` (vencimiento) y `amount_residual` (saldo). 
- **Umbral inteligente posible:** para este stage, 🔴 = factura **vencida** (hoy > `invoice_date_due`) en vez de un conteo fijo de días. (Sinergia Frente B: cuando AR=0 → `project/archive-budget-cierre` lo archiva → sale del semáforo solo.)

### 1.5 SO ↔ proyecto · unidad · terminales (re-confirmado)

- **1:1 bidireccional:** `sale.order.project_id` ↔ `project.project.sale_order_id` (+ dual-write `x_studio_many2one_field_RjLNg`). Algunos proyectos sin SO (`SO11312` orphan — tema YIN).
- **Unidad de vigilancia = `project.project`** (las tareas NO; sus stages son ruido).
- **Terminales a excluir:** `Canceled` (4), `Templates` (6). **`Complete TOTAL` (8) = decisión §3** (recomendado: terminal — no tiene sentido medir "tiempo en Complete"; el último stage vigilado sería `En plazo de credito`).

---

## 2. Diseño (v2)

### 2.1 Config SLA — `shared/operaciones/sla_stages.json`

**DOS umbrales por métrica, por stage.** Estructura por stage vigilado:
```
{ stage_id, grupo, label, responsable_email,
  en_stage:      { amarillo_dias, rojo_dias },     // métrica A
  sin_seguimiento:{ amarillo_dias, rojo_dias } }    // métrica B
```
- 🟡 amarillo = preventivo al **~90% del deadline rojo** (`amarillo_dias = round(rojo_dias * 0.9)`) — puede derivarse o ponerse explícito.
- `En plazo de credito` puede usar **modo "due-date"** (🔴 = factura vencida) en vez de `rojo_dias` fijo.
- Stages excluidos no llevan fila (o `vigilar:false`).

### 2.2 Watchdog — n8n cron diario (`ops/watchdog-semaforo`)

1. **Lee** proyectos activos en stages vigilados → `id, name, stage_id, sale_order_id, partner_id, last_update_status`.
2. **Métrica A (en stage):** 1 búsqueda `mail.message` subtype 94 de esos `res_id`, order date desc → última por proyecto → `días_en_stage`.
3. **Métrica B (sin seguimiento):** 1 búsqueda `mail.message` `message_type='comment'`, `author_id not in <bots/watchdog>`, order date desc → última por proyecto → `días_sin_seguimiento`. (Sin comments → desde `create_date`.)
4. **Color por proyecto** = el PEOR de las 2 métricas vs su SLA: 🟢 `< amarillo` · 🟡 `≥ amarillo` · 🔴 `≥ rojo`. Override 🔴/🟡 si `last_update_status ∈ {off_track, at_risk}`. (Para `En plazo de credito`: 🔴 si factura vencida.)
5. **🔴 → CORREO** al `responsable_email` del stage (vía Graph, como el handoff A1): digest de sus proyectos en rojo (proyecto, cliente, métrica que disparó, días). Idempotencia anti-spam: re-alerta solo si el set 🔴 cambió (`staticData`).
6. **LOG NOTE al chatter** (requisito): por cada proyecto que entra/cambia de color (o en rojo), `CREATE mail.message` (`message_type='notification'`, subtype Note) en su `project.project` → registro permanente ("🔴 watchdog: 21 días en Done Operations, sin seguimiento 40 días").
7. **Snapshot histórico** → persiste el color de cada proyecto del día (`shared/operaciones/semaforo_snapshots/` o `staticData`) → alimenta el **KPI mensual %verde** y la tendencia.

### 2.3 Endpoint `/ops/semaforo` (n8n webhook GET)
Devuelve la grilla: por stage → `{label, grupo, responsable, count, n_verde, n_amarillo, n_rojo}` + lista de proyectos con `{name, cliente, dias_en_stage, dias_sin_seguimiento, color, link_odoo}` + tiles KPI (incl. **%verde del mes** por grupo). Auth: JWT (patrón Finanzas) o token interno.

### 2.4 Frontend `operaciones/semaforo/`
Grilla por **grupo** (Operaciones / Admin) → columnas = stages (orden `sequence`), badge 🟢🟡🔴 (peor de la columna) + conteo. **Cada proyecto muestra las 2 métricas** (en-stage / sin-seguimiento) con su color. Click → drill-down (días, cliente, link Odoo). Tiles: **%verde del mes** (meta ≥90%) por grupo, proyectos 🔴, AP draft, off_track.

### 2.5 KPI mensual ≥90% verde
Del snapshot diario: `%verde_mes = días-proyecto-en-verde / días-proyecto-totales` del mes, por grupo. El frontend lo muestra como el indicador de gestión de Ops/Admin.

---

## 3. Decisiones pendientes (Esteban — me las pasas después)

1. **Umbrales por stage, para CADA métrica** (🔴 días de "en stage" y 🔴 días de "sin seguimiento"; el 🟡 sale a 90%). Tabla a llenar para los 7 vigilados.
2. **Correos de responsables** por stage/grupo: Operaciones={1,2,5}→?, Admin={3,7,13,(8)}→? (¿uno por grupo, o por stage?).
3. **¿`Complete TOTAL` (8) es terminal** (excluido) o se vigila? (recomendado terminal).
4. **¿`Hold` se vigila o se excluye?** (parado intencional — quizá umbral largo o excluido).
5. **`En plazo de credito`:** ¿umbral fijo de días o modo "due-date" (🔴 = factura de cliente vencida)?
6. **Canal/frecuencia de alerta:** correo diario por responsable; ¿también digest a un líder? ¿WhatsApp?
7. **Auth del endpoint** `/ops/semaforo`: JWT (Finanzas) o token simple.
8. **Identidad del watchdog** (autor de los log notes): ¿uid del credential Odoo FTS (2) o un usuario "Watchdog" dedicado? (afecta el filtro de la métrica B).

---

## 4. Para construir (cuando se apruebe)
1. `shared/operaciones/sla_stages.json` (stages reales + 2 umbrales/métrica + responsables).
2. `ops/watchdog-semaforo` (n8n cron: 2 métricas vía chatter + color + correo 🔴 + log note + snapshot).
3. `ops/semaforo` (n8n webhook GET → grilla + KPI).
4. `operaciones/semaforo/` (frontend grilla 2-métricas + tiles + %verde mensual).

🤖 Diagnóstico read-only (v2) generado con [Claude Code](https://claude.com/claude-code) — sin cambios a Odoo ni n8n.
