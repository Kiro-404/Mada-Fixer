import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { launch, newPage } from "../src/browser.js";
import { runAxe } from "../src/verify/axe.js";

// Failure behavior on real-world pages. Run: npm run test:robust
const procs = () => Number(execSync("pgrep -fc 'chrom' || true").toString().trim() || 0);
const results: [string, boolean][] = [];
const t = (n: string, ok: boolean) => results.push([n, ok]);
const demo = pathToFileURL(resolve("demo/index.html")).href;
Object.assign(process.env, { API_BASE: "http://localhost:1/v1", MODEL_API_KEY: "t", USE_SAM: "0" });
const { run } = await import("../src/orchestrator.js");
const base = procs();

const bad = await run("file:///does/not/exist.html", "out/robust").then(() => "no error", (e) => String(e));
await new Promise((r) => setTimeout(r, 1500));
t("a failing site raises an error and leaves no browser behind", bad !== "no error" && procs() <= base);

process.env.SITE_TIMEOUT_MS = "1";
const slow = await run(demo, "out/robust").then(() => "no error", (e) => String(e));
await new Promise((r) => setTimeout(r, 1500));
t("the per-site time budget stops the run and cleans up", /time budget/.test(slow) && procs() <= base);

const b = await launch();
const page = await newPage(b);
await page.setContent('<html lang="ar"><body><p>مرحبا</p><iframe srcdoc="&lt;img src=x&gt;"></iframe></body></html>');
await page.evaluate("window.__name = (f) => f");
await page.waitForTimeout(500);
const ids = (await runAxe(page)).map((i) => i.id);
t("problems inside an iframe are listed as nested, not patched on the wrong element", ids.some((i) => i.startsWith("nested:")) && !ids.includes("image-alt"));
await b.close();

for (const [n, ok] of results) console.log(ok ? "PASS" : "FAIL", n);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
