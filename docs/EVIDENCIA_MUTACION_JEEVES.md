# Evidencia de mutación pending→settled en Jeeves
**2026-08-12** · read-only (cero writes a Odoo, cero commits; solo 2 archivos locales: este doc y el snapshot).
Línea base del experimento a 48h: [`snapshot-pendings-2026-08-12.json`](snapshot-pendings-2026-08-12.json) — 9 pendings crudas + su `uid_v1`/`uid_v2` predichos.

---

## 1. Shape de una PENDING vs una SETTLED

Ambas se leyeron con la misma tool (`list_transactions`, sin `selectedFields` porque es un no-op). **Lado a lado, mismos campos, sin recortar:**

| Campo | PENDING (hoy) | SETTLED (5–10 ago) |
|---|---|---|
| `transactionType` | `"debit"` | `"debit"` |
| `transactionTypeTag` | `"CARD"` | `"CARD"` |
| `transactionStatus` | `"pending"` | `"settled"` |
| `transactionDate` | `"2026-08-12T16:23:40.000Z"` | `"2026-08-10T20:00:36.000Z"` |
| **`transactionPostedDate`** | **`null`** | `"2026-08-12T10:02:09.000Z"` |
| `createdAt` | `"2026-08-12T16:23:43.786Z"` | `"2026-08-10T20:00:39.336Z"` |
| `totalBaseCurrencyAmount` | `"47.000000"` | `"102.280000"` |
| `source` | `{name:"Primary", detail:"6831", currency:484, currencyAlphaCode:"MXN"}` | `{name:"Primary", detail:"6831", currency:484, currencyAlphaCode:"MXN"}` |
| `destination` | `{name:"Oxxoteran", detail:"Miscellaneous Food Stores…", currency:484, currencyAlphaCode:"MXN"}` | `{name:"Mellsa Colonnl", detail:"Hardware Stores", currency:484, currencyAlphaCode:"MXN"}` |

**La única diferencia estructural es `transactionPostedDate`: `null` en pending, poblado en settled.** Ni un campo de más, ni uno de menos. Verificado en las 9 pendings.

**Identificadores candidatos:** ninguno nativo. No hay `id`, `transactionId`, `uuid` ni código de autorización — confirmado en la sesión previa probando `selectedFields:{"id":true}`, que devolvió el shape completo idéntico. Los únicos discriminantes siguen siendo `createdAt` (milisegundos), `transactionDate` (segundos) y `destination.detail` (MCC).

**Total de pendings ahora mismo: 9.** Todas `debit`/`CARD`, todas del 11 y 12 de agosto. Cero colisiones `uid_v1` dentro del propio lote.

---

## 2. Veredicto sobre `createdAt` como llave — **SIRVE** (con un asterisco)

### 2.1 Prueba dura: reconstrucción del hash almacenado

Se replicó la fórmula exacta del nodo `8 - Code Construir filas` (incluidos `last4(s)=s.slice(-4)` y `toCstDate` con offset fijo −6 h), se recalculó `unique_import_id` desde **lo que Jeeves reporta hoy**, y se comparó contra **lo que Odoo guardó cuando capturó**:

```
=== PARTE 2 — reconstrucción de hash v1 sobre settled ya capturadas ===
Jeeves settled en ventana : 35
Líneas Odoo en ventana    : 35
Hash reconstruido == hash almacenado : 35 / 35
Jeeves sin match en Odoo  : 0
Odoo sin match en Jeeves  : 0
Diferencias de monto/ref  : 0
```

**35 de 35.** Los cinco componentes del hash (`fecha CST`, `monto`, `tag`, `últimos-4`, `comercio`) son **byte-idénticos** entre el momento de captura y hoy. Cero mutación de monto. Cero mutación de `payment_ref`. Cero huérfanas en ninguna dirección.

⚠️ **Alcance real de esta prueba:** las 35 **ya estaban settled cuando se capturaron** (captura-jeeves solo captura settled). Prueba estabilidad **entre lecturas de settled**, no a través de la transición pending→settled. No la sobre-interpretes.

### 2.2 Prueba indirecta fuerte: `createdAt` es sello de autorización, no de liquidación

Este es el hallazgo que responde la pregunta de diseño. Distancia `createdAt − transactionDate`:

| Población | n | rango |
|---|---|---|
| **SETTLED, debit** | 33 | **+2.3 s … +4.2 s** |
| **PENDING, debit** | 9 | **+1.9 s … +3.8 s** |
| SETTLED, credit | 2 | −7,199 s (exactamente −2 h, quirk conocido) |

Y para contraste, en esas mismas settled `transactionPostedDate − transactionDate` ≈ **38 horas** (ej. `transactionDate 2026-08-10T20:00:36Z` → `transactionPostedDate 2026-08-12T10:02:09Z`).

**El razonamiento:** si `createdAt` se re-sellara al liquidar, las settled mostrarían una distancia de ~días respecto a `transactionDate` — como la muestra `transactionPostedDate`. Muestran **2–4 segundos, exactamente la misma distribución que las pendings de hoy**. Es decir: **`createdAt` se estampa cuando la transacción nace autorizada (pending) y sobrevive intacto a la liquidación.**

Es inferencia por la forma de la distribución, no observación directa de una transición — pero las dos poblaciones son indistinguibles y el contraste con `transactionPostedDate` es de tres órdenes de magnitud.

### 2.3 Veredicto

**`createdAt` sirve como llave estable para el hash v2 y para el almacén de preconciliaciones.** El hash v2 propuesto (`fecha|monto|tag|l4|comercio|createdAt`) **no queda invalidado** por esta evidencia.

**El asterisco:** la confirmación definitiva es el experimento a 48h (§5). Hasta entonces esto es un veredicto *fuertemente respaldado*, no *probado*.

Nota adicional para el diseño del almacén: **`createdAt` nunca se persistió en Odoo.** El hash v1 no lo incluye y no hay campo donde viva. Por eso **no se puede verificar retroactivamente** contra capturas históricas — solo hacia adelante, con el snapshot de hoy como ancla.

---

## 3. Mutación de monto — **cero casos en 35**

Ninguna de las 35 líneas mostró diferencia entre el monto capturado por Odoo y el que Jeeves reporta hoy (tolerancia 0.001). Tampoco en `payment_ref`.

**Ausencia en 35 no prueba estabilidad.** Y hay una razón concreta para no darlo por cerrado: la muestra son transacciones que **ya nacieron settled** desde el punto de vista de la captura. El caso clásico de mutación de monto — propina de restaurante, ajuste de renta de auto, hold de hotel — ocurre justamente **en la transición pending→settled**, que es exactamente lo que esta muestra no cubre.

Señal de riesgo concreta en el snapshot de hoy: la pending de **$18,205.04** en `Ferr` (tarjeta ****4548, 2026-08-11T23:06:33Z) y la de **$2,939.10** en `BPK`. Son montos grandes de ferretería; si alguna liquida con un importe distinto, el experimento lo capturará.

Y hay precedente documentado en los propios datos: el **Europcar de $0.01** del 3-ago (línea Odoo 32863) — un cargo de un centavo que liquidó **5 días después** que el cargo principal de $1,755.70 del mismo comercio y misma tarjeta. Es la firma típica de un ajuste post-autorización.

---

## 4. Veredicto Chase pendings — **NO se puede construir preconciliación**

**Binario: NO.**

Evidencia:
1. **`fields_get` de `account.bank.statement.line`** — los 19 campos que matchean "state" son de contabilidad o de módulos ajenos (`state`, `payment_state`, `edi_state`, `extract_state`, `l10n_mx_edi_cfdi_sat_state`, `statement_*`…). **No existe ningún campo de estado bancario pending/authorized.** El `state` del modelo es el contable: draft/posted/cancel.
2. **Muestra cruda de 10 líneas del journal 122** (ids 32894–32903): **las 10** con `state: "posted"`, `payment_state: "not_paid"`, `is_reconciled: false`, `online_transaction_identifier` poblado, `online_account_id: [2,"BUS COMPLETE CHK"]`, `online_link_id: [9,"Chase"]`. Todas llegan ya posteadas; no hay estado intermedio.
3. **`account.online.link` id 9** — sus campos de configuración (`state`, `auto_sync`, `last_refresh`, `next_refresh`, `connection_state_details`, `has_unlinked_accounts`, `expiring_synchronization_date`) **no incluyen ninguna opción de importar pendings**.

**Consecuencia de diseño:** el sync nativo Plaid→Odoo entrega solo transacciones liquidadas, ya convertidas en `statement.line` posteada. **Chase no tiene la ventana pending que Jeeves sí expone vía MCP.** La preconciliación es una capacidad exclusiva del lado Jeeves mientras Chase dependa del sync nativo.

*(La única vía teórica sería consultar la API de Plaid directamente por fuera de Odoo — Plaid sí expone `pending: true` y `pending_transaction_id`. Eso es un componente nuevo, no una configuración.)*

---

## 5. Qué queda pendiente del experimento a 48h

El snapshot `docs/snapshot-pendings-2026-08-12.json` guarda, por cada una de las 9 pendings: el objeto **crudo** completo y el **derivado de hoy** (`fecha_cst`, `amount`, `payment_ref`, `l4`, `uid_v1`, `uid_v2`).

**El 2026-08-14, volver a leerlas y verificar tres cosas:**

1. **¿`createdAt` sobrevivió?** Recalcular `uid_v2` sobre la versión settled y comparar contra el guardado. **Si difiere, el hash v2 no sirve y hay que rediseñar** — y todo el almacén de preconciliaciones necesita otra llave.
2. **¿Mutó el monto?** Comparar `totalBaseCurrencyAmount`. Vigilar en particular la de $18,205.04 (Ferr) y la de $2,939.10 (BPK). Si mutó, la preconciliación tomada sobre la pending **no puede asumir el monto** y necesita re-validación al liquidar.
3. **¿Mutó `destination.name` o `source.detail`?** Son 2 de los 5 componentes del hash v1 y del v2. Un comercio que se re-etiqueta al liquidar rompería el emparejamiento igual que un monto.

**Cómo re-leerlas:** `list_transactions` con `startDate 2026-08-11T00:00:00Z`, `transactionStatuses:["settled"]`, y emparejar por `createdAt` contra el snapshot. Si alguna no aparece, buscarla por `(fecha, monto, l4, comercio)` — su ausencia bajo ambos criterios sería el tercer resultado posible: **que la pending expire sin liquidar**, caso que el almacén también tiene que contemplar.

**Lo que este experimento NO va a responder:** si existe un identificador nativo por debajo del MCP. Eso sigue dependiendo de `export_transactions` (manda correo, pendiente de tu autorización) o del portal de Jeeves.
