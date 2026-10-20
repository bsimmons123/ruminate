import type { LibraryItem, ReviewResult } from "./types";

export const isMemorized = (item: LibraryItem) => item.memorized ?? item.stage >= 6;

export function shuffle<T>(values: T[], random: () => number = Math.random): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export const dueItems = (library: LibraryItem[], now: Date = new Date()) =>
  library.filter(item => new Date(item.nextReview).getTime() <= now.getTime());

/* "due" is the real spaced-repetition queue. When nothing is scheduled we still let
   people practice, so "extra" offers verses they have not seen today and "replay"
   reshuffles everything once the day's rounds are done. */
export type ReviewQueue = { verseIds: string[]; kind: "due" | "extra" | "replay" };

export type QueueOptions = {
  now?: Date;
  /* The daily goal caps the session. Nothing is dropped: whatever does not fit stays
     due and leads the next session, because the cap is applied after sorting by how
     overdue each verse is. */
  limit?: number;
  random?: () => number;
};

const capped = (verseIds: string[], limit?: number) =>
  limit && limit > 0 ? verseIds.slice(0, limit) : verseIds;

export function buildReviewQueue(
  library: LibraryItem[],
  history: ReviewResult[],
  { now = new Date(), limit, random = Math.random }: QueueOptions = {},
): ReviewQueue {
  const due = dueItems(library, now);
  if (due.length) {
    const byMostOverdue = [...due].sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime());
    // Pick the most overdue, then shuffle only what made the cut so the order still varies.
    return { verseIds: shuffle(capped(byMostOverdue.map(item => item.verseId), limit), random), kind: "due" };
  }

  const learning = library.filter(item => !isMemorized(item));
  const pool = learning.length ? learning : library;
  const today = dayKey(now);
  const seenToday = new Set(history.filter(result => dayKey(new Date(result.reviewedAt)) === today).map(result => result.verseId));
  const unseen = pool.filter(item => !seenToday.has(item.verseId));
  const chosen = unseen.length ? unseen : pool;
  return { verseIds: capped(shuffle(chosen.map(item => item.verseId), random), limit), kind: unseen.length ? "extra" : "replay" };
}
