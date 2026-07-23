# Workflow `captura-jeeves` — spec nodo-por-nodo (para revisión ANTES de publicar)

> Estado: **CONSTRUIDO + ACTIVO** — `PWEiA37CLfP6lMgg`, 21 nodos (el nombre en n8n aún dice "(INACTIVO — pendiente visto bueno Esteban)" pero el workflow está `active:true`; renombrar). Carga histórica 2026 corrida (1,772 líneas, 0 duplicados, 7 colisiones saltadas por el hardening del nodo 11 — ver ⚠️ abajo). Este spec de diseño se conserva como referencia; los §0 (bloqueo API key) y "NO construido" quedaron superados.
> Fecha: 2026-07-18/19 (diseño) · 2026-07-23 (build + carga verificados). Fuente de verdad: `docs/odoo-captura-bancaria.md` (§11 decisiones, §14 veredicto cero-Studio) + `docs/jeeves-mcp-tools.md` + probe en vivo del MCP Jeeves (§2 abajo).
> Decisiones congeladas respetadas: journal 61 reutilizado, statement lines sueltas, dedupe `unique_import_id`, log en chatter `mail.message`, KPI residual calculado, JWT en body, cron alta frecuencia, cero Studio.

> ### ⚠️ Hardening post-build del nodo 11 — batching tolerante a fallo por-item (`onError:continueRegularOutput`, 2026-07-23)
> **Fix aplicado y verificado en la instancia viva** (`11 - Odoo CREATE statement lines` tiene `onError:"continueRegularOutput"`). **Por qué (para que NO se reintroduzca):** el nodo 11 crea statement lines **en loop, una por item**. Con el default (`onError:stopWorkflow`), **una sola línea que falle al insertar** —típicamente una colisión de `unique_import_id` que el dedupe del nodo 10 no atrapó por carrera, o un `ValidationError` de Odoo en un item— **aborta TODO el batch** y las líneas restantes NO se escriben: carga parcial silenciosa. Con `continueRegularOutput`, el item que falla se aísla (sale por la rama normal sin tumbar la ejecución) y el loop **continúa con las demás**. En la carga histórica esto dejó pasar limpiamente **7 colisiones** mientras insertaba las 1,772 líneas buenas. **Regla:** cualquier nodo Odoo/HTTP que escriba en loop sobre un batch de tamaño desconocido va con `onError:continueRegularOutput` + un contador de fallos reportado en el CBRUN/log — NUNCA con el default que aborta. (Es el tipo de bug que, sin esta nota, se reintroduce al reconstruir el nodo.)

---

## 0. ⚠️ BLOQUEO ACTUAL — API key de n8n

- `n8n_health_check` reporta `connected` (solo pinguea la instancia), pero **toda operación real** (`n8n_list_workflows`, `n8n_get_workflow`, y por tanto `n8n_create_workflow`) devuelve `AUTHENTICATION_ERROR` — verificado 3×.
- **No se puede crear ni leer workflows por MCP hasta refrescar la key.** Por regla anti-fantasma (CLAUDE.md §3) no se reporta ningún workflow como "creado" sin read-back real.
- **Acción Esteban:** generar API key nueva en n8n (Settings → API → Create API Key) y actualizarla en la config MCP (`N8N_API_KEY`). Con eso instancio este spec tal cual, INACTIVO, y hago read-back.

---

## 1. Verificación read-only previa (paso 1 del plan) — ✅ PASA

`account.journal` 61 leído hoy, **idéntico al doc**: `bank`, MXN (`currency_id` 33), `default_account_id` 223 (`102.01.007`), `suspense_account_id` 184, `bank_statements_source=file_import`, `bank_account_id` 15 (`77648192 - JEEVES`), `active=true`. Última `account.bank.statement.line` del journal 61 = **2025-11-07**, total **5,410**. Nada cambió en Odoo.

---

## 2. Protocolo real del MCP Jeeves (probe en vivo, read-only) — clave para el nodo de fetch

Endpoint: **`POST https://mcp-prod.jeev.es/mcp`** · auth header **`x-api-key`** (→ credencial n8n / env var, NUNCA hardcode).

Hallazgos que fijan el diseño del HTTP node:
1. **Es MCP Streamable-HTTP, JSON-RPC 2.0** — no REST plano. El body es `{"jsonrpc":"2.0","id":N,"method":"tools/call","params":{"name":"list_transactions","arguments":{…}}}`.
2. **Stateless** — NO devuelve `Mcp-Session-Id`; no requiere `initialize` ni handshake de sesión. Se puede llamar `tools/call` directo.
3. **`Accept` debe incluir AMBOS** `application/json, text/event-stream`; con solo `application/json` → **406 Not Acceptable**.
4. **La respuesta llega como SSE** (`Content-Type: text/event-stream`), forma: una línea `event: message` + una línea `data: {json-rpc}`. Hay que **parsear el SSE** en Code (extraer lo que sigue a `data: `).
5. **El payload útil viene como STRING** en `result.content[0].text`, con forma **`"total records: N, transactions: [ …array JSON… ]"`** (no es JSON puro). El Code node debe:
   - `total_api` = número tras `total records:`.
   - `rows` = `JSON.parse(text.slice(text.indexOf('transactions: ') + 'transactions: '.length))`.
6. **`startDate` exige datetime ISO completo** (`2026-07-15T00:00:00.000Z`); un date suelto (`2026-07-15`) → error `invalid datetime`.
7. Cada transacción: `transactionType` (debit/credit), `transactionTypeTag` (CARD/DEPOSIT/…), `transactionStatus`, `transactionDate` (UTC con Z), `transactionPostedDate`, `createdAt`, `totalBaseCurrencyAmount` (string 6 decimales), `source{name,detail=últimos4,currency,currencyAlphaCode}`, `destination{name,detail,…}`. **Sin `id` de transacción** (confirmado) → dedupe por hash.

Ejemplo real settled: `debit/CARD 888.00 · source "Tarjeta gastos" ****4548 · destination "THE Home Depot"`.

---

## 3. Config del workflow

- `settings.executionOrder = v1`, **`settings.timezone = "America/Monterrey"`**. ⚠️ n8n descarta el timezone al importar (lección §18) → **fijarlo a mano** en Settings tras crear, o el cron corre en el TZ de la instancia (America/New_York) y se desfasa.
- `settings.saveDataSuccessExecution`: recomendado **"none"** (la mayoría de las ~27 corridas/día son no-ops; el log real vive en el chatter).
- Constantes (en un Code/Set inicial): `JOURNAL_ID=61`, `ARRANQUE="2026-01-01"`, `TRASLAPE_DIAS=3`, `PAGE_SIZE=100`, `PARTNER_FONDEO=1617`.
- Secreto Jeeves: **`$env.JEEVES_API_KEY`** (Railway env var), leído por un nodo **Set** (patrón Finanzas §15) y pasado al Code de fetch. Alternativa: credencial Header Auth "Jeeves MCP" en un HTTP Request node. Se elige Set+$env porque la paginación SSE se hace más limpia dentro de un Code con `httpRequest`.

---

## 4. Nodos (topología)

Dos triggers convergen en una cadena compartida. `responseMode` del webhook = **`lastNode`** (responde con el output del último nodo en ejecuciones por webhook; en ejecuciones por schedule simplemente no responde — evita un nodo Respond condicional).

```
[A] Schedule Trigger ─┐
                      ├─► [2] Set: origen+config ─► [3] Odoo SEARCH última línea ─► [4] Code fromDate
[B] Webhook /run ─►[1] Code Validar JWT ─┘                                                    │
                                                                                              ▼
[5] Set: secreto ($env.JEEVES_API_KEY) ─► [6] Code Fetch+paginate Jeeves (SSE) ─► [7] Code Validar total==filas
   ─► [8] Code Construir filas (label+signo+hash) ─► [9] Odoo SEARCH dedupe ─► [10] Code diff
   ─► [11] Odoo CREATE statement lines (loop) ─► [12] Odoo CREATE mail.message (chatter CBRUN) ─► [13] Code Respuesta
```

### [A] Schedule Trigger — `n8n-nodes-base.scheduleTrigger`
Tres reglas cron (alta frecuencia, CAMBIO 1):
- `0,30 7-16 * * 1-5` — cada 30 min, 7:00–16:30
- `*/10 17 * * 1-5` — 17:00–17:50 cada 10 min
- `0 18 * * 1-5` — cierre 18:00
≈27 disparos/día L–V. Fija `origen='schedule'` aguas abajo. (El dedupe hace inocua la frecuencia.)

### [B] Webhook — `n8n-nodes-base.webhook`
`POST` path `captura-jeeves/run`, `responseMode=lastNode`. Trigger manual (botón "Sync Now" del front, paso 6). Fija `origen='manual'`.

### [1] Code — Validar JWT (solo rama webhook)
Clona el crypto de `fin/facturas-odoo`/`fin/bills-odoo` (PBKDF2-SHA256 + HMAC-SHA256, JS puro; secreto `FINANZAS_JWT_SECRET` vía Set `$env`). Lee `token` del body, valida firma+exp. Falla → responde `{_error:true, code:'BAD_TOKEN'|'TOKEN_EXPIRED'}`. (Se copia tal cual cuando haya acceso n8n; no se re-deriva.)

### [2] Set — origen + config
Normaliza `origen` (schedule/manual) y publica las constantes de §3 en el item.

### [3] Odoo — SEARCH última línea — `n8n-nodes-base.odoo`, credencial `Odoo FTS`
`customResource='account.bank.statement.line'`, operation search/getAll. `filterRequest`: `journal_id = 61`. `order='date desc'`, `limit=1`, `fieldsList=['date']`. Vacío → usar `ARRANQUE`. ⚠️ Verificar `customResource` tras crear (§3).

### [4] Code — fromDate
`fromDate = (últimaFecha || ARRANQUE) − TRASLAPE_DIAS`, formateado a datetime ISO `YYYY-MM-DDT00:00:00.000Z`. Inicializa `page=1`, `acc=[]`.

### [5] Set — secreto
`apiKey = {{$env.JEEVES_API_KEY}}` (no toca el JSON del workflow).

### [6] Code — Fetch+paginate Jeeves (SSE)
Loop con `this.helpers.httpRequest` (fallbacks `$helpers`/`fetch`, patrón §16):
- POST `https://mcp-prod.jeev.es/mcp`, headers `Content-Type: application/json` + `Accept: application/json, text/event-stream` + `x-api-key: <apiKey>`.
- Body: `tools/call` → `list_transactions`, args `{startDate: fromDate, pageSize:100, page, transactionStatuses:["settled"]}`.
- Parseo SSE (§2.4–2.5): saca `data:`, `JSON.parse`, `result.content[0].text`, extrae `total_api` + `rows`.
- Pagina `page++` hasta `acc.length >= total_api` o una página devuelva 0 filas. Devuelve `{total_api, rows: acc}`.

### [7] Code — Validar total == filas
Si `total_api !== rows.length` → **abortar sin escribir**: arma CBRUN `status:"abortado_validacion"`, saltar a [12] (log) + notificar, NO [8]-[11]. (Guarda de integridad del plan.)

### [8] Code — Construir filas
Por fila: `date` = `transactionDate` convertido a **fecha CST** (UTC−6, la fecha CST del evento). `unique_import_id = "jeeves-" + sha256(fecha|monto|typeTag|últimos4|destination.name)` (sha256 JS puro reusado de Finanzas). Label + signo (transform congelado):
- `debit`+`CARD` → `payment_ref = "[<source.name> ****<last4>] <destination.name>"`, `amount = −abs`.
- `credit`+`CARD` → `"[DEVOLUCIÓN ****<last4>] <destination.name>"`, `amount = +abs`.
- `credit`+`DEPOSIT` (source vacío) → `"[FONDEO] Credit Line"`, `amount = +abs`, `partner_id = 1617`.

### [9] Odoo — SEARCH dedupe
`account.bank.statement.line` where `journal_id=61` AND `unique_import_id in [hashes del batch]`, `fieldsList=['unique_import_id']`. → set de existentes.

### [10] Code — diff
`toInsert = filas cuyo unique_import_id ∉ existentes`. Cuenta `nuevas`, `duplicadas`.

### [11] Odoo — CREATE statement lines (loop sobre `toInsert`)
`fieldsToCreateOrUpdate`: `journal_id=61, date, payment_ref, amount, unique_import_id, partner_id?` (solo fondeos). Sin `operation` = create (§3).

### [12] Odoo — CREATE mail.message (chatter del journal = log de corrida)
`model='account.journal'`, `res_id=61`, `author_id=3` (Esteban; NO 2/OdooBot archivado — §18), `subtype_id=2`.
`body`: `Captura <origen> — <fecha hora CST>` + marcador `[[CBRUN]]{"journal_id":61,"desde":…,"hasta":…,"total_api":N,"filas":N,"nuevas":n,"duplicadas":d,"rechazadas":0,"status":"ok"}[[/CBRUN]]`.
⚠️ **VERIFICAR en el primer run real que el JSON del `[[CBRUN]]` sobrevive la sanitización HTML del body** (Odoo escapa/normaliza HTML en `mail.message`). Si se corrompe → usar comentario HTML `<!--CBRUN{…}-->` (decisión congelada de respaldo). También persistir cursor en `staticData[journal_id]`.

### [13] Code — Respuesta
Devuelve `{origen, desde, hasta, total_api, nuevas, duplicadas, rechazadas, status}`. En webhook → es la respuesta (responseMode lastNode); en schedule → fin.

---

## 5. Quirks n8n a cuidar al construir (de CLAUDE.md)
- `n8n_create_workflow` **preserva `customResource`** (a diferencia del import-UI). Aun así, read-back con `n8n_get_workflow` tras crear (anti-fantasma §3).
- Esta instancia **rechaza** `update_partial`/`update_full`/activar por MCP (§16/§17) → correcciones e **activación las hace Esteban en la UI**. Construir bien al primer `create`.
- Odoo node: "Always Output Data" ON; expresiones con un solo `=`; `filterRequest`/`value`/`fieldsList` array (§3).
- Fijar `settings.timezone` a mano tras crear (§18).

## 6. Lo que necesito de Esteban para desbloquear
1. **API key n8n nueva** (bloqueo §0).
2. Confirmar que la **API key Jeeves** entra como `JEEVES_API_KEY` (Railway env var) o credencial n8n cifrada — **no** en el JSON.
3. Visto bueno a este nodo-por-nodo (o ajustes) antes de que yo lo instancie INACTIVO.
</content>
</invoke>
