# Plan del piloto en Topo Chico (4 semanas)

Sesión nocturna 1 (#330), bloque 6. Los números salen de `caso_negocio.xlsx` (script `scripts/build_caso_negocio.py`). Personas solo por rol.

## Qué se prueba

Un carrito base (FTS-CAR-01) más un módulo de tubería (TUB) trabajando en Topo Chico durante 4 semanas. Topo Chico es la planta con más gente: sus dos proyectos activos, SO11547 y SO9428, suman 58 y 35 asistencias en los últimos 10 días hábiles (Odoo, leído el 2026-09-28).

La pregunta que tiene que contestar el piloto: **¿el carrito baja la herramienta perdida y el tiempo buscando lo suficiente para pagar el plan completo?** Con lo que hoy registra Odoo, no alcanza: el plan completo se recupera en 8.8 a 33.1 años solo por reposición (hoja `Recuperacion`). El piloto mide lo que falta: pérdidas reales, minutos buscando y compras fuera de Odoo.

**No hay app en producción.** El piloto corre con:
- la checklist impresa (`checklist_piloto.html`);
- las fotos del cierre en la carpeta de SharePoint del proyecto;
- el prototipo v2 solo para demostrar el flujo.

Nada escribe en Odoo ni en n8n.

## Costo exacto

> **Actualización de la sesión nocturna 2 (#338):** con las losetas ligeras, el PETG del piloto baja a 9.22 kg y 465 h, que cuestan $5,837.06. **El total pasa a $26,254.73**, o $76,257.74 si nada del listado aparece. La tabla de abajo es la de la sesión 1.
>
> Otros dos cambios de la sesión 2:
> - Las M18 van **sin batería**.
> - En el cajón C6 del piloto, 3 de sus 5 fichas llevan el rebaje de dedo de un solo lado. Ver `reporte_interferencias.md`.
>
> Hay una regla nueva para la checklist, sacada de `estabilidad.md`: **un cajón abierto a la vez y nunca abrir en rampa.**
>
> **Actualización de #343 (renders):** la base cambia de 8420 a **8410 (base plana con ruedas) + 8442**, y los juegos van en huecos individuales. El total del piloto pasa a **$26,544.79** (sube por la pared entre huecos, baja por la bandeja que ya no va). Ver `correcciones_acomodo.md`.

| Concepto | Con el inventario del listado | Si nada del listado aparece | Cómo salió |
|---|---|---|---|
| Herramienta que falta | $6,407.12 | $52,796.13 | Hoja `Herramienta` recalculada para 1 BASE y 1 TUB. Falta 48-59-1812 (cargador), 797UR y un cabezal 3/4 |
| Contenedores | $13,197.00 | $16,811.00 | 2 × 48-22-8443, 1 × 48-22-8420 y 1 × 48-22-8444. Ya hay una 8444 |
| Candados (4) y cable (1) | $813.55 | $813.55 | Candado $119, cable $337.55 |
| PETG, 10.69 kg con 15 % de merma | $6,767.31 | $6,767.31 | Gramos de la Fase 6 × 2.28 (factor del cajón C6 medido) más la bandeja 8420 medida, a $633 el kg |
| **Total** | **$27,184.98** | **$77,187.99** | Precios mezclados, con el mismo criterio que `asignacion_y_compra.xlsx`: Odoo sin IVA, tienda con IVA |

Fuera del total:
- Placas QR de aluminio: hay que cotizarlas. El piloto usa la etiqueta del láser propio (`etiquetas/`).
- Lector RFID: es de fase 2, no entra.
- Horas de la gente: no se cuentan.

**Restricción que manda en el calendario:** imprimir todo el carrito base, la bandeja y el TUB son **538 horas** de impresora estándar, unos 27 días a 20 horas por día. No cabe antes de arrancar. Por eso se imprime por prioridad y los cajones que no alcancen llevan una plantilla de cartulina amarilla recortada con la silueta (supuesto S1).

## Calendario

**Semana 0: preparación en el taller (martes 29 de septiembre a viernes 2 de octubre)**

| Día | Qué se hace | Quién (rol) | Archivo |
|---|---|---|---|
| Mar 29 | Conteo físico del inventario | Taller y supervisor SR | `levantamiento_conteo.html` |
| Mar 29 | Medición de las 40 piezas | Ingeniería | `levantamiento_medicion.html` |
| Mar 29 | Arrancar la impresión del cajón C6 | Ingeniería | `stl/` |
| Mié 30 | Ingestar el conteo y la medición y recalcular el costo del piloto con la existencia real | Ingeniería | `scripts/ingestar_levantamiento.py` |
| Mié 30 | Pedir los contenedores y lo que falte | Compras (supply chain) | hoja `Piloto_costo` |
| Jue 1 | Medir el C6 impreso (peso, horas y ajuste de las fichas) y decidir el orden de impresión | Ingeniería | `cad/README.md` |
| Jue 1 | Pasar a los dos proyectos huérfanos a ver si quedó herramienta FTS (Bridgestone SO10337, última asistencia 7 de agosto; Mission Foods SO11492, última 7 de julio) | Chofer y supervisor SR | hoja `Kits_huerfanos` |
| Vie 2 | Armar el carrito con lo que haya: 8444 existente, herramienta del listado, C6 impreso y plantillas de cartulina. Grabar las etiquetas | Taller e ingeniería | `etiquetas/`, `vista_3d_carrito.html` |
| Vie 2 | Línea base: contar lo que falta hoy en los packouts de Topo Chico y preguntar al encargado cuántos minutos por turno se van en buscar herramienta | Supervisor SR | `checklist_piloto.html` (hoja de línea base) |

**Semana 1: arranque (lunes 5 a viernes 9 de octubre)**

| Día | Qué se hace | Quién |
|---|---|---|
| Lun 5 | El chofer entrega el carrito en Topo Chico y se hace la primera salida de taller y entrada de caseta con el formato de la planta | Chofer y encargado del frente |
| Lun 5 | Plática de 15 minutos: cómo se abre, cómo se revisa al cierre y dónde se guarda. Se cambia la combinación | Supervisor SR y encargado del frente |
| Lun 5 a vie 9 | Diario: se abre al llegar; al cierre se revisa por foto cajón por cajón, se anotan los huecos y se resguarda con candado | Encargado del frente |
| Mar 6 a jue 8 | Se imprimen los cajones siguientes (prioridad: donde más se pierde, según la hoja `Reposicion_familia`: esmeriladora, cabezales de tarraja, pinzas de mano y de presión) | Ingeniería |
| Vie 9 | Medición semanal (abajo) y cambio de una plantilla de cartulina por un cajón impreso | Supervisor SR e ingeniería |

**Semana 2: operación normal (lunes 12 a viernes 16 de octubre)**

| Día | Qué se hace | Quién |
|---|---|---|
| Lun 12 | Llega el módulo TUB montado. Si es necesario, entrada de caseta | Chofer y encargado del frente |
| Diario | Igual que en la semana 1 | Encargado del frente |
| Mié 14 | Visita sin aviso: el supervisor SR revisa el carrito contra la checklist sin que el encargado lo prepare | Supervisor SR |
| Vie 16 | Medición semanal. Se ajustan las fichas que no calzaron (una reimpresión como máximo por cajón) | Supervisor SR e ingeniería |

**Semana 3: prueba de cambio de frente (lunes 19 a viernes 23 de octubre)**

| Día | Qué se hace | Quién |
|---|---|---|
| Mar 20 | Si el plan manda al encargado a otra planta, se ensaya la entrega a otro técnico con asistencia en Topo Chico: cambio de combinación y firma en la checklist | Manager de operaciones (plan), supervisor SR y los dos técnicos |
| Diario | Revisión de cierre | Encargado del frente en turno |
| Vie 23 | Medición semanal | Supervisor SR |

**Semana 4: cierre (lunes 26 a viernes 30 de octubre)**

| Día | Qué se hace | Quién |
|---|---|---|
| Lun 26 a jue 29 | Operación normal | Encargado del frente |
| Jue 29 | Conteo completo del carrito contra la lista | Supervisor SR y taller |
| Vie 30 | Medición final, decisión de escalar o no, y reporte en el issue | Manager de operaciones y supervisor SR. Decide la dirección |

## Qué se mide cada viernes

| Clave | Indicador | Cómo | Meta al cierre |
|---|---|---|---|
| M1 | Días con revisión de cierre completa / días trabajados | Checklist firmada y fotos en SharePoint | 90 % o más |
| M2 | Piezas faltantes detectadas en la revisión de cierre | Checklist | Se cuentan; no hay meta |
| M3 | Piezas perdidas de verdad (faltan más de 48 horas) | Checklist del día siguiente | 0, o 1 de menos de $300 |
| M4 | Minutos de la revisión de cierre | Hora de inicio y de fin en la checklist | 5 minutos o menos en promedio en la semana 4 |
| M5 | Minutos por turno buscando herramienta | Una pregunta al encargado cada viernes | Bajar contra la línea base de la semana 0 |
| M6 | Días con el carrito resguardado con candado al cierre | Foto del candado | 95 % o más |
| M7 | Salidas y entradas de caseta rechazadas | Checklist | 0 en las semanas 3 y 4 |
| M8 | Fichas que hubo que reimprimir | Registro de ingeniería | 1 por cajón como máximo |
| M9 | Compras de reposición para el frente | Odoo, órdenes de compra de la semana (solo lectura) | 0 por pérdida |

## Criterio de éxito

El piloto pasa si al viernes 30 de octubre se cumplen **M1, M3, M4, M6 y M7**, y el encargado del frente y el supervisor SR dicen que se queda.

## Criterio para escalar

Se escala si:
- el piloto pasó;
- el conteo físico está cerrado;
- el PETG real por cajón está medido en al menos 4 cajones.

Si se cumplen las tres, el siguiente lote son **2 carritos base, no 5**:
- uno para Bridgestone SO11699, que lleva módulo eléctrico;
- uno de reserva en el taller.

El resto se decide con el M3 y el M5 de 8 semanas y no de 4.

Si el piloto no pasa, se corrige la causa y se corre otro ciclo de 2 semanas. Si falla dos veces por la misma causa, se rediseña antes de comprar más.

## Supuestos

| Clave | Supuesto | Por qué |
|---|---|---|
| S1 | Los cajones sin imprimir usan una plantilla de cartulina amarilla con la silueta | Imprimir todo son 538 horas y no cabe antes del lunes 5 |
| S2 | El módulo es TUB | Topo Chico es tubería de proceso (dimensionamiento de la Fase 5). Si el frente real es eléctrico, se cambia a ELE ($11,215.31 por unidad según `Por_unidad`) |
| S3 | La existencia es la del listado 2025 | El conteo se hace el martes 29. Si falta mucho, el costo va hacia la columna "si nada del listado aparece" |
| S4 | No está confirmado si Topo Chico permite fotos dentro de la planta | Si no las permite, la revisión de cierre se hace en el lugar de resguardo o solo con la checklist. El formato real de caseta se pide en la semana 0 |
| S5 | La revisión la firma el encargado del frente, y el supervisor SR hace una visita sin aviso a la semana | Así lo asigna la hoja `Asignacion_por_rol` de `asignacion_y_compra.xlsx` |
