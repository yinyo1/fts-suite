# Flujo C del #294 · autorizar un beneficiario de comisión

Tres workflows. **El primero ya existe en n8n; los otros dos están aquí como JSON
para importarlos de un clic.** Los tres nacen INACTIVOS y ninguno corre hasta que
alguien los encienda a mano.

| # | workflow | dónde está | qué hace |
|---|---|---|---|
| 1 | `comercial/comision-barrido` | **en n8n**, id `RErA08GwRPbPuPUC`, 9 nodos, `active:false` | Lo que pasa si nadie aprueba. |
| 2 | `comercial/comision-pedir` | `comercial-comision-pedir.json` (17 nodos) | Crea la solicitud y manda el correo. |
| 3 | `comercial/comision-liga` | `comercial-comision-liga.json` (17 nodos) | La liga que se abre: GET pinta, POST decide. |

## Por qué dos están en JSON y no en n8n

Pesan 36 y 47 KB. La herramienta que crea workflows desde código los pide como
**parámetro**, o sea que habría que teclearlos, y dentro va una implementación de
SHA-256 inline: un carácter alterado cambia todas las firmas y el fallo se ve como
«liga inválida», mandando a buscar el error donde no está. La regla de `CLAUDE.md`
§17 quirk 3 es explícita — *«modificar el JSON PROGRAMÁTICAMENTE, nunca
transcribiendo»*. La otra vía, el API público con `X-N8N-API-KEY`, exige leer la
llave, y esta sesión no tiene permiso para eso (y está bien que no lo tenga).

Así que el JSON se emitió con un generador y **no pasó por ningún teclado**.
Importarlo desde la interfaz es el mismo camino que se usó para el A1 del §17.

## Cómo importarlos

1. n8n → **Import from File** → el `.json`.
2. Confirmar que quedó **INACTIVO**.
3. Revisar que las credenciales siguen asignadas (`fts-suite-db · comercial_app`
   y `Microsoft Graph - sales`). El bug de `customResource` en blanco tras
   importar **no aplica**: ninguno de los dos trae nodos de Odoo.
4. **No encenderlos** hasta aplicar la migración `010`.

## Antes de encender: la migración 010

`db/migrations/comercial/010_comision_beneficiario.sql` crea
`comercial.comision_beneficiario` y `comercial.comision_aprobacion`. **No está
aplicada.** Sin ella los tres workflows truenan en su primera consulta. Aplicarla
y encenderlos son un solo paso, y lo hace Esteban.

## Lo que hay que saber antes de tocarlos

**La liga aprueba un renglón de catálogo. No aprueba un pago.** Ningún peso se
mueve por esto, y por eso la liga puede viajar por correo sin ser una llave del
banco. El correo lo dice con esas palabras, arriba, antes del botón.

**El GET no aprueba nada.** Outlook Safe Links y los antivirus de correo abren las
ligas de un mensaje sin que nadie las toque: una aprobación por GET quedaría
aprobada antes de que el autorizador vea el correo. Lo que aprueba es **el botón**.

**Dos candados independientes.** La FIRMA (HMAC con una llave derivada de
`SUITE_JWT_SECRET` con la etiqueta `fts-comision-aprobar-v1`) prueba que la liga
la emitimos nosotros; la HUELLA (`sha256` del token, lo único que se guarda)
prueba que es LA liga de esa solicitud y que no se ha usado. De la base no se saca
el token.

**`MODO_PRUEBA` está ENCENDIDO en los tres.** Todo el correo sale a `sales@fts.mx`
y a nadie más; el destinatario de verdad se calcula igual y viaja en la respuesta
para poder ver a dónde habría ido. Se apaga cambiando una línea, que está marcada.

**Límite conocido, y no lo arregla la criptografía.** El token ES la credencial:
una liga reenviada la usa quien la reciba. Atarla a una persona exige que esa
persona tenga sesión en la suite y que la página pida ese login — está al backlog.
Lo que sí queda es rastro: IP y navegador de quien la abrió.

## Qué se probó, y qué no

**Probado (56 aserciones, 0 fallos):** que el que firma y el que verifica se
entienden byte por byte; que cambiar un carácter de la firma la tumba; que otra
llave no la verifica; que la llave derivada no es el secreto de las sesiones
(comprobado contra el `crypto` de Node, no contra sí misma); las seis pantallas de
la liga; que un contador de cero filas NO se lee como éxito; que el nombre del
beneficiario se escapa y no hay inyección; que el token no queda escrito en el
HTML; y que un fallo de red no se pinta como «se guardó».

**NO probado:** el workflow corriendo. Están inactivos y la base no tiene las
tablas, así que lo que se probó son los cuerpos de los nodos, no el flujo. Se dice
porque son dos afirmaciones distintas.

La mitad externa —la credencial de Graph, el `sendMail`, la plantilla— **sí** se
probó en vivo, en un workflow TMP aparte (`CnbCCRPF2Jdc1bB2`), con un `202` de
Graph y el correo a `sales@fts.mx`. También ahí: se probó AHÍ, no en el flujo real.
