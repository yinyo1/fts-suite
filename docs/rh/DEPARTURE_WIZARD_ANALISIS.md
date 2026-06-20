# RH Baja — `hr.departure.wizard` nativo vs nuestro `rh/empleado/archivar` (read-only, 2026-06-19)

> Análisis para igualar nuestra baja al comportamiento nativo de Odoo 19. **NO código, NO workflow.** Read-only (MCP UID 2).
> Relacionado: [`ALTA_BAJA_EMPLEADOS_DISENO.md`](ALTA_BAJA_EMPLEADOS_DISENO.md) · [`FASE1_WORKFLOWS_BUILD.md`](FASE1_WORKFLOWS_BUILD.md) · PR #54.

## 0. TL;DR
- El wizard de **esta** instancia (Odoo 19) tiene **14 campos**; los funcionales: `departure_reason_id`, `departure_date`, `departure_description`, `employee_ids`, + **3 checkboxes opcionales**: `set_date_end`, `remove_related_user`, `release_campany_car`.
- 🟢 **Nuestro `archivar` ya cubre el NÚCLEO** (active=false + los 3 campos departure). El `UPDATE active=false` directo **sí** dispara el `write()` de `hr.employee` (cascada nativa de archivado: resource, etc.) — no lo saltamos.
- 🔴 **Lo único que falta para igualar el nativo:** la opción **`set_date_end`** (poner fecha fin de contrato). `remove_related_user` es casi irrelevante (**solo 1 empleado activo tiene user**, y es cuenta de sistema). `release_campany_car` → fleet, no aplica a FTS.
- ⚠️ Este wizard **NO** tiene `cancel_leaves` ni `archive_private_address` (existen en otras versiones/módulos, **aquí no**) → la baja nativa **no** cancela permisos ni archiva direcciones. No hay nada que replicar ahí.
- **Todo es replicable con UPDATEs directos** — **no** hace falta ejecutar el wizard transient.

---

## A. Campos del wizard `hr.departure.wizard` (14)

| Campo | Tipo | Req | Qué hace al confirmar |
|---|---|---|---|
| `employee_ids` | m2m hr.employee | ✅ | A quién(es) aplica la baja (el wizard soporta multi-empleado). |
| `departure_reason_id` | m2o hr.departure.reason | ✅ | Motivo → se escribe en `hr.employee.departure_reason_id`. |
| `departure_date` | date | ✅ | Fecha de baja. **Label: "Contract End Date"** → se escribe en `hr.employee.departure_date` y, si `set_date_end`, como fin de contrato. |
| `departure_description` | html | ◻ | Nota libre → `hr.employee.departure_description`. |
| `set_date_end` | boolean | ◻ | **"Set the end date on the current contract."** → pone fecha fin en el contrato/versión actual (= `departure_date`). |
| `remove_related_user` | boolean | ◻ | **"If checked, the related user will be removed from the system."** → archiva/quita el `res.users` ligado (solo visible si el empleado tiene user). |
| `release_campany_car` | boolean | ◻ | Libera el auto de empresa asignado (módulo fleet). |
| `is_user_employee` | boolean (RO) | — | Computado: si el empleado tiene user ligado (controla la visibilidad de `remove_related_user`). |
| `display_name` / `id` / `create_uid` / `create_date` / `write_uid` / `write_date` | técnicos | — | Auditoría ORM, sin efecto funcional. |

> **No existen aquí:** `cancel_leaves`, `archive_private_address`. La baja nativa de esta instancia **no** toca `hr.leave` ni la dirección privada.

---

## B. Qué escribe el wizard al confirmar (`action_register_departure`), por modelo

Comportamiento estándar Odoo 19 (deducido del esquema + módulo `hr`):

| Modelo | Qué escribe | ¿Cuándo |
|---|---|---|
| **`hr.employee`** | `departure_reason_id`, `departure_description`, `departure_date` + **`active=False`** (vía `action_archive`) | **Siempre** (núcleo) |
| **contrato / `hr.version`** | fecha fin del contrato actual = `departure_date` (en Odoo 19 = `hr.employee.contract_date_end`, proxy a la versión) | Solo si **`set_date_end`** marcado |
| **`res.users`** | archiva/quita el usuario ligado (`active=False`) | Solo si **`remove_related_user`** marcado (y el empleado tiene user) |
| **fleet** | libera el auto de empresa | Solo si **`release_campany_car`** marcado |
| `hr.leave` / dirección privada | **nada** (no hay checkbox para eso en esta instancia) | — |

**Obligatorio (baja limpia) vs opcional:**
- **Obligatorio:** los 4 de `hr.employee` (active=false + 3 departure). **Ya lo hacemos.**
- **Opcional (decisión del usuario en el wizard):** `set_date_end`, `remove_related_user`, `release_campany_car`. El nativo los muestra como checkboxes y RH decide.

---

## C. Gap vs nuestro `rh/empleado/archivar` actual

Hoy el workflow hace **un UPDATE**: `active=false` + `departure_date` + `departure_reason_id` + `departure_description`.

| Acción del wizard | ¿La hacemos? | Impacto si NO la hacemos |
|---|---|---|
| `active=false` + 3 campos departure | ✅ sí | — (cubierto) |
| Cascada de `employee.write(active=False)` (resource, etc.) | ✅ sí (el UPDATE ORM dispara el `write()` override) | — (no lo rompemos) |
| `set_date_end` → fecha fin de contrato | ❌ **no** | El contrato/versión del empleado **queda sin fecha fin** (abierto). Impacto **bajo en FTS** (no usan payroll/work-entries de Odoo; la nómina es el kiosk custom), pero **no es "como nativo"**. |
| `remove_related_user` → archivar user | ❌ no | **Casi irrelevante:** solo 1 empleado activo tiene user (Administracion FTS-YIN, cuenta de sistema). Para empleados reales (sin user) no aplica. |
| `release_campany_car` | ❌ no | N/A — FTS no usa fleet por empleado (confirmar). |

**¿Rompemos algo hoy?** No de forma grave. El único "no-equivalente" real es **no setear fin de contrato**; y como la baja nativa aquí **no** cancela leaves ni toca direcciones, no dejamos esos cabos sueltos (el nativo tampoco los ata).

---

## D. Propuesta de implementación n8n

**Recomendación: UPDATEs directos, NO ejecutar el wizard transient.**

**Por qué NO el wizard transient:** requeriría `create` de un `hr.departure.wizard` (con `employee_ids` m2m) + `call method` `action_register_departure` — el nodo Odoo de n8n no expone "call method" cómodamente, y un transient es más frágil. Los UPDATEs directos logran **el mismo resultado** y respetan las reglas FTS (§3).

**Cambio propuesto a `rh/empleado/archivar`** (un solo UPDATE a `hr.employee`, ampliando los campos):
```
active = false
departure_date = <fecha>
departure_reason_id = <id>
departure_description = <html>
contract_date_end = <fecha>      ← NUEVO (replica set_date_end; campo writable en hr.employee, RO=false)
```
- `contract_date_end` es el proxy writable de la fecha fin de la versión actual (confirmado RO=false en `fields_get` de hr.employee). Setearlo = equivalente a `set_date_end` del wizard.
- **`remove_related_user`** (opcional): si se quisiera, sería un **UPDATE extra** a `res.users` (`active=false`) usando `hr.employee.user_id` — solo cuando exista. Dado que solo 1 empleado lo tiene (y es de sistema), **se puede omitir en MVP**.
- **`release_campany_car`**: omitir (fleet no aplica).
- El `UPDATE active=false` sigue disparando el `write()` de `hr.employee` → cascada nativa intacta.

**Forma del cambio (cuando se apruebe):** editar el nodo `Odoo - UPDATE archivar` para incluir `contract_date_end`. Si se hace **opcional** (checkbox "Fin de contrato" en el form de baja), el frontend manda `set_date_end:true/false` y el Code prep arma `contract_date_end = set_date_end ? departure_date : false`. Si se hace **siempre**, se setea directo.

---

## E. Decisiones abiertas para Esteban

1. **¿Setear fin de contrato (`set_date_end`) en la baja?** Recomiendo **sí** (`contract_date_end = departure_date`) para igualar el nativo. ¿Siempre, o como **checkbox** "Fin de contrato" en el form de baja (default marcado)?
2. **`remove_related_user`:** solo 1 empleado activo tiene user (cuenta de sistema). ¿Omitir en MVP (recomendado), o agregar el UPDATE opcional a `res.users` para cuando un empleado real sí tenga user?
3. **`release_campany_car`:** ¿FTS usa fleet por empleado? Asumo **no** → omitir. Confirmar.
4. **¿UPDATEs directos (recomendado) o wizard transient?** Recomiendo UPDATEs directos.
5. **Verificar en build (no probado read-only):** que `contract_date_end` es writable vía el nodo Odoo y que propaga a la versión (Odoo 19 hr.version). Si no propagara, fallback = UPDATE directo a `hr.version` por `current_version_id`.
6. **Default de `set_date_end` en el nativo:** no expuesto por `fields_get`; verificar si el wizard lo trae marcado por default para replicar el mismo comportamiento "out of the box".

---

## Apéndice — datos en vivo (read-only)
- Wizard `hr.departure.wizard`: 14 campos (sin `cancel_leaves` / `archive_private_address`).
- Empleados activos con `user_id`: **1** (id 148 Administracion FTS-YIN → user 25).
- `hr.employee.contract_date_end`: existe, `Readonly=False` (writable).
- `hr.departure.reason` (motivos): hoy 1 Fired · 2 Resigned · 3 Retired (pendiente traducir/ampliar a español, decisión previa #2 del módulo).
