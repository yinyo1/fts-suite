"""Arranque con un socket IPv6 de pila DUAL (acepta IPv4 e IPv6).

asyncio marca IPV6_V6ONLY al abrir '::', y entonces el healthcheck de Railway
(IPv4) no llega. La red privada usa IPv6. Un solo socket con V6ONLY=0 sirve a los dos."""
import asyncio
import os
import socket

import uvicorn


def main():
    port = int(os.environ.get("PORT", "8080"))
    try:
        s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        s.bind(("::", port))
    except OSError:  # máquina sin IPv6
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("0.0.0.0", port))
    config = uvicorn.Config("fts_hojas.app:app", proxy_headers=True, server_header=False, log_level="info")
    asyncio.run(uvicorn.Server(config).serve(sockets=[s]))


if __name__ == "__main__":
    main()
