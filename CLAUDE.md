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

## 2. Workflows n8n productivos (12 activos)

**No tocar sin avisar al usuario.** Cualquier modificación a estos requiere validar primero con `n8n_validate_workflow` y mostrar diff antes de aplicar.

**Importante para Claude Code:** la API de n8n requiere el **ID completo de 16 caracteres** (no el corto). El ID corto es solo la cola del completo, útil para referencia humana pero no invocable. Siempre usar el ID completo en llamadas MCP.

| # | Nombre exacto en n8n | ID completo (API) | ID corto | Notas |
|---|---|---|---|---|
| 1 | `incidencias/crear-olvido-entrada` (F1.1) | `JLiuczUd61xVNp36` | `xVNp36` | 11 nodos. Lookup empleado + Odoo UPDATE TAG (`x_studio_horario_en_disputa` + `x_studio_incidencia_pendiente_id` sobre `check_in`). Snapshot supervisor. |
| 2 | `incidencias/resolver` (v2.1 F1.1) | `Oc2ceMHX2O0L0y2X` | `0L0y2X` | 20 nodos. TAG management + 4 acciones (sup/rh/dir) + branch tipo (entrada/checkout). Fixes D1-D4 F1.1: respeta `tag_disputa_activo` previo, calcula `aplicaHora` antes de conversión, discrimina `baseUtcStr` por tipo, night-shift fix solo para checkout. Helper `esEstadoTerminal`. |
| 3 | `asistencias/admin` | `Bqnfsx8gx2TpzfwM` | `TpzfwM` | Consultas admin |
| 4 | `accesos-incidencias/guardar (v2.2 auth-fix)` | `HwPq9dqxjy2KETi7` | `2KETi7` | Auth + persistencia |
| 5 | `kiosk/empleados (v3.1)` | `2UGWLjNwYRGtXq5y` | `GtXq5y` | Lookup empleados pre-checkin |
| 6 | `kiosk/checkin (v4.2 fix respuesta · build 20abr · 00c76071)` | `a7mEjjdwIzzvomXs` | `zvomXs` | **Núcleo del kiosk** |
| 7 | `kiosk/cerrar-registro (v2.0 · build 20abr · f020af31)` | `WkgYjDeL2kQInz3H` | `QInz3H` | Cierre manual humano |
| 8 | `kiosk/estado-empleado (v3 Fase 1)` | `U13fngg2dTKgDQ8Y` | `KgDQ8Y` | Estado actual empleado |
| 9 | `dashboard/resumen (v4.3)` | `nNNQrFMTSjIfqHep` | `IfqHep` | KPIs operación |
| 10 | `kiosk/sos (v3.4)` | `m6dyGa0yV1zYPwJF` | `zYPwJF` | Pánico + Bloque B incidentes |
| 11 | `incidencias/crear-olvido-checkout` (F1 v3) | `IRtG38Aknb5SW15h` | `5SW15h` | 15 nodos. Lookup attendance + Odoo UPDATE check_out + TAG. Endpoint moderno reemplaza `/webhook/kiosk/cerrar-registro` (legacy hasta F6). |
| 12 | `panel/derivar-roles` (F2.1) | `f59LMsbjPmO8pzWu` | `O8pzWu` | 8 nodos. Webhook GET. Read hr.employee + Search reportes_directos via parent_id reverso. Devuelve `roles_derivados` (`['supervisor','rh','direccion']`) auto-derivados. Reemplaza JSON estático eliminado. |

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

## 11. Hallazgos arquitectónicos (F1 v3, F2.1, F1.1)

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
