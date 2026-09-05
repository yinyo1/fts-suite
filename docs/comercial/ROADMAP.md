# Módulo Comercial de FTS Suite: ROADMAP

> Fuente: issue [#127](https://github.com/yinyo1/fts-suite/issues/127) (documento rector). Este archivo es la copia en repo; cuando una decisión cambie, se actualiza aquí y en el issue. Commiteado en sesión 0 (2026-08-29).

Documento rector. Cada issue del módulo comercial debe leer esto antes de proponer o construir. Si algo aquí contradice un issue anterior, manda esto. Claude Code: en la sesión 0, cometer este contenido en `docs/comercial/ROADMAP.md` y mantenerlo actualizado cuando una decisión cambie.

## 1. Idea central

Un solo módulo con estaciones por las que pasa un mismo **expediente comercial**: entra como prospecto, se vuelve oportunidad, se costea, se cotiza, se confirma y se entrega a operaciones. Modular no significa pantallas sueltas: significa un solo registro que acumula capas y cada estación solo agrega la suya.

Proceso de negocio (17-jul-2026, 8 pasos con compuertas):
1. Captura universal
2. Calificación FTS-4 (falla, fecha, sponsor, presupuesto)
3. Diagnóstico FTS (checklist mínimo + draft visual validado con el cliente)
4. Ingeniería de propuesta (machote + BOM + base de precios; carril exprés <200K USD mismo día)
5. Presentación
6. Seguimiento por cadencia de temperatura
7. Cierre y registro de verdad (motivo obligatorio, contra quién y por cuánto)
8. Handoff + cosecha

## 2. Decisiones de arquitectura (cerradas)

- **Odoo es la base de datos del resultado, no la interfaz.** Guarda lo que sabe modelar: partner, crm.lead, etapa, monto, sale.order, líneas de venta, analíticas, chatter, actividades.
- **Postgres propio en Railway** (esquema `comercial`) es el taller: expediente, machote digital, BOM, cuadrilla, comisiones, simulaciones, versiones congeladas, evidencia y propuestas. Nace en 1.0 por la capa de ingesta. Nunca duplica lo que Odoo ya tiene; se liga por `lead_id` / `so_id`.
- **Toda escritura a Odoo va por n8n con HMAC + anti-replay** (issue #123). El frontend nunca habla directo con Odoo. Los agentes de IA solo proponen; nunca escriben sin humano en 1.x.
- Un solo usuario de Odoo para comercial por diseño. Quién cotiza se marca en `x_studio_dndole` (Cotizador), no en `user_id`.
- Frontend estático en GitHub Pages, mobile-first, sin frameworks nuevos. Auth JWT reutilizando el patrón de Finanzas.
- Sin campos `x_studio_` nuevos para lo que pueda vivir en Postgres. Studio solo cuando el dato debe verse dentro de Odoo.
- Estructura: `app/comercial/` con `core/` compartido (auth, cliente API, modelo de expediente, tabla densa) y una carpeta por estación: `crm/`, `machote/`, `handoff/`. Workflows n8n con prefijo `comercial/`.

## 3. Capa transversal: ingesta e inteligencia

Existe desde 1.0 y la comparten todas las estaciones. Tubería fija, fuentes enchufables:

1. **Fuente** (un workflow n8n por canal): escribe normalizado a `comercial.evidencia` (lead_id nullable, fuente, fecha, autor, texto literal, archivo, hash).
2. **Amarre**: a qué lead pertenece (SO mencionada, cliente, contacto, hilo). Sin confianza suficiente queda huérfana.
3. **Interpretación** (Claude): intenciones tipadas: nuevo_lead, follow_up, cotizacion_enviada, cambio_fecha_cierre, visita, compromiso (fecha + dueño), cliente_en_revision, perdida (contra quién, por cuánto). Cada una con cita literal y confianza.
4. **Propuesta**: `comercial.propuesta` (lead_id, accion, valor_nuevo, evidencia_id, confianza, estado).
5. **Bandeja** en el CRM: aprobar, corregir o rechazar con un toque.
6. **Acción**: lo aprobado sale por n8n a Odoo (nota fechada en chatter, actividad, campos del lead).

Reglas del motor:
- Sin cita literal no hay propuesta.
- Cuentas VIP (p. ej. GRUMA / Robert Barrera) nunca se auto-aplican, aunque en el futuro se abra auto-aplicación para intenciones de bajo riesgo y alta confianza.
- Las huérfanas no se pierden: ahí aparecen los leads nuevos.
- Dedupe al crear lead en tres capas: partner (nombre fuzzy, dominio, RFC) → oportunidad del mismo partner (planta, alcance, recencia) → crear / actualizar / ambiguo para humano.

Fuentes por orden de fricción: manual (1.0) → correo vía Graph (ya conectado) → transcripción Teams/Copilot vía Graph → Plaud (exporta o manda resumen por correo) → WhatsApp 1:1 al número del bot (API oficial) → grupos de WhatsApp (mención al bot, grupo del levantamiento; requiere puente no oficial, decisión de riesgo aparte).

## 4. Estaciones y versionado

Cada entero es una estación **en producción y usada por el equipo**. Los decimales (x.0 a x.99) son features. Criterio de salida de un entero: cambio de hábito comprobado, no código terminado.

### 1.x CRM (sustituye el tracker SharePoint SOL-COT_OC, ya sin uso)
- Hoja densa tipo Excel leyendo/escribiendo crm.lead vía n8n. Columnas mínimas: cliente, oportunidad, Cotizador, Responsable, etapa, monto, moneda, fecha esperada de cierre, temperatura calculada, último toque, próximo paso, comentarios fechados.
- Temperatura desde fecha esperada de cierre: Caliente 0-30 días (verde), Tibio 31-90 (naranja), Frío 91-180 (azul), Purgatorio 180+ (morado), Muerta/Cancelada (rojo).
- Watchdog de enviadas y captura rápida ya existen (PR #89): auditar y reutilizar.
- Marketing entra como puerta: POST que crea la tarjeta con origen=marketing y score del calificador de Pablo. No es estación aparte.
- Bandeja de propuestas presente desde 1.0 aunque esté vacía.
- Paso cero antes de liberar al equipo: limpieza de datos (leads asignados a personas que ya no están, renglones del Excel nunca cargados, etapas duplicadas).

### 2.x Machote digital (pasos 3 y 4 del proceso, una sola pantalla)
El asistente de cotización no es módulo aparte: es la inteligencia dentro del machote. Secciones en orden:
1. Diagnóstico: tipo de proyecto, alcance, preguntas de validación por tipo (que nada se olvide), draft visual. Escribe de regreso al lead: tipo, rango, carril.
2. Kit base: partidas típicas por tipo, sugeridas desde histórico.
3. BOM: materiales tipados (marca, modelo, cantidad); precio de lista con nivel de confianza; nunca se inventa un precio (`sin_dato` explícito).
4. Mano de obra: horas como horas (no disfrazadas de piezas), cuadrilla, turnos, viáticos.
5. Generales: flete, importación (IGI/DTA), comisiones, utilidad como renglones explícitos, nunca dentro de un porcentaje.
6. Simulador: precio de venta → rentabilidad.
7. Salida: genera sale.order en Odoo y PDF; versión congelada en Postgres.

Cuadros de cálculo = widgets con nombre (perímetro→postes, metros→cable+conduit), no hoja libre; el resultado se captura como dato.

- 2.0: el machote actual digitalizado en captura manual con validaciones (sumas cuadran, comisiones suman 1.0, moneda declarada) y salida a SO + PDF. El asistente aún no sugiere.
- 2.x: el asistente despierta por versiones conforme haya datos: checklist por tipo → kits → precios web → partidas faltantes → evidencia del levantamiento.

Reglas de precio (11-ago-2026): el precio de lista del fabricante es el costo base de FTS; descuentos de compras son margen realizado (KPI de compras), nunca reducción del estimado. Precios versionados insert-only.

### 3.x Handoff y confirmación
Disparado desde la suite en el momento (no por cron): crea analíticas, budgets, proyecto y agenda kickoff al día siguiente 14:00. Consume el machote congelado. Reemplaza al workflow de confirmación actual.

### 4.x Inteligencia (capa de datos, no UI)
Cosecha de ~347 machotes históricos de SharePoint (ComercialFTS/Cotizaciones), tipificación de proyectos, catálogo compartido con el calificador de Pablo, precios versionados, fuentes de evidencia adicionales, feeds de cartas de incremento de fabricantes.

## 5. Protocolo de trabajo

- El chat diseña y crea issues; Claude Code audita, construye y responde en el issue (no en el chat).
- Toda sesión de CC arranca auditando el estado real del código y del módulo y cómo interacciona con el resto de la suite (shared/, Finanzas, RH, kiosk, workflows n8n existentes), antes de proponer cambios.
- Workflows nuevos nacen INACTIVOS; publicar y "Available in MCP" es manual.
- Estimaciones del chat corren 3-4x infladas contra la velocidad real de CC: recalibrar.

## 5.1 Decisiones 29-ago-2026

Cierran las preguntas abiertas de la auditoría (#130 §6) y son el alcance de la sesión 1 (#131). Mandan sobre cualquier propuesta anterior.

1. **Etapas: consolidar 12 → 6.** Prospecto · Por cotizar · Cotización enviada · Revisar · Ganado (`is_won`) · Perdido (lost). Las variantes por cliente ("Adiccionales Topo (Monty)", "Cot Enviada Mdlz") se absorben con **tag por cliente, no etapa**. "Proyecto Ganado - Con PO" se fusiona a Ganado.
   > Precisión de implementación (sesión 1): en Odoo "Perdido" **no es una etapa**, es `active=false` + `lost_reason_id`. Son **5 filas de `crm.stage` + el mecanismo lost**, no 6 etapas.
   >
   > **Corrección (sesión 3, 4-sep-2026): el mapeo vivo es de 5 etapas de pipeline, no de 4.** La corrida del 30-ago dejó 4 etapas con leads vivos porque fusionó *Qualified* en *Por cotizar* y archivó *Proyecto Ganado*. Montalvo confirmó que **Qualified tiene uso real de proceso**, así que vuelve como etapa propia, y la reversión de L3 devuelve *Proyecto Ganado* a activo. **Este es el mapeo sobre el que se construye la hoja del CRM 1.0** (`sequence` es el orden real en Odoo, no el orden en que se listan aquí):
   >
   > | # | Etapa | `stage_id` | `sequence` | Papel |
   > |---|---|---:|---:|---|
   > | 1 | Prospecto Lead | 17 | 0 | pipeline |
   > | 2 | Lead Calificado/Por cotizar | 15 | 1 | pipeline |
   > | 3 | Cotizacion Enviada | 5 | 2 | pipeline |
   > | 4 | Qualified | 21 | 3 | pipeline |
   > | 5 | Revisar | 18 | 9 | pipeline (bandeja de triage) |
   > | — | Proyecto Ganado | 8 | 5 | **terminal ganado** (`is_won`), activo — no es pipeline vivo |
   > | — | *Perdido* | — | — | **no es etapa**: `active=false` + `lost_reason_id` (los cancelados conservan `stage_id=9` archivados) |
   >
   > Son **5 etapas de pipeline + Ganado + el mecanismo lost**. *Proyecto Ganado* es la única fila con `is_won=true`. Las etapas fusionadas (3, 4, 12, 14, 20) siguen existiendo vacías; ninguna se borró.
2. **Leads de ex-FTS: reasignar por cartera.** La hoja `06_Clientes-Usuarios` del tracker de SharePoint es la tabla de dueño por cuenta (`comercial/data/clientes-usuarios.csv`). Dueños **vigentes**: Aldo, Montalvo, Esteban. Dueños **no vigentes** en la hoja (Diego, Luis, Rissia) → reparto por cartera vigente (26-ago-2026): Aldo → Magnekon, GRUMA/Mission Foods (fuera de Hayward), Corporate USA, Bridgestone, ABB, GEPP, Budenheim · Montalvo → Nalco, Vertiv, Topo Chico, Johnson Controls/Clarios, Chemtreat, Quimitec, Mondelez, Forza · Ricardo → Hayward y Calbee · Esteban → Robert Barrera y corporativos. Sin dueño vigente ni cartera → etapa Revisar, `dndole` vacío. **Decisión reversible**: se corrige en la primera revisión semanal.
   > Hallazgo de la sesión 1: el universo real son **50 leads**, no 331 — los otros 281 están en CANCELADO o Ganado y los archivan L1/L3.
3. ~~**Los "Proyecto Ganado" activos se archivan** (won cerrado). La hoja solo muestra pipeline vivo.~~ **REVERTIDA (sesión 3, 4-sep-2026).** Los 532 leads que L3 archivó se desarchivaron; se quedan **activos** en la etapa *Proyecto Ganado*. Dos razones: (a) se desviaba de la convención de Odoo —lo ganado se queda activo, lo cancelado se archiva— y nosotros archivábamos ambos; (b) los ganados son el histórico que el asistente del machote ([#148](https://github.com/yinyo1/fts-suite/issues/148)) necesita consultar, y archivado los vuelve más difíciles de alcanzar. La intención original —que la hoja muestre solo pipeline vivo— sigue en pie, pero se resuelve en la vista, no en el estado global del registro: ver §5.4.
4. **Login comercial separado de Finanzas: sí.** Usuarios iniciales: Esteban, Aldo, Montalvo, Ricardo, Pablo. Se construye en sesión 2 (ver §5.2).
5. **Carpetas:** el módulo se queda en `comercial/` con `core/` y `crm/`. `app/` se reserva para una migración general del Suite.
6. **`x_studio_dndole` se queda como selection en 1.0.** Se depura (fuera ex-FTS) y se agregan los valores faltantes de los 5 usuarios.
7. **Card del launcher:** se abre al equipo en el rollout (sesión 5). El login comercial es el gate real.
8. **Watchdog al equipo hasta la sesión 5.** Antes, watchdog v2 (señal `mail.message`, no `write_date`) en canary solo a Esteban.
9. **Las `sale.order` de FTS MX marcadas en USD se corrigen en la sesión 1**, universo histórico completo (las no canceladas), como lote aparte con dry-run.
   > Hallazgo de la sesión 1: **solo la etiqueta de moneda está mal, los montos ya están en pesos** (SO5989 marcada USD $44,240.21 ↔ su factura posteada INV1688 en MXN por exactamente 44,240.21). La corrección cambia `currency_id` y **no convierte montos**. La causa raíz (de dónde sale el default USD) sigue abierta y el problema está acelerando: 76 de 190 casos son de 2026.

## 5.4 Regla: la etapa decide qué se ve; el archivado se reserva para cancelados

Establecida en la sesión 3 (4-sep-2026) al revertir L3. Aplica a todo `crm.lead`:

- **La etapa es lo que decide qué se ve.** El estado de un lead se expresa con `stage_id` (y con `is_won` para el terminal ganado), no apagándolo.
- **El archivado (`active=false`) se reserva para cancelados**, junto con `lost_reason_id`. Es el mecanismo *lost* de Odoo y no debe usarse como filtro de visibilidad.
- **Filtrar pipeline vivo es trabajo de la vista**, no del registro. La hoja del CRM 1.0 excluye *Proyecto Ganado* con un filtro por etapa; el lead sigue activo y consultable por cualquier otro consumidor.

El costo de romper esta regla ya se pagó: archivar los ganados los sacó del alcance del histórico que consulta el asistente del machote (#148), a cambio de una limpieza visual que la vista podía dar gratis. **Un registro se archiva por lo que le pasó, no por quién no quiere verlo.**

## 5.2 Punto transversal: identidad

**Forma final del JWT, desde el primer emisor.** El emisor de 1.0 es simple (usuarios en variables de entorno, mismo criptostack probado de `auth/finanzas-login`), pero el **token nace con su forma definitiva** para que ningún consumidor tenga que cambiar cuando la identidad se unifique:

```json
{
  "sub": "aldo",                                  // la PERSONA, nunca un usuario genérico
  "roles": ["comercial:vendedor"],                // lista por módulo: "<modulo>:<rol>"
  "dndole": "Aldo Mendez",                        // valor EXACTO del selection en Odoo
  "exp": 1234567890
}
```

- **`sub` = persona.** Mata el `sub:'finanzas'` fijo que mandaba el 100% de los leads al fallback Esteban.
- **`roles` = lista por módulo** (`comercial:vendedor`, `comercial:direccion`, y mañana `finanzas:lectura`). Nunca un rol global: el mismo token debe poder decir "dirección en comercial, sin acceso a finanzas". Sustituye la lista blanca hardcodeada `DIRECCION_USER_IDS=[2]`.
- **`dndole`** carga el valor del selection de Odoo para que la captura y la hoja escriban atribución real sin un segundo lookup.

**Lo que cambia después y lo que no:** el login único de toda la suite —con roles derivados de `hr.employee` (patrón ya validado en `panel/derivar-roles`)— es un frente futuro. Cuando llegue, **solo cambia quién firma el token**; la forma de arriba y todos sus consumidores siguen igual. Por eso se define ahora y no cuando duela.

## 5.3 Almacén

El taller de la suite es **Postgres** (servicio `fts-suite-db` en Railway), con esquema
por dominio. Decisión, seis reglas de fundación, esquema y el único paso manual:
[`docs/comercial/ALMACEN.md`](ALMACEN.md). Migraciones versionadas en
`comercial/db/migrations/`.

## 6. Referencias
- Proceso v2 de 8 pasos y arquitectura previa: sesión 17-jul-2026 (PR #89, comercial.html, workflows comercial/watchdog-enviadas, comercial/captura, comercial/pipeline).
- Front desk y agentes de IA: sesión 26-abr-2026.
- Precios, machote y MCP de proveedores: sesión 11-ago-2026.
- Reconciliación Excel vs Odoo: sesiones 21 y 27-ago-2026.
