---
name: prospecta
description: Arma la ficha de contactos de una planta industrial de una sola instruccion. Usar cuando se pida "prospecta <empresa>", "prospecta <empresa> en <ciudad>", prospectar una cuenta, armar su ficha de contactos, o buscar quien compra mantenimiento, agua, vapor, calderas o servicios industriales en una planta. La empresa es lo unico obligatorio; la ciudad y el giro se infieren del padron. La skill verifica sola el padron, las pruebas y los tres conectores -Odoo, Outlook, WebSearch- antes de arrancar: el operador NO tiene que pedirlo aparte.
---

# prospecta

**La frase:** `prospecta <empresa>` — y si hace falta, `prospecta <empresa> en <ciudad>`.

La empresa es **lo único obligatorio**. Todo lo demás se infiere del padrón.

> **Eso es lo único que el operador escribe.** La verificación previa la haces
> tú, sola, sin que te la pidan. Él te habla en lenguaje natural desde la web;
> no tiene terminal y no debería tener que acordarse de pedir `listo` cada vez.
> **Solo le hablas si algo requiere su decisión:** un conector caído, o una
> empresa con varias plantas.

---

## 1 · PRIMER PASO, sin que te lo pidan: verifica

Antes de escribir `prospecta`, dos cosas. No son opcionales y no se saltan.

### 1a · Lo que la máquina verifica

```bash
cd <repo>/prospector && ./prospector listo
```

Padrón vigente, pruebas en verde, salida fuera del repo. Si algo sale `FALLA`,
**dilo y no arranques.**

### 1b · Los tres conectores: LLÁMALOS

`listo` los marca `[ ? ]` porque **Python no los ve** —viven detrás de MCP—.
Llamarlos es tuyo, y llamarlos de verdad:

| Conector | La llamada mínima | Por qué importa |
|---|---|---|
| **Odoo** (M0) | una lectura a `res.partner` con el nombre de la cuenta | dice si la cuenta **ya tiene relación**, y una cuenta con historia se trabaja al revés que una fría |
| **Outlook** (M0b) | una búsqueda en el buzón con el nombre de la cuenta | la **más rentable cuando hay historia**: los correos literales de un hilo son **anclas**, y ninguna otra fuente las da |
| **WebSearch** | una consulta cualquiera | sin ella no hay OLA 1 ni motor. En una cuenta sin historia pone el **100% del valor** (medido en #295) |

Y **registra lo que contestaron de verdad**:

```bash
./prospector conectores \
  --odoo      "1 fila de res.partner, customer_rank=1" \
  --outlook   "12 hilos" \
  --websearch "10 resultados"
```

La evidencia es **obligatoria**: un `vivo` sin decir qué devolvió es una
declaración, y las declaraciones son lo que esta herramienta no acepta.

> **`prospecta` se niega a abrir la corrida sin esa constancia**, y la sonda
> **vence a los 60 minutos** —una sonda de hace seis horas no prueba que el
> conector esté vivo *ahora*—. Es el mismo mecanismo que `buscar`, que exige la
> consulta textual porque no puede comprobar que se corrió.

### 1c · Si un conector está caído

Regístralo como caído, **con lo que pasó**:

```bash
./prospector conectores --outlook-caido "timeout de MCP, no responde"
```

Entonces `prospecta` **se detiene y devuelve 3** —la misma salida que la pregunta
de la empresa multiplanta, porque es lo mismo: una decisión del operador, no un
error que arreglar—. Pásale la pregunta **en una línea**, así:

> «Outlook no responde. Es la fuente más rentable cuando hay historia —los
> correos literales de un hilo son las únicas anclas duras—. ¿Seguimos sin él o
> esperamos a que se reconecte?»

Si dice que sigan, **queda escrito**:

```bash
./prospector conectores --continuar-sin outlook --razon "<lo que dijo>"
```

Eso no es un trámite: M0b queda **`sin_acceso` con razón escrita**, y eso viaja
hasta el checklist de validaciones de la ficha. Quien la reciba va a ver que la
corrida se hizo ciega de esa fuente. **No arranques a ciegas y no simules la
fuente.**

**`WebFetch` no cuenta aquí.** Está bloqueado por egress en este entorno,
medido, y **no detiene nada**: M7 y M8 saldrán `sin_acceso` como ya está
previsto.

---

## 2 · Ahora sí, arranca

```bash
./prospector prospecta --empresa "<empresa>"
```

Eso hace solo: verifica las sondas, resuelve la cuenta en el padrón del DENUE,
infiere ciudad, giro, entidad y dominio, abre la corrida **fuera del repo**,
registra M13 con lo que el padrón contestó de verdad, y **entrega el plan con los
comandos ya escritos**.

Tres respuestas posibles, y las tres son correctas:

| Lo que sale | Qué hacer |
|---|---|
| El plan, con la geografía inferida | Seguirlo |
| **Una pregunta de una línea** (*«tiene 3 plantas, ¿cuál?»*, salida 3) | Preguntársela al usuario tal cual y repetir con `--ciudad`. **No elijas una tú.** |
| El plan con una **bandera** del padrón | Seguirlo igual. La bandera es aviso, no freno. |

### Una corrida = UNA planta

**La herramienta corre una planta a la vez.** Si la empresa tiene varias, es
**una corrida por ciudad**:

```bash
./prospector prospecta --empresa "<empresa>" --ciudad "Pesquería, NL"
./prospector prospecta --empresa "<empresa>" --ciudad "Durango"
```

No `prospecta <empresa>` con la intención de abarcar «todas las plantas de
México» en una sola corrida. Dos razones, las dos medidas:

1. **Los bloques de 10 dejan de medir.** El bloque existe para medir rendimiento
   marginal *de un barrido*. Si el barrido salta entre seis plantas, el bloque no
   mide nada: una consulta que no rinde en Durango puede rendir en Pesquería, y
   el promedio miente en las dos direcciones.
2. **Chao1 deja de tener denominador.** Estima la población de **una** población.
   Mezclar seis plantas es estimar sobre seis poblaciones a la vez, y el
   resultado no es interpretable ni para seguir ni para parar.

Y hay una razón de oficio encima: el entregable es **por planta**. Rissia trabaja
una planta, con su responsable de mantenimiento y su ciudad.

> **Cuando la herramienta pregunta cuál planta, pregúntasela al usuario y
> espera.** Salida 3 con una pregunta de una línea es la respuesta correcta a una
> empresa multiplanta, no un error a sortear. **No elijas tú, y no las abarques
> todas.** Elegir en silencio es el defecto de los cinco DUNS de Ragasa; abarcar
> todas es el mismo error con otro disfraz.
>
> El mapeo de plantas sí se hace en **una** corrida —M12 y M2 lo dan casi
> gratis—: se anota en la señal, y cada planta con responsable se prospecta en su
> propia corrida.

## 3 · Corre el plan, paso por paso, de verdad

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

## 4 · Si una fuente no está, se declara

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

## 5 · Gasto, lazo, cierre

```bash
./prospector bloque    --empresa "<empresa>"      # las cifras salen del registro
./prospector siguiente --empresa "<empresa>"     # dice siempre qué toca
./prospector vuelta    --empresa "<empresa>"     # si el paso dice LOOP
./prospector challenge --empresa "<empresa>"     # cruza; se niega si algo está abierto
./prospector ficha     --empresa "<empresa>" --modo limpio        # escribe el .html
./prospector ficha     --empresa "<empresa>" --modo procedencia   # .html + .json
```

### Cierra el bloque cada 10 consultas. En serio.

`bloque` ya **no** lleva `--consultas` ni `--nuevas`: las dos cifras salen del
registro. Lo único que tienes que hacer es cerrarlo a tiempo.

A las 9 consultas `buscar` avisa; **a las 10 se niega a registrar la siguiente**
hasta que cierres. Eso no es un estorbo, es el arreglo de un error real: en la
primera corrida de un operador el bloque quedó en **35**, y un bloque de 35 no se
puede cerrar (el máximo es 10) **ni partir** sin editar el estado a mano.
Consecuencia: M5 cerrado como `fallo` y la vuelta que Chao1 pedía imposible de
abrir. Ahora el error se detecta cuando todavía tiene arreglo.

### La ficha sale como ARCHIVO

`ficha --modo limpio` escribe un **.html autocontenido** en la carpeta de la
corrida e **imprime la ruta exacta**. Ese archivo es el entregable: se adjunta a
un correo, se pega en un lognote de Odoo, se abre en cualquier navegador.

Trae gancho, señal con fecha, por qué ahora, a quién buscar (nombre, puesto,
planta, correo y nivel de confianza), cómo hablarles, las búsquedas ya armadas
para Sales Navigator, las fuentes con liga y fecha, y el checklist de qué se
corrió y qué salió `sin_acceso` y por qué.

**Tres de esas secciones son tuyas**, porque son criterio y el código no puede
derivarlas. Cárgalas antes de emitir:

```bash
./prospector registrar --empresa "<empresa>" --modulo M12 --datos '{
  "gancho": "<una frase: por qué esta planta, ahora>",
  "por_que_ahora": "<la lectura de la señal, con su fecha>",
  "como_hablarles": ["<con qué se le habla al de mantenimiento>", "<y al de compras>"]
}'
```

Si faltan, la ficha **lo dice en su lugar** y nombra el comando. No las deja en
blanco: una ficha que parece completa y no lo está es peor que una con avisos.

**Pásale `--liga` a cada `buscar` que tenga URL.** La ficha las imprime con su
fecha, y es lo que permite que un tercero verifique sin volver a buscar.

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

## La secuencia completa, de memoria

Cuatro comandos. Los tres primeros son tuyos y el operador no los ve; el cuarto
es el que él pidió.

```bash
./prospector listo                                   # 1 · padrón, pruebas, salida
#            ... llamas a Odoo, Outlook y WebSearch de verdad ...
./prospector conectores --odoo "…" --outlook "…" --websearch "…"   # 2 · registras
./prospector prospecta --empresa "<empresa>"         # 3 · abre y entrega el plan
```

Una vez sondeados, `listo` **deja de decir `[ ? ]`** y muestra lo que cada
conector contestó, con la antigüedad de la sonda. Si vuelves a arrancar más de
una hora después, hay que volver a llamarlos: la sonda vence.

## El método

El *por qué* de cada paso está en `prospector/metodo/busqueda-encadenada-contactos.md`.
Léelo antes de proponer un cambio al orden: cada paso tiene un disparador medido
detrás, y §10 dice cómo se versiona una corrección.
