// ═══ Arma el manual de Nómina · Incidencias en UN solo archivo HTML ═══
//
// Las imágenes van incrustadas en base64 a propósito: el manual se manda por correo
// y un HTML con una carpeta de imágenes al lado se rompe en cuanto alguien lo reenvía.
//
//   node scripts/capturas-nomina.js      # primero las fotos
//   node scripts/manual-nomina.js        # luego el manual

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/manual-nomina';
const SALIDA = path.join(RAIZ, 'docs', 'rh', 'manual-nomina-incidencias.html');
const VER = JSON.parse(fs.readFileSync(path.join(RAIZ, 'modulos/rh/nomina-incidencias/version.json'), 'utf8'));

function img(nombre, pie) {
  const f = path.join(SHOTS, nombre + '.jpg');
  if (!fs.existsSync(f)) throw new Error('falta la captura ' + nombre + '.jpg — corre scripts/capturas-nomina.js');
  const b64 = fs.readFileSync(f).toString('base64');
  return '<figure><img alt="' + pie.replace(/"/g, '&quot;') + '" src="data:image/jpeg;base64,' + b64 + '">' +
         '<figcaption>' + pie + '</figcaption></figure>';
}

const HOY = new Date().toISOString().slice(0, 10);

const CUERPO = `
<header>
  <div class="marca">Servicios FTS</div>
  <h1>Nómina · Incidencias</h1>
  <p class="bajada">Manual de uso. Cómo capturar la semana de nómina, de principio a fin.</p>
  <p class="meta">Módulo ${VER.version} · manual del ${HOY} · Recursos Humanos</p>
</header>

<nav class="indice">
  <b>En esta guía</b>
  <ol>
    <li><a href="#para-que">Para qué existe esta pantalla</a></li>
    <li><a href="#entrar">Entrar</a></li>
    <li><a href="#insignias">Las dos insignias de arriba (léelas siempre)</a></li>
    <li><a href="#semana">La semana va de viernes a jueves</a></li>
    <li><a href="#lista">Cómo se lee la lista</a></li>
    <li><a href="#capturar">Capturar a una persona</a></li>
    <li><a href="#catalogo">Qué se puede declarar</a></li>
    <li><a href="#ejemplos">Tres semanas de ejemplo, paso a paso</a></li>
    <li><a href="#ppa">El premio de puntualidad</a></li>
    <li><a href="#disputas">Checadas en disputa</a></li>
    <li><a href="#cerrar">Cerrar y enviar</a></li>
    <li><a href="#mal">Cuando algo sale mal</a></li>
    <li><a href="#no-hace">Lo que este módulo NO hace</a></li>
  </ol>
</nav>

<section id="para-que">
  <h2>1 · Para qué existe esta pantalla</h2>
  <p>Antes, armar la semana de nómina significaba juntar información de tres lugares distintos:
  las checadas del kiosko, lo que cada supervisor reportaba por mensaje, y una libreta con
  los bonos y los descuentos. Lo que faltaba se descubría tarde — a veces hasta la carga de
  mano de obra, una semana después.</p>
  <p>Esta pantalla junta las tres cosas en una sola lista y te dice, <b>mientras capturas</b>,
  qué le falta a quién. La idea no es que llenes formularios: es que llegues al viernes
  sabiendo que la semana está completa, en vez de descubrir el lunes que no lo estaba.</p>
  <p class="nota">Todo lo que veas aquí sale de Odoo en el momento en que abres la página.
  Nadie tiene que pasarte una lista.</p>
</section>

<section id="entrar">
  <h2>2 · Entrar</h2>
  ${img('01-entrar', 'La pantalla de entrada')}
  <p>Tu usuario es tu nombre y apellido separados por un punto, en minúsculas:
  <code>magaly.perez</code>. La contraseña te la dio Esteban.</p>
  <p>Si dice <b>«Usuario o contraseña incorrectos»</b>, revisa que no haya quedado un espacio
  al final. Después de cinco intentos fallidos la cuenta se bloquea quince minutos — el
  mensaje te dice cuántos faltan.</p>
  <p class="nota">La sesión dura ocho horas. Si te tardas más, te vuelve a pedir la contraseña
  y no pierdes nada de lo que ya guardaste.</p>
</section>

<section id="insignias">
  <h2>3 · Las dos insignias de arriba</h2>
  ${img('03-barra', 'La barra superior')}
  <p>Antes de teclear nada, mira la barra verde de arriba. Hay dos etiquetas y las dos importan.</p>
  <h3>La versión</h3>
  <p>La primera dice la versión del módulo (<code>${VER.version}</code>). Sirve para una sola cosa:
  si algo se ve raro y lo reportas, di qué versión traías. Así se sabe si ya estás viendo el
  arreglo o todavía no.</p>
  <h3>El modo — esta es la importante</h3>
  <p>La segunda dice <b>REAL</b> o <b>PRÁCTICA</b>, y cambia de color:</p>
  <ul>
    <li><span class="chip real">REAL</span> — verde. Los datos son los de Odoo y
    <b>lo que captures se guarda de verdad</b>. Es el modo normal.</li>
    <li><span class="chip demo">PRÁCTICA</span> — ámbar. Los datos son de ejemplo y
    <b>nada de lo que hagas se guarda</b>. Sirve para aprender sin miedo a romper algo.</li>
  </ul>
  <p>Se cambia dando clic en la propia etiqueta. Te pregunta antes y recarga la página.</p>
  <p class="aviso"><b>Las capturas de este manual son del modo PRÁCTICA</b> —por eso la
  etiqueta sale ámbar y los nombres traen datos de ejemplo. En REAL la pantalla es idéntica.</p>
</section>

<section id="semana">
  <h2>4 · La semana va de viernes a jueves</h2>
  <p>La semana de nómina de FTS no es de lunes a domingo: <b>empieza el viernes y cierra el
  jueves</b>. Es la misma que usa CONTPAQi y la misma con la que se cargó la mano de obra a
  los proyectos, así que no es una decisión de esta pantalla — es la del negocio.</p>
  <p>Arriba a la izquierda siempre dice cuál semana estás capturando y con qué fechas.
  Los días que se esperan son <b>cinco</b>: el viernes más lunes a jueves. Sábado y domingo
  no cuentan.</p>
</section>

<section id="lista">
  <h2>5 · Cómo se lee la lista</h2>
  ${img('02-roster', 'La lista completa de la semana')}
  <p>Cada renglón es una persona. La barra de color de la izquierda dice cómo va:</p>
  <ul>
    <li><b>Verde</b> — no le falta nada.</li>
    <li><b>Rojo</b> — algo le falta. El renglón te dice qué.</li>
    <li><b>Gris</b> — no tiene nada declarado y tampoco le falta nada.</li>
  </ul>
  ${img('06-tabla', 'Los renglones, con su barra de color')}
  <h3>El aviso de arriba</h3>
  ${img('04-banner', 'El aviso que resume lo que falta')}
  <p>Resume todo lo que impide enviar la semana, <b>con nombre y motivo</b>. No dice
  «hay errores»: dice quién y qué. Mientras ese aviso esté en rojo, el botón de enviar
  está apagado.</p>
  <h3>Los filtros</h3>
  ${img('05-filtros', 'Los filtros')}
  <p>Sirven para no leer treinta renglones cuando sólo te interesan cuatro. El más útil es
  el de pendientes: te deja únicamente los que algo les falta.</p>
</section>

<section id="capturar">
  <h2>6 · Capturar a una persona</h2>
  <p>Da clic en cualquier renglón. Se abre un cajón por la derecha.</p>
  ${img('07-cajon', 'El cajón de captura')}

  <h3>El candado aritmético</h3>
  ${img('08-candado', 'El candado, con lo que registró el kiosko')}
  <p>Es la parte de arriba y es el corazón de la captura. Los días de la persona tienen que
  sumar exactamente cinco, repartidos entre lo que trabajó en México, lo que trabajó en
  Estados Unidos, sus vacaciones y sus faltas o permisos.</p>
  <p><b>Sólo tecleas el primer número</b>, los días trabajados en México. Los demás se van
  calculando solos conforme declaras. La suma de abajo se pinta en verde cuando cuadra y en
  rojo cuando no — y se actualiza mientras escribes.</p>
  <p class="nota"><b>La línea gris debajo del campo dice cuántos días registró el kiosko.</b>
  No es la respuesta, es un apoyo: tú decides el número, pero lo decides viendo las checadas.
  Cuando no coincidan, casi siempre hay una razón —alguien olvidó checar, o estuvo en obra sin
  kiosko— y esa razón es justo lo que hay que declarar.</p>

  <h3>Agregar una declaración</h3>
  ${img('09-nueva-declaracion', 'Primero se elige el tipo')}
  <p>Con el botón <b>+ Agregar declaración</b>. Primero eliges el tipo, y la pantalla te pide
  sólo lo que ese tipo necesita: un bono pide monto y proyecto, unas vacaciones piden días.
  No te va a pedir campos que no aplican.</p>

  <h3>Un ejemplo que conviene entender: el anticipo</h3>
  ${img('10-anticipo', 'El anticipo avisa que es préstamo, no costo')}
  <p>Cuando eliges <b>Anticipo de sueldo</b>, la pantalla te avisa que eso es un
  <b>préstamo, no un costo del proyecto</b>. Es dinero que la empresa paga y que va a
  recuperar en semanas siguientes, así que no entra al reparto de mano de obra.</p>
  <p>Es la clase de distinción que antes se perdía: el dinero salía, se registraba como
  gasto, y el proyecto cargaba con un costo que nunca fue suyo.</p>

  <h3>Estados: lo que dura más de una semana</h3>
  ${img('11-estado', 'Alguien de baja que todavía arrastra una deuda')}
  <p>Abajo del cajón está <b>Estado de la persona</b>. Ahí van las cosas que <b>no</b> se
  vuelven a declarar cada semana: una deuda con la empresa, una baja, una incapacidad larga.</p>
  <p>Se declaran <b>una vez</b> y siguen apareciendo solas hasta que las cierres. Por eso en la
  lista aparecen también personas que ya no trabajan aquí: si alguien se fue debiendo dinero,
  tiene que seguir a la vista hasta que termine de pagar.</p>

  <h3>Guardar</h3>
  <p><b>No hay botón de guardar.</b> Se guarda al cerrar el cajón, con el botón
  <b>Listo</b> o con la ✕. Arriba a la derecha verás «Guardando…» y luego «Guardado».</p>
  <p class="aviso"><b>Si dice «NO se guardó», no se guardó.</b> La pantalla nunca te va a decir
  que quedó algo que no quedó — vuelve a intentar, y si sigue fallando avisa antes de seguir
  capturando.</p>
</section>

<section id="catalogo">
  <h2>7 · Qué se puede declarar</h2>
  <p>El catálogo está partido en cuatro grupos, y la partición no es cosmética: cada grupo se
  paga por una vía distinta.</p>
  <table>
    <tr><th>Grupo</th><th>Qué va aquí</th><th>Qué hace con los días</th></tr>
    <tr><td><b>Días</b></td><td>Vacaciones, festivos, faltas, permisos, incapacidad, trabajo en Estados Unidos</td><td>Consume días de la semana</td></tr>
    <tr><td><b>Dinero a favor</b></td><td>Bonos, tiempo extra, prima vacacional, aguinaldo, anticipos</td><td>No consume días</td></tr>
    <tr><td><b>Descuentos</b></td><td>Préstamos, INFONAVIT, pensión, faltantes de herramienta</td><td>No consume días</td></tr>
    <tr><td><b>Estado</b></td><td>Deuda, baja, incapacidad larga, suspensión</td><td>Dura varias semanas</td></tr>
  </table>
  <h3>Los tres bonos no son lo mismo</h3>
  <table>
    <tr><th>Tipo</th><th>Quién lo decide</th><th>¿Pide proyecto?</th></tr>
    <tr><td><b>Bono de proyecto</b></td><td>Operaciones (Felipe)</td><td><b>Sí.</b> Carga a la obra, es costo del proyecto</td></tr>
    <tr><td><b>Bono de productividad</b></td><td>RH</td><td>No. Es de nómina</td></tr>
    <tr><td><b>Bono condicionado</b></td><td>RH</td><td>No. Es como un aumento condicionado, fuera del salario diario</td></tr>
  </table>
  <p class="nota">Si el bono no corresponde a una obra concreta, <b>no es bono de proyecto</b>.
  Antes había que inventarle un proyecto o dejar el renglón en rojo; ahora tiene su propio tipo.</p>

  <p>Cuando algo lleva dinero, la pantalla te pide la <b>fuente de pago</b> —de qué cuenta
  sale— y de ahí deriva sola la empresa y la moneda. Si eliges una cuenta de Chase, te va a
  decir FTS LLC y dólares sin que tú lo teclees.</p>
</section>

<section id="ejemplos">
  <h2>8 · Tres semanas de ejemplo, paso a paso</h2>

  <div class="caso">
    <h3>Caso 1 · Alguien que trabajó normal</h3>
    <p>Nada que hacer. El renglón sale verde con 5/5 y sin declaraciones. <b>No lo abras.</b>
    La mayoría de la lista va a estar así, y ese es el punto: tu trabajo son las excepciones.</p>
  </div>

  <div class="caso">
    <h3>Caso 2 · Tomó dos días de vacaciones</h3>
    <ol>
      <li>Clic en su renglón.</li>
      <li>En «Días trabajados en México» pon <b>3</b>.</li>
      <li><b>+ Agregar declaración</b> → tipo <b>Vacaciones</b> → <b>2</b> días → Agregar.</li>
      <li>El candado ahora dice 3 + 2 = <b>5/5</b> en verde.</li>
      <li><b>Listo</b>. Espera a que diga «Guardado».</li>
    </ol>
    <p class="nota">Si pusiste 3 días pero no declaraste las vacaciones, el renglón se queda
    rojo diciendo «los días no suman 5: van 3». Eso es correcto — faltan dos días de explicar.</p>
  </div>

  <div class="caso">
    <h3>Caso 3 · Le toca un bono de proyecto</h3>
    <ol>
      <li>Clic en su renglón. Los días quedan en 5.</li>
      <li><b>+ Agregar declaración</b> → <b>Bono de proyecto</b>.</li>
      <li>Monto, y el <b>proyecto</b>: es un campo con buscador, escribe el número de SO
      o parte del nombre del cliente y se va filtrando. Están los de México y los de
      Estados Unidos.</li>
      <li>Elige la fuente de pago. La empresa y la moneda salen solas.</li>
      <li>Agregar → <b>Listo</b>.</li>
    </ol>
    <p class="aviso"><b>El proyecto no es opcional.</b> Un bono sin proyecto deja el renglón en
    rojo, porque ese dinero tiene que cargarse a una obra. Si de verdad no corresponde a
    ninguna, va como <b>gratificación</b>, que es otro tipo y no pide proyecto. Son cosas
    distintas y conviene no mezclarlas.</p>
  </div>
</section>

<section id="ppa">
  <h2>9 · El premio de puntualidad</h2>
  <p>La última columna de la lista dice si a cada persona le toca el <b>Premio de
  Puntualidad y Asistencia</b>. <b>El sistema lo sugiere; tú decides.</b></p>
  <table>
    <tr><th>Lo que ves</th><th>Qué significa</th></tr>
    <tr><td><span class="chip real">✓ sí</span> con borde punteado</td><td>El sistema lo sugiere. <b>Nadie lo ha decidido.</b></td></tr>
    <tr><td><span class="chip real">✓ sí</span> con borde sólido</td><td>Una persona lo decidió. Gana sobre la sugerencia.</td></tr>
    <tr><td>✗ no</td><td>Llegó tarde algún día. Abre el renglón para ver cuál.</td></tr>
    <tr><td>no aplica</td><td>Su ficha en Odoo dice que no le corresponde.</td></tr>
    <tr><td>revisar</td><td>Hay algo raro que conviene que mires. Casi siempre, un turno de noche.</td></tr>
  </table>
  <h3>Cómo se cambia</h3>
  <p>Da clic en la propia palomita, sin abrir el renglón. Se abre una ventanita con
  <b>la evidencia a la vista</b> y un campo donde tienes que escribir <b>por qué</b>
  lo estás cambiando.</p>
  <p class="aviso"><b>La nota es obligatoria.</b> Sin ella no se guarda — y no es un
  capricho de la pantalla: el servidor también la exige. Cuando alguien reclame su
  premio dentro de tres semanas, esa nota va a ser lo único que quede.</p>
  <p>Escribe algo que se entienda solo: <i>«Felipe lo citó 08:00 el martes, no llegó
  tarde»</i> sirve; <i>«sí»</i> no. Después la nota aparece en el renglón al pasar el
  mouse y dentro del cajón, con tu nombre y la fecha.</p>
  <p>Si te arrepientes, el mismo botón tiene <b>Volver a la sugerencia</b>: deja que
  el sistema vuelva a mandar y borra tu nota, porque ya no explica nada.</p>
  <p><b>También puedes forzarlo</b> a alguien cuya ficha en Odoo dice que no le aplica.
  Es el mismo botón y pide la misma nota.</p>
  <p>Al abrir el renglón, el cajón te muestra <b>día por día</b> a qué hora entró y
  cuántos minutos antes o después de su horario, para que puedas discutirlo con quien
  reclame.</p>
  <p class="nota">Después de dar clic, el botón dice <b>«guardando…»</b> unos segundos
  mientras el servidor contesta. <b>No le vuelvas a dar</b> — se guarda solo, y ya no
  se deja pulsar dos veces.</p>
  <h3>Cómo decide</h3>
  <ul>
    <li>Compara la <b>primera</b> entrada de cada día contra la hora de entrada de su ficha en Odoo.</li>
    <li><b>Cinco minutos de tolerancia.</b> A las 7:05 sí; a las 7:06 no.</li>
    <li><b>Sábado y domingo no cuentan.</b> Si los citaron en fin de semana, eso es trabajo extraordinario, no impuntualidad.</li>
    <li>Una entrada <b>más de tres horas</b> después de su hora se lee como <b>otro turno</b>, no como retardo — quien trabaja de noche no puede perder el premio por eso. Cuando pasa, el renglón dice <b>revisar</b>.</li>
  </ul>
  <p class="aviso"><b>Lo que todavía NO hace:</b> comparar contra el plan de operaciones
  de Felipe. Hoy compara contra el horario base de la ficha. Si un día Felipe los citó
  más tarde entre semana, el sistema lo va a leer como retardo — por eso la decisión
  sigue siendo tuya y por eso el detalle está a la vista.</p>
</section>

<section id="disputas">
  <h2>10 · Checadas en disputa</h2>
  ${img('12-disputas', 'La pantalla de disputas')}
  <p>Son checadas del kiosko que quedaron marcadas porque algo no cuadró — normalmente alguien
  olvidó marcar su salida y el sistema la cerró solo.</p>
  <p>Cada una te muestra <b>la propuesta</b> (a qué proyecto se iría) y <b>la evidencia</b> en
  la que se basa.</p>
  <h3>Cómo se resuelve</h3>
  <p>Con el botón <b>Resolver esta checada</b> se abre <b>el mismo flujo de aprobación</b>
  que usan los supervisores desde Mi Perfil. No es una pantalla nueva ni un atajo: lo
  que decidas aquí es exactamente lo que se aplica en Odoo.</p>
  <table>
    <tr><th>Acción</th><th>Qué hace</th><th>¿Pide hora?</th></tr>
    <tr><td><b>✓ Aprobar</b></td><td>Da por buena la hora declarada</td><td><b>Sí.</b> Es la que se escribe en Odoo</td></tr>
    <tr><td><b>✎ Ajustar</b></td><td>La aprueba pero con OTRA hora</td><td><b>Sí</b>, siempre</td></tr>
    <tr><td><b>✕ Rechazar</b></td><td>No procede</td><td>No</td></tr>
    <tr><td><b>⬆ Escalar</b></td><td>La pasa a Dirección</td><td>No</td></tr>
  </table>
  <p class="aviso"><b>El comentario es obligatorio, mínimo 10 caracteres.</b> No es un
  trámite: es lo que va a leer quien revise esa checada después, y queda en el historial
  de la incidencia con tu nombre.</p>
  <p>Al confirmar, la pantalla vuelve a leer todo. Si la checada desaparece de la lista,
  es que el resolver ya limpió la marca en Odoo — no hace falta que hagas nada más.</p>
  <p class="nota"><b>No puedes resolver una checada tuya.</b> Si te toca la tuya, pídesela
  a la otra persona de RH o a Dirección.<br>
  Y si te dice que el folio no existe, es un <b>TAG huérfano</b> —una marca vieja en Odoo
  sin incidencia detrás—: ésa se limpia desde el panel de incidencias, no desde aquí.</p>
  <p class="aviso"><b>Una checada en disputa abierta bloquea a esa persona</b>, y por lo tanto
  bloquea el envío de la semana. Es a propósito: se resuelven aquí porque es el momento en que
  alguien puede resolverlas.</p>
  <h3>El aviso de checadas viejas</h3>
  <p>Si aparece un aviso con reloj de arena diciendo que hay checadas en disputa de semanas
  anteriores, <b>ésas no te bloquean</b> y no son tuyas de resolver desde aquí. Son un rezago
  que se limpia desde el panel de incidencias. Está a la vista para que no se olvide, no para
  que lo arregles hoy.</p>
</section>

<section id="cerrar">
  <h2>11 · Cerrar y enviar</h2>
  ${img('13-cierre', 'La pantalla de cierre')}
  <p>La pestaña <b>Cierre</b> te da el resumen de la semana: cuántas personas, cuántas con algo
  declarado, y el dinero partido en tres — lo que se paga, lo que se descuenta, y lo que es
  préstamo y por lo tanto no es costo.</p>
  <p>Cuando el aviso de arriba se pone en verde, el botón <b>Enviar a Nóminas FTS</b> se
  enciende. Al enviar, la semana queda marcada con tu nombre y la hora.</p>
  <p class="nota">Puedes enviar aunque falten días de la semana por transcurrir; lo que no
  puedes es enviar con algo pendiente. Y si te equivocaste, se vuelve a capturar y a enviar:
  la semana se sobreescribe, no se duplica.</p>
</section>

<section id="mal">
  <h2>12 · Cuando algo sale mal</h2>
  <table>
    <tr><th>Lo que ves</th><th>Qué pasó</th><th>Qué hacer</th></tr>
    <tr><td>«Usuario o contraseña incorrectos»</td><td>Alguno de los dos está mal, o hay un espacio de más</td><td>Vuelve a teclear. A los 5 intentos se bloquea 15 minutos.</td></tr>
    <tr><td>«Tu sesión expiró»</td><td>Pasaron más de 8 horas</td><td>Entra otra vez. Lo guardado está guardado.</td></tr>
    <tr><td>«NO se guardó …»</td><td>La escritura falló</td><td>Vuelve a cerrar el cajón. Si insiste, avisa <b>antes</b> de seguir capturando.</td></tr>
    <tr><td>«No se pudo cargar la semana»</td><td>No hubo respuesta del servidor</td><td>Recarga la página. Si sigue, avisa.</td></tr>
    <tr><td>La pantalla sale en blanco</td><td>El navegador tiene bloqueados los datos de sitio</td><td>No uses ventana privada. Si persiste, prueba en otro navegador.</td></tr>
    <tr><td>Un renglón sigue rojo y no sabes por qué</td><td>Ábrelo</td><td>El cajón dice el motivo exacto, y el aviso de arriba también.</td></tr>
  </table>
  <p class="aviso">Regla corta: <b>si la pantalla no te dijo «Guardado», no lo des por guardado.</b></p>
</section>

<section id="no-hace">
  <h2>13 · Lo que este módulo NO hace</h2>
  <ul>
    <li><b>No calcula sueldos.</b> Registra lo que pasó en la semana; el cálculo lo hace el despacho.</li>
    <li><b>No corrige checadas.</b> Para mover una hora de entrada o salida se usa el panel de incidencias.</li>
    <li><b>No da de alta ni de baja gente en Odoo.</b> El alta y la baja se hacen en Odoo; aquí sólo se refleja.</li>
    <li><b>No manda correos.</b> Enviar deja la semana marcada como enviada; no notifica a nadie todavía.</li>
  </ul>
</section>

<footer>
  <p>Módulo <b>${VER.version}</b> · manual generado el ${HOY}.</p>
  <p>Dudas de operación: Esteban. Si algo de la pantalla se comporta distinto a lo que dice
  este manual, es el manual el que está mal — repórtalo.</p>
</footer>
`;

const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manual · Nómina e Incidencias — FTS</title>
<style>
  :root { --tinta:#16281c; --suave:#5a6b60; --linea:#dde5e0; --verde:#0f5c2e; --papel:#fbfcfb; --caja:#fff; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--papel); color:var(--tinta);
         font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .hoja { max-width: 860px; margin: 0 auto; padding: 0 22px 80px; }
  header { padding: 46px 0 28px; border-bottom: 3px solid var(--verde); margin-bottom: 30px; }
  .marca { font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--verde); font-weight:700; }
  h1 { font-size: 36px; margin: 6px 0 4px; letter-spacing:-.02em; }
  .bajada { font-size: 18px; color: var(--suave); margin: 0 0 10px; }
  .meta { font-size: 13px; color: var(--suave); margin: 0; }
  nav.indice { background: var(--caja); border:1px solid var(--linea); border-radius:12px;
               padding: 18px 22px; margin-bottom: 40px; }
  nav.indice b { font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:var(--suave); }
  nav.indice ol { margin: 10px 0 0; padding-left: 20px; }
  nav.indice li { margin: 3px 0; }
  nav.indice a { color: var(--tinta); text-decoration: none; }
  nav.indice a:hover { color: var(--verde); text-decoration: underline; }
  section { margin-bottom: 52px; scroll-margin-top: 20px; }
  h2 { font-size: 25px; margin: 0 0 16px; padding-bottom: 8px; border-bottom:1px solid var(--linea); }
  h3 { font-size: 18px; margin: 26px 0 8px; color: var(--verde); }
  p { margin: 0 0 13px; }
  ul, ol { margin: 0 0 13px; padding-left: 24px; }
  li { margin: 5px 0; }
  code { background:#eef3ef; padding:1px 6px; border-radius:5px; font-size:14px;
         font-family: ui-monospace,SFMono-Regular,Menlo,monospace; }
  figure { margin: 18px 0 22px; }
  figure img { width:100%; display:block; border:1px solid var(--linea); border-radius:10px;
               box-shadow: 0 2px 14px rgba(0,0,0,.07); }
  figcaption { font-size:13px; color:var(--suave); margin-top:7px; text-align:center; }
  .nota, .aviso { border-left: 4px solid; padding: 11px 15px; border-radius: 0 8px 8px 0; margin: 0 0 15px; }
  .nota  { background:#eef5f0; border-color:#5fa87a; }
  .aviso { background:#fff6e6; border-color:#d99b20; }
  table { width:100%; border-collapse: collapse; margin: 14px 0 18px; font-size: 15px; }
  th, td { text-align:left; padding: 9px 11px; border-bottom:1px solid var(--linea); vertical-align: top; }
  th { background:#eef3ef; font-size:12px; letter-spacing:.05em; text-transform:uppercase; color:var(--suave); }
  .chip { display:inline-block; padding:1px 9px; border-radius:999px; font-size:12px; font-weight:700; }
  .chip.real { background:#123d29; color:#6ee7a8; }
  .chip.demo { background:#4a3410; color:#fbbf24; }
  .caso { background:var(--caja); border:1px solid var(--linea); border-left:4px solid var(--verde);
          border-radius: 0 10px 10px 0; padding: 16px 20px; margin-bottom: 18px; }
  .caso h3 { margin-top: 0; }
  footer { border-top:1px solid var(--linea); padding-top:18px; font-size:14px; color:var(--suave); }
  @media print {
    body { background:#fff; }
    nav.indice { break-inside: avoid; }
    section { break-inside: auto; }
    figure { break-inside: avoid; }
    figure img { box-shadow: none; }
  }
</style>
</head>
<body><div class="hoja">${CUERPO}</div></body>
</html>`;

fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, HTML);
console.log('Manual: ' + SALIDA);
console.log('Tamaño: ' + Math.round(fs.statSync(SALIDA).size / 1024) + ' KB');
