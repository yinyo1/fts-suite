---
name: investigacion-dimensiones
description: Investiga numero de parte, medidas (L x A x H en mm), peso, foto de referencia y precio en Mexico de una herramienta o contenedor, con fuente trazable por cada numero y validacion triple para medidas criticas. Usar cuando se pida "investiga las medidas de <herramienta>", completar el catalogo maestro de Herramientas MX, validar un numero de parte, o comparar un contenedor Packout.
---

# investigacion-dimensiones

Proyecto Herramientas MX (issue #325). Salida: renglones para `docs/herramientas-mx/datos/dimensiones_herramientas.json`
o para la hoja `Fuentes` del `catalogo_maestro.xlsx`.

## Reglas que no se negocian
1. **Todo en milimetros.** Si la fuente trae pulgadas, guardar el valor original al lado (`valor_original`) y convertir x 25.4, redondeando a 1 mm.
2. **Cada numero lleva su fuente**: URL de ficha, pagina y seccion de PDF, "medicion fisica pendiente" o "estimacion desde foto" (marcada como estimacion).
3. **Jerarquia de fuentes** (usar la mas alta disponible, reportar las demas):
   `fabricante` > `catalogo_oficial` (Milwaukee PACKOUT Dimension Catalog) > `distribuidor_autorizado` > `tienda`.
   Si dos fuentes difieren, reportar ambas y la diferencia en mm y en %.
4. **Validacion triple para medidas criticas** (cajones, herramienta grande, todo lo que pase de 250 mm o 2 kg):
   dos fuentes documentales independientes + medicion fisica. Mientras falte una, el dato es `no validado`
   y todo calculo que dependa de el tambien.
5. **Nunca inventar** numero de parte, medida o precio. Si no existe: `null` + como obtenerlo
   (medir con vernier/flexometro, pedir factura, pedir ficha al distribuidor).
6. **Empaque no es herramienta.** Las tiendas publican medidas de caja de envio: marcarlas `dim_tipo = "empaque"` y no usarlas para acomodo.
7. **Precio en MXN con fecha de consulta** y tienda (Home Depot MX, Milwaukee Mexico, Centro de Herramientas, Risoul, Grainger MX, Amazon MX).

## Procedimiento
1. **Normalizar el numero de parte.** Quitar espacios, unificar guiones (Milwaukee usa `NNNN-NN`, accesorios `48-22-NNNN`).
   Detectar numeros falsos: el mismo numero en piezas distintas (ej. Wiha 32985 es el numero del **juego** de 7 piezas,
   no de cada pinza), "BUSCAR EN FACTURA", SKU de tienda capturado como numero de parte.
2. **Cruzar con Odoo** (`purchase.order.line`, `name ilike <parte>`) para confirmar que se compro, a quien y cuanto.
3. **Ficha del fabricante.** milwaukeetool.com / .com.mx, truper.com, urrea.com, wiha.com, fluke.com, ridgid.com, bosch.
   Tomar Length/Width/Height de herramienta (no de kit) y peso "tool only".
4. **Segunda fuente independiente.** Otro dominio (distribuidor o manual PDF). Si coincide +-3 mm: `2 fuentes`.
5. **Foto de referencia**: URL de la imagen de la ficha oficial.
6. **Medicion fisica**: dejar el renglon en `mediciones_pendientes` con quien mide y con que instrumento.
   Para herramienta en foto, se puede estimar escalando contra una referencia conocida del mismo cuadro
   (ancho interior del estuche 48-22-8450, un flexometro de 5 m, una bateria M18 CP2.0) y marcar `estimacion`.
7. **Si un host esta bloqueado** (403 del proxy): `curl -sS "$HTTPS_PROXY/__agentproxy/status"`, anotar el host y seguir con otra fuente.

## Formato del renglon
```json
{"numero_parte": "", "numero_parte_corregido": "", "marca": "", "descripcion_normalizada": "",
 "tipo_energia": "mano|electrica_alambrica|inalambrica_M18|inalambrica_M12|medicion",
 "L_mm": null, "A_mm": null, "H_mm": null, "peso_kg": null,
 "dim_tipo": "herramienta|estuche|empaque|estimacion",
 "fuentes": [{"campo": "L_mm", "valor_original": "9.3 in", "url": "", "tipo_fuente": "fabricante", "fecha": "2026-09-28"}],
 "foto_url": "", "validacion": "no encontrado|1 fuente|2 fuentes|validado (2 fuentes + fisica)", "notas": ""}
```
