# `docs/trazabilidad/` — el grafo del proyecto, nodo por nodo

Investigación previa al **módulo de Confirmación de órdenes** (junta de administración del
23-sep-2026). Rector del módulo comercial: [#127](https://github.com/yinyo1/fts-suite/issues/127).

**Sesión 0 · 2026-09-24 · sólo lectura.** No se escribió nada en Odoo, ni en Postgres, ni en
ningún workflow. Nada de lo que hay aquí está construido.

| documento | qué trae |
|---|---|
| [`INFORME.md`](INFORME.md) | el informe completo: alcance, auditoría de la suite, las 21 aristas medidas, causa raíz en tres cubetas, diseño propuesto, backfill, encaje en #127 y las preguntas abiertas |
| [`GRAFO.md`](GRAFO.md) | el grafo objetivo y el real, en Mermaid, con las cardinalidades contrastadas |
| [`ARBOLES.md`](ARBOLES.md) | tres proyectos reales dibujados como están hoy, con cada liga rota marcada |
| [`CONTRATO-CONFIRMACION.md`](CONTRATO-CONFIRMACION.md) | borrador del contrato de datos: qué recibe, qué valida candado por candado, qué crea y en qué orden |
| [`consultas/`](consultas/) | las consultas reproducibles, con modelo, dominio y campo |

## Por dónde empezar

Si hay diez minutos: el **§0 del informe** (diez líneas) y el **§8** (las preguntas).
Si hay media hora: los **tres árboles**, que es donde se ve el problema en vez de leerlo.

## Regla de este directorio

**El repositorio es PÚBLICO.** En estos archivos no hay nombres de cliente, importes, RFC ni
contactos: sólo números de documento, ids de Odoo, conteos y porcentajes. El detalle nominal
vive en `_privado/`, que está en `.gitignore`, **no se commitea**, y se regenera con las
consultas de [`consultas/`](consultas/).
