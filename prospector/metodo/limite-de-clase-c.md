# El límite de clase (c): a quién SÍ entrega la web, y a quién no

> **🔴 REGLA, NO SOSPECHA.** Declarada el 6-oct-2026 (#384) sobre **once cuentas
> frías medidas**: las seis de la prueba de cobertura de #355 y las cinco de
> puerta de usuario de esta vuelta. Antes de #384 esto era una observación con
> seis casos; ahora es una regla con once y con su forma corregida.

## El enunciado

> **La web pública entrega nombres. Casi nunca el del que compra.**
>
> Lo que entrega de forma confiable es a **los que cortan el listón**, a **los
> del parque** y a **los de la cámara**. El comprador técnico de una planta
> —mantenimiento, proyectos, servicios auxiliares, facilities— **no está**, y
> **ninguna redacción de consulta lo trae**.

La forma de 2026-09 decía «la web casi nunca da a la persona». Esa redacción era
más fuerte que el dato y se cayó en cuanto se midió con cuidado: la web **sí** da
personas. El error estaba en no decir **de qué altura**.

## Lo medido, las once cuentas

### Las cinco de esta vuelta (#384), 30 consultas cada una, 150 en total

| Cuenta | Consultas | Bloques | Secos | M5 | Contactos | De valor **con nombre** | Nivel del que salió |
|---|---|---|---|---|---|---|---|
| Daikin · SLP | 30 | 3 | 2 | 11 | 3 | **1** | dirección general de la entidad mexicana |
| TDI Manufacturing · Ciénega de Flores | 30 | 3 | **3** | 14 | 0 | **0** | — |
| Dormakaba · Nogales | 30 | 3 | 2 | 14 | 1 | **1** | dirección de operaciones del **grupo** (global) |
| NetShape México · Querétaro | 30 | 3 | 2 | 13 | 5 | **2** | dirección general de la entidad mexicana **y gerencia de planta** |
| NIFCO · Chihuahua | 30 | 3 | **3** | 14 | 0 | **0** | — |
| **Total** | **150** | **15** | **12** | **66** | **9** | **4** | |

### Las seis de #355

Cuatro contactos reales en total, y **los cuatro salieron del BUZÓN de FTS**, no
de la web. Ninguno de los cuatro estaba en la lista que la vendedora traía de
Sales Navigator.

### Las dos cifras que hacen la regla

De los **4** interlocutores de valor con nombre de esta vuelta:

- **4 de 4** salieron de **prensa de inauguración**. Cero de búsqueda de personas.
- **1 de 4** está a nivel de **planta** (una gerencia de planta). Los otros tres
  son dirección general o dirección de grupo.
- **0 de 4** traen **correo literal**. Ninguno.
- **0 de 150** consultas entregaron un perfil público de mantenimiento,
  proyectos, facilities o servicios auxiliares en **ninguna** de las cinco casas.

## El otro corte: a tres de las cinco, el buscador no las tiene

Esto salió al final de la vuelta y es la mitad operativa de la regla. El
detector de límite de fuente de #355 pide tres cosas: doce consultas, las **tres
formas** cubiertas, y cero perfiles de la empresa en todas. Con eso puesto al
día sobre las cinco cuentas:

| Cuenta | ¿El buscador público tiene a la empresa? | Lo que eso cambia |
|---|---|---|
| Daikin | sí (salieron dos perfiles de la casa) | lo que falla es el **puesto**, no la fuente |
| TDI Manufacturing | **no** | los contactos salen solo por Sales Navigator |
| Dormakaba | **no** | los contactos salen solo por Sales Navigator |
| NetShape México | sí (cinco perfiles de la casa) | lo que falla es el **puesto**, no la fuente |
| NIFCO | **no** | los contactos salen solo por Sales Navigator |

**Tres de cinco no están indexadas.** Para esas tres la ficha ya no dice «no hay
nadie»: dice que la empresa no está en el buscador, con la búsqueda de Sales
Navigator armada, que es lo accionable.

> **Y el defecto de operación que lo tapaba, porque vale más que el dato.** Las
> 66 consultas de M5 se corrieron con las tres formas y **ninguna se etiquetó**.
> El detector leía la forma solo de la etiqueta, así que quedó ciego en las cinco
> cuentas. La compuerta no estaba mal: pedía un dato que **no hacía falta pedir**,
> porque el texto de la consulta lo dice —`site:mx.linkedin.com/in` es un corpus,
> `site:linkedin.com/in` es otro, sin operador es la forma simple—. Ahora se
> deriva del texto y la etiqueta solo lo sobrescribe. Es la misma lección que
> `hits`, que `modulo_origen` y que los contadores de agotado: **un dato
> derivable no se le pide al operador**, porque el día que no lo declare el
> silencio no se va a notar.

## A quién SÍ entrega la web, medido en la misma vuelta

Esto es la otra mitad de la regla, y es la mitad útil. En las mismas 150
consultas, la web entregó con nombre y puesto:

| Población | Casos de esta vuelta |
|---|---|
| **El parque industrial** | gerencia comercial y presidencia del consejo del parque de TDI, más las direcciones de los dos grupos desarrolladores |
| **La cámara** | presidencia y vicepresidencia de la cámara de Nogales, con dos gerencias de empresas socias; presidencia, vicepresidencia y dirección de la de Chihuahua; presidencia y ocho consejeros nombrados de la de Juárez |
| **El clúster** | presidencia del clúster automotriz de Querétaro y cuatro direcciones generales de otras Tier 1 de su consejo |
| **El gobierno del estado** | titular de la secretaría de economía en dos de las cinco inauguraciones, más la promotora de desarrollo económico |
| **El corporativo** | tres directivos de región de Dormakaba, nombrados en prensa corporativa |
| **La planta que queremos** | **una** gerencia de planta, en **una** de las cinco |

Cuatro cámaras, dos parques, un clúster y dos gobiernos estatales tienen su
directiva publicada con nombres. Las cinco plantas objetivo, entre todas, tienen
una.

## Lo que la regla manda hacer

1. **No gastar M5 esperando al comprador.** El bloque de personas sirve para
   **descartar** y para medir, no para encontrar. Un bloque seco de diez es
   información, no fracaso.
2. **La prensa de la inauguración se lee buscando NOMBRES, no solo cifras.** Es
   la única fuente que los dio, cuatro de cuatro veces. Va en el mismo bloque
   que la cifra de inversión, no después.
3. **La vía de entrada por omisión es la cámara, el parque o el clúster**, no el
   correo frío. Los tres tienen puerta con nombre, y los tres conocen a la
   planta. Eso es lo que la ficha tiene que poner en «cómo hablarles».
4. **El patrón de correo y el vocabulario de la casa siguen siendo el producto
   principal de la cascada**, y los dos se consiguen sin una sola persona.
5. **Un nombre de dirección general es apertura, no destinatario.** Se marca a
   revisión humana con esa razón escrita. Escribirle sobre acometida o aire
   comprimido quema el contacto más alto que la cuenta tiene.

## Lo que la regla NO dice

- No dice que la planta no tenga comprador técnico: dice que **no está indexado**.
  La ficha tiene que decirlo con esas palabras, y entregar la búsqueda de Sales
  Navigator armada por familia. Confundir «no lo encontré» con «no existe» es el
  error que esta regla previene.
- No dice que M5 sea inútil: dice **para qué sirve**. En NetShape el bloque de
  personas confirmó la identidad de la casa, y eso valió más que un contacto.
- No sustituye al buzón. El buzón sigue siendo la única fuente que ha dado
  compradores reales, y por eso corre **antes** de gastar red.
