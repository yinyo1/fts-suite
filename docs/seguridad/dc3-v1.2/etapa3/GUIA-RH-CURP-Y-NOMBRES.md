# DC-3 · Qué capturar en Odoo para que las constancias salgan solas

**Para:** Recursos Humanos · **Desde:** DC-3 v1.3.0 (#507) · **Medido:** 15-nov-2026

Desde la v1.3.0, en Seguridad → Panel del Instructor se puede **buscar al trabajador en Odoo** y la constancia DC-3 se llena con su nombre, CURP y puesto. Para que funcione sin capturar nada a mano, cada empleado activo necesita en Odoo **cuatro datos**:

| Dato del DC-3 | Dónde se captura en Odoo (Empleados → ficha de la persona) | Cómo |
|---|---|---|
| **CURP** | pestaña **Información privada** → campo **No. de identificación** | Los 18 caracteres, en mayúsculas, sin espacios ni guiones. |
| **Apellido paterno** | campo **Apellido paterno** (nuevo) | Tal como está en la CURP o el acta, con acentos y Ñ si los lleva. |
| **Apellido materno** | campo **Apellido materno** (nuevo) | Igual. Si no tiene, déjalo vacío. |
| **Nombre(s)** | campo **Nombre(s)** (nuevo) | Todos los nombres, en el orden del acta. |

El **puesto** ya está capturado en todas las fichas y no hay que hacer nada con él.

> Los tres campos de nombre son nuevos (se crearon el 15-nov). Dirección los acomoda primero en la ficha con Studio; mientras no aparezcan, avisa a Dirección.

**Si falta algo, la app no se detiene:** marca a la persona en rojo, pide capturarlo a mano para ese PDF y **no lo guarda en Odoo**. Por eso conviene corregirlo de raíz aquí.

## Quién falta (empleados activos de SERVICIOS FTS, 28 al 15-nov)

A **los 28** les faltan las dos cosas: la CURP y el nombre separado en apellidos.

Alejandro Reyes Galvez · Ana Laura Acevedo Flores · Ángel Ady Herrera Espinoza · Carlos Eduardo Manzanares · Eduardo Garza · Felipe Pérez Guzmán · Francisco Montalvo Ramirez · Gerardo Isai Lozano Davila · Germán Emmanuel Merino Falcón · Gilberto Gibran Solís Carrillo · Héctor Cruz Hernández · Jesus Esteban De La Cruz Calderon · Jésus Montalvo Ramirez · José Luis Romero Grados · Juan Daniel Duron Gomez · Juan De La Cruz Maldonado · Juan Manuel Sánchez Lugo · Juana Camarillo Torrez · Leonel Cruz Cristobal · Magaly Estefanía Pérez García · Manuel Eduardo Reyes · Mateo Salazar · Mauricio Briones Puente · Ramiro Segovia Lopez · Ricardo Alán Hernández González · Rissia Xavier de Araujo · Samuel Ulises Alcántara · Stephany Ventura Arevalo

**Ojo con estos cinco**, cuyo nombre en Odoo parece incompleto: confirma el apellido materno con su CURP o acta. Son Carlos Eduardo Manzanares (además, un registro archivado lo escribe «Manzanarez»), Eduardo Garza, Manuel Eduardo Reyes, Mateo Salazar y Samuel Ulises Alcántara.

La lista se actualiza sola: con permiso `rh:read`, el webhook `seguridad/dc3-empleados` (acción `faltantes`) devuelve quién falta y qué le falta. Nunca devuelve las CURP.
