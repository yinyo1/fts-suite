# Cómo se usa — guía corta

> Esto es la guía de **uso**. El *por qué* de cada paso está en
> [`metodo/`](metodo/); el estado del código, en [`README.md`](README.md).

---

## La instrucción

```
prospecta <empresa>
```

Y si hace falta:

```
prospecta <empresa> en <ciudad>
```

**La empresa es lo único obligatorio.** La ciudad, el giro, la entidad y el
dominio se sacan del padrón del DENUE. Si no aparece ahí, la corrida arranca
igual y lo dice.

### Si prefieres el comando directo

```bash
cd prospector
./prospector prospecta --empresa "Hershey"
```

---

## Qué pasa cuando la dices

| Respuesta | Qué significa | Qué haces |
|---|---|---|
| Sale **el plan** con la geografía ya puesta | La cuenta está en el padrón y se resolvió sola | Nada: Claude lo sigue |
| Sale **una pregunta de una línea** — *«tiene 3 plantas, ¿cuál?»* | Varias plantas de la misma cuenta. **No elige una en silencio** | Contestas la ciudad |
| Sale el plan con **una bandera** del padrón | La cuenta no está en el mapa, o el mapa está viejo | Nada: la bandera avisa, no frena |

> **Por qué pregunta en vez de elegir:** el padrón tiene tres plantas de Bimbo en
> dos municipios. Elegir una sin decirlo es el error que en Ragasa dio cinco DUNS
> con la misma razón social, uno de ellos en Jalisco. **El nombre no desempata;
> el domicilio sí.**

---

## Qué conectores tienen que estar vivos

| Conector | Para qué | Si está caído |
|---|---|---|
| **Odoo** | M0 · ¿ya es cliente? Si lo es, el patrón de correo es **real**, no derivado | La corrida sigue. Se pierde saber si hay cuenta y el patrón real |
| **Outlook** | M0b · ¿hay historia? | La corrida sigue, **y pierde la fuente más rentable** |
| **WebSearch** | Directorios, vacantes, prensa, personas | Sin esto la cascada **no sirve**: es donde vive casi todo |

### Cómo saber si están vivos

```bash
./prospector listo
```

Verifica lo que la máquina puede: padrón, pruebas, destino de salida. Los
conectores los marca `[ ? ]`, y es deliberado:

> **Solo Claude puede comprobarlos, llamándolos.** Viven detrás de MCP y desde
> Python no se ven. Darlos por buenos sin llamarlos sería el mismo pecado que la
> compuerta de agotado persigue: contar una declaración como si fuera evidencia.

Así que la comprobación real son dos llamadas, y Claude las hace al arrancar: una
lectura a `res.partner` y una búsqueda en el buzón. **Si alguna falla, lo dice
antes de empezar.**

### Reconectar

Ajustes → Conectores en claude.ai. Odoo es `FTS_Odoo`; Outlook, `Microsoft_365`.
Cuando la sesión lleva horas, la de Odoo caduca y hay que reautenticarla: el
síntoma es `MCP server session expired`.

---

## Qué entrega, y dónde queda

Dos archivos, en **la carpeta de la sesión**:

| Archivo | Para quién |
|---|---|
| `<empresa>-limpio.html` | **Rissia.** La ficha: contactos por cercanía a la decisión, el ángulo técnico, y los datos con salvedad marcados |
| `<empresa>-procedencia.json` | Auditar. Cada campo con todas sus fuentes, su raíz y su fecha |

La ruta exacta la imprime el arranque. Por omisión:

```
$TMPDIR/prospector-corridas/<sesión>/
```

### Nunca en el repo, y no es por descuido

> Los contactos son **datos personales** y este repositorio es **público**. La
> ficha lleva nombres, puestos y correos.

`flujo/salida.py` **se niega con un error** si el destino cae dentro del árbol del
repositorio, incluso si se lo pides a mano con `PROSPECTOR_SALIDA`. El
`.gitignore` sigue ahí, pero es la red, no la cerradura.

**La ficha vive con la sesión.** Si la vas a guardar, descárgala. A futuro los
contactos van a Postgres y de ahí a Odoo; hoy no, a propósito.

---

## Qué hacer si una fuente sale `sin_acceso`

**Nada urgente. Es información, no una falla.** La ficha trae un checklist de
cierre que declara cada hueco con su razón, y ésa es la diferencia entre *«no hay
nada»* y *«nadie preguntó»*.

| Sale `sin_acceso` | Por qué, y qué hacer |
|---|---|
| **M7 · PDFs** y **M8 · padrones** | `WebFetch` está bloqueado por la política de egress. **Medido, no supuesto.** No se arregla desde aquí: el camino es n8n. Normal que salgan así |
| **M9 · aduanas** | Panjiva y el detalle de Veritrade piden suscripción |
| **M0b · Outlook** | El conector está caído. **Esto sí vale reconectar**: fue la fuente que destapó las dos cotizaciones de Ragasa y el NDA de Hershey |
| **M0 · Odoo** | Igual: reconectar |

Los cinco estados y lo que significan:

| Estado | Qué dice |
|---|---|
| `respondio` | Contestó. **Cero resultados ES una respuesta** |
| `no_aplicaba` | Nada que aportar por su naturaleza. **Exige el por qué** |
| `fallo` | Se intentó y no contestó. Va a la cola de reintento |
| `sin_acceso` | Hueco declarado, **nunca simulado** |
| `omitida_por_costo` | **Exige quién decidió** |

---

## Lo que la herramienta NO hace

- **No escribe a Odoo.** Lee. Nunca escribe.
- **No gasta Lusha** sin autorización explícita de esa corrida.
- **No raspa LinkedIn autenticado.** Arriesga el baneo de la cuenta de Rissia, y
  eso no es reversible.
- **No elige entre fuentes que chocan**, salvo cuando hay mayoría clara de tres
  contra una *y* alguien vio un dato literal. Entonces reporta el valor **con la
  disidencia al lado** — ver §5.1 del método.
- **No corre barridos pesados en horario de producción** (07:00–18:00 CST).

---

## Cuando algo te frena

El mensaje dice qué falta y cómo cumplirlo. Ejemplo real:

```
⛔ COMPUERTA: [M1] NO agotado: MINIMO TRES directorios DISTINTOS consultados
y contrastados. Lleva directorios=1, se exigen 3. Vías distintas en el
registro: leadiq. Repetir la misma vía, o repetir la misma consulta con otra
etiqueta, no suma.
```

Dos salidas, y ninguna es rodearla:

1. **Cumplir el criterio** — correr dos directorios más.
2. **Cerrar el módulo con su estado y su razón** — si de verdad no hay más.

> La compuerta no está para estorbar. Está porque en septiembre una ficha salió
> diciendo *«patrón 100%, el más limpio de las ocho»* con **un solo directorio**
> detrás.
