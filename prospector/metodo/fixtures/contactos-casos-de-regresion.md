# Casos de regresión de la búsqueda encadenada de contactos

**Datos de prueba. NO son parte del método.**

Seis casos. **A** y **B** verifican que la cascada agotada reproduce hallazgos
reales. **C** verifica el motor de combinaciones —recorte antes de buscar— y es
el único que corre sin tocar ninguna fuente. **D** verifica los tres niveles de
la ficha —recorte antes de entregar—. **E** verifica la capa de PDFs públicos y
su límite de recolección, y **está incompleto a propósito declarado**. **F**
verifica la matriz de challenge, y —como el C— **corre sin tocar ninguna
fuente**.

**C y D son la misma falla en dos lugares.** Ver §10 del método.

El método vive en
[`../busqueda-encadenada-contactos.md`](../busqueda-encadenada-contactos.md) y es
genérico: no contiene un solo nombre propio. Este archivo existe justamente para
que siga siendo así — los casos se pueden cambiar, ampliar o jubilar sin tocar
una línea del método.

## Para qué sirven

Cuando la cascada se construya, estos dos casos verifican que **la cascada
agotada** funciona. No miden si encuentra "algo": miden si reproduce un conjunto
de hallazgos que **ya se obtuvo a mano**, y que una cascada a medias no habría
traído.

---

## Caso A · Alimentos y bebidas

La cascada debe reproducir:

- el **director global de commodity**;
- el **CPO**;
- el **director de procurement regional**;
- el **gerente de mantenimiento con CMRP**;
- el **PM de planta**;
- el **patrón de correo triangulado**.

**Referencia medida:** igualó **2 de 3** de los hallazgos manuales del dueño, y
**los superó** con el CPO y el gerente de mantenimiento, que el trabajo manual no
había encontrado.

> Ése es el criterio que importa: no basta con empatar el trabajo a mano, hay que
> traer lo que el trabajo a mano dejó fuera.

## Caso B · Aluminio y manufactura de metal

La cascada debe reproducir:

- el **director de procurement**;
- el **gerente de proyectos con pasado de superintendente de mantenimiento**;
- el **gerente de operaciones que lleva instalaciones**;
- el **ex-jefe de mantenimiento**;
- el **gerente de planta**;
- el **contacto de abastecimiento que ya escribió a FTS**;
- el **patrón de correo triangulado**;
- la **señal caliente de hueco de mantenimiento**;
- la **inversión anunciada en plantas nuevas**.

**Lo que este caso pone a prueba de verdad** es el **challenge cruzado** (§5 del
método): la señal de hueco de mantenimiento no sale de ningún hallazgo por sí
solo. Sale de cruzar el ex-jefe con la vacante. Una cascada que traiga los seis
nombres pero no produzca esa señal **falla el caso**, aunque la lista de personas
esté completa.

---

## Caso C · La combinación contra la palabra suelta

**El caso que justifica el motor de combinaciones (§3.0 del método).** Es el más
pequeño de los tres y el más importante, porque no verifica una lista de
hallazgos: verifica que **el motor combine**.

**Medido en LEGO.** La consulta `"facilities manager"` —raíz + nivel, dos
palabras combinadas— trae a **[Persona 02]**. La raíz suelta, `facilities`, **no
lo trae**. Misma empresa, misma sesión, mismo buscador. La única variable era la
combinación.

### Qué verifica

Una cascada que genere `facilities` y `manager` como términos separados **falla
este caso**, aunque los dos estén en el diccionario. Lo que hay que producir es
la **cadena combinada**.

Y no solo ésa: del mismo par de piezas tienen que salir también
`sr facilities manager`, `head of facilities`, `facilities operations manager` y
`facility project manager`. **Si el motor produce una sola de las variantes, no
está combinando: está concatenando.**

### Por qué es el caso barato de correr

No necesita Odoo, ni n8n, ni credenciales: se verifica **generando las
configuraciones y mirando la lista**, sin llamar a ningún buscador. Debería ser
la primera prueba que pase la cascada cuando se construya.

---

## Caso D · El criterio estricto que recortaba la ficha

**El caso que justifica los tres niveles (§8 del método).** No verifica que la
cascada *encuentre*: verifica que **entregue lo que encontró**.

**Medido en LEGO Monterrey.** Con el criterio estricto —solo nombre y apellido
completos— la ficha salía con **~5 contactos**. Al soltarlo y agotar
combinaciones sobre *facilities, project, maintenance, controls, process,
molding*, la misma empresa dio **21 entradas**:

| Nivel | Cuántos |
|---|---|
| Nombres completos | **13** |
| Puestos-objetivo sin persona | **7** |
| Mando | **1** |

**Entre los que antes se descartaban venían decisores de obra:**

- **[Persona 06]** — Sr. PM de NPI & Engineering
- **[Persona 05]** — Maintenance Manager
- **[Persona 04]** — controles PCS7 / Rockwell / KUKA

Y puestos-objetivo sin persona que igual son accionables en Sales Navigator:
*Head of Global Workplace Projects*, *Sr. Controls Manager*.

### Qué verifica

Una cascada que **encuentre** las 21 entradas y **entregue solo 13** falla este
caso. El fallo no está en la búsqueda: está en el **criterio de inclusión**.

Concretamente, tiene que salir en la ficha:
1. Los **tres niveles marcados** y distinguibles.
2. El orden **por cercanía a la decisión de obra**, no por nivel de
   confirmación: un puesto-objetivo que decide CAPEX va **arriba** de un
   confirmado que no decide.
3. Los puestos sin persona **listados como puesto a cazar**, no omitidos.

### Su parentesco con el Caso C

**Son la misma falla en dos lugares distintos.** El C recorta el universo
*antes de buscar*; el D recorta los hallazgos *antes de entregar*. Los dos son
un criterio de calidad aplicado demasiado pronto.

Si se corre solo uno de los dos, conviene que sea **el C** —es más barato— pero
**pasar el C y fallar el D deja la ficha igual de corta**, solo que por el otro
extremo.

---

## Caso E · El PDF público y el límite de recolección *(INCOMPLETO)*

**El caso que acompaña a la fuente de §3.5 del método.** Verifica dos cosas a la
vez, y las dos importan: que la capa **encuentre** un dato que el resto de la
cascada no dio, y que **no se lleve** lo que no le toca.

> **Estado: DEUDA DECLARADA.** La fuente entró al método en la v1.3 con su
> disparador —idea de Montalvo, validada por él en un caso real— pero **el caso
> concreto no está capturado**. Según la regla de §10, una entrada sin caso de
> regresión no está protegida: nada impide que una versión futura la deshaga o la
> degrade sin que nadie lo note.
>
> **Esto se escribe como hueco visible en vez de dejarse fuera**, que es
> exactamente lo que el método hace con los contactos a medias: lo incompleto se
> marca, no se tira.

### Qué le falta para servir como regresión

Las tres cosas que pide el apartado de abajo, ninguna de las cuales se puede
inventar:

1. **El giro industrial** de la empresa donde Montalvo lo validó — no su nombre.
2. **El hallazgo esperado, con el puesto**: qué persona apareció, en qué tipo de
   documento (¿ponencia? ¿ficha técnica? ¿directorio de cámara?) y **qué dato de
   contacto** traía.
3. **El contraste contra el resto de la cascada**: qué fases se habían corrido ya
   sin dar con ese dato. Sin eso no se sabe si la fuente **aporta** o si sólo
   repite lo que LinkedIn ya había dado.

### La mitad que sí se puede verificar desde hoy

**El límite de recolección se prueba sin buscar nada**, igual que el Caso C:

- Dado un PDF que es una **ficha técnica con correo corporativo** → el dato
  **entra** a la base.
- Dado un PDF que es un **CV suelto con celular personal** → el dato **NO** entra;
  sale marcado como **HALLAZGO** para revisión humana.
- Dado un **PDF alojado dentro de un post de LinkedIn** → la herramienta **no lo
  intenta**. No es un fallo de la fuente: está fuera de su alcance por diseño.

**Una implementación que vuelque el celular del CV a la base falla este caso**,
aunque haya encontrado a la persona correcta. Encontrar bien y guardar mal sigue
siendo fallar.

---

## Caso F · El dato de una sola fuente que se reportó como consenso

**El caso que justifica la matriz de challenge y el nivel EN CONFLICTO
(v1.4 del método).** No verifica que la cascada encuentre, ni que entregue:
verifica que **no afirme de más**.

**Medido en Cuprum.** La ficha salió diciendo
*"patrón `nombre.apellido@cuprum.com`, **100%**, el más limpio de las ocho"*.

Era falso, y el mecanismo del error importa más que el error:

| Fuente | Qué dijo |
|---|---|
| Directorio A | `cuprum.com` al **100%** |
| Directorio B | `cuprum.com` al **45.45%** |
| Directorio C | Grupo Cuprum también usa **`verzatec.com`** —empresa hermana— en un **20%** |
| Correo real, de Outlook | `[persona]@cuprum.com` — **existe y contestó** |

**Nadie eligió mal.** Se consultó un directorio, contestó con una cifra
rotunda, y se reportó. **No había casilla para "las fuentes chocan"**, así que el
dato cayó en el nivel de la única fuente mirada.

> El error se corrigió **dos días después y por casualidad**, en una corrida que
> buscaba otra cosa. Una regla lo habría atrapado en el momento.

### Qué verifica

1. **Regla de oro:** un patrón de correo sostenido por **una sola fuente** no
   puede salir marcado como confirmado. Con un directorio consultado, el máximo
   posible es SÓLIDO.
2. **Cruce C1:** con tres directorios que difieren en más de 20 puntos de
   porcentaje, o donde aparece un **dominio alterno** o una **empresa hermana**,
   el dato baja a **EN CONFLICTO** y va a revisión humana.
3. **Cruce C2, el ancla dura:** el correo literal `[persona]@cuprum.com`
   **no resuelve el porcentaje**, pero sí fija que `cuprum.com` es un dominio
   vivo de la cuenta. Una implementación que use el literal para *cerrar* el
   conflicto —en vez de sólo anclar el dominio— **falla el caso**: son preguntas
   distintas, cuál dominio existe y con qué frecuencia se usa.
4. **Nunca en silencio:** el conflicto tiene que ser **visible en la ficha**. Una
   implementación que elija la fuente más alta y siga adelante falla el caso
   aunque acierte.

### Por qué es el segundo caso barato

Como el C, **se verifica sin llamar a ninguna fuente**: se le dan las cuatro
filas de la tabla de arriba como entrada y se mira qué nivel produce. Debería ser
la segunda prueba que pase la cascada cuando se construya.

### Su parentesco con los casos C y D

C y D son la misma falla —recortar temprano— en dos lugares. **F es la falla
contraria: afirmar de más con poco.** Y las dos vienen del mismo hueco: un
criterio que no estaba escrito, así que cada quien aplicó el suyo.

---

## Cómo se agregan casos

Un caso nuevo necesita tres cosas, y sin las tres no sirve como regresión:

1. **El giro industrial**, no el nombre de la empresa en el título.
2. **La lista de hallazgos esperados**, con el puesto —no solo el nombre—, porque
   lo que se verifica es que la cascada llegue a ese **rol**.
3. **La referencia contra el trabajo manual**: qué igualó y qué superó. Un caso
   sin ese contraste no dice si la cascada aporta algo.
