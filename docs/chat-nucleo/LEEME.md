# Núcleo de chat único · paso 1 (prototipo)

Prototipo del núcleo propuesto. Antes de construir, falta el OK de Esteban en el issue rector «Núcleo de chat único».

- `prototipo-nucleo.html`: un solo archivo, sin dependencias. Escenas: `?p=cz`, `?p=mkt` (agrega `&abrir=1` para abrir el chat) y `?p=comparar` (antes y después, con las capturas incrustadas).
- `fuente/nucleo.css` y `fuente/nucleo.js`: el núcleo propuesto, con prefijo `chn-`. Es aditivo: no toca `ch-`, `chl-`, `chp-` ni `chg-`, que Marketing usa en producción.
- `fuente/demo.js`: lo que trae cada producto. Solo configuración y contenido, sin CSS del chat.
- `fuente/gen.js`: arma el HTML.
- `fuente/cap-cz.js`: saca capturas del conceptualizador real (main, V1.42) contra el simulador local. Usa las llaves de prueba de `czsim.env`; nunca el motor real.
- `fuente/cap-proto.js`: saca capturas del prototipo y compara sus medidas con las del conceptualizador (`capturas/cz-medidas.json`).
- `capturas/`: las capturas de `cz-*` y `nucleo-*`. `mkt-hoy-*` son capturas de la prueba `pantalla-v3` de Marketing del 15-oct, del repo fts-conceptualizador.
