# Automatización: crear proyecto + analítica al confirmar SO (Fase A)

> Consolidado de las sesiones de deep-search + build (junio 2026). Fuente de verdad para
> retomar sin re-investigar. Workflow n8n: **`sale/crear-proyecto-al-confirmar`** (id
> `XhuTlvPKDBjkDeso`). Reemplaza la vieja automatización AA2 (borrada) con arquitectura
> nativa de Odoo 19 + n8n, **cero código/server-actions en Odoo**.

---

## A. Diagnóstico del ciclo financiero (hallazgos, NO re-investigar)

- **AA1/AA2 borradas intencionalmente** de `ir.actions.server` (código perdido en Odoo;
  el backup `legacy/` que se mencionó NO existe en el repo). El código viejo se conserva
  solo como **referencia histórica — NO replicar**: su `budget_mapping` está muerto
  (**16 de 18** campos `x_studio_*_comisiones_*` ya no existen en `sale.order`; el set
  actual de comisiones es otro, inconsistente, y vive como columnas planas — deuda de
  diseño, deberían ser budget lines).

- **Fuga analítica del ~99% (atribución, NO registro).** Los gastos entran con
  `analytic_distribution` **"separada"** `{"3034":100,"1176":100}` en vez de **"compound"**
  `{"3034,1176":100}`. El `budget.line.achieved_amount` solo suma `account.analytic.line`
  que tengan **ambos ejes en la misma línea** → la versión separada **no descuenta**.
  Cuantificado en Topo Chico (cuenta 3034): de −$1.83M de gasto real, solo **0.8%** lleva
  rubro plan 20 → el budget-vs-real está **inerte en la práctica**. **El P&L GLOBAL sí
  tiene esos gastos** (pegan a cuenta de gasto `601.84.01`); la fuga es de **costeo por
  proyecto**, no de contabilidad. → El control presupuesto-vs-real es **nativo y exacto**
  en Odoo 19, pero depende de que la captura sea compound. Candidato #1 de automatización
  de alto valor: forzar/normalizar la `analytic_distribution` compound en las Bills.

- **Estados financieros de empresa: motor sólido.** Partida doble cuadra (suma de
  balances posted = 0.00 exacto, cada company cierra en 0); plan de cuentas SAT MX
  (102.01.001…); CFDI 2026 **100% timbrado**; impuestos MX configurados (IVA 16/0%, RET
  ISR/IVA, RET IVA MO 6%, IEPS). **Pendientes de CONFIG (no de motor):**
  - **Lock dates: NINGUNA** en company 1 (MX) y 6 (USA) → histórico editable. Fix 5 min.
  - **94 facturas en draft** (60 cliente = **$4.04M** + 34 proveedor) → fuera del P&L/Balance.
  - **488 líneas de banco sin conciliar** (FTS MX, cola desde 2019) → cash no confiable.
  - **Tax Report IVA MX localizado NO desplegado** (solo DIOT; MX corre sobre genérico).
  - **Scope multi-company:** la BD tiene **7 entidades** (MX 1, USA 6, Brasil 11 dominante,
    + personas físicas/Taquería) — los reportes deben filtrarse por company.

- **Modelo de 2 ejes analíticos:** el **proyecto** vive en **plan 1 "Gasto Directo a
  proyectos" (MX)** / **plan 18 "…USA"**; los **rubros** en **plan 20 "Upgraded Budget
  Plan"** (28 cuentas: 1171 Ingreso, 1177 Mano de Obra, 1176 Materiales, 1156-1180
  comisiones/bonos). `budget.line` cruza ambos: `account_id` = cuenta del proyecto,
  `x_plan20_id` = rubro. El descuento real es nativo vía `account_id` compartido.

---

## B. Arquitectura de relaciones (NATIVO vs CUSTOM)

| Relación | Campo | Estado |
|---|---|---|
| **SO → project** | `sale.order.project_id` (m2o, store) | 🟢 **NATIVO** — el workflow lo puebla |
| **project → SO line** | `project.project.sale_line_id` (→ `sale.order.line`) | 🔴 **INALCANZABLE para FTS** — Odoo exige `product_id.type='service'`; los productos FTS son `type='consu'` (incluso los "servicios"). **Removido del workflow.** El reverso lo cubre el custom RjLNg. |
| **project → analytic** | `project.project.account_id` ("Project Account") | 🟢 **NATIVO** — el workflow crea la analítica y la asigna. **NO se autocrea** desde que AA2 fue borrado (verificado). |
| **analytic → budget** | `budget.line.account_id` = `project.account_id` | 🟢 **NATIVO** (link implícito por account compartido; no hay campo directo budget→project, ni hace falta). |

**Puentes custom (Studio) que se mantienen en DUAL-WRITE** hasta confirmar que ningún
visor/reporte los necesita (luego deprecar):
- `project.project.x_studio_many2one_field_RjLNg` (→ sale.order) — link project→SO.
- `sale.order.x_studio_project_id_created_1` (→ project.project) — link SO→project.

`auto_account_id` en project: **siempre false** en FTS (no es la analítica; la analítica
es `account_id`). `x_studio_budget_analytic` en project: atajo Studio, sin equivalente
nativo y normalmente vacío.

---

## C. El workflow n8n (`XhuTlvPKDBjkDeso`)

- **Trigger:** Schedule cada **2 min** (cero código en Odoo). + un Webhook `test/crear-proyecto`
  para pruebas manuales.
- **Domain del getAll SO:** `state='sale' AND x_studio_generar_proyecto=True AND x_studio_project_created=False`.
- **Gatillo:** `x_studio_generar_proyecto` (boolean Studio, **opt-in del vendedor**). Nace
  `False` en las 6,527 SOs históricas → **avalancha resuelta por construcción** (no entran).
  `alwaysOutputData=false` en el getAll + un **Guard** (`id>0`) evitan iteraciones espurias.
- **Secuencia por SO (loop batchSize 1):**
  1. **Idempotencia:** `getAll project.project` por `RjLNg = SO.id` → si existe ≥1, **salta**.
  2. **Claim temprano:** `x_studio_project_created=True` (cierra la ventana de carrera de
     concurrencia entre runs solapados).
  3. **Create analytic** `account.analytic.account` (`plan_id = company===6 ? 18 : 1`,
     nombre `"SOxxxx - <desc> - <cliente>"`).
  4. **Create project** `project.project` (`account_id` = analítica, `project_id` se setea
     en la SO; `x_studio_many2one_field_RjLNg` = SO).
  5. **Link SO:** `sale.order.project_id` (nativo) + `x_studio_project_id_created_1` (custom).
- **Error-handling:** claim temprano + **revert-on-error** (des-marca la SO para reintento)
  + **delete-on-error** (borra la analítica recién creada si `create project` falla → cero
  huérfanas). Nota: reordenar (proyecto antes que analítica) NO es viable — el proyecto
  necesita el `account_id` de la analítica.
- **Límite de reintentos:** ver fase de cierre — contador `x_studio_intentos_proyecto`;
  al tope (3) NO revierte y marca `x_studio_proyecto_error=True` (visible) para sacar la SO
  del bucle.

**Patrón del nodo Odoo nativo (`n8n-nodes-base.odoo` v1), validado en kiosk:**
- **CREATE:** sin `operation` + `fieldsToCreateOrUpdate.fields[]` con `fieldName`/**`fieldValue`** y expresiones `={{ }}`.
- **UPDATE/DELETE:** `operation:"update"|"delete"` + `customResourceId`.
- **getAll:** `filterRequest.filter[]` con `fieldName`/**`value`** + `options.fieldsList` como **array**.
- Operadores: `in` acepta value array; tokens `lesserOrEqual`/`greaterOrEqual` (NO `lessOrEqual`). `alwaysOutputData:ON` salvo el getAll SO (OFF, para no emitir item vacío).
- Credencial **`Odoo FTS`** (`Wansi69xesEqEiY1` = usuario `estebandelacruz@fts.mx` uid 2, ve companies {1,6}).

---

## D. Lecciones operativas / quirks

- **`n8n_update_full_workflow` deja el workflow inactivo** (a veces) → hay que **reactivar
  en la UI** para probar. **Mantenerlo INACTIVO durante dev:** el Schedule activo sobre una
  versión con bug **generó fuga de analíticas huérfanas** (1 cada 2 min). El partial-update
  y `activateWorkflow` **fallan** por API de esta instancia (`additional properties`) → todo
  cambio se hace con `update_full` (requiere `name` + nodos completos).
- **MCP Odoo es read-only estricto** → Claude Code **no puede crear/borrar/activar** en
  Odoo (ni el campo Studio, ni marcar una SO, ni borrar huérfanas). **Esteban hace esos
  pasos en la UI.** El workflow n8n sí escribe (usa la credencial Odoo FTS, no el MCP).
- **Contrato de Finanzas (PR #53):** el frontend consume el schema del **mock + `buildParams()`**,
  NO el `PLAN.md §5` (stale). (Webhooks `/fin/facturas-odoo` + `/fin/bills-odoo` ya en prod.)

---

## E. Estado y pendientes

**Hecho (verificado contra Odoo real):**
- Núcleo del workflow funcional + idempotente + error-handling (revert + delete-on-error).
- Probado con **SO11755** (0 líneas → `sale_line_id` vacío correcto) y **SO11551** (con
  líneas → reveló que `sale_line_id` es inalcanzable por productos `consu`). El test exitoso
  creó proyecto **2337** + analítica **3071** (REALES, se conservan).

**Pendiente:**
- **Límite de reintentos** (contador + flag de error visible). Requiere 2 campos Studio:
  `x_studio_intentos_proyecto` (integer) + `x_studio_proyecto_error` (boolean).
- **Desactivar 5 productos `service_tracking`** (ids 5671, 5670, 9332, 6696, 5673 — `project_only`/`task_global_project`,
  0 uso en 90d) para que n8n sea la única fuente de creación de proyecto. Va **después del
  verde definitivo**, no antes (evita ventana sin creación).
- **Parte B — notificación M365** (correo + evento kickoff). Requiere **app registration
  en Azure/Entra** con `Mail.Send` + credencial Outlook OAuth2 en n8n (hoy **no existe**
  ninguna credencial Microsoft en n8n).
- **Cleanup manual (Esteban, UI):** borrar analíticas huérfanas **3068, 3069, 3070**
  (sin proyecto/analytic.line/budget.line → borrables limpio).

**Decisiones cerradas:**
- BLOQ-1 resuelto: credencial Odoo FTS ve companies {1, 6}.
- Trigger = timer 2 min (no webhook push: el sandbox de server-action Odoo no hace HTTP saliente confiable).
- Gatillo opt-in `x_studio_generar_proyecto`; handoff fields required condicional a gatillo=True (Studio, sin código).

---

## F. Parte B — Notificación por correo M365 (DECIDIDO, pendiente de Azure)

**Decisión:** al crear el proyecto, enviar correo **desde `sales@fts.mx`** → a **`newordersnotification@fts.mx`** (grupo de distribución que reenvía a todos). Identidad de EMPRESA con **permiso de APLICACIÓN (client-credentials)**, NO delegado/cuenta personal — proceso 24/7 que no depende de la sesión/MFA de nadie.

### Camino técnico (auditado por schema de credenciales n8n)
**Los nodos/credenciales Microsoft nativos son TODOS delegados** (authorization code) — ninguno expone `grantType: clientCredentials` en sus propiedades:
- `microsoftOutlookOAuth2Api` (nodo Microsoft Outlook): delegado. Su `useShared`/`userPrincipalName` es "usuario delegado envía COMO buzón compartido" → sigue requiriendo login de usuario + SendAs. ❌
- `microsoftOAuth2Api` (Microsoft OAuth2 API genérica): delegado, sin selector de grant. ❌
- `microsoftGraphSecurityOAuth2Api`: delegado **y** scope hardcodeado al API de Graph Security (sin campo `scope`) → ni siquiera sirve para mail. ❌
- **`oAuth2Api` (OAuth2 API genérica): la ÚNICA que expone `grantType: [authorizationCode, clientCredentials, pkce]`** → soporta client-credentials. ✅

→ **Único camino app-permission:** **nodo HTTP Request + credencial `OAuth2 API` (Client Credentials)** → `POST https://graph.microsoft.com/v1.0/users/sales@fts.mx/sendMail`. Es el patrón estándar de Microsoft Graph con permiso de aplicación, NO un workaround. El nodo nativo Outlook queda descartado.

### Config exacta de la credencial n8n (OAuth2 API)
| Campo | Valor |
|---|---|
| Grant Type | **Client Credentials** |
| Access Token URL | `https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token` |
| Client ID | `{APPLICATION_ID}` |
| Client Secret | `{CLIENT_SECRET_VALUE}` |
| Scope | `https://graph.microsoft.com/.default` |
| Authentication | **Body** |

Body del HTTP Request (JSON): `{ "message": { "subject": "...", "body": {"contentType":"HTML","content":"<html>…"}, "toRecipients":[{"emailAddress":{"address":"newordersnotification@fts.mx"}}] }, "saveToSentItems": true }`. Esperado: **HTTP 202** en éxito; **403** = falta admin consent o Application Access Policy.

### Seguridad de credenciales
- El **client secret se mete DIRECTO en n8n** (UI), **nunca en chat/repo**. n8n lo **encripta en reposo** con `N8N_ENCRYPTION_KEY` y enmascara el campo tras guardar (no se vuelve a mostrar).
- ⚠️ **`N8N_ENCRYPTION_KEY` debe ser una env var PERSISTENTE en Railway.** El filesystem de Railway es efímero: si la key no es env var fija, n8n genera una nueva en cada redeploy → **todas las credenciales encriptadas se vuelven ilegibles**. Verificar en Railway → servicio n8n → Variables → que `N8N_ENCRYPTION_KEY` exista con valor fijo. **Evidencia empírica de que ya es persistente:** la credencial `Odoo FTS` (creada 2026-04-20) sigue funcional 2 meses después tras múltiples runs/redeploys — si la key se regenerara, ya estaría rota. **Hardening:** respaldar el valor de la key en un gestor de contraseñas (si se pierde, las credenciales son irrecuperables); 2FA en el owner de n8n; mantener n8n actualizado.

### Pendientes (requieren acceso Azure de Esteban — admin del tenant)
1. App registration (recomendado: **nueva dedicada** "n8n-mail-sender", no reusar la de Power Automate). Anotar **tenant_id** + **client_id**.
2. Microsoft Graph → **Application permission `Mail.Send`** → **admin consent** (palomita verde).
3. (Recomendado seguridad) **Application Access Policy** acotando la app a solo `sales@fts.mx` (`New-ApplicationAccessPolicy`, Exchange Online PS) — con Mail.Send de app sin policy, puede enviar como cualquier buzón.
4. **Client secret** → copiar VALUE (se muestra una vez) + anotar expiración/rotación.
5. Confirmar que `sales@fts.mx` es **buzón REAL sendable** (no alias) y que `newordersnotification@fts.mx` existe y reenvía como se espera.
6. Entregar a CC: tenant_id + client_id + client_secret → CC crea la credencial n8n + arma el HTTP Request + **prueba 1 envío** (espera 202; si 403 → revisar consent/Access Policy).

### Futuro (Paso 2+)
Integrar el nodo de notificación al workflow `XhuTlvPKDBjkDeso` (tras crear el proyecto, antes de cerrar el loop) + **evento de kickoff en calendario** (Graph `/events`): siguiente día hábil 14:00 CST; si la SO se confirma vie/sáb/dom → lunes.
