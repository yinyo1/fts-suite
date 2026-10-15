# R0 · Secretos expuestos: inventario y plan de retiro sin caídas

**Estado:** inventario y plan. **Nada se ejecutó**: ninguna rotación, revocación ni cambio de archivo servido.
**Medido:** 2026-10-15 (UTC) sobre `main` en `c91fd70` (= `1172012` + dos migraciones SQL de Marketing que no tocan auth), con el historial completo de `main`.
**Regla de este documento:** no aparece ningún valor: ni contraseñas, ni hashes, ni llaves, ni el host o puerto de un proxy. Si un dato concreto le sirve más a un atacante que a FTS, aquí sólo se dice que existe y el detalle va a Esteban por canal privado.
Relacionados: #419 (plan SuiteAuth), #390 (webhooks y secretos fuera del navegador), #124 (protección de `main`).

## 0 · Resumen

1. **`shared/ops-config.json` debe tratarse como descifrable por terceros.** La contraseña que lo protege es, con muy alta probabilidad, una que ya está publicada en el repo (§2). Adentro va el token de GitHub con el que el navegador escribe al repo que sirve la Suite.
2. **Hay una llave de API de Gemini escrita en el código de IPERC**, ofuscada en bytes (S-05).
3. **Las llaves de IA y la de Odoo que trae `ops-config.json` no las usa ninguna página** (§3). Config Master las administra y Diagnóstico las muestra; nadie más las lee. Retirarlas no le quita nada a nadie, pero hay que revocarlas en cada proveedor: quitarlas del archivo no basta.
4. **El login clásico sólo decide qué se pinta.** Compara un SHA-256 sin sal, en el navegador, contra un archivo público, y la sesión `fts_session` se puede escribir a mano. Lo único que esa contraseña protege de verdad es el blob cifrado. Por eso los secretos tienen que salir del navegador (#390).
5. **Orden:** primero lo que abre el repo (GitHub) y Odoo; luego bases de datos y proxies (R1); al final IA y limpieza. Cada revocación va en su propia sesión con clic de Esteban, y **la credencial nueva se crea y se prueba antes de revocar la vieja**.

## 1 · Qué se hizo y qué no

- Se buscó en el código (sin `docs/`) cada nombre de llave y cada host de proveedor. Sólo se imprimieron archivos y conteos.
- **Para saber si la contraseña de cifrado ya es pública no se descifró nada.** Se usó una comprobación no reversible cuyo detalle se le entrega a Esteban en privado. El resultado se resume en §2.
- **No se descifró `ops-config.json` ni ninguna de sus 15 versiones del historial.** Por eso el contenido exacto del blob es **no determinable** desde aquí. Lo que contiene se deduce de la lista blanca `ConfigSync.PERMITIDAS` (`shared/config-sync.js:136-153`) y de `save()`, que siempre agrega `_github_token`.
- ⚠️ **Incidente de esta sesión, reportado tal cual:** al revisar `seguridad/iperc/iperc-config.js`, un filtro de redacción mío no cubrió un arreglo partido en varias líneas, y los bytes ofuscados de la llave de Gemini (S-05) quedaron en el transcript privado de la sesión. La llave ya era pública en el repo, así que no cambia su estado, pero se suma a las razones para revocarla. No se copió a ningún issue, commit ni documento.

## 2 · ¿`ops-config.json` se puede descifrar con una contraseña pública?

**Respuesta: sí, con muy alta probabilidad. No está confirmado por descifrado, porque descifrar está prohibido en esta sesión.**

Así funciona hoy:
- `ConfigSync.load(password)` deriva la llave con PBKDF2-SHA256 de 100k iteraciones sobre la contraseña y descifra con AES-256-GCM (`shared/config-sync.js:15-27, 52-59`).
- El lanzador le pasa a `ConfigSync.load` **la contraseña tecleada en el login clásico** (`index.html:231-235`). Si el descifrado funciona, deja el token en `ops_github_token` y pinta «✅ Config restaurada — token presente».
- El blob se guarda con la contraseña que la persona teclea en la sección de sincronización de Config Master o de `operaciones/config` (`config-master.html:1322-1339`, `operaciones/config/index.html:1178`). Por diseño, es la misma del login master: si no lo fuera, el master nunca recuperaría el token al entrar.
- **La contraseña actual de la cuenta clásica master coincide con un valor ya publicado en el repo.** Esto se comprobó sin descifrar y sin imprimir ningún valor; el detalle está con Esteban, no aquí.
- Hay una salvedad: el blob se pudo haber guardado con otra contraseña. La única forma de confirmarlo es descifrar, y eso no se hizo. Para decidir da igual: se trata como comprometido.

Lo que también pesa:
- **El historial guarda 15 versiones del blob** (13 al 18-abr-2026, la última es `d667b3c`). Cada una pudo cifrarse con otra contraseña y cada una trae el token que había ese día. Cambiar la contraseña hoy no protege ninguna de esas versiones; sólo **revocar lo que contienen** las neutraliza.
- **`ops_sync_password` se guarda en claro en `localStorage`** (`config-sync.js:212, 266`) y nunca se borra al cerrar sesión. `diagnostico.html:112-113`, una página sin login, muestra sus últimos 4 caracteres. Cualquier XSS en el origen `yinyo1.github.io`, o cualquiera con el navegador de quien entró como master, se lleva la contraseña.
- **El token también se queda en `localStorage`** de todo dispositivo donde alguien entró como master. `doLogout` no borra `ops_github_token`.

**Hallazgo relacionado, no crítico:** la contraseña clásica de otra cuenta, no master, coincide con un valor por omisión que está escrito en el código. El detalle también va en privado. Se arregla en la misma sesión de cambio de contraseñas.

## 3 · Uso real de cada llave en el navegador

| Llave | Quién la lee de verdad | ¿Página enlazada y viva? | Veredicto |
|---|---|---|---|
| `key_claude` | Config Master (la administra; además la copia a `fts_api_key`), Diagnóstico | — | **Sin consumidor propio.** El consumidor real es `fts_api_key` (abajo). |
| `key_groq`, `key_openrouter`, `key_gemini` | sólo Config Master y Diagnóstico | — | **Muertas.** IPERC usa otros nombres (`fts_groq_key`, `fts_openrouter_key`, `fts_gemini_key`). |
| `key_odoo_api` (+ `ops_api_key`) | Config Master; `operaciones/kiosk/js/kiosk.js:39` y `operaciones/dashboard/js/dashboard.js:16` la cargan en `config.apiKey` | sí | **Muerta.** `config.apiKey` no se usa en ningún otro lado: se carga y no se lee. |
| `key_github_token` | Config Master, Diagnóstico | — | Espejo de `ops_github_token`. |
| `ops_github_token` | `config-master.html` (PUT de `users-suite.json` y de `ops-config.json`), `operaciones/config` (sincroniza), `operaciones/incidencias/js/incidencias.js:145,181` (escribe `shared/incidencias.json`), `auth-suite.js:25` (lectura opcional con respaldo raw) | sí | **Viva.** Es la llave más peligrosa del inventario: escribe al repo que sirve la Suite. |
| `fts_gemini_key` / `fts_groq_key` / `fts_openrouter_key` | IPERC (`seguridad/iperc/iperc-ai.js`, `iperc-steps.js`, `iperc-config.js`) | sí, Seguridad → IPERC | **Viva pero local.** Se teclea en la pantalla de IPERC y no viaja en `ops-config.json`. Gemini cae a la llave escrita en el código (S-05). |
| `fts_gh_token` | IPERC `saveRefinement` (`iperc-config.js:157`) escribe refinamientos al repo | sí | Viva y local. Si nadie la tecleó, la función no hace nada. |
| `fts_api_key` | `ingenieria/analisis-estructural/js/{api,app}.js`, `FTS-Memoria-Calculo-v2.html` | sí, Ingeniería → Análisis estructural | **Viva y local.** Se llama a la API de Anthropic directo desde el navegador (`anthropic-dangerous-direct-browser-access`). |

Confirmación del contexto de Esteban: en n8n **no hay credenciales de Groq, Gemini ni OpenRouter**. La lista completa de 14 credenciales está en R1 §3. La única de IA es `Anthropic Claude FTS`.

`shared/incidencias.json`, lo único que escribe Incidencias con el token, **no tiene lectores** (CLAUDE.md §11 #12, tabla de archivos). Además el código ya trae una ruta B por n8n cuando no hay token (`incidencias.js:181-183`). Revocar el token no le quita a nadie algo que se lea.

## 4 · Inventario completo, ordenado por riesgo

«Vivo» = el secreto, o el sistema que abre, sigue en uso **según el código**. Si una llave sigue válida en su proveedor **no se puede saber sin probarla**, y probarla es usarla. Por eso todo lo publicado se trata como vivo hasta revocarlo.

| # | Secreto | Dónde quedó expuesto | Qué abre | Permisos | Quién lo consume | Estado | Plan |
|---|---|---|---|---|---|---|---|
| **S-01** | Token de GitHub (`_github_token` / `ops_github_token`) | blob `ops-config.json` (15 versiones) + `localStorage` de cada dispositivo donde entró el master | escritura a `yinyo1/fts-suite` | **no determinable sin descifrar**; Esteban lo ve en GitHub → Settings → Developer settings (nombre, scopes, último uso, vencimiento) | Config Master, `operaciones/config`, Incidencias (archivo huérfano) | vivo en código; validez a confirmar | **R0-1** |
| **S-02** | API key de Odoo del navegador (`key_odoo_api`) | blob `ops-config.json` | Odoo con los permisos del usuario dueño de la llave (probablemente admin) | según su usuario | **nadie** (se carga y no se usa) | muerta en código; viva en Odoo hasta revocar | **R0-2** |
| **S-03** | Contraseña clásica master | valor publicado en el repo (detalle en privado) | (a) la llave del blob S-01/S-02/S-07; (b) la cuenta master clásica, que de por sí se puede falsificar en el navegador | — | lanzador, Config Master | **vivo** | **R0-3**, después de R0-1 y R0-2 |
| **S-04** | Contraseña maestra del DC3 (`MASTER_PASS`) | `seguridad/index.html:671`, `seguridad/iperc/iperc-config.js:20`, `shared/auth.js:11` (huérfano) | acceso master a DC3 e IPERC (pantalla) | sólo pantalla | Seguridad | vivo | C4 del plan; ligada a S-03 (§2) |
| **S-05** | Llave de API de Gemini escrita en código | `seguridad/iperc/iperc-config.js` (arreglo de bytes) | cuota de Google AI Studio/Gemini a cargo de quien la creó | API de Gemini | IPERC como respaldo | viva en código | **R0-5**: revocar en Google y quitar del código |
| **S-06** | Llave HMAC del PMO | `pmo/index.html:999, 1687` | firma de peticiones a `pmo/chat-apply` | escribir `pmo/index.html` vía n8n | PMO | **vivo**: en Railway existe `PMO_CHAT_HMAC_SECRET` (R1 §3) | **R0-6**: rotar en n8n y quitar del HTML, con el patrón de doble llave (§5) |
| **S-07** | Llaves de IA del blob (`key_claude`, `key_groq`, `key_openrouter`, `key_gemini`) | blob `ops-config.json` | cuotas de IA | API | **nadie** en el código (§3) | muertas en código | **R0-5**: revocar en cada proveedor |
| **S-08** | `seguridad/data/users.json` (7 contraseñas en claro) | archivo actual + historial | pantalla DC3 | — | nadie: las 7 vencieron entre mar y abr 2026 | muerto | C4. Igual hay que avisar a las personas por si reusan esas contraseñas en otro lado. |
| **S-09** | `shared/users-suite.json` (SHA-256 sin sal) | archivo actual + 21 versiones | login clásico (pintura) y, por S-03, el blob | — | lanzador | vivo | C5/C6. Hasta entonces, cualquier cambio de contraseña clásica se publica como hash sin sal **para siempre**. |
| **S-10** | `ops_sync_password` en claro | `localStorage` + 4 caracteres en `diagnostico.html` | la llave del blob | — | auth-suite (autocarga) | vivo | desaparece cuando muera `ops-config.json` (§6) |
| **S-11** | PIN por omisión de `operaciones/config` | código | pantalla de config del kiosko | — | kiosko | vivo | fuera de alcance (kiosko); su valor coincide con una contraseña clásica (§2) |

**Secretos que viven bien (sólo servidor) y entran en la rotación de R1:** `SUITE_JWT_SECRET`, `FINANZAS_*`, `GITHUB_TOKEN`, `ODOO_API_KEY`, `ODOO_PASSWORD`, `ODOO_RPC_KEY`, `JEEVES_API_KEY`, `*_MOTOR_KEY`, `FTS_CORREO_KEY`, `N8N_ENCRYPTION_KEY` (nombres leídos de la configuración de Railway; los valores no se leyeron).

## 5 · Plan de retiro y rotación (cada fila es una sesión con clic de Esteban)

Patrón para no tirar a nadie: **crear la nueva → probar que la nueva funciona en cada consumidor → revocar la vieja → probar otra vez → anotar en el issue.** Una revocación **no tiene reversa**: si algo falla después, la reversa es emitir otra credencial nueva y ponerla en el consumidor que faltó, no recuperar la vieja.

| Sesión | Qué | Prueba previa | Prueba posterior | Reversa | Clic |
|---|---|---|---|---|---|
| **R0-1 · GitHub del navegador** | 1) Esteban lista en GitHub sus tokens (nombre, scopes, último uso, vencimiento) y pega en el issue **sólo nombre y fechas**. 2) Si Config Master todavía tiene que escribir `users-suite.json` (lo necesita hasta C5), crear un **token fine-grained** con sólo `yinyo1/fts-suite` · Contents: write · 90 días. Teclearlo **sólo** en el navegador de Esteban, **sin** «Guardar en GitHub», porque eso lo publicaría cifrado otra vez. 3) Revocar el token viejo y cualquier token clásico con scope `repo` que no tenga dueño claro. | P-01 (master restaura token) se vuelve «token ausente» a propósito: se actualiza la línea base. Config Master guarda un cambio inocuo con el token nuevo. | `grep` del sitio servido y `deployments` igual que antes; la Capa 2 en verde salvo P-01 ajustada | emitir otro fine-grained | Esteban en GitHub |
| **R0-2 · Odoo** | Ver «Odoo: distinguir llaves» abajo. Revocar la llave del navegador. **No la usa nadie** (§3), así que no tumba nada. | listar API keys de cada usuario en Odoo (nombre y fecha) | flujos de n8n que usan Odoo siguen en verde (ejecuciones sin error en 24 h) | nueva llave al consumidor que falte | Esteban en Odoo |
| **R0-3 · Contraseñas clásicas** | Cambiar la contraseña master y la cuenta del §2. Se hace en Config Master, que **republica `users-suite.json` con hash sin sal**: usar una contraseña larga y única que no se use en ningún otro sistema. **Nunca** volver a guardar `ops-config.json`. | matriz + Capa 2 | Capa 2 P-01/P-02 con las nuevas (en el fixture de prueba, no las reales) | volver al hash anterior: está en el historial del repo | Esteban |
| **R0-4 · Seguridad del repo** | Activar **secret scanning** y **push protection** (gratis en repos públicos) y una **regla de protección / ruleset de `main`** (#124). Ver nota abajo sobre los commits de n8n. | inventario de quién empuja a `main` (n8n con `GitHub FTS Suite`, crons, Config Master) | un push de prueba de n8n pasa | desactivar la regla | Esteban en Settings |
| **R0-5 · IA** | Revocar en Google (S-05 y `key_gemini`), Groq, OpenRouter y Anthropic (`key_claude`/`fts_api_key` si es la misma). Si Ingeniería o IPERC todavía se usan, crear llaves nuevas **sólo** para quien las use, tecleadas en su navegador, con tope de gasto en el proveedor. Después, sesión de código: quitar el arreglo de bytes de IPERC y los `key_*` de `PERMITIDAS`. | preguntar quién usa IPERC IA y Análisis estructural; si nadie, sólo revocar | la pantalla muestra «sin llave» en vez de fallar | llave nueva | Esteban en cada proveedor |
| **R0-6 · HMAC del PMO** | Igual que en #390: el workflow acepta **dos** secretos durante la ventana (`PMO_CHAT_HMAC_SECRET` y `_NEXT`), el HTML deja de traer el secreto (lo firma el servidor tras validar el JWT) y al final se retira el viejo. | leer `pmo/chat-apply` vivo (hoy no está expuesto al MCP) | el chat del PMO aplica un cambio de prueba | restaurar versión del workflow | Esteban (publicar workflow) |

**Odoo: distinguir llaves sin ver valores.**
- En Odoo 19, cada usuario ve sus llaves en **Preferencias → Seguridad de la cuenta → API Keys**, con descripción, alcance y fecha. Esteban toma captura de esa lista **en cada usuario que pueda tener llaves**: el suyo (uid 2, que usa `Odoo FTS` según CLAUDE.md §15), el usuario de servicio de Marketing y cualquier otro.
- Se cruza con los consumidores conocidos:
  - n8n `Odoo FTS`, `Odoo API Bearer`, `Odoo Login` (Basic: **contraseña**, no llave) y `Odoo Marketing (servicio)`.
  - Las variables `ODOO_API_KEY`, `ODOO_RPC_KEY` y `ODOO_PASSWORD` del Primary.
  - `fts-mcp-odoo`, que corre como administrador (R1 §4).
  - La llave del navegador.
- **Un consumidor por llave.** Si la lista tiene menos llaves que consumidores, hay llaves compartidas: son las que hay que separar primero.
- **Mínimo privilegio, una llave de usuario técnico por consumidor:**
  1. `svc-n8n-lectura`: sólo lectura, para los workflows que sólo leen.
  2. `svc-n8n-escritura`: sólo los modelos que hoy se escriben (`hr.attendance`, `account.analytic.line`, `sale.order`, `project.project`, `budget.*`, `mail.message`, etc.).
  3. `svc-mcp-lectura`: grupos de lectura, para el MCP.
  4. Marketing, que ya tiene servicio propio.
- ⚠️ En Odoo SaaS cada usuario interno es una licencia. Verificar el costo con Odoo antes de crear usuarios.
- Orden sin caídas: crear el usuario y su llave → cambiar **una** credencial de n8n → correr una ejecución real → read-back → seguir con la siguiente. Las llaves viejas se revocan sólo cuando ningún consumidor conocido las use. Revocar sigue siendo la prueba definitiva: si algo truena, era un consumidor desconocido, y se le da su propia llave nueva.

**Nota sobre push protection y la protección de `main`:** varios workflows de n8n hacen commit directo a `main` (por ejemplo `rh/empleados-master/sync`, que corre a las 6 am). Una regla que exija PR **rompería esos crons**. Por eso R0-4 empieza con una regla que sólo **bloquee force-push y borrado de `main`**. Exigir PR, con excepción para el token de n8n, es otra fase.

## 6 · Que `ops-config.json` deje de existir

Propuesta, como fases de #390:
1. Quitar del navegador todo lo que no sea configuración pública (`ops_n8n_url`, geocercas, umbrales). Eso ya vive en `shared/public-config.json`, que es público por diseño.
2. Lo que hoy necesita el token de GitHub lo hace n8n, con su credencial de servidor y detrás del JWT de SuiteAuth: `config-master` guardando `users-suite.json` hasta C5, e Incidencias, cuyo archivo además ya no tiene lectores.
3. Las llaves de IA que sigan en uso pasan a un proxy en n8n con JWT, como ya funciona `Anthropic Claude FTS`.
4. Cuando ningún consumidor lea `ops-config.json`, se borra el archivo **y** se revoca todo lo que alguna vez contuvo. Borrar no des-publica las 15 versiones del historial.
5. `ConfigSync` queda sólo con la lista pública, o desaparece. Hoy el login clásico depende de él para el token (#419 hallazgo 5): el paso 2 tiene que ir antes.

Mientras tanto, **nadie vuelve a pulsar «Guardar en GitHub»**: cada guardado publica una versión más del blob.
