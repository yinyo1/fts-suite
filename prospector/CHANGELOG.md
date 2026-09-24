# Cambios de la herramienta

Versiona **la herramienta**, no el metodo. El metodo tiene su propio historial
en §10 de `docs/prospeccion/busqueda-encadenada-contactos.md`.

## 0.2.0 — 2026-09-24

La herramienta se aisla en `tools/prospeccion/` y se corre **de verdad** sobre
Cuprum, con busquedas en vivo, Odoo y Outlook. La corrida encontro **dos
defectos que la version anterior tenia y las pruebas sinteticas no vieron**.

### Corregido, por lo que mostro la corrida real

1. **La regla C1 no estaba implementada.** `choca` solo comparaba valores, asi
   que tres directorios diciendo `first.last@cuprum.com` al **44%**, **45.45%**
   y **100%** pasaban como SOLIDO. El valor coincide y la certeza no. Ahora
   `Observacion` extrae el porcentaje de la nota y una brecha mayor a **20
   puntos** dispara conflicto. Reportar el 100% porque una fuente lo dijo es
   el bug del Caso F con otro disfraz.
2. **Chao1 se marcaba confiable con `f2=1`.** Con 16 observados, f1=14 y f2=1
   estimaba **114** y decia que era de fiar. El divisor es `2*f2`: el numero
   lo decidia **un solo contacto**. Ahora exige f2>=3 y que no mas del 80%
   aparezca una sola vez, y explica en texto por que no se fia.

### Resultado de la corrida

16 contactos, **3 conflictos atrapados solos**, 6 de 60 consultas gastadas.
Detalle en el issue #24.

## 0.1.0 — 2026-09-23

Primera version corrible. Fases A, B y C del plan del issue #22.

### Construido

- **`confianza.py`** — niveles e **instrumentacion de fuentes por dato**: cada
  campo guarda TODAS las observaciones que lo sostienen, con su fuente y su
  raiz. Es lo que habilita el challenge y desbloquea Chao1.
- **`compuertas.py`** — las tres compuertas como `raise`: agotado, presupuesto
  (bloques de 10, paro tras 3 secos, tope por cuenta) y confianza.
- **`chao1.py`** — estimador de completitud, con marca de *poco confiable*
  cuando hay menos de 10 contactos o ningun f2.
- **`catalogo.py`** — las 13 fuentes descartadas, rechazadas por codigo con su
  razon.
- **`estado.py`** — la corrida que Python posee, con el flujo en cuatro olas y
  las cinco correcciones del issue #22.
- **`ficha.py`** — modo limpio y modo procedencia, con checklist de lo que no
  se pudo hacer.
- **`orquestador.py`** — CLI que dice cual es el paso siguiente.
- **39 pruebas**, incluidos los casos D (LEGO) y F (Cuprum).

### Tres bugs encontrados por las pruebas, no por revision

1. **`KeyError` en vez de compuerta** cuando un modulo no tenia criterio de
   agotado definido. Ahora lanza compuerta legible y M4 tiene el suyo.
2. **El challenge corria con modulos abiertos.** Cruzar a medias produce el
   falso consenso que el Caso F existe para impedir. Ahora se rechaza.
3. **El conflicto no llegaba a la ficha limpia.** Se detectaba, se guardaba en
   avisos y en procedencia, y la ficha que lee Rissia no lo mostraba.
   **Callar un conflicto es afirmar.** Ahora va arriba y visible.

### Pendiente de infraestructura (fase D)

- **M0 · Odoo** — el MCP es independiente de n8n; espera autorizacion, no a Redis.
- **M8 · padrones publicos** — necesitan `WebFetch` o lectura desde n8n.
- **M9 · aduanas** — sin una sola medicion desde la v1.0 del metodo.

### Pendiente por decision, no por codigo

- Invocacion por nombre corto y configuracion de maquinas locales: fase
  posterior, tal como se acordo.
