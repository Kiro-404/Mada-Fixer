// Offline demo run: full pipeline (real browser + axe-core + mock Meta API), no git needed.
// Usage: npx tsx test/demo-run.ts
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startMock } from "./mock-meta.js";

Object.assign(process.env, {
  API_BASE: "http://localhost:8787/v1",
  MODEL_API_KEY: "demo",
});

const server = startMock();
const { run } = await import("../src/orchestrator.js");

console.log("🚀 Mada Fixer — running offline demo...\n");

const url = pathToFileURL(resolve("demo/index.html")).href;
const r = await run(url, "out/demo");

server.close();

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Mada Fixer — Demo Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴  WCAG violations (targeted):  ${r.targetedBefore}  →  ${r.targetedAfter}
🔇  Unnamed elements (screen reader): ${r.unnamedBefore}  →  ${r.unnamedAfter}
👁️   Found by SAM (invisible to axe): ${r.samFound}
🎨  Contrast fixes applied: ${r.contrastApplied}
📐  Elements moved: ${r.layoutShift}
🖼️   Pixels changed: ${(r.visualDiff * 100).toFixed(3)}%

Fixes applied:
${r.fixes.filter(f => f.status === "applied").map(f => `  ✅ ${f.issueId}  →  ${f.attr}="${f.value}"  (${Math.round(f.confidence * 100)}% confidence)`).join("\n")}

${r.fixes.filter(f => f.status === "review").length ? `Sent to human review:\n${r.fixes.filter(f => f.status === "review").map(f => `  👀 ${f.issueId}  →  ${f.attr}  (${Math.round(f.confidence * 100)}% confidence)`).join("\n")}\n` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄  Report: out/demo/report.html  (open in browser)
🖼️   Before: out/demo/reader-before.txt
🖼️   After:  out/demo/reader-after.txt
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

process.exit(r.targetedAfter === 0 ? 0 : 0); // always exit 0 for demo
