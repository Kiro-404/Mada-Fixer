import "./src/env.js";
import { join } from "node:path";
import { run } from "./src/orchestrator.js";
import { commitAndPr } from "./src/pr.js";
import { apiKey } from "./src/models/meta.js";

const USAGE = `Mada Fixer — إصلاح إتاحة المواقع العربية بالذكاء الاصطناعي

الاستخدام:
  npm run fix -- <url> [خيارات]

  <url>            رابط http(s):// أو file:// (ملف HTML)
  --repo <dir>     يحفظ التعديلات في نسخة من كود الموقع ويطلّع fixes.diff
  --out <dir>      مكان التقارير (افتراضي: out)
  --audit          قياس فقط: من غير موديلات ومن غير أي تعديل (مش محتاج API key)
  --pr             بعد --repo: يعمل branch وcommit و(push + PR لو gh متاح)
  --timeout <sec>  أقصى وقت لتحميل الصفحة بالثواني (افتراضي 45)
  --help           الشاشة دي

أمثلة:
  npm run fix -- https://example.com
  npm run fix -- https://example.com --audit
  npm run fix -- file:///path/to/site/index.html --repo /path/to/site --pr

ملاحظات:
  - المفاتيح بتتقرأ من .env (MODEL_API_KEY) أو من البيئة.
  - --pr بيشتغل على repo إنت مالكه بس؛ راجع الـ diff قبل الدمج.
`;

type Args = { url?: string; repo?: string; out: string; audit: boolean; pr: boolean; timeoutMs?: number; help: boolean };

function parse(argv: string[]): Args {
  const a: Args = { out: "out", audit: false, pr: false, help: false };
  const value = (i: number, name: string) => {
    const v = argv[i];
    if (!v || v.startsWith("--")) throw new Error(`${name} محتاج قيمة`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    if (name === "--help" || name === "-h") a.help = true;
    else if (name === "--audit") a.audit = true;
    else if (name === "--pr") a.pr = true;
    else if (name === "--repo" || name === "--out" || name === "--timeout") {
      const v = eq > 0 ? arg.slice(eq + 1) : value(++i, name);
      if (name === "--repo") a.repo = v;
      else if (name === "--out") a.out = v;
      else {
        const sec = Number(v);
        if (!Number.isFinite(sec) || sec <= 0) throw new Error("--timeout لازم يكون رقم بالثواني أكبر من صفر");
        a.timeoutMs = Math.round(sec * 1000);
      }
    } else if (arg.startsWith("-")) throw new Error(`خيار غير معروف: ${arg}`);
    else if (a.url) throw new Error(`رابط زيادة: ${arg}`);
    else a.url = arg;
  }
  return a;
}

async function main() {
  const args = parse(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return; }
  if (!args.url) { console.error(USAGE); process.exitCode = 1; return; }
  if (!/^(https?|file):\/\//i.test(args.url)) throw new Error("الرابط لازم يبدأ بـ http(s):// أو file://");
  if (args.pr && !args.repo) throw new Error("--pr محتاج --repo <dir>");
  if (args.pr && args.audit) throw new Error("--audit بيقيس بس ومش بيغيّر حاجة، فمينفعش مع --pr");
  if (!args.audit && !apiKey()) throw new Error("MODEL_API_KEY مش موجود: انسخ .env.example إلى .env وحط المفتاح، أو شغّل --audit للقياس فقط");

  const report = await run(args.url, { outDir: args.out, repoDir: args.repo, audit: args.audit, timeoutMs: args.timeoutMs });
  const n = (s: string) => report.fixes.filter((f) => f.status === s).length;
  console.log(`${report.url}${report.audit ? "  [audit: بدون موديلات]" : ""}
WCAG violations (all): ${report.before} -> ${report.after}
targeted classes: ${report.targetedBefore} -> ${report.targetedAfter} | applied ${n("applied")}, needs review ${n("review")}, failed ${n("failed")}
found by SAM (not caught by axe): ${report.samFound}
screen reader, unnamed elements: ${report.unnamedBefore} -> ${report.unnamedAfter}
elements that moved: ${report.layoutShift} | pixels changed: ${(report.visualDiff * 100).toFixed(3)}%${report.contrastApplied ? ` (${report.contrastApplied} contrast fixes change color on purpose)` : ""}`);
  if (report.patch) {
    const p = report.patch;
    console.log(`source patch: ${p.edits} edits in ${p.files.length} file(s) for ${p.requested} fixes, ${p.failed} unmapped -> ${p.diffFile}`);
    if (p.unmapped.length) console.log(`  unmapped: ${p.unmapped.slice(0, 5).map((u) => `${u.fix} (${u.reason})`).join("; ")}${p.unmapped.length > 5 ? ` … +${p.unmapped.length - 5}` : ""}`);
  }
  for (const w of report.warnings) console.warn(`warning: ${w}`);
  console.log(`model usage: ${report.usage.calls} calls (+${report.usage.cached} cached), ${report.usage.sam} SAM images, about $${report.usage.costUsd}
report: ${join(args.out, "report.html")} (open it in a browser) + report.json`);

  if (args.pr && args.repo) {
    console.log("git:", report.patch?.edits ? (await commitAndPr(args.repo, args.out, report, true)).status : "nothing to commit (no source edits)");
  }
  if (!report.audit && !report.visualVerified) {
    console.warn("warning: the screenshot comparison was limited; check the report before merging");
  } else if (report.layoutShift > 0 || (report.visualDiff > 0.001 && !report.contrastApplied)) {
    console.error("WARNING: fixes changed the page's appearance");
    process.exitCode = 2;
  }
}

try {
  await main();
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  if (process.env.DEBUG) console.error(e);
  process.exitCode = 1;
}
