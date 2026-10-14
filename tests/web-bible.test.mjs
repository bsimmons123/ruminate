import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getBibleBook, getBibleManifest, getBiblePassage } from "../server/bundled-bible.js";

test("all 264 bundled books match their pinned source manifests", async () => {
  for (const [translation, expected] of [["web", 31103], ["kjv", 31102], ["asv", 31086], ["ylt", 31102]]) {
    const manifest = await getBibleManifest(translation);
    assert.equal(manifest.translation, translation.toUpperCase());
    assert.equal(manifest.books.length, 66);
    let total = 0, empty = 0;
    for (const book of manifest.books) {
      const payload = await readFile(new URL(`../public/bible/${translation}/${book.number}.json`, import.meta.url));
      assert.equal(createHash("sha256").update(payload).digest("hex"), book.sha256, `${translation} ${book.name}`);
      const values = await getBibleBook(translation, book.number);
      assert.equal(values.length, book.verses, book.name);
      assert.equal(new Set(values.map(value => `${value.chapter}:${value.verse}`)).size, values.length, book.name);
      assert.equal(new Set(values.map(value => value.chapter)).size, book.chapters, book.name);
      assert.ok(values.every(value => typeof value.text === "string" && value.verse > 0), book.name);
      total += values.length; empty += values.filter(value => !value.text.trim()).length;
    }
    assert.equal(total, manifest.verseCount);
    assert.equal(empty, manifest.emptyVerseCount);
    assert.equal(total, expected);
  }
});

test("WEB lookup preserves source text, parses numbered books and verse ranges without a network", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("WEB must not request an external provider"); };
  try {
    const john = await getBiblePassage("web", "John 3:16–18");
    assert.equal(john.verses.length, 3);
    assert.equal(john.verses[0].text, "For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life.");
    const letter = await getBiblePassage("web", "1 John 3:1");
    assert.equal(letter.verses[0].chapter, 3);
    assert.ok(letter.verses[0].text.includes("children of God"));
    assert.equal((await getBiblePassage("web", "Psalm 46:10")).book, "Psalms");
    for (const translation of ["web", "kjv", "asv", "ylt"]) {
      assert.equal((await getBiblePassage(translation, "John 3:16-18")).verses.length, 3);
      assert.equal((await getBibleBook(translation, 66)).at(-1).verse, 21);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("invalid references and source-omitted verse entries fail clearly", async () => {
  await assert.rejects(getBibleBook("esv", 1));
  for (const number of [0, 67, 1.5, NaN]) await assert.rejects(getBibleBook("web", number));
  for (const reference of ["Not a book 1:1", "John 3:18-16", "John 3:0", "John 300:1", "John 3:500", "Luke 17:36"])
    await assert.rejects(getBiblePassage("web", reference));
});
