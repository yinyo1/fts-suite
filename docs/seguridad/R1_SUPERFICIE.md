# R1 · Superficie expuesta: Railway, n8n y fts-mcp-odoo

**Estado:** medición y plan. Todo se hizo en **solo lectura**: no se cambió ningún dominio, proxy, variable, servicio ni workflow.
**Medido:** 2026-10-15 ~06:30 UTC (= 00:30 CST del 15-oct) con el MCP de Railway (`whoami`, `list-projects`, `list-services`, `list-domains`, `list-tcp-proxies`, `get-service-config`, `get-service-metrics` de 7 días, `get-logs`) y el MCP de n8n (`list_credentials`, `search_projects`). **No se llamó `list-variables`**, que devuelve valores: de las variables sólo se conocen los nombres, que entrega `get-service-config`.
Los host:puerto de los proxies TCP **no se escriben aquí** a propósito: se ven en Railway → servicio → Settings → Networking.

## 1 · Cuenta y espacio de trabajo

- Cuenta Railway `yinyo1` (Esteban). Un solo workspace, **personal**, con 3 proyectos. No hay miembros que administrar: el riesgo de acceso es la cuenta de Esteban misma.
- **MFA de la cuenta: no se puede leer por API. Esteban lo confirma** en Account → Security. Railway acepta TOTP o **passkey** y da códigos de recuperación ([docs](https://docs.railway.com/access/multi-factor-authentication)). Recomendación: passkey + TOTP de respaldo, y los códigos de recuperación guardados fuera del celular.
- ⚠️ Los **tokens de API** de Railway (cuenta, workspace, proyecto) siguen valiendo aunque haya 2FA ([docs](https://docs.railway.com/access/two-factor-enforcement)). El MCP de Railway que usa Claude Code entra con uno de esos tokens. Esteban lista sus tokens en Account → Tokens, borra los que no reconozca y deja uno por herramienta.
- **Respaldos:** Esteban programó respaldos de volumen en `fts-suite-db` y en el Postgres de n8n el 14-oct. Lo que dice la documentación oficial ([backups](https://docs.railway.com/volumes/backups)):
  - Diario retiene 6 días; semanal, 27; mensual, 89.
  - **Se restaura sólo en el mismo proyecto y entorno.**
  - **«Wiping a volume deletes all backups»**: los respaldos viven con el volumen, no fuera de él.
  - **Falta lo más importante: una restauración probada.** Propuesta, sesión R1-6: restaurar en un servicio desechable del mismo proyecto, contar filas de 3 tablas contra producción y borrar el desechable. Y un respaldo **fuera de Railway** (`pg_dump` cifrado a otro proveedor), porque si se pierde la cuenta se pierden también los respaldos.

## 2 · Mapa de superficie

| Proyecto · servicio | Expuesto | Qué lo usa (medido) | Protección | Si se cierra | Riesgo |
|---|---|---|---|---|---|
| cheerful-comfort · **Primary** (n8n 2.43.5) | dominio `*.up.railway.app`: editor + webhooks + `/mcp-server` | toda la Suite (webhooks), el editor (Esteban) y el MCP de n8n (Claude Code) | login del editor; webhooks según cada workflow (#390) | se cae la Suite | **ALTO** (§3) |
| cheerful-comfort · **Postgres** (n8n) | **proxy TCP público → 5432, ACTIVO** | n8n entra por la **red privada**, no por el proxy: tráfico público medido ≈ 0 en 7 días (máximo de una muestra ≈ 0.5 KB, compatible con un escaneo o un intento de conexión) | contraseña de Postgres; TLS **no verificado** | **nadie pierde nada** según la medición | **ALTO**: la base del editor (usuarios, credenciales cifradas, datos de ejecución) abierta a internet |
| cheerful-comfort · **Redis** | **proxy TCP público → 6379, ACTIVO** | **nadie**: memoria, CPU y red en **0** en las 10,081 muestras de 7 días. El servicio no corre. El Worker nunca se desplegó (CLAUDE.md §14) | contraseña de Redis | **nada** | MEDIO hoy (no hay nada atrás); ALTO el día que se encienda el Worker con ese proxy abierto |
| cheerful-comfort · fts-suite-db, fts-bancos, retardos-hojas, memoria-* | sin dominio ni proxy (verificado en `fts-suite-db`; los demás según la medición de Esteban del 14-oct) | n8n por red privada | red privada | — | bajo |
| content-determination · **fts-mcp-odoo** | dominio `fts-mcp-odoo-production.up.railway.app` → 8080 | conector MCP de Claude (salida de Anthropic) | ruta secreta en la URL + lista de IPs + rate limit (§4) | se pierde el MCP de Odoo | **ALTO** (§4) |
| tesoreria-escolar · **Postgres** (`postgres-ssl:18`) | **proxy TCP público → 5432, ACTIVO** | **n8n** (credenciales `tesoreria-escolar-db · config_ro`, `· app_rw` y `· TEMPORAL dueño`). Tráfico público bajo pero distinto de cero en 7 días. Entre proyectos **no hay red privada** ([docs](https://docs.railway.com/networking/private-networking/how-it-works)), así que n8n **sólo puede** entrar por el proxy | contraseña; la imagen trae SSL, pero no se verificó si exige `sslmode=require` | **se rompe lo que n8n haga con tesorería** | MEDIO-ALTO |

> **Cómo se leyó «quién lo usa»:** las métricas `NETWORK_RX/TX` de Railway en una base con proxy. Que ese contador mida sólo el tráfico que entra por el borde público y no el privado es **una inferencia** coherente con los números: el Postgres de n8n trabaja todo el día y marca ≈ 0. **No está confirmado en la documentación.** Antes de cerrar un proxy, la prueba definitiva es la de §5: cerrar en horario muerto con la reversa a mano.

## 3 · n8n

- **Versión 2.43.5** (log de arranque del 2026-10-15 03:32 UTC: «Recorded version change: 2.43.4 -> 2.43.5»). El aviso crítico más reciente que se encontró (CVE-2026-85165, corregido en 2.36.2) queda cubierto. Fuentes: NVD y GitHub Security Advisories de `n8n-io/n8n`. La API de GitHub Advisories estaba bloqueada en el contenedor, así que la lista sale de NVD; cada CVE enlaza su GHSA.
- ⚠️ **La imagen es `n8nio/n8n` sin etiqueta**: cada redeploy baja la versión más nueva que haya. Así se pasó de 2.43.4 a 2.43.5 sin que nadie lo decidiera. Es bueno para los parches y malo para la estabilidad, y además una versión mala llega sola. Propuesta (R1-5): fijar la etiqueta exacta (`n8nio/n8n:2.43.5`) y subirla a propósito, revisando los avisos cada mes.
- **`N8N_ENCRYPTION_KEY` está definida** como variable (el nombre aparece en la configuración; el valor no se leyó). Que exista una **copia fuera de Railway** no se puede verificar desde aquí. Sigue pendiente de CLAUDE.md §17: Esteban la guarda en su gestor de contraseñas. Sin ella, las 14 credenciales quedan ilegibles.
- **Cuentas del editor:** el MCP sólo ve el proyecto personal de Esteban (`teamProjectsEnabled: false`). **No se puede listar usuarios ni su 2FA por MCP.** Esteban revisa Settings → Users. Forzar 2FA para todos es función **Business/Enterprise** en self-hosted ([docs](https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/manage-security-policies)). En la edición comunitaria cada usuario la activa por su cuenta ([docs](https://docs.n8n.io/user-management/two-factor-auth/)). Recomendación: si sólo existe la cuenta de Esteban, activar su 2FA y no crear más.
- **Credenciales (14, sólo nombre y tipo):**
  - Odoo: `Odoo FTS` (odooApi), `Odoo Marketing (servicio)` (odooApi), `Odoo API Bearer` (header), `Odoo Login` (basic).
  - Otros servicios: `GitHub FTS Suite` (header), `Anthropic Claude FTS`, `Microsoft Graph - sales` (OAuth2), `Conceptualizador · token rutina respaldo`.
  - fts-suite-db: `fts_admin`, `comercial_app`, `conceptualizador_app`.
  - tesorería: `config_ro`, `app_rw`, `TEMPORAL dueño`.
  - ⚠️ **`tesoreria-escolar-db · TEMPORAL dueño`** y **`fts-suite-db · fts_admin`** son credenciales de dueño de base guardadas en n8n. Si ningún workflow activo las usa, se borran. Hay que medirlo antes con `get_workflow_details` por workflow.
- **Variables con secretos en el Primary (sólo nombres):** `GITHUB_TOKEN`, `ODOO_API_KEY`, `ODOO_PASSWORD`, `ODOO_RPC_KEY`, `SUITE_JWT_SECRET`, `FINANZAS_JWT_SECRET`, `FINANZAS_USER_HASH`, `FINANZAS_USER_SALT`, `PMO_CHAT_HMAC_SECRET`, `JEEVES_API_KEY`, `MARKETING_MOTOR_KEY`, `CONCEPTUALIZADOR_MOTOR_KEY`, `FTS_CORREO_KEY`, `DB_POSTGRESDB_PASSWORD`, `QUEUE_BULL_REDIS_PASSWORD`, `N8N_ENCRYPTION_KEY`. Notas:
  - `ODOO_PASSWORD` es una **contraseña de usuario de Odoo** en una variable. Si es la de una persona, quien tenga acceso a Railway la ve. Hay que pasarla a un usuario técnico (R0-2).
  - Hay un nombre de variable con un espacio al principio (`" N8N_TRUST_PROXY"`). Lo más probable es que n8n no la esté leyendo. Revisarlo en la sesión R1-5.
- **Webhooks públicos:** el detalle es #390. Lo que se sabe: `auth/verificar-scope` existe y está inactivo; varios endpoints escriben sin credencial (`rh/empleado/*` y otros). Los webhooks de n8n soportan Basic, Header, JWT o ninguna, más una lista de IPs ([docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)). El patrón de la Suite (JWT en el cuerpo, verificado en un Code) es válido mientras **cada** endpoint lo exija.
- **Editor expuesto:** el editor, los webhooks y `/mcp-server` comparten el mismo dominio. En Railway no se puede filtrar por IP. Opciones, de menor a mayor esfuerzo:
  1. 2FA y una sola cuenta.
  2. Un dominio propio para n8n detrás de un proxy con control de acceso por ruta: `/webhook/*` abierto y el resto con login.
  3. Separar un proceso sólo de webhooks.

  Las opciones 2 y 3 cambian la URL que leen todas las páginas (`public-config.json`): se hacen con los dos dominios vivos a la vez y una fase propia. **No dependen del dominio de la Suite.**

## 4 · fts-mcp-odoo (revisión del código en `yinyo1/fts-mcp-odoo`, solo lectura)

- **Cómo entran los clientes:** con una **ruta secreta en la URL** (`/mcp/<MCP_SECRET_PATH>`, mínimo 32 caracteres, comparada en tiempo constante, 404 si no coincide; `app/main.py:61-62`, `app/security.py:73-94`). Antes de esa ruta hay una lista de IPs (`ALLOWED_CIDRS`, 403) y después un rate limit en memoria (120/min por IP). La única ruta sin autenticación es `/healthz`, que devuelve `{"ok":true}`.
- 🔴 **La lista de IPs se puede falsificar:** `ip_del_cliente` toma el **primer** valor de `X-Forwarded-For` (`app/security.py:37-46`), que lo escribe el cliente. Lo mismo vale para el rate limit y para la IP que queda en la auditoría. **No verificado:** si el borde de Railway borra o reescribe esa cabecera entrante. Si no la toca, la única defensa real es la ruta secreta. Arreglo: tomar el **último** valor (el que agrega el proxy) o usar `forwarded_allow_ips` de uvicorn con `scope["client"]`.
- **Cómo entra a Odoo:** XML-RPC con API key, `ODOO_USER` + `ODOO_API_KEY`. **El usuario es administrador** (`README.md:79`, SPEC). El código sólo permite `search_read`, `search_count`, `read_group` y `fields_get`, revisado en dos módulos. Tiene unos 64 modelos permitidos y una lista negra que manda sobre ellos (`res.partner.bank`, `res.users`, `res.users.apikeys`, `ir.*`, `mail.*`), más un filtro de campos sensibles. **No escribe.** Pero como la llave es de admin, un bug en esas listas expone todo el ERP. Odoo mismo no pone ningún freno.
- **Bitácora:** completa (quién, IP, parámetros) **sólo** en 2 de 14 herramientas. Las demás registran modelo, método y número de filas, sin decir quién llamó. Todo va a stdout, o sea a los logs de Railway, que también se podan.
- **Rotación sin caída: hoy no se puede.** Sólo acepta un `MCP_SECRET_PATH` y un `ODOO_API_KEY`.
- **Plan (R1-4):**
  1. Usuario técnico de sólo lectura en Odoo con su propia llave (R0-2).
  2. Arreglar la cabecera `X-Forwarded-For`.
  3. Aceptar `MCP_SECRET_PATH` **y** `MCP_SECRET_PATH_NEXT` para rotar sin caída.
  4. Auditar las 14 herramientas.
  5. A mediano plazo, OAuth 2.1 (lo soporta FastMCP) o un `Authorization: Bearer` validado, en vez de un secreto en la URL. La URL termina en logs de proxy y en la configuración de los clientes.

  Los cambios de código van en ese repo, en su propia sesión.

## 5 · Plan de cierre (cada fila es una sesión con clic de Esteban)

| Sesión | Qué | Prueba previa | Prueba posterior | Reversa | Clic |
|---|---|---|---|---|---|
| **R1-1** | **Quitar el proxy TCP de Redis** (n8n) | métricas de Redis en 0 durante 7 días (ya medido); el Worker no está desplegado | el kiosko, Confirmar Horas y un webhook de lectura contestan igual; logs del Primary sin errores de Redis | volver a crear el proxy (Railway le asigna otro puerto) | Esteban |
| **R1-2** | **Quitar el proxy TCP del Postgres de n8n** | re-medir 24 h de `NETWORK_RX` ≈ 0; confirmar con Esteban que no hay cliente local (DBeaver, respaldos) que entre por ahí | `/healthz` del Primary, ejecuciones con éxito durante 1 h, el editor abre | re-crear el proxy | Esteban, **fuera de horario hábil** (CLAUDE.md §20 #14) |
| **R1-3** | **Tesorería:** el proxy se queda mientras n8n la use. Endurecerlo: (a) cada credencial de n8n con `SSL: require` (probar una por una); (b) **borrar `TEMPORAL dueño`** si ningún workflow lo usa; (c) contraseñas largas rotadas, con usuario nuevo creado **antes** de quitar el viejo. **Opción de fondo:** mover la base al proyecto `cheerful-comfort` (dump y restore a un servicio nuevo) para que n8n entre por red privada, y entonces cerrar el proxy. | listar los workflows que usan cada credencial | una ejecución real por workflow | restaurar la credencial anterior | Esteban |
| **R1-4** | **fts-mcp-odoo**: los cambios del §4 | pruebas del repo | Claude se conecta con la ruta nueva; con la vieja durante la ventana | redeploy de la versión anterior | Esteban |
| **R1-5** | **n8n**: fijar la etiqueta de imagen; revisar `" N8N_TRUST_PROXY"`; 2FA de Esteban; respaldo de `N8N_ENCRYPTION_KEY` fuera de Railway; correr `n8n audit` (o `POST /audit`) y pegar el resumen en el issue | — | `/healthz`, ejecuciones en verde | volver a la imagen anterior | Esteban |
| **R1-6** | **Restauración probada** y respaldo fuera de Railway | — | conteo de filas igual | borrar el desechable | Esteban |

**Para las bases que se queden expuestas:**
- `sslmode=require` del lado del cliente.
- Contraseñas de 32 o más caracteres generadas al azar.
- Un usuario por consumidor con mínimo privilegio. `fts-suite-db` ya lo hace (`comercial_app`, `conceptualizador_app`): copiar ese patrón.
- Nunca el usuario dueño en una credencial de uso diario.
