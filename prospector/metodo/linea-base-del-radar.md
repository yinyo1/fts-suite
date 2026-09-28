# La línea base del radar · medición del 28-sep-2026

> **Se mide, no se opina.** `herramientas/linea_base_radar.py` la recalcula desde
> `datos/senales-documentadas.json`, y el «antes» **no está guardado a mano**: se
> obtiene desactivando D3 y los tres defectos B1/B2/B3 dentro de un contexto que
> restaura el estado al salir. Así el «antes» es lo que el evaluador de verdad
> decía, no lo que alguien recuerda que decía.

## La cifra

| | |
|---|---|
| Cuentas ya evaluadas | **13** |
| Con señal documentada en el repo | **9** |
| Huecos (nadie documentó su señal) | **4** |
| **Pasan solas, con lo documentado** | **3 de 9** |
| Pasarían si la señal estuviera fresca | **4 de 9** |
| Subieron con D3 | **7 de 9** |

```
cuenta                       antes  despues veredicto   techo  fecha?
----------------------------------------------------------------------
Coficab/Pesqueria             22.7     64.9      pasa    87.9      NO
Coficab/Durango               12.0     66.4      pasa              si
LEGO                          10.0     20.0   archiva    43.0      NO
Ragasa                        18.0     18.0   archiva    41.0      NO
Cuprum                        18.0     28.0   archiva    51.0      NO
Bimbo                         18.0     43.0    guarda    66.0      NO
Amazon                        10.0     20.5   archiva    43.5      NO
Nemak/Garcia                  18.0     28.0   archiva    51.0      NO
Hershey/Escobedo              83.0     83.0      pasa              si
Coficab/Cd. Juarez               —        —     HUECO
Coficab/Silao                    —        —     HUECO
Metalsa                          —        —     HUECO
International                    —        —     HUECO
----------------------------------------------------------------------
CONTROL · señal fresca documentada (procesadora de carne, 3-sep-2026): 58.0 → guarda
```

## Cómo se lee esto, y las tres cosas que NO dice

**1. «3 de 9» no es «el radar falla 6 veces».** Es *«de las cuentas que FTS ya
trabajó, el radar habría detonado 3 por sí solo»*. Las otras entraron por criterio
del dueño, y eso sigue siendo una vía legítima — el punto de la métrica es saber
cuánta del trabajo depende de que alguien se acuerde.

**2. Los 4 huecos no son ceros.** Un cero diría «el radar la evaluó y la
descartó»; un hueco dice «nadie documentó su señal». Contarlos como ceros haría
ver al radar peor de lo que es, y contarlos como pasa, mejor. Quedan fuera del
denominador a propósito, y una prueba sostiene que nadie les inventó una fuente.

**3. La columna «techo» es el costo de no haber anotado la fecha.** Seis de las
nueve señales se midieron el 18-sep-2026 como «señales calientes» y su fecha no
quedó escrita. Con el mínimo de frescura (2 de 25) se hunden por un dato que
falta, no por una señal débil. El techo dice lo que valdrían con la señal fresca,
y la diferencia entre las dos columnas — **hasta 23 puntos** — es exactamente lo
que cuesta no anotar una fecha.

---

## El diagnóstico: por qué 6 de 9 no pasan

Las seis que no pasan son **todas** anuncios de inversión: LEGO 205 MDD · Ragasa
633 MDP · Cuprum 200 MDD · Bimbo 2,000 MDD · Amazon 500 MDP · Nemak (inversión +
vacantes). Y las seis tienen **su monto documentado**.

> ### 🔴 El evaluador no puede leer ni uno de los seis montos.
>
> `magnitudes()` reconoce **TR** y **kVA**. Medido:
>
> | Texto | Lo que lee |
> |---|---|
> | `chiller de 200 TR` | `[{valor: 200, unidad: TR}]` |
> | `2000 kVA` | `[{valor: 2000, unidad: kVA}]` |
> | `60 MDD` | `[]` |
> | `205 MDD` | `[]` |
> | `633 MDP` | `[]` |
> | `19.2 MW` | `[]` |
>
> El factor `capacidad` vale **0.0 en las nueve cuentas**, incluidas las tres que
> pasan. El radar está ciego al tamaño de la inversión, que es la única cosa que un
> anuncio de prensa dice con precisión.

Y **MW también es invisible**, lo cual es peor de lo que parece: el propio
`modulos-de-contactos.md` usa «cogeneración de 19.2 MW» como ejemplo de la señal
que produce el título *jefe de calderas*. La unidad que ilustra el módulo no se
puede leer.

---

## 🔒 D6 · Que el evaluador lea la magnitud de la inversión — **PROPUESTO, NO APLICADO**

**Lo que se propone.** Que `magnitudes()` reconozca `MDD`, `MDP`, `MUSD`, `mdd`,
`mdp`, `millones de dólares`, `millones de pesos` y `MW`, y que
`puntos_de_capacidad` los compare contra el rango donde FTS **sí** ha vendido.

**Por qué no lo apliqué, aunque D3 autorizó arreglar el vocabulario.** D3 autorizó
el vocabulario de **obra nueva**, que es una lista de palabras: agregar una palabra
no cambia la escala de nada. Esto es distinto en dos cosas:

1. **Hay que elegir una escala, y eso es criterio.** ¿200 MDD vale lo mismo que
   200 TR? El catálogo tiene rangos en TR porque ahí FTS vendió chillers. Para
   pesos habría que derivar el rango de los importes de `sale.order.line`, y el
   censo de cuentas los tiene **a propósito fuera** (`que_NO_lleva: «Ni una
   persona y ni un importe»`). Derivar la escala exige decidir de dónde sale el
   importe, y eso lo decides tú.
2. **`puntos_de_capacidad` CORTA POR ARRIBA**, y con razón: «una señal de 1,500 TR
   no es mejor que una de 200, es de otro tamaño de empresa y otro competidor».
   Con inversión esa regla puede ser **al revés** o puede seguir valiendo: 2,000
   MDD de Bimbo probablemente es un programa nacional de varios años y no una obra
   que FTS pueda tomar, mientras 60 MDD de Coficab Durango es exactamente su
   tamaño. Si es al revés, aplicarlo sin decidirlo metería a Bimbo arriba de
   Coficab.

**Mi recomendación:** aplicarlo, con la escala derivada del catálogo de proyectos
y **con corte por arriba**, tratando un anuncio de más de ~500 MDD como *programa
corporativo* y no como obra: le da `MAX_CAPACIDAD / 4`, igual que hoy trata una
magnitud fuera de rango. Con eso, las cinco cuentas de inversión media suben ~10
puntos y las dos que pasan no se mueven. **Pero es tu llamada, y hasta entonces el
factor sigue valiendo 0 para todos — que es honesto: no lo sabe.**

---

## 🔒 D7 · El ejemplo trabajado del §3d nunca fue reproducible — **REPORTADO**

`metodo/motor1-radar-de-leads.md` §3d calcula a mano el puntaje de Coficab Durango
y concluye **59, GUARDA**. Ese número **no lo produce el código**, ni antes ni
después de D3, y **los seis factores difieren**:

| Factor | El documento | El código, antes | El código, hoy |
|---|---|---|---|
| proceso | 25 | 0 | 10.0 |
| tipo de obra | 12 | 0 | 44.4 |
| capacidad | 6 | 0 | 0 |
| frescura | 4 | 4 | 4 |
| fuerza de fuente | 12 | 8 | 8 |
| padrón | — | 0 | 0 |
| **total** | **59** | **12.0** | **66.4** |

Las causas, una por una:

* **proceso 25 vs 10** — el documento dice «fundición, que es proceso de chiller
  en el catálogo». `fundicion` **sí** se reconoce, pero el catálogo real no tiene
  proyectos bajo ese proceso, así que `puntos_de_proceso` da el escalón base (10)
  y no el completo. El documento describía un catálogo que la medición de #305 no
  confirmó.
* **tipo de obra 12 vs 0** — el documento razonó «nave nueva con carga de
  enfriamiento → agua helada». El código no tenía «nave nueva» (ése es D3) y
  tampoco deriva un tipo térmico de una nave.
* **capacidad 6 vs 0** — los 60 MDD, que es D6.
* **fuente 12 vs 8** — el documento sumó «boletín del cluster (CLID) + prensa
  industrial». El evaluador puntúa **una** fuente, y `camara` vale 12 mientras
  `prensa_industrial` vale 8. El documento usó la mejor de las dos; el código usa
  la declarada.

> **Por qué esto importa y no es una nota al pie.** Ese 59 es el número con el que
> §3d justificó la DECISIÓN 3 de #305 — que el padrón deje de ser requisito. La
> conclusión sigue siendo correcta y por la razón correcta (Coficab no está en el
> corte del DENUE, y eso se midió aparte). Pero **es la séptima vez en este
> proyecto que un número escrito a mano en un documento de diseño no coincide con
> lo que el código calcula**, y es la misma familia que los cinco hallazgos de
> #329. Un ejemplo trabajado a mano es una hipótesis, no una medición, y debería
> decirlo.

**Lo que propongo, y no apliqué:** que §3d cite el resultado de
`herramientas/linea_base_radar.py` en vez de su cuenta a mano, y que los ejemplos
trabajados de los documentos de método lleven la marca de si son **calculados por
el código** o **razonados a mano**. Es documentación, pero cambia lo que un lector
cree que está leyendo.

---

## Lo que esta línea base hace posible

Es el **control** del lazo 1. Cuando las primeras 20 tarjetas cierren, la pregunta
no va a ser «¿el radar sirve?» en abstracto: va a ser «¿estas tres que pasaron
convirtieron, y las seis que no habrían convertido?». Sin una línea base escrita
antes de ver los desenlaces, esa comparación se hace con la memoria — y la memoria
se acomoda al resultado.
