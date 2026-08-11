import type { CommunityCollection, User } from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json", ...options?.headers }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The server could not complete that request.");
  return data as T;
}

export const serverEnabled = true;
export const apiCurrentUser = () => request<User | null>("/auth/me").catch(() => null);
export const apiSignUp = (name: string, email: string, password: string) => request<User>("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) });
export const apiSignIn = (email: string, password: string) => request<User>("/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) });
export const apiSignOut = () => request<{ ok: boolean }>("/auth/signout", { method: "POST" });
export const apiItems = <T,>(kind: string) => request<T[]>(`/data/${kind}`);
export const apiPut = (kind: string, itemId: string, data: unknown) => request(`/data/${kind}/${encodeURIComponent(itemId)}`, { method: "PUT", body: JSON.stringify(data) });
export const apiDelete = (kind: string, itemId: string) => request(`/data/${kind}/${encodeURIComponent(itemId)}`, { method: "DELETE" });
export const apiCollections = () => request<CommunityCollection[]>("/collections");
export const apiCommunityTags = () => request<Record<string, { tag: string; uses: number }[]>>("/community-tags");
