# Backlog Maestro — Carga MO / Fase 2 / FTS Suite Operaciones

> Compilado 2026-07-17 a partir de: `FASE2_DISTRIBUIDOR_V1_SPEC.md`, `FASE15_CUENTAS_WATCHDOGS.md`,
> `FASE2_SCRIPTS_F12.md`, `INCIDENTES/2026-07-13_odoo_distribution_model_crash.md`,
> `DIAGNOSTICO_CARGA_MO.md`, `FRENTE_A_PLAN.md`, `FRENTE_B_BLOQUEO_GASTOS.md`,
> `AUTOMATIZACION_PROYECTOS.md`, `INVENTARIO_ANALITICO.md`, `DEUDA_STUDIO.md`, `MIGRACION_PROJECT_ID.md`.
>
> **Prioridad:** P1 = dinero mal medido · P2 = seguridad · P3 = limpieza/estructura.
> **Tamaño:** S / M / L.
> Fuente de verdad viva; actualizar al cerrar ítems. Verificar contra los docs y CLAUDE.md antes de re-hacer.

---

## 🟦 CC (construcción Claude Code)

| # | Ítem | Tam | Prio | Notas |
|---|---|---|---|---|
| CC-1 | **Validación presupuestal al confirmar** (badges horas-dia + candado server-side + popups) | M | P1 | Regla nueva 2026-07-17. **EN CURSO (Tanda 1)** |
| CC-2 | **Backfill SEM 1-27/2026** + parseo WhatsApp de planes de Felipe | L | P1 | Frontera: última carga manual 26-dic-2025. Insumo Excel Ulises + Felipe confirma |
| CC-3 | **A1 backfill de budgets** (SOs con proyecto sin budget / esqueletos −1) | M | P1 | Rama backfill dedicada, no construida |
| CC-4 | **Migración `x_studio_project_id`** PASO B-E (bug ~1,432 att con project-id en campo SO) | M | P1 | PASO A lo crea Esteban en Studio (bloqueante). Plan en `MIGRACION_PROJECT_ID.md` |
| CC-5 | **Candado triple V1.1** (attendance marcada "costeada" con id de su analytic.line) | M | P1 | Anti re-costeo al re-correr semana |
| CC-6 | **Audit D**: 9 proyectos stage 13 + 11 líneas Budenheim/HMI post-cierre → cola de excepción | S/M | P1 | |
| CC-7 | **Ficha costo empleado** + watchdog variación nómina 10% + tentativo diario en pesos | M | P1 | Datos Esteban/Ulises |
| CC-8 | **A4 rent-proy** / **A5 rent-emp** (paneles rentabilidad) | L+L | P1 | Depende A1+A2. Módulos reservados en manifest B2 |
| CC-9 | **Bloque B: alta RH 3 campos obligatorios** | M | P1 | codigo_contpaqi + cuenta_indirecta_default + decisión solo_bolsa. **Cierre de Tanda 1** |
| CC-10 | **PR-2**: checkout lee `x_studio_cuenta_indirecta_default` | M | P1 | Depende de E-9 |
| CC-11 | **HMAC webhooks** (horas-dia, confirmar-horas, kiosk) | M | P2 | confirmar-horas ESCRIBE a producción |
| CC-12 | **Auditar TZ de todos los Schedule triggers** n8n | S/M | P2 | Instancia en America/New_York; crons sin `timezone:UTC` desfasados |
| CC-13 | **W4 idempotencia** (staticData) del watchdog | S | P3 | Re-reporta mismos res_id 30 días |
| CC-14 | **Endpoint `ops/semaforo`** (webhook GET) + **frontend `operaciones/semaforo/`** | M+L | P3 | |
| CC-15 | **PR-7 version-check** en kiosk (confirmar-horas ya lo tiene) | M | P3 | |
| CC-16 | **Duplicados de cuentas por SO (B.5)** + escaneo completo | M | P3 | La etiqueta "B.5" no se halló en docs; requiere el escaneo |
| CC-17 | **Auditar Phase 0** (~41 cuentas archivadas, no 7) + cruzar con B.4 | M | P3 | |
| CC-18 | **19 cuentas activas sin proyecto vivo (B.4)** cruzar con archivado Frente B | M | P3 | |
| CC-19 | Roadmap FASE15/§6: **B** cron 2am · **C** Mi Nómina · **E** planeación F4 · **F+G** Stripe/tesorería | L | P3 | Estados abajo |
| CC-20 | Crons Odoo 111/112 (auto check-out nativo) verificar no choquen con auto-cierre FTS | S | P3 | |

## 🟩 Esteban (Studio / F12 / Railway — MCP Odoo es read-only)

| # | Ítem | Tam | Prio | Notas |
|---|---|---|---|---|
| E-1 | **Poblar montos reales** de budgets: 6 bolsas + líneas 1177 placeholder −1 (3038, 3091, 3094, **3083/línea 2522**) | M | P1 | Montos de cotización |
| E-2 | **Extender `date_to` Magnekon 668** budget 1177 → 2026 | S | P1 | Script F12 listo (SCRIPTS C.1) |
| E-3 | **Crear Chiller 3071** budget.line 1177 | S | P1 | Script F12 listo (SCRIPTS C.2) |
| E-4 | **Migración PASO A**: crear `x_studio_project_id` en hr.attendance | S | P1 | Bloquea CC-4 |
| E-5 | **N8N_ENCRYPTION_KEY** persistente en Railway + respaldo | S | **P2 (esta semana, Esteban)** | Si se pierde, TODAS las credenciales ilegibles |
| E-6 | **Rotar secreto HMAC filtrado** (pmo/chat-apply) | S | **P2 (esta semana, Esteban)** | Secreto en `pmo/index.html` (cliente) + 2 docs |
| E-7 | **Planes muertos**: eliminar 16/19 + eliminar 7/9 tras quitar 12 applicability | S/M | P3 | plan7: 24,42,60,78,132,150 · plan9: 25,43,61,79,133,151 |
| E-8 | **Crear cuentas plan-2 faltantes**: DIRECCION + ADMIN DE OPERACIONES | S | P3 | Bloquea consolidación admin |
| E-9 | **`x_studio_cuenta_indirecta_default`** en hr.employee + poblar 34 + exponer en /kiosk/empleados | M | P1 | Bloquea PR-2 (CC-10) |
| E-10 | **Higiene plan-2**: archivar 11 one-off (767,769,770,788,784,778,698,623,649,369,294) + consolidar 771/383/636 | M | P3 | |
| E-11 | **Consolidar planes 5/8/11/13** (fase 2, ALTO riesgo — toca A3 OK_ROOTS reglas 56/57) | L | P3 | No big-bang |
| E-12 | **Consolidación multicompany** planes 1/18 + USA plan1/2 + mover 663/842 a plan2 | L | P3 | Bloqueante: reescritura de analytic.line en SaaS |
| E-13 | **Limpieza data de prueba Odoo**: attendances prueba; A1 SO11759/11760 (AA 3081/3080, proy 2347, budget 391/390); A3 BILL2765/2766/P06493 vendor 2260; FrenteB 2344/3078; analíticas 3068-3070 | S | P3 | |
| E-14 | **Deuda Studio** Tier1 (11 campos) / Tier2 (~9 m2o) / Tier3 (clusters ~50 planeación legacy) | M/L | P3 | Revisar refs de vista antes de borrar |
| E-15 | Subsistema **retardos** (5 campos) — confirmar muerto antes de borrar | S | P3 | |
| E-16 | **Zombies ~41** "10441/SO10441" archivar | M | P3 | |
| E-17 | **Ticket soporte Odoo** issue #275850 (incidente 13-jul) + compañía id 5 sin nombre | S | P3 | |
| E-18 | Semáforo **#7 botón Confirmar SO** (x_studio_product_type obligatorio, Studio) | M | P3 | |
| E-19 | **work_email Felipe** en Odoo (felipe.perez0305@gmail.com → felipe@fts.mx) | S | P3 | |
| E-20 | **Repartir 2 PDFs** capacitación semáforo | S | P3 | |
| E-21 | Activar/togglear watchdog-mo + one-shot 0a limpieza | S | P3 | |

## 🟧 Gerardo (finanzas — junta próxima semana, ver one-pager)

| # | Ítem | Tam | Prio | Notas |
|---|---|---|---|---|
| G-1 | **AJUSTE-HISTORICO-FINAL +4,105,043.26** (31-dic-2024) — reclasificar/limpiar | S/M | P1 | Artefacto de conciliación, sin eje |
| G-2 | **A3 retro-atribución $24.6M** sin proyecto (~15 proveedores, ~50 bills) | L | P1 | Costo de proyecto fugado |
| G-3 | **Clarios SO7207** (cuenta 479) balance $3.5M artefacto de fuga | M | P1 | Cuenta ya archivada |
| G-4 | **80 facturas cliente huérfanas sin SO** (24 sin cobrar, hasta $588k) | L | P1 | ¿por qué YIN factura sin SO? ligar retro + prevenir |
| G-5 | **5,649 asientos in_payment** — conciliación bancaria BBVA | L | P1 | Distorsiona cash real / cartera |

## 🟨 Ulises

| U-1 | **Excel CONTPAQi semanal** para el backfill SEM 1-27 (insumo de CC-2) | M | P1 |
| U-2 | **Ulises como usuario de la página** de carga (V1.1) | S | P3 |

## 🟪 Ana Laura (RH)

| AL-1 | **Incidencias pendiente_rh de Germán y Gibrán (9-jul)** → acción terminal | S | P1 |

## 🟫 Felipe (ops)

| F-1 | **Backlog corregible ✎→513**: attendances sin atribución de Eduardo 153 / Erick 149 / Gerardo 59 (7-9 jul, por cache) — corrección 1-clic | S | P1 |
| F-2 | Confirmar planes (imagen = manual) para el backfill (con CC-2) | M | P1 |

## Capas futuras V1.1+ (CC/Esteban, P3, todas L)

Carga patronal **SUA + ISN** · fondo de ahorro (columna Z) · conciliación bancaria **BBVA México→Nómina** ·
**geocercas dinámicas** · asignación manual de la semana (cascada dinero-sin-horas) ·
evento kickoff en calendario (Azure `Calendars.ReadWrite`).

## Estados roadmap FASE15 / CLAUDE §6

- **B (24/7):** parcial — auto-rescate reactivo F1.5 ✅; **cron 2am auto-cierre pendiente**.
- **C (Mi Nómina):** no iniciado.
- **D (costeo proyecto):** en curso vía Frente A (A1-A5).
- **E (planeación vs ejecución):** módulo `planeacion`/F4 parcial; auto-aprobación HE dentro de plan pendiente.
- **F+G (Stripe/tesorería):** no iniciado.

## ✅ Ya DONE (docs desactualizados — NO re-hacer)

A1 en producción (`u7Ni2cRAxu3zfBid` crea budget al confirmar SO) · A3 candado bills/POs (reglas 56/57 activas) ·
Frente B (2 workflows activos) · tope 3 reintentos automatización SO→proyecto · 5 productos `service_tracking` en 'no' ·
correo handoff M365 (Parte B) · go-live SEM 28 (36 líneas 60057-60092) · cutover `unlink [47,48,9]` ·
códigos CONTPAQi + solo_bolsa poblados (10) · candado UI solo_bolsa #2 + W5 watchdog (2026-07-17).

---

## Tandas de trabajo propuestas

**Tanda 1 — Blindar el dinero en el punto de captura (P1):** CC-1 (validación presupuestal) → E-1/E-2/E-3 (poblar budgets) → CC-9 (alta RH).

**Tanda 2 — Recuperar historia y verdad de costos (P1):** CC-4 (migración project_id) → CC-2 + CC-3 (backfill) + Gera G-1/G-2.

**Tanda 3 — Seguridad + rentabilidad + higiene (P2/P1/P3):** CC-11/E-5/E-6/CC-12 (seguridad) → CC-8 (rent-proy) → E-7/E-13/E-8 (higiene).

> Nota: E-5 y E-6 los ejecuta Esteban esta semana (riesgo de seguridad activa), fuera del orden de tandas.
