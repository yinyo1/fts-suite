// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
// FTS-FILE-ID: iperc-export-R6-20260313
// Verificar: window.FTS_EXPORT_BUILD en consola del browser
// ■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
window.FTS_EXPORT_BUILD = 'iperc-export-R6-20260313';
// ════════════════════════════════════════════════════
// DIFFUSION MODULE
// ════════════════════════════════════════════════════
// ════════════════════════════════════════════════════
// PDF GENERATION — Landscape A4, professional format
// ════════════════════════════════════════════════════
// ════════════════════════════════════════════════════
// EXPORTAR EXCEL — Formato exacto Arca Continental
// ════════════════════════════════════════════════════
async function generateExcel(){
  const btn=document.getElementById('btn-gen-xlsx');
  if(btn){btn.disabled=true;btn.innerHTML='<span>⏳</span> Generando…';}
  try{
    if(!window.ExcelJS){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js';
        s.onload=res; s.onerror=()=>rej(new Error('No se pudo cargar ExcelJS'));
        document.head.appendChild(s);
      });
    }

    // ── Datos del proyecto ──────────────────────────────────────────
    const cli     =(_selectedClient&&_selectedClient.nombre)||'—';
    const fecha   =new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
    const desc    =(document.getElementById('scope-text')||{}).value||'—';
    const lugar   =(document.getElementById('p_lugar')||{}).value||'—';
    const area    =(document.getElementById('p_area')||{}).value||'—';
    const elab    =(document.getElementById('p_elaboro')||{}).value||'—';
    const rev     =(document.getElementById('p_reviso')||{}).value||'—';
    const apro    =(document.getElementById('p_aprobo')||{}).value||'—';
    const cod     =(document.getElementById('p_codigo')||{}).value||'—';
    const pers    =(document.getElementById('p_personal')||{}).value||'—';
    const puestos =(document.getElementById('p_puestos')||{}).value||'—';
    const vigFin  =(function(){
      var d=new Date(); d.setMonth(d.getMonth()+9);
      return d.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
    })();

    function _cn(t){
      if(!t) return t;
      return (t+'')
        .replace(/\bsegún\s+NOM[\w\-\.]+/gi,'').replace(/\baplicar\s+NOM[\w\-\.]+/gi,'')
        .replace(/\by\s+normativa\s+NOM[\w\-\.]+(?:[,\s]+NOM[\w\-\.]+)*/gi,'')
        .replace(/\bNOM[\-\d]+(?:[\-A-Z]+)?([\-\d]+)?/g,'')
        .replace(/\bOSHA\s+\d{4}\.\d+/g,'').replace(/\s{2,}/g,' ').trim();
    }
    function _fixVerif(txt){
      var t=_cn(txt||'');
      if(!t) return t;
      // Si ya empieza con "Vamos a" → ok
      if(/^vamos a /i.test(t)) return t;
      // Si empieza con verbo imperativo → reemplazar
      t=t.replace(/^(Verificar|Revisar|Confirmar|Asegurar|Inspeccionar|Comprobar|Validar)\b/i,
        function(m){return 'Vamos a '+m.toLowerCase();});
      // Si sigue sin "Vamos a" → forzar prefijo
      if(!/^vamos a /i.test(t)) t='Vamos a verificar: '+t;
      return t;
    }

    // ── Grupos desde window._rows (misma fuente que PDF) ───────────
    var _xlRows=window._rows||[];
    if(!_xlRows.length){
      // fallback: construir desde selectedRisks
      var _rawActsXL=window._rawActividades||[];
      var _selR=(state&&state.selectedRisks)||{};
      _rawActsXL.forEach(function(ra){
        var actName=ra.nombre||ra.name;
        (_selR[actName]||[]).forEach(function(r){
          _xlRows.push(Object.assign({},r,{act:actName}));
        });
      });
    }
    if(!_xlRows.length){showToast('⚠️ Primero genera el análisis IPERC',3000);return;}

    // Agrupar por actividad (mismo orden que window._rows)
    var rawActs=window._rawActividades||[];
    var groupMap={}, groupOrder=[];
    _xlRows.forEach(function(r){
      if(!groupMap[r.act]){
        groupMap[r.act]={actName:r.act,risks:[]};
        groupOrder.push(r.act);
      }
      groupMap[r.act].risks.push(r);
    });

    var groups=groupOrder.map(function(actName,gi){
      var g=groupMap[actName];
      var ra=rawActs.find(function(a){return (a.nombre||a.name)===actName;});
      var subsText=(ra&&Array.isArray(ra.subpasos)&&ra.subpasos.length)
        ? ra.subpasos.map(function(s){
            return _cn((s.paso?s.paso+'. ':'')+s.descripcion);
          }).join('\n')
        : '';
      var parts=[
        _cn(ra&&ra.descripcion?ra.descripcion:''),
        ra&&ra.consideraciones?'VERIFICAR: '+_fixVerif(ra.consideraciones):'',
        ra&&ra.nota?'NOTA CRITICA: '+ra.nota:'',
        subsText
      ].filter(Boolean);
      var roles=(ra&&Array.isArray(ra.subpasos))
        ? [...new Set(ra.subpasos.filter(function(s){return s.personal;}).map(function(s){return s.personal;}))]
        : [];
      return {
        actName:actName, paso:ra&&ra.paso?String(gi+1):'',
        fullDesc:(actName+'\n\n'+parts.join('\n')).trim(),
        personalStr:roles.join('\n'),
        risks:g.risks
      };
    });

    // ── ExcelJS workbook ────────────────────────────────────────────
    const wb=new ExcelJS.Workbook();
    wb.creator=(typeof FTS_BUILD!=='undefined')?'FTS DC-3 '+FTS_BUILD:'FTS DC-3';
    wb.created=new Date();
    const ws=wb.addWorksheet('FORMATO IPERC DIGITAL',{
      pageSetup:{orientation:'landscape',paperSize:8,fitToPage:true,fitToWidth:1,fitToHeight:0}
    });

    // Anchos de columna (24 cols)
    ws.columns=[
      {width:7.3},{width:17.8},{width:50},{width:13},{width:30},
      {width:22},{width:5.5},{width:5.5},{width:5.5},{width:12.5},
      {width:18},{width:13},{width:13},{width:22},{width:34},
      {width:24},{width:5.5},{width:5.5},{width:5.5},{width:8},
      {width:18},{width:13},{width:13},{width:13}
    ];

    // Helpers
    function argb(h){return 'FF'+h;}
    function fSolid(h){return {type:'pattern',pattern:'solid',fgColor:{argb:argb(h)}};}
    var BM={top:{style:'medium'},bottom:{style:'medium'},left:{style:'medium'},right:{style:'medium'}};
    var BT={top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}};

    function sc(cell,val,o){
      o=o||{};
      if(val!==undefined&&val!==null) cell.value=val;
      cell.font={bold:!!o.bold,size:o.sz||10,color:{argb:argb(o.fc||'000000')}};
      cell.alignment={horizontal:o.ha||'left',vertical:o.va||'middle',wrapText:o.wrap!==false};
      if(o.fill) cell.fill=fSolid(o.fill);
      cell.border=o.bdr||BT;
    }
    function mc(r1,c1,r2,c2,val,o){
      ws.mergeCells(r1,c1,r2,c2); sc(ws.getCell(r1,c1),val,o||{});
    }
    function grLabel(g){
      if(g>400)return 'INMINENTE';if(g>200)return 'ALTO';
      if(g>70)return 'NOTABLE';if(g>20)return 'MODERADO';return 'ACEPTABLE';
    }
    function grHex(g){
      if(g>400)return 'FF0000';if(g>200)return 'FFC000';
      if(g>70)return 'FFFF00';if(g>20)return '00B050';return '00B0F0';
    }

    // ─── ROW 1: Título ──────────────────────────────────────────────
    ws.getRow(1).height=36.75;
    mc(1,1,1,24,'FORMATO DE IDENTIFICACIÓN DE PELIGROS, EVALUACION DE RIESGO Y CONTROL (IPERC)',
      {bold:true,sz:14,ha:'center',va:'middle',wrap:false,bdr:BM});

    // ─── ROWS 2-6: Info general ────────────────────────────────────
    ws.getRow(2).height=32.65; ws.getRow(3).height=32.65;
    ws.getRow(4).height=32.65; ws.getRow(5).height=33; ws.getRow(6).height=31.15;
    var sL={sz:10,ha:'left',va:'middle',wrap:false,bdr:BT};
    var sV={sz:10,ha:'left',va:'middle',wrap:true,fill:'F2F2F2',bdr:BT};

    mc(2,1,2,2,'Área de Trabajo:',sL);       mc(2,3,2,4,area,sV);
    sc(ws.getCell(2,5),'Descripción del trabajo a realizar:',sL);
    mc(2,6,2,11,desc,sV);
    sc(ws.getCell(2,12),'Elaborado por:',sL); mc(2,13,2,15,elab,sV);
    mc(2,16,2,20,'Firma:',sL);
    sc(ws.getCell(2,21),'Fecha:',sL);         mc(2,22,2,24,fecha,sV);

    mc(3,1,3,2,'Tipo de Operación:',sL);
    mc(3,3,3,4,'☐ Rutinaria          ☐ No Rutinaria',
      {sz:9,ha:'left',va:'middle',wrap:true,fill:'F2F2F2',bdr:BT});
    sc(ws.getCell(3,5),'Lugar donde se llevará a cabo la actividad:',sL);
    mc(3,6,3,11,lugar,sV);
    sc(ws.getCell(3,12),'Revisado por:',sL);  mc(3,13,3,15,rev,sV);
    mc(3,16,3,20,'Firma:',sL);
    sc(ws.getCell(3,21),'Fecha:',sL);          mc(3,22,3,24,fecha,sV);

    mc(4,1,6,2,'Condiciones de\nOperación:',{sz:10,ha:'left',va:'middle',wrap:true,bdr:BT});
    mc(4,3,6,3,'☐ Normal\n☐ Mantenimiento\n☐ Limpieza\n☐ Cambio de Formato\n☐ Emergencia\n☐ Construcción\n☐ Instalación/Desmantelamiento\n☐ Otros:',
      {sz:9,ha:'left',va:'top',wrap:true,fill:'F2F2F2',bdr:BT});
    sc(ws.getCell(4,5),'Personal que realizará la actividad:',sL);
    mc(4,6,4,11,pers,sV);
    sc(ws.getCell(4,12),'Aprobado por:',sL);   mc(4,13,4,15,apro,sV);
    mc(4,16,4,20,'Firma:',sL);
    sc(ws.getCell(4,21),'Fecha:',sL);           mc(4,22,4,24,fecha,sV);

    sc(ws.getCell(5,5),'Puesto que realiza la actividad:',sL);
    mc(5,6,5,11,puestos,sV);
    mc(5,12,6,12,'Equipo de Protección\nPersonal General:',
      {sz:10,ha:'left',va:'middle',wrap:true,bdr:BT});
    mc(5,13,5,20,'Casco, lentes, guantes, zapatos con casquillo, chaleco reflectante.',sV);
    mc(5,21,6,21,'PERIODO DE VIGENCIA DEL IPERC',
      {bold:true,sz:9,ha:'center',va:'middle',wrap:true,bdr:BT});
    sc(ws.getCell(5,22),'DEL:',sL); mc(5,23,5,24,fecha,sV);

    sc(ws.getCell(6,5),'IPERC ID:',{bold:true,sz:10,ha:'left',va:'middle',bdr:BT});
    mc(6,6,6,9,'CODIGO: '+cod,sV);
    sc(ws.getCell(6,10),'REV: —',sL);
    mc(6,13,6,15,'',sV);
    mc(6,16,6,20,'EPP especial según actividades con riesgo específico (altura, soldadura, espacios confinados).',
      {sz:9,ha:'left',va:'middle',wrap:true,fill:'F2F2F2',bdr:BT});
    sc(ws.getCell(6,22),'AL:',sL); mc(6,23,6,24,vigFin,sV);

    // ─── ROW 7: Reglas que salvan vidas ─────────────────────────────
    ws.getRow(7).height=28.5;
    mc(7,1,7,24,'SELECCIONE LAS REGLAS QUE SALVAN VIDAS QUE SEAN APLICABLES AL TRABAJO:',
      {bold:true,sz:11,fc:'FFFFFF',ha:'left',va:'middle',wrap:false,fill:'000000',bdr:BM});

    // ─── ROWS 8-9: Logos placeholder ────────────────────────────────
    ws.getRow(8).height=66.75; ws.getRow(9).height=141;
    mc(8,1,9,3,'FTS',{bold:true,sz:18,fc:'FFFFFF',ha:'center',va:'middle',fill:'000000',bdr:BM});
    mc(8,4,9,24,'',{fill:'F2F2F2',bdr:BM});

    // ─── ROW 10: EVALUACION ─────────────────────────────────────────
    ws.getRow(10).height=24;
    mc(10,1,10,24,'EVALUACION',
      {bold:true,sz:14,fc:'FFFFFF',ha:'center',va:'middle',fill:'C00000',bdr:BM});

    // ─── ROWS 11-12: Headers ────────────────────────────────────────
    ws.getRow(11).height=34.15; ws.getRow(12).height=45;
    var hY={bold:true,sz:9,ha:'center',va:'middle',wrap:true,fill:'FFC000',bdr:BM};
    var hR={bold:true,sz:9,fc:'FFFFFF',ha:'center',va:'middle',wrap:true,fill:'FF0000',bdr:BM};

    mc(11,1,12,1,'Paso No',hY);
    mc(11,2,12,3,'ACTIVIDADES DEL TRABAJO\nPASO A PASO',hY);
    mc(11,4,12,4,'PELIGRO\nIDENTIFICADO',hY);
    mc(11,5,12,5,'DESCRIPCION DEL RIESGO\nASOCIADO AL PELIGRO',hY);
    mc(11,6,12,6,'¿QUIEN PODRIA\nRESULTAR LESIONADO?',hY);
    mc(11,7,11,10,'RIESGO INHERENTE\n(EVALUAR EL RIESGO SIN CONTROLES)',hY);
    mc(11,11,12,11,'CLASIFICACION\nDEL RIESGO',hY);
    mc(11,12,11,16,'MEDIDAS DE CONTROL A IMPLEMENTAR PARA REDUCIR EL GRADO DE RIESGO',hR);
    mc(11,17,11,20,'RIESGO FINAL\n(RIESGO RESIDUAL)',hY);
    mc(11,21,12,21,'CLASIFICACION\nDEL RIESGO',hY);
    mc(11,22,11,24,'EFECTIVIDAD DE LOS CONTROLES',hY);

    sc(ws.getCell(12,7),'C',hY);  sc(ws.getCell(12,8),'E',hY);
    sc(ws.getCell(12,9),'P',hY);  sc(ws.getCell(12,10),'GRADO\nDE RIESGO',hY);
    sc(ws.getCell(12,12),'ELIMINACION',hR);
    sc(ws.getCell(12,13),'SUSTITUCION',hR);
    sc(ws.getCell(12,14),'CONTROLES DE\nINGENIERÍA',hR);
    sc(ws.getCell(12,15),'CONTROLES\nADMINISTRATIVOS',hR);
    sc(ws.getCell(12,16),'EPP',hR);
    sc(ws.getCell(12,17),'C',hY); sc(ws.getCell(12,18),'E',hY);
    sc(ws.getCell(12,19),'P',hY); sc(ws.getCell(12,20),'GR',hY);
    sc(ws.getCell(12,22),'DEFINICION',hY);
    sc(ws.getCell(12,23),'EJECUCION',hY);
    sc(ws.getCell(12,24),'EFECTIVIDAD',hY);

    // ─── ROWS 13+: Datos ────────────────────────────────────────────
    var dataRow=13;
    groups.forEach(function(g){
      var n=g.risks.length, r0=dataRow, r1=dataRow+n-1;
      for(var ri=r0;ri<=r1;ri++) ws.getRow(ri).height=80;

      mc(r0,1,r1,1,g.paso||'',{ha:'center',va:'middle',bold:true,sz:12,bdr:BM});
      mc(r0,2,r1,3,g.fullDesc,{ha:'left',va:'top',sz:10,wrap:true,bdr:BM});

      g.risks.forEach(function(rsk,ri3){
        var dr=r0+ri3;
        var grI=Math.round((rsk.c||0)*(rsk.e||0)*(rsk.p||0));
        var grR=Math.round((rsk.c2||rsk.c||0)*(rsk.e2||rsk.e||0)*(rsk.p2||rsk.p||0));
        var cI=grHex(grI), cR=grHex(grR);
        var lI=grLabel(grI), lR=grLabel(grR);
        var sD={sz:9,ha:'center',va:'middle',wrap:true,bdr:BT};
        var sN={sz:12,ha:'center',va:'middle',wrap:false,bdr:BT};

        // Col 4: tipo peligro
        sc(ws.getCell(dr,4),rsk.tipo||'—',{ha:'center',va:'middle',sz:9,bdr:BT});
        // Col 5: riesgo + consec merged
        var rDesc=_cn(rsk.riesgo||'—')+(rsk.consec?'\n'+_cn(rsk.consec):'');
        sc(ws.getCell(dr,5),rDesc,sD);
        // Col 6: ¿Quién? = personal roles
        // ¿Quién? — roles + fallback roles genéricos si no hay personal
        var _xlQuien=g.personalStr;
        if(!_xlQuien||_xlQuien==='—'||_xlQuien.trim()===''){
          _xlQuien='Supervisor FTS\nTécnico de campo\nAyudante general';
        }
        sc(ws.getCell(dr,6),_xlQuien,{sz:9,ha:'center',va:'middle',wrap:true,bdr:BT});
        // C E P GR inherente
        sc(ws.getCell(dr,7),rsk.c||0,sN);
        sc(ws.getCell(dr,8),rsk.e||0,sN);
        sc(ws.getCell(dr,9),rsk.p||0,sN);
        sc(ws.getCell(dr,10),grI,{bold:true,sz:12,ha:'center',va:'middle',fill:cI,bdr:BT});
        sc(ws.getCell(dr,11),lI,{bold:true,sz:10,ha:'center',va:'middle',fill:cI,bdr:BT});
        // Controles
        var elim=rsk.elim&&rsk.elim!=='N/A'?_cn(rsk.elim):'N/A';
        var sust=rsk.sust&&rsk.sust!=='N/A'?_cn(rsk.sust):'N/A';
        sc(ws.getCell(dr,12),elim,sD);
        sc(ws.getCell(dr,13),sust,sD);
        sc(ws.getCell(dr,14),_cn(rsk.ingenieria||'N/A'),sD);
        sc(ws.getCell(dr,15),_cn(rsk.admin||'—'),sD);
        sc(ws.getCell(dr,16),_cn(rsk.epp||'—'),sD);
        // C E P GR residual
        sc(ws.getCell(dr,17),rsk.c2||rsk.c||0,sN);
        sc(ws.getCell(dr,18),rsk.e2||rsk.e||0,sN);
        sc(ws.getCell(dr,19),rsk.p2||rsk.p||0,sN);
        sc(ws.getCell(dr,20),grR,{bold:true,sz:12,ha:'center',va:'middle',fill:cR,bdr:BT});
        sc(ws.getCell(dr,21),lR,{bold:true,sz:10,ha:'center',va:'middle',fill:cR,bdr:BT});
        // Efectividad
        sc(ws.getCell(dr,22),lI,{bold:true,sz:10,ha:'center',va:'middle',fill:cI,bdr:BT});
        sc(ws.getCell(dr,23),lR,{bold:true,sz:10,ha:'center',va:'middle',fill:cR,bdr:BT});
        sc(ws.getCell(dr,24),rsk.ef||'ALTO',{bold:true,sz:10,ha:'center',va:'middle',bdr:BT});
      });
      dataRow=r1+1;
    });

    // ─── SHEET 2: CLASIFICACION GR ──────────────────────────────────
    const ws2=wb.addWorksheet('CLASIFICACION GR');
    ws2.columns=[{width:16},{width:28},{width:65}];
    ws2.getRow(1).height=24; ws2.getRow(2).height=20;
    ws2.mergeCells('A1:C1');
    sc(ws2.getCell('A1'),'CLASIFICACION DEL RIESGO',
      {bold:true,sz:14,fc:'FFFFFF',ha:'center',va:'middle',fill:'C00000',bdr:BM});
    sc(ws2.getCell(2,1),'GRADO DE RIESGO',{bold:true,sz:10,ha:'center',va:'middle',fill:'FFC000',bdr:BM});
    sc(ws2.getCell(2,2),'CLASIFICACIÓN DEL RIESGO',{bold:true,sz:10,ha:'center',va:'middle',fill:'FFC000',bdr:BM});
    sc(ws2.getCell(2,3),'ACCIONES FRENTE AL RIESGO',{bold:true,sz:10,ha:'center',va:'middle',fill:'FFC000',bdr:BM});

    [['Mayor de 400','Riesgo Inminente / Muy Alto','FF0000','Detención inmediata de la actividad peligrosa hasta que se reduzca el riesgo.'],
     ['Entre 200 y 400','Riesgo Alto','FFC000','Se requiere corrección inmediata. Actividades en suspensión hasta aplicar controles.'],
     ['Entre 70 y 200','Riesgo Notable','FFFF00','Corrección necesaria urgente. El nivel de riesgo debe ser revisado periódicamente.'],
     ['Entre 20 y 70','Riesgo Moderado','00B050','Actividades en esta categoría contienen un nivel de riesgo tolerable con controles.'],
     ['Menos de 20','Riesgo Aceptable / Bajo','00B0F0','El riesgo en este nivel se considera Aceptable / Bajo.']
    ].forEach(function(gr,i){
      var ri=i+3; ws2.getRow(ri).height=36;
      sc(ws2.getCell(ri,1),gr[0],{sz:10,ha:'left',va:'middle',bdr:BT});
      sc(ws2.getCell(ri,2),gr[1],{bold:true,sz:10,ha:'center',va:'middle',fill:gr[2],bdr:BT});
      sc(ws2.getCell(ri,3),gr[3],{sz:9,ha:'left',va:'top',wrap:true,bdr:BT});
    });

    // ─── FILA HUELLA DIGITAL ────────────────────────────────────────
    ws.getRow(dataRow).height=14;
    ws.mergeCells(dataRow,1,dataRow,24);
    sc(ws.getCell(dataRow,1),
      'FTS DC-3 · Generado con: '+window.FTS_EXPORT_BUILD+' | '+window.FTS_AI_BUILD+
      ' · '+new Date().toISOString().slice(0,19).replace('T',' ')+' UTC',
      {sz:8,ha:'center',va:'middle',wrap:false,fc:'888888',bdr:{top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}}});

    // ─── GUARDAR ────────────────────────────────────────────────────
    var slug=cli.replace(/[^a-zA-Z0-9]/g,'_').substring(0,20);
    var buffer=await wb.xlsx.writeBuffer();
    var blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download='IPERC_'+slug+'_'+fecha.replace(/\//g,'-')+'.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ Excel descargado: IPERC_'+slug+'_'+fecha.replace(/\//g,'-')+'.xlsx',3000);

  }catch(err){
    console.error('generateExcel error:',err);
    showToast('❌ Error al generar Excel: '+err.message,4000);
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML='<span>📊</span> Exportar Excel';}
  }
}


// buildIPERCRows legacy
function buildIPERCRows(){
  var rows2=[], rawActs=window._rawActividades||[], selRisks=(state&&state.selectedRisks)||{};
  Object.entries(selRisks).forEach(function([actName,risks]){
    var ra=rawActs.find(function(a){return (a.nombre||a.name)===actName;});
    (risks||[]).forEach(function(r,i){
      rows2.push({paso:i===0?((ra&&ra.paso)||''):'',act:actName,
        desc:i===0?(ra&&ra.descripcion||actName):'',
        num:r.num||i+1,tipo:r.tipo||'',riesgo:r.riesgo||'',consec:r.consec||'',
        c:r.c,e:r.e,p:r.p,admin:r.admin||'',epp:r.epp||'',c2:r.c2,e2:r.e2,p2:r.p2});
    });
  });
  return rows2;
}


async function generatePDF(){
  // ══════════════════════════════════════════════════════════════════
  // PDF formato ARCA CONTINENTAL — colores y estructura del Excel
  // ══════════════════════════════════════════════════════════════════
  const rows=window._rows||[];
  if(!rows.length){showToast('⚠️ Genera el análisis primero (agrega riesgos).');return;}
  const proj=getProj();
  const c=_selectedClient||CLIENT_CONFIG[CLIENT_CONFIG.length-1];
  const btn=document.getElementById('btn-gen-pdf');
  if(btn){btn.disabled=true;btn.innerHTML='<span>⏳</span> Generando...';}

  try{
    const {jsPDF}=window.jspdf;
    // A3 landscape para que quepan todas las columnas igual que el Excel
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3'});
    // ── Huella digital en metadatos del PDF ───────────────────────
    const _build = (typeof FTS_BUILD!=='undefined') ? FTS_BUILD : 'FTS-IPERC-v1.5-20260313-A7F3';
    doc.setProperties({
      title:   'IPERC FTS — Análisis de Riesgos Industrial',
      subject: 'IPERC generado por FTS DC-3 Suite',
      author:  'SERVICIOS FTS SA DE CV',
      keywords: _build,
      creator: 'FTS DC-3 ' + _build
    });
    const W=doc.internal.pageSize.getWidth();  // 420mm
    const H=doc.internal.pageSize.getHeight(); // 297mm
    const ML=7, MR=7; // márgenes
    const TW=W-ML-MR; // ancho útil

    // ── Colores exactos Arca ───────────────────────────────────────
    const C_RED_TITLE = [192, 0,   0  ]; // C00000 - banda EVALUACION
    const C_YELLOW    = [255,192,  0  ]; // FFC000 - encabezados col
    const C_RED_CTRL  = [255, 0,   0  ]; // FF0000 - jerarquía controles
    const C_BLACK     = [  0, 0,   0  ]; // fila 7 y A8:C9
    const C_WHITE     = [255,255, 255 ];
    const C_LIGHT     = [242,242, 242 ]; // F2F2F2 - valores info

    function grFill(gr){
      if(gr>400) return [255,  0,  0];   // Inminente - Rojo
      if(gr>200) return [255,192,  0];   // Alto      - Ámbar
      if(gr>70)  return [255,255,  0];   // Notable   - Amarillo
      if(gr>20)  return [  0,176, 80];   // Moderado  - Verde
      return              [  0,176,240];  // Aceptable - Azul
    }
    function grLabel(gr){
      if(gr>400) return 'INMINENTE';
      if(gr>200) return 'ALTO';
      if(gr>70)  return 'NOTABLE';
      if(gr>20)  return 'MODERADO';
      return 'ACEPTABLE';
    }
    function grTextColor(gr){
      // Amarillo y verde tienen texto negro; rojo/ámbar/azul texto negro también
      return [0,0,0];
    }

    // ══════════════════════════════════════════════════════════════
    // FUNCIÓN: dibujar header en cada página
    // ══════════════════════════════════════════════════════════════
    function drawPageHeader(pageNum, totalPages){
      const x=ML, y=6;

      // ── Fila 1: Título principal ────────────────────────────────
      doc.setFillColor(255,255,255);
      doc.setDrawColor(0,0,0);
      doc.setLineWidth(0.4);
      doc.rect(x, y, TW, 8, 'FD');
      doc.setFont('helvetica','bold');
      doc.setFontSize(10);
      doc.setTextColor(0,0,0);
      doc.text('FORMATO DE IDENTIFICACIÓN DE PELIGROS, EVALUACION DE RIESGO Y CONTROL (IPERC)',
        x+TW/2, y+5.2, {align:'center'});

      const y2=y+8; // fila 2 start

      // ── Filas 2-6: Info general (6 filas × ~5mm) ───────────────
      const ROW_H = 5; // mm por fila info
      const INFO_ROWS = 5;
      const INFO_H = ROW_H * INFO_ROWS; // 25mm total

      // Definir zonas columnas para info (proporcional al TW)
      // Col A-B label | C-D value | E label | F-K value | L label | M-O value | P-T firma | U-X fecha/vigencia
      const zA=x,          wA=22;   // Área de Trabajo label
      const zC=zA+wA,      wC=22;   // Área value
      const zE=zC+wC,      wE=30;   // Descripción label
      const zF=zE+wE,      wF=60;   // Descripción value (F-K)
      const zL=zF+wF,      wL=22;   // Elaborado/Revisado/Aprobado label
      const zM=zL+wL,      wM=35;   // Nombre value (M-O)
      const zP=zM+wM,      wP=16;   // Firma label (P)
      const zQ=zP+wP,      wQ=30;   // Firma space (Q-T)
      const zU=zQ+wQ,      wU=22;   // Fecha label (U)
      const zV=zU+wU,      wV=TW-(zU-x+wU); // Fecha value (V-X)

      function infoLbl(txt, cx, cy, w, h){
        doc.setFillColor(...C_WHITE);
        doc.setDrawColor(0,0,0); doc.setLineWidth(0.2);
        doc.rect(cx,cy,w,h,'FD');
        doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
        doc.setTextColor(0,0,0);
        doc.text(txt, cx+1.5, cy+h/2+2, {maxWidth:w-2});
      }
      function infoVal(txt, cx, cy, w, h){
        doc.setFillColor(...C_LIGHT);
        doc.setDrawColor(0,0,0); doc.setLineWidth(0.2);
        doc.rect(cx,cy,w,h,'FD');
        doc.setFont('helvetica','normal'); doc.setFontSize(7);
        doc.setTextColor(0,0,0);
        doc.text(String(txt||'—'), cx+1.5, cy+h/2+2, {maxWidth:w-2});
      }

      // Fila 2: Área de Trabajo
      infoLbl('Área de Trabajo:',  zA, y2,       wA, ROW_H);
      infoVal(proj.area||'—',      zC, y2,       wC, ROW_H);
      infoLbl('Descripción del trabajo a realizar:', zE, y2, wE, ROW_H);
      infoVal(proj.trabajo||'—',   zF, y2,       wF, ROW_H);
      infoLbl('Elaborado por:',    zL, y2,       wL, ROW_H);
      infoVal(proj.elaboro||'—',   zM, y2,       wM, ROW_H);
      infoLbl('Firma:',            zP, y2,       wP, ROW_H);
      doc.setFillColor(...C_WHITE); doc.rect(zQ,y2,wQ,ROW_H,'FD');
      infoLbl('Fecha:',            zU, y2,       wU, ROW_H);
      infoVal(proj.fecha||'—',     zV, y2,       wV, ROW_H);

      // Fila 3: Tipo de Operación
      const y3=y2+ROW_H;
      infoLbl('Tipo de Operación:', zA, y3,      wA, ROW_H);
      infoVal('',                   zC, y3,      wC, ROW_H);
      infoLbl('Lugar donde se llevará a cabo la actividad:', zE, y3, wE, ROW_H);
      infoVal(proj.lugar||'—',      zF, y3,      wF, ROW_H);
      infoLbl('Revisado por:',      zL, y3,      wL, ROW_H);
      infoVal(proj.reviso||'—',     zM, y3,      wM, ROW_H);
      infoLbl('Firma:',             zP, y3,      wP, ROW_H);
      doc.setFillColor(...C_WHITE); doc.rect(zQ,y3,wQ,ROW_H,'FD');
      infoLbl('Fecha:',             zU, y3,      wU, ROW_H);
      infoVal(proj.fecha||'—',      zV, y3,      wV, ROW_H);

      // Filas 4-6: Condiciones (merged A-B vertical)
      const y4=y3+ROW_H;
      // Col A-B merged 3 filas
      doc.setFillColor(...C_WHITE); doc.setDrawColor(0,0,0); doc.setLineWidth(0.2);
      doc.rect(zA, y4, wA, ROW_H*3, 'FD');
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(0,0,0);
      doc.text('Condiciones de\nOperación:', zA+1.5, y4+4, {maxWidth:wA-2});

      // Col C merged 3 filas — checkboxes
      doc.setFillColor(...C_LIGHT); doc.rect(zC, y4, wC, ROW_H*3, 'FD');
      doc.setFont('helvetica','normal'); doc.setFontSize(5.5); doc.setTextColor(0,0,0);
      const cbLines=['[] Normal','[] Mantenimiento','[] Limpieza','[] Cambio de Formato','[] Emergencia','[] Construccion','[] Instalacion/Desmantelamiento','[] Otros:'];
      cbLines.forEach(function(l,li){ doc.text(l, zC+1.5, y4+2+li*1.8, {maxWidth:wC-2}); });

      // Fila 4
      infoLbl('Personal que realizará la actividad:', zE, y4, wE, ROW_H);
      infoVal(proj.personal||'—',  zF, y4, wF, ROW_H);
      infoLbl('Aprobado por:',     zL, y4, wL, ROW_H);
      infoVal(proj.aprobo||'—',    zM, y4, wM, ROW_H);
      infoLbl('Firma:',            zP, y4, wP, ROW_H);
      doc.setFillColor(...C_WHITE); doc.rect(zQ,y4,wQ,ROW_H,'FD');
      infoLbl('Fecha:',            zU, y4, wU, ROW_H);
      infoVal(proj.fecha||'—',     zV, y4, wV, ROW_H);

      // Fila 5
      const y5=y4+ROW_H;
      infoLbl('Puesto que realiza la actividad:', zE, y5, wE, ROW_H);
      infoVal(proj.puesto||'—',    zF, y5, wF, ROW_H);
      // EPP General label (merged L-L filas 5-6)
      doc.setFillColor(...C_WHITE); doc.rect(zL, y5, wL, ROW_H*2,'FD');
      doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.setTextColor(0,0,0);
      doc.text('Equipo de Protección\nPersonal General:', zL+1, y5+3, {maxWidth:wL-1});
      // EPP valor
      doc.setFillColor(...C_LIGHT); doc.rect(zM, y5, wM+wP+wQ, ROW_H, 'FD');
      doc.setFontSize(6.5);
      doc.text('Casco, lentes, guantes, zapatos con casquillo, chaleco reflectante.',
        zM+1.5, y5+3.5, {maxWidth:wM+wP+wQ-2});
      // Vigencia
      doc.setFillColor(...C_WHITE); doc.rect(zU, y5, wU+wV, ROW_H*2,'FD');
      doc.setFont('helvetica','bold'); doc.setFontSize(6);
      doc.text('PERIODO DE VIGENCIA DEL IPERC', zU+1, y5+3, {maxWidth:wU+wV-2});
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
      doc.text('DEL: '+proj.fecha+'  AL: '+proj.vigencia, zU+1, y5+7.5, {maxWidth:wU+wV-2});

      // Fila 6
      const y6=y5+ROW_H;
      infoLbl('IPERC ID:',         zE, y6, wE, ROW_H);
      infoVal('CODIGO: '+(proj.codigo||'—'), zF, y6, wF, ROW_H);
      // EPP especial
      doc.setFillColor(...C_LIGHT); doc.rect(zM, y6, wM+wP+wQ, ROW_H, 'FD');
      doc.setFontSize(6);
      doc.text('EPP especial según actividades con riesgo específico (altura, soldadura, espacios confinados).',
        zM+1.5, y6+3.5, {maxWidth:wM+wP+wQ-2});

      const y7=y4+ROW_H*3; // y6+ROW_H

      // ── Fila 7: NEGRA — Reglas que Salvan Vidas ──────────────────
      doc.setFillColor(...C_BLACK);
      doc.rect(x, y7, TW, 5, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(7.5);
      doc.setTextColor(255,255,255);
      doc.text('SELECCIONE LAS REGLAS QUE SALVAN VIDAS QUE SEAN APLICABLES AL TRABAJO:',
        x+3, y7+3.5);

      // ── Filas 8-9: Negro (logos) + Blanco (iconos) ───────────────
      const y8=y7+5;
      const wLogoZone=45; // ancho zona negra (col A-C aprox)
      doc.setFillColor(...C_BLACK);
      doc.rect(x, y8, wLogoZone, 12, 'F');
      // Texto "FTS" en blanco en la zona negra
      doc.setFont('helvetica','bold'); doc.setFontSize(11);
      doc.setTextColor(255,255,255);
      doc.text('FTS', x+wLogoZone/2, y8+7, {align:'center'});
      // Zona blanca iconos
      doc.setFillColor(...C_WHITE);
      doc.setDrawColor(0,0,0); doc.setLineWidth(0.2);
      doc.rect(x+wLogoZone, y8, TW-wLogoZone, 12, 'FD');

      // ── Fila 10: EVALUACION rojo oscuro ─────────────────────────
      const y10=y8+12;
      doc.setFillColor(...C_RED_TITLE);
      doc.rect(x, y10, TW, 6, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(11);
      doc.setTextColor(255,255,255);
      doc.text('EVALUACION', x+TW/2, y10+4.2, {align:'center'});

      return y10+6; // Y donde empieza la tabla de riesgos
    }

    // ══════════════════════════════════════════════════════════════
    // CONSTRUIR DATOS DE LA TABLA
    // ══════════════════════════════════════════════════════════════
    const rawActsPdf = window._rawActividades || [];
    function _pdfFullDesc(actName){
      function _stripN(s){ return (s||'').replace(/^\d+[\.-]\s*/,'').trim().toLowerCase(); }
      const aS=_stripN(actName);
      const ra=rawActsPdf.find(function(a){
        return a.nombre===actName||a.name===actName
          ||_stripN(a.nombre||'')===aS||_stripN(a.name||'')===aS
          ||aS.includes(_stripN(a.nombre||'').substring(0,20))
          ||_stripN(a.nombre||'').includes(aS.substring(0,20));
      });
      if(!ra) return actName;
      var parts=[];
      parts.push(ra.nombre||actName);
      if(ra.descripcion) parts.push(_cleanNomRefs(ra.descripcion));
      if(ra.consideraciones){
        var verif=_cleanNomRefs(ra.consideraciones)||'';
        if(!/^vamos a /i.test(verif)){
          verif=verif.replace(/^(Verificar|Revisar|Confirmar|Asegurar|Inspeccionar|Comprobar|Validar)[\s,]/i,
            function(m){return 'Vamos a '+m.trim().toLowerCase()+' ';});
          if(!/^vamos a /i.test(verif)) verif='Vamos a verificar: '+verif;
        }
        parts.push('VERIFICAR: '+verif);
      }
      if(ra.nota) parts.push('NOTA CRITICA: '+ra.nota);
      if(Array.isArray(ra.subpasos)&&ra.subpasos.length){
        ra.subpasos.forEach(function(s){
          // Sin [personal] — el rol va en columna ¿Quién?
          parts.push((s.paso?s.paso+'. ':'')+_cleanNomRefs(s.descripcion||''));
        });
      }
      return parts.join('\n');
    }

    var pdfGroups=[], pdfSeen={};
    rows.forEach(function(r){
      if(!pdfSeen[r.act]){pdfSeen[r.act]=true; pdfGroups.push({act:r.act,risks:[]});}
      pdfGroups[pdfGroups.length-1].risks.push(r);
    });
    // Dedup groups con mismo nombre normalizado (evita duplicados IA+KB)
    (function(){
      function _norm(s){return (s||'').toLowerCase().replace(/[^a-záéíóúñ\s]/gi,'').trim();}
      var seen=[];
      pdfGroups=pdfGroups.filter(function(g){
        var n=_norm(g.act);
        // Preferir el grupo con más riesgos o con subpasos (más detallado)
        var dup=seen.find(function(s){
          return n===_norm(s.act)||n.includes(_norm(s.act).substring(0,12))||_norm(s.act).includes(n.substring(0,12));
        });
        if(dup){
          if(g.risks.length>dup.risks.length){
            dup.act=g.act; dup.risks=g.risks; // reemplazar con el más completo
          }
          return false;
        }
        seen.push(g);
        return true;
      });
    })();

    // ── Construir body ─────────────────────────────────────────────
    const tableBody=[];
    pdfGroups.forEach(function(group, gi){
      var fullDesc=_pdfFullDesc(group.act);
      var span=group.risks.length;
      group.risks.forEach(function(r, ri){
        var grI=Math.round(r.c*r.e*r.p);
        var grR=Math.round((r.c2||r.c)*(r.e2||r.e)*(r.p2||r.p));
        var lI=grLabel(grI), lR=grLabel(grR);
        var cI=grFill(grI),  cR=grFill(grR);
        var tcI=grTextColor(grI), tcR=grTextColor(grR);
        var ctrl=_cleanNomRefs(
          (r.ingenieria&&r.ingenieria!=='N/A'?r.ingenieria+'\n':'N/A\n')
          +'· '+(r.admin||'—'));

        var row=[];
        if(ri===0){
          // Paso (merged)
          row.push({content:String(gi+1), rowSpan:span,
            styles:{valign:'middle',halign:'center',fontStyle:'bold',fontSize:9,
                    fillColor:C_WHITE,textColor:[0,0,0]}});
          // Actividades (merged)
          row.push({content:fullDesc, rowSpan:span,
            styles:{valign:'top',fontSize:6,fillColor:C_WHITE,
                    textColor:[0,0,0],overflow:'linebreak'}});
        }
        // # riesgo
        row.push({content:String(ri+1),styles:{halign:'center',fillColor:C_WHITE,textColor:[0,0,0]}});
        // Tipo peligro
        row.push({content:r.tipo||'—',styles:{halign:'center',fillColor:C_WHITE}});
        // Descripción riesgo = riesgo + consecuencia merged
        var _rDesc=_cleanNomRefs(r.riesgo||'—');
        if(r.consec&&r.consec!=='—') _rDesc+=('\n'+_cleanNomRefs(r.consec));
        row.push({content:_rDesc,styles:{fillColor:C_WHITE,halign:'center',valign:'middle'}});
        // ¿Quién podría resultar lesionado? = roles del personal
        var _quien=(function(){
          var rawA=typeof rawActsPdf!=='undefined'?rawActsPdf:(window._rawActividades||[]);
          var ra2=rawA.find(function(a){return (a.nombre||a.name)===group.act;});
          if(!ra2||!Array.isArray(ra2.subpasos)) return '—';
          var roles=[...new Set(ra2.subpasos.filter(function(s){return s.personal;}).map(function(s){return s.personal;}))];
          return roles.length?roles.join('\n'):'—';
        })();
        // Fallback genérico si no hay roles
        if(!_quien||_quien==='—') _quien='Supervisor FTS\nTécnico de campo\nAyudante general';
        row.push({content:_quien,styles:{fillColor:C_WHITE,fontSize:6,halign:'center',valign:'middle'}});
        // C E P GR inherente
        row.push({content:String(r.c),styles:{halign:'center',fillColor:C_WHITE}});
        row.push({content:String(r.e),styles:{halign:'center',fillColor:C_WHITE}});
        row.push({content:String(r.p),styles:{halign:'center',fillColor:C_WHITE}});
        row.push({content:String(grI),
          styles:{halign:'center',fontStyle:'bold',fillColor:cI,textColor:tcI}});
        // Clasificación inherente
        row.push({content:lI,
          styles:{halign:'center',fontStyle:'bold',fontSize:6,fillColor:cI,textColor:tcI}});
        // Controles (Eliminación / Sustitución / Ingeniería / Admin / EPP)
        var elim=_cleanNomRefs(r.elim&&r.elim!=='N/A'?r.elim:'N/A');
        var sust=_cleanNomRefs(r.sust&&r.sust!=='N/A'?r.sust:'N/A');
        var ing=_cleanNomRefs(r.ingenieria||'N/A');
        var adm=_cleanNomRefs(r.admin||'—');
        var epp=_cleanNomRefs(r.epp||'—');
        row.push({content:elim,styles:{fillColor:C_WHITE,fontSize:5.5,halign:'center',valign:'middle'}});
        row.push({content:sust,styles:{fillColor:C_WHITE,fontSize:5.5,halign:'center',valign:'middle'}});
        row.push({content:ing, styles:{fillColor:C_WHITE,fontSize:5.5,halign:'center',valign:'middle'}});
        row.push({content:adm, styles:{fillColor:C_WHITE,fontSize:5.5,halign:'center',valign:'middle'}});
        row.push({content:epp, styles:{fillColor:C_WHITE,fontSize:5.5,halign:'center',valign:'middle'}});
        // C E P GR residual
        row.push({content:String(r.c2||r.c),styles:{halign:'center',fillColor:C_WHITE}});
        row.push({content:String(r.e2||r.e),styles:{halign:'center',fillColor:C_WHITE}});
        row.push({content:String(r.p2||r.p),styles:{halign:'center',fillColor:C_WHITE}});
        row.push({content:String(grR),
          styles:{halign:'center',fontStyle:'bold',fillColor:cR,textColor:tcR}});
        // Clasificación residual
        row.push({content:lR,
          styles:{halign:'center',fontStyle:'bold',fontSize:6,fillColor:cR,textColor:tcR}});
        // Efectividad
        row.push({content:r.ef||'ALTO',
          styles:{halign:'center',fontStyle:'bold',fillColor:C_WHITE,textColor:[0,0,0]}});
        tableBody.push(row);
      });
    });

    // ══════════════════════════════════════════════════════════════
    // RENDERIZAR PÁGINA 1 CON HEADER
    // ══════════════════════════════════════════════════════════════
    const yTable=drawPageHeader(1,1);

    // ── Encabezados de columna (2 filas — Arca style) ─────────────
    // Fila 11: amarillo — Fila 12: amarillo + rojo para controles
    const hdrAmbar = {fillColor:C_YELLOW, textColor:[0,0,0], fontStyle:'bold', fontSize:6, halign:'center', lineColor:[0,0,0], lineWidth:0.3};
    const hdrRojo  = {fillColor:C_RED_CTRL, textColor:[255,255,255], fontStyle:'bold', fontSize:6, halign:'center', lineColor:[0,0,0], lineWidth:0.3};

    doc.autoTable({
      startY: yTable,
      margin: {left:ML, right:MR},
      styles:{
        fontSize:5.8, cellPadding:1.2,
        lineColor:[0,0,0], lineWidth:0.25,
        font:'helvetica', textColor:[0,0,0],
        overflow:'linebreak', minCellHeight:6
      },
      headStyles:{
        fillColor:C_YELLOW, textColor:[0,0,0],
        fontStyle:'bold', fontSize:6, halign:'center',
        lineColor:[0,0,0], lineWidth:0.3
      },
      head:[
        // Fila 11
        [
          {content:'Paso No',           rowSpan:2, styles:hdrAmbar},
          {content:'ACTIVIDADES DEL TRABAJO\nPASO A PASO', rowSpan:2, styles:hdrAmbar},
          {content:'#',                 rowSpan:2, styles:hdrAmbar},
          {content:'PELIGRO\nIDENTIFICADO', rowSpan:2, styles:hdrAmbar},
          {content:'DESCRIPCION DEL RIESGO\nASOCIADO AL PELIGRO', rowSpan:2, styles:hdrAmbar},
          {content:'¿QUIEN PODRIA\nRESULTAR LESIONADO?', rowSpan:2, styles:hdrAmbar},
          {content:'RIESGO INHERENTE\n(EVALUAR EL RIESGO SIN CONTROLES)', colSpan:4, styles:hdrAmbar},
          {content:'CLASIFICACION\nDEL RIESGO', rowSpan:2, styles:hdrAmbar},
          {content:'MEDIDAS DE CONTROL A IMPLEMENTAR PARA REDUCIR EL GRADO DE RIESGO', colSpan:5, styles:hdrRojo},
          {content:'RIESGO FINAL\n(RIESGO RESIDUAL)', colSpan:4, styles:hdrAmbar},
          {content:'CLASIFICACION\nDEL RIESGO', rowSpan:2, styles:hdrAmbar},
          {content:'EFECTIVIDAD', rowSpan:2, styles:hdrAmbar},
        ],
        // Fila 12
        [
          {content:'C',styles:hdrAmbar},{content:'E',styles:hdrAmbar},
          {content:'P',styles:hdrAmbar},{content:'GRADO\nDE RIESGO',styles:hdrAmbar},
          {content:'ELIMINACION',styles:hdrRojo},{content:'SUSTITUCION',styles:hdrRojo},
          {content:'CONTROLES DE\nINGENIERIA',styles:hdrRojo},
          {content:'CONTROLES\nADMINISTRATIVOS',styles:hdrRojo},
          {content:'EPP',styles:hdrRojo},
          {content:'C',styles:hdrAmbar},{content:'E',styles:hdrAmbar},
          {content:'P',styles:hdrAmbar},{content:'GR',styles:hdrAmbar},
        ]
      ],
      body: tableBody,
      tableWidth: TW,
      columnStyles:{
        0:{cellWidth:8,  halign:'center'},   // Paso No
        1:{cellWidth:75},                    // Actividades
        2:{cellWidth:5,  halign:'center'},   // #
        3:{cellWidth:12, halign:'center'},   // Tipo peligro
        4:{cellWidth:38},                    // Desc riesgo
        5:{cellWidth:28},                    // Quién
        6:{cellWidth:5,  halign:'center'},   // C
        7:{cellWidth:5,  halign:'center'},   // E
        8:{cellWidth:5,  halign:'center'},   // P
        9:{cellWidth:10, halign:'center'},   // GR inherente
        10:{cellWidth:12,halign:'center'},   // Clasif inherente
        11:{cellWidth:18},                   // Eliminación
        12:{cellWidth:18},                   // Sustitución
        13:{cellWidth:34},                   // Ingeniería
        14:{cellWidth:46},                   // Admin
        15:{cellWidth:40},                   // EPP
        16:{cellWidth:5, halign:'center'},   // C2
        17:{cellWidth:5, halign:'center'},   // E2
        18:{cellWidth:5, halign:'center'},   // P2
        19:{cellWidth:10,halign:'center'},   // GR residual
        20:{cellWidth:12,halign:'center'},   // Clasif residual
        21:{cellWidth:10,halign:'center'},   // Efectividad
      },
      theme:'grid',
      // Header en cada página nueva
      didDrawPage: function(data){
        const pg=doc.internal.getCurrentPageInfo().pageNumber;
        if(pg>1){
          // En páginas 2+ solo dibujar la banda EVALUACION y dejar espacio
          const yH=6;
          doc.setFillColor(...C_RED_TITLE);
          doc.rect(ML, yH, TW, 5, 'F');
          doc.setFont('helvetica','bold'); doc.setFontSize(9);
          doc.setTextColor(255,255,255);
          doc.text('EVALUACION — continuación',ML+TW/2, yH+3.5, {align:'center'});
        }
        // Footer en cada página
        const pgN=doc.internal.getCurrentPageInfo().pageNumber;
        const tot=doc.internal.getNumberOfPages();
        doc.setFontSize(5.5); doc.setTextColor(150,150,150);
        doc.setDrawColor(180,180,180); doc.setLineWidth(0.2);
        doc.line(ML, H-7, W-MR, H-7);
        doc.setFont('helvetica','normal');
        doc.text('SERVICIOS FTS SA DE CV  ·  IPERC FORMATO ARCA CONTINENTAL  ·  Método FINE (C×E×P)  ·  Código: '+(proj.codigo||'—'),
          ML, H-4.5);
        doc.text('Generado: '+new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'})
          +'  ·  Pág. '+pgN+' / '+tot+' · '+window.FTS_EXPORT_BUILD, W-MR, H-4.5, {align:'right'});
      }
    });

    // ── Firmas ────────────────────────────────────────────────────
    var ySig=doc.lastAutoTable.finalY+5;
    if(ySig+22>H-10){doc.addPage(); ySig=15;}
    var sigW=(TW)/3;
    [{lbl:'Elaboró · Segurista FTS',     name:proj.elaboro||''},
     {lbl:'Revisó · Supervisor FTS',     name:proj.reviso||''},
     {lbl:`Aprobó · EHS ${c.nombre}`,    name:proj.aprobo||''}
    ].forEach(function(s,i){
      var sx=ML+(i*sigW)+2;
      doc.setDrawColor(120,120,120); doc.setLineWidth(0.3); doc.setLineDash([2,2]);
      doc.line(sx, ySig+9, sx+sigW-8, ySig+9);
      doc.setLineDash([]);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(60,60,60);
      doc.text(s.name||'_______________', sx+(sigW-8)/2, ySig+7, {align:'center',maxWidth:sigW-10});
      doc.setFontSize(6); doc.setTextColor(100,100,100);
      doc.text(s.lbl, sx+(sigW-8)/2, ySig+13, {align:'center'});
    });

    // ── Guardar ───────────────────────────────────────────────────
    var slug=(proj.cliente||c.id||'IPERC').replace(/[^a-zA-Z0-9]/g,'_');
    var fdate=proj.fecha||new Date().toISOString().split('T')[0];
    // ── Huella digital invisible en cada página del PDF ───────────
    // Texto en blanco, tamaño 1pt — no visible pero extraíble con lector PDF
    const _totalPg=doc.internal.getNumberOfPages();
    for(let _pi=1;_pi<=_totalPg;_pi++){
      doc.setPage(_pi);
      doc.setTextColor(255,255,255); doc.setFontSize(1);
      doc.setFont('helvetica','normal');
      doc.text(_build+'|'+fdate+'|p'+_pi, ML, H-0.5);
    }
    doc.save('IPERC_'+slug+'_'+fdate+'.pdf');
    const hint=document.getElementById('pdf-hint');
    if(hint) hint.style.display='block';
    showToast('✅ PDF Arca generado');
  }catch(err){
    console.error('PDF error:',err);
    showToast('⚠️ Error al generar PDF: '+err.message);
  }
  if(btn){btn.disabled=false;btn.innerHTML='<span>📄</span> Generar PDF';}
}

function printIPERC(){
  window.print();
}

function generateDiffusionPDF(){
  const rows=window._rows||[];
  if(!rows.length){showToast('⚠️ Genera el IPERC primero.');return;}
  const proj=getProj();
  const c=_selectedClient||CLIENT_CONFIG[CLIENT_CONFIG.length-1];
  const sorted=[...rows].sort((a,b)=>(b.c*b.e*b.p)-(a.c*a.e*a.p));
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Constancia de Difusión — ${proj.cliente||c.nombre}</title>
  <style>
  *{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:10px;margin:15mm 12mm;color:#111}
  .header{display:flex;align-items:center;gap:12px;border-bottom:3px solid #D83B01;padding-bottom:8px;margin-bottom:10px}
  .fts-badge{background:#D83B01;color:#fff;font-weight:800;font-size:14px;padding:4px 12px;border-radius:4px}
  .header-info h2{font-size:14px;font-weight:700;margin:0}
  .header-info p{font-size:10px;color:#666;margin:2px 0 0}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:9.5px}
  th{background:#1e3a5f;color:#fff;padding:4px 6px;text-align:left}
  td{border:1px solid #ddd;padding:4px 6px;vertical-align:top}
  .lbl{font-weight:600;color:#444;background:#f8f9fa;width:80px}
  .gr-badge{font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;display:inline-block}
  .gr-inim,.gr-alto{background:#991b1b;color:#fff}.gr-not{background:#fef3c7;color:#333}.gr-mod{background:#dcfce7;color:#333}.gr-acep{background:#f5f5f5;color:#777}
  .sig-area{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:20px}
  .sig-block{text-align:center;padding-top:36px;border-top:1px solid #888}
  .att-row td{height:20px}
  @page{size:A4;margin:15mm 12mm}@media print{body{margin:0}}
  </style></head><body>
  <div class="header">
    <div class="fts-badge">FTS</div>
    <div class="header-info">
      <h2>CONSTANCIA DE DIFUSIÓN DE RIESGOS</h2>
      <p>${c.nombre} · ${c.formato} · Método FINE NOM-004-STPS</p>
    </div>
  </div>
  <table><tr>
    <td class="lbl">Cliente</td><td>${proj.cliente||'—'}</td>
    <td class="lbl">Trabajo</td><td>${proj.trabajo||'—'}</td>
    <td class="lbl">Código</td><td>${proj.codigo||'—'}</td>
  </tr><tr>
    <td class="lbl">Área</td><td>${proj.area||'—'}</td>
    <td class="lbl">Lugar</td><td>${proj.lugar||'—'}</td>
    <td class="lbl">Fecha</td><td>${proj.fecha||'—'}</td>
  </tr></table>
  <br>
  <table><thead><tr><th style="width:20px">#</th><th style="width:80px">Actividad</th><th>Peligro / Riesgo</th><th style="width:60px">GR / Nivel</th><th>Controles Clave</th><th style="width:90px">EPP</th></tr></thead>
  <tbody>${sorted.map((r,i)=>{
    const gr=r.c*r.e*r.p;const lv=grLevel(gr);
    const ctrl=Array.isArray(r.admin)?r.admin.join(' · '):(r.admin||'—');
    return `<tr><td style="text-align:center">${i+1}</td><td>${r.act}</td><td><strong>${r.riesgo}</strong><br><span style="color:#666;font-size:9px">${r.consec||''}</span></td><td style="text-align:center"><span class="gr-badge ${lv.cls}">${gr}</span></td><td style="font-size:9px">${ctrl}</td><td style="font-size:9px">${r.epp||'—'}</td></tr>`;
  }).join('')}</tbody></table>
  <br>
  <strong style="font-size:10px">Lista de Asistencia — Personal que recibió la difusión</strong>
  <table style="margin-top:5px"><thead><tr><th style="width:20px">#</th><th>Nombre Completo</th><th style="width:90px">Puesto</th><th style="width:70px">No. Empleado</th><th style="width:80px">Firma</th></tr></thead>
  <tbody>${Array.from({length:14},(_,i)=>`<tr class="att-row"><td style="text-align:center">${i+1}</td><td></td><td></td><td></td><td></td></tr>`).join('')}</tbody></table>
  <div class="sig-area">
    <div class="sig-block"><div>${proj.elaboro||'_______________'}</div><div style="color:#666;font-size:9px;margin-top:3px">Elaboró · Segurista FTS</div></div>
    <div class="sig-block"><div>${proj.reviso||'_______________'}</div><div style="color:#666;font-size:9px;margin-top:3px">Revisó · Supervisor FTS</div></div>
    <div class="sig-block"><div>${proj.aprobo||'_______________'}</div><div style="color:#666;font-size:9px;margin-top:3px">Aprobó · EHS ${c.nombre}</div></div>
  </div>
  <div style="margin-top:16px;padding-top:6px;border-top:1px solid #eee;font-size:8px;color:#aaa;text-align:center">
    SERVICIOS FTS SA DE CV · Análisis de Riesgos · Método FINE NOM-004-STPS · Generado ${new Date().toLocaleDateString('es-MX')}
  </div>
  <script>window.onload=()=>{setTimeout(()=>{window.print();},400)}<\/script>
  </body></html>`);
  w.document.close();
}

