# Especificación de la aplicación de herramientas (Herramientas MX)

Proyecto Herramientas MX · issue #325 · Fase 6.
Prototipo navegable con datos de ejemplo: [`prototipo_app.html`](prototipo_app.html).

## 1. Principio de diseño

**La herramienta vive en la planta del cliente, no en FTS ni en la camioneta.** La app no intenta que la herramienta regrese cada día. Lo que controla es **dónde está cada kit, quién responde por él y cuándo se revisó por última vez**. Además elimina el papeleo diario de caseta, que es lo que hoy empuja a dejar la herramienta sin control.

**La unidad de control es el KIT**, no la pieza suelta. Un kit es un carrito base más los módulos montados. Cada pieza tiene número de activo, pero la persona opera el kit: una revisión, un resguardo, un formato de caseta.

## 2. Estados del kit

| Estado | Significa | Dónde está | Quién responde |
|---|---|---|---|
| `EN_TALLER` | En FTS, disponible o en reposición | Taller FTS | Taller (Eduardo) |
| `EN_TRANSITO` | Salió de un lugar y no ha llegado al otro | Camioneta | Chofer o quien lo mueve |
| `EN_USO` | En planta, con el frente trabajando hoy | Planta | Encargado del frente |
| `RESGUARDADO` | En planta, cerrado en el lugar asignado por el cliente, sin uso en este momento | Gabinete, jaula o cuarto | Responsable FTS de esa planta |
| `EN_TRANSFERENCIA` | Asignado a otra planta u otro responsable, sin confirmar la entrega | Origen o camioneta | Quien entrega hasta que quien recibe confirma |
| `EXTRAVIADO` | No aparece en la revisión, o nadie confirma dónde está | Desconocido | Supervisor SR (escalado a Felipe) |

**Transiciones permitidas.** Todas se hacen desde el celular con foto, hora, GPS y responsable.

```
EN_TALLER ──salida──▶ EN_TRANSITO ──llegada (caseta entrada)──▶ EN_USO
EN_USO ⇄ RESGUARDADO                (fin/inicio de jornada; foto del lugar cerrado)
EN_USO | RESGUARDADO ──reasignación──▶ EN_TRANSFERENCIA ──recibe──▶ EN_USO (otra planta o responsable)
EN_USO | RESGUARDADO ──retiro (caseta salida)──▶ EN_TRANSITO ──llega a FTS──▶ EN_TALLER
cualquiera ──revisión no lo encuentra / transferencia > 48 h──▶ EXTRAVIADO ──aparece──▶ estado previo
```

**Reglas duras** (la app no deja avanzar si no se cumplen):
1. **Sin foto no hay cambio de estado.** El GPS se guarda con su precisión; si la precisión es mayor a 100 m, se marca y no se bloquea (hay plantas con mala señal).
2. **Responsable vivo.** El responsable debe ser un empleado activo en `empleados-master.json` que tenga asistencia en esa planta hoy o ayer. Nadie puede ser responsable de un kit en una planta donde no está.
3. **`RESGUARDADO` exige** un lugar del catálogo de lugares de esa planta (nunca "cajón general"), una foto del lugar cerrado y el candado registrado.
4. **Una persona no puede cerrar su cambio de planta** mientras tenga un kit a su nombre en la planta que deja (ver 5.4).

## 3. Pantallas

Todas están pensadas para celular, con una mano, en planta.

| # | Pantalla | Quién | Qué hace |
|---|---|---|---|
| P1 | **Mis kits** | Todo el que tenga un kit o sea de ese frente | Tarjeta por kit: estado, planta, última revisión, alertas; botón principal según estado |
| P2 | **Escanear** | Todos | Lee el QR del carrito o de una pieza y abre su ficha |
| P3 | **Ficha del kit** | Todos | Pila de módulos con cajones; historial de estados y fotos; responsable |
| P4 | **Salida de FTS** | Taller + encargado | Confirmar módulos montados, foto del carrito cerrado, destino (planta), camioneta |
| P5 | **Llegada a planta** | Encargado | Foto en caseta, GPS; genera el **formato de entrada de caseta** de esa planta con la lista exacta del kit |
| P6 | **Resguardo** | Encargado | Elegir lugar del catálogo, foto del lugar cerrado, candado; combinación registrada |
| P7 | **Revisión** | Encargado o segurista | Cajón por cajón: foto contra la silueta; marca faltantes. Menos de 10 minutos |
| P8 | **Reasignación** | Encargado, supervisor | Tarea bloqueante: qué pasa con el kit cuando cambia la planta o la persona |
| P9 | **Retiro de planta** | Encargado + chofer | Revisión completa + **formato de salida de caseta** + foto al subir |
| P10 | **Alertas** | Supervisor SR, Felipe | Bandeja de alertas por prioridad, con acción directa |
| P11 | **Catálogo de plantas** | Felipe, admin | Planta, cliente, geocerca, proyectos Odoo asociados, lugares de resguardo |
| P12 | **Combinaciones** | Supervisor SR, Felipe | Ver o cambiar combinaciones, protegido con PIN y registro de consulta |

## 4. Revisión diaria en menos de 10 minutos

**Cómo se llega a menos de 10 minutos:**
1. Escanear el QR del carrito (5 s).
2. La app muestra el primer cajón con su silueta dibujada (el SVG de `svg/`).
3. Se abre el cajón y se toma una foto. **La silueta impresa es de color contrastante (amarillo)**, así que un hueco se ve de inmediato.
4. Botones: `Completo` o tocar la pieza faltante sobre el dibujo. Cada cajón toma de 30 a 45 s.
5. Carrito base con 8 cajones usados más un módulo de 2 a 5 cajones: **de 10 a 13 cajones, entre 5 y 9 minutos.**

**Frecuencia:**
- **Diaria** cuando el kit está `EN_USO` (al cerrar la jornada).
- **Semanal** cuando está `RESGUARDADO` en una planta sin gente de FTS.

**X propuesta para la alerta de "sin revisión":**
- **Kit en uso:** alerta amarilla a 1 día hábil sin revisión y roja a 2.
- **Kit resguardado sin gente:** alerta a los **7 días**.

**Por qué esos valores:**
- La mediana de estancia de una persona en una planta es de 3 días con asistencia y el p75 es de 7 (Fase 3).
- Con 2 días sin revisar se puede perder la mitad de una estancia típica sin saberlo.
- Un kit guardado y sin gente cerca no se mueve, así que basta revisarlo una vez por semana. Esa revisión la hace quien pase por la planta.

**Fase 2 de la app (no en el MVP):** detección automática de huecos en la foto. Se compara la foto con la silueta amarilla: un hueco es una zona amarilla grande.

## 5. Flujos

### 5.1 Salida de FTS
1. En P1, el taller elige el kit `EN_TALLER` y pulsa **Preparar salida**.
2. Confirma los módulos montados. La lista de piezas del formato sale de ahí.
3. Hace una revisión completa (P7), porque es la línea base de esa salida.
4. Toma la foto del carrito cerrado, elige la planta destino y el responsable.
5. El kit pasa a `EN_TRANSITO`.

### 5.2 Llegada a planta y formato de caseta
1. Al llegar, el encargado pulsa **Llegué**. Se guardan la foto y el GPS, que se compara con la geocerca de la planta.
2. La app genera el **formato de entrada** de esa planta:
   - Encabezado de la planta (cliente, contratista FTS, SO/proyecto, fecha, responsable).
   - Tabla de todas las piezas del kit con **número de activo, descripción, marca y número de serie**.
   - Espacio para firma del vigilante.
   - Salida como PDF o imagen para enseñar en pantalla o imprimir.
3. **Se genera una sola vez por estancia:** el formato ampara el kit mientras se quede.
4. Cuando la planta tiene su propio formato, se captura su plantilla en el catálogo de plantas y la app llena ese.
5. El kit pasa a `EN_USO`.

### 5.3 Resguardo en planta
1. Al terminar la jornada, P6 pide:
   - **Lugar** del catálogo de esa planta ("gabinete FTS en cuarto eléctrico 2", "jaula de contratistas"). **No existe la opción "cajón general".**
   - **Foto del lugar cerrado** con el candado visible.
   - **Candado** (id del candado) y su **combinación**, que queda cifrada.
   - El **responsable FTS** de esa planta.
2. El kit pasa a `RESGUARDADO`. Al día siguiente, **Abrir** lo pasa a `EN_USO`.

### 5.4 Reasignación (el caso que hoy pierde herramienta)

**Qué dispara la tarea:**
1. **El plan nocturno de Felipe** (`/webhook/planeacion/dia`) asigna a una persona a otra planta. Esa persona es responsable de un kit en la planta que deja.
2. **El kiosko registra asistencia** de esa persona en otro proyecto o planta (`hr.attendance.x_studio_project_id`).
   - ⚠️ **No usar `x_studio_sales_order_2`**: guarda el id del proyecto, no el de la SO (#326).
3. **Una baja** en `empleados-master.json`.

**La tarea "¿Qué pasa con el kit FTS-CAR-02 en Topo Chico?"** se abre en P8 del responsable y de su supervisor. Tiene tres respuestas:

| Opción | Condición | Efecto |
|---|---|---|
| **Se queda con otro responsable** | El nuevo responsable debe tener asistencia en esa planta hoy o ayer | Él confirma con PIN y foto. El kit sigue `EN_USO` o `RESGUARDADO`. La combinación se cambia si el responsable anterior la conocía |
| **Se transfiere a otra planta** | Hay destino y quien recibe | `EN_TRANSFERENCIA`. Se generan salida de caseta en A y entrada en B |
| **Se retira a taller** | Planta sin más trabajo | Flujo de retiro (5.6) |

**No se puede cerrar el cambio sin resolverla:**
- Mientras la tarea esté abierta, la persona no puede tomar otro kit.
- A las 24 h la tarea escala al supervisor SR, y a las 48 h a Felipe.
- **Una transferencia que no se confirma en 48 h pasa a `EXTRAVIADO`.**

### 5.5 Revisión diaria (ver 4)

### 5.6 Retiro de planta
1. Revisión completa. Todo lo que falte queda como faltante con dueño.
2. Formato de **salida** de caseta con la misma lista de la entrada, marcando lo que sale.
3. Foto del kit cargado y paso a `EN_TRANSITO`. Al llegar a FTS, el taller confirma y el kit pasa a `EN_TALLER`.

### 5.7 Alertas automáticas

Un workflow de n8n corre **7:00 y 19:00 CST en días hábiles**.

| # | Alerta | Regla | A quién | Escala |
|---|---|---|---|---|
| A1 | **Kit huérfano** | Kit `EN_USO`/`RESGUARDADO` en planta P y **nadie de FTS con asistencia en los proyectos de P** en ≥ 2 días hábiles | Responsable + supervisor SR | 5 días hábiles → Felipe |
| A2 | **Proyecto cerrado o parado** | Proyecto de P en stage de cierre (7, 9, 10, 13, 8, 4, los mismos de `project/archive-budget-cierre`) **o** sin asistencia ≥ 10 días hábiles con SO abierta | Supervisor SR | Pide retiro o transferencia |
| A3 | **Sin revisión** | `EN_USO`: 1 día hábil (amarilla), 2 (roja). `RESGUARDADO` sin gente: 7 días | Responsable | Supervisor SR |
| A4 | **Faltante** | Revisión con hueco | Responsable + supervisor | 24 h sin resolver → Felipe; 72 h → `EXTRAVIADO` la pieza |
| A5 | **Combinación vieja** | Baja o rotación de alguien que conocía la combinación, sin cambio en 24 h | Supervisor SR | Felipe |
| A6 | **Tránsito o transferencia abierta** | `EN_TRANSITO`/`EN_TRANSFERENCIA` > 48 h | Quien entrega | → `EXTRAVIADO` |
| A7 | **Tarea de reasignación abierta** | > 24 h | Supervisor SR | 48 h → Felipe |

**Caso real de hoy** (Fase 3): SO10337 Bridgestone (última asistencia 7-ago-2026) y SO11492 Mission (7-jul-2026) siguen "In Progress" sin gente. **A1 y A2 los habrían marcado en agosto.**

## 6. Datos

Esquema `herramientas` en `fts-suite-db` (Postgres), con un rol propio, siguiendo las reglas de `db/README.md`. Este es un **borrador**, no una migración: la migración se escribe cuando se apruebe.

```
planta(id, nombre, cliente_partner_id, geocerca_lat, geocerca_lng, radio_m, formato_caseta_plantilla, activa)
planta_proyecto(planta_id, odoo_project_id)          -- una planta tiene varios proyectos; un proyecto una planta
lugar_resguardo(id, planta_id, nombre, tipo[gabinete|jaula|cuarto|baul_fts], foto_ref, activo)
kit(id 'FTS-CAR-NN', estado, planta_id, lugar_id, responsable_employee_id, actualizado_en)
contenedor(id 'FTS-MOD-NN-Kk', kit_id, modelo, modulo[BAS|ELE|SOL|TUB|CIV|MED])
candado(id, contenedor_id, combinacion_cifrada, cambiada_en, conocida_por employee_id[])
activo(id 'FTS-MOD-NN-Cc-pp', contenedor_id, cajon, descripcion, marca, numero_parte, numero_serie, rfid_epc, estado[ok|faltante|baja])
evento(id, kit_id, tipo, estado_antes, estado_despues, employee_id, ts, lat, lng, precision_m, foto_ref, nota)
revision(id, kit_id, employee_id, ts, duracion_s, faltantes activo_id[], fotos foto_ref[])
alerta(id, tipo[A1..A7], kit_id, abierta_en, cerrada_en, nivel, destinatarios)
tarea_reasignacion(id, kit_id, disparador[plan|kiosko|baja], employee_id, abierta_en, resuelta_en, opcion, detalle)
```

- **Fotos:** comprimidas en el celular (JPEG q0.7, lado mayor 1600 px, ≈ 300 KB). Se guardan como `ir.attachment` en el `project.project` de la planta, según la decisión de `docs/SPRINT_1_FASE_4_DECISIONES.md:31` de nunca guardarlas en el repo público. `foto_ref` es el id del adjunto.
- **Combinaciones:** cifradas en la base, **nunca** en `users-suite.json` ni en el repo. Solo las ve quien tiene el scope `herramientas.combinaciones`, y cada consulta queda registrada.
- **Personas:** solo `hr.employee.id`. El nombre se resuelve en pantalla. El número de activo nunca lleva nombre.

## 7. Integraciones

| Fuente | Para qué | Cómo | Estado |
|---|---|---|---|
| Kiosko `hr.attendance.x_studio_project_id` | Quién estuvo en qué planta cada día (A1, reasignación) | Workflow n8n lee Odoo; mapea proyecto a planta con `planta_proyecto` | ✅ Existe. ⚠️ No usar el campo de SO (#326) |
| Plan nocturno `/webhook/planeacion/dia` | Anticipar reasignaciones la noche anterior | Se lee al guardar el plan | ⚠️ **Confirmar que el workflow de guardado está vivo** (`DIAGNOSTICO_CARGA_MO.md:178`) |
| `project.project.stage_id` | A2 proyecto cerrado | Lectura en el cron | ✅ |
| `empleados-master.json` | Responsables activos, bajas (A5) | Ya se sincroniza a diario a las 6 am | ✅ |
| Geocercas `shared/public-config.json` | Validar llegada y resguardo | Se leen, y se agregan las plantas nuevas al catálogo | ⚠️ Solo hay 5; hay que capturar las plantas |
| Auth | Login de la app | `shared/auth-jwt.js` (JWT del servidor, scopes `herramientas.*`) | ✅ Patrón existente |

**Webhooks nuevos (n8n):**
- `GET /herramientas/mis-kits`
- `GET /herramientas/kit`
- `POST /herramientas/evento`
- `POST /herramientas/revision`
- `POST /herramientas/reasignacion`
- `GET /herramientas/caseta` (PDF)
- Cron `herramientas/alertas`

**Todos validan el JWT en el body** (§15 #5 de CLAUDE.md). **El nodo que consume un secreto va envuelto en `try/catch`** (§9).

## 8. Fuera de alcance del MVP
- Lectura RFID en la app (fase 2; el hardware se especifica en `plan_fabricacion.md`).
- Detección automática de huecos en la foto.
- Integración con `stock.lot` de Odoo. Se evalúa cuando el catálogo de activos esté estable.
