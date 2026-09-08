# Secretos en el `localStorage` de la suite — hallazgo del 8-sep-2026

**Nada de esto lo puso el módulo comercial, y esta sesión NO cambió el comportamiento de
ningún módulo ajeno.** Se documenta con dueño y propuesta, como se pidió. Lo único que se
tocó fue lo de comercial (ver `ALMACEN.md`).

> **Cómo salió.** Al arreglar el defecto de la sesión —que confundía «tu credencial no
> vale» con «no hay red»— hubo que revisar qué llaves vive la suite en `localStorage`, para
> garantizar que caducar una sesión no borre captura real. Ahí aparecieron las demás.

---

## 1. 🔴 Lo más grave, y no es el `localStorage`: un secreto HMAC **en el repo público**

`pmo/index.html` línea 1000 declara `HARDCODED_SECRET` con un literal hexadecimal de 64
caracteres, y en la línea siguiente lo escribe a `localStorage` bajo `PMO_CHAT_SECRET`.

**`yinyo1/fts-suite` es un repo PÚBLICO que además sirve Pages.** El secreto no está
«guardado en el navegador»: está **publicado**. Cualquiera que abra la página —o el
archivo en GitHub— lo lee, y con él puede firmar peticiones al webhook `pmo-chat` como si
fuera la aplicación.

- **Dueño:** Esteban (rotación) + quien mantenga PMO.
- **Qué hacer, en este orden:**
  1. **Rotar el secreto en n8n.** Mientras no se rote, el que está publicado sirve.
  2. Mover la verificación al servidor, como ya se hizo en comercial y en finanzas: el
     navegador manda el **token de sesión** en el cuerpo y el workflow lo verifica contra
     `$env`. Es exactamente el patrón de `comercial/machotes-leer`.
  3. Quitar el literal del HTML y la escritura a `localStorage`.
- ⚠️ **Borrarlo del archivo no lo borra del historial.** Ya está commiteado, así que hay
  que tratarlo como filtración —rotar— y no como un typo (`CLAUDE.md` §20 #7).
- 📌 Ojo con una nota que quedó **incompleta**: `CLAUDE.md` §15 #3 dice que el secreto HMAC
  de PMO «se rotó y redactó el 2026-07-17». Eso fue cierto para
  `docs/n8n-workflows/pmo-chat-apply-code-code-validar-auth.js`. **La copia de
  `pmo/index.html` sigue viva** — se redactó una y se quedó la otra.

---

## 2. 🟠 `config-sync` barre `fts_*` completo y lo sube al repo público

`shared/config-sync.js`, función `collectOpsKeys()`: recolecta **todas** las llaves que
empiezan con `ops_`, `key_` o `fts_`, las cifra y las escribe en
**`shared/ops-config.json`, que está commiteado en el repo público**.

La lista de exclusiones tiene cuatro entradas: `ops_sync_password`, `ops_last_sync`,
`fts_session` y `fts_master_hash`. **No están excluidas**, entre otras:

| llave | qué es |
|---|---|
| `fts_suite_session` | el **JWT de la suite**, con el que se guarda en el servidor |
| `fts_fin_session` | la sesión de Finanzas |
| `fts_machote_v1` | **los machotes capturados**, con costos y comisiones |
| `fts_machote_sync_v1` | qué subió y qué no |
| `key_github_token` / `ops_github_token` | el PAT de GitHub, y además se mete a propósito como `_github_token` |

El cifrado es honesto —AES-256-GCM con PBKDF2-SHA256 de 100 000 iteraciones—, así que el
blob no se lee sin la contraseña. **El problema no es el cifrado: es el alcance.** Una
contraseña elegida por una persona protegiendo, en un archivo público y para siempre, un
PAT de GitHub y la captura comercial de tres personas, es una apuesta que no hace falta
hacer. Y el blob commiteado no se puede «desactualizar»: quien lo bajó hoy lo tiene.

- **Estado del archivo hoy:** `shared/ops-config.json`, `updated: 2026-04-18`. Es **anterior**
  al módulo de machotes, así que casi con seguridad **no** contiene captura comercial. El
  riesgo es hacia adelante: la próxima vez que alguien sincronice, sí la incluiría.
- **Dueño:** quien mantenga `shared/config-sync.js` (operaciones).
- **Propuesta:** invertir la regla. Hoy es una **lista negra** de cuatro llaves y sube todo
  lo demás; debería ser una **lista blanca** de las llaves de configuración que de verdad
  hacen falta. Una lista negra se queda corta cada vez que un módulo nuevo estrena una
  llave — que es literalmente lo que pasó con las tres del machote.

---

## 3. 🟡 El PAT de GitHub, en claro y por duplicado

`shared/admin/config-master.html` escribe el mismo PAT en `ops_github_token` **y** en
`key_github_token` (dual-write, líneas 1314-1315), y `shared/config-sync.js` lo repone al
cargar. En claro, en el navegador de quien haya abierto el panel de administración.

- **Si ese token sigue vivo, conviene revocarlo**: no se puede saber desde aquí quién abrió
  ese panel ni en qué máquina quedó. **No lo revoqué ni lo borré de ningún navegador** —no
  es mío y no era el encargo de esta noche.
- **Dueño:** Esteban.
- **Propuesta:** que el navegador no vea el PAT. Escribir al repo es lo que ya hace n8n con
  la credencial `GitHub FTS Suite` (`CLAUDE.md` §3); el panel puede pedirle al workflow que
  escriba, en vez de escribir él.

---

## 4. Las tres llaves de sesión que conviven

Herencia de tres logins que nacieron por separado:

| llave | quién la emite | para qué |
|---|---|---|
| `fts_session` | `shared/auth-suite.js` (`FTSAuth`) | el login viejo de la suite; hashes SHA-256 **sin sal** en un JSON del repo |
| `fts_fin_session` | `auth/finanzas-login` | Finanzas. JWT HS256 verificado en el servidor |
| `fts_suite_session` | `auth/suite-login` | RH y comercial. JWT HS256, el bueno |

**Propuesta, no aplicada:** que `auth/suite-login` sea el único emisor y las otras dos
llaves desaparezcan. El orden importa y no es trivial:

1. **Primero** dar de alta en `suite_usuarios` a todos los que hoy sólo existen en
   `users-suite.json`, sin quitarle nada a nadie.
2. **Después** migrar cada módulo a `SuiteAuth`, uno por uno, dejando el gate viejo como
   red hasta que el nuevo esté probado en producción.
3. **Al final** borrar `fts_session` y `users-suite.json`.

Hacerlo al revés —endurecer primero— es exactamente lo que prohíbe la regla anti-trabón de
`CLAUDE.md` §8: el lado estricto desplegado primero deja gente afuera.

Coste estimado: media sesión, más lo que tarde revisar módulo por módulo. **No es urgente
salvo por un detalle**: hoy `FTSAuth` guarda hashes sin sal en un archivo del repo público,
así que mientras siga vivo, cualquiera puede intentar romperlos sin límite y sin que nadie
se entere.

---

## Lo que esta sesión SÍ tocó

Sólo lo de comercial, y para lo contrario: **garantizar que caducar una sesión no borre
captura**. `comercial/machote/js/sesion.js` declara las dos llaves intocables
(`fts_machote_v1`, `fts_machote_sync_v1`), comprueba en tiempo de ejecución que la llave de
sesión no coincide con ninguna, y hay una prueba dedicada que siembra las dos y exige que
sigan idénticas después de caducar.
