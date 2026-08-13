# RECON 0.5 — convergencia Chase + censo de colisiones Jeeves
**2026-08-12 (sesión b)** · read-only absoluto: cero writes a Odoo, cero edits/activaciones en n8n, cero commits.

Evidencia = id de registro Odoo, respuesta cruda de MCP, hash de commit. Lo no comprobado va a §6.
Quirk aplicado en todo el frente: Odoo filtra con `active_test` implícito → se consultó con `["active","in",[true,false]]` donde el modelo tiene el campo.

---

## 1. Mapa de journals de FTS USA (company_id = 6)

**Inventario completo con archivados incluidos: 10 journals, ninguno archivado** (`total: 10`, todos `active: true`). Solo 3 son de tesorería:

| id | name | code | type | currency | default_account | suspense | create_date | Historia real | Veredicto |
|---|---|---|---|---|---|---|---|---|---|
| **73** | JP Morgan Chase USD | BNK1 | bank | **USD (2)** | 313 `JP Morgan Chase` | 309 | 2024-01-09 | **41 asientos `entry` posted, $570,436.55** · 0 statement lines | 🔴 **NO archivable — requiere resolución antes** |
| **122** | BUS COMPLETE CHK | BNK2 | bank | false (USD de la company) | 1557 `BUS COMPLETE CHK` | 309 | **2026-08-09T21:31:56** | 312 statement lines, 0 conciliadas | 🟢 **Sobrevive — es el sincronizado** |
| 72 | Cash | CSH1 | cash | false | 312 `Cash` | 309 | 2024-01-09 | 12 asientos | ⚪ fuera de alcance |

Los otros 7 (66 INV, 67 BILL, 68 MISC, 69 EXCH, 70 CABA, 71 STJ, 101 SLR) son operativos, no bancarios.

**Cuál es cuál:**
- "BUS COMPLETE CHK" = **journal 122**, creado por el sync de Plaid el 2026-08-09 a las 21:31:56 UTC — 13 segundos después de que se crearan los registros `account.online.account` (21:31:43). Es el vínculo Plaid: `account.online.account` id 2 tiene `journal_ids: [122]`.
- El journal **anterior** = **73**, parte del plan original de la company (create_date 2024-01-09, junto con todos los demás).

### 1.2 Historia real por journal

**Journal 73 — no es un cascarón.** Sus 41 asientos son todos `state: posted`, `move_type: entry`, con nombre `PBNK1/AAAA/000NN` (prefijo P = pagos) y `ref` apuntando a facturas (`INV110 INV112 INV113`, `BILL/2026/07/0003`…). Distribución de sus `account.move.line`:

| Cuenta | reconciled | líneas | balance | amount_residual |
|---|---|---|---|---|
| **310 Outstanding Receipts** | **false** | **22** | **+567,530.68** | **+567,530.68** |
| 311 Outstanding Payments | false | 18 | −2,905.87 | −2,905.87 |
| 311 Outstanding Payments | true | 1 | 0 | 0 |
| 277 Account Receivable | true | 22 | −567,530.68 | 0 |
| 285 Account Payable | true | 18 | +2,774.96 | 0 |
| 285 Account Payable | false | 1 | +130.91 | +130.91 |

Lectura: **se registraron cobros de cliente que dejaron las facturas como pagadas (AR conciliado), pero el dinero quedó parado en "Outstanding Receipts" porque el journal 73 nunca tuvo statement lines contra las cuales conciliar.** Son **$567,530.68 en 22 partidas colgadas**.

Y **no es legacy** — sigue en uso diario:

| Año | asientos | amount_total |
|---|---|---|
| 2024 | 4 | $130,504.00 |
| 2025 | 8 | $203,190.64 |
| **2026** | **29** | **$236,741.91** |

Los dos más recientes se crearon **hoy**: `PBNK1/2026/00029` (id 61464, INV171, $7,198.75) y `PBNK1/2026/00028` (id 61465, INV170, $8,300.00), ambos `create_date 2026-08-12T14:09:55Z`.

**Journal 122 — el sincronizado.** 312 statement lines, **cero conciliadas** (el `aggregate` por `is_reconciled` devuelve un único grupo `false`). Rango **2026-05-09 → 2026-08-10** (may 85 · jun 87 · jul 50 · ago 90). Contrapartidas: cuenta 1557 = 312 líneas / **−$33,753.27**; cuenta 309 suspense = 312 líneas / **+$33,753.27** (todo el movimiento sigue en suspenso). Las 312 traen `online_transaction_identifier` poblado.

**Cuenta 313 (default del journal 73): cero `account.move.line` en cualquier estado** — el `aggregate` por `parent_state` devuelve `groups: []`. Los pagos del journal 73 nunca tocaron su propia cuenta de banco; se quedaron en las cuentas outstanding.

### 1.3 ¿Migrar o archivar? — **ninguna de las dos, tal cual**

Cruce por fecha±2d y monto exacto entre ambos journals:

- **Líneas solo en el viejo (73): 0** — no tiene statement lines que migrar.
- **Duplicadas en ambos: 0.**
- **Solo en el nuevo (122): 312** — el 100%.

**Convergencia de datos de extracto = trivial: no hay nada que migrar.** Pero archivar el 73 sin más dejaría **$567,530.68 de cobros colgados en Outstanding Receipts** sin journal vivo donde conciliarlos, y **cortaría un flujo que se usó hoy**. De ahí el veredicto 🔴.

Nota de composición: de los $567,530.68, **$333,694.64 son de 2024–2025** — anteriores a la ventana de Plaid (que arranca 2026-05-09), así que **jamás podrán conciliarse contra el journal 122** con los datos actuales. Solo los $236,741.91 de 2026 caen parcialmente en ventana. Del lado del banco, los abonos que el sync sí trajo son pocos: 12 líneas positivas por ~$45,500 en total (may 3 / jun 6 / jul 2 / ago 1).

### 1.4 Saldo inicial faltante del journal 122

| Concepto | Valor | Fuente |
|---|---|---|
| Balance que reporta Plaid | **$191,224.36** (available $189,946.61) | `account.online.account` id 2 |
| Suma `account.move.line` de la cuenta 1557 | **−$33,753.27** | `aggregate_records`, 312 líneas |
| **Gap = saldo inicial faltante** | **$224,977.63** | 191,224.36 − (−33,753.27) |

No existe asiento de apertura: la línea posted más antigua de la 1557 es del **2026-05-09** y es una comisión de tipo de cambio (`aml 204033`, `BNK2/2026/00001`, −$0.26), no una apertura. **Sí sigue en 312 líneas / 0% conciliado**, confirmado.

### 1.5 Documentos en `in_payment` (company 6)

`read_group` de `account.move` por `move_type`+`payment_state`, `state=posted`:

| move_type | payment_state | count |
|---|---|---|
| entry | not_paid | 365 |
| **in_invoice** | **in_payment** | **23** |
| in_invoice | not_paid | 20 |
| in_invoice | partial | 2 |
| in_receipt | not_paid | 1 |
| **out_invoice** | **in_payment** | **53** |
| out_invoice | not_paid | 6 |

**`in_payment` = 76** (23 + 53). Eran 74 al 9-ago → **creció en 2**.

---

## 2. La tarjeta de crédito Chase y sus adicionales

### 2.1 Ofrecidas por Plaid vs efectivamente vinculadas — **el hallazgo clave**

`account.online.account` **no tiene campo `active`** (el intento con `active_test` devolvió `Invalid field 'account.online.account.active'`), así que los 2 registros que devuelve son el universo completo.

| id | name | online_identifier | balance | available | last_sync | **journal_ids** | fetching_status |
|---|---|---|---|---|---|---|---|
| 2 | BUS COMPLETE CHK | `6Y9a173gDOFRMZwMr8eNfQDqVPaj3nhq3qg4K` | 191,224.36 | 189,946.61 | 2026-08-10 | **[122]** | done |
| 3 | **J. CALDERON** | `LALwgYOeRKHP4Zj4z8Lgf4eRoVwdA0UNpNbn4` | 125.77 | 1,225.96 | **false** | **[]** ← vacío | false |

Y en `account.online.link` id 9 ("Chase"):

```
"state": "connected", "provider_type": "plaid", "auto_sync": true,
"account_online_account_ids": [2, 3],
"journal_ids": [122],
"has_unlinked_accounts": true,        ← prueba legible por máquina
"last_refresh": "2026-08-12T15:15:51+00:00",
"next_refresh": "2026-08-13T03:15:35+00:00",
"renewal_contact_email": "edelacruz.fts@outlook.com"
```

**La tarjeta YA está dentro del consentimiento OAuth — solo no está vinculada a un journal.** Incorporarla es **vincular, no re-autorizar**. No hace falta volver a pasar por Plaid ni pedir credenciales de nuevo.

**Registro huérfano detectado:** `account.online.link` id **10** — `state: "disconnected"`, `name: false`, `provider_type: false`, `account_online_account_ids: []`, `journal_ids: []`, creado por Esteban el **2026-08-10T16:08:00**. Un minuto después (16:09:27) se escribió sobre la cuenta id 3. Es el rastro de un intento de conexión que falló y dejó basura; no afecta al link 9, que es el que funciona.

### 2.2 Atribución por portador en Chase — **veredicto: hoy NO se puede, y por dos razones distintas**

**Schema.** `fields_get` filtrado por "online" sobre `account.bank.statement.line` en esta instancia devuelve exactamente 4 campos:

```
online_account_id              many2one -> account.online.account
online_link_id                 many2one -> account.online.link
online_partner_information     char
online_transaction_identifier  char
```

**Muestra cruda de 15 líneas Chase** (ids 32889–32903). En **las 15**: `narration: false`, `ref: false`, `online_partner_information: false`, `transaction_type: false`, `account_number: false`. Lo único poblado es `payment_ref`, `partner_name` (enriquecimiento de comercio de Plaid) y `online_transaction_identifier`. Ejemplos verbatim:

| id | payment_ref | amount | partner_name | online_transaction_identifier |
|---|---|---|---|---|
| 32903 | `Same-Day ACH Payroll Payment 11231651253 to ########8029` | −177.00 | false | `8YOwqnK9PEFxqJVqkr5mf17gBRj97gTpLe9n6` |
| 32902 | `RACETRAC 583 ARLINGTON TX 026761 08/10` | −15.87 | RaceTrac | `Z6b0NQqwaoCx9X19JV0of7NEOzyZNEiXABxdA` |
| 32892 | `DENNY'S #7853 ARLINGTON TX 880345 08/09` | −82.92 | Denny's | `OjMDN4ReXvf3JODJ09avT7E5JoPKE5iXkB3RO` |
| 32890 | `Zelle payment to Erick Pollos 2025 JPM99csen2n9` | −10.00 | false | `n8ZbzrgJpLCk09E0oQyrSJ46P3oZ46C5yP49O` |
| 32889 | `UNITED 01621285742 UNITED.COM TX 08/08` | −628.15 | United Airlines | `N01LNXEYRAIBez8eqN4AUex7gBpXx7I5PMrkg` |

Los números dentro del descriptor (`026761`, `880345`, `#7853`) son referencia de terminal / número de sucursal del comercio — **no** últimos-4 de tarjeta. No hay campo de portador en ninguna forma.

**Las dos razones:**
1. **El journal 122 es una cuenta de CHEQUES, no la tarjeta.** Su tráfico es ACH de nómina, Zelle, y compras con débito de la cuenta. Ahí no hay "tarjetas adicionales" que atribuir — el concepto no aplica.
2. **La tarjeta de crédito (J. CALDERON) no está vinculada**, así que **no existe ni una sola línea suya en Odoo**. No es que el dato falte: es que todavía no hay dato. **La atribución por portador en la tarjeta no puede evaluarse hasta que se vincule y baje su primer lote.**

**Contraste con Jeeves**, donde sí funciona: cada transacción trae `source.name` = nombre del portador y `source.detail` = últimos 4 (`"source":{"name":"Felipe Pérez","detail":"4666"}`). Por eso Motor v2 puede usar "comprador" como señal en Jeeves. **Si Plaid/Chase no expone el equivalente para la tarjeta, esa señal no será portable a Chase** — pero eso solo se sabrá al vincular (§7).

### 2.3 Arquitectura contable para la tarjeta

**¿El sync nativo crea un journal por cuenta Plaid?** Sí — evidencia por construcción: el link 9 expone 2 cuentas, se vinculó 1, y se creó exactamente 1 journal (122) 13 segundos después de los registros de cuenta. `journal_ids` del link = `[122]`, y el de la cuenta 2 = `[122]`. La cuenta 3 quedó con `journal_ids: []` y **no** generó journal. → Vincular la tarjeta produciría **su propio journal**, que es justo lo que se quiere (activo bancario y pasivo de tarjeta separados).

**Plan de cuentas de company 6 — no existe cuenta de tarjeta de crédito.** Búsqueda por `account_type` con archivados incluidos:

| account_type | id | name | reconcile |
|---|---|---|---|
| asset_cash | 312 | Cash | false |
| asset_cash | 313 | JP Morgan Chase | false |
| asset_cash | 1557 | BUS COMPLETE CHK | false |
| liability_current | 284 | Current Liabilities | false |
| liability_current | 286 | Bills to receive | **true** |
| liability_current | 287 | Tax Received | false |
| liability_current | 288 | Tax Payable | false |

**No hay ninguna cuenta `liability_credit_card`.** Ninguna de las `liability_current` existentes es apropiada como default de la tarjeta (284 es un agregado, 286/287/288 tienen uso definido). **Habría que crear una cuenta nueva** — y ese es el patrón correcto: la tarjeta es pasivo, no puede colgar de una `asset_cash` como la 313.

---

## 3. Rutas de convergencia Chase (NO ejecutadas — Esteban decide)

### Ruta A — Vincular la tarjeta y dejar el 73 quieto · **riesgo BAJO**
1. En la UI de Odoo, sobre el link 9 "Chase", vincular `account.online.account` id 3 (J. CALDERON) a un journal nuevo. Odoo lo crea solo (§2.3).
2. Crear antes la cuenta contable de pasivo `liability_credit_card` y asignarla como `default_account_id` de ese journal.
3. El journal 73 se queda como está, operando.

- **Qué toca:** solo altas. Cero escritura sobre datos existentes.
- **Qué se pierde:** nada.
- **Irreversible:** las statement lines que baje Plaid (borrarlas después es manual y tedioso, pero posible). La ventana de backfill de Plaid (~90 días) **se consume una sola vez**: si se vincula hoy, se trae desde ~mayo; lo anterior no vuelve.
- **Deja pendiente:** los $567,530.68 colgados y el saldo inicial de $224,977.63.

### Ruta B — Ruta A + asiento de saldo inicial del 122 · **riesgo MEDIO**
Todo lo de A, más un asiento de apertura de **$224,977.63** con fecha 2026-05-08 (día previo a la primera línea sincronizada) contra la cuenta 1557.

- **Qué toca:** crea un asiento contable en un periodo cerrado o por cerrar → depende de lock dates.
- **Qué se pierde:** nada, pero el número **debe confirmarse contra el estado de cuenta real de Chase** (§7). El $224,977.63 es derivado del balance que reporta Plaid hoy, no de un estado de cuenta.
- **Irreversible:** un asiento posteado en periodo cerrado; revertirlo deja rastro en el chatter y puede requerir reabrir el periodo.

### Ruta C — Ruta B + resolución del journal 73 · **riesgo ALTO, es la única que converge de verdad**
Todo lo de B, más:
1. Decidir qué pasó realmente con los $567,530.68 de Outstanding Receipts (¿el dinero entró a BUS COMPLETE CHK? ¿a otro banco? ¿nunca entró?). **Esto no se puede responder desde Odoo** — §7.
2. Para los cobros de 2026 que sí caen en ventana: conciliarlos contra las líneas de abono del journal 122.
3. Para los $333,694.64 de 2024–2025: no hay contraparte bancaria disponible → o se consiguen extractos históricos, o se ajusta contablemente.
4. Migrar el flujo de captura de pagos del journal 73 al 122 (hoy se sigue usando el 73 a diario — cambiarlo sin avisar rompe la operación de quien lo captura).
5. Solo entonces archivar el 73.

- **Qué toca:** conciliaciones, posible ajuste contable de $333k, y un cambio de proceso operativo.
- **Qué NO se puede deshacer:** archivar el journal 73 con partidas outstanding sin resolver; y cualquier ajuste que se postee sobre los $333,694.64.

**Orden sugerido por riesgo, no por urgencia:** A es independiente y no compromete nada. B necesita un dato del banco. C necesita una decisión contable de Gerardo.

---

## 4. Censo de colisiones Jeeves 2026

### 4.1 El identificador nativo — **NO existe en el MCP**

`selectedFields` **es un no-op**. Prueba: se llamó con `{"id": true}` (un solo campo) sobre una ventana de 1 registro y la respuesta fue **idéntica** al shape completo por defecto — mismos campos, ninguno de más, ninguno de menos. La descripción de la tool anuncia `id` y `transactionId` como seleccionables; **la implementación los ignora y nunca los emite**.

Shape real y fijo de cada transacción:
```json
{"transactionType","transactionTypeTag","transactionStatus",
 "transactionDate","transactionPostedDate","createdAt",
 "totalBaseCurrencyAmount",
 "source":{"name","detail","currency","currencyAlphaCode"},
 "destination":{"name","detail","currency","currencyAlphaCode"}}
```

**Campos discriminantes que SÍ existen**, en orden de fuerza:

| Campo | Precisión | Sirve como llave |
|---|---|---|
| **`createdAt`** | **milisegundos** (`2026-07-24T07:28:59.434Z`) | ✅ el más fuerte; distingue los 7 casos confirmados |
| `transactionDate` | segundos | ✅ distingue los 7 casos |
| `transactionPostedDate` | segundos | ⚠️ colisiona (mismo lote de liquidación) |
| `destination.detail` | texto MCC | ⚠️ parcial — en el caso Starlink los dos cargos traen MCC distinto, pero no es garantía |
| `source.name` + `source.detail` | portador + últimos 4 | ya está en la llave actual |

**No hay** authorization code ni referencia de red.

**Dos quirks descubiertos de paso, ambos relevantes para cualquier trabajo futuro con esta API:**
1. **La API filtra por `createdAt`, no por `transactionDate`.** Evidencia: la ventana `[2026-06-04T06:00Z → 2026-06-05T05:59:59Z]` devolvió un registro con `transactionDate 2026-06-05T06:28:00Z` (fuera del rango) cuyo `createdAt` es `2026-06-05T04:28:01.069Z` (dentro).
2. **En transacciones `credit`, `transactionDate` = `createdAt` + 2 h**, sistemáticamente (ej. `transactionDate 2026-06-26T20:21:06Z` / `createdAt 2026-06-26T18:21:05.708Z`). En `debit` la diferencia es de ~2 segundos. La captura fecha por `transactionDate`, así que **las devoluciones nocturnas pueden caer un día después de lo que corresponde**.

### 4.2 Censo 2026 — números exactos

Alineando la ventana de Jeeves a meses CST (`[mes-01T06:00Z → mes+1-01T05:59:59Z]`) contra `date` de Odoo:

| Mes CST | Jeeves | Odoo j61 | Gap |
|---|---|---|---|
| Enero | 172 | 172 | 0 |
| Febrero | 254 | 254 | 0 |
| **Marzo** | 396 | 393 | **−3** |
| Abril | 338 | 338 | 0 |
| **Mayo** | 331 | 325 | **−6** |
| **Junio** | 178 | 174 | **−4** |
| **Julio** | 192 | 187 | **−5** |
| Agosto (1–12) | 58 | 58 | 0 |
| **TOTAL** | **1,919** | **1,901** | **−18** |

*(La consulta de rango completo sin alinear devuelve 1,920: el registro extra es uno cuyo `createdAt` cae entre 00:00 y 06:00 UTC del 1-ene, o sea 31-dic CST. La suma por meses CST cuadra exacta en 1,919 — el desglose valida la alineación.)*

**Gap agregado 2026 = 18.** Advertencia honesta: es una cifra **neta**. Incluye ruido de frontera porque la API ventanea por `createdAt` mientras Odoo fecha por `transactionDate − 6 h` (§4.1 quirk 1). Los `+2` que aparecen en la última semana de marzo y de mayo son exactamente eso, no inserciones espurias.

### 4.3 Lista de pérdidas confirmadas individualmente — **7 transacciones, $2,299.99**

Cada una verificada por enumeración completa del día en Jeeves contra las líneas reales de Odoo del mismo día CST:

| # | Fecha CST | Comercio | Monto | Tarjeta / portador | Hora UTC | Gemela que SÍ quedó en Odoo |
|---|---|---|---|---|---|---|
| 1 | 2026-06-04 | 123/Undostres.com.mx Mexico City Mex | $25.00 | ****4548 Tarjeta gastos | 15:11:35 | id 30697 |
| 2 | 2026-06-04 | 123/Undostres.com.mx Mexico City Mex | $25.00 | ****4548 Tarjeta gastos | 15:14:22 | id 30697 |
| 3 | 2026-06-04 | 123/Undostres.com.mx Mexico City Mex | $25.00 | ****4548 Tarjeta gastos | 18:47:26 | id 30697 |
| 4 | 2026-07-17 | 123/Undostres.com.mx Mexico City Mex | $25.00 | ****4548 Tarjeta gastos | 15:22:39 | id 30474 |
| 5 | 2026-07-24 | Starlink | $695.00 | ****4666 Felipe Pérez | 07:28:57 | id 32450 |
| 6 | 2026-07-28 | Steren | $74.99 | ****4548 Tarjeta gastos | 16:43:29 | id 32481 |
| 7 | 2026-07-29 | SD | $1,355.00 | ****4548 Tarjeta gastos | 16:20:31 | id 32491 |

**El caso más ilustrativo — Jun 4:** Jeeves registra **cuatro** cargos de `123/Undostres.com.mx` por $25.00 exactos, misma tarjeta 4548, mismo día CST (15:11:35, 15:14:22, 18:47:26 y 20:34:22 UTC). Los cuatro producen **el mismo hash**. Odoo tiene **uno** (id 30697). Se perdieron 3.

**El control negativo que valida el diagnóstico:** ese mismo 4 de junio hay **dos** cargos a `Infra` por **$1,700.49 idénticos**, pero con tarjetas distintas (****4548 y ****6831). Como `l4` sí entra en la llave, los hashes difieren y **ambos** están en Odoo (ids 30702 y 30703). La colisión ocurre exactamente cuando y solo cuando los 5 componentes coinciden.

**Distribución:**

| Por comercio | n | $ |
|---|---|---|
| 123/Undostres.com.mx | 4 | 100.00 |
| SD | 1 | 1,355.00 |
| Starlink | 1 | 695.00 |
| Steren | 1 | 74.99 |

| Por tarjeta | n | $ |
|---|---|---|
| ****4548 "Tarjeta gastos" | 6 | 1,604.99 |
| ****4666 Felipe Pérez | 1 | 695.00 |

### 4.4 Lo que falta enumerar, con su ubicación exacta

De las 18 unidades de gap: **7 confirmadas como pérdida real**, **1 explicada como frontera** (ver abajo), **10 localizadas pero sin enumerar**.

**Julio queda cerrado:** 4 pérdidas reales + 1 unidad que **no es pérdida**. El ajuste `[ADJUSTMENT] Credit Line` de $5,987.20 con `createdAt 2026-07-15T22:03:17Z` tiene `transactionDate 2026-07-15T00:00:00Z` → CST 14-jul → y **está en Odoo como id 30444, fecha 2026-07-14**. Cae en la ventana Jeeves de julio-15 pero en el día Odoo julio-14: ruido de frontera puro.

**Junio queda cerrado:** 3 pérdidas reales (las Undostres) + 1 frontera (el `[AJUSTE JEEVES]` de $2,079.77, `transactionDate 2026-06-01T00:00:00Z` → CST 31-may).

**Marzo (−3) y mayo (−6), localizados a semana:**

| Semana CST | Jeeves | Odoo | Gap |
|---|---|---|---|
| Mar 1–7 | 56 | 56 | 0 |
| Mar 8–14 | 67 | 67 | 0 |
| **Mar 15–21** | 108 | 104 | **−4** |
| **Mar 22–28** | 137 | 136 | **−1** |
| Mar 29–31 | 28 | 30 | +2 (frontera) |
| **May 1–7** | 94 | 90 | **−4** |
| **May 8–14** | 82 | 81 | **−1** |
| **May 15–21** | 53 | 52 | **−1** |
| **May 22–28** | 94 | 92 | **−2** |
| May 29–31 | 8 | 10 | +2 (frontera) |

Enumerarlas es mecánico: bajar a día dentro de esas 6 semanas y comparar. No se hizo por presupuesto de sesión. **No es un dato faltante crítico** — ver §5, la recuperación no depende de esta lista.

### 4.5 Sentido inverso — líneas en Odoo que no existan en Jeeves

**No se detectó ninguna** en la muestra enumerada (Jun 1, Jun 4, Jun 5, Jul 15, Jul 17–19, Jul 24–26 = 51 líneas de Odoo). Cada línea de Odoo tuvo su contraparte exacta en Jeeves.

Los únicos `+2` del censo (últimas semanas de marzo y mayo) son desplazamientos de frontera, no inserciones. **Un barrido inverso completo sobre las 1,901 líneas NO se ejecutó** → §6.

---

## 5. Diseño propuesto del nuevo hash (solo diseño)

**Llave actual** (`captura-jeeves`, nodo `8 - Code Construir filas`):
```js
const hashInput = [fecha, amount.toFixed(2), tag, l4, (dst.name||'')].join('|');
const uid = 'jeeves-' + _sha256hex(hashInput);
```

**Llave propuesta** — un solo componente más:
```js
const hashInput = [fecha, amount.toFixed(2), tag, l4, (dst.name||''), t.createdAt].join('|');
```

`createdAt` es la mejor opción disponible: precisión de milisegundos, presente en el 100% de la muestra observada (~1,919 registros a lo largo de 2026, ningún null), y **estable entre llamadas** — el mismo registro devolvió el mismo `createdAt` en consultas separadas por horas (ej. la Undostres de Jul 24 07:28:59.434Z apareció idéntica en tres consultas distintas de esta sesión). Alternativa equivalente: `transactionDate` (segundos) — también distingue los 7 casos confirmados, pero `createdAt` da más margen.

### ⚠️ El barrido de recuperación NO es idempotente si solo se cambia el hash

**Este es el punto que decide el diseño.** Al cambiar la fórmula, **las 1,901 filas ya capturadas quedan con un `unique_import_id` de formato viejo**. Un re-run sobre 2026 con la llave nueva no reconocería ninguna → **insertaría las 1,919 otra vez**. Duplicación masiva.

Tampoco sirve el atajo obvio: "aceptar como ya-capturada si coincide el hash viejo **o** el nuevo". Las gemelas de una colisión comparten el hash viejo, así que la perdida también daría "ya capturada" y **nunca se recuperaría**. El atajo preserva justo el bug.

**Diseño que sí funciona — emparejamiento voraz por multiconjunto:**

1. Traer todas las transacciones Jeeves del rango y todas las líneas existentes del journal 61 del mismo rango.
2. Ordenar ambos lados de forma determinista (Jeeves por `createdAt` asc; Odoo por `id` asc).
3. Para cada transacción Jeeves, intentar **reclamar** una línea de Odoo aún no reclamada que coincida en `(date, amount, payment_ref)`. Reclamada = consumida para esta corrida.
4. Si la reclama: opcionalmente **reescribir su `unique_import_id` al formato nuevo** (backfill).
5. Si no hay ninguna libre que coincida: **insertar**.

**Es idempotente:** en una segunda corrida cada transacción encuentra su línea (ya sea la original o la insertada en la primera pasada) y no se inserta nada. Y es exactamente el procedimiento que se usó a mano en §4.3 para confirmar las 7.

**Por eso la lista de §4.4 no es bloqueante:** el barrido descubre las faltantes por sí solo. La lista sirve como **verificación** — si el barrido inserta exactamente las 7 confirmadas más las de marzo/mayo, cuadró.

**Dos detalles del diseño, no menores:**
- Dentro de un grupo colisionado las gemelas son idénticas en todos los campos capturados, así que **cuál reclama cuál es indistinto contablemente** — pero el orden debe ser determinista para que dos corridas den el mismo resultado.
- Mientras la llave siga sin el ID nativo, **conviene contar y reportar las colisiones** (`filas cuyo hash viejo se repite dentro del lote`) como métrica propia en el `[[CBRUN]]`, en vez de sumarlas a `duplicadas`. Hoy la pérdida se reporta como éxito (`status:"ok", rechazadas:0`) y ese es el modo de fallo que la hizo invisible 7 meses.

---

## 6. NO VERIFICABLE en esta sesión

| Ítem | Por qué |
|---|---|
| **Enumeración individual de las 10 pérdidas de marzo y mayo** | Localizadas a 6 semanas concretas (§4.4). Bajar a día y enumerar es mecánico pero consume ~30 llamadas más; se priorizó cerrar los frentes 1 y 2. **No es extrapolación**: el gap por mes es medido, lo que falta es el detalle por transacción. |
| **Barrido inverso completo (Odoo → Jeeves) sobre las 1,901 líneas** | Solo se verificó sobre 51 líneas de días enumerados (0 espurias). El resto no se comprobó. |
| **Si `id`/`transactionId` existen en la API de Jeeves por debajo del MCP** | Se probó que `selectedFields` es un no-op en **esta** tool. No se puede distinguir "el backend no los tiene" de "el MCP no los expone". `export_transactions` podría revelarlo, pero **manda un correo** — no se ejecutó sin autorización (§7). |
| **Atribución por portador en la tarjeta Chase** | Indeterminable hasta vincular: la cuenta 3 tiene `journal_ids: []` y **cero líneas** en Odoo. Lo verificado es que la cuenta de **cheques** (122) no trae portador. |
| **Si los $567,530.68 de Outstanding Receipts del journal 73 corresponden a dinero que entró a BUS COMPLETE CHK** | Requiere extractos de Chase anteriores a 2026-05-09, fuera de la ventana de Plaid y fuera de Odoo. |
| **Que $224,977.63 sea el saldo inicial correcto** | Es derivado del balance que Plaid reporta **hoy** menos el movimiento contabilizado. Un estado de cuenta real al 2026-05-08 lo confirmaría o lo corregiría. |
| **Tipo/subtipo Plaid de la cuenta "J. CALDERON"** | `account.online.account` en esta instancia no expone campo de tipo/subtipo; los campos disponibles se leyeron con `__all__` y no incluyen ninguno. Que sea tarjeta de crédito viene de Esteban, no de Odoo. |
| **Si el bug del 25-jul "fuentes de pago vacías" sigue vivo** | Necesita el response autenticado de `fin/captura-transacciones`; sin JWT (mintearlo exige crear+activar un workflow, prohibido en modo read-only). Lo que sí se descartó: **v0.5.14 no lo causó** (§8). |

---

## 7. ACCIONES FUERA DE ALCANCE — requieren a Esteban

### En chase.com
1. **Estado de cuenta de BUS COMPLETE CHK al cierre del 2026-05-08.** → Confirma o corrige el saldo inicial de **$224,977.63**. Sin esto, la Ruta B se postea sobre un número derivado.
2. **Estados de cuenta de 2024–2025 (o de todo lo previo a mayo 2026).** → Determina si los **$567,530.68** de Outstanding Receipts del journal 73 entraron a esta cuenta, a otra, o nunca. Es la pregunta que desbloquea la Ruta C.
3. **La tarjeta "J. CALDERON": número completo, límite de crédito, y lista de tarjetas adicionales con su portador y últimos-4.** → Define si se puede replicar el modelo Jeeves (gasto atribuible por ingeniero) o si habrá que atribuir por otro medio.
4. **¿El estado de cuenta de la tarjeta muestra el portador por transacción?** → Si el papel lo trae pero Plaid no, hay una vía alterna (importación de statement) para la atribución.

### En Odoo (UI logueado — el MCP es read-only)
5. **Vincular `account.online.account` id 3 a un journal nuevo** (Ruta A). Antes, crear la cuenta contable de pasivo de tarjeta (§2.3: hoy no existe ninguna `liability_credit_card` en company 6).
6. **Decidir qué hacer con `account.online.link` id 10** — el registro huérfano `disconnected` del 10-ago. Borrarlo o dejarlo; hoy no estorba, pero ensucia el diagnóstico.
7. **Confirmar quién captura los pagos `PBNK1` del journal 73** y avisarle antes de cualquier migración — se usó hoy a las 14:09 UTC.

### En el portal de Jeeves
8. **Verificar si la UI o un export CSV exponen un ID de transacción** que el MCP no emite. Vía disponible sin salir de aquí: la tool `export_transactions` genera el CSV y **lo manda por correo** al usuario autenticado — no se ejecutó porque envía correo. Si autorizas, es una llamada.

### Con Gerardo / contabilidad
9. **Los $333,694.64 de Outstanding Receipts de 2024–2025** no tienen contraparte bancaria alcanzable. Es una decisión contable, no técnica.

---

## 8. Frente 4 — cierre de huecos del recon anterior

**4.1 Secretos en `finanzas/`: limpio.** Único endpoint hardcodeado es la base pública de n8n (`https://primary-production-5c3c.up.railway.app` en `js/auth-fin.js:11` y `js/fin-client.js:14`). Cero API keys, cero tokens, cero HMAC. El password viaja por body desde el form de login.

**4.2 Branches y PRs:** `gh pr list --state open` → `[]`. **Cero PRs abiertos.** Las 3 ramas remotas vivas (`feat/carga-mo-panel-dryrun`, `docs/carga-mo-shas-quirk`, `feat/carga-mo-ui-etiquetas`) son de Carga MO, ya en main. Sin trackear en el working tree: `docs/jeeves-mcp-tools.md`, `docs/mockup-finanzas-bancos.html`.

**4.3 v0.5.14 — `4fb1d7e`, Wed Jul 29 22:46:37 2026 -0600.** Título: *"feat(bancos): v0.5.14 — nota 'en tránsito' junto a Sincronizar (preview pendings Jeeves)"*. Diff:

```
 finanzas/css/instrumentos-pago.css       |  2 ++
 finanzas/index.html                      |  4 ++--
 finanzas/js/modules/instrumentos-pago.js | 24 ++++++++++++++++++++++--
 finanzas/version.json                    |  6 +++---
 4 files changed, 29 insertions(+), 7 deletions(-)
```

Cambios reales: bump `IP_BUILD '0.5.13'→'0.5.14'`, alta de `var EP_PENDINGS = '/fin/captura-pendings-status'`, y un `.catch(function () { state.pendings = { disponible: false }; paintPendNote(); })`.

**Veredicto: v0.5.14 NO es candidato al bug de "fuentes de pago vacías".** Es front-only; no tocó endpoints existentes ni el parseo de sus responses. El único endpoint que introduce (`fin/captura-pendings-status`) **está inactivo y responde 404**, y el código degrada a nota vacía por diseño — sin efecto sobre la tabla ni sobre las fuentes. *(Dato de contexto del propio `version.json`: el bug de esa familia que sí ocurrió fue **v0.5.4** — "el endpoint real devuelve `rs` sin `company_id`, y el filtro exigía `t.company_id` → descartaba las 108 filas → tabla en 0".)*

**4.4 Payana y BBVA — dimensión del alcance de la Fase 3.**

*Nota de encuadre: la instrucción a Gera fue explícitamente solo-Jeeves, así que esto es **alcance nuevo por medir**, no incumplimiento.*

Acumulado histórico del patrón `Manual: BILL` por cuenta (1,650 líneas en total):

| Cuenta | líneas | balance acumulado |
|---|---|---|
| 38 `102.01.001 BBVA General MXN` | 40 | **−$5,366,131.55** |
| 316 `102.01.00006 PAYANA` | 200 | **−$2,739,436.93** |
| 223 `102.01.007 Jeeves` | 554 | −$1,256,865.87 |
| 227 `102.01.00002 BBVA USD` | 4 | −$685,803.28 |
| 17 `201.01.01 Proveedores nacionales` (contrapartida) | 811 | +$10,053,937.63 |
| 186 / 311 / 285 (menores) | 41 | −$5,700 / −$69,891.66 / +$69,891.66 |

Ritmo semanal desde julio (líneas · balance):

| Semana | PAYANA (316) | BBVA MXN (38) | BBVA USD (227) |
|---|---|---|---|
| W27 (jun 28) | — | 1 · −19,488.37 | — |
| W28 (jul 5) | 11 · −126,068.34 | 9 · −924,439.32 | 1 · −675,462.45 |
| W29 (jul 12) | 4 · −8,304.96 | 3 · −181,609.98 | — |
| W30 (jul 19) | 4 · −112,506.48 | — | — |
| W31 (jul 26) | 2 · −3,654.00 | — | — |
| W32 (ago 2) | 16 · −180,956.78 | 1 · −104,400.00 | — |
| W33 (ago 9, parcial) | 4 · −2,605.72 | 2 · −116,342.05 | — |

**El alcance fuera de Jeeves es ~6.4× el de Jeeves** en pesos (−$8.79M entre PAYANA + BBVA MXN + BBVA USD, contra −$1.26M en la 223), concentrado en muchas menos líneas (244 vs 554) — es decir, **montos por asiento mucho mayores**. Sigue activo: W32 y W33 acumulan 23 líneas por −$404,304.55.
