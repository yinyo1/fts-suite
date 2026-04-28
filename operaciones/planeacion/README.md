# Módulo Planeación Operativa

## Propósito

Captura de planeación diaria de empleados de Operaciones para:

1. Asignar empleados a proyectos (Sales Orders) y cuentas departamentales
2. Habilitar costeo de MO por proyecto vía `account.analytic.line` en Odoo
3. Pre-autorizar HE específicas
4. Generar texto WhatsApp + imagen para grupo Operaciones

## Acceso

Sólo `ftsmaster` (role master) y `felipe.perez` (Supervisor Operaciones).
Gate aplicado en `js/planeacion.js` por `session.username` o `session.role === 'master'`.

## Estructura

| Archivo | Rol |
|---|---|
| `index.html` | UI principal + topbar inline |
| `css/planeacion.css` | Estilos del módulo |
| `js/planeacion.js` | Entry point + auth gate |
| `js/empleados.js` | Carga empleados desde Odoo (F2) |
| `js/jornada.js` | Validador 9.6h con sugerencia (F2) |
| `js/turnos.js` | Agrupación por sub-turnos (F3) |
| `js/exportar.js` | Texto WA + PNG vía html2canvas (F3) |
| `js/horarios-base.js` | Config horarios por persona (F2) |

## Fases

- **F1** — Estructura base + auth gate (este commit)
- **F2** — Empleados + horarios base + edición + jalar externos
- **F3** — Exportación WhatsApp + PNG
- **F4** — Backend workflow `/planeacion/guardar`

## Reemplaza

Módulo viejo (commit `2d09ef9`, 2026-04-16) borrado por incompatible
con approach de costeo a proyectos. El módulo viejo capturaba "planta"
como texto libre, sin vínculo a Sales Order ni cuentas analíticas.

## Adaptaciones vs spec original (#planeacion-F1)

- Topbar **inline** en `index.html` (no hay `shared/topbar.js` ni `shared/css/topbar.css` en el repo).
- Auth gate usa **`FTSAuth.getSession()` + `username`** (`FTSAuth.requireAccess` no existe en `auth-suite.js`).
- Felipe identificado por `session.username === 'felipe.perez'` (FTS user id 2; el `102` de la spec no corresponde a ningún usuario).
