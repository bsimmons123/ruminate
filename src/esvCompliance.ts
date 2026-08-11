// Book verse totals are used only for conservative ESV licensing guards.
export const bookVerseTotals: Record<string, number> = {
  Genesis:1533, Exodus:1213, Leviticus:859, Numbers:1288, Deuteronomy:959, Joshua:658, Judges:618, Ruth:85, "1 Samuel":810, "2 Samuel":695, "1 Kings":816, "2 Kings":719, "1 Chronicles":942, "2 Chronicles":822, Ezra:280, Nehemiah:406, Esther:167, Job:1070, Psalms:2461, Proverbs:915, Ecclesiastes:222, "Song of Solomon":117, Isaiah:1292, Jeremiah:1364, Lamentations:154, Ezekiel:1273, Daniel:357, Hosea:197, Joel:73, Amos:146, Obadiah:21, Jonah:48, Micah:105, Nahum:47, Habakkuk:56, Zephaniah:53, Haggai:38, Zechariah:211, Malachi:55, Matthew:1071, Mark:678, Luke:1151, John:879, Acts:1007, Romans:433, "1 Corinthians":437, "2 Corinthians":257, Galatians:149, Ephesians:155, Philippians:104, Colossians:95, "1 Thessalonians":89, "2 Thessalonians":47, "1 Timothy":113, "2 Timothy":83, Titus:46, Philemon:25, Hebrews:303, James:108, "1 Peter":105, "2 Peter":61, "1 John":105, "2 John":13, "3 John":14, Jude:25, Revelation:404
};

export type EsvReferenceInfo = { book: string; chapter: number; start: number; end: number; count: number; storageLimit: number };

export function parseEsvReference(reference: string): EsvReferenceInfo {
  const normalized = reference.trim().replace(/[–—]/g, "-");
  const match = normalized.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) throw new Error("Use one chapter and a verse or verse range, such as John 3:16–18.");
  const [, rawBook, chapterText, startText, endText] = match;
  const aliases: Record<string, string> = { Psalm: "Psalms", Psalms: "Psalms", Song: "Song of Solomon", "Song of Songs": "Song of Solomon" };
  const book = aliases[rawBook] || rawBook;
  const total = bookVerseTotals[book];
  if (!total) throw new Error("That Bible book was not recognized.");
  const start = Number(startText); const end = Number(endText || startText);
  if (start < 1 || end < start) throw new Error("Enter a valid ascending verse range.");
  const count = end - start + 1;
  const storageLimit = Math.min(500, Math.floor(total / 2));
  if (count > 500) throw new Error("ESV requests are limited to 500 verses.");
  if (count > storageLimit && total > 25) throw new Error(`This request exceeds half of ${book}. Choose ${storageLimit} verses or fewer.`);
  return { book, chapter: Number(chapterText), start, end, count, storageLimit };
}

export function esvStoredCount(references: string[], targetBook: string) {
  return references.reduce((sum, reference) => {
    try { const info = parseEsvReference(reference); return info.book === targetBook ? sum + info.count : sum; }
    catch { return sum; }
  }, 0);
}

export function recordClientEsvRequest() {
  if (typeof localStorage === "undefined") return;
  const now = Date.now();
  const key = "selah-esv-request-log";
  let log: number[] = [];
  try { log = JSON.parse(localStorage.getItem(key) || "[]"); } catch { log = []; }
  log = log.filter(time => now - time < 86_400_000);
  const minute = log.filter(time => now - time < 60_000).length;
  const hour = log.filter(time => now - time < 3_600_000).length;
  if (minute >= 60) throw new Error("ESV’s 60-requests-per-minute limit has been reached. Please wait a minute.");
  if (hour >= 1_000) throw new Error("ESV’s 1,000-requests-per-hour limit has been reached. Please try later.");
  if (log.length >= 5_000) throw new Error("ESV’s 5,000-requests-per-day limit has been reached. Please try tomorrow.");
  localStorage.setItem(key, JSON.stringify([...log, now]));
}
