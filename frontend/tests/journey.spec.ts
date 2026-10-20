import { test, expect } from "@playwright/test";

test("register → login → real demo processing → review → save → history → analytics → export", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.com`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good food/ })).toBeVisible();
  await page.getByRole("link", { name: "Get started" }).click();
  await page.getByLabel("Your name").fill("Jamie Tester");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Test password 123");
  await page.getByLabel("Confirm password").fill("Test password 123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open profile menu" }).click();
  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Test password 123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page
    .getByRole("link", { name: "Analyze", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Try a demo analysis" }).click();
  await expect(
    page.getByRole("heading", { name: "Less guesswork. More perspective." }),
  ).toBeVisible({ timeout: 45000 });
  await expect(page.getByText("DEMO RESULT · SYNTHETIC IMAGES")).toBeVisible();
  const slider = page.getByRole("slider", {
    name: "Before and after image comparison",
  });
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "0");
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", "100");
  await slider.press("ArrowLeft");
  await expect(slider).toHaveAttribute("aria-valuenow", "99");
  await expect(page.locator("input[type=range]")).toHaveCount(0);
  await page.getByRole("tab", { name: "Segmentation", exact: true }).click();
  await expect(
    page.getByAltText("Segmentation plate visualization"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review & correct" }).click();
  await page
    .getByLabel("Food category")
    .first()
    .selectOption({ label: "Rice" });
  await page
    .getByLabel("What did you change?")
    .fill("Confirmed the food category and portion estimates.");
  await page.getByLabel(/I reviewed the food labels/).check();
  await page.getByRole("button", { name: "Save review & corrections" }).click();
  await expect(page.getByText("Human verified", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Save analysis", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved to history" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Lunch Demo" })).toBeVisible();
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await page.getByLabel("Include labeled demo data").check();
  await expect(page.getByText("Meal-time perspective")).toBeVisible();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Spreadsheet-ready/ }).click();
  expect((await download).suggestedFilename()).toBe("second-serve-report.csv");
  await page.getByRole("button", { name: "Open profile menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Color theme", exact: true })
    .selectOption("light");
  await page.getByLabel(/Performance mode/).check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
});

test("responsive landing, reduced motion and navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good food/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/landing-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page.getByLabel("Your name")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("desktop landing 3D scene renders without application errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good food/ })).toBeVisible();
  await page.getByRole("button", { name: "Waste", exact: true }).click();
  await expect(page.locator(".plate-view canvas")).toBeVisible();
  await page.screenshot({
    path: "test-results/landing-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
