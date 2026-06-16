# FTS Suite — Reglas para Claude Code

Este archivo es leído automáticamente por Claude Code en cada sesión dentro del repo `fts-suite`. Documenta arquitectura, workflows productivos, patterns validados, y reglas críticas que evitan repetir bugs ya resueltos.

---

## 1. Contexto del producto

**FTS Suite** es la plataforma interna de Servicios FTS SA de CV (industrial CAPEX/EPC, Monterrey). Stack:

- **Frontend:** GitHub Pages (este repo `yinyo1/fts-suite`), HTML+JS modular sin framework
- **Backend lógica:** n8n en Railway (URL `https://primary-production-5c3c.up.railway.app`)
- **ERP:** Odoo 19 SaaS Enterprise (`https://serviciosfts.odoo.com`), multi-tenant, sin SSH/SQL/módulos custom
- **Storage:** JSON files en el propio repo (fase 1) más Odoo como source of truth

Idiomas del repo: español para UI/textos, inglés para variables/funciones de código.

---

## 2. Workflows n8n productivos (16 activos)

**No tocar sin avisar al usuario.** Cualquier modificación a estos requiere validar primero con `n8n_validate_workflow` y mostrar diff antes de aplicar.

**Importante para Claude Code:** la API de n8n requiere el **ID completo de 16 caracteres** (no el corto). El ID corto es solo la cola del completo, útil para referencia humana pero no invocable. Siempre usar el ID completo en llamadas MCP.

| # | Nombre exacto en n8n | ID completo (API) | ID corto | Notas |
|---|---|---|---|---|
| 1 | `incidencias/crear-olvido-entrada` (F1.1) | `JLiuczUd61xVNp36` | `xVNp36` | 12 nodos. Lookup empleado + Odoo UPDATE TAG (`x_studio_horario_en_disputa` + `x_studio_incidencia_pendiente_id` sobre `check_in`). Snapshot supervisor. **Sprint 1 cleanup (2026-05-12):** CEO_EMPLEADO_ID hardcoded refactorizado a lookup `empleados-master.json` autoprogresivo. Nodo nuevo `HTTP - GET empleados-master.json`. |
| 2 | `incidencias/resolver` (v2.1 F1.1) | `Oc2ceMHX2O0L0y2X` | `0L0y2X` | 20 nodos. TAG management + 4 acciones (sup/rh/dir) + branch tipo (entrada/checkout). Fixes D1-D4 F1.1: respeta `tag_disputa_activo` previo, calcula `aplicaHora` antes de conversión, discrimina `baseUtcStr` por tipo, night-shift fix solo para checkout. Helper `esEstadoTerminal`. |
| 3 | `asistencias/admin` | `Bqnfsx8gx2TpzfwM` | `TpzfwM` | Consultas admin |
| 4 | `accesos-incidencias/guardar (v2.2 auth-fix)` | `HwPq9dqxjy2KETi7` | `2KETi7` | Auth + persistencia |
| 5 | `kiosk/empleados (v3.1)` | `2UGWLjNwYRGtXq5y` | `GtXq5y` | Lookup empleados pre-checkin. **Fix Sprint 1 Fase 3 (2026-05-11):** response ahora incluye `x_studio_hora_entrada`, `x_categoria_nomina`, `x_aplica_ppa` para soportar refactor autoprogresivo de planeación. 8 consumers verificados sin breaking change. |
| 6 | `kiosk/checkin (v4.2 fix respuesta · build 20abr · 00c76071)` | `a7mEjjdwIzzvomXs` | `zvomXs` | **Núcleo del kiosk**. 26 nodos (3 nuevos F1.5: `IF - Auto-rescate?` + `Odoo - UPDATE Auto-rescate Close` + `Code - Continue Auto-rescate`). Auto-rescate huérfana >16h en rama entrada. |
| 7 | `kiosk/cerrar-registro (v2.0 · build 20abr · f020af31)` | `WkgYjDeL2kQInz3H` | `QInz3H` | Cierre manual humano |
| 8 | `kiosk/estado-empleado (v3 Fase 1)` | `U13fngg2dTKgDQ8Y` | `KgDQ8Y` | Estado actual empleado |
| 9 | `dashboard/resumen (v4.3)` | `nNNQrFMTSjIfqHep` | `IfqHep` | KPIs operación |
| 10 | `kiosk/sos (v3.4)` | `m6dyGa0yV1zYPwJF` | `zYPwJF` | Pánico + Bloque B incidentes |
| 11 | `incidencias/crear-olvido-checkout` (F1 v3) | `IRtG38Aknb5SW15h` | `5SW15h` | 16 nodos. Lookup attendance + Odoo UPDATE check_out + TAG. Endpoint moderno reemplaza `/webhook/kiosk/cerrar-registro` (legacy hasta F6). **Sprint 1 cleanup (2026-05-12):** CEO_EMPLEADO_ID hardcoded refactorizado a lookup `empleados-master.json` autoprogresivo (en nodo `Code - Build incidencia`, no Merge). Nodo nuevo `HTTP - GET empleados-master.json`. |
| 12 | `panel/derivar-roles` (F2.1) | `f59LMsbjPmO8pzWu` | `O8pzWu` | 8 nodos. Webhook GET. Read hr.employee + Search reportes_directos via parent_id reverso. Devuelve `roles_derivados` (`['supervisor','rh','direccion']`) auto-derivados. Reemplaza JSON estático eliminado. |
| 13 | `rh/empleados-master/sync` (Sprint 1 Fase 3) | `5nzVRsCMlCZlq5s4` | `q5s4` | 10 nodos, 2 triggers (Schedule 6am CST + Webhook POST). Re-dumpea hr.employee active a `shared/config/empleados-master.json` con _meta auto_synced. Smoke test 2026-05-11: 44 empleados sincronizados en 3.14s. **Primer workflow con Schedule Trigger del sistema** (Bloque B cron 2am pendiente). |
| 14 | `auth/finanzas-login` (Finanzas Paso 1) | `ykNzGCvdjzjdXYhc` | `jdXYhc` | 4 nodos. Login server-side del módulo Finanzas. PBKDF2-SHA256 100k + HMAC-SHA256 JWT (8h), **JS puro** (sandbox sin crypto). Secretos `FINANZAS_*` vía nodo Set `$env`. Lockout 5→15min en `staticData`. ⚠️ **NUNCA exportar el JSON al repo** (§15 #3, tiene secretos). |
| 15 | `fin/facturas-odoo` (Finanzas Paso 3) | `VszW2euwnG3NE37p` | `3NE37p` | 11 nodos. Facturas emitidas (`out_invoice`+`out_refund`) multi-company {1,6}. Valida JWT (reusa cripto de #14) → Odoo SEARCH `account.move`+`res.partner`(vat)+`res.currency.rate`(USD) → Map+summary+paginate. **8/8 smokes verdes** (2026-06-14). Contrato = mock+`buildParams()`, NO PLAN.md §5 (stale). NO exportar al repo. |
| 16 | `fin/bills-odoo` (Finanzas Paso 3) | `sXbg7hiLjJOGH2T1` | `OGH2T1` | 11 nodos. Facturas recibidas (`in_invoice`+`in_refund`). Clon de #15 con `move_types` cambiado y **fix de signo:** Odoo `amount_total_signed` de `in_invoice` es NEGATIVO (cuentas por pagar) → el Map invierte con `sign por move_type + abs()` para salir POSITIVO. Counts control 303/4 + signo confirmado en vivo (2026-06-14). NO exportar al repo. |

**Workflows archivados (19):** ignorar a menos que el usuario lo pida explícitamente para historial.

**Workflows huérfanos INACTIVOS sin uso (3):** `2padPo` incidencias/push, `flXTeF` kiosk/crear-entrada-estimada, `CJdJzP` kiosk/aprobar-ajuste. Candidatos a archivar.

---

## 3. Reglas n8n validadas (no las descubras de nuevo)

Estas reglas vienen de horas de debug. Aplicarlas siempre.

### IF nodes
- `typeValidation` siempre en `"loose"`. Sin esto, comparaciones tipo `value === "true"` fallan silencio.

### Nodo Odoo (community node v2.16.1)
- **CREATE:** sin `operation` explícito, usar `fieldsToCreateOrUpdate`.
- **UPDATE:** `"operation": "update"` + `customResourceId`.
- **READ/SEARCH:** usar `filterRequest` (no `filters`), `value` (no `fieldValue`), `fieldsList` como ARRAY (no CSV string).
- **"Always Output Data":** debe estar en **ON**. En OFF causa fallo silencioso del workflow completo (gravísimo, ya pasó).
- **Bug conocido:** después de importar workflow JSON, el campo `customResource` queda en blanco. Hay que llenarlo manualmente en la UI antes de activar.
- **Expresiones Odoo:** un solo `=` (`={{ }}`) — NO doble `==`. Doble es bug clásico.

### Code nodes (JS)
- Usar `.first()` no `.item` (cambio de v0.x a v1.x).
- Para múltiples items, `$input.all()` retorna array.

### GitHub writes
- NO usar el native GitHub node. Usa **HTTP Request** con Header Auth llamado `"GitHub FTS Suite"`. El native node tiene bugs con archivos binarios y commits batch.
- API endpoint: `https://api.github.com/repos/yinyo1/fts-suite/contents/{path}`.

### Credenciales en n8n
- Odoo credential: `'Odoo FTS'` (ID `Wansi69xesEqEiY1`).
- GitHub credential: `'GitHub FTS Suite'` Header Auth.

### Tras importar JSON
Siempre revisar y rellenar a mano:
1. `customResource` en nodos Odoo
2. Credential en cada nodo (a veces se desasigna)
3. Webhook IDs (n8n los regenera)

### Patterns validados en producción
- **Referenciar nodo no-adyacente:** cuando un Code node necesita output de un nodo Odoo que NO es el inmediato anterior, usar `$('Nombre exacto del nodo').all()` (validado en `crear-olvido-entrada` v3.2).
- **Parsing defensive de Odoo many2one:** los campos many2one (ej. `department_id`) pueden venir como `[id, name]` (array tuple), `{id, name}` (object) o `id` (number) según versión/contexto. Siempre parsear con `Array.isArray()` antes de acceder por índice.
- **Escalación auto a RH:** si lookup Odoo retorna empleado sin departamento, setear `status = 'pendiente_rh'` para saltar supervisor y escalar directo. Patrón implementado en `crear-olvido-entrada`.
- **TAG management para disputa:** custom fields `hr.attendance` (`x_studio_horario_en_disputa` boolean + `x_studio_incidencia_pendiente_id` char) — set al crear incidencia que toca check_in/check_out, cleanup en estados terminales del resolver. Validado en F1 v3 olvido_checkout (4-may-2026) y F1.1 olvido_entrada (5-may-2026, mismo schema, target field `check_in`).
- **Consistencia `tag_disputa_activo` en resolver (F1.1):** el resolver SOLO debe flippear `tag_disputa_activo` si la incidencia entrante lo trae `=== true`. Asignación incondicional `inc.tag_disputa_activo = !esEstadoTerminal(...)` contamina rows legacy (incidencias viejas que nunca escribieron TAG real). Patrón D1: `if (inc.tag_disputa_activo === true) { inc.tag_disputa_activo = !esEstadoTerminal(nuevoStatus); }`.
- **`aplicaHora` antes de conversión UTC (F1.1):** calcular el flag `aplicaHora` (true solo si `accion ∈ {ajustar, rechazar}`) ANTES de intentar convertir HH:MM → UTC. Y la base UTC debe discriminarse por tipo: `olvido_checkout` usa `inc.check_in_original_utc`, `olvido_entrada` usa `inc.hora_real_checkin_utc`. Asumir un único campo base es bug raíz F1.1.
- **Helper `esEstadoTerminal(status)` en Code nodes:** dict con los 5 status terminales (`aprobada_tal_cual`, `aprobada_con_ajuste`, `aprobada_por_direccion`, `rechazada_por_rh`, `rechazada_por_direccion`). Útil para decidir cleanup TAG y estado final.
- **Update Odoo + GitHub PUT en mismo workflow:** patrón validado sin race condition observada en F1 v3. El nodo Odoo UPDATE puede ser previo al HTTP PUT del JSON GitHub (rollback conceptual: si Odoo falla, no se crea la incidencia).
- **`customResource` preservado al crear vía MCP directo:** `n8n_create_workflow` con el field en JSON al momento del POST preserva el valor. Solo el flujo "import JSON desde UI" reproduce el bug de campo en blanco (regla §3 Tras importar JSON).
- **Derivación runtime de roles vía workflow n8n (F2.1):** webhook GET stateless consulta Odoo para derivar roles según jerarquía (`parent_id`) + departamento (whitelist). Cache 5 min en cliente para no fritar Odoo. Reemplaza patrón "JSON estático en repo" (deprecated y eliminado en F2.1). Aplica para panel-incidencias y hub Mi Perfil.
- **Salvaguarda anti-auto-aprobación (F2.1):** filtro adicional en panel asegura que ningún usuario vea sus propias incidencias en NINGÚN tab. Beneficio: protege contra self-approval para casos edge (ej. CEO con rol RH virtual).
- **Snapshot de supervisor + contactos al crear incidencia (F2.1):** workflows `crear-olvido-*` snapshot `parent_id` (como supervisor_id), name, work_email, work_phone/mobile_phone al crear. Garantiza que la incidencia es auditada por quien era supervisor en el momento del incidente, aunque el manager cambie después. Email/phone defensivos (no falla si null).
- **Auditoría obligatoria post-inserción de nodo:** cuando se inserta un nodo entre dos existentes en n8n, todas las expresiones `$json` downstream deben revisarse — el contexto de data flow cambia silenciosamente. Validado en regresión F1.1 → hotfix (5-may-2026): el UPDATE TAG insertado entre `IF Error?` y `READ Empleado` rompió el filterRequest porque `$json.empleado_id` quedó undefined. Patrón seguro: usar `$('Nombre exacto').item.json` para referencias a nodos no inmediatamente upstream, en lugar de depender del `$json` adyacente.

### Tabla de decisión status incidencia (F2.1)

Aplicada en `Code Merge incidencia` de `xVNp36` y `Code Build incidencia` de `5SW15h`:

| Condición empleado                       | Status              | Flag                  | supervisor_id |
|------------------------------------------|---------------------|------------------------|---------------|
| depto NO en `DEPTOS_VALIDOS`             | (sigue, flag para auditar) | `depto_invalido: true` | —      |
| `parent_id == empleado_id` (CEO mismo)   | `pendiente_rh`      | `es_ceo: true`         | null          |
| depto in `DEPTOS_RH` && parent==CEO      | `pendiente_direccion` | `rh_directo_ceo: true` | null         |
| parent_id == CEO (no RH)                 | `pendiente_rh`      | `directo_ceo: true`    | null          |
| parent_id null/inválido                  | `pendiente_rh`      | `sin_supervisor: true` | null          |
| parent_id válido (caso normal)           | `pendiente_supervisor` | —                   | parent_id     |

**Constantes:**
- `DEPTOS_VALIDOS = ['Comercial', 'Dirección', 'Ingenieria', 'Legal', 'Operaciones', 'Recursos Humanos']`
- `DEPTOS_RH = ['Legal', 'Recursos Humanos']`
- `DEPTOS_DIRECCION = ['Dirección']`
- `CEO_EMPLEADO_ID = 32` (Esteban)

⚠️ **`Ingenieria` SIN acento** porque es la configuración real en Odoo (deuda cosmética: corregir el dept name a `Ingeniería` cuando haya tiempo, sin urgencia).

---

## 4. Reglas Odoo

### Plataforma
- **Odoo 19 SaaS** — sin acceso SSH ni SQL directo.
- API: XML-RPC y JSON-RPC (preferir JSON-RPC).
- API key: pedirla al usuario, **nunca hardcodear**.

### Modelos críticos
- **`hr.employee`:** Felipe Pérez Guzmán = ID **112** (no 102, ese es bug histórico).
- **`hr.attendance`:** campo SO link es `x_studio_sales_order_2` (renombrado desde `x_studio_many2one_field_wyDLM`).
- **`hr.attendance` custom fields F1 v3 (4-may-2026):** `x_studio_horario_en_disputa` (id 97921, boolean, default false) + `x_studio_incidencia_pendiente_id` (id 97923, char size 100). Aplicados al crear incidencia olvido_checkout, cleanup en estados terminales del resolver. Cleanup paralelo del sprint: borrados `x_studio_tiempo_2` (id 29492) + `x_studio_tiempo_de_comida_horas` (id 7915) → net 0 nuevas líneas Studio.
- **`account.analytic.line`:** Odoo 19 usa `analytic_distribution` (no `analytic_account_id` como en v16).
- **`resource.calendar`:** debe excluir tipo `lunch` para cálculo correcto de horas trabajadas.
- **Empleados sin `department_id`:** caso real, ya manejado en código. Workflows que dependan de departamento deben tener fallback explícito (escalación a RH o flag `sin_departamento`).
- **`hr.employee` campos relevantes F2.1:** `parent_id` (many2one) es la fuente de verdad para supervisor (jerarquía organizacional). `attendance_manager_id` EXISTE pero está vacío para todos los empleados (no usar). `work_email`, `work_phone`, `mobile_phone` se snapshot al crear incidencia (defensivo, pueden ser null sin romper). Verificado todos los empleados activos tienen `parent_id` poblado al 4-may-2026.

### Reglas de negocio (LFT)
- 48 hrs/semana pagadas Mon-Fri.
- Por día: 10.1 hrs presencia = 9.6 hrs pagadas + 0.5 hr lunch sin paga (Art. 63-64 LFT).
- Overtime: después de 9.6 hrs netas/día.
- Quincena base: 96 hrs.
- Mensual base: ~208 hrs (para `hourly_cost`).

### Auto-cierre attendance (Bloque B en construcción)
- Si >12 hrs sin `check_out` → auto-cerrar a 9.6 hrs, flag `auto_cierre_pendiente`.
- Crea incidencia `auto_cierre_pendiente` con flag `autoincidencia`, salta supervisor, va directo a RH (Ana Laura Acevedo).
- Notificaciones WhatsApp/email: 8pm, 10pm, 2am.
- Cron 2am.

### Geo
- Radio aceptado: 100 metros del punto de checkin asignado.

---

## 5. Cross-reference FTS Suite ↔ Odoo

`FTSAuth.setSession` contiene: `userId`, `username`, `nombre`, `role`, `modulos`, `loginTime`, `lastActivity`. **NO contiene Odoo `empleado_id`.**

Para mapear FTS user → Odoo employee (post F2.1):
1. La sesión `MP_SESSION_KEY` (sessionStorage) ya guarda `empleado_id` directamente al login.
2. Para derivar roles + jerarquía, usar workflow `panel/derivar-roles` (F2.1) — retorna `department_id`, `parent_id`, `reportes_directos`, `roles_derivados`.
3. Para info adicional Odoo (work_email, parent_id, etc.) usar el mismo workflow o un endpoint nuevo similar.

Pendiente F4: usar este mapeo al guardar planes operativos.

---

## 6. Roadmap activo (Bloques A-E)

### Bloque A — Tech debt (4 hrs)
- A.1: ✅ DONE — lookup `department_id` activo en `crear-olvido-entrada` v3.2 con escalación auto a RH si empleado sin depto.
- A.2: PIN+selfie como 2do factor en RH module
- A.3: cache fix raw → api.github en `seguridad/index.html`, `seguridad/iperc/iperc-config.js`, `seguridad/js/videos.js`, `ingenieria/analisis-estructural/version.json`
- A.4: ✅ DONE (2026-05-04) — audit completo en 34 workflows. 10 productivos limpios. Campo `x_studio_many2one_field_wyDLM` quedaba solo en: 2 archivados con WRITE real (kiosk/checkin v4.0 BuMHz9 + v4.1 70hera, eliminados con `n8n_delete_workflow`) y 1 string cosmético en `asistencias/admin` /diagnose (corregido in-place). Smoke test: response ya reporta `x_studio_sales_order_2`.
- A.6: kiosk distinguir "nunca checó hoy" vs "ya cerró su día" (mostrar último checkout)
- A.7+A.8: banner persistente en SO selection, confirmación back/close
- A.9: hotfix `olvido_checkout` permite hora libre con incidencia auto

### Bloque B — 24/7 ops (5 hrs)
- Auto-cierre cron 2am
- Notificaciones escalonadas
- Status-change notifications
- **F1.5** (parcial, 2026-05-11): ✅ DONE auto-rescate reactivo de attendance huérfana >16h al siguiente check-in del empleado (`Code - Analizar candados` rama `≥16h` ya no bloquea, dispara auto-cierre + TAG + incidencia `auto_cierre_pendiente`). Cron 2am sigue pendiente como tarea separada — esta es solo la red de seguridad in-flight, no la limpieza proactiva nocturna.

### Bloque F1.5 — Operativos urgentes (2026-05-11) ✅ DONE
- Issue 1: candado hora mínima check-in por geocerca (Topo Chico cortina + Caseta L6 con 07:30 CST). Validación frontend en `kiosk.js`, config en `shared/public-config.json` v1.1.0.
- Issue 2: auto-rescate >16h en workflow `a7mEjjdwIzzvomXs` (ver Bloque B + §11 hallazgo #12).
- Ver `docs/SPRINT_F1.5_REPORTE.md` para detalles.

### Bloque C — Mi Nómina (10 hrs)
- Quitar contador acumulado de kiosk pre-checkin
- Card "Mi Semana" en Mi Perfil
- Botón "Nueva Incidencia" multi-tipo

### Bloque D — Project costing (6 hrs)
- Validar SO capture en checkout
- Reporte labor cost/proyecto
- CAPEX dashboard

### Bloque E — Planning vs execution (13 hrs)
- `resource.calendar` base por persona/rol
- App planning operativo
- Auto-aprobación HE solo si dentro de plan

### Bloque F — Incidencias rediseño (28-abr)
- F1: ✅ DONE (2026-05-04) — `olvido_checkout` migrado a sistema moderno con TAG de disputa Odoo. 5 commits del sprint:
  - `e713e32` feat(kiosk): F1 v3 olvido_checkout migrado a sistema moderno
  - `6ee64cd` fix(kiosk): parsear check_in de Odoo como UTC
  - `100b4d3` feat(panel-incidencias): F1 v3 soporte olvido_checkout + fix regresion HH:MM
  - `cf106fa` chore(accesos): CEO Esteban con 3 roles para audit + test F1 v3
  - `7443699` feat(kiosk): F1 v3 boton 'Olvide checar salida' en jornada activa

  Endpoint legacy `/webhook/kiosk/cerrar-registro` queda LEGACY (cleanup formal en F6).
- F1.1: ✅ DONE (2026-05-05) — `olvido_entrada` end-to-end con TAG disputa Odoo:
  - Fase 1 resolver `Oc2ceMHX2O0L0y2X` con 4 fixes (D1 respetar TAG previo, D2 `aplicaHora` antes de convertir, D3 `baseUtcStr` discriminado por tipo, D4 night-shift fix solo en checkout) + patch retroactivo Pedro JSON.
  - Fase 2 creator `xVNp36` con nodo `Odoo - UPDATE Attendance (TAG)` antes del READ depto, escribe `x_studio_horario_en_disputa: true` + `x_studio_incidencia_pendiente_id` al crear.
  - Tests: Pedro (retroactivo) + Esteban olvido_entrada nuevo → ambos verdes (status `aprobada_tal_cual`, TAG limpiado en Odoo post-aprobación).
- 27 legacy se cierran en bloque manual
- Selfie en TODOS los 5 tipos pro-activos
- Naming: `permiso_con_goce` / `permiso_sin_goce`
- HE requiere pre-aprobación en plan operativo

### Backlog F2 — próximos pendientes (identificados sprint 4-may)
- ✅ **Supervisor automático por jerarquía Odoo** — DONE 2026-05-04. Implementación:
  - Workflow nuevo `panel/derivar-roles` (`f59LMsbjPmO8pzWu`)
  - Workflows `xVNp36` + `5SW15h` modificados con snapshot supervisor + contactos
  - Panel-incidencias y hub Mi Perfil derivan roles dinámicamente runtime
  - JSON estático `accesos-panel-incidencias.json` eliminado
  - Caso Pedro validado e2e: Rissia aprobó como supervisor automático
  - 3 commits: `560cb8c` (panel + workflows), `21c8e7a` (Pedro retroactivo), `c4f0209` (fix hub)
- ✅ **TAG disputa para `olvido_entrada`** — DONE 2026-05-05 en sprint F1.1 (ver Bloque F arriba).
- **Visor RH cosmético:** `modulos/rh/visor-incidencias.html` tiene TIPO_LABELS hardcoded a `olvido_entrada` (L448, L539) y `hora_real_checkin_utc` hardcoded (L565). NO tiene regresión funcional (es solo lectura). Aplicar mismo patch que panel-incidencias.

### Próximo sprint inmediato (post F1.1)

1. **F2.2 Botón Nueva Incidencia** (estimado ~3-4 hrs): modal multi-tipo desde Mi Perfil (al menos olvido_entrada + olvido_checkout MVP).
2. **Side issue F1.1: Esteban (CEO empleado_id=32) panel mostró badge "SIN DEPTO".** JSON post-aprobación tiene `sin_departamento:true` + `sin_supervisor:true`. Debería ser Dirección. Investigar en `xVNp36` (lookup depto del CEO) y/o tabla decisión status (CEO debe caer en `pendiente_rh` con `es_ceo:true`, no en `sin_supervisor`). No bloqueó test, pero contradice diseño F2.1.
3. **Visor RH cosmético** — apuntado, no bloquea.

---

## 7. Naming conventions

### Workflows n8n
- Estable: `kiosk/checkin`, `incidencias/resolver`. Sin versión en el nombre.
- Versionado va en tags y descripción del workflow, no en el nombre.
- Si hay refactor mayor, archivar viejo + crear nuevo con sufijo `-v2`.

### Incidencias
- `olvido_entrada`, `olvido_checkout`, `vacaciones`, `permiso_con_goce`, `permiso_sin_goce`, `he_autorizacion_previa`, `incapacidad_medica`, `tiempo_extra`, `auto_cierre_pendiente`, `so_faltante`, `sos`.

### Departamentos zombies (NO usar)
`Administration`, `Ops YIN`, `Management`, `PMO`, `R&D`. Estos están en Odoo pero no son productivos.

---

## 8. Estilo de comunicación esperado

- **Antes de modificar workflows productivos:** mostrar diff y pedir confirmación.
- **Antes de tocar Odoo (cuando agreguemos su MCP):** preview no destructivo primero.
- **Después de cada cambio:** dejar resumen con archivos tocados, IDs de workflows modificados, y siguiente paso sugerido.
- **No usar lenguaje IA-ish** en outputs externos (correos a clientes, mensajes a empleados). Tono directo, ejecutivo, español MX.
- **Confirmación entre etapas:** Esteban prefiere validar entre fase y fase, no batches grandes.

---

## 9. Información sensible

- **Nunca** commitear API keys, tokens, ni credenciales en el repo.
- Si se detecta una credencial hardcoded, **alertar inmediatamente** y mover a env var de n8n.
- Webhook secrets HMAC: pendientes de implementar (Bloque A pending).

---

## 10. Personas clave

- **Esteban De La Cruz Calderón** — CEO/founder, decisor final
- **Felipe Pérez Guzmán** — Operations Manager (Odoo `hr.employee` ID 112)
- **Mateo Salazar** — Senior Supervisor
- **Ricardo Hernández** — PMO
- **Gibrán Solís** — Supply Chain
- **Ana Laura Acevedo** — HR (recibe escalaciones de incidencias auto)
- **Magaly Pérez** — Legal
- **Gerardo Lozano** — Accounting
- **Francisco Montalvo** — Senior Ops

---

## 11. Hallazgos arquitectónicos (F1 v3, F2.1, F1.1, F1.5)

Lecciones cross-cutting documentadas para evitar repetir bugs en futuros sprints.

1. **Odoo envía datetimes en UTC sin sufijo Z.** JS sin Z los interpreta como zona local del browser → fechas off por 6h en Monterrey. **Solución:** parsear con `new Date(str.replace(' ','T') + 'Z')`. Aplicado en `kiosk.js` (parseo check_in) + `panel-incidencias` (helper `utcToCst`).
2. **Botón "Olvidé checar salida" en estado `activo` NUNCA existió** antes de F1 v3. El git log muestra que solo se agregó para `zona_gris` y `error_critico` en Feature 3A. F1 v3 lo introduce como feature nueva en jornada activa, no como restauración.
3. **`mostrarModalOlvideCheckout(estado, empleado)` requiere ambos args.** Reutilizar `resolverZonaGris('olvide')` que lee `window._estadoActual` y `window._empleadoActual` (poblados por `mostrarEstadoEmpleado` antes del render del botón). NO inventar nuevas funciones disparadoras.
4. **Panel-incidencias pre-F1 v3 enviaba datetime completo al resolver.** Era regresión bloqueante después del patch resolver HH:MM (commit `100b4d3` fix). Smoke test desde panel rompía con `HORA_FORMATO_INVALIDO`. Lección: cuando se cambia un schema en backend (resolver), audit obligatorio del frontend que lo consume.
5. **CSP de Microsoft Edge bloquea `fetch` a `raw.githubusercontent.com` desde la home.** Para diagnóstico, usar la pestaña GitHub Pages directamente (sirve desde el dominio del repo, no del raw).
6. **Deuda técnica detectada y resuelta: lookup de roles duplicado.** Tanto `panel-incidencias/index.html` como `mi-perfil/index.html` tenían su propia función `cargarRolesEmpleado` apuntando al JSON eliminado. Ambos archivos migrados al workflow `derivar-roles` en F2.1, pero tomó 1 round adicional (commit `c4f0209`) descubrirlo en smoke test. **Lección:** cuando se elimina/migra recurso compartido, hacer grep en TODO el repo, no solo en el archivo que originalmente lo introdujo.
7. **Patrón sistema autosuficiente vs JSON estático (F2.1).** Datos de "quién tiene qué rol" derivados de Odoo en runtime son superiores a JSON manual: (a) sincronizados con cambios organizacionales sin intervención humana, (b) eliminan deuda manual permanente. Costo (1 query Odoo + cache 5min) aceptable. Aplicable a otros sistemas donde Odoo tenga la información estructurada.
8. **`Ingenieria` sin acento en Odoo producción.** Confirmado durante F2.1: nombres de departamento NO siempre tienen tildes. Verificar SIEMPRE strings de Odoo antes de usarlos en condicionales. Apuntado como deuda cosmética: corregir a `Ingeniería` cuando haya tiempo.
9. **Bug colateral resolver F1 v3 → fix F1.1 (5-may-2026).** F1 v3 introdujo asunción universal `inc.check_in_original_utc must exist` en el resolver, válida solo para `olvido_checkout`. Para `olvido_entrada` la base UTC vive en `hora_real_checkin_utc`. Además `inc.tag_disputa_activo = !esEstadoTerminal(...)` se asignaba incondicional, contaminando rows legacy que nunca escribieron TAG. **Lección:** cuando se introduce una característica nueva (TAG management) sobre un resolver que sirve a múltiples tipos, audit obligatorio de cada branch (`tipo === 'X'`) para garantizar invariantes específicos del tipo. Y los flags transversales (TAG) deben respetar el estado entrante (`=== true`) antes de flippear, NO asumir que todas las rows entran al sistema con el flag bien inicializado.
10. **Regresión post-F1.1 fase 2 (5-may-2026, mismo día).** El `UPDATE TAG` insertado entre `IF Error?` y `READ Empleado` en xVNp36 cambió el data flow del `filterRequest`. La expresión `={{ $json.empleado_id }}` resolvía a `undefined` porque el output del UPDATE TAG (data del attendance) no contiene `empleado_id`. Resultado: TODOS los empleados creando olvido_entrada caían en `sin_departamento:true + sin_supervisor:true → pendiente_rh`. Fix: referencia explícita `={{ $('Code - Validar payload').item.json.empleado_id }}`. Bug fue inadvertido en testing porque Esteban (único test post-deploy) salió SIN DEPTO sin que se identificara como regresión hasta el debug profundo. **Lección crítica:** cuando se modifica topología n8n en sprint, smoke test debe verificar TODOS los nodos downstream con expresiones `$json`, no solo el end-state funcional. Incidencia INC-OLV-32-2026-05-05T17-07-44-203Z queda con flags JSON incorrectos por este bug — cerrada con TAG limpio en Odoo, no se patchea retroactivamente.
11. **Geocercas Topo Chico con hora mínima check-in (F1.5, 11-may-2026).** Operación cliente Nalco/Ecolab cita personal 07:30 AM en planta Topo Chico (Cortina + Caseta L6); empleados llegaban 7:00 AM y checaban para cobrar desde esa hora sin supervisión. Solución: campos `aplica_hora_minima_checkin` (bool) + `hora_minima_checkin` (HH:MM) en `shared/public-config.json` por geocerca. Validación frontend-only en `kiosk.js` función `validarHoraMinimaCheckin(sitioNombre, tipo)`, aplica solo cuando `tipo === 'entrada'` (no bloquea salida ni comida). Defensa profunda server-side queda en backlog. **Lección:** geocercas viven en `public-config.json` (no en `sitios-autorizados.json` que es legacy sin consumer), kiosk fetchea de GitHub raw + cache localStorage, workflow n8n NO valida geocerca (solo confía en frontend).
12. **Auto-rescate de attendance huérfana >16h al siguiente check-in (F1.5, 11-may-2026).** Antes: rama `≥16h` en `Code - Analizar candados` (workflow `a7mEjjdwIzzvomXs`) bloqueaba con `ERROR_CRITICO`, forzando al empleado usar olvido_checkout antes de checar entrada. Caso real Vie 8: Ricardo (att 12948) y Héctor (att 12921) bloqueados lunes 11-may por checkout olvidado. **Patrón nuevo (red de seguridad reactiva, no reemplaza cron 2am de Bloque B):** cuando workflow detecta huérfana >16h, auto-cierra a 9.6h, escribe TAGs `x_studio_horario_en_disputa:true` + `x_studio_incidencia_pendiente_id`, crea incidencia `auto_cierre_pendiente` con `estado:pendiente_rh` + `tag_disputa_activo:true` + `autoincidencia:true` (salta supervisor, va directo a Ana Laura), permite check-in nuevo sin fricción. Umbral 16h elegido para no falsamente disparar en turno nocturno T2 (Vie 22:30 → Sáb 07:00 = 8.5h). Nodos nuevos: `IF - Auto-rescate?` + `Odoo - UPDATE Auto-rescate Close` + `Code - Continue Auto-rescate` (restaura params via `$('Code - Analizar candados').item.json` después del UPDATE Odoo, necesario porque output Odoo no preserva `tipo` que necesita `Switch - Por tipo`). **Patrón anti-regresión:** cuando inserts nodo Odoo entre nodos Code, agrega un Code de "restore params" usando referencia explícita al nodo upstream (no confíes en propagación natural de fields).

    **Sub-bug descubierto post-deploy (mismo día 11-may-2026, fix aplicado):** workflow `kiosk/checkin` (`a7mEjjdwIzzvomXs`) en `Code - Preparar parámetros` usaba ventana SEARCH `hr.attendance` de **48h**, mientras `kiosk/estado-empleado` (`U13fngg2dTKgDQ8Y`) usaba **15 días**. Inconsistencia silenciosa: el frontend (consultando estado-empleado) SÍ detectaba la huérfana >48h y mostraba "Checkeo sin salida (+24 hrs)", pero al disparar el flujo de checkin (post-Opción-B), `Odoo - Buscar pendientes` NO retornaba la huérfana porque caía fuera de ventana → `Code - Analizar candados` veía `abiertas=[]` → `auto_rescate_pending:false` → llegaba a `Odoo - CREATE Entrada` que fallaba con `ValidationError` de Odoo enterprise (`_check_validity`: "hasn't checked out since..."). Caso real ejecución 8771 (Ricardo). **Fix:** alinear ambos workflows a 15 días en `Code - Preparar parámetros`. **Lección crítica:** cuando 2+ workflows consultan el mismo dataset (`hr.attendance` abiertas del empleado), DEBEN usar la misma ventana de búsqueda. Idealmente extraer la constante a una variable de workflow compartida o documentarla en CLAUDE.md como invariante. Anti-pattern detectado: cada workflow definía su propia ventana inline sin coordinación.

    **Sub-bug #2 (mismo día 11-may-2026, ejecuciones 8851 + 8852, fix Opción 2 aplicado):** workflow `kiosk/checkin` escribía a `shared/incidencias.json` (schema legacy con `estado`, `id`, `fecha_solicitud`), pero el visor RH (`modulos/rh/visor-incidencias.html`) y los paneles modernos (`panel-incidencias`, `mis-incidencias`) leen de `shared/incidencias-asistencia.json` (schema F2.1+ con `status`, `id_interno`, `fecha_creacion`, `propuestas[]`, `department_*`, `supervisor_*`). Las 2 incidencias `auto_cierre_pendiente` se crearon en producción pero quedaron INVISIBLES para Ana Laura. **Fix Opción 2:** solo la rama `auto_rescate_pending` del workflow se migró al schema F2.1+ y al archivo correcto. Las ramas legacy `ajuste_hora_entrada` y `ajuste_hora_salida` siguen en `incidencias.json` (backlog: Opción 1 migración total). Mecanismo: nuevo campo `_target_file_path` en `Code - Prep Incidencia` decide el archivo destino; `HTTP - GET` y `HTTP - PUT` usan URL dinámica `{{ $json._target_file_path }}`; `Code - Merge incidencia` propaga el campo y arregla commit message hardcoded `ajuste_hora_entrada` → dinámico por `nueva.tipo`. **Lección complementaria:** cuando un workflow escribe a un archivo compartido, validar quién lo lee. Si los consumers esperan otro schema o archivo, hay drift silencioso. Mantener una tabla `archivo → schema → escritores → lectores` documentada. **Tabla actual:**
    - `shared/incidencias.json` (legacy) — escritores: `a7mEjjdwIzzvomXs` ramas `ajuste_hora_entrada` + `ajuste_hora_salida`. Lectores: NINGUNO (write-only orphan, backlog cleanup).
    - `shared/incidencias-asistencia.json` (F2.1+) — escritores: `xVNp36`, `5SW15h`, `0L0y2X`, + `a7mEjjdwIzzvomXs` rama `auto_rescate_pending` (post-F1.5). Lectores: visor RH, panel-incidencias, mis-incidencias.

14. **Hallazgo #14 (21-may-2026): "feature en bypass silencioso" por dependencia CDN externa — caso face recognition kiosk.** El feature `face_recognition` (`operaciones/kiosk/js/face.js`, creado en `d0aafaa`) nació activado por default con `K.config.faceEnabled = localStorage.getItem('ops_kiosk_face_enabled') !== '0'` y un fail-open en `doFaceVerify` cuando `!K.faceReady` (L668 pre-fix). Durante semanas, `cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights` devolvió 404 → `loadFaceModels()` lanzaba → `K.faceReady = false` → todos los checkins entraban al path de bypass *"Verificación facial no lista — continuando"* y pasaban sin comparar. **Nadie reportó nada porque a nadie le fallaba.** PR #44 (`d34d915`, 20-may 22:55) migró el URL a `cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights` (200 OK) — los modelos cargaron por primera vez en semanas → validación REAL se activó → 4+ empleados rechazados al día siguiente (Felipe Pérez 112, Gibrán Solís 62, Alejandro Reyes 110, Héctor Cruz 25). Causa raíz combinada: (a) threshold 0.5 estricto (face-api recomienda 0.6), (b) foto referencia `image_128` de muy baja resolución, (c) ausencia de UI / fallback supervisor-approve. **Fix 21-may (`fix/face-recognition-opt-in-default`):** invertir default a opt-in explícito (`=== '1'`) — PIN único factor por defecto, face reactivable por dispositivo con plan completo documentado en `docs/FEATURE_FLAGS.md`. **Lecciones cross-cutting:**
    - Cualquier feature que dependa de un asset externo (CDN, font, modelo, librería) debe tener un **canary explícito** post-deploy. Si su throw cae en un fail-open, el feature puede pasar **semanas en bypass** sin que nadie note hasta que algo "fixea" la dependencia y la reactiva de golpe.
    - Defaults `!== '0'` (opt-out) son peligrosos para features no-críticos / experimentales: convierten cualquier dispositivo nuevo en cobaya de producción. Defaults `=== '1'` (opt-in) son la convención segura — documentado en `docs/FEATURE_FLAGS.md` §convenciones.
    - Cuando un fix de "ya cargan los modelos" mejora la resiliencia, **audit obligatorio del comportamiento downstream**: si la feature estaba pasivamente apagada, el fix la reactiva con todas sus consecuencias. PR #44 fue técnicamente correcto pero arrojó un side-effect operativo no anticipado.
    - `image_128` (default actual de `ops_kiosk_field_photo`) es insuficiente para descriptores de face-api confiables. Backlog: migrar a `image_512` mínimo cuando se reactive el feature.

13. **Hallazgo #13 (20-may-2026): Caso real de detección reactiva por duplicado semántico.** FASE 0 de un dump operativo PMO detectó que `NEW-16` propuesto matcheaba `C2-23` existente: mismo nombre quasi-idéntico ("Fabricación adicional Polipasto y Cuarto Multi-**p**anel" vs "Multi-**P**anel", solo difería capitalización del Panel), misma cuadrilla C2, mismo tipo (instalación 🔧). Resolución consensuada con Esteban: **opción (a) consolidación en C2-23 con razón combinada** (preserva contexto original "re-ingeniería, materiales, corte/soldadura, pruebas, instalación, eléctrica + iluminación + extractor" + agrega "Bloqueante para Fab soporte PTR inox R4 y Montaje Panel View"). 0 duplicados creados; commit `3f958c8`. **Patrón valida la heurística DETECCION REACTIVA §1 del system prompt de `pmo/chat-apply`** (umbral >70% match conceptual + misma cuadrilla + tipo similar → `clarify` antes de mutar). Documentado para incorporar al upgrade del chat IA (Ricardo/Carlos use case: usuarios que dictan TBD entries verbalmente sin verificar el cronograma — el modelo debe pre-chequear duplicados aunque el ID propuesto sea libre). **Pattern formalizado:** *cuando el frontend (chat o operador humano) propone una actividad nueva, comparar `nombre.toLowerCase().normalize()` + `cuadrilla` + `tipo` contra todas las TRs scheduled + TBD; si match >70% conceptual con cualquier match exacto en cuadrilla+tipo, responder con `clarify` listando el ID candidato y proponer 3 caminos: actualizar nota existente (a), crear duplicado intencional con disambiguador en el nombre (b), o consolidar reemplazando (c).*

---

## 12. Capacidad de PRs autónomos (configurado 2026-05-11 ✅)

Claude Code crea PRs sin intervención manual de Esteban. Capability validada end-to-end con smoke test PR #32 (creado + cerrado + branch borrada).

### Setup

- **Método:** GitHub CLI (`gh`) versión 2.92.0 instalada vía `winget install --id GitHub.cli --scope user`.
- **Binario:** `C:\Users\esteb\AppData\Local\Microsoft\WinGet\Links\gh.exe`. Persistido en PATH bash via `~/.bashrc`. En PowerShell aparece tras restart del shell (winget agregó a User PATH).
- **Auth:** `gh auth login --with-token` vía stdin pipe (heredoc o `printf | gh`). Token en **Windows Credential Manager** (más seguro que `~/.config/gh/hosts.yml` plaintext).
- **Account:** yinyo1.
- **PAT permissions (fine-grained):** Contents: write, Pull requests: read+write, Administration: read+write, Metadata: read.

### Repo settings activados

- `delete_branch_on_merge: true` — branches feature se auto-borran al mergear PR. Previene acumulación stale (antes de esto había 22 branches `claude/fts-website-iter-*` + 10 viejas que nunca se limpiaron).

### Comando estándar para crear PR

```bash
GH=/c/Users/esteb/AppData/Local/Microsoft/WinGet/Links/gh.exe
"$GH" pr create \
  --title "feat(area): one-line title" \
  --base main \
  --head feature/sprint-name \
  --body "$(cat <<'BODY_EOF'
## Summary
...

## Test plan
- [ ] item

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY_EOF
)"
```

Devuelve la URL del PR. **Para futuros sprints: NO pidas URL manual a Esteban — abre el PR tú mismo** con el comando arriba.

### Comandos útiles relacionados

- `"$GH" pr list --state open` — listar PRs abiertos
- `"$GH" pr close <number> --comment "..." --delete-branch` — cerrar PR + borrar branch
- `"$GH" pr merge <number> --squash --delete-branch` — squash merge + delete branch (auto-delete ya activo, pero `--delete-branch` lo fuerza por si acaso)
- `"$GH" pr checks <number>` — ver checks de CI/CD
- `"$GH" pr diff <number>` — ver diff de un PR
- `"$GH" api repos/yinyo1/fts-suite --jq '.permissions'` — verificar permissions del token

### Smoke test ejecutado

```
2026-05-11 18:00 CST:
✅ Branch test/pr-autonomy creada (empty commit)
✅ Push exitoso a origin
✅ gh pr create devolvió URL https://github.com/yinyo1/fts-suite/pull/32
✅ gh pr close 32 --delete-branch limpió remoto
✅ git fetch --prune limpió ref local
✅ gh api PATCH delete_branch_on_merge=true → 200 OK
```

### Si gh deja de funcionar en el futuro

1. Verificar auth: `"$GH" auth status` — debe decir "Logged in to github.com account yinyo1"
2. Si "not logged in" → token revocado o expirado. Pide a Esteban PAT nuevo y re-auth:
   `printf '%s\n' 'NUEVO_TOKEN' | "$GH" auth login --with-token --hostname github.com`
3. Si "Resource not accessible by personal access token" → permissions del PAT insuficientes. Esteban debe ir a https://github.com/settings/personal-access-tokens, editar el token y marcar Pull requests / Administration según necesite.

---

## 13. Deuda técnica autoprogresiva — workflows n8n (audit 2026-05-11)

Aplicando el principio rector del Master Plan Nómina (`docs/PLAN_NOMINA_FTS_SUITE.md` §0.5), se auditaron los 5 workflows críticos buscando employee IDs / departamento IDs hardcoded que rompen el flujo cuando entra un empleado nuevo a Odoo.

### Resumen audit

| Workflow | ID | Status | Hallazgos |
|---|---|---|---|
| `kiosk/checkin v4.2` | `a7mEjjdwIzzvomXs` | ✅ Clean | Ninguno — usa `parent_id` + `department_id` dinámicos |
| `kiosk/estado-empleado v3` | `U13fngg2dTKgDQ8Y` | ✅ Clean | Solo constantes operacionales (UMBRAL_ZONA_GRIS=14, UMBRAL_ERROR_CRITICO=24) — NO son IDs de empleado |
| `incidencias/resolver v2.1` | `Oc2ceMHX2O0L0y2X` | ✅ Clean | Solo state machine `esEstadoTerminal()` (status values, no IDs) |
| `incidencias/crear-olvido-entrada` | `JLiuczUd61xVNp36` | ❌ **Anti-patrón confirmado** | `CEO_EMPLEADO_ID = 32` + `DEPTOS_VALIDOS`/`DEPTOS_RH` (string match) |
| `incidencias/crear-olvido-checkout` | `IRtG38Aknb5SW15h` | ❌ **Anti-patrón confirmado** | Mismo patrón (replicado de F1 v3) |

### Hallazgos detallados

**Hallazgo 1 — `CEO_EMPLEADO_ID = 32` hardcoded (prioridad: 🔴 ALTA)**

Ubicación:
- `JLiuczUd61xVNp36` nodo `Code - Merge incidencia` línea 6 del jsCode: `const CEO_EMPLEADO_ID = 32;`
- `IRtG38Aknb5SW15h` nodo equivalente: misma constante.

Uso:
```javascript
if (parent.id === empleadoId) { esCeo = true; }
else if (parent.id === CEO_EMPLEADO_ID && esRolRh) { rhDirectoCeo = true; }
else if (parent.id === CEO_EMPLEADO_ID) { directoCeo = true; }
```

**Falla cuando:** Esteban deja FTS / cambia ID Odoo / nuevo CEO toma el rol. Workflow sigue rutea a "directo_ceo" para empleados cuyo parent_id apunta al ID 32 aunque ese ya no sea CEO.

**Refactor propuesto:**
- **Opción A (recomendada post Sprint 1 Fase 1):** SEARCH Odoo en runtime: `hr.employee WHERE x_categoria_nomina='ceo' LIMIT 1`. Requiere campo `x_categoria_nomina` creado + Esteban setea su override `ceo`. Tras eso, el CEO_EMPLEADO_ID se obtiene dinámicamente cada ejecución.
- **Opción B (más simple, fragil):** check por department_name === 'Dirección'. Asume único empleado activo en Dirección. Rompe si dept renamed o se agrega 2do empleado.
- **Opción C (overhead):** HTTP GET a `shared/config/empleados-master.json` y leer `_meta.ceo_empleado_id` (campo nuevo del JSON post-Sprint 1 Fase 3 sync). 

**Estimado refactor:** 30 min (agregar nodo Odoo SEARCH antes del Code - Merge, mantener fallback a 32 si search falla).

**Hallazgo 2 — `DEPTOS_VALIDOS` / `DEPTOS_RH` como string arrays (prioridad: 🟡 MEDIA)**

Ubicación: mismos 2 workflows.

Definición:
```javascript
const DEPTOS_VALIDOS = ['Comercial', 'Dirección', 'Ingenieria', 'Legal', 'Operaciones', 'Recursos Humanos'];
const DEPTOS_RH = ['Legal', 'Recursos Humanos'];
```

**Falla cuando:**
- Esteban renombra un depto en Odoo (e.g., `Ingenieria` → `Ingeniería` con acento — deuda cosmética §11 #8). Workflow silenciosamente marca `deptoInvalido: true`.
- Se crea un depto nuevo en Odoo (e.g., "Marketing"). Workflow lo trata como inválido aunque sea legítimo.

**Refactor propuesto:**
- **Opción A:** mover la lista a `shared/config/departamentos.json` (Sprint 2). Cualquier depto nuevo se agrega via PR + workflow lee del archivo.
- **Opción B:** SEARCH Odoo `hr.department WHERE active=true` al inicio del workflow, considerar todos los activos como válidos. `DEPTOS_RH` mantiene lista manual ya que es regla de negocio (HR vs no-HR).

**Estimado refactor:** 20 min Opción A, 30 min Opción B.

### Lo que NO encontramos (validado clean)

- ✅ NO hay arrays literales como `[89, 91, 113]` en jsCode de workflows (el único caso de este patrón vive en frontend `operaciones/planeacion/js/horarios-base.js:48` documentado en `docs/PLAN_NOMINA_FTS_SUITE.md §0.5` deuda autoprogresiva #1).
- ✅ NO hay branches `if (empleado_id === N)` en ningún workflow.
- ✅ NO hay maps `{89: 'oficina', 113: 'campo'}` en jsCode.
- ✅ NO hay comparaciones `department_id === N` o `deptId === N` numéricas.

### Roadmap de fix (post Sprint 1 Fase 2)

| # | Item | Workflow | Prioridad | Tiempo | Dependencia |
|---|---|---|---|---|---|
| 1 | Refactor `CEO_EMPLEADO_ID` → empleados-master.json lookup | `JLiuczUd61xVNp36` | ✅ **DONE (Sprint 1 cleanup, 2026-05-12)** | — | Nodo nuevo `HTTP - GET empleados-master.json` + Code Merge usa `master.empleados.find(e => e.x_categoria_nomina === 'ceo')`. Fallback defensivo a 32 si lookup falla. Smoke test A+B passed (Felipe → pendiente_rh, Stephany → pendiente_supervisor). |
| 2 | Mismo refactor en `crear-olvido-checkout` | `IRtG38Aknb5SW15h` | ✅ **DONE (Sprint 1 cleanup, 2026-05-12)** | — | Mismo patrón aplicado a `Code - Build incidencia` (no Merge — la CEO logic está en Build aquí). Validate runtime OK. Smoke test live no posible (requiere attendance sin check_out, todas cerradas), validación estructural code review + workflow validator. |
| 3 | `DEPTOS_VALIDOS` → leer de `shared/config/departamentos.json` o Odoo SEARCH | Ambos | 🟡 media | 30 min | Sprint 2 (puede esperar) |
| 4 | Frontend `horarios-base.js:48` `oficinaIds` → `x_categoria_nomina === 'hourly_sencilla'` | n/a (frontend) | ✅ **DONE PARCIAL (Sprint 1 Fase 3, 2026-05-11)** | — | Refactor aplicado: lookup primario por `x_categoria_nomina`, fallback temporal a `oficinaIdsLegacy = [89, 91, 113]` marcado para eliminar cuando 100% empleados oficina tengan override. Eliminar fallback en Sprint 2 cuando `total_con_categoria_default` = 0 para hourly_sencilla. |

### Anti-patrones a vigilar en futuros workflows

Cuando crees un nuevo workflow:

1. ❌ **NO** declares `const X_EMPLEADO_ID = NN` o `const X_DEPT_ID = NN` como constantes locales del Code node.
2. ❌ **NO** uses `if (parent.id === X)` con valores literales — usa lookup por categoría o atributo.
3. ❌ **NO** uses `array.includes(empleadoId)` con array literal — derive lista de Odoo.
4. ✅ **SÍ** lee `x_categoria_nomina`, `x_dias_laborables`, `x_aplica_ppa` del payload upstream (vía `Odoo - READ Empleado`).
5. ✅ **SÍ** usa default-por-dept fallback declarado en PLAN §0.5 cuando un campo está null.

---

## 14. Hallazgos arquitectónicos (cont.)

### Hallazgo #15: Incidente 27-may-2026 + Sprint Resiliencia

**Contexto del incidente:**
- 27-may 18:16 CST → 28-may 06:28 CST (~12h outage backend kiosk).
- 29 checkins ese día, solo 6 cerraron checkout antes del corte (firma: corte limpio a las 18:16 CST).
- 23 empleados afectados, 11 turnos fantasma de ~24h generados por recovery.
- Causa probable: sub-incidente Railway NO reflejado en status page (mayo cerró 99.11% "verde"). Logs n8n del incidente se podaron antes del forense → causa técnica exacta no determinable.
- Forense completo: `docs/INCIDENTES/2026-05-27-kiosk-checkout-outage-12h.md` (PR #47, merged).

**3 bugs críticos descubiertos en el audit (kiosk.js):**
1. **UI muestra "✓ SALIDA" ANTES del POST a backend** (`kiosk.js:943-965` render vs `972` fetch) → el empleado cree que checó aunque nunca llegó a Odoo. **Este es el anti-patrón más grave (silent corruption).**
2. **catch silencioso en `kiosk.js:990`** → `console.warn` solo, sin UI. Cubre 4 flujos (checkin/checkout/comida/olvido_entrada vía `registrarAsistencia`).
3. **Botón "Seguí en turno" genera turnos fantasma de ~24h sin TAG** (`resolverZonaGris('turno')` → `iniciarCheckin('salida')` estampa ahora) → datos sucios silenciosos que contaminan nómina, sin incidencia para RH.

**Recovery realizado 28-may (acciones de Esteban, no re-verificadas vía Odoo en la sesión del forense):**
- 24 attendances corregidos con horas reales (libreta Magaly).
- 2 bajas formalizadas (Mario 116, José Carlos 132).
- 1 incidencia validación RH creada (Ricardo 98 — orphan preexistente del 26-may, PR #48 merged).
- 1 caso time-by-time documentado (Enoc 128).
- PR #47 (forense) + PR #48 (incidencia Ricardo) → MERGED.

**Sprint resiliencia diseñado (PR #49, branch `docs/sprint-resiliencia-design`, sin mergear — revisión Esteban):**
- **PR D:** Hardening errores + fix "Seguí en turno" (3–3.5h). Prioridad ALTA.
- **PR C:** Queue offline checkout, preserva `ts_evento` (6–7h). Depende de PR D. Prioridad ALTA.
- **PR B:** Status page interna + UptimeRobot externo (3.5h + 15min Esteban). Independiente. Prioridad MEDIA.
- **PR E:** Cron auto-cierre 2am (Bloque B), complementa PR C (5h, stub). Independiente. Prioridad MEDIA-ALTA.
- Total: 17–19h CC distribuidas en ~3 semanas.

**Dependencia crítica documentada (PR C ↔ PR E):**
- El cron 2am (PR E) cierra el orphan a +9.6h con TAG disputa.
- El replay del queue offline (PR C) puede llegar después con el `ts_evento` real.
- **Regla: `ts_evento` real GANA sobre el +9.6h estimado.** Documentado en ambos docs para no perderse.

**Infra hardening 28-may:**
- Variables Railway n8n aplicadas: `EXECUTIONS_DATA_MAX_AGE=336` (14 días), `EXECUTIONS_DATA_SAVE_ON_ERROR=all`, `EXECUTIONS_DATA_SAVE_ON_SUCCESS=all` + 6 más de cleanup.
- Worker + Redis Railway = crashed loop legacy del modo queue anterior (`EXECUTIONS_MODE=regular` desde hace 8 días). Recomendación: apagar por etapas (pendiente Esteban, no urgente — ningún workflow depende de worker en modo regular).

**Constantes/invariantes validadas:**
- `n8nFetch` (`odoo.js:15-40`) **ya tiene retry 2× con timeout 10s** — NO necesita más resiliencia de red; el problema fue *surfacing* del fallo terminal.
- El confirm screen DEBE renderizarse **DESPUÉS** del OK del fetch (fix PR D).
- `ts_evento` es el campo crítico que preserva integridad temporal en el replay offline.
- 1 solo catch (`kiosk.js:990`) cubre 4 flujos transaccionales.

**Lecciones operativas:**
1. El status público de Railway NO detecta sub-incidentes que SÍ afectan a FTS.
2. n8n poda logs agresivamente → retención 14 días es no-negociable (ya aplicado).
3. UI que muestra éxito antes de confirmar el backend = el bug más grave (silent corruption). **Anti-patrón a evitar en TODO frontend FTS.**
4. PRs stale que mejoran resiliencia (#3 llevaba 5 semanas) deben mergear/reimplementar rápido, no acumularse.
5. Análisis forense con datos crudos es esencial — el recovery "automático" puede ocultar 11 turnos fantasma de 24h. El discriminador `out_mode` (`kiosk` vs `manual`) + TAG distingue el camino real de cierre.

**Para próximas sesiones CC:**
- PR #49 contiene los 5 docs de diseño (D/C/B completos, E stub) + README ejecutivo.
- **Antes de tocar `kiosk.js`, releer este hallazgo #15.**
- **Antes de implementar el cron 2am (PR E), releer la reconciliación PR C ↔ PR E.**
- El bug del "✓ antes del POST" es el ANTI-PATRÓN a evitar en todo frontend FTS.

**Pendientes operativos post-incidente (estado al cierre 28-may 20:30 CST):**

#### Bloque A — Decisiones pendientes Esteban (próxima sesión)

1. **PR #49 — Sprint Resiliencia** (5 docs, ~920 líneas)
   - Status: abierto, sin mergear. Acción: Esteban revisa con cabeza fresca.
   - 12 decisiones abiertas distribuidas en los 4 PRs (3 por PR D/C/B + 4 stub PR E). Estimación lectura: 15 min.
2. **PR #40 — Modal Nueva Incidencia (Sprint 1 F4.1)**
   - Status: abierto, sin mergear, sin smoke tests. Opciones: mergear post-smoke / cerrar y replanear / dejar abierto. No bloquea Sprint Resiliencia.
3. **Orden de implementación Sprint Resiliencia**
   - Propuesto: D → C → B → E (3 semanas). Alternativa: B primero (independiente, da visibilidad para implementar D/C). Decisión: Esteban define en revisión PR #49.

#### Bloque B — Pendientes técnicos no urgentes

4. **Worker + Redis Railway crashed loop**
   - Causa: legacy del modo queue anterior (`EXECUTIONS_MODE=regular` desde hace 8 días).
   - Procedimiento por etapas: pausar worker → smoke test 24h → eliminar; pausar Redis → smoke test 24h → eliminar.
   - Impacto si NO se hace: ~$5-10 USD/mes desperdicio + logs ruidosos. Riesgo: cero (nada depende de worker en regular mode).
5. **Auditar 6 empleados activos fuera del roster kiosko**
   - Hallazgo: Odoo tiene 40 activos, webhook `kiosk/empleados` retorna 34. Diferencia: filtro `company_id=1` del workflow `2UGWLjNwYRGtXq5y`.
   - Hipótesis: empleados en otra company (Brasil/USA) o filtro adicional. Acción: query directa a Odoo + comparar contra payload del webhook. ~15 min.
6. **Caso Ricardo Hernández (98) — validación RH**
   - Incidencia `INC-VALIDACION-98-2026-05-28T23-09-36-918Z`, status `pendiente_rh`.
   - Acción RH (Ana/Felipe): preguntar a Ricardo si trabajó 27 y 28-may. Si sí → registrar attendances manuales con horas reales. Si no → documentar ausencia/permiso.

#### Bloque C — Validaciones retrospectivas (opcionales)

7. **Cuadrar los 24 attendances corregidos vs Odoo real**
   - Hallazgo CC: el Hallazgo #15 tiene coletilla "no re-verificadas vía Odoo".
   - Acción: query Odoo a los 24 attendance IDs, validar: `check_out` coincide con horas reportadas (libreta Magaly), `x_studio_horario_en_disputa=true` en cada uno, chatter con comentario de cleanup. Si todo OK → quitar la coletilla. ~5 min via script F12 Odoo.
8. **Validación discrepancia `ts_evento` de "Seguí en turno"**
   - Hallazgo: 11 turnos fantasma 24h se generaron vía el botón. Acción: review de casos individuales del 27-may (ya corregidos), confirmar que el fix de PR D efectivamente atacaría esos casos. ~10 min.

#### Bloque D — Reglas operativas para próximas sesiones CC

- **ANTES de tocar `operaciones/kiosk/js/kiosk.js`:** releer Hallazgo #15 completo.
- **ANTES de implementar PR C o PR E:** releer reconciliación PR C ↔ PR E (regla: `ts_evento` real GANA sobre `+9.6h` estimado).
- **ANTES de planear cualquier feature que toque el flow de checkout:** validar que NO introduce el anti-patrón "UI muestra éxito antes del POST".
- **ANTES de marcar trabajo como "completado":** validar resultado real (no asumir éxito por ausencia de error).
- **ANTES de cerrar un PR como obsoleto:** validar que el problema que atacaba sigue presente o ya está resuelto en main.

#### Bloque E — Contexto recuperable para sesiones nuevas

Si una sesión CC futura necesita contexto del incidente 27-may, leer en orden:
1. `CLAUDE.md` Hallazgo #15 (este documento) — visión completa.
2. `docs/INCIDENTES/2026-05-27-kiosk-checkout-outage-12h.md` — forense detallado.
3. PR #49 `docs/SPRINT_RESILIENCIA_README.md` — plan de implementación.
4. PR #49 `docs/SPRINT_RESILIENCIA_PR_*_DESIGN.md` — diseño técnico por PR.

**NO confiar en summaries de chat anterior — usar siempre los archivos en main como fuente de verdad.**

---

## 15. Módulo Finanzas (Paso 1 — auth, 2026-05-29)

Plataforma financiera nueva en `finanzas/`. Multi-company (FTS MX `company_id=1` MXN + FTS USA `company_id=6` USD) + multi-currency. Diseño completo en `docs/finanzas/PLAN.md` (v2). Stack igual al resto del Suite (GitHub Pages + n8n + Odoo).

### Auth dedicada (NO usar FTSAuth)
- Finanzas estrena **auth server-side** (la primera del Suite). NO reutiliza `FTSAuth`/`users-suite.json` (esos guardan hashes SHA-256 sin salt en repo público — inaceptable para finanzas).
- Workflow n8n **`auth/finanzas-login`** (ID `ykNzGCvdjzjdXYhc`): PBKDF2-SHA256 100k + HMAC-SHA256 JWT, **todo en JS puro** (ver convención sandbox abajo). Lifetime token **8h**, lockout 5 intentos → 15 min (en `workflow.staticData`). 1 solo usuario v1: `finanzas`.
- Cliente: `finanzas/js/auth-fin.js` (login → `localStorage['fts_fin_session']`) + `finanzas/js/fin-client.js` (webhooks `/fin/*` con **token en el body**, NO header Authorization).

### Convenciones críticas (aprendidas en Paso 1)
1. **Sandbox de Code nodes n8n:** NO expone `require`, `node:crypto`, `process` ni `$env`. Todo cripto (SHA-256/HMAC/PBKDF2) debe ser **JS puro**. Implementación de referencia probada: el Code de `auth/finanzas-login` (reusa el SHA-256/HMAC del workflow PMO). `$env` **SÍ** resuelve en expresiones de **nodo Set** (no en Code) — verificado con probe.
2. **Secretos propios (Opción B aplicada):** `FINANZAS_USER_SALT`, `FINANZAS_USER_HASH`, `FINANZAS_JWT_SECRET` viven como **env vars de Railway**, leídas vía un **nodo Set** (`={{ $env.X }}`) que las pasa al Code. (Opción A `$vars` descartada: vacía/Enterprise; Opción C hardcode no necesaria.)
3. **Workflows con secretos NUNCA se exportan al repo público** bajo ninguna circunstancia (ni a `docs/n8n-workflows/`). El JSON de `auth/finanzas-login` vive solo en n8n. (Deuda pendiente relacionada: `docs/n8n-workflows/pmo-chat-apply-code-code-validar-auth.js` tiene un SECRET HMAC filtrado → rotar, tarea aparte.)
4. **Scripts locales con material sensible:** viven en `scripts/local/` (en `.gitignore`, nunca commiteado). Ej.: `generate-finanzas-hash.js` (genera `{salt, hash}` del password en la laptop de Esteban; el password en claro nunca toca chat/repo/logs).
5. **Token en body, no en header** (`RIESGO-2`): header `Authorization` fuerza preflight CORS que el webhook n8n puede no contestar. Patrón validado: token como campo del body JSON.

### Pendientes Finanzas
- **BLOQ-1:** ✅ RESUELTO (2026-06-14) — credencial Odoo `Wansi69xesEqEiY1` = usuario `estebandelacruz@fts.mx` (uid 2), `company_ids` incluye {1, 6}. Verificado vía MCP Odoo.
- Paso 2: shell + sidebar + manifest (parcialmente ya en Paso 1). Paso 3: ✅ DONE (ver Hallazgo #16). Paso 4: módulo Facturas (tabla+filtros+export) — ya entregado en Paso 3. Paso 5: toggle demo/real — ya en `facturas-core.js`.

### Hallazgo #16 — Finanzas Paso 3 CERRADO (2026-06-14)

Webhooks `fin/facturas-odoo` + `fin/bills-odoo` construidos, validados y **vivos**. PR #53 mergeado a main (squash `5ce283b`), Pages desplegado, branch borrada. URL pública: `https://yinyo1.github.io/fts-suite/finanzas/`.

- **Contrato real ≠ PLAN.md §5.** El §5 quedó stale (`facturas[]`/`from_date`). El contrato que consume el frontend es el del **mock + `buildParams()`**: `rows[]`, params `companies[]`/`date_from`/`date_to`/`payment_states[]`/`limit`/`offset`/`sort_*`, respuesta `{rows, summary:{total_native_by_company, consolidado_mxn, total_count}, pagination:{has_more}}`. Cualquier endpoint `/fin/*` futuro sigue ESE contrato, no el PLAN.
- **Nodo Odoo v1 — operadores (source `nodes/Odoo/v1/GenericFunctions.ts`):** `in` SÍ acepta value **array** vía expresión `={{ $json.x }}` (pasa as-is al dominio Odoo, sin split/wrap). Tokens correctos: `lesserOrEqual`/`greaterOrEqual` (NO existen `lessOrEqual`/`lessThan`). v1 NO tiene parámetro de orden → ordenar en Code.
- **Fix de signo (bills):** Odoo `amount_total_signed` de `in_invoice` es NEGATIVO (convención cuentas por pagar) pero el frontend espera bills POSITIVOS. Solución: signo por `move_type` (`in_refund`/`out_refund` → −1, invoices → +1) × `abs(amount_total)`, NO usar `amount_total_signed` crudo. Confirmado en vivo: Odoo −14500 → workflow +14500. (En facturas no se notó porque `out_invoice` signed ya es +.)
- **Rate USD→MXN:** `res.currency.rate.inverse_company_rate` (≈17.35 MXN/USD, USD = currency_id 2, rates con company_id 1), lookup `name <= invoice_date` desc; fallback `1/rate`; último fallback const 17.38.
- **Patrón runner server-side para smokes (token sin exponer en chat/logs):** workflow TMP (Webhook→Set `$env`→Code→Respond) que mintea el JWT DENTRO del Code (firma con el secret real: válido +1h, y uno con `exp` pasado para probar `TOKEN_EXPIRED` en vivo), dispara los tests vía `$helpers.httpRequest` (fallbacks `this.helpers`/`fetch`) y devuelve SOLO resultados. Activar en UI, disparar con `n8n_test_workflow`, **borrar al terminar**. Es el método validado para no filtrar credenciales en el transcript.
- **Quirk del API n8n de esta instancia:** rechaza `activateWorkflow` y `update_partial` vía MCP (`"request/body must NOT have additional properties"`). Workarounds: **activar workflows a mano en la UI**; para editar usar `n8n_update_full_workflow` (requiere `name` + nodes completos). Crear (`n8n_create_workflow`) y validar (`n8n_validate_workflow`) sí funcionan, y preservan `customResource` (a diferencia del import-UI, §3).
- **2 backlog items (no urgentes, no bloquean):**
  1. `summary.total_native_by_company` asume 1 moneda por empresa, pero los bills de company 6 son **moneda mixta** (3 MXN + 1 USD) → el "total nativo por empresa" suma monedas distintas (cosmético en KPI). `consolidado_mxn` SÍ es correcto. Heredado de `facturas-core`.
  2. **Perf de bills (~50s/llamada que toca company 1):** 303 moves + ~300 partners + `res.currency.rate` `returnAll` (~960 filas) por request. Fix: filtrar rates por rango de fechas + `read_group` para el summary en vez de fetch-all-y-paginar-en-Code.

---

## 17. Automatización de proyectos al confirmar SO (✅ EN PRODUCCIÓN 2026-06-16)

Reconstrucción de AA2 (borrada) con arquitectura **nativa Odoo 19 + n8n, cero código/server-actions en Odoo**. Workflow n8n **`sale/crear-proyecto-al-confirmar`** (id `XhuTlvPKDBjkDeso`, **21 nodos, ACTIVO**): Schedule cada **5 min** → detecta SOs confirmadas sin proyecto → crea **proyecto + cuenta analítica** (plan 1 MX / 18 USA) + links nativo `sale.order.project_id` y dual-write custom (RjLNg / `x_studio_project_id_created_1`) + **envía correo de handoff** al grupo. Idempotente (getAll project por RjLNg) + claim temprano + error-handling (revert / delete-orphan-analytic / tope 3 reintentos).

**📄 Documentación completa en [`docs/finanzas/AUTOMATIZACION_PROYECTOS.md`](docs/finanzas/AUTOMATIZACION_PROYECTOS.md)** — diagnóstico del ciclo financiero (fuga analítica 99%, lock dates, drafts, 2 ejes plan 1/18 + plan 20), relaciones nativo vs custom, diseño del workflow, Parte B M365.

⚠️ **Antes de tocar este workflow o el ciclo SO→project→analytic→budget, leer ese doc + esta sección** (evita re-investigar varias sesiones).

**Frente B — control de gastos + cierre de budget por stage (CERO-CÓDIGO, ✅ EN PRODUCCIÓN 2026-06-16):** doc completo en [`docs/finanzas/FRENTE_B_BLOQUEO_GASTOS.md`](docs/finanzas/FRENTE_B_BLOQUEO_GASTOS.md). **Descartada la Automation Rule Python → 100% cero-código.** **2 workflows n8n ACTIVOS:**
- **`fin/detect-gasto-cierre`** (id `zLmmY0pqYC9kjLaw`, polling 25min) — Fase 2: DETECTA facturas de proveedor (`in_invoice`/`in_refund`) posteadas sobre proyectos en stages de cierre [7,9,10,13,8,4] → correo a estebandelacruz@fts.mx (no bloquea; maneja rezagos). Columnas: Moneda + Origen fondos (company del move) + Empresa proyecto (company del proyecto) + resaltado cross-company. Idempotencia por `staticData`.
- **`project/archive-budget-cierre`** (id `RW7KnoeEzYLvavI0`, Schedule diario, **producción plena `TEST_MODE=false`**) — Fase 3: ARCHIVA cuenta (`active=False` = prevención dura nativa) si stage en **[8,13,10,4]** (excluidos 7/9/6) **Y AR=0 Y AP=0** + log note (CREATE `mail.message` subtype 2); + rama REOPEN (stages activos [1,2,5,3] → reactiva + log note + correo). **Go-live: 53 cuentas archivadas.** Idempotente por `active`.

Reglas clave: distinción gasto/ingreso/cobranza por `move_type` (costos `in_invoice`; ingresos `out_invoice`; pagos/cobranza `entry` IVA-flujo). **AR y AP por analítica** (gemelos): `account.move.line` + `analytic_distribution 'in' [cuenta]` + `parent_state=posted` + `move_id.amount_residual!=0`. Operador `'in'` matchea single/separado/compuesto (verificado). **Usa `amount_residual` NO `payment_state`** → blinda contra los 5,649 `in_payment` (residual=0 = saldado). **Exclusión de proyectos de SISTEMA por flags `is_internal_project`/`is_fsm`** (NO por nombre — hay SOs reales con "Template"/"Internal" en el nombre). Límite honesto del archivado: API/import saltan el filtro `active` del widget (solo bloquea captura manual UI). **base.automation trigger síncrono = `on_state_set`/`on_write`; diferidos `on_time*` NO bloquean.**

**Pendientes (no bloquean, ver doc §Pendientes):** limpieza prueba 2344 (factura $100 + stage); **temas Gera** (Clarios SO7207 balance $3.5M artefacto fuga + 80 facturas huérfanas YIN + 5,649 `in_payment` backlog conciliación); **próximo bloque = Frente A** (rentabilidad por proyecto/empresa, depende de resolver la fuga analítica). **Fuga analítica del 99%** (gastos con `analytic_distribution` separada `{"3034":100,"1176":100}` no descuentan del budget 2-ejes `budget.analytic`/`budget.line`; debe ser compuesta `{"3034,1176":100}`) = problema aparte de captura.

**Frente A — rentabilidad por proyecto/empresa (DISEÑO, mapa completo read-only 2026-06-16):** doc en [`docs/finanzas/FRENTE_A_PLAN.md`](docs/finanzas/FRENTE_A_PLAN.md). **3 roturas independientes en la cadena `SO→analítica→PO/Bill→analytic.line→budget→rentabilidad`:**
- **R1** — al confirmar SO NO se crea el `budget.analytic`+`budget.line` (solo proyecto+cuenta analítica). 123 budgets existen pero son manuales/históricos, muchos con `account_id=false` (sin eje proyecto).
- **R2** — captura SEPARADA `{"3034":100,"1176":100}` ≠ compuesta. Mecanismo: TODA Bill postea al GL `601.84.01` (acc 32) → `account.analytic.distribution.model` #46 inyecta el rubro `{"1176":100}` como **grupo aparte**; el proyecto llega de la PO/manual como otro grupo → nunca se fusionan. El budget 2-ejes solo casa analytic.lines con proyecto **Y** rubro en la MISMA línea (compuesta) → `achieved`/`committed`=0 (SO6013 solo captó $93k de $3.7M). Las 53 distribution.model son prefijo-GL→1 rubro plan20.
- **R3** — atribución: el catch-all `3034` (= SO11547 Topo Chico, proyecto REAL) recibe gastos miscelaneos; otros van sin proyecto o a indirectos (plan 2: 478 RH/509 Gasolina/636 Oficina). Rompe la rentabilidad por proyecto NATIVA (panel `_get_profitability_items` lee por `account_id` → funciona con separadas, lo rompe la misatribución NO R2).

Ejes: plan **1** (89 proyectos MX) / **18** (5 USA) = PROYECTO; plan **20** (28 rubros, campo Studio `x_plan20_id` en budget.line) = RUBRO; plan **2** = indirecto. Applicability TODA `optional` (nada obligatorio = habilitador raíz). PO trae solo proyecto (sin rubro). **Plan A0–A5** en doc §6; módulos `rent-emp`/`rent-proy` ya reservados en manifest B2; rollup por empresa viable sin custom.

**A0 — Diagnóstico cuantitativo DONE (2026-06-16, doc §8, read-only).** Universo gastos proveedor MX 12m = **3,757 líneas / $40.86M**. **REFRAME: el "99% de fuga" estaba mal diagnosticado.** Buckets: atribuido a PROYECTO solo **21.5% ($8.77M)**, de ello **88% YA compuesto** ($7.72M, visible al budget) y solo **$1.05M (2.6%) separado** → **R2 es la fuga CHICA**. Indirecto (plan 2) $7.27M (18%). **SOLO-RUBRO (rubro sin proyecto) = $24M (59%) = LA FUGA GRANDE** (R3-atribución). Catch-all 3034 Topo Chico = $1.6M (18% de lo atribuido). R1: ~90 proyectos tienen budget pero los recién auto-creados son **esqueletos placeholder `budget_amount=−1`** (solo ingreso=monto SO); aun el mejor trackeado (576 Vertiv) sub-captura ~$4.7M de materiales. **Rentabilidad por proyecto hoy NO es creíble** — patrón Clarios (ingreso≫costo, costo 0–35% vs esperado 60–80%) es la NORMA (≥8 proyectos con costo≈0). **DECISIÓN A0: priorizar A3 (atribución) sobre A2 (compuesto)** — R3 pierde ~20× más $; A2 deja de ser bloqueante (88% ya compuesto cuando hay proyecto). Secuencia: **A3 → A2 → A1 (poblar montos reales) → A4/A5**. Quirks: doble-`'in'` ANDeado da vacío (jsonb), corte compuesto vía `analytic.line` ambos-ejes; `'in'` SÍ matchea compuesto; `budget.achieved` recorta por fechas del budget (no sirve como % compuesto). **Decisión grande Esteban (A2):** `mandatory`+capacitación (cero-código) vs workflow n8n reparador.

**A3 — Diseño del mandatory DONE (2026-06-16, doc §9, read-only).** Decisión: forzar atribución obligatoria en captura. Mecánica Odoo 19: `account.analytic.applicability` (filas por `analytic_plan_id`+`business_domain`+**`company_id`**+`account_prefix`+`product_categ_id`; `applicability` optional/mandatory/unavailable), **se evalúa al POSTEAR no al guardar draft**, **mandatory es POR PLAN** (plan1+plan2 ambos mandatory = exige los dos; solo plan1 = bloquea indirectos legítimos). **"Proyecto O centro de costo" NO es nativo** → 3 opciones: **C (RECOMENDADA, bajo riesgo)** = crear 1 cuenta `NO-PROYECTO` en plan 1 + plan 1 mandatory en bill/company1 (proyecto real O NO-PROYECTO, sin re-estructurar); B = plan padre re-parentando 1/18/2 (limpio pero rompe root_id→budget/analytic.line, invasivo); A = fusionar plan 2 en 1 (ensucia eje proyecto). **Dónde:** Bill primero (cubre directas+derivadas; PO propaga analítica a Bill), PO fase 2. **Anti-basura (re-Topo-Chico):** bucket NO-PROYECTO como válvula + archivado Frente B acorta el picker + detective n8n vigila NO-PROYECTO inflado y gasto anómalo a proyectos viejos + capacitación. **3034 no es default técnico (hábito)** → misc va a centros de costo plan 2 que ya existen (636 Oficina, 744 EPP, 509 Gasolina, 296 Honorarios…). **Transición:** applicability per-company → MX primero; backlog drafts trivial (31 bills/$301k); fase blanda con detective (no bloquea) 2-4 sem → limpiar drafts → flip mandatory; piloto vía `account_prefix`/`product_categ`. **$24.6M sin proyecto = 963 líneas, 99% en GL 601.84.01**, top proveedores = subcontratistas eléctricos/construcción (BOSQUE $3.28M, INSTALADORES $2.5M+$1.67M…) = costo de proyecto fugado; ~15 proveedores concentran ~$20M en ~50 bills → **recuperable retroactivo por proveedor** (Gera). Próximo paso si avanza: construir Opción C (write mínima: 1 cuenta + 1 fila applicability) tras aprobación Esteban.

### Estado FINAL en producción (2026-06-16)

**Gatillo ELIMINADO — ahora es por domain, no por flag manual.** Toda SO de FTS MX/USA confirmada con monto genera proyecto. Domain endurecido del nodo `Odoo - getAll SO` (5 filtros):
```
state = 'sale'  AND  x_studio_project_created = False
  AND  date_order >= '2026-05-01'         (greaterOrEqual)
  AND  company_id in [1, 6]               (in — solo FTS MX + USA; Brasil/otras EXCLUIDAS)
  AND  amount_total >= 0.01               (greaterOrEqual — salta SOs vacías/$0)
```
- Magnitud: 6,506 SOs históricas sin proyecto (5,048 son companies ≠{1,6}); el filtro de fecha+company las contiene → primera corrida procesó solo las recientes.
- ⚠️ **El candado `company_id in [1,6]` es OBLIGATORIO**: sin él, 5,048 SOs foráneas entrarían con `plan_id=1` incorrecto (la lógica es `company===6?18:1`).
- ⚠️ **121 SOs históricas** tienen `project_created=False` + `project_id` nativo poblado (inconsistentes). Contenidas por el filtro de fecha (0 en rango). La idempotencia busca por **RjLNg, NO por project_id nativo** → si algún día se quita/afloja el filtro de fecha, backfillear RjLNg primero o duplicará.

**Correo de handoff (Microsoft Graph, Parte B — DONE).** Nodos nuevos: `Odoo - read PO file` + `Code - Build correo` + `HTTP - Enviar correo (Graph)`. Al crear el proyecto (rama éxito) manda email a **`newordersnotification@fts.mx`** (grupo de distribución de producción) con:
- Asunto: `[Nuevo Proyecto Confirmado] <SO name> - <cliente>`.
- Tabla: SO, Cliente, Proyecto, **PO** (`x_studio_purchase_order_number`), Inicio/Fin deseados (**fechas formateadas `16/June/2026`** — array de meses EN inglés en JS nativo, NO `toLocaleDateString` por locale del server), Descripción (`x_studio_proyect_description`).
- 2 botones apilados (cada uno en su `<div>`, `margin-bottom:10px`): **Open Project** (`/web#id=<projId>&model=project.project&view_type=form`) + **Open Sales Order** (`/web#id=<soId>&model=sale.order&view_type=form` — id numérico, NO name).
- **Adjunto del PO** (`x_studio_purchase_order_file`, binary): leído con nodo Odoo `get` dedicado (mantiene el getAll ligero), base64 va **directo a `contentBytes`** (sin re-encodear), `name` = `x_studio_purchase_order_file_filename` (original con extensión), `contentType` derivado de la extensión (pdf/jpg/png…, fallback octet-stream). **Cap 3 MB** inline (Graph simple ~4MB con overhead base64); si excede → no adjunta + nota "ábrelo en Odoo". **Best-effort:** `onError:continueRegularOutput` en el read + `try/catch` en Build correo → si falla el adjunto, el correo sale igual (el proyecto YA está creado).

### Microsoft Graph — credencial y app-permission (Parte B Paso 1-3, DONE)

- **Credencial n8n `Microsoft Graph - sales`** (id `Mh5kBNduMzOl3nzT`, tipo `oAuth2Api` genérico — las credenciales nativas Microsoft de n8n son todas *delegated*; solo la OAuth2 genérica expone `grantType: clientCredentials`).
- Config: Grant=**Client Credentials**, Access Token URL `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token`, Client ID `45131668-92ec-4819-b2d6-826773abb852` (app "n8n-mail-sender"), Scope `https://graph.microsoft.com/.default`, Auth=**Body**.
- Azure: permiso **Mail.Send (Application)** + admin consent + **Application Access Policy** acotando la app a `sales@fts.mx`.
- Endpoint: `POST https://graph.microsoft.com/v1.0/users/sales@fts.mx/sendMail`. Éxito = **202** (body vacío). Body Graph: `{message:{subject, body:{contentType:'HTML',content}, toRecipients:[…], attachments?:[…]}, saveToSentItems:true}`.
- El HTTP node manda `={{ JSON.stringify($json) }}` → `attachments` viaja en el body automáticamente (no requiere cambio del HTTP node).
- ⚠️ **Diagnóstico de fallo de token:** `Failed to acquire OAuth2 access token: Client authentication failed` (httpCode null, falla ANTES de Graph) = problema de credencial, NO de Access Policy. Causa #1: pegar el **Secret ID** (GUID) en vez del **Secret Value**; #2: tenant_id mal en la URL.

### Quirks / lecciones (NO re-descubrir)

1. **Operador `greaterThan` NO existe en el nodo Odoo v1 de n8n** → llega como `None` al dominio → Odoo crashea con `'NoneType' object has no attribute 'lower'` (en `domains.py`, el operador de la tupla es None). **Usar `greaterOrEqual`** (probado). Tokens válidos: `equal`, `in`, `greaterOrEqual`, `lesserOrEqual`, `like`. (Complementa §3/§16.)
2. **`update_full` deja el workflow ACTIVO o INACTIVO de forma no determinista** (preserva el estado previo de forma inconsistente). **SIEMPRE verificar `active` en la respuesta** y avisar a Esteban; el API de esta instancia **rechaza activar/desactivar vía MCP** (`deactivate`/`deactivateWorkflow` → "additional properties" / "Unknown operation type") → toggle a mano en la UI.
3. **Campo analítico del proyecto:** el real es `account_id` ("Project Account", **stored**, lo consume budget+profitability). El campo "Analytic Account" que se ve vacío en la UI es `auto_account_id` (**computed, no-stored, vacío en TODOS los proyectos**, sanos incluidos) — era un campo de Studio en el header; NO confundir. Para mostrarlo en el form, usar `account_id` vía Studio, no `auto_account_id`.
4. **Bloquear confirmación de SO con campos requeridos (filosofía cero-código):** un `required` de vista NO bloquea el Confirmar (el botón guarda con `state` aún en `draft`, y el write de `state=sale` no re-valida modifiers). Solución pure-Studio: poner **`invisible` en el propio botón Confirmar** condicionado a los campos. Candado duro (API/import) requiere Automation Rule + ~4 líneas Python (rollback por `raise`).
5. **Campos sale.order del handoff (técnicos exactos):** `x_studio_proyect_description` (text, ojo "**proyect**" sin 2ª 'o'), `x_studio_fecha_inicio_deseada` + `x_studio_fecha_fin_deseada` (date), `x_studio_purchase_order_number` (char), `x_studio_purchase_order_file` (binary) + `x_studio_purchase_order_file_filename` (char).
6. **Verificar ejecuciones con adjunto sin volcar el base64 al chat:** usar `mode:preview` (da `estimatedSizeKB` + `dataStructure` por nodo). HTTP node con output **vacío `{}` (1KB) = 202 enviado**; si trae ~726KB = el sendMail falló y `onError` pasó el mensaje. El read PO file ~722KB confirma binary leído.

### Pendientes / recomendaciones operativas

- **(Esteban, UI)** Recomendado: Settings del workflow → **"Save successful production executions" = Do not save** (la mayoría de corridas son no-ops; frena el crecimiento de ejecuciones n8n). Prune ya en 14 días (`EXECUTIONS_DATA_MAX_AGE=336`).
- **(Esteban, Railway)** Verificar `N8N_ENCRYPTION_KEY` como variable fija + respaldarla en gestor de contraseñas (si se pierde, TODAS las credenciales — Odoo, Graph — quedan ilegibles). No legible vía MCP.
- **(Esteban, Odoo)** Cleanup opcional de proyectos/analíticas de prueba (2337-2344 / 3071-3078) + huérfanas viejas 3068/3069/3070. No bloquean.
- Volumen Odoo: 221 proyectos totales → cero riesgo. Higiene: archivar proyectos al cerrar (UX, no perf).
- **Calendario kickoff** (integrar evento al crear proyecto): pendiente, requiere permiso `Calendars.ReadWrite` en Azure (no agregado aún).
- Pendientes del doc: desactivar 5 productos `service_tracking` (ya en 'no'), límite de reintentos (DONE, tope 3 vía `x_studio_intentos_proyecto` + `x_studio_proyecto_error`).
