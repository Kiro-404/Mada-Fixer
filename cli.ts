import "./src/env.js";
import { run } from "./src/orchestrator.js";
import { commitAndPr } from "./src/pr.js";
import { estimateCost, usage } from "./src/models/meta.js";

const args = process.argv.slice(2);
const flag = (n: string, takesValue = true) => { const i = args.indexOf(n); if (i < 0) return undefined; return args.splice(i, takesValue ? 2 : 1); };
const repo = flag("--repo")?.[1];
const pr = !!flag("--pr", false);
const beautify = !!flag("--beautify", false);
const url = args[0];
if (!url) { console.error("usage: npm run fix -- <url> [--repo <dir> [--pr]] [--beautify]"); process.exit(1); }
if (pr && !repo) { console.error("--pr needs --repo <dir> (a git repo you own)"); process.exit(1); }
const r = await run(url, "out", repo, { beautify });
const n = (s: string) => r.fixes.filter((f) => f.status === s).length;
console.log(`${r.url}
WCAG violations (all): ${r.before} -> ${r.after}
targeted classes: ${r.targetedBefore} -> ${r.targetedAfter} | applied ${n("applied")}, needs review ${n("review")}, failed ${n("failed")}
found by SAM (not caught by axe): ${r.samFound}
screen reader, unnamed elements: ${r.unnamedBefore} -> ${r.unnamedAfter}
elements that moved: ${r.layoutShift} | pixels changed: ${(r.visualDiff * 100).toFixed(3)}%${r.contrastApplied ? ` (${r.contrastApplied} contrast fixes change color on purpose)` : ""}${r.beautify ? `\nbeautify: ${r.beautifyApplied} intentional visual fixes (${r.textChanged} text rewrites + theme)` : ""}${r.patch ? `\nsource patch: ${r.patch.edits} edits for ${r.patch.requested} fixes, ${r.patch.failed} unmatched -> ${r.patch.diffFile}` : ""}
model usage: ${usage.calls} calls (+${usage.cached} cached), ${usage.sam} SAM images, about $${estimateCost().toFixed(3)}
report: out/report.html (open it in a browser) + report.json`);
if (pr && repo && r.patch?.edits) console.log("git:", (await commitAndPr(repo, "out", r, true)).status);
if (!r.beautify && (r.layoutShift > 0 || (r.visualDiff > 0.001 && !r.contrastApplied))) { console.error("WARNING: fixes changed the page's appearance"); process.exit(2); }
