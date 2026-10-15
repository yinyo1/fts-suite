/* ═══ Marketing · propuesta mecánica de un toque (v3, #421) — ARCHIVO GENERADO, NO SE EDITA AQUÍ ═══
 * Fuente única: fts-conceptualizador/herramientas/marketing/seguimiento.js (entre «NÚCLEO» y «FIN NÚCLEO»).
 * Se regenera con: node herramientas/marketing/publicar-toque-base.js --suite <fts-suite>
 * La pantalla la usa para responder AL INSTANTE; el motor la corrige con criterio en ráfaga.
 * huella del núcleo: db03246b0cd6f0e6
 */
(function (G) {
const CANALES = [
  // la visita va primero: «fui a la planta… en caseta me dijeron» es una visita, no una llamada al conmutador
  ['visita', /visit[eé]|fui a(l| la)? (planta|parque|obra|sitio)|en persona|reuni[oó]n presencial/],
  ['conmutador', /conmutador|recepci[oó]n|operadora|caseta/],
  ['whatsapp', /whats|wa\b|wasap/],
  ['correo', /correo|mail|e-?mail|le escrib[ií]|mand[eé] (la )?info/],
  ['linkedin', /linked ?in|inmail|invitaci[oó]n/],
  ['portal', /ariba|coupa|portal|isn(etworld)?|avetta|veriforce|alta de proveedor/],
  ['llamada', /llam[eé]|marqu[eé]|habl[eé]|tel[eé]fono|me contest/]
];
const RESULTADOS = [
  ['rechazo', /no (les )?interesa|no necesitan|ya tienen proveedor|no gracias|rechaz/],
  ['alta_proveedor', /alta (como|de) proveedor|registr(o|arnos) (en|como)|invitaci[oó]n (al|a) (portal|ariba|coupa)/],
  ['cita', /cita|reuni[oó]n|visita (el|para)|agend/],
  ['envio_info', /mand(a|e|ar) (la )?(info|informaci[oó]n|presentaci[oó]n|cat[aá]logo)|pidi[oó] (info|informaci[oó]n|cotizaci[oó]n)/],
  ['transferido', /me pasaron|me transfiri|me comunicaron|me dieron (la )?extensi[oó]n/],
  ['sin_respuesta', /no contest|nadie contest|buz[oó]n|no respond|sin respuesta|no estaba|no lo encontr|ocupad/],
  ['contesto', /contest[oó]|habl[eé] con|me atendi/]
];
const NOMBRE_PLAT = { sap_ariba: 'SAP Ariba', coupa: 'Coupa', jaggaer: 'Jaggaer', oracle: 'Oracle', isnetworld: 'ISNetworld', avetta: 'Avetta', veriforce: 'Veriforce', portal_propio: 'su portal de proveedores' };
const nombrePlat = p => NOMBRE_PLAT[p] || String(p || '').replace(/_/g, ' ');
const AREA = /compras|abastecimiento|procurement|mantenimiento|ingenier[ií]a|capex|proyectos|planta|operaciones/;

function hoyMty() { return new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10); }
/** Suma n días hábiles (lunes a viernes) a una fecha AAAA-MM-DD. */
function habiles(desde, n) {
  const d = new Date(desde + 'T12:00:00Z');
  let k = 0;
  while (k < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) k++; }
  return d.toISOString().slice(0, 10);
}
const quita = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function proponer(o) {
  const texto = String(o.texto || ''), t = quita(texto), hoy = o.hoy || hoyMty(), f = o.ficha || {}, d = f.datos || f || {};
  const canal = (CANALES.find(c => c[1].test(t)) || [null])[0] || 'otro';
  const resultado = (RESULTADOS.find(r => r[1].test(t)) || [null])[0] || 'otro';
  const area = (t.match(AREA) || [null])[0];
  const acc = d.acceso || {}, compras = typeof acc.compras === 'string' ? { plataforma: acc.compras } : (acc.compras || {});
  const contr = typeof acc.contratistas === 'string' ? { plataforma: acc.contratistas } : (acc.contratistas || {});
  const plat = compras.plataforma && compras.plataforma !== 'no_encontrado' ? compras.plataforma : null;
  let sig, sug, avanzo = false;
  switch (resultado) {
    case 'sin_respuesta':
    case 'transferido':
      sig = { tipo: 'llamada', fecha: habiles(hoy, 2), resumen: 'Volver a marcar' + (area ? ' a ' + area : '') + ' en otro horario (antes de las 10 o después de las 16)' };
      sug = 'Pide en el conmutador el nombre del puesto que ' + (area === 'compras' ? 'da de alta proveedores' : 'atiende ' + (area || 'el área')) + ' y su extensión directa; deja recado con el motivo en una frase.' +
        (plat ? ' Pregunta si el alta de proveedores es por ' + nombrePlat(plat) + ' y si es por invitación.' : '');
      break;
    case 'envio_info':
      sig = /(les |le )?(mand[eé]|envi[eé]) (la )?(info|informaci[oó]n|presentaci[oó]n|cat[aá]logo)/.test(t)
        ? { tipo: 'llamada', fecha: habiles(hoy, 1), resumen: 'Confirmar que llegó la información y quién la revisa' }
        : { tipo: 'correo', fecha: hoy, resumen: 'Mandar la información pedida y confirmar que llegó' };
      sug = 'Manda una página: qué hace FTS en plantas como la suya, 2 proyectos parecidos y la pregunta concreta (¿quién define el CAPEX eléctrico de 2027?). Al día hábil siguiente, llama para confirmar.';
      avanzo = true; break;
    case 'cita':
      sig = { tipo: 'visita', fecha: habiles(hoy, 1), resumen: 'Confirmar la cita y preparar la visita' };
      sug = 'Lleva la señal de la ficha (por qué esta planta) y pregunta por proyectos de 6 a 18 meses; pide recorrer el área.'; avanzo = true; break;
    case 'alta_proveedor':
      sig = { tipo: 'correo', fecha: habiles(hoy, 1), resumen: 'Iniciar el alta de proveedor' + (plat ? ' en ' + nombrePlat(plat) : '') };
      sug = 'Junta acta, constancia fiscal, opinión de cumplimiento y póliza; pide quién aprueba el alta dentro de Compras.' +
        (contr.plataforma && contr.plataforma !== 'no_encontrado' ? ' Para entrar a planta también piden ' + nombrePlat(contr.plataforma) + '.' : ''); avanzo = true; break;
    case 'rechazo':
      sig = { tipo: 'correo', fecha: habiles(hoy, 60), resumen: 'Volver a tocar en 3 meses con otra señal' };
      sug = 'Anota el porqué del rechazo. Si fue «ya tienen proveedor», pregunta qué tendría que pasar para cotizar la siguiente ampliación.'; break;
    case 'contesto':
      sig = { tipo: 'llamada', fecha: habiles(hoy, 3), resumen: 'Dar seguimiento a lo que se habló' };
      sug = 'Escribe en la tarjeta qué se dijo y el siguiente compromiso; si mencionaron un proyecto, pide fecha y quién lo decide.'; avanzo = true; break;
    default:
      sig = { tipo: 'llamada', fecha: habiles(hoy, 2), resumen: 'Siguiente toque' };
      sug = (d.conmutador && d.conmutador.numero ? 'Empieza por el conmutador de planta.' : 'Busca el conmutador de planta en el sitio oficial antes de llamar.') + ' Pide por el área, no por la persona.';
  }
  const resumen = ({ conmutador: 'Conmutador', llamada: 'Llamada', correo: 'Correo', whatsapp: 'WhatsApp', visita: 'Visita', linkedin: 'LinkedIn', portal: 'Portal', otro: 'Toque' }[canal]) +
    (area ? ' → ' + area : '') + ': ' + ({ sin_respuesta: 'sin respuesta', transferido: 'transferido, sin respuesta', contesto: 'contestó', cita: 'hay cita', envio_info: 'pidió información',
      rechazo: 'no le interesa por ahora', alta_proveedor: 'alta de proveedor en marcha', otro: 'sin resultado claro' }[resultado]) + '.';
  return { canal, resultado, avanzo_etapa: avanzo, resumen, siguiente: sig, sugerencia: sug };
}
G.MktToqueBase = { proponer: proponer, habiles: habiles, hoyMty: hoyMty, huella: 'db03246b0cd6f0e6' };
})(window);
