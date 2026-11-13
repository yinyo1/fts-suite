const P=require('./dc3-periodo.js');
const C={A8:{nombre:'A',hrs:8},B6:{nombre:'B',hrs:6},B4:{nombre:'B4',hrs:4},C12:{nombre:'C',hrs:12},D16:{nombre:'D',hrs:16}};
const d='2026-11-20';
const casos=[
['8h 1 dia pasa',[{id:1,empleado:'e1',curso:'A8',ini:d,fin:d}],0],
['12h 1 dia pasa',[{id:1,empleado:'e1',curso:'C12',ini:d,fin:d}],0],
['16h 1 dia bloquea',[{id:1,empleado:'e1',curso:'D16',ini:d,fin:d}],1],
['16h 2 dias pasa',[{id:1,empleado:'e1',curso:'D16',ini:d,fin:'2026-11-21'}],0],
['A8+B6 bloquea',[{id:1,empleado:'e1',curso:'A8',ini:d,fin:d},{id:2,empleado:'e1',curso:'B6',ini:d,fin:d}],2],
['A8+B4 pasa',[{id:1,empleado:'e1',curso:'A8',ini:d,fin:d},{id:2,empleado:'e1',curso:'B4',ini:d,fin:d}],0],
['dup A8x2 bloquea',[{id:1,empleado:'e1',curso:'A8',ini:d,fin:d},{id:2,empleado:'e1',curso:'A8',ini:d,fin:d}],2],
['2 personas C12 pasa',[{id:1,empleado:'e1',curso:'C12',ini:d,fin:d},{id:2,empleado:'e2',curso:'C12',ini:d,fin:d}],0],
['fin<ini',[{id:1,empleado:'e1',curso:'A8',ini:d,fin:'2026-11-19'}],1],
];
let ok=true;
for(const regla of ['parejo','llenar']) for(const cf of [true,false]) for(const [n,a,exp] of casos){const r=P.validarLote(a,C,{reparto:regla,contarFines:cf});const g=r.conError===exp; if(!g)ok=false; console.log(g?'OK ':'XX ',regla,cf,n,r.conError, JSON.stringify(Object.values(r.porAsignacion).map(x=>x.errores.map(e=>e.texto))));}
// 2026-11-20 is Friday: 16h fri->sat with contarFines=false must block
console.log(new Date('2026-11-20T00:00:00Z').getUTCDay(), P.finMinima('2026-11-20',16,12,false), P.finMinima('2026-11-20',16,12,true));
process.exit(ok?0:1)
