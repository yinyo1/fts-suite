# Plan de construcción v2 · después de las nueve respuestas

**Issue:** [#294](https://github.com/yinyo1/fts-suite/issues/294) · sustituye al §7 del plan
maestro del PR [#290](https://github.com/yinyo1/fts-suite/pull/290), que se escribió **antes**
de que Esteban contestara.

**2026-09-25.** Nada construido salvo los tres prototipos.

---

## 1 · Qué cambió, en tres líneas

1. **C y D son trabajo nuevo**, y ninguno de los dos estaba en el plan maestro: el **flujo de
   aprobación de beneficiario** (respuesta 7) y la **detección de IVA en la PO** (respuesta 5).
2. **Octubre NO se mueve**, porque octubre nunca los contuvo. Lo que se mueve es la cola de
   noviembre en adelante: **+3 a +4 sesiones**.
3. **Aparecieron dos dependencias nuevas que bloquean**, y las dos son trabajo de Odoo, no de
   código: **R2 y R3 siguen sin contestarse** (eran la pregunta 8 del §8, que quedó fuera de las
   nueve), y **hace falta poblar `code` y `partner_id`** en las cuentas de comisión.

---

## 2 · Las dos dependencias que hoy no existen

Esteban pidió expresamente que se recordaran.

### 2.1 · No hay dónde elegir la oportunidad en el machote

| pieza | estado | costo |
|---|---|---|
| **el nombre del campo está mal** | `comercial/machotes-leer` devuelve **`odoo_lead_id`** y esa cadena **no existe en ningún `.js`** de `comercial/`. La pantalla lee `lead_id` → **`undefined` siempre** | **una línea** |
| **no hay selector** | `lead_id` aparece 3 veces y **las tres LEEN**. No hay campo, ni entrada, ni pastilla | 1 sesión |
| **las 24 vivas están sin ligar** | y **no hay backfill posible**: 7 de 24 traen cliente del catálogo, 19 de 24 tienen total nulo | media hora del equipo, a mano |

🔴 **El orden no es negociable: primero el nombre, después el selector.** Al revés, la pantalla
**guarda bien y sigue diciendo «sin oportunidad»**, y quien lo pruebe va a concluir que el
guardado falla. Es media hora de depuración por no gastar un minuto.

### 2.2 · El campo de comisión no está ligado al plan

El machote guarda **nombres de pila**; Odoo tiene **ids**. Y esta sesión encontró que el
catálogo, tal como está, **tampoco se puede leer por máquina**:

| medición | resultado |
|---|---|
| cuentas del plan 20 | 32 |
| con **`code`** poblado | **0** |
| con **`partner_id`** poblado | **0** |
| `active = true` | **32** — incluidas las de quien ya salió |

**El «3.1» y el «5.2.1» viven dentro del nombre.** Así que antes de construir el selector hace
falta una reparación que el plan maestro no tenía:

> **R11 (nueva) · poblar `code` y `partner_id`** en las 19 cuentas de comisión del plan 20.
> Minutos de Gerardo en la interfaz de Odoo. **Sin esto, el selector se construye casando por
> nombre — que es exactamente la enfermedad que viene a curar.**

---

## 3 · Octubre · no se mueve

Sin pantalla nueva, sin cambiar la forma de trabajar. **Tres sesiones de CC.**

| # | qué | CC | quién más |
|---|---|---|---|
| **R1** | `sequence` del plan 1 estrictamente menor que todos | 0 | Esteban, un campo |
| **R2 · R3** | limpiar las reglas ambiguas del enlace (IVA y lado cliente) | 0 | Esteban/Gerardo, minutos |
| **R10** | archivar los rubros de quien ya salió | 0 | Esteban, minutos |
| **R11** 🆕 | poblar `code` y `partner_id` de las 19 cuentas de comisión | 0 | Gerardo, minutos |
| **F1b** | `machote-guardar` **persiste los compromisos** en las columnas de la 009 | **1** | — |
| **F1c** | capturar los cuatro compromisos en los machotes vivos | 0 | el equipo |
| **F3a+b** | **corregir el nombre** del campo y **el selector de oportunidad**, en modo *sugerida* | **1** | — |
| **F1d** | la Confirmación **jala el presupuesto del machote** y agrega **el rubro de viajes** | **1** | — |

📌 **R1, R2, R3, R10 y R11 son cinco cosas que no tocan código y valen más que las tres
sesiones.** R2 y R3 además **bloquean** todo el módulo de comisiones: sin limpiarlas, el
catálogo alimentaría un mapeo que estampa el rubro equivocado.

⚠️ **R2 y R3 eran la pregunta 8 del §8 y NO están entre las nueve respuestas.** Siguen abiertas,
y son las que sostienen a C1.

---

## 4 · Noviembre en adelante · con C y D dentro

| # | qué | sesiones | depende de | ¿nuevo? |
|---|---|---|---|---|
| **F1e** | la Confirmación completa jalando del machote (contacto, fechas, entregables, selector de `hr.employee`) | 1–2 | F1b, F1d | — |
| **D** | **detección de IVA en la PO**: campo de importe, heurística, memoria por cliente, los tres botones de salida | **1** | F1e | 🆕 |
| **F1f** | el resto de los candados: PO validada al subir, cuadre, leyenda de IVA, umbral de anticipo por moneda | 2 | D | — |
| **C1** | catálogo de comisiones: endpoint de lectura, ids en el machote, selector | 1–2 | **R2, R3, R11** | — |
| **C** | **flujo de aprobación de beneficiario**: dos tablas, página de la liga firmada, correo, vigilante de caducidad | **2–3** | C1 | 🆕 |
| **C2** | la Confirmación escribe el presupuesto de comisión por beneficiario | 1 | C1 + F1d | — |
| **E** | **reglas y devengo de comisión** (los siete escenarios) | 1–2 | C2 + la decisión de «entregado» | 🆕 |
| **F3c** | la oportunidad pasa a **obligatoria** | 0.5 | los 24 ligados + F3b probado por alguien más | — |
| **F2** | la cotización nace en la suite | 4–6 | F1 cerrada, F3 en *sugerida* | — |
| **F2b** | el candado de Odoo | 0 | F2 ya siendo el camino normal | — |
| **A** | adicionales como orden hija | 1 | F2 | — |

**El total se mueve de ~11 sesiones a ~15.** Las cuatro nuevas son **D (1)**, **C (2–3)** y
**E (1–2)**, menos solapamiento.

---

## 5 · Qué sale si no cabe

Si hubiera que recortar, **en este orden y por esta razón**:

| sale | por qué se puede | qué se pierde |
|---|---|---|
| **1 · `E` (devengo)** | hoy no hay devengo en absoluto, y la cadencia real es de nómina. **Esperar otro mes no empeora nada** | seguir sin poder decir «cuánto le debemos a quién» |
| **2 · `F2` (cotizar en la suite)** | ya estaba fuera de octubre en el plan maestro | nada inmediato: el machote sigue cotizando |
| **3 · `A` (órdenes hija)** | un caso al mes | los adicionales siguen como órdenes sueltas |

🔴 **Lo que NO puede salir, y conviene decir por qué:**

- **`C` no puede salir si la respuesta 7 se aplica.** El candado de beneficiario aprobado
  **bloquea confirmar**. Si se activa el candado sin construir el flujo, **nadie puede
  confirmar una orden con un beneficiario nuevo** y el equipo se traba — literalmente el
  incidente del 18-jul-2026, cuando el lado estricto se aplicó antes que el tolerante y
  Confirmar Horas quedó trabado en producción justo antes del write de nómina.
- **`D` no puede salir si el cuadre al centavo se activa**, por lo mismo: sin la heurística, el
  cuadre compara contra un solo número y **reprueba a todos los clientes que mandan la PO de la
  otra forma**.

📌 **La regla, que ya está pagada:** *si una mitad va primero, que sea la tolerante.* Un candado
nuevo entra **avisando** y pasa a **bloquear** cuando su maquinaria existe y alguien que no lo
construyó lo probó.

---

## 6 · La secuencia, en una línea cada una

```
R1 R2 R3 R10 R11  ──►  no tocan código, y R2+R3+R11 bloquean C1
F1b ──► F1c ──► F1e ──► D ──► F1f
F3a ──► F3b ──► (24 ligados) ──► F3c
R2 R3 R11 ──► C1 ──► C ──► C2 ──► E
F1 cerrada + F3 sugerida ──► F2 ──► F2b ──► A
```

- **F1b → F1c → F1e**: sin guardar los compromisos, la Confirmación los vuelve a pedir.
- **F3a → F3b → F3c**: sin el nombre corregido, el selector guarda bien y la pantalla miente.
- **R2/R3/R11 → C1**: sin limpiar y sin llave legible, el catálogo apunta a un mapeo roto.
- **C1 → C**: no se puede aprobar un beneficiario de un catálogo que no existe.
- **C2 → E**: no se puede devengar sobre un presupuesto que nadie escribió.
- **F1 + F3 → F2**: la cotización hereda el contrato de la Confirmación.

---

## 7 · Lo que esta sesión NO pudo verificar

Se dice porque afecta a lo que sigue, y porque una especificación que calla sus huecos se lee
como si no los tuviera.

| # | qué | por qué no se pudo | qué lo desbloquea |
|---|---|---|---|
| 1 | **si el modo *porcentaje* del asistente de anticipos aplica sobre el subtotal** | el modelo del asistente está **fuera de la allowlist** del MCP, y **los dos usos históricos fueron de monto fijo** | una corrida de prueba sobre una orden de juguete — **es una escritura** |
| 2 | **cuánto acierta la heurística de IVA** | **no existe el dato histórico**: ningún campo guarda el importe de la PO | medirlo hacia adelante, desde la primera orden |
| 3 | **si «entregado» puede ser el stage de cierre del proyecto** | es una **decisión de negocio**, no una medición | que Esteban lo decida (§4 de `COMISIONES-ESCENARIOS.md`) |
| 4 | **si quien autoriza tiene cuenta en la suite** | no se consultó el padrón: **habría traído correos de personas a una sesión que escribe en un repo público** | una pregunta, no una consulta |
| 5 | **`comercial/confirmar` nodo por nodo** | se leyó su metadatos y la pantalla que lo consume, no sus 21 nodos | una sesión de lectura antes de F1e |

⚠️ **El 1 bloquea de verdad.** Si el porcentaje aplicara sobre el total con impuesto, el
anticipo del 30 % saldría 4.8 % más alto de lo pedido y **nadie lo notaría** hasta conciliar.
Es media hora de prueba controlada y debe hacerse **antes** de F1f.
