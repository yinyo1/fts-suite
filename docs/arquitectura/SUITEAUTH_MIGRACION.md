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

**Capa 2 · navegador** (se construye en A1): Playwright sirviendo el repo local (Pages no es alcanzable desde el contenedor, CLAUDE.md §9), interceptando `users-suite.json` y los webhooks, y sembrando cada sesión. Para cada persona de la matriz y cada objetivo, abre la página y lee el resultado real del DOM (tarjeta atenuada/oculta, redirección, overlay). La salida se compara contra la Capa 1: si el navegador y el modelo no coinciden, el modelo está mal.

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
| C8 | Repo privado | ver §7: rompe Pages, el raw y lo que n8n lee de `main` | **casi irreversible**; decisión aparte |

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

1. **¿`ftsmaster` lo usa sólo Esteban?** Si hay alguien más, necesita cuenta Suite antes de C.
2. **Tere y Carolina** sólo tienen permiso del kiosko (no medí qué usan de verdad). ¿Se quedan en el clásico hasta el plan del kiosko (mi recomendación) o se les crea cuenta Suite desde ahora?
3. **¿Arranco con A1 (pruebas de navegador) como siguiente sesión?** Es la única que no toca producción y sin ella las demás no se pueden verificar.
4. **A4 escribe a `suite_usuarios`.** ¿La hago yo por MCP con read-back, o prefieres hacerla tú en la UI?
