import { writeFile } from "node:fs/promises";
import type { Fix, PatchResult } from "../types.js";

type R = {
  url: string; audit?: boolean; attempts?: number; warnings?: string[]; finishedAt?: string;
  targetedBefore: number; targetedAfter: number; unnamedBefore: number; unnamedAfter: number;
  visualDiff: number; visualVerified?: boolean; layoutShift: number; contrastApplied: number; samFound: number;
  fixes: Fix[]; needsHuman: { id: string; count: number; help?: string }[];
  patch?: PatchResult; usage?: { calls: number; cached: number; sam: number; costUsd: number };
};
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const img = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
const LABEL = { applied: "اتطبّق", review: "مراجعة بشرية", failed: "فشل" } as const;
const short = (s: unknown, n = 160) => { const t = String(s ?? ""); return t.length > n ? t.slice(0, n) + "…" : t; };
const edit = (f: Fix) => `${f.op && f.op !== "attr" ? f.op + " " : ""}${f.attr}="${short(f.value)}"`;

// One self-contained page for the demo: numbers, what a screen reader says before/after, and every fix with its confidence.
export async function writeHtmlReport(r: R, before: string, after: string, shotBefore: Buffer, shotAfter: Buffer, outDir: string) {
  const rows = r.fixes.map((f) => `<tr class="${f.status}"><td>${LABEL[f.status]}</td><td dir="ltr">${esc(f.issueId)}</td><td dir="ltr">${esc(edit(f))}</td><td>${Math.round((Number.isFinite(f.confidence) ? f.confidence : 0) * 100)}%</td><td dir="ltr"><pre>${esc(short(f.diff ?? "", 300))}</pre></td></tr>`).join("");
  const card = (t: string, a: number | string, b?: number | string) => `<div class="card"><small>${t}</small><b>${b === undefined ? a : `${a} <i>←</i> ${b}`}</b></div>`;
  const patch = r.patch;
  const pFiles = patch?.files ?? [], pUnmapped = patch?.unmapped ?? [];
  const patchBox = patch ? `<h2>تعديل الكود المصدري</h2>
<p class="mut">${patch.edits} تعديل في ${pFiles.length} ملف، من أصل ${patch.requested} إصلاح. الـ diff: <span dir="ltr">${esc(patch.diffFile)}</span></p>
${pFiles.length ? `<ul dir="ltr">${pFiles.map((f) => `<li><code>${esc(f)}</code></li>`).join("")}</ul>` : `<p>مفيش ملفات اتغيّرت.</p>`}
${pUnmapped.length ? `<h3>إصلاحات اتطبّقت على الصفحة بس مالقيتش لها مكان في الكود</h3><div class="scroll"><table><tr><th>الإصلاح</th><th>السبب</th></tr>${pUnmapped.map((u) => `<tr><td dir="ltr"><code>${esc(short(u.fix))}</code></td><td dir="ltr">${esc(u.reason)}</td></tr>`).join("")}</table></div>` : ""}` : "";
  await writeFile(`${outDir}/report.html`, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mada Fixer</title>
<style>:root{color-scheme:light dark;--bg:#fff;--fg:#14202b;--mut:#5b6b7a;--line:#d9e0e6;--ok:#0a7a4b;--warn:#a15c00;--bad:#b3261e}
@media(prefers-color-scheme:dark){:root{--bg:#10171d;--fg:#e8eef3;--mut:#9aabb9;--line:#2a3640;--ok:#4cc38a;--warn:#e0a94a;--bad:#ff8a80}}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:24px;max-width:1100px;margin-inline:auto}
h1{margin:0 0 4px}.mut{color:var(--mut)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:20px 0}
.card{border:1px solid var(--line);border-radius:12px;padding:14px}.card small{display:block;color:var(--mut)}.card b{font-size:28px}.card i{color:var(--ok);font-style:normal}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}pre{white-space:pre-wrap;word-break:break-word;margin:0;font-size:12px}
.box{border:1px solid var(--line);border-radius:12px;padding:12px;overflow:auto}.box h3{margin:0 0 8px}img{max-width:100%;border-radius:8px;border:1px solid var(--line)}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid var(--line);padding:8px;text-align:start;vertical-align:top}
.applied td:first-child{color:var(--ok)}.review td:first-child{color:var(--warn)}.failed td:first-child{color:var(--bad)}.scroll{overflow-x:auto}
.badge{display:inline-block;border:1px solid var(--warn);color:var(--warn);border-radius:999px;padding:2px 10px;font-size:13px;margin-inline-start:8px}
ul.warn{margin:8px 0;padding-inline-start:20px}ul.warn li{margin:2px 0}</style></head><body>
<h1>Mada Fixer${r.audit ? `<span class="badge">قياس فقط — من غير موديلات</span>` : ""}</h1><div class="mut" dir="ltr">${esc(r.url)}</div>
<div class="cards">${card("مشاكل WCAG المستهدفة", r.targetedBefore, r.targetedAfter)}${card("عناصر من غير اسم لقارئ الشاشة", r.unnamedBefore, r.unnamedAfter)}${card("لقطها SAM (axe ماشافهاش)", r.samFound)}${card("بكسلات اتغيّرت", r.visualVerified === false ? "مقارنة الشكل غير متاحة" : (r.visualDiff * 100).toFixed(2) + "%")}${card("عناصر اتحرّكت من مكانها", r.layoutShift)}</div>
<h2>قارئ الشاشة بيقول إيه</h2><div class="cols"><div class="box"><h3>قبل</h3><pre dir="auto">${esc(before)}</pre></div><div class="box"><h3>بعد</h3><pre dir="auto">${esc(after)}</pre></div></div>
<h2>الصفحة</h2><div class="cols"><div class="box"><h3>قبل</h3><img alt="لقطة الصفحة قبل الإصلاح" src="${img(shotBefore)}"></div><div class="box"><h3>بعد</h3><img alt="لقطة الصفحة بعد الإصلاح" src="${img(shotAfter)}"></div></div>
<h2>كل إصلاح وثقته</h2><div class="scroll"><table><tr><th>الحالة</th><th>المشكلة</th><th>التعديل</th><th>الثقة</th><th>الفرق</th></tr>${rows || `<tr><td colspan="5">مفيش إصلاحات في التشغيل ده.</td></tr>`}</table></div>
${patchBox}
${r.warnings?.length ? `<h2>ملاحظات التشغيل</h2><ul class="warn" dir="auto">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
${r.needsHuman.length ? `<h2>محتاج شغل بشري</h2><div class="scroll"><table><tr><th>القاعدة</th><th>العدد</th><th>الشرح</th></tr>${r.needsHuman.map((n) => `<tr><td dir="ltr">${esc(n.id)}</td><td>${n.count}</td><td dir="ltr">${esc(n.help ?? "")}</td></tr>`).join("")}</table></div>` : ""}
<p class="mut">أي تعديل ثقته أقل من الحد بيتحوّل للمراجعة البشرية ومش بيتطبّق تلقائياً.${r.usage ? ` استهلاك الموديلات: ${r.usage.calls} نداء (+${r.usage.cached} من الكاش)، ${r.usage.sam} صورة SAM، حوالي $${r.usage.costUsd}.` : ""}${r.finishedAt ? ` اتولّد في ${esc(r.finishedAt.slice(0, 19).replace("T", " "))} UTC.` : ""}</p></body></html>`);
}
