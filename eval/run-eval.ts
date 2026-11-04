import "../src/env.js";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "../src/orchestrator.js";
import { allowed } from "../src/robots.js";
import { estimateCost, usage } from "../src/models/meta.js";

// Runs the loop on every site in eval/sites.csv ("demo" = the local broken page), writes eval/results.csv and a per-category summary.
const rows = (await readFile("eval/sites.csv", "utf8")).trim().split("\n").slice(1).map((l) => l.split(","));
const out = ["url,category,wcagBefore,wcagAfter,targetedBefore,targetedAfter,applied,review,failed,samFound,unnamedBefore,unnamedAfter,visualDiff,layoutShift,error"];
const cat: Record<string, { n: number; tb: number; ta: number; ub: number; ua: number }> = {};
for (const [i, [raw, category]] of rows.entries()) {
  const local = raw === "demo" ? "demo/index.html" : raw === "news" ? "demo/news.html" : null; // built-in fixtures
  const url = local ? pathToFileURL(resolve(local)).href : raw;
  try {
    if (!(await allowed(url))) throw new Error("robots.txt disallows automated access: skipped");
    const r = await run(url, `out/eval/${i}`);
    const n = (s: string) => r.fixes.filter((f) => f.status === s).length;
    out.push([raw, category, r.before, r.after, r.targetedBefore, r.targetedAfter, n("applied"), n("review"), n("failed"), r.samFound, r.unnamedBefore, r.unnamedAfter, r.visualDiff.toFixed(5), r.layoutShift, ""].join(","));
    const c = (cat[category] ??= { n: 0, tb: 0, ta: 0, ub: 0, ua: 0 });
    c.n++; c.tb += r.targetedBefore; c.ta += r.targetedAfter; c.ub += r.unnamedBefore; c.ua += r.unnamedAfter;
  } catch (e) { out.push(`${raw},${category},,,,,,,,,,,,,${String(e).slice(0, 80).replace(/[,\n]/g, ";")}`); }
  console.log(out[out.length - 1]);
  if (!local) await new Promise((r) => setTimeout(r, Number(process.env.EVAL_DELAY_MS ?? 2000))); // be gentle with real sites
}
await writeFile("eval/results.csv", out.join("\n"));
console.log("\ncategory | sites | targeted issues | nameless elements (screen reader)");
for (const [k, c] of Object.entries(cat)) console.log(`${k} | ${c.n} | ${c.tb} -> ${c.ta} | ${c.ub} -> ${c.ua}`);
console.log(`\nmodel usage: ${usage.calls} calls (+${usage.cached} cached), ${usage.sam} SAM images, about $${estimateCost().toFixed(2)} for ${rows.length} sites`);
