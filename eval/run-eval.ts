import "../src/env.js";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "../src/orchestrator.js";
import { usageSnapshot } from "../src/models/meta.js";
import { envNum, sleep } from "../src/util.js";

// Runs the loop on every site in eval/sites.csv ("demo"/"news" are local fixtures), writes eval/results.csv and a summary.
// Real sites are read-only: one page load per site, robots.txt is respected, and requests are spaced out.
const UA = process.env.MADA_USER_AGENT ?? "MadaFixer/0.1 (Arabic accessibility audit; read-only)";
const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const sw = (name: string) => { const i = args.indexOf(name); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const audit = sw("--audit");
const ignoreRobots = sw("--ignore-robots");
const limitArg = flag("--limit");
const limit = limitArg ? Math.max(1, Math.floor(Number(limitArg) || 1)) : Infinity;
const only = (flag("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const delay = envNum("EVAL_DELAY_MS", 2_000, 0, 60_000);
const timeoutMs = envNum("EVAL_TIMEOUT_MS", 45_000, 3_000, 180_000);

type Rule = { allow: boolean; path: string };
const csv = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function robotsAllows(url: string): Promise<{ ok: boolean; reason?: string }> {
  if (ignoreRobots) return { ok: true };
  try {
    const u = new URL(url);
    const r = await fetch(new URL("/robots.txt", u.origin), { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return { ok: true };
    const groups: { agents: string[]; rules: Rule[] }[] = [];
    let agents: string[] = [], rules: Rule[] = [], lastWasAgent = false;
    const flush = () => { if (agents.length) groups.push({ agents, rules }); agents = []; rules = []; };
    for (const line of (await r.text()).split(/\r?\n/)) {
      const s = line.replace(/#.*/, "").trim();
      const i = s.indexOf(":");
      if (i < 0) continue;
      const key = s.slice(0, i).trim().toLowerCase(), value = s.slice(i + 1).trim();
      if (key === "user-agent") {
        if (!lastWasAgent) { flush(); }
        agents.push(value.toLowerCase());
        lastWasAgent = true;
      } else {
        lastWasAgent = false;
        if ((key === "allow" || key === "disallow") && value) rules.push({ allow: key === "allow", path: value });
      }
    }
    flush();
    const mine = groups.filter((g) => g.agents.some((a) => a === "*" || a.includes("mada")));
    const path = u.pathname + u.search;
    let best: Rule | null = null;
    for (const rule of mine.flatMap((g) => g.rules)) {
      if (!(rule.path === "/" ? path.startsWith("/") : path.startsWith(rule.path))) continue;
      if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
    }
    return best && !best.allow ? { ok: false, reason: `robots.txt disallows ${best.path}` } : { ok: true };
  } catch {
    return { ok: true }; // unreachable robots.txt is not a prohibition
  }
}

const all = (await readFile("eval/sites.csv", "utf8")).trim().split(/\r?\n/).slice(1)
  .map((l) => l.split(",").map((s) => s.trim()))
  .filter(([u]) => u && !u.startsWith("#"))
  .filter(([u, c]) => !only.length || only.some((o) => u === o || c === o || u.includes(o)))
  .slice(0, limit === Infinity ? undefined : limit);

const header = ["url", "category", "audit", "wcagBefore", "wcagAfter", "targetedBefore", "targetedAfter", "applied", "review", "failed", "samFound", "unnamedBefore", "unnamedAfter", "visualDiff", "layoutShift", "calls", "costUsd", "warnings", "error"];
const out = [header.join(",")];
const cat: Record<string, { n: number; tb: number; ta: number; ub: number; ua: number; sites: number }> = {};
const before0 = usageSnapshot();
let failedSites = 0, skippedSites = 0;

for (const [i, [raw, category = "other"]] of all.entries()) {
  if (i) await sleep(delay);
  const local = raw === "demo" ? "demo/index.html" : raw === "news" ? "demo/news.html" : null;
  const url = local ? pathToFileURL(resolve(local)).href : raw;
  let row: string[];
  if (!local) {
    const rb = await robotsAllows(url);
    if (!rb.ok) {
      skippedSites++;
      row = [raw, category, String(audit), "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", rb.reason ?? "blocked by robots.txt"];
      out.push(row.map(csv).join(","));
      console.log(row.join(" | "));
      continue;
    }
  }
  const u0 = usageSnapshot();
  try {
    const r = await run(url, { outDir: `out/eval/${i}`, audit, timeoutMs });
    const n = (s: string) => r.fixes.filter((f) => f.status === s).length;
    const u1 = usageSnapshot();
    row = [raw, category, String(audit), String(r.before), String(r.after), String(r.targetedBefore), String(r.targetedAfter),
      String(n("applied")), String(n("review")), String(n("failed")), String(r.samFound), String(r.unnamedBefore), String(r.unnamedAfter),
      r.visualDiff.toFixed(5), String(r.layoutShift), String(u1.calls - u0.calls), (u1.costUsd - u0.costUsd).toFixed(4), r.warnings.join(" ; "), ""];
    const c = (cat[category] ??= { n: 0, tb: 0, ta: 0, ub: 0, ua: 0, sites: 0 });
    c.n++; c.sites++; c.tb += r.targetedBefore; c.ta += r.targetedAfter; c.ub += r.unnamedBefore; c.ua += r.unnamedAfter;
  } catch (e) {
    // Do not reread out/eval/<n>/report.json here: it may be left over from an earlier run and would
    // print stale numbers next to a fresh error.
    failedSites++;
    row = [raw, category, String(audit), "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", String(e).split("\n")[0].slice(0, 160)];
  }
  out.push(row.map(csv).join(","));
  console.log(row.join(" | "));
}

await writeFile("eval/results.csv", out.join("\n") + "\n");
const u = usageSnapshot();
console.log("\ncategory | sites | targeted issues | nameless elements (screen reader)");
for (const [k, c] of Object.entries(cat)) console.log(`${k} | ${c.n} | ${c.tb} -> ${c.ta} | ${c.ub} -> ${c.ua}`);
console.log(`\n${audit ? "audit mode (no models)" : `model usage: ${u.calls - before0.calls} calls (+${u.cached - before0.cached} cached), ${u.sam - before0.sam} SAM images, about $${(u.costUsd - before0.costUsd).toFixed(2)} for ${all.length} sites`}`);
if (failedSites || skippedSites) console.log(`not measured: ${failedSites} failed, ${skippedSites} skipped (robots.txt) — see the error column in eval/results.csv`);
console.log("per-site details: out/eval/<n>/report.html  |  table: eval/results.csv");
