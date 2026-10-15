# SuiteAuth: migración sin caídas

**Estado:** plan. No cambia nada en producción. Lo único nuevo en el repo es este documento y `tests/auth/` (la matriz, que no carga ninguna página).
**Medido:** 2026-10-15 05:2x UTC (= 23:2x CST del 14-oct), sobre `main` en `1172012`.

## 0 · La regla que manda: cero caídas

- Todo cambio es **aditivo**. `FTSAuth` (`shared/auth-suite.js`), `seguridad/data/users.json`, el bypass de FTS Master y la auth de Finanzas **no se modifican, renombran, mueven ni borran** antes del bloque C.
- Ninguna fase se habilita si la matriz de paridad (§2) no da **100%** para quienes la van a usar.
- Cada pantalla o comportamiento nuevo nace detrás de un **interruptor por módulo, apagado por omisión**. Si el interruptor no se puede leer, la página se comporta como hoy.
- El acceso durante A y B es **clásico O Suite**, nunca «Suite en vez de clásico». Con el espejo exacto de scopes, el OR no puede dar ni quitar nada que hoy no se tenga; la matriz lo demuestra.
- **Kiosko y pantallas compartidas: fuera de alcance** hasta tener plan propio probado.
- El aviso «el acceso clásico se desactivará» es **solo informativo**: no bloquea, no redirige, no cambia flujos.
- Todo paso que **quite** acceso va en el bloque C, una fase por sesión, con paridad verificada y aprobación explícita de Esteban.

## 1 · Lo que encontré y cambia el plan

1. **Hay cuatro sistemas de login, no dos.** FTSAuth (`fts_session`, `users-suite.json`, SHA-256 sin sal), SuiteAuth (`fts_suite_session`, JWT de `auth/suite-login` `kLhyPxVSMbDRwxfC`, Data Table `suite_usuarios`), FinAuth (`fts_fin_session`, `auth/finanzas-login` `ykNzGCvdjzjdXYhc`) y el **DC3 de Seguridad** (`seguridad/data/users.json` en texto plano + usuario `ftsmaster` con contraseña maestra escrita en el código). Mi Perfil y el kiosko tienen además su PIN de empleado.
2. **El lanzador sólo abre con el login clásico.** Magaly, Pablo, Ricardo, Rissia y Erick no tienen cuenta clásica: hoy entran por liga directa. Si el lanzador aceptara cualquier sesión Suite, **ganarían** lanzador, PMO, Ingeniería e Incidencias. Por eso existe el scope `suite:clasico` (§2).
3. **`rh:read` ya existe y nadie lo consume.** Lo tienen Ana y Magaly. Si las páginas clásicas de RH lo aceptaran, Magaly ganaría RH · Empleados, que escribe a Odoo (#390). El espejo usa `rh:acceso`, nuevo y distinto.
4. **Felipe está escrito por nombre** en `operaciones/planeacion/js/planeacion.js:748` y `operaciones/confirmar-horas/js/confirmar-horas.js:638`. Pasan a `operaciones:planeacion_editar` y `operaciones:confirmar_horas`. Rareza que se conserva a propósito: Ana y Montalvo ven activa la tarjeta de Planeación y la página los rechaza.
5. **El login clásico es también la llave de los secretos del navegador.** `index.html:231-235` usa la contraseña tecleada para descifrar `shared/ops-config.json` (`ConfigSync.load`) y dejar `ops_github_token` en el navegador. De ese token dependen `config-master` (escribe `users-suite.json`), `operaciones/incidencias` y `operaciones/config`. Un login sólo por SuiteAuth **no trae el token**: esas pantallas siguen necesitando el clásico hasta que el token salga del navegador (#390).
6. **`debe_cambiar_password` está en `true` para 8 de 10 cuentas Suite y no hay forma de cambiarla.** No existe workflow de cambio de contraseña (busqué `password` y `usuarios` en n8n: sólo `auth/suite-login`, `comercial/machotes-control` y un TMP). La bandera hoy sólo pinta un aviso.
7. **El ftsmaster de respaldo entra con cualquier contraseña** (`shared/auth-suite.js:60-73, 91-102` + `index.html:218-228, 281`): si fallan las dos lecturas de `users-suite.json` y el navegador no tiene `fts_master_hash`, cualquiera «activa» la cuenta master con 6 caracteres. Es un retiro (bloque C), no se toca antes.
8. **`users.json` del DC3 está vencido entero.** Las 7 cuentas expiraron entre el 12-mar y el 23-abr-2026 (`fecha_expira`). Hoy sólo entra a esa pantalla el `ftsmaster` con la contraseña maestra; los demás llegan por FTSAuth. Retirarlo no quita acceso a nadie que lo use hoy — pero sigue siendo un retiro y va en C.
9. **PMO tiene una dependencia escondida en n8n.** `pmo/chat-apply` (`G9mo4xkJKpbPDaT4`) valida que el HTML editado conserve `<script src="../shared/auth-suite.js">` y `FTSAuth.isLoggedIn()` (respaldo en `docs/n8n-workflows/pmo-chat-apply-code-code-apply-validate.js:25-26`; el workflow vivo no está expuesto al MCP, **no lo leí en vivo**). Renombrar o quitar `auth-suite.js` rompe el chat del PMO.
10. **Secretos ya publicados.** La contraseña maestra del DC3 está en `seguridad/index.html:671`, `seguridad/iperc/iperc-config.js:20` y `shared/auth.js:11` (huérfano: ningún archivo lo carga); `pmo/index.html:999, 1687` trae una llave HMAC; `users.json` trae contraseñas en claro. **Retirarlos del código no los des-publica**: están en el historial de un repo público. Lo que los neutraliza es rotarlos. Esto no se persigue en este frente (CLAUDE.md §8); queda anotado como riesgo.

## 2 · Matriz de paridad

`node tests/auth/matriz-paridad.js` la calcula con los datos reales (`shared/users-suite.json` + `tests/auth/suite_usuarios.snapshot.json`) y **sale con 1 si una sola celda no coincide**. Cada condición «hoy» es copia del código con su `archivo:línea`; cada condición «propuesta» usa sólo scopes.

- `--md` imprime la tabla de abajo. `--propuesta` imprime qué scopes se le sembrarían a cada quien.
- `--autoprueba` mete tres errores plausibles (reusar `rh:read`, abrir lo clásico con cualquier token, quitar el hardcode de Felipe sin su scope) y exige que la matriz se ponga roja con cada uno. Hoy los tres se detectan.
- Resultado al cierre: **PARIDAD 100% · 480/480 celdas · 40 objetivos × 12 personas.**

Se lee así: la celda es lo que esa persona ve hoy; con los scopes propuestos ve exactamente lo mismo (si no, la celda diría `❌ hoy→propuesto`). «—» = no aplica porque hoy no entra al lanzador.

| Objetivo | Esteban | Felipe | Ana | Montalvo | Tere | Carolina | Magaly | Pablo | Ricardo | Rissia | Erick | Aldo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lanzador · entrar | entra | entra | entra | entra | entra | entra | sin lanzador | sin lanzador | sin lanzador | sin lanzador | sin lanzador | sin lanzador |
| lanzador · seguridad | activa | activa | atenuada | activa | atenuada | atenuada | — | — | — | — | — | — |
| lanzador · ingenieria | activa | activa | atenuada | activa | atenuada | atenuada | — | — | — | — | — | — |
| lanzador · operaciones | activa | activa | activa | activa | activa | activa | — | — | — | — | — | — |
| lanzador · finanzas | activa | atenuada | atenuada | atenuada | atenuada | atenuada | — | — | — | — | — | — |
| lanzador · comercial | activa | atenuada | atenuada | atenuada | atenuada | atenuada | — | — | — | — | — | — |
| lanzador · hatch | activa | atenuada | atenuada | atenuada | atenuada | atenuada | — | — | — | — | — | — |
| lanzador · odoo | activa | atenuada | atenuada | atenuada | atenuada | atenuada | — | — | — | — | — | — |
| lanzador · rh | activa | próximamente | activa | próximamente | próximamente | próximamente | — | — | — | — | — | — |
| lanzador · config/hatch visibles | visibles | ocultas | ocultas | ocultas | ocultas | ocultas | — | — | — | — | — | — |
| seguridad/ (página) | abre | abre | abre | abre | abre | abre | niega | niega | niega | niega | niega | niega |
| seguridad · tarjeta instructor | visible | visible | oculta | visible | oculta | oculta | — | — | — | — | — | — |
| seguridad · tarjeta empleado | visible | visible | oculta | visible | oculta | oculta | — | — | — | — | — | — |
| seguridad · tarjeta IPERC | visible | visible | oculta | visible | oculta | oculta | — | — | — | — | — | — |
| seguridad/iperc/ (página) | abre | abre | niega | abre | niega | niega | niega | niega | niega | niega | niega | niega |
| operaciones/ (página) | abre | abre | abre | abre | abre | abre | niega | niega | niega | niega | niega | niega |
| operaciones · tarjeta kiosk | activa | activa | activa | activa | activa | activa | — | — | — | — | — | — |
| operaciones · tarjeta incidencias | activa | activa | activa | atenuada | atenuada | atenuada | — | — | — | — | — | — |
| operaciones · tarjeta planeacion | activa | activa | activa | activa | atenuada | atenuada | — | — | — | — | — | — |
| operaciones · tarjeta dashboard | activa | activa | activa | activa | atenuada | atenuada | — | — | — | — | — | — |
| operaciones/planeacion/ (página) | abre | abre | niega | niega | niega | niega | niega | niega | niega | niega | niega | niega |
| operaciones/confirmar-horas/ | abre | abre | niega | niega | niega | niega | niega | niega | niega | niega | niega | niega |
| operaciones/incidencias/ + /empleado | abre | abre | abre | abre | abre | abre | niega | niega | niega | niega | niega | niega |
| operaciones/incidencias/supervisor | abre | abre | abre | niega | niega | niega | niega | niega | niega | niega | niega | niega |
| modulos/rh/ (hub, visores, empleados) | abre | niega | abre | niega | niega | niega | niega | niega | niega | niega | niega | niega |
| ingenieria/ | abre | abre | abre | abre | abre | abre | niega | niega | niega | niega | niega | niega |
| pmo/ | abre | abre | abre | abre | abre | abre | niega | niega | niega | niega | niega | niega |
| hatch/ | abre | niega | niega | niega | niega | niega | niega | niega | niega | niega | niega | niega |
| admin/config-master + editor-asistencias | abre | niega | niega | niega | niega | niega | niega | niega | niega | niega | niega | niega |
| comercial/ + machote | abre | niega | niega | abre | niega | niega | niega | abre | abre | abre | niega | niega |
| machote · dirección | abre | niega | niega | niega | niega | niega | niega | niega | niega | niega | niega | niega |
| comercial/conceptualizador | abre | niega | niega | abre | niega | niega | niega | niega | abre | niega | niega | niega |
| marketing/ | abre | niega | niega | niega | niega | niega | niega | abre | niega | abre | niega | niega |
| marketing · bandeja | abre | niega | niega | niega | niega | niega | niega | abre | niega | niega | niega | niega |
| marketing · crm/seguimiento | abre | niega | niega | niega | niega | niega | niega | abre | niega | abre | niega | niega |
| finanzas/rentabilidad | abre | abre | niega | niega | niega | niega | niega | niega | niega | niega | niega | niega |
| finanzas/data-bancos | abre | niega | niega | niega | niega | niega | niega | niega | niega | niega | abre | niega |
| rh/nomina-incidencias | niega | niega | abre | niega | niega | niega | abre | niega | niega | niega | niega | niega |
| rh/retardos (lectura) | niega | niega | abre | niega | niega | niega | abre | niega | niega | niega | niega | niega |
| rh/retardos (editor) | niega | niega | abre | niega | niega | niega | abre | niega | niega | niega | niega | niega |

VEREDICTO: PARIDAD 100% · 480/480 celdas · 40 objetivos × 12 personas

### Scopes que se sembrarían (espejo exacto del árbol clásico)

| Persona | Cuenta Suite | Se agrega |
|---|---|---|
| Esteban | esteban.delacruz | `suite:clasico`, `suite:master`, `suite:todos_los_modulos` |
| Felipe | felipe.perez | `suite:clasico`, `seguridad:{acceso,instructor,empleado,iperc}`, `operaciones:{acceso,kiosk,dashboard,planeacion,incidencias,supervisor}`, `ingenieria:{acceso,analisis_estructural}`, `operaciones:planeacion_editar`, `operaciones:confirmar_horas` |
| Ana | ana.acevedo | `suite:clasico`, `operaciones:{acceso,kiosk,dashboard,planeacion,incidencias,supervisor}`, `rh:{acceso,visor_checkins,visor_incidencias}` |
| Montalvo | francisco.montalvo | `suite:clasico`, `seguridad:{acceso,instructor,empleado,iperc}`, `operaciones:{acceso,kiosk,dashboard,planeacion}`, `ingenieria:{acceso,analisis_estructural}` |
| Tere, Carolina | **sin cuenta Suite** | `suite:clasico`, `operaciones:{acceso,kiosk}` — sólo tienen permiso del kiosko, que está fuera de alcance. **Se quedan en el clásico** hasta el plan del kiosko. |
| Magaly, Pablo, Ricardo, Rissia, Erick, Aldo | — | nada |

Notas de la matriz:
- `seguridad:iperc` tiene semántica distinta en el código (se oculta sólo si vale `false` explícito, `seguridad/index.html:711`). El espejo usa el scope positivo y la matriz demuestra que hoy coinciden. Si mañana alguien queda con `seguridad` sin la llave `iperc`, esa fila se pone roja: es justo lo que debe pasar.
- **Supuesto sin medir:** `ftsmaster` = Esteban. Si alguien más usa esa clave, esa persona se queda sin acceso el día que se retire el clásico. El tablero de adopción (A8) lo mide antes del bloque C.
- El snapshot de `suite_usuarios` es de un momento. Antes de cada fase se vuelve a leer y se vuelve a correr la matriz.

## 3 · Inventario de dependencias (nada de esto se retira en A ni B)

### 3.1 Pantallas

| Sistema | Páginas | Condición |
|---|---|---|
| **FTSAuth** | `index.html` (lanzador) | sesión; tarjetas por `modulos[m].acceso`; Config Master y Hatch sólo `role==='master'` |
| | `seguridad/index.html`, `seguridad/iperc/index.html` | sesión; tarjetas por submódulo; iperc oculto sólo si `===false` |
| | `operaciones/index.html` | sesión; tarjetas por submódulo `===true`; Confirmar Horas siempre visible |
| | `operaciones/planeacion/`, `operaciones/confirmar-horas/` | master, `'all'` o `username==='felipe.perez'` |
| | `operaciones/incidencias/` (+ `/empleado`, `/supervisor`) | sesión; supervisor: `submodulos.supervisor===true` |
| | `modulos/rh/` (hub, `visor-checkins`, `visor-incidencias`, `empleados/`) | master, `'all'` o `rh.acceso===true` |
| | `ingenieria/`, `pmo/` | cualquier sesión |
| | `hatch/`, `shared/admin/config-master.html`, `shared/admin/editor-asistencias.html` | `role==='master'` |
| **SuiteAuth** | `comercial/`, `comercial/machote/` (+ `comercial:admin` dentro) | `comercial:read` |
| | `comercial/conceptualizador/` | `conceptualizador:usar` |
| | `marketing/*` | `marketing:usar` (+ `:bandeja`, `:crm`) |
| | `finanzas/rentabilidad/`, `finanzas/data-bancos/` | `rentabilidad:read`, `bancos_data:read` |
| | `modulos/rh/nomina-incidencias/` (NomAuth, **misma llave** `fts_suite_session`) | `nomina:write` |
| | `modulos/rh/retardos/` | `retardos:read` / `:write` (el modo demo entra sin login) |
| | `shared/login.html`, `comercial/login.html` (reenvía) | — |
| **FinAuth** | `finanzas/index.html`, `operaciones/carga-mo/`, `comercial/leads.html` | cualquier token de Finanzas |
| **DC3** | `seguridad/index.html` (PIN instructor/empleado), `seguridad/iperc/iperc-config.js` | `users.json` en claro + `ftsmaster` con contraseña maestra |
| **PIN de empleado** | `shared/mi-perfil/*`, `operaciones/kiosk/` | PIN comparado en el navegador (+ rostro opcional) — **fuera de alcance** |
| **PIN de dispositivo** | `operaciones/config/` | `ops_master_pin` con valor por omisión en el código — **fuera de alcance** |
| **Sin gate** | `operaciones/dashboard/`, `ingenieria/analisis-estructural/`, `diagnostico.html`, prototipos, `prospector/metodo/`, `website/` | abiertas |

### 3.2 Archivos de usuarios y quién los toca

| Archivo | Lo leen | Lo escriben |
|---|---|---|
| `shared/users-suite.json` | `auth-suite.js` (API con token o raw), `diagnostico.html`, `config-master.html` | **sólo** `config-master.html:2254-2318` (PUT a GitHub con `ops_github_token`) |
| `seguridad/data/users.json` | `seguridad/index.html:679`, `iperc-config.js:21`, `shared/auth.js:14` (huérfano) | nadie por código: se pega a mano (`seguridad/index.html:933`) |
| Data Table `suite_usuarios` | `auth/suite-login`, `TMP retardos/auditoria-scopes` | a mano en n8n (no hay pantalla) |
| `shared/ops-config.json` | `ConfigSync.load(<contraseña del login clásico>)` | `config-master` |

### 3.3 n8n

| Workflow | Dependencia |
|---|---|
| `auth/suite-login` `kLhyPxVSMbDRwxfC` (activo) | lee `suite_usuarios`; emite el JWT. **No se modifica en este plan.** |
| `auth/verificar-scope` `QokDKd6rCqSNsP4u` (inactivo) | verificador único del JWT, ya construido para #390 |
| `auth/finanzas-login` `ykNzGCvdjzjdXYhc` | FinAuth. **No se toca.** |
| `pmo/chat-apply` `G9mo4xkJKpbPDaT4` | exige `auth-suite.js` y `FTSAuth.isLoggedIn()` dentro de `pmo/index.html` (según respaldo del repo; el vivo no está expuesto al MCP) |
| `asistencias/admin` `Bqnfsx8gx2TpzfwM` | recibe `X-FTS-Session-Token` (la sesión clásica en base64) desde `editor-asistencias.html:727`. **No leí qué valida**: no está expuesto al MCP. Hay que leerlo antes de mover el editor. |
| `kiosk/empleados` `2UGWLjNwYRGtXq5y` | entrega los PIN al navegador (kiosko y Mi Perfil). Fuera de alcance. |
| Los que escriben sin credencial (`rh/empleado/*` y otros) | #390. Mover la pantalla a SuiteAuth **no** los protege; eso es el otro frente. |

### 3.4 Consumidores externos y scripts
- `pmo/chat-apply` (arriba) es el único consumidor de código que encontré fuera de las páginas.
- `scripts/capturas-nomina.js:65-67` siembra un `fts_suite_session` falso; `tests/visual-confirmar-horas.js` y `tests/visual-empleados.js` siembran `fts_session`. Siguen sirviendo mientras exista el clásico.
- Llaves de `localStorage` que no se tocan: `fts_session`, `fts_suite_session`, `fts_fin_session`, `fts_master_hash`, `fts_mi_perfil_session` (sessionStorage), `fts_iperc_session`, `ops_github_token`.

## 4 · Interruptores

- **Dónde:** Data Table nueva `suite_interruptores` (`modulo`, `modo` = `apagado | piloto | todos`, `piloto` = lista de usernames), leída por un webhook GET nuevo de sólo lectura. Una sola lectura por carga, con caché de 5 min en `sessionStorage`.
- **Falla segura:** si el webhook no contesta, tarda más de 3 s o devuelve algo raro, **todo vale `apagado`** y la página es la de hoy.
- **Cliente:** archivo nuevo `shared/auth-puente.js`. Las páginas clásicas lo cargan **además** de `auth-suite.js` (no en su lugar). Expone `AuthPuente.permite(modulo, resultadoClasico, scope)`, que devuelve `resultadoClasico || (interruptor activo para esta persona && SuiteAuth.tieneScope(scope))`. Con el interruptor apagado devuelve exactamente `resultadoClasico`.
- **Reversa en un clic:** `modo = apagado` desde Configuración (A7). Mientras A7 no exista, desde la Data Table en la UI de n8n. Ninguna reversa necesita un deploy.

## 5 · Pruebas de no regresión

Dos capas. Las dos corren **antes y después de cada fase**, y una fase no se da por cerrada si cambia una sola salida.

**Capa 1 · matriz** (ya existe): `node tests/auth/matriz-paridad.js && node tests/auth/matriz-paridad.js --autoprueba`.

**Capa 2 · navegador** (✅ construida en A1, `tests/auth/navegador-paridad.js`; línea base en `tests/auth/linea-base/`: **478/480** celdas iguales al modelo, ver §9.0): Playwright sirviendo el repo local (Pages no es alcanzable desde el contenedor, CLAUDE.md §9), interceptando `users-suite.json` y los webhooks, y sembrando cada sesión. Para cada persona de la matriz y cada objetivo, abre la página y lee el resultado real del DOM (tarjeta atenuada/oculta, redirección, overlay). La salida se compara contra la Capa 1: si el navegador y el modelo no coinciden, el modelo está mal.

| # | Prueba | Qué exige |
|---|---|---|
| P-01 | Login clásico en el lanzador (Esteban, Felipe, Ana, Montalvo, Tere, Carolina) | entra; tarjetas = matriz; `ops_github_token` restaurado para master |
| P-02 | Login clásico con contraseña mala | rechaza igual que hoy |
| P-03 | Login SuiteAuth en `shared/login.html` (las 11 cuentas activas) | entra; con `?falta=` explica el scope |
| P-04 | Lanzador con sesión Suite y **sin** `suite:clasico` | muestra el login clásico, como hoy |
| P-05 | Lanzador con interruptor `apagado` y sesión Suite con `suite:clasico` | idéntico a hoy (sólo clásico) |
| P-06 | Cada submódulo de Seguridad, Operaciones, RH, Ingeniería, PMO, Hatch, Config Master, Editor | abre/niega = matriz, en los dos sistemas |
| P-07 | Comercial, Marketing, Rentabilidad, Data Bancos, Nómina, Retardos | igual que hoy (la propuesta sólo agrega scopes) |
| P-08 | Finanzas, Carga MO, Leads | FinAuth intacto |
| P-09 | Cerrar sesión clásica | no borra `fts_suite_session` ni `fts_fin_session` (y viceversa) |
| P-10 | Inactividad 30 min en clásico | cierra la sesión clásica como hoy |
| P-11 | Webhook de interruptores caído | todo se comporta como hoy |
| P-12 | `pageerror` en consola | cualquiera es fallo (CLAUDE.md §20 #12) |
| P-13 | Capturas a 380, 760, 900 y 1280 px de cada pantalla nueva, miradas | CLAUDE.md §20 #20 |
| P-14 | (nace con el MFA) scope de nivel 2 o 3 con un token `acr` menor | se niega con `NIVEL_INSUFICIENTE`; con el nivel correcto, abre |
| P-15 | `users-suite.json` caído + contraseña inventada para `ftsmaster` | **hoy ofrece activar la cuenta master (puerta abierta)**; después de C2, rechaza (`C2_CERRADA=1`) |

**Piloto:** `esteban.delacruz`, `felipe.perez`, `ana.acevedo`. Nadie más entra a un interruptor `piloto` hasta que las tres personas usen el sistema nuevo en su trabajo normal sin un solo reporte.

## 6 · Orden de construcción por sesiones

Cada sesión es un PR, con bump de build donde haya `version.json`, la matriz y P-01…P-13 en verde antes y después.

### Bloque A · aditivo, sin riesgo (todo detrás de interruptores apagados)

| Sesión | Qué | Toca producción | Reversa |
|---|---|---|---|
| **A0** | Este plan + `tests/auth/` | no | — |
| **A1** | Prueba de navegador (Capa 2) y línea base de hoy | no | — |
| **A2** | **Catálogo** único `shared/config/catalogo-accesos.json`: módulos, submódulos y scopes (los de hoy + los del espejo), con etiqueta. Un gate verifica que coincide con `MODULES_REGISTRY`, `USERS_MODULES_TREE` y los scopes del código. Nadie lo lee todavía. | no | borrar el archivo |
| **A3** | **Interruptores**: Data Table + webhook GET de sólo lectura + `shared/auth-puente.js`. Las páginas clásicas lo cargan con todo `apagado`. Se prueba que con todo apagado no cambia un pixel. | sí: una etiqueta `<script>` por página y un workflow nuevo | quitar la etiqueta o dejar `apagado` |
| **A4** | **Sembrar el espejo** en `suite_usuarios` sólo para Esteban, Felipe y Ana (agregar scopes, nunca quitar). Re-leer y correr la matriz con datos vivos. Con los interruptores apagados nadie los consume. | sí: escritura a la Data Table | quitar los scopes agregados (se guarda el valor anterior en el PR) |
| **A5** | **Mi perfil › Seguridad**: página nueva `shared/mi-perfil/seguridad/` con SuiteAuth (no toca el flujo de PIN) + workflow nuevo `auth/cambiar-password` (pide la actual, guarda `hash_anterior` en columna nueva, apaga `debe_cambiar_password`). Liga oculta con el interruptor `mi_perfil_seguridad`. | sí: workflow nuevo + columna nueva | interruptor; `hash_anterior` devuelve la contraseña previa |
| **A6** | **Contraseña temporal de RH**: workflow `auth/password-temporal` con scope nuevo `usuarios:password_temporal` (no se le da a nadie hasta el piloto). Genera una temporal, guarda `hash_anterior`, prende `debe_cambiar_password`. Pantalla en RH detrás de interruptor. | sí: workflow nuevo | interruptor; `hash_anterior` |
| **A7** | **Configuración**: pantalla `shared/admin/configuracion/` con `suite:master`. Primero sólo lectura (catálogo, quién tiene qué, interruptores). Luego escritura de scopes e interruptores por un workflow nuevo que valida contra el catálogo y hace read-back. No reemplaza a Config Master. | sí | interruptor; cada escritura guarda el valor anterior |
| **A8** | **Aviso informativo + tablero de adopción**: banner en el lanzador clásico («ya tienes cuenta nueva; el acceso clásico se va a desactivar más adelante»), cerrable, sin redirigir. Webhook nuevo `auth/registro-uso` (fuego y olvido, nunca bloquea) que cuenta entradas por sistema y usuario; el tablero las muestra en Configuración. | sí | interruptor |

### Bloque B · piloto y verificación de paridad

| Sesión | Qué | Condición para pasar |
|---|---|---|
| **B1** | Interruptor `piloto` sólo para Esteban, módulo por módulo (lanzador, Seguridad, Ingeniería, PMO, Hatch). Una semana. | matriz 100% con datos vivos; P-01…P-13 verdes; cero reportes |
| **B2** | Felipe en Operaciones: Planeación, Confirmar Horas, Incidencias. **Fuera de la ventana de confirmación de horas y del write de nómina.** Se queda logueado también en el clásico (`ops_github_token`, hallazgo 5). | ídem, y Confirmar Horas confirma un día real |
| **B3** | Ana en RH clásico y Operaciones. Primer uso real de A5 (cambia su contraseña) y de A6 sobre una cuenta de prueba. | ídem |
| **B4** | Paridad final: re-leer `suite_usuarios`, correr la matriz con las 12 personas, revisar el tablero de adopción (¿alguien más usa `ftsmaster`?). Decidir con Esteban qué módulo pasa de `piloto` a `todos`. **Un módulo por sesión.** | aprobación de Esteban por módulo |

### Bloque C · retiros (cada uno es su propia sesión, con aprobación explícita de Esteban, nunca junto con otro cambio)

| Fase | Qué se retira | Antes, exigir | Reversa |
|---|---|---|---|
| C1 | `shared/auth.js` (huérfano) | grep: cero cargas | revert |
| C2 | ftsmaster de respaldo / primer login con cualquier contraseña (`auth-suite.js:60-102`) | tablero: nadie usa el primer login | revert |
| C3 | Hardcode `felipe.perez` → sólo scope | B2 cerrado | revert |
| C4 | Bypass de FTS Master del DC3 + `users.json` (Seguridad) | tablero: nadie entra por ahí; Seguridad en `todos` | revert; **rotar la contraseña maestra igual: ya es pública** |
| C5 | Login clásico en **solo lectura** (no se crean ni editan usuarios en `users-suite.json`; Config Master deja de escribir) | el token de GitHub ya no se necesita en el navegador (#390) | revert |
| C6 | Login clásico apagado por módulo (el OR pasa a sólo Suite) | B4 aprobado para ese módulo; Tere y Carolina con plan de kiosko | interruptor |
| C7 | `auth-suite.js` fuera de páginas | `pmo/chat-apply` actualizado y verificado antes | revert + restaurar versión del workflow |
| C8 | Repo privado (**protege código y secretos, NO la página**: ver §10.4) | ver §7: en GitHub Free apaga Pages; rompe el raw y lo que n8n lee de `main` | **casi irreversible**; decisión aparte |

## 7 · Riesgos y lo irreversible

**Riesgos**
- **Que el espejo se desactualice.** Si alguien edita `users-suite.json` o `suite_usuarios` entre A4 y C, la paridad se rompe sin aviso. Mitigación: la matriz corre al inicio de cada sesión con datos re-leídos.
- **Dos sesiones con vidas distintas.** El clásico se cierra por 30 min de inactividad; el JWT dura 8 h. Con el OR, en el piloto alguien puede seguir dentro por Suite cuando el clásico ya lo sacó. Es acceso que ya tenía, pero hay que decirlo.
- **La llave compartida `fts_suite_session`** (SuiteAuth y NomAuth): cerrar sesión en Nómina cierra Comercial. Ya pasa hoy; no lo empeoramos, no lo arreglamos aquí.
- **`ops_github_token`** depende del login clásico (hallazgo 5): Config Master, Incidencias y la config del kiosko no pueden pasar a sólo-Suite hasta resolver #390.
- **Escribir a `suite_usuarios` desde una pantalla** (A7) puede dejar a alguien sin poder entrar si se guarda mal la cadena de scopes. Mitigación: validar contra el catálogo, read-back, valor anterior guardado, y nunca desactivar ni borrar desde ahí en A/B.
- **Carga en n8n** (§20 #14): el webhook de interruptores y el de registro de uso corren en cada carga de página. Caché en sesión y respuesta mínima; nada pesado en horario hábil.
- **Mover la pantalla no protege el webhook.** Los `rh/empleado/*` siguen escribiendo sin credencial aunque la pantalla pida SuiteAuth (#390).

**Lo irreversible**
- **Lo que ya está en el historial público** (contraseña maestra del DC3, llave HMAC del PMO, contraseñas en claro de `users.json`, hashes sin sal) no se retira con un commit. Sólo se neutraliza rotando.
- **Cambiar una contraseña** sobrescribe el hash anterior: por eso A5 y A6 guardan `hash_anterior` antes de escribir.
- **Borrar una fila de `suite_usuarios`** no tiene historial. Regla: nunca se borra, se pone `activo=false`.
- **Repo privado (C8):** apaga GitHub Pages en el plan gratuito, rompe cada lectura `raw.githubusercontent.com` (lanzador, kiosko, `public-config.json`, el semáforo de n8n que lee `main` en vivo) y no des-publica nada de lo que ya se clonó o se cacheó.

## 8 · Decisiones que necesito de Esteban

Contestadas por Esteban el 15-oct-2026:
1. **`ftsmaster` lo usa sólo Esteban.** ⚠️ El texto llegó con la marca «[CONFIRMAR O CORREGIR ANTES DE PEGAR]» sin quitar: se toma como confirmado, pero A8 lo vuelve a medir antes del bloque C.
2. **Tere y Carolina se quedan en el login clásico** hasta que haya plan del kiosko.
3. **Sí a A1** (hecha: §5 y §9.0).
4. **A4 la hace Claude por MCP**, con read-back y el valor anterior guardado en el PR, en su propia sesión y con la aprobación de Esteban.

## 9 · A1 (resultado) y estándares que el plan adopta

### 9.0 · Capa 2 · resultado de la línea base (15-oct-2026)

`node tests/auth/navegador-paridad.js` sirve el repo en local con Chromium, intercepta GitHub y n8n (nada sale del contenedor) y siembra sesiones de prueba. **No usa ninguna credencial real**: `users-suite.json` se sirve con los mismos roles y módulos, pero con hashes de contraseñas de prueba, y `ops-config.json` se sustituye por un blob nuevo con un token falso.

| Prueba | Resultado |
|---|---|
| Grilla (P-06/P-07) | **478/480** celdas del DOM = Capa 1. Las 2 que difieren: **Nómina · Ana y Magaly** (modelo «abre», DOM «pide login»). |
| P-01 | ✓ 6 cuentas clásicas entran y sus tarjetas = matriz; sólo el master recupera el token (del blob de prueba). |
| P-02 | ✓ contraseña mala y usuario inexistente → el mismo «Usuario o contraseña incorrectos». |
| P-03 | ✓ las 10 cuentas del snapshot (9 activas entran con sus scopes; `aldo.mendez` inactivo, rechazado); `?falta=` explica el scope. El plan decía «11 cuentas activas»: el snapshot tiene 10 cuentas y 9 activas. |
| P-04 / P-05 | ✓ con sesión Suite (con o sin `suite:clasico`) el lanzador sigue mostrando el login clásico. |
| P-07 | ✓ Comercial, Marketing, Rentabilidad, Bancos y Retardos = matriz. **Nómina**: la diferencia de arriba explicada (ver hallazgo 11). |
| P-08 | ✓ Finanzas, Carga MO y Leads abren sólo con `fts_fin_session`; el clásico y la sesión Suite no las abren. |
| P-09 | ✓ cerrar cualquiera de las tres sesiones no toca las otras dos. |
| P-10 | ✓ a 31 min sin actividad el clásico se cierra; a 29 min no. |
| P-11 | ✓ ninguna página pide interruptores hoy; con n8n caído el lanzador clásico se pinta idéntico. |
| P-12 | ✗ **55 `pageerror`, 7 distintos (línea base de hoy)**: 6 son el `throw new Error('sin sesion')` con el que las páginas SuiteAuth cortan su propio arranque al negar (diseño, `shared/auth-jwt.js` `requerir`); 1 es `rentabilidad` sin datos (`reading 'resumen'`) por el webhook vacío de la prueba. Ninguno lo introdujo esta fase. A partir de aquí, **un `pageerror` nuevo** es fallo. |
| P-13 | ✓ 16 capturas (4 escenas × 380/760/900/1280), revisadas; sin desborde horizontal. |
| P-15 | ✓ **confirma la puerta abierta del ftsmaster de respaldo** (ver §10, C2). |

**Hallazgo 11 (nuevo):** `NomAuth` (`modulos/rh/nomina-incidencias/js/nom-auth.js:109-113`) y `SuiteAuth` (`shared/auth-jwt.js`) comparten la llave `fts_suite_session`, pero no el formato:
- Nómina exige `expires_at` (ISO) y SuiteAuth exige `exp` (epoch).
- Una sesión abierta en `shared/login.html` **no abre Nómina** y pide login otra vez.
- Entrar a Nómina **sobrescribe** la sesión con un formato que SuiteAuth no reconoce, y saca a la persona de Comercial y Marketing.
- §7 ya mencionaba que «cerrar sesión en Nómina cierra Comercial». Esto va más allá: **entrar a una cierra la otra**.

No se arregla en este frente. Queda medido en P-07 para que, el día que se unifique, la prueba lo confirme.

### 9.1 · Estándares y brechas (verificados en la fuente oficial el 15-oct-2026)

**Contraseñas guardadas (OWASP Password Storage CS).**
- **Norma:** Argon2id (una de 5 configuraciones equivalentes, entre ellas m=19 MiB, t=2, p=1) o **PBKDF2-HMAC-SHA256 con 600,000 iteraciones**.
- **Hoy:**
  - SuiteAuth usa **PBKDF2-HMAC-SHA256 con 100,000** iteraciones y sal por usuario (`docs/n8n-workflows/fase0/node-suite-login.js:120`, respaldo del workflow; el vivo no se leyó). FinAuth, lo mismo.
  - El clásico usa **SHA-256 sin sal en un archivo público**.
- **Diseño:** re-hash transparente.
  1. Columnas nuevas `algo` e `iter` en `suite_usuarios`, valor por omisión `pbkdf2-sha256` y `100000`.
  2. En el **siguiente login exitoso**, si `iter < 600000`, se recalcula con 600,000 y se guarda con read-back.
  3. Nunca en un login fallido.
  4. ⚠️ PBKDF2 de 600k en JS puro dentro del sandbox de n8n puede tardar varios segundos por login. Se mide en un TMP antes de fijarlo (CLAUDE.md §20 #14). Si no es viable, Argon2id requiere un servicio fuera del sandbox.
- **Referencia:** https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

**Política de contraseñas (NIST SP 800-63B-4, final, jul-2025, §3.1.1.2).**
- **Norma:**
  - **15 caracteres mínimo sin MFA**, 8 con MFA, permitir 64 o más, sin reglas de composición.
  - **Lista de bloqueo** (comunes, filtradas, del contexto).
  - Sin vencimiento periódico; cambio sólo ante compromiso.
  - Gestores de contraseñas: **SHALL**; pegar: **SHOULD**.
  - Techo de 100 fallos consecutivos (§3.2.2).
- **Hoy:**
  - El primer login clásico acepta 6 caracteres.
  - No hay lista de bloqueo.
  - No hay cambio de contraseña (hallazgo 6).
- **Diseño para A5 y A6:**
  - Mínimo 15, máximo ≥64.
  - Consulta a **HIBP Pwned Passwords por rango (k-anonimato)**: sólo viajan los primeros 5 caracteres del SHA-1, con `Add-Padding: true`, sin API key (https://haveibeenpwned.com/API/v3). Se consulta desde n8n, no desde el navegador.
  - Más una lista local con «fts», «servicios», nombres de módulos y el usuario mismo.
  - Los campos permiten pegar (`autocomplete="new-password"` / `current-password`).
- **Referencia:** https://pages.nist.gov/800-63-4/sp800-63b.html

**JWT (RFC 8725, BCP 225).**
- **Norma (secciones):** algoritmo fijado por quien verifica (§3.1); llave con entropía real, nunca una contraseña (§3.5); validar `iss` y `sub` (§3.8) y `aud` (§3.9); tipado explícito (§3.11); reglas de validación mutuamente excluyentes entre tipos de token (§3.12).
- **Hoy** (según el respaldo en `docs/n8n-workflows/fase0/jwt-verify.js`, a confirmar contra el vivo):
  - El algoritmo está fijo de hecho, porque siempre recalcula HMAC-SHA256 y compara en tiempo constante.
  - **No se emiten ni validan `iss` ni `aud`.**
  - Los tokens sin `scopes` se aceptan como Finanzas (`finanzas:read`, `finanzas:write`) por compatibilidad. Eso choca con §3.12 si alguna vez dos emisores comparten secreto. Hoy no lo comparten (`SUITE_JWT_SECRET` y `FINANZAS_JWT_SECRET` son variables distintas).
  - Vida de 8 h, sin inactividad, sin revocación.
- **Diseño:**
  - Emitir `iss: "fts-suite"`, `aud: "fts-suite-web"`, `typ: "JWT"`, `jti`, `ver` (versión de credenciales del usuario), `acr` y `auth_time`.
  - El verificador exige `iss`, `aud` y `ver == suite_usuarios.ver`.
  - **Subir `ver` invalida todas las sesiones** de esa persona: se hace al cambiar contraseña, al reset de RH, al dar de baja y al quitar un factor.
  - Vida: 8 h máximo para nivel 1; para nivel 2, 24 h total y 1 h de inactividad (NIST §2.2.3); para nivel 3, 12 h y 15 min.
  - La inactividad la impone el servidor con un `ultimo_uso` por `jti` (tabla en `fts-suite-db`), no el navegador.
- **Dónde vive el token:** `localStorage` es legible por cualquier script del origen `yinyo1.github.io`, o sea **un XSS en cualquier página de la Suite se lleva el token** (y hoy también `ops_github_token` y `ops_sync_password`, ver R0).
  - Mitigaciones sin cambiar dominio: CSP estricta por página (`script-src` con hashes, sin `unsafe-inline` en las pantallas nuevas), vida corta, `ver`.
  - Una cookie `HttpOnly` exigiría que n8n y la página compartan sitio, y eso depende del dominio: queda para la decisión de dominio.
- **Referencia:** https://www.rfc-editor.org/rfc/rfc8725.html

**Reset por RH (A6).**
- **Norma:**
  - OWASP Forgot Password CS: token aleatorio de CSPRNG, guardado de forma segura (remite a Password Storage), un solo uso, expiración, aviso al usuario, sin login automático, invalidar sesiones.
  - **ASVS 5.0 6.4.1**: los secretos iniciales generados por el sistema son aleatorios, expiran pronto o al primer uso, y **no pueden quedarse como contraseña de largo plazo**.
- **Diseño:**
  - Temporal de ≥20 caracteres del CSPRNG, guardada **sólo con hash**, de un solo uso, que expira en 24 h.
  - `debe_cambiar_password=true` **bloquea** todo scope salvo el de cambio de contraseña. Hoy la bandera sólo pinta un aviso.
  - Sube `ver`, lo que cierra todas las sesiones.
  - Aviso a la persona por correo, sin la contraseña.
  - **RH ve la temporal una sola vez y nunca conoce la final.**
  - Se registra en bitácora: quién, a quién y cuándo.
- **Referencias:** https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html · ASVS V6

**Fuerza bruta y enumeración.**
- **Norma:** OWASP Authentication CS: mensaje genérico; el contador va **atado a la cuenta**, no a la IP; cuidar tiempo de respuesta y código HTTP. El límite por IP es buena práctica adicional, no viene de esa hoja.
- **Hoy:**
  - SuiteAuth: bloqueo de 5 fallos → 15 min por usuario en `staticData` y mensaje genérico. ✓
  - Falta un tope por IP, y el bloqueo por usuario permite que un tercero bloquee una cuenta conocida.
  - **El login clásico no necesita enumerarse: `users-suite.json` es público y trae usuarios, roles y hashes.** El mensaje genérico de P-02 no protege nada mientras ese archivo exista. **No se toca ahora**; se resuelve en C5/C6.
- **Referencia:** https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

**Sesiones (ASVS 5.0.0, V7.5 «Defenses Against Session Abuse»).**
- **Norma:** **7.5.1** pide reautenticación completa antes de cambiar factores o datos de recuperación. **7.5.2** pide que el usuario **vea y cierre sus sesiones activas**. Relacionados: 7.4.3 (cerrar las demás al cambiar un factor) y 7.4.5 (un admin cierra las sesiones de alguien).
- **Hoy:** nada de esto existe.
- **Diseño:** tabla de sesiones por `jti` en `fts-suite-db`. «Mi perfil › Seguridad» lista dispositivos y última actividad, con botón «cerrar». Configuración (A7) permite cerrar las de otra persona.
- **Referencia:** https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x16-V7-Session-Management.md

**Bitácora con alerta.**
- **Diseño:** `auth_eventos` en `fts-suite-db`: `ts_utc`, `actor`, `evento` (`login_ok`, `login_fallo`, `bloqueo`, `reset`, `cambio_password`, `cambio_scopes`, `mfa_enrolado`, `mfa_fallo`, `step_up`, `sesion_cerrada`), `ip`, `user_agent`, `detalle` (nunca contraseñas ni códigos).
- Escribe la bitácora el workflow de login y cada workflow que cambie identidad. Retención de 1 año fuera de n8n (los logs de n8n se podan a 14 días).
- **Alerta activa a Esteban** (correo vía Graph, ya existe la credencial) ante cualquiera de estos casos:
  - 10 o más fallos a una cuenta en 15 min;
  - fallos desde más de 3 IPs para la misma cuenta;
  - éxito después de un bloqueo;
  - cualquier `cambio_scopes` o reset;
  - login de un nivel 3 fuera de horario.
- La A8 (registro de uso) se construye **sobre esta tabla**, no aparte.

**Mínimo privilegio en credenciales técnicas.**
- Una credencial por consumidor, con lo mínimo:
  - Odoo: usuarios técnicos de lectura y de escritura.
  - GitHub: tokens fine-grained por repo y por permiso, con vencimiento.
  - Bases: un rol por app; nunca el dueño en uso diario.
  - Azure: `Mail.Send` acotada por Application Access Policy (ya existe).
- Plan concreto en `docs/seguridad/R0_SECRETOS.md` §5 y `docs/seguridad/R1_SUPERFICIE.md` §5.

**Cada control nuevo entra a una prueba.** El nivel MFA (P-14), C2 (P-15), `ver` (P-16: tras cambiar contraseña, el token viejo se rechaza), la lista de bloqueo (P-17: una contraseña filtrada se rechaza con motivo) y la bitácora (P-18: un login fallido deja un evento) se agregan a la Capa 2 o a pruebas del workflow **antes** de activarse. Ninguno puede quitarle acceso a alguien que hoy lo tiene sin que la matriz o la Capa 2 se pongan rojas.

## 10 · Orden por sesiones (actualizado el 15-oct-2026)

**Regla:** R0 y R1 van antes de cualquier fase A que toque producción. **Excepción demostrada:** A2 (catálogo) no toca producción, así que no depende de ellos y puede ir en paralelo. Las demás fases A sí dependen, por una razón concreta: A3 a A8 agregan pantallas y workflows de identidad **sobre el mismo origen donde hoy viven `ops_github_token` y `ops_sync_password`**. Construir identidad nueva con esos secretos todavía en el navegador es construir sobre una puerta abierta.

| Orden | Sesión | Qué toca | Prueba previa | Prueba posterior | Reversa | Clic |
|---|---|---|---|---|---|---|
| 1 | **R0-1** GitHub del navegador | tokens en GitHub (R0 §5) | listar tokens: nombre y fechas | Config Master escribe con el token nuevo; Capa 2 (P-01 ajustada a «sin token») | token nuevo | Esteban |
| 2 | **R0-2** Odoo: llaves por consumidor, revocar la del navegador | Odoo, credenciales n8n | captura de las API keys por usuario | ejecuciones de n8n en verde 24 h | llave nueva | Esteban |
| 3 | **C2** cerrar el ftsmaster de respaldo | `shared/auth-suite.js:60-102` + `index.html:218-228, 281` | **P-15 abierta** (hoy); confirmar que Esteban tiene `password_hash` en `users-suite.json` (sí: 64 caracteres) y entra por el camino normal | **P-15 con `C2_CERRADA=1` en verde**; P-01/P-02 iguales | revert | Esteban (merge) |
| 4 | **R0-3** contraseñas clásicas | `users-suite.json` vía Config Master | Capa 2 | Capa 2 | hash anterior del historial | Esteban |
| 5 | **R0-4** secret scanning + push protection + regla de `main` (sin bloquear los commits de n8n) | Settings del repo | inventario de quién empuja | push de prueba de n8n pasa | desactivar | Esteban |
| 6 | **R1-1** cerrar el proxy de Redis | Railway | métricas en 0 durante 7 días | webhooks contestan | re-crear proxy | Esteban |
| 7 | **R1-2** cerrar el proxy del Postgres de n8n | Railway | 24 h de tráfico público ≈ 0 | `/healthz` + 1 h de ejecuciones | re-crear proxy | Esteban, fuera de horario |
| 8 | **R1-5** n8n: imagen fija, 2FA, respaldo de `N8N_ENCRYPTION_KEY`, `n8n audit` | Railway, n8n | — | `/healthz` | imagen anterior | Esteban |
| 9 | **R1-3** tesorería: SSL obligatorio, borrar `TEMPORAL dueño`, roles | n8n, Postgres de tesorería | workflows por credencial | una ejecución por workflow | credencial anterior | Esteban |
| 10 | **R1-4** fts-mcp-odoo: usuario de lectura, `X-Forwarded-For`, doble secreto | repo fts-mcp-odoo, Odoo, Railway | pruebas del repo | Claude se conecta | redeploy anterior | Esteban |
| 11 | **R0-5 / R0-6** IA y HMAC del PMO | proveedores, n8n | ¿quién usa IPERC IA y Análisis estructural? | pantallas dicen «sin llave» | llave nueva | Esteban |
| 12 | **R1-6** restauración probada + respaldo fuera de Railway | Railway | — | conteo de filas igual | borrar el desechable | Esteban |
| — | **A2** catálogo (con `nivel_minimo` de MFA, §MFA 2) | no | gate | gate | borrar archivo | — (puede ir en paralelo) |
| 13 | **A3** interruptores | una etiqueta por página + workflow | Capa 2 | Capa 2 idéntica con todo apagado | quitar etiqueta | Esteban |
| 14 | **A4** sembrar espejo (por Claude, MCP, read-back y valor anterior en el PR) | `suite_usuarios` | re-leer y correr matriz | matriz con datos vivos | quitar lo agregado | Esteban aprueba |
| 15 | **A5** Mi perfil › Seguridad (+ política NIST, HIBP, `ver`) | workflow + columnas | Capa 2 | P-16, P-17 | interruptor | Esteban |
| 16 | **Bitácora** `auth_eventos` + alertas | `fts-suite-db` + workflows | — | P-18 | interruptor | Esteban |
| 17 | **MFA-1** decisión Entra ID / TOTP (pregunta de licencia, MFA §7) | — | — | — | — | Esteban |
| 18 | **MFA-2** nivel 3 para **Esteban** (Entra + FIDO2, o lo que se decida) | login + verificador | Capa 2 | P-14 | interruptor | Esteban |
| 19 | **A7** Configuración: **lectura** | página | Capa 2 | Capa 2 | interruptor | Esteban |
| 20 | **A7** Configuración: **escritura de permisos**, sólo con nivel 3 + step-up | workflow | P-14 | P-14 + read-back | interruptor | Esteban |
| 21 | **A6** temporal de RH (ASVS 6.4.1) | workflow | — | P-16 | interruptor | Esteban |
| 22 | **A8** aviso + tablero (sobre la bitácora) | página | — | — | interruptor | Esteban |
| — | B1–B4 y C1, C3–C8 como en §6 | | | | | |

**Por qué C2 tan pronto:** P-15 demuestra que hoy, si `users-suite.json` no carga (GitHub caído, bloqueo de red, CDN), cualquiera puede «activar» la cuenta master con 6 caracteres. Retirarlo **no le quita acceso a nadie**: Esteban tiene `password_hash` y entra por el camino normal (P-01). El único efecto es que, con GitHub caído, **nadie** entra al clásico, tampoco el master. Hoy los demás ya no entran en ese caso, porque `getDefaultUsers` sólo trae a `ftsmaster`. Es el riesgo que se acepta, y se dice.

**Por qué MFA nivel 3 de Esteban antes de A7-escritura:** quien escriba permisos tiene en sus manos todos los accesos. ASVS 7.5.3 (L3) pide autenticación adicional antes de operaciones muy sensibles.

### 10.4 · C8 ajustada: repo privado no es página privada

GitHub lo dice textual: «GitHub Pages sites are publicly available on the internet, even if the repository for the site is private». En GitHub Free, además, Pages **sólo funciona con repos públicos**; publicar en privado requiere Enterprise Cloud.

C8 deja de presentarse como «privacidad de la Suite». Es **protección de código y de secretos**, y vale la pena por eso. La privacidad real de lo que la Suite muestra depende del **login personal y de que cada webhook exija el token (#390)**. C8 queda condicionada a una decisión que hoy está fuera de alcance: dónde se publica la Suite si el repo deja de ser público.
