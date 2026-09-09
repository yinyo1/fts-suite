# El sincronizador de configuración pasa a lista blanca

**9-sep-2026 · issue #140 · V1.22**

`shared/config-sync.js` no es un archivo del módulo comercial. Se toca desde aquí porque
la fuga que tenía se llevaba, entre otras cosas, **la captura comercial de tres personas**.

## Lo que pasaba

`collectOpsKeys()` recorría **todo** `localStorage` y se llevaba cada llave que empezara
por `ops_`, `key_` o `fts_`, excluyendo cuatro. Lo recolectado se cifra y se escribe en
**`shared/ops-config.json`, que está commiteado en un repositorio PÚBLICO**.

La lista negra tenía cuatro entradas: `ops_sync_password`, `ops_last_sync`, `fts_session`
y `fts_master_hash`. **No** estaban excluidas, entre otras:

| llave | qué es |
|---|---|
| `fts_machote_v1` | las cotizaciones del equipo, **con costos y comisiones** |
| `fts_machote_sync_v1` | qué se subió y en qué versión |
| `fts_suite_session` | el JWT de la sesión |
| `fts_fin_session` · `fts_mi_perfil_session` · `fts_iperc_session` | otras sesiones |
| `fts_comercial_hmac` | un HMAC |
| `fts_employees` | datos de empleados (§20 #7: datos personales no van a repo público) |

## Lo que NO pasó

**No hay fuga consumada.** El blob de hoy dice `updated: 2026-04-18T17:19:38.375Z` y el
archivo tiene **un solo commit** (`4254782`, 17-ago-2026). Las llaves del machote no
existían entonces: `fts_machote_v1` aparece por primera vez el **3-sep-2026**
(`a3b39e7`, V1.07). `fts_fin_session` y `fts_suite_session` son igualmente posteriores al
18-abr. Y `fts_session` —la vieja de FTSAuth, que sí es anterior— **estaba excluida**.

O sea: el archivo publicado no contiene ninguna de ellas. El riesgo era **hacia adelante**,
en la próxima sincronización que alguien hiciera.

## El cambio

De lista negra a **lista blanca**: `PERMITIDAS` enumera lo que se sincroniza, y
`collectOpsKeys()` pide exactamente eso en vez de recorrer `localStorage`.

Lo que importa no es la precisión, es el **modo de fallo** (CLAUDE.md §9): olvidar una
llave de configuración cuesta volver a teclearla en el otro dispositivo; olvidar una de
datos costaba publicarla. Se rompe hacia el lado soportable.

## Qué se sigue sincronizando

- **Backend**: `ops_n8n_url`, `ops_odoo_url`, `ops_odoo_db`, `ops_demo_mode`, `ops_migrated`
- **Kiosko**: geocercas (`ops_kiosk_geolocations`, `ops_geo_sync_timestamp`), `ops_kiosk_stages`,
  `ops_kiosk_company_id`, los cuatro de reconocimiento facial, `ops_kiosk_field_photo`,
  los cuatro de notificación
- **Tablero y planeación**: `ops_dash_*` (4), `ops_plan_*` (5)
- **Llaves de API que este panel administra a propósito**: `key_claude`, `key_groq`,
  `key_openrouter`, `key_gemini`, `key_github_token`, `key_odoo_api`, `ops_github_token`

Los cuatro `key_*` y el token de GitHub siguen dentro **porque administrarlos es lo que hace
este panel**: sacarlos rompería su función. Es una decisión distinta de la fuga, y sigue
abierta — el PAT en claro está reportado desde la sesión 4 y Esteban decidió revocarlo
después.

## Qué DEJA de sincronizarse, y a quién le puede doler

Todo lo demás. En concreto, lo que existe hoy en el repo y ya no viaja:

| llave | consecuencia de que ya no viaje |
|---|---|
| `fts_machote_v1` / `fts_machote_sync_v1` | **ninguna**: el machote se sincroniza solo, contra Postgres. Esto era pura fuga. |
| `fts_suite_session`, `fts_fin_session`, `fts_mi_perfil_session`, `fts_iperc_session` | ninguna: una sesión no debe viajar entre dispositivos, se vuelve a entrar. |
| `fts_employees`, `fts_iperc_learned`, `fts_iperc_client` | datos de trabajo; si algún módulo dependía de que viajaran, hay que darles su propio almacén server-side, no el archivo público. |
| `fts_system_prompt`, `fts_openrouter_key`, `fts_groq_key`, `fts_gemini_key`, `fts_api_key`, `fts_gh_token` | **sí puede doler**: son ajustes/llaves de las pantallas de IA. Ahora se teclean por dispositivo. Sus gemelos `key_*` sí siguen sincronizando, así que en la mayoría de los casos hay un camino que ya funciona. |
| `ops_kiosk_master_pin`, `ops_kiosk_field_pin`, `ops_master_pin`, `ops_api_key` | PINes de personas. Se configuran por dispositivo a propósito. |
| `ops_last_sync`, `ops_sync_password` | ya estaban fuera. |

**El cambio no borra nada.** `load()` sólo hace `setItem`: una llave que deje de
sincronizarse se queda como esté en cada navegador, no se pierde ni se pisa.

## Cómo se sabe qué se está quedando fuera

`ConfigSync.sinSincronizar()` devuelve la lista, y `save()` la escribe en la consola al
guardar. Una lista blanca que silenciosamente deja de llevar algo es tan mala como la
lista negra que se llevaba de más: en los dos casos nadie se entera.

**Para agregar una llave**: métela en `PERMITIDAS`, en su grupo, y sólo si es
**configuración** del panel de operaciones. Nunca datos de trabajo, ni sesiones, ni PINes,
ni nada que identifique a una persona.

## Prueba

`comercial/machote/tests/pruebas-navegador.js` →
*«el sincronizador de configuración NO se lleva lo del machote»*: siembra las once llaves
sensibles más dos de configuración, carga el `config-sync.js` **real**, llama a
`collectOpsKeys()` y exige que no se cuele ninguna de las once **y** que las dos de
configuración sí estén — porque una lista blanca vacía también pasaría la primera mitad.
