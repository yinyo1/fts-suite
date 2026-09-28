# Verificaciones en la suite (bloque 5, sesión nocturna 1, #330)

Solo lectura. Medido el 2026-09-28 de madrugada (CST), fuera de horario hábil. Personas solo por rol o `emp-<id>-<rol>`.

## 1. `planeacion/guardar`

| Dato | Valor | Fuente |
|---|---|---|
| Workflow | `planeacion/guardar (B1 upsert planning.slot)`, id `IDzF71h0f1EYHVhH` | `search_workflows` del MCP n8n, 2026-09-28 |
| Activo | sí (`active: true`, `triggerCount: 1`) | misma lectura |
| Creado / última edición | 2026-07-06 20:55 UTC / 2026-07-06 21:40 UTC | misma lectura |
| Lectura del plan | `planeacion/dia (B2)`, id `3NjfelLFVcIWOe9N`, activo | misma lectura |
| Quién lo llama | `operaciones/planeacion/js/planeacion.js` (botón "Publicar (guardar plan)", L575 y L634) y el kiosko lee el plan con `operaciones/kiosk/js/odoo.js` L56 | `git grep` en la rama |
| Planes guardados | **no medido hoy.** Los dos workflows tienen `availableInMCP: false` (no se pueden leer ni listar sus ejecuciones) y `planning.slot` está fuera de la allowlist del MCP de Odoo. El último conteo escrito es de 133 slots en `docs/operaciones/PARSER_V2.md` (sección "De la planeación"), sin fecha de corte | intento de lectura, errores textuales abajo |

Errores textuales de los intentos:
```
get_workflow_details(IDzF71h0f1EYHVhH)  -> Workflow is not available in MCP
search_workflow_executions(...)         -> Workflow is not available in MCP
odoo_agrupar(planning.slot)             -> modelo fuera de la allowlist: planning.slot
```

Conclusión: el workflow **existe y está activo**, así que no hay que especificarlo desde cero. Lo que falta para Herramientas MX es poder medir si se usa. Para medirlo sin escribir nada: (a) prender `availableInMCP` en los dos workflows (un clic en la tarjeta del workflow), o (b) agregar `planning.slot` a la allowlist de lectura del MCP de Odoo. Con cualquiera de los dos se cuenta slots por semana y por proyecto.

Dato stale encontrado: `docs/finanzas/DIAGNOSTICO_CARGA_MO.md` L178 dice "F4 (backend `/planeacion/guardar`) NO EXISTE". Ya existe desde el 6 de julio.

## 2. Cobertura de `x_studio_project_id` en `hr.attendance`

Ventana: `check_in >= 2026-06-29` (13 semanas, 1,727 asistencias). Instrumento: `odoo_agrupar` del MCP FTS Odoo.

### Por departamento

| Departamento | Asistencias | Con proyecto | Solo bolsa (sin proyecto) | Cobertura de proyecto |
|---|---|---|---|---|
| Operaciones | 1,009 | 766 | 243 | 75.9 % |
| Comercial | 329 | 21 | 302 | 6.4 % |
| Administración y Finanzas | 188 | 3 | 183 | 1.6 % |
| Recursos Humanos | 139 | 1 | 138 | 0.7 % |
| Legal | 57 | 1 | 56 | 1.8 % |
| Ingeniería | 3 | 3 | 0 | 100 % |
| Dirección | 2 | 0 | 2 | 0 % |
| **Total** | **1,727** | **795** | **924** | **46.0 %** |

Sin proyecto y sin bolsa: 1,727 − 795 − 924 = **8**.

Los departamentos de oficina van a bolsa por diseño; el 46 % global no es la cifra que importa. La que importa es la de Operaciones.

### Operaciones por semana

| Semana (domingo) | Asistencias | Con proyecto | Cobertura |
|---|---|---|---|
| 2026-06-28 | 86 | 76 | 88 % |
| 2026-07-05 | 80 | 73 | 91 % |
| 2026-07-12 | 87 | 69 | 79 % |
| 2026-07-19 | 81 | 67 | 83 % |
| 2026-07-26 | 82 | 66 | 80 % |
| 2026-08-02 | 62 | 44 | 71 % |
| 2026-08-09 | 73 | 50 | 68 % |
| 2026-08-16 | 79 | 57 | 72 % |
| 2026-08-23 | 76 | 50 | 66 % |
| 2026-08-30 | 77 | 51 | 66 % |
| 2026-09-06 | 81 | 60 | 74 % |
| 2026-09-13 | 63 | 47 | 75 % |
| 2026-09-20 | 82 | 56 | 68 % |

### De dónde sale el hueco de Operaciones

Las 243 asistencias de Operaciones sin proyecto van **todas** a una sola bolsa, "ADMIN DE OPERACIONES" (cuenta 3096). Por persona:

| Quién | Asistencias sin proyecto |
|---|---|
| emp-62-supply_chain | 58 |
| emp-112-manager_operaciones | 57 |
| emp-154-chofer | 56 |
| emp-68-operaciones | 42 |
| otros 8 técnicos y supervisores, juntos | 30 |
| **Total** | **243** |

Esos cuatro roles suman 246 asistencias en la ventana, 213 de ellas sin proyecto (19 a 20 por semana, estable).

**Cobertura del personal de campo** (Operaciones sin esos cuatro roles): 1,009 − 246 = 763 asistencias, 763 − 30 = 733 con proyecto = **96.1 %**.

Cálculo: (1,009 − 246 − 30) / (1,009 − 246) = 733 / 763 = 0.961.

O sea: la caída semanal de 88 % a 68 % no es que los técnicos dejaran de capturar proyecto; es que la plantilla de campo bajó (de ~66 a ~45-60 por semana) mientras los cuatro roles de oficina de Operaciones siguen en ~19 por semana a bolsa.

### Propuesta para subirla

1. **Medir a quien importa.** Para Herramientas MX, el indicador es la cobertura del personal de campo (96 %), no la de Operaciones completa. Marcar a los cuatro roles con `x_studio_solo_bolsa` (ya existe) y excluirlos del denominador.
2. **Los 30 de campo (unas 2 por semana):** el kiosko ya lee el plan del día (`planeacion/dia`). Si el plan tiene proyecto, preseleccionarlo al checar; si no hay plan, dejar la bolsa y que Confirmar Horas lo corrija. Costo estimado: 1 a 2 h en el kiosko, sin tocar workflows.
3. **Chofer y supply chain sí van a plantas.** Su asistencia a bolsa pierde el rastro de dónde estuvieron, y son justo quienes mueven carritos. Para Herramientas MX no se propone cambiar su asistencia: el movimiento del carrito se registra en la app (escaneo de QR al entregar y al recoger), que es más preciso que la asistencia.
4. **No usar `x_studio_sales_order_2` para nada de esto** (#326): trae el id del proyecto dentro de un many2one a `sale.order`.

## 3. Hallazgos para corregir en la suite (issue #337)

1. `shared/public-config.json` L14: una geocerca con nombre de persona y coordenadas de su casa ("(prueba)"). Dato personal en repo público, preexistente en `main`.
2. `modulos/rh/nomina-incidencias/js/nom-client.js` L140-141: datos de ejemplo con nombre completo de empleados, id de asistencia, fecha y folio de incidencia reales. Dato personal en repo público, preexistente.
3. `planeacion/guardar` y `planeacion/dia` con `availableInMCP: false`, y `planning.slot` fuera de la allowlist del MCP de Odoo: no se puede auditar el uso del plan.
4. `docs/finanzas/DIAGNOSTICO_CARGA_MO.md` L178 stale (dice que `planeacion/guardar` no existe).
5. El MCP de Odoo, en `odoo_agrupar` con `groupby check_in:week`, imprime "N de N registros no tienen check_in:week asignado" aunque todos los grupos traen valor. Es un aviso falso del instrumento (§20 #19 de CLAUDE.md).
6. #326 sigue abierto: `x_studio_sales_order_2` con id de proyecto.
