# Fase 3 — bitácora de consultas a Odoo

Todas por el MCP `FTS_Odoo` (solo lectura), 2026-09-28. Empresa: SERVICIOS FTS (`company_id = 1`).
Fechas de dominio: el MCP las interpreta como días completos de America/Monterrey (UTC−6).
Las salidas del MCP truncan cada texto a 40 caracteres (descripciones, nombres de línea, nombres largos).

| # | Modelo | Dominio | Campos / groupby | Filas | Para qué |
|---|---|---|---|---|---|
| Q1 | `sale.order` | `date_order >= 2024-09-28`, `company_id = 1` | groupby `state` | 4 grupos: sale 185 · sent 275 · draft 545 · cancel 65 | Universo |
| Q1b | `sale.order` (describe) | filtro `x_studio` | — | 116 campos x_studio | Encontrar `x_studio_proyect_description`, `x_studio_alcance_del_proyecto_descripcion`, `x_studio_planta` |
| Q2 | `sale.order` | Q1 + `state = 'sale'` | id, name, partner_id, partner_shipping_id, date_order, amount_untaxed, currency_id, x_studio_proyect_description, x_studio_alcance_del_proyecto_descripcion, x_studio_materiales_considerados, x_studio_business_unit, x_studio_product_type, x_studio_cotizador, project_id, client_order_ref, invoice_status | 185 | Parte A |
| Q3 | `sale.order` | Q2 | groupby `partner_shipping_id` | 39 grupos | Ids de dirección de entrega |
| Q4 | `res.partner` | ids 94, 897, 880, 815, 895, 1630, 7, 66, 1945, 2269, 943, 453, 2022, 670, 516, 1502, 1927, 722, 596, 2021, 1745, 2260, 872, 948 | id, name, type, parent_id, street, city, state_id | 24 | Ciudad de la dirección de entrega → resultó ser el domicilio FISCAL del cliente (Nalco = Santa Fe CDMX, Mondelez = Puebla), no la planta |
| Q4b | `res.partner` | name ilike JOHNSON CONTROLS ENTERPRISES / British American Tobacco / HISENSE / Lau Industries / TRANSPELSA / (2 contactos persona fisica) | ídem | 9 | Completar ciudades |
| Q5 | `sale.order.line` | `order_id.date_order >= 2024-09-28`, `order_id.company_id = 1`, `order_id.state = sale`, `display_type = False` | id, order_id, sequence, name, product_id (+ columnas de relleno), orden `order_id, sequence, id` | 496 (3 páginas: 200 + 200 + 96) | Primeras 3 líneas por SO. La página 3 (96 filas) llegó en línea y sus primeras líneas se copiaron a `lines_p3.tsv` (30 SO) |
| Q5b | `sale.order.line` | order_id.name in 15 SO con asistencia | order_id, name | 55 | Entender los trabajos con asistencia |
| Q6 | `hr.attendance` (describe) | filtro `x_studio` | — | 12 campos | `x_studio_sales_order_2` (m2o sale.order), `x_studio_project_id` (m2o project.project), `x_studio_many2one_field_GUbBF` (bolsa) |
| Q7a | `hr.attendance` | `check_in >= 2024-09-28` | groupby `x_studio_sales_order_2` | 22 grupos; 9,491 de 11,562 sin valor | Cobertura del vínculo SO |
| Q7b | `hr.attendance` | ídem | groupby `x_studio_project_id` | 21 grupos; 9,489 sin valor | Cobertura del vínculo proyecto |
| Q7c | `hr.attendance` | ídem | groupby `x_studio_many2one_field_GUbBF` | 7 grupos; 10,638 sin valor; con bolsa: VENTAS 303, ADMINISTRACION 268, ADMIN DE OPERACIONES 243, LEGAL 56, RH 52, DIRECCION 2 | Oficina/overhead |
| Q7d | `hr.attendance` | ídem | groupby `check_in:month`, `x_studio_sales_order_2` | 70 grupos | Desde cuándo hay vínculo: primer mes con datos = 2026-04 (más 1 registro en 2025-08) |
| Q7e | `hr.attendance` | ídem | groupby `x_studio_sales_order_2`, `x_studio_project_id` | 25 grupos | **Cruce que prueba que el id guardado en `x_studio_sales_order_2` es el id del PROYECTO** (ver resultados §0) |
| Q8a | `sale.order` | ids 2302, 121, 160, 2349, 212, 2352, 241, 155, 2375, 2305, 2327, 515, 506, 28, 9568, 2337, 2356, 126, 2328, 101, 2297 | id, name, partner, company, date_order, state, amount, descripción | 21 | Los "SO" del campo SO de asistencia son SO de 2019-2022 (SO121 Rittal 2019, SO2286 Mondelez 2022…) |
| Q8b | `project.project` | los mismos ids | id, name, partner_id, sale_order_id, stage_id, company_id, account_id | 20 | Esos ids SÍ son los proyectos correctos (2302 = SO11547, 121 = SO9428, 160 = SO10300…) |
| Q8c | `sale.order` | name in las 20 SO de esos proyectos | id, name, company_id, state, partner_shipping_id, x_studio_planta, x_studio_ciudad_del_punto_de_descarga_1, date_order | 20 | `x_studio_planta` vacío en todas; la "ciudad de descarga" es un campo de fletes (QUERETARO/VILLALDAMA), no sirve |
| Q9 | `hr.employee` | `active in [True, False]` | id, name, department_id, job_title, company_id, active | 132 | Ids de la cuadrilla y de oficina |
| Q10 | `hr.attendance` | `x_studio_project_id != False`, `check_in >= 2024-09-28` | groupby `check_in:day`, `x_studio_project_id` | 375 grupos (2,073 registros) | Control del TSV día×SO |
| Q11 | `hr.attendance` | `x_studio_project_id != False` | groupby `employee_id`, `x_studio_project_id` | 150 grupos | Control por empleado |
| Q12 | `hr.attendance` | `check_in` en 7 ventanas: [2024-09-28, 2025-02-01), [2025-02-01, 2025-06-01), [2025-06-01, 2025-10-01), [2025-10-01, 2026-01-01), [2026-01-01, 2026-04-01), [2026-04-01, 2026-07-01), [2026-07-01, 2026-10-01) | groupby `check_in:day`, `employee_id`, `x_studio_project_id` | 1,165 + 1,562 + 1,772 + 1,684 + 1,602 + 1,915 + 1,667 = **11,367 grupos**, suma de registros = **11,562** (= total de Q7a) | Base de `attendance_dia_empleado_so.tsv`. Se partió en ventanas porque el servidor corta en 2,000 grupos (el intento de una sola consulta salió truncado y se descartó) |
| Q12b | `hr.attendance` | `x_studio_sales_order_2 != False` | groupby día, empleado, SO | truncado a 2,000 → **descartado** | — |
| Q13 | `project.project` / `project.task` | — | — | no se consultó | La etapa del proyecto viene de Q8b |

## Archivos generados

- `so_clasificadas.tsv` — 185 SO (Q2 + Q3 + Q4 + Q4b + Q5).
- `attendance_dia_empleado_so.tsv` — 11,367 filas (Q12). Columna `project_id` = `x_studio_project_id`; `so` = la SO de ese proyecto.
- `attendance_dia_so.tsv` — 375 filas día×proyecto derivadas de Q12 (cuadra con Q10: 375 grupos).
- `fase3_analisis.py` — prep + análisis. `python3 fase3_analisis.py <dir_crudo>` reconstruye los TSV desde las salidas crudas del MCP; sin argumento, solo analiza los TSV.
- `fase3_resultados.json`, `fase3_resultados.md`.
