import type { Translation, Verse } from "./types";
import { parseEsvReference, recordClientEsvRequest } from "./esvCompliance";
import { apiAuthHeaders, apiCredentials, apiUrl } from "./api";

export const bibleBooks = [
  ["Genesis",50],["Exodus",40],["Leviticus",27],["Numbers",36],["Deuteronomy",34],["Joshua",24],["Judges",21],["Ruth",4],["1 Samuel",31],["2 Samuel",24],["1 Kings",22],["2 Kings",25],["1 Chronicles",29],["2 Chronicles",36],["Ezra",10],["Nehemiah",13],["Esther",10],["Job",42],["Psalms",150],["Proverbs",31],["Ecclesiastes",12],["Song of Solomon",8],["Isaiah",66],["Jeremiah",52],["Lamentations",5],["Ezekiel",48],["Daniel",12],["Hosea",14],["Joel",3],["Amos",9],["Obadiah",1],["Jonah",4],["Micah",7],["Nahum",3],["Habakkuk",3],["Zephaniah",3],["Haggai",2],["Zechariah",14],["Malachi",4],["Matthew",28],["Mark",16],["Luke",24],["John",21],["Acts",28],["Romans",16],["1 Corinthians",16],["2 Corinthians",13],["Galatians",6],["Ephesians",6],["Philippians",4],["Colossians",4],["1 Thessalonians",5],["2 Thessalonians",3],["1 Timothy",6],["2 Timothy",4],["Titus",3],["Philemon",1],["Hebrews",13],["James",5],["1 Peter",5],["2 Peter",3],["1 John",5],["2 John",1],["3 John",1],["Jude",1],["Revelation",22]
] as const;

function cleanApiText(text: string) {
  return text.replace(/^\s*\[?\d+\]?\s*/, "").replace(/\s+/g, " ").replace(/\s*\(ESV\)\s*$/, "").trim();
}

async function readJson(response: Response, fallback: string) {
  const body = await response.text();
  if (body.trimStart().startsWith("<")) throw new Error(response.ok ? `${fallback} The Bible API returned an invalid response.` : `${fallback} The server may need to be restarted or updated.`);
  try { return JSON.parse(body); }
  catch { throw new Error(`${fallback} The Bible API returned malformed data.`); }
}

export const translations: { id: Translation; name: string; notice: string }[] = [
  { id: "KJV", name: "King James Version", notice: "Public domain" },
  { id: "ESV", name: "English Standard Version", notice: "© 2001 Crossway. Used by permission." },
  { id: "ASV", name: "American Standard Version", notice: "Public domain" },
  { id: "WEB", name: "World English Bible", notice: "Public domain" },
  { id: "YLT", name: "Young's Literal Translation", notice: "Public domain" }
];

export async function fetchPassage(reference: string, translation: Translation): Promise<Verse> {
  if (translation === "ESV") {
    parseEsvReference(reference);
    recordClientEsvRequest();
    const response = await fetch(apiUrl(`/esv?q=${encodeURIComponent(reference)}`), { headers: apiAuthHeaders() });
    const data = await readJson(response, "ESV passage could not be loaded.");
    if (!response.ok) throw new Error(data.error || "ESV passage could not be loaded");
    return { id: `esv-${reference.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`, reference: data.reference || reference, book: reference.replace(/\s+\d.*$/, ""), chapter: Number(reference.match(/\d+/)?.[0] || 1), verse: reference.split(":")[1] || "1", text: cleanApiText(data.text), translation: "ESV", topics: ["Imported"] };
  }
  const response = await fetch(`https://query.getbible.net/v2/${translation.toLowerCase()}/${encodeURIComponent(reference)}`);
  if (!response.ok) throw new Error(`${translation} passage could not be loaded`);
  const data = await readJson(response, `${translation} passage could not be loaded.`);
  const entries = Array.isArray(data) ? data : Object.values(data);
  const text = entries.flatMap((entry: any) => entry.verses || entry).map((v: any) => v.text || v.verse || "").join(" ");
  if (!text.trim()) throw new Error("No passage was found for that reference");
  return { id: `${translation.toLowerCase()}-${reference.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`, reference, book: reference.replace(/\s+\d.*$/, ""), chapter: Number(reference.match(/\d+/)?.[0] || 1), verse: reference.split(":")[1] || "1", text: cleanApiText(text), translation, topics: ["Imported"] };
}

export async function fetchPassageVerses(reference: string, translation: Exclude<Translation, "ESV">): Promise<Verse[]> {
  const response = await fetch(`https://query.getbible.net/v2/${translation.toLowerCase()}/${encodeURIComponent(reference)}`);
  if (!response.ok) throw new Error(`${translation} passage could not be loaded`);
  const data = await readJson(response, `${translation} passage could not be loaded.`);
  const entries = Object.values(data) as { book_name?: string; verses?: { chapter: number; verse: number; text: string }[] }[];
  const fallback = reference.match(/^(.+?)\s+(\d+):(\d+)/);
  const book = entries[0]?.book_name || fallback?.[1];
  if (!book) throw new Error("No passage was found for that reference");
  const verses = entries.flatMap(entry => entry.verses || []).map(item => ({
    id: `${translation.toLowerCase()}-${book.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${item.chapter}-${item.verse}`,
    reference: `${book} ${item.chapter}:${item.verse}`, book, chapter: item.chapter, verse: String(item.verse), text: cleanApiText(item.text), translation, topics: ["Book reading"]
  }));
  if (!verses.length) throw new Error("No passage was found for that reference");
  return verses;
}

const bookCache = new Map<string, Verse[]>();
const bookRequests = new Map<string, Promise<Verse[]>>();

async function loadBibleBook(book: string, translation: Exclude<Translation, "ESV">): Promise<Verse[]> {
  const bookIndex = bibleBooks.findIndex(([name]) => name === book);
  if (bookIndex < 0) throw new Error("That Bible book was not recognized.");
  let response = await fetch(apiUrl(`/bible/${translation.toLowerCase()}/book/${bookIndex + 1}`), { credentials: apiCredentials, headers: apiAuthHeaders() });
  let data: any;
  try { data = await readJson(response, `${book} could not be loaded.`); }
  catch {
    response = await fetch(`https://api.getbible.net/v2/${translation.toLowerCase()}/${bookIndex + 1}.json`);
    data = await readJson(response, `${book} could not be loaded.`);
  }
  if (!response.ok) throw new Error(data.error || `${book} could not be loaded.`);
  if (!Array.isArray(data)) {
    const found: { chapter: number; verse: number; text: string }[] = [];
    const visit = (value: any) => { if (!value || typeof value !== "object") return; if (typeof value.text === "string" && Number.isFinite(Number(value.chapter)) && Number.isFinite(Number(value.verse))) found.push({ chapter: Number(value.chapter), verse: Number(value.verse), text: value.text.trim() }); else Object.values(value).forEach(visit); };
    visit(data); data = found.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
  }
  const verses = (data as { chapter: number; verse: number; text: string }[]).map(item => ({ id: `${translation.toLowerCase()}-${book.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${item.chapter}-${item.verse}`, reference: `${book} ${item.chapter}:${item.verse}`, book, chapter: item.chapter, verse: String(item.verse), text: item.text, translation, topics: ["Book reading"] }));
  if (!verses.length) throw new Error(`${book} has no available ${translation} verses.`);
  return verses;
}

export async function fetchBibleBook(book: string, translation: Exclude<Translation, "ESV"> = "KJV"): Promise<Verse[]> {
  const key = `${translation}:${book}`;
  const cached = bookCache.get(key);
  if (cached) return cached;
  const pending = bookRequests.get(key);
  if (pending) return pending;
  const request = loadBibleBook(book, translation);
  bookRequests.set(key, request);
  try {
    const verses = await request;
    if (bookCache.size >= 8) bookCache.delete(bookCache.keys().next().value!);
    bookCache.set(key, verses);
    return verses;
  } finally { bookRequests.delete(key); }
}

export const fetchKjvBook = (book: string) => fetchBibleBook(book, "KJV");
