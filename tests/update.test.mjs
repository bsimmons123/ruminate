import test from "node:test";
import assert from "node:assert/strict";
import { decideUpdate, formatBytes, installFailureMessage, isSignatureConflict, parseLatest, shouldCheckForUpdate, shouldShowUpdateBanner } from "../src/update.ts";

const latest = (overrides = {}) => ({ configured: true, version: "1.0.6", versionCode: 6, size: 100, publishedAt: "", notes: "", sha256: "aa", ...overrides });

test("an update is available only for a strictly newer version code", () => {
  assert.equal(decideUpdate(latest(), 5)?.versionCode, 6);
  assert.equal(decideUpdate(latest(), 6), null);
  assert.equal(decideUpdate(latest({ versionCode: 4 }), 5), null);
  assert.equal(decideUpdate(latest({ configured: false }), 5), null);
  assert.equal(decideUpdate(latest({ versionCode: null }), 5), null);
  assert.equal(decideUpdate(latest({ version: null }), 5), null);
});

test("checks run at most every ten minutes", () => {
  assert.equal(shouldCheckForUpdate(1_000_000, 1_000_000 - 599_999), false);
  assert.equal(shouldCheckForUpdate(1_000_000, 1_000_000 - 600_000), true);
  assert.equal(shouldCheckForUpdate(1_000_000, 0), true);
});

test("Later hides one version, and a newer release shows the banner again", () => {
  assert.equal(shouldShowUpdateBanner(6, 5, 0), true);
  assert.equal(shouldShowUpdateBanner(6, 5, 6), false);
  assert.equal(shouldShowUpdateBanner(7, 5, 6), true);
  assert.equal(shouldShowUpdateBanner(5, 5, 0), false);
});

test("parseLatest tolerates missing and mistyped fields", () => {
  const empty = parseLatest({});
  assert.equal(empty.configured, false);
  assert.equal(empty.version, null);
  assert.equal(empty.versionCode, null);
  assert.equal(parseLatest({ version_code: "x" }).versionCode, null);
  assert.equal(parseLatest(null).configured, false);
  const full = parseLatest({ configured: true, version: "1.0.6", version_code: 6, size: 99, published_at: "t", notes: "n", sha256: "AB" });
  assert.deepEqual(full, { configured: true, version: "1.0.6", versionCode: 6, size: 99, publishedAt: "t", notes: "n", sha256: "ab" });
});

test("a signature mismatch gets the full explanation, not the raw installer text", () => {
  assert.equal(isSignatureConflict(5), true);
  assert.equal(isSignatureConflict(1, "INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match"), true);
  assert.equal(isSignatureConflict(1, "disk full"), false);
  assert.match(installFailureMessage(5, null), /uninstall/i);
  assert.match(installFailureMessage(1, "INSTALL_FAILED_UPDATE_INCOMPATIBLE"), /uninstall/i);
});

test("other install failures read plainly", () => {
  assert.match(installFailureMessage(6, null), /storage/i);
  assert.match(installFailureMessage(3, null), /cancelled/i);
  assert.match(installFailureMessage(2, null), /blocked/i);
  assert.match(installFailureMessage(4, null), /not a valid app/i);
  assert.equal(installFailureMessage(1, null), "Android did not finish the install.");
  assert.equal(installFailureMessage(1, "Something odd"), "Something odd");
});

test("formatBytes picks a readable unit", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(5 * 1_048_576), "5.0 MB");
});
