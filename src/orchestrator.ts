import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch, newPage, openPage } from "./browser.js";
import { discover, see } from "./see/see.js";
import { understand } from "./understand/understand.js";
import { applyFix } from "./fix/fix.js";
import { structureOps } from "./fix/structure.js";
import { beautifyOps } from "./fix/beautify.js";
import { patchRepo } from "./fix/repoPatch.js";
import { runAxe, TARGETED } from "./verify/axe.js";
import { transcript } from "./verify/transcript.js";
import { diffRatio } from "./verify/visual.js";
import { layoutShift, layoutSnapshot } from "./verify/layout.js";
import { writeHtmlReport } from "./report/html.js";
import type { Fix, Issue } from "./types.js";

const MIN_CONF = Number(process.env.MIN_CONFIDENCE ?? 0.6);
const PAGE_LEVEL = new Set(["landmark-one-main", "focus-invisible", "arabic-dir"]); // fixed by structureOps, not per element

// Everything axe-core (or our scans) reports that no fixer handles: a to-do list for a human.
export function needsHuman(issues: Issue[]) {
  const m = new Map<string, { id: string; count: number; help?: string }>();
  for (const i of issues) if (!TARGETED.has(i.id)) { const e = m.get(i.id) ?? { id: i.id, count: 0, help: i.help }; e.count++; m.set(i.id, e); }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

export async function run(url: string, outDir = "out", repoDir?: string, opts: { beautify?: boolean } = {}) {
  const beautify = opts.beautify ?? process.env.BEAUTIFY === "1";
  if (repoDir && !url.startsWith("file://")) throw new Error("--repo needs a file:// url inside the repo");
  const deadline = Date.now() + Number(process.env.SITE_TIMEOUT_MS ?? 240000); // per-site time budget
  const over = () => { if (Date.now() > deadline) throw new Error("site time budget exceeded (SITE_TIMEOUT_MS)"); };
  const browser = await launch();
  try {
  const page = await newPage(browser);
  await openPage(page, url);

  const issuesBefore = await runAxe(page);
  const shotBefore = await page.screenshot({ fullPage: true });
  const readerBefore = await transcript(page);
  const layoutBefore = await layoutSnapshot(page);
  const fixes: Fix[] = [];
  const done = new Map<string, Fix["status"]>();
  let attempt = 0;

  while (attempt < 3) {
    attempt++;
    over();
    const issues = await runAxe(page);
    const found = attempt === 1 && process.env.USE_SAM !== "0" ? await discover(page, issues) : [];
    if (!issues.length && !found.length) break;
    const perElement = [...issues, ...found].filter((i) => !PAGE_LEVEL.has(i.id) && !i.id.startsWith("nested:")); // nested = inside an iframe/shadow root: listed for a human
    const proposals = [...(await understand(await see(page, perElement))), ...(await structureOps(page, issues))];
    let applied = 0;
    for (const p of proposals) {
      const key = `${p.selector}|${p.attr}`;
      const prev = done.get(key);
      if (prev === "review") continue; // already sent to a human, do not repeat it on every attempt
      if (prev) { fixes.push({ ...p, status: "failed" }); continue; } // already patched but still flagged
      if (p.confidence < MIN_CONF) { done.set(key, "review"); fixes.push({ ...p, status: "review" }); continue; }
      const diff = await applyFix(page, p);
      done.set(key, diff ? "applied" : "failed");
      if (diff) { fixes.push({ ...p, status: "applied", diff }); applied++; } else fixes.push({ ...p, status: "failed" });
    }
    if (!applied) break;
  }

  if (beautify) {
    // Intentional visible redesign: one accessible theme, then clearer copy for headings/CTAs.
    // Text fixes run after accessibility fixes so they do not disturb the axe repair loop.
    const ops = await beautifyOps(page);
    for (const p of ops) {
      if (p.confidence < MIN_CONF) { fixes.push({ ...p, status: "review" }); continue; }
      const diff = await applyFix(page, p);
      fixes.push({ ...p, status: diff ? "applied" : "failed", ...(diff ? { diff } : {}) });
    }
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/before.png`, shotBefore);
  let patch: Awaited<ReturnType<typeof patchRepo>> | undefined;
  if (repoDir) { // re-measure on the REAL patched source, not the live DOM
    over();
    patch = await patchRepo(repoDir, outDir, fixes.filter((f) => f.status === "applied"));
    const rel = relative(resolve(repoDir), fileURLToPath(url));
    await openPage(page, pathToFileURL(join(patch.dir, rel)).href);
  }
  const issuesAfter = await runAxe(page);
  const shotAfter = await page.screenshot({ path: `${outDir}/after.png`, fullPage: true });
  const readerAfter = await transcript(page);
  const layoutAfter = await layoutSnapshot(page);
  await writeFile(`${outDir}/reader-before.txt`, readerBefore.text);
  await writeFile(`${outDir}/reader-after.txt`, readerAfter.text);
  const report = {
    url, attempts: attempt, before: issuesBefore.length, after: issuesAfter.length,
    targetedBefore: issuesBefore.filter((i) => TARGETED.has(i.id)).length, targetedAfter: issuesAfter.filter((i) => TARGETED.has(i.id)).length,
    unnamedBefore: readerBefore.unnamed, unnamedAfter: readerAfter.unnamed,
    visualDiff: diffRatio(shotBefore, shotAfter), layoutShift: layoutShift(layoutBefore, layoutAfter),
    contrastApplied: fixes.filter((f) => f.issueId === "color-contrast" && f.status === "applied").length,
    samFound: fixes.filter((f) => f.issueId === "sam-visual").length,
    beautify,
    beautifyApplied: fixes.filter((f) => f.status === "applied" && (f.issueId === "visual-polish" || f.issueId === "copy-polish")).length,
    textChanged: fixes.filter((f) => f.status === "applied" && f.issueId === "copy-polish").length,
    needsHuman: needsHuman(issuesAfter), patch, issuesBefore, issuesAfter, fixes,
  };
  await writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  await writeHtmlReport(report, readerBefore.text, readerAfter.text, shotBefore, shotAfter, outDir);
  // Save the live fixed DOM with <base href> so assets and styles resolve to original site
  let fixedDom = await page.content();
  if (url.startsWith("http://") || url.startsWith("https://")) {
    if (!/<base\s/i.test(fixedDom)) {
      fixedDom = fixedDom.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${url}">`);
    }
  }
  fixedDom = fixedDom.replace(/<body([^>]*)unresolved([^>]*)>/i, '<body$1$2>');
  fixedDom = fixedDom.replace(/<\/head>/i, `<style>body{opacity:1!important;display:block!important;}</style></head>`);
  await writeFile(`${outDir}/page-fixed.html`, fixedDom);
  return report;
  } finally { await browser.close(); }
}
