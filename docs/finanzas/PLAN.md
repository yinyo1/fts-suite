# FTS Suite · Módulo Finanzas — PLAN de Implementación · **v2**

> **Estado:** análisis FINAL pre-desarrollo. NADA implementado. Documento para aprobar antes del Paso 1.
> **Autor:** Claude Code · 28-may-2026 · grounded en lectura real del repo + n8n MCP + Odoo MCP (read-only).
> **v2:** incorpora decisiones de Esteban (multi-company + multi-currency desde v1, auth de 1 usuario) y verificación profunda de Odoo/n8n. Las contradicciones con decisiones tomadas se marcan como `RIESGO:` (no se cambian unilateralmente).

---

## 0. Cambios de alcance v1 → v2

| Tema | v1 | v2 (decisión Esteban) |
|---|---|---|
| Companies | solo SERVICIOS FTS (1) | **Multi-company desde v1:** FTS MX (`company_id=1`) + FTS USA (`company_id=6`). Vista consolidada por default + selector. |
| Currency | MXN, USD fase 2 | **Multi-currency desde v1:** monto en moneda nativa + equivalente MXN (rate de Odoo a fecha de factura). |
| Auth/roles | JWT con claim de role, RBAC | **1 solo usuario compartido**, acceso total, sin roles. JWT con estructura lista para roles pero sin usarlos aún. Trazabilidad individual → v2 del producto. |
| Manifest | con `permissions` por rol | **Simplificado** sin `permissions`; con sub-estados de `status`. |
| Hashing/JWT | scrypt + JWT-HMAC con `node:crypto` | ⚠️ Ver **RIESGO-1**: el sandbox de n8n NO permite `node:crypto`. Se mantiene la intención (HMAC-JWT + hash con salt) pero **en JS puro**. |
| Detalle factura | listado + export v1 | igual (drill-down a líneas en v2). |

---

## 1. Resumen ejecutivo

El módulo Finanzas se monta sobre el stack validado (GitHub Pages + n8n/Railway + Odoo 19). Confirmado en v2:

- **FTS USA existe como company real en Odoo** (`company_id=6`, USD, United States) — **NO es bloqueante**. Factura activo (13 out + 13 in en 6 meses).
- **El sandbox de Code nodes de n8n está restringido**: sin `require`, `node:crypto`, `process`, ni `$env` (evidencia directa en el workflow de auth de PMO). Esto **obliga a HMAC/hash en JS puro** y a una estrategia de secretos distinta a env vars en Code node → `RIESGO-1`.
- **El auth actual del Suite (`FTSAuth`) no sirve** (hashes SHA-256 sin salt en repo público). Finanzas estrena auth server-side.
- **No hay cliente n8n compartido** (`shared/odoo.js` vacío), **ni componentes UI compartidos** (`shared/` es plano, sin `ui/`), **ni CI/CD** (no hay `.github/workflows/`; deploy = push a `main` → GitHub Pages). Todo se construye en `finanzas/` tomando el HTML draft como referencia visual.
- **`account.move` listo** con campos signed/currency; la consolidación a MXN de las facturas USD requiere conversión por rate → `RIESGO-4`.

---

## 2. Inventario A — Odoo multi-company

### A.1 Companies registradas (`res.company`, 8 activas)

| company_id | Nombre | Moneda | País | Relevante Finanzas |
|---|---|---|---|---|
| **1** | **SERVICIOS FTS** | MXN | México | ✅ SÍ (principal) |
| **6** | **FTS FULL TECHNOLOGY SYSTEMS LLC** | **USD** | **United States** | ✅ SÍ (USA) |
| 4 | TECNOLOGIAS Y PRODUCTOS YIN | MXN | México | ❌ (otra entidad) |
| 2,3,5,8,10 | Personales / terceros (Juan, Esteban, Ximena, "Taqueria los Jimenez", etc.) | MXN | MX | ❌ |

→ **FTS USA NO es bloqueante**: existe como company `6`, activa, USD. El plan multi-company procede.

### A.2 Acceso del API key `Wansi69xesEqEiY1` a ambas companies

- El **MCP de Odoo** (usuario distinto al de la credencial) **SÍ ve datos de company 1 y 6** (los agregados devolvieron ambas). Eso prueba que el dato es accesible multi-company a nivel DB.
- ⚠️ **`RIESGO-6` / BLOQUEANTE A VERIFICAR:** la credencial n8n `Wansi69xesEqEiY1` es un **usuario Odoo distinto** al del MCP. No pude verificar desde aquí que ESE usuario tenga `company_ids` = {1, 6}. **Antes del Paso 3** hay que confirmar (en Odoo: Settings → Users → el usuario de la API key → Allowed Companies) que incluye FTS USA. Si solo tiene company 1, las queries a company 6 volverán vacías silenciosamente.
- **Multi-company en queries XML-RPC:** el contexto se controla con `allowed_company_ids` / `force_company` en el `context` de la llamada. El nodo Odoo community (v2.16.1) no expone esto directo → puede requerir filtrar por `company_id` en el domain (que SÍ funciona si el usuario tiene acceso) en vez de cambiar el contexto. **Approach recomendado:** no cambiar contexto; filtrar `['company_id','in',[1,6]]` en el `filterRequest` y confiar en que el usuario ve ambas.

### A.3 Inventario de facturas por company (6 meses, posted)

| company | out_invoice | in_invoice | out_refund |
|---|---|---|---|
| 1 · SERVICIOS FTS | 27 | 780 | 1 |
| 6 · FTS USA | 13 | 13 | 0 |
| 4 · YIN | 0 | 1 | 0 |

**Distribución de moneda (6mo, out+in):** MXN **799** · USD **35** (~4%). El grueso es MXN; USD vive en company 6.

### A.4 Esquema de campos `account.move` (confirmados existentes)

| Campo | Existe | Notas |
|---|---|---|
| `id`, `name`, `ref`, `move_type`, `state` | ✅ | `name`=folio (INV…); `ref`=ref proveedor |
| `partner_id`, `journal_id`, `currency_id`, `company_id` | ✅ | many2one → vienen como `[id, "nombre"]` |
| `invoice_date`, `invoice_date_due` | ✅ | |
| `payment_state` | ✅ | paid / not_paid / partial / in_payment / reversed |
| `amount_total`, `amount_untaxed`, `amount_tax` | ✅ | en **moneda de la factura** |
| `amount_residual` | ✅ | saldo, moneda factura |
| `amount_total_signed`, `amount_residual_signed` | ✅ | **en moneda de la COMPANY** (USA=USD, MX=MXN). NO es MXN global → ver A.5 / RIESGO-4 |
| `amount_total_in_currency_signed` | ✅ | total con signo en moneda factura |
| `l10n_mx_edi_cfdi_uuid` | ✅ | **`false`** en facturas de company 6 (USA) — confirmado |
| `invoice_origin` | ✅ | SO/PO origen (ej. SO11663) |
| `currency_rate` | ⚠️ no confirmado en header | Odoo suele exponerlo; si no, se deriva (A.5) |
| `project_id` (header) | ❌ probable inexistente | la dimensión proyecto va por `analytic_distribution` en **líneas** (`account.move.line`), v19 |

### A.5 Currency rate — cómo obtener el equivalente MXN

Hechos verificados: para una factura USD de company 6, `amount_total = amount_total_signed = amount_total_in_currency_signed = 534.4` (todos USD). **Conclusión: `*_signed` está en moneda de la company, NO en un MXN global.** No existe un campo "equivalente MXN consolidado" listo.

`RIESGO-4` (consolidación MXN): para mostrar USD→MXN hay que **convertir con un rate a la fecha de la factura**. Opciones:
- **(a)** Pedir `res.currency` / `res.currency.rate` (tabla de tasas por fecha) y aplicar `monto_mxn = monto_usd * rate(USD→MXN, invoice_date)`. Requiere un nodo Odoo extra que lea rates.
- **(b)** Usar el método nativo de Odoo `currency._convert(amount, to, company, date)` — más preciso, pero es un *method call* no expuesto por el nodo community → requeriría un HTTP/JSON-RPC manual.
- **(c)** v1 pragmático: como solo ~4% son USD y todas en company 6, devolver `amount_native` + `currency`, y `amount_mxn` calculado con rate (a) **solo para USD**; MXN-equiv de facturas MXN = nativo (rate 1).

**Recomendación:** approach (a) en v1 (un nodo Odoo SEARCH a `res.currency.rate` para USD, cachear el rate por fecha). Documentar que el rate es el de Odoo (no Banxico/DOF) salvo que Esteban indique otra fuente → `PREGUNTA #1`.

### A.6 CFDI en USA

- `l10n_mx_edi_cfdi_uuid = false` confirmado en facturas de company 6 (esperado, USA no emite CFDI).
- `PREGUNTA #8:` ¿Caro necesita en el export algún identificador fiscal USA (EIN, invoice #, W-9)? Odoo guarda el fiscal del partner en `vat`/`partner_id.vat`. Si sí, se agrega `partner_vat` al webhook. (No bloqueante v1.)

---

## 3. Inventario B — n8n

### B.1 Entorno
- Base webhooks: `https://primary-production-5c3c.up.railway.app/webhook/<path>`. n8n v2.50.0, conectado.
- Env vars en Railway: **se pueden definir** (ya se aplicaron las de retención de logs hoy). PERO ver `RIESGO-1`: un Code node **no las lee con `$env`/`process.env`** en este sandbox.
- **Workflow de referencia con auth:** PMO `chat-apply` valida requests con **HMAC-SHA256 en JS puro** (`docs/n8n-workflows/pmo-chat-apply-code-code-validar-auth.js`). Es el patrón a reusar (firma + ventana de tiempo 5 min + comparación constant-time). **Modelo: firma en el BODY, no header.**

### B.2 Capacidad técnica de Code nodes — `RIESGO-1` (contradice decisión "node:crypto")

Evidencia directa (comentario línea 1 del auth de PMO): *"sandbox-safe — sin crypto.subtle, sin require, sin process, sin $env"*. El autor implementó SHA-256/HMAC **a mano** justamente porque el sandbox **no expone**:
- ❌ `require('crypto')` / `node:crypto` → **`scrypt` y `createHmac` NO disponibles**.
- ❌ `process.env` / `$env` dentro del Code node.
- ❌ `crypto.subtle` (Web Crypto) dentro del Code node.

**Implicaciones para el auth de Finanzas:**
- **JWT firmado:** ✅ factible con **HMAC-SHA256 en JS puro** (ya existe implementación probada en el repo — reusar verbatim).
- **Hash de password:** ❌ `scrypt` impracticable en JS puro (memory-hard, lento). ✅ Alternativa: **PBKDF2-SHA256 en JS puro** (es HMAC iterado; el primitivo SHA-256 ya existe). Para **1 login** con ~100k iteraciones es aceptable (~cientos de ms, una vez).
- **Secretos (`JWT_SECRET`, hash del user):** como `$env` no se lee en Code node → opciones:
  - **(i)** Hardcodear en el Code node del workflow de login. El workflow JSON vive en n8n (no en el repo público) — **siempre que NO se exporte el JSON a `docs/`** (ver `RIESGO-3`).
  - **(ii)** Verificar si `{{$env.FINANZAS_JWT_SECRET}}` resuelve en un nodo de **expresión** (Set), que NO es el sandbox del Code node. Si funciona, es lo más limpio. **A verificar en Paso 1.**
  - **(iii)** Guardar en una credential de n8n.
  - **Recomendación:** intentar (ii); si falla, usar (i) con la disciplina de no commitear el workflow.

> `PREGUNTA #2 (revisada):` la decisión "scrypt + node:crypto nativo" **no es viable** en este n8n. ¿Apruebas el reemplazo por **PBKDF2-SHA256 + HMAC-JWT, ambos en JS puro** (patrón ya probado en producción para PMO)? Es igual de seguro para 1 usuario.

### B.3 CORS / preflight — `RIESGO-2`

- El webhook `kiosk/empleados` tiene `options: {}` (sin CORS configurado) y aun así GitHub Pages lo consume con éxito (POST `application/json`). n8n maneja el preflight en estas rutas.
- ⚠️ **`RIESGO-2`:** agregar un header `Authorization: Bearer` convierte el request en "no simple" y **fuerza un preflight OPTIONS** que el webhook (solo POST) podría no contestar → el fetch fallaría desde el browser.
- **Mitigación (alineada con el patrón PMO que ya funciona):** **NO** mandar el token en header `Authorization`. Mandarlo en el **body** (POST) o como query param. Así se evita el preflight de headers custom y se reusa el patrón probado. Esto **contradice el brief** ("header Authorization: Bearer") → lo dejo como recomendación + `PREGUNTA #9`. Alternativa si se quiere header: configurar en el webhook `Allowed Origins (CORS)` + allowed headers incluyendo `authorization`, y verificar que n8n responde el OPTIONS.

### B.4 Conflictos de nombres de webhook

Webhooks actuales (15 workflows): `kiosk/{empleados,checkin,sos,estado-empleado,cerrar-registro,asistencia,asistencia-rango,ping}`, `incidencias/*`, `panel/derivar-roles`, `rh/empleados-master/refresh`, `dashboard/resumen`, `asistencias/admin`, `accesos-incidencias/guardar`.
→ **`/auth/finanzas-login` y `/fin/*` NO chocan.** Convención: namespace por prefijo (`kiosk/`, `incidencias/`, `rh/`). Finanzas usa `fin/` y `auth/`. ✅

### B.5 Error handling y rate limiting
- Patrón estándar: Code node devuelve `{_error, code, http, msg}`; un IF/Respond traduce a status. (Visto en PMO auth.)
- No hay rate-limiting a nivel n8n/Railway visible → el **lockout por intentos** del login lo implementa el propio workflow (B.6 del spec auth) usando `staticData` del workflow o un contador en memoria por ventana.

---

## 4. Inventario C — Frontend

### C.1 Manifest/registry actual
- `shared/modules-registry.js` → `MODULES_REGISTRY` (array de `{id, label, path, cardId, submodulos[]}`). Submódulos admiten `status`/`version`/`build` (ej. `planeacion` tiene `status:'active'`).
- Sirve para **registrar la app** Finanzas en el launcher (1 entrada nueva), pero el **estado por módulo demo/real** de Finanzas vivirá en su **propio `manifest.json`** (más rico: webhook, block, status). El registry global y el manifest de Finanzas son complementarios.

### C.2 CI/CD
- **No hay `.github/workflows/`.** Deploy = **push a `main` → GitHub Pages** rebuild (~60-90s). Flujo manual. Cache-busting via query string / `version.json` (patrón del repo). No se necesita pipeline nuevo para Finanzas.

### C.3 Componentes shared/ui reutilizables
- `shared/` es **plano**: `auth-suite.js`, `config-sync.js`, `fts-styles.css`, `modules-registry.js`, etc. **No hay `shared/ui/`** (ni toast, modal, table, paginación reutilizables).
- → **`RIESGO-5` (menor):** los componentes UI (sidebar, tabla paginada, toast, modal, filtros) **se construyen desde cero** en `finanzas/`, tomando el **HTML draft** (`fts-suite-finanzas-v2.html`) como base visual. El draft ya trae el design system completo (CSS vars navy/amber, IBM Plex, `.card`, `.data-table`, `.pill`, `.nav-item` con badges) → se extrae a `finanzas/css/finanzas.css`.

---

## 5. Spec webhook `/fin/facturas` (multi-company)

- **Método:** POST (token en body — ver `RIESGO-2`). Path `/webhook/fin/facturas`.
- **Auth:** body incluye `token` (JWT). Code inicial valida firma HMAC (JS puro) + `exp`. Inválido → `{_error, http:401}`.
- **Body params:**
  | Param | Default | Notas |
  |---|---|---|
  | `token` | — | JWT de login (requerido) |
  | `from_date` / `to_date` | hoy-30d / hoy | `invoice_date` rango |
  | `type` | `all` | out / in / all → `move_type` |
  | `company_id` | **`all`** (=[1,6]) | filtro company (selector) |
  | `partner_id`, `payment_state` | — | opcionales |
  | `state` | `posted` | |
  | `limit` / `offset` | 100 / 0 | máx 200, paginación |

- **Lógica:** validar JWT → domain (incluye `['company_id','in', companies]`) → Odoo SEARCH `account.move` (fieldsList ARRAY) → Odoo SEARCH `res.currency.rate` para USD (rate por fecha, A.5) → `aggregate_records` para `total_count` + `summary` → Code map → Respond.

- **Respuesta:**
```json
{
  "facturas": [
    {
      "id": 57357, "name": "INV1997", "partner": "Nalco de Mexico",
      "type": "out_invoice", "company_id": 1, "company_name": "SERVICIOS FTS",
      "date": "2026-05-27", "due_date": "2026-07-26",
      "currency": "MXN", "amount_native": 2273646.40, "amount_mxn": 2273646.40,
      "currency_rate": 1.0,
      "amount_residual_native": 2273646.40, "payment_state": "not_paid",
      "cfdi_uuid": "AE4ACC99-...", "origin": "SO11663"
    },
    {
      "id": 57295, "name": "INV164", "partner": "CORPORATE USA",
      "type": "out_invoice", "company_id": 6, "company_name": "FTS USA",
      "currency": "USD", "amount_native": 534.40, "amount_mxn": 9619.20,
      "currency_rate": 18.0, "amount_residual_native": 534.40,
      "payment_state": "not_paid", "cfdi_uuid": null, "origin": null
    }
  ],
  "total_count": 40,
  "summary": {
    "consolidado_mxn": {"total": 20500000.00, "paid": 18, "not_paid": 20, "partial": 2},
    "by_company": {
      "1": {"name":"SERVICIOS FTS","currency":"MXN","total_native": 20035972.21, "total_mxn": 20035972.21},
      "6": {"name":"FTS USA","currency":"USD","total_native": 25800.00, "total_mxn": 464400.00}
    }
  },
  "page": {"limit": 100, "offset": 0}
}
```
> `summary.by_company` en moneda nativa + `consolidado_mxn` con todo convertido. El front muestra KPIs consolidados MXN + desglose por company.

---

## 6. Spec workflow `/auth/finanzas-login` (1 usuario, JS puro)

- **Método:** POST `/webhook/auth/finanzas-login`, body `{user, password}`.
- **Flujo de nodos:**
  1. **Code — validar + hash (JS puro):** PBKDF2-SHA256(password, salt, 100k) → compara constant-time contra el hash almacenado del usuario. Salt + hash + `JWT_SECRET` provienen de §B.2 (expresión `$env` si funciona, si no hardcode en workflow).
  2. **Code — firmar JWT (JS puro HMAC-SHA256):** header `{alg:HS256,typ:JWT}` + payload + firma base64url.
  3. **Respond:** `{token, expires_at}` o `{_error, http:401}`.
- **Estructura del JWT (claims):**
  ```json
  { "sub": "finanzas", "iat": 1716940000, "exp": 1716968800,
    "app": "finanzas", "ver": 1, "role": null }
  ```
  (`role:null` reservado para RBAC futuro; el verificador no lo exige aún.)
- **Lifetime:** **8 horas** (`exp = iat + 28800`). Sin refresh automático (re-login manual). Stateless (no store; Redis se apaga).
- **Rate limit / lockout:** contador por ventana en `workflow.staticData` (o por IP del header `x-forwarded-for`): **5 intentos fallidos → lockout 15 min**. Respuesta `{_error, code:'LOCKED', http:429}`. (En memoria/staticData; aceptable para 1 usuario.)
- **Verificación en `/fin/*`:** Code inicial recomputa HMAC sobre `header.payload` y compara con la firma + valida `exp`. No toca Odoo si falla.

---

## 7. Spec `manifest.json` (v1 simplificado, sin permisos)

`finanzas/manifest.json`:
```json
{
  "app": "finanzas",
  "version": "0.1.0",
  "modules": [
    { "id": "dashboard", "name": "Dashboard", "block": null, "status": "empty", "webhook": null },
    { "id": "facturas", "name": "Facturas", "block": "B4", "status": "real-readonly",
      "webhook": "/fin/facturas", "last_updated": "2026-05-29" }
  ],
  "status_legend": {
    "empty": "Sin webhook configurado",
    "demo": "Datos demo activos",
    "real-readonly": "Conectado a Odoo (solo lectura)",
    "real": "Conectado a Odoo (lectura + escritura)"
  }
}
```
- Estado activo por módulo (lo que elige el usuario con el toggle) vive en `localStorage['fts_fin_mode_<id>']`; el `status` del manifest declara la **capacidad máxima** del módulo (si no hay webhook, el toggle "Real" se deshabilita).
- Los 13 módulos se listan; los no implementados quedan `status:"empty"`.

---

## 8. Plan de implementación (5 pasos refinados)

| Paso | Entregable | Detalle | Esfuerzo |
|---|---|---|---|
| **1 · Auth** | login server-side | Workflow `auth/finanzas-login` (PBKDF2+HMAC-JWT **JS puro**) + verificación de secreto (§B.2) + `finanzas/login` + `auth-fin.js` + `fin-client.js` (token en body). Smoke: login OK/KO, exp 8h, lockout. | ~3.5h |
| **2 · Shell + sidebar** | shell + estados | `finanzas/index.html` (extraído del draft) + `manifest.json` + `sidebar.js` con dots ⚪🟡🟢 + entrada en `MODULES_REGISTRY`. Los 13 módulos como items; 12 en `empty`. | ~2.5h |
| **3 · Webhook facturas** | `/fin/facturas` multi-company | Workflow: validar JWT → domain multi-company → Odoo SEARCH + `res.currency.rate` + aggregate → JSON (nativo + MXN). **Pre-req: verificar A.2 (credencial ve company 6).** Smoke vs Odoo real. | ~4h |
| **4 · Módulo Facturas** | UI completa | tabla paginada + filtros (fechas/tipo/company/partner/status/pago) + KPIs (consolidado MXN + by-company) + columnas nativo/MXN + export Excel/CSV (itera todas las páginas). | ~4.5h |
| **5 · Toggle demo/real** | estados funcionales | `state.js` empty/demo/real por módulo + mock `data/mock/facturas.mock.json` + default todo en ceros. E2E con Caro. | ~2h + Caro |

**Total:** ~16.5h CC + validación Caro. Orden 1→2→3→4→5 (4 puede solaparse con 5).

---

## 9. Bloqueantes y riesgos (acción antes/durante de codear)

### Bloqueantes (resolver antes del paso indicado)
- **BLOQ-1 (antes Paso 3):** verificar que la credencial Odoo `Wansi69xesEqEiY1` (usuario n8n) tiene **Allowed Companies = {FTS MX, FTS USA}**. Si no, pedir al admin Odoo habilitarlo. (FTS USA company SÍ existe — eso ya no bloquea.)
- **BLOQ-2 (antes Paso 1):** decidir estrategia de secreto en n8n (`$env` en expresión vs hardcode en workflow) — depende de verificar `RIESGO-1`. Y **obtener de Esteban el/los password(s)** del usuario compartido de Finanzas para generar el hash (nunca commiteado).
- **BLOQ-3 (antes Paso 1):** confirmar el approach de transporte del token (body vs header) por `RIESGO-2`.

### Riesgos (flagged; NO cambiados unilateralmente)
- **`RIESGO-1`** — *Contradice la decisión "scrypt + node:crypto nativo".* El sandbox de n8n no expone `require`/`node:crypto`/`process`/`$env`. Propuesta: **PBKDF2-SHA256 + HMAC-JWT en JS puro** (patrón ya en producción para PMO). Requiere tu OK (`PREGUNTA #2`).
- **`RIESGO-2`** — *Contradice "header Authorization: Bearer".* Un header custom fuerza preflight CORS que el webhook puede no contestar. Propuesta: **token en el body** (como PMO). Requiere tu OK (`PREGUNTA #9`).
- **`RIESGO-3` (SEGURIDAD)** — el archivo `docs/n8n-workflows/pmo-chat-apply-code-code-validar-auth.js` tiene un **`SECRET` HMAC hardcodeado commiteado en el repo público** (línea 4). Cualquiera puede forjar requests al chat de PMO. **Recomendación: rotar ese secreto + dejar de exportar JS de workflows con secretos al repo.** Para Finanzas: NUNCA commitear el workflow/Code con el `JWT_SECRET`.
- **`RIESGO-4`** — `amount_total_signed` es moneda de la company, no MXN global. La consolidación MXN de USD requiere conversión por rate (A.5). Mitigado con nodo `res.currency.rate`. Define la fuente del rate (`PREGUNTA #1`).
- **`RIESGO-5`** — no hay componentes UI compartidos; se construyen en `finanzas/` desde el draft (esfuerzo ya contemplado en Paso 2/4).
- **`RIESGO-6`** — acceso multi-company de la credencial n8n no verificable desde aquí (= BLOQ-1).

### Preguntas para Esteban
1. **Fuente del tipo de cambio** USD→MXN: ¿rate de Odoo (`res.currency`) o fuente externa (Banxico/DOF)? ¿Rate del día de la factura (recomendado) o del día de consulta?
2. **`RIESGO-1`:** ¿OK reemplazar scrypt/node:crypto por **PBKDF2 + HMAC-JWT en JS puro**?
3. **Usuario compartido:** ¿user/password definitivos? ¿lo genero yo el hash con un script local que corres tú?
4. **Companies en scope:** ¿solo {1 MX, 6 USA} o también incluir company 4 (YIN)? (Default propuesto: {1,6}.)
5. **Manifiesto** estático confirmado (sí, ya decidido).
6. **HTML draft** `fts-suite-finanzas-v2.html`: recibido como referencia (lo encontré en tu Downloads). ¿Lo subo a `finanzas/` como base o solo extraigo el design system?
7. **Detalle de factura:** listado+export en v1 confirmado (drill-down v2).
8. **Fiscal USA en export:** ¿Caro necesita `vat`/EIN del partner USA en el export?
9. **`RIESGO-2`:** ¿OK token en body (vs header Authorization)?

---

## Anexo — Constantes confirmadas (v2)
- Odoo companies: **FTS MX = 1 (MXN)**, **FTS USA = 6 (USD)**. Credencial n8n: `Wansi69xesEqEiY1` ("Odoo FTS").
- `account.move`: ~835 posted/6mo (96% MXN). Campos signed = moneda company (no MXN global).
- Webhooks base: `https://primary-production-5c3c.up.railway.app/webhook/`. Sin colisión con `fin/`+`auth/`.
- n8n Code sandbox: **sin `require`/`node:crypto`/`process`/`$env`** → JS puro obligatorio (HMAC-SHA256 ya implementado en repo, reusar).
- Frontend: sin CI/CD (push→Pages), sin `shared/ui/`. Draft = `fts-suite-finanzas-v2.html` (design system navy/amber, IBM Plex). Registrar app en `MODULES_REGISTRY`.
- **NO reutilizar** `FTSAuth`/`users-suite.json` para credenciales.

> **Siguiente acción:** Esteban responde las 9 preguntas (en especial #2, #9, BLOQ-1/2). Con eso aprobado, el siguiente prompt es **Paso 1 (auth)**. No se escribe código hasta entonces.
