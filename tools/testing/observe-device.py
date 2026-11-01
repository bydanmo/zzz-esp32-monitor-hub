"""Observe one physical serial device without resetting it; keep timed evidence."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
import serial

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port",required=True)
parser.add_argument("--seconds",type=int,default=660)
parser.add_argument("--output",type=Path,required=True)
parser.add_argument("--resume",action="store_true",help="Append a further observation segment without resetting the device")
parser.add_argument("--stop-after-transitions",type=int,default=0,help="Stop after this many complete queue transitions; 0 keeps the timed/cycle observation")
parser.add_argument("--stop-after-sessions",type=int,default=0,help="Observe across automatic returns and stop when N automatic sessions have started")
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
if args.stop_after_transitions<0:parser.error("transition count must be nonnegative")
if args.stop_after_sessions<0:parser.error("session count must be nonnegative")
state={"port":args.port,"startedAt":datetime.now(timezone.utc).isoformat(),"samples":[],"events":[],"errors":[],"automaticReturn":False,"physicalTouchVerified":False,"physicalPixelsVerified":False}
if args.resume:
    state=json.loads((args.output/"progress.json").read_text(encoding="utf-8"))
    if state["port"]!=args.port:parser.error("resume port differs from prior evidence")
offset=state.get("observedSeconds",0) if args.resume else 0
if args.resume and "segments" not in state:state["segments"]=[{"startedAt":state["startedAt"],"observedSeconds":offset}]
segment_started=datetime.now(timezone.utc).isoformat()
port=serial.Serial();port.port=args.port;port.baudrate=115200;port.timeout=.25;port.dtr=False;port.rts=False
pattern=re.compile(r"Playback (\w+) ([0-9.]+) display FPS, read ([0-9.]+) ms/frame, LCD wait ([0-9.]+) ms/frame, skipped (\d+).*clock updates (\d+)")
started=time.monotonic();returned=None
try:
    for attempt in range(20):
        try:port.open();break
        except serial.SerialException:
            if attempt==19:raise
            time.sleep(.2)
    with (args.output/"serial.log").open("a" if args.resume else "w",encoding="utf-8") as log:
        if args.resume:log.write("# Observation resumed at "+segment_started+"\n")
        while time.monotonic()-started<args.seconds:
            raw=port.readline().decode("utf-8",errors="replace")
            if not raw:continue
            line=re.sub(r"\x1b\[[0-9;]*m","",raw).strip();log.write(line+"\n");log.flush()
            if any(t in line for t in ("media-assets:","video-player:","Dashboard idle","Dashboard restored","Video phase","Playback plan","stack minimum","Study projection committed","Device hello sent","local-settings:","Local display:")):
                state["events"].append(line);print(line,flush=True)
            local=re.search(r"(?:Saved|Local display:) brightness=(\d+)% reduced=(\d) screensaver=(\d)",line)
            if local:
                brightness,reduced,screensaver=map(int,local.groups())
                state.setdefault("localSettings",[]).append({"brightness":brightness,"reducedMotion":bool(reduced),"screensaver":bool(screensaver),"line":line})
            match=pattern.search(line)
            if match:
                mode,fps,read,lcd,skipped,clock=match.groups()
                state["samples"].append(dict(mode=mode,fps=float(fps),readMs=float(read),lcdWaitMs=float(lcd),skipped=int(skipped),clockUpdates=int(clock)))
            if "Video phase complete; dashboard cycle restarted" in line:
                state["automaticReturn"]=True;returned=time.monotonic()
            session_clip=re.search(r"Screensaver session clip ([a-z0-9]+);",line)
            if session_clip:state.setdefault("automaticSessions",[]).append({"id":session_clip[1],"line":line})
            if "Animation segment complete; preparing next clip" in line:state["waitingForClip"]=True
            if "Video screensaver started" in line and state.get("waitingForClip"):
                state["completedTransitions"]=state.get("completedTransitions",0)+1;state["waitingForClip"]=False
            if any(t in line for t in ("Video phase complete","Dashboard restored by touch","Video screensaver stopped")):state["waitingForClip"]=False
            if any(t in line for t in ("Guru Meditation","panic'ed","task_wdt:","Video playback failed")):state["errors"].append(line)
            state["observedSeconds"]=round(offset+time.monotonic()-started,1)
            (args.output/"progress.json").write_text(json.dumps(state,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
            if args.stop_after_transitions and state.get("completedTransitions",0)>=args.stop_after_transitions:break
            if args.stop_after_sessions and len(state.get("automaticSessions",[]))>=args.stop_after_sessions:break
            if not args.stop_after_sessions and returned and time.monotonic()-returned>3:break
finally:
    port.close()
    state["observedSeconds"]=round(offset+time.monotonic()-started,1)
    state.setdefault("segments",[]).append({"startedAt":segment_started,"observedSeconds":round(time.monotonic()-started,1)})
    (args.output/"progress.json").write_text(json.dumps(state,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in state.items() if k not in ("samples","events")},ensure_ascii=False),flush=True)
