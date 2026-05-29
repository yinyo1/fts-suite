# FTS Suite · Módulo Finanzas — PLAN de Implementación

> **Estado:** análisis previo. NADA implementado. Documento para revisión de Esteban antes de aprobar el inicio.
> **Autor:** Claude Code · 28-may-2026 · grounded en lectura real del repo + n8n MCP + Odoo MCP (read-only).
> **Restricción cumplida:** solo lectura. No se creó código, ni workflows, ni se modificaron archivos existentes. Este `PLAN.md` es el único entregable.

---

## 1. Resumen ejecutivo

El módulo **Finanzas** se monta sobre el stack ya validado de FTS Suite (GitHub Pages + n8n/Railway + Odoo 19 SaaS). El análisis confirma:

- **El patrón de auth actual (`FTSAuth`) NO sirve para Finanzas.** Guarda hashes SHA-256 (sin salt) en `shared/users-suite.json`, un archivo en repo **público**. Para datos financieros esto es inaceptable → Finanzas necesita auth **server-side vía n8n + env vars en Railway** (valida la propuesta A del brief). Será la **primera** auth server-side del Suite.
- **No existe cliente n8n compartido.** `shared/odoo.js` es un placeholder vacío ("Pendiente de implementar"); cada app hace su propio `fetch`. El kiosk tiene su `odoo.js` con un helper `n8nFetch` (retry 2× + timeout 10s) que sirve de patrón de referencia.
- **Existe infraestructura reutilizable:** registry de módulos (`shared/modules-registry.js`), tema (`shared/fts-styles.css`), cifrado AES-256-GCM (`shared/config-sync.js`, para secrets de config), y un patrón de escritura a GitHub vía API.
- **Odoo `account.move` está listo** con todos los campos del brief. Volumen manejable pero requiere paginación (ver §3).
- **No hay nada de Finanzas en el repo todavía** (el HTML draft mencionado no está commiteado). Arrancamos en limpio.

**Veredicto:** el camino propuesto en el brief es correcto. Las decisiones A-F se afinan abajo con los hallazgos reales.

---

## 2. Inventario detallado

### 2.1 Estructura del repo (relevante)

```
fts-suite/
├── index.html                      # launcher raíz (lee MODULES_REGISTRY)
├── CLAUDE.md                       # reglas del repo (leer Hallazgo #15 antes de tocar kiosk)
├── shared/                         # código compartido entre apps
│   ├── auth-suite.js               # FTSAuth (login client-side, SHA-256, users-suite.json)
│   ├── auth.js                     # (variante/legacy de auth)
│   ├── config-sync.js              # ConfigSync — AES-256-GCM + PBKDF2 (secrets de config)
│   ├── odoo.js                     # ⚠️ PLACEHOLDER VACÍO ("pendiente de implementar")
│   ├── modules-registry.js         # MODULES_REGISTRY (sidebar/launcher)
│   ├── fts-styles.css              # tema (navy/amber, IBM Plex)
│   ├── users-suite.json            # ⚠️ usuarios + password_hash SHA-256 (repo público)
│   ├── public-config.json          # n8n_url, odoo_url, demo_mode (NO secreto)
│   ├── ops-config.json             # secrets CIFRADOS (AES) — API keys
│   └── ... (incidencias, empleados-master, etc.)
├── operaciones/
│   └── kiosk/js/odoo.js            # ✅ cliente n8n REAL de referencia (n8nFetch)
├── seguridad/  ingenieria/  modulos/rh/  pmo/  hatch/   # otras apps
└── docs/                           # documentación (este PLAN va en docs/finanzas/)
```

### 2.2 Patrón FTSAuth (cómo es hoy)

`shared/auth-suite.js` → `window.FTSAuth`:
- **Login:** `hashPassword` (SHA-256 sin salt, Web Crypto) → compara contra `password_hash` en `shared/users-suite.json` (cargado de GitHub raw/API).
- **Sesión:** `localStorage['fts_session']` = `{userId, username, nombre, role, modulos, loginTime, lastActivity}`. Timeout de inactividad **30 min** (`INACTIVITY_TIMEOUT`), tracking por eventos (click/keydown/touchstart/scroll).
- **Roles:** `master` | `admin` | `user`. `canAccess(modulo, submodulo)` valida contra `session.modulos` (`'all'` o `{mod:{acceso, submodulos}}`).
- **⚠️ Debilidad para Finanzas:** hash sin salt + archivo público = cualquiera con el repo puede intentar crackear los hashes offline. Para Finanzas NO se reutiliza este mecanismo de credenciales (sí se puede reutilizar el patrón de sesión/inactividad en el cliente).

### 2.3 Cifrado AES-256-GCM (`config-sync.js`)

- `deriveKey`: PBKDF2, 100k iteraciones, SHA-256 → AES-GCM 256.
- `encryptConfig`/`decryptConfig`: empaqueta `salt(16)+iv(12)+ciphertext` en base64.
- **Uso actual:** cifrar `ops_*`/`key_*`/`fts_*` de localStorage → `shared/ops-config.json` (sincroniza API keys entre dispositivos).
- **Para Finanzas:** es el patrón correcto para *secrets de config*, pero **no** para credenciales de usuario (esas van server-side). Útil si Finanzas necesita guardar algún secreto de cliente cifrado.

### 2.4 Workflows n8n (vía n8n-mcp — 15 activos)

n8n v2.50.0 en `https://primary-production-5c3c.up.railway.app`, conectado y sano. Workflows que tocan Odoo (patrones de referencia):

| Workflow | ID | Patrón aprovechable para Finanzas |
|---|---|---|
| `kiosk/empleados (v3.1)` | `2UGWLjNwYRGtXq5y` | Odoo SEARCH + filtro `company_id` + respuesta JSON `{empleados:[...]}` |
| `kiosk/checkin v4.2` | `a7mEjjdwIzzvomXs` | Webhook→validación→Odoo→respuesta; manejo de errores |
| `incidencias/resolver` | `Oc2ceMHX2O0L0y2X` | State machine + Odoo UPDATE |
| `dashboard/resumen (v4.3)` | `nNNQrFMTSjIfqHep` | Agregación de KPIs Odoo → JSON |
| `rh/empleados-master/sync` | `5nzVRsCMlCZlq5s4` | Schedule + Webhook dual trigger + GitHub PUT |

**Patrón de webhook validado (reglas del repo, CLAUDE.md §3):**
- Nodo Odoo (community v2.16.1): SEARCH usa `filterRequest` (no `filters`), `value` (no `fieldValue`), `fieldsList` como ARRAY. "Always Output Data" = ON. Credencial **`'Odoo FTS'` (ID `Wansi69xesEqEiY1`)** — confirmada como la credencial activa referenciada en los 5 workflows productivos que tocan Odoo.
- IF nodes: `typeValidation: "loose"`.
- GitHub writes: HTTP Request con Header Auth `"GitHub FTS Suite"` (NO el native node).
- Respuesta: `respondToWebhook` con JSON estructurado.
- Base URL webhooks: `https://primary-production-5c3c.up.railway.app/webhook/<path>`.

> **Nota:** NO existe ningún workflow de auth server-side hoy. `/auth/finanzas-login` sería el primero. n8n no tiene store de sesión nativo → la auth debe ser **stateless (JWT firmado)** o usar un store externo (no disponible sin Redis, que justo se va a apagar).

### 2.5 Modelo de datos Odoo — `account.move`

**Campos confirmados existentes** (probados vía MCP, todos presentes):
`id, name, partner_id, move_type, invoice_date, invoice_date_due, amount_total, amount_untaxed, amount_tax, amount_residual, payment_state, state, l10n_mx_edi_cfdi_uuid, ref, invoice_origin, journal_id, currency_id, invoice_payment_term_id, company_id, user_id, invoice_user_id`.

**Hallazgos del modelo:**
- **Multi-moneda:** facturas en MXN (`currency_id [33]`) y USD (`[2]`). El monto está en su moneda; para KPIs en MXN hay que convertir o reportar por moneda. **PREGUNTA PARA ESTEBAN** (ver §8).
- **Multi-company:** existe `company_id` (SERVICIOS FTS = `[1]`) y partners como "CORPORATE USA". El webhook debe filtrar `company_id=1` por default (como hace el kiosk), salvo que Caro necesite consolidado.
- **`l10n_mx_edi_cfdi_uuid` puede ser `false`** (ej. facturas USD a entidades extranjeras sin CFDI). El frontend debe manejar `false`/`null`.
- `invoice_origin` = referencia a la SO (ej. `SO11663`) → enlace útil a proyecto/venta.
- `analytic_distribution` (no `analytic_account_id`, v19) vive típicamente en las **líneas** (`account.move.line`), no en el header — si Caro necesita costo por proyecto, será una query secundaria a las líneas (fuera del MVP de Facturas).
- `project_id` en el header: **no confirmado / probablemente inexistente** en `account.move` (la dimensión de proyecto va por `analytic_distribution` en líneas). Marcado como campo NO disponible directo.

**Volumen (vía aggregate, state=posted):**

| Periodo | move_type | Count | Σ amount_total |
|---|---|---|---|
| Últimos 6 meses | `in_invoice` (proveedor) | 794 | $13.28M |
| Últimos 6 meses | `out_invoice` (cliente) | 40 | $20.04M |
| Últimos 6 meses | `out_refund` | 1 | $0.56M |
| Histórico total | `out_invoice` posted | ~4,981 | — |

→ **Conclusión de volumen:** el grueso es `in_invoice` (facturas de proveedor, 794/6mo). Las ventas son pocas pero grandes (CAPEX/EPC). Una query sin límite puede traer miles de filas (histórico) → **paginación obligatoria** (limit/offset) + filtro de rango de fechas por default (últimos 30d). El `summary` (totales/conteos) debe calcularse server-side vía `aggregate_records`, no sumando en cliente sobre una página.

---

## 3. Decisiones arquitectónicas (con justificación)

### A. Manejo seguro del password — **RECOMENDADO: JWT stateless + hash con `crypto` nativo**

La propuesta del brief (env var con hashes + workflow `/auth/finanzas-login` → token) es correcta. Afinaciones por constraints reales de n8n:

- **Hashing:** ⚠️ `argon2`/`bcrypt` son módulos **externos** que las Code nodes de n8n **podrían no tener** disponibles (requieren `NODE_FUNCTION_ALLOW_EXTERNAL`). **Recomendación: usar `crypto.scryptSync` o `crypto.pbkdf2` (built-in de Node, siempre disponibles)** con salt por usuario. Igual de seguro para este caso de uso, cero dependencias.
- **Token:** **JWT firmado con HMAC-SHA256** (`crypto.createHmac`) usando un secreto `FINANZAS_JWT_SECRET` en Railway. Stateless → no necesita store de sesión (importante: Redis se va a apagar). Payload `{user, role, exp}`, expiración corta (ej. 8h).
- **Env vars Railway:**
  ```
  FINANZAS_USERS='{"esteban":{"hash":"<scrypt>","salt":"<hex>","role":"admin"}, "caro":{...,"role":"auditor"}, ...}'
  FINANZAS_JWT_SECRET='<random 32+ bytes>'
  ```
- **Flujo:**
  1. `POST /webhook/auth/finanzas-login {user, password}` → workflow lee `FINANZAS_USERS`, recomputa hash con el salt del usuario, compara, firma JWT → `{token, expires_at, role}`.
  2. Frontend guarda en `localStorage['fts_fin_session']`.
  3. Cada webhook de datos (`/fin/*`) valida el JWT (firma + exp) en un nodo Code inicial antes de tocar Odoo. Si inválido → 401.
- **Generación de hashes:** un mini-script local (Node) que Esteban corre una vez para generar el JSON de `FINANZAS_USERS` a partir de passwords en claro (nunca commiteado).

> **PREGUNTA PARA ESTEBAN:** ¿confirmas scrypt+JWT-HMAC (cero dependencias externas) en vez de argon2/bcrypt? Es la opción robusta y compatible con n8n sin tocar flags del runtime.

### B. Estructura de carpetas — **RECOMENDADO: carpeta `finanzas/` plana ahora, multi-file**

No refactorizar a `apps/ + shared/` ahora (riesgo alto, sin beneficio inmediato). Mantener el patrón actual del repo (cada módulo en su carpeta top-level). Finanzas multi-file (no single-file) por su tamaño (13 submódulos).

```
finanzas/
├── index.html              # shell del módulo: sidebar + router + login gate
├── login.html              # (o modal dentro de index) pantalla de login Finanzas
├── css/finanzas.css        # estilos propios (importa shared/fts-styles.css)
├── js/
│   ├── auth-fin.js         # cliente de auth Finanzas (login → JWT → fts_fin_session)
│   ├── fin-client.js       # cliente n8n dedicado (fetch + Bearer token + manejo error)
│   ├── state.js            # estado demo/real por módulo (localStorage)
│   ├── sidebar.js          # render del nav + indicadores ⚪🟡🟢
│   ├── router.js           # carga de submódulos
│   └── modules/
│       ├── facturas.js     # Bloque 4 — Centro de Transacciones (PRIMER módulo real)
│       └── ...             # los otros 12 como stubs (estado empty)
├── data/mock/              # JSON mock por módulo (para el toggle demo)
│   └── facturas.mock.json
└── version.json
```

- **Carga:** `<script>` tags (consistente con el resto del Suite, sin bundler).
- **Registro:** agregar entrada `finanzas` a `shared/modules-registry.js` (1 línea, lo hace visible en launcher/admin).

### C. Toggle demo/real — **por módulo, en `localStorage`, con descubrimiento de webhook**

- Estado por módulo: `localStorage['fts_fin_mode_<moduloId>']` ∈ `{empty, demo, real}`. Default `empty`.
- Switch en la cabecera del módulo: `[Vacío] [Demo] [Real]`.
- **`Real` deshabilitado** (con tooltip "Webhook no configurado todavía") si el webhook del módulo no existe. ¿Cómo sabe el front si existe? Un manifiesto `finanzas/js/webhooks-manifest.js` declara qué módulos tienen webhook real listo (`{facturas:true, flujo_caja:false, ...}`). Se actualiza al desplegar cada webhook. (Alternativa: un endpoint `/fin/capabilities` que liste los webhooks activos — más dinámico pero requiere otro workflow; MVP usa el manifiesto estático.)
- `empty` = todo en ceros + mensaje "Sin datos. Activa Demo o conecta datos reales."

### D. Indicador en sidebar — reutiliza el campo `status` del registry

Cada item del nav muestra un dot según el modo activo del módulo:
- ⚪ gris — `empty` / sin webhook configurado
- 🟡 ámbar — `demo` activo
- 🟢 verde — `real` conectado

`sidebar.js` lee `fts_fin_mode_<id>` de cada submódulo y pinta el dot. Patrón consistente con el `status:'active'` que ya usa `planeacion` en `modules-registry.js`.

### E. Spec del webhook `/fin/facturas` — ver §5.
### F. Spec del módulo Facturas — ver §6.

---

## 4. Estructura de archivos a crear (árbol consolidado)

(ver §3.B). Archivos nuevos del **MVP (Pasos 1-4)**:

```
finanzas/index.html                     # shell + login gate + sidebar
finanzas/css/finanzas.css
finanzas/js/auth-fin.js                 # login Finanzas (JWT)
finanzas/js/fin-client.js               # cliente n8n con Bearer
finanzas/js/state.js                    # toggle demo/real por módulo
finanzas/js/sidebar.js                  # nav + indicadores
finanzas/js/router.js
finanzas/js/webhooks-manifest.js        # qué módulos tienen webhook real
finanzas/js/modules/facturas.js         # Centro de Transacciones
finanzas/data/mock/facturas.mock.json
finanzas/version.json
docs/finanzas/PLAN.md                   # este documento
```

Cambios mínimos a archivos existentes (1 línea c/u, en su momento):
- `shared/modules-registry.js` → agregar entrada `finanzas` con sus 13 submódulos.
- `index.html` (launcher) → card de Finanzas (si no se autogenera del registry).

n8n (Pasos 1-2):
- Workflow `auth/finanzas-login` (nuevo).
- Workflow `fin/facturas` (nuevo).

Railway env vars: `FINANZAS_USERS`, `FINANZAS_JWT_SECRET`.

---

## 5. Spec técnica — webhook `/fin/facturas` + workflow n8n

### 5.1 Contrato HTTP

- **Método:** GET (o POST si se prefiere body; GET con query params es lo del brief).
- **Path:** `/webhook/fin/facturas`
- **Auth:** header `Authorization: Bearer <JWT de finanzas-login>`. Nodo Code inicial valida firma + exp → 401 si falla.
- **Query params:**
  | Param | Tipo | Default | Notas |
  |---|---|---|---|
  | `from_date` | YYYY-MM-DD | hoy-30d | filtro `invoice_date >=` |
  | `to_date` | YYYY-MM-DD | hoy | filtro `invoice_date <=` |
  | `type` | `out`/`in`/`all` | `all` | mapea a `move_type` |
  | `partner_id` | int | — | opcional |
  | `state` | string | `posted` | default solo posted |
  | `payment_state` | string | — | opcional (paid/not_paid/partial) |
  | `company_id` | int | 1 | default SERVICIOS FTS |
  | `limit` | int | 100 | máx 200 |
  | `offset` | int | 0 | paginación |

### 5.2 Lógica del workflow `fin/facturas`

```
Webhook (GET)
  → Code: validar JWT (firma HMAC + exp). Si inválido → Respond 401.
  → Code: construir domain Odoo desde query params (defensivo: fechas válidas, type→move_type).
  → Odoo SEARCH account.move (filterRequest=domain, fieldsList=[ARRAY de campos], limit, offset, order='invoice_date desc')
  → Odoo aggregate_records (mismo domain SIN limit) → total_count + summary (Σ amount_total, by payment_state)   [paralelo o 2º nodo]
  → Code: map a JSON de salida (partner_id[1]→nombre, currency_id[1]→código, cfdi false→null)
  → Respond OK (JSON)
```

> Nota: el `summary` y `total_count` se calculan con `aggregate_records` sobre el domain completo (no sobre la página). Evita el bug de "sumar solo la página visible".

### 5.3 Respuesta (formato del brief, confirmado contra campos reales)

```json
{
  "facturas": [
    {
      "id": 57357,
      "name": "INV1997",
      "partner": "Nalco de Mexico",
      "type": "out_invoice",
      "date": "2026-05-27",
      "due_date": "2026-07-26",
      "amount": 2273646.40,
      "amount_residual": 2273646.40,
      "payment_state": "not_paid",
      "cfdi_uuid": "AE4ACC99-E9E6-57D8-830C-953F9C2A098E",
      "currency": "MXN",
      "origin": "SO11663"
    }
  ],
  "total_count": 40,
  "summary": {
    "total_amount": 20035972.21,
    "by_status": {"paid": 18, "not_paid": 20, "partial": 2}
  },
  "page": {"limit": 100, "offset": 0}
}
```

---

## 6. Spec técnica — módulo "Centro de Transacciones · Facturas"

- **Vista:** tabla con paginación (server-side via limit/offset).
- **KPIs arriba (4 cards):** total facturado · cobrado · pendiente · vencido (de `summary`, ojo multi-moneda — ver §8).
- **Filtros:** rango de fechas (default últimos 30d) · tipo (todas/emitidas/recibidas) · cliente/proveedor (autocomplete partner) · status (`state`) · status de pago (`payment_state`).
- **Columnas:** Folio (`name`), Cliente/Proveedor (`partner`), Tipo, Fecha, Vencimiento, Monto, Saldo, Estado pago, CFDI (uuid o "—"), Moneda.
- **Acciones:** Export Excel (`.xlsx` via SheetJS o CSV nativo) · Export CSV · Ver detalle (modal con líneas — fase 2).
- **Estados:** `empty` (ceros) / `demo` (lee `data/mock/facturas.mock.json`) / `real` (llama `/fin/facturas` con Bearer).
- **Vencido:** se calcula en cliente (`invoice_date_due < hoy && payment_state != 'paid'`) o se pide al server. MVP: cliente.

**Petición de Carolina (auditoría):** el export con filtros de rango + cliente + status es el caso de uso primario. Priorizar export correcto y completo (todas las páginas del filtro, no solo la visible → el export debe iterar offset hasta `total_count`).

---

## 7. Plan de implementación (pasos discretos)

| Paso | Entregable | Detalle | Esfuerzo |
|---|---|---|---|
| **1** | Auth Finanzas | Env vars Railway (`FINANZAS_USERS`, `FINANZAS_JWT_SECRET`) + workflow `auth/finanzas-login` (scrypt+JWT) + `finanzas/login` + `auth-fin.js` + `fin-client.js` (Bearer). Smoke: login OK/KO, token expira. | ~3h |
| **2** | Webhook `/fin/facturas` | Workflow n8n: validar JWT → domain → Odoo SEARCH + aggregate → JSON. Smoke vs Odoo real (Caro como tester). | ~3h |
| **3** | Módulo Facturas + toggle | `facturas.js` con tabla + filtros + KPIs + export; `state.js` toggle empty/demo/real; mock JSON. | ~4h |
| **4** | Indicadores sidebar | `sidebar.js` dots ⚪🟡🟢 + registry entry `finanzas` + los otros 12 submódulos como stubs `empty`. | ~1.5h |
| **5** | E2E con Caro | Caro corre filtros reales (rango, cliente, status) + export Excel; validar contra Odoo. Ajustes. | ~1.5h + Caro |

**Total estimado:** ~13h CC + sesiones de validación con Caro. Orden estricto 1→2→3→4→5 (cada paso depende del anterior excepto 4 que puede solaparse con 3).

---

## 8. Riesgos y preguntas abiertas (requieren input de Esteban)

**`PREGUNTA PARA ESTEBAN #1 — Multi-moneda.** Hay facturas en MXN y USD. ¿Los KPIs (total facturado/cobrado/pendiente) se reportan (a) por moneda separada, (b) todo convertido a MXN con tipo de cambio (¿de Odoo `currency_id.rate` o fijo?), o (c) solo MXN en el MVP y USD fase 2? Afecta el diseño de los KPI cards y el `summary` del webhook.

**`PREGUNTA PARA ESTEBAN #2 — Hashing/JWT.** ¿Confirmas `scrypt` (built-in Node) + JWT-HMAC en vez de argon2/bcrypt (externos, riesgo de no cargar en n8n)? Recomiendo sí.

**`PREGUNTA PARA ESTEBAN #3 — Usuarios y roles Finanzas.** ¿Lista definitiva de usuarios (esteban, erick, caro, gera, ¿otros?) y qué rol/permiso tiene cada uno? ¿Caro = solo lectura/export (auditor)? ¿Quién puede ver `in_invoice` (proveedores, sensible) vs solo `out_invoice`?

**`PREGUNTA PARA ESTEBAN #4 — Alcance company.** ¿Finanzas es solo SERVICIOS FTS (`company_id=1`) o también consolida CORPORATE USA / otras companies? Default propuesto: solo company 1.

**`PREGUNTA PARA ESTEBAN #5 — Descubrimiento de webhooks.** ¿Manifiesto estático (`webhooks-manifest.js`, simple, se actualiza al desplegar) o endpoint dinámico `/fin/capabilities`? Recomiendo manifiesto estático para el MVP.

**`PREGUNTA PARA ESTEBAN #6 — El HTML draft.** El draft funcional con datos mock que mencionas NO está en el repo. ¿Me lo pasas (lo subo a `finanzas/` como base) o reconstruyo el shell desde cero siguiendo el tema del Suite?

**`PREGUNTA PARA ESTEBAN #7 — Detalle de factura.** ¿El MVP necesita "Ver detalle" con líneas (`account.move.line` + `analytic_distribution` por proyecto), o basta el listado + export para Caro en v1? Recomiendo listado+export v1, detalle v2.

**Riesgos técnicos:**
- **R1 — n8n Code node sin módulos externos:** mitigado usando solo `crypto` nativo (§A).
- **R2 — JWT stateless no revocable:** un token robado vale hasta `exp`. Mitigar con exp corto (8h) + secreto rotable. Sin store (Redis se apaga) no hay revocación inmediata; aceptable para el caso.
- **R3 — Rate limit GitHub / Odoo:** Finanzas lee Odoo en vivo (no escribe a GitHub en runtime), así que sin riesgo de rate-limit de commits. Odoo SaaS puede throttlear queries grandes → paginación + aggregate server-side lo mitiga.
- **R4 — CFDI/`null` y multi-moneda en UI:** el front debe manejar `cfdi_uuid=null` y monedas mixtas sin romper KPIs.
- **R5 — Volumen histórico (~5k out_invoice):** sin filtro de fecha por default una query puede ser pesada. Mitigado con default últimos 30d + límite máx 200/página + export iterativo.
- **R6 — Auth server-side es nueva en el Suite:** primer workflow de este tipo. Validar bien el flujo JWT antes de exponer datos financieros.

---

## Anexo — Constantes y referencias confirmadas

- Credencial Odoo n8n: `'Odoo FTS'` ID **`Wansi69xesEqEiY1`** (activa, usada por 5 workflows productivos).
- Base webhooks: `https://primary-production-5c3c.up.railway.app/webhook/`.
- Odoo: `serviciosfts.odoo.com`, v19 SaaS, MCP read-only UID 2. `account.move` total ~4,981 out_invoice posted.
- GitHub writes: HTTP Request + Header Auth `"GitHub FTS Suite"` (no native node).
- Tema: `shared/fts-styles.css` (navy/amber, IBM Plex).
- Patrón cliente n8n de referencia: `operaciones/kiosk/js/odoo.js` (`n8nFetch`, retry 2× + timeout 10s).
- **NO reutilizar** `FTSAuth`/`users-suite.json` para credenciales Finanzas (hash público sin salt).

> **Siguiente acción:** Esteban revisa este PLAN, responde las 7 preguntas, y aprueba el inicio por el **Paso 1 (auth)**. No se escribe código hasta entonces.
