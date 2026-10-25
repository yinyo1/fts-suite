# Kiosko de asistencias · Modelo de falla y plan de blindaje

Sesión 0: modelar y diseñar, **sin construir**. Nada de esta carpeta cambia producción.

Origen: hr.employee 124 estuvo del 18 al 23 de septiembre de 2026 sin poder checar. Ya se desbloqueó a mano en Odoo (registros 15549, 15589, 15673, 15674 y 15675 con `write_date` 2026-09-24 02:07 a 02:09 UTC; 15588 ya no existe).

| Documento | Contenido |
|---|---|
| [`modelo.md`](modelo.md) | La validación de Odoo deducida, la máquina de estados de HOY (Mermaid), estados sin salida, discrepancias entre pantalla y Odoo, árbol de falla y pre-mortem |
| [`invariantes.md`](invariantes.md) | Las 9 reglas que el sistema nunca debe romper, con su capa y su bloque |
| [`plan.md`](plan.md) | Los 10 bloques, en orden, con riesgos, impacto en otros módulos, criterio de aceptación y prueba |
| [`simulador.md`](simulador.md) | Cómo correr el simulador de `tests/kiosko-blindaje/` y qué demuestra |
| [`prototipo.html`](prototipo.html) | Prototipo navegable de los flujos nuevos, con datos demo, en el estilo del kiosko |

La bitácora y las decisiones viven en el issue "Kiosko: modelo de falla y plan de blindaje" de `yinyo1/fts-suite` y en sus sub-issues, uno por bloque.
