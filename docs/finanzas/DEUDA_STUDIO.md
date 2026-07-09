# Censo de deuda Studio — Odoo FTS (read-only)

> Estado: censo read-only (MCP UID 2), 2026-07-09. NADA eliminado — inventario para depuración futura de Esteban.

Este documento inventaría los campos custom de Studio (`ir.model.fields` con `state='manual'`) en los 7 modelos con deuda, más las automatizaciones / server actions / crons vivos. El objetivo es una pasada de limpieza posterior: identificar qué se puede borrar, qué está congelado a la espera de una migración, y qué sigue en uso.

**Método:** por cada campo se midió `% poblado` (registros con valor ≠ false ÷ total del modelo) SOLO donde aporta señal (campos con nombre auto-generado de Studio o de propósito desconocido). Los campos claramente de negocio y consumidos por n8n/frontend se marcan `en uso` sin medir. Consumidores verificados vía Grep del repo `fts-suite` + búsqueda en vistas Odoo + conocimiento de los workflows n8n activos (§2/§17 CLAUDE.md).

**Totales de registros por modelo (denominador del % poblado):**

| Modelo | Registros | Campos custom |
|---|---|---|
| `hr.attendance` | 10,117 | 14 |
| `hr.employee` | 34 (activos) | 8 |
| `account.move` | 39,955 | 100 |
| `account.move.line` | 129,915 | 4 |
| `project.project` | 221 | 42 |
| `sale.order` | 10,398 | 118 |
| `product.template` | 14,069 | 1 |
| **TOTAL** | — | **287** |

Sin deuda Studio (0 campos custom): `res.partner`, `hr.department`, `sale.order.line`.

---

## PARTE A — Inventario de campos custom por modelo

### A.1 — `hr.attendance` (14 campos)

| nombre técnico | label | tipo | store/compute | % poblado | consumidores | veredicto |
|---|---|---|---|---|---|---|
| `x_studio_horario_en_disputa` | Horario en disputa | boolean | store | — | n8n (resolver, olvido-*, kiosk); `kiosk.js` | **en uso** |
| `x_studio_incidencia_pendiente_id` | Incidencia pendiente | char | store | — | n8n (TAG disputa) | **en uso** |
| `x_studio_manager_approval` | Manager Approval | boolean | store | — | nómina / n8n | **en uso** |
| `x_studio_human_resources_approval` | Human resources Approval | boolean | store | — | nómina / n8n | **en uso** |
| `x_studio_project_id` | Proyecto | many2one → project.project | store | 1477 (15%) | `kiosk.js`, `confirmar-horas.js`, n8n | **en uso** (target migración) |
| `x_studio_analytic_2` | Cuenta Indirecta | many2one → analytic | related de GUbBF, **no-store** | — | frontend/n8n | **en uso** (es el alias related; el dato real vive en GUbBF) |
| `x_studio_prestamo` | Adelanto Semanal | many2one → res.currency | store | 9695 (96%) | 0 repo | **revisar** (raro: m2o a `res.currency` al 96%; probable residuo de campo monetario mal tipado) |
| `x_studio_many2one_field_GUbBF` | Analytic 1 | many2one → analytic | store | 2381 (24%) | base del related `x_studio_analytic_2` | **congelado-deprecated** (gemelo "Analytic 1" — se elimina cuando la cuenta indirecta se consolide; hoy es el store real detrás de analytic_2) |
| `x_studio_sales_order_2` | Sales Order 2 | many2one → sale.order | store | 1477 (15%) | `kiosk.js` (legacy) | **congelado-deprecated** (se elimina al terminar migración a `x_studio_project_id`; ver §4 CLAUDE.md) |
| `x_studio_tiempo_1` | tiempo 1 | integer | store | 2206 (22%) | 0 repo, 0 n8n conocido | **revisar** (nombre genérico, sin consumidor claro; posible residuo de cálculo de horas viejo) |
| `x_studio_es_retardo` | Es retardo | boolean | store | 199 (2%) | módulo retardos (ver A.2) | **revisar** (parte de un subsistema de retardos poco poblado) |
| `x_send_mail_temp` | Enviar correo temporal | boolean | store | 221 (2%) | módulo retardos | **revisar** (idem) |
| `x_enviar_acto_retardo` | Enviar Acto Retardo | boolean | store | **0 (0%)** | 0 | **huérfano candidato a eliminar** |
| `x_studio_horas_pagadas` | Check finanzas pagado | boolean | store | **1 (0.01%)** | 0 repo | **huérfano candidato a eliminar** |

### A.2 — `hr.employee` (8 campos)

| nombre técnico | label | tipo | store/compute | % poblado | consumidores | veredicto |
|---|---|---|---|---|---|---|
| `x_categoria_nomina` | Categoría nómina (override) | selection | store | — | n8n (CEO lookup, planeación), nómina | **en uso** |
| `x_aplica_ppa` | Aplica PPA | boolean | store | — | n8n | **en uso** |
| `x_studio_cuenta_indirecta_default` | Bolsa default (Cuenta Indirecta) | many2one → analytic | store | — | n8n | **en uso** |
| `x_studio_hora_entrada` | Hora entrada | float | store | 31 (91%) | `kiosk/empleados` v3.1 | **en uso** |
| `x_currency_id` | Currency | many2one → res.currency | store | 33 (97%) | infra (campos monetarios) | **en uso** (infra Odoo) |
| `x_studio_retardos_15_dias` | Retardos últimos 15 días | integer | store | 22 (65%) | módulo retardos | **revisar** (subsistema retardos; ¿activo?) |
| `x_studio_ultimo_retardo_notificado` | ultimo retardo notificado | date | store | 22 (65%) | módulo retardos | **revisar** (idem) |
| `x_studio_link_nomina` | Link Nomina | char | store | **0 (0%)** | 0 | **huérfano candidato a eliminar** |

> **Subsistema "retardos":** los campos `x_studio_es_retardo` / `x_send_mail_temp` / `x_enviar_acto_retardo` (attendance) + `x_studio_retardos_15_dias` / `x_studio_ultimo_retardo_notificado` (employee) forman un mecanismo de notificación de retardos poblado al 2–65%. NO aparece en el repo ni en los workflows n8n activos documentados. **Antes de borrar: confirmar con Esteban si se sigue usando desde Odoo (Automation Rule/cron) — no se halló ninguna viva** (ver Parte B).

### A.3 — `account.move` (100 campos)

**Naturaleza del modelo:** la mayoría (~55) son campos **related no-almacenados** ("New Related Field") que reflejan datos de la SO/PO ligada — bloat de un módulo Studio de "Solicitud de pago / vendor bill". No guardan dato propio (bajo riesgo, pero ensucian vistas). El resto son campos almacenados; se midió su % poblado.

**Campos almacenados EN USO** (módulo solicitud-de-pago / vendor bill, vivo):

| nombre técnico | label | tipo | % poblado | veredicto |
|---|---|---|---|---|
| `x_studio_field_PtsVf` | Sale Order | m2o sale.order (store) | 6496 (16%) | **en uso** (ancla del módulo) |
| `x_studio_many2one_field_RgHGm` | Purchase Order interna de FTS | m2o purchase.order (store) | 2610 (6.5%) | **en uso** |
| `x_studio_tipo_de_pago` | Tipo de Pago | selection (store) | 3371 (8%) | **en uso** |
| `x_studio_tipo_de_solicitud_de_pago` | Tipo de solicitud de pago | selection (store) | 2745 (7%) | **en uso** |
| `x_studio_metodo_de_pago` | Metodo de Pago | selection (store) | 1342 (3%) | **en uso** |
| `x_studio_referencia_higo` | Clave de rastreo Higo | text (store) | 498 (1%) | **en uso** (menor) |
| `x_studio_archivo_factura` | Archivo Factura | binary (store) | 350 | **en uso** (menor) |
| `x_studio_archivo_comprobante` | Archivo Comprobante | binary (store) | 216 | **en uso** (menor) |
| `x_studio_gr_factura` | GR Factura | char (store) | 185 | **en uso** (menor) |

**Campos almacenados HUÉRFANOS (0 poblado):**

| nombre técnico | label | tipo | veredicto |
|---|---|---|---|
| `x_studio_many2one_field_kBG3A` | Sales Order | m2o sale.order (store) | **huérfano** (duplicado de PtsVf) |
| `x_studio_many2one_field_LHHPw` | Purchase Order | m2o purchase.order (store) | **huérfano** (dup de RgHGm) |
| `x_studio_field_QUqJH` | Sale Order | m2m sale.order (store) | **huérfano** |
| `x_studio_field_YvXBa` | Sales Order Line | m2o sale.order.line (store) | **huérfano** |
| `x_studio_field_WDFlJ` | Payment Transaction | m2o payment.transaction (store) | **huérfano** |
| `x_studio_field_YCT9d` | Proyect descripction | m2o → `x_` (relación ROTA) | **huérfano** (relación a modelo `x_` inexistente) |
| `x_studio_many2many_field_sHO2M` | order | m2m → `x_order` (relación ROTA) | **huérfano** |
| `x_studio_many2many_field_0K1hT` | Pedido de venta | m2m sale.order (store) | **huérfano** |
| `x_studio_many2many_field_qBgB6` | Pedido de venta | m2m sale.order (store) | **huérfano** |
| `x_studio_many2many_field_k0Ms3` | Purchase Order | m2m purchase.order (store) | **huérfano** |
| `x_studio_char_field_2zr45` | New Text | char (store) | **huérfano** (auto-Studio) |
| `x_studio_char_field_yi2Va` | New Text | char (store) | **huérfano** (auto-Studio) |
| `x_studio_evidencia_file` | Evidencia FILE | binary (store) | **huérfano** |
| `x_studio_evidencia_checkbox` | Envio de Factura | boolean (store) | **huérfano** |
| `x_studio_po_` | Inv Purchase order | char (store) | **huérfano** |

**Campos almacenados casi-huérfanos (<30 registros):** `x_studio_many2one_field_vUOnA` (Project, 2) · `x_studio_invoice_comments` (5) · `x_studio_evidencia_list` (1) · `x_studio_evidencia_portal` (1) · `x_studio_portal` (28) · `x_studio_ultima_act` (14). → **revisar/huérfano candidato.**

**Campo `revisar`:** `x_studio_po_test` (PO Test, char related-store) 3025 (7.6%) poblado — nombre "test" pero con datos; es un triplicado de `x_studio_po` / `x_studio_po_de_la_sales_order` (los tres related a `PtsVf.x_studio_purchase_order_number`). Consolidar a uno.

**Campos related NO-almacenados marcados literalmente para basura** (nombre = "eliminar"/"borrar"/"no USAR" — 0 dato propio, solo definición + refs de vista):
`x_studio_borrar`, `x_studio_borrar_1`, `x_studio_borrar_3`, `x_studio_bdm_eliminar`, `x_studio_bdm_eliminar_1`, `x_studio_bdm_eliminar_2`, `x_studio_eliminar`. → **huérfanos candidatos** (verificar 0 vistas primero).

> El resto de campos related no-almacenados de `account.move` (`x_studio_field_*`, `x_studio_related_field_*`, `x_studio_project_description*`, `x_studio_po`, `x_studio_gr`, `x_studio_plan`, `x_studio_origen_de_los_fondos_2`, etc.) son espejos de display del módulo solicitud-de-pago. Bajo riesgo (sin dato), pero son ~45 definiciones de campo que se pueden podar si el módulo se rediseña. No se listan una por una — grep del nombre + revisión de vistas antes de tocar.

### A.4 — `account.move.line` (4 campos)

| nombre técnico | label | tipo | store | % poblado | veredicto |
|---|---|---|---|---|---|
| `x_studio_monetary_field_Wkxlm` | New Monetary | monetary | store | **0 (0%)** | **huérfano candidato** (auto-Studio) |
| `x_studio_po_reference` | PO Reference | char | store | **0 (0%)** | **huérfano candidato** |
| `x_studio_po_ref` | PO Ref | char | related (no-store) | — | **huérfano** (espejo de `move_id.x_studio_po`) |
| `x_studio_budget_line` | Budget Line | m2o budget.analytic | related (no-store) | — | **revisar** (related al sistema de budget; probablemente sin uso, pero tocar con cuidado por la cadena analítica) |

### A.5 — `product.template` (1 campo)

| nombre técnico | label | tipo | store | % poblado | veredicto |
|---|---|---|---|---|---|
| `x_studio_po_number` | ID Number | char | store | **1 / 14069 (0%)** | **huérfano candidato a eliminar** |

### A.6 — `project.project` (42 campos)

**Columnas de plan analítico** (m2o → account.analytic.account, store) — casi todas vacías sobre los 221 proyectos:

| campo | plan / label | % poblado | veredicto |
|---|---|---|---|
| `x_plan5_id` | Assets | 25 (11%) | **revisar** |
| `x_plan8_id` | Combustible | 22 (10%) | **revisar** |
| `x_plan18_id` | Gasto directo a proyectos USA | 2 | **revisar** |
| `x_plan2_id` | Gasto Indirecto en FTS | 0 | **huérfano candidato** |
| `x_plan3_id` | Gastos personales Esteban | 0 | **huérfano candidato** |
| `x_plan9_id` | Materiales | 0 | **huérfano candidato** |
| `x_plan20_id` | Upgraded Budget Plan | 0 | **huérfano candidato** |
| `x_plan11/12/13/14/15/16/17/19/21_id` | Inmuebles/Gastos USA/Flota/Ajuste/etc. | 3 (combinado) | **huérfano candidato** (cluster casi vacío) |

> ⚠️ Las `x_planN_id` en project.project son columnas por-plan analítico creadas vía Studio. Casi vacías, pero **antes de borrar confirmar que el budget 2-ejes / rentabilidad nativa no las lee** (la columna primaria de proyecto es `account_id`, no estas — ver §17 CLAUDE.md quirk #3). Riesgo medio.

**En uso (automatización SO→proyecto, §17):**

| campo | label | % poblado | veredicto |
|---|---|---|---|
| `x_studio_many2one_field_RjLNg` | Sales Order | 176 (80%) | **en uso** (idempotencia del workflow `u7Ni2cRAxu3zfBid`) |
| `x_studio_excel_sharepoint` | Excel Sharepoint (related-store) | 118 (53%) | **en uso** |
| `x_studio_budget_analytic` | Budget Analytic | 1 | **revisar** (link desde el lado budget; poblado casi nulo) |

**Selection/compute/one2many no-almacenados a revisar** (0 dato propio, muchos de gestión visual): `x_studio_estatus_administracion` (**label literal "no USAR"** → huérfano candidato), `x_studio_bdm`, `x_studio_champion`, `x_studio_x_commission_approved` (label "eliminar" → huérfano candidato), `x_studio_utilidad`, `x_studio_x_profit_margin_percent`, `x_studio_tiene_sobrepresupuesto`, `x_studio_so_pagada_100`, `x_studio_el_proyecto_cumple_con_la_rentabilidad`, `x_studio_estado_de_comisiones`, `x_studio_status_de_facturas`, `x_studio_coincide_budget_y_sharepoint`, `x_studio_budget_items`, `x_studio_budget_line`, `x_studio_budget_line_1`, `x_studio_file` (label "eliminar"), `x_studio_tipo_de_confirmacin`, `x_studio_excel_gantt`. → **revisar en bloque** (son campos de un tablero de gestión de proyectos Studio; validar cuáles siguen en algún kanban/form activo).

### A.7 — `sale.order` (118 campos)

**En uso — automatización SO→proyecto + budget A1 (§17):**

| campo | label | % poblado | veredicto |
|---|---|---|---|
| `x_studio_analytic_account` | Analytic Account | 2057 (20%) | **en uso** |
| `x_studio_monetary_field_vcA1E` | 2.2 Materiales | 120 (1%) | **en uso** (budget A1: rubro Materiales) |
| `x_studio_presupuesto_mano_de_obra` | Presupuesto Mano de Obra | 103 (1%) | **en uso** (budget A1: rubro MO) |
| `x_studio_handoff_enviado` | Handoff enviado | 70 | **en uso** (correo handoff) |
| `x_studio_proyect_description`, `x_studio_purchase_order_number/file/file_filename`, `x_studio_fecha_inicio_deseada`, `x_studio_fecha_fin_deseada`, `x_studio_project_created`, `x_studio_project_id_created_1`, `x_studio_intentos_proyecto`, `x_studio_proyecto_error`, `x_studio_pending_project`, `x_studio_pending_project_since_1`, `x_studio_generar_proyecto` | (handoff + control del workflow) | — | **en uso** (excepto `generar_proyecto`, ver abajo) |

- `x_studio_generar_proyecto` (Generar Proyecto, boolean, store) → **3 (0.03%) poblado. congelado-deprecated:** era el gatillo manual del workflow; §17 lo marca "Gatillo ELIMINADO — ahora es por domain". Se puede borrar cuando se confirme que ningún workflow lo lee.

**En uso — módulo fletes / logística (Genvamex/Galvaprime):**

| campo(s) | % poblado | veredicto |
|---|---|---|
| `x_studio_ciudad_del_punto_de_carga` | 5062 (49%) | **en uso** |
| `x_studio_factura_genmavex` + `x_studio_folio_galvaprime_1` + `x_studio_folio_genvamex_pracame` (combinado) | 3452 (33%) | **en uso** (cluster fletes) |
| `x_studio_cotizador` | 989 (9.5%) | **en uso** |
| `x_studio_field_8tINA`/`DBmhq`/`a24rp` (Contact) | 7901 (76%) combinado | **en uso** |

> El módulo fletes tiene más campos del mismo cluster (`x_studio_ciudad_del_punto_de_descarga_1`, `x_studio_nombre_del_chofer`, `x_studio_peso_de_la_carga`, `x_studio_fecha_real_del_viaje`, `x_studio_destinatario`, `x_studio_evidencia_fisica`, `x_studio_foto_de_evidencia`, `x_studio_estadia_real`, `x_studio_relacion_genvamex_2`, `x_studio_folio_galvaprime_1`…). Se asumen **en uso** por el fill del ancla (33–49%). No individualmente medidos.

**Cluster PLANEACIÓN LEGACY — candidato fuerte a eliminar** (≈50 campos `x_studio_seccion_N_qty_*` + `x_studio_seccion_N_nombre`):

| representativo | % poblado | veredicto |
|---|---|---|
| `x_studio_seccion_1_nombre` | 107 (1%) | **huérfano candidato (cluster)** |
| `x_studio_seccion_1_qty_supervisores` | 40 (0.4%) | **huérfano candidato (cluster)** |

> Los ~50 campos `x_studio_seccion_1..5_qty_(dias_)supervisores/tecnicos/programadores` + `_nombre` son una herramienta de planeación de cuadrillas embebida en la SO, poblada al ~1%. **Superada por el módulo `planeacion` nuevo** (`planning.slot`, workflows B1/B2/B4, julio 2026). Candidato de limpieza masiva (≈50 defs), pero verificar 0 vistas activas primero.

**Cluster BONOS / comisiones por cliente — casi huérfano:**

| campo(s) | % poblado | veredicto |
|---|---|---|
| `x_studio_clarios_andres_valencia` + `x_studio_clarios_sergio_ongay` + `x_studio_nalco_misael` (combinado) | 6 | **huérfano candidato** |
| `x_studio_jose_luis` (Bono Jose Luis) | 1 | **huérfano candidato** |
| `x_studio_expeditacion` (Comision User Solicitada), `x_studio_navegante`, `x_studio_fehr` | (no medidos, nombres de personas) | **revisar** |

**Cluster HTML vacío (auto-Studio):** `x_studio_html_field_48q_1jr7ig98i` + otros 4 `x_studio_html_field_*` ("New HTML") → 19 combinado → **huérfano candidato.**

**Otros a revisar / near-orphan:**
- `x_studio_presupuesto_materiales` (47) + `x_studio_presupuesto_de_equipos` (1) → **revisar** (versión vieja del presupuesto; posiblemente superada por `x_studio_monetary_field_vcA1E` "2.2 Materiales" y `x_studio_presupuesto_mano_de_obra`).
- `x_studio_business_unit` (96) → **revisar.**
- `x_studio_imagen_ra` + `x_studio_imagen_rittal` (14 combinado), `x_studio_isn_calificacin_a`, `x_studio_pdf_factura_lo_1`, `x_studio_factura_lo_id_numer`, `x_studio_imagen_*` → **revisar** (residuo ingeniería/factura-lo legacy).
- `x_studio_archivo_de_referencia`, `x_studio_archivo_2_de_referencia`, `x_studio_comprobante_de_gastos_1`, `x_studio_liga_sharepoint_presupuesto`, `x_studio_materiales_considerados`, `x_studio_notas_relevantes`, `x_studio_alcance_del_proyecto_descripcion` → **revisar** (campos de captura de proyecto; algunos pueden alimentar el handoff).

---

## PARTE B — Automatizaciones / server actions / vistas vivas

### B.1 — `base.automation` (Automation Rules)

**Solo 2 reglas, ambas activas y LEGÍTIMAS** (candado A3, §17 CLAUDE.md). **Cero residuos de la migración de AA a n8n (abril 2026).**

| id | nombre | modelo | trigger | active | veredicto |
|---|---|---|---|---|---|
| 56 | A3 — Atribucion obligatoria (Bills MX) | account.move | on_state_set | ✅ | legítima (candado duro plan analítico) |
| 57 | A3 — Atribucion obligatoria (POs MX) | purchase.order | on_state_set | ✅ | legítima |

✅ **No hay ninguna otra `base.automation` activa.** Ningún residuo AA resucitado.

### B.2 — `ir.cron` (crons)

78 crons, **todos nativos de Odoo/Enterprise** (Account, Payroll, Mail, Marketing, OCR, etc.). **Ningún cron custom de Studio/FTS.** Dos nativos a tener en el radar por posible traslape con lógica FTS (no son deuda Studio, pero conviene saber que existen):

- id **111** `Attendance: Automatically check-out employees` (activo, modelo Attendance) — auto-checkout nativo de Odoo. ⚠️ Podría interferir con el auto-cierre/auto-rescate de FTS (Bloque B / §11 #12). Verificar su configuración.
- id **112** `Attendance: Detect Absences for employees` (activo).

### B.3 — `ir.actions.server`

195 server actions, dominadas por acciones **nativas de Odoo** (Merge RFQs, Send Email, Create Project, Confirm Entries, AI:*, etc.). En la muestra inspeccionada (100) **no se detectó ninguna server action Studio/code claramente huérfana de FTS**. La migración a n8n dejó la lógica de negocio fuera de Odoo. (Auditoría exhaustiva de las 95 restantes queda fuera de alcance del censo read-only; nada saltó como custom-FTS.)

### B.4 — Vistas Studio huérfanas

No se hizo barrido exhaustivo de `ir.ui.view`. Al eliminar cualquier campo huérfano de Parte A, buscar primero sus referencias con `ir.ui.view.arch_db like '<campo>'` (patrón de la instrucción) — varios de los campos related "eliminar"/"borrar" tienen definición pero deben revisarse por refs de vista antes de borrar.

---

## PARTE C — Resumen priorizado

### C.1 — Conteo por modelo

| Modelo | Custom | En uso | Congelado-deprecated | Huérfano candidato | Revisar |
|---|---|---|---|---|---|
| `hr.attendance` | 14 | 6 | 2 (GUbBF, sales_order_2) | 2 (enviar_acto_retardo, horas_pagadas) | 4 (prestamo, tiempo_1, es_retardo, send_mail_temp) |
| `hr.employee` | 8 | 5 | 0 | 1 (link_nomina) | 2 (retardos_15_dias, ultimo_retardo) |
| `account.move` | 100 | ~9 store + módulo | 0 | ~15 store 0% + ~7 "eliminar/borrar" | ~45 related-mirror + po_test + near-orphans |
| `account.move.line` | 4 | 0 | 0 | 3 (Wkxlm, po_reference, po_ref) | 1 (budget_line) |
| `project.project` | 42 | 3 | 0 | ~10 (planN vacíos + "no USAR"/"eliminar") | ~15 (gestión visual) |
| `sale.order` | 118 | ~20 (proyecto+fletes) | 1 (generar_proyecto) | ~55 (seccion_* legacy + bonos + html) | ~15 |
| `product.template` | 1 | 0 | 0 | 1 (po_number) | 0 |

### C.2 — Lista priorizada de candidatos a eliminar (huérfanos 0% + 0 consumidores primero)

**Tier 1 — 0% poblado, 0 consumidores, tipo simple (bajo riesgo):**

| Modelo | Campo | Tipo | Verificar antes de borrar |
|---|---|---|---|
| product.template | `x_studio_po_number` | char | 0 vistas |
| account.move.line | `x_studio_monetary_field_Wkxlm` | monetary | 0 vistas |
| account.move.line | `x_studio_po_reference` | char | 0 vistas |
| hr.employee | `x_studio_link_nomina` | char | 0 vistas |
| hr.attendance | `x_enviar_acto_retardo` | boolean | 0 vistas + confirmar subsistema retardos muerto |
| hr.attendance | `x_studio_horas_pagadas` | boolean | 0 vistas |
| account.move | `x_studio_char_field_2zr45` | char | 0 vistas |
| account.move | `x_studio_char_field_yi2Va` | char | 0 vistas |
| account.move | `x_studio_evidencia_checkbox` | boolean | 0 vistas |
| account.move | `x_studio_po_` | char | 0 vistas |
| account.move | `x_studio_evidencia_file` | binary | 0 vistas |

**Tier 2 — 0% poblado pero many2one/many2many (revisar constraints + vistas):**

| Modelo | Campo | Tipo | Verificar antes de borrar |
|---|---|---|---|
| account.move | `x_studio_many2one_field_kBG3A` | m2o sale.order | dup de PtsVf; 0 vistas, sin constraint |
| account.move | `x_studio_many2one_field_LHHPw` | m2o purchase.order | dup de RgHGm |
| account.move | `x_studio_field_QUqJH` | m2m sale.order | tabla relación queda huérfana |
| account.move | `x_studio_field_YvXBa` | m2o sale.order.line | — |
| account.move | `x_studio_field_WDFlJ` | m2o payment.transaction | — |
| account.move | `x_studio_field_YCT9d` | m2o `x_` (**relación rota**) | segura de borrar (modelo destino no existe) |
| account.move | `x_studio_many2many_field_sHO2M` | m2m `x_order` (**rota**) | segura |
| account.move | `x_studio_many2many_field_0K1hT` / `qBgB6` / `k0Ms3` | m2m | tablas relación huérfanas |
| account.move.line | `x_studio_po_ref` | char related | espejo, sin dato |

**Tier 3 — clusters (limpieza masiva, verificar 0 vistas activas del grupo primero):**

- **`sale.order` planeación legacy:** ≈50 campos `x_studio_seccion_1..5_qty_*` + `_nombre` (~1% poblado, superados por módulo `planeacion`/`planning.slot`). Alto payoff de limpieza.
- **`sale.order` HTML vacíos:** 5× `x_studio_html_field_*` ("New HTML", 19 combinado).
- **`sale.order` bonos por persona:** `x_studio_clarios_*`, `x_studio_nalco_misael`, `x_studio_jose_luis` (≤6 c/u).
- **`account.move` campos "eliminar/borrar/no USAR":** `x_studio_borrar`, `_borrar_1`, `_borrar_3`, `x_studio_bdm_eliminar`, `_1`, `_2`, `x_studio_eliminar` (related, sin dato).
- **`project.project` "eliminar/no USAR":** `x_studio_estatus_administracion` (label "no USAR"), `x_studio_x_commission_approved` (label "eliminar"), `x_studio_file` (label "eliminar").
- **`project.project` planN vacíos:** `x_plan2_id`, `x_plan3_id`, `x_plan9_id`, `x_plan20_id`, `x_plan11/12/13/14/15/16/17/19/21_id` (⚠️ riesgo medio: confirmar que budget/rentabilidad nativa no los lea).

### C.3 — Congelados-deprecated (NO borrar aún — con condición de borrado)

| Modelo | Campo | Condición para poder borrarlo |
|---|---|---|
| hr.attendance | `x_studio_sales_order_2` | Cuando termine la migración a `x_studio_project_id` (§4 CLAUDE.md) y `kiosk.js`/n8n dejen de escribirlo. |
| hr.attendance | `x_studio_many2one_field_GUbBF` ("Analytic 1") | Es el store real detrás del related `x_studio_analytic_2`. Borrar solo si se consolida la Cuenta Indirecta en otro campo y se re-apunta `analytic_2`. |
| sale.order | `x_studio_generar_proyecto` | Gatillo viejo ya reemplazado por domain (§17). Confirmar que ningún workflow n8n lo lee y borrar. |

### C.4 — Automatizaciones / crons a revisar

- ✅ `base.automation`: solo Reglas 56 + 57 (A3), legítimas. Sin residuo AA.
- ✅ `ir.cron`: sin cron Studio custom. **Radar:** crons nativos **111** (auto-checkout) y **112** (detect absences) de Attendance — verificar que no choquen con el auto-cierre/auto-rescate FTS.
- ✅ `ir.actions.server`: sin server action Studio-FTS huérfana detectada en la muestra.
- ⚠️ **Subsistema retardos** (5 campos en attendance+employee, 2–65% poblado): NO tiene automatización viva hallada (ni AA ni cron ni n8n). Confirmar con Esteban si quedó muerto → si sí, los 5 campos son candidatos de eliminación.

---

### Notas de método / limitaciones

- `%` poblado = `search_count(campo != false) / total_modelo`. Para m2m, el filtro `!= false` cuenta registros con la relación no vacía.
- Campos related **no-almacenados** no se pueden medir por dominio de forma fiable → veredicto por nombre/propósito + grep.
- `hr.employee` total = 34 (solo activos; el filtro por defecto de Odoo excluye archivados).
- Consumidores "n8n" se infieren de la documentación de workflows activos (§2/§17 CLAUDE.md), no de un grep exhaustivo de cada expresión de nodo — marcados como tal.
- **NADA fue eliminado ni modificado en Odoo.** Este censo es 100% read-only.
