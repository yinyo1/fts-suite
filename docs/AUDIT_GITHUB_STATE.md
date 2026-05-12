# Audit GitHub State — Repo yinyo1/fts-suite

**Fecha:** 2026-05-11 ~16:00 CST
**Repo:** https://github.com/yinyo1/fts-suite
**Default branch:** `main` @ `f148b78`

---

## 1. Resumen ejecutivo

🔴 **El fix F1.5 NO está en producción.** GitHub Pages sirve `kiosk.js` y `public-config.json` SIN los cambios del sprint. Ricardo + Héctor siguen bloqueados porque la branch `feature/sprint-f1.5-topochico-y-checkout-bloqueado` nunca se mergeó y no tiene PR abierto.

🟡 **PR #3 (`feat/kiosk-error-handling`) sigue abierto desde 2026-04-20** (21 días). 1 commit, 295 commits behind main, mergeable=dirty (conflicts). Toca solo `kiosk.js`. Su premise (backend emite `accion_valida`) sigue válida pero está parcialmente integrada en main.

🟢 **Solo 1 PR open en todo el repo** — PR #3. Las 28 PRs de 2026-05-10/11 (website iter 2-23) ya están todas merged a main.

🟢 **F1.5 branch sin conflictos** con main según `git merge-tree` (a pesar de estar 38 commits behind por el burst de PRs del website).

⚡ **Decisiones urgentes:**
1. Abrir PR de F1.5 + merge (desbloquea Ricardo/Héctor en producción a ~95s de deploy GH Pages).
2. Cerrar o rebase PR #3 (decisión tuya — sigue siendo valor real pero conflicts).
3. Limpiar 28 branches stale del website iter (ya merged, ramas huérfanas en remote).

---

## 2. Tabla PRs

### PRs abiertos

| # | Título | Branch | Edad | Conflicts | Toca kiosk.js | Recomendación |
|---|---|---|---|---|---|---|
| **#3** | feat(kiosk): hardening de manejo de errores | `feat/kiosk-error-handling` | 21 días | ✅ Sí (dirty) | ✅ +36 / −11 | **Rebase contra main** y revalidar. Premise sigue válida — 3 anti-patrones de UX siguen sin fixear en main: silent catch (line 903-907), missing "unexpected response shape" branch, falta `mostrarErrorCandado` en exception. Si vas a rebase: 295 commits behind, hazlo después de mergear F1.5 para evitar doble rebase. |

**Solo hay 1 PR abierto.** Los otros 28 PRs (#1-#29 minus #3) están todos cerrados (28 merged, 0 closed-without-merge).

### Burst de PRs hoy 2026-05-11

28 PRs merged hoy entre 22:41 (anoche) y 07:41 (esta mañana) — todos del website mockup (`claude/fts-website-iter-*` + `claude/fts-website-setup-3Llci`). NO tocan archivos del kiosk/asistencia/módulo operacional. **NO interfieren con F1.5.**

---

## 3. Branches activas con commits únicos

| Branch | Ahead | Behind | Última commit | PR | Recomendación |
|---|---|---|---|---|---|
| `feature/sprint-f1.5-topochico-y-checkout-bloqueado` | **3** | 38 | 2026-05-11 (Esteban) | **NO ABIERTO** | 🔴 Abrir PR ya — sin conflicts según `merge-tree`. Resuelve Ricardo/Héctor bloqueados. |
| `feat/kiosk-error-handling` | 1 | 295 | (stale 21d) | #3 abierto | 🟡 Decidir: rebase + reintentar merge, o cerrar y reimplementar. |
| `claude/fts-website-setup-3Llci` | 1 | 21 | 2026-05-10 | #12 (merged) | 🟢 Borrar (PR #12 ya merged) |
| `claude/init-fts-suite-hUJhn` | 1 | 676 | (muy stale) | #1 + #2 (merged) | 🟢 Borrar (orígenes ya mergeados via squash) |

### Branches ya mergeadas, candidatas a borrado en remote

23 branches `claude/fts-website-iter-*` (PRs #13-#29 ya merged). Cleanup masivo recomendado: `git push origin --delete <branch>`. No bloquean nada, solo ruido en `git fetch`.

10 branches `feat/*` y `fix/*` viejas (`kiosk-pin`, `kiosk-ui`, `config-master-users-crud`, `feat/u2-editor-asistencias`, `docs/audit-2026-04-23`) — todas ya merged. Candidatas a borrado.

---

## 4. Estado de main (últimos 10 commits)

```
f148b78 2026-05-11 07:20 -0600  incidencia: olvido_entrada Germán (INC-OLV-124-2026-05-11T13-20-27-589Z)
0ec3ad8 2026-05-11 06:59 -0600  incidencia: aprobar INC-OLV-CHK-76 → pendiente_rh
1bb498b 2026-05-11 (auto)       incidencia: aprobar INC-OLV-124-2026-05-08 → pendiente_rh
b261e77 2026-05-11 07:41        feat(website): project card glow + USA & Brazil phones (#29)
074600d 2026-05-11 07:34        feat(website): cap card press-fill + selected glow (#28)
f6dd26b 2026-05-11 07:28        feat(website): AWS-style card interaction (#27)
86edcde 2026-05-11 06:57        feat(website): interactive system — card lighting (#26)
002fbdf 2026-05-11 06:26        copy: trim hero eyebrow (#25)
70e504e 2026-05-11 06:16        copy: update hero eyebrow (#24)
2d5a620 2026-05-11 06:07        fix(website): footer logo size on mobile (#23)
```

**`f148b78` identificado:** auto-commit de incidencia generada por workflow `xVNp36` (`incidencias/crear-olvido-entrada`) cuando Germán Emmanuel Merino Falcón (id 124) creó un olvido_entrada hoy 07:20 -0600 CST. Solo modifica `shared/incidencias-asistencia.json` (+44 líneas). Es comportamiento normal del sistema (auto-commit desde n8n vía GitHub PUT).

**`7c3b4ff` (fix F1.5 bypass):** existe SOLO en `feature/sprint-f1.5-topochico-y-checkout-bloqueado`, NO en main.

**Hubo deploy a Pages 2 veces hoy post-burst de website:**
- 13:20 UTC (07:20 CST) — deploy de `f148b78` ✅ último
- 13:00 UTC (07:00 CST) — deploy de `0ec3ad8` ✅
- 07:41 UTC (01:41 CST) — deploy de `b261e77` ✅ (PR #29)

Los 3 commits F1.5 (`5f78f8e`, `1ef0aa9`, `7c3b4ff`) NO aparecen en ningún deploy.

---

## 5. Estado del sprint F1.5

### ¿Está en main? ❌ No

Los 3 commits viven en `feature/sprint-f1.5-topochico-y-checkout-bloqueado`:

```
7c3b4ff fix(kiosk): F1.5 Issue 2 - redirigir resolverErrorCritico a auto-rescate
1ef0aa9 docs(f1.5): SPRINT_F1.5_REPORTE + CLAUDE.md update
5f78f8e feat(geocerca): hora minima checkin para Topochico Cortina y Caseta L6
```

### ¿Está en producción? ❌ No

Evidencia directa con curl a GitHub Pages:

```js
// https://yinyo1.github.io/fts-suite/operaciones/kiosk/js/kiosk.js
function resolverErrorCritico(){
  var estado = window._estadoActual;
  var empleado = window._empleadoActual;
  // Error crítico: siempre va al flujo de "olvidé checar"
  mostrarModalOlvideCheckout(estado, empleado);    // ← SIN if(horas>=16), VERSION VIEJA
}
```

```jsonc
// https://yinyo1.github.io/fts-suite/shared/public-config.json
{
  "version": "1.0.0",         // ← Esperado v1.1.0
  "updated": "2026-04-18",    // ← Esperado 2026-05-11
  "geolocations": [
    // ... NINGUNA entry tiene aplica_hora_minima_checkin ni hora_minima_checkin
  ]
}
```

### ¿Por qué no se abrió PR? — Causa raíz

`gh` CLI no estaba disponible en mi entorno cuando completé el sprint F1.5 inicial. Quedó indicado en mi resumen de turno: "Cómo abrir el PR: gh no está disponible en este shell. URL ya impresa por git push: https://github.com/yinyo1/fts-suite/pull/new/feature/sprint-f1.5-topochico-y-checkout-bloqueado". Pero Esteban no abrió manualmente.

### Camino más rápido para deployar F1.5

1. Abrir PR desde la URL: https://github.com/yinyo1/fts-suite/pull/new/feature/sprint-f1.5-topochico-y-checkout-bloqueado
2. Mergear (sin conflicts según `git merge-tree`).
3. GitHub Pages deploy automático ~90-120s después del merge.
4. Total: ~3 minutos hasta que Ricardo pueda abrir el kiosk y disparar auto-rescate.

**Alternativa más segura:** rebase F1.5 contra main para validar que los 38 commits behind no rompen nada. Como los 38 commits son TODOS del website iter (`docs/`, archivos de marketing), no tocan kiosk/asistencia/n8n configs — el rebase debería ser clean. Pero hacer el rebase añade ~10 minutos antes del merge.

Mi recomendación: **merge sin rebase**. `git merge-tree` ya confirmó zero conflicts. Los 38 commits behind son orthogonal al área de F1.5.

---

## 6. Estado del PR #3 viejo

### Detalles

- **URL:** https://github.com/yinyo1/fts-suite/pull/3
- **Título:** feat(kiosk): hardening de manejo de errores
- **Branch:** `feat/kiosk-error-handling` (1 commit ahead, 295 commits behind main)
- **Base SHA reference:** `1a777a0` (commit "reset: limpiar incidencias.json antes de integración v3", 295 commits behind current main)
- **Creado:** 2026-04-20 22:24Z (21 días atrás)
- **Actualizado:** mismo día (sin actividad en 21d)
- **Mergeable:** `false`, state `dirty` (tiene conflicts)
- **Cambios:** 36 +/- 11, solo `operaciones/kiosk/js/kiosk.js`

### ¿Sigue siendo válido?

**Sí, parcialmente.** El PR ataca 3 anti-patrones específicos:

1. **Branch "respuesta inválida":** main NO tiene el branch `else { mostrarErrorCandado('Respuesta inválida del servidor...') }`. Sigue ausente. **Aún relevante.**

2. **Catch silencioso:** main línea 903-907 sigue siendo `console.warn` silent (sin `mostrarErrorCandado` visible). **Aún relevante.**

3. **Branch `r.accion_valida === false`:** main línea 895 SÍ tiene este check. **Ya integrado por otra ruta** (commit no identificado, posiblemente parte de la migración v4.2). El PR #3 lo duplicaría con un patrón mejorado pero la lógica básica ya existe.

### Backend v4.0 → v4.2 — ¿sigue emitiendo `accion_valida`?

**Sí.** Línea 895 de kiosk.js en main verifica `r.accion_valida === false`. La existencia de esta lectura en main hoy confirma que el backend sigue emitiendo este campo. Premise del PR #3 sigue válida.

### Recomendación PR #3

Tres opciones, ordenadas por simplicidad:

**A. Cerrar sin merge.** Razón: 21 días stale, 295 commits behind, mergeable=dirty. Reimplementar el 2 patches restantes desde main fresca = ~30 min de trabajo neto. Beneficio: cleanup, una sola pasada.

**B. Rebase + revalidar.** Razón: mantener el contexto del PR original (con su body bien documentado). Risk: 295 commits behind = rebase complicado, requiere validación de que los cambios siguen siendo necesarios línea por línea. Tiempo: ~45 min.

**C. Dejarlo abierto y olvidarlo.** No recomendado — agrega ruido, da falsa sensación de "pending work".

**Mi recomendación: A.** Cerrar + reimplementar las 2 hardening features restantes en nueva branch sobre main fresca, como parte de una mini-sprint de UX/error-handling al kiosk.

---

## 7. Plan de acción priorizado

### Inmediato (próxima hora — desbloquea producción)

1. **[5 min] Abrir PR de F1.5.** URL: https://github.com/yinyo1/fts-suite/pull/new/feature/sprint-f1.5-topochico-y-checkout-bloqueado. Título sugerido: `F1.5: candado hora mínima Topochico + auto-rescate attendance huérfana >16h`. Body listo en `docs/SPRINT_F1.5_REPORTE.md`.

2. **[2 min] Merge PR de F1.5.** Sin conflicts, sin rebase necesario. Squash o merge commit, da igual.

3. **[2 min] Esperar deploy de GitHub Pages.** ~90-120s.

4. **[Opcional, 5 min] Test E2E real:** un empleado real (idealmente Ricardo o Héctor) abre kiosk → confirma auto-rescate dispara.

**Total: ~10 min.** Después de esto, Ricardo + Héctor desbloqueados, F1.5 100% funcional en producción.

### Esta semana (cleanup técnico)

5. **[10 min] Decidir PR #3.** Mi voto: cerrar sin merge, reimplementar fresco en nueva PR `fix(kiosk): hardening errores (rev 2)` después de F1.5 mergeado.

6. **[15 min] Cleanup branches stale en remote.** 23 branches `claude/fts-website-iter-*` ya merged + 10 branches `feat/*` y `fix/*` históricas. Comando: `git push origin --delete <branch>` por cada una, o usar `gh` cuando esté disponible.

### Próximo sprint (después de F1.5 estable en prod 24-48h)

7. Retomar master plan de nómina (`docs/PLAN_NOMINA_FTS_SUITE.md`) — Sprint 1 Configuración Maestra (empleados, festivos, schedules).

8. Backlog F1.5: UI admin geocercas, defensa profunda n8n geocerca, fix Webhook config pre-existente, migrar `ajuste_hora_entrada` legacy a F2.1 schema.

---

## Hallazgos extra (no en scope inicial)

1. **Workflow `crear-olvido-entrada` está activo y produciendo commits a main** (commit `f148b78` de Germán hoy 07:20). Esto es normal y esperado, pero genera ruido en el log de main. No interfiere con F1.5.

2. **23 branches `claude/fts-website-iter-*` huérfanas en remote** — ya merged via PR, no borradas. Considera habilitar "delete branch on merge" en GitHub repo settings.

3. **`gh` CLI no está instalado** en el shell del agente. Esteban necesita usar la URL de PR creation manualmente, o instalar gh.

4. **GitHub Pages deploys son rápidos y confiables:** 5/5 últimos runs success/cancelled. Cancel a las 12:59 fue por el push siguiente de `1bb498b` interrumpiendo. Sin red flags.

5. **`f148b78` y los 2 commits anteriores (`0ec3ad8`, `1bb498b`)** son commits auto-generados por workflows n8n. Esto es normal en este repo (architecture-as-state) pero significa que main puede moverse sin intervención humana.

6. **Branch F1.5 sin protección de force-push** — si alguien hace force-push antes del merge, se pierde el fix-up commit. Riesgo bajo (eres el único pusher) pero anotado.
