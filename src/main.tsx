import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { Recover, report } from "./ui/Recover";
import { initUiSounds } from "./lib/uiSound";
import "@fontsource/unbounded/600.css";
import "@fontsource/unbounded/800.css";
import "@fontsource-variable/manrope";
import "./styles/tokens.css";
import "./styles/app.css";

window.addEventListener("error", (e) => report(e.error instanceof Error ? (e.error.stack ?? String(e.error)) : e.message));
window.addEventListener("unhandledrejection", (e) => e.reason instanceof Error && report(e.reason.stack ?? String(e.reason)));

initUiSounds();
if (localStorage.getItem("kromvia.density") === "compact") document.documentElement.dataset.density = "compact";

function Ready() {
  React.useEffect(() => {
    invoke("ui_ready").catch(() => {});
  }, []);
  return null;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Recover>
      <App />
    </Recover>
    <Ready />
  </React.StrictMode>,
);
