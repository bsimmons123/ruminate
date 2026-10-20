import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import "./theme.css";
import "./styles.css";
import "./reels.css";
import "./native.css";
import { isNativeApp } from "./nativePush";
import { ErrorBoundary } from "./components/ErrorBoundary";

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

/* Signing out from the fallback has to clear storage directly: the boundary sits
   above App, so the normal sign-out path is not available once a render has failed. */
const escapeHatch = () => { localStorage.clear(); window.location.reload(); };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><ErrorBoundary onSignOut={escapeHatch}><App /></ErrorBoundary></React.StrictMode>
);

if (!isNativeApp && "serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}
