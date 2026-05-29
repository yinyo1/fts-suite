# Sprint Resiliencia — PR E: Cron auto-cierre 2am

> **Estado:** STUB — especificación a alto nivel. **Diseño detallado pendiente próxima iteración.**
> **Independiente** de PR D / C / B. Ya estaba en el roadmap original como **Bloque B** (cron 2am).
> **Autor:** Claude Code · 28-may-2026.

---

## Contexto y justificación

El recovery actual del kiosk es **100% reactivo**: el auto-rescate (F1.5) solo se dispara cuando el empleado **vuelve a checar**. Esto deja un agujero: **quien no regresa, nunca se sanea.**

El 27-may lo demostró. De los 23 orphans:
- 21 se cerraron al día siguiente porque los empleados volvieron.
- **2 siguen abiertos** (Mario 116, Enoc 128) — no regresaron.
- Más **Ricardo 98** (orphan preexistente del 26-may, mismo patrón) — tampoco volvió.

Sin un barrido proactivo, estos orphans quedan abiertos **indefinidamente** hasta que RH los detecta y corrige a mano. Para nómina, un attendance abierto sin límite es un agujero de datos.

**PR E = la red de seguridad nocturna que falta.** Complementa a PR C: el queue offline preserva el dato de quien vuelve; el cron 2am cierra el de quien no.

## Hallazgos del forense que lo justifican (`docs/INCIDENTES/2026-05-27-...md`)

1. El umbral de auto-rescate (>16h) es **reactivo al check-in** — no hay barrido proactivo.
2. El cron 2am está documentado como **pendiente** (CLAUDE.md §4 "Auto-cierre Bloque B en construcción") desde antes del incidente.
3. Patrón confirmado: 3 empleados (Mario, Enoc, Ricardo) quedaron con orphan permanente exactamente por la ausencia de este cron.
4. El inventario de orphans abiertos pre-27-may era limpio (solo Ricardo) — un cron evita que crezca.

## Especificación a alto nivel

- **Trigger:** Schedule (`0 2 * * *` — 2:00 AM CST diario). *(Nota: validar TZ del Schedule Trigger en n8n; el cron de `rh/empleados-master/sync` ya usa 6am CST como referencia.)*
- **Query:** Odoo SEARCH `hr.attendance` con `check_out = false` y `check_in` con antigüedad > umbral (ej. > 16h, alineado con el umbral reactivo existente para no chocar).
- **Por cada orphan:**
  1. Cerrar a `check_in + 9.6h` (jornada estándar LFT, mismo cálculo que el auto-rescate reactivo).
  2. Escribir TAGs `x_studio_horario_en_disputa = true` + `x_studio_incidencia_pendiente_id`.
  3. Crear incidencia `auto_cierre_pendiente` con `estado: pendiente_rh`, `autoincidencia: true`, `tag_disputa_activo: true` → va directo a Ana Laura (salta supervisor).
  4. Escribir al archivo correcto: `shared/incidencias-asistencia.json` (schema F2.1+), **no** al legacy `incidencias.json` (lección hallazgo #12 sub-bug #2).
- **Reusar** la lógica del nodo `Odoo - UPDATE Auto-rescate Close` + `Code - Prep Incidencia` ya existentes en `kiosk/checkin` (`a7mEjjdwIzzvomXs`) — mismo patrón, distinto disparador. Idealmente extraer a un sub-workflow compartido para no duplicar el cálculo +9.6h.

## Consideraciones de diseño (a resolver en la iteración detallada)

1. **Umbral de antigüedad:** ¿>16h (igual que reactivo) o un valor específico nocturno? Cuidado con turnos T2 nocturnos legítimos (Vie 22:30 → Sáb 07:00) — el umbral 16h ya se eligió para no falsear esos (hallazgo #12).
2. **Reconciliación con PR C:** si un checkout quedó encolado offline (`ts_evento` real) y el cron 2am cierra el mismo attendance a +9.6h antes del replay → conflicto. Definir prioridad: el `ts_evento` real debería ganar sobre el +9.6h estimado. Coordinar con PR C §3.3.
3. **Notificaciones escalonadas (roadmap Bloque B):** 8pm / 10pm / 2am — fuera del MVP del cron, pero el doc original las menciona.
4. **Idempotencia:** el cron no debe re-cerrar un attendance ya cerrado ni duplicar incidencia si corre dos veces.

## Independencia y dependencias

- **Independiente** de D / C / B — puede implementarse en cualquier momento.
- **Sinergia con PR C:** juntos cubren el 100% de los casos de outage (vuelve → queue; no vuelve → cron).
- Reusa infra existente del workflow `a7mEjjdwIzzvomXs` (nodos de auto-rescate) + schema F2.1+ de incidencias.

## Estimación

~5h CC (diseño detallado + workflow n8n nuevo o sub-workflow + tests con orphan sembrado). Sin trabajo de Esteban más allá de validar.

---

> **Diseño detallado pendiente** — este stub fija el alcance y la justificación. La iteración detallada definirá nodos exactos, manejo de TZ del Schedule Trigger, reconciliación con PR C, e idempotencia.
