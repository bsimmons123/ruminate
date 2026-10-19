import type { CommunityCollection, User } from "./types";
import { Capacitor } from "@capacitor/core";
import { acknowledgeChange, cachedItems, cacheServerItems, forgetAccount, pendingChanges, queueChange, rememberedUser, rememberUser } from "./offline";
import type { PendingChange } from "./offline";
import { SESSION_KEY } from "./auth";

const native = Capacitor.isNativePlatform();
export const apiCredentials: RequestCredentials = native ? "omit" : "include";
const TOKEN_KEY = "selah-native-session";
export const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "";
export const apiUrl = (path: string) => `${apiBase}/api${path}`;
export const apiAuthHeaders = (): Record<string, string> => native && localStorage.getItem(TOKEN_KEY) ? { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` } : {};
export type ConnectionState = { mode: "online" | "offline" | "syncing"; pending: number };
let account: User | null = rememberedUser();
let transportOffline = !navigator.onLine;
let syncing: Promise<void> | undefined;
let sessionVersion = 0;

const unavailable = (error: unknown) => { const status = (error as { status?: number })?.status; return status === undefined || status >= 500; };
async function announce(mode: ConnectionState["mode"]) {
  const owner = account?.id;
  const pending = owner ? (await pendingChanges(owner)).length : 0;
  if (account?.id === owner) window.dispatchEvent(new CustomEvent<ConnectionState>("ruminate-connection", { detail: { mode, pending } }));
}
function clearSession() {
  account = null; sessionVersion++; rememberUser(null);
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(SESSION_KEY);
}
function expiredSession() {
  clearSession();
  window.dispatchEvent(new Event("ruminate-session-expired"));
}
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!navigator.onLine) throw new TypeError("No internet connection.");
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");
  for (const [key, value] of Object.entries(apiAuthHeaders())) headers.set(key, value);
  if (native) headers.set("X-Ruminate-Native", "true");
  const controller = new AbortController();
  const timeout = options?.signal ? undefined : window.setTimeout(() => controller.abort(), 10000);
  let response: Response;
  try { response = await fetch(apiUrl(path), { ...options, signal: options?.signal || controller.signal, credentials: apiCredentials, headers }); }
  finally { if (timeout !== undefined) window.clearTimeout(timeout); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || "The server could not complete that request.") as Error & { status: number }; error.status = response.status; throw error; }
  return data as T;
}
function requireAccount() {
  if (!account) throw new Error("Please sign in to continue.");
  return account.id;
}
function payload(change: PendingChange, remote?: Record<string, unknown>) {
  if (change.kind !== "library" || change.method !== "PUT") return change.data;
  const data = change.data as Record<string, unknown>;
  if (remote?.syncRevision === change.revision) return remote;
  const before = change.before as { reviews?: number } | undefined;
  const accepted = change.superseded?.find(value => value.revision === remote?.syncRevision);
  const delta = Math.max(0, Number(data.reviews || 0) - Number(accepted?.reviews ?? before?.reviews ?? 0));
  return { ...data, ...(remote ? { reviews: Number(remote.reviews || 0) + delta } : {}), syncRevision: change.revision };
}
async function flushChanges(owner: string, version: number) {
  let changes = await pendingChanges(owner);
  if (!changes.length) { await announce("online"); return; }
  await announce("syncing");
  while (changes.length) {
    const remoteLibrary = changes.some(change => change.kind === "library" && change.method === "PUT") ? await request<Record<string, unknown>[]>("/data/library") : [];
    for (const change of changes) {
      if (sessionVersion !== version || account?.id !== owner) return;
      const current = (await pendingChanges(owner)).find(value => value.id === change.id);
      if (current?.revision !== change.revision) continue;
      const remote = change.kind === "library" ? remoteLibrary.find(value => value.verseId === change.itemId) : undefined;
      const data = payload(change, remote);
      await request(`/data/${change.kind}/${encodeURIComponent(change.itemId)}`, { method: change.method, ...(change.method === "PUT" ? { body: JSON.stringify(data) } : {}) });
      await acknowledgeChange(change, data);
    }
    if (sessionVersion !== version || account?.id !== owner) return;
    changes = await pendingChanges(owner);
  }
  await announce("online");
  window.dispatchEvent(new CustomEvent("ruminate-sync-complete", { detail: { userId: owner } }));
}
export async function apiSyncPending() {
  if (!account || !navigator.onLine) { transportOffline = true; await announce("offline"); return; }
  if (syncing) return syncing;
  const owner = account.id, version = sessionVersion;
  const job = (async () => {
    try {
      const verified = await request<User | null>("/auth/me");
      if (!verified || verified.id !== owner) { expiredSession(); return; }
      if (sessionVersion !== version) return;
      transportOffline = false;
      await flushChanges(owner, version);
    } catch (error) {
      if (sessionVersion !== version) return;
      if ((error as { status?: number }).status === 401) { expiredSession(); return; }
      transportOffline = true; await announce("offline");
    }
  })();
  syncing = job;
  try { await job; } finally { if (syncing === job) syncing = undefined; }
}

export const serverEnabled = true;
export async function apiCurrentUser() {
  try {
    const user = await request<User | null>("/auth/me");
    if (!user) { clearSession(); return null; }
    account = user; rememberUser(user); transportOffline = false;
    void apiSyncPending();
    return user;
  } catch (error) {
    if ((error as { status?: number }).status === 401) { clearSession(); return null; }
    if (!unavailable(error)) throw error;
    account = native && !localStorage.getItem(TOKEN_KEY) ? null : rememberedUser(); transportOffline = true; await announce("offline");
    if (account) return account;
    throw error;
  }
}
async function nativeSession(promise: Promise<User & { token?: string }>) {
  const user = await promise;
  if (native && user.token) localStorage.setItem(TOKEN_KEY, user.token);
  const { token: _token, ...profile } = user;
  sessionVersion++; account = profile; rememberUser(profile); transportOffline = false;
  void apiSyncPending();
  return profile as User;
}
export const apiSignUp = (name: string, email: string, password: string) => nativeSession(request<User & { token?: string }>("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) }));
export const apiSignIn = (email: string, password: string) => nativeSession(request<User & { token?: string }>("/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) }));
export async function apiSignOut(deviceToken?: string | null) {
  try {
    const value = await request<{ ok: boolean }>("/auth/signout", { method: "POST", body: JSON.stringify({ deviceToken }) });
    clearSession(); return value;
  } catch (error) {
    if ((error as { status?: number }).status === 401) { clearSession(); return { ok: true }; }
    throw error;
  }
}
/* Deletion is irreversible and server-authoritative, so it is never queued for offline
   replay: with no connection the request fails and the account is left untouched. */
export async function apiDeleteAccount() {
  const owner = requireAccount();
  const value = await request<{ ok: boolean }>("/account", { method: "DELETE" });
  await forgetAccount(owner).catch(() => {});
  clearSession();
  return value;
}
async function offlineItems<T>(owner: string, kind: string): Promise<T[]> {
  const items = await cachedItems<T>(owner, kind);
  if (!items) throw new Error("Connect once to finish downloading your account for offline practice.");
  return items;
}
export async function apiItems<T>(kind: string): Promise<T[]> {
  const owner = requireAccount(), version = sessionVersion;
  if (transportOffline || !navigator.onLine) return offlineItems<T>(owner, kind);
  try {
    const values = await request<T[]>(`/data/${kind}`);
    if (sessionVersion !== version) throw new Error("The signed-in account changed.");
    return await cacheServerItems(owner, kind, values);
  } catch (error) {
    if ((error as { status?: number }).status === 401) { expiredSession(); throw error; }
    if (!unavailable(error) || sessionVersion !== version) throw error;
    transportOffline = true; await announce("offline");
    return offlineItems<T>(owner, kind);
  }
}
async function saveChange(kind: string, itemId: string, method: "PUT" | "DELETE", data?: unknown, reviewIncrement = 0) {
  const owner = requireAccount(), version = sessionVersion;
  const change = await queueChange(owner, kind, itemId, method, data, reviewIncrement);
  if (sessionVersion !== version || account?.id !== owner) throw new Error("The signed-in account changed. Your change remains saved for its original account.");
  if (transportOffline || !navigator.onLine) { transportOffline = true; await announce("offline"); return { ok: true, data: change.data }; }
  if (syncing) { await announce("syncing"); return { ok: true, data: change.data }; }
  try {
    const outgoing = payload(change);
    await request(`/data/${kind}/${encodeURIComponent(itemId)}`, { method, ...(method === "PUT" ? { body: JSON.stringify(outgoing) } : {}) });
    await acknowledgeChange(change, outgoing);
    if (sessionVersion === version) await announce("online");
    return { ok: true, data: outgoing };
  } catch (error) {
    if ((error as { status?: number }).status === 401) { expiredSession(); throw error; }
    if (!unavailable(error)) { await acknowledgeChange(change, undefined, true); throw error; }
    if (sessionVersion === version) { transportOffline = true; await announce("offline"); }
    return { ok: true, data: change.data };
  }
}
export const apiPut = (kind: string, itemId: string, data: unknown, reviewIncrement = 0) => saveChange(kind, itemId, "PUT", data, reviewIncrement);
export const apiDelete = (kind: string, itemId: string) => saveChange(kind, itemId, "DELETE");
export const apiCollections = () => request<CommunityCollection[]>("/collections");
export const apiCommunityTags = () => request<Record<string, { tag: string; uses: number }[]>>("/community-tags");
export const apiRegisterDevice = (token: string, platform: "android" | "ios") => request<{ ok: boolean }>("/devices", { method: "PUT", body: JSON.stringify({ token, platform, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
export const apiRemoveDevice = (token: string) => request<{ ok: boolean }>(`/devices/${encodeURIComponent(token)}`, { method: "DELETE" });
