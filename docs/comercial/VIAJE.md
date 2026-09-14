# Días de viaje y trabajo foráneo

**V1.26 · 2026-09-10 · issue #140.** Petición de Ricardo, junta del 9-sep
(«Review: Actualización del machote v1.23 y presupuesto de Albuquerque»), con
la pieza de cierre propuesta por Esteban en la misma junta.

---

## 0. El problema, dicho como se dijo

> Ricardo ha cobrado el trabajo de proyectos en Estados Unidos pero **nunca los
> días de vuelo**, porque nadie los metió al proyecto. El presupuesto de
> Albuquerque salió sin viáticos ni hotel por lo mismo.

**No era un cálculo mal hecho: era un concepto que el machote no tenía.** No hay
forma de equivocarse menos en un campo que no existe, y por eso esto no se
arregla capacitando a nadie — se arregla con un renglón donde ponerlo y un
candado que avise cuando falta.

---

## 1. Lo que entra, y dónde vive cada cosa

| qué | dónde | por qué ahí |
|---|---|---|
| Días de viaje | renglón de **mano de obra** | «Se pagan distinto del día trabajado pero salen de la misma cuenta» (Ricardo) |
| Horas de fin de semana | renglón de mano de obra | recargo sólo en EUA |
| Horas de día festivo | renglón de mano de obra | recargo **sin confirmar** |
| Vuelos, hotel, viáticos, taxis, gasolina | partidas de **tipo `Viaje`** | reusan la retícula de captura que ya existe |
| País, estado, ciudad | **el machote** | una cotización se ejecuta en un lugar |
| Recargos y quién paga los días | el machote | son de la cotización, no de la sección |

### Los tres renglones nacen SIN tarifa

`pu: null`, a propósito. Un día de viaje no vale 140 ni 200; lo decide quien
cotiza. La regla `mo-sin-tarifa`, que ya existía, lo reclama sola en cuanto
alguien captura horas sin precio.

Un número de relleno habría sido **peor que no tener el renglón**: se cobra
solo, nadie lo revisa, y parece que alguien lo pensó.

### Los días NO son horas

El renglón de días de viaje se captura en días, y su cantidad **no entra a
«HORAS PROYECTO»**. Sin esta separación, cinco días de vuelo se habrían leído
como cinco horas de trabajo y el número de arriba habría mentido en silencio.
El motor los cuenta aparte (`c.dias`), y la pantalla dice «Días» en la columna
de unidad.

### El viaje se cobra a costo, y eso vive en el MOTOR

Multiplicador **1, forzado**. Hotel, gasolina, taxis y vuelos se cobran a lo que
cuestan: es regla del negocio, no una opción. Por eso no sale de la tabla de
multiplicadores ni se deja pisar renglón por renglón.

Si alguien escribe un margen encima, el motor **lo ignora y lo marca**
(`viaje-con-margen`, blanda). Anularlo en silencio sería el mismo modo de falla
que perseguimos en todo lo demás.

Y se cuenta **aparte de materiales**: si se sumara ahí, la línea «Materiales»
del BUDGET ODOO diría que se compraron materiales por el valor de los vuelos.

### El recargo de fin de semana

~30% más la hora en sábado y domingo, **sólo cuando se ejecuta en Estados
Unidos**. Es editable: 30% es lo que dijo Ricardo («alrededor de»), no una
constante del motor.

> ⚠️ **Lo de días festivos NO está confirmado con nadie.** Nace **vacío**, y
> vacío significa tarifa normal. Cobrarle al cliente una regla que nadie acordó
> no es una omisión menor que no cobrarla.

---

## 2. El candado, que es la pieza de Esteban

> «Si a alguien se le olvida el vuelo, también se le va a olvidar marcar que es
> foráneo. Que lo detecte el sistema.»

Por eso el machote **obliga** a decir dónde se ejecuta, y de ahí sale solo si la
cotización es foránea. No se le pregunta a nadie si va a viajar: se deduce de un
dato que sí se captura siempre.

**`foranea-sin-viaje` es una regla DURA**: la cotización no se puede terminar.
Se desbloquea de tres formas, todas legítimas:

1. agregando cualquier concepto de viaje,
2. capturando días de viaje,
3. **marcando explícitamente** «no se ocupan conceptos de viaje».

La tercera deja una marca blanda visible: queda dicho que **fue una decisión, no
un olvido**. Es toda la diferencia.

**Monterrey es la sede; cualquier otra ciudad es foránea** — Guadalajara igual
que Albuquerque. Mover gente cuesta dentro del país también.

### Los 8 machotes que ya existen

Nacieron antes del campo. **No se les inventa un valor**: llegan sin país, la
regla `sin-lugar-ejecucion` los manda a escribirlo, y mientras tanto **no se
les trata como foráneos**. Rellenarles «Monterrey» habría hecho que el machote
afirmara algo que nadie dijo.

Hay prueba dedicada de que un documento viejo (a) calcula exactamente los mismos
números, (b) **no gana campos** al pasar por el motor, y (c) recibe la regla que
le pide el dato, no la que lo supone.

---

## 3. El catálogo de lugares

`shared/comercial/geo.json`.

- **249 países**, derivados de **ICU** (`Intl.DisplayNames`), no tecleados.
  Filtrando las pseudo-regiones de CLDR que no son ISO 3166-1 quedan
  exactamente 249, que es el número de códigos alpha-2 asignados de la norma:
  **la lista de exclusión queda comprobada por aritmética**, no por memoria.
- **Subdivisiones sólo de México (32) y Estados Unidos (50 + DC)**, que es donde
  FTS ejecuta. Para cualquier otro país el estado va en **texto libre**, y la
  pantalla lo dice — enseñar un desplegable vacío se lee como «no hay estados».
- **Ciudades frecuentes** en un arreglo de configuración aparte: Monterrey (la
  sede, marcada ★), San Antonio, Dallas, Hayward, Fairfield. Un toque pone país,
  estado y ciudad. **Agregar una ciudad no toca código** — van a cambiar
  conforme FTS abra plantas.

### ⚠️ El campo se llama `region`, no `estado`

`machote.estado` **ya existe** desde V1.07 y significa borrador / en revisión /
enviado a Odoo. La primera versión de esto usó `estado` para la subdivisión y
**se vio en la captura**: el campo decía «Estado: borrador», y elegir «Texas»
habría puesto el machote en estado «Texas» y roto el flujo entero, en silencio.

Es el choque de `.kpi` de V1.22 (CLAUDE.md §20 #12) pero en un campo de **datos**
en vez de una clase de CSS, y sólo lo cazó mirar la pantalla. Hay prueba
dedicada para que no vuelva. La etiqueta sigue diciendo «Estado», que es como se
le llama; el campo se llama distinto.

---

## 4. El atajo a Kiwi

### No se incrusta, y no es una decisión de estilo

Se **comprobó contra el sitio en vivo** (2026-09-10, desde n8n y no desde el
contenedor, que sale por un proxy que contesta 403 por su cuenta y habría
medido al proxy):

```
https://www.kiwi.com/es/                      200
  x-frame-options:  (sin cabecera)
  content-security-policy: … frame-ancestors 'self' kiwi.com *.kiwi.com
                               skypicker.com *.skypicker.com …
```

`yinyo1.github.io` **no está en esa lista**, así que un iframe saldría en
blanco. Un recuadro vacío se lee como aplicación rota; una pestaña nueva, no.

### Y no trae el precio

Es un **atajo, no una integración**. El enlace se arma con lo que el machote ya
sabe —origen Monterrey, destino la ciudad de ejecución, fechas si las hay— y la
persona consulta y captura. Decirlo evita que alguien espere que el número se
actualice solo.

Si el nombre de una ciudad no le cuadra a Kiwi, su propia pantalla deja
corregirlo: llegar con la búsqueda a medio armar es mejor que llegar en blanco.

### La fecha en que se consultó

Al capturar el precio de un vuelo, la pantalla ofrece anotar **de cuándo es**, y
lo muestra al lado: `consultado 10-sep · hace 3 días`. Pasados **21 días** se
pinta en ámbar y la regla `precio-viaje-viejo` lo dice.

**Por qué:** una cotización se manda semanas antes de volar. Sin la fecha, el
número se lee como si fuera firme.

---

## 5. El colchón sobre el precio del vuelo — RECOMENDACIÓN, no decisión

**No lo construí.** Cambia el precio que ve el cliente, y eso es criterio de
costeo, no de programación. Aquí va lo que recomiendo y por qué.

### Lo que recomiendo, en orden

**1. Primero la VIGENCIA, no el colchón.** El machote ya trata este problema en
otro lado: el cuestionario de diagnóstico pregunta *«¿Cuánto tiempo se sostiene
el precio?»* y el tipo de cambio tiene su **factor de protección**. Un vuelo es
el mismo problema —un número que va a ser otro cuando se pague— y la respuesta
más honesta es la misma: **decir hasta cuándo se sostiene**, en vez de acolchonar
en silencio.

Un renglón en la cotización que diga *«precios de vuelo consultados el 10-sep;
se sostienen 15 días»* traslada el riesgo explícitamente y no infla nada.

**2. Si además se quiere colchón, que sea VISIBLE y su propia línea.** Nunca un
porcentaje que engorde el precio unitario del vuelo: eso rompe la regla de que
el viaje se cobra a costo, y deja un número que nadie puede explicar.
Un renglón aparte —*«previsión de alza de tarifa aérea, 15%»*— se puede
defender frente al cliente y se puede quitar si él prefiere comprar sus boletos.

**3. El nombre importa.** No es margen ni utilidad: es **la mejor estimación del
costo el día que se compre**. Llamarlo «previsión de alza» y no «margen de
viaje» evita que en tres meses alguien lo lea como ganancia y lo suba.

### Lo que NO recomiendo

- Un colchón **oculto** dentro del precio del vuelo. Es exactamente el tipo de
  número que nadie audita y que después nadie sabe de dónde salió.
- Un porcentaje **global de la aplicación**. Un vuelo a San Antonio comprado con
  tres semanas y uno a Albuquerque comprado con tres días no se parecen; si el
  colchón es uno solo, va a estar mal en los dos casos.

### La pregunta concreta para Esteban

Está en §7.

---

## 6. «¿Está todo lo mío en el servidor?»

Un renglón en la propia lista, **sin permiso nuevo y sin endpoint nuevo**.

Que hasta V1.25 esa pregunta sólo la pudiera hacer quien tuviera
`comercial:admin` era un **accidente de historia**: el tablero de Control fue el
primero que le preguntó al servidor y la pregunta se quedó viviendo ahí. Pero le
toca a **cada quien sobre lo suyo**.

Se contesta comparando lo que la última bajada **ya trajo** (la versión y la
huella que el servidor devolvió, guardadas en la libreta) contra lo que este
navegador sabe sin subir.

**Y siempre con la hora**: «Tus 7 cotizaciones estaban en el servidor a las
9:41». Una comprobación sin fecha es una promesa sin plazo. Si nunca se ha
podido bajar, dice **«todavía no se ha podido comprobar»** — que no es lo mismo
que «falta algo» ni que «está todo».

---

## 7. Preguntas abiertas para Esteban

1. **¿Quién paga los días de viaje?** Hoy son pago mexicano. Tú planteaste que
   debería pagarlos la LLC, con tarifa más básica pero en dólares, porque es
   quien mueve a la gente. **El machote no lo decide: lo registra** (campo
   «Quién paga los días de viaje», con las dos opciones), para que quede dicho
   cuál se usó en cada cotización.
2. **El recargo de días festivos.** Nace vacío porque nadie lo ha confirmado.
   ¿Aplica? ¿El mismo 30% que el fin de semana, u otro?
3. **El colchón del precio del vuelo.** Mi recomendación es §5: vigencia
   primero; si además quieres colchón, que sea línea propia y visible. ¿Lo
   construimos, y con qué número de arranque?
4. **La tarifa del día de viaje.** Los renglones nacen sin tarifa a propósito.
   ¿Hay un número de referencia para la plantilla, o se captura cada vez?
