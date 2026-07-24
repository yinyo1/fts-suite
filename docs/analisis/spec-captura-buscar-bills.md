# Spec — workflow `fin/captura-buscar-bills` (Pieza #1 del diseño de estados)

> 2026-07-24 · Spec ANTES de construir (patrón de siempre). Implementa §3 de
> [`diseno-estados-preconciliacion.md`](diseno-estados-preconciliacion.md): buscador manual de bills en el
> acordeón, para resolver los `sin-documento` / falso-candidato encontrando el bill REAL — **incluidos los de
> la cuenta 285 y los que el motor automático no ve**. Workflow **NUEVO**, creado **INACTIVO**. Cero ediciones
> a workflows existentes (captura-jeeves corre su día; Etapa D intacta para las 23:00 CST).

---

## 1. Propósito

El motor automático (`fin/captura-sugerencias`) solo mira la cuenta **17** dentro de una ventana de fechas
estrecha → muchos `sin-documento` SÍ tienen bill (en **285**, o fuera de ventana, o con nombre de comercio que
no matchea el proveedor). Este endpoint deja que el humano **busque el bill a mano** por texto y/o monto contra
**el pool completo de bills abiertos de 17 Y 285**, y lo enchufe al **botón Conciliar existente** — sin lógica
de escritura nueva (los guards de `fin/captura-conciliar` quedan intactos).

**Read-only.** No escribe a Odoo. No concilia. Solo SEARCH + map.

---

## 2. Contrato

### Trigger
- Webhook **POST** `path=fin/captura-buscar-bills`, `responseMode=responseNode`, `onError=continueRegularOutput`.
- JWT **en el body** (patrón Finanzas), scope requerido **`bancos:read`** (mismo gate que `sugerencias`).

### Request (body JSON)
```jsonc
{
  "token": "<JWT>",              // requerido
  "q": "oxxo",                   // opcional · texto libre → OR sobre folio(move.name) + proveedor(partner)
  "folio": "BILL2881",           // opcional · substring del nombre del asiento (move_id.name), case-insensitive
  "proveedor": "uber",           // opcional · substring del nombre del proveedor (partner_id), case-insensitive
  "monto": 500.00,               // opcional · monto objetivo (se compara contra |amount_residual|)
  "monto_tol": 0.01,             // opcional · rango ± (default 0.01; el front puede mandar 1.00, 5.00…)
  "companies": [1, 6],           // opcional · filtra por company_id del bill (si se omite, ambas)
  "line_id": 12345,              // opcional · id de la línea de banco que se está conciliando (para days_diff)
  "line_date": "2026-07-02",     // opcional · fecha de esa línea (YYYY-MM-DD) → days_diff sin leer Odoo extra
  "limit": 20                    // opcional · default 20, máx 50
}
```
Al menos uno de `q` / `folio` / `proveedor` / `monto` debe venir; si no, se responde `{resultados:[], total:0, _empty_query:true}` (no barre todo el pool sin filtro).

### Server (lógica)
1. **Odoo SEARCH `account.move.line`** (nodo Odoo v1, `getAll`, `returnAll:true`), filtros ESTRUCTURALES (ANDeados):
   - `account_id` **`in`** `[17, 285]` ← **AMBAS payable SIEMPRE** (no repetir el punto ciego de mirar solo 17).
   - `reconciled` `equal` `false`
   - `parent_state` `equal` `posted`
   - `move_id.move_type` **`in`** `['in_invoice','in_refund']`
   - `fieldsList`: `id, move_id, partner_id, amount_residual, amount_total_signed, date, account_id, company_id`.
   - **Sin filtro de fecha** (el buscador manual debe ver bills viejos también — ese es medio punto de la pieza).
2. **Code (filtro fino en JS)** sobre el pool devuelto — aquí van los filtros de texto/monto porque el builder del
   nodo Odoo no expresa OR entre campos:
   - normaliza (lowercase + fold de acentos) `move_id[1]` (folio) y `partner_id[1]` (proveedor).
   - `folio` → substring en el nombre del asiento; `proveedor` → substring en el proveedor; `q` → OR sobre ambos.
   - `monto` → `abs(amount_residual)` ∈ `[monto − monto_tol, monto + monto_tol]`.
   - `companies` → si viene, `company_id[0] ∈ companies`.
   - `days_diff` = `|date_bill − line_date|` en días si `line_date` viene; si no, `null`.
   - Orden: (a) por cercanía de monto si `monto` vino, luego (b) `days_diff` asc si hay `line_date`, luego (c) `date` desc.
   - **Corta a `limit` (default 20, máx 50)**; marca `truncated:true` si hubo más que `limit`.

### Response (200) — **shape compatible con los candidatos del acordeón**
```jsonc
{
  "resultados": [
    {
      "bill_aml_id": 88123,          // account.move.line.id → lo consume el botón Conciliar existente
      "bill_name": "BILL2881",       // move_id[1]
      "move_id": 45012,              // move_id[0]
      "partner": "Uber Mexico",      // partner_id[1]
      "partner_id": 662,             // partner_id[0]
      "monto_bill": 500.00,          // abs(amount_residual) (positivo, como los candidatos del motor)
      "date_bill": "2026-07-02",     // date
      "cuenta": 285,                 // account_id[0] ∈ {17, 285} → badge en la UI
      "days_diff": 0,                // vs line_date, o null
      "score": null,                 // el buscador NO puntúa (lo eligió el humano) → banda 'busqueda'
      "banda": "busqueda",
      "conflicto": false,
      "pre_marcado": false
    }
  ],
  "total": 1,                        // cuántos matchearon (antes de cortar a limit)
  "truncated": false                 // true si total > limit
}
```
Errores: mismo contrato que `sugerencias` (`{_error:true, code, http}` con `BAD_TOKEN`/`TOKEN_EXPIRED`/`SCOPE_INSUFFICIENT`/`SERVER_MISCONFIG` → Respond con `responseCode`).

---

## 3. Nodos (7) — clona la cadena JWT de `captura-sugerencias` verbatim

| # | Nodo | Tipo | Notas |
|---|---|---|---|
| 1 | Webhook | webhook 2.1 | POST `fin/captura-buscar-bills`, responseNode, onError continue |
| 2 | 1 - Set secreto JWT | set 3.4 | `secret = {{ $env.FINANZAS_JWT_SECRET }}` |
| 3 | Validar JWT | code 2 | **Copia EXACTA** del de `sugerencias` (HMAC-SHA256 JS puro, gate `bancos:read`) |
| 4 | IF - JWT ok? | if 2.2 | `typeValidation:loose`; true→config, false→Respond 401 |
| 5 | Respond 401 | respondToWebhook 1.5 | `responseCode = {{ $json.http || 401 }}` |
| 6 | 2 - Code config | code 2 | parsea body → q/folio/proveedor/monto/monto_tol/companies/line_date/limit; flag `_empty_query` |
| 7a | 3 - Odoo bills 17+285 | odoo v1 | `account.move.line` getAll returnAll; filtros estructurales; credencial `Odoo FTS` (`Wansi69xesEqEiY1`), `alwaysOutputData:true`, **`customResource` lleno** |
| 7b | 4 - Code filtrar+map | code 2 | filtro texto/monto/company + days_diff + orden + corte a limit + shape candidato |
| 8 | Respond OK | respondToWebhook 1.5 | `{{ $json }}` |

Conexiones: Webhook→Set→ValidarJWT→IF; IF[true]→Config→Odoo→Filtrar→RespondOK; IF[false]→Respond401.

---

## 4. Quirks aplicables (no re-descubrir — CLAUDE.md §3/§16/§17)

- Operador **`in`** acepta value **array** vía expresión `={{ [17,285] }}` / `={{ ['in_invoice','in_refund'] }}` (pasa as-is al dominio Odoo). Tokens válidos: `equal`, `in`, `like`, `greaterOrEqual`, `lesserOrEqual` (NO `greaterThan`/`lessThan`).
- `fieldsList` = **ARRAY** (no CSV). `filterRequest` (no `filters`), `value` (no `fieldValue`).
- **`Always Output Data` = ON** en el nodo Odoo (OFF = fallo silencioso de todo el workflow).
- **`customResource`** debe quedar lleno (`account.move.line`). `n8n_create_workflow` con el field en el JSON al POST **lo preserva** (a diferencia del import-UI que lo blanquea). Verificar tras crear.
- **Signo:** para `in_invoice`, `amount_residual` es NEGATIVO (cuenta por pagar). El map usa **`abs(amount_residual)`** → `monto_bill` sale POSITIVO (igual que los candidatos del motor). No usar `amount_total_signed` crudo.
- **§17 — verificar `active` tras crear:** el workflow se crea **INACTIVO**. Read-back con `n8n_get_workflow` confirmando `active:false`. La activación la hace Esteban en la UI (el API rechaza activar por MCP). Ritual: Save · Active · refresh · **Timezone = America/Monterrey** (aunque este no tiene Schedule, mantener consistencia de instancia).

---

## 5. Seguridad / deuda heredada

- Sin HMAC de webhook (igual que el resto de `/fin/*`; el gate es el JWT). Read-only → superficie de riesgo baja (no escribe).
- `monto_tol` amplio + sin filtro de fecha = puede devolver un pool grande antes del corte; por eso el corte a `limit` con `truncated:true` (la UI avisa "hay más, afina la búsqueda").

---

## 6. Prueba end-to-end (sugerida)

1. **Bill abierto conocido de 285:** buscar `proveedor: "uber"` o `monto: 500` (el UBER de $500 abierto) → debe salir con `cuenta:285`, `bill_aml_id` real.
2. **Por folio:** `folio: "BILL2881"` (OXXO GAS $479.80 — aunque esté paid, valida el filtro de texto; un bill paid NO debe salir porque `reconciled=true` lo excluye → confirma el filtro estructural).
3. **Negativa:** sin filtros → `{resultados:[], _empty_query:true}` (no barre todo).
4. **Token inválido / sin scope** → 401/403 limpio.
5. **UI:** en una fila `sin-documento`, abrir acordeón → "¿No está el bill correcto? Búscalo" → buscar → elegir resultado → botón **Conciliar** (el existente) → receta con guards → Liquidado.

---
_Spec read-only. El workflow se crea inactivo; la UI degrada elegante si el endpoint no está activo ("buscador no disponible")._
