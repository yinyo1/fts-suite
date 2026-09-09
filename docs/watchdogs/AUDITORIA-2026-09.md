# Auditoría de watchdogs — operaciones y administración (septiembre 2026)

**Sesión de investigación. No se construyó ni se modificó nada:** cero writes a Odoo, cero
ediciones de workflow, cero correos enviados. Todo lo de abajo es lectura.

- **Fecha de la auditoría:** 2026-09-09 (05:00–05:30 UTC = 2026-09-08 23:00–23:30 CST)
- **Alcance pedido:** `ops/watchdog-semaforo` + el watchdog de administración, más inventario
  de los otros tres.
- **Hallazgo de encuadre, antes de cualquier detalle:** *no existe un "watchdog de
  administración" aparte.* `fin/watchdog-captura` (`hckccUkyaAItBmbU`) vigila la **captura
  bancaria** (Jeeves ↔ journal 61 ↔ Chase), no cuentas por cobrar. Los cuatro errores
  reportados como "Administración" (días en stage, plazos de crédito, clientes sin plazo,
  fecha comercial) **viven todos en `ops/watchdog-semaforo`**, en su grupo `Admin`: el
  mismo workflow manda dos correos distintos, uno a Operaciones y otro a Admin, y la lógica
  de crédito está en `Code - MAIN` del semáforo. Esto importa para el plan: son **un solo
  workflow que arreglar**, no dos.

---

## PASO 1 · Estado actual

### 1.1 Inventario de los cinco watchdogs

Leído con `search_workflows` (2026-09-09 05:05 UTC):

| Workflow | ID | Activo | triggerCount | Nodos | Creado | Último cambio | Legible por MCP |
|---|---|---|---|---|---|---|---|
| `ops/watchdog-semaforo` | `29eaGe2wkS98lRMU` | ✅ sí | 1 | 29 | 2026-06-18 | 2026-08-30 | sí |
| `fin/watchdog-captura` | `hckccUkyaAItBmbU` | ✅ sí | 1 | 22 | 2026-08-12 | **2026-09-09 04:49** | sí |
| `ops/watchdog-mo (W1-W5 Fase 1.5)` | `RBxoREDTfehELmyr` | ✅ sí | 1 | ? | 2026-07-09 | 2026-07-17 | **no** |
| `rh/watchdog/sin-checkin` | `Q19zFeJQytSfBjdb` | ✅ sí | 1 | ? | 2026-06-20 | 2026-06-20 | **no** |
| `comercial/watchdog-enviadas (T2 canary)` | `hJNTUd8E57W4rfjU` | ❌ no | 0 | 7 | 2026-07-16 | 2026-08-31 | sí |

⚠️ **Límite de esta auditoría, declarado:** `ops/watchdog-mo` y `rh/watchdog/sin-checkin`
tienen `availableInMCP: false`, así que **no pude leer su JSON ni sus ejecuciones**
(`get_workflow_details` → *"Workflow is not available in MCP"*). Este contenedor tampoco
tiene la API key de n8n (`~/.claude.json` → `mcpServers: []`), así que el camino alterno del
PUT directo (CLAUDE.md §17 quirk #3) no estaba disponible. Lo que digo de esos dos sale de
`docs/operaciones/FASE15_CUENTAS_WATCHDOGS.md`, `docs/rh/WATCHDOG_SIN_CHECKIN.md` y sus
configs en `shared/` — **documentación, no lectura del workflow**. Para cerrarlos hace falta
que Esteban prenda *MCP access* en la tarjeta de cada uno.

### 1.2 `ops/watchdog-semaforo` — 29 nodos

**Trigger y horario real.** Dos triggers: `Manual Trigger` y
`Schedule (Lun-Vie 8am CST)` con `cronExpression: "0 14 * * 1-5"`.
`settings.timezone = "Etc/UTC"` → **14:00 UTC = 08:00 CST, L-V**. Verificado contra las
ejecuciones reales, que arrancan todas a `14:00:00.xxx` UTC. El horario **sí** es el que
dice el nombre.

**Cadena de nodos** (lineal, sin ramas hasta el final):

```
Manual / Schedule → Set - hoy → HTTP - load config → Odoo - getAll projects → Code - prep
  → Odoo - getAll SO       → Code - col1
  → Odoo - getAll partners → Code - col2
  → Odoo - getAll termlines→ Code - col3
  → Odoo - getAll msg94    → Code - col4
  → Odoo - getAll msgComment → Code - col5
  → Odoo - getAll trackedMsgs → Code - extractIds
  → Odoo - getAll trackingVals → Code - col6
  → Odoo - getAll attachments → Code - MAIN → Code - col-main
                                                ├→ Code - buildLogNotes → Odoo - CREATE log note
                                                ├→ Code - buildSnapshot → HTTP - PUT snapshot (GitHub)
                                                └→ Code - buildEmail    → HTTP - Enviar correo (Graph)
```

Los `Code - colN` son todos `return [{ json:{ ok:true } }];` — colapsadores para que el
`getAll` siguiente corra una sola vez. Nueve nodos de los 29 son plomería.

**Config viva:** `HTTP - load config` lee
`https://raw.githubusercontent.com/yinyo1/fts-suite/main/shared/operaciones/sla_stages.json`
en cada corrida. Cambiar umbrales o destinatarios = editar + push a main, sin re-importar.

**Las consultas exactas a Odoo:**

| # | Modelo | Dominio | Campos |
|---|---|---|---|
| 1 | `project.project` | `stage_id in [1,2,5,3,7,13]` · `partner_id != false` · `is_internal_project != true` · `is_fsm != true` | id, name, stage_id, sale_order_id, partner_id, date, last_update_status, create_date |
| 2 | `sale.order` | `id in soIds` | id, `x_studio_product_type` |
| 3 | `res.partner` | `id in partnerIds` | id, `property_payment_term_id` |
| 4 | `account.payment.term.line` | **sin dominio** (todas) | payment_id, nb_days |
| 5 | `mail.message` | `model=project.project` · `res_id in projIds` · **`subtype_id = 94`** | res_id, date, author_id |
| 6 | `mail.message` | `model=project.project` · `res_id in projIds` · `message_type = comment` | res_id, date, author_id, body, attachment_ids |
| 7 | `mail.message` | `model=project.project` · `res_id in projIds` · `date >= hoy−30d` | res_id, author_id, date, tracking_value_ids |
| 8 | `mail.tracking.value` | `id in trkIds` | field_id, old/new_value_integer, old/new_value_datetime, old/new_value_char, mail_message_id |
| 9 | `ir.attachment` | `id in attIds` | id, mimetype |

**Qué campo de fecha se usa para cada métrica** (esto es la raíz de casi todo):

- **Semáforo A — "estancamiento en stage"** = `bizDays(último mail.message subtype 94)`,
  y **si no hay ninguno → `bizDays(project.create_date)`**.
- **Semáforo B — "falta de seguimiento"** = `bizDays(último mail.message message_type=comment
  cuyo autor ≠ watchdog y cuyo body normalizado no queda vacío)`, y si no hay ninguna →
  `bizDays(project.create_date)` con la bandera `sin_nota_valida`.
- **`bizDays`** cuenta días hábiles **transcurridos** (hoy = 0, ayer hábil = 1), en hora de
  Monterrey vía offset manual `tz_offset_hours: -6`, porque `settings.timezone` no aplica a
  `getHours()` dentro de un Code node.
- **Modo `credito`** (stage 13): el rojo se calcula como
  `nb_days(property_payment_term_id del partner del proyecto) + credit_extra_days(7)`, con
  `credit_fallback_days = 30` si el partner no trae término. Es decir: **el plazo de crédito
  se saca del cliente, no de la factura**, y se aplica sobre `dias_en_stage`.
- **Modo `due_date`** (stage 2 In Progress): compara `today` contra `project.date`
  (fecha compromiso), amarillo 3 días naturales antes.
- **Color final** = el peor de A y B, y `last_update_status` puede empeorarlo
  (`off_track` → rojo, `at_risk` → amarillo).

**Umbrales vigentes** (`sla_stages.json` v1.2, 2026-08-09):

| stage_id | label | grupo | A (en_stage) | B (sin_seguimiento) |
|---|---|---|---|---|
| 1 | To Do | Operaciones | fijo 1d | fijo 2d |
| 2 | In Progress | Operaciones | `due_date` sobre `project.date` (fallback 30d) | fijo 2d |
| 5 | Hold | Operaciones | fijo 30d | fijo 2d |
| 3 | Done Operations | **Admin** | fijo 2d | fijo 2d |
| 7 | Admin - In progress | **Admin** | fijo 14d | fijo 2d |
| 13 | En plazo de credito | **Admin** | `credito` | fijo 2d |

Amarillo = `max(rojo − 1, 1)`. Excluidos: stages 8 (Complete TOTAL), 4 (Canceled), 6
(Templates). Overrides de materiales (`x_studio_product_type = 'MRO'`) para stages 1 y 2.

**Banderas de integridad:**
- `fecha_fin`: cambió `project.date` (field_id 24700) y el autor **no** está en
  `comercial_whitelist_partner_ids: [306]`.
- `stage_atras`: `sequence(stage nuevo) < sequence(stage viejo)` (field_id 24714).
- `ap_sin_confirmacion`: en stage 13 sin un comment que contenga el texto
  `"CONFIRMACIÓN AP CLIENTE - en plazo de pago"` **y** una imagen adjunta.
- `nota_vacia`, `hold_sin_fecha_vigente`.

**Plantilla del correo** (`Code - buildEmail`). Asunto:
`[Semaforo <grupo>] DD/Mon/AAAA - 🔴🔴 N criticos · 🔵 N estancados · 📝 N sin nota`.
Cuerpo, en este orden fijo:

1. Cabecera con total de proyectos y los dos semáforos (verde/amarillo/rojo de A y de B).
2. `🔴🔴 CRITICOS — doble rojo` (A rojo **y** B rojo).
3. `🔄 SEGUIMIENTO SIN AVANCE` (racha de notas casi idénticas ≥ 2).
4. `🔵 SOLO ESTANCADOS` (A rojo, B no).
5. `📝 SOLO SIN SEGUIMIENTO` (B rojo, A no).
6. `🟡 AMARILLOS — preventivo`.
7. `🔬 NUEVO CRITERIO — EN OBSERVACION` (bloque temporal, ver 1.6).
8. `🚩 INTEGRIDAD / posible manipulacion`.
9. KPI semanal (solo lunes) y cierre mensual (solo los días 1–3).

**El correo se manda siempre**, para los dos grupos, aunque no haya ni un renglón: las
secciones vacías imprimen `- ninguno -`. No hay guarda de vacío. (Los otros watchdogs sí la
tienen — ver 1.7.)

**DESTINATARIOS DE HOY** (leídos de `shared/operaciones/sla_stages.json` en main,
`config.recipients_por_grupo`, con `modo_prueba: false`):

- **Semáforo Operaciones** → `felipe@fts.mx`, `gibran@fts.mx`, `mateo@fts.mx`,
  `estebandelacruz@fts.mx`, `info_comercialFTS@fts.mx`
- **Semáforo Admin** → `erick@fts.mx`, `gerardo@fts.mx`, `carolina@fts.mx`,
  `estebandelacruz@fts.mx`, `info_comercialFTS@fts.mx`

Confirmado contra el encabezado real de un correo entregado (18-ago, vía Graph):
`Para: Erick Belmont; Gerardo Lozano; Carolina Lugo; Jesus Esteban De La Cruz; Info_comercialFTS`.

**Escrituras del semáforo** (no es read-only puro):
- `Odoo - CREATE log note`: `mail.message` con `subtype_id=2`, `message_type=notification`,
  **`author_id=3`** (Esteban), solo cuando el estado cambió vs la corrida previa
  (`staticData.estadoPrev`).
- `HTTP - PUT snapshot (GitHub)`: `shared/operaciones/semaforo_snapshots/AAAA-MM-DD.json`
  a main, todos los días.

### 1.3 `fin/watchdog-captura` — 22 nodos

**Trigger:** `A - Schedule 08:15 CST` con `cronExpression: "15 8 * * 1-5"` y
`settings.timezone = "America/Monterrey"`. **Es el único de los cinco que escribe el cron en
hora local** en vez de su equivalente UTC. Verificado contra ejecuciones: arrancan a
`14:15:00` UTC = 08:15 CST. Funciona hoy, pero depende de que `settings.timezone` sobreviva
— y CLAUDE.md §18 lección #1 documenta que n8n **lo descarta al importar**. Si alguien
re-importa este workflow, el cron se va al TZ de la instancia (`America/New_York`) y corre a
las 07:15 CST sin avisar.

**Qué vigila:** la captura bancaria del **journal 61** (Jeeves Tarjeta de Crédito) y las
cuentas Chase de los journals **122** (cheques, cuenta GL 1557) y **123** (tarjeta, GL 1558).
Nada que ver con cuentas por cobrar.

**Consultas:**

| # | Modelo / fuente | Filtro | Para qué |
|---|---|---|---|
| 3 | Jeeves MCP `list_transactions` | `startDate = hoy−30d`, `transactionStatuses:['settled']` | fuente de verdad externa |
| 4 | `account.bank.statement.line` | `journal_id = 61` · `date >= hoy−30d` | emparejar contra Jeeves |
| 5 | `mail.message` | `model=account.journal` · `res_id=61` · `body like %CBRUN%` · `date >= hoy` | ¿corrió la captura? |
| 6 | `mail.message` | `model=account.journal` · `res_id=61` · `body like %CBWATCH%` | auto-vigilancia + tendencia |
| 7 | `account.online.account` | sin dominio | balance de Plaid |
| 7d | `account.online.link` | sin dominio | `state` del enlace bancario |
| 8 | `account.move.line` | `account_id in [1557,1558]` · `parent_state=posted` | suma del GL |
| 8d | `account.bank.statement.line` | `journal_id in [122,123]` · `create_date >= hoy−30d` | frescura real de captura |

**Fechas y umbrales:** ventana 30 días; `GRACIA_DIAS = 3` (los últimos 3 días CST no
alertan, por el lag de liquidación p95 2.6d); `UMBRAL_LAG = 20`;
`UMBRAL_HORAS_SIN_CBRUN = 3`; `UMBRAL_DIAS_HABILES_SIN_WATCH = 2`;
`TOLERANCIA_DELTA = 0.01`. La frescura de captura se mide con **`create_date` de la última
línea bancaria** (no con `last_sync` de Plaid — eso se corrigió el 2026-09-09), con gracia
**por journal**: 3 días para el 122, 4 para el 123. El delta se compara contra un
`delta_esperado` constante y medido: **224,977.63** para el 122 (saldo inicial nunca
contabilizado) y **0** para el 123.

**15 tipos de alerta:** `FALTANTES_NUEVAS`, `LAG_CERCA_DE_VENTANA`, `RECHAZOS_EN_INSERT`,
`CONTEO_NO_CONFIABLE`, `SIN_CBRUN`, `CAPTURA_SIN_RESPIRAR`, `WATCHDOG_SIN_LATIDO`,
`JEEVES_SIN_RESPUESTA`, `MATCHER_FALLO`, `LINK_DESCONECTADO`, `CHASE_SYNC_RANCIO`,
`CHASE_DELTA_DERIVO`, `CHASE_LECTURA_FALLO`, `CAPTURA_LECTURA_FALLO`,
`CUENTA_SIN_MAPEO_GL`.

**Plantilla:** asunto `[Watchdog captura] ALERTA — <tipos> — AAAA-MM-DD` (u `ok`). Cuerpo:
un bloque rojo por alerta con título en español y tabla propia, luego una tabla `Estado`
(rango evaluado, conteos Jeeves/Odoo, CBRUN, y un bloque por cuenta online), luego
`Cuarentena` (4 pérdidas conocidas por colisión de hash v1) y `Avisos`.

**DESTINATARIO DE HOY:** `DESTINATARIOS = ['estebandelacruz@fts.mx']` — **uno solo, y
hardcodeado en el Code node `1 - Code config`, no en un JSON de config.** Es el único de los
cinco cuyos destinatarios no se pueden cambiar sin editar el workflow.

**Escrituras:** `10 - Odoo CREATE CBWATCH` deja un `mail.message` (`author_id=3`,
`subtype_id=2`) en el chatter del journal 61 **en cada corrida, haya alerta o no**. El correo
solo sale si `hay_alerta` (nodo `IF - hay alerta?`). Sí tiene guarda de vacío.

**Higiene, a favor:** este workflow **sí** trae `retryOnFail: true, maxTries: 3` en el nodo
de Graph. El semáforo no.

### 1.4 Los otros tres (por documentación, no por lectura del JSON)

- **`ops/watchdog-mo`** (`RBxoREDTfehELmyr`, activo). W1–W5 de Fase 1.5: checkout sin cuenta
  ni proyecto, horas sin confirmar, reasignación cross-depto, doble confirmación. Cron
  `0 15 * * 1-5` + `timezone UTC` = 9 AM CST. Config
  `shared/operaciones/watchdogs_mo.json`: `canary: false`, W1–W5 todos `true`.
  **Destinatarios:** `estebandelacruz@fts.mx`, `felipe@fts.mx`, `ana.acevedo@fts.mx`,
  `magaly@fts.mx`. Riesgo documentado en FASE15 §Parte 11: su filtro depende de **dos textos
  literales** (`Correccion de atribucion` + `panel Confirmar Horas`) que escribe
  `corregir-bolsa`; si alguien cambia el texto, W3/W4 se van a 0 **sin lanzar error**.
- **`rh/watchdog/sin-checkin`** (`Q19zFeJQytSfBjdb`, activo). Empleados activos sin checkin
  ≥ 5 días hábiles. Cron `0 14 * * 1-5` + tz UTC. **Destinatarios:** `estebandelacruz@fts.mx`,
  `magaly@fts.mx`, `ana.acevedo@fts.mx` (hardcodeados en el Code). Guarda de vacío: si 0
  empleados, no manda correo. **Contradicción documental:** `docs/rh/WATCHDOG_SIN_CHECKIN.md`
  dice *"🔴 inactivo → solo falta Publish"* y n8n reporta `active: true, triggerCount: 1`.
  El doc está stale; el workflow lleva **2 meses y medio corriendo sin que nadie lo haya
  vuelto a tocar** (último cambio 2026-06-20).
- **`comercial/watchdog-enviadas`** (`hJNTUd8E57W4rfjU`, **inactivo**, `triggerCount: 0`).
  Cotizaciones `state=sent` sin movimiento, medido desde **`write_date`** — limitación que el
  propio código documenta: *"write_date mide la última vez que cualquier proceso tocó
  cualquier campo, NO la última vez que un vendedor le dio seguimiento"*, y 60 órdenes
  comparten el mismo `write_date` de una escritura masiva. **Destinatario:** solo
  `estebandelacruz@fts.mx` (`canary: true`). **Contradicción inversa a la de RH:**
  `shared/comercial/watchdog_enviadas.json` dice `"activo": true` y el workflow está apagado.

### 1.5 Cómo se conectan con el resto de la suite

**De qué leen:**
- Semáforo: `project.project`, `sale.order`, `res.partner`, `account.payment.term.line`,
  `mail.message`, `mail.tracking.value`, `ir.attachment` de Odoo + su config de GitHub raw.
- Captura: Jeeves MCP + `account.bank.statement.line`, `account.online.account/link`,
  `account.move.line`, `mail.message` de Odoo.

**Qué depende de sus salidas — la respuesta corta es: nada automatizado.**
- Los **snapshots** (`shared/operaciones/semaforo_snapshots/`, 60 archivos, 1.3 MB) **no
  tienen ningún consumidor de código**. `grep` en todo el repo: las únicas referencias están
  en `CLAUDE.md`, `docs/operaciones/SEMAFORO_WATCHDOG.md`,
  `docs/comercial/AUDITORIA-2026-08.md` y `docs/comercial/AUDITORIA-SESION-2.md` — todos
  documentos. El frontend `operaciones/semaforo/` y el endpoint `ops/semaforo` siguen
  pendientes (CLAUDE.md §18 pendientes #4 y #5). **Hoy el snapshot es un archivo
  write-only** — que es justo lo que hizo posible esta auditoría, así que su valor es real,
  pero nadie lo lee en automático.
- El **CBWATCH** en el chatter del journal 61 lo lee **el propio watchdog de captura** en la
  corrida siguiente (auto-vigilancia + serie de tendencia). Es el único caso de una salida de
  watchdog consumida por código.
- Los **log notes** que el semáforo escribe en el chatter de cada proyecto no los lee nadie.
  Y hay un acoplamiento latente ahí: el semáforo escribe con `author_id = 3` (Esteban) pero
  filtra las notas ajenas por `watchdog_author_partner_id = 2`. Hoy no se auto-alimenta
  **solo porque escribe con `message_type = notification`** y la consulta de seguimiento pide
  `message_type = comment`. `watchdog_author_partner_id: 2` es config muerta, y si alguien
  cambiara ese `message_type`, el watchdog empezaría a contar sus propias notas como
  seguimiento humano.

**Lógica compartida con comercial / rentabilidad:** no hay código compartido, hay
**patrón copiado**. `docs/rh/WATCHDOG_SIN_CHECKIN.md` lo dice explícito ("el watchdog reusa
el nodo Graph + la misma credencial + el mismo Schedule"), y `comercial/SUPUESTOS.md` dice
que clonó `ops/watchdog-mo`. Consecuencias:
- **Los cinco mandan por la misma credencial** `Microsoft Graph - sales`
  (`Mh5kBNduMzOl3nzT`) **desde el mismo remitente** `sales@fts.mx`. Es la única credencial
  de Microsoft en la instancia (verificado en `docs/po-radar/AUDITORIA-2026-08.md`): un
  límite de esa app es un límite de todo el correo del sistema.
- Con la rentabilidad (Frente A) **no comparten nada**, y ahí hay un hueco: el semáforo
  decide "en plazo de crédito" sin mirar una sola factura, mientras
  `project/archive-budget-cierre` (Frente B) **sí** calcula AR y AP por analítica con
  `amount_residual`. Dos automatizaciones sobre el mismo proyecto, una con noción de cobranza
  y la otra sin ella.

### 1.6 Bloque "EN OBSERVACION": una excepción que ya caducó

`sla_stages.json` → `observacion: { stages: [13], hasta: "2026-08-24" }`. El mecanismo está
bien diseñado (caduca solo, sin tocar nada). Pero **caducó hace 11 días hábiles** y el efecto
de su caducidad es medible y grande: el stage 13 pasó de puntuar con el criterio de crédito a
puntuar con la regla de nota diaria. En los snapshots, el rojo de B en el grupo Admin salta de
**1 el 21-ago a 18 el 24-ago**. Nadie recalibró después del salto.

### 1.7 Reglas duplicadas o contradictorias entre los cinco

| Tema | Semáforo | Captura | MO | RH | Comercial |
|---|---|---|---|---|---|
| Base de la cuenta de días | días **hábiles** desde nota/creación | días **naturales** CST desde `create_date` de línea | (n/d) | días **hábiles** desde `check_in` | días **naturales** desde `write_date` |
| Cron | `0 14` + tz `Etc/UTC` | **`15 8` + tz `America/Monterrey`** | `0 15` + tz UTC | `0 14` + tz UTC | `45 14` + tz UTC |
| Nombre del modo prueba | `modo_prueba` | (no tiene) | `canary` (redirige todo + `[CANARY]`) | (no tiene) | `canary` (solo a Esteban) |
| Destinatarios | JSON en main, por grupo | **hardcoded en el Code** | JSON en main | hardcoded en el Code | JSON en main |
| Guarda de vacío | **NO — siempre manda 2 correos** | sí (`IF - hay alerta?`) | sí (guards por bloque) | sí (0 filas → `[]`) | sí (0 filas → `[]`) |
| Reintento del envío | no | **sí, 3 intentos** | no | no | no |
| Fallback si el config no carga | **muere y falla en rojo** (deliberado, tras el 17-ago) | n/d | muere en silencio | n/d | **degrada a defaults + banner** |
| `active` real vs documentado | coincide | coincide | coincide | **doc dice inactivo, está activo** | **config dice activo, está apagado** |

Contradicciones que valen la pena nombrar:

1. **Tres convenciones de horario en cinco workflows.** Cuatro escriben el cron en UTC
   (defensa contra el bug de §18: n8n descarta `settings.timezone` al importar); el de
   captura lo escribe en hora local y confía en el `timezone`. Las dos estrategias son
   defendibles; **tenerlas mezcladas no**, porque la defensa de una es exactamente el
   supuesto que rompe a la otra.
2. **Tres nombres para "no le pegues al equipo todavía"**: `modo_prueba`, `canary`
   (redirigir), `canary` (recortar destinatarios).
3. **Dos direcciones de drift entre config y realidad** — RH activo con doc que lo cree
   apagado, comercial apagado con config que lo cree activo. Ninguna de las dos se detecta
   sola.
4. **Solo el semáforo manda sin tener nada que decir.** Los otros cuatro se callan cuando no
   hay hallazgos. Esa asimetría es, por sí sola, una de las causas de que el semáforo se lea
   como ruido: es el único que aparece todos los días haga falta o no.

---

## PASO 2 · Histórico real de correos

### 2.1 Fuentes y su límite

- **Ejecuciones en n8n:** solo **10–11 por workflow**, la más vieja del 2026-08-26. La
  retención es de 14 días (`EXECUTIONS_DATA_MAX_AGE=336`, CLAUDE.md §14). **No sirve para el
  histórico**, y eso ya está documentado como regla (§9: el historial de ejecuciones no prueba
  ausencia de corridas).
- **Snapshots en el repo:** `shared/operaciones/semaforo_snapshots/`, **60 archivos** del
  2026-06-17 al 2026-09-08. Cada archivo = una corrida = **2 correos**. Esta es la fuente
  buena, y es exacta porque el snapshot y el correo se construyen del mismo
  `Code - MAIN`, en ramas hermanas.
- **Buzón de Esteban vía Graph:** corrobora la entrega real y da los asuntos. Usada para
  cruzar.

### 2.2 Cuántos correos, con qué frecuencia

**Semáforo:** 59 días hábiles entre el 2026-06-18 y el 2026-09-08. Hay snapshot de **58**.

- **Falta 1 día entero:** `2026-07-10` (jueves). No hay snapshot → esa corrida no llegó a
  `Code - col-main`.
- **2 corridas produjeron snapshot con error en vez de datos**, las dos con el mismo
  mensaje crudo:
  `{"error": "Cannot read properties of undefined (reading 'comercial_whitelist_partner_ids') [line 4]"}`
  → **2026-06-17** (la primera corrida de su vida) y **2026-08-17** (el lunes que documenta
  el comentario de `Code - buildEmail`: *"la ejecucion salia VERDE sin enviar nada"*). El
  buzón confirma que el 17-ago **no llegó ningún** `[Semaforo …]`, y que el 18-ago sí.
- **Total entregado: ≈ 114 correos** (57 corridas buenas × 2 grupos) en 12 semanas,
  **2 por día hábil**.

**Captura:** desde su go-live (2026-08-12) hasta el 2026-09-08 hay 20 días hábiles. En el
buzón hay **17 correos**, y **todos dicen `ALERTA`**. Ni uno solo con `ok`. La secuencia de
tipos, leída de los asuntos:

| Fecha | Tipos en el asunto |
|---|---|
| 08-12 | `FALTANTES_NUEVAS` |
| 08-17 | `FALTANTES_NUEVAS, RECHAZOS_EN_INSERT, CHASE_SYNC_RANCIO, CHASE_SYNC_RANCIO` |
| 08-18 | `FALTANTES_NUEVAS, RECHAZOS_EN_INSERT, CHASE_SYNC_RANCIO, CHASE_SYNC_RANCIO` |
| 08-19 | `CHASE_SYNC_RANCIO, CHASE_SYNC_RANCIO` |
| 08-20 | `CHASE_SYNC_RANCIO, CHASE_SYNC_RANCIO` |
| 08-21 · 24 · 25 · 26 | `LINK_DESCONECTADO` (4 días seguidos) |
| 08-27 · 28 · 31 · 09-01 | `CHASE_SYNC_RANCIO` (4 días seguidos) |
| 09-03 | `CHASE_DELTA_DERIVO` |
| 09-04 | `CHASE_SYNC_RANCIO, CHASE_DELTA_DERIVO` |
| 09-07 · 09-08 | `CHASE_SYNC_RANCIO` |

Dos lecturas:
- El asunto **repetía el mismo tipo dos veces** el 17–20 de agosto (una alerta por cuenta,
  sin deduplicar). Hoy ya deduplica.
- **`LINK_DESCONECTADO` × 4 y `CHASE_SYNC_RANCIO` × 4** son el mismo hecho gritado cuatro
  veces. Y `CHASE_DELTA_DERIVO` el 3-sep (0.00 → −62.53) y otra vez el 4-sep (−62.53 → 0.00)
  es **el mismo hueco transitorio alertado en las dos direcciones** — el propio código lo
  reconoce ahora: *"ALERTO LAS DOS VECES por el mismo hueco transitorio… Nada se habia
  perdido"*. Ese comentario, y el cambio a `delta_esperado` + gracia por journal, es del
  **2026-09-09 04:49 UTC**, o sea de anteayer/hoy: **el ruido de captura ya está atendido en
  parte**, y esta auditoría solo puede medir el antes.

### 2.3 Cuántos renglones traía cada correo y cómo evolucionó

Renglones = entradas en las cuatro secciones accionables (críticos + solo estancados +
solo sin nota + amarillos). Promedio por correo:

| Ventana | Grupo | Corridas | Renglones/correo | Críticos | Solo est. | Solo nota | Amarillos | Banderas |
|---|---|---|---|---|---|---|---|---|
| 18-jun → 15-jul | Operaciones | 19 | **8.1** | 2.0 | 2.1 | 3.5 | 0.5 | 2.6 |
| 18-jun → 15-jul | Admin | 19 | **14.6** | 5.4 | 8.4 | 0.8 | 0.0 | 11.5 |
| 11-ago → 8-sep | Operaciones | 20 | **16.4** | 4.7 | 3.0 | 5.0 | 3.8 | 7.8 |
| 11-ago → 8-sep | Admin | 20 | **10.6** | 5.6 | 3.5 | 1.3 | 0.1 | 9.7 |

El volumen de Operaciones **se duplicó** (8.1 → 16.4). El de Admin bajó de 14.6 a 10.6 pero
su carga de banderas se mantuvo en ~10 por correo.

**El indicador que más importa: el semáforo B ya no produce verdes.**

| Fecha | B verde | B amarillo | B rojo |
|---|---|---|---|
| 2026-08-25 | 15 | 0 | 11 |
| 2026-08-26 | **0** | 20 | 6 |
| 2026-08-27 | **0** | 3 | 23 |
| 2026-08-28 | **0** | 0 | 26 |
| 2026-08-31 | **0** | 7 | 26 |
| 2026-09-01 | **0** | 6 | 27 |
| 2026-09-02 | **0** | 15 | 19 |
| 2026-09-03 | **0** | 3 | 31 |
| 2026-09-04 | **0** | 0 | **34 de 34** |
| 2026-09-07 | **0** | 20 | 15 |
| 2026-09-08 | **0** | 0 | **35 de 35** |

**Once corridas seguidas con cero verdes, y dos de ellas con el 100 % de la cartera en rojo.**
La meta escrita en el propio correo es *"≥90 % verde"*. Medido: **0 %**.

Y no es que el equipo haya dejado de trabajar. Es aritmética: `rojo_dias = 2` → amarillo =
`max(2−1,1) = 1` → **verde exige `dias_sin_seguimiento = 0`, o sea una nota escrita hoy
antes de las 08:00 CST**, que es cuando sale el correo. Verificado empíricamente sobre los
pares `(dias_sin_seguimiento, color_b)` de los snapshots: el 2026-08-25, los 15 verdes
tienen **todos** `dias_sin_seguimiento = 0`; no hay un solo verde con 1. **El verde del
semáforo B es inalcanzable por construcción para quien trabaje en horario de oficina.**

### 2.4 Qué porcentaje de los renglones se repite día tras día

Midiendo "el mismo proyecto en la misma sección que en la corrida anterior":
**678 de 1,184 = 57.3 %**. Pero ese número está *deprimido* por un artefacto: el semáforo B
oscila con el día de la semana, así que los proyectos brincan de sección sin que cambie nada
en el mundo. La medida sin artefacto es la de estancamiento (A), y ahí:

**En 58 corridas se observaron 71 cambios de stage y CERO reinicios de `dias_en_stage`.**
La métrica nunca bajó, ni una vez, para ningún proyecto (ver PASO 3, error #1).

Concentración del volumen: **28 proyectos aparecen en ≥ 20 de las 58 corridas y aportan
941 de 1,231 renglones = 76 % de todo lo que se ha mandado.** 16 proyectos aparecen en ≥ 30
corridas (54 % del volumen). 3 proyectos aparecen en ≥ 50 (14 %).

### 2.5 Los renglones más repetidos de toda la historia

`runsA` = corridas con `color_a = rojo`. `rachaA` = corridas rojas consecutivas hasta hoy.

| runsA | rachaA | visto | id | Proyecto | Stage hoy | "días en stage" hoy |
|---|---|---|---|---|---|---|
| **58/58** | **58** | 58 | 2327 | SO11511 · Válvula lavado de botellas — BEBIDAS PURIFICADAS | En plazo de credito | 100 |
| **58/58** | **58** | 58 | 101 | SO7723 · Integración con sensor de nivel — MAGNEKON (Juventino Hernández) | En plazo de credito | **401** |
| 57/58 | 47 | 58 | 213 | SO11037 · Distribución eléctrica luminarias Cabina de Flejadora — JOHNSON CONTROLS | **Hold** | **266** |
| 32 | 29 | 46 | 2305 | SO11557 · Enchaquetado — Mission Foods | (salió) | 123 |
| 32 | 32 | 32 | 2298 | SO11631 · BSH | En plazo de credito | 114 |
| 31 | 29 | 58 | 241 | SO11290 · Test loop ingeniería Mexicali — Nalco | En plazo de credito | 203 |
| 30 | 28 | 58 | 160 | SO10300 · Techo de Magnekon | En plazo de credito | 330 |
| 28 | 28 | 47 | 2356 | SO11773 · **ELECTRICAL DUMP STATION DALLAS 2** — Mission Foods | In Progress | 48 |
| 28 | 28 | 47 | 2355 | SO11673 · **Póliza de matto Compresor Houston** — Mission Foods | In Progress | 48 |
| 27 | 27 | 27 | 2304 | SO11646 · BSH | En plazo de credito | 104 |
| 25 | 16 | 52 | 2353 | SO11779 · Reparación motores de rampa — BEBIDAS PURIFICADAS | En plazo de credito | 53 |
| 21 | 0 | 52 | 2352 | SO11699 · **Sensores en ductos** — Bridgestone | In Progress | 53 |
| 15 | 0 | 58 | 506 | SO11492 · Ductos de aire área de chips — Mission Foods | In Progress | 187 |

**Tres proyectos llevan 58 de 58 corridas en el correo** — desde el primer día que el
watchdog existe. Dos de ellos con racha ininterrumpida de 58. Eso son ~116 apariciones
individuales en el buzón de cinco personas, por tres proyectos, sin que la alerta haya
producido un cambio de estado. Y los cuatro casos que el equipo reportó como falsos
positivos (Luminarias, Sensores, Dallas, Compresor) están todos en esta tabla.

**Las banderas se comportan igual o peor.** Total en 58 corridas: 911 banderas, de 5 tipos:

| Veces | Tipo | Texto más repetido |
|---|---|---|
| 509 | `ap_sin_confirmacion` | "En plazo de credito SIN confirmacion AP documentada (falta log note + pantallazo)" |
| 265 | `stage_atras` | **133×** "Stage regresado Hold → En proceso por **OPERACIONES FTS-YIN**" |
| 86 | `nota_vacia` | 82× "1 log note(s) sin contenido en el chatter" |
| 33 | `hold_sin_fecha_vigente` | "En Hold con fecha de reactivacion VENCIDA" |
| 18 | `fecha_fin` | 18× "Fecha fin movida por **Jesus Esteban De La Cruz** (no Comercial)" |

El mecanismo del ruido de banderas es estructural: la consulta 7 pide
`date >= hoy − 30 días`, así que **un cambio de stage se vuelve a marcar todos los días
durante 30 días** (~21 correos). Las 18 apariciones de "Fecha fin movida por Jesus Esteban
De La Cruz" son **un solo cambio**, hecho por el CEO, marcado como sospechoso 18 veces —
porque `comercial_whitelist_partner_ids` solo contiene al partner 306.

Y `ap_sin_confirmacion` disparó hoy en **8 de 8** proyectos del stage 13: es el 100 % de su
población. Un control que marca a todo el mundo no discrimina nada.

---

## PASO 3 · Los ocho errores reportados por el equipo

### Antes de los ocho: la mejor evidencia de todas ya la escribió el equipo

El 2026-08-19 a las 14:37 UTC (08:37 CST), **Erick Belmont** contestó el `[Semaforo Admin]`
del 18-ago punto por punto (`internetMessageId`
`<BN0PR22MB2768FFC8053C335111D887D5D6A52@BN0PR22MB2768.namprd22.prod.outlook.com>`, con
copia a Felipe y Gerardo). Extractos textuales:

> **SO7723 · 🔴 en stage 386d** — "Se ha dado seguimiento pero esté proyecto no han ido para
> calar el sensor para que Juventino nos de el VoBo y se proceda a terminar ese proyecto y ya
> tenemos cobrado el 90% de todo el proyecto."

> **SO10300 · 🔴 315d** — "Se ha mandado correo, se busca por teléfono pero hasta que hablamos
> con seriedad con las de recepción responden y no nos dan cita… y así es el juego con
> Magnekon."

> **SO11290 · 🔴 188d** — "Se envío factura apenas el **15 de agosto** a cliente por
> instrucciones de Operaciones, aunque entre el 3 y el 15 se estuvo solicitando el GR."

> **SO11511 · 🔴 85d** — "La factura **INV 1996** fue enviada, pero no se ha hecho comentarios
> debido a que esta tiene un plazo de **120 días** y fue timbrada y remitida en su momento
> **13 de mayo** y no le vemos sentido a estar comente y comente sino hasta que se acerque el
> vencimiento, salvo mejor opinión."

> **SO11779 · 🔴 38d** — "Se cargo la factura el 21 de julio y son 120 días de crédito
> entonces sucede lo mismo que el proyecto anterior."

> **SO11748 · 🔴 14d** — "Ayer se mandó la factura del 10% final del proyecto… si no había
> avance es porque apenas lo terminaron, entonces por eso en estos 14 días no se puso notas."

Y cerró: *"si gustas podemos tener una reunión de todo el equipo (Comercial, Operaciones y
Finanzas) con la finalidad de que entendamos y veamos que podemos mejorar de este tipo de
situaciones."*

Eso es un destinatario explicando, con nombres y fechas, que **siete de siete renglones no
eran accionables por él**. Es el mejor argumento de esta auditoría y no lo escribí yo.

### 3.1 Administración

#### Error #1 — "Cuenta mal los días en stage" · ✅ EXISTE · es el bug raíz de todo

**Dónde vive:** `29eaGe2wkS98lRMU` → nodo **`Code - MAIN`**, dos líneas:

```js
const lastStageMsg = lastBy('Odoo - getAll msg94');
...
const ls=lastStageMsg[p.id];
const diasEnStage = ls ? bizDays(ls.date) : (p.create_date ? bizDays(p.create_date) : null);
```

**Qué pasa:** el nodo `Odoo - getAll msg94` busca `mail.message` con `subtype_id = 94`
("Project Stage Changed") y **no existe ni uno**. Crudo de la ejecución **90897**
(2026-09-08T14:00:00Z, la corrida que generó el correo de ayer), nodo `Odoo - getAll msg94`:

```json
"data": { "main": [ [ { "json": {}, "pairedItem": [ { "item": 0, "input": 0 } ] } ] ] }
```

Un solo item vacío — lo que `alwaysOutputData: true` produce cuando el search no devuelve
nada. Con `lastStageMsg` vacío, **el `else` se ejecuta siempre** y `dias_en_stage` mide
**días hábiles desde `project.create_date`**, es decir **la edad del proyecto**.

**Comprobado sobre los 35 proyectos del snapshot de ayer** (`create_date` leído de Odoo,
días hábiles calculados aparte): **34 de 35 coinciden exactamente** con
`bizDays(create_date → 2026-09-08)`. El único que falla (2375) falla por **un** día, y falla
del lado correcto: su `create_date` es `2026-09-02 05:50:36 UTC` = `2026-09-01 23:50 CST`,
así que en hora de Monterrey son 5 días hábiles y no 4 — o sea que aplicando el mismo
`tz_offset_hours` del workflow, **coinciden 35 de 35.**

| id | Stage | `dias_en_stage` | `bizDays(create_date)` |
|---|---|---|---|
| 101 | En plazo de credito | 401 | 401 |
| 121 | In Progress | 371 | 371 |
| 160 | En plazo de credito | 330 | 330 |
| 213 | **Hold** | 266 | 266 |
| 241 | En plazo de credito | 203 | 203 |
| 2327 | En plazo de credito | 100 | 100 |
| … | … | (34/35 exactos) | … |

**El caso reportado, reproducido:** el proyecto **241** (SO11290, Nalco) se movió de stage
tres veces en agosto — los snapshots lo muestran en `Done Operations` el 06-ago,
`Admin - In progress` el 07-ago y `En plazo de credito` desde el 11-ago — y su contador
siguió: **180, 181, 182, 183, 184, 185, 186, 188…** sin reiniciarse nunca. El 18-ago marcó
**188d**, que es exactamente lo que reportó el equipo y lo que Erick citó en su correo.
188 días hábiles desde `create_date 2025-11-27` = 188. La factura real (INV2013) es del
**2026-08-05** con vencimiento **2026-10-04**.

**Y no es una regresión: nació roto.** En las 58 corridas, `dias_en_stage` **nunca bajó para
ningún proyecto**, ni una sola vez, mientras se observaban **71 cambios de stage**. Ejemplos
crudos de la serie:

```
2026-06-22  id=2337  To Do -> Hold                          dias  4 ->  5   (no reinicio)
2026-06-30  id=2337  Hold -> In Progress                    dias 10 -> 11   (no reinicio)
2026-08-07  id=2337  In Progress -> Done Operations          dias 38 -> 39   (no reinicio)
2026-06-23  id= 225  Done Operations -> En plazo de credito  dias 173 -> 174 (no reinicio)
2026-08-03  id= 241  In Progress -> Done Operations          dias 176 -> 177 (no reinicio)
```

`docs/operaciones/SEMAFORO_WATCHDOG.md` línea 42 dice que en el diseño (2026-06-17) sí se
leyó un subtype-94. Hoy no hay ninguno, y el primer snapshot con datos (18-jun, un día
después) ya venía sin reinicios. Sea que el subtype se desactivó, que cambió de id o que la
lectura de diseño fue de otra cosa, **el efecto observable es que la métrica A nunca
funcionó en producción.**

**Por qué nadie lo detectó en 12 semanas:** el nodo tiene `alwaysOutputData: true` **y**
`onError: continueRegularOutput`. Un search vacío es indistinguible de un search exitoso, el
`else` es un fallback silencioso, y el número que sale **se ve razonable** (crece un día por
día hábil, como debería). Es el Hallazgo #14 de CLAUDE.md — *feature en bypass silencioso* —
en una superficie nueva: **una métrica en bypass silencioso**.

**Dificultad de arreglo: MEDIA.** Dos partes. (a) Averiguar en Odoo cuál es hoy el subtype
real del cambio de stage, o dejar de depender del chatter: `project.project` no tiene
`date_last_stage_update` (re-confirmado en el doc §48), así que las alternativas son leer
`mail.tracking.value` del campo 24714 — que el workflow **ya consulta** para la bandera
`stage_atras`, con lo cual el dato está en la mano — o pedir un campo Studio que estampe la
fecha de entrada al stage. (b) Recalibrar los umbrales, porque llevan 12 semanas calibrados
contra un número que significaba otra cosa. **Y un guard:** si el search de la métrica
vuelve vacío, el correo tiene que **decirlo**, no caer al fallback.

#### Error #2 — "No cuenta ni desde emisión ni desde envío" · ✅ EXISTE

**Dónde vive:** `Code - MAIN`, función `rojoCredito` + el modo `credito` del stage 13:

```js
function rojoCredito(p){
  const t = partnerTerm[m2o(p.partner_id)];
  const d = (t && termDays[t] != null) ? termDays[t] : C.credit_fallback_days;
  return d + C.credit_extra_days;
}
...
else if (oEn.modo === 'credito') { colA = colorOf(diasEnStage, rojoCredito(p)); }
```

Tres defectos encadenados en cuatro líneas:

1. El plazo se compara contra **`diasEnStage`**, que por el error #1 es **la edad del
   proyecto**. Nada que ver con la factura.
2. El plazo se saca de **`res.partner.property_payment_term_id`** (el default del cliente),
   no del término de la factura emitida.
3. `termDays` se construye con **`Math.max`** sobre todas las líneas del término
   (`termDays[t]=Math.max(termDays[t]||0, Number(it.json.nb_days)||0)`), así que un término
   escalonado (30/60/90) se colapsa al plazo más largo.

**Sobre el caso reportado.** "SO 1150011" no existe con ese folio; por los 120 días que
menciona el reporte y por lo que escribió Erick, el caso es **SO11511** (proyecto 2327,
Válvula para lavado de botellas, BEBIDAS PURIFICADAS) — y/o **SO11557** (proyecto 2305), que
el 18-ago aparecía con "120d en stage". Lo documento para los dos, porque los dos
contradicen al watchdog. Crudo de `account.move` (posted, `out_invoice`):

```
name    invoice_origin partner_id            invoice_date invoice_date_due invoice_payment_term_id amount_residual payment_state
INV1996 (vacío)        BEBIDAS PURIFICADAS   2026-05-13   2026-09-10       120 Days                123,424.00      not_paid
INV2006 SO11779        BEBIDAS PURIFICADAS   2026-07-20   2026-11-17       120 Days FTS 2024        14,469.84      not_paid
INV2013 SO11290        Nalco de Mexico       2026-08-05   2026-10-04       60 Days FTS 2024        184,126.80      not_paid
INV2022 SO11832        BEBIDAS PURIFICADAS   2026-08-18   2026-12-16       120 Days FTS 2024        86,452.48      not_paid
INV172  SO11557        GRUMA CORP DBA MISSION FOODS 2026-07-15 2026-07-15   30 days                       0.00      in_payment
INV171  SO11789        Corporate USA         2026-07-10   2026-07-10       30 days                       0.00      in_payment
```

INV1996 es la factura que Erick citó por número: emitida **13-may** (coincide con "timbrada
y remitida el 13 de mayo"), término **"120 Days"**, y **vence el 2026-09-10 — mañana.**
El watchdog la lleva marcando en rojo **58 corridas seguidas** con "100 días en stage",
cuando la factura **no había vencido ni un día**.

**Y aquí está lo importante para la decisión del PASO 4: Odoo ya tiene la respuesta.**
`account.move.invoice_date_due` está poblado y correcto en todas, calculado por Odoo con el
término **de la factura** (`invoice_payment_term_id`: "120 Days", "120 Days FTS 2024",
"60 Days FTS 2024", "30 days", "15 day"). El watchdog **no lee `account.move` en absoluto**.

**Dificultad: MEDIA.** El dato existe; hay que ir por él. La parte fina es el vínculo
proyecto → factura: `invoice_origin` es texto y **falla justo en los dos casos más
marcados** — INV1996 (SO11511) lo trae **vacío**, y para SO7723 (proyecto 101, el de 401
días) no hay ninguna factura con ese origen aunque Erick diga que está cobrado al 90 %.
`sale.order.invoice_status` tampoco sirve: SO10917 dice `to invoice` teniendo INV1989 de
$558,014.52 **pagada**. El camino confiable es `sale.order.invoice_ids` / las líneas, o
partner + monto, y hay que probarlo antes de confiar en él.

#### Error #3 — "Hay clientes sin plazo de crédito configurado" · ✅ EXISTE

**Dónde vive:** el `credit_fallback_days: 30` + `credit_extra_days: 7` de `sla_stages.json`,
consumidos por `rojoCredito`. Sin ninguna señal en el correo de que se está usando el
fallback.

**Crudo de `res.partner`** para los 18 partners que la corrida 90897 leyó
(`Code - prep.partnerIds`):

```
id   name                                property_payment_term_id  parent_id                     is_company
897  BEBIDAS PURIFICADAS                 (vacío)                                                 si
880  Bridgestone México                  (vacío)                                                 si
1978 Ruben Robledo                       (vacío)                   Bridgestone México
2269 CONMET DE MEXICO                    (vacío)                                                 si
2242 Omar De la Garza                    (vacío)                   Calbee America Incorporated
2049 GRUMA CORP DBA MISSION FOODS        (vacío)                                                 si
900  JOHNSON CONTROLS ENTERPRISES MEXICO 90 Days FTS 2024                                        si
1143 Lau Industries de Mexico            30 Days FTS 2024                                        si
895  MAGNEKON S.A. DE C.V.               (vacío)                                                 si
896  Juventino Hernandez                 (vacío)                   MAGNEKON S.A. DE C.V.
1630 Mission Foods                       (vacío)                                                 si
1585 Mission Foods                       (vacío)                                                 si
2263 Daniel Sanudo                       (vacío)                   Mission Foods
2326 Martín Infante                      (vacío)                   Mission Foods, Mission Foods
1907 Robert Barrera                      (vacío)                   Mission Foods
94   Nalco de Mexico                     60 Days FTS 2024                                        si
289  Misael Constantino                  60 Days FTS 2024          Nalco de Mexico
2237 Tito Everardo Ordaz                 60 Days FTS 2024          Nalco de Mexico
```

**5 de 18 tienen término. 13 no** — y entre los que no están BEBIDAS PURIFICADAS (la de los
120 días reales), Mission Foods, MAGNEKON, Bridgestone, Calbee, GRUMA y CONMET. Todos esos
se evalúan con **37 días** (30 + 7).

**Un agravante que no estaba reportado:** `rojoCredito` lee el término del `partner_id` **del
proyecto**, que muchas veces es un **contacto hijo**, no la empresa. Seis de los 18 son
contactos. Los hijos de Nalco heredan el término porque alguien se los puso a mano
(289, 2237); los de Mission Foods, Bridgestone, Calbee y Magnekon no. Así que **incluso si
mañana se configuran los términos en todas las empresas, los proyectos apuntados a un
contacto seguirían cayendo al fallback**, porque el código no sube por `parent_id`.

**Dificultad: BAJA en código, MEDIA en datos.** El fallback con `parent_id` son dos líneas.
Marcar el renglón como *"plazo asumido, no configurado"* en el correo es una línea. Capturar
los 13 términos en Odoo es trabajo de Gerardo/Erick. **Y si se adopta
`invoice_date_due` (error #2), este error desaparece solo**: la factura trae su propio
término y Odoo ya calculó el vencimiento.

#### Error #4 — "No distingue fecha comercial de fecha de proyecto" (caso Hernán) · ✅ EXISTE

El "Hernán" del reporte es **Juventino Hernández** (`res.partner` id **896**, contacto de
MAGNEKON S.A. DE C.V.), el cliente de los dos proyectos Magnekon más marcados: **101**
(SO7723, 401 días, 58/58 corridas) y **160** (SO10300, 330 días). Es el mismo del que Erick
escribió *"no han ido para calar el sensor para que Juventino nos de el VoBo"*.

**Dónde vive:** en que el semáforo solo conoce **dos** fechas por proyecto —
`create_date` (que por el error #1 es la que usa siempre para A) y `project.date` (la fecha
compromiso, que usa para el modo `due_date` del stage 2) — y **ninguna de las dos es la fecha
que el negocio considera oficial**. No hay campo, ni lectura, ni concepto de "fecha
comercial acordada con el cliente". El caso Hernán (arranque el 19-ago sin importar firma ni
portal) **no es expresable hoy** en la config: `sla_stages.json` no tiene ningún lugar donde
poner una fecha de inicio por proyecto o por cliente.

Y el hueco es visible en los datos: los tres proyectos Magnekon activos (101, 160, 343)
tienen `date` = 2025-12-23, 2026-07-31 y 2026-10-30, todas ajenas a un arranque el 19-ago.

**Dificultad: MEDIA-ALTA**, y es mitad decisión de negocio. Requiere (a) decidir dónde vive
la fecha oficial — campo Studio en `sale.order`/`project.project`, o override por cliente en
`sla_stages.json` — (b) quién la captura y (c) que el semáforo la prefiera sobre las demás.
Antes de tocar código hay que cerrar la pregunta de la fuente de verdad (PASO 4).

### 3.2 Operaciones

#### Error #5 — "Falsa alerta de integridad por posible manipulación" · ✅ EXISTE

**Dónde vive:** `sla_stages.json` → `config.comercial_whitelist_partner_ids: [306]`, y en
`Code - MAIN`:

```js
if(fid===FF && t.old_value_datetime && !COM.includes(au))
  addFlag(m.res_id,{tipo:'fecha_fin', detalle:'Fecha fin movida por '+aun+' (no Comercial)', fecha:m.date});
if(fid===FS && SEQ[t.new_value_integer]!=null && SEQ[t.old_value_integer]!=null
   && SEQ[t.new_value_integer] < SEQ[t.old_value_integer])
  addFlag(m.res_id,{tipo:'stage_atras', detalle:'Stage regresado '+t.old_value_char+' -> '+t.new_value_char+' por '+aun, fecha:m.date});
```

La whitelist tiene **un solo partner**. Todo lo demás es "posible manipulación". Los textos
crudos más repetidos en 58 corridas confirman exactamente lo que reportó el equipo:

```
133×  Stage regresado Hold -> En proceso por OPERACIONES FTS-YIN
 24×  Stage regresado Admin - In progress -> Done Operations por Administracion FTS-YIN
 22×  Stage regresado Complete TOTAL (Gera) -> En proceso por OPERACIONES FTS-YIN
 22×  Stage regresado Admin - In progress -> Hold por OPERACIONES FTS-YIN
 22×  Stage regresado En plazo de credito -> Admin - In progress por OPERACIONES FTS-YIN
 18×  Fecha fin movida por Jesus Esteban De La Cruz (no Comercial)
```

Los dos usuarios que hacen el trabajo real — **OPERACIONES FTS-YIN** y **Administracion
FTS-YIN** — están fuera de la whitelist, y **el propio CEO** también: sus 18 apariciones
son **un solo cambio de fecha**, marcado 18 veces como sospechoso.

**Hay un segundo mecanismo de ruido, independiente de la whitelist:** la consulta
`Odoo - getAll trackedMsgs` filtra `date >= hoy − 30 días` (`Code - prep`:
`corte = hoy − 30*86400000`), y **no hay deduplicación por evento**. Un cambio de stage
entra al correo **todos los días hábiles durante 30 días naturales ≈ 21 correos**. De ahí
salen los 133: no son 133 movimientos, son un puñado de movimientos × 21 días cada uno.

**Dificultad: BAJA.** Tres cosas, todas chicas: (a) meter a la whitelist los partners de
Operaciones, Administración y el CEO — o mejor, invertir la regla y marcar solo lo que
**nadie autorizado** hizo; (b) reportar el evento **una sola vez**, el día que ocurre (hay
`staticData` ya en uso para esto en `Code - buildLogNotes`); (c) renombrar la sección:
"posible manipulación" acusa, y lo que se está viendo es trabajo normal.

#### Error #6 — "Alertas de proyectos que ya no se pueden mover" (Luminarias) · ✅ EXISTE

**El caso:** proyecto **213**, `SO11037 - Distribucion Electrica luminarias Cabina de
Flejadora`, JOHNSON CONTROLS. Crudo de `project.project`:

```
id   stage_id  create_date          date        partner_id                           last_update_status
213  Hold      2025-09-01 21:26:55  2026-07-30  JOHNSON CONTROLS ENTERPRISES MEXICO  on_track
```

Hoy marca **266 días** (el reporte decía 252; son los mismos días hábiles corridos desde
entonces). Aparece en **58 de 58 corridas**, con racha roja de 47, y además con bandera
`hold_sin_fecha_vigente` porque su `date` de reactivación (2026-07-30) está vencida — 33
apariciones de esa bandera en el histórico.

**Dónde vive el error:** en que **no existe ninguna condición terminal**. El dominio del
nodo 1 excluye los stages 8/4/6, y punto. El semáforo no sabe si un proyecto está facturado,
cobrado, o si el stage en que está admite movimiento. `Code - MAIN` no consulta
`account.move` ni `amount_residual` — nada de cobranza entra al cálculo.

**Sobre "ya estaba facturado", con honestidad:** la evidencia es indirecta y contradictoria,
y eso es en sí mismo el hallazgo. `sale.order.SO11037` dice `invoice_status: "to invoice"` y
no hay `account.move` con `invoice_origin = 'SO11037'`. Pero sus SOs hermanas de luminarias
para el mismo cliente **sí** están facturadas y pagadas: `INV1988` (SO11504 "Adicional de
proyecto luminarias", 92,945.00, `paid`) e `INV1989` (SO10917 "Instalación de alumbrado en
recicladora clarios", 558,014.52, `paid`) — y SO10917 **también** dice `to invoice`, lo que
prueba que ese campo no es confiable aquí. **No puedo afirmar desde Odoo que SO11037 esté
facturada**, y no la voy a afirmar. Lo que sí queda probado es lo que importa: **el watchdog
no tiene forma de saberlo, así que alerta igual.**

**Dificultad: BAJA-MEDIA.** Definir estados terminales en config (por stage, y por "AR = 0")
es directo, y el patrón de leer AR por analítica **ya existe y está en producción** en
`project/archive-budget-cierre` (`RW7KnoeEzYLvavI0`): `account.move.line` +
`analytic_distribution 'in' [cuenta]` + `parent_state=posted` + `amount_residual != 0`. Es
código que copiar, no que inventar.

#### Error #7 — "Alertas por causas externas" (rigging del compresor en aduanas) · ✅ EXISTE

**Los casos:** hay **dos** proyectos de compresor/rigging y conviene no confundirlos:

```
id   name                                                      stage        date        partner
2358 SO11233 - Rigging compresor - Lau Industries de Mexico     In Progress  2026-09-30  Lau Industries
2355 SO11673 - Poliza de matto para Compresor Houston TX        In Progress  2026-07-31  Mission Foods
```

El de **aduanas** es el rigging: **2358** (SO11233, Lau Industries), 41 días, visto en 28 de
58 corridas, hoy en `SOLO_SIN_SEGUIMIENTO` con bandera `fecha_fin`. El **2355** (Póliza de
mantenimiento Compresor Houston) es otro, y lleva **36 corridas con racha roja de 28**
porque su `project.date` venció el 31-jul.

**Dónde vive:** en que **no hay ningún estado de "esperando a un tercero"**. Los stages
disponibles son To Do / In Progress / Hold / Done Operations / Admin-In progress / En plazo
de credito. `Hold` sería el candidato natural, pero castiga (`rojo_dias: 30`) y además
levanta `hold_sin_fecha_vigente` si no se captura una fecha de reactivación — y cuando el
bloqueo es una aduana, **no hay fecha que capturar**. `sla_stages.json` tampoco tiene ningún
campo tipo "pausar hasta" o "bloqueado por tercero".

El resultado práctico es perverso: la única salida que el equipo tiene para un bloqueo
externo es mover a Hold, y Hold le genera **otra** alerta. Se ve en los datos: el proyecto
**2361** (SO11791 Calbee, Hold) trae hoy `hold_sin_fecha_vigente` **y** `nota_vacia`.

**Dificultad: BAJA en código, MEDIA en proceso.** Un `motivo_espera` + `esperando_hasta`
(por proyecto, en un JSON del repo o en un campo Studio) que **saque el renglón de las
secciones rojas** y lo mande a un bloque "En espera de terceros", con reaparición al vencer
la fecha, es poco código. Lo que cuesta es acordar quién declara la espera y con qué
evidencia — porque un "esperando al cliente" sin caducidad es la manera más fácil de apagar
el watchdog por la puerta de atrás.

#### Error #8 — "Fechas desactualizadas en sistema" (Sensores, Electrical Dump Station Dallas) · ✅ EXISTE

**Los dos casos, crudos de `project.project`:**

```
id   name                                                  stage        date        create_date
2352 SO11699 - Instalacion mecanica y electrica de Sensores  In Progress  2026-12-31  2026-06-25
2356 SO11773 - ELECTRICAL DUMP STATION DALLAS 2              In Progress  2026-07-31  2026-07-02
```

Los dos están en stage 2, cuyo `en_stage` es `modo: due_date` sobre `project.date`. Y
producen **el error opuesto cada uno**:

- **2356 (Dallas)**: `date = 2026-07-31`, **vencida hace 6 semanas** → `color_a` rojo todos
  los días. **28 corridas con racha roja de 28.** La fecha no se movió; la alerta no informa
  nada nuevo desde el 1-ago.
- **2352 (Sensores)**: `date = 2026-12-31`, una fecha de relleno a fin de año → `color_a`
  **verde** con 53 días en stage. **Racha roja: 0.** El semáforo A lo declara sano. Y
  `sla_stages.json` documenta este caso exacto en `banderas._hold_sin_fecha_vigente`:
  *"proy 2352 con fecha 31-ago pero su propia nota decía 'se reanudan en diciembre 2026' —
  ninguna automatización caza esa contradicción."*

**Dónde vive:** en que `project.date` es un campo **sin dueño y sin verificación**. La única
defensa que existe es la bandera `fecha_fin` (que se dispara al cambiarla, y que por el error
#5 acusa a quien hace el trabajo), y `hold_sin_fecha_vigente`, que solo aplica al stage 5.
Para el stage 2 **nada** valida que la fecha compromiso sea creíble: ni que no esté vencida
hace meses, ni que no sea un 31-dic de relleno.

**Dificultad: BAJA.** Es una bandera nueva de coherencia: *"fecha compromiso vencida hace
más de N días y sin actualizar"* + *"fecha sospechosa de relleno (fin de mes/año a más de M
meses)"*. Se calcula con datos que el workflow **ya trae** (`project.date` está en el nodo 1)
y no requiere ninguna consulta nueva. La parte que no es código: que alguien sea responsable
de mantener la fecha.

### 3.3 Un noveno hallazgo, no reportado, que probablemente sea el de mayor impacto diario

**El semáforo B ya no es un semáforo: es un calendario.** El correo de **Operaciones** del
2026-09-08, los 19 proyectos, columna `dias_sin_seguimiento`:

```
CRITICO   id= 121 SO9428   In Progress  stage=371d  nota=2d
CRITICO   id= 212 SO10337  In Progress  stage=267d  nota=2d
CRITICO   id= 213 SO11037  Hold         stage=266d  nota=2d
SOLO_NOTA id= 343 SO11261  In Progress  stage=199d  nota=2d
SOLO_NOTA id= 506 SO11492  In Progress  stage=187d  nota=2d
CRITICO   id=2302 SO11547  In Progress  stage=137d  nota=2d
CRITICO   id=2349 SO11762  In Progress  stage= 59d  nota=2d
SOLO_NOTA id=2352 SO11699  In Progress  stage= 53d  nota=2d
CRITICO   id=2356 SO11773  In Progress  stage= 48d  nota=2d
CRITICO   id=2355 SO11673  In Progress  stage= 48d  nota=2d
SOLO_NOTA id=2358 SO11233  In Progress  stage= 41d  nota=2d
SOLO_NOTA id=2359 SO11771  In Progress  stage= 32d  nota=2d
SOLO_NOTA id=2361 SO11791  Hold         stage= 27d  nota=2d
CRITICO   id=2362 SO11842  In Progress  stage= 22d  nota=2d
CRITICO   id=2363 SO11833  In Progress  stage= 21d  nota=2d
SOLO_NOTA id=2369 SO11862  In Progress  stage=  7d  nota=2d
SOLO_NOTA id=2368 SO11861  In Progress  stage=  7d  nota=2d
SOLO_NOTA id=2375 SO11498  In Progress  stage=  5d  nota=2d
CRITICO   id=2376 SO11860  To Do        stage=  2d  nota=2d
```

**19 de 19 con exactamente 2 días.** El lunes 07-sep, 20 proyectos tenían exactamente 1 día
(amarillos). El equipo de Operaciones escribe sus notas **en una tanda el viernes**, así que
el semáforo B marca amarillo a todos el lunes y rojo a todos de martes a viernes. **La
métrica ya no distingue proyectos: distingue días de la semana.** Con `rojo_dias = 2` y el
correo a las 08:00, el sistema no tiene ningún estado que premie a quien cumple.

Y en el otro grupo la misma regla produce el efecto contrario: **9 de los 16 renglones de
Admin de ayer son proyectos `Done Operations` de 7 a 16 días de vida**, todos marcados
`CRITICO` (stage 3 tiene `en_stage: 2d` y `sin_seguimiento: 2d`, así que un proyecto es
crítico a los 2 días hábiles de llegar ahí). Cinco de ellos —2370, 2371, 2372, 2373, 2374—
se crearon **el mismo día** (28-ago, carga de materiales) y llegan como **cinco incidentes
críticos independientes** con números idénticos.

---

## Anexo · Lo que quedó fuera y por qué

1. **`ops/watchdog-mo` y `rh/watchdog/sin-checkin` no se leyeron** (`availableInMCP: false`).
   Todo lo dicho de ellos es de documentación. Para cerrarlo: prender MCP access en la
   tarjeta de cada workflow.
2. **No pude consultar `mail.message` ni `mail.message.subtype` por el MCP de Odoo**
   (denylist dura / fuera de allowlist). La prueba de que no hay subtype-94 salió del **crudo
   de la ejecución 90897**, que es evidencia directa pero **no responde qué es hoy el subtype
   94** ni si cambió de id. Esa pregunta queda abierta y es el primer paso del fix del error #1.
3. **Un salto sin explicar en la serie:** el proyecto 343 pasó de 147 a 165 días entre el
   21-jul y el 22-jul (+18 en una corrida), coincidiendo con un cambio de stage
   `En plazo de credito → In Progress`. No lo perseguí (CLAUDE.md §8: un hallazgo se anota,
   no se persigue). Queda anotado.
4. **Observación de higiene, no bloqueante:** los 60 snapshots (1.3 MB) se commitean a diario
   a un repo **público** y contienen nombres de **contactos de clientes** ("Mission Foods,
   Daniel Sanudo", "MAGNEKON S.A. DE C.V., Juventino Hernandez", y 6 más). No hay correos ni
   teléfonos (verificado con `grep`), así que no es una filtración de datos de contacto, pero
   sí son nombres de empleados de clientes publicados sin necesidad — y el consumidor de esos
   archivos hoy es **nadie**. Anotado para el backlog.
