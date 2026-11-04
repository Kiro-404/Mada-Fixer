import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { createTwoFilesPatch } from "diff";
import { askJson, WONDER } from "../models/meta.js";
import type { Fix } from "../types.js";

type Edit = { file: string; find: string; replace: string };
const EXT = /\.(html?|jsx|tsx|vue|svelte)$/;
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next"]);
const SYS = `You edit web source files to fix accessibility issues. You receive source files and a list of fixes. Each has an "op": "attr" (default) = set attribute "attr" to "value" on the element whose rendered HTML is given, plus optional more attributes in "also" (a list of [name, value]); "title" = make the page <title> equal to "value" (add a <title> inside <head> if missing); "css" = add the CSS text "value" to the site (a <style> element at the end of <head> is fine); "html" = insert the markup "value" right after the opening <body> tag, keeping its attributes exactly; "text" = replace the visible text of the element whose rendered HTML is given with "value". If the attribute is "style", the value is a CSS declaration: append it to the element's inline style attribute (or add a style attribute) so it wins over earlier declarations. Return JSON only: {"edits":[{"file":"<path exactly as given>","find":"<exact substring of the file, appearing exactly once, as short as possible>","replace":"<the same substring with the fix applied>"}]}. Make the smallest possible change. For "attr", "title" and "html" never change appearance or behavior; "css" and "text" are intentional visible design/copy changes. Keep Arabic text exactly as given except for "text". The rendered HTML may differ slightly from the source (attribute order, an added style="", entities): locate the element in the source yourself. If "previousFailures" is present, those edits did not match: fix them.`;

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(d.name)) continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...(await walk(p))); else if (EXT.test(d.name)) out.push(p);
  }
  return out;
}

// Muse Wonder (long-horizon coding model) maps DOM fixes back to source. Edits are exact-string replacements that must
// match once (a failed edit is sent back for one repair round), and the unified diff is produced deterministically.
export async function patchRepo(repoDir: string, outDir: string, fixes: Fix[]) {
  const dir = join(outDir, "repo-patched");
  if (resolve(dir).startsWith(resolve(repoDir))) throw new Error("outDir must be outside the repo");
  await cp(repoDir, dir, { recursive: true, filter: (s) => !SKIP.has(basename(s)) });
  const orig = new Map<string, string>();
  for (const f of (await walk(dir)).slice(0, 30)) orig.set(relative(dir, f), await readFile(f, "utf8"));
  const cur = new Map(orig);
  // Cost control: only send files that can contain the fixed elements (or the <head>/<body> for page-level fixes), capped by size.
  const MAX = Number(process.env.WONDER_MAX_CHARS ?? 60000);
  const pageOps = fixes.some((f) => f.op && f.op !== "attr");
  const relevant = (p: string) => {
    const c = orig.get(p)!;
    return fixes.some((f) => (f.html && c.includes(f.html.slice(0, 40))) || (pageOps && f.op && f.op !== "attr" && /<head|<body/i.test(c)));
  };
  const pick = (): string[] => {
    let total = 0;
    return [...orig.keys()].filter(relevant).filter((p) => (total += Math.min(orig.get(p)!.length, 20000)) <= MAX);
  };
  let edits = 0, failed: string[] = [], feedback = "";
  for (let round = 0; round < 2; round++) {
    const payload = {
      files: pick().map((path) => ({ path, content: cur.get(path)!.slice(0, 20000) })),
      fixes: fixes.map((f) => ({ op: f.op ?? "attr", el: f.selector, html: f.html, attr: f.attr, value: f.value, also: f.extra })),
      previousFailures: feedback || undefined,
    };
    const r = await askJson<{ edits: Edit[] }>(SYS, JSON.stringify(payload), undefined, WONDER);
    failed = [];
    for (const e of [...(r.edits ?? [])].sort((a, b) => String(b.find).length - String(a.find).length)) { // outer elements first, so nested edits still match
      const src = cur.get(e.file);
      if (src === undefined || !e.find || src.split(e.find).length !== 2) { failed.push(`${e.file}: ${String(e.find).slice(0, 80)}`); continue; }
      cur.set(e.file, src.replace(e.find, () => e.replace));
      edits++;
    }
    if (!failed.length) break;
    feedback = failed.join(" | ");
  }
  let diff = "";
  for (const [p, text] of cur) {
    if (text === orig.get(p)) continue;
    await writeFile(join(dir, p), text);
    diff += createTwoFilesPatch(`a/${p}`, `b/${p}`, orig.get(p)!, text, "", "", { context: 2 });
  }
  const diffFile = join(outDir, "fixes.diff");
  await writeFile(diffFile, diff);
  return { dir, diffFile, requested: fixes.length, edits, failed: failed.length };
}
