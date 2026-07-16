# Baseline Comercial FTS — sale.order últimos 12 meses

**Generado:** 2026-07-16 · **Fuente:** Odoo `sale.order` (read-only, MCP UID 2)
**Ventana:** `create_date >= 2025-07-01` · **Empresas:** 1 (SERVICIOS FTS · MX) + 6 (FTS FULL TECHNOLOGY SYSTEMS LLC · USA)
**Universo:** 541 cotizaciones

---

## 1. Tabla resumen — los 4 números clave

| # | Métrica | Valor | Confianza |
|---|---|---|---|
| 1 | **Cotizaciones creadas / mes** | **42.6** (511 en 12 meses completos jul-25→jun-26) | 🟢 Alta |
| 2 | **Win rate global** | **30.1%** (80 ganadas / 266 enviadas+ganadas+canceladas) · 39.6% si se excluyen cancelaciones basura | 🟡 Media — ver §3 |
| 3 | **Días lead → envío** | **NO MEDIBLE** — Odoo no guarda timestamp de envío | 🔴 Campo inexistente |
| 4 | **Días envío → cierre** | **NO MEDIBLE** por lo anterior. Proxy real: **create → confirmación = 21.6 días promedio / 11.5 mediana** | 🟢 Alta (proxy) |

### Win rate por rango (el número accionable)

| Rango (MXN) | Ganadas | Enviadas vivas | Canceladas | **Win rate** | Días create→cierre (prom / mediana) |
|---|---|---|---|---|---|
| **<200K** | 58 | 42 | 64 | **35.4%** | 18.9 / 9.5 |
| **200K–1M** | 14 | 48 | 0 | **22.6%** | 20.0 / 15.5 |
| **1M–3M** | 6 | 24 | 0 | **20.0%** | 37.1 / 14.1 |
| **3M–5M** | 1 | 4 | 0 | **20.0%** | 107.0 / 107.0 |
| **>5M** | 1 | 4 | 0 | **20.0%** | 17.2 / 17.2 |
| **TOTAL** | 80 | 122 | 64 | **30.1%** | 21.6 / 11.5 |

> **Lectura ejecutiva:** el negocio gana ~1 de cada 3 cotizaciones chicas y ~1 de cada 5 de las grandes. Los rangos 3M–5M y >5M tienen **n=5 cada uno** — el 20% es 1 de 5, estadísticamente no concluyente. El dato duro es que **arriba de 200K la conversión cae a ~1 de 5 y no se mueve con el tamaño**.

---

## 2. Cotizaciones creadas por mes

| Mes | Cotizaciones | Monto nominal (sin normalizar) |
|---|---|---|
| 2025-07 | 46 | $44,294,711 |
| 2025-08 | 33 | $22,616,244 |
| 2025-09 | 29 | $43,959,963 |
| 2025-10 | 33 | $9,580,585 |
| 2025-11 | 64 | $49,375,786 |
| 2025-12 | 49 | $10,594,698 |
| 2026-01 | 24 | $4,848,984 |
| 2026-02 | 90 | $17,856,589 |
| 2026-03 | 30 | $18,238,494 |
| 2026-04 | 27 | $16,453,438 |
| 2026-05 | 35 | $11,074,630 |
| 2026-06 | 51 | $69,139,755 |
| 2026-07 (parcial, al día 16) | 30 | $15,903,247 |

⚠️ Los montos son **sumas nominales sin normalizar moneda** — ver §6 RIESGO-1. No los uses como pipeline en pesos.

### Por vendedor (`user_id`) — 🔴 el hallazgo que invalida el análisis por persona

| Vendedor | Cotizaciones | % | Comentario |
|---|---|---|---|
| **Sales FTS (id 12)** | **416** | **76.9%** | 🔴 **Cuenta genérica compartida** — no es una persona |
| Jesus Esteban De La Cruz (id 2) | 91 | 16.8% | Monto total $162K en 91 órdenes (~$1.8K promedio) → ruido de portal/web, no venta real |
| OPERACIONES FTS-YIN (id 6) | 14 | 2.6% | Cuenta genérica |
| Administracion FTS-YIN (id 25) | 8 | 1.5% | Cuenta genérica |
| *(sin user_id)* | 12 | 2.2% | 🔴 Fuga: nadie es dueño |

**Conclusión: no existe atribución por vendedor en el CRM hoy.** El 81% del volumen está en 3 cuentas genéricas y un 2.2% no tiene dueño. Cualquier métrica "por vendedor", ranking, comisión o watchdog dirigido a una persona **es imposible con la data actual**. Ver §6 RIESGO-3 e implicación directa en el Watchdog T2.

---

## 3. Distribución por rango de monto

Normalizada a MXN usando la **empresa** como autoridad de moneda (ver §6 RIESGO-1): empresa 1 = MXN tal cual; empresa 6 = USD × 17.35.

| Rango (MXN) | Draft | Enviadas | Ganadas | Canceladas | **Total** |
|---|---|---|---|---|---|
| <200K | 128 | 42 | 58 | 64 | **292** |
| 200K–1M | 82 | 48 | 14 | 0 | **144** |
| 1M–3M | 45 | 24 | 6 | 0 | **75** |
| 3M–5M | 5 | 4 | 1 | 0 | **10** |
| >5M | 15 | 4 | 1 | 0 | **20** |
| **TOTAL** | **275** | **122** | **80** | **64** | **541** |

**Dos cosas saltan:**

1. **275 cotizaciones (51%) están en `draft` y nunca se enviaron.** Es la mitad del trabajo de cotización que jamás llegó al cliente — o son borradores basura, o es fuga pura. Este es probablemente el hallazgo de mayor valor económico del baseline.
2. **Las 64 canceladas son basura, no pérdidas comerciales.** 50 de ellas son USD sumando $2,184 total (~$44 c/u) — carritos de portal web / `Public user`. Meterlas al win rate del rango <200K lo hunde artificialmente de 58% a 35%. **El win rate honesto de <200K es ~58%.**

---

## 4. Días promedio (tiempos de ciclo)

### Lo que NO se puede medir

Odoo **no persiste un timestamp de "cotización enviada"**. El estado `sent` existe pero la fecha en que se transicionó a `sent` no se guarda en ningún campo nativo de `sale.order`. Por lo tanto:

- ❌ **días create → envío**: no medible.
- ❌ **días envío → confirmación**: no medible.

Proxies descartados y por qué:
- `write_date` → contaminado por escrituras masivas (§6 RIESGO-2). Inservible.
- `mail.message` / tracking del chatter → sí contiene el evento real, pero reconstruirlo para 541 órdenes excede el alcance de un baseline. **Queda en ROADMAP como la vía correcta.**

### Lo que SÍ se puede medir

`create_date → date_order` para órdenes confirmadas (n=80). En Odoo, al confirmar una SO el `date_order` se re-estampa con la hora de confirmación, así que esto es el **ciclo completo lead → cierre**:

| Rango | n | Promedio | Mediana | Mín | Máx |
|---|---|---|---|---|---|
| <200K | 58 | 18.9 d | 9.5 d | 0.0 | 272.0 |
| 200K–1M | 14 | 20.0 d | 15.5 d | 0.1 | 84.8 |
| 1M–3M | 6 | 37.1 d | 14.1 d | 0.1 | 118.0 |
| 3M–5M | 1 | 107.0 d | 107.0 d | — | — |
| >5M | 1 | 17.2 d | 17.2 d | — | — |
| **TOTAL** | **80** | **21.6 d** | **11.5 d** | 0.0 | 272.0 |

La distancia entre promedio (21.6) y mediana (11.5) dice que **la mayoría cierra en ~2 semanas y una cola larga se arrastra meses**. Los mín de 0.0–0.1 días son órdenes creadas y confirmadas en la misma sesión (probablemente capturadas ya vendidas, no cotizadas).

---

## 5. Pipeline vivo actual (state = `sent`)

**122 órdenes enviadas en la ventana de 12 meses**, con un valor nominal de $107.5M (§6 RIESGO-1 aplica al monto).

### 🔴 El hallazgo crítico para el Watchdog

**Ninguna de las 122 órdenes enviadas ha sido tocada en los últimos 6 días. Ni una.** La orden con el `write_date` más reciente es del 2026-07-08 (8 días). Aplicando la regla especificada (AMARILLO ≥4d / ROJO ≥6d):

| Semáforo | Órdenes | % |
|---|---|---|
| 🔴 ROJO (≥6 días) | **122** | **100%** |
| 🟡 AMARILLO (4–5 días) | 0 | 0% |
| 🟢 Al día (<4 días) | 0 | 0% |

**Y el backlog real es mucho peor:** filtrando sólo por `state=sent` sin ventana de fecha hay **1,131 órdenes enviadas históricas** en las empresas 1 y 6. Todas rojas.

Esto tiene una consecuencia de diseño directa en T2: un digest que liste 1,131 (o 122) filas rojas es ilegible y se ignora al segundo día. El watchdog se construyó con **ventana de fecha configurable + tope de filas por bucket**. Ver `SUPUESTOS.md` §T2.

### Top 10 del pipeline vivo por monto

| Orden | Cliente | Monto nominal | Empresa | Creada | Días sin movimiento |
|---|---|---|---|---|---|
| SO11135 | Nalco de Mexico | 22,683,899 | MX | 2025-09-11 | 50 |
| SO11352 | Nalco de Mexico | 8,021,682 | MX | 2025-11-27 | 50 |
| SO11657 | Nalco de Mexico | 4,414,612 | MX | 2026-03-09 | 50 |
| SO11183 | Nalco de Mexico | 3,887,209 | MX | 2025-09-24 | 50 |
| SO11046 | CBRE GCS | 3,286,686 | MX | 2025-08-21 | 231 |
| SO10988 | BEBIDAS PURIFICADAS | 3,257,553 | MX | 2025-08-11 | 231 |
| SO11164 | Nalco de Mexico | 2,983,658 | MX | 2025-09-18 | 50 |
| SO11493 | QUIMITEC | 2,678,788 | MX | 2025-12-19 | 202 |
| SO11048 | Nalco de Mexico | 2,381,637 | MX | 2025-08-22 | 50 |
| SO11258 | Terra Energy | 2,314,200 | MX | 2025-10-29 | 231 · ⚠️ **SIN OWNER** |

Los "50 días" de las Nalco no son movimiento comercial real: son el efecto de la escritura masiva del 2026-05-27 (§6 RIESGO-2). El dato honesto es que llevan sin tocarse desde que se crearon.

### Concentración de clientes

El pipeline vivo está fuertemente concentrado en **Nalco de Mexico** (aparece en 6 del top 10 y en ~30 de las 122). Riesgo comercial de concentración que vale la pena mirar aparte de este baseline.

---

## 6. Calidad de datos — qué está roto y qué riesgo implica

Ordenado por impacto. **Estos 3 riesgos definen el diseño del watchdog y del módulo.**

### 🔴 RIESGO-1 — `amount_total` no es comparable entre órdenes (moneda mal asignada)

**Qué encontré:** 127 órdenes de la **empresa 1 (SERVICIOS FTS, mexicana)** están marcadas con `currency_id = USD`. Varias son inequívocamente pesos mal etiquetados:

| Orden | Cliente | `amount_total` | Moneda marcada | Realidad |
|---|---|---|---|---|
| SO11771 | Conmet de México, S.A. de C.V. | 53,190,685 | USD | Serían **$923M MXN**. Es MXN. |
| SO11776 | MONDELEZ MEXICO | 2,928,081 | USD | Cliente MX, empresa MX |
| SO11667 | MAGNEKON S.A. DE C.V. | 2,780,404 | USD | Cliente MX, empresa MX |
| SO11686 | CHEMTREAT MEXICO | 2,575,275 | USD | Cliente MX, empresa MX |

Al mismo tiempo hay órdenes de la empresa 1 en USD que **sí son genuinamente dólares** (Visionary $1,624, CORPORATE USA $2,685). O sea: **la bandera de moneda no es confiable ni para creerle ni para ignorarla sistemáticamente.**

**Proxy usado en este baseline:** la **empresa** es la autoridad de moneda (empresa 1 → MXN; empresa 6 → USD × 17.35). Declarado en `SUPUESTOS.md`.
**Impacto:** los totales en pesos de §2 y §5 son indicativos, **no auditables**. La distribución por rango (§3) es robusta porque los errores son de orden de magnitud y no mueven de bucket a la mayoría.
**Ambigüedad residual:** las 2 órdenes de Mission Foods (empresa 6, $1.35M y $1.20M USD) podrían ser MXN mal etiquetadas; si lo son, el pipeline vivo normalizado baja ~$44M MXN.
**Acción:** auditar las 127 órdenes empresa-1-en-USD. Es trabajo de Gerardo/Odoo, no de este módulo.

### 🔴 RIESGO-2 — `write_date` no mide seguimiento comercial

**Qué encontré:** de las 122 órdenes enviadas, **60 comparten exactamente `write_date = 2025-11-28 03:13:06`** y **27 comparten `2026-05-27 17:56:35`**. Son escrituras masivas (migración / recálculo), no toques humanos.

**Impacto directo en T2:** el watchdog especificado usa "días desde `write_date`" como definición de "sin movimiento". Ese campo mide *"la última vez que cualquier proceso tocó cualquier campo"*, no *"la última vez que un vendedor le dio seguimiento al cliente"*. Hoy da lo mismo porque **todo está rojo de cualquier forma**, pero en cuanto el equipo empiece a trabajar, cualquier script que toque `sale.order` en masa **reseteará todos los semáforos a verde sin que nadie haya llamado a un cliente**. Es un falso negativo silencioso esperando a pasar.

**Se implementó con `write_date` según especificación**, pero la señal correcta (`mail.message` del chatter = comunicación real con el cliente) queda documentada como Watchdog v2 en `ROADMAP.md`. Ver `SUPUESTOS.md` §T2.

### 🔴 RIESGO-3 — No hay atribución por vendedor

Ver §2. 77% del volumen en `Sales FTS` (cuenta genérica), 12 órdenes sin `user_id`.
**Impacto en T2:** el digest "por vendedor" produce **un solo bucket con ~122 órdenes** llamado "Sales FTS". El agrupamiento funciona técnicamente pero no informa a nadie. El bucket `SIN OWNER ⚠` sí es señal real (12 órdenes, incluida SO11258 de $2.3M de Terra Energy).
**Impacto en T3:** el `user_id` que asigna el WF de captura es lo único que empezará a generar atribución real. **El módulo comercial es, de facto, el arranque de la atribución por vendedor en FTS.**

### 🟡 RIESGO-4 — 275 borradores (51%) nunca enviados

Ni ganados ni perdidos: invisibles. No sé si son basura o fuga sin revisión humana. Vale una muestra manual de 20 antes de decidir si el watchdog debe vigilarlos también (hoy no lo hace: sólo mira `sent`).

### 🟡 RIESGO-5 — Ruido de portal web mezclado con venta real

Órdenes de `Public user` por $0, $1.16, $1.68; 50 cancelaciones USD de ~$44. Contaminan conteos y hunden el win rate de <200K. Un filtro de monto mínimo (ej. ≥$1,000) limpiaría el análisis. No aplicado en este baseline para no ocultar el fenómeno.

### 🟢 Campos que SÍ están sanos

`state`, `create_date`, `date_order`, `partner_id`, `company_id` están poblados y son confiables en el 100% de las 541 órdenes.

---

## 7. Verificación cruzada

La distribución por rango se calculó por **dos vías independientes** que coinciden exactamente:
1. Agregación server-side en Odoo (`formatted_read_group` con dominios por bucket).
2. Bucketing client-side sobre los 80 registros crudos de `state=sale`.

Ambas dan 58 / 14 / 6 / 1 / 1. Los conteos de este baseline son reproducibles.

---

## 8. Recomendaciones (orden de impacto)

1. **Atribución de vendedor** — sin esto no hay gestión comercial posible. El WF `comercial/captura` (T3) es el primer paso; falta migrar `Sales FTS` a usuarios reales.
2. **Auditar los 275 borradores** — es la mitad del esfuerzo de cotización sin destino conocido.
3. **Limpiar las 127 órdenes empresa-1-en-USD** — hoy cualquier reporte financiero por monto es indefendible.
4. **Timestamp de envío** — un campo con la fecha de transición a `sent` habilita las 2 métricas de ciclo que hoy son ciegas. Requiere Studio (fuera del alcance MVP, ver `ROADMAP.md`).
5. **Filtro anti-ruido de portal** — separar carritos web de cotización industrial.
