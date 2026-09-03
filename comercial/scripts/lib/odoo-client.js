// ═══ Cliente Odoo (JSON-RPC) + utilidades comunes de los lotes ═══
//
// La credencial NUNCA se hardcodea (CLAUDE.md §4/§9). Se lee del entorno:
//   ODOO_URL   p.ej. https://serviciosfts.odoo.com
//   ODOO_DB    nombre de la base
//   ODOO_USER  login (uid con permisos de escritura sobre crm.lead / sale.order)
//   ODOO_KEY   API key
//
// En dry-run NO se conecta: los lotes que aceptan --fixture leen el JSON
// capturado y no necesitan credencial. Solo `--write` exige el entorno completo.

'use strict';

const https = require('https');
const { URL } = require('url');

function log(...a) { console.log(...a); }

function parseArgs(argv) {
  const args = argv.slice(2);
  const write = args.includes('--write');
  const dryRun = args.includes('--dry-run') || !write;
  if (write && args.includes('--dry-run')) {
    throw new Error('--dry-run y --write son excluyentes: elige uno.');
  }
  return {
    write,
    dryRun,
    fixture: args.includes('--fixture'),
    limite: (() => {
      const i = args.indexOf('--limite');
      return i >= 0 ? Number(args[i + 1]) : null;
    })(),
  };
}

function rpc(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(endpoint);
    const cuerpo = JSON.stringify({ jsonrpc: '2.0', method: 'call', params: payload, id: Date.now() });
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let j;
        try { j = JSON.parse(data); } catch (e) { return reject(new Error(`respuesta no-JSON: ${data.slice(0, 200)}`)); }
        if (j.error) {
          const m = j.error.data && j.error.data.message ? j.error.data.message : JSON.stringify(j.error);
          return reject(new Error(`Odoo: ${m}`));
        }
        return resolve(j.result);
      });
    });
    req.on('error', reject);
    req.write(cuerpo);
    req.end();
  });
}

async function conectar() {
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_KEY } = process.env;
  const faltan = ['ODOO_URL', 'ODOO_DB', 'ODOO_USER', 'ODOO_KEY'].filter((k) => !process.env[k]);
  if (faltan.length) {
    throw new Error(
      `Faltan variables de entorno: ${faltan.join(', ')}.\n` +
      'La credencial no vive en el repo (CLAUDE.md §9). Expórtalas antes de correr con --write.',
    );
  }
  const base = ODOO_URL.replace(/\/$/, '');
  const uid = await rpc(`${base}/jsonrpc`, {
    service: 'common', method: 'login', args: [ODOO_DB, ODOO_USER, ODOO_KEY],
  });
  if (!uid) throw new Error('login rechazado por Odoo (revisa ODOO_USER / ODOO_KEY / ODOO_DB)');
  log(`conectado a Odoo como uid ${uid}`);

  const ejecutar = (modelo, metodo, args, kwargs = {}) => rpc(`${base}/jsonrpc`, {
    service: 'object', method: 'execute_kw', args: [ODOO_DB, uid, ODOO_KEY, modelo, metodo, args, kwargs],
  });

  return {
    uid,
    ejecutar,
    /** searchRead con paginación automática. */
    async searchRead(modelo, domain, fields, orden = 'id') {
      const out = [];
      const paso = 300;
      for (let offset = 0; ; offset += paso) {
        const pagina = await ejecutar(modelo, 'search_read', [domain, fields],
          { limit: paso, offset, order: orden });
        out.push(...pagina);
        if (pagina.length < paso) break;
      }
      return out;
    },
    write: (modelo, ids, valores) => ejecutar(modelo, 'write', [ids, valores]),
    create: (modelo, valores) => ejecutar(modelo, 'create', [valores]),
    /**
     * Nota en el chatter. author_id = 3 (Esteban): el partner 2 (OdooBot) está
     * archivado y el create falla en silencio (CLAUDE.md §18 lección 4).
     */
    notaChatter: (modelo, resId, cuerpo) => ejecutar('mail.message', 'create', [{
      model: modelo, res_id: resId, body: cuerpo, message_type: 'comment',
      subtype_id: 2, author_id: 3,
    }]),
    /**
     * Relee registros después de escribir. El write que devuelve true NO prueba
     * que el campo quedó (CLAUDE.md §9: el ORM descarta readonly en silencio).
     */
    releer: (modelo, ids, fields) => ejecutar(modelo, 'read', [ids, fields]),
  };
}

module.exports = { conectar, parseArgs, log, rpc };
