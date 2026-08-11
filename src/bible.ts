import type { Verse } from "./types";
import { parseEsvReference, recordClientEsvRequest } from "./esvCompliance";

export const bibleBooks = [
  ["Genesis",50],["Exodus",40],["Leviticus",27],["Numbers",36],["Deuteronomy",34],["Joshua",24],["Judges",21],["Ruth",4],["1 Samuel",31],["2 Samuel",24],["1 Kings",22],["2 Kings",25],["1 Chronicles",29],["2 Chronicles",36],["Ezra",10],["Nehemiah",13],["Esther",10],["Job",42],["Psalms",150],["Proverbs",31],["Ecclesiastes",12],["Song of Solomon",8],["Isaiah",66],["Jeremiah",52],["Lamentations",5],["Ezekiel",48],["Daniel",12],["Hosea",14],["Joel",3],["Amos",9],["Obadiah",1],["Jonah",4],["Micah",7],["Nahum",3],["Habakkuk",3],["Zephaniah",3],["Haggai",2],["Zechariah",14],["Malachi",4],["Matthew",28],["Mark",16],["Luke",24],["John",21],["Acts",28],["Romans",16],["1 Corinthians",16],["2 Corinthians",13],["Galatians",6],["Ephesians",6],["Philippians",4],["Colossians",4],["1 Thessalonians",5],["2 Thessalonians",3],["1 Timothy",6],["2 Timothy",4],["Titus",3],["Philemon",1],["Hebrews",13],["James",5],["1 Peter",5],["2 Peter",3],["1 John",5],["2 John",1],["3 John",1],["Jude",1],["Revelation",22]
] as const;

function cleanApiText(text: string) {
  return text.replace(/^\s*\[?\d+\]?\s*/, "").replace(/\s+/g, " ").replace(/\s*\(ESV\)\s*$/, "").trim();
}

export async function fetchPassage(reference: string, translation: "KJV" | "ESV"): Promise<Verse> {
  if (translation === "ESV") {
    parseEsvReference(reference);
    recordClientEsvRequest();
    const response = await fetch(`/api/esv?q=${encodeURIComponent(reference)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "ESV passage could not be loaded");
    return { id: `esv-${reference.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`, reference: data.reference || reference, book: reference.replace(/\s+\d.*$/, ""), chapter: Number(reference.match(/\d+/)?.[0] || 1), verse: reference.split(":")[1] || "1", text: cleanApiText(data.text), translation: "ESV", topics: ["Imported"] };
  }
  const response = await fetch(`https://query.getbible.net/v2/kjv/${encodeURIComponent(reference)}`);
  if (!response.ok) throw new Error("KJV passage could not be loaded");
  const data = await response.json();
  const entries = Array.isArray(data) ? data : Object.values(data);
  const text = entries.flatMap((entry: any) => entry.verses || entry).map((v: any) => v.text || v.verse || "").join(" ");
  if (!text.trim()) throw new Error("No passage was found for that reference");
  return { id: `kjv-${reference.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`, reference, book: reference.replace(/\s+\d.*$/, ""), chapter: Number(reference.match(/\d+/)?.[0] || 1), verse: reference.split(":")[1] || "1", text: cleanApiText(text), translation: "KJV", topics: ["Imported"] };
}

export async function fetchKjvBook(book: string): Promise<Verse[]> {
  const bookIndex = bibleBooks.findIndex(([name]) => name === book);
  if (bookIndex < 0) throw new Error("That Bible book was not recognized.");
  const response = await fetch(`/api/kjv/book/${bookIndex + 1}`, { credentials: "include" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `${book} could not be loaded.`);
  return (data as { chapter: number; verse: number; text: string }[]).map(item => ({ id: `kjv-${book.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${item.chapter}-${item.verse}`, reference: `${book} ${item.chapter}:${item.verse}`, book, chapter: item.chapter, verse: String(item.verse), text: item.text, translation: "KJV", topics: ["Book reading"] }));
}
