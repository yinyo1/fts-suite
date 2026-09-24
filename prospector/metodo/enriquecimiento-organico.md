# Enriquecimiento orgánico — hoja de ruta

> **Esto es diseño, no código.** Nada de lo que sigue está construido. Es el
> plan para las sesiones que vienen, una vez cerrado el orquestador.
> Fecha de redacción: 2026-09-18.

---

## Principio rector

**Lo que la empresa publicó a propósito, sí. Lo que se le escapó por descuido, no.**

Una ficha técnica colgada en el sitio, un portal de proveedores, un directorio de
planta, un certificado FSSC 22000 en PDF: eso se publicó para que alguien lo
leyera. Un log de Sentry, un `.env` filtrado, un grafo de commits: eso se escapó.
La línea no es legal nada más — es la que separa una herramienta que se puede
enseñar en una junta de una que no.

## El diseño entero es una red de validación cruzada

**Ninguna fuente produce un dato verificado por sí sola.** Un dato sube a
`verificado` únicamente cuando **dos fuentes de raíz distinta** coinciden.

- Odoo y Outlook comparten raíz (`fts_interno`): **no se confirman entre ellas**.
  Que un correo esté en el CRM y también en la bandeja no es confirmación, es el
  mismo dato contado dos veces.
- El buscador público y el sitio de la empresa son raíces distintas
  (`web_abierta` vs. el dominio mismo): **sí se confirman**.

**Contradicción es bandera, nunca elección silenciosa.** Si dos fuentes discrepan,
el campo queda `contradicho` con las dos versiones y su procedencia. El sistema no
vota, no promedia y no se queda con la más reciente: levanta la mano.

Por eso cada técnica de abajo declara **qué valida** y **quién la valida**. Una
técnica que no puede ser validada por nadie no produce `verificado` jamás; produce
`supuesto`, y se queda ahí.

---

## Técnicas, en orden de prioridad

### a) Metadatos de PDF

Localiza los PDFs de un dominio —políticas de calidad, fichas técnicas,
certificados FSSC 22000, catálogos, cartas de producto—, los baja ligero y extrae
metadatos y texto.

| | |
|---|---|
| **Qué entrega** | Autor real del documento. Y cuando el PDF conserva la ruta local `C:\Users\nombre.apellido\…`, **confirma el patrón de usuario corporativo sin deducirlo**. |
| **Qué NO entrega** | Correo directo. Da el patrón y el nombre, no la dirección. |
| **A quién valida** | El **patrón de correo**. Es la única técnica del set que lo contrasta contra la realidad en vez de inferirlo de tres ejemplos. |
| **Quién la valida** | El buscador público (paso b) y los manuales de proveedores (paso c). |
| **Límite honesto** | Muchos PDFs corporativos pasan por un limpiador de metadatos o se exportan desde InDesign/Canva, y ahí el autor es la agencia, no la empresa. La tasa de PDFs con metadatos útiles hay que **medirla**, no suponerla. Y un autor de 2019 puede haber dejado la empresa. |

Va primero porque es la que desbloquea a todas las demás: con el patrón
confirmado, el paso d deja de adivinar.

### b) Buscador público dirigido

Consulta del tipo `site:linkedin.com/in/ "<empresa>" "<puesto>"` contra la **API
oficial de Google o Bing**, **NUNCA contra los servidores de LinkedIn**.

| | |
|---|---|
| **Qué entrega** | Nombre y puesto del snippet indexado. |
| **Qué NO entrega** | Correo. Ni uno. |
| **A quién valida** | Nombres que otras fuentes trajeron sueltos (un autor de PDF, un firmante de correo viejo, un nombre en un directorio). |
| **Quién la valida** | El sitio de la empresa y los metadatos de PDF. |
| **Límite honesto** | El índice del buscador va atrasado respecto a LinkedIn: un puesto puede llevar meses obsoleto. Y las API oficiales tienen cuota y costo por consulta. |

> **Nota explícita, para que nadie la confunda:** esto **NO** es el dork con
> proxies rotativos que descartamos. Usa API oficial, paga su cuota, se identifica
> y **no evade nada**. Ninguna cuenta de LinkedIn navega, así que la cláusula
> anti-scraping de LinkedIn no aplica. La diferencia no es de grado, es de
> naturaleza: una consulta a un índice público no es un acceso a los servidores
> del sitio indexado.

### c) Manuales de proveedores y facturación

Detecta rutas `/proveedores`, `/facturacion`, `/suppliers`, `/portal-proveedores`
y parsea el contacto de **compras** y **tesorería**, con nombre y correo directo.

| | |
|---|---|
| **Qué entrega** | Nombre y **correo directo**, publicado a propósito. La empresa quiere que sus proveedores escriban ahí. |
| **Qué NO entrega** | Al comprador técnico ni al de mantenimiento. Da la puerta administrativa, no la operativa. |
| **A quién valida** | El **dominio** y el **patrón de correo** — con nombre y dirección del mismo individuo, el patrón se confirma solo. |
| **Quién la valida** | Los metadatos de PDF y el buscador. |
| **Límite honesto** | Muchos portales dan un buzón genérico (`proveedores@`), que sirve para el alta pero no nombra a nadie. |

**Doble uso para FTS:** el manual de proveedores sirve para **vender** (cómo darse
de alta, qué documentos piden, qué plazo de pago manejan) y el contacto de
tesorería sirve para **cobrar**. Es la única técnica del set que alimenta las dos
mitades del negocio.

### d) Validación SMTP

Con nombre y dominio, genera candidatos (`nombre.apellido`, `n.apellido`,
`inicial+apellido`, `nombre_apellido`) y verifica la existencia de la bandeja con
`RCPT TO` **sin enviar el mensaje**.

| | |
|---|---|
| **Qué entrega** | Sube un correo de `candidato` a `verificado`. |
| **Qué NO entrega** | Nombres ni puestos: necesita que otra técnica se los dé. |
| **A quién valida** | El correo mismo, que es el dato que la llave operativa necesita. |
| **Quién la habilita** | DNS (paso f): sin saber quién hospeda el buzón, el sondeo es a ciegas. |
| **Límite honesto — obligatorio declararlo** | **Microsoft 365 suele responder catch-all**: dice que sí a todo, incluso a buzones inventados. También penaliza el sondeo repetido desde una misma IP. Hay que **medir la tasa real de discriminación** antes de confiar en un solo resultado, y **con catch-all detectado el dato se queda en `candidato`**, no sube. Un `250 OK` de un servidor catch-all no es evidencia de nada. |

La prueba de que la técnica es honesta es que su caso más común —Microsoft 365—
es justo en el que **no** produce dato. Si la implementación no detecta catch-all
antes de concluir, no sirve: miente en la dirección cómoda.

### e) Portales satélite vía certificados SSL (crt.sh)

Los certificados emitidos para un dominio son un registro público. `crt.sh` los
lista, y ahí aparecen subdominios que el sitio principal no enlaza:
`proveedores.`, `empleos.`, `portal.`, `rh.`

| | |
|---|---|
| **Qué entrega** | Subdominios con formularios limpios, donde el sitio principal es un muro de marketing sin un solo nombre. |
| **Qué NO entrega** | **Contactos. Ninguno.** No es una fuente de datos. |
| **Para qué sirve** | Le dice a los pasos **a** y **c** dónde buscar. Es un mapa, no un dato. |
| **Límite honesto** | Un subdominio en un certificado puede estar muerto, ser interno o no resolver desde fuera. Hay que probar cada uno. |

### f) DNS, SPF, DMARC

| | |
|---|---|
| **Qué entrega** | Si el dominio usa Microsoft 365, Google Workspace u otro; y qué terceros están autorizados a enviar en su nombre (el SPF delata al ERP, al facturador, al servicio de nómina, al de marketing). |
| **Qué NO entrega** | **Contactos. Ninguno.** |
| **Para qué sirve** | Habilita el juicio del paso **d** —saber que es Microsoft 365 es saber que hay que buscar catch-all antes de creerle— y da **señal de infraestructura**: el SPF de una planta dice qué software compró. |
| **Límite honesto** | Apoyo, nunca conclusión. |

### g) Vacantes espejo y directorios locales

La vacante anónima de LinkedIn ("importante empresa del sector alimentos") suele
aparecer con nombre y apellido en una **bolsa universitaria** o un **portal local
de empleo**, donde nadie se molestó en anonimizarla. Y los directorios locales dan
al **gerente de planta de sucursal**, que rara vez aparece en el sitio corporativo.

| | |
|---|---|
| **Qué entrega** | El jefe de área que publica la vacante; el gerente de una planta específica. |
| **Qué NO entrega** | Cobertura pareja: depende de que alguien haya publicado. |
| **A quién valida** | Nombres y puestos de los pasos b y c. |
| **Límite honesto** | **Envejece.** Una vacante de hace ocho meses ya se cubrió y el que la publicó pudo cambiar de puesto. Es refuerzo, no cimiento. |

### Al final, solo apoyo: Whois de ASN

| | |
|---|---|
| **Límite honesto** | **Muchas plantas no tienen ASN propio** —salen por el enlace de un proveedor— y cuando lo tienen, el contacto registrado es el **administrador de IT**, no el comprador. Da un nombre real y a la persona equivocada. |

Se queda al final de la lista a propósito. No se quita porque de vez en cuando
confirma la razón social operativa, pero no se prioriza.

---

## Descartadas, con su razón — para que nadie las reviva

| Técnica | Por qué se descarta |
|---|---|
| **GitHub, NPM, PyPI, grafos de commits** | El comprador industrial **no es desarrollador**. Encuentra al de sistemas, si acaso, y ése no firma la orden de compra de un tratamiento de agua. Costo alto, dato irrelevante. |
| **Sentry y logs de error expuestos** | **Explotan el descuido**, no lo publicado. Y además dan perfiles de IT: viola el principio rector *y* trae a la persona equivocada. |
| **Keyservers PGP** | Una planta de alimentos **no cifra el correo de mantenimiento**. El universo de coincidencias es esencialmente cero. |
| **Dorks con proxies rotativos; scraping de LinkedIn con cuenta** | Pone en riesgo la **cuenta de Sales Navigator de Rissia**, que es *el activo que toda esta herramienta existe para proteger*. Gastar el activo para enriquecer un registro es un mal cambio a cualquier precio. |
| **Archivos de configuración filtrados** | Cruzan la línea de lo publicado a propósito, sin matiz. |
| **API oficial SNAP de LinkedIn** | **Cerrada a nuevos socios.** Y aunque abriera, sus términos **prohíben la prospección**. Pagar más asientos de Sales Navigator **no la desbloquea**: son productos distintos. |

---

## Orden de ataque para las siguientes sesiones

El orden no es el de prioridad de valor, sino el de **dependencia**: primero lo
que habilita, luego lo que produce.

| # | Sesión | Técnica | Por qué en este punto |
|---|---|---|---|
| 1 | Mapa | **f** DNS/SPF/DMARC + **e** crt.sh | Baratas, rápidas, sin cuota. Dicen dónde buscar y qué esperar. Se corren sobre los 112 dominios del padrón de una sentada. |
| 2 | Patrón | **a** metadatos de PDF | Desbloquea a d. Sin esto, d adivina. |
| 3 | Puerta administrativa | **c** proveedores y facturación | Correos directos publicados a propósito; confirma el patrón de a con un caso nombre+dirección. |
| 4 | Nombres | **b** buscador público dirigido | Ya con patrón confirmado, un nombre vale un correo. |
| 5 | Cierre | **d** validación SMTP | Último porque es el único que **gasta reputación de IP**. Se corre cuando ya hay candidatos buenos, no para explorar. |
| 6 | Relleno | **g** vacantes y directorios | Para los huecos que dejaron 1–5. |
| — | — | Whois de ASN | Solo cuando un dominio no dio nada por ningún otro camino. |

### Dónde vive cada técnica: Claude Code o n8n

Según lo ya medido del proxy de egress (`docs/prospectar/fuentes-de-senal.md`,
2026-09-18): desde esta sesión **solo pasa `WebSearch`**; **`WebFetch` está
bloqueado sin excepción** —se probó contra seis dominios y las seis devolvieron
`EGRESS_BLOCKED`—. n8n desde Railway sí alcanza sitios externos con `GET`
(5 de 11 fuentes probadas respondieron 200 con contenido útil).

| Técnica | Dónde corre | Por qué |
|---|---|---|
| **a** Metadatos de PDF | **n8n** | Hay que **bajar el archivo**. `WebFetch` bloqueado aquí; n8n baja binarios sin problema (ya baja los ZIP del DENUE). |
| **b** Buscador público dirigido | **n8n** (API oficial) · `WebSearch` desde Claude Code como sondeo | La API de Google/Bing es una llamada HTTP con llave: va por n8n, que además guarda la cuota. `WebSearch` sirve para tantear una empresa a mano, pero no es la API y no se puede parametrizar con `site:` de forma confiable. |
| **c** Manuales de proveedores | **n8n** | Hay que **leer el HTML** de la ruta. Eso es exactamente lo que `WebFetch` no puede hacer desde aquí. |
| **d** Validación SMTP | **n8n** | No es HTTP. Necesita abrir un socket al puerto 25/587 del MX. El proxy de egress de esta sesión es HTTPS; no hay camino. Y la reputación de IP que se arriesga es la de Railway, que hay que decidir aparte. |
| **e** crt.sh | **n8n** | `crt.sh` tiene API JSON y parecía candidata a correrse aquí. **Medido el 18-sep: no pasa.** El proxy responde `CONNECT tunnel failed, 403`. Va por n8n como todas. |
| **f** DNS/SPF/DMARC | **n8n** | Consultas DNS, no HTTP. La salida elegante era DNS-over-HTTPS —sí es HTTPS y sí pasaría un proxy normal—. **Medido el 18-sep: tampoco pasa.** `cloudflare-dns.com` da `CONNECT tunnel failed, 403` y `dns.google` ni conecta. |
| **g** Vacantes y directorios | **n8n** | Lectura de HTML. Computrabajo ya respondió **200** desde n8n en la medición del 18-sep; **OCC devolvió 403** y ésa no se raspa: se busca. |
| Whois de ASN | **n8n** | Protocolo whois (puerto 43), no HTTP. |

**El reparto se repite:** Claude Code descubre y decide; n8n recorre y lee. No es
preferencia de diseño, es lo único que la política de egress permite.

### Las dos mediciones que faltaban, hechas

Antes de cerrar el documento quedaban dos preguntas abiertas: si `crt.sh` o el
DNS-over-HTTPS podían resolverse desde Claude Code y ahorrarse el workflow.
**Se midieron el 2026-09-18 y la respuesta es no en los dos casos.**

| Prueba | Resultado |
|---|---|
| `https://crt.sh/?q=…&output=json` | `CONNECT tunnel failed, response 403` |
| `https://cloudflare-dns.com/dns-query` (DoH) | `CONNECT tunnel failed, response 403` |
| `https://dns.google/resolve?…` | no conecta |
| Control: `https://api.github.com/zen` | también **403** |

El control importa: el proxy no está bloqueando *estas* fuentes en particular,
está bloqueando **todo lo que no está en su lista**, incluido GitHub, al que esta
sesión sí llega pero por las herramientas MCP, no por HTTP directo.

**Conclusión: las siete técnicas pasan por n8n. Ninguna se resuelve desde aquí.**
Eso no cambia el diseño, pero sí el calendario: cada técnica necesita su workflow
antes de producir su primer dato, y eso hay que presupuestarlo por sesión.

Se midió antes de diseñar el workflow, no después — misma regla que rigió la
fase 1 del padrón.
