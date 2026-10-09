import { randomBytes } from "node:crypto";

import {
  e2eEnabled,
  expect,
  expectNoAxeViolations,
  SKIP_REASON,
  test,
  uniqueEmail,
} from "./fixtures";

test.skip(!e2eEnabled, SKIP_REASON);

const SECRET_PATTERN = /spl_live_[A-Za-z0-9]+_[A-Za-z0-9]+/;

test("signup → onboarding → first trace → trace detail", async ({ page }) => {
  test.setTimeout(90_000);

  // 1. Sign up.
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("Work email").fill(uniqueEmail());
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  // 2. Organization and project.
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Organization name").fill("E2E Org");
  // "Continue" creates the organization (its accessible description says so).
  const createOrg = page.getByRole("button", { name: "Continue" });
  await expect(createOrg).toHaveAccessibleDescription("Creates your organization");
  await createOrg.click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Org is ready." })).toBeVisible();
  await page.getByLabel("Project name").fill("E2E Project");
  await page.getByRole("button", { name: "Create project" }).click();

  // 3. API key, shown once.
  await page.getByRole("button", { name: "Create API key" }).click();
  await expect(page.getByText("This key is shown once.", { exact: false })).toBeVisible();
  const pageText = await page.locator("main").innerText();
  const secret = SECRET_PATTERN.exec(pageText)?.[0];
  expect(secret, "the new API key secret is displayed").toBeTruthy();
  await expect(page.getByText("Waiting for your first trace…")).toBeVisible();
  await expectNoAxeViolations(page);

  // 4. Send a real trace through the ingestion API, as the curl snippet does.
  const traceId = randomBytes(16).toString("hex");
  const now = Date.now();
  const response = await page.request.post("/v1/traces", {
    headers: { Authorization: `Bearer ${secret ?? ""}` },
    data: {
      spans: [
        {
          trace_id: traceId,
          span_id: randomBytes(8).toString("hex"),
          parent_span_id: null,
          name: "e2e chat",
          kind: "llm",
          status: "ok",
          start_time: new Date(now - 1200).toISOString(),
          end_time: new Date(now).toISOString(),
          provider: "openai",
          model: "gpt-4o-mini",
          usage: { input_tokens: 12, output_tokens: 40 },
          input: [{ role: "user", content: "Hello from Playwright" }],
          output: { role: "assistant", content: "Hello back" },
          trace: { name: "e2e-trace", environment: "e2e" },
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);

  // 5. The waiting state flips to success (polls every 2 s).
  await expect(page.getByText("First trace received")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: "You’re connected." })).toBeVisible();
  await expect(page.getByRole("list", { name: "First trace" })).toContainText("e2e-trace");
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: "View traces" }).click();

  // 6. The trace is listed and its detail renders the chat payload.
  const traceLink = page.getByRole("link", { name: "e2e-trace" });
  await expect(traceLink).toBeVisible();
  await expectNoAxeViolations(page);
  await traceLink.click();
  await expect(page).toHaveURL(new RegExp(traceId));
  await expect(page.getByText("Hello from Playwright")).toBeVisible();
  await expectNoAxeViolations(page);
});
