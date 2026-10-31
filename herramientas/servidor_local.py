"""
Servidor local para probar Calma sin pelear con la caché.

El servidor de Python manda cabeceras que hacen que el navegador (y el
service worker) se queden con los archivos viejos. Para desarrollar eso
es un fastidio: cambias un .js y no se ve. Este manda "no-store" en todo.

Además hace de puente con la API de lenguaje en /api/chat, para poder
afinar el chat SIN desplegar nada en Cloudflare todavía. La clave vive
en una variable de entorno de tu PC: nunca en el código ni en la app.

    setx ANTHROPIC_API_KEY "tu-clave"      (Windows, una sola vez)
    python herramientas/servidor_local.py  (abre una consola nueva después de setx)

Sin la clave el servidor funciona igual; /api/chat responde "sin clave"
y la app se queda con su clasificador local.

Uso:
    python herramientas/servidor_local.py           # puerto 8100
    python herramientas/servidor_local.py 9000      # otro puerto
"""

import json
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "publico")

# El mismo modelo que usará el Worker cuando despliegues. Cambiarlo aquí
# y allá es lo único que hace falta para probar otro.
#   claude-haiku-5-5   $0.10 / $0.50 por millón de tokens  (el barato)
#   claude-sonnet-5-5  $2.00 / $10.00                      (más listo)
MODELO = os.environ.get("CALMA_MODELO", "claude-haiku-5-5")

API_URL = "https://api.anthropic.com/v1/messages"
VERSION_API = "2023-06-01"

# Cuánto esperamos a la API antes de rendirnos y usar lo local
ESPERA = 25


def clave():
    return (os.environ.get("ANTHROPIC_API_KEY") or "").strip()


def llamar_api(cuerpo):
    """
    Manda la petición a la API y devuelve (estado, datos).
    Nunca lanza: un fallo aquí tiene que dejar la app funcionando con
    su clasificador local, no romperla.
    """
    k = clave()
    if not k:
        return 503, {"error": "sin-clave",
                     "detalle": "Falta ANTHROPIC_API_KEY en el entorno."}

    datos = json.dumps(cuerpo).encode("utf-8")
    peticion = urllib.request.Request(
        API_URL,
        data=datos,
        method="POST",
        headers={
            "content-type": "application/json",
            "x-api-key": k,
            "anthropic-version": VERSION_API,
        },
    )

    try:
        with urllib.request.urlopen(peticion, timeout=ESPERA) as respuesta:
            return 200, json.loads(respuesta.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detalle = ""
        try:
            detalle = e.read().decode("utf-8")[:400]
        except Exception:
            pass
        print(f"  [api] HTTP {e.code}: {detalle}")
        return e.code, {"error": "api", "estado": e.code, "detalle": detalle}
    except Exception as e:  # red caída, DNS, timeout…
        print(f"  [api] {type(e).__name__}: {e}")
        return 502, {"error": "red", "detalle": str(e)}


class SinCache(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    # ───────── Puente con la API ─────────

    def do_POST(self):
        if self.path.rstrip("/") != "/api/chat":
            self.send_error(404, "No existe")
            return

        try:
            largo = int(self.headers.get("Content-Length") or 0)
            entrada = json.loads(self.rfile.read(largo).decode("utf-8")) if largo else {}
        except Exception:
            self.responder(400, {"error": "cuerpo-invalido"})
            return

        estado, datos = llamar_api(entrada)
        self.responder(estado if estado in (200, 503) else 502, datos)

    def responder(self, estado, datos):
        cuerpo = json.dumps(datos).encode("utf-8")
        self.send_response(estado)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    # ───────── Cabeceras ─────────

    def end_headers(self):
        # Nada de caché: siempre la última versión del archivo
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # La app es privada aunque sea en local
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        super().end_headers()

    def log_message(self, formato, *args):
        # Solo mostramos los errores, no cada archivo servido
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(formato, *args)


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8100
    # Cadena vacía = todas las interfaces, igual que `python -m http.server`.
    # Atarlo solo a 127.0.0.1 falla en Windows cuando "localhost" resuelve a IPv6.
    #
    # ThreadingHTTPServer y no HTTPServer: con un solo hilo, una conexión
    # que el navegador deja abierta (keep-alive) bloquea todo el servidor.
    servidor = ThreadingHTTPServer(("", puerto), SinCache)
    print(f"Calma en http://localhost:{puerto}  (sin cache)")
    if clave():
        print(f"API de lenguaje: lista, modelo {MODELO}")
    else:
        print("API de lenguaje: apagada (sin ANTHROPIC_API_KEY).")
        print("  La app funciona igual, con su clasificador local.")
    print("Ctrl+C para parar")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")


if __name__ == "__main__":
    main()
