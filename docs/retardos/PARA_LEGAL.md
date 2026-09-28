# Retardos: paquete para Legal

Preparado el 28 de septiembre de 2026 para la revisión de Legal y Recursos Humanos. Issue #334.

Este documento explica qué hace el nuevo control de retardos de FTS y copia **tal cual** los textos que hoy salen en los correos y en las hojas. Todos los ejemplos usan datos inventados ("Laura Demo", folio RET-2026-0041). Al final vienen las preguntas que necesitamos que Legal conteste antes de encender el sistema con empleados reales.

Hoy el sistema funciona en **modo sombra**: detecta y arma todo, pero ningún correo le llega a un empleado. Cada correo se desvía a Dirección y RH con la etiqueta [SOMBRA].

## 1. Qué hace el sistema y qué no hace

**Sí hace:**

- Revisa dos veces al día la primera checada de cada persona en el kiosko y la compara con su hora de entrada registrada más 20 minutos de tolerancia.
- Cuenta los retardos de cada persona en el mes, de lunes a viernes. No cuentan los días de permiso, vacaciones, incapacidad, trabajo fuera o feriado, ni los días donde la checada está en disputa o hubo un olvido de entrada registrado.
- Cuando alguien llega a cierto número de retardos en el mes, abre un **caso con folio** (por ejemplo RET-2026-0041) y le manda un correo con una hoja en PDF para firmar.
- Recibe la hoja firmada cuando la persona responde el correo, y avisa a RH para que la revise.
- Recuerda cuando se vence el plazo y avisa a Dirección si sigue sin respuesta.
- Deja registro de todo en una bitácora que no se puede editar ni borrar.

**No hace:**

- **No sanciona a nadie.** Ninguna medida se aplica sola. Una suspensión sólo existe si RH la programa a mano en el panel, después de escuchar a la persona.
- No descuenta nada de la nómina.
- No escribe en el expediente de Odoo mientras esté en modo sombra.
- No decide si una hoja está bien firmada: eso lo revisa una persona de RH mirando el archivo.

**Arranque suave (así está configurado hoy):** aunque la escalera tiene cuatro niveles, por ahora sólo se notifican el **aviso** y la **carta compromiso**. Si alguien llega al nivel de acta o de suspensión, el caso queda registrado como "nivel alcanzado, no notificado" para que RH lo atienda en persona, y **no se le manda ningún correo**. Las actas y suspensiones se habilitan sólo cuando Legal confirme el Reglamento Interior.

## 2. La escalera propuesta (pendiente de confirmar)

| Nivel | Medida | Se abre con | Plazo para firmar | Testigos |
|---|---|---|---|---|
| 1 | Aviso (informativo, no se firma) | 1 retardo en el mes | No aplica | No |
| 2 | Carta compromiso | 3 retardos | 3 días hábiles | No |
| 3 | Acta administrativa | 5 retardos | 3 días hábiles | Dos |
| 4 | Citatorio y propuesta de suspensión | 7 retardos | 3 días hábiles | Dos |

Si una persona ya firmó un documento y vuelve a llegar tarde dentro de los 30 días siguientes, el nuevo caso sube directo al siguiente nivel (reincidencia).

Los números están medidos contra datos reales en el issue #334 (Tarea 3). Con las horas de entrada que hoy tiene Odoo, una de cada cuatro personas llegaría cada mes al nivel de suspensión. Por eso RH está revisando primero la hora de entrada de cada quien.

## 3. Los textos tal como salen hoy

### 3.1 Correos a la persona

Cada correo sale de `sales@fts.mx`. El folio va entre corchetes en el asunto para que la respuesta encuentre su caso.

**Aviso (nivel 1)**

**Asunto:** [RET-2026-0041] Aviso de retardo

Hola Laura Demo:

El control de asistencia registró retardos en el periodo 2026-09. Este correo es un **aviso informativo** y no requiere respuesta.

| Fecha | Hora de llegada | Hora de entrada | Minutos tarde |
|---|---|---|---|
| 01/09/2026 | 07:31 | 07:00 | 31 |

Si alguno de estos días tenías permiso, estabas en campo o hubo un error en la checada, avisa a Recursos Humanos o a tu supervisor para corregirlo.

Recursos Humanos  
SERVICIOS FTS SA DE CV

**Carta compromiso (nivel 2)**

**Asunto:** [RET-2026-0041] Carta compromiso por retardos

Hola Laura Demo:

En el periodo 2026-09 acumulaste 3 retardos:

| Fecha | Hora de llegada | Hora de entrada | Minutos tarde |
|---|---|---|---|
| 01/09/2026 | 07:31 | 07:00 | 31 |
| 03/09/2026 | 07:24 | 07:00 | 24 |
| 08/09/2026 | 07:47 | 07:00 | 47 |

Te adjuntamos una **carta compromiso**. Por favor imprímela, fírmala y **responde a este mismo correo** con la hoja firmada (PDF o foto clara desde el celular) a más tardar el **01/10/2026**. No cambies el asunto: el folio RET-2026-0041 nos ayuda a encontrar tu caso.

Si no estás de acuerdo con algún retardo, responde explicando el motivo: tienes derecho a ser escuchado.

Recursos Humanos  
SERVICIOS FTS SA DE CV

**Acta administrativa (nivel 3, hoy retenida por el arranque suave)**

**Asunto:** [RET-2026-0041] Acta administrativa por retardos

Hola Laura Demo:

En el periodo 2026-09 acumulaste 5 retardos:

| Fecha | Hora de llegada | Hora de entrada | Minutos tarde |
|---|---|---|---|
| 01/09/2026 | 07:31 | 07:00 | 31 |
| 03/09/2026 | 07:24 | 07:00 | 24 |
| 08/09/2026 | 07:47 | 07:00 | 47 |
| 10/09/2026 | 07:26 | 07:00 | 26 |
| 14/09/2026 | 08:05 | 07:00 | 65 |

Se levanta un **acta administrativa** (adjunta). Preséntate con Recursos Humanos para firmarla ante dos testigos, o responde a este correo con la hoja firmada a más tardar el **01/10/2026**, sin cambiar el asunto.

Si no estás de acuerdo, responde explicando el motivo: tienes derecho a ser escuchado antes de cualquier medida.

Recursos Humanos  
SERVICIOS FTS SA DE CV

**Citatorio por reincidencia (nivel 4, hoy retenido)**

**Asunto:** [RET-2026-0041] Citatorio por reincidencia en retardos

Hola Laura Demo:

En el periodo 2026-09 acumulaste 7 retardos, después de haber firmado documentos previos:

| Fecha | Hora de llegada | Hora de entrada | Minutos tarde |
|---|---|---|---|
| 01/09/2026 | 07:31 | 07:00 | 31 |
| 03/09/2026 | 07:24 | 07:00 | 24 |
| 08/09/2026 | 07:47 | 07:00 | 47 |
| 10/09/2026 | 07:26 | 07:00 | 26 |
| 14/09/2026 | 08:05 | 07:00 | 65 |
| 17/09/2026 | 07:22 | 07:00 | 22 |
| 22/09/2026 | 07:38 | 07:00 | 38 |

Recursos Humanos te citará para escucharte antes de decidir una medida disciplinaria conforme al Reglamento Interior de Trabajo y a la Ley Federal del Trabajo. Adjuntamos el documento. Responde a este correo con la hoja firmada a más tardar el **01/10/2026**, sin cambiar el asunto.

Recursos Humanos  
SERVICIOS FTS SA DE CV

### 3.2 Otros correos del ciclo

**Cuando la persona no tiene correo válido** (va a su supervisor para entrega en papel)

**Asunto:** [RET-2026-0041] Entrega en físico: Carta compromiso para Laura Demo

Hola:

Laura Demo no tiene un correo válido registrado. Te pedimos imprimir el documento adjunto (Carta compromiso), entregárselo en físico y pedirle que lo firme. Después entrégalo a Recursos Humanos o respóndelo a este correo con la foto de la hoja firmada, sin cambiar el asunto.

| Fecha | Hora de llegada | Hora de entrada | Minutos tarde |
|---|---|---|---|
| 01/09/2026 | 07:31 | 07:00 | 31 |
| 03/09/2026 | 07:24 | 07:00 | 24 |
| 08/09/2026 | 07:47 | 07:00 | 47 |

Recursos Humanos  
SERVICIOS FTS SA DE CV

**Cuando responde sin la hoja o con un archivo que no se puede leer**

**Asunto:** RE: [RET-2026-0041] Falta la hoja firmada

Hola:

Recibimos tu respuesta al folio RET-2026-0041, pero no trae la hoja firmada o el archivo no se puede leer. Por favor responde a este correo adjuntando la hoja firmada en PDF o una foto clara tomada con el celular.

Recursos Humanos  
SERVICIOS FTS SA DE CV

**Cuando se vence el plazo** (con copia al supervisor y a RH)

**Asunto:** Recordatorio: [RET-2026-0041] Carta compromiso pendiente de firma

Hola Laura Demo:

Venció el plazo para entregar firmada la Carta compromiso del folio RET-2026-0041. Tienes hasta el **01/10/2026**. Responde a este correo con la hoja firmada, sin cambiar el asunto.

Con copia a tu supervisor y a Recursos Humanos.

Recursos Humanos  
SERVICIOS FTS SA DE CV

### 3.3 Las hojas en PDF

Cada hoja lleva el nombre de la empresa, el folio, la fecha, el nombre y puesto de la persona, el periodo, la tabla de retardos (fecha, hora de llegada, hora de entrada, minutos tarde) y, salvo el aviso, un espacio de **comentarios del trabajador** y los renglones de firma. Este es el texto principal de cada una:

**AVISO DE RETARDOS**

Por medio del presente se le informa que el control de asistencia registró los retardos que se detallan abajo. Este aviso es informativo.

**CARTA COMPROMISO**

Reconozco los retardos que se detallan abajo y me comprometo a presentarme puntualmente a mi jornada conforme a mi horario de entrada. Entiendo que la reincidencia puede dar lugar a un acta administrativa conforme al Reglamento Interior de Trabajo.

**ACTA ADMINISTRATIVA**

Se levanta la presente acta administrativa por los retardos que se detallan abajo, con fundamento en los artículos 20 y 134 fracciones I, III y V de la Ley Federal del Trabajo y en el Reglamento Interior de Trabajo. Antes de firmar, el trabajador puede manifestar lo que a su derecho convenga en el espacio de comentarios.

**CITATORIO Y PROPUESTA DE MEDIDA DISCIPLINARIA**

Por reincidencia en retardos después de documentos previos firmados, se cita al trabajador para ser oído antes de determinar una medida disciplinaria. Cualquier suspensión se aplicará conforme al Reglamento Interior de Trabajo y al artículo 423 fracción X de la Ley Federal del Trabajo, con un máximo de ocho días. La decisión es de Recursos Humanos.

Firmas que lleva cada hoja: firma del trabajador, Recursos Humanos, jefe directo, y en acta y citatorio además dos testigos. Al pie: "responda al correo del folio con esta hoja firmada (PDF o foto clara), sin cambiar el asunto".

**Muestras en PDF con datos inventados:**

- [muestra-aviso.pdf](muestras/muestra-aviso.pdf): aviso (1,738 bytes)
- [muestra-carta-compromiso.pdf](muestras/muestra-carta-compromiso.pdf): carta compromiso (2,717 bytes)
- [muestra-acta.pdf](muestras/muestra-acta.pdf): acta administrativa (3,259 bytes)
- [muestra-suspension.pdf](muestras/muestra-suspension.pdf): suspensión (3,811 bytes)

## 4. Derecho de audiencia

- **Cada hoja** (salvo el aviso) trae un espacio para que la persona escriba su versión antes de firmar.
- **Cada correo** le dice que, si no está de acuerdo con algún retardo, responda explicando el motivo, porque "tiene derecho a ser escuchado".
- **Si la persona impugna**, RH lo registra en el panel con la versión de la persona. El caso queda en estado "Impugnado" hasta que RH resuelve: o lo cancela (procede la impugnación), o vuelve a pedir la firma, o sigue adelante.
- **Antes de cualquier suspensión** se manda un citatorio, no una sanción. RH escucha a la persona y sólo después puede programar la suspensión, de 1 a 8 días hábiles. El sistema no deja capturar 0 ni más de 8 días.
- **Cancelar un caso** exige escribir el motivo, que queda en la bitácora.

## 5. Negativa a firmar

Si la persona se niega a firmar, RH lo registra en el panel con **el nombre completo de dos testigos** (el sistema no deja registrarlo con uno o sin ninguno) y sube la **constancia de negativa** firmada por los testigos. El caso queda en "Se negó a firmar" y la bitácora guarda quiénes fueron los testigos y cuándo.

## 6. Cómo se guardan las hojas y quién las ve

- Las hojas firmadas (PDF o foto) se guardan en una **base de datos privada de la empresa** (Postgres, en el servidor de la suite), no en correo, no en carpetas compartidas y no en el repositorio de código.
- Cada archivo se guarda con una **huella digital** (SHA-256): si alguien cambiara el archivo, la huella ya no coincidiría.
- Sólo entra al panel quien tiene permiso `retardos:read` en la Suite. Para registrar algo (validar, rechazar, negativa, suspensión) hace falta además `retardos:write`. Hoy **nadie** tiene esos permisos: los asigna Dirección.
- **Cada vez que alguien abre una hoja firmada queda registrado** en la bitácora: quién y cuándo.
- La bitácora **no se puede editar ni borrar**: la base de datos lo impide.
- Pendiente de definir: cuánto tiempo se conservan las hojas (ver preguntas).

## 7. Lo que encontramos sobre el Reglamento Interior de Trabajo

Buscamos en todos los sitios de SharePoint de la empresa y en los OneDrive de RH y Dirección. **No encontramos el Reglamento Interior de Trabajo.**

- Los contratos individuales (2023) dicen que el empleado **acepta cumplir el Reglamento Interior de Trabajo** (art. 422 LFT). Los de tiempo indeterminado dicen además que **"ha recibido un tanto del Reglamento Interior de Trabajo"** y que el contrato puede rescindirse por el **art. 47 LFT** o por incumplir el Reglamento.
- Los contratos de técnicos reparten la jornada de 48 horas en **seis días**. El sistema hoy sólo revisa de lunes a viernes.
- Ningún contrato menciona tolerancia, retardos ni suspensión.
- El checklist de ingreso de RH incluye "entrega de reglamento interno", o sea que el proceso supone que existe.
- En la carpeta de Legal hay un archivo llamado "Copia de constancia registro tribunal nuevo leon" (mayo 2023) que es un escaneo sin texto. No lo pudimos leer. **Podría ser la constancia de depósito del Reglamento.**

## 8. Sobre citar artículos de la ley

El sistema anterior (que funcionó de diciembre 2025 a abril 2026) mandaba por correo un "Acto Administrativo" que citaba los **artículos 20, 134 fracciones I, III y V, y 47** de la Ley Federal del Trabajo. El 47 es el de las causas de **rescisión** (despido justificado). Ese correo se mandó 128 veces a 24 personas, a una de ellas 33 veces, sin documento, sin firma y sin seguimiento.

Los textos nuevos **no citan el art. 47**. El acta cita los artículos 20 y 134 fracciones I, III y V, y el citatorio cita el 423 fracción X (límite de 8 días de suspensión).

**Pregunta para Legal:** ¿los textos deben citar artículos o no? Si sí, ¿cuáles, en qué documento y con qué redacción? Si no, lo quitamos.

## 9. Preguntas para Legal

1. **Reglamento Interior de Trabajo:** ¿existe?, ¿dónde está?, ¿está depositado ante la autoridad laboral (art. 424 fr. IV LFT)?, ¿qué dice de puntualidad, tolerancia, retardos, faltas por retardos, medidas disciplinarias y suspensión? ¿El archivo escaneado de la carpeta de Legal es su constancia de depósito?
2. **Si no existe o no prevé la suspensión:** ¿qué medidas se pueden aplicar mientras tanto? Nuestra propuesta: dejar el sistema sólo en aviso y carta compromiso (arranque suave) hasta tenerlo.
3. **Textos:** ¿están bien la carta compromiso, el acta y el citatorio tal como están arriba? ¿Qué cambiarían?
4. **Citar artículos:** ver la sección 8.
5. **Notificación por correo:** ¿basta el correo con la hoja firmada que regresa, o el acta y el citatorio deben firmarse siempre en papel, en persona y ante testigos?
6. **Derecho de audiencia:** ¿alcanza con el espacio de comentarios, la impugnación en el panel y el citatorio previo a la suspensión?
7. **Negativa a firmar:** ¿qué debe decir la constancia que firman los testigos? ¿Pueden ser compañeros de trabajo o debe ser alguien en particular?
8. **Plazos:** ¿3 días hábiles para firmar y 2 para que RH valide son razonables?
9. **Sábados:** para quienes trabajan seis días según su contrato, ¿el sábado debe contar para retardos?
10. **Conservación de las hojas firmadas:** ¿cuánto tiempo se guardan y quién puede verlas además de RH?
11. **Correo personal:** 13 de 29 personas tienen registrado un correo personal (no de la empresa). ¿Se les puede notificar ahí o sólo al correo de la empresa o en papel?
