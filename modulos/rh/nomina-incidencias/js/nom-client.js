// ═══ Nómina · Incidencias — cliente de webhooks /nom/* + datos de demostración ═══
//
// Dos responsabilidades, juntas a propósito porque son la misma decisión: DE DÓNDE
// salen los datos. En modo REAL, de los webhooks; en modo DEMO, del fixture de abajo.
// Quien llama no se entera, así que la pantalla se escribe una sola vez.
//
// EL TOKEN VIAJA EN EL BODY, no en el header Authorization: un header custom fuerza
// preflight CORS que el webhook de n8n puede no contestar (RIESGO-2 del PLAN de
// Finanzas, decisión ya tomada y probada ahí).
//
// POR QUÉ EXISTE EL MODO DEMO. El modo REAL depende de workflows que todavía no están
// publicados. Sin demo, el módulo no se puede ver ni criticar hasta que exista el
// backend completo — y el diseño de la captura es justo lo que conviene discutir ANTES
// de construirlo. El fixture usa el roster REAL de Odoo (30 activos de company 1,
// leídos el 2026-09-03), no nombres inventados.

(function () {
  'use strict';

  var N8N_DEFAULT = 'https://primary-production-5c3c.up.railway.app';
  var MODO_KEY = 'fts_nomina_modo';

  // Mismas guardas que nom-auth.js: localStorage LANZA en varios contextos reales.
  // OJO con el nombre: `guardar` es el de localStorage. La escritura al server se
  // llama `escribir` justo porque llamarla `guardar` tapó a esta y setModo() acabó
  // disparando un webhook. Lo cachó el gate; si hubiera llegado a producción, el
  // cambio de modo habría fallado en silencio.
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  // ─── fin helper ───

  function n8nBase() {
    var url = leer('ops_n8n_url') || leer('n8n_url') || N8N_DEFAULT;
    return String(url).replace(/\/$/, '');
  }

  // REAL es el default desde que existen los endpoints /nom/*. Mientras NO existían,
  // el default era DEMO por una razón que ya no aplica: no había a dónde escribir, y
  // arrancar apuntando a producción habría sido apuntar al vacío. Hoy DEMO sobrevive
  // como modo de práctica —para entrenar y para las capturas del manual— y se entra a
  // él por decisión explícita, nunca por accidente.
  function modo() {
    return leer(MODO_KEY) === 'demo' ? 'demo' : 'real';
  }
  function setModo(m) {
    guardar(MODO_KEY, m === 'real' ? 'real' : 'demo');
  }

  async function call(endpoint, params) {
    if (!window.NomAuth || !window.NomAuth.isValid()) {
      return Promise.reject({ code: 'NO_SESSION', msg: 'Sesión no válida o expirada. Inicia sesión de nuevo.' });
    }
    var token = window.NomAuth.getToken();
    var path  = '/webhook' + (endpoint.charAt(0) === '/' ? endpoint : '/' + endpoint);
    var body  = Object.assign({}, params || {}, { token: token });

    var res, data;
    try {
      res = await fetch(n8nBase() + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      return Promise.reject({ code: 'NETWORK', msg: 'No se pudo conectar al servidor.', http: 0 });
    }
    try { data = await res.json(); } catch (e) { data = null; }

    if (res.status === 401 || (data && data._error && (data.code === 'BAD_TOKEN' || data.code === 'TOKEN_EXPIRADO' || data.code === 'TOKEN_EXPIRED'))) {
      if (window.NomAuth) window.NomAuth.logout();
      return Promise.reject({ code: 'SESSION_EXPIRED', msg: 'Tu sesión expiró. Inicia sesión de nuevo.', http: 401 });
    }
    if (!data) return Promise.reject({ code: 'BAD_RESPONSE', msg: 'Respuesta inválida del servidor.', http: res.status });
    if (data._error) return Promise.reject({ code: data.code || 'ERROR', msg: data.msg || 'Error del servidor.', http: data.http || res.status });
    return data;
  }

  // ─── Fixture ───
  // Roster real de Odoo (hr.employee active, company_id=1) al 2026-09-03: 30 personas.
  // Más Luis Ángel (48), inactivo, que aparece porque arrastra un estado vigente —
  // ese es justo el caso que el diseño existe para no perder de vista.
  var ROSTER = [
    [76,'Carlos Eduardo Manzanares','Supervisor SR Operaciones','Operaciones'],
    [75,'Mateo Salazar','Supervisor SR Operaciones','Operaciones'],
    [112,'Felipe Pérez Guzmán','Operations Manager','Operaciones'],
    [6,'Leonel Cruz Cristobal','Técnico Electromecánico','Operaciones'],
    [79,'José Luis Romero Grados','Técnico Electromecánico','Operaciones'],
    [57,'Samuel Ulises Alcántara','Auxiliar de Operaciones','Operaciones'],
    [131,'Tomas Vázquez García','Soldador','Operaciones'],
    [130,'Rolando vazquez garcia','Soldador','Operaciones'],
    [127,'Cesar Gildardo Gómez Cano','Soldador','Operaciones'],
    [128,'Enoc Natanael Maldonado soto','Soldador','Operaciones'],
    [124,'Germán Emmanuel Merino Falcón','Segurista','Operaciones'],
    [121,'Stephany Ventura Arevalo','Segurista','Operaciones'],
    [62,'Gilberto Gibran Solís Carrillo','Supply Chain Specialist','Operaciones'],
    [25,'Héctor Cruz Hernández','Ingeniero de Soporte','Operaciones'],
    [55,'Juan Manuel Sánchez Lugo','Diseñador Industrial','Operaciones'],
    [68,'Jésus Montalvo Ramirez','Auxiliar de Compras','Operaciones'],
    [154,'Ramiro Segovia Lopez','CHOFER','Operaciones'],
    [78,'Aldo Jesús Méndez Garza','Ingeniero Comercial','Comercial'],
    [98,'Ricardo Alán Hernández González','Ingeniero Comercial','Comercial'],
    [97,'Rissia Xavier de Araujo','Sales Leader','Comercial'],
    [8,'Francisco Montalvo Ramirez','Sr Technical Sales & Engineering support','Comercial'],
    [108,'Pablo Bayly Fernández','Marketing Specialist','Comercial'],
    [153,'Eduardo Garza','Consultant','Administracion y Finanzas'],
    [149,'Erick Belmont Kato','Financial Analyst','Administracion y Finanzas'],
    [59,'Gerardo Isai Lozano Davila','Auxiliar Contable','Administracion y Finanzas'],
    [101,'Ana Laura Acevedo Flores','HR Generalist','Recursos Humanos'],
    [155,'Juan De La Cruz Maldonado','Asesor Externo','Recursos Humanos'],
    [156,'Juana Camarillo Torrez','Limpieza','Recursos Humanos'],
    [63,'Magaly Estefanía Pérez García','Gerente Legal','Legal'],
    [32,'Jesus Esteban De La Cruz Calderon','CEO','Dirección'],
    [48,'Luis Ángel García Cruz','Ingeniero Comercial','Comercial', true]
  ];

  // Declaraciones de arranque de la semana demo. Se dejan CASOS INCÓMODOS a propósito
  // —un bono sin proyecto, días que no cuadran— para que la pantalla se vea haciendo
  // su trabajo en vez de verse siempre en verde.
  // `odoo` es lo que el kiosko habria registrado. Se declara aparte de dias_mexico
  // para que el modo practica ENSEÑE el caso que mas se va a repetir en el real:
  // que lo checado y lo capturado NO coincidan, y haya que decidir cual vale.
  var DECLS_DEMO = {
    76:  { dias_mexico: 3, odoo: 3, decls: [{ tipo: 'vacaciones', valores: { dias: 2 } }] },
    79:  { dias_mexico: 3, odoo: 3, decls: [{ tipo: 'trabajo_usa', valores: { dias: 2, so: 'SO11842 Mission Foods' } }] },
    // Samuel: el kiosko registro 4 y la captura dice 5. Es el caso a enseñar.
    57:  { dias_mexico: 5, odoo: 4, decls: [{ tipo: 'bono_proyecto', fuente: 'J96', valores: { renglones: [{ monto: 2500, so: '' }] } }] },
    6:   { dias_mexico: 4, odoo: 4, decls: [{ tipo: 'permiso_con_goce', valores: { dias: 1, motivo: 'Cita medica' } }] },
    128: { dias_mexico: 5, odoo: 5, decls: [] },
    124: { dias_mexico: 5, odoo: 5, decls: [] }
  };

  var ESTADOS_DEMO = {
    48: [
      { tipo: 'deuda_fts', valores: { desde: '2026-07-15', total: 47446, saldo: 47446 } },
      { tipo: 'baja', valores: { desde: '2026-07-15', motivo: 'Renuncia' } }
    ]
  };

  var DISPUTAS_DEMO = [
    { id: 1, empleado_id: 128, empleado_nombre: 'Enoc Natanael Maldonado soto', fecha: '2026-08-27', attendance_id: 15194, folio: 'INC-OLV-128-2026-08-27T23-07-09-809Z', propuesta: 'SO9428 Vertiv 2da Fase', evidencia: 'planning.slot 1306 · 9.6 h · «Conexión eléctrica y mecánica de chiller y bombas»', abierta: true },
    { id: 2, empleado_id: 124, empleado_nombre: 'Germán Emmanuel Merino Falcón', fecha: '2026-08-27', attendance_id: 15174, folio: 'INC-OLV-CHK-124-2026-08-28T00-09-13-047Z', propuesta: 'SO9428 Vertiv 2da Fase', evidencia: 'planning.slot 1307 · 9.6 h · «Conexión + supervisión EHS»', abierta: true },
    { id: 3, empleado_id: 62,  empleado_nombre: 'Gilberto Gibran Solís Carrillo', fecha: '2026-09-01', attendance_id: 15236, folio: 'INC-AUTO-CIERRE-62-2026-09-01T13-37-41-561Z', propuesta: 'B3096 Admin de Operaciones', evidencia: 'Histórico 5/5 · sin slot de obra en toda la semana', abierta: true }
  ];

  var SOS_DEMO = [
    'SO9428 Vertiv 2da Fase', 'SO11547 Topo Chico', 'SO11551 Quimitec',
    'SO11762 Nalco Topo Chico', 'SO11842 Mission Foods', 'SO11832 Gepp'
  ];

  // PPA de practica. Se fingen los tres casos que hay que saber leer: el limpio,
  // el que llego tarde un dia, y el que trabajo de noche y el sistema pide revisar.
  var PPA_DEMO = {
    57:  { sugerido: false, motivo: 'Llego tarde: 2026-09-01 (12 min). Tolerancia 5 min sobre 07:00.',
           dias: [{ fecha:'2026-08-28', entrada:'06:52', retraso_min:-8, ok:true },
                  { fecha:'2026-09-01', entrada:'07:12', retraso_min:12, ok:false },
                  { fecha:'2026-09-02', entrada:'06:58', retraso_min:-2, ok:true }] },
    128: { sugerido: true, revisar: true,
           motivo: 'Llego a tiempo los 3 dias con checada, contra 07:00 con 5 min de tolerancia. ' +
                   'OJO: 2026-09-01 a las 20:30 entro muy fuera de su horario; se leyo como otro turno y no como retardo. Si no fue turno, quitaselo.',
           dias: [{ fecha:'2026-08-28', entrada:'07:01', retraso_min:1, ok:true },
                  { fecha:'2026-09-01', entrada:'20:30', retraso_min:810, ok:true, otro_turno:true },
                  { fecha:'2026-09-02', entrada:'06:55', retraso_min:-5, ok:true }] },
    101: { aplica: false, sugerido: false, motivo: 'Su ficha en Odoo dice que no aplica PPA.', dias: [] }
  };
  function ppaDemo(id, dias) {
    var p = PPA_DEMO[id];
    if (p) return Object.assign({ aplica: true, hora_base: '07:00', evaluados: (p.dias || []).length }, p);
    return { aplica: true, hora_base: '07:00', sugerido: true, evaluados: dias,
             motivo: 'Llego a tiempo los ' + dias + ' dias con checada, contra 07:00 con 5 min de tolerancia.',
             dias: [] };
  }

  // Dos personas SIN codigo a proposito: es el caso que el archivo tiene que saber
  // avisar ("sin codigo de CONTPAQi: el despacho no lo puede cruzar") y que en real
  // pasa de verdad — hay gente del roster de nomina que no esta en la lista de raya.
  var CODIGO_DEMO = { 32: '', 112: '' };

  function semanaDemo() {
    var personas = ROSTER.map(function (r) {
      var d = DECLS_DEMO[r[0]];
      return {
        id: r[0], nombre: r[1], puesto: r[2], departamento: r[3],
        inactivo: !!r[4],
        // El codigo de CONTPAQi tambien en PRACTICA. Si aqui faltara, practicar
        // enseñaria un archivo sin la columna con la que Ulises captura, y el modo
        // practica existe justo para que no haya sorpresas al pasar a REAL.
        // Se deriva del id para no meter la tabla real de codigos en un repo publico;
        // lo que se practica es la FORMA de la columna, no sus valores.
        codigo: CODIGO_DEMO[r[0]] || ('9' + ('00' + (r[0] % 100)).slice(-2)),
        dias_mexico: d ? d.dias_mexico : (r[4] ? 0 : 5),
        dias_odoo: d ? d.odoo : (r[4] ? 0 : 5),
        capturado: !!d,
        ppa: ppaDemo(r[0], d ? d.odoo : (r[4] ? 0 : 5)),
        ppa_decidido: (r[0] === 6 ? true : null),
        ppa_nota:  (r[0] === 6 ? 'Felipe lo citó 08:00 el martes; no llegó tarde.' : ''),
        ppa_actor: (r[0] === 6 ? 'magaly.perez' : null),
        ppa_fecha: (r[0] === 6 ? '2026-09-03T18:20:00Z' : null),
        declaraciones: d ? JSON.parse(JSON.stringify(d.decls)) : [],
        estados: ESTADOS_DEMO[r[0]] ? JSON.parse(JSON.stringify(ESTADOS_DEMO[r[0]])) : []
      };
    });
    return {
      semana: { id: 'S36/2026', desde: '2026-08-28', hasta: '2026-09-03', dias: 5 },
      personas: personas,
      disputas: JSON.parse(JSON.stringify(DISPUTAS_DEMO)),
      proyectos: SOS_DEMO.slice(),
      estado_envio: 'borrador',
      // El envio de practica arranca en borrador para que se pueda ensayar el ciclo
      // completo —generar el archivo, mandarlo, verlo marcado y corregirlo— sin tocar
      // la semana real. `enviar()` en DEMO no escribe nada: solo lo dice.
      envio: { estado: 'borrador', version: 0, actor: null, enviado_en: null,
               nombre_archivo: null, archivo: null, motivo: null,
               bitacora: [], cambios_despues: 0 },
      // El rezago tambien se finge: si no, la pantalla de disputas del modo practica
      // no enseñaria el aviso que en el real aparece todas las semanas.
      rezago: { total: 74, desde: '2026-05-08', personas: 19 },
      origen: 'demo'
    };
  }

  async function cargarSemana(semanaId) {
    if (modo() === 'demo') return Promise.resolve(semanaDemo());
    return call('/nom/semana', { semana: semanaId || null });
  }

  // ─── El índice de semanas ───
  // Es lo primero que se carga, antes que ninguna semana. No toca Odoo (el server
  // solo lee las tablas de datos), así que abre de inmediato: la lista de semanas no
  // necesita saber quién trabajó, solo qué se mandó.
  //
  // POR QUÉ EXISTE. El módulo abría directo en una semana, y esa semana era la que
  // contiene HOY. Como la semana corre VIE→JUE, un viernes eso es una semana de un
  // día: el 4-sep-2026 abría en S37 —el primer día— mientras S36 tenía las cinco
  // jornadas de 28 personas esperando. No había forma de llegar a otra semana ni de
  // ver cuáles ya se habían mandado.
  function semanasDemo() {
    // Se fingen tres: la que corre, la que toca (con captura empezada) y una ya
    // enviada. Sin la enviada, el modo práctica no enseñaría cómo se ve una semana
    // cerrada, que es justo lo que hay que saber leer para no remandarla sin querer.
    return {
      hoy: '2026-09-04',
      sugerida: 'S36/2026',
      semanas: [
        { id: 'S37/2026', desde: '2026-09-04', hasta: '2026-09-10', dias: 5, en_curso: true,
          estado: 'borrador', version: 0, enviado_en: null, actor: null, nombre_archivo: null,
          motivo: null, movimientos: 0, personas_capturadas: 0, cambios_despues: 0 },
        { id: 'S36/2026', desde: '2026-08-28', hasta: '2026-09-03', dias: 5, en_curso: false,
          estado: 'borrador', version: 0, enviado_en: null, actor: null, nombre_archivo: null,
          motivo: null, movimientos: 0, personas_capturadas: 7, cambios_despues: 0 },
        { id: 'S35/2026', desde: '2026-08-21', hasta: '2026-08-27', dias: 5, en_curso: false,
          estado: 'enviada', version: 2, enviado_en: '2026-08-28T16:12:00.000Z', actor: 'magaly',
          nombre_archivo: 'nomina-S35-2026-v2.csv', motivo: 'faltaba un día de incapacidad de Samuel',
          movimientos: 2, personas_capturadas: 30, cambios_despues: 1 }
      ],
      origen: 'demo'
    };
  }

  async function cargarSemanas() {
    if (modo() === 'demo') return Promise.resolve(semanasDemo());
    return call('/nom/semanas', {});
  }

  // Escribe y NO devuelve la pantalla: quien llama tiene que volver a leer la semana.
  // Un 200 no prueba que el dato quedó (CLAUDE.md §20.5) y pintar el éxito antes de
  // comprobarlo es el anti-patrón que costó el incidente del 27-may (§14 hallazgo #15).
  async function escribir(payload) {
    if (modo() === 'demo') {
      return Promise.reject({ code: 'MODO_DEMO',
        msg: 'Estás en modo DEMO: aquí nada se guarda. Cambia a REAL en la insignia de arriba.' });
    }
    return call('/nom/guardar', payload);
  }

  // Las tres escrituras del módulo, con nombre, para que quien lea app.js vea QUÉ se
  // está guardando y no un objeto suelto con un campo 'accion'.
  // `ppa` viaja como 'si', 'no' o cadena vacia. Vacio NO es 'no': significa que RH
  // no ha decidido y sigue mandando la sugerencia del sistema. Confundir los dos
  // convertiria cada guardado de dias en una negacion silenciosa del premio.
  function guardarPersona(semana, p, ppa, nota) {
    var v = (ppa === 'si' || ppa === 'no') ? ppa : '';
    return escribir({ accion: 'persona', semana: semana, empleado_id: p.id,
                     dias_mexico: Number(p.dias_mexico) || 0,
                     declaraciones: p.declaraciones || [],
                     ppa: v,
                     // Sin decision no viaja nota: el server la limpia igual, pero
                     // mandarla seria decir una cosa y guardar otra.
                     ppa_nota: v === '' ? '' : ('' + (nota || '')) });
  }
  function guardarEstado(empleadoId, est, vigente) {
    return escribir({ accion: 'estado', empleado_id: empleadoId, tipo: est.tipo,
                     valores: est.valores || {}, vigente: vigente !== false });
  }
  // El archivo viaja CON el envio y el server lo congela tal cual. Regenerarlo al
  // volver a bajarlo daria un archivo distinto en cuanto alguien corrigiera un dia:
  // "lo que se envio" tiene que poder releerse byte por byte, o no es un acuse.
  // `motivo` solo hace falta al REENVIAR (version >= 2); el server lo exige, no la
  // pantalla — este repo es publico y ahi las reglas se piden, no se imponen.
  function guardarEnvio(semana, resumen, archivo, nombreArchivo, motivo) {
    return escribir({ accion: 'enviar', semana: semana, resumen: resumen || {},
                      archivo: '' + (archivo || ''),
                      nombre_archivo: '' + (nombreArchivo || ''),
                      motivo: '' + (motivo || '') });
  }

  window.NomClient = {
    call: call,
    modo: modo,
    setModo: setModo,
    cargarSemana: cargarSemana,
    cargarSemanas: cargarSemanas,
    escribir: escribir,
    guardarPersona: guardarPersona,
    guardarEstado: guardarEstado,
    guardarEnvio: guardarEnvio,
    semanaDemo: semanaDemo,
    semanasDemo: semanasDemo,
    MODO_KEY: MODO_KEY
  };
})();
