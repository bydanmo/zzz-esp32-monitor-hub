import { dataStateLabel, type DataState } from "../state/ui-state";
import "./screen-artwork.css";

export type ScreenRect = { x: number; y: number; width: number; height: number };

function Cassette({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x} ${y})`} className="screen-cassette" aria-hidden="true">
    <rect x="5" y="6" width="151" height="140" rx="10" fill="#030304" />
    <rect width="151" height="139" rx="9" fill="#444449" stroke="#050506" strokeWidth="3" />
    <rect x="7" y="7" width="137" height="26" rx="3" className="ticket-paper" stroke="#050506" strokeWidth="2" />
    <text x="13" y="26" className="ticket-serial">T-DAY / DM-01</text>
    <rect x="9" y="40" width="133" height="64" rx="8" fill="#0b0c0e" stroke="#060607" strokeWidth="3" />
    {[39,112].map(cx => <g key={cx}><circle cx={cx} cy="72" r="25" fill="#27282b" stroke="#8b8b84" strokeWidth="2" /><circle cx={cx} cy="72" r="17" fill="#b8bab1" stroke="#080809" strokeWidth="3" /><circle cx={cx} cy="72" r="7" fill="#111214" />{[-8,0,8].map(dy => <path key={dy} d={`M${cx-15} ${72+dy}h30`} stroke="#111214" strokeWidth="2" />)}</g>)}
    <path d="M57 62h37M57 82h37" stroke="#b8bab1" strokeWidth="2" />
    <rect x="20" y="116" width="111" height="16" rx="3" fill="#1a1b1d" stroke="#050506" strokeWidth="2" />
    <text x="76" y="128" textAnchor="middle" className="cassette-caption">COUNTDOWN</text>
    {[[8,10],[139,10],[8,127],[139,127]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.5" fill="#93948d" />)}
  </g>;
}

export function PosterCountdown({ rect, seconds, stateLabel }: {
  rect: ScreenRect; seconds: number | null; stateLabel: string;
}) {
  const days = seconds === null ? null : Math.max(0, Math.floor(seconds / 86400));
  const remainder = seconds === null ? 0 : Math.max(0, seconds % 86400);
  const time = seconds === null ? "--:--:--" : [Math.floor(remainder / 3600), Math.floor(remainder % 3600 / 60), remainder % 60].map(v => String(v).padStart(2,"0")).join(":");
  const value = days === null ? "--" : days > 9999 ? "9999+" : days === 0 ? "0" : days <= 999 ? String(days).padStart(3,"0") : String(days);
  const w = rect.width > 300 ? 288 : rect.width;
  const h = rect.height;
  return <g transform={`translate(${rect.x} ${rect.y})`} className="screen-ticket">
    <polygon points={`0,4 ${w-12},0 ${w-1},${h-12} 14,${h-1}`} fill="#050506" />
    <polygon points={`4,8 ${w-16},4 ${w-5},${h-16} 18,${h-5}`} className="ticket-paper" />
    {Array.from({length:32},(_,i) => <rect key={i} x={w-78+(i%8)*8} y={42+Math.floor(i/8)*8} width="2" height="2" fill="#242428" />)}
    <rect x="18" y="15" width="116" height="26" rx="13" fill="#08090a" />
    <text x="28" y="34" className="ticket-heading">考研倒计时</text>
    <text x={w-107} y="31" className="ticket-serial">T-DAY / 01</text>
    <text x={w/2} y={days === null ? 137 : days > 999 ? 125 : 147} textAnchor="middle" className={`ticket-value ${days !== null && days > 999 ? "compact" : ""}`}>{value}{days === null ? null : <tspan dx="8" fontSize="16" fontFamily="RoundNoto">天</tspan>}</text>
    <rect x="22" y={h-61} width={w-44} height="29" rx="14" fill="#08090a" />
    <text x={w/2} y={h-39} textAnchor="middle" className="ticket-clock">{time}</text>
    {stateLabel !== "刚刚更新" ? <text x={w/2} y={h-13} textAnchor="middle" className="ticket-state">{stateLabel}</text> : null}
    {Array.from({length:7},(_,i) => <path key={i} d={`M${20+i*10} ${h-9}l5 -11`} stroke="#101012" strokeWidth="3" />)}
    {rect.width > 300 ? <Cassette x={300} y={(h-146)/2} /> : null}
  </g>;
}

function dialPath(cx: number, cy: number, radius: number, fraction: number) {
  const start = 135*Math.PI/180;
  const end = (135+270*fraction)*Math.PI/180;
  return `M${cx+radius*Math.cos(start)} ${cy+radius*Math.sin(start)} A${radius} ${radius} 0 ${fraction>2/3?1:0} 1 ${cx+radius*Math.cos(end)} ${cy+radius*Math.sin(end)}`;
}

export function PosterMetric({ rect, title, value, state }: {
  rect: ScreenRect; title: string; value: number | null; state: DataState;
}) {
  const progress = Math.max(0, Math.min(value ?? 0,100))/100;
  const large = rect.height >= 150;
  const cx = rect.width/2;
  const cy = rect.height/2-3;
  const diameter = Math.min(rect.width-30,rect.height-64);
  const baseSize = large && diameter >= 160 ? 56 : 40;
  const fontSize = large && value !== null && Math.round(value) === 100 ? (baseSize === 56 ? 40 : 28) : baseSize;
  return <g transform={`translate(${rect.x} ${rect.y})`} className="screen-meter">
    <rect width={rect.width} height={rect.height} rx="12" className="meter-body" />
    <path d={`M14 6h${rect.width-28}`} stroke="#ffffff33" />
    <rect x="16" width={large?62:44} height="4" rx="2" className="ticket-paper" />
    <text x="16" y="30" className="meter-heading">{title}</text>
    <text x={rect.width-17} y="29" textAnchor="end" className="meter-serial">{title === "CPU" ? "SYS-01" : "MEM-02"}</text>
    {large ? <g fill="none" strokeWidth="9" strokeLinecap="round"><path d={dialPath(cx,cy,diameter/2-5,1)} stroke="#08090a" />{progress>0 ? <path d={dialPath(cx,cy,diameter/2-5,progress)} className="meter-arc" /> : null}</g> : null}
    <text x={large?cx:19} y={(large?cy:rect.height/2+9)+(value===null?fontSize*.05:fontSize*.375)} textAnchor={large?"middle":"start"} className="meter-value" style={{fontSize}}>{value === null ? "--" : Math.round(value)+"%"}</text>
    {large ? <text x={cx} y={rect.height-22} textAnchor="middle" className="meter-state">{dataStateLabel(state)}</text> : null}
    <rect x="16" y={rect.height-17} width={rect.width-32} height="6" rx="3" fill="#08080a" />
    <rect x="16" y={rect.height-17} width={(rect.width-32)*progress} height="6" rx="3" className="ticket-paper" />
  </g>;
}
