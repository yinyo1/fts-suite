# Plan de fabricación, identificación y aplicación

Proyecto Herramientas MX · issue #325 · Fase 6.
Los costos están en [`asignacion_y_compra.xlsx`](asignacion_y_compra.xlsx), las estimaciones de impresión en `datos/estimacion_impresion.json` (script `scripts/estimar_impresion.py`) y el acomodo en [`diseno_carrito.xlsx`](diseno_carrito.xlsx).

> ⚠️ Todo lo que dependa de medidas (siluetas, tiempos de impresión) queda **no validado** hasta medir con vernier. No se imprime ni una silueta antes de validar el primer cajón (ver 2.5).

## 1. Número de activo y grabado

### 1.1 Esquema
| Objeto | Formato | Ejemplo | Nota |
|---|---|---|---|
| Kit (carrito armado) | `FTS-CAR-NN` | `FTS-CAR-02` | Lo que se escanea en caseta y en la revisión |
| Contenedor (caja o base) | `FTS-MOD-NN-Kk` | `FTS-BAS-02-K1` | `k` = posición en la pila, contando desde arriba |
| Pieza en cajón | `FTS-MOD-NN-Cc-pp` | `FTS-SOL-01-C3-07` | `c` = cajón desde arriba dentro del módulo; `pp` = posición en el cajón (orden de lectura) |
| Pieza fuera de cajón | `FTS-MOD-NN-Spp` | `FTS-TUB-01-S01` | Roscadora, 12R, knockout, sierra sable |
| Pieza del juego Wiha | `FTS-BAS-NN-Cc-pp` por pieza | | El juego 32985 se registra pieza por pieza |

- `MOD` ∈ `BAS`, `ELE`, `SOL`, `TUB`, `CIV`, `MED`. `NN` es el número de unidad del módulo (`01`, `02`…).
- **Nunca el nombre de una persona.** El responsable vive en la app.
- **El número dice dónde vuelve la pieza**, no quién la tiene: `FTS-SOL-01-C3-07` regresa al cajón 3 del módulo de soldadura 01, al hueco 7. Si una pieza cambia de cajón, **se regraba**. Por eso conviene grabar al final, cuando el acomodo ya está validado con la pieza física.

### 1.2 Qué y dónde se graba
| Superficie | Método | Nota |
|---|---|---|
| Acero (llaves, pinzas, dados grandes) | Grabador de FTS | ⚠️ **Falta saber qué grabador es.** Uno de CO2 o de diodo **no marca acero desnudo** sin spray de marcaje (tipo Cermark o LMM); uno de fibra sí. Hay que confirmarlo con Juan Manuel |
| Plástico de herramienta eléctrica | Grabador (placa lisa de la carcasa) o placa QR remachada o pegada | No grabar sobre la zona de ventilación ni sobre la etiqueta de datos |
| Piezas chicas (dados, brocas, puntas) | **No se graban una por una.** Se controlan como juego: el riel o estuche lleva el activo y la silueta marca cada hueco | |
| Contenedores | Placa de aluminio anodizado con QR, remachada al costado | Visible con la pila armada |

### 1.3 Grabado por lotes
1. **Lote 0 (piloto):** el carrito base 01 completo, 40 piezas más 3 contenedores. Se graba **después** de validar el acomodo con la pieza física (2.5).
2. **Lotes siguientes, uno por módulo:** se agrupan por material para no cambiar el ajuste del grabador a cada pieza (primero todo el acero, luego los plásticos).
3. **Plantilla del lote:** `diseno_carrito.xlsx`, hoja Acomodo, filtrada por módulo. Trae el número de activo, la pieza y el cajón.
4. **Tiempo estimado** (sin medir): de 1 a 2 min por pieza de acero con marca de 20 × 6 mm, más la preparación. **Un carrito base son unas 2 h de grabado.** Se valida con el lote 0.

## 2. Siluetas impresas en 3D

### 2.1 Por qué impresas y no espuma
- Se replican idénticas en cada carrito, desde el mismo archivo.
- Una silueta impresa en **PETG amarillo** hace evidente un hueco en la foto de revisión, que es la base del control.
- La espuma se rompe y se deforma; la foto de la caja B de mayo de 2025 muestra la espuma ya marcada.

### 2.2 Material
| | Temperatura de trabajo | Nota |
|---|---|---|
| **PETG (recomendado)** | Hasta unos 70 °C (transición vítrea de unos 80 °C) | Aguanta la caja de una camioneta al sol en Monterrey y los aceites |
| PLA | Se deforma arriba de unos 55 °C | Se descarta |

**Colores:** amarillo para la placa y el fondo de cada hueco; negro para el cerco. Así el hueco vacío "brilla" en la foto.

### 2.3 Diseño para que se pueda reacomodar
- **Base en rejilla modular** (tipo Gridfinity, módulo de 42 mm). En 404 × 310 mm útiles caben **9 × 7 módulos** (378 × 294 mm).
- **Cada herramienta es una ficha independiente** que ocupa n × m módulos y se encaja en la rejilla.
- **Si cambia una herramienta, se reimprime solo su ficha.** La rejilla no se toca.
- **La placa se divide en 4 losetas** (2 × 2) para que quepa en una cama de 220 × 220 mm.

### 2.4 Qué se escanea y cuántas veces se diseña
1. **Se escanea una vez cada modelo de herramienta**, no cada pieza. Son unos **70 modelos únicos** en las 91 piezas de diseño.
   - Escáner 3D de FTS → malla → **proyección a contorno 2D** (vista superior) → offset de 1.5 mm de holgura de ajuste.
   - Las herramientas con ficha oficial y geometría simple (llaves, desarmadores) se pueden trazar desde foto con escala, sin escanear.
2. **El diseño se hace una vez por tipo de módulo** (BAS, ELE, SOL, TUB, CIV, MED), a partir de `diseno_carrito.json`: posición, rotación y tamaño de cada pieza ya calculados.
3. **Las réplicas se reimprimen** del mismo archivo. El módulo 02 es idéntico al 01; solo cambia el número de activo grabado.
4. Pipeline propuesto: contorno (SVG) + posición (JSON) → OpenSCAD paramétrico → STL por loseta → impresora.
   - **Responsable del diseño: Juan Manuel Sánchez** (diseño industrial, impresión 3D).
   - **Escaneo: Héctor Cruz o Juan Manuel.**

### 2.5 Validación antes de producir
1. Medir con vernier el **cajón real** de 8444 y 8420 (ancho, fondo y alto útil, descontando labio). El dato publicado no es confiable (Fase 2: 416 mm de interior contra 564 de exterior).
2. Imprimir **un solo cajón piloto**, BASE C6 (flexómetros, pinza de presión, desarmadores y tazón): se mide su tiempo y peso reales y se ajusta el modelo de 2.6.
3. Probar con el cajón cerrado que nada roza, y abrirlo en la camioneta después de un trayecto.

### 2.6 Estimación de impresión (ESTIMACIÓN, no medición)

**Modelo usado:**
- Placa de 1.6 mm sobre el área útil más un cerco por pieza de 2 perímetros (0.9 mm).
- Alto del cerco: 60 % del alto de la pieza, entre 8 y 25 mm.
- PETG a 1.27 g/cm³.
- Dos velocidades efectivas: 15 cm³/h (impresora estándar) y 30 cm³/h (impresora rápida con cámara cerrada).
- Script: `scripts/estimar_impresion.py`.

| Módulo | Cajones con silueta | PETG (g) | Horas (estándar) | Horas (rápida) |
|---|---|---|---|---|
| Carrito base | 8 | 2,548 | 133.6 | 66.8 |
| Eléctrico | 2 | 625 | 32.8 | 16.4 |
| Soldadura | 5 | 1,516 | 79.6 | 39.7 |
| Obra civil | 6 | 1,774 | 93.1 | 46.6 |
| Medición e izaje | 2 | 591 | 31.0 | 15.5 |
| Tubería | 2 | 607 | 31.9 | 15.9 |

**Promedio por cajón:** unos 320 g, entre 8 y 17 h.

**Capacidad de una impresora:**
- 16 h al día × 6 días × 85 % de éxito = **81.6 h efectivas por semana**.
- La tasa de éxito es un supuesto que se ajusta con el piloto.

**Impresoras para hacer un carrito por semana** (carrito base más un módulo promedio):

| Tipo de impresora | Horas por carrito | Impresoras |
|---|---|---|
| Estándar | 187 | 187 / 81.6 = 2.3, o sea **3** |
| Rápida | 94 | 94 / 81.6 = 1.15, o sea **2** |

**Recomendación:** **2 impresoras rápidas**: la que ya tiene FTS, si es de ese tipo, más 1 nueva. Con eso sale **un carrito por semana**.

**Plan completo** (5 carritos base y 9 módulos, Fase 5):
- Horas con impresora rápida: 5 × 66.8 + 2 × 16.4 + 2 × 39.7 + 2 × 15.9 + 46.6 + 2 × 15.5 = **556 h**.
- Con 2 impresoras rápidas (163 h por semana) son **3.4 semanas de impresión**. Con 3 estándar: 1,111 h / 245 = 4.5 semanas.
- El cuello de botella no es la impresora sino el diseño y la validación del primer carrito (semanas 0 a 2 de la sección 5).
- Filamento de todo el plan: 5 × 2,548 + 2 × 625 + 2 × 1,516 + 2 × 607 + 1,774 + 2 × 591 = **21.2 kg de PETG**.

## 3. RFID sobre metal contra QR grabado

| Clase de pieza | Identificación | Por qué |
|---|---|---|
| **Eléctrica e inalámbrica** (M18, alámbrica, medición electrónica) y **toda pieza de más de $1,500 MXN** | **RFID UHF on-metal** + QR grabado + silueta | Es lo que se roba y lo que más cuesta reponer. El RFID permite la lectura de "¿está en el carrito?" sin abrir cajones (fase 2 de la app) |
| Herramienta de mano de menos de $1,500 | **QR grabado + silueta** | El costo del tag (de 10 a 30 % del valor de la pieza) no se justifica. La silueta ya detecta el hueco |
| Juegos (dados, brocas, puntas) | QR en el riel o estuche + silueta | |

- **Conteo:** lo calcula `asignacion_y_compra.xlsx`, hoja RFID, a partir del precio de cada pieza.
- **Hardware de lectura:** un lector UHF de mano para Android. **Es fase 2:** el MVP opera con QR y foto, y los tags se colocan desde el principio para no volver a desarmar.
- **Montaje del tag:** pegado con epóxico en una zona plana que no se caliente (lejos del motor y del escape de aire), cubierto con termo-encogible cuando se pueda.

## 4. Aplicación del celular
Especificación completa en [`especificacion_app.md`](especificacion_app.md) y prototipo navegable en [`prototipo_app.html`](prototipo_app.html). Cubre salida de FTS, llegada con formato de caseta, resguardo, revisión diaria por foto, reasignación con transferencia, retiro y alertas de kit huérfano.

## 5. Secuencia de fabricación propuesta
| Semana | Qué | Quién |
|---|---|---|
| 0 | Conteo físico completo de las cajas A a S; localizar las cajas de cajones ya compradas (P03220 y P05566); fotos faltantes | Eduardo + Felipe |
| 0 | Medir con vernier los cajones 8444/8420 y las piezas del carrito base (ver lista de la Fase 7) | Eduardo, Juan Manuel |
| 1 | Escanear y diseñar el carrito base; imprimir el cajón piloto BASE C6 | Juan Manuel, Héctor |
| 2 | Carrito base 01 completo (piloto en Topo Chico, la planta ancla); grabado del lote 0 | Juan Manuel + taller |
| 2 a 4 | Piloto de la app con el carrito 01: revisión diaria, resguardo y formato de caseta | Carlos Manzanares o Mateo Salazar (encargado del frente) |
| 4 a 9 | Carritos 02 a 05 y módulos, al ritmo de 1 por semana; ajuste de diseño con lo aprendido | Juan Manuel + taller |
