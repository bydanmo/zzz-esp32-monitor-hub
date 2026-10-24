export type Viewpoint = "scroll" | "front" | "detail" | "rear";
export const clampProgress = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function scrollProgress(top: number, height: number, viewport: number): number {
  return clampProgress((viewport-top)/Math.max(1, viewport+height));
}

export function scenePose(progress: number, viewpoint: Viewpoint, reduced: boolean) {
  if(viewpoint === "front") return { yaw: 0, elevation: 1.9 };
  if(viewpoint === "detail") return { yaw: .8, elevation: 3.3 };
  if(viewpoint === "rear") return { yaw: 2.7, elevation: 2.5 };
  const p = reduced ? .36 : clampProgress(progress);
  return { yaw: .85-1.6*p, elevation: 3.4-1.1*p };
}
