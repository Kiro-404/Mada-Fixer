import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createTwoFilesPatch } from "diff";
import { askJson, WONDER } from "../models/meta.js";
import { envNum } from "../util.js";
import type { Fix, PatchResult } from "../types.js";

type Edit = { file?: unknown; find?: unknown; replace?: unknown; fixes?: unknown; fix?: unknown };
const EXT = /\.(html?|jsx|tsx|vue|svelte)$/;
const SKIP = new Set(["node_modules", ".git", ".cache", "dist", "build", ".next", ".nuxt", "coverage", "vendor"]);
const toPosix = (p: string) => p.split(sep).join("/");
const asId = (v: unknown) => (typeof v === "string" ? v : "");

const SYS = `You edit web source files to fix accessibility issues. You receive the site's source files, a "target" page (the page the fixes were measured on) and a list of fixes measured on that page.

Fix kinds:
- "attr" (default): set attribute "attr" to "value" on the element whose rendered opening tag is "html", plus optional more attributes in "also" (a list of [name, value]).
- "style": value is a CSS declaration; append it to that element's inline style so it wins over earlier declarations.
- "title": make the page <title> equal to "value" (add a <title> inside <head> if missing).
- "css": add the CSS text "value" once (a <style data-mada-css> at the end of <head> is fine).
- "html": insert the markup "value" once right after the opening <body> tag, keeping its attributes exactly.

Grouping: "elements" lists one entry per rendered element; each entry has several "changes" that must all be applied to that same element in one edit. "pageOps" are page-level fixes.

Return JSON only:
{"edits":[{"file":"<path exactly as given>","find":"<exact substring of the file, appearing exactly once, as short as possible>","replace":"<the same substring with the fix applied>","fixes":["<change ids this edit resolves>"]}],
 "unmapped":[{"fix":"<change id>","reason":"<why it cannot be mapped to the source>"}]}

Rules:
- Make the smallest possible change. Never change appearance or behavior. Keep Arabic text exactly as given.
- One edit may resolve several changes on the same opening tag; list every id it resolves.
- The fixes were measured on "target": edit that file. Edit another file only when the target clearly includes the element from a template/partial; never change unrelated pages.
- Never create or delete files, and never edit a file that is not listed.
- The rendered HTML may differ slightly from the source (attribute order, an added style="", entities): locate the element in the source yourself.
- Do not repeat a fix that is already present in the source. If "previousFailures" lists ids, those edits did not match: fix them or report them in "unmapped".
`;

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(d.name)) continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...(await walk(p))); else if (EXT.test(d.name)) out.push(p);
  }
  return out;
}

const rank = (path: string, target: string): number => {
  let s = 0;
  if (target && path === target) s += 1000;
  else if (target && path.slice(0, path.lastIndexOf("/")) === target.slice(0, target.lastIndexOf("/"))) s += 200;
  if (/(^|\/)(index|home|main|page)\.[a-z]+$/i.test(path)) s += 100;
  s -= path.split("/").length * 5;
  return s;
};

const inRepo = (repo: string, p: string) => {
  const r = relative(repo, p);
  return r === "" || (!r.startsWith(".." + sep) && r !== ".." && !isAbsolute(r));
};

// Muse Wonder (long-horizon coding model) maps DOM fixes back to source. Edits are exact-string replacements that must
// match once; only unresolved fixes are retried, and the unified diff is produced deterministically with POSIX paths.
export async function patchRepo(repoDir: string, outDir: string, fixes: Fix[], opts: { targetPath?: string } = {}): Promise<PatchResult> {
  const dir = join(outDir, "repo-patched");
  if (inRepo(resolve(repoDir), resolve(dir))) throw new Error("--out must be outside the repository (the patched copy is written there)");

  const target = opts.targetPath ? toPosix(opts.targetPath).replace(/^\.\//, "") : "";
  const warnings: string[] = [], unmapped = new Map<string, { id: string; fix: string; reason: string }>();
  const describe = (fix: Fix) => `${fix.op && fix.op !== "attr" ? fix.op + " " : ""}${fix.attr}=${String(fix.value).slice(0, 120)}`;
  const result = (extra: Partial<PatchResult>): PatchResult => ({
    dir, diffFile: join(outDir, "fixes.diff"), files: [], requested: fixes.length, edits: 0,
    failed: unmapped.size, unmapped: [...unmapped.values()], skippedFiles: [], warnings, ...extra,
  });
  if (!fixes.length) { warnings.push("no applied fixes to map to source"); return result({}); }

  await mkdir(outDir, { recursive: true });
  await rm(dir, { recursive: true, force: true });
  let envSkipped = 0;
  await cp(repoDir, dir, {
    recursive: true,
    filter: (src) => {
      const abs = resolve(src);
      if (abs === resolve(dir) || abs.startsWith(resolve(dir) + sep)) return false;
      const name = basename(src);
      if (SKIP.has(name)) return false;
      if (/^\.env(\.|$)/.test(name) && !/\.example$/.test(name)) { envSkipped++; return false; }
      return true;
    },
  });
  if (envSkipped) warnings.push(`skipped ${envSkipped} .env file(s) when copying the source (never written to the output)`);

  const skippedFiles: string[] = [], candidates: { path: string; abs: string; size: number }[] = [];
  const maxChars = envNum("PATCH_MAX_FILE_CHARS", 60_000, 2_000, 2_000_000);
  for (const abs of await walk(dir)) {
    const path = toPosix(relative(dir, abs));
    const size = (await stat(abs)).size;
    if (size > maxChars) { skippedFiles.push(path); continue; } // a truncated file would break exact-match edits
    candidates.push({ path, abs, size });
  }
  candidates.sort((a, b) => rank(b.path, target) - rank(a.path, target));

  const budget = envNum("PATCH_MAX_PAYLOAD_CHARS", 150_000, 10_000, 2_000_000);
  const maxFiles = envNum("PATCH_MAX_FILES", 20, 1, 200);
  const orig = new Map<string, string>();
  let used = 0;
  for (const c of candidates) {
    if (orig.size >= maxFiles) break;
    if (orig.size && used + c.size > budget) continue;
    orig.set(c.path, await readFile(c.abs, "utf8"));
    used += c.size;
  }
  if (target && !orig.has(target)) warnings.push(`the measured page (${target}) is not among the source files sent to the model`);
  if (candidates.length > orig.size) warnings.push(`sent ${orig.size} of ${candidates.length} source files to the model (PATCH_MAX_FILES / PATCH_MAX_PAYLOAD_CHARS)`);
  if (skippedFiles.length) warnings.push(`skipped ${skippedFiles.length} file(s) larger than PATCH_MAX_FILE_CHARS`);

  // One entry per fix, with a stable id used to track coverage across repair rounds.
  const entries = fixes.map((f, i) => ({ id: `f${i}`, fix: f }));
  const groups = new Map<string, { html?: string; selector: string; text?: string; changes: unknown[] }>();
  const pageOps: unknown[] = [];
  for (const { id, fix } of entries) {
    const op = fix.op ?? "attr";
    if (op === "title" || op === "css" || op === "html") {
      pageOps.push({ id, op, tag: fix.html, value: fix.value });
      continue;
    }
    const key = fix.html || fix.selector;
    let g = groups.get(key);
    if (!g) { g = { html: fix.html, selector: fix.selector, text: fix.text, changes: [] }; groups.set(key, g); }
    g.changes.push({ id, attr: fix.attr, value: fix.value, also: fix.extra });
  }

  const entryById = new Map(entries.map((e) => [e.id, e]));
  const cur = new Map(orig), pending = new Set(entries.map((e) => e.id));
  const lastReason = new Map<string, string>();
  let previousFailures: string[] = [], edits = 0, warned = 0;
  const rounds = envNum("PATCH_ROUNDS", 2, 1, 3);

  for (let round = 0; round < rounds && pending.size; round++) {
    const elementPayload = [...groups.values()]
      .map((g) => ({ ...g, changes: g.changes.filter((c) => pending.has((c as { id: string }).id)) }))
      .filter((g) => g.changes.length);
    const pagePayload = pageOps.filter((p) => pending.has((p as { id: string }).id));
    const payload = {
      target: target || undefined,
      files: [...cur].map(([path, content]) => ({ path, content })),
      elements: elementPayload,
      pageOps: pagePayload,
      previousFailures: previousFailures.length ? previousFailures : undefined,
    };
    let r: { edits?: Edit[]; unmapped?: { fix?: unknown; reason?: unknown }[] };
    try {
      r = await askJson(SYS, JSON.stringify(payload), undefined, WONDER);
    } catch (e) {
      warnings.push(`source patch model failed: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
    const list = Array.isArray(r?.edits) ? r.edits : [];
    if (!Array.isArray(r?.edits)) warnings.push("model returned no edit list");
    let progress = 0;
    const roundFailed: string[] = [];

    for (const e of [...list].sort((a, b) => String(b?.find ?? "").length - String(a?.find ?? "").length)) {
      const ids = (Array.isArray(e?.fixes) ? e.fixes : e?.fix !== undefined ? [e.fix] : []).map(asId).filter((id) => pending.has(id));
      const file = asId(e?.file).replace(/\\/g, "/").replace(/^\.\//, "");
      const find = asId(e?.find), replace = asId(e?.replace);
      const src = cur.get(file);
      const bad = (reason: string) => {
        if (warned++ < 12) warnings.push(`${file || "?"}: ${reason}`);
        for (const id of ids) { lastReason.set(id, reason); roundFailed.push(`${id} (${reason})`); }
      };
      if (!file || file.startsWith("/") || file.split("/").includes("..")) { bad("edit targets a file outside the sent sources"); continue; }
      if (src === undefined) { bad("edit targets a file that was not sent"); continue; }
      if (!find || !replace) { bad("edit has an empty find/replace"); continue; }
      if (find === replace) { bad("edit does not change anything"); continue; }
      const at = src.indexOf(find);
      if (at < 0) { bad("find text not found"); continue; }
      if (src.indexOf(find, at + 1) >= 0) { bad("find text is not unique"); continue; }
      cur.set(file, src.slice(0, at) + replace + src.slice(at + find.length));
      for (const id of ids) pending.delete(id);
      if (!ids.length) warnings.push(`${file}: an edit did not name the fixes it resolves`);
      edits++;
      progress++;
    }
    for (const u of Array.isArray(r?.unmapped) ? r.unmapped : []) {
      const id = asId(u?.fix), entry = entryById.get(id);
      if (!entry || !pending.has(id)) continue;
      const reason = asId(u?.reason) || "model reported it as unmappable";
      lastReason.set(id, reason);
      unmapped.set(id, { id, fix: describe(entry.fix), reason });
      pending.delete(id);
    }
    previousFailures = [...new Set(roundFailed)];
    if (!progress) break;
  }
  for (const id of pending) {
    const entry = entryById.get(id);
    if (entry) unmapped.set(id, { id, fix: describe(entry.fix), reason: lastReason.get(id) ?? "no matching source edit" });
  }

  const files: string[] = [];
  let diff = "";
  for (const [p, text] of cur) {
    const before = orig.get(p);
    if (before === undefined || text === before) continue;
    await writeFile(join(dir, sep === "/" ? p : p.split("/").join(sep)), text);
    files.push(p);
    const hunk = createTwoFilesPatch(`a/${p}`, `b/${p}`, before, text, "", "", { context: 3 }).replace(/^={3,}\n/, "");
    diff += `diff --git a/${p} b/${p}\n${hunk}`;
  }
  if (!edits) warnings.push("no source edits were produced; see docs for the fix list");
  const diffFile = join(outDir, "fixes.diff");
  await writeFile(diffFile, diff);
  return result({ files, edits, skippedFiles });
}
