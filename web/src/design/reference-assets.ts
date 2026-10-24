import type { ThemeId } from "./appearance";
/** Project-original SVG covers; see scripts/create-original-art.py. */
export const channelArtwork: Record<ThemeId, {src:string;title:string;reference:string}> = {
  signal: {src:"/art/original/signal.svg",title:"街区信号",reference:"ORIGINAL-SIGNAL"},
  tape: {src:"/art/original/tape.svg",title:"模拟频道",reference:"ORIGINAL-TAPE"},
  arcade: {src:"/art/original/arcade.svg",title:"蓝色频段",reference:"ORIGINAL-ARCADE"},
  night: {src:"/art/original/night.svg",title:"深夜电台",reference:"ORIGINAL-NIGHT"},
  acid: {src:"/art/original/acid.svg",title:"桌面资料库",reference:"ORIGINAL-ACID"},
  paper: {src:"/art/original/paper.svg",title:"日常档案",reference:"ORIGINAL-PAPER"}
};
