import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { apiLatestRelease, apiUrl } from "./api";
import { decideUpdate, installFailureMessage, shouldCheckForUpdate, shouldShowUpdateBanner } from "./update";
import type { LatestRelease } from "./update";

export type AppInfo = { versionCode: number; versionName: string; updateSource: "sideload" | "play"; canInstall: boolean };

/** The Java side lives in android/.../AppUpdatePlugin.java. */
interface AppUpdatePlugin {
  getInfo(): Promise<AppInfo>;
  downloadAndInstall(options: { url: string; versionCode: number; sha256?: string; size?: number }): Promise<{ status: "installing" }>;
  openInstallSettings(): Promise<void>;
  openStore(): Promise<void>;
  addListener(event: "downloadProgress", listener: (progress: { read: number; total: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: "installResult", listener: (result: { status: number; message?: string | null }) => void): Promise<PluginListenerHandle>;
}

export const AppUpdate = registerPlugin<AppUpdatePlugin>("AppUpdate");

export type UpdateUiState =
  | { kind: "hidden" }
  | { kind: "available"; release: LatestRelease; store: boolean }
  | { kind: "downloading"; read: number; total: number }
  | { kind: "installing" }
  | { kind: "needs-permission"; release: LatestRelease }
  | { kind: "failed"; message: string; release: LatestRelease };

const DISMISSED_KEY = "ruminate-update-dismissed";
const CHECKED_KEY = "ruminate-update-checked";
const readNumber = (key: string) => { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } };
const writeNumber = (key: string, value: number) => { try { localStorage.setItem(key, String(value)); } catch { /* storage unavailable */ } };

/** Only the Android app updates itself; the web app and iOS never reach the update endpoints. */
const updatesEnabled = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
const inFlight = (state: UpdateUiState) => state.kind === "downloading" || state.kind === "installing" || state.kind === "needs-permission";

export function useAppUpdate() {
  const [state, setState] = useState<UpdateUiState>({ kind: "hidden" });
  const stateRef = useRef(state);
  stateRef.current = state;
  const info = useRef<AppInfo | null>(null);

  const install = useCallback(async (release: LatestRelease) => {
    if (release.versionCode === null) return;
    setState({ kind: "downloading", read: 0, total: release.size ?? 0 });
    try {
      await AppUpdate.downloadAndInstall({ url: apiUrl("/app/download"), versionCode: release.versionCode, sha256: release.sha256 ?? undefined, size: release.size ?? undefined });
      setState({ kind: "installing" });
    } catch (error) {
      const failure = error as { code?: string; message?: string };
      setState(failure.code === "NEEDS_PERMISSION"
        ? { kind: "needs-permission", release }
        : { kind: "failed", message: failure.message || "The download failed.", release });
    }
  }, []);

  const check = useCallback(async () => {
    if (inFlight(stateRef.current) || !shouldCheckForUpdate(Date.now(), readNumber(CHECKED_KEY))) return;
    try {
      info.current = await AppUpdate.getInfo();
      // GitHub APK releases do not describe availability on a user's Play track.
      // Let Google Play manage updates instead of prompting for sideload releases.
      if (info.current.updateSource === "play") { setState({ kind: "hidden" }); return; }
      const latest = await apiLatestRelease();
      writeNumber(CHECKED_KEY, Date.now());
      const release = decideUpdate(latest, info.current.versionCode);
      if (inFlight(stateRef.current)) return;
      setState(release && shouldShowUpdateBanner(release.versionCode!, info.current.versionCode, readNumber(DISMISSED_KEY))
        ? { kind: "available", release, store: false }
        : { kind: "hidden" });
    } catch { /* quiet: offline or the backend is unreachable */ }
  }, []);

  useEffect(() => {
    if (!updatesEnabled) return;
    void check();
    const handles: Promise<PluginListenerHandle>[] = [
      App.addListener("appStateChange", async ({ isActive }) => {
        if (!isActive) return;
        const current = stateRef.current;
        // Back from Android's "Allow from this source" page: carry on with the update.
        if (current.kind === "needs-permission") {
          const fresh = await AppUpdate.getInfo().catch(() => null);
          if (fresh?.canInstall) void install(current.release);
          return;
        }
        void check();
      }),
      AppUpdate.addListener("downloadProgress", ({ read, total }) => {
        setState(previous => previous.kind === "downloading" ? { kind: "downloading", read, total: total > 0 ? total : previous.total } : previous);
      }),
      AppUpdate.addListener("installResult", ({ status, message }) => {
        const release = stateRef.current.kind === "failed" ? stateRef.current.release : null;
        setState(status === 0 ? { kind: "hidden" } : { kind: "failed", message: installFailureMessage(status, message), release: release ?? { configured: true, version: null, versionCode: null, size: null, publishedAt: "", notes: "", sha256: null } });
      })
    ];
    return () => { handles.forEach(handle => void handle.then(item => item.remove())); };
  }, [check, install]);

  const update = useCallback(() => {
    const current = stateRef.current;
    if (current.kind === "available" && current.store) { void AppUpdate.openStore(); return; }
    if (current.kind === "needs-permission") { void AppUpdate.openInstallSettings(); return; }
    if (current.kind === "available" || current.kind === "failed") void install(current.release);
  }, [install]);

  const later = useCallback(() => {
    const current = stateRef.current;
    if ((current.kind === "available" || current.kind === "failed") && current.release.versionCode !== null) writeNumber(DISMISSED_KEY, current.release.versionCode);
    setState({ kind: "hidden" });
  }, []);

  return { state, update, later };
}
