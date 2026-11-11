#!/usr/bin/env node
// Arma el jsCode del nodo 'Code - Verificar token' = cripto JWT (la MISMA de fin/bancos-data) + logica.js.
//   node construir.js <tolerante|estricto> <chat-apply|chat-direct>   → imprime el código
'use strict';
const fs = require('fs'), path = require('path');
const [modo, flujo] = process.argv.slice(2);
if (!/^(tolerante|estricto)$/.test(modo || '') || !/^(chat-apply|chat-direct)$/.test(flujo || '')) { console.error('uso: construir.js <tolerante|estricto> <chat-apply|chat-direct>'); process.exit(2); }
const cripto = fs.readFileSync(path.join(__dirname, '..', 'fin-bancos-data', 'code', 'cripto_jwt.js'), 'utf8');
let logica = fs.readFileSync(path.join(__dirname, 'logica.js'), 'utf8');
for (const [k, v] of [['__MODO__', modo], ['__FLUJO__', flujo]]) { if (logica.split(k).length - 1 !== 1) throw new Error(k); logica = logica.replace(k, v); }
process.stdout.write(cripto + '\n' + logica);
