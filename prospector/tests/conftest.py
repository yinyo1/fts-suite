import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# #407 (M4/M12): la inteligencia comercial se mudo al repo privado. En un clon PUBLICO
# sin la carpeta privada, una prueba que lee uno de esos archivos no puede correr: se
# reporta como SALTADA con el nombre del archivo, nunca como verde. Con PROSPECTOR_DATOS
# (o el clon hermano de fts-conceptualizador) corren TODAS -- ahi es donde valen.
import pytest  # noqa: E402
from flujo import rutas as _rutas  # noqa: E402

_PRIVADOS = ('catalogo-de-proyectos-fts', 'cuentas-con-proyecto', 'enriquecimiento-tarjetas', 'entregas-fuera-de-corrida',
             'fichas-entregadas', 'medicion-limite-clase-c', 'no-son-prospectos', 'odoo-declarado', 'prospecta-2026-10-06',
             'radar-2026-10-05', 'relacion-de-grupo', 'senales-documentadas', 'ubicacion-de-proyectos')


def _es_privado_ausente(exc):
    return isinstance(exc, FileNotFoundError) and any(p in str(exc) for p in _PRIVADOS)


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    out = yield
    rep = out.get_result()
    if call.excinfo is not None and _es_privado_ausente(call.excinfo.value):
        rep.outcome = 'skipped'
        rep.longrepr = (str(item.fspath), 0, 'Saltada: lee datos privados (PROSPECTOR_DATOS): ' + str(call.excinfo.value).split(':')[-1].strip())

# Estos modulos afirman sobre el CONTENIDO de los datos privados (no solo los leen): sin la
# carpeta privada su codigo carga un vacio a proposito y las afirmaciones no aplican.
_MODULOS_DE_CONTENIDO_PRIVADO = ('test_cargar_del_radar_382', 'test_decisiones_310', 'test_enlazar_ficha_384',
                                 'test_ficha_dos_capas_322', 'test_odoo_antes_de_subir_355', 'test_relacion_de_grupo_355')


def pytest_collection_modifyitems(config, items):
    if _rutas.hay('relacion-de-grupo.json') and _rutas.hay('catalogo-de-proyectos-fts.json'):
        return
    marca = pytest.mark.skip(reason='afirma sobre datos privados; corre con PROSPECTOR_DATOS (#407)')
    for it in items:
        if it.module.__name__.split('.')[-1] in _MODULOS_DE_CONTENIDO_PRIVADO:
            it.add_marker(marca)
