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
  var DECLS_DEMO = {
    76:  { dias_mexico: 3, decls: [{ tipo: 'vacaciones', valores: { dias: 2 } }] },
    79:  { dias_mexico: 3, decls: [{ tipo: 'trabajo_usa', valores: { dias: 2, so: 'SO11842 Mission Foods' } }] },
    57:  { dias_mexico: 5, decls: [{ tipo: 'bono_proyecto', fuente: 'J96', valores: { renglones: [{ monto: 2500, so: '' }] } }] },
    6:   { dias_mexico: 4, decls: [{ tipo: 'permiso', valores: { dias: 1, goce: true } }] },
    128: { dias_mexico: 5, decls: [] },
    124: { dias_mexico: 5, decls: [] }
  };

  var ESTADOS_DEMO = {
    48: [
      { tipo: 'deuda_fts', valores: { desde: '2026-07-15', total: 47446, saldo: 47446 } },
      { tipo: 'baja', valores: { desde: '2026-07-15', motivo: 'Renuncia' } }
    ]
  };

  var DISPUTAS_DEMO = [
    { id: 1, empleado_id: 128, fecha: '2026-08-27', attendance_id: 15194, folio: 'INC-OLV-128-2026-08-27T23-07-09-809Z', propuesta: 'SO9428 Vertiv 2da Fase', evidencia: 'planning.slot 1306 · 9.6 h · «Conexión eléctrica y mecánica de chiller y bombas»', abierta: true },
    { id: 2, empleado_id: 124, fecha: '2026-08-27', attendance_id: 15174, folio: 'INC-OLV-CHK-124-2026-08-28T00-09-13-047Z', propuesta: 'SO9428 Vertiv 2da Fase', evidencia: 'planning.slot 1307 · 9.6 h · «Conexión + supervisión EHS»', abierta: true },
    { id: 3, empleado_id: 62,  fecha: '2026-09-01', attendance_id: 15236, folio: 'INC-AUTO-CIERRE-62-2026-09-01T13-37-41-561Z', propuesta: 'B3096 Admin de Operaciones', evidencia: 'Histórico 5/5 · sin slot de obra en toda la semana', abierta: true }
  ];

  var SOS_DEMO = [
    'SO9428 Vertiv 2da Fase', 'SO11547 Topo Chico', 'SO11551 Quimitec',
    'SO11762 Nalco Topo Chico', 'SO11842 Mission Foods', 'SO11832 Gepp'
  ];

  function semanaDemo() {
    var personas = ROSTER.map(function (r) {
      var d = DECLS_DEMO[r[0]];
      return {
        id: r[0], nombre: r[1], puesto: r[2], departamento: r[3],
        inactivo: !!r[4],
        dias_mexico: d ? d.dias_mexico : (r[4] ? 0 : 5),
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
      origen: 'demo'
    };
  }

  async function cargarSemana(semanaId) {
    if (modo() === 'demo') return Promise.resolve(semanaDemo());
    return call('/nom/semana', { semana: semanaId || null });
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
  function guardarPersona(semana, p) {
    return escribir({ accion: 'persona', semana: semana, empleado_id: p.id,
                     dias_mexico: Number(p.dias_mexico) || 0,
                     declaraciones: p.declaraciones || [] });
  }
  function guardarEstado(empleadoId, est, vigente) {
    return escribir({ accion: 'estado', empleado_id: empleadoId, tipo: est.tipo,
                     valores: est.valores || {}, vigente: vigente !== false });
  }
  function guardarEnvio(semana, resumen) {
    return escribir({ accion: 'enviar', semana: semana, resumen: resumen || {} });
  }

  window.NomClient = {
    call: call,
    modo: modo,
    setModo: setModo,
    cargarSemana: cargarSemana,
    escribir: escribir,
    guardarPersona: guardarPersona,
    guardarEstado: guardarEstado,
    guardarEnvio: guardarEnvio,
    semanaDemo: semanaDemo,
    MODO_KEY: MODO_KEY
  };
})();
