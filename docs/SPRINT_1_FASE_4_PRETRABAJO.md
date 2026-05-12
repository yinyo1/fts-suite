# Sprint 1 Fase 4 — Pre-trabajo (status checklist)

**Fecha:** 2026-05-12 (cierre día / pre-arranque 2026-05-13)
**Pre-req antes de arrancar Sub-fase 4.1**

---

## Status de los 4 items pre-trabajo

| # | Item | Status | Tiempo real | Notas |
|---|------|--------|-------------|-------|
| 1 | Setup 4 `hr.leave.type` via console F12 Odoo | ✅ **COMPLETO** | ~10 min | Esteban validó in-place 2026-05-12 |
| 2 | Crear `shared/config/motivos-permiso.json` | ✅ **COMPLETO** | ~3 min | 7 motivos (Decisión 4 catálogo híbrido) |
| 3 | Validar Claude API credential en n8n | ✅ **COMPLETO** | ~2 min | Ya existe, ver detalle abajo |
| 4 | Script poblar `hr.leave.allocation` 44 empleados | ⏳ **PENDIENTE** | ~20 min est. | Bloqueado: requiere ejecución console F12 con datos antigüedad |

**Total pre-trabajo:** 3 de 4 items resueltos. Item 4 pendiente para arranque mañana antes de 4.1.

---

## Item 3 — Detalle Claude API credential

### Credencial existente

| Campo | Valor |
|-------|-------|
| **ID** | `g62rXWwetGFyRKt7` |
| **Nombre** | `Anthropic Claude FTS` |
| **Tipo** | `anthropicApi` (native n8n node, no httpHeaderAuth) |
| **Owner** | Jesus Esteban De La Cruz `<estebandelacruz@fts.mx>` |
| **Created** | 2026-05-07 |
| **Last updated** | 2026-05-07 |

### Implicación arquitectónica (importante)

La credencial es tipo **`anthropicApi`** (no `httpHeaderAuth` genérico). Esto significa que:

- ✅ Podemos usar el **node nativo Anthropic** de n8n (Chat / Messages) en el workflow `incidencias/crear-incapacidad-medica` — más sencillo de mantener, schema validado, modelo seleccionable de dropdown.
- ❌ NO podemos usar HTTP Request con header auth — el tipo de credencial no lo soporta directamente.
- **Alternativa si el native node no soporta vision adecuadamente:** crear credencial paralela `httpHeaderAuth` para llamar `https://api.anthropic.com/v1/messages` directo. Decisión durante Sub-fase 4.3 (incapacidad) según las capacidades del node nativo al momento.

### Validación pendiente (Sub-fase 4.3 inicio)

Antes de implementar el workflow incapacidad:
1. Confirmar que el node nativo Anthropic en n8n soporta **vision input** (imágenes base64 o URL).
2. Si NO soporta vision → crear credencial extra tipo `httpHeaderAuth` con:
   - Name: `Anthropic Claude API (HTTP)`
   - Header Name: `x-api-key`
   - Header Value: `<api_key>` (mismo de credencial existente)
   - Header extra: `anthropic-version: 2023-06-01`
3. Endpoint: `https://api.anthropic.com/v1/messages`
4. Modelo recomendado: `claude-sonnet-4-20250514` (balance costo/calidad vision)
5. Cost estimate Sprint 1: ~$0.24/año (~24 fotos IMSS × $0.01)

---

## Item 4 — Script populate hr.leave.allocation (mañana antes de 4.1)

**No bloquea arranque 4.1 (modal base), pero SÍ bloquea 4.2 (vacaciones).**

Steps:
1. Login Odoo SaaS Enterprise como admin.
2. Abrir DevTools → Console F12.
3. Ejecutar snippet (preparar en Sub-fase 4.2 inicio) que:
   - Lee `hr.employee` activos (44 records).
   - Calcula años de antigüedad: `current_date - (x_studio_fecha_ingreso || create_date)`.
   - Mapea a días LFT con tabla Decisión 7:
     ```
     1 año  → 12 días
     2 años → 14 días
     3 años → 16 días
     4 años → 18 días
     5 años → 20 días
     6-10 años → 22 días
     11-15 años → 24 días
     16-20 años → 26 días
     ```
   - Crea `hr.leave.allocation` per empleado con `holiday_status_id = <Vacaciones LFT type id>`, `state = 'validate'`, `number_of_days = <calculado>`.
4. Verificación: query `hr.leave.allocation` count = 44 (todos activos) o sub-set (excluir < 6 meses antigüedad si LFT lo permite).

**Snippet del script:** elaborar al arrancar Sub-fase 4.2 (no en este pre-trabajo, requiere los IDs reales de los 4 `hr.leave.type` creados en Item 1).

---

## Listo para arrancar Sub-fase 4.1 mañana 2026-05-13

✅ Decisiones consolidadas: `docs/SPRINT_1_FASE_4_DECISIONES.md`
✅ Plan detallado: `docs/SPRINT_1_FASE_4_PLAN.md`
✅ Catálogo motivos: `shared/config/motivos-permiso.json`
✅ Credencial Claude API: existe (`g62rXWwetGFyRKt7`)
✅ hr.leave.type: setup completo en Odoo
⏳ allocations: setup en Sub-fase 4.2 inicio (~20 min)

Sub-fase 4.1 (modal base + refactor olvido_*) puede arrancar SIN bloqueos.
