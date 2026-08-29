# Limpieza comercial 2026-08 — Reporte de DRY-RUN

**Fecha:** 2026-08-29 · **Issue:** [#131](https://github.com/yinyo1/fts-suite/issues/131) · **Rector:** #127
**Estado:** ⛔ **NADA se escribió a Odoo.** Esta corrida es solo lectura. La escritura es una segunda corrida, después del "va" de Esteban.

---

## 0. Punto de partida (re-verificado hoy contra Odoo)

Los conteos de la auditoría del 29-ago **siguen idénticos**: 1,859 leads activos, misma distribución por etapa y por `x_studio_dndole`. Única corrección: el universo de L6 (ver §L6).

| Artefacto | Ruta | Registros |
|---|---|---|
| Dump `crm.lead` activos | `comercial/data/dump-pre-limpieza-20260829.json` | **1,859 / 1,859** ✅ |
| Dump `sale.order` MX+USD | `comercial/data/dump-pre-limpieza-so-usd-20260829.json` | **231 / 231** ✅ |
| Hoja de dueños | `comercial/data/clientes-usuarios.csv` | 89 filas → **32 cuentas** |
| Universo real de L4 | `comercial/data/l4-leads-vivos-exfts.json` | 50 |
| Plan L4 resuelto | `comercial/data/l4-plan.json` | 50 |

**Validación del dump** (no es autoreporte): la tabla del MCP se parseó por offsets de columna y el resultado se cruzó contra dos `read_group` server-side. Las 12 etapas cuadran exactamente (CANCELADO 1,173 · Ganado 530 · …) y los 9 vendedores también (Sales FTS 1,155 · Raymundo 384 · 47 sin `user_id`). Un desalineamiento de columnas habría roto esos conteos.

**Limitación del dump (SUPUESTO acotado):** el MCP corta **todo texto a 40 caracteres** y agrega `…` (tope duro por columna; verificado pidiendo 2, 4 y 15 campos, y leyendo un solo registro). 1,170 de 1,859 registros llevan algún campo truncado (`name` 1,041 · `partner_id` 152 · `partner_name` 64), marcados con `_truncado`. **No compromete el rollback:** los campos que la limpieza modifica (`stage_id`, `active`, `x_studio_dndole`, `currency_id`) son cortos y están íntegros. Lo truncado es descriptivo y ningún lote lo toca.

> Ojo de trampa ya documentado: la etapa **`Cotizacion...`** (id 3) se llama así de verdad, con tres puntos ASCII — **no** es truncación (la truncación usa el carácter unicode `…`). Que nadie la "arregle" después.

---

## L1 · CANCELADO → perdido + archivar

| | |
|---|---|
| **Afectados** | **1,173 leads** (63% de los activos) |
| **Cambio** | `lost_reason_id` → "Cancelada (limpieza 2026-08)" · `active` → `false` · nota en chatter |
| **Método** | `action_set_lost` nativo (marca motivo y archiva en un paso) en lotes de 200 |
| **Reversible con** | dump (`stage_id` + `active` por id) |

**Muestra (5 de 1,173):** ids 41, 42, 43, 45, 46 — todos en etapa CANCELADO con su `partner_id` y `create_date` en el dump.

🔴 **Requiere una decisión antes de correr:** `crm.lost.reason` tiene **16 motivos y ninguno es "cancelada"** (los actuales son de negocio: "Muy caro", "No confian en FTS", "Les quitaron el presupuesto"…). Opciones:
- **(a)** crear el motivo `Cancelada (limpieza 2026-08)` — es el **único `create` de toda la limpieza**, y deja la huella de que fue un saneamiento masivo, no una pérdida comercial real. **Recomendado.**
- **(b)** repartirlos entre los 16 motivos existentes — imposible sin releer 1,173 leads uno por uno; no hay dato que lo soporte.
- **(c)** archivar sin motivo — pierde el "por qué" para siempre.

**Nota de diseño:** "Perdido" **no es una etapa** en Odoo, es `active=false` + `lost_reason_id`. Por eso la consolidación del punto 1 de #131 da **5 filas de `crm.stage` + el mecanismo lost**, no 6 etapas.

---

## L2 · Consolidación de etapas 12 → 5 (+ tags por cliente)

**Movimientos propuestos (35 leads cambian de etapa):**

| Origen | → Destino | Leads | Razón |
|---|---|---:|---|
| Adiccionales Topo (Monty) [20] | Por cotizar [15] | 4 | Variante por cliente → se absorbe con tag `Topo Chico` |
| Qualified [21] | Por cotizar [15] | 9 | Default de Odoo en inglés; duplica "Lead Calificado" |
| Pendiente Por Enviar [14] | Por cotizar [15] | 2 | Es una cotización aún no enviada |
| Cotizacion... [3] | Cotización enviada [5] | 4 | Nombre basura de la misma etapa |
| Cot Enviada Mdlz [12] | Cotización enviada [5] | 16 | Fork por cliente → tag `Mondelez` |
| Proyecto Ganado - Con PO [4] | Proyecto Ganado [8] | 2 | Fusión (#131 dec.1) |
| **Total** | | **37** | |

**Tags a crear/aplicar:** `Topo Chico` (4 leads) · `Mondelez` (16 leads).

**Etapas a archivar** (`active=false`, nunca `unlink`), solo tras verificar que quedaron en cero: 20, 21, 14, 3, 12, 4 y 9 (CANCELADO, que L1 dejó vacía).

**Etapas finales (5):** `seq 1 Prospecto Lead` · `seq 2 Lead Calificado/Por cotizar` · `seq 3 Cotizacion Enviada` · `seq 4 Revisar` · `seq 5 Proyecto Ganado [is_won]`.

⚠️ **Hallazgo:** "Proyecto Ganado - Con PO" **no tiene `is_won`** hoy, así que sus 2 leads **nunca contaron como ganados** en ningún reporte nativo de Odoo. Al fusionarse pasan a contar — es una corrección, pero mueve el histórico de win-rate en 2 registros.

---

## L3 · Archivar ganados

| | |
|---|---|
| **Afectados** | **532 leads** (530 en Proyecto Ganado + 2 que L2 fusiona desde "Con PO") |
| **Cambio** | `active` → `false`. **No** se toca `stage_id` ni `dndole`: su historia queda intacta. |
| **Orden** | Corre **después de L2**, para archivar los 2 fusionados en el mismo paso |

**Muestra (5 de 532):** ids 44, 47, 52, 55, 58 — todos en Proyecto Ganado, con monto y cuenta en el dump.

---

## L4 · Reasignación de leads de ex-FTS

🟢 **Hallazgo que cambia el tamaño del lote: de 331 a 50.**

Los 331 leads con `dndole` de ex-FTS se reparten así por etapa:

| Situación | Leads | Quién los consume |
|---|---:|---|
| En CANCELADO | 204 | **L1** los archiva |
| En Proyecto Ganado / Con PO | 77 | **L3** los archiva |
| **En etapas VIVAS** | **50** | ← **el universo real de L4** |

Reasignar los 281 que van a quedar archivados sería trabajo tirado. L4 opera solo sobre los 50 vivos.

### Resultado del matching (ejecutado: `node lote-4-reasignacion.js --dry-run --fixture`)

| Vía de resolución | Leads |
|---|---:|
| Dueño vigente en la hoja | 25 |
| Cartera (cuenta fuera de la hoja) | 9 |
| Sin dueño resoluble → **Revisar** | 16 |

| Destino | Leads |
|---|---:|
| **Montalvo** | 22 |
| **Aldo** | 9 |
| **Esteban** | 3 |
| **(sin dueño) → etapa Revisar, `dndole` vacío** | 16 |

**Detalle por cuenta:**
- **Montalvo (22):** Nalco 6 · Chemtreat 3 · Quimitec 3 · Mondelez Global LLC 5 · MONDELEZ MEXICO 2 · Johnson Controls 2 · Forza Steel 1
- **Aldo (9):** CORPORATE USA 6 (leads de Mission Foods) · Bridgestone 1 · Magnekon 1 · ABB 1
- **Esteban (3):** Mission Foods 3 — **los 3 con conflicto, ver abajo**

### 🟡 3 conflictos hoja-vs-cartera (necesitan tu ojo)

Los 3 leads de **Mission Foods** (1985, 2096, 1842). La regla dice "si la cuenta tiene un dueño vigente en la hoja, se asigna tal cual" → **Esteban**. Pero la cartera dice **GRUMA/Mission Foods → Aldo**, y en la hoja Mission Foods tiene **5 contactos de Luis (no vigente) y solo 1 de Esteban**. Que un dueño con 1 de 6 contactos se lleve la cuenta entera parece un artefacto de la regla, no una decisión.

**Pregunta:** ¿Mission Foods va a **Aldo** (cartera) o a **Esteban** (hoja)? El script hoy aplica la regla literal (Esteban) y marca el conflicto en la nota del chatter.

### 🟡 16 sin dueño → Revisar

- **Regal Rexnord (4 leads):** en la hoja solo con Luis (no vigente) y sin patrón de cartera. Es una cuenta con 4 oportunidades vivas — probablemente merece dueño en vez de ir a Revisar.
- **Cuentas fuera de la hoja (12):** Bebidas Purificadas, Choice Bagging, Caterpillar, Copamex, Daniel Cuateta ×2, Grupo Bimbo, Lau Industries, Luciano Angusto Gerling, Mars, Owens Illinois, WMC.

Es el comportamiento pedido ("lo que no tenga cuenta en esa hoja va a Revisar sin dueño") y la decisión es reversible en la primera revisión semanal.

---

## L5 · Depuración del selection `x_studio_dndole`

**No se puede por API y no se va a intentar.** Las opciones de un selection de Studio viven en `ir.model.fields.selection` (capa meta de Odoo): el MCP la tiene en denylist dura y escribir ahí por RPC es justo el tipo de cambio que rompe en silencio. El script produce el **instructivo exacto** y el guardarraíl.

**Instructivo para Studio → `crm.lead` → campo "Dándole":**

| Acción | Valor | Leads históricos que conservan el valor |
|---|---|---:|
| **QUITAR** | Angel | 168 |
| **QUITAR** | Yusti | 98 |
| **QUITAR** | Diego | 62 |
| **QUITAR** | Bethania | 8 |
| ✓ conservar | Aldo Mendez | 245 |
| ✓ conservar | Montalvo | 91 |
| ✓ conservar | Esteban | 52 |
| ✓ conservar | Ricardo | 1 |
| **+ AGREGAR** | Pablo | 0 (usuario nuevo de 1.0) |
| ? decidir | Oscar | 1 |

**Orden obligatorio:** L5 va **después** de L1, L3 y L4. Si se quita una opción mientras un lead vivo la usa, el registro queda con un valor huérfano que la UI no sabe pintar. Tras L1+L3+L4 ningún lead vivo usará valores de ex-FTS; los **archivados sí los conservan a propósito** (es su historia, y por eso se quita la opción del selector pero no el dato).

**SUPUESTO:** el selection puede tener opciones que ningún lead usa y que este script no ve. Al abrir Studio, comparar la lista real contra esta tabla.

---

## L6 · `sale.order` de FTS MX marcadas en USD

**Universo corregido:** el "127" del baseline no se reproduce. Hoy: **231 totales** → 33 canceladas (se dejan) → **198 en universo**, tal como confirmaste.

### Corte por factura posteada

| Grupo | Leads | Qué se hace |
|---|---:|---|
| **A · Corregibles** | **190** (156 draft · 28 sent · 6 sale) | `currency_id` → MXN + nota en chatter |
| **B · Para Gera** | **5** | **No se tocan.** Lista abajo |
| **C · Ambiguos** | **3** | **No se tocan.** Requieren decisión |

**Método (verificado por dos caminos independientes):** `sale.order.invoice_ids` → `account.move`, posteada si `state='posted'` y `move_type in ['out_invoice','out_refund']`. Se contra-verificó entrando por el otro lado (`account.move` vía `line_ids.sale_line_ids.order_id`, sin usar `invoice_ids`): ambos devuelven los mismos 14 moves.

⚠️ **`invoice_status` NO sirve como discriminador** y falla en las dos direcciones: 3 falsos negativos (dice `to invoice` con factura posteada, por facturación parcial) y 1 falso positivo (SO11461 dice `invoiced` con la factura en borrador). Si alguien "simplifica" el script usando ese campo, corrompe 4 registros.

**Grupo B — para Gera (5):** SO5893 (Regal Rexnord) · SO5989 (Nalco) · SO6013 (Budenheim, facturación parcial) · SO10702 (Visionary, con nota de crédito posteada) · SO11240 (Budenheim).

**Grupo C — ambiguos (3):** SO4773 (su única factura está **cancelada**, $377k) · SO10822 y SO11461 (facturas en **borrador** sin folio). Una factura en borrador puede postearse mañana, y entonces la moneda corregida ya habría viajado al asiento.

### 🔴 Hallazgo crítico: los montos ya están en pesos

**SO5989** dice USD $44,240.21 y su factura posteada real, **INV1688, salió en MXN por exactamente 44,240.21**. Es decir: **lo único equivocado es la etiqueta de moneda, no los números.** La corrección debe cambiar `currency_id` y **dejar los montos intactos**; convertirlos (×17.35) destruiría el valor real.

El script está escrito así. **Es un solo caso comprobado: evidencia fuerte, no prueba.** Antes del write masivo conviene confirmarlo con 2-3 casos más del grupo B.

### 🔴 La causa raíz sigue abierta

El problema **está vivo y acelerando**: 76 de las 190 se crearon en 2026 (8 meses), más que cualquier año completo previo (2023: 38 · 2024: 43 · 2025: 33). La más reciente tiene **26 días**. Corregir sin cerrar la causa (default de moneda en el partner, la plantilla de cotización o la pricelist) garantiza que el lote se vuelva a llenar solo. **Sugerencia: sesión aparte para encontrar de dónde sale el default.**

---

## L7 · Usuarios huérfanos (solo diagnóstico, no mueve nada)

🟢 **Igual que L4, el problema es mucho más chico de lo que parecía:**

| Grupo | Activos hoy | Los archivan L1/L3 | **Residuo vivo** |
|---|---:|---:|---:|
| `Usuario Taqueria JMZ` (res.users 16) | 81 | 75 (52 CANCELADO + 23 Ganado) | **6** (en Revisar) |
| Sin `user_id` | 47 | 46 (28 CANCELADO + 18 Ganado) | **1** (en Revisar) |
| | | | **7 en total** |

**Propuesta (no se ejecuta sin tu aprobación):**
- **(a)** 7 leads es revisión manual de 5 minutos en la primera junta semanal.
- **(b)** `Usuario Taqueria JMZ` parece un usuario ajeno al negocio: si lo confirmas, **desactivarlo en Odoo** evita que reciba leads nuevos.
- **(c)** Los leads sin `user_id` no estorban: la atribución de 1.0 vive en `x_studio_dndole`, no en `user_id` (el diseño es un solo usuario Odoo).

---

## Proyección post-limpieza

| | Hoy | Después |
|---|---:|---:|
| Leads activos | **1,859** | **154** |
| Etapas activas | 12 | **5** |
| Leads en etapas de "cotización" duplicadas | 54 en 4 etapas | 52 en 1 etapa |
| Leads con `dndole` de ex-FTS | 331 | **0** |

**Distribución final del pipeline vivo (154):**

| Etapa | Leads |
|---|---:|
| Prospecto Lead | 21 |
| Lead Calificado/Por cotizar | 37 |
| Cotizacion Enviada | 48 |
| Revisar | 48 |

> La meta del issue era **< ~450 leads reales activos**. Se aterriza en **154** — el pipeline verdadero de FTS es un tercio de lo que la meta suponía. Vale calibrar expectativas antes de que el equipo abra la hoja y le parezca vacía: no está vacía, es que 1,705 de los 1,859 registros eran ruido histórico.

**Revisar queda con 48 leads (31% del pipeline vivo)** — es el efecto de mandar ahí los 16 sin dueño de L4. Es una bandeja de trabajo real para la primera revisión semanal, no un cajón de sastre permanente.

---

## Orden de ejecución obligatorio

```
L1 (CANCELADO → lost + archivar)
 └→ L2 (consolidar etapas + tags)        ← después de L1: no remapea lo que ya salió
     └→ L3 (archivar ganados)            ← después de L2: incluye los 2 fusionados
         └→ L4 (reasignar los 50 vivos)  ← después de L3: solo toca pipeline vivo
             └→ L5 (depurar selection)   ← al final: ya ningún lead vivo usa ex-FTS
L6 (moneda SO)  — independiente, puede correr en paralelo
L7 (diagnóstico) — no escribe
```

## Antes del "va": 4 decisiones

1. **L1** — ¿crear el motivo de pérdida `Cancelada (limpieza 2026-08)`? (recomendado)
2. **L4** — Mission Foods (3 leads): ¿**Aldo** por cartera o **Esteban** por la hoja?
3. **L4** — Regal Rexnord (4 leads vivos): ¿se queda sin dueño en Revisar o le asignas uno?
4. **L6** — ¿confirmamos la hipótesis "los montos ya están en pesos" con 2-3 casos más antes del write de las 190?

---

## ⚠️ ACTUALIZACIÓN 2026-08-29 — L6 DETENIDO

La sección **L6** de este reporte quedó invalidada. La hipótesis "los montos ya están en pesos, solo la etiqueta está mal" **se comprobó FALSA** al verificar 4 casos más del grupo B a petición de Esteban: sus facturas posteadas están **también en USD** con el mismo monto (son ventas en dólares reales, incluido un cliente canadiense). SO5989 era la excepción, no la regla.

El lote NO se ejecutó y el script tiene un candado duro. Evidencia cruda y opciones: [`L6-HALLAZGO-MONEDA-2026-08-29.md`](L6-HALLAZGO-MONEDA-2026-08-29.md).
