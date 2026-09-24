---
name: prospecta
description: Arma la ficha de contactos de una planta industrial de una sola instruccion. Usar cuando se pida "prospecta <empresa>", "prospecta <empresa> en <ciudad>", prospectar una cuenta, armar su ficha de contactos, o buscar quien compra mantenimiento, agua, vapor, calderas o servicios industriales en una planta. La empresa es lo unico obligatorio; la ciudad y el giro se infieren del padron del DENUE.
---

# prospecta

**La frase:** `prospecta <empresa>` — y si hace falta, `prospecta <empresa> en <ciudad>`.

La empresa es **lo único obligatorio**. Todo lo demás se infiere del padrón.

---

## 1 · Arranca con un comando

```bash
cd <repo>/prospector && ./prospector prospecta --empresa "<empresa>"
```

Eso hace solo: resuelve la cuenta en el padrón del DENUE, infiere ciudad, giro,
entidad y dominio, abre la corrida **fuera del repo**, registra M13 con lo que el
padrón contestó de verdad, y **entrega el plan con los comandos ya escritos**.

Tres respuestas posibles, y las tres son correctas:

| Lo que sale | Qué hacer |
|---|---|
| El plan, con la geografía inferida | Seguirlo |
| **Una pregunta de una línea** (*«tiene 3 plantas, ¿cuál?»*, salida 3) | Preguntársela al usuario tal cual y repetir con `--ciudad`. **No elijas una tú.** |
| El plan con una **bandera** del padrón | Seguirlo igual. La bandera es aviso, no freno. |

## 2 · Corre el plan, paso por paso, de verdad

**Cada búsqueda del plan se ejecuta.** El plan dice qué buscar, con qué vías y
por qué en ese orden; tú corres la búsqueda y registras lo que contestó:

```bash
./prospector buscar --empresa "<empresa>" --modulo M1 --clave directorios \
  --fuente leadiq --consulta '<la consulta textual que corriste>' --resultados N
./prospector cerrar --empresa "<empresa>" --modulo M1
```

> **La compuerta exige que la consulta esté escrita; no puede comprobar que se
> corrió.** Ese hueco lo cierras tú. Registrar una búsqueda que no corriste
> convierte la herramienta en un generador de fichas falsas.

**`--resultados 0` es válido y cuenta.** Cero resultados es una respuesta: haber
preguntado bien y no encontrar nada es trabajo hecho.

## 3 · Si una fuente no está, se declara

```bash
./prospector cerrar --empresa "<empresa>" --modulo M8 \
  --estado sin_acceso --razon "<por qué exactamente>"
```

**Nunca la simules.** Los cinco estados son `respondio` · `no_aplicaba` ·
`fallo` · `sin_acceso` · `omitida_por_costo`, y los tres últimos **exigen razón
escrita**.

En este entorno, medido: **`WebFetch` está bloqueado por egress**, así que M7
(PDFs) y M8 (padrones) suelen salir `sin_acceso` legítimamente. Eso no es una
falla de la corrida.

## 4 · Gasto, lazo, cierre

```bash
./prospector bloque    --empresa "<empresa>" --consultas 10 --nuevas 7
./prospector siguiente --empresa "<empresa>"     # dice siempre qué toca
./prospector vuelta    --empresa "<empresa>"     # si el paso dice LOOP
./prospector challenge --empresa "<empresa>"     # cruza; se niega si algo está abierto
./prospector ficha     --empresa "<empresa>" --modo limpio
```

Registra **cada** bloque de consultas que gastes: es lo que mide el rendimiento
marginal y lo que agota M5.

---

## Lo que tú decides, y el código no puede

El reparto es una línea nítida: **Python es dueño de las compuertas — orden,
presupuesto, agotado, confianza. Tú eres dueño del criterio.**

| Tuyo | Del código |
|---|---|
| Si dos empresas de nombre parecido son **la misma** | El orden de los módulos |
| Si un puesto **compra** agua, vapor o mantenimiento | Cuándo un módulo está agotado |
| Qué **título técnico** sale de una nota de prensa | Qué nivel de confianza merece un dato |
| La **redacción** de la ficha | Si el presupuesto alcanza |

Cuando una compuerta te frena, **no la rodees**: o cumples su criterio, o cierras
el módulo con su estado y su razón. El mensaje del `raise` dice cuál de las dos.

## Dos cosas que no se negocian

1. **Nada de contactos al repo.** La corrida y la ficha van a la carpeta de la
   sesión. `flujo/salida.py` se niega con un `raise` si el destino cae dentro del
   árbol del repositorio. Es un repo **público**.
2. **Cero escrituras a Odoo.** La herramienta lee; nunca escribe. Y Lusha no se
   toca sin autorización explícita de esa corrida.

## Antes de la primera corrida del día

```bash
./prospector listo
```

Verifica padrón, pruebas y destino de salida. Los conectores (Odoo, Outlook,
WebSearch) los marca `[ ? ]` porque **solo tú puedes comprobarlos, llamándolos**.
Hazlo: una lectura a `res.partner` y una búsqueda en el buzón. Si alguno está
caído, dilo antes de arrancar — Odoo y Outlook son las dos fuentes más rentables
y su ausencia limita la corrida.

## El método

El *por qué* de cada paso está en `prospector/metodo/busqueda-encadenada-contactos.md`.
Léelo antes de proponer un cambio al orden: cada paso tiene un disparador medido
detrás, y §10 dice cómo se versiona una corrección.
