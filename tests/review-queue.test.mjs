import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewQueue, dueItems } from "../src/review.ts";
import { scheduledItem } from "../src/db.ts";

const NOW = new Date("2026-03-10T09:00:00.000Z");
const at = (iso) => new Date(iso).toISOString();

const item = (verseId, nextReview, extra = {}) => ({
  verseId,
  addedAt: at("2026-01-01T00:00:00.000Z"),
  stage: 1,
  reviews: 0,
  nextReview: at(nextReview),
  collection: "My Verses",
  ...extra,
});

const review = (verseId, reviewedAt) => ({
  id: `${verseId}-${reviewedAt}`,
  verseId,
  reviewedAt: at(reviewedAt),
  mode: "easy",
  correct: 1,
  total: 1,
  percentage: 100,
  rating: "good",
  answers: [],
});

// Rotating through the shuffle deterministically keeps the assertions about
// membership honest without depending on Math.random.
const ordered = () => 0;

test("only verses whose schedule has come due are queued", () => {
  const library = [
    item("due-past", "2026-03-09T09:00:00.000Z"),
    item("due-now", "2026-03-10T09:00:00.000Z"),
    item("later-today", "2026-03-10T23:00:00.000Z"),
    item("next-week", "2026-03-17T09:00:00.000Z"),
  ];
  const queue = buildReviewQueue(library, [], NOW, ordered);
  assert.equal(queue.kind, "due");
  assert.deepEqual([...queue.verseIds].sort(), ["due-now", "due-past"]);
});

test("a verse rated good drops out of the queue until its next interval", () => {
  const library = [item("ps-46-10", "2026-03-10T08:00:00.000Z"), item("john-3-16", "2026-03-17T09:00:00.000Z")];
  assert.deepEqual(buildReviewQueue(library, [], NOW, ordered).verseIds, ["ps-46-10"]);

  const rated = scheduledItem(library[0], "good");
  const after = [rated, library[1]];
  assert.deepEqual(dueItems(after, NOW), []);
  assert.notEqual(buildReviewQueue(after, [], NOW, ordered).kind, "due");
});

test("a verse rated again comes back ten minutes later, not immediately", () => {
  const rated = scheduledItem(item("ps-46-10", "2026-03-10T08:00:00.000Z"), "again");
  assert.deepEqual(dueItems([rated], new Date()), []);
  assert.deepEqual(dueItems([rated], new Date(Date.now() + 11 * 60_000)).map(value => value.verseId), ["ps-46-10"]);
});

test("with nothing due, verses already practiced today are skipped", () => {
  const library = [
    item("seen", "2026-03-20T09:00:00.000Z"),
    item("unseen", "2026-03-21T09:00:00.000Z"),
  ];
  const queue = buildReviewQueue(library, [review("seen", "2026-03-10T07:00:00.000Z")], NOW, ordered);
  assert.equal(queue.kind, "extra");
  assert.deepEqual(queue.verseIds, ["unseen"]);
});

test("once every verse has been practiced today the whole set is offered again", () => {
  const library = [item("a", "2026-03-20T09:00:00.000Z"), item("b", "2026-03-21T09:00:00.000Z")];
  const history = [review("a", "2026-03-10T07:00:00.000Z"), review("b", "2026-03-10T08:00:00.000Z")];
  const queue = buildReviewQueue(library, history, NOW, ordered);
  assert.equal(queue.kind, "replay");
  assert.deepEqual([...queue.verseIds].sort(), ["a", "b"]);
});

test("memorized verses are left to the Memory Bank unless they are actually due", () => {
  const library = [
    item("memorized", "2026-03-20T09:00:00.000Z", { stage: 7, memorized: true }),
    item("learning", "2026-03-21T09:00:00.000Z"),
  ];
  assert.deepEqual(buildReviewQueue(library, [], NOW, ordered).verseIds, ["learning"]);

  const dueMemorized = [item("memorized", "2026-03-09T09:00:00.000Z", { stage: 7, memorized: true })];
  assert.deepEqual(buildReviewQueue(dueMemorized, [], NOW, ordered).verseIds, ["memorized"]);
});

test("the queue order varies between sessions", () => {
  const library = Array.from({ length: 8 }, (_, index) => item(`v${index}`, "2026-03-09T09:00:00.000Z"));
  const first = buildReviewQueue(library, [], NOW).verseIds;
  const orders = new Set([first.join(), buildReviewQueue(library, [], NOW).verseIds.join(), buildReviewQueue(library, [], NOW).verseIds.join(), buildReviewQueue(library, [], NOW).verseIds.join()]);
  assert.ok(orders.size > 1, "expected at least two different orders across four sessions");
  assert.deepEqual([...first].sort(), library.map(value => value.verseId).sort());
});
