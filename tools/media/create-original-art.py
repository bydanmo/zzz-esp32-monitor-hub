"""Render project-original SVG covers and procedural media; FFmpeg is optional.

No game screenshots, logos, music or downloaded artwork are used.
Run with --media to regenerate the web video and optional device RGB565 resources.
"""
from pathlib import Path
import argparse, json, shutil, subprocess, sys

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--media', action='store_true')
args = parser.parse_args()
out = ROOT / 'apps/web/public/art/original'
out.mkdir(parents=True, exist_ok=True)
palettes = [('signal', '#f5ed00'), ('tape', '#ffad48'), ('arcade', '#70ddff'),
            ('night', '#f5a0ff'), ('acid', '#c5f31b'), ('paper', '#ff6b55')]
for i, (name, color) in enumerate(palettes):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="500" height="930" viewBox="0 0 500 930">
<defs><pattern id="dot" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#171719"/></pattern></defs>
<rect width="500" height="930" fill="{color}"/><rect width="500" height="930" fill="url(#dot)" opacity=".23"/>
<g font-family="sans-serif" font-weight="900" fill="#111416"><text x="28" y="70" font-size="23">LOCAL SIGNAL / 0{i+1}</text>
<text x="22" y="168" font-size="82" letter-spacing="-4">DESK</text><text x="22" y="251" font-size="70" letter-spacing="-4">MONITOR</text></g>
<g transform="translate(36 330) rotate(-5 210 170)"><rect x="5" y="12" width="428" height="330" rx="28" fill="#08090a"/>
<rect width="420" height="320" rx="28" fill="#343b40" stroke="#111416" stroke-width="8"/>
<rect x="20" y="24" width="290" height="240" rx="30" fill="#0c141b" stroke="#707b7f" stroke-width="6"/>
<path d="M35 150h37l21-55 29 104 28-87 24 39h113" fill="none" stroke="{color}" stroke-width="9"/>
<circle cx="360" cy="75" r="27" fill="#111416" stroke="#858c89" stroke-width="7"/><path d="M360 53v24" stroke="{color}" stroke-width="6"/>
<path d="M334 141h52m-52 16h52m-52 16h52m-52 16h52m-52 16h52" stroke="#111416" stroke-width="8"/>
<rect x="28" y="283" width="190" height="10" rx="5" fill="{color}"/><circle cx="380" cy="285" r="6" fill="#53dd88"/></g>
<g font-family="sans-serif" fill="#111416"><text x="28" y="763" font-size="23" font-weight="900">{name.upper()} EDITION</text><text x="28" y="804" font-size="14">ORIGINAL GRAPHICS / OPEN SOURCE</text><text x="28" y="877" font-size="22" font-weight="900">KEEP A GOOD SIGNAL.</text></g></svg>'''
    (out / f'{name}.svg').write_text(svg, encoding='utf-8')
scene = '''<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320">
<defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#27323a"/></pattern></defs>
<rect width="480" height="320" fill="#101820"/><rect width="480" height="320" fill="url(#grid)"/>
<text x="18" y="35" font-family="sans-serif" font-weight="900" font-size="21" fill="#70ddff">DESK / LOCAL SIGNAL</text>
<rect x="328" y="14" width="98" height="44" rx="8" fill="#050b0f" stroke="#3c4b52" stroke-width="2"/>
<rect x="118" y="60" width="280" height="195" rx="20" fill="#050708"/>
<rect x="126" y="66" width="264" height="180" rx="15" fill="#454f54" stroke="#85928f" stroke-width="3"/>
<rect x="140" y="77" width="208" height="160" rx="15" fill="#030609"/>
<rect x="145" y="82" width="198" height="150" rx="13" fill="#14232b"/>
<text x="167" y="160" font-family="sans-serif" font-size="23" font-weight="900" fill="#70ddff">SIGNAL / 01</text>
<circle cx="367" cy="103" r="13" fill="#111719" stroke="#a2a99d" stroke-width="4"/><path d="M367 93v11" stroke="#ffad48" stroke-width="3"/>
<circle cx="367" cy="147" r="13" fill="#111719" stroke="#a2a99d" stroke-width="4"/>
<path d="M357 184h22m-22 7h22m-22 7h22m-22 7h22m-22 7h22" stroke="#13181a" stroke-width="3"/>
<rect x="100" y="251" width="312" height="39" rx="7" fill="#303c41" stroke="#030708" stroke-width="3"/>
<rect x="160" y="264" width="158" height="12" rx="3" fill="#080c0e"/><circle cx="124" cy="269" r="5" fill="#53df87"/>
<rect x="342" y="261" width="24" height="19" rx="2" fill="#ffad48"/>
<text x="19" y="304" fill="#afb6ac" font-family="sans-serif" font-size="10">PROJECT-ORIGINAL SCENE / 480 x 320 / NO GAME ASSETS</text></svg>'''
(out / 'terminal-scene.svg').write_text(scene, encoding='utf-8')
(out / 'sources.json').write_text(json.dumps({'creator':'zzz ESP32 Monitor Hub contributors', 'license':'MIT',
    'source':'tools/media/create-original-art.py', 'thirdPartyGameAssets':False,
    'covers':[name+'.svg' for name,_ in palettes]}, indent=2)+'\n', encoding='utf-8')
if args.media:
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg: parser.error('Install FFmpeg and add it to PATH before --media.')
    font = Path('C:/Windows/Fonts/arialbd.ttf')
    label = ''
    if font.exists():
        escaped=str(font).replace(':', '\\:')
        label=f",drawtext=fontfile='{escaped}':text='DESK MONITOR':fontcolor=0x111416:fontsize=40:x=28:y=110"
    graph = "[0:v]drawgrid=w=24:h=24:t=1:c=0x303b43[base];[1:v]drawgrid=w=32:h=90:t=6:c=0x171719[tape];[base][tape]overlay=x='-mod(t*40,32)':y=90"+label+",format=yuv420p[out]"
    subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-filter_complex_threads','1',
        '-f','lavfi','-i','color=c=0x101820:s=480x270:r=30','-f','lavfi','-i','color=c=0xffad48:s=960x90:r=30',
        '-filter_complex',graph,'-map','[out]','-t','4','-an','-c:v','libx264','-crf','20','-movflags','+faststart','-y',str(out/'signal-film.mp4')],check=True)
    subprocess.run(['node',str(ROOT/'tools/media/render-svg.mjs'),str(out/'terminal-scene.svg'),str(out/'terminal-scene.png')],check=True)
    # The same window geometry is used by the device compositor.
    subprocess.run([sys.executable,str(ROOT/'tools/media/prepare-crt-assets.py'),str(out/'terminal-scene.png'),str(out/'signal-film.mp4'),'--start','0'],check=True)
    shutil.copyfile(ROOT/'apps/web/public/motion-review/crt-scene-preview.mp4',out/'terminal-scene.mp4')
print('Project-original artwork ready.')
