import test from "node:test";
import assert from "node:assert/strict";
import { isIosSafari, shouldOfferInstall } from "../src/installPrompt.ts";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15";
const MAC_SAFARI = IPAD_SAFARI;
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
const FACEBOOK_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/497.0]";

const base = { standalone: false, dismissed: false, native: false, hasPrompt: false, maxTouchPoints: 0 };

test("iPhone Safari is offered the manual Home Screen instructions", () => {
  assert.equal(isIosSafari(IPHONE_SAFARI, 5), true);
  assert.equal(shouldOfferInstall({ ...base, userAgent: IPHONE_SAFARI, maxTouchPoints: 5 }), true);
});

test("iPadOS is detected despite reporting a Macintosh user agent", () => {
  assert.equal(isIosSafari(IPAD_SAFARI, 5), true);
});

test("desktop Safari is not mistaken for an iPad", () => {
  assert.equal(isIosSafari(MAC_SAFARI, 0), false);
  assert.equal(shouldOfferInstall({ ...base, userAgent: MAC_SAFARI, maxTouchPoints: 0 }), false);
});

test("iOS browsers that cannot install are not prompted", () => {
  assert.equal(isIosSafari(IPHONE_CHROME, 5), false);
  assert.equal(isIosSafari(FACEBOOK_IOS, 5), false);
  assert.equal(shouldOfferInstall({ ...base, userAgent: IPHONE_CHROME, maxTouchPoints: 5 }), false);
});

test("Android is offered install only once the browser supplies a prompt", () => {
  assert.equal(shouldOfferInstall({ ...base, userAgent: ANDROID_CHROME, maxTouchPoints: 5 }), false);
  assert.equal(shouldOfferInstall({ ...base, userAgent: ANDROID_CHROME, maxTouchPoints: 5, hasPrompt: true }), true);
});

test("an installed, dismissed, or native session is never prompted", () => {
  const iphone = { ...base, userAgent: IPHONE_SAFARI, maxTouchPoints: 5 };
  assert.equal(shouldOfferInstall({ ...iphone, standalone: true }), false);
  assert.equal(shouldOfferInstall({ ...iphone, dismissed: true }), false);
  assert.equal(shouldOfferInstall({ ...iphone, native: true }), false);
  // Native wins even when the browser would otherwise offer a prompt.
  assert.equal(shouldOfferInstall({ ...iphone, native: true, hasPrompt: true }), false);
});
