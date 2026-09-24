"""Lo descartado deja de depender de la memoria."""
import pytest
from flujo.catalogo import exigir_permitida, FuenteProhibida, DESCARTADAS


@pytest.mark.parametrize("fuente", sorted(DESCARTADAS))
def test_toda_fuente_descartada_se_rechaza_con_su_razon(fuente):
    with pytest.raises(FuenteProhibida) as e:
        exigir_permitida(fuente)
    assert "Razon:" in str(e.value) and len(str(e.value)) > 60


def test_linkedin_autenticado_nombra_el_riesgo_real():
    with pytest.raises(FuenteProhibida, match="BANEO"):
        exigir_permitida("linkedin_autenticado")


def test_las_permitidas_pasan():
    for f in ("leadiq", "prensa", "pdf_publico", "denue", "outlook"):
        exigir_permitida(f)
