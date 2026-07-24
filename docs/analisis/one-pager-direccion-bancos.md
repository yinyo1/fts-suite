# Conciliación bancaria Jeeves — hallazgo y plan (Dirección)

**Fecha:** 2026-07-24 · **Preparó:** Finanzas/Sistemas · **Fuente:** Excel de Gera + forense Odoo (read-only)

---

## Situación en una línea
Hasta esta semana **no existía conciliación bancaria automática** de la tarjeta Jeeves. El equipo cerraba el ciclo del gasto con un **pago manual por cada bill** — correcto en intención, pero con un costo invisible que ya cuantificamos.

## Los números de hoy (crudos)
| Métrica | Valor |
|---|---|
| Desviación del saldo contable del banco Jeeves (cta 223) | **−$1,245,329** (≈82% del saldo es ficción por el duplicado) |
| Ritmo del duplicado manual | **~30-60/semana, ACTIVO** (crece cada semana) |
| Documentación real jun-jul (proceso maduro) | **~80%** (jun 76% · jul 83%) |
| Backlog viejo (ene-may + pre-2026) | **mayoría sin documento** |
| Calidad analítica de los bills del equipo | **100%** con proyecto+rubro |

## Cross-match del backlog (1,781 líneas sin conciliar, FONDEOs aparte)
| Bucket | Líneas | $ | Acción |
|---|---:|---:|---|
| **Conciliable directo** | 26 | $18,476 | motor v2 (agregar cuenta 285) |
| **Recuperable (desenredo)** | 434 | $884,379 | Fase 3 (limpia el banco) |
| **Sin documento (legacy)** | 1,321 | $1,957,372 | decisión aparte (casi todo pre-junio) |

→ **460 líneas ($903k) accionables ya.** El $1.96M sin doc es **legacy pre-proceso**, no gasto nuevo.

## El proceso del equipo era correcto
Su bill trae la **analítica de proyecto** (a qué obra cae el gasto) — algo que un CFDI del SAT nunca sabría. **Son la fuente de verdad.** El único problema: el paso manual de "pago" duplicaba el banco. Se los quitamos, no se los cambiamos.

## Plan en 3 fases
1. **Proceso (ya):** motor de conciliación automática vivo (canary en producción, noche 1 limpia). **Corte "cero Manual:BILL nuevos"** tras la sesión con el equipo → detiene la hemorragia.
2. **Desenredo (Fase 3):** limpiar los ~460 duplicados existentes → **corrige los $1.245M del saldo bancario**. Read-only ya mapeado; ejecución con gate.
3. **Motor v2 + backlog:** ampliar el pool (cuenta 285), señales monto→fecha→comprador; y **decidir con Gera** el destino del $1.96M legacy sin documento (documentar retroactivo vs castigo).

## Decisiones que pedimos
- ✅ Aval al **corte de proceso** (fecha).
- ✅ Aval a **Fase 3 (desenredo)** con gate de validación.
- 🔲 Sesión con Gera para el **backlog legacy** ($1.96M) — vía separada.
