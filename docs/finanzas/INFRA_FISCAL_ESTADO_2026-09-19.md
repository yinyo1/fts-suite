# Estado de infraestructura para la arquitectura fiscal (Conciliación SAT ↔ Odoo)

**Levantado:** 2026-09-19, 13:30–14:00 CST (19:30–20:00 UTC) · **Rama:** `claude/reporte-infraestructura-fiscal-pp2nlk`
**Método:** todo lo de abajo sale de un read ejecutado en la sesión (MCP de Railway, MCP de n8n, MCP de Odoo read-only, y el working tree en `f8640ea`). Lo que NO se pudo medir está marcado **[NO VERIFICADO]** con la razón.

---

## 0. Tres correcciones al encuadre, antes de los datos

Importan porque cambian el diseño, no la redacción:

1. **Odoo NO está en Railway.** Es **Odoo SaaS** (`serviciosfts.odoo.com`), sin SSH, sin SQL, sin módulos custom. Railway hospeda n8n + dos Postgres. Medido: `list-projects` + `describe-environment` de los 3 proyectos — ningún servicio Odoo.
2. **Finkok YA está en producción, pero dentro de Odoo, no en nuestra infraestructura.** `res.company.l10n_mx_edi_pac = "finkok"` en las 3 empresas, en ambiente productivo. **Cero** referencias a Finkok en el repo (grep -ril) y **cero** credenciales o variables Finkok en n8n/Railway. No hay endpoint propio de timbrado que documentar: el timbrado lo hace Odoo.
3. **El hueco real no es la emisión, es la recepción.** Las facturas EMITIDAS están timbradas y validadas (1,392 `valid`). Las RECIBIDAS casi no tienen CFDI vinculado: **46 de 3,353 (1.4%)**. Ahí es donde la descarga masiva del SAT tiene todo el valor.

---

## 1. Odoo

### 1.1 Plataforma y versión
- **Odoo SaaS Enterprise**, instancia `https://serviciosfts.odoo.com`. Multi-company, multi-moneda (MXN/USD conviven).
- Sin SSH, sin acceso SQL, sin módulos custom instalables. La personalización es **Studio** (campos `x_studio_*`) + **Automation Rules** + n8n por fuera.
- **Versión exacta: 19 según la documentación interna. [NO VERIFICADO en esta sesión]** — dos caminos cerrados: `ir.*` está bloqueado en el allowlist del MCP (no se puede leer `ir.module.module`), y el egress de este contenedor deniega el CONNECT a `serviciosfts.odoo.com:443` (medido: `curl: (56) CONNECT tunnel failed, response 403`), así que `/web/webclient/version_info` tampoco.
- **Corroboración indirecta de ≥18** por la forma de los modelos: los certificados MX cuelgan de `certificate.certificate` (refactor de 18+, antes `l10n_mx_edi.certificate`), y el presupuesto vive en `budget.analytic`/`budget.line` (18+, reemplazó `crossovered.budget`).

### 1.2 Localización mexicana — instalada y activa
`l10n_mx_edi` está instalado y en uso. Evidencia: **28 campos `l10n_mx_edi_*` en `account.move`** y **14 en `res.company`**.

Campos de `account.move` relevantes para conciliación:

| Campo | Tipo | Para qué sirve en la conciliación |
|---|---|---|
| `l10n_mx_edi_cfdi_uuid` | char | **La llave de cruce** (Folio Fiscal / UUID) |
| `l10n_mx_edi_cfdi_sat_state` | selection | Estado ANTE EL SAT: `valid` / `cancelled` / `not_found` / `not_defined` |
| `l10n_mx_edi_cfdi_state` | selection | Estado del documento en Odoo: `sent` / `received` / `cancel` |
| `l10n_mx_edi_cfdi_customer_rfc` / `_supplier_rfc` | char | RFC contraparte, ya normalizado por Odoo |
| `l10n_mx_edi_cfdi_amount` | monetary | Total del CFDI (puede diferir del `amount_total` del asiento) |
| `l10n_mx_edi_update_sat_needed` | boolean | Bandera nativa de "hay que re-consultar al SAT" |
| `l10n_mx_edi_document_ids` | one2many → `l10n_mx_edi.document` | Los documentos EDI (XML, acuses) |
| `l10n_mx_edi_payment_policy` | selection | PUE / PPD — define si toca complemento de pago |
| `l10n_mx_edi_cfdi_origin` | char | Relación 04/01 (sustitución) — cadena de CFDI relacionados |
| `l10n_mx_edi_invoice_cancellation_reason` | selection | Motivo de cancelación (01–04) |
| `l10n_mx_edi_addenda_ids` | many2many | Addendas y complementos |

### 1.3 PAC / timbrado (medido, `res.company` ids 1/4/6)

| id | Empresa | País | Moneda | `l10n_mx_edi_pac` | `pac_test_env` | Régimen | Certificados |
|---|---|---|---|---|---|---|---|
| 1 | SERVICIOS FTS | México | MXN | **finkok** | False (producción) | 601 | 4 (ids 9, 1, 6, 5) |
| 4 | (persona moral secundaria) | México | MXN | **finkok** | False (producción) | 601 | 1 (id 3) |
| 6 | FTS FULL TECHNOLOGY SYSTEMS LLC | USA | USD | finkok (heredado) | — | — | 0 (correcto, USA no timbra) |

- Las credenciales del PAC viven en Odoo: `l10n_mx_edi_pac_username` en `res.company` y los certificados en `certificate.certificate`. **No se leyeron valores a propósito** (regla: un secreto en el transcript es un secreto a rotar).
- La empresa 6 muestra `finkok` por herencia del default del módulo, pero sin certificados y sin régimen: no timbra. Congruente con lo documentado (`l10n_mx_edi_cfdi_uuid = false` en company 6).

### 1.4 Volumen de `account.move` — 44,267 registros

Por empresa y tipo (las 3 empresas que no son FTS se agrupan sin nombre ni RFC: son personas físicas / negocios ajenos al alcance fiscal de FTS y el repo es público):

| Empresa | entry | out_invoice | out_refund | in_invoice | in_refund | in_receipt |
|---|---|---|---|---|---|---|
| SERVICIOS FTS (1) | 25,995 | 1,680 | 18 | 3,546 | 1 | — |
| FTS LLC (6, USA) | 792 | 73 | — | 114 | — | 1 |
| Otras 4 entidades | 7,628 | 3,815 | 11 | 591 | 2 | — |

**Estado CFDI de todo el universo** (agrupado por `sat_state` × `cfdi_state`):

| `sat_state` | `cfdi_state` | registros |
|---|---|---|
| valid | sent | 5,935 |
| valid | (sin valor) | 797 |
| valid | received | 45 |
| valid | cancel | 1 |
| cancelled | (sin valor) | 105 |
| cancelled | cancel | 15 |
| cancelled | sent | 1 |
| not_found | (sin valor) | **79** |
| not_defined | received | 2 |
| (sin valor) | (sin valor) | 37,287 |

Los 37,287 sin estado son mayormente `entry` (pólizas, 34,415 en total) — no llevan CFDI. Los **79 `not_found`** son el hallazgo accionable: Odoo preguntó al SAT y **el SAT no reconoce ese UUID**.

**El hueco, en dos renglones** (empresas {1,6}, sólo `posted`):

| | con estado SAT | sin estado SAT | cobertura |
|---|---|---|---|
| Emitidas (`out_invoice`) | 1,397 (1,392 valid + 5 cancelled) | 70 | **95.2%** |
| Recibidas (`in_invoice`) | 46 (45 valid + 1 not_defined) | 3,383 | **1.3%** |

Company 1, `out_invoice` posted **con UUID: 1,395**. Muestra cruda del más reciente:

```
name    invoice_date  l10n_mx_edi_cfdi_uuid                 sat_state  cfdi_state  moneda  amount_total
INV2021 2026-08-24    8B11E255-0B73-50EB-9C64-9651923F8699   valid      sent        MXN     1,834,540.00
INV2022 2026-08-18    E5EAC340-FD4E-588D-918A-2951C2D644C8   valid      sent        MXN        86,452.48
INV2017 2026-08-11    5B5EDB4C-1262-56B0-B5A6-2DFD7A4D45C7   valid      sent        MXN       418,166.15
```

### 1.5 Límites del MCP de Odoo que condicionan el diseño del ingestor

El servidor MCP `FTS_Odoo` es **read-only, 64 modelos en allowlist**, métodos `search_read` / `search_count` / `read_group` / `fields_get`. Consecuencias duras:

- **`ir.attachment` está bloqueado** → el XML del CFDI **no es legible por esta vía**. `l10n_mx_edi_cfdi_attachment_id` apunta ahí.
- **`l10n_mx_edi.document` no está en el allowlist** → los acuses y documentos EDI tampoco.
- **`ir.config_parameter` bloqueado** → la configuración del PAC no es auditable por aquí.
- **Cero escritura en esta fase.**

→ **El ingestor fiscal no puede vivir en el MCP.** Tiene que ir por **JSON-RPC desde n8n** con `ODOO_RPC_KEY` (que ya existe como variable), igual que el resto de los motores.

---

## 2. Infraestructura en Railway

**Workspace:** `yinyo1's Projects` · **3 proyectos:**

| Proyecto | id | Rol |
|---|---|---|
| **cheerful-comfort** | `4f4b4d53-3d88-4204-9d8e-b5a4fd8db846` | **El productivo de FTS** (n8n + los dos Postgres) |
| tesoreria-escolar | `bdcb3217-96c8-44e8-939e-64b3f62e8c23` | Proyecto aparte (tesorería escolar), creado 2026-09-17 |
| content-determination | `3577b190-b4aa-4f2c-bcdd-94b871f7a821` | Aparte, creado 2026-08-10 |

### 2.1 `cheerful-comfort` / entorno `production` (`524a10af-40c7-4b8f-8f6f-e888962b3aad`)

Un solo entorno, no efímero, región **europe-west4-drams3a** (todo), sin variables compartidas a nivel entorno, sin buckets, sin cambios staged.

| Servicio | id | Imagen | Comando | Estado real |
|---|---|---|---|---|
| **Primary** | `b5168f3e-…-e44b66ee14d4` | `n8nio/n8n` | `n8n start` | **live**, último deploy SUCCESS 2026-09-08. Dominio `primary-production-5c3c.up.railway.app`, healthcheck `/healthz`, red privada `primary` |
| **Worker** | `ef4110d9-…-2338e5f6e1e2` | `n8nio/n8n` | `n8n worker` | **`latestDeployment: null` — NUNCA se ha desplegado** |
| **Redis** | `b2be579f-…-ee6201165393` | `railwayapp/redis` | — | live, deploy 2026-04-03, volumen `redis-volume` 500 MB en `/bitnami` |
| **Postgres** | `9f5091f8-…-a99cb2ad312` | `postgres-ssl:16` | — | live, deploy 2026-04-18, volumen 5 GB. **Base de n8n** |
| **fts-suite-db** | `26d65170-…-61ed6c89e3e0` | `postgres:17-alpine` | — | live, deploy 2026-08-31, volumen 5 GB. **Base de aplicación de la Suite** |

**Lo importante para arquitectura:** el modo cola **está configurado y apagado**. Primary y Worker traen `EXECUTIONS_MODE`, `QUEUE_BULL_REDIS_*` y `OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS`, y el Worker trae `n8n worker` como startCommand — pero nunca se desplegó. **Todo corre hoy en un único proceso `Primary` con techo de 8 GB**, que sirve al mismo tiempo los webhooks del equipo (kiosko, nómina, comercial) y el servidor MCP. El 18-sep-2026 un batch pesado lo llevó a 7.99/8 GB y dejó al equipo sin herramienta media mañana.

> **Consecuencia directa para el ingestor fiscal:** una descarga masiva del SAT (ZIPs, miles de XML) es exactamente la carga que tiró el proceso. **No debe correr en `Primary` en horario hábil.** Opciones: subir el Worker primero, o hacer el ingestor un servicio propio en Railway que escriba a `fts-suite-db` y deje a n8n sólo la orquestación ligera.

### 2.2 Esquema de inyección de variables y secretos

Tres capas, sin gestor de secretos externo:

1. **Railway = la bóveda.** Variables por servicio en el entorno `production`. **47 nombres en Primary, 21 en Worker** (leídos por nombre con `get-service-config`; **los valores no se leyeron a propósito**).
2. **n8n `$env` vía nodo `Set`.** El sandbox de los Code nodes **no** expone `require`, `process` ni `$env`. El patrón válido y único es: nodo **Set** con `={{ $env.NOMBRE }}` → pasa el valor al Code que lo usa. Por eso todo el cripto (PBKDF2, HMAC, SHA-256) está implementado en **JS puro**.
3. **Credenciales nativas de n8n** para los conectores (11 en total, ver §3.3).

Nombres de variable en **Primary**, agrupados:

```
Base n8n        DB_TYPE · DB_POSTGRESDB_{HOST,PORT,DATABASE,USER,PASSWORD} · PORT
                N8N_LISTEN_ADDRESS · N8N_EDITOR_BASE_URL · WEBHOOK_URL · NODE_OPTIONS
                N8N_ENCRYPTION_KEY · N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS
                N8N_BLOCK_ENV_ACCESS_IN_NODE · N8N_RUNNERS_DISABLED · N8N_TRUST_PROXY
                N8N_PROXY_HOPS · N8N_DIAGNOSTICS_ENABLED · N8N_TEMPLATES_ENABLED
                N8N_VERSION_NOTIFICATIONS_ENABLED · ENABLE_ALPINE_PRIVATE_NETWORKING
Ejecuciones     EXECUTIONS_MODE · EXECUTIONS_DATA_PRUNE · EXECUTIONS_DATA_MAX_AGE
                EXECUTIONS_DATA_PRUNE_MAX_COUNT · EXECUTIONS_DATA_SAVE_ON_ERROR
                EXECUTIONS_DATA_SAVE_ON_SUCCESS · OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS
Cola (apagada)  QUEUE_BULL_REDIS_{HOST,PORT,USERNAME,PASSWORD,DUALSTACK}
Odoo            ODOO_URL · ODOO_USER · ODOO_PASSWORD · ODOO_API_KEY · ODOO_RPC_KEY
Auth Suite      SUITE_JWT_SECRET
Auth Finanzas   FINANZAS_JWT_SECRET · FINANZAS_USER_HASH · FINANZAS_USER_SALT
GitHub          GITHUB_TOKEN · GITHUB_REPO
Otros           JEEVES_API_KEY · PMO_CHAT_HMAC_SECRET · FTS_CORREO_KEY
```

**Lecciones ya pagadas sobre secretos en n8n** (valen para el diseño del ingestor):
- Un nodo que puede lanzar **nunca** debe tener como entrada directa el `Set` que materializa un secreto: si truena, n8n devuelve su **input** en `nodeExecutionStack`, y el filtro `nodeNames` no protege en la ruta de error. Ya costó rotar `SUITE_JWT_SECRET` y `ODOO_RPC_KEY`.
- El nodo que consume el `Set` va en **try/catch total** y devuelve el fallo como dato (`{ok:false, error:'FALLO_X'}`).
- `onError: continueRegularOutput` es **peor** para nodos que ven secretos: los manda río abajo.
- **No existe HMAC en los webhooks.** Ningún webhook `/fin/*`, `/kiosk/*` ni `/planeacion/*` valida firma. El gate es el JWT en el **body** (no en header `Authorization`, para no disparar preflight CORS que n8n podría no contestar).

---

## 3. n8n y workflows

### 3.1 Panorama
- **103 workflows** en la instancia: **76 con `active: true`**, 27 en `false`.
- **⚠️ Trampa de nombres:** varios workflows se llaman `"(INACTIVO — gate Esteban)"` y están **`active: true`**. El "INACTIVO" del nombre significa *apagado por configuración interna*, no por la bandera. Ejemplos: `fin/captura-transacciones` (`S9D7ZAtZ5QaPyWC7`), `fin/captura-status`, `fin/captura-conciliar`, `captura-jeeves`. **No leer el estado desde el nombre.**
- **Dos reglas duras de esta instancia** (ganadas en campo, aplican a cualquier cosa que se construya):
  1. `active: true` **no** significa que lo escrito esté corriendo. n8n separa `versionId` (guardada) de `activeVersionId` (**publicada**, la que sirve el webhook). Un `update_workflow` exitoso puede quedar **guardado y muerto**. El read-back completo es `active` **+** `versionId` vs `activeVersionId`.
  2. `update_workflow` del MCP **no publica** y **colapsa los escapes `\uXXXX`** del `jsCode`. Hay que rematar con `publish_workflow` y releer.

### 3.2 Watchdogs y crons activos (los que vigilan solos)

| Workflow | id | Qué hace |
|---|---|---|
| `ops/watchdog-semaforo` | `29eaGe2wkS98lRMU` | Semáforo diario de proyectos, 8:00 CST hábiles, 2 correos (Ops/Admin) |
| `ops/watchdog-mo` (W1–W5) | `RBxoREDTfehELmyr` | Vigilancia de carga de mano de obra |
| `ops/eco-confirmacion` (W6) | `GbO7iFHg6NIE5rat` | Eco de confirmaciones |
| `rh/watchdog/sin-checkin` | `Q19zFeJQytSfBjdb` | Empleados sin checar |
| `fin/watchdog-captura` | `hckccUkyaAItBmbU` | Salud de la captura bancaria |
| `po/radar-detectar` | `sQ5GYhQTq1UHDt6Y` | Detecta órdenes de compra en correo, latido 18:00 CST |
| `fin/detect-gasto-cierre` | `zLmmY0pqYC9kjLaw` | Gasto sobre proyectos en cierre, polling 25 min |
| `project/archive-budget-cierre` | `RW7KnoeEzYLvavI0` | Archiva cuenta analítica al cerrar (diario) |
| `crear-proyecto-al-confirmar` | `u7Ni2cRAxu3zfBid` | SO confirmada → proyecto + analítica + budget, cada 5 min |
| `rh/empleados-master/sync` | `5nzVRsCMlCZlq5s4` | Dump de roster a JSON del repo, 6:00 CST |

⚠️ **TZ:** n8n descarta `settings.timezone` al importar; sin ponerlo a mano el cron cae en el TZ de la instancia (**America/New_York**) y corre desfasado. Auditar esto en cualquier Schedule nuevo.

### 3.3 Cómo se comunican (los 4 patrones, y ninguno más)

1. **Odoo por nodo community `odooApi`** (credencial `Odoo FTS`, `Wansi69xesEqEiY1`). Reglas: `filterRequest` (no `filters`), `fieldsList` como **array**, "Always Output Data" en **ON**, many2one como **número** (`={{ 513 }}`) — un string se anula en silencio y la ejecución queda en verde.
2. **Odoo por JSON-RPC crudo** (HTTP Request + `ODOO_RPC_KEY`) cuando hace falta un método que el nodo no expone. **Este es el camino del ingestor fiscal.**
3. **Postgres** hacia `fts-suite-db` con roles por esquema.
4. **HTTP Request** a terceros: **Microsoft Graph** (correo, client-credentials, `Mail.Send` acotado a `sales@fts.mx`), **GitHub Contents API** (nunca el nodo nativo de GitHub: tiene bugs con binarios y commits batch), **Anthropic** (PMO chat).

**Credenciales en n8n — 11, y ninguna fiscal:**
```
Odoo FTS (odooApi) · Odoo API Bearer (header) · Odoo Login (basic)
GitHub FTS Suite (header) · Microsoft Graph - sales (oAuth2) · Anthropic Claude FTS
fts-suite-db · fts_admin · fts-suite-db · comercial_app
tesoreria-escolar-db · {TEMPORAL dueño, app_rw, config_ro}
```
**No hay credencial Finkok, ni SAT, ni de ningún PAC.** Confirma que el timbrado no pasa por n8n.

---

## 4. Integración con Finkok

**Respuesta corta: no existe integración propia con Finkok. Finkok es el PAC que usa Odoo internamente, y eso es todo.**

Lo medido, en los tres lugares donde podría estar:

| Dónde se buscó | Cómo | Resultado |
|---|---|---|
| Repo `fts-suite` | `grep -ril finkok .` | **0 coincidencias** |
| Variables de Railway | 47 nombres en Primary + 21 en Worker | **0 variables** `FINKOK_*` / `PAC_*` / `SAT_*` |
| Credenciales n8n | `list_credentials`, 11 | **0 credenciales** de PAC |
| 103 workflows n8n | inventario completo por nombre y descripción | **0 workflows** de timbrado, CFDI, SAT o PAC |
| Odoo `res.company` | read de ids 1/4/6 | **`l10n_mx_edi_pac = "finkok"`**, producción, 5 certificados |

**Endpoints de Finkok que se usan hoy:** los que `l10n_mx_edi` de Odoo Enterprise llama por su cuenta (timbrado y consulta de estado SAT), **desde la infraestructura de Odoo SaaS, no desde la nuestra**. No son configurables ni observables por nosotros y no aparecen en ningún log que controlemos.

**Cómo se manejan las credenciales:** `l10n_mx_edi_pac_username` en `res.company` + los certificados (CSD) como registros `certificate.certificate` (4 en SERVICIOS FTS, 1 en la empresa 4). Están **dentro de Odoo**, administradas por Esteban en la UI. No hay copia en Railway ni en el repo, y así debe quedarse.

**Implicación de diseño (la decisión que Gemini tiene que tomar primero):**
- La **emisión** ya está resuelta y no hay que tocarla. Meter un timbrado paralelo por Finkok directo duplicaría al escritor del mismo dato — el antipatrón que ya nos costó caro (regla: *un solo escritor por campo*).
- Lo que falta es **recepción y conciliación**: bajar del SAT lo que terceros nos emitieron y cruzarlo contra `account.move`. Eso **no** necesita Finkok: necesita la **descarga masiva del SAT** (web service propio del SAT, con FIEL) o un tercero de descarga masiva.
- Si se quiere usar Finkok para la descarga masiva (tiene ese producto), sería una **credencial nueva y un camino nuevo**, no una extensión de lo que ya existe.

---

## 5. Repositorio `fts-suite`

**Público**, sirve GitHub Pages. HTML+JS modular sin framework. Commit base de este reporte: `f8640ea`.

> ⚠️ **Es público.** Nada de datos personales, correos, teléfonos ni RFC de personas físicas. Y borrarlos del archivo no los borra del historial.

### 5.1 Estructura
```
fts-suite/
├── index.html · version.json (1.0.0)
├── shared/                    ← núcleo compartido
│   ├── modules-registry.js      el registro de módulos del launcher/admin
│   ├── auth.js · auth-suite.js · auth-jwt.js · odoo.js (n8nFetch: retry 2x, timeout 10s)
│   ├── panel/                   panel-shell.js · panel-tabla.js · panel.css
│   ├── config/                  empleados-master.json · festivos-mx-2026.json · …
│   └── operaciones/             sla_stages.json · contpaqi_conceptos.json · watchdogs_mo.json
├── finanzas/                  ← DONDE ENTRA LO FISCAL
│   ├── manifest.json            declara los 23 submódulos y su estado
│   ├── js/ fin-client.js · auth-fin.js · router.js · state.js · company-selector.js
│   ├── js/modules/ facturas-odoo.js · bills-odoo.js · facturas-core.js · instrumentos-pago.js
│   ├── data/mock/               contratos de datos (la fuente de verdad del contrato)
│   └── rentabilidad/index.html  primer módulo con dirección propia (campo url)
├── operaciones/               kiosk · planeacion · carga-mo · confirmar-horas · dashboard · incidencias
├── comercial/                 machote · data · js · scripts · tests
├── modulos/rh/ · seguridad/ · ingenieria/ · pmo/ · hatch/ · website/
├── db/                        ← estructura del Postgres de la Suite
│   ├── README.md
│   └── migrations/comercial/   001_fundacion … 009_compromisos_comerciales.sql
├── docs/                      finanzas/ · operaciones/ · watchdogs/ · INCIDENTES/ · analisis/
├── scripts/                   n8n/ · local-ejemplo/   (scripts/local/ está gitignored: lee nómina real)
└── tests/
```

### 5.2 El punto de enlace — **ya está declarado y vacío**

El módulo existe en el manifest desde antes de este reporte, esperando implementación:

```json
// finanzas/manifest.json L14
{ "id": "concil-sat", "name": "Conciliación SAT ↔ Odoo", "block": "B1",
  "icon": "⇄", "status": "empty", "webhook": null }
```
```js
// shared/modules-registry.js L71
{ id:'concil-sat', label:'Conciliación SAT ↔ Odoo' },
```

Y la nota del propio manifest ya anticipaba el alcance: *"SAT requiere descarga masiva (asunto aparte)."*

**Los 5 enganches concretos, en orden de implementación:**

1. **Frontend** — `finanzas/manifest.json`: cambiar `status: "empty"` → `"real-readonly"` y poblar `webhook: "/fin/concil-sat"`. El `status` declara la **capacidad máxima**; el modo vivo por usuario está en `localStorage['fts_fin_mode_concil-sat']`. Si el módulo va a tener pantalla propia (recomendado, como rentabilidad), agregar `"url": "concil-sat/index.html"` — un módulo sin `url` se pinta dentro del shell.
2. **Registro de vista** — `finanzas/js/router.js`: `FinRouter.register('concil-sat', { render(container, ctx) })`.
3. **Transporte** — `window.FinClient.call('/fin/concil-sat', params)` (`finanzas/js/fin-client.js`). POST a `https://primary-production-5c3c.up.railway.app/webhook/fin/concil-sat`, **token JWT en el body**, y clasificación de fallo ya resuelta: `NO_SESSION` / `SESSION_EXPIRED` / `NETWORK`.
4. **Contrato de datos** — seguir el patrón de `facturas-core.js` + el mock, **no** el PLAN.md (§5 quedó stale): respuesta `{ rows, summary, pagination: { has_more } }`, params `companies[]` / `date_from` / `date_to` / `limit` / `offset` / `sort_*`. **Y agregar el mock primero** (`finanzas/data/mock/concil-sat.mock.json`): el mock ES el contrato.
5. **Persistencia** — `db/migrations/fiscal/010_*.sql`. Un esquema por dominio, un rol por aplicación, **numeración global** (el siguiente archivo es el `010`, no un `001`). La base no se toca a mano: todo cambio es un archivo nuevo, aplicado por `comercial/db-migrate` (`4hyzXjkr31h8DPPS`, inactivo a propósito, se dispara a mano y verifica sha256 + read-back).

⚠️ **Regla de despliegue que aplica aquí** (ya trabó producción una vez): cuando un cambio altera el contrato frontend↔workflow, **no se publica una mitad sin la otra verificada**. Si por fuerza una va primero, que sea la **tolerante** (acepta viejo y nuevo), nunca el lado estricto. Y todo módulo con `version.json` **bumpea el build** (`YYYYMMDD-<modulo>-<hito>`): la verificación es visual, en pantalla.

---

## 6. Lo que le falta a este reporte (para que nadie lo dé por cerrado)

| Hueco | Por qué no se cerró | Cómo se cierra |
|---|---|---|
| Versión exacta de Odoo | `ir.*` bloqueado en MCP + egress deniega `serviciosfts.odoo.com` | Esteban: **Ajustes → Acerca de** en Odoo, o `/web/webclient/version_info` desde su navegador |
| Lista literal de módulos `l10n_mx_*` instalados | `ir.module.module` bloqueado | Igual: Aplicaciones, filtrar `l10n_mx` |
| Valor de `EXECUTIONS_MODE` | `list-variables` devuelve **todos** los valores en claro, incluidos secretos. No se llamó a propósito | Railway UI, o aceptar el riesgo de rotación |
| Si el `not_found` de los 79 UUID es real o es rezago | No se inspeccionó uno por uno | Un read de esos 79 con `invoice_date` + `partner_id` + `sat_state` |
| Cuántos XML de proveedor existen ya en Odoo sin vincular | `ir.attachment` bloqueado | JSON-RPC desde n8n |

**Y la pregunta que decide la arquitectura, que no es técnica:** ¿el origen de la verdad fiscal va a ser la **descarga masiva del SAT con FIEL** (gratis, API del SAT, asíncrona y con colas de hasta 72 h) o un **tercero de descarga masiva** (Finkok u otro: cuesta, pero entrega síncrono y ya resuelto)? Todo el diseño del ingestor cuelga de esa decisión.
