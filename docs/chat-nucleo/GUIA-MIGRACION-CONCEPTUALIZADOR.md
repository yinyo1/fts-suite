# Migrar el conceptualizador al núcleo de chat (#428)

Esta guía es para la sesión del conceptualizador. Esta sesión no tocó `comercial/conceptualizador/`: el núcleo se armó copiando sus piezas sin reescribirlas. Para migrar, el conceptualizador deja de dibujar el chat y le pasa al núcleo su configuración y su contenido.

## Antes de empezar

1. Lee CLAUDE.md §20 #24 y #25, y el issue #428.
2. Confirma que tu rama trae la v4 de Marketing (el PR del #428 mergeado).
3. Antes de tocar nada, corre las pruebas y guarda el resultado; es tu línea base:
   - `node shared/chat/subir-del-conceptualizador.js --revisar`, que debe salir en verde;
   - `pruebas/nucleo/paridad.js`;
   - tus `pantalla-v1xx.js`.

## Lo que el núcleo todavía NO tiene, y hay que subir antes o durante la migración

Súbelo a `shared/chat` de forma aditiva: Marketing no lo usa y no se rompe.

| Falta en el núcleo | Dónde está hoy en el conceptualizador | Cómo subirlo |
|---|---|---|
| Bandeja de adjuntos antes de mandar (miniaturas, «reducidas de X», quitar) | `cz-app.js` `pintarComposer` y `agregarArchivos`; CSS `#bandeja`, `.tira`, `.mini`, `#prep` (esas reglas ya vienen en `chat-nucleo-cz.js`) | `opciones.bandeja: true`. Con eso el núcleo junta archivos y llama `onEnviar` al tocar ➤ |
| Toque largo en una fila de la lista (abre la hoja de la sesión) y palomita en la vista previa | `enlazarTarjeta` (:286) y `pintarLista` (:249) | Opciones nuevas de `ChatLista`: `alPresionar(fila)` y `vistaTick(fila)` |
| La cola con `datos` (`responde_a`) y la tienda `dictados` | `cz-cola.js` `encolar(…, datos)` y `guardarDictado`/`dictados` | `chat-cola.js`: parámetro opcional `datos` y la tienda `dictados`. Hoy Marketing manda la cita como marcador en el texto, así que no le afecta |
| La franja que se abre y se cierra, y se vuelve panel lateral a ≥900 px | `pintarFranja`, `enlazarFranja` y CSS `#avance` | Por ahora es contenido del conceptualizador: `N.franja(html)` en el teléfono y `N.lado(html)` a ≥900 px. Si otro producto la necesita, se sube |
| «Hay versión nueva · Actualizar» | `cz-version.js` | Candidato a núcleo, todavía no |

## Equivalencias `cz-*` → `shared/chat`

| Conceptualizador hoy | En el núcleo |
|---|---|
| `<div class="app">` con `#lista`, `.chat`, `.compose`, `#velo` y `#toast` (index.html :609-637) | `<div id="raiz"></div>` y `ChatNucleo.crear(raiz, opciones)`. El núcleo arma el mismo DOM: los mismos ids `#ch`, `#msgs`, `#fijo`, `#grab`, `#in`, `#bEnviar` y `#bAbajo` |
| CSS genérico de `index.html` (encabezado, lista, fondo, burbujas, palomitas, voz, álbum, documentos, tarjetas, `#fijo`, ⇊, `.compose`, menús, grabadora y visor) | Ya está en `chat-nucleo-cz.js`, **generado de tu propio CSS**. En tu `<style>` se queda solo lo del producto: `avl-*`, `rub-*`, `cd-*`, `of-*`, `pend-cot`, `falta-disp`, `reto`, `odoo-rb`, `pdf`, `panel`, `pagina`, `emp-sel`, `ficha`, `tienda`, `sku` |
| `pintarLista` (:215): encabezado, «Todos ▾», En curso / Cerradas / Todas, filas `.ses`, fila Archivadas, pie y FAB | El encabezado de la lista es del núcleo (`titulo`, `version`, `atras`, `menuLista`). Las filas y los chips se pasan en `opciones.lista`, que son las opciones de `ChatLista`: `filtros`, `menuPersonas` (= «Todos ▾»), `acciones` (= ⋮ de la fila), `etiquetas` con tono (`enviada` → `ambar`, `cerrada` → `verde`, `PRUEBA` → `ambar`) e `insignia` para el número de acciones. Archivadas pasa a ser un chip. El FAB es `fab: { texto: 'Nueva cotización', hacer: abrirMenu }` y el pie, `N.pieLista(html)` |
| La búsqueda dentro del encabezado (`ST.busca`) | La lupa del encabezado del núcleo, que llama `ChatLista.buscar(q)` |
| `pintarCabecera` (:881) | `N.cabecera({ titulo, sub, vivo, avatar: { texto: iniciales, color }, etiquetas: [{ texto: 'PRUEBA', tono: 'ambar' }], mas: { hacer: menuChat }, vuelve: volverALista })`. Sin señal, el núcleo pone el aviso en el subtítulo |
| `pintarChat` (:966): `burbuja`, `dia`, `sis` y `md` | `N.mensajes(lista, { escribiendo, vacio })`. Cada mensaje: `{ id, rol: 'yo'\|'el'\|'sistema', quien: 'Conceptualizador', texto, md: rol de motor, intro, at: escrito_at, llego_at: created_at, adjuntos, cita, dentro, despues }` |
| `tick(tr)` (:1085) | `estado`: sin trabajo → `enviado`; `tomado` → `recibido`; `listo` → `leido`; `error` → `error`. El levantamiento guardado → `leido` |
| `escribeHtml` y `registrarPasos` | `escribiendo: { texto: tq.avance \|\| 'escribiendo…', pasos: ST.pasos[tq.id] }` |
| `tarjetaAcciones`, `tarjetasRespuesta`, `tarjetaOferta` y `tarjetaRubros` | Siguen siendo tuyas (contenido). Van en `despues` del mensaje del motor y se arman con las piezas del núcleo (`carta`, `conj`, `decide`, `bt si/no`, `caja-razon`, `acc`, `nota`) |
| `salidaDelCaso` (:960) y la burbuja pendiente | Mensajes con `estado: 'pendiente' \| 'enviando' \| 'subiendo' \| 'error'`, `local: true` y `progreso`, más `N.salida(items)` para que la voz y las fotos locales se vean. Reintentar y descartar llegan a `onReintentar` y `onDescartar` |
| `vozHtml`, `prepararAudio`, `enlazarVoces` y `adjuntosHtml` | Ya están en el núcleo (copiados por nombre). Les das `verAdjunto: k => C.verAdjunto(k)` |
| `verFotos` y `bajar` (`CzArchivos.visor` y `descargar`) | El núcleo los hace con `ChatNucleoArchivos`, que es tu `cz-archivos.js` |
| «Archivos, enlaces y docs.» y Exportar (`CzArchivos.pantalla` y `exportar`) | `ChatNucleoArchivos.pantalla` y `exportar` (los mismos). Marketing sigue con `ChatPanel` y puede pasarse después |
| `grabar` y `pintarGrab` (:1781), con `CzGrabadora` en `'principal'` | El 🎙 de la barra del núcleo hace lo mismo con `ChatNucleoGrabadora`, que es tu `cz-grabadora.js` |
| `dictar` (las cajitas `d-k`, ✎ Corregir) | `ChatNucleoGrabadora.iniciar('d-' + k, { chico: true, … })`, la misma API. Mientras quede código tuyo que diga `CzGrabadora`, deja el alias `G.CzGrabadora = G.ChatNucleoGrabadora` |
| `pintarFijo` | `N.fijo([{ texto, icono: 'disparo', fuerte, hacer }])` |
| `pintarFranja` y el panel lateral | `N.franja(html)` y `N.lado(html)` (ver la tabla de arriba) |
| `actualizarAbajo` y `#bAbajo` | Los hace el núcleo, con su contador |
| `CG.enganchar(…)` (:2106) | `opciones.gestos: { mensaje: gestoDe, puedeReenviar: () => false, razonReenviar, onResponder }`. El contenedor, la cabecera y el `antesDe` los pone el núcleo |
| `toast` | `N.toast` (el núcleo también toma `ChatUI.toast`) |
| `cz-medios.js` | `chat-medios.js`: `preparar` es igual. Bórralo cuando ya nada lo cargue |
| `cz-cliente.js` | Se queda: es tu contrato con el servidor (firma `ChatFirma.LISTAS.conceptualizador`). El núcleo no habla con ningún servidor |
| `cz-cola.js` | `chat-cola.js`, cuando tenga `datos` y `dictados` (ver arriba). Usa el mismo nombre de base IndexedDB para no perder lo pendiente |
| `cz-avance`, `cz-ciudad`, `cz-acciones` y `cz-version` | Se quedan: son producto |

## Pasos

1. **Sube lo que falta** (bandeja, toque largo, `vistaTick`, `datos` y `dictados` en la cola) con cambios aditivos en `shared/chat`. Corre la prueba `pantalla-v3` de Marketing contra tu cambio y contra `main`: tienen que dar lo mismo.
2. **Invierte la fuente única.** Hoy `chat-nucleo-cz.js`, `chat-nucleo-grabadora.js` y `chat-nucleo-archivos.js` se GENERAN de tus archivos. Cuando el conceptualizador deje de dibujar el chat:
   - pásalos a fuente en `shared/chat` (ya no generados);
   - borra `cz-grabadora.js`, `cz-archivos.js` y el CSS genérico de tu `index.html`;
   - borra `subir-del-conceptualizador.js` y su paso en CLAUDE.md §20 #25.

   Haz esto en el mismo PR que la migración; si no, el generador se queda sin fuente.
3. **Cambia `index.html`:** `<div id="raiz"></div>`, carga `chat-lista.js`, `chat-nucleo-cz.js`, `chat-nucleo-grabadora.js`, `chat-nucleo-archivos.js` y `chat-nucleo.js` antes de `cz-app.js`, y deja tu `<style>` solo con lo del producto.
4. **En `cz-app.js`:** crea el núcleo en `arrancar()` y cambia cada función de la tabla por su equivalente. Lo del producto (avance, ciudad, Odoo, rubros, oferta, menús) no cambia.
5. **Despliegue en cualquier orden (§8):** la página vieja en caché carga archivos que ya no existen o que cambiaron. Copia la guarda de `marketing/js/conversaciones.js`: si falta `ChatNucleo` o `#raiz`, recarga una vez y avisa. La cola de IndexedDB no se toca.
6. **Pruebas.** Todas en verde, o explicar lo que cambió:
   - tus `pantalla-v139*`, `v140`, `v141-push` y `v142`, sin cambiar sus comprobaciones (solo selectores si el DOM cambió de lugar, y se dice);
   - la de Marketing, `pantalla-v3`;
   - `paridad.js`: después de migrar compara núcleo contra núcleo, así que guarda antes sus capturas como referencia y compara contra ellas.
7. **Sube el número de versión** (V1.4x), mira las capturas a 380, 760, 900 y 1280 px (§20 #20) y repórtalo en #428 y en #4.
