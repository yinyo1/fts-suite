"""Sesion nocturna 1 (#330) · recorre en navegador automatizado los flujos del prototipo v2 (caso de la Fase 7.2 y
los demas). Uso: python3 scripts/probar_prototipo_v2.py   (requiere playwright y chromium). Escribe datos/prueba_prototipo_v2.json."""
import asyncio, json
from playwright.async_api import async_playwright
import os
URL='file://'+os.path.abspath(os.path.join(os.path.dirname(__file__),'..','prototipo_app_v2.html'))
R=[]
def ok(paso, cond, detalle=''): R.append((paso, 'PASA' if cond else 'FALLA', detalle)); print(('PASA ' if cond else 'FALLA'), paso, '|', detalle)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path=os.environ.get('CHROME','/opt/pw-browsers/chromium-1194/chrome-linux/chrome'))
        pg=await b.new_page(viewport={'width':380,'height':800}); errs=[]; dialogs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        async def on_dialog(d):
            dialogs.append(d.message)
            await (d.accept('e79') if d.type=='prompt' else d.accept())
        pg.on('dialog',lambda d: asyncio.ensure_future(on_dialog(d)))
        t=lambda x:f'[data-t="{x}"]'
        async def click(x): await pg.click(t(x)); await pg.wait_for_timeout(120)
        async def nav(v): await pg.click('#n-'+v); await pg.wait_for_timeout(120)
        async def estado(k): return (await pg.inner_text(t('estado-'+k)))
        async def fotos():
            for f in await pg.query_selector_all('[data-t="foto"]'): await f.click()
            await pg.wait_for_timeout(450)
        async def alertas():
            await nav('alertas'); cards=await pg.query_selector_all('[data-t^="alerta-"]'); out=[]
            for c in cards: out.append((await c.get_attribute('data-t'))[7:]+' '+' '.join((await c.inner_text()).split()))
            await nav('kits'); return out
        await pg.goto(URL); await nav('sim'); await click('reset')
        # ---------------- D: estado inicial, kit huerfano real (Bridgestone)
        al=await alertas(); ok('A1 y A2 marcan FTS-CAR-03 en Bridgestone (ultima asistencia 7-ago)', any('A1' in a and 'CAR-03' in a for a in al) and any('A2' in a and 'CAR-03' in a for a in al), '; '.join(al))
        # ---------------- A: caso 7.2, se queda con otro responsable
        await nav('sim'); await click('martes'); ok('Reloj en martes 21:40', 'martes 2026-09-29 21:40' in await pg.inner_text(t('reloj')))
        await pg.select_option('#pp','e79'); await pg.select_option('#pl2','VTV'); await click('publicar-plan')
        txt=await pg.inner_text(t('tarea')); ok('Plan nocturno abre la reasignacion de FTS-CAR-01 sola', 'FTS-CAR-01' in txt and 'plan nocturno' in txt, txt.replace('\n',' ')[:120])
        n=len(dialogs); await click('tomar-FTS-CAR-04'); await pg.wait_for_timeout(300)
        ok('Con la tarea abierta no puede tomar otro kit', any('No se puede' in d for d in dialogs[n:]), dialogs[-1][:90] if dialogs else '')
        await nav('sim'); await click('mas24') if False else None
        await pg.click('text=+12 h'); await pg.wait_for_timeout(100)
        await pg.select_option('#kp','e79'); await pg.select_option('#kpl','VTV'); await click('checar')
        txt=await pg.inner_text(t('tarea')); ok('La checada en Vertiv vuelve a disparar la misma tarea', 'plan nocturno + kiosko' in txt, txt.split('\n')[2] if '\n' in txt else txt)
        await nav('sim'); await pg.click('text=+12 h')
        al=await alertas(); ok('A las 24 h la tarea escala a Supervisor SR (A7 amarilla)', any(a.startswith('A7') and 'CAR-01' in a and 'Supervisor' in a for a in al), [a for a in al if a.startswith('A7')])
        await nav('sim'); await click('mas24')
        al=await alertas(); ok('A las 48 h escala al Manager (A7 roja)', any(a.startswith('A7') and 'Manager' in a for a in al), [a for a in al if a.startswith('A7')])
        await nav('sim'); await click('senal'); await nav('kits')
        await click('resolver'); await click('op-queda'); await pg.select_option('#nr','e6'); await pg.fill('#nc','1234'); await fotos(); n=len(dialogs); await click('confirmar-queda'); await pg.wait_for_timeout(300)
        ok('Tecnico B sin asistencia hoy ni ayer en Topo Chico no puede quedarse con el kit', any('no tiene asistencia' in d for d in dialogs[n:]), dialogs[-1][:100] if dialogs else '')
        await nav('sim'); await pg.select_option('#kp','e6'); await pg.select_option('#kpl','TCH'); await click('checar'); await nav('kits')
        await click('resolver'); await click('op-queda'); await pg.select_option('#nr','e6'); await pg.fill('#nc','4821'); await fotos(); await click('confirmar-queda')
        txt=await pg.inner_text(t('kit-FTS-CAR-01')); ok('Con checada de hoy, Tecnico B queda como responsable', 'Tecnico B' in txt and await estado('FTS-CAR-01')=='EN_USO', txt.split('\n')[1][:100])
        pend=await pg.inner_text(t('pendientes')); ok('Sin senal: los cambios quedan en el telefono', int(pend)>0, f'{pend} pendientes')
        tt=[await x.inner_text() for x in await pg.query_selector_all(t('tarea'))]
        ok('Ya no hay tarea abierta de FTS-CAR-01 (la checada de Tecnico B en Topo Chico abre, con razon, la de su kit FTS-CAR-02 en Vertiv)', not any('FTS-CAR-01 en' in x for x in tt) and any('FTS-CAR-02' in x for x in tt), [x.split(chr(10))[1][:90] for x in tt])
        await nav('sim'); await click('senal'); await nav('hist')
        env=[await e.inner_text() for e in await pg.query_selector_all(t('envio'))]
        srv=await pg.evaluate("JSON.parse(localStorage.getItem('fts_herr_v2')).srv")
        ev=await pg.evaluate("JSON.parse(localStorage.getItem('fts_herr_v2')).eventos")
        mism=all(any(s['uuid']==e['uuid'] and s['ts_evento']==e['ts'] for s in srv) for e in ev)
        ok('Al volver la senal todo se envia, con la hora ORIGINAL del evento', all(x=='confirmado' for x in env) and mism and len(srv)==len(ev), f'{len(srv)} en servidor, {len(ev)} en telefono')
        await pg.evaluate("(()=>{S.outbox=S.eventos.map(e=>e.uuid);enviar();save()})()")
        srv2=await pg.evaluate("JSON.parse(localStorage.getItem('fts_herr_v2')).srv.length"); ok('Reenviar todo no duplica (servidor idempotente)', srv2==len(srv), f'{srv2}')
        al=await alertas(); ok('Resuelta la tarea, desaparece la A7 de FTS-CAR-01', not any(a.startswith('A7') and 'CAR-01' in a for a in al), [a for a in al if a.startswith('A7')])
        # ---------------- B: transferencia que nadie confirma
        await nav('sim'); await click('reset'); await nav('sim'); await click('martes'); await pg.select_option('#pp','e79'); await pg.select_option('#pl2','VTV'); await click('publicar-plan'); await nav('kits')
        await click('resolver'); await click('op-transf'); await fotos(); await click('confirmar-transf')
        ok('Opcion 2: pasa a EN_TRANSFERENCIA', await estado('FTS-CAR-01')=='EN_TRANSFERENCIA')
        await nav('sim'); await click('mas24'); al=await alertas(); ok('A las 24 h sin recibir: A6', any(a.startswith('A6') and 'CAR-01' in a for a in al))
        await nav('sim'); await click('mas24'); await nav('kits'); ok('A las 48 h sin recibir: EXTRAVIADO', await estado('FTS-CAR-01')=='EXTRAVIADO')
        # ---------------- B2: transferencia confirmada
        await nav('sim'); await click('reset'); await nav('sim'); await click('martes'); await pg.select_option('#pp','e79'); await pg.select_option('#pl2','VTV'); await click('publicar-plan'); await nav('kits')
        await click('resolver'); await click('op-transf'); await fotos(); await click('confirmar-transf'); await click('recibir-FTS-CAR-01'); await fotos(); await click('confirmar-recepcion')
        cas=await pg.inner_text(t('caseta')); tot=await pg.inner_text(t('caseta-total'))
        ok('Quien recibe confirma y sale el formato de ENTRADA de Vertiv', 'ENTRADA' in cas and 'Vertiv' in cas, f'{tot.strip()}')
        await nav('kits'); ok('El kit queda EN_USO en Vertiv', await estado('FTS-CAR-01')=='EN_USO' and 'Vertiv' in await pg.inner_text(t('kit-FTS-CAR-01')))
        # ---------------- C: retiro con formato de salida
        await nav('sim'); await click('reset'); await nav('kits'); await pg.click('[data-t="kit-FTS-CAR-02"] >> text=Retirar'); await fotos(); await pg.click('text=Generar formato de SALIDA')
        cas=await pg.inner_text(t('caseta')); tot=int((await pg.inner_text(t('caseta-total'))).split()[0])
        esperado=await pg.evaluate("listaKit(kit('FTS-CAR-02')).length")
        ok('Retiro: formato de SALIDA con la lista exacta del kit (base + soldadura)', 'SALIDA' in cas and tot==esperado and tot>0, f'{tot} piezas')
        # ---------------- F: caseta configurable
        await nav('plantas'); await pg.click('[data-t="planta-VTV"] >> text=Editar'); await pg.check('input.cc[value=serie]'); await pg.check('#serie_obligatoria')
        await pg.fill('#pl','Bodega de mantenimiento, jaula 3\ncajon general'); await click('guardar-planta')
        lug=await pg.inner_text(t('planta-VTV'))
        ok('Catalogo: rechaza "cajon general" como lugar', 'cajon general' not in lug.lower().split('lugares de resguardo:')[1].split('\n')[0])
        await pg.evaluate("go('casetaVista','FTS-CAR-02|SALIDA')"); await pg.wait_for_timeout(150); cas=await pg.inner_text(t('caseta'))
        ok('Formato de caseta de Vertiv ahora pide No. de serie obligatorio', 'No. de serie (obligatorio)' in cas)
        # ---------------- G: salida de taller y llegada
        await nav('kits'); await pg.click('[data-t="kit-FTS-CAR-04"] >> text=Preparar salida'); await pg.check('input.mods[value=MED]'); await pg.select_option('#dest','BRG'); await fotos(); await pg.click('text=Salir (pasa a EN TRANSITO)')
        ok('Salida de taller: EN_TRANSITO', await estado('FTS-CAR-04')=='EN_TRANSITO')
        await click('llegada-FTS-CAR-04'); await fotos(); await click('confirmar-llegada'); tot=int((await pg.inner_text(t('caseta-total'))).split()[0])
        esperado=await pg.evaluate("listaKit(kit('FTS-CAR-04')).length"); ok('Llegada: formato de ENTRADA con base + medicion', tot==esperado and tot>40, f'{tot} piezas')
        # ---------------- E: revision por foto con deteccion de huecos
        await nav('kits'); await pg.click('[data-t="kit-FTS-CAR-01"] >> text=Revisar'); await pg.wait_for_timeout(200)
        await click('sim-completa'); d=await pg.inner_text(t('deteccion')); ok('Foto completa: ningun hueco', 'HUECO' not in d)
        await pg.select_option('#quita','1'); await click('sim-hueco'); d=await pg.inner_text(t('deteccion'))
        hu=[l for l in d.split('\n') if 'HUECO' in l]; ok('Foto sin la pieza 2 del cajon: detecta exactamente ese hueco', len(hu)==1 and '-02' in hu[0], hu)
        for _ in range(20):
            if not await pg.query_selector(t('sig-cajon')): break
            await click('sig-cajon')
        al=await alertas(); ok('La revision con hueco abre la alerta A4 (faltante)', any(a.startswith('A4') for a in al), [a for a in al if a.startswith('A4')])
        # ---------------- vista de direccion
        await nav('dir'); dt=await pg.inner_text('#app'); ok('Direccion: kits por planta, dias sin revision, alertas y valor', 'herramienta en kits' in dt and 'Dias habiles sin revision' in dt, dt.split('\n')[0:4])
        
        ok('Cero errores de consola en todo el recorrido', not errs, errs[:3])
        await b.close()
    json.dump(R, open(os.path.join(os.path.dirname(__file__),'..','datos','prueba_prototipo_v2.json'),'w'), ensure_ascii=False, indent=1)
    print(sum(r[1]=='PASA' for r in R),'de',len(R))
asyncio.run(main())
