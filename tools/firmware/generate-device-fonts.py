"""Generate OFL Noto device fonts; no network access or implicit installs."""
import argparse
from pathlib import Path
import re
import subprocess
import tempfile
import copy

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.subset import Options, Subsetter
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--font', default='C:/Windows/Fonts/NotoSansSC-VF.ttf')
parser.add_argument('--converter', required=True, help='Path to lv_font_conv.js')
parser.add_argument('--only', choices=['ui_font_zh_16', 'ui_font_numeric_28', 'ui_font_numeric_40',
                                     'ui_font_numeric_56', 'ui_font_poster_84', 'ui_font_poster_112'],
                    help='Regenerate one device face without changing the web font')
args = parser.parse_args()
header = (ROOT / 'firmware/main/ui/ui_text_zh.h').read_text(encoding='utf-8')
symbols = ''.join(sorted(set(''.join(re.findall(r'"([^"\n]*)"', header)))))
symbols = symbols.replace('\\n', '')
symbols += ''.join(chr(c) for c in range(32, 127))
work = ROOT / '.runtime/font-build'
work.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='dm01-font-', dir=work) as temp:
    font = instantiateVariableFont(TTFont(args.font), {'wght': 900}, inplace=True)
    options = Options()
    options.name_IDs = ['*']
    subset = Subsetter(options=options)
    subset.populate(text=symbols + ''.join(chr(c) for c in range(32, 127)))
    subset.subset(font)
    # Derivative name: original font name remains reserved by its OFL license.
    for record in font['name'].names:
        if record.nameID in (1, 4, 6, 16, 25):
            record.string = 'DM01DeviceBlack'.encode(record.getEncoding())
    source = Path(temp) / 'DM01DeviceBlack.ttf'
    font.save(source)
    poster_chars = '0123456789%+-ABCDEFGHIJKLMNOPQRSTUVWXYZ /'
    poster = copy.deepcopy(font)
    poster_subset = Subsetter(options=options)
    poster_subset.populate(text=poster_chars)
    poster_subset.subset(poster)
    glyph_set = poster.getGlyphSet()
    transformed = {}
    for glyph_name in poster.getGlyphOrder():
        recording = DecomposingRecordingPen(glyph_set)
        glyph_set[glyph_name].draw(recording)
        pen = TTGlyphPen(None)
        recording.replay(TransformPen(pen, (0.76, 0, 0.17, 1, 0, 0)))
        transformed[glyph_name] = pen.glyph()
    for glyph_name, glyph in transformed.items():
        poster['glyf'][glyph_name] = glyph
        advance, _ = poster['hmtx'][glyph_name]
        poster['hmtx'][glyph_name] = (round(advance * 0.79), 0)
    poster_source = Path(temp) / 'DM01PosterBlack.ttf'
    poster.save(poster_source)
    poster.flavor = 'woff'
    if not args.only:
        poster.save(ROOT / 'apps/web/src/assets/dm01-poster.woff')
    for size, name, chars in [
        (16, 'ui_font_zh_16', symbols),
        (28, 'ui_font_numeric_28', '0123456789%+-:'),
        (40, 'ui_font_numeric_40', '0123456789%+-'),
        (56, 'ui_font_numeric_56', '0123456789%+-'),
        (84, 'ui_font_poster_84', poster_chars),
        (112, 'ui_font_poster_112', '0123456789+-'),
    ]:
        if args.only and args.only != name:
            continue
        output = ROOT / f'firmware/main/ui/{name}.c'
        subprocess.run(['node', args.converter, '--font', str(poster_source if size >= 84 else source),
                        '--symbols', chars, '--size', str(size), '--bpp', '4',
                        '--format', 'lvgl', '--lv-font-name', name,
                        '--lv-include', 'lvgl.h', '--no-compress', '--no-kerning',
                        '--output', str(output)], check=True)
        print(f'{output.name}: {output.stat().st_size} bytes')
