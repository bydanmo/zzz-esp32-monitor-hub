import { useEffect, useState } from "react";
import { appearanceStorageKey, defaultAppearance, readAppearance } from "./appearance";

export function useAppearance() {
  const key = new URLSearchParams(location.search).get("mode") === "demo" ? appearanceStorageKey + ".demo" : appearanceStorageKey;
  const [preferences, setPreferences] = useState(() => {
    try { return readAppearance(localStorage.getItem(key)); }
    catch { return { ...defaultAppearance }; }
  });
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [storageNotice, setStorageNotice] = useState("");
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setSystemReduced(query.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(preferences));
      setStorageNotice("");
    } catch { setStorageNotice("浏览器未允许保存外观，本次选择仍然有效"); }
  }, [preferences]);
  const reduced = preferences.motion === "reduced" || (preferences.motion === "system" && systemReduced);
  return { preferences, setPreferences, reduced, storageNotice };
}
