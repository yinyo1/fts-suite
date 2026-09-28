# memoria-derivados · servicio aparte con ffmpeg (R5 de #328). NO DESPLEGADO.
# Red privada de Railway, sin dominio público. Variables en README.md.
FROM oven/bun:1.3-alpine
RUN apk add --no-cache ffmpeg \
 && adduser -D -H derivados
WORKDIR /app
COPY ffmpeg.ts proveedores.ts servicio.ts ./
USER derivados
ENV PORT=8080 HOST=::
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- "http://127.0.0.1:${PORT}/salud" >/dev/null || exit 1
CMD ["bun", "servicio.ts"]
