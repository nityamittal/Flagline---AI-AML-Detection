import { expect, test, type Page } from "@playwright/test";

// PLAN.md's main flow: a guest opens the app, opens a flag, dismisses it with a note, and sees
// it in the audit log, while a second browser still sees the same flag as open.

async function openCount(page: Page): Promise<number> {
  await page.goto("/");
  const chip = page.getByLabel("Queue counts").getByText(/^Open /);
  return Number((await chip.textContent())!.replace(/\D/g, ""));
}

test("a guest reviews a flag; a second browser is unaffected", async ({ browser }) => {
  const alice = await (await browser.newContext()).newPage();
  const bob = await (await browser.newContext()).newPage();

  // No login wall: straight into the queue.
  const aliceOpen = await openCount(alice);
  const bobOpen = await openCount(bob);
  expect(aliceOpen).toBeGreaterThan(0);
  await expect(alice.getByRole("heading", { name: "Review queue" })).toBeVisible();
  // This server has admin sign-in configured, so the footer offers it.
  await expect(alice.getByRole("button", { name: "Admin sign-in" })).toBeVisible();

  // Open the first flag in the queue.
  await alice.locator('table a[href^="/flags/"]').first().click();
  await expect(alice).toHaveURL(/\/flags\/\w+/);
  const flagUrl = new URL(alice.url()).pathname;
  await expect(alice.getByText("Why it was flagged")).toBeVisible();
  await expect(alice.getByText(/^(AI-generated|Template)$/)).toBeVisible();

  // Dismissing needs a note.
  await alice.getByRole("button", { name: "Dismiss" }).click();
  // (Next.js also renders a hidden role="alert" route announcer, so match on the text.)
  await expect(alice.getByRole("alert").filter({ hasText: "Add a short note" })).toBeVisible();

  await alice.getByLabel("Note (required to dismiss)").fill("Known payroll account (e2e)");
  await alice.getByRole("button", { name: "Dismiss" }).click();
  await expect(alice.getByRole("status")).toContainText("Dismissed. Next flag.");
  expect(new URL(alice.url()).pathname).not.toBe(flagUrl);

  // The decision is in Alice's audit log, as her own action.
  await alice.getByRole("link", { name: "Audit log" }).click();
  const row = alice.getByRole("row", { name: /Known payroll account \(e2e\)/ });
  await expect(row).toContainText("You");
  await expect(row).toContainText("Dismissed");
  expect(await openCount(alice)).toBe(aliceOpen - 1);

  // Bob's queue and flag page are untouched.
  expect(await openCount(bob)).toBe(bobOpen);
  await bob.goto(flagUrl);
  await expect(bob.getByRole("heading", { name: "Your decision" })).toBeVisible();
  await expect(bob.getByText(/You dismissed this flag/)).toHaveCount(0);
  await bob.goto("/audit");
  await expect(bob.getByText("Known payroll account (e2e)")).toHaveCount(0);
});

test("keyboard shortcut A approves, and Undo reopens the flag", async ({ page }) => {
  await page.goto("/");
  await page.locator('table a[href^="/flags/"]').first().click();
  const flagUrl = new URL(page.url()).pathname;
  await expect(page.getByText("Shortcuts:")).toBeVisible();

  await page.keyboard.press("a");
  const toast = page.getByRole("status").filter({ hasText: "Approved. Next flag." });
  await expect(toast).toBeVisible();
  expect(new URL(page.url()).pathname).not.toBe(flagUrl);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page).toHaveURL(new RegExp(`${flagUrl}$`));
  await expect(page.getByText(/You approved this flag/)).toHaveCount(0);
});
