"""Verify control against an isolated PC service; never mutate real learning data."""
import argparse
from datetime import datetime, date
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]


def ledger(path):
    result = {}
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as conn:
        for name, in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
            if name in ("runtime_meta", "runtime_metadata"): continue
            rows=conn.execute(f'SELECT * FROM [{name}] ORDER BY rowid').fetchall()
            result[name]=hashlib.sha256(repr(rows).encode()).hexdigest()
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--study-root",type=Path,required=True)
    parser.add_argument("--output",type=Path,default=ROOT/".runtime/study-control-http.json")
    args=parser.parse_args(); source=args.study_root.resolve()
    production=source/"kaoyan.db"; before=ledger(production)
    with socket.socket() as probe: probe.bind(("127.0.0.1",18031))
    fixture=ROOT/".runtime"/("study-controls-"+datetime.now().strftime("%Y%m%d-%H%M%S"));fixture.mkdir()
    for relative in ("kaoyan.db","storage/focus.sqlite3"):
        target=fixture/relative;target.parent.mkdir(parents=True,exist_ok=True)
        with sqlite3.connect((source/relative).as_uri()+"?mode=ro",uri=True) as src:
            with sqlite3.connect(target) as dst: src.backup(dst)
    config=fixture/"config.json"; config.write_text(json.dumps({"db_path":str(fixture/"kaoyan.db"),"llm":{"mode":"offline"}}),encoding="utf-8")
    env={**os.environ,"PYTHONUTF8":"1","KAOYAN_CONFIG":str(config),"KAOYAN_DATA_DIR":str(fixture)}
    def request(path,body=None):
        req=Request("http://127.0.0.1:18031"+path,data=None if body is None else json.dumps(body).encode(),headers={"Content-Type":"application/json"})
        with urlopen(req,timeout=5) as r:
            data=r.read();return json.loads(data) if data else {}
    with (fixture/"service.log").open("wb") as log:
        process=subprocess.Popen([sys.executable,str(source/"app.py"),"--db",str(fixture/"kaoyan.db"),"--host","127.0.0.1","--port","18031"],cwd=source,env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW if os.name=="nt" else 0)
        try:
            for _ in range(80):
                try: request("/api/health");break
                except OSError:
                    if process.poll() is not None: raise RuntimeError("Fixture exited; inspect service.log")
                    time.sleep(.1)
            task=request("/api/tasks",{"date":date.today().isoformat(),"title":"[隔离验收] 小屏任务控制","minutes":150})
            session=request("/api/focus")
            if "session" in session:session=session["session"]
            if session["status"]!="idle": request("/api/focus/action",{"request_id":"fixture-discard","revision":session["revision"],"action":"discard"})
            request("/api/logs",{"date":date.today().isoformat(),"minutes":17,"note":"隔离验收，独立日志必须保留"})
            node=subprocess.run(["node",str(ROOT/"tools/testing/verify-study-controls.mjs")],cwd=ROOT,env={**env,"STUDY_TEST_URL":"http://127.0.0.1:18031","STUDY_TEST_TASK":str(task["id"])},capture_output=True,text=True,encoding="utf-8")
            if node.returncode: raise RuntimeError(node.stderr)
            report=json.loads(node.stdout);report.pop("logs",None)
            with sqlite3.connect(fixture/"kaoyan.db") as conn:
                done,actual=conn.execute("SELECT done,actual_minutes FROM tasks WHERE id=?",(task["id"],)).fetchone()
                minutes=conn.execute("SELECT minutes FROM daily_logs WHERE date=?",(date.today().isoformat(),)).fetchone()[0]
            assert done==1 and actual is None and minutes==17
            report.update(taskActualMinutesNotInferred=True,manualLogPreserved=True,productionUnchanged=before==ledger(production),fixture=str(fixture))
            assert report["productionUnchanged"]
            out=args.output;out.parent.mkdir(parents=True,exist_ok=True)
            out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(report,ensure_ascii=False))
        finally:
            process.terminate();process.wait(timeout=10)


if __name__=="__main__":main()
