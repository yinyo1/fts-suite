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

**Orden recomendado:** A0 → **A2/A3 primero** (sin captura limpia, cualquier budget o panel miente) → A1 → A4 → A5. R2/R3 son el cuello de botella; **A1 sin A2 produce budgets que nunca se descuentan** (justo el estado actual de los 123 budgets).

### 6.1 Decisión grande pendiente (de Esteban, NO resoluble solo)
El camino de **A2**: ¿`mandatory` + capacitación (cambia el hábito de captura, **cero código**) **vs** workflow reparador n8n (no cambia hábito, mantiene repintado automático)? Esa elección define casi todo el Frente A.

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

🤖 Mapa generado con [Claude Code](https://claude.com/claude-code) (deep-search read-only, sin cambios a Odoo ni workflows).
