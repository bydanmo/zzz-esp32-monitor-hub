import { useEffect, useRef, useState } from "react";
import "./animation-library.css";

interface AnimationItem {
  id: string; title: string; label: string; state: "queued" | "converting" | "ready" | "failed";
  duration: number; start: number; error?: string; builtin?: boolean; bytes?: number;
}
interface Catalog { revision: number; items: AnimationItem[]; limits: { count: number; uploadBytes: number; duration: number } }
const stateLabel = { queued: "上传完成，等待转换", converting: "正在转换", ready: "可供小屏下载", failed: "转换失败" };
async function responseJson(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
  return body;
}

export function AnimationLibraryPanel() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [label, setLabel] = useState("CLIP 01");
  const [start, setStart] = useState("0"), [duration, setDuration] = useState("4");
  const [uploading, setUploading] = useState(false), [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState(""), [error, setError] = useState("");
  const [deleting, setDeleting] = useState("");
  const request = useRef<XMLHttpRequest | null>(null);
  const mounted = useRef(true), fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const data: Catalog = await fetch("/api/animations", { cache: "no-store" }).then(responseJson);
      if (!mounted.current) return;
      setCatalog(data);
      setSelected(current => data.items.some(item => item.id === current) ? current : data.items[0]?.id || "");
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "动画库暂不可用"); }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 2000);
    return () => { mounted.current = false; clearInterval(timer); request.current?.abort(); };
  }, []);

  const active = catalog?.items.find(item => item.id === selected);
  const processing = catalog?.items.some(item => item.state === "converting" || item.state === "queued");
  const full = (catalog?.items.length ?? 0) >= (catalog?.limits.count ?? 8);

  function chooseFile(next: File | undefined) {
    if (!next) return;
    if (next.size > 128 * 1024 * 1024 || next.size === 0) { setError("请选择非空、128 MB 以内的视频或 GIF"); return; }
    if (!/\.(mp4|webm|gif|mov|mkv)$/i.test(next.name)) { setError("支持 MP4、WebM、GIF、MOV、MKV"); return; }
    setFile(next); setTitle(next.name.replace(/\.[^.]+$/, "").slice(0, 60));
    setLabel(`CLIP ${String((catalog?.items.length ?? 0) + 1).padStart(2, "0")}`);
    setNotice(""); setError("");
  }

  function upload() {
    if (!file || !catalog || uploading || processing || full) return;
    if (!title.trim() || !/^[A-Za-z0-9 _-]{1,16}$/.test(label.trim())) { setError("请填写动画名称，小屏名称使用 1–16 个英文或数字字符"); return; }
    const offset = Number(start), length = Number(duration);
    if (!Number.isFinite(offset) || offset < 0 || offset > 86400 || !Number.isFinite(length) || length < .5 || length > 4) { setError("起点为 0–86400 秒，片段长度为 0.5–4 秒"); return; }
    const xhr = new XMLHttpRequest(); request.current = xhr;
    const query = new URLSearchParams({ title: title.trim(), label: label.trim(), start, duration });
    xhr.open("POST", `/api/animations?${query}`); xhr.timeout = 180000;
    xhr.upload.onprogress = event => { if (mounted.current && event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
    const finish = () => { request.current = null; if (mounted.current) setUploading(false); };
    xhr.onload = () => {
      if (!mounted.current) return;
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status !== 202) throw new Error(result.error || "上传未完成");
        setSelected(result.item.id); setFile(null); if (fileInput.current) fileInput.current.value = "";
        setNotice("上传完成，电脑正在转换；就绪后，小屏会在后台同步动画目录。");
        void refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "上传失败"); }
      finish();
    };
    xhr.onerror = () => { if (mounted.current) setError("上传连接中断，请重新选择文件重试"); finish(); };
    xhr.ontimeout = () => { if (mounted.current) setError("上传超时，请尝试较小文件"); finish(); };
    xhr.onabort = () => { if (mounted.current) setNotice("已取消上传"); finish(); };
    const data = new FormData(); data.append("file", file);
    setError(""); setNotice(""); setProgress(0); setUploading(true); xhr.send(data);
  }
  async function remove(item: AnimationItem) {
    setError("");
    try {
      await fetch(`/api/animations/${item.id}`, { method: "DELETE" }).then(responseJson);
      setDeleting(""); setNotice("已从电脑动画库移除。小屏同步后会更新目录，缺失的当前片段回退到默认动画。"); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败"); }
  }
  async function move(index: number, step: number) {
    if (!catalog || index + step < 0 || index + step >= catalog.items.length) return;
    const ids = catalog.items.map(item => item.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    setError("");
    try {
      await fetch("/api/animations/order", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: catalog.revision, ids }) }).then(responseJson);
      setNotice("顺序已保存，小屏的顺序循环将按新目录播放。"); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "排序失败"); await refresh(); }
  }

  return <section className="animation-library" aria-label="ESP32 动画库">
    <header className="animation-heading"><div><span>LOCAL CINEMA / ANIMATION LIBRARY</span><h2>给小屏换一段动画。</h2></div><b>{catalog ? `${catalog.items.length} / ${catalog.limits.count}` : "连接中"}</b></header>
    <p className="animation-intro">就绪片段按下方顺序组成队列。「队列轮播」每次屏保只循环一段，下一次屏保再播放下一段；「固定单段」始终播放选定片段。小屏在监控阶段自动同步 TF 卡，已有缓存会复用，预览是可选操作。</p>
    <div className="animation-workbench">
      <div className="animation-preview">
        {active?.state === "ready" ? <video key={active.id} controls loop muted playsInline preload="metadata" poster={`/api/animations/assets/${active.id}/poster`} src={`/api/animations/assets/${active.id}/preview`} aria-label={`${active.title}网页预览`} />
          : <div className="animation-no-preview"><strong>{active ? stateLabel[active.state] : "等一段好画面。"}</strong><span>{active?.error || (catalog ? "选择或上传动画后预览" : "正在连接本地 Hub")}</span></div>}
        <div className="animation-preview-caption"><b>{active?.title || "动画预览"}</b><span>{active?.label || "NO SIGNAL"} · 仅网页预览</span></div>
        {active?.state === "ready" && <p>{active.duration.toFixed(1)} 秒 · 198×150 局部窗口 · 源时间轴 30 FPS</p>}
      </div>
      <ol className="animation-items" aria-label="动画播放顺序">{catalog?.items.map((item, index) => <li key={item.id} className={selected === item.id ? "is-selected" : ""}>
        <button type="button" className="animation-select" onClick={() => { setSelected(item.id); setDeleting(""); }} aria-pressed={selected === item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.title}</b><small>{item.label} · {stateLabel[item.state]}</small>{item.error && <small className="animation-error">{item.error}</small>}</div></button>
        <div className="animation-item-tools"><button type="button" aria-label={`上移${item.title}`} disabled={index === 0} onClick={() => void move(index, -1)}>↑</button><button type="button" aria-label={`下移${item.title}`} disabled={index === (catalog.items.length - 1)} onClick={() => void move(index, 1)}>↓</button>{!item.builtin && <button type="button" disabled={item.state === "queued" || item.state === "converting"} onClick={() => setDeleting(item.id)}>删除</button>}</div>
        {deleting === item.id && <div className="animation-confirm"><span>移除这段动画？</span><button type="button" onClick={() => void remove(item)}>确认移除</button><button type="button" onClick={() => setDeleting("")}>保留</button></div>}
      </li>)}</ol>
    </div>
    <form className="animation-upload" onSubmit={event => { event.preventDefault(); upload(); }}>
      <label className="animation-file"><span>{file ? file.name : "＋ 选择视频或 GIF"}</span><small>MP4 / WebM / GIF / MOV / MKV · 128 MB 内</small><input ref={fileInput} aria-label="选择动画文件" type="file" accept=".mp4,.webm,.gif,.mov,.mkv" disabled={uploading || processing || full} onChange={event => chooseFile(event.target.files?.[0])} /></label>
      <div className="animation-fields"><label>动画名称<input aria-label="动画名称" maxLength={60} value={title} onChange={event => setTitle(event.target.value)} disabled={uploading} /></label><label>小屏名称<input aria-label="小屏动画名称" maxLength={16} value={label} onChange={event => setLabel(event.target.value)} disabled={uploading} /><small>英文／数字，避免设备字库缺字</small></label><label>从第几秒<input aria-label="动画截取起点" type="number" min="0" max="86400" step=".1" value={start} onChange={event => setStart(event.target.value)} disabled={uploading} /></label><label>截取秒数<input aria-label="动画截取长度" type="number" min=".5" max="4" step=".1" value={duration} onChange={event => setDuration(event.target.value)} disabled={uploading} /></label></div>
      <div className="animation-upload-actions"><span>{full ? "动画库已满，请先删除不用的片段" : processing ? "电脑正在转换，完成后可继续上传" : "保持现有 CRT 房间 · 无音频 · 最多 8 段"}</span><button type="submit" disabled={!file || !catalog || uploading || processing || full}>{uploading ? `上传 ${progress}%` : "上传并转换"}</button>{uploading && <button type="button" onClick={() => request.current?.abort()}>取消上传</button>}</div>
    </form>
    {error && <p className="animation-error" role="alert">{error}</p>}
    {notice && <p className="animation-notice" role="status">{notice}</p>}
    <footer className="animation-instructions"><b>自动屏保</b><span>设置 → 动画 → 队列轮播／固定单段 → 保存；保存后留在本页。任何页面 5 分钟无操作后进入屏保，同一段循环 5 分钟后恢复原页面。队列在下一次屏保才换到下一段，播完末项回到首项；重启后从首项开始。触摸可提前返回，预览不改变队列进度。运行中的学习计时与完成待确认会阻止屏保，暂停时允许，计时保持暂停。</span></footer>
  </section>;
}
