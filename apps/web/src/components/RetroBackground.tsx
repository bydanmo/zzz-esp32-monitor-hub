import type { ThemeEdition } from "../design/appearance";

export function RetroBackground({ edition }: { edition: ThemeEdition }) {
  return <div className="print-stage" aria-hidden="true">
    <div className="type-field field-one"><div className="type-track"><span>DESK MONITOR</span><span>DESK MONITOR</span></div><div className="print-caption">LOCAL DISPLAY TERMINAL / DATA • CONTROL / 01</div></div>
    <div className="type-field field-two"><div className="type-track"><span>{edition.title}</span><span>{edition.title}</span></div><div className="print-caption">A SMALL SCREEN. AN EVERYDAY COMPANION.</div></div>
    <div className="type-field field-three"><div className="type-track"><span>{edition.word}</span><span>{edition.word}</span></div></div>
    <div className="film-band"><b>01</b><span>DM</span><b>02</b><span>DM</span><b>03</b></div>
    <div className="halftone-patch rich-decoration" />
    <div className="record-disc rich-decoration"><div className="record-spin"><i /><b>DM / 01</b></div></div>
    <div className="signal-ticker rich-decoration"><div>{[0, 1, 2, 3].map(i => <span key={i}>LOCAL SYSTEM ◆ DATA / DISPLAY / CONTROL ◆</span>)}</div></div>
    <div className="moving-stamp rich-decoration"><b>01</b><span>DESK<br />EDITION</span></div>
    <div className="chevron-lane rich-decoration"><i /></div>
  </div>;
}
