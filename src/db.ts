import type { LibraryItem, ReviewRating, ReviewResult, User, UserSettings, Verse } from "./types";

const DB_NAME = "selah-scripture-db";
const STORE = "library";
const REVIEWS = "reviews";
const PASSAGES = "passages";
const USERS = "users";
const SETTINGS = "settings";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "verseId" });
      if (!request.result.objectStoreNames.contains(REVIEWS)) request.result.createObjectStore(REVIEWS, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains(PASSAGES)) request.result.createObjectStore(PASSAGES, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains(USERS)) request.result.createObjectStore(USERS, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains(SETTINGS)) request.result.createObjectStore(SETTINGS, { keyPath: "userId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put<T>(store: string, value: T) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(store, "readwrite").objectStore(store).put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export const getReviews = () => getAll<ReviewResult>(REVIEWS);
export const saveReview = (review: ReviewResult) => put(REVIEWS, review);
export const getPassages = () => getAll<Verse>(PASSAGES);
export const savePassage = (verse: Verse) => put(PASSAGES, verse);
export const getUsers = () => getAll<User>(USERS);
export const saveUser = (user: User) => put(USERS, user);
export const getSettings = () => getAll<UserSettings>(SETTINGS);
export const saveSettings = (settings: UserSettings) => put(SETTINGS, settings);

export async function getLibrary(): Promise<LibraryItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveItem(item: LibraryItem) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function removeItem(id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function scheduledItem(item: LibraryItem, rating: ReviewRating): LibraryItem {
  const days = rating === "again" ? 0 : rating === "hard" ? 1 : rating === "good" ? Math.max(2, item.stage * 2) : Math.max(4, item.stage * 4);
  const next = new Date();
  if (!days) next.setMinutes(next.getMinutes() + 10); else next.setDate(next.getDate() + days);
  return { ...item, reviews: item.reviews + 1, stage: rating === "again" ? Math.max(1, item.stage - 1) : item.stage + 1, nextReview: next.toISOString() };
}
