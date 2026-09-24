# `docs/trazabilidad/` — el grafo del proyecto, nodo por nodo

Investigación previa al **módulo de Confirmación de órdenes** (junta de administración del
23-sep-2026). Issue de la sesión: [#291](https://github.com/yinyo1/fts-suite/issues/291).
Rector del módulo comercial: [#127](https://github.com/yinyo1/fts-suite/issues/127).

**Sesiones 0, 2 y 3 · 2026-09-24 · sólo lectura.** No se escribió nada en Odoo, ni en
Postgres, ni en ningún workflow. Nada de lo que hay aquí está construido.

| documento | qué trae |
|---|---|
| [`INFORME.md`](INFORME.md) | **sesión 0** · el informe completo: alcance, auditoría de la suite, las 21 aristas medidas, causa raíz en tres cubetas, diseño propuesto, backfill, encaje en #127 y las preguntas abiertas |
| [`INFORME-SESION-2.md`](INFORME-SESION-2.md) | **sesión 2** · qué es YIN, la causa del caso de 17 veces, por qué los dos campos de facturación no se pueden sumar, la contaminación del libro analítico en todo el universo, cómo se hacen hoy los anticipos, los pagos sin conciliar, el patrón real de los bills sin proyecto, la refactura como arista, si la rentabilidad se puede calcular, el empate de planes y el machote contra los candados de octubre. **Corrige tres cifras del `INFORME.md`** |
| [`PLAN-MAESTRO-ESTACION-3.md`](PLAN-MAESTRO-ESTACION-3.md) | **sesión 3 · investigación + DISEÑO** · cómo se controlan hoy las comisiones y por qué el rubro de quien ya salió lleva 2,633 renglones de IVA; el diseño de las tres fases (Confirmación jalando del machote, la cotización en la suite, la oportunidad obligatoria); el catálogo vivo de comisiones; **diez reparaciones que no dependen de construir nada**; el plan maestro con sus dependencias; y once preguntas. **Corrige una inferencia del `INFORME-SESION-2.md`** |
| [`GRAFO.md`](GRAFO.md) | el grafo objetivo y el real, en Mermaid, con las cardinalidades contrastadas |
| [`ARBOLES.md`](ARBOLES.md) | tres proyectos reales dibujados como están hoy, con cada liga rota marcada |
| [`CONTRATO-CONFIRMACION.md`](CONTRATO-CONFIRMACION.md) | borrador del contrato de datos: qué recibe, qué valida candado por candado, qué crea y en qué orden |
| [`consultas/`](consultas/) | las consultas reproducibles, con modelo, dominio y campo: [`sesion-2-dominios.md`](consultas/sesion-2-dominios.md) y [`sesion-3-dominios.md`](consultas/sesion-3-dominios.md) |

## Por dónde empezar

Si hay diez minutos: el **§0 del `PLAN-MAESTRO-ESTACION-3.md`** (diez líneas) y su **§8**
(las once preguntas, separadas en las que bloquean y las que no). Ése es el documento vivo;
los dos informes anteriores son la medición sobre la que se apoya.
Si hay media hora: los **tres árboles**, que es donde se ve el problema en vez de leerlo, y
el **§9 de la sesión 2**, que intenta calcular su rentabilidad y dice dónde se topa con pared.

⚠️ Antes de citar una cifra del [`INFORME.md`](INFORME.md), leer el **§0-bis de la sesión 2**:
tres de sus números no se reprodujeron, y la razón es que no dejó escrito su instrumento.

## Regla de este directorio

**El repositorio es PÚBLICO.** En estos archivos no hay **nombres de persona** —ni de
empleados de FTS ni de contactos de cliente—, ni nombres de cliente o proveedor, ni importes,
RFC o contactos: sólo códigos de cuenta, números de documento, ids de Odoo, conteos,
porcentajes y razones. El detalle nominal vive en `_privado/`, que está en `.gitignore`, **no
se commitea**, y se regenera con las consultas de [`consultas/`](consultas/).

Los nombres de pila que sí aparecen (Esteban, Gerardo) son **dueños de una acción pendiente**,
no datos de un expediente: dicen quién hace cada reparación.
