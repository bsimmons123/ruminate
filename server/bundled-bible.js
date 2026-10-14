import { readFile } from "node:fs/promises";

const directory = new URL("../public/bible/", import.meta.url);
const bookRequests = new Map();
const manifestRequests = new Map();
export const bundledTranslations = new Set(["web", "kjv", "asv", "ylt"]);
function checkTranslation(translation) { if (!bundledTranslations.has(translation)) throw new Error("That translation is not bundled."); }

export function getBibleManifest(translation = "web") {
  checkTranslation(translation);
  if (!manifestRequests.has(translation)) manifestRequests.set(translation, readFile(new URL(`${translation}/manifest.json`, directory), "utf8").then(JSON.parse));
  return manifestRequests.get(translation);
}

export async function getBibleBook(translation, number) {
  checkTranslation(translation);
  if (!Number.isInteger(number) || number < 1 || number > 66) throw new Error("Choose a Bible book from 1 to 66.");
  const key = `${translation}:${number}`;
  if (!bookRequests.has(key)) {
    bookRequests.set(key, readFile(new URL(`${translation}/${number}.json`, directory), "utf8").then(JSON.parse).catch(error => { bookRequests.delete(key); throw error; }));
  }
  return bookRequests.get(key);
}

export async function getBiblePassage(translation, reference) {
  const match = reference.trim().replace(/[–—]/g, "-").match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!match) throw new Error("Use a single-chapter passage, such as John 3:16-18.");
  const aliases = { Psalm: "Psalms", "Song of Songs": "Song of Solomon" };
  const name = aliases[match[1]] || match[1];
  const manifest = await getBibleManifest(translation);
  const book = manifest.books.find(value => value.name === name);
  if (!book) throw new Error("That Bible book was not recognized.");
  const chapter = Number(match[2]), start = Number(match[3]), end = Number(match[4] || match[3]);
  if (start < 1 || end < start) throw new Error("Enter a valid ascending verse range.");
  const chapterVerses = (await getBibleBook(translation, book.number)).filter(value => value.chapter === chapter);
  if (!chapterVerses.length || end > chapterVerses.at(-1).verse) throw new Error(`That chapter or verse range is not available in ${translation.toUpperCase()}.`);
  const verses = chapterVerses.filter(value => value.verse >= start && value.verse <= end && value.text.trim());
  if (!verses.length) throw new Error(`That verse has no text in this ${translation.toUpperCase()} edition.`);
  return { translation: translation.toUpperCase(), book: name, reference: `${name} ${chapter}:${start}${end === start ? "" : `-${end}`}`, verses };
}
