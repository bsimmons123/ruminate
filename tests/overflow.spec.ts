import { test, expect } from "@playwright/test";

/* The sign-in screen is the first thing a phone visitor sees, so it must not scroll
   sideways. This measures the document against the viewport and names the widest
   offending element, which is far easier to act on than "it looks cut off". */
const widths = [320, 390, 412, 430];

for (const width of widths) {
  test(`sign-in does not overflow horizontally at ${width}px`, async ({ page }) => {
    // Signed out, so the sign-in screen renders without needing a real API.
    await page.route("**/api/**", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: route.request().url().includes("/auth/me") ? "null" : "[]" }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.waitForSelector(".auth-page");

    const report = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const viewport = document.documentElement.clientWidth;
      const offenders: { selector: string; right: number; width: number }[] = [];
      for (const node of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const box = node.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        if (box.right > viewport + 1 || box.left < -1) {
          const id = node.id ? `#${node.id}` : "";
          const cls = node.className && typeof node.className === "string"
            ? `.${node.className.trim().split(/\s+/).join(".")}` : "";
          offenders.push({ selector: `${node.tagName.toLowerCase()}${id}${cls}`, right: Math.round(box.right), width: Math.round(box.width) });
        }
      }
      return { docWidth, viewport, offenders: offenders.slice(0, 6) };
    });

    expect(report.offenders, `widest offenders: ${JSON.stringify(report.offenders, null, 2)}`).toEqual([]);
    expect(report.docWidth).toBeLessThanOrEqual(report.viewport);
  });
}
