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

## 6. BUILD — #1 config ✅ + #2 watchdog (diseño para revisión, 2026-06-17)

**#1 `shared/operaciones/sla_stages.json`** → ✅ creado y commiteado (`ebc870b`). Refleja todas las decisiones finales.

### 6.1 Watchdog `ops/watchdog-semaforo` — grafo de nodos (a generar como JSON e importar por UI)
> Método: igual que el budget DEV — script genera el JSON byte-perfect → import por UI (MCP rechaza update_partial/full; create preserva customResource). Best-effort en escrituras. **NO se activa hasta tu revisión.**

Cadena lineal (cada lectura Odoo corre 1 vez vía nodos "collapse→1 ítem"; el `Code MAIN` referencia cada lectura con `$('nodo').all()`):

1. **Manual Trigger** + **Schedule** (cron `0 14 * * 1-5` = Lun-Vie 8 AM CST) → 2 entradas.
2. **HTTP - load config** (GET `raw.githubusercontent.com/.../shared/operaciones/sla_stages.json`).
3. **Odoo getAll projects** — `project.project` `[stage_id in [1,2,5,3,7,13]]` (active implícito) → `id,name,stage_id,sale_order_id,partner_id,date,last_update_status`.
4. **Code prep** — extrae listas: `projIds, soIds, partnerIds`.
5. **Odoo getAll SO** `[id in soIds]` → `id, x_studio_product_type` (materiales).
6. **Odoo getAll partners** `[id in partnerIds]` → `id, property_payment_term_id` (crédito).
7. **Odoo getAll payment.term.line** `[payment_id in termIds]` → `payment_id, nb_days`.
8. **Odoo getAll msg94** `[model=project.project, res_id in projIds, subtype_id=94]` order date desc → métrica A + autor del cambio de stage.
9. **Odoo getAll msgComment** `[model=project.project, res_id in projIds, message_type=comment]` order date desc → métrica B.
10. **Odoo getAll trackedMsgs** `[model=project.project, res_id in projIds, date >= hoy-30d]` → `res_id, author_id, date, tracking_value_ids` (anti-manip).
11. **Odoo getAll trackingVals** `[id in <tracking_value_ids planos>]` → `field_id, old/new_value_integer, old/new_value_datetime, mail_message_id`.
12. **Code MAIN** (núcleo — §6.2).
13. **Code buildLogNotes** → ítems `{res_id, body}` para 🔴/flag.
14. **Odoo CREATE mail.message** (log note) item-based: `model=project.project, res_id, body, subtype_id=2, message_type='notification', author_id=2`. onError continue.
15. **HTTP PUT snapshot** → GitHub `shared/operaciones/semaforo_snapshots/<fecha>.json` (para el KPI %verde histórico). onError continue.

### 6.2 `Code MAIN` — jsCode del núcleo (PARA REVISAR la lógica)
```javascript
const cfg = $('HTTP - load config').first().json;
const C = cfg.config, STG = cfg.stages, MAT = cfg.materiales_overrides, EXCL = cfg.excluidos;
const SEQ = {1:0, 2:1, 5:2, 3:3, 7:4, 13:8, 8:9, 4:10, 6:11};      // sequence por stage_id
const COM = C.comercial_whitelist_partner_ids, WD = C.watchdog_author_partner_id;
const FF = cfg.integridad.fecha_fin_field_id, FS = cfg.integridad.stage_field_id;
const today = new Date();                                          // (idealmente inyectar fecha vía args)

// ---- jornada hábil: días hábiles entre 'fromISO' y hoy; si entró >17h o finde, arranca próximo hábil 8am
function startClock(d){ d=new Date(d); let h=d.getHours();
  if (C.excluir_findes && (d.getDay()===6||d.getDay()===0)){ while(d.getDay()===6||d.getDay()===0){d.setDate(d.getDate()+1);} d.setHours(C.business_day_start_hour,0,0,0); return d; }
  if (h>=C.business_day_cutoff_hour){ d.setDate(d.getDate()+1); while(C.excluir_findes&&(d.getDay()===6||d.getDay()===0)){d.setDate(d.getDate()+1);} d.setHours(C.business_day_start_hour,0,0,0); }
  return d; }
function bizDays(fromISO){ if(!fromISO) return null; let s=startClock(fromISO), n=0, c=new Date(s);
  while(c < today){ const g=c.getDay(); if(!(C.excluir_findes&&(g===6||g===0))) n++; c.setDate(c.getDate()+1);} return n; }

// ---- reduce mensajes a "último por proyecto"
function lastBy(node, filt){ const m={}; for(const it of $(node).all()){ const r=it.json; if(filt&&!filt(r))continue;
  const rid=r.res_id; if(!m[rid]||new Date(r.date)>new Date(m[rid].date)) m[rid]=r; } return m; }
const aId = v => Array.isArray(v)?v[0]:v;
const lastStageMsg = lastBy('Odoo getAll msg94');                                   // métrica A
const lastComment  = lastBy('Odoo getAll msgComment', r => aId(r.author_id)!==WD);  // métrica B (excluye watchdog)

// ---- materiales (vía SO) + términos de crédito
const matSO = {}; for(const it of $('Odoo getAll SO').all()){ matSO[it.json.id] = C.materiales_values.includes(it.json.x_studio_product_type); }
const termDays = {}; for(const it of $('Odoo getAll payment.term.line').all()){ const t=aId(it.json.payment_id); termDays[t]=Math.max(termDays[t]||0, Number(it.json.nb_days)||0); }
const partnerTerm = {}; for(const it of $('Odoo getAll partners').all()){ partnerTerm[it.json.id]= it.json.property_payment_term_id?aId(it.json.property_payment_term_id):null; }

// ---- anti-manipulación (tracking values recientes)
const trkByMsg = {}; for(const it of $('Odoo getAll trackingVals').all()){ trkByMsg[aId(it.json.mail_message_id)] = it.json; }
const flagsByProj = {};
for(const it of $('Odoo getAll trackedMsgs').all()){ const m=it.json; const t=trkByMsg[m.id]; if(!t) continue; const au=aId(m.author_id);
  (flagsByProj[m.res_id] = flagsByProj[m.res_id]||[]);
  if(t.field_id && aId(t.field_id)===FF && t.old_value_datetime && !COM.includes(au))   // fecha fin movida por no-comercial
    flagsByProj[m.res_id].push({tipo:'fecha_fin', autor:m.author_id[1], fecha:m.date});
  if(t.field_id && aId(t.field_id)===FS && SEQ[t.new_value_integer]<SEQ[t.old_value_integer]) // stage hacia atrás
    flagsByProj[m.res_id].push({tipo:'stage_atras', de:t.old_value_char, a:t.new_value_char, autor:m.author_id[1], fecha:m.date}); }

// ---- color por umbral
function color(dias, rojo){ if(dias==null||rojo==null) return 'verde'; if(dias>=rojo) return 'rojo'; if(dias>=Math.round(rojo*C.amarillo_pct)) return 'amarillo'; return 'verde'; }
function rojoEnStage(p, sc, esMat){ const o = esMat&&MAT[p.stage_id]?MAT[p.stage_id].en_stage:sc.en_stage;
  if(o.modo==='fijo') return o.rojo_dias;
  if(o.modo==='due_date'){ if(!p.date) return C.in_progress_fallback_dias; /* manejado aparte por fecha */ return null; }
  if(o.modo==='credito'){ const t=partnerTerm[aId(p.partner_id)]; const d=(t&&termDays[t]!=null)?termDays[t]:C.credit_fallback_days; return d + C.credit_extra_days; }
  return null; }

const out=[];
for(const it of $('Odoo getAll projects').all()){ const p=it.json; const sid=p.stage_id?aId(p.stage_id):null;
  if(EXCL.includes(sid)) continue; const sc=STG[String(sid)]; if(!sc) continue;
  const esMat = p.sale_order_id ? !!matSO[aId(p.sale_order_id)] : false;
  const ls = lastStageMsg[p.id]; const diasEnStage = ls?bizDays(ls.date):null;
  const lc = lastComment[p.id];  const diasSinSeg  = lc?bizDays(lc.date):(p.create_date?bizDays(p.create_date):null);
  // métrica A color: due_date especial (In Progress)
  let colA;
  const oEn = (esMat&&MAT[sid]?MAT[sid].en_stage:sc.en_stage);
  if(oEn.modo==='due_date'){ if(!p.date){ colA = color(diasEnStage, C.in_progress_fallback_dias); } else { colA = (new Date(p.date) < today)?'rojo':'verde'; } }
  else { colA = color(diasEnStage, rojoEnStage(p, sc, esMat)); }
  // métrica B color
  const oSeg = (esMat&&MAT[sid]&&MAT[sid].sin_seguimiento?MAT[sid].sin_seguimiento:sc.sin_seguimiento);
  let rojoSeg = oSeg.modo==='credito' ? rojoEnStage(p,sc,esMat) : oSeg.rojo_dias;
  const colB = color(diasSinSeg, rojoSeg);
  // peor de A/B + override last_update_status
  const ord={verde:0,amarillo:1,rojo:2}; let col = ord[colA]>=ord[colB]?colA:colB;
  if(['off_track'].includes(p.last_update_status)) col='rojo'; else if(['at_risk'].includes(p.last_update_status)&&col==='verde') col='amarillo';
  out.push({ json:{ id:p.id, name:p.name, stage_id:sid, stage:sc.label, grupo:sc.grupo,
    cliente: p.partner_id?p.partner_id[1]:'', es_materiales:esMat,
    dias_en_stage:diasEnStage, dias_sin_seguimiento:diasSinSeg, color_a:colA, color_b:colB, color:col,
    banderas: flagsByProj[p.id]||[], link_odoo:'https://serviciosfts.odoo.com/web#id='+p.id+'&model=project.project&view_type=form' }});
}
return out;
```
> ⚠️ Nota de revisión: `p.create_date` y la fecha "hoy" — conviene inyectar la fecha del watchdog vía `args`/Set para reproducibilidad; los reads de project deben incluir `create_date`. La métrica A `due_date` (In Progress) compara `project.date < hoy` directo; las demás usan días hábiles vs umbral.

### 6.3 ✅ Watchdog GENERADO (2026-06-17) — listo para importar por UI

- **Generador:** `scripts/local/gen-watchdog.js` (gitignored). **Salida:** `scripts/local/watchdog-semaforo.json` (gitignored) — **27 nodos, JSON válido, 0 conexiones rotas, 10 nodos Odoo con `customResource`+credencial Odoo FTS**.
- **3er control AP incluido** (stage 13): lee `Odoo - getAll msgComment` (con `body`+`attachment_ids`) + `Odoo - getAll attachments` (`mimetype`) → en `Code - MAIN`: busca un comment con el template (`config.ap_confirmacion.template`, normalizado sin acentos/case) **Y** un adjunto `image/*`; si falta → bandera `ap_sin_confirmacion`. **Control de PRESENCIA, no de contenido.** 🔮 **OCR = refinamiento futuro** (leer/validar el contenido del pantallazo) — no en este build.
- **Importar:** n8n UI → Import from File → `watchdog-semaforo.json` → crea **`ops/watchdog-semaforo`** INACTIVO.
- ⚠️ **Post-import (quirk §3):** revisar en los 10 nodos Odoo que `customResource` no se haya blanqueado + credencial **Odoo FTS** asignada. Para **`HTTP - PUT snapshot (GitHub)`**: asignar credencial **Header Auth "GitHub FTS Suite"** (el id va como `REEMPLAZAR`). 
- **Probar:** ejecutar con el **Manual Trigger** (no activar). Hace reads + escribe **log notes** reales al chatter (best-effort) + **snapshot** a `shared/operaciones/semaforo_snapshots/<fecha>.json`. Revisar la salida de `Code - MAIN` (colores, días, banderas) antes de activar.
- **Nota de patrón n8n:** cadena lineal con nodos "collapse" (`Code - col*` que devuelven 1 ítem) para que cada lectura Odoo corra UNA vez; `Code - MAIN` referencia cada lectura con `$('nodo').all()`. La fecha "hoy" se inyecta vía `Set - hoy` (`$now.toISO()`).
- ⚠️ **Quirk HTTP load config (resuelto):** GitHub raw sirve el `sla_stages.json` con `content-type: text/plain` → el nodo HTTP de n8n NO lo parsea (lo entrega como `{data:"<string>"}`) → `cfg.config` undefined. **Fix:** (a) HTTP node → Options → Response → Response Format = `JSON`; **y/o** (b) parse defensivo en el Code: `const cfg = (_r && _r.config) ? _r : JSON.parse(_r.data || _r.body || ...)`. Ambos aplicados en el generador. **Aplica igual a #3 correo y #4 endpoint** (también cargan el config desde raw).

### 6.4 Pendientes del build (siguientes piezas)
- #3 workflow correo (digest 🔴/🟡 + sección "posible manipulación", diario/semanal/mensual, idempotencia staticData).
- #4 `ops/semaforo` (webhook GET → grilla JSON + KPI).
- #5 frontend `operaciones/semaforo/`.

## 8. Panorama del 1er run + decisión de filtrado (read-only, 2026-06-17)

**Validación del caso extremo (proyecto 178 "10441"):** creado 2025-07-03, **NUNCA cambió de stage** (su único mensaje es una nota automática, NO comment), **sin cliente** → 250 días hábiles = **CORRECTO** (≈349 cal × 5/7). Es un **zombie / import artifact**, no señal.

**Composición de los ~101 proyectos vigilados:**
| | Proyectos |
|--|----------:|
| **CON cliente (set real a vigilar)** | **47** — ToDo 3 · InProg 11 · Hold 3 · DoneOps 11 · Admin 16 · EnCrédito 3 |
| Sistema (`is_internal_project`/`is_fsm` = "Internal"/"Field Service") | 13 (ToDo 12, InProg 1) — sin cliente |
| Zombies sin cliente, no-sistema (numéricos "10441/SO10441", "CENTRO DE COSTOS") | ~41 — casi todos 2025-07-03 (~250d) o 2024 |

⇒ **De 101, solo 47 son proyectos reales.** El resto (~54) son zombies + sistema → con umbral To Do = 1 día, el semáforo se llenaría de **~54 rojos viejos que nadie va a accionar = ruido, no señal.**

**Validación de 2 casos más (lógica OK en general):**
- **2337 (Quimitec, To Do, real, creado 06-15):** sin subtype-94, sin comment → 2 días hábiles → 🔴. **Correcto** (proyecto real estancado 2d en To Do = señal legítima para Ops).
- **240 (SO11227, stage 13 En plazo crédito):** último subtype-94 = **2026-06-17** (entró ayer por la reconfig) → en-stage ≈0; último comment humano = 2025-12-17 → sin-seguimiento ≈128d. ⚠️ Nota: la **reconfig del 06-17 generó cambios de stage masivos** → la métrica "en stage" quedó **reseteada a ayer** para muchos proyectos; la métrica "sin seguimiento" es la que hoy refleja la realidad.

**Banderas:**
- **AP (stage 13):** TODOS los stage-13 actuales dispararán `ap_sin_confirmacion` — el template/proceso es **nuevo**, ningún comment viejo lo tiene. Esperado (no son violaciones, es el arranque del proceso). Se apagará conforme usen el log note.
- **Anti-manip:** la reconfig movió muchos proyectos el 06-17 (autores 996 Admin / 306 Montalvo / 3 Esteban). El watchdog las leerá; revisar el primer run por si alguna fue stage-atrás real (vs la reorg). (No reproducido aquí; se ve en el output del run.)

### 8.1 ⭐ DECISIÓN DE FILTRADO — recomendación
**Filtro recomendado: vigilar SOLO proyectos CON cliente** (`partner_id != false`) → 101 → **47 reales**. Una línea en el dominio de `Odoo - getAll projects`:
```
[["stage_id","in",[1,2,5,3,7,13]], ["partner_id","!=",false]]
```
- Los proyectos reales (auto-creados por A1) **siempre traen cliente** (de la SO). Sin cliente = zombie/interno. Filtro de alta señal, 0 falsos negativos esperados.
- **Belt-and-suspenders (opcional):** además excluir `is_internal_project`/`is_fsm` (estructural, como Frente B) — aunque "con cliente" ya los atrapa (no tienen partner).
- **Los ~41 zombies "10441/SO10441"** = **backlog de higiene de datos** (archivarlos en Odoo, frente aparte). Frente B no los atrapó porque nunca llegaron a stages de cierre (siguen en To Do). El filtro los oculta del semáforo; limpiarlos es tarea separada de Esteban.

**Aplicación:** editar el dominio del nodo `Odoo - getAll projects` (UI) o regenerar. Decisión Esteban: ¿solo "con cliente", o "+ excluir is_internal/is_fsm"?

### 8.2 ⚠️ 2º hallazgo (post-filtro): el set limpio (47) sale CASI TODO ROJO por la métrica B
Confirmado el set en **47** (ToDo 3 · InProg 11 · Hold 3 · DoneOps 11 · Admin 16 · Crédito 3). Pero al medir la **recencia del último comment humano** (métrica B): de una muestra, **solo ~1 de cada 10 tiene nota reciente** (ej. proj 101 = ayer); el resto tiene su último comment de **hace MESES** (28→dic-2025, 59/72→mar-2025, 108→jun-2025, 143/146→sep-2025…). Muchos no tienen comment nunca (fallback create_date → también viejo).
- **Implicación:** con umbrales "sin seguimiento" de **1–2 días**, **casi los 47 salen 🔴 en métrica B**. Y como el color = peor(A,B), el semáforo limpio sale **≈ todo rojo HOY**.
- La métrica A (en stage) está **mayormente verde** ahora (la reconfig del 06-17 reseteó la entrada-a-stage a ayer) → no compensa.
- **NO es ruido de zombies (eso ya se filtró)** — es real: **nadie pone notas de seguimiento**. La pregunta de diseño: ¿"sin seguimiento 1 día" es la **disciplina buscada** (🔴 = "ponle nota hoy"; el equipo adopta el hábito → verde; el KPI mensual ≥90% mide la adopción), o es **demasiado agresivo**? **Decisión Esteban antes de #3 (correo)** — si no, el primer correo manda ~47 rojos.
- Opciones: (a) dejar 1–2 días (disciplina dura, rojo = baseline a mejorar), (b) aflojar "sin seguimiento" (ej. 3–5 días hábiles), (c) el correo #3 arranca SOLO con métrica A + banderas, y "sin seguimiento" como lista informativa hasta que el hábito agarre.

## 9. #3 Correo — DISEÑO para revisión (2026-06-18)

> Decisión Esteban: umbral estricto SE MANTIENE (rojo = verdad operativa a corregir); el correo debe ser **accionable y priorizado**, no avalancha de 47 rojos idénticos. Filtro ya bakeado (47 reales).

### 9.1 Integración (no un workflow aparte)
El correo va **dentro del watchdog** (ya tiene los datos de `Code - MAIN`): nueva rama desde `Code - col-main`, paralela a logNotes/snapshot → `Code - buildEmail` → `HTTP - Enviar correo (Graph)` (patrón A1, best-effort). El watchdog corre diario → correo diario.

### 9.2 Estructura del correo (priorizada, NO lista plana)
Construido en `Code - buildEmail` desde `Code - MAIN`. Buckets:
- `criticos` = `color_a==='rojo' && color_b==='rojo'` (atorado **Y** sin seguimiento).
- `ponleNota` = `color_b==='rojo' && color_a!=='rojo'` (avanza en stage pero sin nota).
- `enStage` = `color_a ∈ {rojo,amarillo}` agrupado por stage.
- `integridad` = `banderas.length > 0`.

**HTML (orden de arriba a abajo):**
1. **RESUMEN (banner):** `🚦 Semáforo Operaciones — DD/Mon/YYYY` + tiles **Total N · 🟢 V · 🟡 A · 🔴 R · %verde X%** + barra de progreso hacia **meta ≥90%**. Convierte la avalancha en objetivo medible.
2. **🔴🔴 CRÍTICOS:** tabla destacada (proyecto · cliente · días en stage · días sin nota · stage · link Odoo). "Máxima urgencia."
3. **✍️ PONLE NOTA HOY:** lista accionable (proyecto · cliente · días sin nota · link). "Avanzan en su etapa, falta registrar seguimiento." Separado de lo urgente-urgente.
4. **⏱️ EN STAGE (atorados):** rojos/amarillos de métrica A, **agrupados por stage**.
5. **🚩 INTEGRIDAD / POSIBLE MANIPULACIÓN:** banderas (fecha fin por no-comercial · stage atrás · AP sin confirmación), sección aparte al final.

**Subject:** `[Semáforo Ops] DD/Mon — 🔴N críticos · ✍️M sin nota · X% verde`.

### 9.3 Cadencia (un correo, bloques condicionales por fecha)
- **Diario (Ops):** siempre el digest priorizado.
- **Semanal (lunes):** + bloque **KPI %verde de la semana** (promedio project-days-verde de los snapshots de la semana, leídos de GitHub).
- **Mensual (1er día hábil del mes):** + bloque **cierre mensual** (%verde del mes anterior).
- Detectado en `Code - buildEmail` por `$now` (día de semana / día de mes).

### 9.4 Idempotencia anti-spam (staticData)
`staticData` guarda el **set crítico previo** (ids de `criticos` + `integridad`). En el envío diario:
- Si el set crítico **cambió** → resalta los **nuevos** críticos/banderas arriba ("🆕 desde ayer").
- Si **no cambió** → el digest va igual (ritmo operativo) pero marca "sin cambios en críticos desde ayer" (no re-alarma como nuevo).
- (Alternativa: **saltar** el envío si NADA cambió — decisión Esteban; recomiendo enviar diario con la nota de cambios.)

### 9.5 Destinatario
`config.recipients_por_grupo` (Ops/Admin) o `alert_recipient_default` (`estebandelacruz@fts.mx` en prueba). Decisión: **¿un correo combinado (Ops+Admin) o uno por grupo** (2 envíos, cada quien lo suyo)? Recomiendo **por grupo** al salir de prueba; en prueba, uno solo a Esteban.

### 9.6 Decisiones para Esteban (antes de generar)
1. **Idempotencia:** ¿enviar diario siempre (con nota de cambios) o saltar si nada cambió?
2. **Por grupo vs combinado:** ¿1 correo Ops+Admin, o 2 (Ops / Admin)?
3. **KPI semanal:** ¿% de proyectos verdes el lunes, o promedio project-days de la semana? (lo 2º es más justo pero pesa más snapshots).
4. **Sección "EN STAGE":** ¿incluir amarillos (preventivo) o solo rojos?

## 7. PENDIENTE — otro frente (NO en este build): botón Confirmar de la SO
Mejora de captura SO (toca **Odoo/Studio**, frente aparte): hacer **`x_studio_product_type` obligatorio** + en blanco al crear + **condición de visibilidad del botón Confirmar** junto con MO/Materiales del handoff (patrón pure-Studio §17 quirk #4: `invisible` en el botón Confirmar condicionado a los campos). Sin esto, las órdenes "materiales" pueden quedar sin clasificar. **NO construir ahora.**

---

## 4. Para construir (cuando se apruebe)
1. `shared/operaciones/sla_stages.json` (stages reales + 2 umbrales/métrica + responsables).
2. `ops/watchdog-semaforo` (n8n cron: 2 métricas vía chatter + color + correo 🔴 + log note + snapshot).
3. `ops/semaforo` (n8n webhook GET → grilla + KPI).
4. `operaciones/semaforo/` (frontend grilla 2-métricas + tiles + %verde mensual).

🤖 Diagnóstico read-only (v2) generado con [Claude Code](https://claude.com/claude-code) — sin cambios a Odoo ni n8n.
