# Núcleo de chat único (#428)

Un solo chat tipo WhatsApp para toda la suite. La referencia es el conceptualizador.

## Paso 2 · construido

- **`shared/chat/chat-nucleo.js`**: el núcleo. Arma el marco de una o dos columnas, los encabezados, la lista (`ChatLista`), el chat, la barra de escribir con la grabadora y una página para formularios. El producto le pasa solo configuración y contenido. La API está en la cabecera del archivo.
- **`shared/chat/subir-del-conceptualizador.js`**: sube al núcleo las piezas del conceptualizador **sin reescribirlas**. Genera tres archivos:
  - `chat-nucleo-cz.js`: el CSS genérico del conceptualizador bajo `:where(.chn-cz)`, con la misma especificidad que el original y las variables en `--chn-*`, más sus funciones de voz, álbum, markdown y palomitas, copiadas por nombre;
  - `chat-nucleo-grabadora.js`: `cz-grabadora.js` tal cual;
  - `chat-nucleo-archivos.js`: `cz-archivos.js` tal cual.

  `--revisar` falla si lo generado ya no coincide con el conceptualizador.
- **Marketing v4**: el Prospectador y Nuevo lead usan el núcleo, con el mismo servidor, la misma firma y la misma cola (IndexedDB `fts-marketing`).
- **Prueba de paridad**: `fts-conceptualizador/pruebas/nucleo/paridad.js`.
- **Guía para la sesión del conceptualizador**: [`GUIA-MIGRACION-CONCEPTUALIZADOR.md`](GUIA-MIGRACION-CONCEPTUALIZADOR.md).

## Paso 1 · prototipo (aprobado en #428)

`prototipo-nucleo.html`, `fuente/` y `capturas/` son el prototipo con datos demo que se aprobó antes de construir. Se quedan como historia. El código vivo está en `shared/chat/`.
