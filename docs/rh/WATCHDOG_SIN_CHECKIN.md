# RH Watchdog — empleados activos sin checkin (build 2026-06-20)

Branch `feat/rh-watchdog-sin-checkin`. Workflow n8n **`rh/watchdog/sin-checkin`** (id **`Q19zFeJQytSfBjdb`**), **INACTIVO** (solo falta Publish). Generador: `scripts/local/rh/gen-rh-watchdog-sincheckin.js` (gitignored).

## Patrón de correo reusado (FASE A — deep search)
Investigados `ops/watchdog-semaforo` + `crear-proyecto-al-confirmar`. Ambos usan el **mismo patrón**:
- Nodo **`Code`** arma el objeto Graph `{ message:{ subject, body:{ contentType:'HTML', content }, toRecipients:[…] }, saveToSentItems:true }`.
- Nodo **`HTTP - Enviar correo (Graph)`** (`httpRequest` v4.2, POST `https://graph.microsoft.com/v1.0/users/sales@fts.mx/sendMail`, `genericAuthType: oAuth2Api`, `jsonBody = ={{ JSON.stringify($json) }}`) con credencial **`oAuth2Api` `Mh5kBNduMzOl3nzT` "Microsoft Graph - sales"**.
- HTML **ASCII-safe** (entidades `&#…;`). Schedule del semáforo: `cron "0 14 * * 1-5"` + `settings.timezone "UTC"` (= 8am CST L-V).
→ El watchdog **reusa el nodo Graph + la misma credencial + el mismo Schedule**. No se inventó nada.

## Diseño
`Schedule/Manual → Set hoy → Code prep (corte −30d) → Odoo getAll empleados → col1 → Odoo getAll attendances → Code MAIN → Code buildEmail → HTTP Graph`

- **Schedule:** `0 14 * * 1-5` + `timezone UTC` = **8am CST, L-V** (no sáb/dom).
- **Empleados:** `hr.employee` `active=true` **+ `department_id != false`** → excluye las cuentas de sistema (sin depto: Administracion FTS-YIN, CAJERO, etc.). Refuerzo: `EXCLUDE_NAMES=['FTS-YIN']` + `EXCLUDE_IDS=[]` en el Code.
- **Días hábiles sin checkin:** último `check_in` por empleado (ventana 30 días) → `bizDaysSince()` cuenta **solo L-V** (excluye findes → no falsos positivos los lunes). Umbral **`>= 5` días hábiles**. Sin checkin en la ventana → marcado como `>30d / nunca`. Empleado **muy nuevo** (creado hace < 5 días hábiles) **no** se marca.
- **Correo:** si `total > 0` → **UN** correo resumen a `estebandelacruz@fts.mx`, `magaly@fts.mx`, `ana.acevedo@fts.mx`. Asunto `[RH Watchdog] N empleado(s) sin checar >=5 dias habiles - YYYY-MM-DD`. Cuerpo = tabla (Empleado · Depto · Último checkin · Días hábiles) + texto pidiendo validar baja/permiso. **NO archiva, solo avisa.** Si `total === 0` → `buildEmail` devuelve `[]` → **no se envía**.

## Config (flags visibles en `Code - MAIN`)
`UMBRAL_DIAS_HABILES = 5` · `VALIDAR_VACACIONES = false` · `EXCLUDE_NAMES = ['FTS-YIN']` · `EXCLUDE_IDS = []`.

## 🔓 Decisión abierta — filtro de vacaciones
`VALIDAR_VACACIONES = false` (desactivado). Hay un **bloque comentado en `Code - MAIN`** listo para cuando exista el **módulo de permisos (`hr.leave`)**: `SEARCH hr.leave` del empleado con `state='validate'` y hoy entre `date_from`/`date_to` → si está de vacaciones, `continue` (no alertar). Mientras tanto el watchdog **alerta sin filtrar vacaciones** (RH valida manualmente en el correo).

## Estado / verificación

| Campo | Valor |
|---|---|
| id n8n | `Q19zFeJQytSfBjdb` |
| Schedule | `0 14 * * 1-5` + tz `UTC` (8am CST L-V) |
| Nodos Odoo (customResource) | `hr.employee` · `hr.attendance` — ambos poblados ✅ |
| Credencial Odoo | `Odoo FTS` (`Wansi69xesEqEiY1`) ✅ |
| Credencial correo | `Microsoft Graph - sales` (`Mh5kBNduMzOl3nzT`) — la misma que semáforo/órdenes ✅ |
| `n8n_validate_workflow` | **valid: true, 0 errores** |
| Estado | 🔴 **inactivo** → solo falta **Publish** |

## Smoke (tras Publish)
1. **Manual Trigger** → revisar `Code - MAIN` (lista de empleados sobre umbral) sin esperar al cron.
2. Si hay 1+ → llega 1 correo a los 3 destinatarios con la tabla. Si 0 → no llega nada (correcto).
3. Validar que las cuentas de sistema NO aparecen.
4. Activar el Schedule (Publish) → corre L-V 8am CST.
