// ═══ Fuente del workflow n8n `comercial/limpieza-2026-08` ═══
//
// Se crea con `create_workflow_from_code` (SDK de n8n). Vive aquí para que el
// artefacto que corre en producción sea revisable en el PR, no solo en la UI.
//
// Principio (issue #131): **n8n EJECUTA una lista, no vuelve a razonar.** La
// lógica de decisión vive en el dry-run (PR #132) y quedó congelada en
// `comercial/lotes-limpieza-2026-08.json`, que este workflow descarga por SHA
// fijo — no por rama — para que la lista no pueda cambiar debajo de la corrida.
//
// Nace INACTIVO y se queda inactivo: es one-shot, se dispara a mano con
// `execute_workflow` en modo manual pasando `webhookData.body`.
//
//   { "lote": "L0" | "L1" | "L2" | "L3" | "L4A" | "L4B",
//     "dry_run": true|false,        // default true: sin dry_run:false NO escribe
//     "limite": 5,                  // 0 = sin límite
//     "offset": 0,
//     "lost_reason_id": 17 }        // solo L1
//
// L0 es el paso previo de L1: crea el `crm.lost.reason` "Cancelada (limpieza
// 2026-08)" y devuelve su id, que luego se pasa como `lost_reason_id`.

'use strict';

const SHA = '5127beddef38f739aca81b10c22fa2d7686fe084';
const URL_LISTAS = `https://raw.githubusercontent.com/yinyo1/fts-suite/${SHA}/comercial/lotes-limpieza-2026-08.json`;
const CRED = { odooApi: { id: 'Wansi69xesEqEiY1', name: 'Odoo FTS' } };
const MARCA = '[limpieza-2026-08]';
const MOTIVO_PERDIDA = 'Cancelada (limpieza 2026-08)';

// ── Code - Plan ──────────────────────────────────────────────────────────────
// Traduce (lote, listas congeladas) → una operación por registro. NO decide
// nada: solo desdobla la lista. `_ruta` es lo único que lee el Switch.
const jsPlan = `
const p = ($('Webhook').first().json.body) || {};
const lote = String(p.lote || '').toUpperCase();
const dryRun = p.dry_run !== false;          // fail-closed: solo dry_run:false escribe
const limite = Number(p.limite || 0);
const offset = Number(p.offset || 0);
const lostReasonId = p.lost_reason_id;

// GitHub raw sirve text/plain -> el nodo HTTP entrega el JSON como STRING en
// .data, no parseado. Aceptamos ambas formas para no depender de ese detalle.
let crudo = $('HTTP - GET listas').first().json;
if (typeof crudo === 'string') crudo = JSON.parse(crudo);
else if (typeof crudo.data === 'string') crudo = JSON.parse(crudo.data);
const listas = crudo;
if (!listas || !listas._meta) throw new Error('No se pudieron leer las listas congeladas');

const LOTES = ['L0','L1','L2','L3','L4A','L4B'];
if (!LOTES.includes(lote)) throw new Error('lote invalido: ' + lote + '. Usa uno de ' + LOTES.join(', '));
if (lote === 'L1' && !lostReasonId) throw new Error('L1 requiere lost_reason_id (corre primero el lote L0)');

const MARCA = ${JSON.stringify(MARCA)};
let ops = [];

if (lote === 'L0') {
  ops.push({ _ruta: 'L0', motivo: ${JSON.stringify(MOTIVO_PERDIDA)} });
} else if (lote === 'L1') {
  for (const id of listas.L1.ids) {
    ops.push({ _ruta: 'L1', lead_id: id, v_lost_reason_id: lostReasonId,
      nota: MARCA + ' L1: estaba en etapa CANCELADO -> marcada como perdida y archivada. Reversible con el respaldo pre-limpieza.' });
  }
} else if (lote === 'L2') {
  for (const mov of listas.L2.movimientos) {
    for (const id of mov.ids) {
      ops.push({ _ruta: 'L2', lead_id: id, v_stage_id: mov.destino,
        nota: MARCA + ' L2: etapa ' + mov.origen + ' -> ' + mov.destino + ' (consolidacion 12 etapas -> 5, decision #131).' });
    }
  }
} else if (lote === 'L3') {
  for (const id of listas.L3.ids) {
    ops.push({ _ruta: 'L3', lead_id: id,
      nota: MARCA + ' L3: proyecto ganado archivado (cierre de ciclo comercial). Sigue existiendo y es recuperable.' });
  }
} else if (lote === 'L4A' || lote === 'L4B') {
  for (const it of listas.L4.items) {
    const aRevisar = !it.dueno;
    if (lote === 'L4A' && aRevisar) continue;
    if (lote === 'L4B' && !aRevisar) continue;
    if (aRevisar) {
      ops.push({ _ruta: 'L4B', lead_id: it.id, v_stage_id: it.cambios.stage_id,
        nota: MARCA + ' L4: dandole de ex-FTS sin dueno resoluble -> etapa Revisar, dandole vacio. Reversible en la revision semanal.' });
    } else {
      ops.push({ _ruta: 'L4A', lead_id: it.id, v_dndole: it.cambios.x_studio_dndole,
        nota: MARCA + ' L4: dandole de ex-FTS reasignado a ' + it.dueno + ' (via ' + it.via + ', decision #131).' });
    }
  }
}

const total = ops.length;
ops = ops.slice(offset, limite > 0 ? offset + limite : undefined);

// El plan viaja en cada item para que el reporte lo vea aunque no se escriba.
const meta = { lote, dry_run: dryRun, limite, offset, total_en_lista: total,
  seleccionados: ops.length, ids: ops.map(o => o.lead_id), sha_listas: ${JSON.stringify(SHA)} };

if (dryRun || ops.length === 0) {
  return [{ json: { _ruta: 'NADA', _meta: meta, _plan: ops } }];
}
return ops.map(o => ({ json: Object.assign({ _meta: meta }, o) }));
`;

// ── Code - Reporte ───────────────────────────────────────────────────────────
const jsReporte = `
const items = $input.all();
const meta = $('Code - Plan').first().json._meta || {};
const escribio = meta.dry_run === false && meta.seleccionados > 0;
const salida = {
  ok: true,
  lote: meta.lote,
  dry_run: meta.dry_run,
  sha_listas: meta.sha_listas,
  total_en_lista: meta.total_en_lista,
  seleccionados: meta.seleccionados,
  ids_planeados: meta.ids,
  items_de_salida: items.length,
  nota: escribio
    ? 'ESCRITO. Verificar con read-back independiente contra Odoo.'
    : 'DRY-RUN: no se escribio nada. Manda dry_run:false para ejecutar.',
};
if (meta.lote === 'L0') salida.creados = items.map(i => i.json.id).filter(Boolean);
if (!escribio) salida.plan = $('Code - Plan').first().json._plan;
return [{ json: salida }];
`;

// ── Helpers de construcción ──────────────────────────────────────────────────
const campo = (fieldName, valor) => ({ fieldName, fieldValue: valor });

/** Nodo Odoo v1 `custom/update` sobre crm.lead. */
const odooUpdate = (nombre, campos) => ({
  name: nombre,
  parameters: {
    resource: 'custom',
    operation: 'update',
    customResource: 'crm.lead',
    customResourceId: '={{ $json.lead_id }}',
    fieldsToCreateOrUpdate: { fields: campos },
  },
  credentials: CRED,
});

module.exports = {
  SHA, URL_LISTAS, CRED, MARCA, MOTIVO_PERDIDA,
  jsPlan, jsReporte, campo, odooUpdate,
};

// ═══ Quirks encontrados al construirlo (2026-08-30) — no re-descubrir ═══
//
// 1. **El workflow vive en n8n con id `buJ1oxU7OpwVCxlk`, INACTIVO.** No tiene
//    Schedule; el webhook existe solo como puerta de entrada del payload. Se
//    dispara a mano con `execute_workflow` en modo manual.
//
// 2. **`create_workflow_from_code` NO guarda las credenciales** aunque el código
//    las declare (`autoAssignedCredentials: []` en la respuesta). Hay que
//    aplicarlas después con `update_workflow` / `setNodeCredential`, una por
//    nodo Odoo. Read-back obligatorio: sin credencial el nodo falla en runtime,
//    no al crear.
//
// 3. **GitHub raw sirve `text/plain`** → el nodo HTTP Request entrega el JSON
//    como STRING en `$json.data`, no parseado. `listas._meta` sale `undefined`
//    y el guardarraíl aborta. Por eso `Code - Plan` parsea defensivamente.
//
// 4. **Los ids numéricos van como EXPRESIÓN, no como literal de texto.** Poner
//    `fieldValue: '3'` manda el string `"3"` por JSON-RPC y Odoo intenta
//    `res.partner('3',)` → `MissingError: Record does not exist`, aunque el
//    partner 3 exista y esté activo. La forma correcta es `={{ 3 }}`.
//    ⚠️ El error ENGAÑA: dice "no existe" cuando el problema es el tipo. Antes
//    de creerle, verificar el registro (aquí: partner 3 = "Jesus Esteban De La
//    Cruz", activo). CLAUDE.md §18 #4 sigue siendo correcto — author_id = 3.
//
// 5. **`mail.message` está en denylist dura del MCP de Odoo** y `message_ids`
//    no se devuelve en `crm.lead`. La nota de chatter es el ÚNICO efecto de
//    este workflow que NO se puede verificar por API desde aquí: se confirma
//    abriendo un lead en Odoo. Todo lo demás (active, stage_id, lost_reason_id,
//    x_studio_dndole) sí tiene read-back independiente.
