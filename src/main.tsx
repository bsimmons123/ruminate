import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import "./styles.css";
import "./reels.css";
import "./native.css";
import { isNativeApp } from "./nativePush";

if (isNativeApp) {
  document.documentElement.classList.add("native");
  if (Capacitor.getPlatform() === "ios") document.documentElement.classList.add("ios");
  // Suppressing pinch-zoom is standard in a native shell but an accessibility loss on
  // the web, so it is applied here rather than in index.html.
  document.querySelector('meta[name="viewport"]')?.setAttribute(
    "content",
    "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);

if (!isNativeApp && "serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
