# Supuestos — MVP Comercial

Toda decisión que tomé solo, sin preguntar (la sesión era autónoma). Ordenadas por impacto: las 4 primeras cambian lo que el módulo *hace*, no solo cómo se ve.

Formato: **qué decidí · por qué · qué pasa si estaba mal**.

---

## 🔴 Las que importan

### T3-IDENTIDAD · Todo lead capturado se asigna a Esteban

**Contexto.** La spec dice: *"user_id = el usuario que captura (viene en el JWT; mapea contra res.users — si no hay match, asigna a Esteban y márcalo en description)"*.

**Lo que encontré.** El JWT de `auth/finanzas-login` construye su payload así:

```js
{ sub:'finanzas', iat, exp, app:'finanzas', ver:1, role:null }
```

`sub` está **hardcodeado al literal `'finanzas'`** — no se copia del request. `role` es **siempre `null`**. Hay **un solo usuario** posible (un par salt/hash en env, comparado contra el literal `'finanzas'`). Y verifiqué en Odoo: **ningún `res.users` tiene login `finanzas`** (los internos son `estebandelacruz@fts.mx`, `ventas@fts.mx`, `montalvo@fts.mx`, `miriam@fts.mx`, `julio.ramirez@fts.mx`).

**Decisión.** Implementé el mapeo tal cual pide la spec. Consecuencia: **el lookup nunca matchea y el 100% de los leads cae en el fallback a Esteban**, marcado en la `description` con:

```
[!] Asignado a Esteban por defecto: no se encontro un usuario interno de Odoo
para el login "finanzas" (sub del JWT: "finanzas"). Reasignar al vendedor real.
```

**Por qué igual lo dejé así.** Es literalmente lo especificado, y la marca hace que la fuga sea *visible* en vez de silenciosa. Añadí `capturado_por` como campo **opcional** del API (no expuesto en el front) que tiene prioridad sobre `sub`: es el hook listo para cuando el auth tenga identidad real, sin re-tocar el workflow.

**Si estaba mal.** Si esperabas atribución real desde el día 1, **no la vas a tener**: el módulo no arranca la atribución por vendedor que el baseline (§2, RIESGO-3) identifica como el problema #1. Requiere auth multi-usuario → `ROADMAP.md` §1. **Es la decisión que más vale la pena que revises.**

---

### T3-HMAC · El secreto se aprovisiona por dispositivo, no va en el código

**Contexto.** La spec pide HMAC-SHA256 del body con secret en `FTS_COMERCIAL_HMAC`, y un front en GitHub Pages.

**La contradicción.** El front es **estático y público**. Cualquier secreto escrito ahí queda commiteado en el repo y servido a quien lo pida. Un HMAC cuyo secreto es público **no es seguridad, es decoración** — y encima viola §9 ("nunca commitear credenciales").

**Decisión.** El workflow valida el HMAC exactamente como se pidió. El front lee el secreto de `localStorage['fts_comercial_hmac']`, aprovisionado una vez por dispositivo desde la consola (paso 5 del checklist). **Nunca se commitea.**

**Efecto lateral bueno:** el HMAC se convierte en un **factor de dispositivo real**. Tener el password de Finanzas no basta; hay que estar en un equipo aprovisionado. Sin él, el front avisa al entrar y la captura devuelve `NO_HMAC`.

**Si estaba mal.** Si querías que cualquiera con el password capture desde cualquier equipo, esto añade fricción (un paso de consola por dispositivo). La alternativa —secreto en el código— publica el secreto; no la tomé sin preguntar.

---

### T3-CANONICO · Se firma una cadena canónica, no el JSON crudo

**Contexto.** La spec dice *"HMAC-SHA256 del body"*.

**El problema.** n8n entrega el body **ya parseado**. Re-serializarlo con `JSON.stringify` en el server **no reproduce byte a byte** lo que mandó el browser: orden de llaves, espaciado, escapes unicode. La firma fallaría de forma **intermitente** y el síntoma (`BAD_SIGNATURE`) no diría por qué.

**Decisión.** Se firma:

```
v1|<cliente>|<descripcion>|<rango>|<origen>|<ts>
```

Determinista y versionado (el prefijo `v1` permite rotar el esquema). Más un **`ts` con ventana anti-replay de ±10 min**.

**Verificado:** `comercial/tests/hmac-interop.test.js` — 12/12 pass. Confirma que Web Crypto (navegador) y el JS puro (n8n) dan el mismo hash con acentos, ñ, emoji, saltos de línea, los `<`/`>` de los rangos, y secretos >64 bytes.

**Si estaba mal.** Si un integrador externo asume "HMAC del body crudo", su firma no va a validar. Está documentado en el propio nodo.

**Alternativa que descarté:** `rawBody` del webhook n8n (lo que hace Stripe/GitHub). Es más estándar, pero en n8n el raw llega como binario y complica el Code node. La cadena canónica es equivalente en garantías para este caso.

---

### T2-WRITE_DATE · El watchdog mide una señal que no es seguimiento comercial

**Contexto.** La spec pide *"días desde `write_date`"*.

**Lo que encontré** (baseline §6, RIESGO-2): **60 de las 122** cotizaciones enviadas comparten el `write_date` **exacto** `2025-11-28 03:13:06`, y otras 27 comparten `2026-05-27 17:56:35`. Son escrituras masivas, no toques humanos. `write_date` = *"la última vez que cualquier proceso tocó cualquier campo"*, no *"la última vez que alguien le dio seguimiento al cliente"*.

**Decisión.** Lo implementé con `write_date` **como se pidió**. Hoy da igual: el 100% está rojo de cualquier forma. Pero está documentado en el código del nodo, en el pie del correo y en el ROADMAP, porque **en cuanto el equipo empiece a trabajar, cualquier script que toque `sale.order` en masa va a resetear todos los semáforos a verde sin que nadie haya llamado a un cliente**. Es un falso negativo silencioso esperando a pasar.

**La señal correcta** es `mail.message` del chatter (comunicación real con el cliente) → Watchdog v2, `ROADMAP.md` §3.

---

## 🟡 Decisiones de alcance

### T2-VENTANA · Ventana de 365 días + tope de filas

**Por qué.** `state=sent` **sin filtro de fecha son 1,131 órdenes históricas**, todas rojas. Un correo con 1,131 filas es ilegible y se ignora al segundo día — y una alerta ignorada es peor que ninguna. Con ventana de 365d son 122, que **también** salen todas rojas.

**Decisión.** `ventana_dias: 365` + `top_n_por_vendedor: 15`. Las filas cortadas **nunca se ocultan en silencio**: salen como *"+N más (tope top_n=15), suman ~$X MXN"*. Ambos son config viva en `shared/comercial/watchdog_enviadas.json`.

### T2-MONTO-MINIMO · Filtro de $1,000

**Por qué** (baseline RIESGO-5): hay órdenes de `Public user` por $0, $1.16, $1.68 y 50 cancelaciones USD de ~$44 — carritos del portal web. Contaminan el digest.

**Decisión.** `monto_minimo: 1000` (config, poner en `0` para no filtrar). El correo reporta cuántas filtró, no las esconde.

### T1-MONEDA · La empresa es la autoridad de moneda, no `currency_id`

**Por qué** (baseline RIESGO-1): **127 órdenes de la empresa 1 (mexicana) están marcadas USD**. SO11771 (Conmet de México) = `53,190,685 USD` → serían **$923M MXN**, imposible. Pero coexisten órdenes empresa-1-en-USD que **sí** son dólares (Visionary $1,624). La bandera no es confiable ni para creerle ni para ignorarla.

**Decisión.** `company 1 → MXN` tal cual; `company 6 → USD × 17.35`. Aplicado igual en baseline, watchdog y pipeline para que los tres cuadren.

**Ambigüedad residual:** las 2 órdenes de Mission Foods (empresa 6, $1.35M y $1.20M USD) podrían ser MXN mal etiquetadas. Si lo son, el pipeline normalizado baja ~$44M MXN. El correo muestra **monto nominal + moneda** además del normalizado, para que puedas juzgar.

### T3-GET · `/comercial/pipeline` es POST, no GET

**La spec dice GET.** Pero el patrón de Finanzas —que la misma spec manda reusar *"exacto"*— manda el **JWT en el body** (RIESGO-2 del PLAN: el header `Authorization` fuerza preflight CORS que el webhook n8n puede no contestar). GET + body es contradictorio, y GET + token en query lo deja en logs de servidor y en el historial del navegador.

**Decisión.** POST. Prioricé *"reutiliza ese patrón exacto"* sobre el verbo.

### T3-DIRECCION · Lista blanca hardcodeada `[2]` (Esteban)

El claim `role` del JWT es **siempre `null`** → no es derivable y **no sirve como gate** (`role === 'admin'` fallaría siempre; `role !== 'guest'` pasaría siempre). La spec lo previó: *"si no es trivial, v1: lista blanca hardcodeada con Esteban"*. Es lo que hice: `DIRECCION_USER_IDS = [2]`.

Combinado con T3-IDENTIDAD: como toda sesión resuelve a Esteban y Esteban es dirección, **el pipeline v1 devuelve todo sin filtrar, siempre**. El filtrado por vendedor está implementado y funciona; simplemente no se ejerce hasta que haya identidad real.

### T3-ABIERTOS · "Oportunidades abiertas" = `type=opportunity` + `active=true`

En Odoo un lead **perdido se archiva** (`active=false`), así que `active=true` los excluye bien. Los **ganados siguen activos**, así que aparecen. Filtrar ganados requeriría leer `stage_id.is_won` (una consulta más a `crm.stage`), y para el MVP no lo vi necesario. Ventana de **180 días** para acotar los 1,849 leads existentes.

---

## 🟢 Cosméticas

### RUTA · `comercial/index.html`, no `comercial.html` en la raíz

La spec dice *"comercial.html es archivo nuevo"*. Lo puse en `comercial/index.html` porque **todos** los módulos del repo son `<modulo>/index.html` (`finanzas/`, `pmo/`, `seguridad/`…) y las cards ya apuntan a directorios. Un `comercial.html` suelto en la raíz sería la única excepción. La carpeta `comercial/` además ya existe (baseline). Se respeta el espíritu: **un archivo de front nuevo + un link nuevo**.

### LAUNCHER · No la metí en `modules-registry.js`

Meterla ahí la gatearía por `modulos[id].acceso` **por usuario** → habría que configurar permisos persona por persona, y quien no los tenga vería 🔒. No me lo pediste y podría dejar gente fuera. El módulo **ya se gatea solo** con su propio login. La card queda visible; el acceso lo controla el password.

### AUTH · El front carga `../finanzas/js/auth-fin.js` directo

*"Reusa el código, no lo reinventes"* → lo referencio en vez de copiarlo. **Efecto lateral a saber:** comparte `localStorage['fts_fin_session']`, así que **quien entra a Comercial queda logueado en Finanzas** (facturas, bills) y viceversa. No es un bug que introduje: es inherente a reusar el mismo issuer y el mismo password compartido, que es lo que se pidió. **Pero significa que dar acceso a Comercial = dar acceso a Finanzas.** → `ROADMAP.md` §1.

### CRON · `45 14 * * 1-5` en UTC, no `45 8` en America/Monterrey

La regla de la casa #9 dice America/Monterrey. Lo implementé como su **equivalente UTC**, igual que `ops/watchdog-mo` (el workflow que me pediste clonar), porque CLAUDE.md §18 documenta que **n8n descarta `settings.timezone` al importar** y cae al TZ de la instancia (America/New_York). México **eliminó el DST en 2022** → Monterrey es UTC−6 fijo → `14:45 UTC = 08:45 CST` todo el año, sin ajustes estacionales. **Requiere verificar Timezone=UTC en la UI** (paso 3 del checklist).

### STAGE · No seteo `stage_id` en el lead

Odoo asigna el default del pipeline. Setearlo a mano requeriría hardcodear un id de `crm.stage` — justo el anti-patrón de CLAUDE.md §13.

### FALLBACK-CONFIG · El watchdog degrada a defaults si el config no carga

No estaba pedido. Lo agregué porque el patrón original (`watchdog-mo`) **muere en silencio** si el config 404ea: sin `recipients.esteban` no manda correo y nadie se entera de que dejó de vigilar. Es exactamente el Hallazgo #14 de CLAUDE.md (*"feature en bypass silencioso"*). Ahora corre con defaults y **avisa con un banner en el propio correo**.

---

## ⚠️ Lo que NO pude verificar

### T3-E2E · El flujo completo login → captura → lead → pipeline

**No lo probé.** El criterio de aceptación de T3 queda **sin cumplir de mi lado**. Dos bloqueos duros:

1. Los workflows nacen **inactivos** (regla #6) y el API de n8n de esta instancia **no permite activarlos vía MCP**. El MCP solo dispara triggers webhook/form/chat, y ni eso sin el workflow activo.
2. El MCP de Odoo es **read-only** (UID 2), y el límite duro de la sesión dice que **solo el workflow de captura** puede crear `crm.lead`.

**Por lo tanto no existen leads `[TEST-CC]`** — la lista de IDs a borrar del checklist está **vacía**. No inventé registros que no creé (CLAUDE.md §3, regla anti-fantasma).

**Lo que SÍ verifiqué, y cómo:**

| Qué | Cómo | Resultado |
|---|---|---|
| Lógica del watchdog | 15 asserts contra data real de Odoo | 15/15 ✅ |
| Interop HMAC browser ↔ n8n | 12 asserts, incluye UTF-8/emoji/`<`/`>` | 12/12 ✅ |
| Estructura de los 3 workflows | `n8n_validate_workflow` | 3/3 válidos, 0 errores ✅ |
| Que existen y están inactivos | read-back con `n8n_get_workflow` | ✅ |
| Sintaxis del front | `node --check` + parse del script inline | ✅ |
| Números del baseline | 2 vías independientes (agregación Odoo + bucketing client-side) | Coinciden exacto ✅ |

**Lo que queda sin probar:** el cableado real n8n↔Odoo (que `customResource` quedó bien, que el CREATE de `crm.lead` acepta los campos tal como los mando, que el webhook responde). **Paso 6 del checklist.**
