import { test, expect, type Page } from "@playwright/test";

/* Apple requires a publicly reachable privacy policy URL for App Store submission, so
   /privacy and /terms must resolve for a signed-out visitor without any app state. */

async function signedOut(page: Page) {
  await page.route("**/api/**", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: route.request().url().includes("/auth/me") ? "null" : "[]" }));
}

test("/privacy resolves for a signed-out visitor", async ({ page }) => {
  await signedOut(page);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "3. Who else is involved" })).toBeVisible();
});

test("/terms resolves for a signed-out visitor", async ({ page }) => {
  await signedOut(page);
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "11. Governing law" })).toBeVisible();
});

test("the sign-in screen links to both legal pages before an account exists", async ({ page }) => {
  await signedOut(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Privacy Policy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/privacy$/);
});

test("leaving a legal page restores the root URL", async ({ page }) => {
  await signedOut(page);
  await page.goto("/terms");
  await page.getByRole("button", { name: /^Back to/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("deletion requests are available without an account or working API", async ({ page }) => {
  await page.route("**/api/**", route => route.abort());
  await page.goto("/delete-account");
  await expect(page.getByRole("heading", { name: "Delete your Ruminate account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request account deletion by email" })).toHaveAttribute("href", /^mailto:bsimmons@simmonsweb.com\?subject=Ruminate%20account%20deletion%20request/);
  await expect(page.getByRole("heading", { name: "What gets deleted" })).toBeVisible();
  await page.getByRole("link", { name: "Privacy Policy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "request account deletion on our website" }).click();
  await expect(page).toHaveURL(/\/delete-account$/);
});
