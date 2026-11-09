"""El arranque (lunes) abre el hilo; cada solicitud siguiente responde a la anterior en el mismo hilo."""
import base64
import json
import subprocess
from pathlib import Path

AQUI = Path(__file__).resolve().parent


def _correr():
    r = subprocess.run(["node", str(AQUI / "hilo.js")], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def test_la_primera_solicitud_es_raiz_y_no_se_toca():
    x = _correr()
    assert x["lunes_igual"] is True
    assert not any(l.startswith(("In-Reply-To", "References")) for l in x["lunes_cab"])


def test_la_solicitud_siguiente_responde_a_la_anterior_en_el_mismo_hilo():
    x = _correr()
    cab = x["martes_cab"]
    assert f"In-Reply-To: {x['lunes_mid']}" in cab and f"References: {x['lunes_mid']}" in cab
    assert x["martes_irt"] == x["lunes_mid"]
    # misma raíz de 22 bytes + 5 del hijo
    p, h = base64.b64decode(x["lunes_ti"]), base64.b64decode(x["martes_ti"])
    assert len(p) == 22 and len(h) == 27 and h[:22] == p
    assert f"Thread-Index: {x['martes_ti']}" in cab
    lunes_topic = next(l for l in x["lunes_cab"] if l.startswith("Thread-Topic:"))
    assert lunes_topic in cab
    assert sum(1 for l in cab if l.startswith("Message-ID:")) == 1
    assert x["cuerpo_igual"] is True and x["b64_ok"] is True
