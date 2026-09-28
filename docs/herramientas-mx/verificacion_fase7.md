# Fase 7 · Verificación redundante

Proyecto Herramientas MX · issue #325. Cruces reproducibles: `scripts/verificar_fase7.py`, y recálculo de acomodos con `scripts/acomodo.py` (hoja Verificacion de `diseno_carrito.xlsx`).

## 1. Cinco ángulos independientes

### a) Contra el listado y las fotos
- **Todas las 91 piezas del diseño salen del catálogo.** Las únicas nuevas son el cargador sencillo y los combos M18, que vienen de Odoo.
- **9 piezas del diseño no tienen evidencia de existir hoy:**

| Pieza | Por qué no tiene evidencia |
|---|---|
| N1 extensiones | la caja N no tiene foto |
| N2 adaptadores | la caja N no tiene foto |
| M1 y M2 esmeriles | la caja M no tiene foto (Odoo registra 4 reposiciones) |
| R3 lijadora | la otra mitad de Q/R no tiene foto |
| L4 pinza de presión 7" | hueco en la foto de julio 2025 |
| TPC12 segueta | sin foto |
| TPC13 tazón | sin foto |
| TPC14 sierra sable | sin foto |

  → **Contradicción:** la Fase 5 las cuenta como "existe" para calcular la compra. **Si no aparecen en el conteo, la compra sube** $10,416.42: N2 333.71 + M1/M2 2 × 1,585.34 + R3 2,335.95 + L4 308.36 + TPC12 151.22 + TPC13 367.50 + TPC14 3,749.00, a precios de Odoo y del listado. N1 no tiene precio.
- **La foto más reciente de una caja es del 5-ago-2025.** Todo "existe" es de 2025.

### b) Contra las compras de Odoo
1. **Pinzas de presión tipo C 11":** Odoo registra 14 compradas (2 + 2 + 6, más las del listado); el diseño necesita 7. **Si existen, no se compra ninguna.** La Fase 5 lo refleja en la columna "si aparecen las compras de Odoo" ($99,080 contra $159,743).
2. **Sierra de banda:** el listado dice 2729-20 y Odoo dice [292922]. El diseño la deja en su estuche, así que no afecta el acomodo, pero sí el catálogo.
3. **Cajas de cajones ya compradas** (P03220 y P05566): Odoo no registra su recepción. La Fase 5 descuenta 2 de las 15 cajas 8444 necesarias **suponiendo que existen**. Si no aparecen, suben $7,228.
4. **Micro Mapper en USD 204** (P01841, proveedor "PROVEEDOR PERSONA FISICA C"): da $3,599 MXN. Es alto para ese probador; **puede ser un error de moneda en Odoo** (204 MXN). Afecta un solo renglón.

### c) Contra la matriz de uso
- **Sin contradicciones estructurales.** Toda pieza "siempre en todos los tipos" está en la base, y ninguna pieza de la base es ocasional o rara en 3 o más tipos.
- **Contradicción de criterio:** la matriz marca el knockout y la 12R como "frecuente" en eléctrico, pero la Fase 5 los deja **compartidos** (1 en taller). Se sostiene porque en la ventana medida nunca hubo 2 frentes eléctricos a la vez. **Si emp-112-manager_ops valida 2 frentes eléctricos simultáneos frecuentes, se compra un 2o knockout ($32,190).**

### d) Contra las restricciones físicas del carrito
- **25 de 25 cajones cumplen** alto, holgura de 12/6 mm, peso por cajón y peso por caja de 22.7 kg (geometría verificada pieza contra pieza).
- **Pilas:** base 1,228 mm (8420 + 2 × 8444); con un módulo arriba, 1,591 mm. ⚠️ **A 1,591 mm el cajón superior queda arriba del hombro.** Recomendación: montar arriba solo módulos de 1 caja (ELE, TUB, MED). SOL y CIV van aparte, en su propia base o dolly.
- **Las 91 medidas están sin validar** (43 son estimación), y también los cajones (el interior de 416 mm contra un exterior de 564 mm es sospechoso).
- **Hilux:** la huella de 610 × 483 mm cabe con holgura; falta medir el ancho entre salpicaderas y el número de ganchos.
- ⚠️ **Sin dato de barra para candado en la 8420.**

### e) Contra el ciclo real: la cuadrilla cambia de planta a mitad de semana

**Escenario** (con los datos del prototipo): el kit **FTS-CAR-01** está en **Topo Chico**. Su responsable es el técnico A (emp-79), encargado del frente. **El martes en la noche** emp-112-manager_ops publica el plan: el técnico A pasa el miércoles a **Vertiv** para reforzar la soldadura; el técnico B se queda en Topo Chico.

| Momento | Hoy (sin sistema) | Con el sistema | Control que lo impide |
|---|---|---|---|
| Lun 7:30 | La herramienta está en un cajón general de Topo Chico | FTS-CAR-01 `RESGUARDADO` en "Cuarto eléctrico 2, gabinete FTS", candado CAND-01-01. Al llegar, **Abrir** → `EN_USO` | Solo lugares del catálogo; foto del lugar cerrado |
| Lun-mar 18:00 | Nadie revisa | **Revisión** de 8 a 13 cajones en menos de 10 min, luego **Resguardar** | A3 a 1 día hábil sin revisión |
| **Mar 21:40** | El técnico A se entera por WhatsApp. No avisa del kit | Al guardar el plan, la app abre la **tarea de reasignación** para el técnico A y su supervisor: "¿Qué pasa con FTS-CAR-01 en Topo Chico?" | Disparador 1: plan nocturno |
| Mié 7:30 | El técnico A llega a Vertiv sin herramienta o se lleva piezas sueltas. El kit queda "de nadie" en Topo Chico | El técnico A **no puede tomar otro kit** con la tarea abierta. Si no la resolvió en la noche, al checar en Vertiv el kiosko vuelve a dispararla | Disparador 2: asistencia en otra planta; bloqueo |
| Mié 8:00 | – | **Opción 1:** "se queda con el técnico B". El técnico B tiene asistencia hoy en Topo Chico, confirma con su PIN y una foto, y **cambia la combinación** porque el técnico A la conocía | Responsable vivo + A5 combinación |
| Mié 8:00 (alterna) | – | **Opción 2:** "se transfiere a Vertiv". El kit pasa a `EN_TRANSFERENCIA`, se genera la salida de caseta en Topo Chico y la entrada en Vertiv. El técnico A confirma la recepción en Vertiv y pasa a `EN_USO` | A6 a las 48 h sin confirmar → `EXTRAVIADO` |
| Mié 8:00 | – | Si nadie resuelve: a las 24 h escala al supervisor SR y a las 48 h a emp-112-manager_ops | A7 |
| Jue-vie | El kit se queda olvidado en Topo Chico; semanas después lo usa otra gente | Si el frente de Topo Chico termina y nadie de FTS checa ahí 2 días hábiles, **A1 kit huérfano**. Si el proyecto pasa a stage de cierre, **A2 pide retiro** | A1 + A2 |
| Retiro | Doble papeleo de caseta cada día | Un formato de entrada por estancia y uno de salida al retirar | Formato generado desde la lista del kit |

**El kit no se pierde porque en ningún momento queda sin un responsable que esté físicamente en su planta:**
- El cambio de planta de una persona **no se puede cerrar** sin decidir qué pasa con el kit.
- Aunque todo lo humano falle, A1 lo detecta en 2 días hábiles por la asistencia del kiosko.

El prototipo `prototipo_app.html` recorre este mismo caso (tarjeta FTS-CAR-01 → "Resolver reasignación").

**Límite honesto:** el disparador del plan nocturno depende de que `planeacion/guardar` esté vivo, lo cual está sin confirmar. El del kiosko depende de que la cuadrilla cheque con proyecto: en ago-sep, solo 68 a 72 % de los días de campo tienen proyecto.

## 2. Recálculo de acomodos con un segundo método
Se recalcularon **los 25 cajones usados**, más que los 10 pedidos, con dos métodos independientes del MaxRects:

| Método | Resultado |
|---|---|
| Geometría directa (holgura por par de piezas, límites, alto, peso) | 25 de 25 sin error |
| Re-empaque por rejilla de 5 mm (esquina inferior izquierda, 4 órdenes) | Reproduce 18 de 25 |
| Ocupación recalculada (área de piezas / área del cajón) | Igual al MaxRects en los 25 (diferencia 0.0 %) |

**Los 7 cajones que la rejilla no reproduce** son los que tienen la cota de área inflada más alta (76 a 91 %) o piezas que llegan al borde (la rejilla pierde hasta 4 mm por redondeo):

| Cajón | Ocupación | Cota inflada |
|---|---|---|
| BASE C5 | 78.1 % | 88.4 % |
| BASE C6 | 72.2 % | 88.7 % |
| BASE C8 | 66.4 % | 82.0 % |
| SOL C1 | 75.2 % | 83.9 % |
| SOL C3 | 81.6 % | 90.8 % |
| CIV C7 | 68.3 % | 76.1 % |
| TUB C1 | 43.2 % | 53.6 % (llave caimán de 400 mm contra 414 mm de cajón) |

**No son errores del acomodo, sino los cajones más sensibles a la medida real.** Se miden primero con vernier.

## 3. Supuestos, datos no validados y mediciones pendientes

| # | Qué | Tipo | Quién | Cómo |
|---|---|---|---|---|
| 1 | Conteo físico completo de las cajas A a S contra `catalogo_maestro.xlsx` (Piezas), marcando existe, falta o sobra | medición | **rol-taller** + emp-112-manager_ops | En taller, con la hoja impresa |
| 2 | Ubicar la caja de 4 cajones (P03220) y la 8447 (P05566) | verificación | **rol-taller** | Odoo no registra su recepción |
| 3 | Interior útil de los cajones 8444, 8447, 8442, 8443 y 8420 (ancho, fondo, alto; descontar labio) | medición vernier | **emp-55-ingenieria** | Uno de cada modelo; es la medida que más mueve el diseño |
| 4 | Medidas L × A × H y peso de las 40 piezas del carrito base, empezando por los 7 cajones sensibles | medición vernier + báscula | **rol-taller** + emp-55-ingenieria | Llenar las columnas L, A, H y peso del catálogo |
| 5 | Si la 8420 trae barra para candado | verificación | **emp-55-ingenieria** | Con la pieza en mano o la ficha oficial |
| 6 | Ancho entre salpicaderas y ganchos de amarre de la Hilux 2025/2026 | medición | **emp-76-supervisor_sr** | Flexómetro en una unidad |
| 7 | Matriz herramienta × tipo de proyecto (91 renglones) | validación | **emp-112-manager_ops** | Revisar la columna de frecuencia de `matriz_uso.xlsx` |
| 8 | Si hay 2 frentes eléctricos simultáneos con frecuencia (decide el 2o knockout) | validación | **emp-112-manager_ops** | Planes nocturnos |
| 9 | Planes nocturnos históricos de WhatsApp de 2024 a 2025 | dato | **emp-112-manager_ops** | Exportar el chat a la carpeta 03 |
| 10 | Que `/webhook/planeacion/guardar` funcione | verificación técnica | CC (siguiente sesión) | Leer el workflow en n8n |
| 11 | Número de parte de la sierra de banda (2729-20 contra 2929-22), Urrea 4212 contra 4216, P17, P37, L3/L4 | dato | **rol-taller** | Placa o etiqueta de la pieza |
| 12 | Tickets de P05633 ($16,766.59) y P05714 ($6,196.55) sin detalle por pieza | dato | **emp-59-contabilidad** | Ticket de Home Depot |
| 13 | Qué grabador tiene FTS (fibra, CO2 o diodo) | dato | **emp-55-ingenieria** | Si no es de fibra, comprar spray de marcaje |
| 14 | Cajón piloto BASE C6 impreso: tiempo, peso y que cierre sin rozar | medición | **emp-55-ingenieria** | Ajusta la estimación de 6.2 |
| 15 | Precios de 9 renglones sin precio, impresora y placas QR | cotización | **emp-59-contabilidad** (compras) | Centro de Herramientas o Risoul |
| 16 | Ficha o PDF oficial PACKOUT (red bloqueada) | dato | **emp-32-direccion** | Abrir la red o subir el PDF a la carpeta 02 |
| 17 | Fotos de D, M, N, la otra mitad de Q/R, el interior de S y la maleta personal | dato | **rol-taller** | Carpeta 01 |
| 18 | Capacidad del cajón de la 8420 (se supusieron 15 y 25 kg por nivel) | supuesto | **emp-55-ingenieria** | Ficha oficial |
| 19 | Holguras de 12, 6 y 10 mm | supuesto de diseño | **emp-55-ingenieria** | Se prueban en el cajón piloto |
| 20 | Velocidad de impresión de 15 y 30 cm³/h y 85 % de éxito | supuesto | **emp-55-ingenieria** | Cajón piloto |
