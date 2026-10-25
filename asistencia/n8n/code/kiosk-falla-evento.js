// #396 fase a · el evento NO llegó a Postgres. La checada en Odoo YA quedó y el kiosko YA recibió su
// respuesta: esto sólo deja la ejecución en ERROR para que se vea en n8n (y el vigía diario la cuenta
// como «asistencia sin evento»). No toca Odoo ni la respuesta.
var j = $input.first().json || {};
throw new Error('ASISTENCIA_EVENTO_FALLO: ' + String(j.error || j.message || JSON.stringify(j)).slice(0, 300));
