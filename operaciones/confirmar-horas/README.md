# Módulo «Confirmar Horas» (Carga MO — B4)

Panel para que **Felipe Pérez (Supervisor Operaciones)** y **ftsmaster** revisen
las horas reales de los operativos (por rango de fechas, default = ayer),
**confirmen** las horas y **corrijan la SO** cuando esté mal o falte.

Es el bloque **B4** de la Fase 1 de Carga de Mano de Obra
(ver `docs/operaciones/FASE1_CARGA_MO_PLAN.md`). **No toca dinero** (ni
`analytic.line`, ni budgets): solo marca la aprobación del manager y corrige el
enlace SO del attendance.

## Acceso
Gate en `js/confirmar-horas.js`: `FTSAuth` + (`role === 'master'` ó
`username === 'felipe.perez'`). La tarjeta en `operaciones/index.html` es visible
para todos, pero la página deniega a quien no sea Felipe/master.

## Estructura
| Archivo | Rol |
|---|---|
| `index.html` | UI (topbar + rango + tabla + modal SO), CSS inline |
| `js/confirmar-horas.js` | auth gate, carga, confirmar, corregir SO |

## Workflows n8n (creados INACTIVOS — activar en UI antes de usar)
| Workflow | ID | Endpoint | Qué hace |
|---|---|---|---|
| `planeacion/horas-dia (B4 lectura)` | `pQ3vVbRkMYvfICQf` | `POST /webhook/planeacion/horas-dia` | SEARCH `hr.attendance` dept Operaciones (3) en rango CST → filas empleado×SO×horas+estado. **Read-only.** |
| `planeacion/confirmar-horas (B4 update)` | `7D3lgaYmH2DmqCWy` | `POST /webhook/planeacion/confirmar-horas` | UPDATE `hr.attendance`: `x_studio_manager_approval=true` (`action:confirm`) y/o `x_studio_sales_order_2=so_id` (`action:correct_so`) + nota al chatter (author auto). **Escribe a producción.** |

Ambos usan credencial Odoo `Wansi69xesEqEiY1` (`Odoo FTS`). La lista de SO para
corregir reusa `POST /webhook/kiosk/sos`.

## Contratos
- **horas-dia** → body `{ fecha_desde:"YYYY-MM-DD", fecha_hasta?, dept_id?=3 }`
  → `{ success, count, rows:[{ attendance_id, empleado_id, empleado_nombre,
  check_in_cst, check_out_cst, abierta, worked_hours, so_id, so_nombre,
  confirmado, en_disputa, out_mode }] }`.
- **confirmar-horas** → body `{ attendance_id, action:"confirm"|"correct_so",
  so_id?, supervisor_nombre? }` → `{ success, attendance_id, manager_approval, so_id }`.

## Checklist de deploy (Esteban)
1. **Activar** en la UI de n8n los 2 workflows (el API MCP no activa; hay que hacerlo a mano).
2. Validar en browser: entrar como Felipe/master a `operaciones/confirmar-horas/`,
   cargar "ayer", confirmar 1 registro y corregir 1 SO. Verificar en Odoo que
   el attendance quedó con `x_studio_manager_approval=true` (y la SO corregida) + nota en chatter.
3. **Reset de los 75 `x_studio_manager_approval=true` históricos** (decisión D2):
   correr **una sola vez** un workflow one-shot que ponga `manager_approval=false`
   en los attendances viejos, **NO vía MCP** (que es read-only). Junto al go-live de B4.
4. HMAC de los 2 webhoooks nuevos: pendiente (ver `CLAUDE.md §9`).

## Notas / límites v1
- **Plan vs real:** la columna "plan" llega en Fase 1 B1/B2 (`planning.slot`).
  B4 v1 muestra solo lo **real** (attendance) + confirmar/corregir. Sin dependencia de B1.
- Solo dept **Operaciones (3)** por default (`dept_id` override en el body).
- La UI muestra éxito **solo tras el OK del POST** (anti-patrón Hallazgo #15).
- Validación n8n marca 1 "error" en el nodo Webhook (`responseNode` sin `onError`):
  **falso positivo** — patrón idéntico al productivo `panel/derivar-roles`.
