# RH — Alta / Baja de empleados en Odoo · DISEÑO (read-only, 2026-06-19)

> Documento de **diseño** para revisión de Esteban antes de build. NO es implementación.
> Nueva sección del módulo RH (mismo nivel que *visor de checkins* y *visor de incidencias*), en `modulos/rh/`. **Solo RH** accede.
> Investigación read-only: `fields_get` hr.employee (271 campos), `empleados-master.json`, código kiosk, selecciones Odoo (UID 2 read-only).
> **Rev 2 (2026-06-19):** +foto de perfil (A.7 + A.1), +visor de empleados archivados (G), fecha de baja visible/editable + nota de baja nativa.

---

## 0. Resumen ejecutivo

- **Correo personal nativo SÍ existe:** `private_email` (no hay que crear custom).
- **PIN = `hr.employee.pin` nativo** (char), **legible vía API** (el kiosk ya lo lee). Pero la **comparación es CLIENT-SIDE** y el PIN viaja al browser en `/kiosk/empleados` (deuda de seguridad preexistente).
- **🔴 Los PIN NO son únicos hoy:** `0000`×5, `1234`×2, `1596`×2, `2025`×2, + 2 empleados sin PIN. El alta debe forzar unicidad **a futuro** (no retro-corrige).
- **Baja = archivar:** `active=false` + `departure_date` + `departure_reason_id`. Solo 3 motivos nativos y en inglés (Fired/Resigned/Retired).
- **🔴 Riesgo principal:** Odoo 19 usa **versiones de empleado (`hr.version`)**; un CREATE vía API puede exigir campos extra (`date_version`, `hr_responsible_id`, etc.). **No verificable read-only → requiere un CREATE de prueba en build.**
- **🔴 Gotcha:** el depto **18 "Administracion y Finanzas"** NO está en `DEPTOS_VALIDOS` de los workflows de incidencias → empleados nuevos ahí saldrían `depto_invalido`.
- **Foto:** `image_1920` (binary) es **settable**; Odoo genera `image_128/256/512/1024` solos (computados) → el kiosk (que lee `image_128`) muestra la foto sin pasos extra.
- **Nota de baja:** existe **nativo `departure_description`** (HTML "Additional Information") → **no se necesita campo custom** para la nota libre del motivo.

---

## A. Form de ALTA — campos finales

Leyenda Req: ✅ obligatorio · 🟡 obligatorio para empleados operativos (que checan) · ◻ opcional.

| # | Campo Odoo | Label ES (form) | Tipo | Req | Default propuesto | Validación |
|---|---|---|---|---|---|---|
| 1 | `name` | Nombre completo | char | ✅ | — | no vacío (nativo dice required=false pero es el `_rec_name`) |
| 2 | `company_id` | Empresa | m2o `res.company` | ✅ | **1 — SERVICIOS FTS** | **debe ser 1** o el kiosk no lo muestra (ver E) |
| 3 | `work_email` | Correo de empresa | char | ✅ | — | formato email; único entre activos reales |
| 4 | `private_email` | Correo personal | char | ◻ | — | formato email |
| 5 | `mobile_phone` | Celular (Work Mobile) | char | 🟡 | — | — |
| 6 | `work_phone` | Teléfono | char | ◻ | — | — |
| 7 | `image_1920` | Foto de perfil | imagen (binary base64) | ◻ | — | JPG/PNG, comprimir client-side; ver **A.1** |
| 8 | `department_id` | Departamento | m2o `hr.department` | ✅ | — | uno de los **7 activos** (ver tabla) |
| 9 | `parent_id` | Jefe directo (Manager) | m2o `hr.employee` | ✅ | — | empleado activo |
| 10 | `job_id` | Puesto | m2o `hr.job` | ◻ | — | — |
| 11 | `resource_calendar_id` | Horario | m2o `resource.calendar` | ✅ | por depto: campo→**2** / oficina→**6** | calendar de company 1 |
| 12 | `pin` | PIN de kiosko | char | ✅ | **autogenerado 4 díg. único** | 4 dígitos; **único** vs PINs activos (ver C) |
| 13 | `x_studio_hora_entrada` | Hora de entrada | float | 🟡 | por horario (operaciones 7.0 / oficina 8.0) | 0–23.99; 0 ⇒ sin hora (rompe retardo/PPA) |
| 14 | `x_categoria_nomina` | Categoría nómina (override) | selection | ◻ | **vacío** (se infiere por depto) | una de 5 opciones (ver abajo) |
| 15 | `x_aplica_ppa` | Aplica PPA | boolean | ◻ | **true** | — |
| 16 | `active` | (interno) | boolean | — | **true** | el CREATE lo deja true |

**`x_categoria_nomina` — selection real en Odoo (id field 97925):**
`ceo` (CEO) · `confianza` (Confianza, no HE) · `hourly_doble` (Hourly doble, HE 2x) · `hourly_sencilla` (Hourly sencilla, HE 1x) · `no_he_comercial` (Comercial, no HE). Default = **vacío** → `shared/lib/get-categoria.js` lo infiere por depto (PLAN_NOMINA §0.5). Poblar solo excepciones.

**Departamentos activos (todos company 1 SERVICIOS FTS):** 3 Operaciones · 5 Dirección · 6 Comercial · 9 Legal · 16 Recursos Humanos · 17 Ingenieria *(sin acento en Odoo)* · 18 Administracion y Finanzas.

**Calendarios company 1 (los usados):** **2** "Horas operaciones" (50 h/sem) · **6** "Horas de oficina" (50 h/sem) · 1 "Standard 40h" · 3 "Standard 38h" · 15 "Opening time". *(El calendar 13 que usan los zombies pertenece a otra company — no usar.)*

**Catálogo personal vs empresa (nativos, por si se quieren después):** `private_email`, `private_phone`, `private_street/zip/city/state/country`, `emergency_contact`/`emergency_phone`, `identification_id` (RFC/CURP), `ssnid` (NSS), `barcode` (Badge). Todos opcionales → GRUPO C.

### A.1 Foto de perfil — manejo (campo `image_1920`)

**Campo maestro = `image_1920`** (binary base64). Confirmado en `fields_get`: `image_1920` es `readonly=False` (settable vía API); `image_128 / image_256 / image_512 / image_1024` y `avatar_*` son `readonly=True` = **thumbnails que Odoo computa solo** a partir de `image_1920`. ⇒ **basta setear `image_1920` en el CREATE**; Odoo genera el `image_128` (el que usa el kiosk) automáticamente. No hay que escribir los thumbnails.

**El kiosk SÍ muestra foto.** `operaciones/kiosk/js/kiosk.js` mapea `ops_kiosk_field_photo` → **`image_128`** (default) y la pinta en la pantalla de selección/PIN (`photoEl.src`, con fallback a un SVG con la inicial). ⇒ subir la foto en el alta = el empleado aparece **con cara** en el kiosk desde el primer checkin. *(El webhook `/kiosk/empleados` debe seguir devolviendo `image_128`; verificar en build que el field map del workflow lo incluya.)*

**Future-proof face-recognition.** CLAUDE.md Hallazgo #14: `image_128` es **baja resolución** para descriptores face-api confiables (backlog: migrar a `image_512`). Subir un `image_1920` de buena calidad deja los `image_256/512` ya generados → la migración futura no requiere re-pedir fotos.

**Cómo viaja por n8n (`rh/empleado/crear`):**
1. El form **comprime client-side** (canvas: resize a ~máx 1024 px lado mayor, `toDataURL('image/jpeg', ~0.8)`) → string base64.
2. Va como campo del payload del webhook → en el CREATE se asigna a **`image_1920`** (el nodo Odoo binary acepta el base64 string directo, sin el prefijo `data:image/...;base64,` — quitarlo client-side).
3. **Límite de tamaño:** aunque n8n/Railway aceptan bodies grandes, **cap recomendado ~1–1.5 MB** post-compresión; si excede, rechazar client-side con mensaje. (Mismo espíritu que el cap de 3 MB del adjunto PO en §17.)

**Validación (form):** tipo `image/jpeg|png`; peso post-compresión < ~1.5 MB; **opcional** (sin foto → kiosk usa el SVG con la inicial).

---

## B. Flujo de BAJA (archivar) — paso a paso

Esteban quiere "solo ponerle el motivo y listo". Mecánica mínima que **no deja basura**:

1. **RH selecciona** un empleado activo → botón **"Dar de baja"**.
2. **Form de baja (3 campos, todos VISIBLES y EDITABLES):**
   - `departure_date` — date. **VISIBLE y EDITABLE.** Default = **hoy**, pero RH lo ajusta a la **fecha real de salida** del empleado. Este es el campo que después se ve en el visor de archivados (§G).
   - `departure_reason_id` — **m2o `hr.departure.reason`**. Valores reales hoy: **1 Fired · 2 Resigned · 3 Retired** (inglés, 3 opciones). → *decisión abierta #2: traducir/ampliar.*
   - `departure_description` — **HTML nativo "Additional Information"** = la **nota libre del motivo** (texto largo). VISIBLE y EDITABLE, opcional. **Es nativo → NO requiere campo custom** (ver §F #11).
3. **Pre-chequeos del workflow (read antes de escribir):**
   - **Attendance abierta** (`hr.attendance` sin `check_out` del empleado): **cerrar primero** (patrón auto-cierre a 9.6 h + TAG, §11 #12) o avisar a RH. No dejar un turno abierto colgado.
   - **Incidencias pendientes** (`status` en `pendiente_*` en `shared/incidencias-asistencia.json`): **avisar** (no bloquear) — RH decide resolverlas o dejarlas históricas.
4. **UPDATE Odoo** (un solo write): `active=false`, `departure_date`, `departure_reason_id`, (`departure_description`).
5. **Re-sync inmediato** de `empleados-master.json` (webhook `/rh/empleados-master/refresh` ya existe). El sync **solo dumpea `active=true`** → el baja **desaparece** del master → el kiosk deja de mostrarlo. Sin esto, espera al cron 6am.
6. **Resultado limpio:** attendances cerradas, incidencias quedan como histórico, empleado oculto (no borrado) → reversible (`active=true`).

> Nota: archivar un empleado que es `parent_id` (manager) de otros **NO** reasigna a sus subordinados → quedarían con manager archivado. *Decisión abierta #5b: ¿bloquear baja de un manager con subordinados activos, o solo advertir?*

---

## G. Visor de empleados archivados

Lista de los empleados dados de baja (`active=false`), para que RH consulte **cuándo y por qué** salió cada uno.

**Cómo se leen (n8n, read-only):** Odoo filtra `active=True` por default → para traer los archivados el SEARCH debe usar **`context: {active_test: false}`** o dominio explícito **`[('active','=',false)]`** (o `['|',('active','=',true),('active','=',false)]` para ver ambos). Reusa el patrón del nodo Odoo; o un webhook `rh/empleados/archivados` dedicado.

**Columnas propuestas:**

| Columna | Campo Odoo | Notas |
|---|---|---|
| Nombre | `name` | — |
| Departamento | `department_id` | el que tenía al salir |
| Puesto | `job_id` / `job_title` | opcional |
| **Fecha de baja** | `departure_date` | lo que Esteban quiere ver |
| **Motivo** | `departure_reason_id` | Fired/Resigned/Retired (→ traducir, §F #2) |
| **Nota del motivo** | `departure_description` | HTML nativo → render a texto; nota libre |
| Última actividad | `last_check_out` (o `last_activity`) | readonly nativo; "cuándo checó por última vez" |
| Dado de alta | `create_date` | opcional, antigüedad |

**Info de salida disponible nativa** (confirmada en `fields_get`, todas readonly salvo las 3 de baja): `departure_date`, `departure_reason_id`, `departure_description` (editables en la baja) · `last_check_in` / `last_check_out` (datetime, readonly) · `last_activity` (date, readonly) · `write_date` (última modificación). **No hay** un campo de "fecha de archivado" automático distinto de `departure_date` → por eso `departure_date` (que RH fija a la fecha real) es la fuente de verdad.

**Acción opcional:** "Reactivar" (`active=true`) un empleado archivado por error → *decisión abierta #13*. Si se permite, limpiar `departure_date`/`reason` al reactivar.

---

## C. Resolución del PIN

**De dónde sale:** campo **nativo `hr.employee.pin`** (char, id field 6263). Help oficial: *"PIN used to Check In/Out in the Kiosk Mode of the Attendance application."*

**Cómo lo usa FTS hoy** (confirmado en `operaciones/kiosk/js/kiosk.js`):
- El front mapea `ops_kiosk_field_pin` → `'pin'` y compara **client-side**: `verifyPin()` hace `K.pin !== K.seleccionado.pin`.
- ⇒ El webhook `/kiosk/empleados` **devuelve el `pin` de cada empleado al navegador**. Es legible vía API sin restricción (lo confirma que `aggregate` sobre `pin` funciona con UID 2).

**Estado actual (🔴 problema de datos):** PIN **no es único**. Conteo en vivo: `0000`→5 empleados, `1234`→2, `1596`→2, `2025`→2, y **2 activos sin PIN** (`pin=false`). Como el kiosk selecciona empleado *y luego* pide PIN, los duplicados no causan login cruzado, pero rompen la regla "PIN único" y son débiles.

**Propuesta de asignación en el alta:**
- **Autogenerado**: 4 dígitos aleatorios, el workflow consulta los PINs existentes (`read_group`/`search` sobre `hr.employee.pin` activos) y reintenta hasta encontrar uno libre → **garantiza unicidad a futuro**.
- **Editable por RH** (manual) con validación de unicidad en el mismo submit.
- **RH lo VE**: el form/vista de empleado muestra el PIN (Esteban lo pidió explícito). Como `pin` es legible por API, el módulo RH lo trae por un webhook **autenticado solo-RH**.

**Reglas de higiene:**
- **NO** agregar `pin` a `empleados-master.json` (repo público) — hoy NO está ahí, mantenerlo así.
- La unicidad **no** retro-corrige los `0000`×5 existentes (limpieza aparte, opcional).

---

## D. Workflows n8n nuevos (estructura, no implementación)

Patrón FTS: el front no escribe a Odoo directo (CORS SaaS) → todo por n8n.

### D.1 `rh/empleado/crear` (CREATE)
- **Trigger:** Webhook POST (body: campos del form + token).
- **Validar:** PIN único (SEARCH `hr.employee` `pin=` valor), `work_email` único, `department_id`/`parent_id` presentes, `resource_calendar_id` presente.
- **Odoo CREATE** `hr.employee`: **sin `operation`** + `fieldsToCreateOrUpdate` (regla §3). Campos: name, company_id, work_email, private_email, mobile_phone, work_phone, department_id, parent_id, job_id, resource_calendar_id, pin, x_studio_hora_entrada, x_categoria_nomina(si no vacío), x_aplica_ppa.
- **Post:** disparar `/rh/empleados-master/refresh` (re-sync inmediato) → devolver `{ employee_id, pin }`.
- ⚠️ **Riesgo `hr.version`** (decisión #1): si el CREATE falla por campos de versión requeridos (`date_version`, `hr_responsible_id`), agregarlos al payload. **Probar CREATE real en build.**

### D.2 `rh/empleado/archivar` (UPDATE active=false)
- **Trigger:** Webhook POST `{ empleado_id, departure_reason_id, departure_date, departure_description?, token }`.
- **Pre-check:** SEARCH attendance abierta + incidencias pendientes (avisar/cerrar).
- **Odoo UPDATE** `hr.employee`: `"operation":"update"` + `customResourceId = empleado_id` (regla §3). Set `active=false`, `departure_date`, `departure_reason_id`, `departure_description`.
- **Post:** `/rh/empleados-master/refresh`.

### D.3 `rh/empleado/lookups` (GET, para poblar el form)
- Devuelve catálogos vivos: departments (7), jobs, calendars (company 1), managers (empleados activos id+name), y **PINs ocupados** (solo para validar unicidad; idealmente solo el set, no a quién pertenecen). Alternativa: reusar `/kiosk/empleados` para managers.

### Reglas n8n Odoo node (recordatorio §3, no re-descubrir)
- CREATE: sin `operation`, `fieldsToCreateOrUpdate`. · UPDATE: `operation:update` + `customResourceId`.
- Expresiones con **un solo `=`** (`={{ }}`). · "Always Output Data" **ON**. · Tras importar JSON: rellenar `customResource` + credencial `Odoo FTS` + webhook IDs a mano.
- **Seguridad:** webhooks **sin HMAC** hoy = deuda. Crear/archivar empleados es **sensible** → recomendado al menos un shared-secret en el body antes de exponer; marcar como deuda, no bloquea MVP.

### D.4 Re-sync: ¿inmediato o cron 6am?
**Propuesta:** inmediato. Tras crear/archivar, llamar `/rh/empleados-master/refresh` (ya existe en `rh/empleados-master/sync`, webhook POST) → kiosk e incidencias al día sin esperar el cron 6am. El cron sigue como red de seguridad.

---

## E. Campos OBLIGATORIOS FTS + qué rompe si faltan

El sync `rh/empleados-master/sync` **NO truena con nulls** (vuelca `null`, como ya pasa con CAJERO/zombies). Lo que se degrada **aguas abajo**:

| Campo | Si falta… | Severidad |
|---|---|---|
| `pin` | Kiosk muestra *"Empleado sin PIN configurado"* → **no puede checar** | 🔴 CRÍTICO |
| `company_id` = 1 | `/kiosk/empleados` filtra `company_id=1` → **empleado invisible en el kiosk** | 🔴 CRÍTICO |
| `department_id` | Incidencias `sin_departamento`→escala RH; `x_categoria_nomina` no se infiere; depto fuera de `DEPTOS_VALIDOS` ⇒ `depto_invalido` | 🟠 ALTA |
| `parent_id` | Incidencias `sin_supervisor`→escala RH (sin aprobador natural) | 🟠 ALTA |
| `resource_calendar_id` | Cálculo de horas trabajadas/nómina incorrecto | 🟠 ALTA |
| `x_studio_hora_entrada` | Retardos, PPA y candado de hora mínima por geocerca fallan (0 = sin hora) | 🟡 MEDIA |
| `work_email` | Snapshot de supervisor en incidencias + notificaciones sin destinatario | 🟡 MEDIA |
| `x_aplica_ppa` | Default true esperado; si null, PPA ambiguo | 🟢 BAJA |

**Campos que `empleados-master.json` mapea (los del sync):** `id, name, department_id, parent_id, resource_calendar_id, work_email, work_phone, mobile_phone, x_studio_hora_entrada, x_studio_retardos_15_dias, x_categoria_nomina, x_aplica_ppa`. (NO incluye `pin` — correcto, repo público.)

---

## F. Riesgos / decisiones abiertas (confirmar antes de build)

1. **🔴 Odoo 19 `hr.version`.** Crear `hr.employee` vía API puede exigir campos de versión (`date_version` required, `hr_responsible_id` required, `resource_id` auto). **No verificable read-only.** → Hacer **1 CREATE de prueba** al inicio del build y ajustar el payload. Riesgo de fricción ALTO.
2. **Motivos de baja en inglés / solo 3.** `hr.departure.reason` = Fired/Resigned/Retired. ¿Traducir a español y/o agregar (Despido, Renuncia, Fin de contrato, Abandono, Jubilación)? Es un modelo editable.
3. **🔴 Depto 18 "Administracion y Finanzas" NO está en `DEPTOS_VALIDOS`** de `xVNp36`/`5SW15h` (la lista es 6: Comercial, Dirección, Ingenieria, Legal, Operaciones, Recursos Humanos). Un empleado nuevo en depto 18 saldría `depto_invalido` en incidencias. → Actualizar la constante (deuda autoprogresiva, mejor leer deptos de Odoo).
4. **PIN.** ¿Autogenerado (recomendado) vs manual? ¿4 dígitos fijos? ¿Unicidad obligatoria sabiendo que hay `0000`×5 legacy (no se retro-corrige)? ¿OK que RH vea el PIN en claro? Confirmar.
5. **resource_calendar default por depto es heurística** (Operaciones mezcla calendars 2 y 6 en la realidad). Propuesta: default por depto + **override manual** en el form. (5b) ¿Bloquear baja de un manager con subordinados activos o solo advertir?
6. **Seguridad preexistente (no la empeora el MVP, marcar):** (a) PIN viaja al browser y se compara client-side en el kiosk; (b) webhooks n8n sin HMAC. Crear/archivar empleados es sensible → mínimo un shared-secret.
7. **`work_email` "único"** no se puede exigir retroactivo (varios zombies comparten `estebandelacruz@fts.mx`). Unicidad solo para altas reales nuevas.
8. **¿Crear `user_id` (res.users) para el empleado?** MVP: **no** (el kiosk usa `hr.employee`, no `res.users`; la jerarquía es `parent_id`). Mantener sin usuario salvo que RH lo pida.
9. **Acceso solo-RH:** el módulo vive en `modulos/rh/`; gating por rol (workflow `derivar-roles` / sesión RH). Confirmar el mecanismo de auth que ya usan los otros visores RH antes de exponer escritura.
10. **Re-sync inmediato** (propuesta D.4): confirmar que se quiere disparar `/refresh` al crear/archivar (recomendado) vs esperar al cron 6am.
11. **Nota de baja: nativa vs custom — RESUELTO.** `departure_description` (HTML "Additional Information") **ya existe nativo** y es editable → **usarlo, NO crear `x_baja_nota`**. Solo se justificaría un custom si se quisiera la nota *estructurada/searchable* aparte (no recomendado para MVP).
12. **Foto de perfil (nuevas preguntas):** (a) ¿opcional (propuesto) u obligatoria? (b) ¿resolución/peso de compresión client-side (propongo máx 1024 px, JPEG ~0.8, cap ~1.5 MB)? (c) ¿subir `image_1920` alta calidad para future-proof face-api (recomendado)? (d) confirmar en build que `/kiosk/empleados` incluye `image_128` en su field map.
13. **Reactivar archivado (visor §G):** ¿el visor permite "Reactivar" (`active=true`) un baja por error? Si sí, ¿limpia `departure_date`/`reason`? Riesgo bajo, decidir UX.

---

## Apéndice — Grupo C (fuera del MVP, solo listados)

`bank_account_ids` (nómina/bancos) · `wage`/`hourly_cost`/`wage_type`/`structure_type_id` (sueldo) · `contract_*`/`hr.version` (contratos) · `certification_ids`/`skill_ids`/`resume_line_ids` (skills) · `identification_id`/`ssnid`/`passport_id`/`visa_*`/`permit_*` (documentos legales) · `barcode` (gafete) · `marital`/`children`/`birthday`/`sex`/`country_id` (demográficos) · `*_manager_id` (aprobadores de gastos/timesheet/leaves) · `coach_id`. Se pueden sumar por fases si RH los necesita.
