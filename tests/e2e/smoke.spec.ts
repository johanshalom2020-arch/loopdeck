import { expect, test } from "@playwright/test";

/**
 * Smoke test: add a YouTube video, toggle loop video mode, verify the
 * library and the loop setting survive a page reload (localStorage persist).
 * oEmbed metadata is optional here — assertions only rely on the stored ID.
 */

const VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

test("add video, toggle loop, state persists after reload", async ({ page }) => {
  await page.goto("/");

  // Add a video by URL.
  await page.getByLabel("Paste a YouTube URL").fill(VIDEO_URL);
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // The library row appears (fallback title contains the video ID).
  await expect(page.locator(".lib-row").first()).toBeVisible();

  // Enable "Loop video" via the loop mode menu.
  const loopButton = page.getByRole("button", { name: /^loop mode:/i });
  await expect(loopButton).toHaveAccessibleName(/off/i);
  await loopButton.click();
  await page.getByRole("menuitemradio", { name: /loop video/i }).click();
  await expect(loopButton).toHaveAccessibleName(/loop video/i);

  // Reload and verify persistence.
  await page.reload();

  await expect(page.locator(".lib-row").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^loop mode:/i })).toHaveAccessibleName(/loop video/i);

  const stored = await page.evaluate(() => window.localStorage.getItem("loopdeck:library"));
  expect(stored).toContain("dQw4w9WgXcQ");
});
