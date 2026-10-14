import type { CommunityCollection, User } from "./types";
import { Capacitor } from "@capacitor/core";

const native = Capacitor.isNativePlatform();
export const apiCredentials: RequestCredentials = native ? "omit" : "include";
const TOKEN_KEY = "selah-native-session";
export const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "";
export const apiUrl = (path: string) => `${apiBase}/api${path}`;
export const apiAuthHeaders = (): Record<string, string> => native && localStorage.getItem(TOKEN_KEY) ? { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` } : {};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");
  for (const [key, value] of Object.entries(apiAuthHeaders())) headers.set(key, value);
  if (native) headers.set("X-Selah-Native", "true");
  const response = await fetch(apiUrl(path), { ...options, credentials: apiCredentials, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || "The server could not complete that request.") as Error & { status: number }; error.status = response.status; throw error; }
  return data as T;
}

async function nativeSession(promise: Promise<User & { token?: string }>) {
  const user = await promise;
  if (native && user.token) localStorage.setItem(TOKEN_KEY, user.token);
  const { token: _token, ...profile } = user;
  return profile as User;
}

export const serverEnabled = true;
export const apiCurrentUser = () => request<User | null>("/auth/me").catch((error: Error & { status?: number }) => { if (error.status === 401) return null; throw error; });
export const apiSignUp = (name: string, email: string, password: string) => nativeSession(request<User & { token?: string }>("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) }));
export const apiSignIn = (email: string, password: string) => nativeSession(request<User & { token?: string }>("/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) }));
export const apiSignOut = async () => { try { return await request<{ ok: boolean }>("/auth/signout", { method: "POST" }); } finally { localStorage.removeItem(TOKEN_KEY); } };
export const apiItems = <T,>(kind: string) => request<T[]>(`/data/${kind}`);
export const apiPut = (kind: string, itemId: string, data: unknown) => request(`/data/${kind}/${encodeURIComponent(itemId)}`, { method: "PUT", body: JSON.stringify(data) });
export const apiDelete = (kind: string, itemId: string) => request(`/data/${kind}/${encodeURIComponent(itemId)}`, { method: "DELETE" });
export const apiCollections = () => request<CommunityCollection[]>("/collections");
export const apiCommunityTags = () => request<Record<string, { tag: string; uses: number }[]>>("/community-tags");
export const apiRegisterDevice = (token: string, platform: "android" | "ios") => request<{ ok: boolean }>("/devices", { method: "PUT", body: JSON.stringify({ token, platform, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
export const apiRemoveDevice = (token: string) => request<{ ok: boolean }>(`/devices/${encodeURIComponent(token)}`, { method: "DELETE" });
