"""
Genera los iconos PNG de la PWA sin dependencias externas
(solo zlib y struct de la librería estándar de Python).

Uso:
    python herramientas/generar_iconos.py

Crea: publico/iconos/icono-192.png, icono-512.png, apple-touch-icon.png,
      publico/iconos/insignia.png (para la insignia de notificaciones)
"""

import math
import os
import struct
import zlib

CARPETA = os.path.join(os.path.dirname(__file__), "..", "publico", "iconos")

FONDO = (18, 26, 31)       # --fondo
LUNA = (138, 180, 216)     # --acento
BRILLO = (116, 198, 157)   # --bien


def mezclar(color_a, color_b, t):
    """Interpola dos colores. t=0 -> a, t=1 -> b."""
    return tuple(round(a + (b - a) * t) for a, b in zip(color_a, color_b))


def dibujar(tamanio, transparente_fuera=False):
    """Devuelve una matriz RGBA con una luna creciente sobre fondo redondeado."""
    n = tamanio
    pixeles = [[(0, 0, 0, 0)] * n for _ in range(n)]
    radio_esquina = n * 0.22
    centro = n / 2

    # Círculo grande de la luna y círculo que la recorta
    luna_r = n * 0.30
    luna_cx, luna_cy = n * 0.52, n * 0.48
    corte_r = n * 0.25
    corte_cx, corte_cy = n * 0.64, n * 0.38

    for y in range(n):
        for x in range(n):
            px, py = x + 0.5, y + 0.5

            # Máscara del fondo: cuadrado con esquinas redondeadas
            dx = max(abs(px - centro) - (centro - radio_esquina), 0)
            dy = max(abs(py - centro) - (centro - radio_esquina), 0)
            dentro_fondo = math.hypot(dx, dy) <= radio_esquina

            if transparente_fuera and not dentro_fondo:
                continue

            # Degradado suave vertical para que no se vea plano
            t = py / n
            color = mezclar(FONDO, (27, 38, 45), t)
            alfa = 255 if (dentro_fondo or not transparente_fuera) else 0

            # Luna creciente
            d_luna = math.hypot(px - luna_cx, py - luna_cy)
            d_corte = math.hypot(px - corte_cx, py - corte_cy)
            if d_luna <= luna_r and d_corte > corte_r:
                # Suavizado del borde
                borde = min(luna_r - d_luna, d_corte - corte_r)
                suave = max(0.0, min(1.0, borde / 1.6))
                color = mezclar(color, LUNA, suave)

            # Pequeña estrella/brote verde abajo a la izquierda
            d_est = math.hypot(px - n * 0.30, py - n * 0.72)
            if d_est <= n * 0.055:
                suave = max(0.0, min(1.0, (n * 0.055 - d_est) / 1.6))
                color = mezclar(color, BRILLO, suave)

            pixeles[y][x] = (color[0], color[1], color[2], alfa)

    return pixeles


def guardar_png(ruta, pixeles):
    """Escribe un PNG RGBA de 8 bits a mano."""
    alto = len(pixeles)
    ancho = len(pixeles[0])
    crudo = bytearray()
    for fila in pixeles:
        crudo.append(0)  # filtro "None" por fila
        for r, g, b, a in fila:
            crudo += bytes((r, g, b, a))

    def trozo(tipo, datos):
        c = struct.pack(">I", len(datos)) + tipo + datos
        return c + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)

    cabecera = struct.pack(">IIBBBBB", ancho, alto, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + trozo(b"IHDR", cabecera)
        + trozo(b"IDAT", zlib.compress(bytes(crudo), 9))
        + trozo(b"IEND", b"")
    )
    with open(ruta, "wb") as f:
        f.write(png)
    print("  ->", os.path.relpath(ruta), f"({len(png) // 1024} KB)")


def main():
    os.makedirs(CARPETA, exist_ok=True)
    print("Generando iconos...")
    # Iconos del manifest: cuadrado completo (mejor para "maskable")
    guardar_png(os.path.join(CARPETA, "icono-192.png"), dibujar(192))
    guardar_png(os.path.join(CARPETA, "icono-512.png"), dibujar(512))
    # iOS recorta el apple-touch-icon él mismo: lo dejamos cuadrado
    guardar_png(os.path.join(CARPETA, "apple-touch-icon.png"), dibujar(180))
    # Insignia monocroma pequeña para notificaciones Android/escritorio
    guardar_png(os.path.join(CARPETA, "insignia.png"), dibujar(96, transparente_fuera=True))
    print("Listo.")


if __name__ == "__main__":
    main()
