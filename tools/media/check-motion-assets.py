"""Check actual media bytes against the browser and firmware asset contract."""
import hashlib
import json
from pathlib import Path
import re
import zlib

root = Path(__file__).resolve().parents[2]
header = (root / "firmware/main/media_assets.generated.h").read_text(encoding="utf-8")
crt = "prepare-crt-assets.py" in header
stage = root / (".runtime/media-stage/crt-room" if crt else ".runtime/media-stage/creamfields-orange")
manifest = json.loads((stage / "manifest.json").read_text(encoding="utf-8"))
public = json.loads((root / "apps/web/public/motion-review" / ("crt-manifest.json" if crt else "manifest.json")).read_text(encoding="utf-8"))
rows = re.findall(r'\{"([^"\n]+)", "([^"\n]+)", (\d+),(\d+),(\d+),(\d+),(\d+),(\d+),0x([0-9a-f]+)\}', header)
assert len(rows) == len(manifest["variants"]) == 2
assert public["variants"] == manifest["variants"]
report = []
for item, row in zip(manifest["variants"], rows):
    cache, remote, width, height, x, y, fps, size, crc = row
    width, height, x, y, fps, size = map(int, (width, height, x, y, fps, size))
    assert (width, height, x, y, fps, size) == tuple(item[key] for key in ("width", "height", "x", "y", "fps", "bytes"))
    assert remote == item["file"] and cache.startswith("/sdcard/zzz_")
    assert 0 <= x < x + width <= 480 and 0 <= y < y + height <= 320
    stripe_lines = 480 * 32 // width
    assert 0 < width * min(height, stripe_lines) * 2 <= 480 * 32 * 2
    payload = (stage / remote).read_bytes()
    assert len(payload) == size == item["frameCount"] * width * height * 2
    if item["id"] != "background":
        assert abs(item["frameCount"] / fps - manifest["durationSeconds"]) < 1 / fps
    assert zlib.crc32(payload) == int(crc, 16) == int(item["crc32"], 16)
    assert hashlib.sha256(payload).hexdigest() == item["sha256"]
    served = root / "apps/web/public/motion-assets" / remote
    assert hashlib.sha256(served.read_bytes()).hexdigest() == item["sha256"]
    report.append(dict(id=item["id"], bytes=size, frames=item["frameCount"], fps=fps, lastStripeLines=height % stripe_lines or stripe_lines, crc32=crc, displayBoundsValid=True, transferBufferFits=True))
if crt:
    assert sum(item["bytes"] for item in manifest["variants"]) < 8*1024*1024-512*1024
print(json.dumps(dict(verified=True, variants=report, psramBytes=sum(item["bytes"] for item in manifest["variants"]) if crt else None, deviceMeasured=False), indent=2))
