import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Fix } from "./types.js";

type Rep = { url: string; targetedBefore: number; targetedAfter: number; unnamedBefore: number; unnamedAfter: number; layoutShift: number; fixes: Fix[]; needsHuman?: { id: string; count: number; help?: string }[]; patch?: { diffFile: string } };
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function prBody(r: Rep): string {
  const row = (f: Fix) => `| ${f.issueId} | \`${cell(f.attr)}="${cell(f.value)}"\` | ${Math.round(f.confidence * 100)}% |`;
  const applied = r.fixes.filter((f) => f.status === "applied"), review = r.fixes.filter((f) => f.status === "review");
  return `## إصلاحات إتاحة تلقائية (Mada Fixer)

| | قبل | بعد |
|---|---|---|
| مشاكل WCAG المستهدفة | ${r.targetedBefore} | ${r.targetedAfter} |
| عناصر من غير اسم لقارئ الشاشة | ${r.unnamedBefore} | ${r.unnamedAfter} |
| عناصر اتحرّكت من مكانها | | ${r.layoutShift} |

### التعديلات
| المشكلة | التعديل | الثقة |
|---|---|---|
${applied.map(row).join("\n")}
${review.length ? `\n### محتاجة مراجعة بشرية (ماتطبّقتش)\n| المشكلة | الاقتراح | الثقة |\n|---|---|---|\n${review.map(row).join("\n")}\n` : ""}
${r.needsHuman?.length ? `### لسه محتاج شغل بشري\n${r.needsHuman.map((n) => `- \`${n.id}\` (${n.count}): ${n.help ?? ""}`).join("\n")}\n\n` : ""}الأوصاف اتولّدت بنموذج ذكاء اصطناعي، فراجعها قبل الدمج.
`;
}

// Branch + commit the generated diff in the user's own repo; optionally push and open a PR with the GitHub CLI.
export async function commitAndPr(repoDir: string, outDir: string, r: Rep, push: boolean) {
  if (!r.patch) throw new Error("no patch to commit");
  const root = resolve(repoDir);
  git(root, "rev-parse", "--is-inside-work-tree");
  if (git(root, "status", "--porcelain", "--", ".")) throw new Error("repo has uncommitted changes: commit or stash them first");
  const prefix = git(root, "rev-parse", "--show-prefix").replace(/\/$/, "");
  const branch = `mada-fixer/${new Date().toISOString().slice(0, 10)}-${Date.now() % 100000}`;
  git(root, "checkout", "-b", branch);
  git(root, "apply", "--whitespace=nowarn", ...(prefix ? [`--directory=${prefix}`] : []), resolve(r.patch.diffFile));
  git(root, "add", "-A", ".");
  git(root, "commit", "-m", "fix(a11y): add accessible names, page language and contrast fixes (Mada Fixer)");
  const bodyFile = resolve(join(outDir, "pr-body.md"));
  await writeFile(bodyFile, prBody(r));
  let status = `committed on branch ${branch}`;
  if (push) {
    try {
      git(root, "push", "-u", "origin", branch);
      execFileSync("gh", ["pr", "create", "--title", "إصلاحات إتاحة (Mada Fixer)", "--body-file", bodyFile], { cwd: root, encoding: "utf8" });
      status = "PR opened";
    } catch (e) {
      status += `; push/PR not done (${String(e).split("\n")[0].slice(0, 80)}). Run: git push -u origin ${branch} && gh pr create --body-file ${bodyFile}`;
    }
  }
  return { branch, bodyFile, status };
}
