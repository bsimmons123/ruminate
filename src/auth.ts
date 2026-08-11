import type { User } from "./types";

export async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function publicUser(user: User) {
  const { passwordHash: _, ...safe } = user;
  return safe;
}

export const SESSION_KEY = "selah-current-user";
