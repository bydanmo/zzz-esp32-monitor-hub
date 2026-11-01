import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { AnimationConverter } from "./animation-library.js";
const exec = promisify(execFile);

/** Fixed-size CRT patch; no shell, source URLs, source-specific crops or UI-thread transcoding. */
export const convertAnimation: AnimationConverter = async (input, output, background, options) => {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
  const probe = await exec(ffprobe, ["-v", "error", "-format_whitelist", "mov,matroska,webm,gif", "-protocol_whitelist", "file,pipe", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration", "-of", "json", input], { timeout: 15000, maxBuffer: 64 * 1024, windowsHide: true }).catch(() => { throw new Error("无法读取视频，请确认格式有效且已安装 FFmpeg／FFprobe"); });
  const info = JSON.parse(probe.stdout), stream = info.streams?.[0];
  if (!stream || stream.width < 1 || stream.height < 1 || stream.width * stream.height > 3840 * 2160) throw new Error("视频尺寸须在 3840×2160 以内");
  if (Number.isFinite(Number(info.format?.duration)) && options.start >= Number(info.format.duration)) throw new Error("截取起点超过视频时长");
  const frames = Math.round(options.duration * 30), seconds = String(frames / 30);
  const shape = "clip((1-pow(abs((X-98.5)/98.5),4)-pow(abs((Y-74.5)/74.5),4))*1020,0,255)";
  const graph = "[0:v]format=gbrp,split=2[base][cut];[cut]crop=198:150:145:82[old];" +
    `[1:v]setpts=PTS-STARTPTS,fps=30,scale=198:150:force_original_aspect_ratio=increase:flags=lanczos,crop=198:150,tpad=stop_mode=clone:stop_duration=4,format=gbrp[film];` +
    `nullsrc=s=198x150:r=30,format=gbrp,geq=r='${shape}':g='${shape}':b='${shape}'[mask];` +
    "[old][film][mask]maskedmerge,split=2[patch][inside];[base][inside]overlay=145:82:format=auto,format=yuv420p[scene]";
  try {
    await exec(ffmpeg, ["-hide_banner", "-loglevel", "error", "-filter_complex_threads", "1", "-threads", "1",
      "-stream_loop", "-1", "-f", "rawvideo", "-pixel_format", "rgb565be", "-video_size", "480x320", "-framerate", "30", "-i", background,
      "-ss", String(options.start), "-format_whitelist", "mov,matroska,webm,gif", "-protocol_whitelist", "file,pipe", "-threads", "1", "-i", input,
      "-filter_complex", graph, "-map", "[patch]", "-t", seconds, "-an", "-pix_fmt", "rgb565be", "-f", "rawvideo", "-y", path.join(output, "frames.raw"),
      "-map", "[scene]", "-t", seconds, "-an", "-c:v", "libx264", "-threads", "1", "-crf", "20", "-movflags", "+faststart", "-y", path.join(output, "preview.mp4")],
    { timeout: 120000, maxBuffer: 256 * 1024, windowsHide: true });
    await exec(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", path.join(output, "preview.mp4"), "-frames:v", "1", "-q:v", "3", "-y", path.join(output, "poster.jpg")], { timeout: 15000, windowsHide: true });
  } catch { throw new Error("动画转换失败或超时，请尝试较小的视频片段"); }
  return { frames };
};
