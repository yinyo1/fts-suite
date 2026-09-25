# Catálogo de proyectos de FTS — qué ha hecho la casa, de verdad

> **GENERADO**, no escrito a mano: sale de `herramientas/construir_catalogo.py` sobre el JSON de al lado. Si algo está mal aquí, se corrige el **vocabulario** en `flujo/catalogo_proyectos.py` y se vuelve a generar.

Es el insumo del **evaluador del motor 1**: sin él, «planta nueva en Durango» no dice si es un prospecto de FTS o de un fabricante de racks. Con él, «funde cobre» se convierte en «fundición, y la fundición produjo N proyectos de enfriamiento en el historial».

**No lleva ni una persona.** Empresa, proyecto, proceso y monto. Por eso puede vivir en este repo, que es público.

## Procedencia de la muestra — léelo antes de las tablas

**Muestra, no censo, y el sesgo importa.** Odoo tiene **6,550 órdenes confirmadas**; de ellas **680 pasan de 50,000** y **664 líneas pasan de 80,000**. Esta versión clasifica **168 líneas** tomadas por monto descendente sobre las líneas de tamaño de proyecto (>= 100,000), en tres páginas del 24-sep-2026 después de las 18:00 CST. Se excluyó el contrato recurrente de calibración de rayos X de un cliente — unas **90 líneas idénticas** que, contadas, harían ver a FTS como un taller de metrología. Dos consecuencias que hay que tener presentes al leer los porcentajes: (1) la muestra está sesgada hacia **proyecto grande**, así que la venta chica y recurrente está subrepresentada; (2) está sesgada hacia los clientes que tienen proyectos grandes, que son pocos. Las descripciones de Odoo llegan **truncadas a ~40 caracteres** por el conector, así que la clasificación usa el prefijo — que es la parte informativa, porque Odoo describe empezando por el sustantivo.

## Cobertura — lo primero, porque decide cuánto vale lo demás

| | |
|---|---|
| Órdenes leídas | 0 |
| Líneas leídas | 168 |
| Hilos de Outlook | 3 |
| Propuestas de SharePoint | 0 |
| **Líneas clasificadas** | **154 (94.5%)** |
| Sin clasificar | 9 |

Descartadas por no ser proyecto: `expeditacion` (1), `comision` (1), `total trabajos` (1), `fianza` (1), `renta de :` (1)

> **El porcentaje sin clasificar es la medida honesta del vocabulario.** Un catálogo que clasifica el 100% no tiene mejor vocabulario: miente sobre su propia cobertura.

## Tipos de proyecto, y quién los compra

| Tipo | n | Procesos que lo generaron | Quién lo compra |
|---|---|---|---|
| `integracion_control` | 21 | — | ingenieria de manufactura y automatizacion. NO es venta de mantenimiento: lo que compran es que la linea haga algo que hoy no hace |
| `instalacion_electrica` | 20 | arneses_cableado (3) | mantenimiento electrico. Es la venta mas recurrente del lado electrico |
| `tablero_electrico` | 16 | datacenter (1) | mantenimiento electrico e ingenieria de planta; compras tecnicas cierra |
| `estructura_metalica` | 16 | — | ingenieria de proyectos o facilidades; en seguridad de maquina entra EHS |
| `conveyor_y_manejo` | 11 | — | ingenieria de manufactura y produccion: compran capacidad de linea |
| `tuberia_y_montaje` | 9 | — | ingenieria de proyectos |
| `mantenimiento_servicio` | 8 | — | jefatura de mantenimiento, compra recurrente |
| `red_industrial` | 7 | — | IT industrial. Es la unica familia donde el comprador puede estar en sistemas y no en planta |
| `maniobras_y_montaje` | 6 | — | ingenieria de proyectos; es el complemento de una venta de equipo, propia o de un tercero |
| `electroducto_busway` | 5 | — | ingenieria de proyectos electricos. Es obra de ampliacion: aparece cuando la planta sube carga |
| `comisionamiento_y_arranque` | 5 | — | quien es dueno del arranque: direccion de planta o ingenieria de proyectos. Se vende junto al equipo, casi nunca solo |
| `clima_de_tablero` | 5 | — | mantenimiento electrico: enfria el tablero, no la nave. Se confunde con HVAC y no es lo mismo |
| `transformador` | 4 | — | ingenieria de planta y electrico; el capex lo aprueba direccion, y la especificacion la firma quien responde por la continuidad de la energia |
| `sistema_agua_helada` | 3 | — | ingenieria de proyectos con mantenimiento; en obra nueva manda direccion de planta |
| `chiller` | 3 | — | mantenimiento y servicios auxiliares; la especificacion la firma ingenieria de planta |
| `subestacion` | 3 | — | ingenieria de planta y electrico; direccion aprueba el capex |
| `mezzanine` | 2 | — | ingenieria de proyectos o facilidades; NO es venta de mantenimiento |
| `ups_respaldo` | 2 | datacenter (2) | IT industrial junto con mantenimiento electrico: protege linea, no oficina |
| `puesta_a_tierra` | 2 | — | ingenieria de planta, y con EHS de por medio cuando hay auditoria o norma que cumplir |
| `bombeo` | 2 | — | mantenimiento |
| `refaccion` | 2 | — | compras MRO, con almacen de por medio |
| `tratamiento_de_agua` | 1 | — | EHS y medio ambiente junto con mantenimiento: es la unica familia donde EHS decide y no solo opina |
| `medicion_y_calibracion` | 1 | — | calidad y metrologia, con mantenimiento ejecutando. Compra recurrente y calendarizada |

> La columna **«quién lo compra» NO sale de los datos**: sale del método. Mirar quién firmó exigiría mirar personas, y el catálogo no las lleva. Se declara así para que nadie la confunda con una medición.

## Procesos del cliente — la llave que usa el radar

El proceso **no es la industria**: es qué hace la planta, que es lo que genera la carga. Dos plantas «automotrices» con procesos distintos son dos prospectos distintos.

| Proceso | n | Proyectos que produjo |
|---|---|---|
| `arneses_cableado` | 3 | instalacion_electrica (3) |
| `datacenter` | 3 | ups_respaldo (2), tablero_electrico (1) |

## Lo que el vocabulario NO cubre todavía

Se listan a propósito: es de aquí de donde sale la siguiente corrección del vocabulario.

- `- Suministro, fabricación, e instalación`
- `Suministro de 1800 metros de 5/16 6X19 cable`
- `Pruebas de equipos TCS y TPS y montaje`
- `Suministro e instalacion de tubo de ecedula`
- `Soporte tipo horquilla galvanizada`
- `Integracion de sistema para Modernizacion`
- `Reactor #2`
- `INTEGRACION VALVULAS E INSERTOS`
- `Suministro, fabricación y montaje de base`
