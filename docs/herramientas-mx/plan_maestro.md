# Plan maestro de Herramientas MX

Sesión nocturna 2 (#338). Sale de `scripts/build_plan_maestro.py`, igual que `plan_maestro.xlsx` y `plan_maestro_gantt.html`. Las personas van solo por rol y las fechas son tentativas.

## Fases y compuertas

| Fase | Fechas | Objetivo | Entregables | Criterio para pasar | Quién decide | Costo de la fase | Acumulado |
|---|---|---|---|---|---|---|---|
| F0 Levantamiento | 29-Sep-2026 a 02-Oct-2026 | Saber que herramienta hay de verdad y medir las 40 piezas que deciden el acomodo | conteo_fisico.json y medicion_fisica.json ingestados; cajon C6 impreso y medido; costo del piloto con la existencia real | Conteo cerrado (100 % de los renglones con estado); 40 piezas medidas; C6 impreso y probado en el cajon real | Direccion (aprueba la compra del piloto) | $0 (Sin compra. PETG del C6 ya se tiene) | $0 |
| F1 Piloto en Topo Chico | 05-Oct-2026 a 30-Oct-2026 | Probar un carrito base con modulo TUB 4 semanas en la planta con mas gente | Carrito FTS-CAR-01 operando; checklist diaria; 4 mediciones de viernes (M1 a M9); reporte en el issue | M1 >= 90 %, M3 = 0, M4 <= 5 min, M6 >= 95 %, M7 = 0, el encargado del frente y el supervisor SR dicen que se queda; y decision de compra de 2 impresoras rapidas para F2 | Manager de operaciones propone; direccion decide | $26,255 (76,258 si nada del listado aparece) | $26,255 |
| F2 Lote de 2 bases | 02-Nov-2026 a 11-Dec-2026 | Carrito para Bridgestone SO11699 (con modulo ELE) y uno de reserva en el taller; usar la app MVP | FTS-CAR-02 y 03; modulo ELE; app MVP en uso; 8 semanas acumuladas de M3 y M5 | M3 y M5 de 8 semanas mejores que la linea base; costo real por carrito dentro de +-15 % del plan; app MVP sin perdidas de eventos | Direccion | $99,680 (148,053 si nada del listado aparece) | $125,935 |
| F3 App dentro de la suite | 05-Oct-2026 a 26-Feb-2027 | Pasar del prototipo a un modulo de la suite: MVP para el lote de 2 y completa antes de escalar | Issues H1 a H13 (seccion Ruta de la app); webhooks /herramientas/*; esquema herramientas en fts-suite-db | MVP (H1 a H7 y H9) en uso con el lote de 2 antes del 30-nov; completa (H8, H10 a H13) antes del 22-feb-2027 | Direccion aprueba el esquema de datos; manager de operaciones acepta cada entrega | $0 (Horas internas: 81 h estimadas (tabla de issues)) | $125,935 |
| F4 Escalamiento a 5 bases | 11-Jan-2027 a 26-Feb-2027 | Completar 5 carritos base y los modulos compartidos (ELE 2, SOL 2, TUB 2, CIV 1, MED 2) | FTS-CAR-04 y 05; 9 modulos; RFID si se aprueba; capacitacion de todos los encargados | Todos los carritos con revision diaria >= 90 % durante 4 semanas; alertas A1 a A7 activas; 0 kits huerfanos sin atender | Direccion | $190,995 (216,765 si nada del listado aparece; RFID aparte 20,076) | $316,930 |
| F5 Operacion estable | 01-Mar-2027 a 28-May-2027 | Que funcione sin el equipo del proyecto: revision semanal, bono ligado y reposicion con referencia | Tablero mensual; bono del encargado ligado a M1 y M3; procedimiento de alta y baja de piezas | 3 meses con reposicion por perdida < 25 % de la linea base y revision diaria >= 90 % | Direccion | $0 (Reposicion y reimpresion normales (se miden)) | $316,930 |

**Cómo sale el costo de cada fase:**
- Es la diferencia del costo de su configuración acumulada contra la de la fase anterior. El inventario que ya existe se consume primero.
- **Por eso el piloto sale barato y las fases siguientes compran más:** herramienta nueva, contenedores, candados y PETG.
- Las fechas de F3 corren en paralelo a F1 y F2.
- No hay actividad del 21 de diciembre al 8 de enero.

## Presupuesto por fase

| Fase | Configuración acumulada | Herramienta | Contenedores | Candados y cables | PETG | Total de la fase | Si nada del listado aparece |
|---|---|---|---|---|---|---|---|
| F1 | BASE 1, TUB 1 | $6,407 | $13,197 | $814 | $5,837 | **$26,255** | $76,258 |
| F2 | BASE 3, TUB 1, ELE 1 | $57,642 | $29,638 | $1,508 | $10,892 | **$99,680** | $148,053 |
| F4 | BASE 5, ELE 2, SOL 2, TUB 2, CIV 1, MED 2 | $102,373 | $65,003 | $3,036 | $20,583 | **$190,995** | $216,765 |
| RFID (opcional, F4) | tags + lector | | | | | $20,076 | |

**Total del plan sin RFID: $316,930.** Con RFID son $337,006.

Hay renglones sin precio que se cotizan aparte: dados 3/8, Torx, limas, grilletes y mangos. Los detalla `asignacion_y_compra.xlsx`.

**Sensibilidad** (mismos precios):

| Bases | Módulos | Total | kg PETG | Horas de impresión |
|---|---|---|---|---|
| 4 | compartidos | $267,788 | 51.01 | 2574.6 |
| 4 | dedicados | $475,850 | 78.05 | 3940.0 |
| 5 | compartidos | $316,930 | 58.95 | 2974.7 |
| 5 | dedicados | $614,037 | 97.56 | 4925.0 |
| 6 | compartidos | $366,072 | 66.88 | 3374.9 |
| 6 | dedicados | $752,224 | 117.07 | 5910.0 |

## Capacidad de impresión 3D

**Cómo se calculó:**
- 81.6 h efectivas por impresora a la semana (`plan_fabricacion.md`); la rápida imprime al doble.
- Gramos y horas con el factor medido del cajón C6 con losetas ligeras: 1.90 y 2.10. Con la loseta sólida eran 2.28 y 2.51.

| Fase | kg PETG | Horas estándar | Semanas con 1 estándar | Con 2 rápidas | Con 1 estándar + 2 rápidas |
|---|---|---|---|---|---|
| F0 | 0.67 | 33.6 | 0.4 | 0.1 | 0.1 |
| F1 | 9.22 | 465.2 | 5.7 | 1.4 | 1.1 |
| F2 | 17.21 | 868.2 | 10.6 | 2.7 | 2.1 |
| F4 | 32.52 | 1641.3 | 20.1 | 5.0 | 4.0 |

**Lectura:**
- **F1:** con la impresora estándar son 5.7 semanas contra 4 del piloto. Por eso el piloto imprime por prioridad y usa cartulina en el resto.
- **F2:** con una estándar son 10.6 semanas contra 6 de la fase. **No cabe sin impresoras rápidas.**
- **F4:** son 20.1 semanas con una estándar, contra 4.0 con una estándar más 2 rápidas.
- **La compra de 2 impresoras rápidas se decide en la compuerta G1 (30 de octubre), no después.** Ya no es F4 lo que las necesita: es el lote de 2.

## Ruta de la app (issues por crear, redactados aquí)

| Issue | Qué | Depende de | Horas | Entrega |
|---|---|---|---|---|
| H1 | Esquema herramientas en fts-suite-db y su migracion (tablas de especificacion_app.md §6) | - | 6 | MVP |
| H2 | Scopes herramientas.* en auth-jwt y pantalla de login de la app | - | 3 | MVP |
| H3 | Catalogo de plantas, lugares de resguardo y geocercas; liga planta-proyecto de Odoo | H1 | 5 | MVP |
| H4 | Catalogo de kits, contenedores y activos cargado desde diseno_carrito.json; QR de las etiquetas | H1 | 5 | MVP |
| H5 | Maquina de estados del kit y webhook POST /herramientas/evento (JWT en el body, try/catch en el nodo del secreto) | H1, H2 | 8 | MVP |
| H6 | Cola sin senal: IndexedDB, uuid unico, ts_evento real; reenvio idempotente | H5 | 8 | MVP |
| H7 | Revision de cierre con foto (ir.attachment en el proyecto) y registro de faltantes | H5 | 8 | MVP |
| H8 | Cron n8n de alertas A1 a A7 (lee hr.attendance.x_studio_project_id y stage del proyecto; nunca el campo de SO, #326) | H3, H5 | 10 | completa |
| H9 | Formato de caseta configurable por planta (PDF con la lista exacta del kit) | H3, H4 | 6 | MVP |
| H10 | Integracion kiosko: tarea de reasignacion al checar en otra planta | H5, H8 | 6 | completa |
| H11 | Integracion plan nocturno (planeacion/guardar): tareas de reasignacion la noche anterior (requiere #337 punto 2) | H10 | 5 | completa |
| H12 | Vista de direccion: kits por planta, dias sin revision, alertas y valor en planta | H5, H8 | 6 | completa |
| H13 | Combinaciones cifradas, scope herramientas.combinaciones y alerta A5 | H1, H2 | 5 | completa |

**Total: 81 h.**
- **MVP (H1 a H7 y H9):** para el lote de 2.
- **Completa:** antes de escalar a 5.

La especificación de cada pantalla, flujo y webhook está en `especificacion_app.md`; el prototipo, en `prototipo_app_v2.html`.

## Registro de riesgos

| Id | Riesgo | Probabilidad | Impacto | Mitigación | Dueño |
|---|---|---|---|---|---|
| R1 | Las medidas reales no coinciden con las del catalogo (0 % validado) | Alta | Medio | Levantamiento F0 antes de imprimir; chequeo 3D automatico al ingestar | Ingenieria |
| R2 | La impresion 3D no da abasto (2,975 h para el plan completo) | Alta | Alto | Losetas ligeras (hecho, -18 %); 2 impresoras rapidas antes de F4; imprimir solo lo que el piloto confirma | Ingenieria |
| R3 | El encargado deja de hacer la revision diaria | Media | Alto | Revision de 5 min por foto; A3 escala al supervisor; bono ligado a M1 en F5 | Supervisor SR |
| R4 | La planta no permite fotos o rechaza el formato de caseta | Media | Medio | Preguntar en F0; revision en el lugar de resguardo; formato configurable (H9) | Encargado del frente |
| R5 | Se sigue perdiendo herramienta por robo en planta, no por olvido | Media | Alto | Candado y cable en resguardo; combinacion cambia con cada rotacion (A5); registrar el tipo de perdida | Manager de operaciones |
| R6 | La reposicion registrada en Odoo no paga el plan (8.8 a 33 anios) | Alta | Alto | No escalar sin M3 y M5 medidos; caso v2 con Jeeves y horas perdidas; lote de 2 antes de 5 | Direccion |
| R7 | Rotacion de gente entre plantas deja kits huerfanos | Alta | Medio | Tarea de reasignacion con el plan nocturno y el kiosko (H10, H11); A1 | Supervisor SR |
| R8 | La app pierde eventos sin senal | Media | Alto | Cola con uuid y ts_evento real (H6); prueba de corte de red antes de F2 | Desarrollo |
| R9 | Un dato personal termina en el repo publico | Baja | Alto | Grep antes de cada commit; datos crudos en SharePoint; issues por rol (CLAUDE.md §9) | Desarrollo |
| R10 | La pila se voltea en rampa con cajones abiertos | Baja | Alto | Un cajon abierto a la vez; nunca abrir en pendiente (estabilidad.md); regla en la checklist | Encargado del frente |
| R11 | Contenedor agotado (8442 figura agotado) | Media | Bajo | Comprar contenedores del lote siguiente con una fase de anticipacion | Compras |
| R12 | El proyecto depende de una sola persona y se cae cuando cambia de prioridad | Alta | Alto | Dueno de proyecto con horas asignadas; revision semanal fija; todo en el issue | Direccion |

## Gestión del cambio

Los 7 u 8 intentos anteriores **no están documentados en el repo**. Las causas de esta tabla son **hipótesis** a validar con operaciones en la semana 0: una plática de 20 minutos con el supervisor SR y un encargado. Cada una tiene su control en una fase concreta.

| Causa probable (hipótesis) | Cómo lo evita este plan | Dueño |
|---|---|---|
| Nadie era dueno del kit: la herramienta era "de todos" | Kit con responsable por nombre en la app y firma diaria (F1) | Encargado del frente |
| La caja generica no deja ver que falta | Silueta amarilla por pieza: el hueco se ve en la foto (F1) | Ingenieria |
| Se revisaba solo cuando algo faltaba, ya tarde | Revision de cierre diaria de 5 min y medicion cada viernes (F1) | Supervisor SR |
| Al cambiar de planta la herramienta se quedaba sin dueno | Tarea de reasignacion con el plan nocturno y el kiosko (F3: H10, H11) | Manager de operaciones |
| Nadie media si funcionaba, y el esfuerzo se diluia | M1 a M9 cada viernes en el issue y compuertas con criterio (todas las fases) | Manager de operaciones |
| No habia consecuencia ni reconocimiento | Bono del encargado ligado a M1 y M3 (F5); reposicion con referencia del cajon | Direccion |
| El proyecto dependia de un impulso y se apagaba | Dueno dedicado con horas asignadas y revision semanal fija de 30 min | Direccion |
| Las alertas llegaban por WhatsApp y se perdian | Alertas A1 a A7 con escalamiento automatico (F3: H8) | Desarrollo |

**Cuatro reglas que no se negocian:**
1. **Un dueño del proyecto con horas asignadas.** Sin eso no arranca la F1.
2. **Revisión semanal de 30 minutos** con las métricas del viernes, en el issue.
3. **Ninguna fase arranca sin pasar la compuerta anterior.**
4. **El bono del encargado se liga a M1 y M3 desde la F5.** Si se decide antes, mejor.

## Próxima decisión de dirección

- **Compuerta F0, viernes 2 de octubre:** aprobar la compra del piloto, entre $26,255 y $76,258 según el conteo.
- **Nombrar al dueño del proyecto.**
- **Decidir en G1** la compra de las 2 impresoras rápidas que el lote de 2 ya necesita. Hay que cotizarlas: no tienen precio en el repo.
