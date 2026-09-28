FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY fts_hojas ./fts_hojas
RUN useradd -r -u 10001 app
USER app
# socket IPv6 de pila dual (ver fts_hojas/main.py)
CMD ["python", "-m", "fts_hojas.main"]
