/**
 * End-to-end smoke test for the research sidebar.
 *
 * Uses the MOCK=1 fixture so no API keys are needed. Launches an installed
 * Chrome/Chromium through playwright-core, drives a full research run, checks
 * the Activities -> Report transitions, exercises edit/download, and captures
 * screenshots in ./screenshots.
 *
 * Run: npm run e2e   (builds first, then starts a temporary mock server)
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.E2E_PORT) || 3210;
const BASE = `http://localhost:${PORT}`;
const shots = path.join(root, "screenshots");
mkdirSync(shots, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function findChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      "No Chrome/Chromium found. Set CHROME_PATH to an installed browser executable.",
    );
  }
  return found;
}

function assert(condition, message) {
  if (!condition) throw new Error(`E2E assertion failed: ${message}`);
}

async function waitForServer(url, timeout = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not start at ${url}`);
}

const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, MOCK: "1", PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (data) => process.stdout.write(`[server] ${data}`));
server.stderr.on("data", (data) => process.stderr.write(`[server] ${data}`));

let browser;
try {
  await waitForServer(`${BASE}/`);
  browser = await chromium.launch({
    executablePath: findChrome(),
    headless: true,
  });

  // ------------------------------------------------------------- desktop
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    // External favicons/thumbnails may be blocked in headless CI; those are
    // resource warnings, not application errors.
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
      pageErrors.push(message.text());
    }
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(shots, "01-empty.png") });

  const input = page.locator("input").first();
  await input.fill("2026 年 AI Agent 产品的关键进展？");
  await page.getByRole("button", { name: "开始研究" }).click();

  const panel = page.locator('aside[aria-label="研究过程"]');
  await page.waitForFunction(
    () => document.querySelector('aside[aria-label="研究过程"]')?.getAttribute("aria-hidden") === "false",
  );
  assert(await panel.isVisible(), "research panel should be open");

  const reportTab = page.getByRole("tab", { name: "Report" });
  assert(await reportTab.isDisabled(), "Report tab must be disabled before the reporter starts");

  // The first web_search card shows the query and six skeletons immediately.
  await page.getByText(/Searching for/).waitFor({ timeout: 10_000 });
  // Let the 300ms width animation finish before capturing the panel.
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(shots, "02-searching.png") });
  const skeletonCount = await page.locator(".animate-pulse").count();
  assert(skeletonCount >= 6, `expected skeleton cards, found ${skeletonCount}`);

  // Results replace the skeletons.
  await page.getByText(/Searched/).waitFor({ timeout: 15_000 });
  await page.screenshot({ path: path.join(shots, "03-activities.png") });

  // Reporter auto-switches to Report.
  await page.waitForFunction(
    () => {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const report = tabs.find((tab) => tab.textContent?.includes("Report"));
      return report?.getAttribute("data-state") === "active";
    },
    undefined,
    { timeout: 20_000 },
  );
  assert(!(await reportTab.isDisabled()), "Report tab must unlock when the reporter starts");

  // Auto-follow pauses when the user scrolls up and the affordance restores it.
  await page.waitForFunction(
    () => {
      const scroller = document.querySelector('[data-testid="report-scroll"]');
      return scroller && scroller.scrollHeight > scroller.clientHeight + 200;
    },
    undefined,
    { timeout: 10_000 },
  );
  const scroller = page.getByTestId("report-scroll");
  await scroller.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.getByRole("button", { name: "回到最新" }).waitFor({ timeout: 5_000 });
  await page.getByRole("button", { name: "回到最新" }).click();
  await page.waitForFunction(
    () => {
      const element = document.querySelector('[data-testid="report-scroll"]');
      return element && element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    },
    undefined,
    { timeout: 5_000 },
  );

  await page.getByRole("button", { name: /复制/ }).waitFor({ timeout: 30_000 });
  const reportText = await page.locator(".markdown").last().innerText();
  assert(reportText.includes("AI Agent 产品"), "report content should render");
  await page.screenshot({ path: path.join(shots, "04-report.png") });

  // Every tool card type is present in the timeline.
  await page.getByRole("tab", { name: "Activities" }).click();
  await page.getByText(/Ran Python code/).waitFor({ timeout: 5_000 });
  await page.getByText(/knowledge · lookup/).waitFor({ timeout: 5_000 });
  await page.getByRole("tab", { name: "Report" }).click();

  // Copy writes the markdown to the clipboard.
  await page.getByRole("button", { name: /复制/ }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert(clipboard.includes("AI Agent 产品"), "copy should write the report markdown");

  // Download works.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /下载/ }).click();
  const download = await downloadPromise;
  assert(download.suggestedFilename() === "research-report.md", "download filename");

  // Edit writes back to the message without a new request.
  await page.getByRole("button", { name: /编辑/ }).click();
  const editor = page.locator("textarea");
  await editor.fill("# 编辑后的报告\n\n这段内容来自编辑器。");
  await page.getByRole("button", { name: /保存/ }).click();
  await page.getByText("这段内容来自编辑器。", { exact: true }).waitFor({ timeout: 5_000 });
  await page.screenshot({ path: path.join(shots, "05-edited.png") });

  // Close hides the panel but keeps the research state openable.
  await page.getByRole("button", { name: "关闭研究侧栏" }).click();
  await page.waitForFunction(
    () => document.querySelector('aside[aria-label="研究过程"]')?.getAttribute("aria-hidden") === "true",
  );
  await page.getByRole("button", { name: "研究过程" }).click();
  await page.waitForFunction(
    () => document.querySelector('aside[aria-label="研究过程"]')?.getAttribute("aria-hidden") === "false",
  );
  // Leave the panel on Report so the restored tab is unambiguous.
  await page.getByRole("tab", { name: "Report" }).click();

  // Persistence: reload rebuilds the open panel, active tab and edited report.
  await page.waitForTimeout(400); // persistence debounce
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.querySelector('aside[aria-label="研究过程"]')?.getAttribute("aria-hidden") === "false",
  );
  await page.getByText("这段内容来自编辑器。", { exact: true }).waitFor({ timeout: 5_000 });
  assert(
    (await page.getByRole("tab", { name: "Report" }).getAttribute("data-state")) === "active",
    "Report tab should be restored after reload",
  );
  await page.getByRole("tab", { name: "Activities" }).click();
  await page.getByText("Researcher", { exact: true }).first().waitFor({ timeout: 5_000 });
  await page.getByRole("tab", { name: "Report" }).click();
  await page.screenshot({ path: path.join(shots, "07-persisted.png") });

  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
  await context.close();

  // ------------------------------------------------ refresh mid-stream
  const resumeContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const resumed = await resumeContext.newPage();
  await resumed.goto(BASE, { waitUntil: "networkidle" });
  await resumed.locator("input").first().fill("刷新恢复测试");
  await resumed.getByRole("button", { name: "开始研究" }).click();
  await resumed.getByText(/Searching for/).waitFor({ timeout: 10_000 });
  await resumed.waitForTimeout(700); // let persistence flush a few events
  await resumed.reload({ waitUntil: "networkidle" });
  await resumed.waitForFunction(
    () => document.querySelector('aside[aria-label="研究过程"]')?.getAttribute("aria-hidden") === "false",
  );
  // The server replays the run from Last-Event-ID; the report still completes.
  await resumed.getByRole("button", { name: /复制/ }).waitFor({ timeout: 30_000 });
  const resumedReport = await resumed.locator(".markdown").last().innerText();
  assert(resumedReport.includes("AI Agent 产品"), "report should complete after a mid-stream reload");
  await resumed.screenshot({ path: path.join(shots, "08-resumed.png") });
  await resumeContext.close();

  // -------------------------------------------------------------- mobile
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await mobileContext.newPage();
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  await mobile.locator("input").first().fill("移动端布局检查");
  await mobile.getByRole("button", { name: "开始研究" }).click();
  await mobile.waitForFunction(
    () => document.querySelector('aside[aria-label="研究过程"]')?.getAttribute("aria-hidden") === "false",
  );
  await mobile.waitForTimeout(600);
  const drawer = await mobile.locator('aside[aria-label="研究过程"]').boundingBox();
  assert(drawer, "mobile drawer should have a bounding box");
  assert(
    Math.abs(drawer.width - (390 - 16)) < 2,
    `mobile drawer width ${drawer.width} should be calc(100vw - 16px)`,
  );
  await mobile.getByText(/Searched/).waitFor({ timeout: 15_000 });
  // Let the staggered result cards finish their entrance animation.
  await mobile.waitForTimeout(1200);
  await mobile.screenshot({ path: path.join(shots, "06-mobile.png") });
  await mobileContext.close();

  console.log("\nE2E passed. Screenshots written to ./screenshots");
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}
