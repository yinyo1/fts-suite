# Trazabilidad · la cadena cotización → orden → proyecto → dinero

Documentos de las sesiones de investigación y diseño de la **Estación 3**.

> **Este repositorio es PÚBLICO.** Aquí no hay nombres de persona, de cliente ni de proveedor,
> ni importes de operaciones reales, ni RFC, ni contactos. Todo son ids de Odoo, códigos de
> cuenta, números de documento, conteos y porcentajes. El detalle nominal vive en
> `_privado/`, que está en `.gitignore` y **no se commitea**.

## Sesión 4 · especificación construible (2026-09-25) · #294

Convierte **las nueve respuestas de Esteban** en algo que se puede construir, y destapa lo que
esas respuestas abrieron y no estaba en el plan.

| documento | qué trae |
|---|---|
| [`ESPECIFICACION-CONFIRMACION.md`](ESPECIFICACION-CONFIRMACION.md) | la **rentabilidad de cuatro números**, el **contrato de datos campo por campo**, las **ocho escrituras** con su reversa, los **17 candados** con lo que ve la persona, el **choque entre la respuesta 6 y la 2**, y el **umbral por moneda** medido |
| [`APROBACION-BENEFICIARIO.md`](APROBACION-BENEFICIARIO.md) | el flujo completo: estados, las dos tablas, **cómo se firma la liga**, el correo, qué pasa si nadie aprueba, y **el hueco del reenvío, dicho** |
| [`IVA-EN-LA-PO.md`](IVA-EN-LA-PO.md) | la heurística, **por qué no se puede validar hacia atrás**, la memoria por cliente y **cuál es su llave correcta**, y la salida cuando no se puede determinar |
| [`COMISIONES-ESCENARIOS.md`](COMISIONES-ESCENARIOS.md) | los **siete escenarios** de cuándo se comisiona, cómo se configuran sin quedar rígidos, y la recomendación |
| [`PLAN-CONSTRUCCION-V2.md`](PLAN-CONSTRUCCION-V2.md) | **cuántas sesiones mueven C y D**, qué sale si no cabe, y las dependencias que hoy no existen |
| [`consultas/sesion-4-dominios.md`](consultas/sesion-4-dominios.md) | **cada cifra con su modelo, su dominio y su campo**, incluidos los defectos del instrumento |

**Prototipos** (HTML autocontenido, datos inventados, no tocan producción):
[`comercial/prototipos/e3/`](../../comercial/prototipos/e3/) — la Confirmación con sus
candados, el selector de comisión con el flujo de aprobación, y la lectura de rentabilidad.

## Sesiones 0, 2 y 3 · investigación y plan maestro

Viven en el **PR [#290](https://github.com/yinyo1/fts-suite/pull/290)**, todavía sin mergear:
`INFORME.md` (sesión 0) · `INFORME-SESION-2.md` · `PLAN-MAESTRO-ESTACION-3.md` (sesión 3) ·
`GRAFO.md` · `ARBOLES.md` · `CONTRATO-CONFIRMACION.md` · `consultas/` de las tres sesiones.

⚠️ La sesión 4 **no vuelve a medir** lo que esas sesiones ya midieron. Lo que cita, lo cita con
su fuente en `consultas/sesion-4-dominios.md` §6.
