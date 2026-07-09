# Histórico de atribución analítica — campo `x_studio_many2one_field_GUbBF` (era "Analytic 1/2")

Archivo de datos: [`gubbf_ago2025-ene2026.csv`](gubbf_ago2025-ene2026.csv) — **2,381 attendances**, rango de `check_in` **2025-08-22 → 2026-01-29** (UTC).

Extraído de Odoo (`hr.attendance`, read-only, UID 2) el 2026-07-08 con el dominio `x_studio_many2one_field_GUbBF != false`, ordenado por `check_in asc`. Ninguna fila quedó sin cuenta ni sin empleado.

Columnas del CSV:

| Columna | Origen Odoo | Notas |
|---|---|---|
| `id` | `hr.attendance.id` | entero |
| `employee_id` | `employee_id[0]` | entero |
| `employee_nombre` | `employee_id[1]` | texto (entre comillas) |
| `check_in` | `check_in` | ISO 8601 UTC (`+00:00`) |
| `check_out` | `check_out` | ISO 8601 UTC; vacío si nunca cerró |
| `worked_hours` | `worked_hours` | horas decimales (valor Odoo tal cual) |
| `cuenta_id` | `x_studio_many2one_field_GUbBF[0]` | id de la cuenta analítica |
| `cuenta_nombre` | `x_studio_many2one_field_GUbBF[1]` | nombre de la cuenta (entre comillas; incluye emojis 🛠️, acentos y en-dashes) |

---

## 1. Qué es

Esta es la atribución analítica de mano de obra (MO) de la era **"Analytic 1/2"** (aprox. **agosto 2025 → 29 de enero de 2026**), tal como se capturaba en el campo Studio `x_studio_many2one_field_GUbBF`.

Los valores son **MIXTOS**: conviven **centros de costo (plan 2, indirectos)** con **proyectos (plan 1)** en la misma columna. Así se usaba el campo en aquella época:

- **"Analytic 1"** = el proyecto/cuenta principal del día del empleado.
- **"Analytic 2"** = un segundo proyecto/cuenta cuando la jornada se partía entre dos frentes, editado a mano por operaciones/administración.

Por eso en el CSV aparecen tanto proyectos reales facturables (p. ej. `🛠️ SO9428 - INSTALACION DE SUMINISTRO DE AGUA FRIA - VERTIV`, `SO10792 - ... plumas planta Optima - JOHNSON CONTROLS`) como cuentas de estructura/indirectos (p. ej. `SO7596 - CENTRO DE COSTO VENTAS`, `SO7597 - RH DE ADMINISTRACION`, `SO7599 - COMPRAS`, `SO8205 - CENTRO DE COSTOS OFICINA ADMINISTRACION Y TALLER FTS`). No hay separación por plan dentro del dato: hay que resolver cada `cuenta_id` contra su plan de la época para clasificarla.

Distribución por mes de `check_in` (YYYY-MM):

| Mes | Attendances |
|---|---|
| 2025-08 | 132 |
| 2025-09 | 415 |
| 2025-10 | 487 |
| 2025-11 | 453 |
| 2025-12 | 465 |
| 2026-01 | 429 |
| **Total** | **2,381** |

---

## 2. Por qué se preservó

**Es la ÚNICA atribución de MO de esa era.** No existe otra fuente que diga a qué proyecto/centro de costo se cargó el trabajo de cada empleado entre agosto-2025 y enero-2026.

- El **backfill** posterior de `x_studio_project_id` (el campo de proyecto nativo/moderno, que reemplazó a `x_studio_sales_order_2`) solo cubrió **abril-2026 en adelante**. Estos 2,381 registros quedaron fuera de ese backfill: se verificó que **2,380 de 2,381 tienen `project_id` vacío**.
- El campo `x_studio_many2one_field_GUbBF` **se limpió DESPUÉS de este export**, porque cambió de significado: hoy se usa como **bolsa indirecta default** (Fase 1.5 Parte 10). Ver [`docs/operaciones/FASE15_CUENTAS_WATCHDOGS.md`](../../operaciones/FASE15_CUENTAS_WATCHDOGS.md).

Es decir: una vez limpiado el campo en Odoo, este CSV es el respaldo definitivo de esa atribución. Si se pierde, no se puede reconstruir desde Odoo.

---

## 3. Cómo usarlo si se reorganiza el costeo

Si en el futuro se quiere reconstruir el costo de MO por proyecto/centro de costo de esa era:

1. **Mapear `cuenta_id` contra los planes analíticos de la época:**
   - **Plan 1** = proyectos (facturables / CAPEX cliente).
   - **Plan 2** = indirectos / centros de costo (ventas, RH, compras, legal, oficina/taller, etc.).
   - ⚠️ **Incluye cuentas hoy archivadas.** Varias de estas cuentas ya no están activas. Al resolver los nombres/planes desde Odoo, usar `active_test=false` (o `active in [true,false]`) para no perder las archivadas.
2. **Cruzar con costos/hora históricos** de cada empleado (categoría de nómina de la época) para obtener el costo retroactivo de MO por cuenta. `worked_hours` ya viene en horas decimales; recordar las reglas LFT (9.6 h pagadas / 0.5 h comida sin paga por jornada de 10.1 h de presencia).
3. **Referencias de contexto** para entender la estructura analítica y el diseño de la carga de MO:
   - [`docs/finanzas/INVENTARIO_ANALITICO.md`](../INVENTARIO_ANALITICO.md) — inventario de planes y cuentas analíticas.
   - [`docs/finanzas/DIAGNOSTICO_CARGA_MO.md`](../DIAGNOSTICO_CARGA_MO.md) — diagnóstico de cómo se carga la MO.

> Nota de zona horaria: los timestamps están en **UTC** (`+00:00`). Para agrupar por día operativo de Monterrey (CST/CDT) hay que restar el offset local antes de cortar por fecha.
