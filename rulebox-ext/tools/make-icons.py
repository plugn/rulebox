#!/usr/bin/env python3
"""Генерация иконок расширения Rulebox (16/32/48/128).

Запуск из каталога rulebox-ext:

    python3 tools/make-icons.py

Нужен Pillow: pip install pillow
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent.parent / "icons"
SIZES = (16, 32, 48, 128)

BOX_FILL = (199, 210, 254, 255)   # светлая заливка рулбокса
BOX_LINE = (37, 99, 235, 255)     # синяя рамка
HANDLE_FILL = (255, 255, 255, 255)


def make_icon(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    stroke = max(2, round(size * 0.07))
    inset = max(1, round(size * 0.10))
    left = inset
    top = round(size * 0.20)
    right = size - inset - round(size * 0.14)
    bottom = size - inset

    draw.rectangle([left, top, right, bottom], fill=BOX_FILL, outline=BOX_LINE, width=stroke)

    # Кнопка-ресайзер, центрированная на правом нижнем углу рулбокса.
    handle = max(6, round(size * 0.42))
    hx2 = min(size - 1, right + round(handle * 0.5))
    hy2 = min(size - 1, bottom + round(handle * 0.5))
    hx1 = max(0, hx2 - handle)
    hy1 = max(0, hy2 - handle)
    draw.rectangle([hx1, hy1, hx2, hy2], fill=HANDLE_FILL, outline=BOX_LINE, width=stroke)

    return image


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        path = OUT_DIR / f"icon{size}.png"
        make_icon(size).save(path)
        print(f"written {path}")


if __name__ == "__main__":
    main()
