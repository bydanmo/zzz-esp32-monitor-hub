"""Pair this local firmware build with its local Hub; never print the key."""
import json
from pathlib import Path
import secrets

root=Path(__file__).resolve().parents[2]
path=root/"apps/hub/data/study-controls.json"
settings=json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"enabled":False,"bridgeEnabled":False}
key=settings.get("controlKey")
if not isinstance(key,str) or len(key)!=64 or any(c not in "0123456789abcdef" for c in key):key=secrets.token_hex(32)
settings["controlKey"]=key
path.parent.mkdir(parents=True,exist_ok=True)
temporary=path.with_suffix(".json.tmp");temporary.write_text(json.dumps(settings)+"\n",encoding="utf-8");temporary.replace(path)
(root/"firmware/main/study_pairing.h").write_text('/* Local pairing material; never commit. */\n#pragma once\n#define MONITOR_STUDY_KEY "'+key+'"\n',encoding="utf-8")
print("Local pairing files prepared; key retained privately. Rebuild Hub and firmware, then restart/flash.")
