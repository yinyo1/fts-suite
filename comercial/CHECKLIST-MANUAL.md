# Checklist manual — MVP Comercial

**Tiempo estimado: ~15 min.** En orden; los pasos 1–2 son prerequisitos de todo lo demás.

Nada de esto se pudo hacer desde la sesión autónoma: el API de n8n de esta instancia **no permite activar workflows vía MCP** (regla de la casa #6 + CLAUDE.md §16), y el campo `customResource` **se blanquea al importar**.

---

## 0. Mergear el PR

Rama: `feat/comercial-mvp`.

⚠️ **Hazlo primero.** El watchdog lee su config de `main` en vivo (`shared/comercial/watchdog_enviadas.json`). Si corres el watchdog antes de mergear, la URL da 404 → corre con valores por defecto y te avisa en el propio correo con un banner amarillo (no truena, pero el destinatario y los umbrales serán los defaults, no los del archivo).

---

## 1. Crear la variable de entorno `FTS_COMERCIAL_HMAC`

**Dónde:** Railway → proyecto n8n → Variables.

**Valor:** una cadena aleatoria larga. Genérala tú, en tu laptop (no me la mandes, no la pegues en el chat, no la commitees):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variable | Valor | Ya existe |
|---|---|---|
| `FTS_COMERCIAL_HMAC` | *(la que acabas de generar)* | ❌ **Crear** |
| `FINANZAS_JWT_SECRET` | *(sin cambios)* | ✅ Ya existe — la reusan los 2 webhooks |

Railway reinicia n8n al guardar la variable. Espera a que levante.

> Guarda el valor en tu gestor de contraseñas: lo necesitas otra vez en el paso 5.

---

## 2. Rellenar `customResource` en cada nodo Odoo

El campo se blanquea al importar/crear (CLAUDE.md §3). **Sin esto los workflows fallan.**

Abre cada workflow en la UI, entra al nodo y escribe el valor exacto en *Custom Resource*:

### `comercial/watchdog-enviadas (T2 canary)` — id `hJNTUd8E57W4rfjU`
| Nodo | `customResource` |
|---|---|
| `Odoo - sale.order enviadas` | `sale.order` |

### `comercial/captura (T3)` — id `tEra7MVCvnWjAqjR`
| Nodo | `customResource` |
|---|---|
| `Odoo - res.users lookup` | `res.users` |
| `Odoo - CREATE crm.lead` | `crm.lead` |

### `comercial/pipeline (T3)` — id `60ZLskz1xJ7nU5kt`
| Nodo | `customResource` |
|---|---|
| `Odoo - res.users lookup` | `res.users` |
| `Odoo - crm.lead abiertos` | `crm.lead` |
| `Odoo - sale.order enviadas` | `sale.order` |

**De paso verifica en cada nodo Odoo:**
- Credencial = `Odoo FTS` (a veces se desasigna).
- **"Always Output Data" = ON.** En `Odoo - res.users lookup` es **crítico**: el no-match es el caso *normal* (ningún `res.users` tiene login `finanzas`), y en OFF un lookup vacío mata el workflow en silencio.

---

## 3. Publicar los 3 workflows

Toggle **Active** en la UI. Los 3 se crearon inactivos a propósito.

| Workflow | ID | Qué verificar al activar |
|---|---|---|
| `comercial/watchdog-enviadas (T2 canary)` | `hJNTUd8E57W4rfjU` | **Settings → Timezone = `UTC`** ⚠️ ver abajo · luego `active:true` + `triggerCount:1` |
| `comercial/captura (T3)` | `tEra7MVCvnWjAqjR` | webhook responde en `/webhook/comercial/captura` |
| `comercial/pipeline (T3)` | `60ZLskz1xJ7nU5kt` | webhook responde en `/webhook/comercial/pipeline` |

> ⚠️ **El timezone del watchdog no es opcional.** n8n **descarta `settings.timezone` al importar** (CLAUDE.md §18 lección #1). Si queda vacío hereda el TZ de la instancia — que es **America/New_York**, no Monterrey — y el cron de las 08:45 correría a las **06:45 CST**. El cron está escrito en UTC (`45 14 * * 1-5`) igual que `ops/watchdog-mo`, así que **Timezone debe decir `UTC`**.
>
> Nota: México eliminó el horario de verano en 2022, así que Monterrey es UTC−6 fijo y `14:45 UTC = 08:45 CST` todo el año. No hay que ajustarlo en invierno/verano.

---

## 4. Correr el watchdog una vez (manual)

En `comercial/watchdog-enviadas` → botón **Execute Workflow** (usa el Manual Trigger que trae para esto).

**Lo que DEBES recibir** (te llega a `estebandelacruz@fts.mx`, es el canary):

> Asunto: `[Cotizaciones enviadas] 2026-07-16 — 122 rojas / 0 amarillas`

**Esto es lo esperado, no un bug.** El baseline (§5) midió que **ninguna de las 122 cotizaciones enviadas se ha tocado en más de 6 días**: con la regla 4/6, el 100% sale rojo el día 1. El correo trae:

- Header: totales + valor en riesgo en MXN normalizado + ventana.
- Bucket **`SIN OWNER ⚠` primero** — ~12 cotizaciones sin responsable, incluida **SO11258 de Terra Energy por $2.3M**. Eso es fuga real, no un error del reporte.
- Bucket **`Sales FTS`** con el resto — es la cuenta genérica, no una persona (baseline RIESGO-3).
- Tope de 15 filas por bucket; el resto sale como *"+N más"* con su monto agregado.

**Si NO llega el correo**, revisa en este orden:
1. ¿El nodo `HTTP - Graph send` dio **202** con body vacío `{}`? Eso es éxito. Si trae ~700KB, el sendMail falló.
2. ¿Salió el banner amarillo *"No se pudo leer la config"*? → el PR no está mergeado (paso 0).
3. ¿`Code - MAIN` devolvió 0 items? → mira si `Odoo - sale.order enviadas` trajo filas; si vino vacío, revisa `customResource`.

**Para el rollout al equipo** (decisión tuya, no la tomé): edita `shared/comercial/watchdog_enviadas.json` en main → `"canary": false` + llena `recipients.equipo: ["..."]`. **No hay que re-importar ni re-activar** el workflow: la config se lee de main en vivo.

---

## 5. Aprovisionar tu dispositivo para la captura

El front es una página **pública** en GitHub Pages: no puede llevar el secreto HMAC en el código sin publicarlo. Por eso se aprovisiona por dispositivo.

Abre `https://yinyo1.github.io/fts-suite/comercial/` → consola del navegador (F12) → pega:

```js
localStorage.setItem('fts_comercial_hmac', 'EL_MISMO_VALOR_DE_FTS_COMERCIAL_HMAC')
```

Recarga. Si no lo haces, al entrar verás un aviso amarillo *"Este dispositivo no está aprovisionado"* y la captura fallará con `NO_HMAC`. **Mi Pipeline sí funciona sin esto** (solo necesita el JWT).

> Repite en cada teléfono/equipo que vaya a capturar. Ese es justamente el punto: el password de Finanzas solo no basta, hay que estar en un equipo aprovisionado.

---

## 6. Probar el flujo end-to-end

⚠️ **Este paso no lo pude hacer yo y es el único criterio de aceptación de T3 que queda sin verificar.** Ver `SUPUESTOS.md` §T3-E2E. Razones:
- Los workflows nacen inactivos y el API de n8n no deja activarlos vía MCP.
- El MCP de Odoo es **read-only** (UID 2), y el límite duro de la sesión dice que solo el workflow de captura puede escribir `crm.lead`.

Por eso **no existen leads `[TEST-CC]` que borrar** — la tabla de IDs a limpiar está vacía. No inventé registros que no creé.

**Prueba tú:**

1. Entra a `https://yinyo1.github.io/fts-suite/` → card **COMERCIAL** (badge "MVP").
2. Login con las credenciales de Finanzas (usuario `finanzas`).
3. Pestaña **Captura**. Para que sea borrable fácil, pon en Cliente: **`[TEST-CC] Prueba`**.
   - Descripción: cualquier texto · Rango: `<200K` · Origen: `otro`.
4. **Crear oportunidad** → debe responder `✅ Oportunidad creada · lead <id>`.
   - Va a decir *"Quedó asignada a Jesus Esteban De La Cruz por defecto: reasígnala en Odoo"*. **Es lo esperado**, no un bug: el JWT no lleva identidad de persona (ver `ROADMAP.md` §1).
5. En Odoo: CRM → busca `[TEST-CC] Prueba`. Verifica `partner_name`, `expected_revenue = 100,000` (punto medio de `<200K`), y que la `description` traiga el Origen, el Rango y la marca `[!] Asignado a Esteban por defecto`.
6. Pestaña **Mi Pipeline** → **Refrescar**. El lead debe aparecer en *Oportunidades abiertas*.
7. **Borra el lead de prueba en Odoo.** Anota aquí el id por si acaso: `_____`

**Errores que puedes ver y qué significan:**

| Código | Qué pasó |
|---|---|
| `NO_HMAC` | Falta el paso 5 en ese dispositivo |
| `BAD_SIGNATURE` | El `localStorage` no coincide con `FTS_COMERCIAL_HMAC` de Railway |
| `STALE_REQUEST` | Reloj del dispositivo desfasado >10 min |
| `SERVER_MISCONFIG` | Falta `FTS_COMERCIAL_HMAC` en Railway (paso 1) |
| `BAD_TOKEN` / `TOKEN_EXPIRED` | Sesión vencida (el token dura 8h) → vuelve a entrar |

---

## 7. Verificar el link en el launcher

`https://yinyo1.github.io/fts-suite/` → la card **COMERCIAL** debe estar activa con badge **"MVP"** y llevar a `comercial/index.html`.

Era un `<div class="disabled">` con badge "Próximamente"; ahora es un `<a>`. **Es el único cambio al front existente.**

> No la metí en `shared/modules-registry.js` a propósito: eso la gatearía por permisos por usuario y podría dejar gente fuera sin que lo pidieras. El módulo ya se gatea solo con su propio login.

---

## Resumen de lo que quedó pendiente de tu lado

| # | Paso | Bloquea |
|---|---|---|
| 0 | Mergear PR `feat/comercial-mvp` | La config del watchdog |
| 1 | Crear `FTS_COMERCIAL_HMAC` en Railway | Toda la captura |
| 2 | Rellenar 6 `customResource` | Los 3 workflows |
| 3 | Activar 3 workflows + **Timezone=UTC** en el watchdog | Todo |
| 4 | Correr el watchdog manual 1 vez | Validar T2 |
| 5 | Aprovisionar tu dispositivo (localStorage) | La captura desde ese equipo |
| 6 | Probar e2e + borrar el lead de prueba | Validar T3 |
| 7 | Verificar el link del launcher | — |
