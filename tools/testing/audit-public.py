"""Audit publishable paths, credential patterns and local Markdown links."""
import argparse
import json
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--forbid',action='append',default=[],help='Extra private marker; report only the affected path')
args=parser.parse_args()
names=set(subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode('utf-8').split('\0'))
text_types={'.md','.ts','.tsx','.json','.ps1','.py','.mjs','.html','.c','.h','.yml','.yaml','.cmd','.css','.lock','.svg','.txt'}
patterns=[r'github_pat_[A-Za-z0-9_]{20,}',r'gh[pousr]_[A-Za-z0-9]{20,}',
          r'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY',
          r'(?i)[A-Z]:[/\\]Users[/\\][^/\\\s"\']+',
          r'(?i)MONITOR_STUDY_KEY\s+"[0-9a-f]{64}"']
issues=[];total=0;count=0;links=0
for name in sorted(names):
    if not name:continue
    path=ROOT/name
    if not path.is_file():continue
    count+=1;total+=path.stat().st_size
    parts=Path(name).parts
    if any(p in {'.runtime','node_modules','managed_components','dist','__pycache__'} for p in parts) or name in {'firmware/main/wifi_config.h','firmware/main/study_pairing.h','firmware/sdkconfig'} or name.startswith('apps/hub/data/') or (path.name.startswith('.env') and path.name!='.env.example'):
        issues.append({'file':name,'reason':'private or generated path'})
    if path.stat().st_size>100*1024*1024:issues.append({'file':name,'reason':'GitHub file size limit'})
    if path.suffix not in text_types and path.name not in {'.gitignore','.env.example'}:continue
    content=path.read_text(encoding='utf-8-sig')
    if any(re.search(pattern,content) for pattern in patterns) or any(marker in content for marker in args.forbid):
        issues.append({'file':name,'reason':'credential or private machine marker'})
    if path.suffix=='.md':
        for target in re.findall(r'\]\(([^)]+)\)',content):
            target=target.strip('<>')
            if target.startswith(('https:','http:','#','mailto:')):continue
            target=target.split('#',1)[0]
            if target:
                links+=1
                if not (path.parent/target).resolve().exists():issues.append({'file':name,'reason':'broken local link: '+target})
report={'files':count,'bytes':total,'localLinks':links,'issues':issues}
print(json.dumps(report,ensure_ascii=True,indent=2))
raise SystemExit(bool(issues))
