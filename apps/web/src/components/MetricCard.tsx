import { dataStateLabel, type DataState } from "../state/ui-state";

export function MetricCard({ title, value, unit, state, progress, code }: {
  title: string;
  value: string;
  unit?: string;
  state: DataState;
  progress?: number | null;
  code?: string;
}) {
  return <article className={"metric-card state-" + state} data-code={code}>
    {code ? <span className="metric-watermark" aria-hidden="true">{code}</span> : null}
    <header className="metric-card-head"><p>{title}</p>{code ? <span>{code}</span> : null}</header>
    <strong>{value}<small>{unit}</small></strong>
    {progress !== undefined ? <div className="metric-bar" aria-hidden="true">
      <i style={{ width: Math.max(0, Math.min(progress ?? 0, 100)) + "%" }} />
    </div> : null}
    <span>{dataStateLabel(state)}</span>
  </article>;
}
