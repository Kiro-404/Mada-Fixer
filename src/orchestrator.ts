import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Page } from "playwright";
import { PNG } from "pngjs";
import { launch, newPage } from "./browser.js";
import { discover, see } from "./see/see.js";
import { understand } from "./understand/understand.js";
import { applyFix } from "./fix/fix.js";
import { structureOps } from "./fix/structure.js";
import { patchRepo } from "./fix/repoPatch.js";
import { runAxe, TARGETED } from "./verify/axe.js";
import { transcript } from "./verify/transcript.js";
import { diffRatio } from "./verify/visual.js";
import { layoutShift, layoutSnapshot } from "./verify/layout.js";
import { writeHtmlReport } from "./report/html.js";
import { usageSnapshot } from "./models/meta.js";
import { envNum } from "./util.js";
import type { Fix, Issue, RunOptions } from "./types.js";

const MIN_CONF = envNum("MIN_CONFIDENCE", 0.6, 0, 1);
const MAX_ATTEMPTS = envNum("MAX_ATTEMPTS", 3, 1, 6);
const NAV_TIMEOUT = envNum("NAV_TIMEOUT_MS", 45_000, 3_000, 180_000);
const IDLE_TIMEOUT = envNum("IDLE_TIMEOUT_MS", 4_000, 250, 30_000);
const SHOT_TIMEOUT = envNum("SHOT_TIMEOUT_MS", 30_000, 2_000, 120_000);
const PAGE_LEVEL = new Set(["landmark-one-main", "focus-invisible", "arabic-dir"]); // fixed by structureOps, not per element

type Shot = { buf: Buffer; mode: "full" | "viewport" | "placeholder" };

// A very long page can exceed the screenshot timeout. Fall back to the viewport, then to a blank image,
// so a measurement run still finishes and the report says what happened.
async function capture(page: Page, warnings: string[], label: string): Promise<Shot> {
  try {
    return { buf: await page.screenshot({ fullPage: true, timeout: SHOT_TIMEOUT }), mode: "full" };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 120);
    warnings.push(`${label}: full-page screenshot failed (${msg}); using the viewport`);
    try {
      return { buf: await page.screenshot({ fullPage: false, timeout: 10_000 }), mode: "viewport" };
    } catch {
      warnings.push(`${label}: no screenshot available; the report shows a placeholder`);
      const png = new PNG({ width: 16, height: 16 });
      png.data.fill(245);
      return { buf: PNG.sync.write(png), mode: "placeholder" };
    }
  }
}

// Everything axe-core (or our scans) reports that no fixer handles: a to-do list for a human.
export function needsHuman(issues: Issue[]) {
  const m = new Map<string, { id: string; count: number; help?: string }>();
  for (const i of issues) if (!TARGETED.has(i.id)) { const e = m.get(i.id) ?? { id: i.id, count: 0, help: i.help }; e.count++; m.set(i.id, e); }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

// Waits for fonts/images and an idle network, but never fails the run when a page keeps polling.
async function settle(page: Page) {
  await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
  await page.evaluate(async () => {
    const imgs = Array.from(document.images).filter((i) => !i.complete).slice(0, 100);
    await Promise.all(imgs.map((i) => new Promise<void>((resolve) => {
      const done = () => resolve();
      i.addEventListener("load", done, { once: true });
      i.addEventListener("error", done, { once: true });
      setTimeout(done, 2_000);
    })));
    try { await (document as any).fonts?.ready; } catch {}
  }).catch(() => {});
  try { await page.waitForLoadState("networkidle", { timeout: IDLE_TIMEOUT }); } catch {}
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))).catch(() => {});
}

async function openPage(page: Page, url: string, warnings: string[], required: boolean, timeout = NAV_TIMEOUT): Promise<boolean> {
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    if (res && res.status() >= 400) warnings.push(`${url}: server returned HTTP ${res.status()}`);
    await settle(page);
    return true;
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 160);
    const usable = await page.evaluate(() => !!document.body && (document.body.innerText || "").trim().length > 0).catch(() => false);
    if (required && !usable) throw new Error(`could not open ${url}: ${msg}`);
    warnings.push(`${url}: navigation problem (${msg})${usable ? "; continued with the loaded page" : ""}`);
    if (usable) await settle(page);
    return usable;
  }
}

export async function run(url: string, opts: RunOptions | string = {}, repoDirArg?: string) {
  const o: RunOptions = typeof opts === "string" ? { outDir: opts, repoDir: repoDirArg } : opts;
  const outDir = o.outDir ?? "out";
  const repoDir = o.repoDir ? resolve(o.repoDir) : undefined;
  const audit = o.audit ?? process.env.AUDIT === "1";
  if (repoDir && !url.startsWith("file://")) throw new Error("--repo needs a file:// url inside the repository");
  const warnings: string[] = [];

  let rel = "";
  if (repoDir) {
    rel = relative(repoDir, fileURLToPath(url));
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("the file:// url must point to a file inside --repo");
  }

  const browser = await launch();
  const page = await newPage(browser);
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  try {
    await openPage(page, url, warnings, true, o.timeoutMs ?? NAV_TIMEOUT);

    const issuesBefore = await runAxe(page);
    const shotBefore = await capture(page, warnings, "before");
    const readerBefore = await transcript(page);
    const layoutBefore = await layoutSnapshot(page);
    const fixes: Fix[] = [];
    const done = new Map<string, Fix["status"]>();
    let attempt = 0;

    while (!audit && attempt < MAX_ATTEMPTS) {
      attempt++;
      const issues = await runAxe(page);
      const found = attempt === 1 && process.env.USE_SAM !== "0" ? await discover(page, issues) : [];
      if (!issues.length && !found.length) break;
      const perElement = [...issues, ...found].filter((i) => !PAGE_LEVEL.has(i.id));
      const proposals = [...(await understand(await see(page, perElement))), ...(await structureOps(page, issues))];
      const seen = new Set<string>();
      let applied = 0;
      for (const p of proposals) {
        const key = `${p.selector}|${p.attr}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const prev = done.get(key);
        if (prev === "review") continue; // already sent to a human, do not repeat it on every attempt
        if (prev) { fixes.push({ ...p, status: "failed" }); continue; } // already patched but still flagged
        if (!(p.confidence >= MIN_CONF)) { done.set(key, "review"); fixes.push({ ...p, status: "review" }); continue; }
        const diff = await applyFix(page, p);
        done.set(key, diff ? "applied" : "failed");
        if (diff) { fixes.push({ ...p, status: "applied", diff }); applied++; } else fixes.push({ ...p, status: "failed" });
      }
      if (!applied) break;
    }

    await mkdir(outDir, { recursive: true });
    const appliedFixes = fixes.filter((f) => f.status === "applied");
    let patch: Awaited<ReturnType<typeof patchRepo>> | undefined;
    if (repoDir && appliedFixes.length) {
      // Re-measure on the REAL patched source, not the live DOM.
      try { patch = await patchRepo(repoDir, outDir, appliedFixes, { targetPath: rel }); }
      catch (e) { warnings.push(`source patch failed: ${e instanceof Error ? e.message : String(e)}`); }
      if (patch?.edits && patch.files.length) {
        const patchedUrl = pathToFileURL(join(patch.dir, rel)).href;
        const ok = await openPage(page, patchedUrl, warnings, false);
        if (!ok) {
          warnings.push("could not load the patched copy; re-measured the original page");
          await openPage(page, url, warnings, true, o.timeoutMs ?? NAV_TIMEOUT);
        }
      } else {
        warnings.push("source was not changed; re-measured the original page (see patch unmapped list)");
        await openPage(page, url, warnings, true, o.timeoutMs ?? NAV_TIMEOUT);
      }
    } else if (repoDir) {
      warnings.push("no fixes were applied on the page, so the source was not changed");
    }

    // In audit mode nothing changed, so report the same state (and stay deterministic).
    const issuesAfter = audit ? issuesBefore : await runAxe(page);
    const shotAfter = audit ? shotBefore : await capture(page, warnings, "after");
    const readerAfter = audit ? readerBefore : await transcript(page);
    const layoutAfter = audit ? layoutBefore : await layoutSnapshot(page);
    const visualVerified = shotBefore.mode !== "placeholder" && shotAfter.mode !== "placeholder" && shotBefore.mode === shotAfter.mode;
    await writeFile(`${outDir}/after.png`, shotAfter.buf);
    await writeFile(`${outDir}/reader-before.txt`, readerBefore.text);
    await writeFile(`${outDir}/reader-after.txt`, readerAfter.text);
    const report = {
      url, audit, attempts: attempt, warnings,
      before: issuesBefore.length, after: issuesAfter.length,
      targetedBefore: issuesBefore.filter((i) => TARGETED.has(i.id)).length, targetedAfter: issuesAfter.filter((i) => TARGETED.has(i.id)).length,
      unnamedBefore: readerBefore.unnamed, unnamedAfter: readerAfter.unnamed,
      visualDiff: visualVerified ? diffRatio(shotBefore.buf, shotAfter.buf) : 0,
      visualVerified, layoutShift: layoutShift(layoutBefore, layoutAfter),
      contrastApplied: appliedFixes.filter((f) => f.issueId === "color-contrast").length,
      samFound: fixes.filter((f) => f.issueId === "sam-visual").length,
      needsHuman: needsHuman(issuesAfter), patch, issuesBefore, issuesAfter, fixes,
      usage: usageSnapshot(), finishedAt: new Date().toISOString(),
    };
    await writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
    await writeHtmlReport(report, readerBefore.text, readerAfter.text, shotBefore.buf, shotAfter.buf, outDir);
    return report;
  } finally {
    await browser.close().catch(() => {});
  }
}
