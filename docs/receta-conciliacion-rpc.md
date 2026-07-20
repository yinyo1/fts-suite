# Receta RPC — conciliación bancaria statement line ↔ bill (Odoo 19 SaaS)

> **Núcleo del motor de conciliación de Fase 2.** Confirmado empíricamente con el piloto Birlos (2026-07-20).
> Fuente de verdad: ejecución real vía runner n8n TMP contra `serviciosfts.odoo.com` (Odoo 19.0 Enterprise SaaS).
> Regla canónica §11.8 (CLAUDE.md) respetada: la contrapartida va a **201.01.01**, **JAMÁS se re-postea a 601.84.01**.

---

## 0. TL;DR — veredicto del piloto

| | Antes | Después |
|---|---|---|
| statement line 30443 (Birlos −150.05) | `is_reconciled=false`, residual 150.05 | **`is_reconciled=true`, residual 0** |
| pata contrapartida (aml 198764) | cuenta **184** (suspense), sin conciliar | cuenta **201.01.01**, `reconciled=true`, `full_reconcile 8807` |
| bill BILL3064 (aml 198717) | `payment_state=not_paid`, residual 150.05 | **`payment_state=paid`, residual 0**, `full_reconcile 8807` |

**Efecto contable:** el banco Jeeves saldó la cuenta por pagar del proveedor. Cuenta de gasto `601.84.01` **intacta**. Ambas patas quedaron unidas por el mismo `account.full.reconcile` (id 8807).

---

## 1. ⚠️ Hallazgo raíz — Odoo 19 removió `account.bank.statement.line.reconcile`

El método clásico **NO existe en Odoo 19**:
```
AttributeError: The method 'account.bank.statement.line.reconcile' does not exist
```
(v19 usa `get_public_method`, que además **bloquea métodos privados** con `_`.) El mecanismo real es a nivel `account.move.line`.

---

## 2. Mecanismo REAL confirmado (2 llamadas)

La línea de statement tiene un asiento (`account.move`) con **2 patas**:
- **liquidez** → cuenta del diario (`223 · 102.01.007 Jeeves`).
- **suspense** → `184 · Bank Suspense` (la contrapartida "abierta" que hay que reemplazar).

La conciliación = **reemplazar la pata de suspense por la cuenta por pagar del bill (`201.01.01`) y reconciliar ambas patas de `201.01.01`**:

```
# 1) mover la pata de suspense a la cuenta por pagar + fijar partner
account.move.line.write([SUSP_AML], {'account_id': 17, 'partner_id': <vendor_partner>})

# 2) reconciliar las dos patas 201.01.01 (misma cuenta -> Odoo las casa)
account.move.line.reconcile([SUSP_AML, BILL_AML])
```

- `17` = `201.01.01 Proveedores nacionales` (cuenta reconciliable).
- `SUSP_AML` = la pata suspense del statement move (account 184).
- `BILL_AML` = la pata `201.01.01` del vendor bill (crédito abierto).
- `account.move.line.reconcile()` **sí es público en v19** y casa líneas de la **misma cuenta** que sumen 0.

Esto es exactamente lo que hace internamente el widget `bank.rec.widget` (reemplazar suspense por la cuenta contrapartida + reconciliar), hecho por API.

---

## 3. Cómo localizar los IDs (read-only, previo a conciliar)

```
# pata de suspense del statement line (la que hay que mover)
account.move.line.search([('move_id.statement_line_id','=',<ST_LINE_ID>), ('account_id','=',184)])
# -> SUSP_AML

# pata 201.01.01 abierta del bill candidato
account.move.line.search([('move_id','=',<BILL_MOVE_ID>), ('account_id','=',17), ('reconciled','=',False)])
# -> BILL_AML  (partner_id = vendor)
```

Caso piloto: `ST_LINE=30443` · `SUSP_AML=198764` · `BILL_MOVE=58554` (BILL3064) · `BILL_AML=198717` · `vendor_partner=1341` (BIRLOS Y TORNILLOS).

---

## 4. Transporte RPC — JSON-RPC `execute_kw` (el nodo Odoo de n8n NO sirve)

**El nodo Odoo de n8n solo hace CRUD (create/get/getAll/update/delete) — NO llama métodos** como `reconcile`. Por eso el runner usa **JSON-RPC directo** contra `/jsonrpc`:

- Endpoint: `POST https://serviciosfts.odoo.com/jsonrpc`
- Auth: `common.authenticate(db, login, api_key, {})` → `uid`
- Llamadas: `object.execute_kw(db, uid, api_key, model, method, args, kwargs)`
- Body JSON-RPC: `{"jsonrpc":"2.0","method":"call","params":{"service":..,"method":..,"args":[..]},"id":N}`

**Credenciales (env var de Railway, patrón §15 — nunca en el JSON ni en chat):**
- `ODOO_RPC_KEY` = la misma API key que usa `mcp-server-odoo` (en `~/.claude.json` → `mcpServers.odoo.env.ODOO_API_KEY`). La reusamos; **cero keys nuevas.**
- db=`serviciosfts`, login=`estebandelacruz@fts.mx` (uid 2), url=`https://serviciosfts.odoo.com` — hardcodeados (no secretos).
- ⚠️ El MCP tiene `ODOO_YOLO` (capa write en la capa MCP). Vía JSON-RPC directo, la misma key **escribe** con los permisos Odoo del usuario (uid 2 = admin). Confirmado.

`args` de `reconcile`: `[[SUSP_AML, BILL_AML]]` (recordset). `write`: `[[SUSP_AML], {campos}]`.

### ⚠️ Pendiente de hardening (2026-07-20)
Existe **una `ODOO_API_KEY` vieja/distinta ya cargada en las variables de Railway** (de ahí se copió por error en el primer intento del piloto — la key correcta es la del `mcp-server-odoo` en `~/.claude.json`, no la de Railway). **Acción:** identificar **qué servicio/workflow consume esa key vieja en Railway**, y **depurarla o rotarla**. Riesgo: key huérfana con permisos de escritura Odoo circulando sin dueño claro. Prioridad: media (no bloquea, pero es superficie de credencial sin auditar).

---

## 5. Seguridad del runner — auto-revert + idempotencia

- **Un solo intento.** Si `reconcile` falla, Odoo hace **rollback** de esa llamada (cero write).
- **Auto-revert:** si el `write` (paso 1) tuvo éxito pero el `reconcile` (paso 2) falla, el runner **revierte** `account_id`→184 + `partner_id`→false en el mismo run → **cero estado sucio**.
- **Idempotencia:** re-ejecutar sobre una línea ya conciliada → el `reconcile` no hace nada nuevo (residual ya 0). El matching debe filtrar `is_reconciled=false` / `reconciled=false` antes de intentar.
- **Ritual del runner TMP:** crear → Esteban activa (abrir · Save · Active · refresh) → disparar (`n8n_test_workflow`) → **borrar**. El secreto nunca sale del server.

---

## 6. BONUS — join transitivo (llenar las columnas del contrato del front)

Desde la línea ya conciliada se navega hasta el bill y se jala TODO. Cadena:

```
statement line (30443)
  -> move_id (58572, el asiento del statement)
    -> pata 201.01.01 (198764) -> full_reconcile_id (8807)
      -> otra pata del full_reconcile = 198717 (la del bill)
        -> move_id (58554 = BILL3064)  ← el vendor bill
```

Query práctica (una vez conciliado):
```
# de la pata conciliada al bill:
aml = account.move.line.read([198764], ['full_reconcile_id'])
fr  = account.full.reconcile.read([8807], ['reconciled_line_ids'])   # -> [198764, 198717]
bill= account.move.read([58554], ['name','invoice_origin','l10n_mx_edi_cfdi_uuid','payment_state','partner_id'])
# analitica + articulo: de las lineas de gasto del bill
account.move.line.search_read([('move_id','=',58554),('account_id','=',32)], ['product_id','analytic_distribution'])
```

**Las 6 columnas transitivas del contrato v7, llenas desde el piloto Birlos:**

| columna (front) | valor | fuente |
|---|---|---|
| `bill` | **BILL3064** | move 58554 |
| `po` (invoice_origin) | — (sin PO) | 58554.invoice_origin = false |
| `sb` (status_bill / payment_state) | **paid** | 58554.payment_state |
| `ff` (folio fiscal / UUID) | **F0940225-B05E-48D6-9B21-2CC1E9206882** | 58554.l10n_mx_edi_cfdi_uuid |
| `art` (artículo) | Tornillería inox 7/16 (arandela/tornillo/tuerca) | product_id de las líneas 601.84.01 |
| `ana` (analítica) | `{1089:100, 1176:100}` (proyecto 1089 + rubro Materiales 1176, **separadas**) | analytic_distribution de las líneas 601.84.01 |

→ **Demostrado: las transitivas `art/ana/po/bill/sb/ff` SÍ se pueden llenar** una vez conciliada la línea. El motor de Fase 2 hará este join en el endpoint `fin/captura-transacciones` (hoy vienen null).

---

## 7. Verificación end-to-end (Fase C del piloto)

1. **Odoo:** línea 30443 `is_reconciled=true`/residual 0; bill `paid`/residual 0; `full_reconcile 8807` une ambas patas. ✓
2. **`fin/captura-status`:** `sin_conciliar` refleja el estado vivo (coincide con el aggregate MCP). ✓ *(nota: el total del journal es un blanco móvil porque `captura-jeeves` está activo y captura líneas nuevas; el −150.05 es incontrovertible a nivel línea + full_reconcile).*
3. **`fin/captura-transacciones`** (search "Birlos"): línea 30443 → `ok:true`, `res:0`. ✓
4. **Join transitivo:** las 6 columnas llenas (§6). ✓

---

## 8. Pendientes para el motor de Fase 2 (a partir de esta receta)

1. **Matching heurístico** (candidato ↔ bill): monto exacto + fecha ±5d + partner≈comercio del label. Umbral de confianza; los ambiguos (p.ej. 3 bills TELCEL de $25) → NO auto-conciliar, mandar a revisión humana.
2. **Regla dura §11.8:** contrapartida SIEMPRE a `201.01.01`; nunca a `601.84.01`.
3. **Transporte:** JSON-RPC `execute_kw` (el nodo Odoo n8n no llama métodos). Creds vía `ODOO_RPC_KEY` env var.
4. **Idempotencia + seguridad:** filtrar `is_reconciled=false`; auto-revert; log de cada match (id línea, id bill, full_reconcile, monto).
5. **Join transitivo** en `fin/captura-transacciones` para llenar `bill/po/sb/ff/art/ana` de las líneas ya conciliadas.
6. **Compras SIN bill:** el watchdog manda a Gera la lista de líneas sin bill (del lote de 32 fueron **29 = $35,787.19**; 1 ajuste ADJUSTMENT −$5,987.20 se rutea aparte).

---

## 9. Fase D — segunda candidata (Telcel) para conciliación MANUAL en el widget

Comparativa de vías: **RPC (Birlos, esta receta) vs UI widget (Telcel)** → deben dejar el mismo estado final.

- **Candidata:** statement line `[Gerardo Lozano ****1242] Telcel` −25 (id **30462**, 07-13) ↔ **3 bills TELCEL de $25 abiertos**: BILL3052 (07-15), BILL3069 (07-17), BILL3071 (07-17).
- **¿Cuál elegir?** El efecto económico es idéntico (cualquiera salda un Telcel de $25). Por convención de auditoría: **FIFO = el más antiguo = BILL3052 (07-15).**
- **Pasos UI (Odoo 19 Enterprise):**
  1. Contabilidad → Tablero → diario **Jeeves Tarjeta Credito** → **Conciliar**.
  2. Ubica el statement line Telcel −25.00 (07-13).
  3. Pestaña **"Buscar asientos existentes"** → busca `Telcel` o `25`.
  4. Selecciona **BILL3052** (más antiguo).
  5. Renglón balancea a 0.00 → **Validar**.
  6. Verifica: línea conciliada (✓) + **BILL3052 → Pagado**.
- **Resultado esperado (igual que Birlos):** `is_reconciled=true`, residual línea 0, bill `paid`, `full_reconcile` uniendo ambas patas en `201.01.01`.

---

## 10. Anexo — IDs y constantes del piloto Birlos

- Journal: `61` (Jeeves Tarjeta Credito). Cuentas: suspense `184` · payable `201.01.01`=`17` · gasto `601.84.01`=`32`.
- statement line `30443` · statement move `58572` (BNK6/2026/00630) · suspense aml `198764`.
- Bill `BILL3064` = move `58554` · payable aml `198717` · vendor partner `1341` (BIRLOS Y TORNILLOS) · UUID `F0940225-B05E-48D6-9B21-2CC1E9206882`.
- `account.full.reconcile` resultante: `8807`.
