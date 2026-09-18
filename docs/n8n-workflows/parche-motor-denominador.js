/* ══════════════════════════════════════════════════════════════════════════════
   PARCHE · FILTRO DEL DENOMINADOR · para scripts/local/motor-v2.js
   ------------------------------------------------------------------------------
   NO editar la plantilla a mano. Correr:

       node parche-motor-denominador.js scripts/local/motor-v2.js scripts/local/motor-v2.js

   (se puede mandar a otro archivo si prefieres revisar antes de pisar la plantilla)

   Las 6 piezas caen TODAS en la parte COMPARTIDA del cuerpo (las lineas que el
   dry-run y el WRITE tienen identicas), asi que el mismo parche sirve para los dos
   y la invariante de §19 -- "dry-run y WRITE difieren en 2 lineas" -- se mantiene.

   Cada 'find' se valida por CONTEO DE OCURRENCIAS: si no calza exactamente 1 vez,
   ABORTA sin escribir. Y si el reemplazo ya esta presente, tambien aborta (evita
   aplicarlo dos veces).

   DESPUES de parchear la plantilla y regenerar los dos workflows, verifica que el
   nodo 'Odoo - proyectos' de AMBOS pida company_id:
       fieldsList: ["id","account_id","company_id"]
   Sin eso el filtro no puede excluir nada -- por eso el parche mete tambien un
   aviso (pieza 6) que grita si ningun proyecto trae empresa.
   ══════════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const [,, inFile, outFile] = process.argv;
let c = fs.readFileSync(inFile, 'utf8');
const before = c.length;

function rep(tag, find, replace, esperadas) {
  const n = c.split(find).length - 1;
  if (n !== (esperadas === undefined ? 1 : esperadas)) {
    throw new Error('ABORTA · ' + tag + ' · calzo ' + n + ' vez/veces, esperaba ' + (esperadas === undefined ? 1 : esperadas));
  }
  if (c.indexOf(replace) >= 0) throw new Error('ABORTA · ' + tag + ' · el reemplazo YA esta presente (¿parche aplicado dos veces?)');
  c = c.split(find).join(replace);
  console.log('  ok · ' + tag);
}

/* 1 · la empresa de cada proyecto, junto a su cuenta analitica */
rep('R1 projCia',
  "const projAcc={}; for(const p of projRows){ projAcc[p.id]=aId(p.account_id)||false; }",
  "const projAcc={}, projCia={}; for(const p of projRows){ projAcc[p.id]=aId(p.account_id)||false; projCia[p.id]=aId(p.company_id)||null; }\n"
+ "const CIA_MX=1;                      // la nomina que reparte este motor es la MEXICANA");

/* 2 · los acumuladores de lo excluido */
rep('R2 acumuladores',
  "const hrs={}; const LAB={}; const pendientes=[]; const sinDestino=[];",
  "const hrs={}; const LAB={}; const pendientes=[]; const sinDestino=[]; const fuera={}; const fueraCia={};");

/* 3 · el filtro, justo despues de resolver el destino de cada asistencia */
rep('R3 filtro',
  "  if(!key){ if(checkIds.has(e)) sinDestino.push({emp:e,nombre:nmv(a.employee_id),check_in:a.check_in,att_id:a.id}); continue; }\n",
  "  if(!key){ if(checkIds.has(e)) sinDestino.push({emp:e,nombre:nmv(a.employee_id),check_in:a.check_in,att_id:a.id}); continue; }\n"
+ "  /* FILTRO DEL DENOMINADOR — las horas a un proyecto de OTRA empresa NO reparten el\n"
+ "     sueldo mexicano. CONTPAQi ya entrega el bruto MX prorrateado por los dias que si\n"
+ "     fueron de nomina mexicana; si esas horas entran al denominador, el split manda\n"
+ "     dinero mexicano a una analitica de otra empresa y Odoo (_check_company) tumba el\n"
+ "     CREATE a media semana (S36, 17 de 38 lineas escritas).\n"
+ "     Solo excluye cuando la empresa se CONOCE y es distinta: un proyecto que no vino en\n"
+ "     el getAll queda con projCia undefined y NO se excluye — una ausencia no es un valor. */\n"
+ "  if(proj && projCia[proj] && projCia[proj]!==CIA_MX){\n"
+ "    fuera[e]=fuera[e]||{h:0,proy:{}}; fuera[e].h=r2(fuera[e].h+(a.worked_hours||0));\n"
+ "    fuera[e].proy[key]=nmv(a.x_studio_project_id)||('proyecto '+proj);\n"
+ "    fueraCia[e]=projCia[proj];\n"
+ "    continue;\n"
+ "  }\n");

/* 4 · semana completa en otra empresa -> bolsa de su departamento, no al puente */
rep('R4 rama bolsa-depto',
  "      } else if(huboVacDepto){\n"
+ "        const bd=deptBolsa(m.dept)||VAC_FALLBACK; const k='B'+bd;\n"
+ "        add(k,repartible); addLine(m.e,k,repartible,false,bd);\n"
+ "        destinos.push({dest:k,label:label(k),monto:repartible}); regla='vacaciones_total';\n"
+ "      } else {\n",
  "      } else if(huboVacDepto){\n"
+ "        const bd=deptBolsa(m.dept)||VAC_FALLBACK; const k='B'+bd;\n"
+ "        add(k,repartible); addLine(m.e,k,repartible,false,bd);\n"
+ "        destinos.push({dest:k,label:label(k),monto:repartible}); regla='vacaciones_total';\n"
+ "      } else if(fuera[m.e] && fuera[m.e].h>0){\n"
+ "        /* trabajo TODA la semana en proyecto de otra empresa y aun asi trae bruto\n"
+ "           mexicano: va a la BOLSA DE SU DEPARTAMENTO, no al puente. El puente es para\n"
+ "           lo que no se sabe a donde va; aqui si se sabe -- simplemente no es un\n"
+ "           proyecto de esta empresa. Si su bruto mexicano fuera 0 no entra aqui: cae\n"
+ "           mas abajo, en la cola de excepcion, a la vista. */\n"
+ "        const bd=deptBolsa(m.dept)||VAC_FALLBACK; const k='B'+bd;\n"
+ "        add(k,repartible); addLine(m.e,k,repartible,false,bd);\n"
+ "        destinos.push({dest:k,label:label(k),monto:repartible}); regla='semana_en_otra_empresa';\n"
+ "      } else {\n");

/* 5 · el aviso, para que lo excluido se VEA en la respuesta sin tocar la cola */
rep('R5 aviso',
  "/* ── control ── */\nconst sumBruto=",
  "/* ── lo que quedo FUERA del denominador, a la vista en la respuesta ── */\n"
+ "const fueraLista=Object.keys(fuera).map(function(id){ const inf=empById[id]||{}; return { empleado_id:Number(id), nombre:inf.nombre||'', horas:r2(fuera[id].h), company_id:fueraCia[id]||null, proyectos:Object.keys(fuera[id].proy).map(function(k){ return fuera[id].proy[k]; }) }; });\n"
+ "if(fueraLista.length){\n"
+ "  avisosSrv.push({tipo:'HORAS_DE_OTRA_EMPRESA_FUERA_DEL_REPARTO', msg:'se excluyeron del denominador '+r2(fueraLista.reduce(function(s,x){return s+x.horas;},0))+' h de '+fueraLista.length+' persona(s), trabajadas en proyectos de otra empresa. El bruto mexicano se reparte solo entre los destinos de esta empresa.', detalle:fueraLista});\n"
+ "}\n\n"
+ "/* red contra el modo de falla SILENCIOSO: si el nodo 'Odoo - proyectos' deja de pedir\n"
+ "   company_id en fieldsList, projCia queda todo en null, el filtro no excluye nada y el\n"
+ "   reparto vuelve a mandar dinero mexicano a analiticas de otra empresa -- sin un solo\n"
+ "   error. Un filtro que no filtra se ve igual que un filtro que no tenia nada que filtrar. */\n"
+ "if(projRows.length && !projRows.some(function(p){ return p.company_id; })){\n"
+ "  avisosSrv.push({tipo:'SIN_COMPANY_ID_EN_PROYECTOS', msg:'ninguno de los '+projRows.length+' proyectos trae company_id: el filtro del denominador NO puede excluir nada. Revisa que el nodo \\'Odoo - proyectos\\' pida company_id en fieldsList.'});\n"
+ "}\n\n"
+ "/* ── control ── */\nconst sumBruto=");

fs.writeFileSync(outFile, c);
console.log('  ' + inFile.split('/').pop() + ': ' + before + ' -> ' + c.length + ' chars');
