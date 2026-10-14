import type { User } from "./types";

const PROFILE_KEY = "ruminate-offline-user";
const DATABASE = "ruminate-offline-accounts";
export type PendingChange = {
  id: string; userId: string; kind: string; itemId: string; revision: string;
  method: "PUT" | "DELETE"; data?: unknown; before?: unknown; queuedAt: number;
  superseded?: { revision: string; reviews: number }[];
};
type Snapshot = { key: string; entries: Record<string, unknown> };
let opening: Promise<IDBDatabase> | undefined;

function open() {
  return opening ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("snapshots", { keyPath: "key" });
      request.result.createObjectStore("outbox", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = undefined; reject(request.error); };
  });
}
function result<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function done(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("Offline storage could not save this change."));
  });
}
const snapshotKey = (userId: string, kind: string) => `${userId}:${kind}`;
function itemKey(kind: string, value: unknown) {
  const item = value as { verseId?: string; id?: string };
  if (kind === "settings") return "preferences";
  const id = kind === "library" ? item.verseId : item.id;
  if (!id) throw new Error("Account data has no item ID.");
  return id;
}
export function rememberedUser(): User | null {
  try {
    const user = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    return user && typeof user.id === "string" && typeof user.name === "string" && typeof user.email === "string" ? user : null;
  } catch { return null; }
}
export function rememberUser(user: User | null) {
  if (!user) { localStorage.removeItem(PROFILE_KEY); return; }
  if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt }));
}
export async function cachedItems<T>(userId: string, kind: string): Promise<T[] | null> {
  const db = await open();
  const snapshot = await result(db.transaction("snapshots").objectStore("snapshots").get(snapshotKey(userId, kind))) as Snapshot | undefined;
  return snapshot ? Object.values(snapshot.entries) as T[] : null;
}
export async function pendingChanges(userId: string): Promise<PendingChange[]> {
  const db = await open();
  const changes = await result(db.transaction("outbox").objectStore("outbox").getAll()) as PendingChange[];
  return changes.filter(change => change.userId === userId).sort((a, b) => a.queuedAt - b.queuedAt);
}
export async function cacheServerItems<T>(userId: string, kind: string, items: T[]): Promise<T[]> {
  const db = await open();
  const transaction = db.transaction(["snapshots", "outbox"], "readwrite"); const committed = done(transaction);
  const changes = await result(transaction.objectStore("outbox").getAll()) as PendingChange[];
  const entries: Record<string, unknown> = Object.fromEntries(items.map(item => [itemKey(kind, item), item]));
  for (const change of changes.filter(value => value.userId === userId && value.kind === kind)) {
    if (change.method === "DELETE") delete entries[change.itemId]; else entries[change.itemId] = change.data;
  }
  transaction.objectStore("snapshots").put({ key: snapshotKey(userId, kind), entries });
  await committed;
  return Object.values(entries) as T[];
}
export async function queueChange(userId: string, kind: string, itemId: string, method: "PUT" | "DELETE", data?: unknown, reviewIncrement = 0) {
  const db = await open();
  const transaction = db.transaction(["snapshots", "outbox"], "readwrite"); const committed = done(transaction);
  const snapshots = transaction.objectStore("snapshots"), outbox = transaction.objectStore("outbox");
  const key = snapshotKey(userId, kind), id = `${key}:${itemId}`;
  const snapshot = await result(snapshots.get(key)) as Snapshot | undefined;
  const previous = await result(outbox.get(id)) as PendingChange | undefined;
  const entries = snapshot?.entries || {};
  if (kind === "library" && method === "PUT" && reviewIncrement) {
    const cached = entries[itemId] as { reviews?: number } | undefined;
    data = { ...(data as object), reviews: Number(cached?.reviews || 0) + reviewIncrement };
  }
  const superseded = kind === "library" && previous?.method === "PUT" ? [...(previous.superseded || []), { revision: previous.revision, reviews: Number((previous.data as { reviews?: number })?.reviews || 0) }] : previous?.superseded;
  const change: PendingChange = { superseded, id, userId, kind, itemId, method, data, before: previous ? previous.before : entries[itemId], revision: crypto.randomUUID(), queuedAt: Date.now() };
  if (method === "DELETE") delete entries[itemId]; else entries[itemId] = data;
  snapshots.put({ key, entries }); outbox.put(change);
  await committed;
  return change;
}
// Only acknowledge the exact revision sent; a newer edit must remain queued.
export async function acknowledgeChange(change: PendingChange, savedData?: unknown, rollback = false) {
  const db = await open();
  const transaction = db.transaction(["outbox", "snapshots"], "readwrite"); const committed = done(transaction);
  const outbox = transaction.objectStore("outbox"), snapshots = transaction.objectStore("snapshots");
  const current = await result(outbox.get(change.id)) as PendingChange | undefined;
  if (current?.revision === change.revision) {
    outbox.delete(change.id);
    if (rollback || (change.method === "PUT" && savedData !== undefined)) {
      const key = snapshotKey(change.userId, change.kind);
      const snapshot = await result(snapshots.get(key)) as Snapshot | undefined;
      const entries = snapshot?.entries || {};
      const value = rollback ? change.before : savedData;
      if (value === undefined) delete entries[change.itemId]; else entries[change.itemId] = value;
      snapshots.put({ key, entries });
    }
  } else if (current && !rollback) {
    // Rebase a newer queued edit on the local revision that was just accepted.
    // This prevents reapplying its review increment on the next sync attempt.
    outbox.put({ ...current, before: change.method === "PUT" ? change.data : undefined });
  }
  await committed;
}
