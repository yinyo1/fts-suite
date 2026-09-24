# prospector — herramienta de prospección de contactos

> **Copia de referencia para lectura.** El desarrollo vive aquí desde el
> 24-sep-2026; el historial anterior está en `yinyo1/fts-mcp-odoo`.

Esta carpeta existe para que se pueda **leer todo de corrido**: el código, el
método y las pruebas, sin tener que pegar archivos a mano.

**Qué hace:** arma la ficha de contactos de una planta industrial —quién compra
mantenimiento, agua, vapor o servicios— cruzando Odoo, Outlook, directorios,
vacantes, prensa, congresos y la web abierta, con la procedencia de cada dato.

**La idea de fondo, en una línea:**
**Python es dueño de las compuertas. Claude es dueño del criterio.**

---

## Qué hay aquí

| Ruta | Qué es |
|---|---|
| **`flujo/`** | El código. Compuertas, instrumentación, Chao1, catálogo, ficha y el orquestador |
| **`tests/`** | 77 pruebas. Casos de regresión **D (LEGO)** y **F (Cuprum)**, más el truco del contador vacío y el lazo de refuerzo |
| **`metodo/`** | El *por qué* de cada paso, con su disparador medido |
| **`SKILL-criterio.md`** | Lo que juzga Claude y el código no puede |
| **`CHANGELOG.md`** | Versiones de la herramienta |

### El código, archivo por archivo

| Archivo | Líneas | Qué resuelve |
|---|---|---|
| `flujo/compuertas.py` | 365 | Las tres compuertas, como `raise`: **agotado**, **presupuesto**, **confianza**. Y `Busqueda`: el registro de trabajo ejecutado del que **se derivan** los contadores |
| `flujo/confianza.py` | 314 | Niveles e **instrumentación de fuentes por dato**: cada campo guarda todas las observaciones que lo sostienen, con su fuente, su raíz, su forma y la certeza que declara. La **regla C1** vive aquí |
| `flujo/orquestador.py` | 279 | El CLI que dice cuál es el paso siguiente y se niega a saltarlo |
| `flujo/estado.py` | 265 | La corrida que Python posee. Las cuatro olas y el **lazo de refuerzo** |
| `flujo/chao1.py` | 147 | Estimador de completitud, con **veredicto de cuatro valores**: solo `saturo` detiene el lazo |
| `flujo/ficha.py` | 117 | Modo limpio y modo procedencia, con checklist de lo que no se pudo hacer |
| `flujo/catalogo.py` | 85 | Las **13 fuentes descartadas**, rechazadas por código con su razón, y qué fuente le corresponde a cada módulo |

### La regla que ordena las compuertas

> **Una compuerta verifica evidencia, no cuenta declaraciones.**

`n_raices` no es un contador que alguien sube: es un hecho que se lee de las
observaciones. Desde la v0.3.0 los contadores de agotado funcionan igual — son
**derivados** del registro de búsquedas, y una búsqueda solo existe si trae su
consulta textual, su fuente permitida para ese módulo y su número de resultados.
`resultados=0` cuenta: cero resultados **es** una respuesta.

### El método

| Documento | Qué contiene |
|---|---|
| **`metodo/busqueda-encadenada-contactos.md`** | El método completo, v1.5. **El diccionario de puestos está en su §3.4** |
| `metodo/modulos-de-contactos.md` | Los 14 módulos con contrato, el orden óptimo y la matriz de challenge |
| `metodo/fixtures/contactos-casos-de-regresion.md` | Los casos A–F |
| `metodo/enriquecimiento-organico.md` | Capa de enriquecimiento, solo diseño |

---

## Las tres reglas que el código hace cumplir

**1 · Agotado.** Un módulo no cierra si no llegó a su criterio. Con un solo
directorio consultado:

```
  ⛔ COMPUERTA: [M1] NO agotado: MINIMO TRES directorios consultados
  y contrastados. Lleva directorios=1, se exigen 3.
```

**2 · Presupuesto.** Bloques de 10 consultas, paro tras 3 bloques secos, tope
por cuenta. Repartir por orden de llegada costó ~17% de entradas con el mismo
gasto.

**3 · Confianza.** Una sola fuente **topa en SÓLIDO**, nunca CONFIRMADO. Y una
sola fuente **NO es conflicto**: el conflicto es cuando **dos chocan**.

> Esa segunda mitad importa tanto como la primera. Si una fuente fuera
> conflicto, la mayor parte de cada ficha se iría a revisión humana y el
> vendedor recibiría pendientes en vez de contactos.

---

## Cómo se corre

Solo biblioteca estándar de Python 3.11. Nada que instalar.

```bash
cd prospector
python3 -m flujo.orquestador iniciar --empresa "Grupo Cuprum" \
        --ciudad "San Nicolas de los Garza, NL" --giro aluminio --tope 60
python3 -m flujo.orquestador siguiente --empresa "Grupo Cuprum"
```

El orquestador dice qué módulo toca, cuándo se considera agotado y cuánto
presupuesto queda. Claude corre **ese** módulo, registra lo que encontró, y el
orquestador decide si se avanza.

```bash
python3 -m pytest tests -q     # 77 pruebas
```

---

## Estado: qué está probado y qué no

| | |
|---|---|
| ✅ Compuertas, instrumentación, Chao1, catálogo, ficha, CLI | construido y probado |
| ✅ Corrida real de **Cuprum** (24-sep-2026) | Odoo + Outlook + 6 búsquedas en vivo · **3 conflictos atrapados solos** |
| 🔵 **M0 · Odoo** | funciona; se corrió en la corrida real |
| 🔵 **M7 · PDFs** y **M8 · padrones** | `WebFetch` bloqueado desde CC web: se ven existir y no se leen |
| 🔵 **M9 · aduanas** | nunca corrido, sin una sola medición |

### Lo que la corrida real dejó abierto

- **La compuerta de agotado no verifica nada.** Cuenta lo que le declaran. Un
  contador se puede inflar con registros vacíos. Detiene el descuido, no la
  determinación.
- **M5 lee un contador de bloques secos distinto** del que `Presupuesto` ya
  lleva. Dos fuentes de verdad para el mismo hecho.
- **El loop quedó sin disparador** al principio de una corrida: depende de que
  Chao1 sea confiable, y al principio nunca lo es.

---

## De dónde viene esto

El historial completo —auditorías, decisiones y correcciones— está en los
issues de **`yinyo1/fts-mcp-odoo`**:

| Issue | Qué resolvió |
|---|---|
| #14 | El método documentado |
| #15 | Auditoría de estado: qué está construido y qué es diseño |
| #16 · #17 | El motor de combinaciones · los tres niveles de la ficha |
| #18 | La capa de PDFs públicos, con su límite de privacidad |
| #19 | Los módulos con contrato, el orden óptimo y la matriz de challenge |
| #20 | Veredicto de efectividad y ranking de rendimiento por módulo |
| #21 | El inventario completo de fuentes |
| #22 | El flujo validado y la propuesta de empaquetado |
| #23 | La herramienta construida |
| #24 | **La corrida real de Cuprum** |

**De aquí en adelante, los avances se escriben en los issues de
`yinyo1/fts-suite`.**

## Historial

Los issues #14 a #24 de `fts-mcp-odoo` están copiados íntegros en
[`HISTORIAL.md`](HISTORIAL.md) —fecha, decisiones, hallazgos y correcciones—.
**Es una copia: los issues originales siguen abiertos y sin editar en
`fts-mcp-odoo`.**

## Referencias cruzadas

Las referencias quedaron **resueltas dentro de esta carpeta**. Los cinco
documentos y los tres datos que el método citaba y que vivían en
`fts-mcp-odoo` se trajeron aquí, y los enlaces se reapuntaron a esta copia:

| Ahora vive en | Venía de |
|---|---|
| `metodo/denue-padron.md` | `docs/n8n/denue-padron.md` |
| `metodo/denue-vigilante.md` | `docs/n8n/denue-vigilante.md` |
| `metodo/red-de-validacion.md` | `docs/prospectar/red-de-validacion.md` |
| `metodo/fuentes-de-senal.md` | `docs/prospectar/fuentes-de-senal.md` |
| `SKILL-orquestador.md` | `.claude/skills/prospectar/SKILL.md` |
| `datos/fuentes.json` · `datos/consultas_senal.json` · `datos/padron_denue.csv` | `db/datos/` |
| `herramientas/cargar_padron.py` | `scripts/cargar_padron.py` |

`SKILL-orquestador.md` **se copió sin su frontmatter a propósito**: aquí es
documentación para leer, no una skill registrada. La skill viva sigue operando
en `fts-mcp-odoo`.

Quedan a propósito dos menciones a rutas de `fts-mcp-odoo`: el post-mortem
`docs/n8n/incidente-kiosk-2026-09-18.md` (es un incidente de infraestructura de
n8n, no del método) y la ubicación de la skill viva. Son señalamientos, **no enlaces
rotos**: apuntan a algo que se quedó allá por decisión.
