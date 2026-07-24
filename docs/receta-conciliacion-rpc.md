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

---

## 11. Desactivación del auto-match nativo (`ir.cron` 52) — 2026-07-20

- **id `52`** · "Try to reconcile automatically your statement lines" · código `model._cron_try_auto_reconcile_statement_lines(batch_size=100)` · modelo Bank Statement Line · **diario ~18:40 UTC** · usuario OdooBot.
- **Desactivado el 2026-07-20** (`active=false`, vía RPC, read-back confirmado) — antes de su corrida del 21-jul 18:40 UTC.
- **Razón:** auto-casaba las capturas nuevas de Jeeves contra el **backlog sucio de la cuenta 186 Outstanding Payments** (**$12,157,042 / 978 líneas abiertas**, pagos 2024/2025 nunca conciliados contra banco) → **falsos positivos**: Telcel 30462/30468 y Steren 30453 casados a pagos viejos en vez de a sus bills. Las 13 `account.reconcile.model` son **todas `trigger: manual`** → el cron NO usa reglas custom; usa el auto-match **nativo** de Odoo.
- **Reversible con un clic** (`active=true`).
- **Condición de reevaluación (para reactivar):** (a) backlog de la 186 limpio/conciliado **y** (b) motor de conciliación de Fase 2 vivo — para que el matching correcto lo haga el motor/humano, no el auto-match ciego contra basura.

## 12. Receta de DESENREDO (3er flujo del motor: detectar → desenredar → re-conciliar) — CONFIRMADA

Caso: falso positivo del auto-match (línea conciliada contra un pago viejo equivocado en la cuenta 186). Piloto: Telcel 30462 (2026-07-20). **Atómico en un run, con `ir.cron` 52 ya apagado.**

1. **Derivar** la contrapartida mal conciliada: `search_read account.move.line [('move_id.statement_line_id','=',LINE),('reconciled','=',True),('account_id','!=',<liquidez 223>)]` → la pata en 186.
2. **Unwind:** `account.partial.reconcile.unlink([partial_ids])` (de los `matched_debit_ids`/`matched_credit_ids` de esa pata) → desata el falso positivo. **Side-effect correcto:** el pago viejo recupera su residual real (el $200 TELCEL pasó de −75 a **−100** al liberarse el $25).
3. **Mover** la contrapartida `186 → 201.01.01` + partner: `account.move.line.write([cp], {'account_id':17,'partner_id':P})`.
4. **Reconcile** contra el bill correcto: `account.move.line.reconcile([cp, bill_aml])`.
- **Auto-revert:** si (4) falla → revierte la cuenta a 186; la contrapartida queda **abierta, sin el falso positivo** (estado estrictamente mejor, nunca peor).
- **Guards:** `NO_WRONG_COUNTERPART`, `NO_PARTIALS`, `BILL_NO_201`, `BILL_YA_CONCILIADO`.
- **Método de unwind confirmado en v19:** `account.partial.reconcile.unlink` (callable vía RPC; `remove_move_reconcile` no se necesitó).
- **Resultado Telcel:** 30462 conciliada a **BILL3052** (`payment_state=paid`, `full_reconcile 8825`); pago viejo $200 restaurado a −100 (aún con el falso positivo de 30468 pendiente de desenredar).

## 13. Nota — el guard maneja concurrencia HUMANA (evidencia de producción)

Ferre 30478 ↔ BILL3063 **no se pudo conciliar por RPC**: entre la sugerencia (~21:00) y el disparo (22:18), **un humano (`Administracion FTS-YIN`, uid 25) concilió BILL3063 manualmente** ("Manual: BILL3063", partial 12735, create_uid 25). El guard **`BILL_YA_CONCILIADO`** lo detectó y **rehusó escribir** (cero write). No fue bug ni el cron — **trabajo contable humano legítimo concurrente**.

→ **Regla dura para `fin/captura-conciliar`:** re-validar el estado del bill (`reconciled`) **en el instante del write**, nunca confiar en lo que el front mostró minutos antes. El mundo cambia entre la sugerencia y el clic. El guard ya lo probó en vivo.

## 14. Desenredo en lote + edge case de match PARCIAL (2026-07-20/21)

Tras apagar el cron 52, se desenredaron los falsos positivos conocidos (mismo runner multi-job):

| línea | monto | modo | resultado |
|---|---|---|---|
| 30462 (Telcel) | −25 | full → BILL3052 | ✅ `paid`, full_reconcile 8825 |
| 30468 (Telcel) | −100 | full → BILL2947 | ✅ `paid` |
| 30453 (Steren) | −99.01 | unwind-only (sin bill) | ✅ contrapartida → suspense 184, línea limpia (`is_reconciled=false`, residual 99.01) |
| 30466 (Ferretería) | −647.10 | unwind-only (FP parcial $576.11) | ⚠️ FP removido, **estado dividido** |

**Edge case — match PARCIAL:** el cron casó **$576.11 de $647.10** (parcial). Al desenredar: el `unlink` del partial quita el FP, pero mover la contrapartida liberada (186, $576.11) a **suspense 184** falla con `UserError: "must always have exactly one suspense line"` — porque la línea ya tiene una suspense (los $70.99 restantes). Odoo prohíbe 2 líneas de suspense en el mismo asiento de statement.

- **Full false match** (contrapartida 100% en 186, sin suspense separada) → unwind-only funciona directo: `186 → 184`, una sola suspense. Limpio.
- **Partial false match** → el `unlink` quita el FP (queda consistente: liquidez + 1 suspense + resto en 186), pero **la consolidación a suspense único requiere el "Deshacer conciliación" del widget de Odoo** (recrea la suspense por el monto total), no un `write` de cuenta. Alternativa: dejar el resto en 186 abierto (no es FP, solo no-consolidado) para que el motor/humano lo tome.
- **Regla para el motor de Fase 2:** distinguir FP **full** vs **parcial**; el parcial no se auto-consolida por RPC simple — enrutar a reset-widget o dejar el remanente abierto marcado.

## 15. Auto-match nativo — mecanismo confirmado (`ir.cron` 52)

El culpable de los FP fue **`ir.cron` 52 `_cron_try_auto_reconcile_statement_lines`** (diario ~18:40 UTC, OdooBot), NO una `reconcile.model` (las 13 son `trigger:manual`). Evidencia: los partials FP los creó **OdooBot** (uid 1) en la ventana del cron (12728/12729/12730 el 07-19 18:42). Los partials legítimos (ej. BILL3063) los creó un **humano** (uid 25). → Desactivado (§11).

## 16. Etapa A del motor — EN PRODUCCIÓN (2026-07-23)

**El botón de conciliación manual está vivo.**

### A.1 — Login emite `bancos:write`
`auth/finanzas-login` (**ver:3**, exp 2h): payload `scope = ['bancos:read','bancos:write','facturas:read','bills:read']`. Verificado en el jsCode desplegado (read-back) + token decodificado offline. Único usuario `finanzas` nace autorizado a conciliar (v1 single-user; multiusuario/gate por persona = v2).

### A.2 — `fin/captura-conciliar` (id `PcnlIPWh30l2LrwW`, ACTIVO)
JWT + scope **`bancos:write`** (403 `SCOPE_INSUFFICIENT` sin él — probado offline). Recibe `{line_id, bill_aml_id}`. Ejecuta la receta §2 (`write([susp],{account_id:17,partner_id:vendor})` + `reconcile([susp, bill_aml])`) con **auto-revert**. Guards **re-validados en el instante del write**: `LINE_YA_CONCILIADA`, `NO_SUSPENSE_UNICA` (descarta línea ya medio-desenredada), `BILL_NO_201`, `BILL_NO_POSTED`, `BILL_YA_CONCILIADO` (concurrencia humana §13), `BILL_SIN_PARTNER`. **NO exige match exacto** (eso es regla del pase automático D, no del botón — el humano puede hacer parciales honestos; `reconcile()` estándar los maneja). Detecta y reporta parcial: `{parcial, residual_linea, residual_bill}`. Respuesta: `{ok:true, full_reconcile_id, bill_name, vendor_id, monto, parcial, residuales, msg}` o `{ok:false, code, msg, http}` (para la UI).

### Caso real verificado (2026-07-23)
Match Oxxo gas de Mateo: línea **31507** (`[Mateo Salazar ****4197] Oxxo` −600, 2026-03-24, journal 61) ↔ bill_aml **192331** (BILL2490, OXXO Gas partner 1816, 201.01.01, −600, 2026-03-26). Disparado vía runner TMP (mintea JWT `bancos:write` server-side + POST al endpoint; borrado al terminar). Resultado: **FULL reconcile, `full_reconcile 8858`**, `parcial:false`. **Verificación independiente en Odoo:** línea `is_reconciled=true`/residual 0 · BILL2490 `payment_state=paid`/residual 0 · ambas patas unidas en 8858 sobre 201.01.01 · gasto intacto. `ODOO_RPC_KEY` resuelve en vivo. Gate cumplido: A probada con 1 caso real antes de B.

### Pendiente (Etapa B — sesión próxima)
- **`fin/captura-sugerencias`** (JWT `bancos:read`): las 5 reglas del motor → score → nivel (auto-elegible / sugerida / sin-documento), pre-marcado por cercanía de fecha en sugeridas.
- **3 cubetas en `captura-status`**: 🔵 en tránsito (pendings vía MCP Jeeves read-only, nunca a Odoo) · 🔴 conciliable pendiente por antigüedad · 🟢 conciliadas hoy (auto vs manual).
- **Hardening menor de `fin/captura-conciliar`**: envolver los reads en try/catch (hoy solo auth + los 2 writes lo están; un read RPC caído lanza sin respuesta limpia — pero cero write parcial, los reads son antes de los writes).

## 17. Etapa B del motor — B.0 + B.1 en producción, B.2 PENDIENTE (2026-07-23)

### B.0 — rastro del botón (hecho)
`fin/captura-conciliar` postea al éxito un marcador **`[[CONCFTS]]`{origen:'boton', line_id, bill_aml_id, full_reconcile_id, monto, parcial}** en el chatter del **move del BILL**, **NO-bloqueante** (try/catch → `firma:true/false` en el response; **nunca rechaza una conciliación válida** por un fallo de bitácora). Sirve para clasificar conciliadas-hoy botón vs widget.

### B.1 — `fin/captura-sugerencias` (hecho, INACTIVO, id `43ueZWEXzLyty0LF`)
JWT `bancos:read`, read-only. Las 5 reglas → **score `0.6·comercio_sim + 0.4·cercanía_fecha`** → nivel:
- Candidatos = bills abiertos 201.01.01, `|residual|=|monto|±0.01`, fecha `±5d`. Sin candidato → **`sin-documento`**.
- **`auto-elegible`** solo si **único + score>0.7 + no conflict-pair**. Si ≥2 candidatos → **`sugerida`** con **pre-marcado por cercanía** (FIFO secundario). Texto pobre + monto/fecha/único → `sugerida` (NO descarta; bill puede estar con otra razón social).
- **`CONFLICT_PAIRS`** editable `[['oxxo','oxxo gas'],['ferreteria','material electrico']]` (crece con cada FP) → capa a `sugerida` (nunca auto). **B SOLO ETIQUETA** — nada auto-concilia hasta D con su gate.
- Response: `{lineas:[{line_id,comercio,monto,nivel,candidatos:[{bill_aml_id,bill_name,partner,score,banda,pre_marcado,conflicto}]}], pagination}`. Paginado 50/req. **D reusa la lógica interna en lotes, no el HTTP.**

### B.2 — PENDIENTE: 3 cubetas en `fin/captura-status`
Extender el response con bloque `hoy`: **🔵 en_transito** (pendings Jeeves SSE, key `$env.JEEVES_API_KEY`, **timeout 5s + no-bloqueante**, `disponible:false` si falla, NUNCA tumba el resto) · **🔴 conciliable_pendiente** (buckets de antigüedad hoy/1-3d/+3d de las statement lines sin conciliar) · **🟢 conciliadas_hoy** (v1 `{boton, auto}` desde marcadores `[[CONCFTS]]`; `widget`/`total` = **v2** por el join `full_reconcile.create_date`↔journal 61). `captura-status` NO tiene gate de scope (no agregar). Diseño detallado en memoria `bancos-motor-etapa-b.md`.

### Etapa C (siguiente) — UI en `instrumentos-pago`
Panel **Hoy** (3 cubetas de captura-status) · sección **En tránsito** (pendings, estilo no-contable gris/itálica, desaparecen al liquidar) · **fila pendiente expandible** → sugerencias de `fin/captura-sugerencias` (score+nivel+pre-marcado) → **botón Conciliar** → `fin/captura-conciliar` (manejo de **éxito full**, **parcial con residuales**, y **rechazo de guard con refresh** de la fila). Branch → PR → revisión visual → merge. ⚠️ **El panel Hoy depende de B.2** — hacer B.2 antes, o el panel Hoy espera esa parte. **Ritual de activación pendiente:** activar B.1 (`43ueZWEXzLyty0LF`) + reactivar los que `update_full` toque, en un solo golpe al cerrar B.2.

### Etapa C — MERGED a producción (2026-07-23, PR #104, commit `6096580`, live en Pages v0.5.0)
UI en `instrumentos-pago`: panel Hoy (3 cubetas), En tránsito, acordeón inline lazy (1 fila a la vez) con sugerencias + score/nivel/pre-marcado, botón Conciliar con los 3 desenlaces (full/parcial/rechazo) + sin-documento. Revisión visual de Esteban aprobada. **`IP_REAL_ENABLED=false` intacto → Conciliar solo corre en demo; el branch real está cableado pero el modo Real sigue gateado.** Bump colateral: `captura-transacciones` `PAGE_SIZE 50→100` (versionCounter 3, activo).

### ⚠️ Deuda conocida — paginación server-side del front (resolver post-D)
El front de `instrumentos-pago` **solo consume la página 1** del endpoint `captura-transacciones` (`load()` toma `tx.rows` sin iterar `has_more`; el `pageSize` del selector solo rebana en cliente lo ya traído). Con **1,731+ líneas sin conciliar**, en Real muestra únicamente las **primeras 100** (ya con PAGE_SIZE=100). Falta **paginación server-side real** en la tabla: pedir `page N` al endpoint al navegar (el endpoint ya devuelve `pagination:{page,page_size,total_count,has_more}`) o iterar `has_more`. **Resolver en la iteración post-D.** No bloquea A/B/C.

### Prerrequisito para la prueba en Real (flip IP_REAL_ENABLED)
Para que Esteban pruebe desde el botón en Real se necesita `IP_REAL_ENABLED=true` (gate del checklist de seguridad, `docs/finanzas/BANCOS_CHECKLIST_SEGURIDAD.md`): **(a) JWT hardening = HECHO** (login ver:3, 2h, scope); **(c) Cloudflare Access = diferido** (aprobado en principio, proyecto aparte). Post-flip, en Real: el **acordeón (sugerencias) + botón Conciliar SÍ operan** (endpoints vivos), pero el **panel Hoy muestra "no disponible" hasta B.2** (captura-status.hoy). Prueba Real completa (incl. panel Hoy con cubetas reales) = flip **+ B.2**.

## 18. Etapa D — pase automático de conciliación (canary, 2026-07-23)

**Workflow `captura-concilia-auto` (id `hY6uKxEvs1LLpyf5`), ACTIVO.** Schedule `0 23 * * 1-5` TZ `America/Monterrey`. 9 nodos: Schedule → Set `rpc_key` (`$env.ODOO_RPC_KEY`) → config (`CANARY_MAX=20`) → Odoo líneas journal 61 `is_reconciled=false` → select (universo COMPLETO, **FIFO más-antiguas-primero** → el tope canary ataca el backlog viejo) → Odoo bills abiertos `201.01.01` → **match VERBATIM de `captura-sugerencias`** (5 reglas → score → nivel) → plan (SOLO `auto-elegible`, tope canary 20; sugeridas/sin-documento NI TOCARLAS) → **ejecutar+log** (receta §2 write suspense→17 + reconcile + auto-revert; CONCFTS `origen:'auto'`; resumen `[[CBAUTO]]` al chatter journal 61). **Solo exactas/full.**

**8 guards re-validados al instante del write:** los 6 del botón A (`LINE_YA_CONCILIADA`, `NO_SUSPENSE_UNICA`, `BILL_NO_201`, `BILL_NO_POSTED`, `BILL_YA_CONCILIADO`, `BILL_SIN_PARTNER`) **+ 2 auto-strict:** `MONTO_DRIFT` (monto ±$0.01 exacto sobre el bill elegido) y `NOT_UNIQUE_AT_WRITE` (re-query del pool al instante → exige 1 solo candidato = el elegido; regla 4 dura). Auto-revert por ítem; un ítem que falla no tumba el lote.

### Night-0 (supervisada, Execute Workflow, 2026-07-23 19:00 CST) — LIMPIA 9/9
Ejecución n8n **`45112`** · CBAUTO **`mail.message 2920067`** (journal 61, `2026-07-24T01:00:11 UTC = 2026-07-23 19:00:11 CST`). **1823 evaluadas → 9 auto-elegibles → 9 conciliadas, 0 rechazadas, 0 overflow** (+28 sugeridas, 1786 sin-documento). Verificación **independiente en Odoo** de las 9: líneas `is_reconciled=true`/residual 0; bills `payment_state=paid`/residual 0; pata en **`201.01.01`** (§11.8, jamás 601.84.01); `full_reconcile` de n8n = el de Odoo (8876…8892); firma CONCFTS `origen:auto`. Todas **monto exacto + mismo día (Δ0) + comercio↔partner score ≥0.94**. FIFO OK (feb→may→jul). Aeromexico 32010→BILL2238 score 1.0; Home Depot 30437→BILL3084 (el mismo de la validación B.1).

### Canary formal + reglas de operación
- **2 noches** (23:00 auto): CC relee cada mañana la ejecución de `hY6uKxEvs1LLpyf5` + el `[[CBAUTO]]` en journal 61 + muestra Odoo independiente. **Cero incidentes 2 noches → decidir nuevo `CANARY_MAX`** (subir/quitar) en la sesión siguiente.
- **Diferidos hasta 2 noches limpias:** (1) gancho post-sync (captura-jeeves dispara D con nuevas>0 — toca ese workflow activo); (2) B.2 (cubetas en captura-status → panel Hoy 🟢; la firma `origen:auto` ya está sembrada).

### Quirks confirmados en Etapa D (no re-descubrir)
1. **`n8n_test_workflow` / API NO disparan schedule ni manual triggers** (solo webhook/form/chat) → la corrida supervisada = Esteban "Execute Workflow" en el editor n8n.
2. **La verdad de terreno de una corrida vive en ODOO** (CBAUTO + reconciliaciones), robusto a que la manual-execution de n8n persista o no. Regla: "JSON pegado no es evidencia; evidencia es ejecución con ID releíble" (memoria `evidencia-ejecucion-no-json-pegado`).
3. **Runner webhook para llamar endpoints con JWT:** activar en UI a veces NO registra el webhook (404, cuadra con §17 "API rechaza activar; toggle UI no siempre propaga") → path nuevo + curl directo lo resolvió; evidencia = execution en el workflow llamado (no en el runner). El grep de llaves en tool-results va con **bareword** (el escapado `\"` rompe el anclado por comillas).
4. **B.2 RE-CONFIRMADO NO-construido 3×:** `captura-status` `Respond OK` = `{por_journal, global, cron, residual_umbral}`, cero cubetas (ejec 44762). El "conciliadas_hoy:6 verificado en vivo" fue fantasma (= diseño/mock).

## 19. Hallazgo "Manual:BILL" — el "98% sin documento" es un artefacto del workaround del equipo (2026-07-24)

**Origen:** Excel de Gera (BASE DE DATOS TRANSACCIONES) mostró 270/310 movimientos Jeeves jun-jul con BILL capturado y status "PAGADA". Forense Odoo READ-ONLY confirmó y redefinió el diagnóstico. **Cambia el diseño del motor.**

### 19.1 El proceso real del equipo (confirmado por Esteban)
RFQ (Gibrán, desde uid 25) → confirmación Felipe/Montalvo → PO → **fondeo de la tarjeta Jeeves** → compra → **validan que monto-tarjeta = monto-PO** → crean el **bill** (que trae la **analítica de proyecto**) → lo marcan `paid` con una **entrada MANUAL "Manual: BILLxxxx"** en el journal 61. **NO era error:** era la ÚNICA forma de (a) cerrar el ciclo sin conciliación bancaria (que nunca existió hasta esta semana) y (b) cargar el gasto al proyecto (la analítica viaja PO→bill; por eso pagan el bill). El equipo tenía un proceso **correcto en intención**; solo les faltaba la conciliación bancaria.

### 19.2 El mecanismo contable (rastreo crudo, caso BILL2881 OXXO Gas $479.80)
- Bill `BILL2881` (id 57954): `posted`, `payment_state=paid`, residual 0.
- Su pago = move `57961 "BNK6/2026/00497 (BILL2881)"`, journal 61, con 2 patas:
  - línea 196873: cuenta **17 (201.01.01)** +479.80, `name "Manual: BILL2881"`, `reconciled=true` (casa el bill vía full_reconcile 8511).
  - línea 196872: cuenta **223 (102.01.007 Jeeves banco)** −479.80.
- **La línea Jeeves REAL** (statement line 30542, importada por captura-jeeves) queda `is_reconciled=false`, residual 479.80 — y **su pata de liquidez también pega a 223**. → **el banco 223 recibe −479.80 DOS VECES** (la manual + la real) = doble-contabilización.
- El pago **NO está en 186** (Outstanding Payments). El backlog 186 ($12.16M, 980 líneas viejas 2025: subcontratistas eléctricos, etc.) es un **problema SEPARADO**, no el de tarjetas.

### 19.3 Números clave (crudos, 2026-07-24)
- **Corrupción del 223:** 550 entradas "Manual: BILL" con pata en 223 suman **−$1,245,329.34**. Saldo Odoo 223 = **−$1,520,157.38** → sin duplicados ≈ **−$274,828**; **~82% del saldo es ficción.** (Jeeves availableBalance $171,458 = crédito disponible, no comparable directo al GL.)
- Por mes (patas 223): Feb −252k/84 · Mar −324k/108 · Abr −281k/92 · Jun −195k/142 · Jul −114k/120.
- **~782 "Manual: BILL"** totales en cuenta 17; solo **550 con pata 223** → las ~232 restantes se fondearon de OTRA cuenta (censar en Fase 3).
- **Ritmo ACTIVO ~30-60/semana** (create_date W24→W30: 18·33·32·44·62·42·31). Cada semana +~40 duplicados + más corrupción → **urgencia del cambio de proceso.**
- **Calidad analítica: 100%** de las líneas de producto de bills del equipo (muestra 40/40) traen `analytic_distribution` a proyecto+rubro (`{"1176":100,"3083":100}`, `{"668":100,"1176":100}`, `{"478":100,...}`, una compuesta `{"509,1176":100}`). **El bill del equipo es el productor de la analítica.**
- jun-jul: **324 paid / 97 not_paid / 1 partial = 423 bills (77% paid)** — corrobora el 270/310.

### 19.4 Los 3 puntos ciegos del motor (v1)
1. **Bills pagados-vía-manual** → `paid`/residual 0 → fuera del pool abierto. El motor no puede casar la línea real contra ellos.
2. **Cuenta 285 "Account Payable":** 25 bills abiertos viven en 285 (no la 17 que filtra el motor) → invisibles aunque abiertos. (Ej.: UBER `BILL/2026/07/0001` $500, abierto, cta 285.)
3. **186 no es el target:** los pagos chicos de tarjeta son duplicados manuales en journal 61, no outstanding en 186.

### 19.5 Falso candidato (por qué las reglas importan)
Línea mercadopago $500 07-02: B.1 sugirió `BILL2954` (OXXO Gas $500, cta 17) — **falso** (coincidencia de monto, comercio "mercadopago" débil). El bill REAL era **UBER `BILL/2026/07/0001`** (cta 285, invisible al pool). **Score 0.32 → las 5 reglas lo frenaron a `sugerida`, NO auto** — el candado funcionó. (`BILL3015` que el Excel llamó "AEROTRIP" es en Odoo OXXO SA de CV $167 — ref de bill equivocada en el Excel.)

### 19.6 Decisiones firmadas (Esteban, 2026-07-24)
1. **Sync SAT baja de rango:** a verificador de UUID/vigencia, NO fabricador de bills. El equipo produce bills con analítica; el CFDI no sabe el proyecto.
2. **Pool del motor v2 = cuenta 17 + 285 + pagados-vía-Manual (desenredo).**
3. **Señales de match: monto → fecha → comprador.** Comprador leído del `payment_ref` de la LÍNEA (`[Mateo Salazar ****4197]`); `create_uid` del PO **inservible** (uniforme uid 25).
4. **Fase 3 = desenredo masivo ~550+** (patrón §12: unwind del duplicado → reconciliar línea real contra bill → borrar/revertir la entrada manual, limpia los $1.245M del 223). Edge: parciales (caso $576.11/residual 70.99, línea 30466).
5. **Corte de proceso:** fecha "cero Manual:BILL nuevos" — el equipo crea el bill y NO lo paga; el motor cierra el ciclo.

### 19.7 Cross-match X/Y/Z
Ver `docs/analisis/cross-match-2026-07.md` (batch read-only, insumo #1 de Fase 3): X directo (bills abiertos 17+285) / Y recuperable (desenredo pagados-manual) / Z sin documento real — excluyendo los `[FONDEO]` del denominador (no son compras).
