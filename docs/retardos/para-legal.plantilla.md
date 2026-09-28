# Retardos: paquete para Legal

Preparado el @@FECHA@@ para la revisión de Legal y Recursos Humanos. Issue #334.

Este documento explica qué hace el nuevo control de retardos de FTS y copia **tal cual** los textos que hoy salen en los correos y en las hojas. Todos los ejemplos usan datos inventados ("Laura Demo", folio RET-2026-0041). Al final vienen las preguntas que necesitamos que Legal conteste antes de encender el sistema con empleados reales.

Hoy el sistema funciona en **modo sombra**: detecta y arma todo, pero ningún correo le llega a un empleado. Cada correo se desvía a Dirección y RH con la etiqueta [SOMBRA].

## 1. Qué hace el sistema y qué no hace

**Sí hace:**

- Revisa dos veces al día la primera checada de cada persona en el kiosko y la compara con su hora de entrada registrada más **15 minutos de tolerancia, al segundo**: llegar 15:00 después no es retardo, 15:01 sí. Todo en hora del centro (CST).
- Cuenta los retardos de cada persona en el mes, de lunes a viernes. **Sábado y domingo nunca son retardo.** No cuentan los días de permiso, vacaciones, incapacidad, trabajo fuera o feriado, ni los días donde la checada está en disputa o hubo un olvido de entrada registrado.
- Cuando alguien llega a cierto número de retardos en el mes, abre un **caso con folio** (por ejemplo RET-2026-0041).
- En el aviso (nivel 1) le manda un correo informativo a la persona.
- En carta compromiso y acta **le manda la hoja a Recursos Humanos** (con copia al jefe directo) para que **RH cite a la persona y recolecte la firma** en papel. A la persona le llega un **aviso informativo** con la misma hoja en PDF, para que la conozca antes de la cita; no tiene que contestarlo.
- RH sube la hoja firmada (o la negativa con dos testigos). Un lector automático sugiere si la hoja está completa, y **RH confirma**.
- Si la persona contesta el correo con la hoja firmada, también se acepta.
- Le recuerda a RH cuando se vence el plazo y avisa a Dirección si sigue sin hoja.
- Deja registro de todo en una bitácora que no se puede editar ni borrar.

**No hace:**

- **No sanciona a nadie.** Ninguna medida se aplica sola. Una suspensión sólo existe si RH la programa a mano en el panel, después de escuchar a la persona.
- No descuenta nada de la nómina.
- No escribe en el expediente de Odoo mientras esté en modo sombra.
- No decide si una hoja está bien firmada. El lector sólo **sugiere** (por ejemplo "falta la firma del testigo 2"); la confirma una persona de RH mirando el archivo, y ningún caso se cierra solo.

**Sin suspensiones (así está configurado hoy):** aviso, carta compromiso y acta funcionan. Si alguien llega al nivel de suspensión, el caso queda registrado como **"nivel de suspensión alcanzado, no aplicado"**, cuenta como antecedente, y **no se le manda nada** a la persona. El sistema lleva la cuenta de la reincidencia y, si se repite, **recomienda** a Dirección y RH activar las suspensiones; nunca las activa solo. Activarlas requiere que Legal confirme el Reglamento y los textos (ver preguntas).

## 2. La escalera propuesta (pendiente de confirmar)

| Nivel | Medida | Se abre con | Plazo para firmar | Testigos |
|---|---|---|---|---|
| 1 | Aviso (informativo, no se firma) | 1 retardo en el mes | No aplica | No |
| 2 | Carta compromiso | 3 retardos | 3 días hábiles | No |
| 3 | Acta administrativa | 5 retardos | 3 días hábiles | Dos |
| 4 | Citatorio y propuesta de suspensión | 7 retardos | 3 días hábiles | Dos |

Si una persona ya firmó un documento y vuelve a llegar tarde dentro de los 30 días siguientes, el nuevo caso sube directo al siguiente nivel (reincidencia).

Los números están medidos contra datos reales en el issue #334 (Tarea 3). Con las horas de entrada que hoy tiene Odoo, una de cada cuatro personas llegaría cada mes al nivel de suspensión. Por eso RH está revisando primero la hora de entrada de cada quien.

## 2b. Jornada semanal (nuevo, reglas del 28-sep-2026)

Además de los retardos, el sistema revisa la **jornada semanal**: 48 horas efectivas de **viernes a jueves**, en hora del centro, ya descontados 30 minutos de comida por cada día trabajado. Sábado y domingo no son retardo, pero sus horas sí cuentan para la semana.

- Un feriado, permiso, incapacidad, vacaciones o día que RH marcó como que no cuenta **baja 9.6 horas** lo que se exige esa semana.
- Si los datos están incompletos (entrada sin salida, una asistencia de más de 16 horas, una incidencia abierta), **no sale ningún aviso**: la semana va a RH para que la revise.
- Si una semana queda abajo, sale un **aviso** a la persona con copia a RH y al jefe, con el día a día y un plazo para corregir si fue olvido de checada. Al **tercer aviso** dentro de 90 días, la persona recibe una hoja con QR que RH imprime y recolecta, igual que la carta compromiso, y se abre una **propuesta de medida** (descuento de tiempo no laborado) que **queda retenida**: no se aplica ni se manda a Nómina.
- Todos los textos de jornada están marcados **"pendiente de validación de RH"**.

**Primer y segundo aviso, a la persona (copia a RH y al jefe)**

@@CORREO_JOR_1@@

**Tercer aviso, a la persona**

@@CORREO_JOR_3@@

**Tercer aviso, a RH para recolectar la hoja**

@@CORREO_JOR_RH@@

**Hoja del tercer aviso**

@@HOJA_JOR3@@

**Comunicado de arranque a toda la plantilla** (lo manda RH una vez, antes del 1 de octubre)

@@CORREO_COMUNICADO@@

## 3. Los textos tal como salen hoy

### 3.1 Correos a la persona

> Estos textos son del diseño original, en el que la persona recibía la hoja y la devolvía firmada. Con el flujo actual (RH recolecta), para carta y acta la persona recibe el **aviso informativo** de la sección 3.2 y la hoja va a RH. Se conservan aquí porque siguen en la base y porque Legal puede preferir alguno de los dos.

Cada correo sale de `sales@fts.mx`. El folio va entre corchetes en el asunto para que la respuesta encuentre su caso.

**Aviso (nivel 1)**

@@CORREO_AVISO@@

**Carta compromiso (nivel 2)**

@@CORREO_CARTA@@

**Acta administrativa (nivel 3)**

@@CORREO_ACTA@@

**Citatorio por reincidencia (nivel 4, hoy no se aplica: modo sin suspensión)**

@@CORREO_SUSPENSION@@

### 3.2 Flujo actual: RH recolecta la firma

**A Recursos Humanos, con copia al jefe directo y la hoja en PDF** (carta compromiso o acta)

@@CORREO_RH_RECOLECTAR@@

**A la persona, informativo, con la misma hoja en PDF**

@@CORREO_AVISO_TRABAJADOR@@

**A RH cuando se vence el plazo** (con copia al jefe directo)

@@CORREO_RECORDATORIO_RH@@

**A Dirección, con copia a RH, cuando se vence por segunda vez**

@@CORREO_ESCALAMIENTO_RH@@

### 3.2b Otros correos del ciclo (diseño original)

**Cuando la persona no tiene correo válido** (va a su supervisor para entrega en papel)

@@CORREO_SUPERVISOR@@

**Cuando responde sin la hoja o con un archivo que no se puede leer**

@@CORREO_PIDE_HOJA@@

**Cuando se vence el plazo** (con copia al supervisor y a RH)

@@CORREO_RECORDATORIO@@

### 3.3 Las hojas en PDF

Cada hoja lleva el nombre de la empresa, el folio, la fecha, el nombre y puesto de la persona, el periodo, la tabla de retardos (fecha, hora de llegada, hora de entrada, minutos tarde) y, salvo el aviso, un espacio de **comentarios del trabajador** y los renglones de firma. Este es el texto principal de cada una:

@@HOJA_AVISO@@

@@HOJA_CARTA@@

@@HOJA_ACTA@@

@@HOJA_SUSPENSION@@

En la carta compromiso y en el acta se agrega este párrafo, **pendiente de validación de Legal** (no lo hemos puesto a prueba contra el Reglamento, porque no lo tenemos):

> @@HOJA_REINCIDENCIA@@

Cada hoja lleva además el **folio en grande** y un **código QR** en cada página (sólo contiene el folio, el nivel y el número de página), para que el lector la identifique aunque sea una foto de celular.

Recuadros de firma: trabajador, Recursos Humanos, jefe directo, y dos testigos. Una casilla **"Se negó a firmar (se requieren dos testigos)"** y un recuadro de **comentarios del trabajador**. Al pie:

> @@HOJA_PIE@@

**Muestras en PDF con datos inventados:**

@@MUESTRAS@@

## 4. Derecho de audiencia

- **Cada hoja** (salvo el aviso) trae un espacio para que la persona escriba su versión antes de firmar.
- **Cada correo** le dice que, si no está de acuerdo con algún retardo, responda explicando el motivo, porque "tiene derecho a ser escuchado".
- **Si la persona impugna**, RH lo registra en el panel con la versión de la persona. El caso queda en estado "Impugnado" hasta que RH resuelve: o lo cancela (procede la impugnación), o vuelve a pedir la firma, o sigue adelante.
- **Antes de cualquier suspensión** se manda un citatorio, no una sanción. RH escucha a la persona y sólo después puede programar la suspensión, de 1 a 8 días hábiles. El sistema no deja capturar 0 ni más de 8 días.
- **Cancelar un caso** exige escribir el motivo, que queda en la bitácora.

## 5. Negativa a firmar

Si la persona se niega a firmar, RH marca la casilla "Se negó a firmar" en la misma hoja, recaba la firma de **dos testigos**, y al confirmarla en el panel escribe **el nombre completo de los dos** (el sistema no deja registrarlo con uno o sin ninguno). También puede subir una constancia de negativa aparte. El caso queda en "Se negó a firmar" y la bitácora guarda quiénes fueron los testigos y cuándo.

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
2. **Si no existe o no prevé la suspensión:** ¿qué medidas se pueden aplicar mientras tanto? Así está hoy: aviso, carta compromiso y acta, sin suspensiones, hasta tenerlo. ¿Es correcto aplicar el acta sin el Reglamento?
3. **Textos:** ¿están bien la carta compromiso, el acta y el citatorio tal como están arriba? ¿Qué cambiarían?
4. **Citar artículos:** ver la sección 8.
5. **Firma en persona:** ahora RH cita a la persona y recolecta la firma en papel; el correo a la persona es sólo informativo. ¿Está bien así? ¿Debe estar presente alguien además de RH (el jefe directo)?
6. **Derecho de audiencia:** ¿alcanza con el espacio de comentarios, la impugnación en el panel y el citatorio previo a la suspensión?
7. **Negativa a firmar:** ¿qué debe decir la constancia que firman los testigos? ¿Pueden ser compañeros de trabajo o debe ser alguien en particular?
8. **Plazos:** ¿3 días hábiles para firmar y 2 para que RH valide son razonables?
9. **Sábados:** para quienes trabajan seis días según su contrato, ¿el sábado debe contar para retardos?
10. **Conservación de las hojas firmadas:** ¿cuánto tiempo se guardan y quién puede verlas además de RH?
11. **Correo personal:** 13 de 29 personas tienen registrado un correo personal (no de la empresa). ¿Se les puede notificar ahí o sólo al correo de la empresa o en papel?
12. **Párrafo de reincidencia** (carta y acta, sección 3.3): ¿se queda, se cambia o se quita?
13. **Antecedentes al activar suspensiones:** el día que se activen, ¿las actas firmadas antes de esa fecha cuentan como antecedente para una suspensión por reincidencia? Hoy el sistema dice que **no**, y no aplica ninguna suspensión por retardos anteriores a la activación.
14. **Descontar tiempo no laborado (arts. 107 y 110 LFT):** el art. 107 prohíbe multas al trabajador y el 110 limita los descuentos al salario a casos específicos. ¿Descontar las horas de una semana incompleta es pagar sólo el tiempo trabajado (permitido) o un descuento que el 110 no prevé? ¿Hace falta firma de la persona, una cláusula en el contrato o en el Reglamento? Mientras Legal no conteste, la propuesta de medida **queda retenida** y no llega a Nómina.
15. **Comida en fin de semana:** hoy se descuentan 30 minutos de comida el sábado o domingo sólo si la persona trabajó 6 horas o más ese día. ¿Es correcto, o la comida debe descontarse siempre, o nunca, en fin de semana?
16. **Calendario contra regla:** los horarios de Odoo son de 10 horas de presencia por día (9.5 efectivas), o sea 47.5 horas a la semana. La regla de 48 pide 10.1 horas de presencia diaria. ¿Qué manda si difieren: el calendario firmado o la regla?
