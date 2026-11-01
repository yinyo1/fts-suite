// Base Postgres desechable para las pruebas SQL de Nómina USA (#448).
// Usa NUSA_PGHOST/NUSA_PGPORT (por omisión el clúster local de pruebas /var/tmp/pgnusa:55432).
// Crea una base nueva, aplica TODAS las migraciones de retardos y de nomina_usa en orden
// —la base tiene que poder recrearse desde cero (db/README.md)— y la tira al terminar.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..', '..', '..');
const HOST = process.env.NUSA_PGHOST || '/var/tmp/pgnusa', PORT = process.env.NUSA_PGPORT || '55432';
function psql(db, sql, extra) {
  return execFileSync('psql', ['-h', HOST, '-p', PORT, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-qAtX'].concat(extra || []),
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function crear() {
  const db = 'nusa_' + process.pid + '_' + Date.now();
  psql('postgres', 'CREATE DATABASE ' + db);
  const dirs = ['retardos', 'nomina_usa'];
  for (const d of dirs) {
    const dir = path.join(RAIZ, 'db', 'migrations', d);
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) psql(db, fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  const api = {
    db,
    q: sql => psql(db, sql),
    // Llama una función que devuelve jsonb y la parsea.
    j: sql => JSON.parse(psql(db, sql)),
    panel: (p, scopes, actor) => JSON.parse(psql(db, "SELECT nomina_usa.panel_seguro($q$" +
      JSON.stringify(Object.assign({ nonce: 'n' + Math.random().toString(36).slice(2) + Date.now(), actor: actor || 'prueba', scopes: scopes || ['nomina_usa:admin'] }, p)) + "$q$::jsonb)")),
    tirar: () => { try { psql('postgres', 'DROP DATABASE IF EXISTS ' + db + ' WITH (FORCE)'); } catch (e) {} }
  };
  process.on('exit', api.tirar);
  return api;
}
function disponible() { try { psql('postgres', 'SELECT 1'); return true; } catch (e) { return false; } }
module.exports = { crear, disponible };
