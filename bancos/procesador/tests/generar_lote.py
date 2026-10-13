"""Genera tests/fixtures_pdf/lote_sintetico.zip (datos INVENTADOS) para /ensayo en vivo."""
from pathlib import Path

from fixtures import zip_de
from test_pipeline import lote

if __name__ == "__main__":
    destino = Path(__file__).parent / "fixtures_pdf" / "lote_sintetico.zip"
    destino.parent.mkdir(exist_ok=True)
    destino.write_bytes(zip_de(lote()))
    print(destino, destino.stat().st_size)
