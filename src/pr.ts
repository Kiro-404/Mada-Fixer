import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Fix } from "./types.js";

type PatchSummary = { diffFile: string; files?: string[]; unmapped?: { id: string; fix: string; reason: string }[]; warnings?: string[] };
type Rep = { url: string; targetedBefore: number; targetedAfter: number; unnamedBefore: number; unnamedAfter: number; layoutShift: number; fixes: Fix[]; needsHuman?: { id: string; count: number; help?: string }[]; patch?: PatchSummary };

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const cell = (s: string) => String(s).replace(/\|/g, "\\|").replace(/`/g, "'").replace(/\r?\n/g, " ").slice(0, 160);

export function prBody(r: Rep): string {
  const row = (f: Fix) => `| ${cell(f.issueId)} | \`${cell(f.attr)}="${cell(f.value)}"\` | ${Math.round((Number.isFinite(f.confidence) ? f.confidence : 0) * 100)}% |`;
  const applied = r.fixes.filter((f) => f.status === "applied"), review = r.fixes.filter((f) => f.status === "review");
  const unmapped = r.patch?.unmapped ?? [];
  return `## إصلاحات إتاحة تلقائية (Mada Fixer)

الصفحة: ${r.url}

| | قبل | بعد |
|---|---|---|
| مشاكل WCAG المستهدفة | ${r.targetedBefore} | ${r.targetedAfter} |
| عناصر من غير اسم لقارئ الشاشة | ${r.unnamedBefore} | ${r.unnamedAfter} |
| عناصر اتحرّكت من مكانها | | ${r.layoutShift} |

### التعديلات (${applied.length})
${applied.length ? `| المشكلة | التعديل | الثقة |\n|---|---|---|\n${applied.map(row).join("\n")}` : "لا يوجد."}
${review.length ? `\n### محتاجة مراجعة بشرية — ماتطبّقتش\n| المشكلة | الاقتراح | الثقة |\n|---|---|---|\n${review.map(row).join("\n")}\n` : ""}
${unmapped.length ? `\n### إصلاحات اتطبّقت على الصفحة بس مالقيتش لها مكان في الكود\n| المعرّف | الإصلاح | السبب |\n|---|---|---|\n${unmapped.map((u) => `| \`${cell(u.id)}\` | \`${cell(u.fix)}\` | ${cell(u.reason)} |`).join("\n")}\n` : ""}
${r.needsHuman?.length ? `\n### لسه محتاج شغل بشري\n${r.needsHuman.map((n) => `- \`${cell(n.id)}\` (${n.count}): ${cell(n.help ?? "")}`).join("\n")}\n` : ""}
${r.patch?.warnings?.length ? `\n### ملاحظات\n${r.patch.warnings.map((w) => `- ${cell(w)}`).join("\n")}\n` : ""}
الأوصاف والتعديلات اتولّدت بنموذج ذكاء اصطناعي (Meta Muse). راجع الـ diff قبل الدمج.
`;
}

const patchFiles = (diff: string) => [...diff.matchAll(/^\+\+\+ b\/(.+?)\t?$/gm)].map((m) => m[1]);

// Branch + commit the generated diff in the user's own repo; optionally push and open a PR with the GitHub CLI.
export async function commitAndPr(repoDir: string, outDir: string, r: Rep, push: boolean) {
  if (!r.patch) throw new Error("no patch to commit");
  const root = resolve(repoDir);
  git(root, "rev-parse", "--is-inside-work-tree");
  if (git(root, "status", "--porcelain", "--untracked-files=no", "--", ".")) throw new Error("repo has uncommitted changes: commit or stash them first");

  const diff = await readFile(r.patch.diffFile, "utf8");
  const files = patchFiles(diff);
  if (!diff.trim() || !files.length) throw new Error("the patch is empty: nothing to commit");
  const outside = files.filter((f) => f.startsWith("/") || f.split("/").includes(".."));
  if (outside.length) throw new Error(`refusing to apply a patch with unsafe paths: ${outside.join(", ")}`);

  const prefix = git(root, "rev-parse", "--show-prefix").replace(/\/$/, "");
  const dirArgs = prefix ? [`--directory=${prefix}`] : [];
  git(root, "apply", "--check", "--whitespace=nowarn", ...dirArgs, resolve(r.patch.diffFile)); // never touch the tree unless it applies cleanly

  const prev = git(root, "rev-parse", "--abbrev-ref", "HEAD");
  const prevRef = prev === "HEAD" ? git(root, "rev-parse", "HEAD") : prev;
  const branch = `mada-fixer/${new Date().toISOString().slice(0, 10)}-${Date.now() % 100000}`;
  git(root, "checkout", "-b", branch);
  try {
    git(root, "apply", "--whitespace=nowarn", ...dirArgs, resolve(r.patch.diffFile));
    // Stage only the files this patch touched; never `git add -A` in someone else's repo.
    const paths = files.map((f) => (prefix ? `${prefix}/${f}` : f));
    git(root, "add", "--", ...paths);
    git(root, "commit", "-m", `fix(a11y): ${r.fixes.filter((f) => f.status === "applied").length} accessibility fixes (Mada Fixer)`);
  } catch (e) {
    try { git(root, "apply", "-R", "--whitespace=nowarn", ...dirArgs, resolve(r.patch.diffFile)); } catch {}
    try { git(root, "reset", "--quiet"); } catch {}
    try { git(root, "checkout", prevRef); } catch {}
    try { git(root, "branch", "-D", branch); } catch {}
    throw e;
  }

  const bodyFile = resolve(join(outDir, "pr-body.md"));
  await writeFile(bodyFile, prBody(r));
  let status = `committed on branch ${branch}`;
  if (push) {
    try {
      git(root, "push", "-u", "origin", branch);
      execFileSync("gh", ["pr", "create", "--title", "إصلاحات إتاحة (Mada Fixer)", "--body-file", bodyFile], { cwd: root, encoding: "utf8" });
      status = "PR opened";
    } catch (e) {
      status += `; push/PR not done (${String(e).split("\n")[0].slice(0, 100)}). Run: git push -u origin ${branch} && gh pr create --body-file "${bodyFile}"`;
    }
  }
  return { branch, bodyFile, status };
}
