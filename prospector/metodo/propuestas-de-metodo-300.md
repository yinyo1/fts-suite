# Cinco cambios de método, propuestos y NO construidos

Salen de la primera corrida **a escala** — Coficab en cuatro plantas, [#300] — y
de lo que dejó [#301]. Los cinco **cambian criterio**, así que quedan aquí como
diseño y no como código: ninguno se construye sin el OK de Esteban.

Cada uno dice: **qué se midió**, **el diseño**, **qué se rompe si se hace mal**, y
**la recomendación**. La última, la de la llave con ciudad, ya está construida y
lo que queda es la confirmación medida.

---

## 1 · Tope adaptativo en tramos de 30 consultas, con razón escrita

### Lo medido

Tres de las cuatro corridas cerraron en **60/60 con Chao1 pidiendo seguir**:

| | Chao1 | Cobertura | Veredicto | Cómo cerró |
|---|---|---|---|---|
| Juárez | 17 obs · 29.1 est | 58.4% | `falta_barrer` (confiable) | tope |
| Silao | 16 · 24.3 | 65.8% | `falta_barrer` (confiable) | tope |
| Durango | 9 · 11.7 | 77.1% | `prematuro` (no confiable) | tope |
| Pesquería | 5 · 7.0 | 71.4% | `prematuro` (no confiable) | **3 bloques secos** |

Ninguna cerró por haber agotado la búsqueda. El tope de 60 es un número que se
eligió antes de tener una sola corrida grande, y con Coficab quedó corto.

> **Una corrección a #300:** ese issue dice que en Juárez «el último bloque aún
> rendía 0.50 de valor por consulta». Leyendo M5 de Juárez — 24 consultas, 12
> entradas, 2 de valor — **0.50 es entradas por consulta; el de valor es 0.083**.
> La conclusión no cambia (la veta no estaba seca) pero la cifra sí, y el tope
> adaptativo se va a decidir con cifras como ésa.

### El diseño

El tope deja de ser un número y pasa a ser **un tramo con renovación**:

* **Tramo 1 = 60 consultas.** Igual que hoy. Es el presupuesto que una planta
  tiene sin que nadie decida nada.
* **Al llegar a 60**, en vez de cerrar, la compuerta **evalúa la renovación** de
  un tramo de **+30**. La renovación **no es automática por defecto**: exige que
  se cumplan las tres condiciones, y deja escrita la razón.
* **Tramo máximo sin humano: 90.** La segunda renovación (90 → 120) sale con
  **código 3** y la decide el operador.

**Por qué 30 y no 20 ni 50.** 30 consultas son **exactamente tres bloques de 10**,
que es la ventana mínima en la que la regla de saturación (*3 bloques secos
seguidos*) puede dispararse. Un tramo de 20 no le da a la compuerta de agotado
la oportunidad de probar que ya no hay nada; un tramo de 50 gasta 20 consultas
después de que ya se probó.

**Las tres condiciones, todas derivadas de evidencia, ninguna de un contador:**

1. **Chao1 dice que falta gente Y tiene con qué decirlo:** veredicto
   `falta_barrer` **y** `confiable: true`. `prematuro` **no alcanza** — ver el
   punto 2 de este documento: `prematuro` no significa «falta», significa «no sé».
2. **El último bloque cerrado NO fue seco.** Si el tramo terminó en seco, el
   problema no es el presupuesto.
3. **Queda al menos una vía sin agotar** en un módulo que no esté cerrado por
   `sin_acceso` u `omitida_por_costo`. Renovar el tope para volver a preguntar lo
   mismo es gastar por gastar.

**La razón escrita** se guarda en el estado, y es lo que la ficha y el issue
citan:

```json
"tramos": [
  {"tramo": 2, "tope_nuevo": 90, "ts": "…",
   "razon": "chao1 falta_barrer confiable 58.4% · ultimo bloque B6 10/5/1 no seco · M5 con 2 vias sin agotar",
   "chao1": {"obs": 17, "est": 29.1, "cobertura": 0.584},
   "ultimo_bloque": {"n": 6, "consultas": 10, "entradas": 5, "de_valor": 1}}
]
```

### Qué se rompe si se hace mal

**Si la renovación es automática y sin condiciones, el tope deja de ser un
presupuesto.** El tope no existe para estorbar: existe porque las consultas
cuestan — tiempo del operador, y en el caso de Lusha, dinero de verdad. Una
compuerta que se renueva sola cada vez que Chao1 dice «falta» **nunca cierra**,
porque Chao1 casi siempre dice que falta: es un estimador de población, y una
población de personas en una planta grande rara vez se agota.

Y al revés: **si la renovación exige humano siempre, con cuatro corridas en
paralelo son cuatro preguntas seguidas** y el operador acaba diciendo «sí» a las
cuatro sin leer. Una pregunta que siempre se contesta igual no es una compuerta.

### Recomendación

**Construirlo con el tramo automático único (60 → 90) y el segundo a humano.**
Acota el peor caso a 90 consultas por planta sin que nadie decida, deja las tres
condiciones como la evidencia que justifica el gasto, y manda al operador **una**
pregunta por planta en vez de ninguna o tres.

---

## 2 · Cuál compuerta manda cuando agotado y Chao1 no coinciden

### Lo medido

Pesquería: la compuerta de agotado paró en **3 bloques secos seguidos** — 30 de
60 consultas — mientras Chao1 decía `prematuro`, que el código traduce como «eso
manda SEGUIR, no terminar». **Ganó la de agotado**, por cómo está escrito el
código, no por una decisión de método. El issue lo marcó como contradicción sin
resolver.

La sugerencia de Esteban: **`prematuro` → manda agotado; `falta_barrer` con datos
→ manda Chao1.**

### El diseño

La sugerencia es correcta, y la razón es más fuerte que «prematuro pierde». **Las
dos compuertas no miden lo mismo:**

| | Qué mide | Qué significa cuando dispara |
|---|---|---|
| **Agotado** (3 bloques secos) | El rendimiento **marginal de la estrategia que se está corriendo** | «Estas consultas ya no traen nada» |
| **Chao1** | La **población que falta por ver**, estimada de las frecuencias | «Hay más gente ahí» |

Pueden tener razón **las dos a la vez**, y eso no es una contradicción: significa
*la población no está agotada, pero esta forma de preguntar sí.* La resolución
correcta no es «una gana» — es **cambiar de vía, no de presupuesto**.

Entonces, los tres casos, y sólo el tercero es nuevo:

1. **`prematuro` o `sin_datos` contra 3 bloques secos → manda AGOTADO. Para.**
   Y la razón que hay que escribir en la ficha no es «Chao1 dijo seguir y lo
   ignoramos». Es: **con 5 observaciones y f2 = 1, Chao1 no tiene denominador.**
   No dijo «falta gente»: dijo **«no puedo opinar»**. Tratar un «no sé» como un
   «sigue» es el mismo error que imprimir una liga sin comprobar como si abriera.
   El código hoy traduce `prematuro` a «eso manda SEGUIR», y esa frase hay que
   corregirla: `prematuro` **no manda nada**.
2. **`falta_barrer` confiable, sin bloques secos → manda CHAO1.** Es el caso de
   Juárez y Silao, y ahí no hubo contradicción real: las dos cerraron por tope,
   no por agotado. Se resuelve con el tramo adaptativo del punto 1.
3. **`falta_barrer` confiable **contra** 3 bloques secos → ninguna de las dos, y
   es el caso interesante.** Chao1 tiene datos y dice que falta ~40%; los bloques
   dicen que estas consultas ya no lo traen. **Las dos son ciertas: las consultas
   están mal, no el presupuesto.** Verdicto propuesto: **`CAMBIAR_DE_VIA`** — abre
   vuelta obligando a una **vía distinta** (otro módulo, otra fuente del catálogo,
   otra forma de preguntar), sin renovar tope. Y **sólo si no queda ninguna vía
   sin agotar**, entonces sí para, y la ficha dice exactamente eso: *«la población
   no está agotada; las vías disponibles sí. Lo que falta necesita Sales
   Navigator o una fuente que no tenemos.»*

Eso último es un hallazgo entregable, no un fracaso: le dice al operador **qué
comprar**.

### Qué se rompe si se hace mal

Si el desempate se escribe como una tabla de precedencia fija, el caso 3 se
resuelve mal en las dos direcciones: parar tirando el 40% que Chao1 vio, o seguir
gastando en consultas que tres bloques seguidos ya probaron secas.

### Recomendación

**Aprobar la regla de Esteban tal cual para los casos 1 y 2** — es la correcta y
no necesita código nuevo más que la corrección del texto de `prematuro` — y
**construir el caso 3 como `CAMBIAR_DE_VIA`** junto con el tramo adaptativo, que
es su pareja natural: uno decide si hay más presupuesto y el otro en qué gastarlo.

---

## 3 · La corrida corporativa / regional

### Lo medido

Compras MRO, compras regionales de Americas, EHS corporativo y una gerencia de
mantenimiento sin planta **aparecieron en 2 a 4 de las cuatro corridas**. Con dos
consecuencias medidas:

1. **Cada Chao1 los sumó a *su* población**, así que **los cuatro Chao1 estiman
   sobre una población que no existe**. Es el mismo defecto que la skill previene
   al prohibir «todas las plantas en una corrida», entrando por la puerta de atrás.
2. **Las fichas por planta traen gente que no es de esa planta** y la tienen que
   mandar a revisión humana: en Pesquería, el único contacto de la ficha limpia
   **es de Juárez**.

### El diseño

```bash
./prospector prospecta --empresa Coficab --nivel corporativo
```

* **`--nivel planta` (default) | `corporativo`.** Con `corporativo` no se pide
  `--ciudad`: la población no es geográfica.
* **Llave:** `coficab/_corporativo.json`. El guion bajo al frente la hace
  **imposible de colisionar con un slug de ciudad** — ningún nombre de ciudad
  empieza así — y la ordena primero en la tabla de `estado`.
* **El juego de módulos cambia, y por criterio:**
  * **entran** M0/M0b/M0c (el buzón corporativo es *más* rentable aquí), M1, M5,
    M6, y **M3 sube de valor**: cámaras, congresos y normalización son donde
    aparece la gente corporativa, no la de piso;
  * **salen** M2 y M13. Una vacante y un establecimiento del DENUE son **objetos
    de planta**: forzarlos al nivel corporativo devuelve las plantas otra vez, que
    es el problema que este cambio resuelve.
* **La ficha lo dice en el encabezado:** «nivel corporativo / regional — **no es
  de una planta**», y en «a quién buscar» cada contacto lleva su alcance.
* **Y el cambio que de verdad arregla el doble conteo, en las corridas de
  planta:** un contacto cuya evidencia lo ubica en **otra planta o en
  corporativo** deja de contarse en el Chao1 de esta planta, y en vez de irse a
  revisión humana **se exporta a la semilla de la corrida corporativa**. Hoy son
  ruido en cuatro fichas; así son el insumo de una quinta.

### Qué se rompe si se hace mal

**Si la corrida corporativa es sólo «otra corrida con otro nombre», no arregla
nada:** el doble conteo no lo causa la falta de una corrida, lo causa que las de
planta *cuentan* gente que no es suya. Sin la última viñeta — la exclusión del
Chao1 de planta y la exportación — este cambio agrega una quinta corrida y deja
los cuatro denominadores igual de mal.

Y al revés: si la exclusión se hace por heurística de puesto («compras = es
corporativo»), se pierde la gerencia de compras **de la planta**, que sí es
target. La exclusión tiene que salir de la **evidencia de ubicación** del
contacto, no de su título.

### Recomendación

**Construirlo, y en este orden:** primero la exclusión del Chao1 de planta y la
exportación de los regionales (que es el arreglo), después el `--nivel
corporativo` (que es el destino de lo exportado). Al revés se tiene una corrida
nueva y el mismo defecto.

---

## 4 · Sembrar entre corridas

### Lo medido

El patrón de correo `nombre.apellido@coficab.com` **se re-derivó cuatro veces**,
con las mismas cuatro fuentes y **la misma única ancla de Juárez**. En serie, las
otras tres plantas habrían arrancado con el patrón ya anclado y unas 5 consultas
cada una se habrían ido a buscar personas.

### El diseño

```bash
./prospector sembrar --de "Coficab/Cd. Juarez" --a "Coficab/Durango" \
                     --que patron,vocabulario
```

**Tres cosas que se siembran, y son de naturaleza distinta:**

| Qué | De quién es | Se siembra |
|---|---|---|
| **Patrón de correo** | de la **empresa**, no de la planta | **Sí, es el caso más seguro.** Con su ancla, su nivel y de qué corrida salió |
| **Vocabulario** | casi todo de la empresa; algo de la planta | **Sí**, término por término, con su procedencia. «COFICAB LEON» es de Silao y no sirve en Durango; el título que la empresa usa de verdad sirve en las cuatro |
| **Contactos regionales** | de **nadie y de todos** | **NO a una corrida de planta.** Van a la corrida corporativa del punto 3. Sembrarlos en las plantas es exactamente lo que causó el doble conteo |

**Y la restricción que hace que esto no sea un agujero: una semilla NO es
evidencia.** Un dato sembrado:

* **no cuenta como consulta** y **no mueve el agotado** — no se ejecutó trabajo en
  esta corrida;
* **no cuenta como raíz** para confirmar. Esto es lo importante: la única ancla
  del patrón es **una observación en Juárez**. Si sembrarla contara como fuente,
  esa **única** observación produciría CONFIRMADO en cuatro corridas, y el estado
  reportaría cuatro confirmaciones de un solo hecho. Es la misma familia de error
  que la regla de RAÍCES previene — `odoo`, `outlook` y `outlook_personas` son una
  sola raíz porque comparten origen — y una semilla comparte origen con la corrida
  que la sembró **por definición**;
* entra marcada `sembrado: true` con la corrida de origen, y **topa en
  CANDIDATO** hasta que la corrida destino lo observe por su cuenta. Entonces sube
  con sus propias raíces.
* **La ficha lo dice:** «patrón sembrado de la corrida de Cd. Juárez, no
  observado aquí». Un correo derivado de un patrón sembrado es un candidato de
  segundo grado, y quien lo reciba tiene derecho a saberlo.

### Qué se rompe si se hace mal

**Si la semilla cuenta como fuente, la herramienta empieza a mentir con
confianza.** Es el peor modo de falla de todo este documento: no pierde datos,
**inventa confirmaciones**. Cuatro corridas reportando CONFIRMADO sobre una sola
observación es indistinguible, leyendo el estado, de cuatro observaciones
independientes — y es lo que la regla de raíces existe para impedir.

### Recomendación

**Construirlo, con `patron` y `vocabulario` nada más**, y los contactos
regionales por la vía del punto 3. Mientras no exista, **la siembra a mano es
parte del oficio**: pasarle al agente de la segunda planta el patrón y el
vocabulario de la primera, en el prompt, diciendo de dónde salen. Ya está anotado
así en la skill.

---

## 5 · La llave con ciudad: confirmada, y medida

Esto **ya está construido** (#301, `60625c9`) y lo que faltaba era la
confirmación. Medida en este contenedor, con las cuatro plantas:

```
coficab/cd-juarez.json
coficab/durango.json
coficab/pesqueria.json
coficab/silao.json
```

Y la ficha de Durango:

```
<h1>Coficab</h1>
<div class="meta">Durango · …
```

**El título dice `Coficab`, no `Coficab Juarez`.** La empresa que se guarda es la
real — la que cruza con el padrón — y la planta vive en su campo, que es donde
siempre debió estar. Lo que #300 reportó como cosmético estaba además rompiendo
el empate del DENUE: `--empresa "Coficab Juarez"` buscaba una empresa que no
existe.

**No hay nada que decidir aquí.** Queda en este documento porque #300 lo dejó
como pendiente y el pendiente está cerrado.

---

[#300]: https://github.com/yinyo1/fts-suite/issues/300
[#301]: https://github.com/yinyo1/fts-suite/issues/301
