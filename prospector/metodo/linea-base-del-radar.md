# La línea base del radar · medición del 28-sep-2026

> **Se mide, no se opina.** `herramientas/linea_base_radar.py` la recalcula desde
> `datos/senales-documentadas.json`, y el «antes» **no está guardado a mano**: se
> obtiene desactivando D3 y los tres defectos B1/B2/B3 dentro de un contexto que
> restaura el estado al salir. Así el «antes» es lo que el evaluador de verdad
> decía, no lo que alguien recuerda que decía.

## La cifra

**[calculado]** — todo lo de esta sección sale de
`python3 herramientas/linea_base_radar.py`. Nada está escrito a mano, y por eso
esta página se puede regenerar cuando el evaluador cambie. La convención de marcas
es la de D7 (ver `motor1-radar-de-leads.md`).

<!-- CALCULADO:inicio -->

| | |
|---|---|
| Cuentas ya evaluadas | **13** |
| Con señal documentada en el repo | **10** |
| Con **fecha** de señal documentada | **5** de 10 |
| Huecos (nadie documentó su señal) | **3** |
| **Pasan solas, hoy** | **3 de 10** |
| Pasaban en la etapa `original` | 1 de 10 |
| Pasaban en la etapa `con_d3_y_b` | 3 de 10 |
| Pasaban en la etapa `con_d6` | 3 de 10 |
| Pasarían si la señal estuviera fresca | 4 de 10 |

### La evolución, cuenta por cuenta

```
  LINEA BASE DEL RADAR — corte 2026-09-28
  13 cuentas ya evaluadas · 10 con senal documentada · 3 huecos

  LA EVOLUCION DE LA NOCHE, cuenta por cuenta
  cuenta                      original  con_d3_y_b      con_d6 veredicto  techo fecha?
  ------------------------------------------------------------------------------------
  Coficab/Pesqueria               22.7        64.9        64.9      pasa   87.9     NO
  Coficab/Durango                   12        66.4        76.4      pasa            si
  LEGO                               8          18          28   archiva            si
  Ragasa                          22.6        22.6        32.6   archiva            si
  Cuprum                            18          28          38   archiva     61     NO
  Bimbo                             16          41        43.5    guarda            si
  Amazon                            10        20.5        30.5   archiva   53.5     NO
  Nemak/Garcia                      18          28          28   archiva     51     NO
  Hershey/Escobedo                  83          83          83      pasa            si
  Coficab/Cd. Juarez                 —           —           —     HUECO
  Coficab/Silao                      —           —           —     HUECO
  Metalsa                            —           —           —     HUECO
  International                     20          20          30   archiva     53     NO
  ------------------------------------------------------------------------------------
  PASAN                              1           3           3     de 10

    original       antes de la noche del 28-sep: sin vocabulario de obra nueva, con el falso positivo de 'prensa', sin 'cable' en el catalogo, sin giro y sin dinero
    con_d3_y_b     con D3 -- obra nueva integral-- y con B1/B2/B3 corregidos
    con_d6         mas D6: el evaluador ya lee los montos de inversion

  Pasarian si la senal estuviera fresca: 4 de 10
  Huecos (sin senal documentada, NO se inventa): Coficab/Cd. Juarez, Coficab/Silao, Metalsa

  CONTROL · senal fresca documentada: 33 -> 58 -> 68  (pasa)
```

Pasan solas: **Coficab/Pesqueria, Coficab/Durango, Hershey/Escobedo**.

<!-- CALCULADO:fin -->

Las tres etapas se **recalculan** apagando cada mejora en la raíz, dentro de un
contexto que restaura el estado al salir. El «original» es lo que el evaluador de
verdad decía, no lo que alguien recuerda que decía — y las etapas tienen que ser
independientes, porque al aplicar D6 el «antes» también subía: **una columna que
dice «antes» y se mueve cuando se agrega una mejora no es un antes, es otro
después.**

### Lo que D6 cambió, y lo que no

D6 **no agregó ninguna `pasa` nueva** — y eso es informativo, no decepcionante.
Subió a todas las que traen monto documentado y, sobre todo: **el control de señal
fresca cruzó a `pasa`** (33 → 58 → **68**).

> **El radar sí funciona sobre señal fresca.** Con una señal fresca y documentada
> cruza el umbral con margen. Lo que lastra la línea base no es el evaluador.

## ⚠️ Y el «seis sin fecha» resultó ser lo contrario de una palanca

La conclusión de la primera noche fue *«lo que hunde la línea base es que seis de
nueve señales no traen fecha; anotarla es la mejora con más palanca»*. **Se buscaron
las fechas la madrugada siguiente, y esa conclusión estaba equivocada en su
dirección.**

De las seis, **tres se pudieron fechar** con procedencia y cita textual, y las tres
son viejas:

| cuenta | fecha | cita | días al 28-sep |
|---|---|---|---:|
| LEGO | **nov-2023** | *«Anunciada nov-2023, entrega 2025»* | ~1,050 |
| Ragasa | **mar-2025** | *«arranque de obra marzo-2025»* | ~576 |
| Bimbo | **17-jul-2025** | *«anuncio 17-jul-2025, Plan México»* | 438 |

Las tres pasan de 365 días, o sea **0 puntos de frescura** — mientras que
`FRESCURA_SIN_FECHA` vale **2**. Fecharlas les **bajó** dos puntos a cada una.

> **El radar no estaba ciego por falta de fecha: estaba siendo generoso.** El
> respaldo de «sin fecha» le regalaba dos puntos a una señal de hace tres años, y la
> columna «techo» prometía un ascenso que esas tres nunca podrán tener: su señal no
> va a volverse fresca.
>
> Lo que la lista de 13 necesita no es mejor puntuación de señales viejas. **Es
> señal nueva.**

Ragasa igual subió —de 28 a 32.6— y **no fue por la fecha**: al leer su ficha
apareció que la señal era mucho más que «inversión anunciada de 633 MDP». Es una
**cogeneración propia de 19.2 MW con recuperación de vapor**, y eso el evaluador
sí lo puntúa. Medido, separando las dos causas:

| | puntaje |
|---|---:|
| texto viejo, sin fecha | 28.0 |
| texto viejo, con fecha mar-2025 | 26.0 |
| texto nuevo, sin fecha | 34.6 |
| **texto nuevo, con fecha mar-2025** | **32.6** |

O sea: **+6.6 por el texto, −2 por la fecha.** La mejora vino de leer bien la
señal, no de fecharla.

Las otras tres siguen sin fecha, y cada una dice por qué. La de Pesquería es la que
más vale leer: **la propia corrida escribió** *«nota de prensa sobre inversión, sin
fecha en el registro»*. No es que nadie buscara.

## Cómo se lee esto, y las tres cosas que NO dice

**1. «3 de 10» no es «el radar falla 7 veces».** Es *«de las cuentas que FTS ya
trabajó, el radar habría detonado 3 por sí solo»*. Las otras entraron por criterio
del dueño, y eso sigue siendo una vía legítima — el punto de la métrica es saber
cuánta del trabajo depende de que alguien se acuerde.

**2. Los 3 huecos no son ceros.** Un cero diría «el radar la evaluó y la
descartó»; un hueco dice «nadie documentó su señal». Contarlos como ceros haría
ver al radar peor de lo que es, y contarlos como pasa, mejor. Quedan fuera del
denominador a propósito, y una prueba sostiene que nadie les inventó una fuente.

**3. La columna «techo» sólo aparece cuando la fecha NO está.** Dice lo que la
cuenta valdría *si* la señal fuera fresca, y es una hipótesis útil mientras la fecha
sea desconocida. Cuando la fecha aparece, el techo **desaparece de la tabla**, y eso
es deliberado: una señal que ya se sabe de nov-2023 no tiene un techo que alcanzar.
Confundir «no sé si es fresca» con «podría ser fresca» es exactamente el error que
la primera noche cometió.

---

## El diagnóstico: por qué 7 de 10 no pasan

Las que no pasan son **casi todas** anuncios de inversión: LEGO 205 MDD · Ragasa
633 MDP · Cuprum 200 MDD · Amazon 500 MDP · International 120 MDD · Nemak
(inversión + vacantes, **sin cifra**) — y Bimbo queda en `guarda` con 2,000 MDD.
Todas menos Nemak tienen **su monto documentado**.

> **International dejó de ser un hueco el 28-sep, y el error vale nombrarlo.** Sus
> 120 MDD para el área de pintura de cabinas llevaban documentados en
> `modulos-de-contactos.md` desde el 18-sep, en la misma línea que los otros cinco
> montos. El barrido de huecos los perdió porque buscó **«International»** y el repo
> la nombra **«Navistar»**. Una cuenta con dos nombres se pierde en una búsqueda de
> texto — y ésa es la lección, no el descuido.

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

## ✅ D6 · Que el evaluador lea la magnitud de la inversión — **APLICADO**

**Lo que se propuso y se aprobó.** Que `magnitudes()` reconozca `MDD`, `MDP`,
`MUSD`, `millones de dólares`, `millones de pesos` y `MW`, y que
`puntos_de_capacidad` los compare contra el rango donde FTS **sí** ha vendido.

**Lo que se derivó y lo que se declaró**, porque la diferencia es la mitad de la
decisión:

| | valor | de dónde |
|---|---|---|
| Piso de inversión | 192,000 (el proyecto más chico de los 154 reales) | **derivado.** Es cota dura: un capex menor que el proyecto más chico de FTS no puede contener uno |
| Corte de programa corporativo | 500 MDD | **declarado.** Anclas: 60 MDD de Coficab Durango es lo que FTS sí toma; 2,000 MDD de Bimbo es un programa nacional |
| Tipo de cambio | 18.5 MXN/USD, sep-2026 | **declarado**, con alcance, con por qué no muerde y con fecha de revisión |

Lo que **no se puede derivar y no se inventó**: qué fracción del capex de un cliente
se vuelve proyecto de FTS. Comparar 205 MDD contra el ticket de FTS sería un error de
categoría, no un cálculo.

**Resultado medido:** las cuentas de inversión media suben ~10 puntos, las que ya
pasaban no se mueven, y la prueba de aceptación que importaba pasa —
**Bimbo 43.5 contra Coficab Durango 76.4**. Un programa nacional de 2,000 MDD queda
por debajo de una planta nueva de 60 MDD.

> **D6 no agregó ninguna `pasa`.** Lo que movió fue el control de señal fresca
> (33 → 58 → **68**) y el techo de las que no tienen fecha. Aplicar D6 no era para
> subir el marcador de esta lista: era para que el factor deje de valer 0 en toda
> señal que traiga monto, que es la mayoría de las de prensa.

---

## ✅ D7 · El ejemplo trabajado del §3d nunca fue reproducible — **APLICADO**

`metodo/motor1-radar-de-leads.md` §3d calcula a mano el puntaje de Coficab Durango
y concluye **59, GUARDA**. Ese número **no lo produce el código**, ni antes ni
después de D3, y **los seis factores difieren**:

| Factor | El documento | El código, antes | El código, hoy |
|---|---|---|---|
| proceso | 25 | 0 | 10.0 |
| tipo de obra | 12 | 0 | 44.4 |
| capacidad | 6 | 0 | 10 |
| frescura | 4 | 4 | 4 |
| fuerza de fuente | 12 | 8 | 8 |
| padrón | — | 0 | 0 |
| **total** | **59** | **12.0** | **76.4** |

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

**Aplicado el 28-sep.** §3d ya cita el resultado de
`herramientas/linea_base_radar.py` en vez de su cuenta a mano, y los documentos de
método llevan la convención `[calculado]` / `[razonado a mano]`. Una prueba
verifica que los números del §3d coincidan con lo que la herramienta produce: si
el evaluador cambia y el documento no, **la suite truena**.

Y el barrido de D7 encontró dos cosas más en el mismo documento:

* la tabla de rangos decía **«Tipo de obra 0–15»**, y después de D3
  `obra_nueva_integral` vale **44.4**. El rango escrito era falso;
* la misma tabla prometía leer **«MDD de inversión»** desde su primera versión, y
  `magnitudes()` devolvía lista vacía para `60 MDD` hasta la noche del 28-sep.
  **El documento prometía una capacidad que la cadena no transportaba** — que es
  exactamente el patrón de los cinco hallazgos de #329.

---

## Lo que esta línea base hace posible

Es el **control** del lazo 1. Cuando las primeras 20 tarjetas cierren, la pregunta
no va a ser «¿el radar sirve?» en abstracto: va a ser «¿estas tres que pasaron
convirtieron, y las siete que no habrían convertido?». Sin una línea base escrita
antes de ver los desenlaces, esa comparación se hace con la memoria — y la memoria
se acomoda al resultado.
