# Odoo — Terreno para la captura bancaria de Jeeves (E0)

> Investigación **solo lectura** vía mcp-server-odoo (UID 2). Fecha: 2026-07-18. Company objetivo: **SERVICIOS FTS (id 1)**.
> Objetivo E0: mapear dónde y cómo viven hoy los datos antes de construir la captura de movimientos Jeeves como `account.bank.statement.line`.
>
> ⚠️ **LEER PRIMERO §0 y §8.** El supuesto de partida ("no existe journal Jeeves, es greenfield") es **incorrecto**: el journal ya existe, ya capturó ~5,410 líneas, y hay un segundo camino contable (vendor bills) para el gasto de gasolina. Hay **riesgo de duplicidad** que exige decisión tuya antes de continuar.

---

## 0. TL;DR — lo que cambia el plan

1. **Ya existe el journal.** `account.journal` **id 61 "Jeeves Tarjeta Credito"** (code `Jeeve`), tipo **bank**, MXN, cuenta default **223 `102.01.007 Jeeves Tarjeta Credito`** (`asset_cash`), suspense **184 `102.01.01 Bank Suspense Account`**, `bank_statements_source = file_import`, ligado a `res.partner.bank` **15 "77648192 - JEEVES"**, `active: true`. → **NO crear un journal nuevo. Reutilizar el 61.**
2. **Ya capturó movimientos** — pero se murió. 5,410 statement lines: **4,148 en 2023**, **1,247 en 2024**, **15 en 2025** (la última **2025-11-07**), **0 en 2026**. Era captura **manual por file import** (CSV/Excel) que alguien dejó de hacer. El proyecto real = **automatizar ese import** con n8n + API Jeeves, no inventar la capa cruda.
3. **El gasto de Jeeves tiene un SEGUNDO camino contable hoy:** la gasolina se registra como **Vendor Bills** (journal 2) a la cuenta de gasto **`601.84.01 Otros gastos generales`** (30 bills / ~$16.5k en 2026), con contrapartida **`201.01.01 Proveedores nacionales`** y partner = el comercio real (ej. "OXXO Gas"). **Este es el vector de duplicidad** (§8).
4. **Los fondeos 2026 desde BBVA NO están en Odoo.** Los montos conocidos (198,757.85 / 301,000 / 243,000 / 181,630.52) devuelven **0 líneas**. Se registraban en 2025 (ver §3) pero en 2026 no hay rastro.
5. **Dedup: usar el campo NATIVO `unique_import_id`** de `account.bank.statement.line` (mecanismo estándar Odoo anti-duplicado de imports). **No hace falta `x_studio_hash_captura`.**
6. **El KPI "$ sin conciliar" NO puede ser el saldo de la cuenta suspense 184** — esa cuenta es **compartida** por TODOS los bancos (BBVA, Monex, Jeeves…). Hay que aislarlo (§5.3).

---

## 1. Journals existentes (company 1 · `SERVICIOS FTS`)

`account.journal` relevantes:

| id | Nombre | code | type | Moneda | Cuenta default | Suspense | source |
|----|--------|------|------|--------|----------------|----------|--------|
| **61** | **Jeeves Tarjeta Credito** | Jeeve | bank | MXN | **223 · 102.01.007 Jeeves Tarjeta Credito** | 184 · 102.01.01 Bank Suspense | **file_import** |
| 8 | BBVA General MXN | BBVA | bank | MXN | 38 · 102.01.001 BBVA General MXN | 184 | file_import |
| 96 | BBVA Nomina | BBVA1 | bank | MXN | 359 · 102.01.00008 | 184 | file_import |
| 58 | BBVA DORADA FTS | BBVAD | bank | MXN | 217 · 101.01.000002 | 184 | file_import |
| 75 | BBVA USD | USDMX | bank | USD | 227 · 102.01.00002 | 228 (suspense USD) | file_import |
| 111 | Monex MXN | BNK6 | bank | MXN | 462 · 102.01.005 | 184 | file_import |
| 112 | Monex USD | BNK8 | bank | USD | 463 · 102.01.006 | 228 | file_import |
| 74 | PAYANA | payan | bank | MXN | 316 · 102.01.00006 | 184 | file_import |
| 20 | Paypal | PAYPA | bank | — | 85 · 102.01.012 | 184 | — |
| 30 | Stripe | STRIP | bank | — | 126 · 102.01.013 | 184 | — |
| 103/57/104 | Cash / Alimentos JMZ / Cash Restaurant | — | cash | — | 384/212/388 | 184 | — |
| 2 | **Vendor Bills** | BILL | purchase | MXN | **32 · 601.84.01 Otros gastos generales** | — | — |
| 1 | Customer Invoices | INV | sale | MXN | 30 · 401.01.01 | — | — |

- **No existe** ningún journal tipo `credit`. Jeeves está modelado como **bank** (asset), no como pasivo de tarjeta — coherente porque es línea **fondeada** (saldo deudor a favor), no revolvente clásica.
- **`suspense_account_id = 184` es COMPARTIDO** por casi todos los journals MXN. Consecuencia directa en §5.3 (KPI).

## 2. Cómo entran HOY los gastos de Jeeves a la contabilidad

**Dos caminos paralelos y desincronizados:**

### 2a. Statement lines en journal 61 (la capa cruda que se murió)
- Import manual de archivo. Volumen: 2023 = 4,148 líneas (−$5.41M), 2024 = 1,247 (−$1.36M), 2025 = **15** (+$580k), 2026 = **0**. Última línea **2025-11-07**.
- Conciliación: **5,360 conciliadas / 50 sin conciliar** (backlog de suspense pequeño).
- Ejemplo real (id 29749): fondeo +$318,276.40, partner "jevees", conciliado contra `1.1 BBVA Mexico, 201.01.01 Proveedores nacionales`. Consumos tipo "OXXO PALMAS MONTERREY", partner "GASNGO MEXICO".

### 2b. Vendor Bills para gasolina (el camino vivo en 2026)
- `account.move` journal 2 (Vendor Bills), líneas "Fondeo Jeeves gasolina". Volumen: 2024 = 4, 2025 = 7, **2026 = 30 (~$16,549.53)**.
- Estructura de la bill (ej. BILL3049 / move 58493, partner **OXXO Gas** 1816):
  - Dr `601.84.01 Otros gastos generales` 689.66 (gasto)
  - Dr `119.01.01 IVA pendiente de pago` 110.34
  - Cr `201.01.01 Proveedores nacionales` 800.00 (cuenta por pagar)
- **La contrapartida es `201.01.01 Proveedores nacionales`, NO la cuenta Jeeves 223.** El partner es el comercio real, no "jevees".

> Conclusión: hoy el **gasto** de gasolina Jeeves ya está capitalizado en `601.84.01` vía bills. El resto del consumo de tarjeta (no-gasolina) **no está en ningún lado en 2026** (ni bills ni statement lines).

## 3. Pagos/fondeos a Jeeves desde BBVA

- **2026: NO están en Odoo.** Búsqueda por los 4 montos conocidos (198,757.85 / 301,000 / 243,000 / 181,630.52) → **0 `account.move.line`**. Los egresos BBVA→Jeeves de 2026 no se han registrado (probablemente el statement BBVA 2026 no se ha importado, o el fondeo no se asienta).
- **2025 sí se registraban** como statement lines en journal 61 con partner "jevees" (1617) o "BBVA México" (1247), payment_ref "Fondeo Jevees"/"Aumento de cuenta", conciliadas contra `201.01.01 Proveedores nacionales` y/o BBVA. Ej.: +$318,276.40 (2025-11-07), +$186,375.86 (2025-09-02), +$82,843.33 (2025-10-01).
- Partner proxy de Jeeves: **`res.partner` 1617 "jevees"** (nótese el typo), `supplier_rank 24`, sin VAT, no company.

## 4. Plan de cuentas relevante

| id | code | Nombre | account_type | reconcile |
|----|------|--------|--------------|-----------|
| 223 | 102.01.007 | **Jeeves Tarjeta Credito** | asset_cash | false |
| 38 | 102.01.001 | BBVA General MXN | asset_cash | false |
| 32 | 601.84.01 | Otros gastos generales (gasto default de bills) | expense | false |
| 17 | 201.01.01 | Proveedores nacionales | (payable) | — |
| 14 | 119.01.01 | IVA pendiente de pago | — | — |
| 184 | 102.01.01 | Bank Suspense Account (compartida) | — | — |

- **`3034` NO es una `account.account`** — es una **cuenta analítica** (plan de proyectos, catch-all "Topo Chico"). Vive en `account.analytic.account`, no en el plan contable. Pertenece a la Fase 2 (conciliación analítica), no a esta captura cruda. No la toqué.
- No hay cuenta "puente/transitoria" con ese nombre; el rol de puente lo cumple la suspense 184.

## 5. Modelo `account.bank.statement.line` en Odoo 19 SaaS

### 5.1 Creación sin statement padre — ✅ CONFIRMADO
La línea 29749 tiene `statement_id: false` y está posteada/reconciliada. En Odoo 19 las statement lines **existen sin `account.bank.statement` padre**; el statement es solo un agrupador opcional para el cuadre de saldos. → **crear líneas sueltas por JSON-RPC es válido.**

### 5.2 Campos para la captura
- **Obligatorios de hecho:** `journal_id`, `date`, `payment_ref` (label), `amount` (con signo: negativo=cargo, positivo=abono/fondeo).
- **Opcionales útiles:** `partner_id`, `partner_name`, `account_number`, `transaction_type`, `narration`/`ref`, `foreign_currency_id`/`amount_currency` (no aplica, todo MXN).
- **Dedup NATIVO:** **`unique_import_id`** (char). Odoo lo usa para rechazar imports duplicados. **Es el campo correcto para el dedupe — no crear Studio field.** Propuesta de valor: `"jeeves-<transactionId>"` si logramos id estable del API, o `"jeeves-" + SHA256(fecha|monto|tag|last4|destination)` como fallback.
  - ⚠️ Matiz API: `list_transactions` **no** devuelve el id de transacción; solo `search` lo hace (ids tipo `12029289`). Para el workflow que pagina `list_transactions`, el **hash** es el camino práctico. Evaluar si vale una segunda pasada por `search` para amarrar el id estable.
- **Studio:** el modelo (heredado de `account.move`) tiene **decenas** de `x_studio_*` legacy (PO, project, evidencia…) — ruido de otros flujos, ninguno sirve de hash. **No añadir `x_studio_hash_captura`; usar `unique_import_id`.**

### 5.3 KPI "$ sin conciliar" — corrección de diseño
La suspense **184 es compartida** por todos los bancos → su saldo global NO es el "$ sin conciliar de Jeeves". Dos opciones:
- **(A, recomendada)** Crear una **suspense dedicada** para el journal 61 (ej. `102.01.01.JEEVES Jeeves Suspense`) y apuntar `suspense_account_id` del journal a ella. Entonces el KPI = saldo de esa cuenta, limpio y directo. Cambio de 1 cuenta + 1 campo del journal.
- **(B)** Dejar la suspense compartida y computar el KPI como **Σ `amount_residual` de las statement lines no conciliadas del journal 61** (o `is_reconciled = false`). Sin tocar cuentas, pero el número se calcula, no se "lee".

## 6. Estructura analítica (solo documentación — Fase 2)

- `account.move.line` usa `analytic_distribution` (jsonb) — el eje proyecto/rubro de Frente A. Documentado en CLAUDE.md §17. En esta captura cruda **no** se toca analítica; las statement lines entran a suspense sin distribución.
- Cuentas analíticas activas post-limpieza (7 archivadas) — no re-consultado aquí para no ampliar alcance; la conciliación analítica es fase posterior.

## 7. Modelos de conciliación existentes (`account.reconcile.model`)

13 registros, **todos genéricos**: "Create Bill" e "Internal Transfers" (uno por company). **Ninguna regla custom para Jeeves.** No hay automatismo heredado que casar/cuidar. Si en Fase 2 se quiere auto-conciliar statement line ↔ vendor bill de gasolina, se crearía una regla nueva (con cuidado del §8).

---

## 8. ⚠️ RIESGO DE DUPLICIDAD CONTABLE — decisión requerida antes de construir

**El vector:** el gasto de gasolina Jeeves ya se registra como **vendor bill** (Dr `601.84.01` / Cr `201.01.01`, partner = comercio). Si además importamos la **statement line** del mismo cargo de tarjeta y en Fase 2 la posteamos a gasto, el gasto queda **doble**.

**Por qué la captura cruda (ESTA fase) es segura:**
- La statement line entra a **suspense 184**, sin tocar `601.84.01`. No hay gasto hasta conciliar. → **importar no duplica nada por sí solo.**

**Dónde muerde (Fase 2, a dejar amarrado desde ya):**
- Para los ~30 cargos de gasolina/2026 que SÍ tienen bill, la conciliación correcta es **statement line ↔ el apunte `201.01.01 Proveedores nacionales` de la bill** (el banco paga la cuenta por pagar). **NO** re-postear a `601.84.01`.
- Para el consumo NO-gasolina (la mayoría), la statement line no tiene bill → se queda en suspense = **legítimo "$ sin conciliar"**, o se postea directo a la cuenta de gasto/analítica en Fase 2.
- Los **fondeos** entran positivos, sin bill, y se conciliarán contra el egreso BBVA (cuando ese lado se capture) → hoy inflan el "$ sin conciliar" hasta que exista la contraparte BBVA.

**Riesgo de solape con el histórico:**
- El journal 61 ya tiene 5,410 líneas hasta 2025-11-07 y **0 en 2026**. Arrancar la carga histórica en **2026-01-01** (default del plan) **no colisiona**. Si algún día se recargan 2023–2025, el `unique_import_id` debe estar poblado o se duplicaría el histórico. Recomendado: **fecha de arranque 2026-01-01** (o 2025-11-08 si se quiere cerrar el hueco), nunca antes.

---

## 9. Propuesta de diseño (para tu visto bueno)

### 9.1 Journal — REUTILIZAR el 61, NO crear uno nuevo
- Mantener `account.journal` 61 tal cual (bank, MXN, cuenta 223, source file_import).
- **Único cambio recomendado:** crear **suspense dedicada** `102.01.01.JEEVES` y apuntar `suspense_account_id` del journal 61 a ella (Opción A del §5.3) para que el KPI sea un saldo limpio. Si prefieres cero cambios contables, vamos con Opción B (KPI calculado).
- **Decisión tuya #1:** ¿reutilizamos 61 (recomendado) o insistes en journal nuevo "Jeeves Crédito"? Un journal nuevo **fragmenta** el histórico y crea DOS saldos Jeeves — no lo recomiendo.
- **Decisión tuya #2:** ¿suspense dedicada (A) o KPI calculado (B)?

### 9.2 Captura (E1) sobre esa base
- Dedup por **`unique_import_id`** (nativo), valor `"jeeves-" + SHA256(fecha|monto|tag|last4|destination)`; evaluar segunda pasada `search` para id estable.
- Arranque **2026-01-01**, traslape 3 días, solo `settled/completed`, paginado `pageSize=100`.
- Mapeo de labels y signo según el plan (consumo −, devolución +, fondeo +), partner opcional = 1617 "jevees" para fondeos.
- Validación total-API == filas; abortar sin escribir si difiere.

### 9.3 Duplicidad — regla operativa para Fase 2 (documentar ahora)
- Statement line de gasolina **concilia contra la bill existente** (`201.01.01`), nunca re-postea `601.84.01`.
- Ideal: una `account.reconcile.model` que matchee por monto+fecha+partner comercio para las bills de gasolina, dejando el resto en suspense.

### 9.4 Log de corridas — dónde
- Recomiendo **modelo Odoo simple `x_jeeves_captura_run`** (Studio) o, más ligero, un JSON en el repo/n8n `staticData`. Como el front (Finanzas) ya lee Odoo vía n8n, un modelo Studio pequeño (fecha, nuevas, duplicadas, rechazadas, status, error) es lo más consistente y consultable por el endpoint `status`. **Decisión tuya #3.**

---

## 10. Preguntas abiertas para ti (bloquean el arranque)

1. **¿Reutilizamos journal 61?** (recomendado) o journal nuevo.
2. **¿Suspense dedicada (A) o KPI calculado (B)?**
3. **¿El hueco 2025-11-08 → 2025-12-31 se ignora** (arranque 2026-01-01) o lo cerramos?
4. **Gasolina como vendor bills:** ¿se mantiene ese flujo (y Fase 2 concilia contra él) o se planea migrar la gasolina también a statement lines? (afecta la regla anti-duplicado).
5. **Fondeos 2026 ausentes en Odoo:** ¿los capturamos como statement lines Jeeves (lado abono) desde ya, aunque el lado BBVA no exista aún? (quedarán en suspense).
6. **Log de corridas:** modelo Studio Odoo vs. Postgres Railway vs. staticData n8n.

---

## 11. Decisiones tomadas (2026-07-18) + diseño concreto para construir

### 11.1 Decisiones
1. **Journal:** ✅ **reutilizar el 61** (no crear nuevo). No hay cambio contable que hacer al journal.
2. **KPI "$ sin conciliar":** ✅ **calculado** (Opción B). No se crea suspense dedicada. El endpoint lo computa como **Σ `amount_residual` de las statement lines del journal 61 con `is_reconciled = false`**. (Hoy: 50 líneas sin conciliar del histórico — ese backlog aparecerá en el KPI hasta que se limpie; anotarlo en el front como "incluye backlog histórico").
3. **Log de corridas:** ~~modelo Studio~~ → **SUPERSEDED por §14**: `mail.message` en el chatter del journal + `staticData` n8n. **Cero Studio, cero campos, cero F12.**

### 11.2 Log de corridas — CERO Studio: `mail.message` en el chatter del journal (ver §14)
> **SUPERSEDE al modelo custom `x_captura_bancaria_run`.** No se crea ningún modelo ni campo Studio. El log vive como **nota de chatter (`mail.message`) posteada al propio journal** (`account.journal` **sí tiene chatter** — verificado, `message_ids` existe). n8n `staticData` guarda el cursor operativo. Detalle y justificación en §14.
- Cada run = 1 `mail.message` en `res_id = <journal>` (61), `model='account.journal'`, `author_id=3` (Esteban; NO 2/OdooBot archivado — lección §18), `subtype_id=2`.
- Body con marcador machine-readable para el endpoint:
  `Captura <label> — <origen> — <fecha hora>` + `[[CBRUN]]{"journal_id":61,"desde":"…","hasta":"…","total_api":184,"filas":184,"nuevas":170,"duplicadas":14,"rechazadas":0,"status":"ok"}[[/CBRUN]]`
- Multi-journal nativo: cada journal loguea en SU chatter (`res_id`). La tabla de corridas del front = `mail.message` de ese `res_id`, orden `date desc`.

### 11.3 Workflow n8n `captura-jeeves` (nodos) — a construir, NO activar
Triggers:
- **Schedule** 07:30 CST L–V → en UTC = **13:30 UTC** (⚠️ §18 lección TZ: fijar `settings.timezone` del workflow a mano tras importar).
- **Webhook POST** `captura-jeeves/run`.
  - ⚠️ **Refinamiento de seguridad:** el botón vive en el browser → un HMAC con secreto en el front se filtra. Propongo **auth por JWT en el body** (mismo patrón Finanzas, token en body §15), no HMAC-en-browser. El HMAC queda para el hardening server-to-server / cron interno (backlog §9 CLAUDE.md). **Confirmar.**

Cadena:
1. (Webhook) `Code - Validar JWT` (reusa cripto de facturas/bills).
2. `Odoo SEARCH última línea` — `account.bank.statement.line`, filterRequest `journal_id=61`, order `date desc`, limit 1, fieldsList `[date]`. Vacío → arranque configurable (default **2026-01-01**).
3. `Code - fromDate` = últimaFecha − 3 días (traslape); settear `pageSize=100, page=1`.
4. `HTTP → MCP Jeeves` (JSON-RPC `tools/call` → `list_transactions`, header `x-api-key` desde **credencial n8n cifrada**, nunca hardcode). Paginar en `Code`/loop hasta agotar.
5. `Code - Validar total` API == filas recibidas → si difiere, **abortar sin escribir** + log `abortado_validacion` + notificar.
6. `Code - Construir filas`: filtrar `settled/completed`; por fila `unique_import_id = "jeeves-" + sha256(fecha|monto|tag|last4|destination)`; label + signo:
   - `debit+CARD` → `"[alias ****XXXX] comercio"`, `amount` **negativo**.
   - `credit+CARD` → `"[DEVOLUCIÓN ****XXXX] comercio"`, `amount` **positivo**.
   - `credit+DEPOSIT` (source vacío) → `"[FONDEO] Credit Line"`, `amount` **positivo**, `partner_id = 1617` (jevees).
7. `Odoo SEARCH dedupe`: statement lines del journal 61 con `unique_import_id in [...]` en el rango → `Code` diff → `toInsert[]`.
8. `Odoo CREATE` (loop) `account.bank.statement.line` — `fieldsToCreateOrUpdate`: `journal_id, date, payment_ref, amount, unique_import_id, partner_id?`. (Sin `operation` = create, per §3.)
9. `Odoo CREATE mail.message` (chatter del journal) con el resumen: `model='account.journal'`, `res_id=61`, `author_id=3`, `subtype_id=2`, `body` con el marcador `[[CBRUN]]{…}[[/CBRUN]]` (ver §11.2/§14). También persistir el run en n8n `staticData[journal_id]`.
10. `Respond`/notify.

### 11.4 Endpoint `GET captura-jeeves/status` (JWT en body, patrón Finanzas)
- `Code - Validar JWT`.
- `Odoo SEARCH mail.message` `[['model','=','account.journal'],['res_id','=',<journal>],['body','ilike','[[CBRUN]']]`, order `date desc`, limit N → parsear el JSON entre `[[CBRUN]]…[[/CBRUN]]` = historial de corridas (último run + tabla).
- `Odoo aggregate` statement lines journal 61: `count` del mes en curso, última `date`.
- `Odoo SEARCH/aggregate` `amount_residual:sum` donde `journal_id=61 & is_reconciled=false` → **KPI "$ sin conciliar"**.
- Devuelve `{ ultimo_run, resumen, ultima_fecha, sin_conciliar, lineas_mes }`.

### 11.5 Front E2 — pestaña "Bancos" en Finanzas
- Card por journal (hoy solo Jeeves): nombre, última captura (fecha/hora), movimientos hoy/mes, status último run, **"$ sin conciliar" como número protagonista** (nota: incluye backlog histórico de 50 líneas).
- Botón **"Capturar ahora"** → POST `captura-jeeves/run` (JWT en body); deshabilitado mientras corre; muestra resumen al terminar.
- Tabla de últimas corridas (de `x_jeeves_captura_run`).
- Mismo patrón visual + JWT que el resto de Finanzas. Sin librerías nuevas.

### 11.6 Orden de construcción acordado
`(journal = no-op, ya existe)` → **modelo log Studio** → **E1 con payload sintético** → **canary 7 días reales** → **carga histórica desde 2026-01-01** → **E2**. No activar workflows (publica Esteban). No merge del front sin revisión.

### 11.7 Respuestas confirmadas (2026-07-18)
1. **AUTH:** ✅ JWT en body para `captura-jeeves/run` **y** `status` (patrón facturas/bills). HMAC reservado a server-to-server.
2. **FONDEOS 2026:** ✅ capturarlos como `[FONDEO]` positivos desde ya. Que queden en suspense = evidencia de que falta el lado BBVA.
3. **GASOLINA:** ✅ se mantiene el flujo de vendor bills. Ver **regla canónica Fase 2** abajo.

### 11.8 ⚠️ REGLA CANÓNICA FASE 2 — conciliación de gasolina (NO borrar)
> Una statement line de **gasolina** (cargo de tarjeta Jeeves) se concilia **contra el apunte `201.01.01 Proveedores nacionales`** de la vendor bill existente (partner = comercio). **NUNCA se re-postea a `601.84.01`** — el gasto ya está en la bill. Re-postear = doble gasto. La statement line es el lado banco que salda la cuenta por pagar. Migrar gasolina a otro flujo **no está en el plan**.

---

## 12. Ampliación E2 — Vista "Transacciones" + semáforo admin (multi-journal desde diseño)

> Todo esto nace **multi-journal** aunque hoy solo alimente Jeeves (61). Cuando entren BBVA (8/96/58/75), Monex (111/112), Chase (73) → solo se agregan `journal_id`s a la config. **Cero refactor.**

### 12.1 Endpoint `GET captura/transacciones` (JWT en body, patrón Finanzas)
- Fuente: `account.bank.statement.line` **multi-journal** (config `JOURNALS_BANCOS = [61, ...]`; default hoy `[61]`).
- **Params:** `journal_id` (uno o `null`=todos los de la config), `date_from`/`date_to`, `estado` (`conciliado`/`sin_conciliar`/`todos`), `search` (texto en `payment_ref`), `page` (50/pág), `order`.
- **Por línea devuelve:** `date`, `journal_id`(nombre), `payment_ref`, `amount`, `is_reconciled`, `amount_residual`, `partner_id`.
- **Agregados del filtro activo:** `total_lineas`, `conciliadas`, `sin_conciliar`, `residual_sum`.
- **Semáforo por journal** (calculado server-side sobre el filtro): `{journal, pct_conciliado, residual, color}` + fila **`TODOS`** con el rollup global.
  - **Verde** = 100% conciliado **y** residual $0 · **Amarillo** = ≥90% · **Rojo** = <90% **o** residual > umbral (config `RESIDUAL_UMBRAL_MXN`).

### 12.2 Front — sección "Transacciones" dentro de la pestaña Bancos
- Tabla única **multi-journal** con filtros arriba: selector journal (Todos/Jeeves/…), rango fechas, estado, búsqueda.
- Fila con status visual: **✓ conciliada** / **● pendiente** (por `is_reconciled`).
- **Paginación de servidor** (50/pág) — nunca cargar miles de líneas al browser.
- **Semáforo admin al pie:** por journal (% conciliado + $ residual) + fila resumen **"TODOS LOS JOURNALS"** = señal de admin de que todo está 100% conciliado.
- Nota visible mientras exista: **"incluye backlog histórico (50 líneas)"**.
- Mismo patrón visual + JWT que Finanzas. Sin librerías nuevas.

### 12.3 Config multi-journal (una sola fuente)
`{ JOURNALS_BANCOS: [{id:61, label:'Jeeves'}], RESIDUAL_UMBRAL_MXN: <n>, PAGE_SIZE: 50 }` — agregar bancos = agregar entradas, sin tocar endpoint ni front.

---

## 13. ~~Modelo de log F12~~ — ELIMINADO (ver §14)

**No se crea modelo custom. No hay F12 que correr.** El log de corridas es `mail.message` en el chatter del journal (§11.2) + `staticData` de n8n. Justificación completa en §14.

---

## 14. Investigación: log de corridas SIN Studio (2026-07-18) + VEREDICTO

Disparador: los modelos/campos Studio pueden pegarle a la tarifa de Odoo SaaS (experiencia previa de FTS). Objetivo: log con **cero o mínimos campos Studio**.

### 14.1 Q1 — ¿un `ir.model state='manual'` sube la tarifa de Odoo SaaS?
- **Odoo Online cobra por PLAN + usuarios, no por customización.** El salto de precio real es **Standard ($24.90/u/mes) → Custom ($37.40/u/mes)**; el plan **Custom** es el que **desbloquea Studio, multi-company y External API**.
- **FTS YA está en Custom** (opera multi-company {1,6,11,…} y **escribe a Odoo desde n8n = External API**, ambos exclusivos de Custom). → Un modelo manual **NO** genera un nuevo salto de tarifa ni cargo por-modelo; ya está dentro de lo que se paga.
- **Matiz honesto:** el susto previo de FTS fue casi seguro ese salto **Standard→Custom** al instalar Studio la primera vez (ya hundido). Aun así, la métrica exacta de Odoo SaaS no es 100% transparente y el log de corridas **es telemetría operativa que NO pertenece a la contabilidad** → conviene mantenerlo fuera del modelo de datos contable **por diseño**, no solo por costo. Fuentes: [Odoo Pricing](https://www.odoo.com/pricing), [Standard vs Custom](https://thethinktech.com/blog/odoo-erp-pricing-comparison/), [planes](https://transines.com/odoo-pricing-online-enterprise/).

### 14.2 Q2 — Alternativa A: `account.bank.statement` como contenedor del run
- Campos libres verificados: **`name`** (char) y **`reference`** (char; hoy guarda el nombre del archivo importado, ej. `jeeves_loc_MXN_20240322.csv`). **NO existe `narration`** en el statement de esta instancia.
- **Cómo están los 5,410 históricos:** **MIXTO** — **~5,361 dentro de statements** (134 statements tipo "BNK6 Statement 2024-03-25" con `balance_start`/`balance_end_real`, era 2023-2024, creados por el file-import) y **49 sueltos** (`statement_id=false`, el goteo 2025, ej. línea 29749). El file-import nativo crea **un statement por archivo**.
- **Veredicto A: descartada como store del run.** Agrupar por "run operativo" **contamina la semántica** de `account.bank.statement` (que es período bancario con cuadre de saldos); dejaría statements **desbalanceados** (`statement_valid=false`) = ruido cosmético, y **cambia cómo ve las líneas quien concilia**. Útil solo si quisiéramos cuadre de saldos por corte — no es el caso.

### 14.3 Q3 — Alternativa B: `mail.message` en el chatter (nativo, cero campos) ✅
- **`account.journal` TIENE chatter** — verificado: `message_ids` existe y responde `[]` en el journal 61.
- Postear el resumen del run como **nota de chatter** es 100% nativo, **cero campos, cero modelo**, y **consultable** (`search_records('mail.message', …)`). Ya es patrón de la casa (§18: `project/archive-budget-cierre` crea `mail.message` subtype 2, `author_id=3`).

### 14.4 Q4 — Alternativa C: `staticData` de n8n
- Perfecta para el **cursor operativo** (última fecha capturada por journal) y métricas efímeras. Ya es patrón (§17/§18 idempotencia). Contra: vive dentro de n8n (frágil ante reset del workflow), no es fuente de auditoría durable.

### 14.5 🏆 VEREDICTO — combinación ganadora (prioridad: cero Studio > mínimos > funcionalidad)
**Statement lines nativas + SUELTAS** (como el patrón 2025, `statement_id=false`) · **log de corridas en `mail.message` del chatter del journal** (durable, consultable, cero Studio) · **`staticData` de n8n como cursor** (velocidad + idempotencia).
- **Cero modelos custom. Cero campos Studio. Cero F12.**
- `/status` y la **tabla de corridas** del front se sirven 100%: último run + historial desde `mail.message` (parseando `[[CBRUN]]{…}[[/CBRUN]]`); KPI "$ sin conciliar" y conteos del mes desde agregados de statement lines del journal 61.
- **Multi-journal nativo**: cada journal loguea en su propio chatter; agregar BBVA/Monex = agregar `journal_id`s a la config, sin tocar el diseño del log.
- **Por qué no el modelo custom:** aunque técnicamente está incluido en el plan Custom (no sube tarifa), el chatter cumple lo mismo con **menos superficie**, honra "cero Studio", y deja la telemetría fuera del modelo contable. El modelo custom queda como fallback solo si algún día se necesita reporting/filtrado pesado sobre las corridas (BI), no hoy.

---

## 15. Carga histórica 2026 — EJECUTADA (2026-07-21)

Backfill del año completo 2026 del journal 61 (Jeeves), corrida `manual` observada por path schedule. **Éxito.**

### Prerrequisito: hardening del nodo 11 (obligatorio, aplicado antes de cargar)
`captura-jeeves` nodo `11 - Odoo CREATE statement lines` (`odcreate`) ganó **`onError:"continueRegularOutput"`** (antes ausente → un CREATE fallido tumbaba el batch). Origen del bug: ejecución `41161` (2026-07-20 13:00 UTC) se cayó en el primer `unique_import_id` duplicado, dejando el batch a medias. Con el hardening, un duplicado/colisión se **salta por-item** sin tumbar la corrida. Aplicado vía `update_full` + diff de integridad (solo `odcreate` cambió; SHA-256 de los 7 jsCode intactos).

### Mecánica del disparo (cero código)
El nodo `4 - Code fromDate` hace `fromDate = MAX(maxDate − traslape, fecha_piso)`. El `fecha_piso` es **tope duro (mínimo)**: protege 2025 pero NO adelanta el arranque. Con `maxDate = 2026-07-17`, flipear solo el piso a 2026-01-01 daba `MAX(07-14, 01-01) = 07-14` (no backfilleaba). **Solución:** en el `2 - Set origen config` se puso `fecha_piso = 2026-01-01` (permanente) **+** `traslape_dias = 210` (temporal) → `cand = 07-17 − 210 = 2025-12-19 < piso` → el `MAX` **clampa a 2026-01-01**. El piso hizo su trabajo (nunca antes de 2026). Tras la corrida, `traslape_dias` **revertido a 3** (incremental normal); `fecha_piso` queda **2026-01-01 permanente** (red de seguridad).

### Resultado (run `42663`, success, 22:15→22:32 UTC ≈ 17 min)
- **`total_api` = 1779** settled (2026-01-01 → hoy; nodo 6 fetchea `transactionStatuses:['settled']`, 18 páginas de 100). No se movió → sin abort por `total!=filas`.
- **Journal 61 · 2026 = 1772 líneas** (antes 37). Aritmética: `1779 = 37 dedupeadas + 1735 nuevas + 7 saltadas`. Los **7** colisionaron en `unique_import_id` (colisión intra-lote) y el `onError` del nodo 11 los saltó — el hardening funcionando.
- **Cero duplicados:** `count = count_distinct(unique_import_id) = 1772`.
- **min fecha = 2026-01-02** (≥ 2026-01-01). Las **5410 líneas pre-2026 (2023–2025, import NO-Jeeves) intactas.**
- Distribución mensual: Ene 172 · Feb 254 · Mar 393 · Abr 338 · May 325 · Jun 174 · Jul 116.
- Desglose de labels estrenados en volumen: **FONDEO 16** (partner **1617** "jevees", montos +), **AJUSTE 16**, **DEVOLUCIÓN ~15** (créditos CARD).
- **KPI "$ sin conciliar"** (journal 61, `is_reconciled=false`): 1,820 líneas, `sum(amount_residual) = $64,083.88` (net firmado — fondeos + compensan cargos −; es lo que computa `captura-status`).

### Pendiente
- **Confirmar los 7 saltados**: ¿duplicados reales de Jeeves (benigno) o transacciones distintas con hash colisionado (serían 7 no capturadas)? Revisar el input del hash `unique_import_id` en el nodo `8 - Code Construir filas`.
