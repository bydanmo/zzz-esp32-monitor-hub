import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./design/ui-contracts.generated.css";
import "./design/functional-base.css";
import "./design/retro-base.css";
import "./design/retro-themes.css";
import "./styles.css";
import "./design/reference-workbench.css";
import "./design/instrument-edition.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>
);
