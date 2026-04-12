// ═══ Utilidades ═══

export function esc(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

export function sel(opts,val,key,ph){return`<select onchange="upd('${key}',this.value)"><option value="">${ph||'Seleccionar...'}</option>${opts.map(o=>`<option value="${esc(o)}"${o===val?' selected':''}>${esc(o)}</option>`).join('')}</select>`}

export function inp(val,key,ph,type){return`<input type="${type||'text'}" value="${esc(val)}" onchange="upd('${key}',this.value)" placeholder="${esc(ph||'')}">`}

export function tog(val,key,label){return`<div class="tog" onclick="toggl('${key}')"><div class="tog-t ${val?'on':'off'}"><div class="tog-th"></div></div><span>${label}</span></div>`}

export function field(l,c,req,hint){return`<div class="fld"><label>${l}${req?'<span class="req"> *</span>':''}</label>${hint?`<div class="hn">${hint}</div>`:''}${c}</div>`}

export function hintBox(t,icon,title,text){return`<div class="hint ${t}"><div class="ht">${icon} ${title}</div><div class="hb">${text}</div></div>`}

export function notes(key,ph){return`<div class="notes-box"><div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><span style="font-size:14px">💬</span><span style="font-size:12px;font-weight:700;color:#7f8c8d;text-transform:uppercase;letter-spacing:1px">Comentarios del Diseñador</span></div><textarea rows="3" onchange="upd('${key}',this.value)" placeholder="${esc(ph)}" style="background:#fefef6;border-color:#e8e4c9">${esc(D[key])}</textarea></div>`}
