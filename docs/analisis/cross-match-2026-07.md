# Cross-match — líneas Jeeves sin conciliar ↔ documentos (2026-07-24)

> Read-only, Odoo JSON-RPC directo. Universo: `journal 61, is_reconciled=false`. **FONDEOs excluidos** del denominador (no son compras).
> Pools de candidatos por línea: monto ±$0.01 + fecha ±5 días.

## Resumen X / Y / Z
| Bucket | Qué es | Líneas | $ (abs) | candidato único | múltiples |
|---|---|---:|---:|---:|---:|
| **X directo** | bills ABIERTOS (cta 17 + 285) | 26 | $18,475.7 | 23 | 3 |
| **Y desenredo** | bills PAGADOS vía Manual:BILL | 434 | $884,378.82 | 394 | 40 |
| **Z sin doc** | ningún candidato | 1321 | $1,957,372.49 | — | — |
| **TOTAL** | (excl. FONDEO) | 1781 | $2,860,227.01 | | |

**FONDEOs (aparte, no compras):** 33 líneas, $2,805,537.96 (recargas de línea de crédito, no gasto).
**Pools:** bills abiertos cta 17 = 92 · abiertos cta 285 = 25 · pagados-vía-Manual:BILL (cta 17) = 782.

## Desglose por mes (conteo de líneas)
| Mes | X | Y | Z |
|---|---:|---:|---:|
| 2023-06 | 0 | 0 | 1 |
| 2023-12 | 0 | 0 | 3 |
| 2024-01 | 0 | 0 | 15 |
| 2024-02 | 0 | 0 | 24 |
| 2024-03 | 0 | 0 | 2 |
| 2025-01 | 0 | 0 | 2 |
| 2025-08 | 0 | 0 | 1 |
| 2025-12 | 0 | 0 | 1 |
| 2026-01 | 7 | 2 | 159 |
| 2026-02 | 3 | 66 | 181 |
| 2026-03 | 1 | 74 | 307 |
| 2026-04 | 0 | 71 | 264 |
| 2026-05 | 7 | 4 | 301 |
| 2026-06 | 5 | 125 | 41 |
| 2026-07 | 3 | 92 | 19 |

## Interpretación

**La historia está en el mes:** el proceso del equipo MADURÓ en 2026.
- **Jun-Jul (proceso maduro): ~80% documentado.** Jun 130/171 (76%) · Jul 95/114 (83%). Aquí vive casi todo el Y (desenredo).
- **Ene-May: mayoría Z.** Feb-Abr ~20-28% (sí hay bills pero muchos sin) · **May 3.5%** (solo 1 Manual:BILL ese mes) · Ene 5%. Backlog legacy sin documentar.
- **Pre-2026:** ~50 líneas, 100% Z (arrastre viejo).

**Buckets accionables:**
- **X — Conciliable directo: 26 líneas / $18,475.70** (23 único, 3 múltiples). El motor v2 las toma **agregando la cuenta 285 al pool** (hoy invisibles). Barato, inmediato.
- **Y — Recuperable vía desenredo: 434 líneas / $884,378.82** (394 único, **40 múltiples**). Fase 3: unwind del Manual:BILL → reconciliar línea real contra el bill → borrar el duplicado (limpia el 223). **Los 40 múltiples** (2+ bills mismo monto+fecha) necesitan desempate manual/comprador — el resto es desenredo limpio.
- **Z — Sin documento real: 1,321 líneas / $1,957,372.49** — pero **concentrado en meses viejos** (ene-may + pre-2026). Es gasto de tarjeta legacy sin bill → decisión aparte (documentar retroactivo con Gera / castigo). El proceso nuevo (exigir bill por cargo) evita que crezca.

**Bottom line:** de las 1,781 líneas, **460 (26%) son accionables ya** ($903k: 26 directo + 434 desenredo); las 1,321 restantes ($1.96M) son backlog legacy no-documentado, casi todo pre-junio. **En los meses del proceso maduro (jun-jul) el motor v2 + desenredo cubren ~80%.**

_Generado por scratchpad/crossmatch.js (read-only, sin exponer credenciales)._
