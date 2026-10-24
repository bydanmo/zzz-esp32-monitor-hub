import type { DeviceDisplayConfig, DeviceScene } from "../../types";

function withActiveScene(config: DeviceDisplayConfig, scene: DeviceScene): DeviceDisplayConfig {
  return {
    ...config,
    activeSceneId: scene.id,
    page: scene.page,
    visible: structuredClone(scene.visible)
  };
}

export function SceneManager({ config, onChange }: {
  config: DeviceDisplayConfig;
  onChange: (config: DeviceDisplayConfig) => void;
}) {
  const updateScene = (id: string, updater: (scene: DeviceScene) => DeviceScene) => {
    const scenes = config.scenes.map((scene) => scene.id === id ? updater(scene) : scene);
    const active = scenes.find((scene) => scene.id === config.activeSceneId) ?? scenes[0];
    onChange(withActiveScene({ ...config, scenes }, active));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= config.scenes.length) return;
    const scenes = [...config.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    onChange({ ...config, scenes });
  };

  return <fieldset><legend>场景编排</legend><div className="scene-list">
    {config.scenes.map((scene, index) => {
      const active = scene.id === config.activeSceneId;
      return <article key={scene.id} className={active ? "scene-row active" : "scene-row"}>
        <div className="scene-main">
          <button type="button" className="scene-select" disabled={!scene.enabled}
            onClick={() => onChange(withActiveScene(config, scene))}>
            <b>{scene.name}</b><small>{scene.page === "overview" ? "总览模板" : scene.page === "system" ? "系统模板" : "学习模板"}</small>
          </button>
          <label className="scene-enabled"><input type="checkbox" checked={scene.enabled}
            disabled={active}
            onChange={(event) => updateScene(scene.id, (current) => ({ ...current, enabled: event.target.checked }))} />启用</label>
        </div>
        <div className="scene-controls">
          <label className="scene-duration"><span>停留</span>
            <input type="number" min="10" max="3600" step="5" value={scene.durationSeconds}
              onChange={(event) => updateScene(scene.id, (current) => ({
                ...current,
                durationSeconds: Number(event.target.value)
              }))} /><span>秒</span></label>
          <div className="scene-order">
            <button type="button" aria-label={`${scene.name} 上移`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" aria-label={`${scene.name} 下移`} disabled={index === config.scenes.length - 1} onClick={() => move(index, 1)}>↓</button>
          </div>
        </div>
      </article>;
    })}
  </div><p className="field-help">当前固件显示所选场景；原生按顺序定时轮换将在固件协议 v2 启用。</p></fieldset>;
}
