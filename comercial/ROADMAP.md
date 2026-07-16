# Roadmap Comercial — lo que quedó fuera del MVP

Orden por impacto. **§1 no es una mejora: es lo que hace que el módulo sirva para lo que se construyó.**

---

## §1 · Identidad real por usuario 🔴 BLOQUEANTE

**El problema.** El auth de Finanzas que este módulo reusa tiene **un solo usuario** (`sub:'finanzas'` hardcodeado, `role:null`, un par salt/hash compartido). Consecuencias hoy:

1. **Todo lead capturado se asigna a Esteban** (`SUPUESTOS.md` §T3-IDENTIDAD). El baseline identificó la falta de atribución por vendedor como el **problema #1** del área comercial (77% del volumen en la cuenta genérica `Sales FTS`). **El MVP no lo resuelve** — lo hace visible con una marca en la `description`, nada más.
2. **Dar acceso a Comercial = dar acceso a Finanzas** (facturas, bills). Mismo password, misma sesión. Es un problema de seguridad, no de comodidad.
3. **No hay roles.** `role` siempre `null` → dirección se resuelve con lista blanca hardcodeada.

**Qué hay que hacer.** Auth multi-usuario en `auth/finanzas-login` (o un `auth/suite-login` nuevo):
- Tabla de usuarios (Odoo `res.users` como fuente, o JSON con salt/hash por persona).
- `sub` = login real de la persona.
- `app` como *lista* de módulos autorizados, o un claim `scopes` → separa Comercial de Finanzas.
- `role` poblado de verdad → mata la lista blanca hardcodeada.
- Lockout **por usuario/IP**, no global (hoy 5 fallos bloquean a todos 15 min).

**Ya está listo para engancharse:** los dos webhooks aceptan un campo opcional `capturado_por` que tiene prioridad sobre `sub`. Cuando el auth mande identidad real, se conecta ahí sin re-tocar los workflows.

**Estimado:** 4–6 h. **Sin esto, §2, §4 y §5 no tienen sentido.**

---

## §2 · Campos FTS-4 en `crm.lead` (los creas tú en Studio)

El MVP usa **solo campos nativos** (límite duro de la sesión). Los campos esperados:

| Campo | Tipo sugerido | Para qué |
|---|---|---|
| `x_studio_fts4_falla` | Text | Qué falla del cliente resuelve |
| `x_studio_fts4_fecha` | Date | Fecha comprometida |
| `x_studio_fts4_sponsor` | Char | Quién firma del lado del cliente |
| `x_studio_fts4_presupuesto` | Monetary | Presupuesto declarado (vs `expected_revenue` estimado por rango) |
| `x_studio_temperatura` | Selection | Frío / Tibio / Caliente |
| `x_studio_carril` | Selection | Carril del pipeline |
| `x_studio_en_revision` | Boolean | Flag de revisión |
| `x_studio_proximo_paso` | Char/Text | Siguiente acción concreta |

**Cuando existan:**
1. Agregar los campos al form de Captura (hoy son 4; con FTS-4 se vuelven ~8 → considerar 2 pasos para no matar el mobile-first).
2. Agregarlos al `fieldsToCreateOrUpdate` del nodo `Odoo - CREATE crm.lead`.
3. Exponerlos en Mi Pipeline.

⚠️ **`x_studio_proximo_paso` + `x_studio_fts4_fecha` son la base del §3.** Un watchdog que vigila *"¿tiene próximo paso y ya venció?"* es infinitamente mejor que uno que vigila `write_date`.

**Estimado:** 2–3 h después de que existan los campos.

---

## §3 · Watchdog v2 — vigilar la señal correcta 🔴 IMPORTANTE

**El problema** (`baseline.md` §6 RIESGO-2 · `SUPUESTOS.md` §T2-WRITE_DATE): el v1 mide `write_date`, que es *"la última vez que **cualquier** proceso tocó la orden"* — no seguimiento comercial. **60 de 122 órdenes comparten el mismo `write_date` al segundo** por una escritura masiva.

Hoy no molesta porque todo está rojo. **El día que el equipo empiece a trabajar, cualquier script que toque `sale.order` en masa resetea todos los semáforos a verde sin que nadie haya llamado a un cliente.** Falso negativo silencioso.

**v2 debe:**
1. **Medir `mail.message` del chatter** (comunicación real con el cliente) en vez de `write_date`. Patrón ya probado en `ops/watchdog-mo`, que consulta `mail.message` con filtros `model` + `body like`.
2. **Cadencias por rango.** El baseline dice que el ciclo mediano es 11.5 días, pero 3M–5M tarda ~107. Un umbral 4/6 uniforme es demasiado agresivo para lo grande y quizá laxo para lo chico. Sugerido: `<200K` → 3/5 · `200K–1M` → 5/8 · `>1M` → 7/14. Config por rango en el JSON.
3. **Vigilar `draft`.** El baseline (§3, RIESGO-4) encontró **275 borradores (51%) que nunca se enviaron** — ni ganados ni perdidos, invisibles. Probablemente el mayor valor económico oculto. Antes de automatizar: revisar 20 a mano para saber si es basura o fuga.
4. **Escalar por antigüedad**, no solo colorear: >30 días sin movimiento con monto >1M debería ir a dirección, no al vendedor.
5. **Registro de atendidas.** El v1 dice *"responde a este digest"* (manual). El v2 necesita un endpoint o botón para marcar atendido y sacarlo del siguiente correo.

**Estimado:** 4–5 h.

---

## §4 · Dashboard con roles

Depende de §1. La vista de dirección (todo el pipeline, por vendedor, con win rate por rango) es literalmente el `baseline.md` pero **vivo**. Los cálculos ya están hechos y verificados ahí; es portarlos a un endpoint + una vista.

Incluir: win rate por rango y por vendedor · tiempo de ciclo · valor en pipeline · fuga (SIN OWNER + borradores viejos) · concentración de clientes (**Nalco de México está en ~30 de las 122 cotizaciones vivas** — es un riesgo de concentración que nadie está midiendo).

**Estimado:** 6–8 h.

---

## §5 · Submódulo Marketing

Origen de leads → conversión por canal. El campo `origen` del MVP (`referido` / `cliente_existente` / `marketing` / `portal` / `otro`) ya lo está sembrando en la `description`. **Cuando exista un campo Studio propio para origen, esto se vuelve reportable de verdad** (hoy está enterrado en texto libre).

Ojo: `portal` se va a mezclar con el ruido real del portal web (baseline RIESGO-5: carritos de $0/$1.16). Hay que separarlos.

**Estimado:** 5–6 h. Depende de §2.

---

## §6 · N2 con Claude

Captura conversacional: dictar por voz *"Nalco quiere una jaula para tanque, como millón y medio, me lo pidió Tito"* → el modelo extrae cliente/descripción/rango/origen y precarga el form.

**Precedente en el repo:** `pmo/chat-apply` (id `G9mo4xkJKpbPDaT4`) ya hace exactamente esta forma — parsea lenguaje natural y muta registros. **Reusar su patrón, incluida la heurística de DETECCIÓN REACTIVA de duplicados** (CLAUDE.md Hallazgo #13): antes de crear, comparar `nombre.toLowerCase().normalize()` + cliente contra los leads abiertos; si hay match >70%, devolver `clarify` en vez de crear un duplicado. En un CRM con **1,849 leads** eso no es opcional.

⚠️ El workflow `pmo/chat-apply` tiene un **secreto HMAC filtrado** en `docs/n8n-workflows/pmo-chat-apply-code-code-validar-auth.js` (CLAUDE.md §15 #3). **Rotarlo antes de reusar ese patrón.**

**Estimado:** 8–10 h. Depende de §1 y §2.

---

## Deuda técnica del MVP

| # | Qué | Dónde | Prioridad |
|---|---|---|---|
| 1 | 127 órdenes de la empresa MX marcadas USD → ningún reporte por monto es defendible | Odoo (Gerardo) | 🔴 alta |
| 2 | Sin timestamp de envío → los 2 tiempos de ciclo del funnel son ciegos | Studio | 🟡 media |
| 3 | Migrar `Sales FTS` (416 órdenes) a vendedores reales | Odoo + §1 | 🔴 alta |
| 4 | 12 cotizaciones sin `user_id`, incl. **SO11258 Terra Energy $2.3M** | Odoo | 🟡 media |
| 5 | `expected_revenue` = punto medio del rango, no el monto real | §2 (`x_studio_fts4_presupuesto`) | 🟢 baja |
| 6 | Comercial y Finanzas comparten sesión (`localStorage`) | §1 | 🔴 alta |
| 7 | HMAC se aprovisiona a mano por dispositivo | §1 (auth real lo mata) | 🟢 baja |
| 8 | Filtrar ganados de "oportunidades abiertas" requiere leer `crm.stage.is_won` | pipeline | 🟢 baja |
| 9 | Sin rate limiting en `/comercial/captura` | hardening | 🟡 media |

---

## Orden sugerido

```
§1 identidad real  ──┬──> §2 campos FTS-4 ──┬──> §5 marketing
   (bloqueante)      │                      └──> §6 N2 con Claude
                     ├──> §4 dashboard
                     └──> §3 watchdog v2  (parcialmente independiente:
                                           lo de mail.message y cadencias
                                           se puede hacer ya)
```

**Si solo hay tiempo para una cosa: §1.** Todo lo demás depende de saber quién es quién.

**Si solo hay tiempo para media:** la parte de `mail.message` del §3 — porque el watchdog v1 tiene fecha de caducidad silenciosa, y cuando falle no va a avisar que falló.
