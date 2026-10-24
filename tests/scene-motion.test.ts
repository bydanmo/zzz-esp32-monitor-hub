import assert from "node:assert/strict";
import test from "node:test";
import {scenePose,scrollProgress} from "../apps/web/src/three/scene-motion.ts";

test("滚动出入展示区域时相机始终停留在设计的有限范围",()=>{
  for(const top of [-100000,-700,0,500,100000]) {
    const progress=scrollProgress(top,570,800);
    assert.ok(progress>=0 && progress<=1);
    const pose=scenePose(progress,"scroll",false);
    assert.ok(Number.isFinite(pose.yaw) && pose.yaw>=-.750001 && pose.yaw<=.850001);
    assert.ok(Number.isFinite(pose.elevation));
  }
});
test("简化动效固定滚动视角，但仍允许主动选择背部和正面",()=>{
  assert.deepEqual(scenePose(0,"scroll",true),scenePose(1,"scroll",true));
  assert.notDeepEqual(scenePose(0,"rear",true),scenePose(0,"front",true));
});
test("手动选择视角不受页面滚动位置影响",()=>{
  for(const view of ["front","detail","rear"] as const)
    assert.deepEqual(scenePose(0,view,false),scenePose(1,view,false));
  assert.notDeepEqual(scenePose(0,"scroll",false),scenePose(1,"scroll",false));
});
