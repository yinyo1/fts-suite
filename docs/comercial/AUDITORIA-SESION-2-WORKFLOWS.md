# Auditoría C — los tres workflows de julio contra el estado post-limpieza

**Todo lo de aquí es read-back real**, leído de la instancia el 2026-08-31 después de que
Esteban marcó *Available in MCP*. La auditoría de la sesión 0 tuvo que marcar el detalle
de nodos como `[REPO]` porque estaban bloqueados; ahora se puede afirmar.

**Los tres siguen `active:false`, `triggerCount:0`.** No se activó ninguno.

> **Nota sobre la sesión 0:** su descripción de los tres workflows, derivada solo del repo,
> **resultó correcta** en todo lo que se pudo contrastar. Los `[REPO]` estaban bien puestos.

---

## 1. `comercial/captura` (`tEra7MVCvnWjAqjR`)

### ¿Sigue siendo válido con 4 etapas? Sí, y por la razón incómoda que se sospechaba

El `Odoo - CREATE crm.lead` manda exactamente seis campos, **todos nativos**:

```
name · type='opportunity' · partner_name · description · expected_revenue · user_id
```

**No manda `stage_id`.** La nota del propio nodo lo dice: *"NO se setea stage_id: Odoo
asigna el default del pipeline"*. La consolidación 12→4 no lo rompe porque nunca tocó
etapas — pero eso mismo es el defecto: un lead capturado **entra donde Odoo decida**, no
en Prospecto.

### ¿Escribe el `dndole` correcto? No. Escribe cero campos `x_studio_*`

Confirmado en el read-back: no hay un solo `x_studio_` en el CREATE. La atribución va por
`user_id`, resuelta así:

```js
const login_buscado = String(body.capturado_por || payload.sub || '').trim();
// → Odoo res.users getAll filtrando login = login_buscado
const user_id = match ? match.id : ESTEBAN_USER_ID;   // ESTEBAN_USER_ID = 2
```

Con `sub:'finanzas'` **ningún `res.users` tiene ese login**, así que el 100% cae al
fallback. El propio código lo dice con todas sus letras:

> *"El JWT de Finanzas trae sub='finanzas' HARDCODEADO […] TODO lead cae en el fallback a
> Esteban […] la atribución real por vendedor NO arranca hasta que el auth tenga identidad
> por usuario."*

**Crédito donde toca:** el fallback **no es silencioso**. El `Code - Build lead` estampa en
la `description` un aviso explícito (`[!] Asignado a Esteban por defecto…`) precisamente
para que la fuga de atribución no sea invisible. Es el patrón correcto.

### 🔴 El hallazgo que no estaba en la auditoría de la sesión 0

`captura` **valida contra el emisor de Finanzas y rechaza cualquier otro**:

```js
// nodo Leer secretos (env)
{ name: 'secret', value: '={{ $env.FINANZAS_JWT_SECRET }}' }
// nodo Validar JWT + HMAC
if (payload.app && payload.app !== 'finanzas') { ... 'Token de otra app' ... }
```

Un token de `auth/comercial-login` (firmado con `COMERCIAL_JWT_SECRET`, `app:'comercial'`)
sería rechazado **dos veces**: por firma inválida y por app equivocada. **Conectar la
identidad nueva no es "agregar un campo": hay que mover el emisor.**

### Los tres cambios que necesita — **NO aplicados en esta corrida, a propósito**

| # | Nodo | Cambio |
|---|---|---|
| 1 | `Leer secretos (env)` | `secret` → `={{ $env.COMERCIAL_JWT_SECRET }}` |
| 2 | `Validar JWT + HMAC` | aceptar `app === 'comercial'`; propagar `payload.dndole` |
| 3 | `Odoo - CREATE crm.lead` | agregar `x_studio_dndole` = el `dndole` del token |

**Por qué no los apliqué:** el issue #140 alcance C pide **auditar**, no modificar. Y
CLAUDE.md §8 (regla anti-trabón) dice que nunca se aplica la mitad estricta primero:
cambiar `captura` al emisor nuevo mientras `comercial/index.html` sigue mandando tokens de
Finanzas deja el endpoint rechazando todo. Los dos lados se mueven juntos, cuando
`COMERCIAL_USERS` exista y se pueda probar el ciclo completo.

**Aparte, fuera de alcance:** `stage_id` → Prospecto (17). Es mi observación, no algo que
el issue pidiera. Queda propuesto, no aplicado.

---

## 2. `comercial/pipeline` (`60ZLskz1xJ7nU5kt`)

### ¿Sigue siendo válido con 4 etapas? **Sí, y ahora se puede afirmar**

En la sesión 0 dejé la duda de "cualquier agrupación por las 8 etapas que ya no existen".
**Verificado: no existe tal agrupación.** El `Code - Armar respuesta` solo arrastra el
nombre de la etapa como texto para mostrar:

```js
stage: aName(o.stage_id),
```

No filtra, no agrupa, no compara contra ninguna lista de etapas. La consolidación le es
indiferente.

### La nota del workflow envejeció, y para bien

El nodo `Odoo - crm.lead abiertos` filtra `type='opportunity'` + `active=true`, y su nota
dice:

> *"un lead perdido se archiva (active=false), así que active=true los excluye. **Los
> ganados SÍ siguen activos**"*

**Eso ya no es cierto.** L3 de la sesión 1 archivó los 532 ganados. El workflow ahora
excluye ganados y perdidos por sí solo, que es lo que siempre quiso hacer. Vale actualizar
la nota antes de que confunda a alguien.

### 🔴 El hallazgo grande: la ventana de 180 días esconde el 85% del pipeline

El filtro es `create_date >= hace 180 días`, y su razón está escrita en el código:
*"Ventanas de consulta (acotadas: hay 1,849 crm.lead …)"*. Era un parche de rendimiento
para una base sucia. **La sesión 1 eliminó el problema que justificaba el parche, pero el
parche sigue ahí.**

Medido contra Odoo hoy:

| | |
|---|---:|
| Leads vivos | **154** |
| …con `type='opportunity'` | **153** |
| …**además** creados en los últimos 180 días | **23** |

**`pipeline` mostraría 23 de 154.** Con la base limpia, la ventana ya no protege de nada:
solo esconde.

**Recomendación:** quitar el filtro de `create_date` de los leads (154 registros no
necesitan ventana). El de `sale.order` (365 d, 1,131 históricas) sí sigue haciendo falta.

### 🟡 Un lead se cae por `type`

De los 154 vivos, **uno no es `type='opportunity'`**:

```
id    name                  type  stage_id
1927  trabajos en directo   lead  Prospecto Lead
```

Está en Prospecto, vivo, y `pipeline` no lo mostraría nunca. O se convierte a
`opportunity` en Odoo, o el filtro pasa a `type in ['lead','opportunity']`.

### 🟡 El gate de dirección ya es reemplazable

```js
const DIRECCION_USER_IDS = [2];   // lista blanca hardcodeada
```

El código explica por qué: *"El claim `role` del JWT de Finanzas es SIEMPRE null […] no es
derivable y NO sirve como gate"*. **Con el token nuevo sí lo es**: `roles` incluye
`comercial:direccion`. Sustituir la lista por `roles.includes('comercial:direccion')` es
exactamente lo que el ROADMAP §5.2 anticipó.

`pipeline` tiene el mismo candado de emisor que `captura` (`FINANZAS_JWT_SECRET` +
`app!=='finanzas'`), y además **no lleva HMAC** — solo JWT.

---

## 3. `comercial/watchdog-enviadas` (`hJNTUd8E57W4rfjU`)

### ¿La limpieza lo afecta? No

Opera sobre `sale.order` en estado `sent`. **No toca `crm.lead`.** Las etapas le son
ajenas.

### ✅ Dos cosas que salieron mejor de lo esperado

**El timezone ya está bien.** La auditoría de la sesión 0 advertía que había que ponerlo a
mano o el cron correría a las 06:45 CST. Leído hoy: `settings.timezone: "UTC"`, y el cron
es `45 14 * * 1-5` = 08:45 CST. **Correcto, sin nada que hacer.**

**El canary ya es el comportamiento por omisión**, y no depende de recordarlo:

```js
let to = [R.esteban];
if (C.canary === false && Array.isArray(R.equipo) && R.equipo.length) to = to.concat(R.equipo);
```

Y la config viva (`shared/comercial/watchdog_enviadas.json`) tiene `canary: true` con
`equipo: []`. **Se queda en canary solo a Esteban sin tocar nada**, como pide el issue.
Abrirlo al equipo es editar el JSON y hacer push — decisión de la sesión 5.

### El límite conocido sigue en pie, y está bien documentado

El propio código lo advierte: `write_date` mide *"la última vez que cualquier proceso tocó
cualquier campo"*, no seguimiento comercial real; 60 órdenes comparten `write_date` exacto
por una escritura masiva. La señal correcta es `mail.message` → watchdog v2 (ROADMAP §3).

### Un cruce con L6 que vale anotar

El `Code - MAIN` de julio ya trataba la empresa como autoridad de moneda y decía que
`currency_id` no es confiable, citando *"127 órdenes de la empresa MX marcadas USD"*.
Es el mismo fenómeno que la sesión 1 encontró en L6 — con la diferencia de que L6 quiso
**corregir** el dato y se detuvo al descubrir que muchas eran ventas en dólares reales.
El watchdog nunca escribe: solo normaliza para mostrar. **Por eso su enfoque es seguro y
el de L6 no lo era.**

---

## Resumen

| Workflow | ¿Roto por la limpieza? | Qué necesita |
|---|---|---|
| `captura` | No | Mover el emisor de JWT + escribir `dndole` (3 cambios, especificados arriba) |
| `pipeline` | No | Quitar la ventana de 180 d · incluir `type='lead'` · gate de dirección por `roles` |
| `watchdog-enviadas` | No | Nada. TZ y canary ya correctos |

Ninguno de los tres quedó modificado en esta corrida.
