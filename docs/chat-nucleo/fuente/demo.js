/* Prototipo · dos productos sobre el MISMO núcleo. Cada uno trae solo configuración y contenido: cero CSS del chat. */
(function (G) {
  'use strict';
  var N = G.ChatNucleo, esc = N.esc;
  var hoy = new Date(), at = function (dias, h, m) { var d = new Date(hoy); d.setDate(d.getDate() - dias); d.setHours(h, m, 0, 0); return d.toISOString(); };
  var PALETA = ['#7b5e57', '#3b5a75', '#5b6abf', '#2e7d6b', '#b26a00', '#8e5aa8', '#c0533a', '#1f7a3a'];
  var color = function (t) { var n = 0; String(t).split('').forEach(function (c) { n = (n * 31 + c.charCodeAt(0)) % 997; }); return PALETA[n % PALETA.length]; };
  var ini = function (t) { return String(t).split(/\s+/).slice(0, 2).map(function (x) { return x[0]; }).join('').toUpperCase(); };
  var F1 = 'linear-gradient(135deg,#6d7b84,#c9b48a)', F2 = 'linear-gradient(135deg,#3d5a6b,#9fb3bf)', F3 = 'linear-gradient(135deg,#8a8f78,#d8cfb6)';
  // audio demo: 14 s generado en el navegador (no hay servidor en el prototipo)
  function wavUrl(seg) {
    var sr = 8000, n = sr * seg, b = new DataView(new ArrayBuffer(44 + n * 2)), w = function (o, s) { for (var i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) b.setInt16(44 + i * 2, Math.round(5000 * Math.sin(2 * Math.PI * 190 * i / sr) * Math.abs(Math.sin(i / sr * 2.7))), true);
    return URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }));
  }
  var AUDIO = null, audio = function () { return AUDIO || (AUDIO = wavUrl(14)); };

  /* ═══ Conceptualizador · su contenido (tarjetas de conjeturas, franja de avance, panel lateral, botón del paso) ═══ */
  var CZ = [
    { id: 'c1', titulo: 'Mezanín planta Apodaca', cliente: 'Mezanín Apodaca', autor: 'Montalvo', estado: 'abierta', acc: 2, t: at(0, 19, 39), vista: '¿Y si la escalera va del lado sur?', tick: 'recibido' },
    { id: 'c2', titulo: 'Mattel reubicación de pantallas', cliente: 'Mattel', autor: 'Esteban', estado: 'enviada', acc: 0, t: at(0, 17, 5), vista: 'El machote quedó al 40 %.', tick: '' },
    { id: 'c3', titulo: 'Chillers Coficab Cd Juárez', cliente: 'Coficab', autor: 'Richard', estado: 'abierta', acc: 1, t: at(1, 12, 20), vista: 'Recibí 3 fotos.', tick: '' },
    { id: 'c4', titulo: 'Tubería de vapor Nalco', cliente: 'Nalco', autor: 'Montalvo', estado: 'cerrado', acc: 0, t: at(6, 9, 2), vista: 'Cerrada con el machote M-0412.', tick: 'leido' }
  ];
  var MSG_CZ = [
    { id: 'm0', rol: 'el', quien: 'Conceptualizador', intro: true, at: at(0, 19, 30), texto: 'Modo acompañamiento. Mándame lo que vayas viendo: fotos, notas de voz, medidas, la ruta. Te contesto corto y te pido lo que no puede faltar según el trabajo. No propongo conceptos hasta que toques «Ya terminé, cotiza».' },
    { id: 'm1', rol: 'yo', at: at(0, 19, 39), estado: 'leido', texto: 'Mezanín de 2 niveles en la nave 3, con su alimentación eléctrica. Te mando fotos y el plano.' },
    { id: 'm2', rol: 'yo', at: at(0, 19, 39), estado: 'leido', adjuntos: [{ id: 'f1', clase: 'foto', fondo: F1 }, { id: 'f2', clase: 'foto', fondo: F2 }, { id: 'f3', clase: 'foto', fondo: F3 }] },
    { id: 'm3', rol: 'el', quien: 'Conceptualizador', at: at(0, 19, 39), texto: 'Recibí 3 fotos.' },
    { id: 'm4', rol: 'yo', at: at(0, 19, 40), estado: 'leido', adjuntos: [{ id: 'd1', clase: 'pdf', nombre: 'plano-mezanin-rev2.pdf', bytes: 412000 }] },
    { id: 'm5', rol: 'yo', at: at(0, 19, 41), estado: 'leido', adjuntos: [{ id: 'v1', clase: 'audio', duracion_s: 14, transcripcion: 'La carga es de 500 kilos por metro cuadrado y el cliente quiere que quede antes de diciembre.' }] },
    { id: 'm6', rol: 'sistema', at: at(0, 19, 41), texto: 'Ciudad del proyecto confirmada: Apodaca, N.L.' },
    { id: 'm7', rol: 'el', quien: 'Conceptualizador', at: at(0, 19, 42), md: true, texto: 'Anotado. Con lo que mandaste:\n- **Mezanín** de 2 niveles, 500 kg/m²\n- Entrega antes de diciembre\n\nConfirma o corrige lo que supongo.',
      tarjeta: { tipo: 'conjeturas', datos: [{ p: '¿De dónde se alimenta el mezanín?', c: 'Del tablero C10, a 40 m.' }, { p: '¿Altura libre bajo viga?', c: '3 m.' }] } },
    { id: 'm8', rol: 'yo', at: at(0, 19, 44), estado: 'recibido', texto: '¿Y si la escalera va del lado sur?' }
  ];
  var cz = {
    producto: 'conceptualizador', titulo: 'Conceptualizador', version: 'V1.42', buscarTexto: 'Buscar por nombre o cliente', placeholder: 'Mensaje',
    vacioChat: 'Elige una cotización o abre una nueva.', audio: audio,
    lista: {
      clave: function (f) { return f.id; }, titulo: function (f) { return f.titulo; }, vista: function (f) { return f.vista; }, vistaTick: function (f) { return f.tick; },
      hora: function (f) { return N.corto(f.t); }, noLeidos: function (f) { return f.acc; },
      avatar: function (f) { return { texto: ini(f.cliente), color: color(f.titulo) }; },
      etiquetas: function (f) { return (f.estado === 'enviada' ? [{ texto: 'enviada', tono: 'ambar' }] : f.estado === 'cerrado' ? [{ texto: 'cerrada', tono: 'verde' }] : []).concat([{ texto: f.autor }]); },
      filtros: [{ id: 'quien', opciones: [{ id: 'todos', texto: 'Todos', icono: 'usuario', menu: true }] },
        { id: 'est', opciones: [{ id: 'vivas', texto: 'En curso', contar: true, f: function (f) { return f.estado !== 'cerrado'; } }, { id: 'cerradas', texto: 'Cerradas', contar: true, f: function (f) { return f.estado === 'cerrado'; } }, { id: 'todas', texto: 'Todas', contar: true }] }],
      pie: 'Una sesión por cotización · Lo que aprendió · V1.42'
    },
    fab: { texto: 'Nueva cotización' },
    cabecera: function (c) { return { titulo: c.titulo, sub: 'FTS México · MXN · Apodaca, N.L. · escribiendo…', vivo: true, avatar: { texto: ini(c.cliente), color: color(c.titulo) } }; },
    franja: function () { return '<div style="display:flex;align-items:center;gap:6px;height:34px;padding:0 8px 0 14px;font-size:13.5px;color:var(--chn-sec)"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b style="color:var(--chn-texto);font-weight:600">Levantamiento</b> · Siguiente: Ya terminé, cotiza</span>' + N.ico('flecha', 's') + '</div>'; },
    lado: function () { return '<div style="font-size:13.5px"><b style="font-weight:600">Levantamiento</b> · Siguiente: Ya terminé, cotiza<p style="font-size:12.5px;color:var(--chn-sec);margin:8px 0">Paso 1 de 7 · 2 preguntas por confirmar</p></div>'; },
    fijo: function () { return [{ texto: 'Ya terminé, cotiza', icono: 'disparo' }]; },
    mensajes: function (c) { return c.id === 'c1' ? MSG_CZ : [{ id: 'x', rol: 'sistema', at: c.t, texto: 'Conversación demo.' }]; },
    escribiendo: function (c) { return c.id === 'c1' ? { texto: 'escribiendo…', pasos: [{ t: 'leyendo tu mensaje', s: 2 }, { t: 'revisando el plano', s: 9 }] } : null; },
    tarjetas: {
      conjeturas: function (L) {
        return '<h4>❓ Lo que supongo · confírmalo o corrígelo · faltan ' + L.length + '</h4>' + L.map(function (x, i) {
          return '<div class="chn-renglon"><p>' + esc(x.p) + '</p><div class="chn-conj">Supongo: ' + esc(x.c) + '</div><div class="chn-acc"><button class="chn-bt si" data-hacer="va' + i + '">✓ Va</button><button class="chn-bt" data-hacer="corr' + i + '">✎ Corregir</button></div></div>';
        }).join('') + '<p class="chn-nota">Cuando contestes todas, sigo con los conceptos.</p>';
      }
    },
    onEnviar: function (c, t) { MSG_CZ.push({ id: 'n' + Date.now(), rol: 'yo', at: new Date().toISOString(), estado: 'pendiente', texto: t }); }
  };

  /* ═══ Prospectador de Marketing · su contenido (etapas, ficha, propuesta al instante, corregir por voz) ═══ */
  var NIV = { N1: '#b42318', N2: '#b54708', N3: '#3b5a75' };
  var MK = [
    { id: 'k1', titulo: 'Bebidas Demo del Golfo', ciudad: 'Apodaca, NL', n: 'N3', etapa: 2, origen: 'Manual', quien: 'Tú', t: at(0, 6, 47), vista: 'Motor: Propuesta al instante', nl: 0 },
    { id: 'k2', titulo: 'Vidrio Demo Monterrey', ciudad: 'Monterrey, NL', n: 'N2', etapa: 1, origen: 'Radar', quien: 'Seguimiento', t: at(0, 6, 40), vista: 'Conversación de la empresa', nl: 2 },
    { id: 'k3', titulo: 'Empaques Demo Saltillo', ciudad: 'Saltillo, Coah.', n: 'N3', etapa: 1, origen: 'Manual', quien: 'Seguimiento', t: at(0, 6, 30), vista: 'Enfriándose por nosotros: 10 días', nl: 3, frio: true },
    { id: 'k4', titulo: 'Aceros Demo del Norte', ciudad: 'Escobedo, NL', n: 'N3', etapa: 1, origen: 'Manual', quien: 'Tú', t: at(1, 15, 2), vista: 'Llamar hoy a compras', nl: 2, vence: true }
  ];
  var MSG_MK = [
    { id: 'p1', rol: 'yo', at: at(1, 9, 10), estado: 'leido', texto: 'prospecta Bebidas Demo del Golfo en Apodaca, NL' },
    { id: 'p2', rol: 'el', quien: 'Prospectador', at: at(1, 9, 12), texto: 'Ficha lista. Cuenta primero.', dentro: { tipo: 'liga', datos: { t: 'Ver ficha →', s: 'Cuenta primero · lista · 5 consultas' } } },
    { id: 'p3', rol: 'sistema', at: at(0, 6, 40), texto: 'Pasó a Etapa 2 · Seguimiento' },
    { id: 'p4', rol: 'yo', at: at(0, 6, 45), estado: 'leido', adjuntos: [{ id: 'v2', clase: 'audio', duracion_s: 14, transcripcion: 'Volví a llamar, me pasaron con compras pero no contestaron.' }] },
    { id: 'p5', rol: 'el', quien: 'Prospectador', at: at(0, 6, 47), texto: '', tarjeta: { tipo: 'propuesta', datos: { toque: 'compras: transferido, sin respuesta.', sig: 'llamada el 2026-10-19 · Volver a marcar a compras en otro horario (antes de las 10 o después de las 16)', guia: 'Pide en el conmutador el nombre del puesto que da de alta proveedores y su extensión directa.' } } },
    { id: 'p6', rol: 'yo', at: at(0, 6, 50), estado: 'pendiente', texto: 'Le mando la presentación por correo.' }
  ];
  var ET = { 1: 'Etapa 1 · Prospección', 2: 'Etapa 2 · Seguimiento' };
  var mk = {
    producto: 'marketing', titulo: 'Prospectador', version: 'v3', buscarTexto: 'Buscar empresa, grupo o ciudad', placeholder: 'Cuenta qué pasó',
    vacioChat: 'Elige una empresa o prospecta una nueva.', audio: audio,
    lista: {
      clave: function (f) { return f.id; }, titulo: function (f) { return f.titulo; }, vista: function (f) { return f.vista; }, buscarEn: function (f) { return f.titulo + ' ' + f.ciudad; },
      hora: function (f) { return f.vence ? 'vence hoy' : N.corto(f.t); }, horaClase: function (f) { return f.vence ? 'vence' : f.nl ? 'nuevo' : ''; }, noLeidos: function (f) { return f.nl; },
      avatar: function (f) { return { texto: f.titulo[0], color: NIV[f.n], insignia: f.n, insigniaColor: NIV[f.n] }; },
      etiquetas: function (f) { return [{ texto: 'Etapa ' + f.etapa, tono: f.etapa === 1 ? 'morado' : 'teal' }].concat(f.frio ? [{ texto: 'Enfriándose', tono: 'rojo' }] : []); },
      filtros: [{ id: 'vista', opciones: [{ id: 'todas', texto: 'Todas', contar: true }, { id: 'mias', texto: 'Mis conversaciones', contar: true, f: function (f) { return f.quien === 'Tú'; } }] },
        { id: 'niv', opciones: [{ id: 'x', texto: 'Todos', icono: 'usuario', menu: true }, { id: 'n2', texto: 'N2', f: function (f) { return f.n === 'N2'; } }, { id: 'n3', texto: 'N3', f: function (f) { return f.n === 'N3'; } }] }],
      pie: 'Marketing · Prospectador · v3'
    },
    fab: { texto: 'Prospectar' },
    cabecera: function (c) { return { titulo: c.titulo, sub: c.ciudad + ' · ' + ET[c.etapa], avatar: { texto: c.titulo[0], color: NIV[c.n], insignia: c.n, insigniaColor: NIV[c.n] } }; },
    franja: function (c) { return '<div style="display:flex;gap:6px;padding:6px 12px;overflow-x:auto;font-size:12.5px;white-space:nowrap">' + ['Etapa 1 · Prospección', 'Enviar a CRM', 'Etapa 2 · Seguimiento', 'Por cotizar'].map(function (e) {
      var on = e === ET[c.etapa]; return '<span class="chn-et ' + (on ? 'teal' : '') + '" style="font-size:12px;line-height:22px;padding:0 8px">' + esc(e) + '</span>'; }).join('') + '</div>'; },
    lado: null,
    fijo: function () { return [{ texto: 'Ficha' }, { texto: 'Enviar a CRM', fuerte: true }, { texto: 'Pasar a cotizar' }]; },
    mensajes: function (c) { return c.id === 'k1' ? MSG_MK : [{ id: 'y', rol: 'sistema', at: c.t, texto: 'Conversación demo.' }]; },
    escribiendo: function () { return null; },
    tarjetas: {
      liga: function (d) { return '<button class="chn-liga"><b>' + esc(d.t) + '</b><small>' + esc(d.s) + '</small></button>'; },
      propuesta: function (d) {
        return '<h4>Propuesta al instante</h4><div class="chn-renglon"><p><b>Toque →</b> ' + esc(d.toque) + '</p><p><b>Siguiente:</b> ' + esc(d.sig) + '</p><p class="chn-nota">' + esc(d.guia) + '</p></div>' +
          '<div class="chn-acc"><button class="chn-bt si" data-hacer="ok">✓ Va</button><button class="chn-bt" data-hacer="voz">🎙 Corregir por voz</button></div>';
      }
    },
    onEnviar: function (c, t) { MSG_MK.push({ id: 'n' + Date.now(), rol: 'yo', at: new Date().toISOString(), estado: 'pendiente', texto: t }); }
  };
  G.DEMO = { cz: { conf: cz, filas: CZ, abrir: 'c1' }, mkt: { conf: mk, filas: MK, abrir: 'k1' } };
})(window);
