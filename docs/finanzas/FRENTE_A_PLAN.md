# Frente A — Rentabilidad por proyecto y por empresa

> **Estado:** DISEÑO (mapa completo, read-only). NO construido.
> **Fecha del deep-search:** 2026-06-16 (Odoo `serviciosfts.odoo.com`).
> **Objetivo de Esteban:** que al confirmar la SO se construya TODA la estructura analítica, que POs y Bills descuenten del presupuesto automáticamente, y que al final haya **rentabilidad por proyecto Y por empresa**.
> **Relacionado:** [`FRENTE_B_BLOQUEO_GASTOS.md`](FRENTE_B_BLOQUEO_GASTOS.md) (control de gastos/cierre), [`AUTOMATIZACION_PROYECTOS.md`](AUTOMATIZACION_PROYECTOS.md) (creación de proyecto al confirmar SO), `CLAUDE.md §17`.

---

## 0. Resumen ejecutivo — dónde está rota la cadena

La cadena `SO → estructura analítica → PO/Bill → analytic.line → budget → rentabilidad` está rota en **tres puntos independientes**, no uno:

| # | Rotura | Efecto | Naturaleza |
|---|--------|--------|------------|
| **R1** | Al confirmar la SO **NO se crea el budget** (solo proyecto + cuenta analítica) | No hay presupuesto contra el cual descontar | Falta de automatización |
| **R2** | Captura de gastos en clave **SEPARADA** `{"3034":100,"1176":100}` en vez de **COMPUESTA** `{"3034,1176":100}` | El budget 2-ejes nunca ve el consumo (`achieved`/`committed`=0) | Mecánica del widget + `distribution.model` #46 + GL `601.84.01` |
| **R3** | Mala atribución de proyecto: gastos misceláneos caen en un proyecto **catch-all** (3034 = SO11547 Topo Chico) o sin proyecto (`{"1176":100}` solo) | La rentabilidad por proyecto nativa **subcuenta** o ensucia proyectos ajenos | Captura manual sin obligatoriedad |

**Clave que cambia el diseño — R2 y R3 tienen causas distintas y rompen cosas distintas:**

- La **rentabilidad por proyecto NATIVA** (panel Odoo `_get_profitability_items`, lee por `account_id` del proyecto) **SÍ funciona** con claves separadas — solo necesita que el eje proyecto esté bien puesto. La rompe **R3** (misatribución), NO R2.
- El **budget 2-ejes** (`budget.line` proyecto×rubro) **SÍ lo rompe R2** — necesita clave compuesta.

⇒ "Rentabilidad por proyecto" y "control de presupuesto" se pueden atacar **por separado** y en ese orden.

---

## 1. El modelo analítico completo (cómo encajan las piezas)

### 1.1 Inventario real de planes (`account.analytic.plan`) — 17 planes, **TODOS `optional`**

| Plan | id | Eje que representa | # cuentas |
|------|----|--------------------|-----------|
| **Gasto Directo a proyectos** | **1** | 🟦 PROYECTO (MX) | **89** |
| **Gasto directo a proyectos USA** | **18** | 🟦 PROYECTO (USA) | 5 |
| **Upgraded Budget Plan** | **20** | 🟥 RUBRO (Ingreso / MO / Materiales / Comisiones / Utilidad) | 28 |
| Gasto Indirecto en FTS | 2 | 🟨 CENTRO DE COSTO indirecto (RH, Gasolina, Oficina) | 31 |
| Assets / Combustible / Inmuebles / Flota / … | 5,8,11,13… | otros (no-proyecto) | ~200 |

> ⚠️ **Ningún plan es obligatorio.** Las **144 reglas** de `account.analytic.applicability` están **todas en `optional`** para todos los dominios (`bill`, `purchase_order`, `sale_order`, `invoice`, `expense`). Por eso un gasto puede capturarse **sin nada de analítica** y Odoo no lo impide. **Habilitador raíz de R1/R3.**

### 1.2 Los rubros del plan 20 (eje RUBRO) — 28 cuentas

Estructura financiera del proyecto:
- `1171` **1. Ingreso Untaxed Amount** (+)
- `1177` **2.1 Mano de Obra** (−)
- `1176` **2.2 Materiales** (−)
- `1170` **3. Comisiones FTS interno** + sub `3.1`–`3.5` (Aldo, Rissia, Diego, Luis Ángel, Montalvo, Ricardo)
- `1159/1160` **4.1/4.2 Bonos** (Supervisores / Técnicos)
- `1173` **5. Comisiones Clientes externo** + sub `5.x` (Budenheim, Clarios, GEPP, Magnekon, Nalco, COE, Bridgestone…)
- `1153` **Utilidad** (+), `1154` Materiales, `1155` Combustible

### 1.3 Los dos ejes que importan para rentabilidad

```
        EJE PROYECTO (plan 1 MX / 18 USA)          EJE RUBRO (plan 20)
        ───────────────────────────────           ──────────────────────
        cuenta 475 = "SO6013 Budenheim"      ×     1171 Ingreso
        cuenta 479 = "Clarios"                     1177 Mano de Obra
        cuenta 576 = "SO9428 Vertiv"               1176 Materiales
        cuenta 3034= "SO11547 Topo Chico"          1153 Utilidad
        ... (89 MX + 5 USA)                        1170 / 5.x Comisiones
                                                   ... (28 rubros)
```

El plan **2 (indirecto)** es un TERCER eje legítimo para gasto NO atribuible a proyecto (centros de costo: `478` RH, `509` Gasolina, `636` Oficina). No confundir con proyecto.

### 1.4 Diagrama conceptual del flujo (+ dónde se rompe)

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  SO confirmada                                                            │
  │  workflow XhuTlvPKDBjkDeso → crea project.project + account.analytic      │
  │  .account (plan 1/18)   ✅ HOY SÍ                                          │
  │  ───────────────────────────────────────────────────────────────────────│
  │  ❌ R1: NO crea budget.analytic ni budget.line por rubro                  │
  └─────────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴───────────────────┐
            ▼                                      ▼
  ┌───────────────────┐                  ┌──────────────────────┐
  │ purchase.order    │                  │ (gasto directo Bill  │
  │ .line             │                  │  sin PO)             │
  │ analytic =        │                  │                      │
  │ {"576":100}       │                  │                      │
  │ 🟦 SOLO proyecto, │                  │                      │
  │ SIN rubro         │                  │                      │
  └─────────┬─────────┘                  └──────────┬───────────┘
            │ PO→Bill propaga {"576":100}           │
            ▼                                        ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  account.move.line (Bill, GL 601.84.01 "Otros gastos generales", acc 32) │
  │  ───────────────────────────────────────────────────────────────────────│
  │  ⚙️ account.analytic.distribution.model #46:                             │
  │     account_prefix "601.84.01"  →  AÑADE  {"1176":100}  como GRUPO APARTE │
  │  ───────────────────────────────────────────────────────────────────────│
  │  Resultado: {"576":100, "1176":100}   ❌ R2: SEPARADA, nunca compuesta    │
  └─────────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴───────────────────┐
            ▼                                      ▼
  account.analytic.line #A              account.analytic.line #B
  account_id=576 (proyecto)             plan20=1176 (rubro)
  plan20 = (vacío)                      account_id=(vacío)
            │                                      │
            ▼                                      ▼
  ┌──────────────────────────┐        ┌──────────────────────────────────────┐
  │ RENTABILIDAD PROYECTO     │        │ BUDGET 2-EJES (budget.line)          │
  │ panel nativo lee por      │        │ achieved = analytic.lines con        │
  │ account_id=576            │        │ account_id=576 AND plan20=1176        │
  │ ✅ SÍ ve la línea #A       │        │ ❌ NINGUNA línea tiene AMBOS →        │
  │ (si proyecto correcto)    │        │ achieved=0, committed=0 (R2)         │
  └──────────────────────────┘        └──────────────────────────────────────┘
```

---

## 2. Qué se crea hoy al confirmar la SO vs qué falta (R1)

### 2.1 Hoy (workflow `XhuTlvPKDBjkDeso`)
✅ `project.project` + `account.analytic.account` (plan 1 MX / 18 USA) + link nativo `sale.order.project_id` + dual-write custom. Ver `AUTOMATIZACION_PROYECTOS.md`.

### 2.2 Lo que FALTA crear (R1) — estructura completa que debería quedar lista

```
sale.order (confirmada)
  └─ project.project                              ✅ ya
       └─ account.analytic.account (plan 1/18)    ✅ ya  ← eje PROYECTO
       └─ budget.analytic (cabecera)              ❌ FALTA
            ├─ company_id, date_from, date_to (de la SO)
            └─ budget.line × rubro (plan 20):     ❌ FALTAN
                 ├─ account_id=<cuenta proy> · x_plan20_id=1171 Ingreso    = +monto SO
                 ├─ account_id=<cuenta proy> · x_plan20_id=1177 Mano Obra  = −estimado
                 ├─ account_id=<cuenta proy> · x_plan20_id=1176 Materiales = −estimado
                 ├─ account_id=<cuenta proy> · x_plan20_id=1173 Comisiones = −estimado
                 └─ account_id=<cuenta proy> · x_plan20_id=1153 Utilidad   = +objetivo
```

**Estructura de `budget.line` (verificada en datos):**
- `account_id` = cuenta analítica del **PROYECTO** (plan 1/18). En budgets viejos viene `false` (sin eje proyecto → inútil para P&L por proyecto).
- `x_plan20_id` = campo **Studio** que materializa el eje **RUBRO** (plan 20).
- `budget_amount` (stored) + `achieved_amount` / `committed_amount` / `theoritical_amount` (computed).

**Convención de signo confirmada en datos reales:** costos **negativos** (Materiales −1,000,000), ingreso/utilidad **positivos** (Utilidad +3,000,000).

### 2.3 Estado actual de los budgets (por qué no sirven hoy)
- **123 budgets** (97 confirmed, 24 draft, 2 done), **749 budget.lines** — todos **creados a mano**, esporádicos, históricos ("Budget SO8183", "SO6013 Budget"…).
- **Muchos con `account_id = false`** (los SO8183) → solo rubro, **sin eje proyecto** → presupuesto global de rubro, inútil para rentabilidad por proyecto.
- Los nuevos (SO11507, SO11516, SO6013) sí traen proyecto → patrón correcto a replicar.
- `achieved`/`committed` casi siempre 0; **SO6013 capturó $93k de $3.7M (~2.5%)** = prueba viva de que solo lo poco que entró **compuesto** se descuenta.

---

## 3. La fuga R2 — por qué se captura SEPARADA y no COMPUESTA ⭐

**Mecanismo exacto, confirmado en datos:**

1. **Todas las Bills** se postean al GL **`601.84.01` "Otros gastos generales"** (account 32). Verificado: 25/25 líneas usan esa cuenta.
2. Existe la regla **`account.analytic.distribution.model` #46**: `account_prefix "601.84.01" → {"1176":100}`. Al postear, Odoo **inyecta automáticamente el rubro 1176 (Materiales) como su PROPIO grupo** de distribución.
3. El **eje proyecto** llega por **otra vía y en otro momento**: propagado desde la PO (`{"576":100}`) o tecleado a mano. Es un **grupo distinto**.
4. Dos grupos que llegan de dos fuentes ≠ se fusionan jamás → resultado **siempre separado**: `{"576":100,"1176":100}`.

> **Las 53 `account.analytic.distribution.model` son todas prefijo-GL → un solo rubro plan-20** (`601.84.01`→1176, `2023.34`→1177, `2023.51`→comisiones 5.x, etc.). El rubro está **automatizado** (bien), pero como **grupo aparte** → **garantiza la separación**.

**Patrones reales observados en `account.move.line` (in_invoice posted):**
- `{"1176":100,"3034":100}` — separada proyecto+rubro (lo más común) → budget no la ve
- `{"576":100,"1176":100}` / `{"509":100,"1176":100}` — separada (proyecto o indirecto + rubro)
- `{"3034":100}` — solo proyecto, rubro faltante
- `{"1176":100}` — solo rubro, **sin proyecto**
- **0 compuestas** `{"3034,1176":100}` en la muestra

**Respuestas directas:**
- **¿Por qué separada?** El rubro lo pone una *regla automática por cuenta GL* como grupo propio; el proyecto viene de la PO/manual como otro grupo. El widget solo produce **compuesta** cuando en **una misma fila** eliges proyecto Y rubro a la vez — cosa que aquí nunca pasa porque el rubro se auto-rellena solo.
- **¿Se puede forzar compuesta desde captura?** Sí, pero requiere cambiar el mecanismo: que proyecto y rubro entren **en el mismo grupo** (ver Fase A2).
- **¿La SO/PO propagan su distribución a la Bill?** La **PO sí** propaga su `{proyecto}` a la Bill. La **SO NO** propaga a la Bill de proveedor (la SO solo propaga a la factura de **cliente** `out_invoice`). Y aunque la PO trajera compuesto, el `distribution.model` **encima** le añade el rubro como grupo aparte → re-separa.

### 3.1 R3 — el catch-all 3034 (distinto de R2)
- **3034 = SO11547 Topo Chico**, un **proyecto REAL usado como catch-all**: gastos chicos (UBER, garrafones, café, gas lens) se le cuelgan masivamente.
- 478/509/636 son **plan 2 (centros de costo indirectos:** RH, Gasolina, Oficina) — esos sí son legítimamente no-proyecto.
- La mezcla **proyecto-real-catch-all + indirectos + sin-proyecto** es lo que distorsiona la rentabilidad por proyecto (Clarios solo vio ~$79k de costos cuando debería ser millones).

---

## 4. Purchase → cómo descontaría del presupuesto

- `purchase.order.line` **sí tiene** `analytic_distribution`, pero con **solo el eje proyecto** (`{"576":100}`, `{"3034":100}`) — **sin rubro**.
- **PO confirmada → `committed_amount`:** descuenta del budget **solo si la línea casa proyecto×rubro**. Como la PO no trae rubro, **no casa el budget 2-ejes** → el compromiso también se fuga (mismo R2, un paso antes).
- **PO → Bill → `achieved_amount`:** la Bill hereda el proyecto de la PO, el `distribution.model` le añade el rubro **separado** → tampoco casa. (Por eso en SO6013 `committed == achieved == −93,841`: ambos vienen solo del poco que entró compuesto.)
- **Conclusión:** el flujo PO→Bill se rompe en el **mismo punto** que las Bills directas. **Arreglar R2 arregla `committed` y `achieved` de un golpe.**

---

## 5. Rentabilidad — qué es viable

### 5.1 Por PROYECTO
- **Panel nativo `_get_profitability_items`** lee `account.analytic.line` por el **`account_id` del proyecto** → cuenta **cualquier** línea con el proyecto correcto, **separada o compuesta**. **Funciona hoy**, salvo por **R3**: lo que esté mal atribuido (3034 catch-all, sin proyecto, o en indirecto) no aparece o ensucia. Distorsión tipo Clarios = costos que nunca tocaron la cuenta 479.
- **Viable sin custom.** Mejora = arreglar atribución de proyecto en captura (R3) + opcionalmente leerlo desde el módulo Finanzas con criterio propio.

### 5.2 Por EMPRESA
- `company_id` vive en `account.analytic.account`, en `account.move`, y en `project.project`. **No hay vista nativa "rentabilidad consolidada por empresa"** rollup de proyectos.
- **Viable sin módulo custom:** agregar en el **frontend Finanzas / n8n** — `account.analytic.line` agrupado por `company_id` (o sumar proyectos por su `company_id`). Mismo patrón que ya usas en `facturas-odoo`/`bills-odoo` (multi-company {1,6}). Los módulos `rent-emp` y `rent-proy` ya están **reservados en el manifest** (bloque B2, status `empty`).

---

## 6. Plan general del Frente A — en fases

| Fase | Objetivo | Qué toca | Depende de |
|------|----------|----------|------------|
| **A0 — Diagnóstico de captura** (read-only) | Cuantificar la fuga: % de analytic.lines compuestas vs separadas vs sin-proyecto; cuánto cae en 3034 catch-all; cuántos proyectos abiertos tienen budget | Solo lectura Odoo | — |
| **A1 — Estructura al confirmar SO** (ataca R1) | Extender `XhuTlvPKDBjkDeso` para crear `budget.analytic` + `budget.line` por rubro (montos estimados de las líneas de la SO o plantilla) | n8n + Odoo write | A0 |
| **A2 — Captura compuesta** (ataca R2) | Forzar que proyecto+rubro entren en **un mismo grupo**. Opciones: **(a)** volver `mandatory` plan 1/18 **y** plan 20 en applicability `bill`/`purchase_order` + capacitar a capturar en misma fila; **(b)** `distribution.model` que entregue clave compuesta; **(c)** workflow n8n "reparador" que post-proceso fusione `{proj}+{rubro}` → `{proj,rubro}` en move.line | Config Odoo + posible n8n | independiente de A1 |
| **A3 — Atribución de proyecto** (ataca R3) | Eliminar el catch-all 3034; obligar selección de proyecto real en PO/Bill; separar indirectos (plan 2) de proyectos (plan 1) | Config + capacitación + validación | independiente |
| **A4 — Rentabilidad por proyecto** | Panel en Finanzas (`rent-proy`) leyendo profitability/analytic por `account_id`; contrasta budget vs achieved vs committed | Frontend + n8n `/fin/*` | A1+A2 para budget; parcial con solo A3 |
| **A5 — Rentabilidad por empresa** | Rollup `rent-emp` agregando proyectos por `company_id` (MX/USA), consolidado MXN | Frontend + n8n | A4 |

**Orden recomendado (ACTUALIZADO tras A0 — ver §8):** A0 ✅ → **A3 PRIMERO** (la fuga grande es de atribución, no de compuesto) → A2 (refinamiento, ya 88% compuesto cuando hay proyecto) → A1 (poblar montos reales en el budget) → A4 → A5.

### 6.1 Decisión grande pendiente (de Esteban, NO resoluble solo)
El camino de **A2**: ¿`mandatory` + capacitación (cambia el hábito de captura, **cero código**) **vs** workflow reparador n8n (no cambia hábito, mantiene repintado automático)? Esa elección define casi todo el Frente A. **A0 baja la urgencia de A2** (ver §8).

---

## 7. Datos de referencia (snapshot 2026-06-16)

- Planes con cuentas: plan 1 (89 proyectos MX), plan 18 (5 USA), plan 20 (28 rubros), plan 2 (31 indirectos), Assets 145, Combustible 23, Inmuebles 29.
- `account.analytic.applicability`: 144 reglas, **todas `optional`**.
- `account.analytic.distribution.model`: 53 reglas prefijo-GL → 1 rubro plan-20.
- Bills: GL único `601.84.01` (acc 32) en el 100% de la muestra.
- Budgets: 123 (`97 confirmed / 24 draft / 2 done`), 749 budget.lines, muchos `account_id=false`.
- Catch-all: `3034 = SO11547 Topo Chico` (proyecto real, plan 1).
- Indirectos vistos: `478 RH`, `509 Gasolina`, `636 Oficina` (plan 2).

---

## 8. A0 — Diagnóstico cuantitativo (read-only, 2026-06-16)

> Universo medido: **gastos de proveedor** (`account.move.line`, `in_invoice`+`in_refund`, `parent_state=posted`, `display_type=product`), **últimos 12 meses** (`date >= 2025-06-16`). Clasificación por forma de `analytic_distribution` vía el operador `'in'` (verificado: **SÍ** matchea claves compuestas `{"3034,1176":100}`) + corte de "compuesto" leído de `account.analytic.line` con **ambos ejes** (`account_id` proyecto **y** `x_plan20_id` rubro) poblados.
>
> ⚠️ El $ de magnitud viene de `move.line` (`display_type=product`); NO de `analytic.line`, que duplica por las líneas de IVA/base (`category:"other"`).

### 8.1 Tamaño de cada fuga — empresa 1 (FTS MX), 12 meses

**Universo: 3,757 líneas / $40,860,390 MXN.** (YIN co.4: 208 / $1.23M · USA co.6: 27 / $83.8k — marginales, foco MX.)

| Bucket | # líneas | $ MXN | % del $ |
|--------|---------:|------:|--------:|
| **Atribuido a PROYECTO** (plan 1/18) | 1,750 | **$8,766,068** | **21.5 %** |
| — de ello **COMPUESTO** (visible al budget 2-ejes) | ~1,414 | **$7,717,510** | 18.9 % |
| — de ello **separado / solo-proyecto** (ciego al budget) | ~336 | **~$1,048,558** | 2.6 % |
| **Indirecto** (plan 2: RH, gasolina, oficina) — legítimo no-proyecto | 994 | $7,269,424 | 17.8 % |
| **SOLO-RUBRO** (rubro sin proyecto ni centro de costo) | ~816 | **~$24,059,944** | **58.9 %** |
| **Sin analítica** | 191 | $534,723 | 1.3 % |

**Lectura:**
1. **R2 (separado vs compuesto) es la fuga CHICA.** Cuando el gasto SÍ llega a un proyecto, el **88 % por $ ya es compuesto** (lo ve el budget). El separado real es **~$1.05M/12m (2.6 % del gasto)**.
2. **La fuga GRANDE es de ATRIBUCIÓN (R3-extendido):** solo el **21.5 %** del gasto toca un proyecto. **$24M (59 %) flota como SOLO-RUBRO** — etiquetado "Materiales/Mano de Obra" pero **sin proyecto** → invisible para rentabilidad por proyecto **y** para budget. (Avg ~$29.5k/línea: las compras grandes son las que se van sin proyecto.)
3. **Catch-all 3034 (SO11547 Topo Chico):** 479 líneas / **$1,600,083** (3.9 % del total, **18 % de todo lo atribuido a proyecto**) — un proyecto real absorbiendo gasto misceláneo (UBER, garrafones, café).

> **Reframe clave:** el "99 % de fuga analítica" que documentaba Frente B estaba **mal diagnosticado en el mecanismo**. No es compuesto-vs-separado (eso es 2.6 %). Es que **el 59 % del gasto nunca recibe proyecto**.

### 8.2 R1 — Cobertura de budget en proyectos activos

- **177 proyectos activos** (company 1+6).
- **~90 cuentas de proyecto tienen `budget.line` con eje proyecto** — PERO los **recién auto-creados son ESQUELETOS placeholder**: solo `Ingreso` poblado (= monto SO), y **todos los rubros de costo en `budget_amount = −1`** (ej. SO11631, SO11644). Estructura sí, estimados reales no.
- **Budgets poblados de verdad:** un puñado, hechos a mano (576 Vertiv, 454, 475 Budenheim, 3034 Topo Chico…).
- **Clarios SO7207 (479):** budget = placeholder (`Materiales budget_amount = 1`).
- Incluso el **mejor trackeado (576 Vertiv 2da):** `Materiales` achieved **−$2.48M** vs budget **−$7.25M** con el proyecto ~90 % facturado (ingreso achieved $14.39M / budget $15.92M) → **sub-captura ~$4.7M** aun en el caso estrella.

⇒ **R1 no es "falta estructura"** (el esqueleto se crea), sino **(a)** los costos del esqueleto son `−1` placeholder y **(b)** el lado `achieved` lo mata la atribución.

### 8.3 Impacto en rentabilidad — top proyectos activos (todo el histórico)

Ingreso atribuido (`out_invoice` analítico) vs costo atribuido (`in_invoice` analítico), por cuenta de proyecto:

| Proyecto | Ingreso atribuido | Costo atribuido | Costo / Ingreso | Veredicto |
|----------|------------------:|----------------:|----------------:|-----------|
| SO9428 Vertiv 2da (576) | $14,388,235 | $3,156,240 | 22 % | margen ~78 % implausible |
| SO10344 Budenheim ergo (662) | $6,463,038 | $2,075,484 | 32 % | bajo |
| **SO5995 Vertiv f1 (454)** | $5,363,729 | **$64,475** | **1.2 %** | ⚠️ patrón Clarios |
| SO10977 Mezanine (834) | $1,960,981 | $502,171 | 26 % | bajo |
| **SO10300 Techo Magnekon (668)** | $1,581,500 | **$79,623** | **5 %** | ⚠️ patrón Clarios |
| SO11471 Budenheim (1089) | $930,694 | $212,702 | 23 % | bajo |
| **SO11261 Magnekon flujo (960)** | $725,160 | **$0** | **0 %** | ⚠️ extremo |
| SO10702 Panduit (737) | $656,689 | $231,910 | 35 % | el más creíble |
| SO9137 refacc. L6 (554) | $545,326 | $98,825 | 18 % | bajo |
| **SO9181 base tanques (577)** | $414,153 | **$0** | **0 %** | ⚠️ extremo |
| SO10821 extractores (751) | $402,960 | $109,435 | 27 % | bajo |

**Q4 — ¿es creíble la rentabilidad por proyecto hoy? NO.** Para EPC/instalación industrial el costo esperado es **60–80 %** del ingreso (margen bruto 20–40 %). **TODOS** los proyectos arriba muestran costo **0–35 %** (margen aparente 65–100 %) → **sub-captura sistemática de costo**. El panel nativo infla utilidad en todos los proyectos.

**Q5 — ¿cuántos con patrón "Clarios" (ingreso ≫ costo)? Es la NORMA, no la excepción.** De ~35 proyectos con ingreso, prácticamente todos caen por debajo del 40 % de costo; **≥8 con costo ≈ 0** (454, 668, 960, 577, 832, 846, 1132, 825). El costo perdido se va al bucket SOLO-RUBRO (§8.1) o al catch-all 3034.

### 8.4 Q6 — Decisión: ¿R2 o R3? Recomendación de prioridad

| | **R2 (separado→compuesto)** | **R3 (atribución de proyecto)** |
|--|------------------------------|----------------------------------|
| $ en juego (12m) | ~$1.05M (2.6 %) | ~$24M solo-rubro (59 %) + $1.6M catch-all |
| Qué rompe | budget 2-ejes (parcial) | rentabilidad por proyecto **Y** budget (total) |
| Estado base | ya **88 % compuesto** cuando hay proyecto | solo **21.5 %** del gasto llega a proyecto |
| Costo de arreglar | config/widget/repair n8n | **mandatory + capacitación + matar catch-all** (cambio de hábito) |

**Recomendación: A3 (atribución) es la prioridad #1, con amplio margen.** R3 pierde ~20× más dinero y visibilidad que R2, y rompe ambas mitades (rentabilidad y budget). R2 es refinamiento secundario: una vez que el gasto llega al proyecto, el 88 % ya entra compuesto solo — así que **A2 deja de ser bloqueante** y puede ir después de A3. La secuencia eficiente:

1. **A3** — forzar proyecto en Bill/PO (applicability `mandatory` para plan 1/18 en `bill`+`purchase_order`), matar el uso de 3034 como catch-all, separar indirectos. Aquí está el 59 %.
2. **A2** — asegurar compuesto (cerrar el 12 % residual) una vez que el volumen de atribución sube.
3. **A1** — reemplazar los placeholders `−1` del esqueleto de budget por estimados reales (de las líneas de la SO / costeo).
4. **A4 / A5** — paneles de rentabilidad (ya con datos creíbles).

> **Matiz para A3:** como `distribution.model` inyecta el rubro en grupo aparte, forzar el proyecto NO garantiza compuesto por sí solo. Pero el dato muestra que cuando el operador SÍ atribuye proyecto, el 88 % entra compuesto (lo teclean en la misma fila). El cuello no es el mecanismo — es que **el 59 % del gasto ni siquiera intenta atribuir proyecto**.

### 8.5 Notas de método / límites
- 'in' sobre `analytic_distribution` **matchea compuesto** (probado con move.line 191567 `{"3034,1176":100}`). El doble-`'in'` ANDeado (proyecto **y** rubro en un solo dominio) devuelve vacío por un quirk jsonb de esta instancia → el corte de "compuesto" se tomó de `analytic.line` ambos-ejes, no de ese dominio.
- `budget.line.achieved` respeta el rango de fechas del budget → NO sirve como medida limpia de "% compuesto" por proyecto (ej. 3034 muestra achieved $14.5k pese a tener compuesto real; es recorte de fechas del budget, no falta de compuesto).
- Buckets de §8.1 disjuntos verificado: proyecto∩indirecto ≈ 0 (2,744 vs 2,745 en el OR). Suma de buckets ≈ universo (✓).

---

## 9. A3 — Diseño del mandatory (proyecto obligatorio en captura) · read-only 2026-06-16

> Decisión tomada: **forzar atribución obligatoria en captura**. Esta sección es el diseño; **nada construido**. Aterriza el mecanismo Odoo 19 real (`account.analytic.applicability`) + el plan de transición.

### 9.0 Cómo funciona el `mandatory` en Odoo 19 (mecánica real)

- La obligatoriedad vive en **`account.analytic.applicability`**, filas con: `analytic_plan_id`, `business_domain` (`bill`, `purchase_order`, `invoice`, `sale_order`, `expense`, `general`), `applicability` (`optional`/`mandatory`/`unavailable`), **`company_id`**, **`account_prefix`** (prefijo de cuenta GL) y **`product_categ_id`**. ⇒ el mandatory se puede **acotar por empresa, por prefijo de cuenta contable y por categoría de producto** (granularidad fina, clave para el rollout).
- **Se evalúa al POSTEAR** (`action_post`), NO al guardar borrador. Un borrador sin proyecto se puede guardar; **falla al postear**. (Esto define la transición — §9.5.)
- **`mandatory` es POR PLAN, independiente.** Si pones plan 1 *y* plan 2 mandatory → exige AMBOS (no "uno u otro"). Si pones solo plan 1 mandatory → **bloquea los indirectos legítimos** ($7.27M que NO van a proyecto). Ese es el problema de diseño central.
- `plan 1` es **root plano**: 89 cuentas, `children_count: 0`, `parent_id: false`. (Idem plan 2 = 31, plan 18 = 5.)

### 9.1 El mandatory correcto — "proyecto **O** centro de costo, pero ALGO" (R1 del problema)

Odoo **no soporta nativamente "uno de varios planes"**. Tres caminos:

| Opción | Cómo | Riesgo | Veredicto |
|--------|------|--------|-----------|
| **C — bucket NO-PROYECTO en plan 1** ⭐ | Crear UNA cuenta analítica en plan 1: **`NO-PROYECTO / Gasto indirecto`**. Hacer **plan 1 mandatory** (bill, company 1). El operador elige **proyecto real O `NO-PROYECTO`** → siempre hay decisión explícita. El centro de costo plan 2 se añade opcional como sub-clasificación. | **Bajo** — 1 cuenta nueva, cero re-estructura, cero migración. Pequeña "contaminación" del eje proyecto con 1 cuenta explícita (fácil de excluir en reportes). | **RECOMENDADO** |
| **B — plan padre "Atribución"** | Crear root nuevo "Atribución"; re-parentar plan 1 + 18 + 2 como hijos. Mandatory en el padre = satisface cualquier hijo (proyecto MX/USA o indirecto). | **Alto** — re-parentar plan 1 cambia el `root_id` de sus cuentas → afecta las **columnas de `analytic.line`** y el **eje proyecto del budget** (`account_id`). Migración de datos delicada. | Conceptualmente limpio, **demasiado invasivo ahora** |
| **A — fusionar plan 2 en plan 1** | Mover las 31 cuentas indirectas a plan 1. Mandatory en plan 1. | Medio-alto — mezcla proyectos y centros de costo en un mismo eje; ensucia budget/profitability por plan 1; rompe reportes que separan plan1/plan2. | No |

**Recomendación: Opción C.** Da el "uno u otro" con una sola cuenta nueva y sin tocar la estructura analítica existente. El bucket `NO-PROYECTO` además se vuelve un **KPI visible** (cuánto gasto es legítimamente no-proyecto vs cuánto se está "escondiendo" ahí).

### 9.2 Dónde forzarlo — Bill primero, PO después

- **Bill = el gate obligatorio (must-have).** Es la última compuerta antes de postear, la controla el equipo de Gera, y **cubre TODO**: bills derivadas de PO + las **bills directas sin PO** (que hoy son la mayoría del gasto misceláneo).
- **PO = fase 2 (opcional, aguas arriba).** Verificado en A0: la **PO propaga su `analytic_distribution` a la Bill** (`{"576":100}` PO → Bill). Si la PO trae proyecto, la Bill lo hereda y satisface el mandatory sola. Pero PO-mandatory mete fricción al equipo de compras (otro equipo) → mejor después de estabilizar Bill.
- **Plan 18 (USA, company 6):** mismo patrón cuando se extienda a esa empresa (fase posterior).

### 9.3 ⚠️ Riesgo de atribución basura (re-Topo-Chico) y mitigaciones

El peligro real: con mandatory, la gente teclea "cualquier proyecto" para destrabarse. Mitigaciones (en capas):

1. **El bucket `NO-PROYECTO` es la válvula de escape legítima** → reduce el incentivo de inventar proyecto (hay una opción honesta para "no es de proyecto").
2. **Lista de proyectos manejable vía Frente B.** El archivado de `project/archive-budget-cierre` (Frente B, ya en producción) **saca las cuentas cerradas del selector** (solo aparecen activas). Sinergia directa: mantener limpio el set activo achica el picker de ~177 a los realmente vivos.
3. **Detective n8n (extender `fin/detect-gasto-cierre`).** Vigilar dos señales: (a) volumen del bucket `NO-PROYECTO` (esperado ~18%; si se dispara = la gente esconde gasto ahí), (b) **gasto anómalo a un proyecto** (bill grande a un proyecto viejo/casi-cerrado = el nuevo Topo Chico) → correo a Gera/Esteban. No bloquea; detecta el abuso temprano.
4. **Capacitación con el "por qué"** (§9.5): el operador entiende que un proyecto mal puesto rompe la rentabilidad — no es burocracia.

### 9.4 Matar el catch-all 3034 (Topo Chico)

- **3034 no es un default técnico** — no aparece en ninguna `distribution.model`. Es **hábito**: los operadores eligen el proyecto estrella activo para gasto misceláneo. Lo mata: (a) el mandatory **fuerza decisión consciente**, (b) el bucket `NO-PROYECTO` les da a dónde mandar lo no-atribuible, (c) el detective vigila que 3034 deje de recibir UBER/café/garrafones.
- **¿A dónde DEBE ir el gasto misceláneo?** A **centros de costo indirectos reales (plan 2)**, que YA existen y son adecuados: `636 Oficina/Taller`, `744 Seguridad EPP`, `509 Gasolina`, `308 Mantenimiento carros`, `828 Estacionamiento`, `632 Caja de herramientas`, `619 Servicios FTS`, `604 Nóminas`, `296 Honorarios`. Consumibles de obra realmente compartidos → al proyecto donde se consumen, o a un centro "consumibles taller"; **no se prorratean** (complejidad innecesaria por ahora).

### 9.5 ⚠️ Transición (lo más delicado) — rollout por etapas

Datos que la facilitan: **applicability tiene `company_id`** → se puede activar **MX (company 1) primero**, USA después. Y el **backlog de borradores es trivial: 31 bills / $301k** (company 1) → limpiar antes del flip es cuestión de minutos.

**Secuencia propuesta (sin paralizar a Gera):**
1. **Preparar** (read/write mínima): crear cuenta `NO-PROYECTO` en plan 1 + dejar `applicability` en **`optional`** todavía. Capacitación corta al equipo de Gera (el "por qué" + cómo elegir proyecto/NO-PROYECTO).
2. **Fase blanda (2–4 semanas):** detective n8n alerta sobre bills posteadas **sin atribución** (NO bloquea). Se corrige el hábito con datos reales, se mide cuánto caería en `NO-PROYECTO`.
3. **Limpiar backlog:** revisar los ~31 borradores sin proyecto (reporte) + cualquier pendiente, atribuirlos.
4. **Flip Bill mandatory (company 1):** cambiar `applicability` de plan 1 a **`mandatory`** para `business_domain=bill`, `company_id=1`. (Opcional acotar con `account_prefix`/`product_categ` si se quiere arrancar con un subconjunto — ej. solo cuentas de costo de obra — antes de todo el gasto.)
5. **Estabilizar → extender:** PO mandatory (fase 2) + company 6 USA (plan 18).

**Prueba en subconjunto antes de global:** sí — usar `account_prefix` y/o `product_categ_id` en la fila de applicability para que el mandatory aplique primero a un grupo acotado de cuentas/categorías, y ampliar. Es la palanca nativa para un piloto.

**Qué pasa con los borradores actuales sin proyecto:** se guardan, pero **fallan al postear** tras el flip → por eso el paso 3 (limpiar los 31) va ANTES del paso 4.

### 9.6 Análisis del $24.6M sin proyecto (qué es, ¿recuperable?)

Medido (company 1, 12m, gasto sin proyecto **y** sin centro de costo): **963 líneas / $24,634,135**, el **99% en una sola cuenta GL `601.84.01 "Otros gastos generales"`** (un solo cajón contable absorbe casi todo lo no-atribuido).

**Top proveedores del gasto no-atribuido** (revela el hábito y guía la capacitación):

| Proveedor | $ | # | Naturaleza probable |
|-----------|--:|--:|---------------------|
| ELECTRICIDAD Y CONSTRUCCION DEL BOSQUE | $3.28M | 6 | 🔧 **Subcontratista** → costo de PROYECTO |
| SERVICIOS ADMINISTRATIVOS PAYCO | $2.54M | 2 | Nómina/admin → indirecto (o MO de proyecto) |
| INSTALADORES ELECTRICOS ESP. EN CLIMAS | $2.50M | 5 | 🔧 **Subcontratista** → PROYECTO |
| MAX IMPRESIÓN | $2.33M | 8 | ambiguo (revisar) |
| EXPERTOS ASESORIA FISCAL Y CONTABLE | $2.23M | 7 | 🏢 Contabilidad → **indirecto** (296 Honorarios) |
| INSTALADORES ELECTRICOS | $1.67M | 4 | 🔧 **Subcontratista** → PROYECTO |
| ROSA MARIA CALDERON DIMAS | $1.09M | 1 | persona (renta?) revisar |
| RTE DE MEXICO | $0.95M | 1 | revisar |
| JULIO CESAR RAMIREZ | $0.88M | 3 | 🔧 subcontratista persona → PROYECTO |
| EXPERTOS ELECTRICOS Y COMERCIALIZADORES | $0.84M | 2 | 🔧 materiales/subcontrato → PROYECTO |
| Toyota Lindavista / GNP Seguros / Santander | $1.0M | varios | 🏢 vehículos/seguros/banco → **indirecto** |

**Hallazgo clave:** el grueso del $24.6M es **mano de obra subcontratada de instalación/construcción eléctrica** — la categoría de costo MÁS grande de un EPC, y la que típicamente entra como **una sola bill grande que nadie atribuye**. Por eso TODO proyecto se ve demasiado rentable (el costo más grande es justo el que se fuga). El resto (~$5–7M) es overhead real (contabilidad, seguros, banco, vehículos, nómina) que debe ir a **plan 2**.

**¿Recuperable retroactivamente?** **Sí, y es tratable:** los **~15 proveedores top concentran ~$20M de los $24.6M** en **~50 bills**. Plan: Gera revisa por proveedor (no línea por línea) y atribuye — los subcontratistas se mapean al proyecto por fecha + obra activa de ese cliente (muchas bills traen el cliente final en el nombre, ej. "recicladora Clarios"). No es irrecuperable; es un sprint de limpieza acotado por proveedor.

### 9.7 Resumen ejecutivo A3

- **Mecanismo:** Opción C — cuenta `NO-PROYECTO` en plan 1 + `applicability` plan 1 `mandatory` en `bill`/company 1. Da "proyecto O indirecto" sin re-estructurar (bajo riesgo).
- **Dónde:** Bill primero (cubre directas + derivadas de PO); PO en fase 2.
- **Anti-basura:** bucket NO-PROYECTO + archivado Frente B (picker corto) + detective n8n + capacitación.
- **3034:** se mata por hábito→decisión forzada; misc va a centros de costo plan 2 que ya existen.
- **Transición:** MX primero (applicability per-company), fase blanda con detective, limpiar 31 borradores, flip; piloto posible vía `account_prefix`/`product_categ`.
- **Backlog $24.6M:** mayormente subcontratistas (costo de proyecto fugado); recuperable por proveedor (~15 proveedores = ~$20M).

---

## 10. A3 — Mecanismo REVISADO tras confirmar el plan 2 · read-only 2026-06-16

> Hallazgo que cambia la recomendación de §9.1: **el plan 2 "Gasto Indirecto en FTS" ya existe, está vivo y bien usado.** Esto vuelve **innecesario** el parche `NO-PROYECTO` (Opción C) y reordena las opciones. Esta sección **supersede la recomendación de §9.1/§9.7**.

### 10.0 Estado real del plan 2 (no está abandonado)

- **31 cuentas, todas `active`. ~$7.3M/12m** fluyendo (coincide con el `has_indirect` de A0). 23 cuentas con movimiento en 12 meses.
- **Cubre bien las categorías no-proyecto:** `513 Administración` −$2.96M (87 líneas), `636 Oficina/Taller` −$1.11M (**349 líneas**), `527 Créditos camiones YIN` −$1.50M, `509 Gasolina` −$299k, `608 Ventas`, `632 Caja Herramientas` (77), `478 RH` (115 líneas), `744 Seguridad EPP` (66), `828 Estacionamiento`, `621 Comedor`, `308 Mantenimiento/seguros carros`, `293 Licencias/software`, `768 Legal`, `771 Compras`, `604 Nóminas`.
- **Veredicto: plan 2 es el hogar REAL y durable de los indirectos** — activo, con alto volumen de líneas. No es un plan muerto.
- **Limpieza menor (no bloquea):** algunos ítems mal archivados ahí — proyectos internos con número SO (`698 RACK packouts`, `778`/`767` remodelaciones) y personales (`788 Torneo`, `40 Gastos personales Esteban`, `294 Quinta`). Cosmético.

### 10.1 ⭐ ¿Se puede exigir "plan 1 (proyecto) **O** plan 2 (indirecto)" con los dos planes que ya existen?

**Estructura confirmada (clave):** en `account.analytic.line` **cada plan tiene su propia columna**: `account_id` = plan 1 (proyecto), `x_plan2_id` = plan 2 (indirecto), `x_plan18_id` = USA, `x_plan20_id` = rubro, etc. Son ejes independientes.

| Vía | ¿"plan 1 O plan 2"? | Notas |
|-----|---------------------|-------|
| **`applicability` nativa `mandatory`** | ❌ **NO** | Es **por plan, independiente**. plan1+plan2 mandatory = exige AMBOS; solo plan1 = bloquea indirectos. No existe "al menos uno de {1,2}". |
| **Constraint Python (base.automation)** ⭐ | ✅ **SÍ** | Una Automation Rule "al postear bill": Python que valida que cada línea de producto tenga `account_id` (plan1) **O** `x_plan18_id` (plan18) **O** `x_plan2_id` (plan2); si ninguna → `raise` (rollback). **~6 líneas.** TRUE "OR", usa los DOS planes existentes, **sin parche, sin reparentar.** Es el patrón de candado duro que FTS ya documentó (CLAUDE.md §17 quirk #4: "~4 líneas Python"). |
| **n8n detective (blando)** | ⚠️ parcial | Cero-código, **NO bloquea** — detecta posteadas sin plan1/2/18 y avisa. No cumple "obligatorio" duro; sirve como fase de transición o si se descarta todo Python. |
| **Studio "required" en vista** | ❌ | Solo vista; NO bloquea el post/API/import (verificado en Frente B). |

**Conclusión:** "plan 1 O plan 2" **no es expresable en applicability nativa**, pero **SÍ con una mini-constraint Python** que se apoya en los dos planes que ya existen. Esa es la forma correcta del "uno u otro".

### 10.2 Opción B (plan padre reparentando 1/18/2) — riesgo REAL cuantificado

Con la estructura de columnas confirmada, el daño es concreto, no vago:

- **`account_id` es la columna PRIMARIA/legacy** de `account.analytic.line`, ligada al plan 1 como "default plan". La **lee TODO**: el panel de rentabilidad nativo (`_get_profitability_items`), el **eje proyecto del budget**, y referencias nativas/reportes por doquier.
- **Reparentar plan 1** cambia el `root_id` de sus 89 cuentas → la columna `account_id` se recomputa: o **migra los valores de proyecto a otra columna**, o **conflacta proyecto+indirecto bajo un mismo `account_id`** (si "Atribución" pasa a ser el default root). Cualquiera de los dos **perturba el campo analítico más referenciado del sistema.**
- **Alcance del daño:** recálculo de columnas de plan en **todo el histórico** de `analytic.line`; riesgo al cómputo de `budget.achieved` (que casa por columnas de plan); el panel de rentabilidad (lee `account_id`); cualquier filtro/reporte que asuma `account_id = proyecto`. Son las 1,750 líneas/12m **+ todo el histórico**.
- **¿Reversible?** En principio sí (reparentar de vuelta), pero con churn de recálculo y ventana de riesgo sobre budget/rentabilidad.
- **Veredicto: riesgo ALTO**, desproporcionado. Toca la viga maestra (`account_id`) para un beneficio que la constraint logra sin tocarla. **Descartada.**

### 10.3 Opción C (cuenta NO-PROYECTO en plan 1) — molestia real + redundancia

- La cuenta `NO-PROYECTO` viviría en `account_id` como **pseudo-proyecto**. Hay que **excluirla explícitamente** en: (1) rentabilidad por proyecto, (2) creación de budget, (3) panel `rent-proy`, (4) cualquier listado de proyectos por plan 1. ~3–4 puntos de exclusión de un id conocido → molestia **baja pero real**, y **contamina el eje proyecto**.
- **Peor: es redundante.** Con el plan 2 vivo, lo no-proyecto ya tiene a dónde ir (centros de costo reales). El bucket `NO-PROYECTO` sería un segundo "cajón de no-proyecto" peor que el que ya existe → **trabajo tirado** cuando plan 2 + GL futuro se vuelvan el estándar. **Descartada en favor de plan 2 directo.**

### 10.4 ⭐ Visión de largo plazo (indirectos en su propio GL con subcuentas)

- Esteban quiere a futuro los indirectos en **cuenta CONTABLE (GL) propia con subcuentas** (reestructura aparte de la analítica). El **plan 2 analítico es el complemento natural y durable** de esa visión: cuando existan los GL de indirectos, una `distribution.model` mapea **GL→cuenta plan 2** (igual que hoy `601.84.01→1176`), reforzando la captura.
- **Apoyarse en plan 2 ahora = CERO trabajo tirado:** el plan 2 sigue siendo el hogar de indirectos antes y después del cambio de GL. La constraint "plan1/18 O plan2" **no depende del GL** → sobrevive intacta a la reestructura contable.
- **Opción C sería trabajo tirado** (el parche muere cuando plan 2 + GL se estandarizan). **Opción B** es ortogonal y disruptiva al objetivo de GL.

### 10.5 ✅ Recomendación final del mecanismo (revisada)

**Mecanismo: plan 2 directo + mini-constraint "plan 1/18 O plan 2" — NO parche, NO reparentar.**

1. **Captura:** costo de proyecto → cuenta de proyecto (plan 1/18, columna `account_id`/`x_plan18_id`). Gasto no-proyecto → centro de costo **plan 2** (`x_plan2_id`) que YA existe. Mata 3034 (decisión forzada + destino claro).
2. **Candado duro:** **una** Automation Rule (~6 líneas Python) que al postear una bill exige `plan1 OR plan18 OR plan2` en cada línea de producto; si no, `raise`. TRUE "OR", apoyado en los planes existentes.
3. **Transición:** idéntica a §9.5 — MX primero (la constraint se acota a `company_id=1` en su código), fase blanda con **detective n8n** (no bloquea) 2–4 sem, limpiar los **31 borradores**, luego activar la Automation Rule. (Piloto: la constraint puede arrancar filtrando por prefijo GL/categoría dentro del Python.)
4. **Anti-basura + picker corto + retro-atribución del $24.6M:** sin cambios respecto a §9.3/§9.6.

| Criterio | Plan 2 + constraint ⭐ | C (NO-PROYECTO) | B (reparentar) |
|----------|----------------------|------------------|----------------|
| "Uno u otro" real | ✅ (constraint) | ✅ (forzado a plan 1) | ✅ (root común) |
| Riesgo estructural | **mínimo** (0 cambios de esquema) | bajo (1 cuenta parche) | **alto** (`account_id`/budget) |
| Cero-código | ❌ ~6 líneas Python | ✅ pero parche | ❌ + migración |
| Alineado a visión GL | ✅ **durable** | ❌ trabajo tirado | ❌ ortogonal |
| Usa lo que ya existe | ✅ plan 2 | parcial | re-estructura |

**El único costo del camino recomendado son ~6 líneas de Python en una Automation Rule** — el precio de un "OR" duro real. Es el mismo patrón de candado que FTS ya aceptó para bloqueos API. Si Esteban quiere CERO Python absoluto, el fallback es el **detective n8n blando** (no bloquea, igual se apoya en plan 2), asumiendo que "obligatorio" pasa a ser "vigilado" en vez de "bloqueado".

> **Decisión para Esteban:** ¿candado duro (mini-constraint Python, recomendado) o vigilancia blanda (n8n, cero-Python)? Es la única bifurcación que queda para construir A3.

---

🤖 Mapa + A0 + A3 (+ revisión plan 2) generados con [Claude Code](https://claude.com/claude-code) (deep-search read-only, sin cambios a Odoo ni workflows).
