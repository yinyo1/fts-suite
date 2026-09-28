FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY fts_bancos ./fts_bancos
RUN useradd -r -u 10001 app
USER app
# "::" escucha en IPv4 e IPv6: la red privada de Railway usa IPv6.
CMD ["sh", "-c", "uvicorn fts_bancos.app:app --host :: --port ${PORT:-8080} --proxy-headers --no-server-header"]
