import { test, expect } from "@playwright/test";

const roles = [
  ["User", "user@secondserve.local", "SecondServe@User123", "/dashboard"],
  [
    "Cafeteria Manager",
    "manager@secondserve.local",
    "SecondServe@Manager123",
    "/manager",
  ],
  [
    "Organization Admin",
    "orgadmin@secondserve.local",
    "SecondServe@Org123",
    "/organization",
  ],
  ["Super Admin", "admin@secondserve.local", "SecondServe@Admin123", "/admin"],
];
for (const [name, email, password, route] of roles) {
  test(`${name}: seeded sign-in, role redirect, data scope and logout`, async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByText("Explore with a local demo account").click();
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByLabel("Email address")).toHaveValue(email);
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
      password,
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(route);
    if (route != "/admin") {
      await expect(
        page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
      ).toBeVisible();
      await expect(
        page.getByText("DEMO WORKSPACE · SYNTHETIC MEAL RECORDS"),
      ).toBeVisible();
      await expect(page.locator(".metrics .metric").last()).toHaveCSS(
        "opacity",
        "1",
      );
      await page.locator(".dashboard-data-scene canvas").waitFor();
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await page.screenshot({
        path: `test-results/${name.toLowerCase().replaceAll(" ", "-")}-dashboard.png`,
        fullPage: true,
      });
    } else {
      await expect(
        page.getByRole("heading", { name: /Keep the system/ }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Foods", exact: true }).click();
      await expect(
        page.getByRole("cell", { name: "Rice", exact: true }).first(),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "Open profile menu" }).click();
    await page.getByRole("button", { name: "Logout", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page.goto(route);
    await expect(page).toHaveURL("/login");
  });
}

test("real uploads and on-image pointer drag, bounds, masks, mobile touch and keyboard", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("user@secondserve.local");
  await page
    .getByLabel("Password", { exact: true })
    .fill("SecondServe@User123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
  await page.getByRole("link", { name: "Analyze", exact: true }).click();
  await page
    .getByLabel("Before the first bite upload", { exact: true })
    .setInputFiles("../data/browser-fixtures/before.jpg");
  await page
    .getByLabel("After the last bite upload", { exact: true })
    .setInputFiles("../data/browser-fixtures/after.jpg");
  await page.getByRole("button", { name: "Understand my plate" }).click();
  await expect(
    page.getByRole("heading", { name: "Less guesswork. More perspective." }),
  ).toBeVisible({ timeout: 45000 });
  const slider = page.getByRole("slider", {
    name: "Before and after image comparison",
  });
  await slider.scrollIntoViewIfNeeded();
  const image = page.locator(".image-comparison");
  const box = await image.boundingBox();
  const handle = await slider.boundingBox();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width * 0.2,
    handle!.y + handle!.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(slider).toHaveAttribute("aria-valuenow", "20");
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", "100");
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "0");
  await slider.press("Shift+ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "10");
  await expect(page.locator("input[type=range]")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/comparison-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await slider.scrollIntoViewIfNeeded();
  const mobileBox = (await image.boundingBox())!;
  const rail = page.locator(".comparison-drag-rail");
  const session = await page.context().newCDPSession(page);
  const h = (await slider.boundingBox())!;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: h.x + h.width / 2, y: h.y + h.height / 2 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        x: mobileBox.x + mobileBox.width * 0.72,
        y: mobileBox.y + mobileBox.height / 2,
      },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(slider).toHaveAttribute("aria-valuenow", "72");
  const next = (await slider.boundingBox())!;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: next.x + next.width / 2, y: next.y + next.height / 2 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect(image).not.toHaveClass(/is-dragging/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/comparison-mobile.png",
    fullPage: true,
  });
});
