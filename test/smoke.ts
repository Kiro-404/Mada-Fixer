import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startMock } from "./mock-meta.js";

// Offline end-to-end test: real browser + real axe-core + real git, mock model API. Run: npm run smoke
Object.assign(process.env, { API_BASE: "http://localhost:8787/v1", MODEL_API_KEY: "test", USE_SAM: "1", MIN_CONFIDENCE: "0.6", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" });
const server = startMock();
const { run } = await import("../src/orchestrator.js");
const { commitAndPr } = await import("../src/pr.js");
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

const r = await run(pathToFileURL(resolve("demo/index.html")).href, "out/smoke");

// PR flow on a throwaway git repo
const tmp = mkdtempSync(join(tmpdir(), "mada-"));
cpSync("demo", tmp, { recursive: true });
git(tmp, "init", "-q"); git(tmp, "add", "-A"); git(tmp, "commit", "-qm", "init");
const rr = await run(pathToFileURL(join(tmp, "index.html")).href, "out/smoke-repo", tmp);
const pr = await commitAndPr(tmp, "out/smoke-repo", rr, false);
const committed = git(tmp, "show", "HEAD", "--stat", "--format=%s");
server.close();

const ok = new Set(r.fixes.filter((f) => f.status === "applied").map((f) => f.issueId));
const checks: [string, boolean][] = [
  ["page-level fixes: title, viewport, main landmark, skip link, focus ring", ["document-title", "meta-viewport", "landmark-one-main", "skip-link", "focus-invisible"].every((i) => ok.has(i))],
  ["keyboard: clickable div became a real control", ok.has("custom-control") && ok.has("frame-title")],
  ["targeted issues fixed", r.targetedBefore > 0 && r.targetedAfter === 0],
  ["contrast fixed", r.contrastApplied >= 1],
  ["SAM found an unlabeled visual control", r.samFound >= 1],
  ["screen reader has no nameless elements", r.unnamedAfter === 0],
  ["no element moved", r.layoutShift === 0],
  ["repo mode: patched source verified", rr.targetedAfter <= 2 && rr.layoutShift === 0],
  ["PR flow: branch + commit created", pr.branch.startsWith("mada-fixer/") && /Mada Fixer/.test(committed) && /index\.html/.test(committed)],
];
for (const [n, ok] of checks) console.log(ok ? "PASS" : "FAIL", n);
console.log(`targeted ${r.targetedBefore} -> ${r.targetedAfter}, unnamed ${r.unnamedBefore} -> ${r.unnamedAfter}; repo mode ${rr.targetedBefore} -> ${rr.targetedAfter}`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
