# Búsqueda encadenada de contactos — la capa de contactos de `/prospectar`

**Versión 1.5** · autocontenida · reemplaza cualquier versión previa.
El historial de correcciones y las reglas para cambiarla están en **§10**.

> **Estado: DOCUMENTADA, NO CONSTRUIDA.** Este documento es el método, probado a
> mano en chat. Su construcción es un trabajo posterior y aparte.

**Las secciones 1 a 8 son el MÉTODO y aplican a cualquier empresa.** No hay un
solo nombre propio en ellas, y es a propósito: un método con nombres adentro se
convierte en una lista y deja de ser un método. Los casos concretos viven en
`fixtures/contactos-casos-de-regresion.md` y solo sirven para verificar.

## Dónde encaja

Es la **capa de contactos** de la herramienta de prospección. Las otras capas ya
están documentadas y no se repiten aquí:

| Capa | Documento |
|---|---|
| Padrón del DENUE | `docs/n8n/denue-padron.md` |
| Vigilante de cortes | `docs/n8n/denue-vigilante.md` |
| Red de validación y procedencia | `docs/prospectar/red-de-validacion.md` |
| Modo señal y fuentes de evento | `docs/prospectar/fuentes-de-senal.md` |
| Orquestador y cobertura | `.claude/skills/prospectar/SKILL.md` |
| Enriquecimiento orgánico (diseño) | `docs/prospeccion/enriquecimiento-organico.md` |
| **Contratos, orden óptimo y challenge** | [`modulos-de-contactos.md`](modulos-de-contactos.md) |

> **Este documento narra el PORQUÉ. El de módulos especifica el CÓMO SE CORRE.**
> Si los dos se contradicen, **manda éste** y el otro está desactualizado.

**El entregable para Rissia:** nombre y puesto de contactos, historia de cuenta y
ángulo técnico, listos para rematar en Sales Navigator.

---

## 1 · Principio rector

**La búsqueda de contactos es una cascada escalonada que se cierra en loop.**

- Se **agota** cada fase antes de avanzar a la siguiente.
- Se guarda **todo** resultado, aunque en el momento no parezca servir.
- No se salta **ninguna** configuración.
- **La ficha se arma SOLO al final.**

> **Armar la ficha antes de agotar la cascada es, por definición, armar una ficha
> incompleta.** No es una cuestión de prisa: es que el dato que faltaba iba a
> aparecer en la fase que no se corrió.

## 2 · Regla de oro

**Cada configuración de búsqueda es una búsqueda propia e independiente, y
ninguna se salta.**

Cada configuración destapa gente que las otras no traen. **Saltarse una es
perder al comprador.** Se corren todas aunque parezcan redundantes — **no lo
son**; lo parecen porque el buscador devuelve resultados que se traslapan, no
porque cubran el mismo universo.

---

## 3 · Matriz de configuraciones

> **La aclaración que cambia todo: el diccionario NO se busca palabra por palabra
> suelta.** Las piezas se **combinan entre sí**, y **cada combinación es una
> configuración**. Buscar `facilities` no es lo mismo que buscar
> `"facilities manager"`, y la diferencia no es de matiz: es la diferencia entre
> encontrar al comprador y no encontrarlo.

### 3.0 · El motor de combinaciones

El diccionario de §3.1 **no es una lista de queries**. Es un inventario de
**piezas** que se combinan. La sección 3.1 se lee descompuesta así:

| Tipo de pieza | Valores |
|---|---|
| **Raíz de área** | facilities · maintenance · operations · project · projects · engineering · automation · procurement · purchasing · energy · utilities · reliability · plant · capex/kapex · MRO |
| **Nivel / sinónimo** | manager · sr / senior · head of · director · gerente · jefe · coordinador · superintendente · líder · lead · specialist · engineer |
| **Credencial** | CMRP · PMP · MBA |
| **Geografía** | ciudad de la planta · estado · área metropolitana |
| **Idioma** | español · inglés |

**Se generan las MÁXIMAS combinaciones posibles entre esas piezas**, no las
palabras sueltas. Y se combinan **raíces entre sí**, no solo raíz + nivel: ahí
está la mitad del rendimiento.

#### Lo que produce el motor y una lista de palabras sueltas NO produce

```
facilities manager · operations facilities manager · facilities operations manager
facility project manager · maintenance facilities · sr facilities manager
head of facilities

maintenance manager · sr maintenance manager · reliability maintenance
maintenance engineering manager

project manager facilities · capex project manager · facility project manager
```

Ninguna de esas cadenas está escrita en el diccionario. **Todas salen de
combinar sus piezas.**

#### La medición que lo justifica

> **Medido:** en una planta del padrón, la combinación de **dos palabras**
> —raíz + nivel— trajo al gerente de facilities responsable de la compra. **La
> raíz suelta no lo trajo.** Misma empresa, misma sesión, mismo buscador: la
> única diferencia era la combinación.
>
> El caso con nombres está en
> [`fixtures/contactos-casos-de-regresion.md`](fixtures/contactos-casos-de-regresion.md).

**Correr pocas configuraciones es perder contactos.** No es una hipótesis: es lo
que pasó.

### 3.1 · Variantes de forma — cada combinación se corre en todas

Cada combinación del motor se corre además en **todas** estas formas. **Ninguna
se salta.**

| Dimensión | Valores |
|---|---|
| **Operador** | `site:linkedin.com/in` · **sin operador (búsqueda simple)** · `"@dominio.com"` · `"[empresa] email format"` · `"[empresa] key contacts"` · **`filetype:pdf`** |
| **Geografía** | sin ancla · con ancla (ciudad · estado · área metro) |
| **Idioma** | español · inglés |
| **Destino** | buscador general · directorios agregadores · **vacantes / careers** · **documentos PDF públicos indexados** |

**La búsqueda simple, sin operador, es un tipo de consulta más — no un descarte.**
Quitar `site:` cambia qué indexa el buscador y destapa páginas de equipo,
comunicados y notas que el operador filtra. Se corre igual que las demás.

**Por qué los dos idiomas:** los directores globales publican su título en
inglés; la gente de planta, en español. Una sola lengua deja fuera a media
organización.

**La geografía va en el TEXTO del query**, no en un parámetro. El porqué está en
§6.

### 3.2 · La capa de vacantes, que también vive aquí

`[empresa] careers` · `[empresa] empleos [ciudad]` · Indeed · Glassdoor.

**No es una capa aparte ni un sustituto: es un tipo de consulta más de esta misma
matriz.** Sirve para dos cosas distintas y las dos importan:

**(a) Cosechar los títulos exactos que ESA empresa usa.** Cada organización
nombra sus puestos a su manera. Un título que aparece en su bolsa de trabajo es
el vocabulario real de la casa, no el genérico. **Esos títulos entran como piezas
nuevas al motor de combinaciones de esa corrida**, y disparan una **re-búsqueda**
con las combinaciones que antes no existían.

**(b) Detectar señal caliente.** Una vacante abierta es obra en curso. Y cruzada
con quién ocupaba el puesto antes, es el challenge de §5.

> **Ojo con la contradicción, que es real:** en las formas que buscan **personas**
> hay que añadir `-jobs -empleos -vacantes`, o las vacantes ahogan a los
> perfiles. En la forma que busca **vacantes** esa exclusión obviamente no va.
> **Son formas distintas de la misma combinación, y cada una lleva su propia
> exclusión.** Aplicar el `-jobs` a todo deja ciega a la capa (a).

### 3.3 · El número es alto por diseño

El total de configuraciones es el **producto**:

```
piezas combinadas × niveles × credenciales × geografía × idioma × forma
```

**Eso es lo que da cobertura, y es intencional.** Un número cómodo de búsquedas
significaría que se recortó el producto, y recortarlo es exactamente el error que
esta sección existe para impedir.

> **El límite es la SATURACIÓN —una vuelta completa sin nada nuevo de la
> empresa— no un tope arbitrario de búsquedas.** Si alguien propone "correr las
> 30 más probables", está proponiendo perder contactos: las combinaciones no se
> ordenan por probabilidad porque **no se sabe de antemano cuál es la que pega**.

### 3.4 · Diccionario de puestos — el inventario de piezas

Esto **no es una lista de queries**: es el inventario de piezas que alimenta el
motor de §3.0. Leerlo como lista y buscar cada término suelto es el error que
§3.0 existe para impedir.

**Fuente doble, y ninguna teórica:**

- **(A)** Los contactos **con puesto a los que FTS ya cotizó**, del campo
  `function` de `res.partner` en Odoo.
- **(B)** Títulos frescos **cosechados de LinkedIn** al buscar a esos mismos
  contactos por nombre + empresa. Esto captura **movimientos y variantes de
  título** que Odoo no tiene.

> Sale de **compradores reales**, no de un organigrama imaginado.

**MANTENIMIENTO** — Gerente de Mantenimiento · Maintenance Head · Maintenance
Manager · Superintendente de Mantenimiento · Supervisor de Mantenimiento ·
Coordinador de Mantenimiento · Coordinador Mtto L6 · Jefe de Mantenimiento ·
Almacén de Mantenimiento

**CONFIABILIDAD Y ACTIVOS** — TBM-CBM Analyst · Asset Management · Reliability ·
Certificate Machinery Safety Expert · CMRP

**AUTOMATIZACIÓN** — Automation Manager · Automation Engineer · Coordinador de
Automatización · Industria 4.0 · I4.0

**PROYECTOS / CAPEX** — Project Manager · Senior Project Manager · Gerente de
Proyectos · Ingeniero de Proyectos · Coordinador de Proyectos Eléctricos ·
Capital Projects · CapEx Trainee · Head of Project Administration · Proyectos

**INGENIERÍA / PROCESOS** — Gerente de Ingeniería · Gerente de Engenharia
*(portugués, plantas con matriz en Brasil)* · Process Engineer (Sr) · Project
Engineering Trainee · Plant Engineering

**COMPRAS / PROCUREMENT** — Capex Buyer · Corporate Buyer · Corporate
Procurement · Procurement Regional · Regional Manager Procurement · Procurement
Specialist · Procurement Analyst · Head of Procurement and Capital Expenditure ·
Head of Infrastructure/Indirect Procurement · Buyer · Buyer Sr / Sr Buyer ·
Purchase · Purchase Engineer · Especialista en Compras · Compras · MRO

**INSTALACIONES / PLANTA / OPERACIONES** — Coordinador de Instalaciones · Jefe de
Planta · Gerente de Planta · Planning Superintendent · Superintendente de
Operaciones

**ENERGÍA / FLUIDOS** — Gerente de Energía · Energy Manager · Fluidos ·
Utilities · Facilities

#### La lista es viva

Un paso periódico lee el campo `function` de `res.partner` **y** busca a cada
contacto en Google por nombre + empresa para cosechar su título actual y
capturar movimientos. Los términos nuevos se agregan aquí. **El vocabulario
crece con la operación real, no con el criterio de quien escribió la lista.**

> **Límite medido:** buscar por nombre + empresa **reduce** los homónimos pero
> **no los elimina**. Registrar solo cuando el resultado **confirma la empresa
> correcta**.

#### Puerta no es lo mismo que decisor

Mantenimiento, producción y almacén entran como **puerta de introducción**. El
**decisor de la compra CAPEX** es proyectos, compras/procurement CAPEX e
ingeniería. El filtro de valor (§5) distingue **target** de **puerta** — y la
ficha los ordena por cercanía a la decisión, no por jerarquía.

### 3.6 · La capa de congresos y cámaras

**Los organizadores publican quién fue, por empresa y por puesto.** Es la fuente
más limpia del catálogo y la que produce nivel 3 a escala.

| Fuente | Qué publica |
|---|---|
| **CMC México** *(Congreso de Mantenimiento y Confiabilidad)* | listas de asistentes con país, estado, empresa y **puesto**, sin nombres · programa de ponentes · revista de la edición |
| **CAINTRA** | sesiones de *Café con el experto* con el área de abastecimiento de la empresa invitada · programas de vinculación con su cohorte de socios |
| **CLAUT** *(Clúster Automotriz de NL)* | socios, comités técnicos, eventos |
| **Supply Hub NL** | encuentros de compradores con proveedores |
| **Clúster de Herramentales** | socios y foros técnicos |

**Qué entrega y qué no.** Entrega **puestos-objetivo con el título exacto que usa
cada casa**, y vocabulario real de la industria. **No entrega nombres** — y eso,
lejos de ser un defecto, es lo que la vuelve la fuente más barata de operar:

> **Es la única capa que no activa el límite de privacidad de §3.5**, porque el
> organizador ya publicó sólo empresa y puesto. **No hay dato personal que
> filtrar porque no hay dato personal.**

**Medido, parcial:** un solo documento —asistentes de CMC México 2019— trae
empresa y puesto en volumen; la edición 17 reporta **más de 600 asistentes, 92%
de perfil medio y alto**. **No se ha cruzado contra el padrón**, así que cuántos
puestos-objetivo útiles produce por cuenta sigue sin medirse.

**Las cámaras son además puerta, no sólo dato.** Una sesión donde el área de
abastecimiento de la cuenta objetivo habla en público de su operación no se
compra: llega al buzón de quien es socio.

### 3.7 · Señal, ángulo técnico y padrón

Dos fuentes que no dan contactos y **sin las cuales la ficha no tiene argumento**.

#### Prensa e inversión — y el hallazgo que no esperaba

Vanguardia Industrial · Cluster Industrial · Somos Industria · Solili · México
Industry · El Financiero · Milenio · boletines de gobierno del estado.

Entrega el **gancho**: proyecto, monto, fecha y ventana. De las ocho cuentas de
la corrida de sep-2026, **la prensa produjo las ocho señales calientes**.

> **Lo que se descubrió corriéndola, y que cambia dónde va este paso:** la prensa
> no sólo da el argumento comercial. **Da vocabulario técnico que el diccionario
> genérico de §3.4 no tiene**, y que es el que encuentra al comprador real:
>
> | Lo que dijo la prensa | El título que hay que buscar, y que §3.4 no traía |
> |---|---|
> | cogeneración de 19.2 MW con vapor | *jefe de calderas · servicios auxiliares* |
> | anodizado en planta nueva de extrusión | *tratamiento de superficie* |
> | ampliación del taller de pintura de cabinas | *superintendente de pintura* |
>
> **En los tres casos el título salió de la nota, no del diccionario.** Por eso
> esta capa corre **antes** del motor de combinaciones y no después: **alimenta
> al motor igual que las vacantes.** Correrla al final es tener el argumento
> cuando ya se gastaron las consultas buscando títulos genéricos.

#### DENUE — identidad, ubicación y dominio

El padrón es el **único censo con cobertura completa** y es lo que fija la
identidad: razón social, ubicación, giro, tamaño y, en 112 de 143 plantas del
corte, **el dominio de correo** — que es la entrada de los directorios y la mitad
de la llave operativa `dominio_correo + ciudad + CP`.

El detalle está en `docs/n8n/denue-padron.md`. Lo que importa aquí es **cuándo
corre**, y depende del modo:

- **Modo lote:** DENUE va **arriba de todo**. Es lo que elige qué planta se
  trabaja y entrega el dominio que los directorios necesitan.
- **Modo señal:** la prensa va arriba, y DENUE entra después para confirmar
  identidad y ubicación de la planta que la nota nombró.

> **Es una foto, no un servicio.** `corte_denue` no es opcional, y un filtro por
> texto acentuado contra el DENUE es una trampa: el corte viene en Latin-1. El
> filtro de giro va por `codigo_act`, que es ASCII.

### 3.5 · La capa de documentos PDF públicos indexados

*Idea de Montalvo, validada por él en un caso real.*

**El buscador indexa PDFs, y en la industria hay muchos.** Ponencias de congreso,
fichas técnicas, memorias de eventos, directorios de cámaras y asociaciones,
padrones de proveedores, actas, boletines. Algunos traen **datos de contacto
directos** —correo corporativo, teléfono de oficina, extensión— que ni el
directorio agregador ni LinkedIn entregan.

**Es un tipo de consulta más de la matriz de §3**, no una capa aparte: las mismas
piezas del motor, con `filetype:pdf` como operador.

```
filetype:pdf "[nombre]" "[empresa]"
filetype:pdf "[empresa]" (mantenimiento OR proyectos OR compras) contacto
```

**Dónde pega mejor:** ponentes de congreso, autores y revisores de fichas
técnicas, firmantes de documentos, gente listada en directorios de cámara. Es
decir, **la persona técnica que publicó algo** — que suele ser exactamente el
perfil que el filtro de valor de §5 marca como *target* y no como *puerta*.

**Cuándo se corre:** cuando el nombre ya salió de otra fase y el dato de contacto
no cerró. Es complemento de la cascada, no reemplazo — un PDF no da organigrama,
da una persona a la vez.

#### El límite de privacidad — no se salta

> Esto **no** es una recomendación de estilo. Es la regla de recolección, y define
> qué puede tocar la herramienta en automático y qué no.

Un CV personal con **teléfono celular privado** es dato personal sensible bajo la
**LFPDPPP**. Que alguien lo haya subido sin cuidado **no lo convierte en material
de recolección masiva**. Que sea alcanzable no lo vuelve recolectable.

| Qué aparece | Qué hace la herramienta |
|---|---|
| Correo corporativo, teléfono de oficina o extensión, en **ficha técnica, ponencia, directorio oficial o padrón** | **Recolecta en automático.** Se publicó a propósito y en contexto de trabajo. |
| **CV suelto** con celular personal, domicilio, RFC, CURP o datos de familia | **NO se vuelca a la base.** Se marca como **HALLAZGO** para revisión humana de Rissia. |

**El principio rector es el mismo de la capa de enriquecimiento orgánico:** lo
que se publicó **a propósito** sí; lo que **se le escapó** a alguien, con cuidado
y con criterio humano de por medio.

> **Por qué la distinción no es cosmética.** Un correo corporativo en el
> directorio de una cámara es la empresa diciendo *"escríbanle aquí"*. Un celular
> en un CV es una persona buscando trabajo en 2019 que nunca pensó que su número
> iba a acabar en el CRM de un proveedor industrial. El buscador los devuelve
> igual; la herramienta **no** los trata igual.

#### El PDF que vive dentro de un post de LinkedIn

**No es alcanzable por buscador.** LinkedIn bloquea la indexación de sus posts,
así que ese documento no existe para esta capa. Lo ve **un humano con su sesión
iniciada** —Rissia—, no la herramienta.

> **Y no se intenta raspar LinkedIn autenticado.** Ni con sesión prestada, ni con
> navegador headless logueado, ni con extensión. Es violación de términos, es
> frágil, y pone en riesgo la cuenta de la que depende el remate de todas las
> fichas. **El límite de esta capa es el índice público del buscador.**

---

## 4 · Secuencia de fases

**Cada fase se agota antes de la siguiente.**

### Fase 0 · Contactos propios ya cotizados

**La capa de mayor valor, y por eso arranca aquí.**

Sacar de Odoo (`res.partner`, `is_company=false`, con `function` y `parent_id`)
los contactos **a los que FTS ya cotizó**. Por cada uno:

1. Buscar `"[nombre] [empresa]"` para confirmar si **sigue** o se **movió**.
2. Sacar su LinkedIn actual.
3. Validar correo.

> **Un movimiento de empresa es doble lead:** una puerta nueva donde llegó, y un
> hueco donde estaba.

**Qué entrega:** leads **calientes** —esto es reactivación, no prospección en
frío—, el **patrón de correo real** de cada cuenta, y vocabulario de puestos que
alimenta el diccionario.

**Medido:** 59 contactos, con clusters completos de cuenta (una cuenta con ~16,
otra con ~8) y patrón de correo confirmado por datos duros.

### Fase 1 · Directorios agregadores

Consultar **todos**: prospeo.io · rocketreach.co · leadiq.com · zoominfo ·
FinalScout · ContactOut · SignalHire · AeroLeads · Seamless · Clay · Tomba ·
Datanyze.

> **Reconciliado en v1.5.** Esta lista y la del contrato de módulos **no
> coincidían**: aquí faltaban cinco, allá faltaban prospeo y FinalScout. Era
> exactamente la divergencia silenciosa contra la que advierte §10, ocurriendo
> entre dos documentos de la misma skill. **Las dos listas son ahora la misma.**

**Criterio de agotado: mínimo TRES consultados y contrastados entre sí.** No
"uno que responda". El porqué está en §5: con un solo directorio salió un patrón
falso que nadie atrapó.

Con `"@dominio"`, `"[empresa] email format"`, `"[empresa] key contacts"`.

Dan **gratis** el organigrama de compras y dirección, y el **patrón de correo con
porcentaje**. El nombre truncado que devuelven se cierra en la Fase 3 — no es
motivo para descartar el hallazgo.

### Fase 2 · LinkedIn por puesto

**La matriz completa de §3.** Toda la lista del diccionario, todas las variantes,
cada una como query propia. **Guardar cada resultado.**

### Fase 3 · Individual por nombre

Por **cada** nombre acumulado hasta aquí: `"[nombre completo] [empresa]"` para
cerrar el apellido truncado, confirmar el puesto y **cosechar colegas** — el
*"puede presentarte a X personas en [empresa]"* que devuelve el buscador entra
como **semilla nueva**.

**Aquí también entra `filetype:pdf "[nombre]" "[empresa]"` (§3.5).** Es el momento
natural: ya hay nombre, y lo que falta es el dato de contacto que el directorio
no soltó.

### Fase 4 · Aduanas y comercio *(bonus)*

Panjiva y bill-of-lading. Revelan **qué importa la planta** (maquinaria HS 84,
PLCs, acero) y **de qué proveedor** — señal de inversión activa —, y a veces el
RFC.

---

## 5 · Cierre, triangulación y challenge

**Loop hasta saturación:** repetir 2 → 3 → 4 hasta que **una vuelta completa no
aporte nada nuevo** de la empresa. La saturación se declara con una vuelta seca
entera, no con la impresión de que ya no hay más.

**Deduplicar** por nombre + empresa.

### Niveles

| Nivel | Cuándo | En `SKILL.md` |
|---|---|---|
| **CONFIRMADO** *(era ROBUSTO)* | ≥2 fuentes de **raíz distinta** | `verificado` |
| **SÓLIDO** | 1 fuente confiable **+ patrón consistente** | `supuesto` |
| **CANDIDATO** | derivado de patrón, sin ancla | `supuesto` |
| **EN CONFLICTO** *(nuevo en v1.4)* | dos fuentes chocan → **revisión humana** | `contradicho` |
| *(hueco)* | agotada la cascada sin resultado | `no_encontrado` |

> **Por qué faltaba EN CONFLICTO, y qué costó.** El orquestador ya tenía
> `contradicho` en su modelo de procedencia; esta tabla no. Un dato que chocaba
> con otro **no tenía dónde caer**, así que caía en el nivel de la fuente que se
> hubiera mirado primero.
>
> **Eso produjo un error real:** la ficha de Cuprum salió afirmando *"patrón 100%,
> el más limpio de las ocho"*. Venía de **un solo directorio**. Al contrastar,
> otro da `cuprum.com` al 45% y reporta además `verzatec.com` —empresa hermana—
> al 20%. Nadie eligió mal: **no había casilla para "chocan"**, y sin casilla el
> dato se reporta como si fuera consenso.

**La regla de oro que se desprende:** un dato de **UNA sola fuente nunca se
reporta como confirmado**, por convincente que sea el número que trae. Las reglas
de cruce están en la matriz de
[`modulos-de-contactos.md`](modulos-de-contactos.md).

**Y un correo nominal literal pesa más que uno derivado de patrón.** No es
cuestión de cuántas fuentes: uno **es** el dato, el otro es una predicción sobre
el dato.

> **Ojo, son dos ejes distintos.** Esta escala mide **confianza**. La de §8.1
> —confirmados, parciales, puestos-objetivo— mide **completitud**. Un
> puesto-objetivo sin persona puede ser CONFIRMADO: el título existe y lo
> publicaron dos fuentes; lo que falta es la persona, no la certeza.

### Filtro de valor, doble

**(a) ¿Es de la entidad correcta?** Descartar homónimos de otra empresa o país, y
filiales estadounidenses de una matriz mexicana. Dos empresas con nombre parecido
en países distintos no son la misma empresa por más que el buscador las junte.

**(b) ¿El puesto compra, decide o influye la infraestructura que vende FTS?** IT o
RH que solo mencionan la palabra son **contexto, no target**.

> **Este filtro es de CORRECTITUD, no de confianza.** Descarta lo que está mal
> —otra entidad, otra función—, **nunca** lo que está bien pero incompleto. Un
> nombre a medias no se filtra aquí: va a la ficha marcado como parcial (§8.7).

**Registrar las configuraciones SECAS** —las que devuelven 0 de la empresa— para
no repetirlas en la siguiente vuelta.

### Challenge cruzado — obligatorio antes de la ficha

**Cruzar los hallazgos entre sí revela señales que ninguno da por separado.**

> Ejemplo: una **vacante activa** de un puesto, cruzada con **quién lo ocupaba
> antes**, dice que el puesto está **en transición**. Eso es una **señal
> caliente**: hay un hueco que llenar y alguien nuevo que aún no tiene
> proveedores.

Ninguno de los dos datos, solo, dice eso.

---

## 6 · Límite de entorno *(medido)*

**El buscador desde servidor o API devuelve resultados más genéricos que un
humano logueado en la ciudad objetivo.** Google filtra por IP y por sesión.

- Poner la **geografía en el texto** del query corrige **~70-80%**. **No iguala
  al humano.**
- **`uule` por URL no funciona** desde este entorno.
- **El operador `filetype:pdf` NO se respeta de forma confiable.** *(medido
  20-sep-2026, 18 consultas)* Varias devolvieron páginas web. Cuando pega, pega
  bien. **Se rodea reformulando sin el operador** y filtrando por el dominio del
  resultado.
- **`WebFetch` está bloqueado contra todo.** Los PDFs **se ven existir y no se
  leen**: lo que llega es el resumen del buscador, no el documento. Los padrones
  públicos de proveedores —con columnas literales de `contacto · puesto ·
  teléfono · correo`— quedan vistos y sin cobrar. **La salida no es insistir por
  esta vía: es leerlos desde n8n**, que sí alcanza. Es la única pieza del diseño
  que pide infraestructura.
- n8n corre en Railway, que es **datacenter**: un navegador headless propio
  sufriría **el mismo sesgo**, salvo con proxies residenciales mexicanos.

**Mejora opcional, no requisito:** SerpAPI o DataForSEO —geolocalizados y con
tarjetas enriquecidas, ~50-75 USD por 5-10k consultas—. **Probar su tier gratuito
de 100/mes antes de pagar nada.**

> Y el encuadre que evita frustración: **la lista final no pretende ser
> exhaustiva.** Es el **punto de partida curado** que Rissia remata en Sales
> Navigator.

---

## 7 · Validación de correo *(gratis)*

El patrón se **triangula** con los directorios, que lo dan con porcentaje. Queda
marcado **CANDIDATO** hasta validarse.

Buscar el **correo exacto entre comillas** confirma si está indexado en algún
lado.

> **SMTP directo falla** por el catch-all de Microsoft 365: contesta que sí a
> todo, incluso a buzones inventados. Un `250 OK` de un catch-all no prueba nada.

**El PDF público (§3.5) es la excepción útil:** no da un patrón, da la
**dirección literal**. Un correo corporativo impreso en una ficha técnica o en el
directorio de una cámara es publicación de la empresa, **raíz distinta** de la
del directorio agregador — y dos raíces distintas es lo que sube un campo de
`supuesto` a `verificado`.

> **Pero con la fecha puesta.** Una ponencia de 2018 prueba que ese correo
> **existió**, no que la persona **sigue ahí**. El dato hereda la antigüedad del
> documento, y el documento casi siempre la trae impresa. Sin fecha localizable,
> se queda en **CANDIDATO**.

---

## 8 · Salida: la ficha *(último paso, dos modos)*

### 8.0 · La ficha entrega TODO lo que la cascada encontró

> **Corrección medida.** La ficha se estaba limitando a ~5 contactos, y **no por
> un tope de búsqueda**: por un criterio de inclusión demasiado estricto. Solo
> subían las personas con **nombre y apellido completos**, y se tiraba todo lo
> demás — nombres parciales, puestos identificados sin persona, perfiles que la
> cascada sí encontró pero no cerró al 100%.
>
> Al soltar ese criterio y agotar combinaciones, **una planta pasó de 5 a 21
> contactos**, e incluidos ahí venían decisores de obra que antes se
> descartaban. El caso con nombres está en
> [`fixtures/contactos-casos-de-regresion.md`](fixtures/contactos-casos-de-regresion.md).

**La regla:** no se descarta un hallazgo **solo porque no se cerró el nombre
completo**. Un puesto con nombre parcial —o hasta el puesto solo— es material
útil para el remate humano.

### 8.1 · Los tres niveles

Todo lo encontrado va a la ficha, **marcado** en uno de tres niveles:

| Nivel | Qué es | Qué lleva |
|---|---|---|
| **1 · CONFIRMADOS** | Nombre y apellido completos + puesto + empresa | Correo candidato por patrón |
| **2 · PARCIALES** | Nombre incompleto, o perfil con puesto claro y apellido sin cerrar | Marcado **"por cerrar en Sales Navigator"** |
| **3 · PUESTOS-OBJETIVO SIN PERSONA** | Títulos salidos de vacantes, Glassdoor u organigrama, todavía sin nombre | Se listan como **puesto a cazar** |

**El nivel 3 no es relleno.** Para quien remata en Sales Navigator, **un puesto
identificado ya es accionable**: se busca por título dentro de la empresa y
aparece la persona. Tirarlo por no tener nombre es tirar trabajo hecho.

### 8.2 · El orden NO es por nivel de confirmación

> **La ficha limpia ordena por cercanía a la decisión de compra técnica**
> —obra, instalación, CAPEX—, **no por nivel de confirmación y no por jerarquía.**

Un **puesto-objetivo de nivel 3 que decide la obra va ARRIBA** de un confirmado
de nivel 1 que no decide nada. Ordenar por confianza es volver a colar el mismo
sesgo por la puerta de atrás.

### 8.3 · Meta de cobertura

**Apuntar a 20+ entradas cuando la empresa es grande.** Sumando los tres
niveles.

En empresas chicas habrá menos y **está bien**. El punto no es el número: es
**no auto-limitarse por el criterio de confirmación**. Se agotan las
combinaciones del motor (§3) y **se vuelca todo el mar a la ficha**, en sus tres
niveles.

### 8.4 · Modo LIMPIO — para Rissia

**Sin andamiaje de auditoría.** El argumento primero, la lista completa después:

1. **El gancho** — ángulo técnico con proyecto y monto.
2. **Señal caliente**, si la hay.
3. **Por qué llamar ahora.**
4. **A quién buscar** — los tres niveles, ordenados por cercanía a la decisión.
5. **Cómo hablarles.**
6. **Búsquedas listas para pegar** en Sales Navigator.

> **Qué cabe en una pantalla, exactamente.** El **argumento** —puntos 1, 2, 3 y
> 5— cabe en una pantalla. **La lista de contactos no, y no debe forzarse:**
> veintiún contactos son veintiún renglones. Recortar la lista para que "quepa"
> es justo el error que esta sección corrige. Va como tabla debajo del
> argumento.

### 8.5 · Modo PROCEDENCIA — aparte, para auditar

Fuente, raíz y nivel de cada dato.

### 8.6 · Checklist de cierre de la ficha

Se audita antes de entregar. **Cada línea se marca o se explica.**

- [ ] **Cobertura ampliada (20+ contactos): confirmados + parciales +
      puestos-objetivo.** Si son menos, decir por qué — empresa chica o cascada
      sin agotar.
- [ ] Se corrieron **todas** las combinaciones del motor (§3), no una selección.
- [ ] Se declaró la **saturación** con una vuelta completa seca.
- [ ] Cada fuente declara **qué dio**, no solo que respondió.
- [ ] El **challenge cruzado** (§5) se hizo.
- [ ] El orden es por **cercanía a la decisión**, no por confirmación ni
      jerarquía.
- [ ] Los **tres niveles** están marcados y distinguibles.
- [ ] El modo limpio **no afirma** nada que el de procedencia marque `supuesto`.
- [ ] **Ningún dato personal sensible entró en automático.** Si un CV suelto
      aportó celular, domicilio o identificadores fiscales, va marcado como
      HALLAZGO para revisión humana y **no** a la base (§3.5).

### 8.7 · Huecos honestos

Si tras agotar la cascada **no aparece ni siquiera un puesto-objetivo** de valor,
se dice: *"no localizado por fuentes abiertas, requiere Sales Navigator"*.

**Ojo con la barra:** ahora que el nivel 3 cuenta, "no localizado" es una
declaración **mucho más fuerte** que antes. Significa que no hay **ni un título**
que cazar. Si hay un puesto identificado, **hay ficha** — no es un hueco.

> **Nunca rellenar con contexto disfrazado de target.** Un contacto de IT puesto
> donde debía ir el comprador no es media ficha: es una ficha que miente.
>
> **Y eso no contradice lo de arriba**, porque son dos ejes distintos:

| Se descarta por... | ¿Se tira? |
|---|---|
| **Entidad equivocada** — otra empresa, otro país (§5a) | **Sí** |
| **Función equivocada** — IT, RH, no toca la compra (§5b) | **Sí** |
| **Confianza incompleta** — falta el apellido, falta la persona | **NO. Va a la ficha, marcado.** |

**Descartar por correctitud, sí. Descartar por confianza, no.** Ése era el bug.

---

## Orden inviolable

> **Corregido en v1.4.** Este bloque listaba ocho pasos y **no mencionaba ni las
> vacantes (§3.2) ni los PDFs (§3.5)** — dos de las capas que más rindieron.
> Quien implementara leyendo sólo aquí corría la cascada sin ellas. Es el bloque
> más citado del documento y era el más desactualizado.

```
OLA 0 — FUENTES INTERNAS. Van primero por PRECEDENCIA, no por rendimiento.
  0a. Odoo · contactos ya cotizados                      -> patron REAL + vocabulario
  0b. Odoo · clientes, historial y correos de contacto
  0c. Outlook · historia oculta, citas previas           <- ¿ya es cliente?

OLA 1 — BARATAS Y EXTERNAS. Dan patron y vocabulario: ALIMENTAN al motor caro.
  1a. DENUE · padron                                     -> identidad + dominio
  1b. Directorios — MINIMO TRES, contrastados entre si   -> patron con %
  1c. Vacantes · careers propio, Indeed, Glassdoor       -> vocabulario + senal
  1d. Congresos y camaras · CMC, CAINTRA, CLAUT,
      Supply Hub NL, Clúster de Herramentales            -> vocabulario + nivel 3
  1e. Prensa · angulo tecnico e inversion                -> gancho + VOCABULARIO

LUEGO, y no antes
OLA 2 — EL MOTOR CARO. Se lleva ~60% del gasto de consultas.
  2a. Motor de combinaciones  (sin red; come el vocabulario de 1c, 1d y 1e)
  2b. Busqueda de personas    en DOS formas por puesto:
        - busqueda simple SIN operador
        - con site:linkedin.com/in
  2c. Individuales por nombre (loop propio)
  [2x] SerpAPI / DataForSEO   MEJORA OPCIONAL, geolocalizada.
                              Probar el tier gratis de 100/mes ANTES de pagar.

OLA 3 — REFUERZO. Cierran huecos y aportan dato duro.
  3a. PDFs publicos           (DESPUES de 2c: su forma fuerte pide nombres)
  3b. Padrones publicos de gobierno   [ESPERA n8n: visto y no leido]
  3c. Panjiva / aduanas               [NUNCA CORRIDO]

CIERRE
  4.  Loop 2b -> 2c -> 3a hasta saturacion
  5.  Challenge cruzado       (la matriz, no la improvisacion)
  6.  SOLO ENTONCES: la ficha
```

**Por qué la ola 0 va primero, y no es por rendimiento.** En volumen crudo, la
búsqueda web rinde cinco veces más por consulta que Outlook. **La ola 0 gana por
precedencia, no por productividad:** previene el error más caro de la cascada
—escribirle en frío a una cuenta que ya es cliente—, y ése no se paga en
consultas, se paga en credibilidad. **Medido: pasó en una de ocho cuentas.**

**Las dos reglas de orden que más consultas ahorran**, y el porqué de cada una:

- **El motor (§3.0) no corre antes que las vacantes (§3.2) y los congresos.** Su
  salida vale lo que valga su vocabulario de entrada. Y el desperdicio de correrlo
  con el diccionario pelado **es invisible**: las consultas genéricas devuelven
  resultados genéricos, no errores.
- **La historia de cuenta va antes que cualquier redacción.** Cuesta ocho
  consultas y evita el error más caro de la cascada: escribirle en frío a alguien
  que ya trabajó con FTS. **Medido: pasó con una de ocho cuentas.**

---

## 9 · Casos de prueba de regresión

**No son parte del método.** Viven separados, en
[`fixtures/contactos-casos-de-regresion.md`](fixtures/contactos-casos-de-regresion.md),
para que el método siga siendo genérico y los datos de prueba se puedan cambiar
sin tocarlo.

Al construir, esos casos verifican que **la cascada agotada** funciona.


---

## 10 · Cómo evoluciona esta skill

Esta sección es **sobre la skill**, no sobre la búsqueda. Existe porque las dos
correcciones que ya lleva —§3 y §8— entraron bien **por suerte**, y la suerte no
escala.

### La regla

> **Una corrección no entra sin (a) el disparador medido y (b) un caso de
> regresión que la verifique.**

Sin **(a)**, el documento acumula opiniones y nadie sabe después por qué dice lo
que dice. Sin **(b)**, nada impide que la siguiente versión la deshaga sin darse
cuenta. **Las dos juntas convierten "mejorar la skill" de opinión en evidencia.**

Es el paralelo honesto con versionar software: **el historial son las notas de
versión, y los casos de regresión son la suite de pruebas.**

### Por qué no basta con git

Git ya versiona el archivo y los commits cuentan la historia. **No alcanza, por
dos razones:**

1. Para saber qué cambió y por qué hay que **leer commits**, que es justo lo que
   nadie hace antes de editar un documento.
2. Git registra **que** cambió, no **si la corrección quedó verificada**. Un
   commit se puede revertir sin que nada proteste; un caso de regresión que
   falla, sí protesta.

Git es el sustrato. El historial y los casos son lo que lo hace utilizable.

### El patrón que hay que vigilar

**Las dos correcciones que lleva esta skill son la MISMA falla:**

| Versión | El error | La forma |
|---|---|---|
| **v1.1** (§3) | El diccionario se leía como lista de palabras sueltas | **Recortó el universo antes de mirarlo** |
| **v1.2** (§8) | Solo entraban nombres y apellidos completos | **Recortó los hallazgos antes de entregarlos** |

En los dos casos el mecanismo fue el mismo: **un criterio de calidad aplicado
demasiado pronto.** Razonable visto de cerca, y en los dos casos **costó
contactos reales**.

> **Corolario operativo: recortar tarde, nunca temprano.** El único recorte
> legítimo a media cascada es por **correctitud** —entidad o función
> equivocada—; cualquier recorte por **confianza, volumen o prolijidad** va al
> final, o no va.
>
> **Y la predicción, para que se pueda refutar:** si aparece un tercer error en
> esta skill, lo más probable es que sea de la misma familia. Cuando algo
> entregue menos de lo esperado, la primera pregunta es **dónde se está
> recortando temprano**.

### Qué pasa cuando la skill se construya

Hoy las correcciones se aplican **editando el documento**. Cuando exista el
motor de §3 en código, la gobernanza se endurece sola:

- Los **casos de regresión pasan a ser pruebas** que corren solas. El Caso C ya
  está escrito para eso: se verifica **sin tocar ninguna fuente**.
- El **checklist de §8.6** pasa de lista que alguien palomea a **restricción en
  el punto de escritura** — el mismo patrón de `ck_respondio_declara_hallazgo`
  en la migración 014: lo que está mal **no se puede guardar**.

**Mientras tanto el documento es la única barrera, y por eso el historial y los
casos no son burocracia: son lo único que hay.**

### No todo cambio es una corrección

Las dos primeras entradas del historial fueron **correcciones**: algo estaba mal
y costó contactos. La tercera es una **ampliación**: una fuente que no existía en
el documento y que no arregla ningún error previo.

**Conviene no confundirlas, porque la regla de arriba pesa distinto en cada una.**
Una corrección sin caso de regresión es peligrosa —nada impide que la siguiente
versión la deshaga—. Una ampliación sin caso de regresión es simplemente una
fuente que todavía nadie verificó que rinda. **Las dos necesitan el caso; sólo
una sangra mientras no lo tiene.**

> Y una ampliación trae un riesgo propio que una corrección no tiene: **agrega
> superficie**. Una fuente nueva puede traer datos que antes no llegaban y que no
> deberían llegar. Por eso §3.5 entra con su límite de recolección escrito en el
> mismo apartado, y no en un documento de políticas que nadie va a leer antes de
> construir.

### Historial de correcciones

<!-- ancla: la tabla de descartadas vive en §11, al final del documento -->

| Versión | Fecha | Qué cambió | Disparador medido | Caso |
|---|---|---|---|---|
| **v1.0** | 2026-09-18 | Skill inicial: cascada de 5 fases, loop hasta saturación, dos modos de ficha | Prueba manual en chat | A, B |
| **v1.1** | 2026-09-18 | **§3** — el diccionario es un inventario de **piezas que se combinan**, no una lista de palabras | Raíz + nivel trajo al gerente de facilities; la raíz suelta no | **C** |
| **v1.2** | 2026-09-18 | **§8** — la ficha entrega **los tres niveles**, meta 20+, orden por cercanía a la decisión | Al soltar el criterio estricto, una planta pasó de **5 a 21** contactos | **D** |
| **v1.4** | 2026-09-20 | **Orden inviolable** reescrito (le faltaban §3.2 y §3.5) · **§5** gana el nivel EN CONFLICTO y se alinea con el orquestador · **§6** gana los límites de `filetype:pdf` y `WebFetch` · nace [`modulos-de-contactos.md`](modulos-de-contactos.md) con contratos, orden y matriz de challenge | Auditoría del documento: dos espinas compitiendo, el bloque de orden desactualizado, dependencias sólo en prosa y **un error real que ninguna regla atrapó** (el patrón 100% de Cuprum) | **F** *(pendiente)* |
| **v1.3** | 2026-09-20 | **§3.5** — nueva fuente: **PDFs públicos indexados**, con su límite de recolección. Toca además §3.1 (operador y destino), §7 (correo literal con fecha) y §8.6 (checklist de dato sensible) | Idea de Montalvo, **validada por él en un caso real**. El caso concreto **no está capturado todavía** | **E** *(pendiente)* |

---

## 11 · Fuentes descartadas, y por qué

**Esta sección existe para que nadie las reintente por olvido.** Cada una se
evaluó, cada una se descartó por una razón concreta, y esa razón se escribe
aquí — porque una fuente descartada sin motivo escrito **vuelve a proponerse
cada seis meses**.

| Fuente | Por qué NO se usa | ¿Reversible? |
|---|---|---|
| **Scraping de LinkedIn autenticado** | Viola términos y **arriesga el baneo de la cuenta de Rissia**, que es de la que depende el remate de todas las fichas. Ni con sesión prestada, ni con navegador headless logueado, ni con extensión | **No.** El riesgo no baja con la técnica |
| **API oficial de LinkedIn / SNAP** | **Cerrada a nuevos socios.** No hay trámite que iniciar | No, salvo que LinkedIn reabra el programa |
| **Cuenta de Google dedicada en servidor** | Google **la bloquea por actividad automatizada**. No es configuración: es su detección | No. La alternativa legítima es SerpAPI o DataForSEO |
| **`uule` por URL** *(geolocalizar el buscador)* | **No funciona desde este entorno.** Medido | No por esta vía |
| **CV con celular personal, en volumen** | Dato personal sensible bajo la **LFPDPPP**. Que alguien lo haya subido sin cuidado no lo vuelve material de recolección masiva | **No como recolección.** Un hallazgo suelto va marcado a **revisión humana** de Rissia (§3.5) |
| **Lusha — filtro de industria** | **Devuelve basura.** El resto de Lusha sigue disponible pero sólo con autorización por corrida: quedan 20 créditos de los 480 que costaría el padrón completo | El filtro no. El resto, con autorización |
| **Vibe — señales** | Sólo como **segunda opinión**, nunca como fuente única. Registró a LEGO como casa de bolsa de Hong Kong: una fuente que se equivoca así no sostiene un campo sola | Parcial, y degradada |
| **D&B directo** | **Sin contrato.** Y vía Odoo es la **misma raíz** que una ficha de dnb.com, así que no sirve para confirmar nada por separado | Sí, si se contrata |
| **DUNS como llave de empate** | Apunta a veces a **una oficina en vez de la planta** (pasó con SuKarne) y Ragasa tiene **cinco**, uno en Jalisco. Sirve como identificador estable entre cortes, **nada más**. La llave operativa es `dominio_correo + ciudad + CP` | No como llave |
| **DENUE por API con token** | Descartada en fase previa. El padrón se recorre por **descarga de corte**, por entidad y no nacional | Ver `docs/n8n/denue-padron.md` |
| **Lookalikes** *(empresas o contactos parecidos)* | Descartada en fase previa: amplía el universo **sin criterio de valor**, y este método ya tiene un filtro de valor explícito en §5 | No mientras el padrón siga sin agotarse |
| **Google Places** | **No hay llave y no la va a haber por ahora.** Hueco declarado, **nunca simulado ni sustituido en silencio** | Sí, si aparece llave |
| **SMTP directo para validar correo** | El **catch-all de Microsoft 365** contesta que sí a todo, incluso a buzones inventados. Un `250 OK` no prueba nada | No. Se valida buscando el correo exacto entre comillas |

> **La regla que gobierna esta tabla:** una fuente sale de aquí **sólo con una
> medición nueva**, no con una corazonada. Y si una entra, entra con la razón
> escrita el mismo día — no después.
