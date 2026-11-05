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
  await expect(page.getByRole("link", { name: "Request account deletion by email" })).toHaveAttribute("href", /^mailto:help@ruminate.bible\?subject=Ruminate%20account%20deletion%20request/);
  await expect(page.getByRole("heading", { name: "What gets deleted" })).toBeVisible();
  await page.getByRole("link", { name: "Privacy Policy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "request account deletion on our website" }).click();
  await expect(page).toHaveURL(/\/delete-account$/);
});

async function helpForm(page: Page) {
  await page.route("**/api/**", route => route.abort());
  await page.route("**/api/support-config", route => route.fulfill({ json: { accessKey: "test-form-key" } }));
  await page.goto("/help");
  await page.getByLabel("Your email").fill("reader@example.com");
  await page.getByLabel("Message", { exact: true }).fill("I need help with my library.");
}

test("help form sends only supplied contact details and confirms success", async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await page.route("https://api.web3forms.com/submit", async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ json: { success: true } });
  });
  await helpForm(page);
  await page.getByLabel("What can we help with?").selectOption("Bug");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Message sent" })).toBeVisible();
  expect(payload).toEqual({ access_key: "test-form-key", from_name: "Ruminate Help", subject: "Ruminate help: Bug", email: "reader@example.com", topic: "Bug", message: "I need help with my library.", botcheck: false });
});

test("failed help submissions retain the message and allow retry", async ({ page }) => {
  await page.route("https://api.web3forms.com/submit", route => route.fulfill({ status: 400, json: { success: false } }));
  await helpForm(page);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("couldn't confirm");
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("I need help with my library.");
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeEnabled();
  await page.route("https://api.web3forms.com/submit", route => route.fulfill({ json: { success: true } }));
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Message sent" })).toBeVisible();
});

test("help offers email when the key is missing", async ({ page }) => {
  await page.route("**/api/**", route => route.abort());
  await page.route("**/api/support-config", route => route.fulfill({ json: { accessKey: "" } }));
  await page.goto("/help");
  await expect(page.getByRole("status")).toContainText("email us directly");
  await expect(page.getByRole("link", { name: "help@ruminate.bible" })).toHaveAttribute("href", "mailto:help@ruminate.bible");
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toHaveCount(0);
});
