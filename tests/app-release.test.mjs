import test from "node:test";
import assert from "node:assert/strict";
import { parseRelease, toLatestResponse, createReleaseCache } from "../server/appRelease.js";

const release = (assets = [{ name: "ruminate-v1.0.42-c42.apk", size: 1234, browser_download_url: "https://example.test/ruminate-v1.0.42-c42.apk" }, { name: "ruminate-v1.0.42-c42.apk.sha256", size: 80, browser_download_url: "https://example.test/sha" }]) =>
  ({ published_at: "2026-10-21T12:00:00Z", body: "Fix reminders", assets });

test("parseRelease reads version, code, size, notes and a lowercased checksum", () => {
  const latest = parseRelease(release(), "ABCDEF0123  ruminate-v1.0.42-c42.apk\n");
  assert.equal(latest.version, "1.0.42");
  assert.equal(latest.versionCode, 42);
  assert.equal(latest.size, 1234);
  assert.equal(latest.sha256, "abcdef0123");
  assert.equal(latest.notes, "Fix reminders");
  assert.equal(latest.publishedAt, "2026-10-21T12:00:00Z");
  assert.equal(latest.downloadUrl, "https://example.test/ruminate-v1.0.42-c42.apk");
});

test("parseRelease has no checksum when none was published", () => {
  assert.equal(parseRelease(release(), null).sha256, null);
});

test("a release with only the old asset name is treated as no release", () => {
  assert.equal(parseRelease(release([{ name: "ruminate-android.apk", size: 1, browser_download_url: "x" }]), null), null);
});

test("toLatestResponse uses the snake_case wire shape and hides the download url", () => {
  assert.deepEqual(toLatestResponse(null, true), { configured: true, version: null, version_code: null, size: null, published_at: "", notes: "", sha256: null });
  const wire = toLatestResponse(parseRelease(release(), "aa  f"), true);
  assert.equal(wire.version_code, 42);
  assert.equal("downloadUrl" in wire, false);
});

test("the cache fetches once within the ttl", async () => {
  let calls = 0, clock = 0;
  const cache = createReleaseCache({ fetchJson: async () => { calls++; return release(); }, fetchText: async () => "aa  f", now: () => clock, ttlMs: 1000 });
  await cache.get(); clock = 999; await cache.get();
  assert.equal(calls, 1);
});

test("after the ttl a failed refresh serves the previous release", async () => {
  let clock = 0, fail = false;
  const cache = createReleaseCache({ fetchJson: async () => { if (fail) throw new Error("rate limited"); return release(); }, fetchText: async () => "aa  f", now: () => clock, ttlMs: 1000 });
  const first = await cache.get();
  clock = 1000; fail = true;
  assert.deepEqual(await cache.get(), first);
});

test("a first fetch that fails yields null instead of throwing", async () => {
  const cache = createReleaseCache({ fetchJson: async () => { throw new Error("down"); }, fetchText: async () => "", now: () => 0, ttlMs: 1000 });
  assert.equal(await cache.get(), null);
});
