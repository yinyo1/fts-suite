const { sha256Hex } = require('./sha256');
const crypto = require('crypto');
const fs = require('fs');
const casos = ['', 'abc', 'ñandú ✓ 👍 '.repeat(50), fs.readFileSync(__dirname + '/../../db/migrations/memoria/memoria_0001_fundacion.sql', 'utf8')];
let ok = 0;
for (const c of casos) { const a = sha256Hex(c), b = crypto.createHash('sha256').update(c, 'utf8').digest('hex'); if (a === b) ok++; else console.log('FALLA', JSON.stringify(c.slice(0, 20))); }
console.log(`sha256: ${ok}/${casos.length}`); process.exit(ok === casos.length ? 0 : 1);
