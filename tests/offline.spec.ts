import { test, expect, type Page } from "@playwright/test";

import { createServer, type Server } from "node:http";
let server: Server;
test.afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });

type Row = Record<string, any>;
const user = (id: string) => ({ id, name: `User ${id}`, email: `${id}@example.invalid`, createdAt: "2026-10-01T00:00:00Z" });
const initialItem = (verseId: string, memorized: boolean, reviews: number) => ({ verseId, stage: memorized ? 6 : 1, reviews, memorized, nextReview: "2026-10-01T00:00:00Z", addedAt: "2026-10-01T00:00:00Z", collection: "My Verses" });
async function fixtures(page: Page, signedIn: string | null = "alpha") {
  const state = {
    signedIn, expired: false, failNextLibraryUpload: false, failedUpload: false,
    rows: {
      alpha: { library: { "john-3-16": initialItem("john-3-16", true, 10) }, passage: {}, review: {}, settings: { preferences: { userId: "alpha", translation: "WEB", dailyGoal: 5, theme: "light", reminders: false } } },
      beta: { library: { "ps-46-10": initialItem("ps-46-10", false, 2) }, passage: {}, review: {}, settings: { preferences: { userId: "beta", translation: "KJV", dailyGoal: 5, theme: "light", reminders: false } } },
    } as Record<string, Record<string, Record<string, Row>>>,
    writes: [] as { owner: string; kind: string; id: string }[],
  };
  server = createServer(async (request, response) => {
    const path = new URL(request.url!, "http://127.0.0.1:4179").pathname;
    const send = (json: unknown, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(json)); };
    let body = ""; for await (const chunk of request) body += chunk;
    const data = body ? JSON.parse(body) : undefined;
    if (path === "/api/auth/signin") { state.signedIn = data.email.split("@")[0]; state.expired = false; return send(user(state.signedIn!)); }
    if (path === "/api/auth/signout") { state.signedIn = null; return send({ ok: true }); }
    if (state.expired) return send({ error: "This session has been signed out." }, 401);
    if (path === "/api/auth/me") return send(state.signedIn ? user(state.signedIn) : null);
    if (!state.signedIn) return send({ error: "Please sign in." }, 401);
    const match = path.match(/^\/api\/data\/(\w+)(?:\/(.+))?$/);
    if (match) {
      const [, kind, rawId] = match, id = rawId ? decodeURIComponent(rawId) : undefined;
      const rows = state.rows[state.signedIn][kind];
      if (request.method === "GET") return send(Object.values(rows));
      state.writes.push({ owner: state.signedIn, kind, id: id! });
      if (request.method === "DELETE") delete rows[id!]; else rows[id!] = data;
      if (kind === "library" && id === "john-3-16" && state.failNextLibraryUpload) { state.failNextLibraryUpload = false; state.failedUpload = true; response.destroy(); return; }
      return send({ ok: true });
    }
    return send(path === "/api/community-tags" ? {} : []);
  });
  await new Promise<void>(resolve => server.listen(4180, "127.0.0.1", resolve));
  return state;
}
async function fullyCached(page: Page) {
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker.controller) return false;
    return (await (await caches.open("ruminate-scripture-v1")).keys()).length === 273;
  }, undefined, { timeout: 45000 });
  // Let Chromium finish attaching the activated worker to navigation requests.
  await page.waitForTimeout(1000);
}
async function outbox(page: Page) {
  return page.evaluate(() => new Promise<Row[]>((resolve, reject) => {
    const open = indexedDB.open("ruminate-offline-accounts", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => { const request = open.result.transaction("outbox").objectStore("outbox").getAll(); request.onsuccess = () => resolve(request.result); };
  }));
}
async function tab(page: Page, name: string) { await page.getByRole("button", { name, exact: true }).last().click(); }
async function recall(page: Page) {
  await tab(page, "Memory Bank");
  await page.getByRole("button", { name: "Quiz this verse" }).click();
  await page.getByRole("textbox", { name: /Write .* from memory/ }).fill("A practice attempt");
  await page.getByRole("button", { name: "Check answers" }).click();
  await page.getByRole("button", { name: /Again/ }).click();
  await expect(page.getByRole("heading", { name: "Memory Bank", exact: true })).toBeVisible();
}

test("cached account survives offline reloads, all four translations work, and reviews sync without double counting", async ({ page, context }) => {
  const state = await fixtures(page);
  await page.goto("/"); await tab(page, "Library");
  await expect(page.getByRole("heading", { name: /John 3:16/ })).toBeVisible();
  await fullyCached(page);
  await context.setOffline(true); await page.reload();
  await tab(page, "Library"); await expect(page.getByRole("heading", { name: /John 3:16/ })).toBeVisible();
  await tab(page, "Reels");
  for (const translation of ["WEB", "KJV", "ASV", "YLT"]) {
    await page.getByRole("combobox", { name: "Translation" }).selectOption(translation);
    await expect(page.locator(".reel-content p i").first()).toHaveText(translation);
  }
  await page.getByRole("combobox", { name: "Translation" }).selectOption("WEB");
  await page.getByRole("button", { name: "Books", exact: true }).click();
  await page.getByRole("button", { name: "Read verses in order" }).first().click();
  await expect(page.locator(".book-verse blockquote").first()).toContainText("In the beginning, God created");
  await page.getByRole("button", { name: "Pin to memorize", exact: true }).first().click();
  await page.getByRole("button", { name: "Back to Ruminate" }).click();
  await recall(page); await recall(page);
  expect(Object.keys(state.rows.alpha.review)).toHaveLength(0);
  expect(state.rows.alpha.library["john-3-16"].reviews).toBe(10);
  await page.reload();
  await page.getByRole("button", { name: "Open menu" }).click(); await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(page.locator(".attempt-list>div")).toHaveCount(2);
  expect((await outbox(page)).filter(change => change.kind === "review")).toHaveLength(2);
  for (const [name, width] of [["mobile", 412], ["tablet", 768], ["desktop", 1440]] as const) {
    await page.setViewportSize({ width, height: 915 });
    await expect(page.getByRole("heading", { name: "Your Progress" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/offline-${name}.png`, fullPage: true, animations: "disabled" });
  }
  await page.setViewportSize({ width: 412, height: 915 });
  // Another device completed three reviews while this device was offline.
  state.rows.alpha.library["john-3-16"].reviews = 13;
  state.failNextLibraryUpload = true;
  await context.setOffline(false);
  await expect.poll(() => state.failedUpload).toBe(true);
  expect((await outbox(page)).length).toBeGreaterThan(0);
  // Continue practicing after an accepted upload loses its response.
  await recall(page);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => (await outbox(page)).length).toBe(0);
  await expect.poll(() => Object.keys(state.rows.alpha.review).length).toBe(3);
  expect(state.rows.alpha.library["john-3-16"].reviews).toBe(16);
  expect(state.rows.alpha.library["john-3-16"].memorized).toBe(true);
  expect(state.rows.alpha.passage["web-genesis-1-1"].translation).toBe("WEB");
  await page.reload(); await tab(page, "Library");
  await expect(page.getByRole("heading", { name: /Genesis 1:1/ })).toBeVisible();
});

test("revoked sessions require login and queued changes never upload to another account", async ({ page, context }) => {
  const state = await fixtures(page);
  await page.goto("/"); await tab(page, "Memory Bank"); await fullyCached(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Move back to learning" }).click();
  await expect.poll(async () => (await outbox(page)).length).toBe(1);
  state.expired = true;
  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "Return to your practice." })).toBeVisible();
  await page.getByLabel("Email address").fill("beta@example.invalid"); await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await tab(page, "Library");
  await expect(page.getByRole("heading", { name: /Psalm 46:10/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /John 3:16/ })).toHaveCount(0);
  expect(state.writes.filter(write => write.owner === "beta")).toHaveLength(0);
  expect((await outbox(page)).every(change => change.userId === "alpha")).toBe(true);
  await page.getByRole("button", { name: "Open menu" }).click(); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Return to your practice." })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ruminate-offline-user"))).toBeNull();
  await page.getByLabel("Email address").fill("alpha@example.invalid"); await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(async () => (await outbox(page)).length).toBe(0);
  expect(state.rows.alpha.library["john-3-16"].memorized).toBe(false);
});

test("a visitor can read all bundled translations offline without accessing account data", async ({ page, context }) => {
  await fixtures(page, null);
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Return to your practice." })).toBeVisible();
  await fullyCached(page);
  await context.setOffline(true); await page.reload();
  await page.getByRole("button", { name: "Read Bible offline", exact: true }).click();
  for (const translation of ["WEB", "KJV", "ASV", "YLT"]) {
    await page.getByRole("combobox", { name: "Translation" }).selectOption(translation);
    await expect(page.locator(".reel-content p i").first()).toHaveText(translation);
  }
  await expect(page.getByRole("button", { name: "Pin to memorize", exact: true })).toHaveCount(0);
  expect(await page.getByRole("combobox", { name: "Translation" }).locator("option").allTextContents()).not.toContain("ESV");
});

test("merged iOS shell keeps offline Memory Bank practice and native authentication", async ({ page, context }) => {
  await page.addInitScript(() => {
    (window as any).CapacitorCustomPlatform = { name: "ios" };
    localStorage.setItem("selah-native-session", "test-native-session");
  });
  await fixtures(page);
  const authentication = page.waitForRequest(request => request.url().endsWith("/api/auth/me"));
  await page.goto("/");
  expect((await authentication).headers()["x-ruminate-native"]).toBe("true");
  await expect(page.locator("html")).toHaveClass(/native.*ios/);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Progress", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Progress" })).toBeVisible();
  await context.setOffline(true);
  await recall(page);
  await expect(page.getByRole("status")).toContainText("Saved on this device");
  expect((await outbox(page)).filter(change => change.kind === "review")).toHaveLength(1);
  await page.screenshot({ path: "test-results/offline-native-ios.png", fullPage: true, animations: "disabled" });
});
