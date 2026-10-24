"""Package actual LVGL BMP renders as PNGs and a contact sheet."""
from pathlib import Path
import json
import hashlib
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[3]
folder = root / '.runtime/reviews/compact-layout'
folder.mkdir(parents=True, exist_ok=True)
for bitmap in (root / '.runtime/lvgl-host/raw').glob('*.bmp'):
    Image.open(bitmap).save(folder / (bitmap.stem + '.png'))
themes = [('signal', '街区信号'), ('tape', '磁带暖橙'), ('arcade', '街机冰蓝'),
          ('night', '夜场紫粉'), ('acid', '酸性青柠'), ('paper', '纸刊朱红')]
sheet = Image.new('RGB', (1008, 1128), '#171719')
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype('C:/Windows/Fonts/NotoSansSC-VF.ttf', 20)
for index, (name, title) in enumerate(themes):
    x, y = 16 + index % 2 * 496, 16 + index // 2 * 372
    draw.text((x, y), title + ' / ' + name.upper(), fill='#eee9dd', font=font)
    sheet.paste(Image.open(folder / f'{name}-overview.png'), (x, y + 36))
sheet.save(folder / 'theme-contact-sheet.png')
pages = Image.new('RGB', (1504, 376), '#171719')
page_draw = ImageDraw.Draw(pages)
for index, (name, title) in enumerate([('overview','总览 · 斜切票面'),('system','系统 · 旋钮仪表'),('study','学习 · 计时卡匣')]):
    x = 16+index*496
    page_draw.text((x,12),title,fill='#eee9dd',font=font)
    pages.paste(Image.open(folder / f'arcade-{name}.png'),(x,48))
pages.save(folder / 'page-triptych.png')
manifest = {'renderer': 'Actual LVGL 8.4.0, RGB565; synthetic telemetry and input',
            'screen': [480, 320], 'artifacts': {}}
for path in sorted(folder.glob('*.png')):
    manifest['artifacts'][path.name] = {
        'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'source': 'Browser screenshot' if path.name.startswith('browser-') else 'LVGL host render'
    }
(folder / 'render-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Packaged {len(manifest["artifacts"])} PNGs; screenshots are host renders, not photographs.')
