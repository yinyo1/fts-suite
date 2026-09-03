# Machote y órdenes — prototipo navegable

Estaciones 2.0 (machote digital) y 3.0 (confirmación de orden) del módulo Comercial.
Issue [#148](https://github.com/yinyo1/fts-suite/issues/148) · rector [#127](https://github.com/yinyo1/fts-suite/issues/127).

**Abrir:** https://yinyo1.github.io/fts-suite/comercial/machote/

---

## Qué es y qué no es

**Es** un prototipo navegable para decidir la forma del producto antes de construirlo:
cuatro pantallas que se usan de verdad, con cálculos que funcionan y un revisador que
evalúa el machote demo.

**No es** software de producción. No tiene backend, no hace una sola llamada de red, no
usa `localStorage`. El estado vive en memoria y **se pierde al recargar, a propósito**:
nadie debe confundirlo con algo donde se pueda capturar trabajo real.

---

## Para quién

La junta del 2-sep-2026 cambió el usuario. El machote y la confirmación son del
**analista de propuestas y órdenes** (back office / pricing), no del ingeniero comercial
—que se va a campo—. El **account manager** (Montalvo en México, Ricardo en USA) no llena
nada: revisa y aprueba desde el teléfono.

Eso explica dos decisiones de diseño que se notan al usarlo:

- Las pantallas del analista crecen a 920 px en escritorio; la del account manager se
  queda en 520 px. **Anda en planta, no en escritorio.**
- El analista llega con la mitad del perfil (números sin técnica, o técnica sin números).
  Nada se deja implícito: las preguntas de diagnóstico cambian según el tipo de proyecto,
  el revisador dice qué falta **y lleva al lugar exacto** a arreglarlo, y los oficios
  traen su rango de costo por hora para no tener que sabérselo.

---

## Las cuatro pantallas

| Ruta | Pantalla |
|---|---|
| `#/` | Inicio: machotes, órdenes y accesos a aprobación |
| `#/m/<id>` | **Machote**: Diagnóstico · Secciones · Generales · Simulador |
| `#/rev/<id>` | **Revisador**: hallazgos por severidad, cada uno con "ir a arreglarlo" |
| `#/orden/<id>` | **Confirmación**: margen antes de confirmar, handoff y disparo simulado |
| `#/ap/<id>` | **Aprobación del AM**: margen grande, bloqueos, dos ajustes, aprobar o devolver |

---

## Archivos

| Archivo | Qué tiene |
|---|---|
| `js/demo.js` | catálogos y 4 machotes demo en distintos estados |
| `js/calc.js` | **motor de cálculo y widgets**. Todo número en pantalla sale de aquí |
| `js/reglas.js` | **28 reglas del revisador**, en arreglo de configuración |
| `js/app.js` | ruteo por hash, vistas y eventos |
| `css/machote.css` | solo lo que `shared/fts-styles.css` no trae |
| `tests/pruebas-navegador.js` | 19 pruebas de navegador |

### Editar las reglas del revisador

Están **separadas del motor que las corre**. Para agregar, quitar o ajustar una, se edita
`js/reglas.js` y nada más:

```js
{
  id: 'mi-regla', severidad: 'dura',   // dura bloquea · blanda avisa · info observa
  area: 'Material', titulo: 'Lo que se ve en la lista',
  destino: (m) => ({ tab: 'secc', lineas: [...ids] }),   // a dónde lleva "arreglarlo"
  evaluar: (m, c) => condicion ? { detalle: '…', items: [...] } : null
}
```

Los umbrales viven arriba del arreglo, en `UMBRALES`.

---

## Decisiones que vale la pena conocer

- **Nunca se inventa un precio.** Sin dato, `pu` es `null` y la línea dice `SIN DATO` en
  rojo. Un cero silencioso es peor que un hueco visible.
- **Un costo con huecos nunca se pinta en verde.** El margen que sale de un costo
  incompleto siempre está inflado; se marca con `*` y el costo se rotula `INCOMPLETO`.
- **Las horas son horas.** Mano de obra por oficio, con personas y turno. Nunca
  disfrazadas de piezas.
- **Los generales son renglones explícitos.** Flete, importación, viáticos, hospedaje y
  comisión se ven y se cobran por separado. Nada escondido dentro de un porcentaje.
- **Los cuadros de cálculo capturan un dato, no son una hoja libre.** Cada uno tiene
  nombre, entradas nombradas y fórmula visible.

---

## Correr las pruebas

```bash
node comercial/machote/tests/pruebas-navegador.js
```

Necesita Playwright y un Chromium. Corre contra el archivo local, sin servidor.

---

## Supuestos

Están listados en el issue #148. El más importante: **no tuve acceso a los machotes
reales de SharePoint**, así que la estructura por secciones, los oficios, los rangos de
costo por hora, los umbrales del revisador y los renglones de generales están inventados
a partir del encargo. Son lo primero que hay que corregir con números reales.
