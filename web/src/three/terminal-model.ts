import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type ShellFinish = "graphite" | "ivory" | "mixed";
export interface ModelPalette { accent: string; companion: string; shell: ShellFinish; online:boolean }

/** Original DM-01 geometry. Coordinates are in design units, not CAD dimensions. */
export function buildTerminalModel(palette: ModelPalette) {
  const group = new T.Group();
  group.name = "DM01_Desk_Terminal_and_TF_Cartridge";
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const textures = new Set<T.Texture>();
  const material = (color: string, roughness=.65, metalness=.1) => {
    const result = new T.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(result); return result;
  };
  const black = material("#090b0d",.85);
  const shell = material("#3c4247",.48,.3);
  const face = material("#51595e",.55,.22);
  const panel = material("#d3ceba",.72);
  const accent = material(palette.accent,.5,.16);
  const metal = material("#858b8d",.34,.75);
  const rubber = material("#171b1d",.95);
  const lamp = new T.MeshStandardMaterial({color:"#66f0a5",emissive:"#34bb75",emissiveIntensity:1});
  materials.add(lamp);
  function mesh(geometry: T.BufferGeometry, mat: T.Material, x:number,y:number,z:number, name:string, parent=group) {
    geometries.add(geometry);
    const object = new T.Mesh(geometry,mat);
    object.position.set(x,y,z); object.name=name;
    object.castShadow=true; object.receiveShadow=true;
    parent.add(object); return object;
  }
  function box(w:number,h:number,d:number,x:number,y:number,z:number,mat:T.Material,name:string,r=.06,parent=group) {
    return mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/4,h/4,d/4)),mat,x,y,z,name,parent);
  }
  function disc(radius:number,depth:number,x:number,y:number,z:number,mat:T.Material,name:string,parent=group) {
    const item=mesh(new T.CylinderGeometry(radius,radius,depth,32),mat,x,y,z,name,parent);
    item.rotation.x=Math.PI/2; return item;
  }
  function label(text:string,w:number,h:number,x:number,y:number,z:number,background="#d3ceba",ink="#14181a",parent=group) {
    const canvas=document.createElement("canvas"); canvas.width=512; canvas.height=Math.max(24,Math.round(512*h/w));
    const ctx=canvas.getContext("2d")!;
    ctx.fillStyle=background; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=ink; ctx.font=`900 ${Math.round(canvas.height*.52)}px sans-serif`; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(text,canvas.width/2,canvas.height*.52,canvas.width*.92);
    const texture=new T.CanvasTexture(canvas); texture.colorSpace=T.SRGBColorSpace; textures.add(texture);
    const mat=new T.MeshStandardMaterial({map:texture,roughness:.85}); materials.add(mat);
    return mesh(new T.PlaneGeometry(w,h),mat,x,y,z,"Printed_label_"+text,parent);
  }
  // The CRT shell has depth, recessed glazing, a removable control bank and rear service panel.
  box(6.5,4.12,2.8,0,3.2,0,black,"Rubber_case_seam",.22);
  box(6.37,4.02,2.72,0,3.22,.015,shell,"Beveled_CRT_housing",.22);
  box(6.16,3.87,.26,0,3.2,1.4,face,"Front_face",.16);
  box(4.99,3.51,.24,-.64,3.2,1.56,black,"Deep_screen_bezel",.16);
  box(4.63,3.14,.12,-.64,3.2,1.7,metal,"Glass_trim",.12);
  box(4.49,3,.1,-.64,3.2,1.78,black,"Screen_backing",.08);
  // 4.42 × 2.9467 is exactly 3:2, matching the 480 × 320 display.
  box(1.02,3.48,.21,2.53,3.2,1.59,panel,"Removable_control_bank",.1);
  label("DM-01",.77,.23,2.53,4.65,1.705);
  label("DESK UNIT",.7,.12,2.53,4.4,1.705);
  for(let i=0;i<6;i++) box(.69,.055,.04,2.53,4.09-i*.13,1.72,black,"Speaker_grille_"+i,.02);
  disc(.36,.13,2.53,2.67,1.77,black,"Tuning_dial_rim");
  disc(.29,.15,2.53,2.67,1.86,metal,"Tuning_dial");
  disc(.23,.17,2.53,2.67,1.9,rubber,"Tuning_dial_cap");
  const needle=box(.045,.2,.03,2.61,2.77,2.0,accent,"Tuning_dial_pointer",.01);
  needle.rotation.z=-.55;
  disc(.14,.11,2.53,2.02,1.8,rubber,"Power_button");
  disc(.04,.03,2.53,1.58,1.74,lamp,"Connection_indicator");
  for(const y of [1.63,4.77]) for(const x of [-2.86,2.93]) {
    disc(.05,.035,x,y,1.74,metal,"Case_fastener");
    box(.055,.012,.008,x,y,1.762,black,"Screw_slot",.001);
  }
  for(let i=0;i<9;i++) box(.16,.045,1.65,-2.4+i*.54,5.255,-.12,black,"Top_vent_"+i,.015);
  for(let i=0;i<8;i++) box(.035,.09,1.6,3.197,2.4+i*.21,-.15,black,"Side_vent_"+i,.015);
  const rear=box(4.7,2.8,.08,0,3.15,-1.395,rubber,"Rear_service_panel",.1);
  rear.rotation.y=Math.PI;
  const rearLabel=label("DM-01 / SERVICE",2.4,.34,0,4.05,-1.45);
  rearLabel.rotation.y=Math.PI;
  for(let i=0;i<7;i++) box(3.3,.075,.06,0,3.6-i*.18,-1.46,black,"Rear_cooling_"+i,.01);
  for(const x of [-.75,0,.75]) box(.42,.2,.07,x,2.05,-1.46,metal,"Rear_IO_port",.025);
  // Stacked video base with real depth, feet, physical keys and a recessed media slot.
  box(6.72,.91,3.12,0,.72,.13,black,"VCR_seam",.14);
  box(6.58,.79,3,0,.74,.14,shell,"Video_base",.12);
  box(3.8,.34,.09,.12,.75,1.69,black,"Media_slot",.04);
  label("LOCAL STORAGE / TF",3.4,.16,.12,.75,1.742,"#1c2428","#b9bdb6");
  for(const x of [-2.75,-2.12]) box(.44,.36,.15,x,.75,1.74,metal,"Transport_key",.05);
  box(.08,.19,.025,-2.75,.75,1.83,accent,"Key_mark",.01);
  box(.12,.12,.025,-2.12,.75,1.83,black,"Stop_mark",.01);
  for(let i=0;i<5;i++) box(.06,.35,.05,2.4+i*.13,.76,1.7,black,"Base_grille",.01);
  for(const x of [-2.6,2.6]) for(const z of [-.8,1]) box(.6,.24,.55,x,.16,z,rubber,"Rubber_foot",.06);
  box(.06,.28,.025,1.93,.77,1.75,accent,"Base_signal",.01);
  // A separate TF archive cartridge is an original visual for the actual local-media capability.
  const cartridge=new T.Group(); cartridge.name="TF_Archive_Cartridge";
  cartridge.position.set(-3.15,.55,2.4); cartridge.rotation.set(-.18,.38,-.13); group.add(cartridge);
  box(1.66,1.08,.23,0,0,0,black,"Cartridge_shell",.09,cartridge);
  box(1.45,.67,.025,0,.12,.14,accent,"Cartridge_label",.025,cartridge);
  label("TF / 01",1.2,.33,0,.13,.16,"#d3ceba","#14181a",cartridge);
  for(let i=0;i<5;i++) box(.13,.13,.01,-.4+i*.2,-.39,.13,metal,"Cartridge_contact",.01,cartridge);
  for(let i=0;i<3;i++) box(1.12,.025,.01,0,-.23-i*.07,-.125,black,"Cartridge_rear_grip",.01,cartridge);
  function update(next:ModelPalette) {
    shell.color.set(next.shell==="ivory"?"#bfbba9":"#3c4247");
    face.color.set(next.shell==="ivory"?"#d3ceba":"#51595e");
    panel.color.set(next.shell==="graphite"?"#727876":"#d3ceba");
    accent.color.set(next.accent);
    lamp.color.set(next.online?"#66f0a5":"#515657");
    lamp.emissive.set(next.online?"#34bb75":"#000000");
    // The cartridge's printed label remains a neutral original production marking.
  }
  update(palette);
  return {group, update, dispose() { geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); textures.forEach(t=>t.dispose()); }};
}
