import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

// Records the web UI against the store demo and writes out/video/mada-fixer-demo.mp4.
// Requires the server: npm run serve (defaults to http://localhost:3000).
const BASE = process.env.DEMO_BASE ?? "http://localhost:3000";
const OUT = resolve("out/video");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch {}
    await wait(500);
  }
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
    locale: "ar-EG",
  });
  const page = await context.newPage();
  const video = page.video();

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  await page.locator('button[onclick*="demo/index.html"]').click();
  await page.waitForTimeout(700);
  await page.click("#runBtn");
  await page.waitForSelector("#results", { state: "visible", timeout: 300000 });
  await page.waitForTimeout(1200);

  const anchor = (text: string, offset = 90) =>
    page.evaluate(({ text, offset }) => {
      const h = Array.from(document.querySelectorAll(".section h2")).find((e) => e.textContent?.includes(text));
      if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
    }, { text, offset });

  await anchor("نتائج التصحيح", 120);
  await page.waitForTimeout(2600);
  await anchor("لقطات الشاشة", 80);
  await page.waitForTimeout(3600);

  await page.locator('.tab[onclick*="fixed"]').click();
  await page.waitForTimeout(600);
  await page.locator(".tab-bar").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(600);
  const frame = page.frameLocator("#fixedFrame");
  await frame.locator("body").evaluate((el) => el.ownerDocument.defaultView?.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(2600);
  await frame.locator("body").evaluate((el) => el.ownerDocument.defaultView?.scrollTo({ top: 340, behavior: "smooth" }));
  await page.waitForTimeout(2400);
  await frame.locator("body").evaluate((el) => el.ownerDocument.defaultView?.scrollTo({ top: 760, behavior: "smooth" }));
  await page.waitForTimeout(2000);

  await page.locator('.tab[onclick*="report"]').click();
  await page.waitForTimeout(1400);
  const report = page.frameLocator("#reportFrame");
  await report.locator("body").evaluate((el) => el.ownerDocument.defaultView?.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(2600);
  await report.locator("body").evaluate(() => {
    const row = Array.from(document.querySelectorAll("tr")).find((r) => r.textContent?.includes("copy-polish"));
    if (row) row.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 900, behavior: "smooth" });
  });
  await page.waitForTimeout(3200);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(2000);

  await context.close();
  await browser.close();

  const webm = await video?.path();
  if (!webm) throw new Error("no video was written");
  const mp4 = join(OUT, "mada-fixer-demo.mp4");
  try {
    execFileSync("ffmpeg", ["-y", "-i", webm, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: "ignore" });
    await rm(webm, { force: true });
    console.log(`video: ${mp4}`);
  } catch {
    console.log(`ffmpeg not found, webm kept: ${webm}`);
  }
}

await main();
