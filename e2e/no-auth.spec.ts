import { expect, test } from "@playwright/test";

// Served with AUTH_SECRET and the GitHub OAuth variables empty: the app must still work for
// guests, with admin sign-in simply absent.
test("without auth configured, guests can use everything and sign-in is hidden", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
  await expect(page.getByText("Admin sign-in")).toHaveCount(0);

  // Review a flag end to end.
  await page.locator('table a[href^="/flags/"]').first().click();
  const flagUrl = new URL(page.url()).pathname;
  await expect(page.getByText("Why it was flagged")).toBeVisible();
  await page.getByLabel("Note (required to dismiss)").fill("Checked without auth (e2e)");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page).not.toHaveURL(new RegExp(`${flagUrl}$`));
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByRole("row", { name: /Checked without auth \(e2e\)/ })).toBeVisible();

  // Admin pages and endpoints refuse politely instead of crashing.
  await page.goto("/uploads");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
  expect((await request.get("/api/auth/session")).status()).toBe(404);
  expect((await request.post("/api/uploads")).status()).toBe(403);

  // The sample file is served by the app.
  const sample = await request.get("/sample.csv");
  expect(sample.status()).toBe(200);
  expect((await sample.text()).startsWith("external_id,timestamp,")).toBe(true);
});
