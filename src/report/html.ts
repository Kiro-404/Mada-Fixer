import { writeFile } from "node:fs/promises";
import type { Fix } from "../types.js";

type R = { url: string; targetedBefore: number; targetedAfter: number; unnamedBefore: number; unnamedAfter: number; visualDiff: number; layoutShift: number; contrastApplied: number; samFound: number; beautify?: boolean; beautifyApplied?: number; textChanged?: number; fixes: Fix[]; needsHuman: { id: string; count: number; help?: string }[] };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const img = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
const LABEL = { applied: "اتطبّق", review: "مراجعة بشرية", failed: "فشل" } as const;

// One self-contained page for the demo: numbers, what a screen reader says before/after, and every fix with its confidence.
export async function writeHtmlReport(r: R, before: string, after: string, shotBefore: Buffer, shotAfter: Buffer, outDir: string) {
  const rows = r.fixes.map((f) => `<tr class="${f.status}"><td>${LABEL[f.status]}</td><td>${esc(f.issueId)}</td><td>${esc(f.attr)}="${esc(f.value)}"</td><td>${Math.round(f.confidence * 100)}%</td><td dir="ltr"><pre>${esc(f.diff ?? "")}</pre></td></tr>`).join("");
  const card = (t: string, a: number | string, b?: number | string) => `<div class="card"><small>${t}</small><b>${b === undefined ? a : `${a} <i>←</i> ${b}`}</b></div>`;
  await writeFile(`${outDir}/report.html`, `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mada Fixer</title>
<style>:root{color-scheme:light dark;--bg:#fff;--fg:#14202b;--mut:#5b6b7a;--line:#d9e0e6;--ok:#0a7a4b;--warn:#a15c00;--bad:#b3261e}
@media(prefers-color-scheme:dark){:root{--bg:#10171d;--fg:#e8eef3;--mut:#9aabb9;--line:#2a3640;--ok:#4cc38a;--warn:#e0a94a;--bad:#ff8a80}}
body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:24px;max-width:1100px;margin-inline:auto}
h1{margin:0 0 4px}.mut{color:var(--mut)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:20px 0}
.card{border:1px solid var(--line);border-radius:12px;padding:14px}.card small{display:block;color:var(--mut)}.card b{font-size:28px}.card i{color:var(--ok);font-style:normal}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}pre{white-space:pre-wrap;word-break:break-word;margin:0;font-size:12px}
.box{border:1px solid var(--line);border-radius:12px;padding:12px;overflow:auto}.box h3{margin:0 0 8px}img{max-width:100%;border-radius:8px;border:1px solid var(--line)}
table{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}td,th{border-bottom:1px solid var(--line);padding:8px;text-align:start;vertical-align:top}
th:nth-child(1),td:nth-child(1){width:100px}th:nth-child(2),td:nth-child(2){width:160px}th:nth-child(3),td:nth-child(3){width:230px}th:nth-child(4),td:nth-child(4){width:80px}
.applied td:first-child{color:var(--ok)}.review td:first-child{color:var(--warn)}.failed td:first-child{color:var(--bad)}.scroll{overflow-x:auto}
.badge{display:inline-block;border:1px solid var(--warn);color:var(--warn);border-radius:999px;padding:2px 10px;font-size:13px;vertical-align:middle}</style></head><body>
<h1>Mada Fixer${r.beautify ? ` <span class="badge">تحسين الشكل والنصوص</span>` : ""}</h1><div class="mut" dir="ltr">${esc(r.url)}</div>
<div class="cards">${card("مشاكل WCAG المستهدفة", r.targetedBefore, r.targetedAfter)}${card("عناصر من غير اسم لقارئ الشاشة", r.unnamedBefore, r.unnamedAfter)}${card("لقطها SAM (axe ماشافهاش)", r.samFound)}${r.beautify ? card("تحسينات شكل/نص مقصودة", r.beautifyApplied ?? 0) : ""}${card("بكسلات اتغيّرت", (r.visualDiff * 100).toFixed(2) + "%")}${card(r.beautify ? "عناصر اتحرّكت (تغيير مقصود)" : "عناصر اتحرّكت من مكانها", r.layoutShift)}</div>
<h2>قارئ الشاشة بيقول إيه</h2><div class="cols"><div class="box"><h3>قبل</h3><pre dir="auto">${esc(before)}</pre></div><div class="box"><h3>بعد</h3><pre dir="auto">${esc(after)}</pre></div></div>
<h2>الصفحة</h2><div class="cols"><div class="box"><h3>قبل</h3><img alt="لقطة الصفحة قبل الإصلاح" src="${img(shotBefore)}"></div><div class="box"><h3>بعد</h3><img alt="لقطة الصفحة بعد الإصلاح" src="${img(shotAfter)}"></div></div>
<h2>كل إصلاح وثقته</h2><div class="scroll"><table><tr><th>الحالة</th><th>المشكلة</th><th>التعديل</th><th>الثقة</th><th>الفرق</th></tr>${rows}</table></div>
${r.needsHuman.length ? `<h2>محتاج شغل بشري</h2><div class="scroll"><table><tr><th>القاعدة</th><th>العدد</th><th>الشرح</th></tr>${r.needsHuman.map((n) => `<tr><td dir="ltr">${esc(n.id)}</td><td>${n.count}</td><td dir="ltr">${esc(n.help ?? "")}</td></tr>`).join("")}</table></div>` : ""}
<p class="mut">أي تعديل ثقته أقل من الحد بيتحوّل للمراجعة البشرية ومش بيتطبّق تلقائياً.${r.beautify ? ` في وضع تحسين الشكل: ${r.beautifyApplied ?? 0} تغيير مرئي مقصود (${r.textChanged ?? 0} نص + ثيم تصميم)، وعشان كده نسبة تغيّر البكسلات/حركة العناصر مش صفر — ده هو المطلوب في الوضع ده.` : ""}</p></body></html>`);
}
