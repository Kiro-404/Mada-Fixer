import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startMock } from "./mock-meta.js";

// Offline end-to-end test: real browser + real axe-core + real git, mock model API. Run: npm run smoke
Object.assign(process.env, {
  API_BASE: "http://localhost:8787/v1", MODEL_API_KEY: "test", NO_CACHE: "1",
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
});
const server = startMock();
const { run } = await import("../src/orchestrator.js");
const { commitAndPr } = await import("../src/pr.js");
const { patchRepo } = await import("../src/fix/repoPatch.js");
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

const r = await run(pathToFileURL(resolve("demo/index.html")).href, "out/smoke");

// PR flow on a throwaway git repo
const tmp = mkdtempSync(join(tmpdir(), "mada-"));
cpSync("demo", tmp, { recursive: true });
git(tmp, "init", "-q"); git(tmp, "add", "-A"); git(tmp, "commit", "-qm", "init");
const rr = await run(pathToFileURL(join(tmp, "index.html")).href, "out/smoke-repo", tmp);
const pr = await commitAndPr(tmp, "out/smoke-repo", rr, false);
const committed = git(tmp, "show", "HEAD", "--stat", "--format=%s");
const committedFiles = git(tmp, "show", "--name-only", "--format=").split("\n").filter(Boolean);

// Running the same fixes on the already-patched source must be a no-op (no duplicate title/style/skip link).
const idem = await patchRepo(rr.patch!.dir, "out/smoke-idem", rr.fixes.filter((f) => f.status === "applied"), { targetPath: "index.html" });
const patchedHtml = readFileSync(join(rr.patch!.dir, "index.html"), "utf8");
const idemHtml = readFileSync(join(idem.dir, "index.html"), "utf8");

// Nested source paths must produce a diff git accepts (POSIX paths, not Windows backslashes).
const nested = mkdtempSync(join(tmpdir(), "mada-nested-"));
mkdirSync(join(nested, "sub"));
writeFileSync(join(nested, "sub", "page.html"), `<!doctype html><html><head><title>x</title></head><body><button>×</button></body></html>\n`);
const np = await patchRepo(nested, "out/smoke-nested", [
  { issueId: "button-name", selector: "button", attr: "aria-label", value: "إغلاق", html: "<button>×</button>", confidence: 0.9, status: "applied", text: "×" },
], { targetPath: "sub/page.html" });
git(nested, "init", "-q"); git(nested, "add", "-A"); git(nested, "commit", "-qm", "init");
let applies = true;
try { git(nested, "apply", "--check", resolve(np.diffFile)); } catch { applies = false; }
server.close();

const ok = new Set(r.fixes.filter((f) => f.status === "applied").map((f) => f.issueId));
const appliedKeys = r.fixes.filter((f) => f.status === "applied").map((f) => `${f.selector}|${f.attr}`);
const readerAfter = readFileSync("out/smoke/reader-after.txt", "utf8");
const checks: [string, boolean][] = [
  ["page-level fixes: title, viewport, main landmark, skip link, focus ring", ["document-title", "meta-viewport", "landmark-one-main", "skip-link", "focus-invisible"].every((i) => ok.has(i))],
  ["keyboard: clickable div became a real control", ok.has("custom-control") && ok.has("frame-title")],
  ["targeted issues fixed", r.targetedBefore > 0 && r.targetedAfter === 0],
  ["contrast fixed", r.contrastApplied >= 1],
  ["SAM found an unlabeled visual control", r.samFound >= 1],
  ["screen reader has no nameless elements", r.unnamedAfter === 0],
  ["screen reader announces Arabic labels", /button "بحث"/.test(readerAfter) && /"السلة"/.test(readerAfter)],
  ["no element moved", r.layoutShift === 0],
  ["no duplicate fixes", new Set(appliedKeys).size === appliedKeys.length],
  ["every fix has a usable value and confidence", r.fixes.every((f) => typeof f.value === "string" && f.value.trim() !== "" && f.confidence >= 0 && f.confidence <= 1)],
  ["repo mode: patched source verified", rr.targetedAfter <= 2 && rr.layoutShift === 0 && (rr.patch?.edits ?? 0) > 0],
  ["repo mode: one title, one skip link, one stylesheet per rule", (patchedHtml.match(/<title/g) || []).length === 1 && (patchedHtml.match(/class="mada-skip"/g) || []).length === 1 && (patchedHtml.match(/\.mada-skip\{/g) || []).length === 1 && (patchedHtml.match(/<style data-mada-css/g) || []).length === 2],
  ["idempotent source patch: second run changes nothing", idem.edits === 0 && idem.files.length === 0 && idemHtml === patchedHtml],
  ["PR flow: branch + commit created, only the patched file staged", pr.branch.startsWith("mada-fixer/") && /Mada Fixer/.test(committed) && committedFiles.length === 1 && committedFiles[0] === "index.html"],
  ["nested paths: POSIX diff applies with git", np.files[0] === "sub/page.html" && !readFileSync(np.diffFile, "utf8").includes("sub\\page.html") && readFileSync(np.diffFile, "utf8").includes("a/sub/page.html") && applies],
];
for (const [n, ok] of checks) console.log(ok ? "PASS" : "FAIL", n);
console.log(`targeted ${r.targetedBefore} -> ${r.targetedAfter}, unnamed ${r.unnamedBefore} -> ${r.unnamedAfter}; repo mode ${rr.targetedBefore} -> ${rr.targetedAfter}, patch ${rr.patch?.edits}/${rr.patch?.requested} mapped, unmapped ${rr.patch?.failed}`);
if (rr.patch?.warnings.length) console.log("patch warnings:", rr.patch.warnings.join(" | "));
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
