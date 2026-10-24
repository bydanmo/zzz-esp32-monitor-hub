import * as T from "three";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildTerminalModel, type ModelPalette } from "./terminal-model";
import { scenePose, scrollProgress, type Viewpoint } from "./scene-motion";

export interface StageOptions extends ModelPalette { reduced:boolean; paused:boolean; viewpoint:Viewpoint }

export function createTerminalStage(mount:HTMLElement, screen:HTMLElement, initial:StageOptions, onUnavailable?:()=>void) {
  const releases:Array<()=>void>=[];
  let disposed=false, frame=0;
  function dispose() {
    if(disposed) return;
    disposed=true;
    cancelAnimationFrame(frame); frame=0;
    // Each resource is registered immediately, so failed startup and normal
    // unmount share the same cleanup path, including partially built stages.
    for(const release of releases.reverse()) {
      try {release();} catch(error) {console.warn("3D 资源清理未完全完成",error);}
    }
    releases.length=0;
  }
  try {
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"});
  releases.push(()=>renderer.forceContextLoss(),()=>renderer.dispose(),()=>renderer.domElement.remove());
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false; renderer.shadowMap.needsUpdate=true;
  renderer.domElement.setAttribute("aria-hidden","true");
  renderer.domElement.className="three-webgl-layer";
  const css=new CSS3DRenderer(); css.domElement.className="three-css-layer";
  // Hidden overflow is still focus-scrollable: focusing a projected SVG button
  // can scroll this layer away from the WebGL bezel. Clip forbids that offset.
  css.domElement.style.overflow="clip";
  releases.push(()=>css.domElement.remove());
  mount.append(renderer.domElement,css.domElement);
  const scene=new T.Scene();
  const camera=new T.PerspectiveCamera(34,1,.1,80);
  const model=buildTerminalModel(initial); releases.push(()=>model.dispose()); scene.add(model.group);
  const room=new RoomEnvironment();
  let environment:T.WebGLRenderTarget;
  try {
    const pmrem=new T.PMREMGenerator(renderer);
    try {environment=pmrem.fromScene(room,.04);}
    finally {pmrem.dispose();}
  } finally {room.dispose();}
  releases.push(()=>environment.dispose()); scene.environment=environment.texture;
  const hemi=new T.HemisphereLight("#f2efe7","#30343c",2.1); scene.add(hemi);
  const key=new T.DirectionalLight("#fff3dc",3.3); key.position.set(-4,9,7);
  releases.push(()=>key.shadow.dispose());
  key.castShadow=true; key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.left=-7; key.shadow.camera.right=7; key.shadow.camera.top=7; key.shadow.camera.bottom=-7;
  key.shadow.normalBias=.04; scene.add(key);
  const fill=new T.DirectionalLight(initial.companion,1.2); fill.position.set(6,3,-4); scene.add(fill);
  const floorGeometry=new T.PlaneGeometry(22,18);
  releases.push(()=>floorGeometry.dispose());
  const floorMaterial=new T.ShadowMaterial({color:"#000000",opacity:.42});
  releases.push(()=>floorMaterial.dispose());
  const floor=new T.Mesh(floorGeometry,floorMaterial); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
  // The same real SVG interface lives on a projected DOM plane, keeping fonts,
  // live telemetry and keyboard/touch navigation intact at every camera angle.
  const screenObject=new CSS3DObject(screen);
  screenObject.position.set(-.64,3.2,1.84);
  screenObject.scale.setScalar(4.42/480);
  scene.add(screenObject);
  releases.push(()=>{scene.remove(screenObject);screen.style.visibility="";screen.inert=false;});
  let options={...initial};
  let lastTime=0, contextLost=false;
  let visible=true;
  let progress=.36;
  let yaw=scenePose(progress,options.viewpoint,options.reduced).yaw;
  let elevation=scenePose(progress,options.viewpoint,options.reduced).elevation;
  let targetYaw=yaw, targetElevation=elevation;
  let renderedFrames=0;
  const currentProgress=()=>{ const rect=mount.getBoundingClientRect(); return scrollProgress(rect.top,rect.height,window.innerHeight); };
  function target() {
    if(!options.paused) progress=currentProgress();
    const next=scenePose(progress,options.viewpoint,options.reduced);
    targetYaw=next.yaw; targetElevation=next.elevation;
  }
  function schedule() {
    if(!disposed && !contextLost && visible && !document.hidden && !frame) frame=requestAnimationFrame(draw);
  }
  function draw(time:number) {
    frame=0;
    if(disposed || contextLost || !visible || document.hidden) return;
    const ease=options.reduced ? 1 : 1-Math.exp(-Math.min(64,time-(lastTime||time-16))/80);
    lastTime=time;
    yaw+=(targetYaw-yaw)*ease; elevation+=(targetElevation-elevation)*ease;
    const width=mount.clientWidth;
    // Preserve the approved desktop/mobile framing while increasing distance
    // when a narrow column reduces the horizontal field of view.
    const radius=Math.max(width<460 ? 14.2 : 12.8,14.2*(340/370)/Math.max(.1,camera.aspect));
    camera.position.set(Math.sin(yaw)*radius,2.55+elevation,Math.cos(yaw)*radius);
    camera.lookAt(0,2.65,.2);
    const facing=Math.cos(yaw)>.22;
    screen.style.visibility=facing?"visible":"hidden"; screen.inert=!facing;
    renderer.render(scene,camera); css.render(scene,camera);
    ++renderedFrames;
    mount.dataset.viewYaw=yaw.toFixed(3);
    mount.dataset.renderFrames=String(renderedFrames);
    mount.dataset.sceneState="ready";
    if(Math.abs(targetYaw-yaw)+Math.abs(targetElevation-elevation)>.0005) schedule();
  }
  function resize() {
    if(disposed || contextLost) return;
    const width=mount.clientWidth,height=mount.clientHeight;
    if(!width || !height) return;
    renderer.setSize(width,height); css.setSize(width,height);
    camera.aspect=width/height; camera.updateProjectionMatrix(); target(); schedule();
  }
  const observer=new ResizeObserver(resize); releases.push(()=>observer.disconnect()); observer.observe(mount);
  const intersection=new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;
    if(visible) {target();schedule();} else { cancelAnimationFrame(frame);frame=0; }
  }); releases.push(()=>intersection.disconnect()); intersection.observe(mount);
  const scroll=()=>{if(!options.paused && !options.reduced && options.viewpoint==="scroll") {target();schedule();}};
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else{target();schedule();}};
  const lost=(event:Event)=>{
    event.preventDefault();
    if(disposed || contextLost) return;
    contextLost=true; cancelAnimationFrame(frame); frame=0;
    screen.style.visibility="hidden"; screen.inert=true;
    mount.dataset.sceneState="lost";
    onUnavailable?.();
  };
  const restored=()=>{if(!disposed){contextLost=false;lastTime=0;renderer.shadowMap.needsUpdate=true;resize();}};
  window.addEventListener("scroll",scroll,{passive:true});
  releases.push(()=>window.removeEventListener("scroll",scroll));
  document.addEventListener("visibilitychange",visibility);
  releases.push(()=>document.removeEventListener("visibilitychange",visibility));
  renderer.domElement.addEventListener("webglcontextlost",lost);
  releases.push(()=>renderer.domElement.removeEventListener("webglcontextlost",lost));
  renderer.domElement.addEventListener("webglcontextrestored",restored);
  releases.push(()=>renderer.domElement.removeEventListener("webglcontextrestored",restored));
  resize();
  return {
    update(next:StageOptions) { if(disposed) return;options={...next};model.update(next);fill.color.set(next.companion);target();schedule(); },
    async exportModel() {
      const {GLTFExporter}=await import("three/addons/exporters/GLTFExporter.js");
      if(disposed) throw new Error("立体终端已关闭");
      const exported=await new GLTFExporter().parseAsync(model.group,{binary:true,onlyVisible:true});
      if(!(exported instanceof ArrayBuffer)) throw new Error("模型导出失败");
      return exported;
    },
    dispose
  };
  } catch(error) {dispose();throw error;}
}
export type TerminalStage = ReturnType<typeof createTerminalStage>;
