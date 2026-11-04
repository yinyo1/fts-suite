FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY fts_bancos ./fts_bancos
RUN useradd -r -u 10001 app
USER app
# socket IPv6 de pila dual (ver fts_bancos/main.py)
CMD ["python", "-m", "fts_bancos.main"]
