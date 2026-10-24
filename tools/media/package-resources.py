"""Package optional, project-original exports separately from the source tree."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT / '.runtime/releases/zzz-monitor-resources-v0.1.0.zip')
args = parser.parse_args()
required = [
    'apps/web/public/motion-assets/crt-background.rgb565',
    'apps/web/public/motion-assets/crt-window-30fps.rgb565',
    'apps/web/public/motion-review/crt-manifest.json',
    'apps/web/public/motion-review/crt-scene-preview.mp4',
    'apps/web/public/motion-review/crt-content.mp4',
    'firmware/main/media_assets.generated.h', 'LICENSE',
]
missing = [name for name in required if not (ROOT / name).is_file()]
if missing:
    parser.error('Generate optional media first with npm run media:generate. Missing: ' + ', '.join(missing))
files = {name: ROOT / name for name in required}
model = ROOT / '.runtime/optional-resources/models/dm01'
for name in ['terminal-concept.glb', 'README.md']:
    if (model / name).is_file():
        files['.runtime/optional-resources/models/dm01/' + name] = model / name

# Refuse to publish a pack whose frames disagree with its manifest or firmware.
manifest = json.loads((ROOT / required[2]).read_text(encoding='utf-8'))
header = (ROOT / 'firmware/main/media_assets.generated.h').read_text(encoding='utf-8')
for variant in manifest['variants']:
    payload = (ROOT / 'apps/web/public/motion-assets' / variant['file']).read_bytes()
    if len(payload) != variant['bytes'] or f'{zlib.crc32(payload):08x}' != variant['crc32']:
        parser.error('Media bytes/CRC do not match manifest: ' + variant['file'])
    if hashlib.sha256(payload).hexdigest() != variant['sha256'] or '0x'+variant['crc32'] not in header:
        parser.error('Media SHA256 or firmware table mismatch: ' + variant['file'])
index = {'schemaVersion': 1, 'license': 'MIT', 'optional': True,
         'files': {name: {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
                   for name, path in files.items()}}
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name, path in files.items(): archive.write(path, name)
    archive.writestr('RESOURCE-PACK.json', json.dumps(index, indent=2)+'\n')
    archive.writestr('RESOURCE-PACK.md', '''# Optional original resources / 可选原创资源

解压到仓库根目录，再执行 npm run build；重启 Hub 后设备可下载动画帧。
固件素材表与帧文件须配套，版本不同时按 docs/media.md 重新构建固件。
离线 GLB 在 .runtime/optional-resources/models/dm01，仅供建模参考；网页 3D 直接由源码生成。
所有文件都是项目原创导出，许可见 LICENSE。逐文件哈希见 RESOURCE-PACK.json。
''')
checksum = hashlib.sha256(args.output.read_bytes()).hexdigest()
args.output.with_suffix('.zip.sha256').write_text(checksum+'  '+args.output.name+'\n', encoding='utf-8')
print(json.dumps({'file': str(args.output), 'bytes': args.output.stat().st_size, 'sha256': checksum,
                  'includesModel': any(name.endswith('.glb') for name in files)}, ensure_ascii=False))
