import os
from PIL import Image, ImageDraw

def generate_perfect_icons():
    src_path = 'public/assets/logo_ultra_administrador.png'
    if not os.path.exists(src_path):
        print(f"Error: {src_path} not found")
        return

    orig = Image.open(src_path).convert('RGBA')
    
    # Bounding box of logo
    bbox = orig.getbbox()
    if bbox:
        logo = orig.crop(bbox)
    else:
        logo = orig

    res_dir = 'android/app/src/main/res'

    # Densities: (adaptive fg canvas size, logo size inside fg, legacy main canvas size, logo size inside main)
    densities = {
        'mipmap-mdpi':    {'fg': 108, 'fg_logo': 76,  'main': 48,  'main_logo': 38},
        'mipmap-hdpi':    {'fg': 162, 'fg_logo': 114, 'main': 72,  'main_logo': 57},
        'mipmap-xhdpi':   {'fg': 216, 'fg_logo': 152, 'main': 96,  'main_logo': 76},
        'mipmap-xxhdpi':  {'fg': 324, 'fg_logo': 228, 'main': 144, 'main_logo': 114},
        'mipmap-xxxhdpi': {'fg': 432, 'fg_logo': 304, 'main': 192, 'main_logo': 152},
    }

    # Clean white background for launcher icons so cyan & dark blue nodes stand out crystal clear!
    bg_color = (255, 255, 255, 255) # Pure White #ffffff

    for folder, sizes in densities.items():
        folder_path = os.path.join(res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)

        w, h = logo.size

        # ── 1. Adaptive Foreground (ic_launcher_foreground.png) ─────────────
        fg_size = sizes['fg']
        fg_logo_size = sizes['fg_logo']

        scale_fg = fg_logo_size / max(w, h)
        fg_w, fg_h = max(1, int(w * scale_fg)), max(1, int(h * scale_fg))
        resized_fg = logo.resize((fg_w, fg_h), Image.Resampling.LANCZOS)

        fg_img = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
        fg_img.paste(resized_fg, ((fg_size - fg_w) // 2, (fg_size - fg_h) // 2), resized_fg)
        fg_img.save(os.path.join(folder_path, 'ic_launcher_foreground.png'))

        # ── 2. Legacy Main Icon (ic_launcher.png) ─────────────────────────────
        main_size = sizes['main']
        main_logo_size = sizes['main_logo']

        scale_main = main_logo_size / max(w, h)
        mw, mh = max(1, int(w * scale_main)), max(1, int(h * scale_main))
        resized_main = logo.resize((mw, mh), Image.Resampling.LANCZOS)

        main_img = Image.new('RGBA', (main_size, main_size), (0, 0, 0, 0))
        draw_main = ImageDraw.Draw(main_img)
        corner_r = max(4, int(main_size * 0.22))
        draw_main.rounded_rectangle([0, 0, main_size - 1, main_size - 1], radius=corner_r, fill=bg_color)
        main_img.paste(resized_main, ((main_size - mw) // 2, (main_size - mh) // 2), resized_main)
        main_img.save(os.path.join(folder_path, 'ic_launcher.png'))

        # ── 3. Legacy Round Icon (ic_launcher_round.png) ──────────────────────
        round_img = Image.new('RGBA', (main_size, main_size), (0, 0, 0, 0))
        draw_round = ImageDraw.Draw(round_img)
        draw_round.ellipse([0, 0, main_size - 1, main_size - 1], fill=bg_color)
        round_img.paste(resized_main, ((main_size - mw) // 2, (main_size - mh) // 2), resized_main)
        round_img.save(os.path.join(folder_path, 'ic_launcher_round.png'))

        print(f"Generated clean white-bg icons for {folder}")

    # ── Update drawable/ic_launcher_background.xml to #ffffff ──────────────────
    bg_xml_path = 'android/app/src/main/res/drawable/ic_launcher_background.xml'
    with open(bg_xml_path, 'w', encoding='utf-8') as f:
        f.write('''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#FFFFFF" />
</shape>
''')

    # ── Update adaptive icon XMLs ──────────────────────────────────────────────
    anydpi_dir = os.path.join(res_dir, 'mipmap-anydpi-v26')
    os.makedirs(anydpi_dir, exist_ok=True)

    valid_xml = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"""

    with open(os.path.join(anydpi_dir, 'ic_launcher.xml'), 'w', encoding='utf-8') as f:
        f.write(valid_xml)

    with open(os.path.join(anydpi_dir, 'ic_launcher_round.xml'), 'w', encoding='utf-8') as f:
        f.write(valid_xml)

    print("Updated XML background to #FFFFFF and adaptive XMLs.")

if __name__ == '__main__':
    generate_perfect_icons()
