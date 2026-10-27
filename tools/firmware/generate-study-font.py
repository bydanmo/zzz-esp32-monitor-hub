"""Build an OFL task-title face (GB2312 Han + ASCII); no network downloads."""
import argparse
import re
from pathlib import Path
import subprocess
import tempfile
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.subset import Options, Subsetter

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--converter', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
chars = set(chr(c) for c in range(32, 127))
for a in range(0xb0, 0xf8):
    for b in range(0xa1, 0xff):
        try:
            chars.add(bytes((a, b)).decode('gb2312'))
        except UnicodeDecodeError:
            pass
chars.update('，。；：？！、（）【】《》—…·“”‘’℃≥≤')
with tempfile.TemporaryDirectory(prefix='study-font-') as tmp:
    font = instantiateVariableFont(TTFont('C:/Windows/Fonts/NotoSansSC-VF.ttf'), {'wght': 500}, inplace=True)
    subset = Subsetter(options=Options())
    subset.populate(text=''.join(sorted(chars)))
    subset.subset(font)
    for record in font['name'].names:
        if record.nameID in (1, 4, 6, 16, 25):
            record.string = 'DM01StudyText'.encode(record.getEncoding())
    source = Path(tmp) / 'DM01StudyText.ttf'
    font.save(source)
    output = root / 'firmware/main/ui/ui_font_study_16.c'
    subprocess.run(['node', args.converter, '--font', str(source), '--symbols', ''.join(sorted(chars)),
                    '--size', '16', '--bpp', '2', '--format', 'lvgl', '--lv-font-name', 'ui_font_study_16',
                    '--lv-include', 'lvgl.h', '--no-kerning', '--no-compress', '--output', str(output)], check=True)
    print(f'{len(chars)} supported characters; source {output.stat().st_size} bytes')

# Generated comments must not expose local source or temporary paths.
output = root / "firmware/main/ui/ui_font_study_16.c"
text = output.read_text(encoding="utf-8")
text = re.sub(r"^ \* Opts:.*$", " * Generated Noto derivative; see tools/firmware/generate-study-font.py and the OFL notice.", text, flags=re.MULTILINE)
output.write_text(text.rstrip() + "\n", encoding="utf-8")
