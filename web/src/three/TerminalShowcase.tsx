import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TerminalDevice } from "../components/TerminalDevice";
import { TelemetryScreen, previewPages } from "../device-preview/TelemetryScreen";
import type { ThemeEdition, AppearancePreferences } from "../design/appearance";
import type { HubConnectionState } from "../state/ui-state";
import type { DevicePage, Snapshot } from "../types";
import type { TerminalStage, StageOptions } from "./terminal-runtime";
import type { Viewpoint } from "./scene-motion";
import "./terminal-showcase.css";

export function TerminalShowcase({snapshot,connection,edition,shell,reduced,paused}: {
  snapshot:Snapshot|null; connection:HubConnectionState; edition:ThemeEdition;
  shell:AppearancePreferences["shell"]; reduced:boolean; paused:boolean;
}) {
  const [mode,setMode]=useState<"3d"|"flat">("3d");
  const [viewpoint,setViewpoint]=useState<Viewpoint>("scroll");
  const [page,setPage]=useState<DevicePage>("overview");
  const [status,setStatus]=useState("正在装配立体终端…");
  const [ready,setReady]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [screen]=useState(()=>{const element=document.createElement("div");element.className="three-live-screen";return element;});
  const mount=useRef<HTMLDivElement>(null);
  const controller=useRef<TerminalStage|null>(null);
  const options:StageOptions={accent:edition.accent,companion:edition.companion,shell,reduced,paused,viewpoint,online:connection==="online"};
  const latest=useRef(options);
  useEffect(()=>{latest.current=options;controller.current?.update(options);},[edition.accent,edition.companion,shell,reduced,paused,viewpoint,connection]);
  useEffect(()=>{
    if(mode!=="3d" || !mount.current) return;
    let canceled=false;
    const host=mount.current;
    setReady(false);setStatus("正在装配立体终端…");
    void import("./terminal-runtime").then(module=>{
      if(canceled) return;
      try {
        controller.current=module.createTerminalStage(host,screen,latest.current,()=>{
          if(canceled) return;
          setStatus("立体展示暂时中断，已切换平面预览。");setMode("flat");
        });
        setReady(true);setStatus("");
      }
      catch {setStatus("当前浏览器未能启用 3D，已切换平面预览。");setMode("flat");}
    }).catch(()=>{if(!canceled){setStatus("3D 资源暂时无法载入，平面预览仍可使用。");setMode("flat");}});
    return ()=>{canceled=true;controller.current?.dispose();controller.current=null;};
  },[mode,screen]);
  const next=()=>setPage(previewPages[(previewPages.indexOf(page)+1)%previewPages.length]);
  const motionLabel=viewpoint!=="scroll" ? "固定观察角度 · 可切换随滚动" : reduced ? "简化动效 · 固定视角" : paused ? "视角已暂停" : "向下滚动，换个角度看终端";
  async function exportModel() {
    const active=controller.current;if(!active || exporting) return;
    setExporting(true);
    try {
      const result=await active.exportModel();
      const url=URL.createObjectURL(new Blob([result],{type:"model/gltf-binary"}));
      const anchor=document.createElement("a");anchor.href=url;anchor.download="DM01-terminal-concept.glb";anchor.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus("机壳与卡匣模型已导出，可在 Blender 中打开；实时屏幕由网页单独驱动。");
    } catch {setStatus("导出暂未完成，请重试。");}
    finally {setExporting(false);}
  }
  return <section className="terminal-showcase" aria-label="DM-01 立体终端展示">
    <header className="showcase-heading"><span>DESK OBJECT / 01</span><div role="group" aria-label="终端展示方式">
      <button type="button" aria-pressed={mode==="3d"} onClick={()=>setMode("3d")}>立体展示</button>
      <button type="button" aria-pressed={mode==="flat"} onClick={()=>{setStatus("");setMode("flat");}}>平面预览</button>
    </div></header>
    {mode==="3d" ? <>
      <div className="three-stage-wrap"><div className="three-watermark" aria-hidden="true">DM<br/>01</div>
        <div ref={mount} className="three-stage" aria-label="可随滚动改变视角的三维终端" />
        {!ready ? <div className="three-loading" role="status">{status}</div> : null}
        <span className="three-object-tag">CRT / VIDEO UNIT<br/><b>日常信号，实体化。</b></span>
      </div>
      {createPortal(<TelemetryScreen page={page} snapshot={snapshot} connection={connection} onPageChange={setPage} />,screen)}
      <div className="three-viewpoints" role="group" aria-label="模型观察角度">{([
        ["scroll","随滚动"],["front","正面"],["detail","侧面细节"],["rear","背部接口"]
      ] as const).map(([value,label])=><button type="button" key={value} aria-pressed={viewpoint===value} onClick={()=>setViewpoint(value)}>{label}</button>)}</div>
      <div className="three-bottom"><div><span className="three-motion-dot" />{motionLabel}<small>实时数据屏幕 · 原创造型概念</small></div>
        <button type="button" className="three-export" title="导出机壳、底座和卡匣的 GLB 模型，不含网页实时屏幕" disabled={!ready || exporting} onClick={()=>void exportModel()}>{exporting?"导出中…":"导出模型 ↗"}</button>
      </div>
    </> : <TerminalDevice page={page} onNext={next} onHome={()=>setPage("overview")} caption="实时数据视图 · 非实机截图">
      <TelemetryScreen page={page} snapshot={snapshot} connection={connection} onPageChange={setPage} />
    </TerminalDevice>}
    {status && (ready || mode==="flat") ? <p className="three-status" role="status">{status}</p> : null}
  </section>;
}
