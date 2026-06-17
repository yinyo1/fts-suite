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

## 5. v3 — Umbrales + integridad anti-manipulación + casos especiales (validado read-only 2026-06-17)

> ⭐ **Resultado clave: TODO es viable solo-lectura. NADA requiere tocar código de Odoo** (el tracking necesario ya está activo). Único punto que *opcionalmente* tocaría Odoo = recrear un campo "materiales" limpio (§5.4, decisión Esteban — evitable).

### 5.1 Umbrales (Esteban) — 🟡 = 90% del 🔴

| Stage | Grupo | 🔴 EN STAGE | 🔴 SIN SEGUIMIENTO |
|-------|-------|-------------|---------------------|
| To Do (1) | Ops | 1 día | 1 día |
| In Progress (2) | Ops | **DINÁMICO:** hoy > `project.date` | 2 días |
| Hold (5) | Ops | 30 días | 7 días |
| Done Operations (3) | Admin | 2 días | 1 día |
| Admin - In progress (7) | Admin | 14 días | 1 día |
| En plazo de credito (13) | Admin | **DINÁMICO (crédito)** | **DINÁMICO (crédito)** |
| Complete (8) / Canceled (4) / Templates (6) | — | **EXCLUIDOS** | — |

### 5.2 Dinámico "In Progress" — `project.project.date` ✅ validado
- `project.date` ("Expiration Date", `ttype=date`, **`tracking=100`**) — poblado por **A1** desde `x_studio_fecha_fin_deseada` (verificado: proyecto 2347 = 2026-06-24). 🔴 = `hoy > project.date`.
- **Fallback sin fecha** (propuesta): 🔴 a 30 días en stage **+** badge "⚠️ sin fecha fin" en el frontend (para que Comercial la cargue). Decisión Esteban.

### 5.3 Dinámico "En plazo de credito" — términos de crédito ✅ validado
- 🔴 = `fecha_entrada_stage` (último subtype-94 del chatter) **+** `días_credito` **+ 7**.
- `días_credito` = `res.partner.property_payment_term_id` → `account.payment.term` → `line_ids.nb_days` (tomar el mayor si hay varias líneas).
- **Probado:** Nalco (94) → término **`10 "60 Days FTS 2024"`** → `nb_days=60` → 🔴 a **67 días**. Budenheim (815) → **sin término** → **fallback** (propuesta **30+7=37**, decisión Esteban).

### 5.4 ⭐ Integridad anti-manipulación — DETECTABLE read-only (cero cambios a Odoo)

`project.date` y `stage_id` tienen **`tracking=100`** → Odoo ya loguea cada cambio en `mail.message` (autor + fecha) + `mail.tracking.value` (old/new). El watchdog SOLO LEE.

**(#3) Manipulación de FECHA FIN** — `mail.tracking.value` `[field_id=24700]` (project.date) → `mail_message_id` → `author_id` + `date`. **65 cambios ya registrados** (estructura verificada). Regla: **flag si el autor NO ∈ whitelist Comercial** (y `old_value` ≠ false = edición real, no el set inicial).
- ⚠️ **TRAMPA DE USUARIOS CONFIRMADA:** `ventas@fts.mx` = **user 6 "OPERACIONES FTS-YIN"** (partner **12**) = **OPERACIONES** (NO comercial, pese al correo "ventas"). `montalvo@fts.mx` = **user 12 "Sales FTS"** (partner **306**) = **Montalvo = COMERCIAL**. ⇒ **whitelist por partner/user id, NUNCA por email.** Comercial confirmado: partner **306** (Montalvo). **Decisión Esteban: lista completa de comercial** (¿quién más?).

**(#4) Reseteo de STAGE hacia atrás** — `mail.tracking.value` `[field_id=24714]` (stage_id) da `old_value_integer`/`new_value_integer` (ej. real `13→8`) + el `mail_message_id` da el autor. Regla: **flag si `sequence(new_stage) < sequence(old_stage)`** (movimiento hacia atrás) + reporta autor y de→hacia. Cero cambios a Odoo.

### 5.5 Caso "PURA VENTA DE MATERIALES" — ⚠️ el campo exacto no existe hoy
- **NO hay** un campo Studio con valores literales "proyecto/materiales". Lo que existe en `sale.order`:
  - `x_studio_product_type` "Product Type" — **bien poblado**: `Servicio` 6658 · `Flete realizado` 2820 · `MRO` 401 · `Terciada` 62 · `PO Generation` 44 · `Comision Cristian` 5 · (vacío 375).
  - `x_studio_business_unit` — casi vacío (96 de ~10,365): Automatización/Electromecanico/Mantenimiento/Product. **No sirve.**
- **Propuesta (cero Odoo):** categorizar el proyecto vía `project.sale_order_id` → `SO.x_studio_product_type`, con **mapping configurable** de qué valores = "materiales" (candidatos: `MRO`, `Terciada`, `PO Generation`). 
- **DECISIÓN Esteban:** (a) usar `x_studio_product_type` con mapping (read-only, recomendado), **o** (b) recrear un campo limpio `tipo: proyecto/materiales` (esto SÍ toca Studio/Odoo).
- Umbrales agresivos materiales: **To Do 1 día, In Progress 1 día**. **Sub-semáforo separado** (impacta Compras + Ops), medido aparte.

### 5.6 Jornada hábil + cadencia (n8n puro, cero Odoo)
- **Días hábiles:** Code node en n8n. Si el cambio entró **> 17:00** o en **sábado/domingo** → el reloj arranca el **próximo día hábil 8 AM**. `días` = días hábiles transcurridos (excluye sáb/dom). **Decisión:** ¿agregar calendario de festivos MX? (por ahora no).
- **Cadencia:** watchdog corre **días hábiles, 8 AM CST** (Schedule n8n). **Ops:** correo **diario + semanal**. **KPI %cumplimiento:** **semanal** (con el semáforo semanal). **Mensual** al cierre.
- **Destinatario:** **`estebandelacruz@fts.mx`** (modo prueba), **parametrizable por área** en el config (Ops/Admin después).

### 5.7 `shared/operaciones/sla_stages.json` — estructura propuesta
```json
{
  "config": {
    "alert_recipient_default": "estebandelacruz@fts.mx",
    "watchdog_author_partner_id": 2,
    "comercial_whitelist_partner_ids": [306],
    "materiales_field": "x_studio_product_type",
    "materiales_values": ["MRO", "Terciada", "PO Generation"],
    "credit_fallback_days": 30, "credit_extra_days": 7,
    "in_progress_fallback_dias": 30,
    "business_day_cutoff_hour": 17, "amarillo_pct": 0.9
  },
  "stages": {
    "1":  { "label": "To Do", "grupo": "Operaciones",
            "en_stage": { "rojo_dias": 1 }, "sin_seguimiento": { "rojo_dias": 1 } },
    "2":  { "label": "In Progress", "grupo": "Operaciones",
            "en_stage": { "modo": "due_date", "campo": "project.date" }, "sin_seguimiento": { "rojo_dias": 2 } },
    "5":  { "label": "Hold", "grupo": "Operaciones",
            "en_stage": { "rojo_dias": 30 }, "sin_seguimiento": { "rojo_dias": 7 } },
    "3":  { "label": "Done Operations", "grupo": "Admin",
            "en_stage": { "rojo_dias": 2 }, "sin_seguimiento": { "rojo_dias": 1 } },
    "7":  { "label": "Admin - In progress", "grupo": "Admin",
            "en_stage": { "rojo_dias": 14 }, "sin_seguimiento": { "rojo_dias": 1 } },
    "13": { "label": "En plazo de credito", "grupo": "Admin",
            "en_stage": { "modo": "credito" }, "sin_seguimiento": { "modo": "credito" } }
  },
  "materiales_overrides": { "1": { "en_stage": { "rojo_dias": 1 } }, "2": { "en_stage": { "rojo_dias": 1 } } },
  "excluidos": [8, 4, 6],
  "integridad": { "fecha_fin_field_id": 24700, "stage_field_id": 24714 }
}
```

### 5.8 Arquitectura del watchdog (actualizada)
Cron días-hábiles 8 AM → (1) lee proyectos vigilados + `sale_order_id` + `project.date` + `last_update_status`; (2) **métrica A** vía último subtype-94 (con jornada hábil); (3) **métrica B** vía último `comment` no-bot; (4) **dinámicos:** In Progress vs `project.date`, En plazo de credito vs término del cliente; (5) **color** = peor de A/B (+ overrides materiales + `last_update_status`); (6) **banderas anti-manip:** lee `mail.tracking.value` (date/stage) → autor no-comercial / stage-atrás; (7) **🔴 → correo** al responsable (+ banderas como sección aparte "posible manipulación"); (8) **log note** al chatter (`message_type='notification'`); (9) **snapshot** → KPI %verde semanal/mensual. Cadencia diaria/semanal/mensual.

### 5.9 Viable read-only vs requiere Odoo
| Necesidad | ¿Read-only? | Notas |
|-----------|:-----------:|-------|
| 2 métricas (stage / seguimiento) | ✅ | chatter (subtype 94 / comment) |
| Dinámico In Progress | ✅ | `project.date` (tracked, poblado A1) |
| Dinámico crédito | ✅ | `property_payment_term_id.nb_days` |
| Anti-manip fecha fin | ✅ | `mail.tracking.value` 24700 + autor (tracking ya activo) |
| Anti-manip stage atrás | ✅ | `mail.tracking.value` 24714 + sequence |
| Jornada hábil / cadencia | ✅ | n8n puro |
| Log note al chatter | ✅ | CREATE `mail.message` (write mínima, ya validado) |
| **Campo "materiales" limpio** | ⚠️ | **NO existe**; usar `x_studio_product_type` (read-only) **o** recrear (toca Studio) → **decisión** |

---

## 4. Para construir (cuando se apruebe)
1. `shared/operaciones/sla_stages.json` (stages reales + 2 umbrales/métrica + responsables).
2. `ops/watchdog-semaforo` (n8n cron: 2 métricas vía chatter + color + correo 🔴 + log note + snapshot).
3. `ops/semaforo` (n8n webhook GET → grilla + KPI).
4. `operaciones/semaforo/` (frontend grilla 2-métricas + tiles + %verde mensual).

🤖 Diagnóstico read-only (v2) generado con [Claude Code](https://claude.com/claude-code) — sin cambios a Odoo ni n8n.
