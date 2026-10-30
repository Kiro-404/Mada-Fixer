import http from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startMock } from "./mock-meta.js";

// Hard cases: strict CSP, a page that never stops polling, and a model that returns non-JSON.
// The mock API is selected before the app modules load (API_BASE is read at import time).
Object.assign(process.env, { API_BASE: "http://localhost:8788/v1", MODEL_API_KEY: "test", NO_CACHE: "1", MAX_MODEL_CALLS: "600" });
const badModel = startMock(8788, { badJson: true });
const { run } = await import("../src/orchestrator.js");
const { launch } = await import("../src/browser.js");
const { runAxe } = await import("../src/verify/axe.js");

const results: [string, boolean][] = [];
const t = (n: string, ok: boolean) => { results.push([n, ok]); console.log(ok ? "PASS" : "FAIL", n); };

// 1) axe must still load on a page with a strict CSP (bypassCSP off, CDP evaluate fallback).
{
  const browser = await launch();
  const ctx = await browser.newContext({ bypassCSP: false });
  const page = await ctx.newPage();
  await page.addInitScript("window.__name = (f) => f;");
  await page.setContent(`<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'"><title>csp</title></head><body><button></button></body></html>`);
  await page.evaluate("window.__name = (f) => f");
  const issues = await runAxe(page);
  t("axe-core runs under a strict CSP without bypassCSP", issues.length > 0 && (await page.evaluate(() => "axe" in window)));
  await browser.close();
}

// 2) A local file with CSP + no accessible labels audits cleanly (no models).
{
  const dir = mkdtempSync(join(tmpdir(), "mada-csp-"));
  writeFileSync(join(dir, "index.html"), `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'"><title>صفحة</title></head><body><h1>عنوان</h1><button></button><p style="color:#ddd">هذا نص عربي طويل بما يكفي لاختبار التباين</p></body></html>\n`);
  const r = await run(pathToFileURL(join(dir, "index.html")).href, { audit: true, outDir: "out/robust-csp" });
  t("audit mode: no models, no changes, issues still found", r.audit && r.fixes.length === 0 && r.before === r.after && r.before > 0 && r.attempts === 0);
}

// 3) A page that keeps polling must not hang the run.
{
  const hang = http.createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>hang</title></head><body><h1>محتوى</h1><button></button><script>setInterval(() => fetch('/hang').catch(() => {}), 200)</script></body></html>`);
    } // /hang never responds
  });
  await new Promise<void>((r) => hang.listen(8790, r));
  const started = Date.now();
  let ok = false;
  try {
    const r = await run("http://localhost:8790/", { audit: true, outDir: "out/robust-hang", timeoutMs: 5_000 });
    ok = r.before > 0 && r.audit;
  } catch (e) {
    console.error("hang run failed:", e);
  }
  const elapsed = Date.now() - started;
  t(`polling page completes (${Math.round(elapsed / 1000)}s, issues found)`, ok && elapsed < 20_000);
  hang.closeAllConnections?.();
  await new Promise<void>((r) => hang.close(() => r()));
}

// 4) Non-JSON model output is skipped, never applied, and never crashes the run.
{
  const r = await run(pathToFileURL(resolve("demo/index.html")).href, { outDir: "out/robust-badjson" });
  const raw = readFileSync("out/robust-badjson/report.json", "utf8");
  t("invalid model JSON: run completes with a report", r.before > 0 && Array.isArray(r.warnings) && r.targetedBefore > 0);
  t("invalid model JSON: nothing invalid reaches the page or the report", r.fixes.every((f) => typeof f.value === "string" && f.value.trim() !== "" && Number.isFinite(f.confidence) && f.confidence >= 0 && f.confidence <= 1) && !raw.includes("undefined"));
  t("invalid model JSON: deterministic structural fixes still apply", r.fixes.some((f) => f.status === "applied" && f.issueId === "landmark-one-main"));
}

badModel.close();
console.log(`\n${results.filter(([, ok]) => ok).length}/${results.length} passed`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
