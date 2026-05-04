\# FTS Suite — Reglas para Claude Code



Este archivo es leído automáticamente por Claude Code en cada sesión dentro del repo `fts-suite`. Documenta arquitectura, workflows productivos, patterns validados, y reglas críticas que evitan repetir bugs ya resueltos.



\---



\## 1. Contexto del producto



\*\*FTS Suite\*\* es la plataforma interna de Servicios FTS SA de CV (industrial CAPEX/EPC, Monterrey). Stack:



\- \*\*Frontend:\*\* GitHub Pages (este repo `yinyo1/fts-suite`), HTML+JS modular sin framework

\- \*\*Backend lógica:\*\* n8n en Railway (URL `https://primary-production-5c3c.up.railway.app`)

\- \*\*ERP:\*\* Odoo 19 SaaS Enterprise (`https://serviciosfts.odoo.com`), multi-tenant, sin SSH/SQL/módulos custom

\- \*\*Storage:\*\* JSON files en el propio repo (fase 1) más Odoo como source of truth



Idiomas del repo: español para UI/textos, inglés para variables/funciones de código.



\---



\## 2. Workflows n8n productivos (10 activos)



\*\*No tocar sin avisar al usuario.\*\* Cualquier modificación a estos requiere validar primero con `n8n\_validate\_workflow` y mostrar diff antes de aplicar.



| ID | Nombre | Versión | Notas |

|---|---|---|---|

| `xVNp36` | incidencias/crear-olvido-entrada | actual | En desarrollo activo (Bloque A.1) |

| `0L0y2X` | incidencias/resolver | actual | Aprobaciones supervisor → RH |

| `TpzfwM` | asistencias/admin | actual | Consultas admin |

| `2KETi7` | accesos-incidencias/guardar | v2.2 auth-fix | Auth + persistencia |

| `GtXq5y` | kiosk/empleados | v3.1 | Lookup de empleados pre-checkin |

| `zvomXs` | kiosk/checkin | v4.2 fix respuesta | \*\*Núcleo del kiosk\*\* |

| `QInz3H` | kiosk/cerrar-registro | v2.0 | Cierre manual (humano) |

| `KgDQ8Y` | kiosk/estado-empleado | v3 Fase 1 | Estado actual del empleado |

| `IfqHep` | dashboard/resumen | v4.3 | KPIs operación |

| `zYPwJF` | kiosk/sos | v3.4 | Botón pánico + Bloque B incidentes |



\*\*Workflows archivados (21):\*\* ignorar a menos que el usuario lo pida explícitamente para historial.



\*\*Workflows huérfanos INACTIVOS sin uso (3):\*\* `2padPo` incidencias/push, `flXTeF` kiosk/crear-entrada-estimada, `CJdJzP` kiosk/aprobar-ajuste. Candidatos a archivar.



\---



\## 3. Reglas n8n validadas (no las descubras de nuevo)



Estas reglas vienen de horas de debug. Aplicarlas siempre.



\### IF nodes

\- `typeValidation` siempre en `"loose"`. Sin esto, comparaciones tipo `value === "true"` fallan silencio.



\### Nodo Odoo (community node v2.16.1)

\- \*\*CREATE:\*\* sin `operation` explícito, usar `fieldsToCreateOrUpdate`.

\- \*\*UPDATE:\*\* `"operation": "update"` + `customResourceId`.

\- \*\*READ/SEARCH:\*\* usar `filterRequest` (no `filters`), `value` (no `fieldValue`), `fieldsList` como ARRAY (no CSV string).

\- \*\*"Always Output Data":\*\* debe estar en \*\*ON\*\*. En OFF causa fallo silencioso del workflow completo (gravísimo, ya pasó).

\- \*\*Bug conocido:\*\* después de importar workflow JSON, el campo `customResource` queda en blanco. Hay que llenarlo manualmente en la UI antes de activar.

\- \*\*Expresiones Odoo:\*\* un solo `=` (`={{ }}`) — NO doble `==`. Doble es bug clásico.



\### Code nodes (JS)

\- Usar `.first()` no `.item` (cambio de v0.x a v1.x).

\- Para múltiples items, `$input.all()` retorna array.



\### GitHub writes

\- NO usar el native GitHub node. Usa \*\*HTTP Request\*\* con Header Auth llamado `"GitHub FTS Suite"`. El native node tiene bugs con archivos binarios y commits batch.

\- API endpoint: `https://api.github.com/repos/yinyo1/fts-suite/contents/{path}`.



\### Credenciales en n8n

\- Odoo credential: `'Odoo FTS'` (ID `Wansi69xesEqEiY1`).

\- GitHub credential: `'GitHub FTS Suite'` Header Auth.



\### Tras importar JSON

Siempre revisar y rellenar a mano:

1\. `customResource` en nodos Odoo

2\. Credential en cada nodo (a veces se desasigna)

3\. Webhook IDs (n8n los regenera)



\---



\## 4. Reglas Odoo



\### Plataforma

\- \*\*Odoo 19 SaaS\*\* — sin acceso SSH ni SQL directo.

\- API: XML-RPC y JSON-RPC (preferir JSON-RPC).

\- API key: pedirla al usuario, \*\*nunca hardcodear\*\*.



\### Modelos críticos

\- \*\*`hr.employee`:\*\* Felipe Pérez Guzmán = ID \*\*112\*\* (no 102, ese es bug histórico).

\- \*\*`hr.attendance`:\*\* campo SO link es `x\_studio\_sales\_order\_2` (renombrado desde `x\_studio\_many2one\_field\_wyDLM`).

\- \*\*`account.analytic.line`:\*\* Odoo 19 usa `analytic\_distribution` (no `analytic\_account\_id` como en v16).

\- \*\*`resource.calendar`:\*\* debe excluir tipo `lunch` para cálculo correcto de horas trabajadas.



\### Reglas de negocio (LFT)

\- 48 hrs/semana pagadas Mon-Fri.

\- Por día: 10.1 hrs presencia = 9.6 hrs pagadas + 0.5 hr lunch sin paga (Art. 63-64 LFT).

\- Overtime: después de 9.6 hrs netas/día.

\- Quincena base: 96 hrs.

\- Mensual base: \~208 hrs (para `hourly\_cost`).



\### Auto-cierre attendance (Bloque B en construcción)

\- Si >12 hrs sin `check\_out` → auto-cerrar a 9.6 hrs, flag `auto\_cierre\_pendiente`.

\- Crea incidencia `auto\_cierre\_pendiente` con flag `autoincidencia`, salta supervisor, va directo a RH (Ana Laura Acevedo).

\- Notificaciones WhatsApp/email: 8pm, 10pm, 2am.

\- Cron 2am.



\### Geo

\- Radio aceptado: 100 metros del punto de checkin asignado.



\---



\## 5. Cross-reference FTS Suite ↔ Odoo



`FTSAuth.setSession` contiene: `userId`, `username`, `nombre`, `role`, `modulos`, `loginTime`, `lastActivity`. \*\*NO contiene Odoo `empleado\_id`.\*\*



Para mapear FTS user → Odoo employee:

1\. Leer `accesos-panel-incidencias.json` del repo.

2\. Match por `username`.

3\. Obtener `odoo\_employee\_id` desde ese JSON.



Pendiente F4: usar este mapeo al guardar planes operativos.



\---



\## 6. Roadmap activo (Bloques A-E)



\### Bloque A — Tech debt (4 hrs)

\- A.1: workflow `crear-olvido-entrada` agregar lookup `department\_id`

\- A.2: PIN+selfie como 2do factor en RH module

\- A.3: cache fix raw → api.github en `seguridad/index.html`, `seguridad/iperc/iperc-config.js`, `seguridad/js/videos.js`, `ingenieria/analisis-estructural/version.json`

\- A.4: audit workflows con campo viejo `x\_studio\_many2one\_field\_wyDLM`

\- A.6: kiosk distinguir "nunca checó hoy" vs "ya cerró su día" (mostrar último checkout)

\- A.7+A.8: banner persistente en SO selection, confirmación back/close

\- A.9: hotfix `olvido\_checkout` permite hora libre con incidencia auto



\### Bloque B — 24/7 ops (5 hrs)

\- Auto-cierre cron 2am

\- Notificaciones escalonadas

\- Status-change notifications



\### Bloque C — Mi Nómina (10 hrs)

\- Quitar contador acumulado de kiosk pre-checkin

\- Card "Mi Semana" en Mi Perfil

\- Botón "Nueva Incidencia" multi-tipo



\### Bloque D — Project costing (6 hrs)

\- Validar SO capture en checkout

\- Reporte labor cost/proyecto

\- CAPEX dashboard



\### Bloque E — Planning vs execution (13 hrs)

\- `resource.calendar` base por persona/rol

\- App planning operativo

\- Auto-aprobación HE solo si dentro de plan



\### Bloque F — Incidencias rediseño (28-abr)

\- F1: fix `olvido\_checkout` 1.5h (en curso)

\- 27 legacy se cierran en bloque manual

\- Selfie en TODOS los 5 tipos pro-activos

\- Naming: `permiso\_con\_goce` / `permiso\_sin\_goce`

\- HE requiere pre-aprobación en plan operativo



\---



\## 7. Naming conventions



\### Workflows n8n

\- Estable: `kiosk/checkin`, `incidencias/resolver`. Sin versión en el nombre.

\- Versionado va en tags y descripción del workflow, no en el nombre.

\- Si hay refactor mayor, archivar viejo + crear nuevo con sufijo `-v2`.



\### Incidencias

\- `olvido\_entrada`, `olvido\_checkout`, `vacaciones`, `permiso\_con\_goce`, `permiso\_sin\_goce`, `he\_autorizacion\_previa`, `incapacidad\_medica`, `tiempo\_extra`, `auto\_cierre\_pendiente`, `so\_faltante`, `sos`.



\### Departamentos zombies (NO usar)

`Administration`, `Ops YIN`, `Management`, `PMO`, `R\&D`. Estos están en Odoo pero no son productivos.



\---



\## 8. Estilo de comunicación esperado



\- \*\*Antes de modificar workflows productivos:\*\* mostrar diff y pedir confirmación.

\- \*\*Antes de tocar Odoo (cuando agreguemos su MCP):\*\* preview no destructivo primero.

\- \*\*Después de cada cambio:\*\* dejar resumen con archivos tocados, IDs de workflows modificados, y siguiente paso sugerido.

\- \*\*No usar lenguaje IA-ish\*\* en outputs externos (correos a clientes, mensajes a empleados). Tono directo, ejecutivo, español MX.

\- \*\*Confirmación entre etapas:\*\* Esteban prefiere validar entre fase y fase, no batches grandes.



\---



\## 9. Información sensible



\- \*\*Nunca\*\* commitear API keys, tokens, ni credenciales en el repo.

\- Si se detecta una credencial hardcoded, \*\*alertar inmediatamente\*\* y mover a env var de n8n.

\- Webhook secrets HMAC: pendientes de implementar (Bloque A pending).



\---



\## 10. Personas clave



\- \*\*Esteban De La Cruz Calderón\*\* — CEO/founder, decisor final

\- \*\*Felipe Pérez Guzmán\*\* — Operations Manager (Odoo `hr.employee` ID 112)

\- \*\*Mateo Salazar\*\* — Senior Supervisor

\- \*\*Ricardo Hernández\*\* — PMO

\- \*\*Gibrán Solís\*\* — Supply Chain

\- \*\*Ana Laura Acevedo\*\* — HR (recibe escalaciones de incidencias auto)

\- \*\*Magaly Pérez\*\* — Legal

\- \*\*Gerardo Lozano\*\* — Accounting

\- \*\*Francisco Montalvo\*\* — Senior Ops

