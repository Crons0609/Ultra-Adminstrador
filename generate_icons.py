import os
from PIL import Image, ImageDraw

def generate_android_icons():
    src_path = 'public/assets/logo_ultra_administrador.png'
    if not os.path.exists(src_path):
        print(f"Error: {src_path} not found")
        return

    orig = Image.open(src_path).convert('RGBA')
    
    # Crop to non-transparent bounding box so logo is perfectly centered
    bbox = orig.getbbox()
    if bbox:
        logo_cropped = orig.crop(bbox)
    else:
        logo_cropped = orig

    res_dir = 'android/app/src/main/res'

    # Densities and sizes
    # adaptive foreground: total size (108dp base), target logo size (~62% of total size)
    # legacy main: total size (48dp base), target logo size (~78% of total size)
    densities = {
        'mipmap-mdpi':    {'fg': 108, 'fg_logo': 66,  'main': 48,  'main_logo': 38},
        'mipmap-hdpi':    {'fg': 162, 'fg_logo': 100, 'main': 72,  'main_logo': 56},
        'mipmap-xhdpi':   {'fg': 216, 'fg_logo': 134, 'main': 96,  'main_logo': 75},
        'mipmap-xxhdpi':  {'fg': 324, 'fg_logo': 200, 'main': 144, 'main_logo': 112},
        'mipmap-xxxhdpi': {'fg': 432, 'fg_logo': 268, 'main': 192, 'main_logo': 150},
    }

    bg_color = (10, 10, 11, 255) # #0a0a0b matching app dark theme

    for folder, sizes in densities.items():
        folder_path = os.path.join(res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)

        # ── 1. Adaptive Foreground (ic_launcher_foreground.png) ─────────────
        fg_size = sizes['fg']
        fg_logo_size = sizes['fg_logo']

        # Resize cropped logo preserving aspect ratio
        w, h = logo_cropped.size
        scale = fg_logo_size / max(w, h)
        new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
        resized_logo_fg = logo_cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # Create transparent canvas and paste logo in exact center
        fg_img = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
        offset_x = (fg_size - new_w) // 2
        offset_y = (fg_size - new_h) // 2
        fg_img.paste(resized_logo_fg, (offset_x, offset_y), resized_logo_fg)
        fg_img.save(os.path.join(folder_path, 'ic_launcher_foreground.png'))

        # ── 2. Legacy Launcher Icon (ic_launcher.png) ────────────────────────
        main_size = sizes['main']
        main_logo_size = sizes['main_logo']

        scale_main = main_logo_size / max(w, h)
        mw, mh = max(1, int(w * scale_main)), max(1, int(h * scale_main))
        resized_logo_main = logo_cropped.resize((mw, mh), Image.Resampling.LANCZOS)

        # Create dark background image with rounded corners
        main_img = Image.new('RGBA', (main_size, main_size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(main_img)
        corner_radius = max(4, int(main_size * 0.2)) # 20% corner radius
        draw.rounded_rectangle([0, 0, main_size - 1, main_size - 1], radius=corner_radius, fill=bg_color)

        moffset_x = (main_size - mw) // 2
        moffset_y = (main_size - mh) // 2
        main_img.paste(resized_logo_main, (moffset_x, moffset_y), resized_logo_main)
        main_img.save(os.path.join(folder_path, 'ic_launcher.png'))

        # ── 3. Legacy Round Launcher Icon (ic_launcher_round.png) ────────────
        round_img = Image.new('RGBA', (main_size, main_size), (0, 0, 0, 0))
        draw_round = ImageDraw.Draw(round_img)
        draw_round.ellipse([0, 0, main_size - 1, main_size - 1], fill=bg_color)
        round_img.paste(resized_logo_main, (moffset_x, moffset_y), resized_logo_main)
        round_img.save(os.path.join(folder_path, 'ic_launcher_round.png'))

        print(f"Generated icons for {folder}: fg={fg_size}px (logo={fg_logo_size}px), main={main_size}px")

    print("\n✅ All Android icons regenerated successfully with safe-zone padding!")

if __name__ == '__main__':
    generate_android_icons()
