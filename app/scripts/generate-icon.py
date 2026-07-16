"""Generate a Windows .ico icon for the Event to ICS desktop app."""
from PIL import Image, ImageDraw
import os

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'build', 'icon.ico')

def draw_icon(size):
    """Draw a calendar-clock icon at the given size."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / 256.0

    # Background: rounded rectangle (slate-900)
    margin = int(16 * s)
    radius = int(36 * s)
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=(15, 23, 42, 255)  # slate-900
    )

    # Clock circle (white outline)
    cx, cy = size // 2, size // 2
    r = int(72 * s)
    line_width = max(2, int(10 * s))
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        outline=(255, 255, 255, 255),
        width=line_width
    )

    # Clock hands
    draw.line(
        [cx, cy, cx, cy - int(40 * s)],
        fill=(255, 255, 255, 255),
        width=line_width
    )
    draw.line(
        [cx, cy, cx + int(48 * s), cy],
        fill=(255, 255, 255, 255),
        width=line_width
    )

    # Center dot
    dot_r = max(2, int(8 * s))
    draw.ellipse(
        [cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
        fill=(255, 255, 255, 255)
    )

    # Calendar "hanger" tabs at top
    tab_w = int(16 * s)
    tab_h = int(24 * s)
    tab_y = margin - int(4 * s)
    draw.rounded_rectangle(
        [cx - int(50 * s), tab_y, cx - int(50 * s) + tab_w, tab_y + tab_h],
        radius=int(4 * s),
        fill=(99, 102, 241, 255)
    )
    draw.rounded_rectangle(
        [cx + int(34 * s), tab_y, cx + int(34 * s) + tab_w, tab_y + tab_h],
        radius=int(4 * s),
        fill=(99, 102, 241, 255)
    )

    return img

def main():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    images = [draw_icon(s[0]) for s in sizes]
    images[0].save(
        OUTPUT_PATH,
        format='ICO',
        sizes=sizes,
        append_images=images[1:]
    )
    print(f"Icon saved to {OUTPUT_PATH}")

if __name__ == '__main__':
    main()
