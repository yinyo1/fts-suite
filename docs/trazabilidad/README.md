# `docs/trazabilidad/` — el grafo del proyecto, nodo por nodo

Investigación previa al **módulo de Confirmación de órdenes** (junta de administración del
23-sep-2026). Issue de la sesión: [#291](https://github.com/yinyo1/fts-suite/issues/291).
Rector del módulo comercial: [#127](https://github.com/yinyo1/fts-suite/issues/127).

**Sesiones 0 y 2 · 2026-09-24 · sólo lectura.** No se escribió nada en Odoo, ni en Postgres,
ni en ningún workflow. Nada de lo que hay aquí está construido.

| documento | qué trae |
|---|---|
| [`INFORME.md`](INFORME.md) | **sesión 0** · el informe completo: alcance, auditoría de la suite, las 21 aristas medidas, causa raíz en tres cubetas, diseño propuesto, backfill, encaje en #127 y las preguntas abiertas |
| [`INFORME-SESION-2.md`](INFORME-SESION-2.md) | **sesión 2** · qué es YIN, la causa del caso de 17 veces, por qué los dos campos de facturación no se pueden sumar, la contaminación del libro analítico en todo el universo, cómo se hacen hoy los anticipos, los pagos sin conciliar, el patrón real de los bills sin proyecto, la refactura como arista, si la rentabilidad se puede calcular, el empate de planes y el machote contra los candados de octubre. **Corrige tres cifras del `INFORME.md`** |
| [`GRAFO.md`](GRAFO.md) | el grafo objetivo y el real, en Mermaid, con las cardinalidades contrastadas |
| [`ARBOLES.md`](ARBOLES.md) | tres proyectos reales dibujados como están hoy, con cada liga rota marcada |
| [`CONTRATO-CONFIRMACION.md`](CONTRATO-CONFIRMACION.md) | borrador del contrato de datos: qué recibe, qué valida candado por candado, qué crea y en qué orden |
| [`consultas/`](consultas/) | las consultas reproducibles, con modelo, dominio y campo. La sesión 2 va en [`consultas/sesion-2-dominios.md`](consultas/sesion-2-dominios.md) |

## Por dónde empezar

Si hay diez minutos: el **§0 de cada informe** (diez líneas cada uno) y el **§14 de la
sesión 2** (las preguntas, separadas en las que bloquean y las que no).
Si hay media hora: los **tres árboles**, que es donde se ve el problema en vez de leerlo, y
el **§9 de la sesión 2**, que intenta calcular su rentabilidad y dice dónde se topa con pared.

⚠️ Antes de citar una cifra del [`INFORME.md`](INFORME.md), leer el **§0-bis de la sesión 2**:
tres de sus números no se reprodujeron, y la razón es que no dejó escrito su instrumento.

## Regla de este directorio

**El repositorio es PÚBLICO.** En estos archivos no hay nombres de cliente, importes, RFC ni
contactos: sólo números de documento, ids de Odoo, conteos y porcentajes. El detalle nominal
vive en `_privado/`, que está en `.gitignore`, **no se commitea**, y se regenera con las
consultas de [`consultas/`](consultas/).
