import type { Translation, Verse } from "./types";
import { parseEsvReference, recordClientEsvRequest } from "./esvCompliance";
import { apiAuthHeaders, apiUrl } from "./api";

export const bibleBooks = [
  ["Genesis",50],["Exodus",40],["Leviticus",27],["Numbers",36],["Deuteronomy",34],["Joshua",24],["Judges",21],["Ruth",4],["1 Samuel",31],["2 Samuel",24],["1 Kings",22],["2 Kings",25],["1 Chronicles",29],["2 Chronicles",36],["Ezra",10],["Nehemiah",13],["Esther",10],["Job",42],["Psalms",150],["Proverbs",31],["Ecclesiastes",12],["Song of Solomon",8],["Isaiah",66],["Jeremiah",52],["Lamentations",5],["Ezekiel",48],["Daniel",12],["Hosea",14],["Joel",3],["Amos",9],["Obadiah",1],["Jonah",4],["Micah",7],["Nahum",3],["Habakkuk",3],["Zephaniah",3],["Haggai",2],["Zechariah",14],["Malachi",4],["Matthew",28],["Mark",16],["Luke",24],["John",21],["Acts",28],["Romans",16],["1 Corinthians",16],["2 Corinthians",13],["Galatians",6],["Ephesians",6],["Philippians",4],["Colossians",4],["1 Thessalonians",5],["2 Thessalonians",3],["1 Timothy",6],["2 Timothy",4],["Titus",3],["Philemon",1],["Hebrews",13],["James",5],["1 Peter",5],["2 Peter",3],["1 John",5],["2 John",1],["3 John",1],["Jude",1],["Revelation",22]
] as const;


type BundledTranslation = Exclude<Translation, "ESV">;
type SourceVerse = { chapter: number; verse: number; text: string };
export const DEFAULT_TRANSLATION: Translation = "WEB";
export const translations: { id: Translation; name: string; notice: string }[] = [
  { id: "WEB", name: "World English Bible", notice: "Public domain · Available offline" },
  { id: "KJV", name: "King James Version", notice: "Public domain · Available offline" },
  { id: "ASV", name: "American Standard Version", notice: "Public domain · Available offline" },
  { id: "YLT", name: "Young's Literal Translation", notice: "Public domain · Available offline" },
  { id: "ESV", name: "English Standard Version", notice: "© 2001 Crossway. Used by permission. Requires internet." }
];
const bookCache = new Map<string, Verse[]>();
const bookRequests = new Map<string, Promise<Verse[]>>();

export async function fetchBibleBook(book: string, translation: BundledTranslation = "WEB"): Promise<Verse[]> {
  const number = bibleBooks.findIndex(([name]) => name === book) + 1;
  if (!number) throw new Error("That Bible book was not recognized.");
  const key = `${translation}:${number}`;
  const cached = bookCache.get(key);
  if (cached) return cached;
  const pending = bookRequests.get(key);
  if (pending) return pending;
  const request = (async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}bible/${translation.toLowerCase()}/${number}.json`);
    if (!response.ok) throw new Error(`The bundled ${translation} book could not be opened. Update the app and try again.`);
    const data = await response.json() as SourceVerse[];
    if (!Array.isArray(data)) throw new Error(`The bundled ${translation} book is invalid.`);
    return data.filter(item => item.text.trim()).map(item => ({
      id: `${translation.toLowerCase()}-${book.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${item.chapter}-${item.verse}`,
      reference: `${book} ${item.chapter}:${item.verse}`, book, chapter: item.chapter, verse: String(item.verse),
      text: item.text.trim(), translation, topics: ["Book reading"]
    }));
  })();
  bookRequests.set(key, request);
  try {
    const verses = await request;
    if (bookCache.size >= 8) bookCache.delete(bookCache.keys().next().value!);
    bookCache.set(key, verses);
    return verses;
  } finally { bookRequests.delete(key); }
}

export async function fetchPassageVerses(reference: string, translation: BundledTranslation): Promise<Verse[]> {
  const match = reference.trim().replace(/[–—]/g, "-").match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) throw new Error("Use a single-chapter passage, such as John 3:16-18.");
  const aliases: Record<string, string> = { Psalm: "Psalms", "Song of Songs": "Song of Solomon" };
  const book = aliases[match[1]] || match[1];
  const chapter = Number(match[2]), start = Number(match[3]), end = Number(match[4] || match[3]);
  if (start < 1 || end < start) throw new Error("Enter a valid ascending verse range.");
  const values = (await fetchBibleBook(book, translation)).filter(verse => verse.chapter === chapter);
  if (!values.length || end > Math.max(...values.map(verse => Number(verse.verse)))) throw new Error(`That chapter or verse range is not available in ${translation}.`);
  const selected = values.filter(verse => Number(verse.verse) >= start && Number(verse.verse) <= end);
  if (!selected.length) throw new Error(`That verse has no text in this ${translation} edition.`);
  return selected;
}

export async function fetchPassage(reference: string, translation: Translation): Promise<Verse> {
  if (translation !== "ESV") {
    const values = await fetchPassageVerses(reference, translation);
    const first = values[0];
    const range = reference.trim().replace(/[–—]/g, "-").split(":")[1];
    const canonical = `${first.book} ${first.chapter}:${range}`;
    return { ...first, id: `${translation.toLowerCase()}-${canonical.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, reference: canonical, verse: range, text: values.map(verse => verse.text).join(" "), topics: ["Imported"] };
  }
  const parsed = parseEsvReference(reference);
  recordClientEsvRequest();
  const response = await fetch(apiUrl(`/esv?q=${encodeURIComponent(reference)}`), { headers: apiAuthHeaders() });
  const body = await response.text();
  let data: { error?: string; text?: string; reference?: string };
  try { data = JSON.parse(body); } catch { throw new Error("ESV passage could not be loaded. Check your connection and server setup."); }
  if (!response.ok || !data.text?.trim()) throw new Error(data.error || "ESV passage could not be loaded");
  const text = data.text.replace(/^\s*\[?\d+\]?\s*/, "").replace(/\s+/g, " ").replace(/\s*\(ESV\)\s*$/, "").trim();
  return { id: `esv-${reference.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, reference: data.reference || reference, book: parsed.book, chapter: parsed.chapter, verse: reference.split(":")[1], text, translation: "ESV", topics: ["Imported"] };
}

export const fetchKjvBook = (book: string) => fetchBibleBook(book, "KJV");
