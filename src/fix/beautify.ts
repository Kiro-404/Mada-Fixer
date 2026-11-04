import type { Page } from "playwright";
import { askJson } from "../models/meta.js";
import type { Fix } from "../types.js";

// Visible redesign: an intentional, accessible theme plus clearer Arabic copy for headings, leads and CTAs.
// This is opt-in (BEAUTIFY=1 / --beautify / the UI checkbox) because it changes the page on purpose.
export const MIN_COPY_CONF = Number(process.env.BEAUTIFY_MIN_CONFIDENCE ?? 0.6);
const DEBUG = process.env.BEAUTIFY_DEBUG === "1";

const THEME = `
:root{--mada-ink:#0f172a;--mada-muted:#475569;--mada-bg:#f8fafc;--mada-card:#fff;--mada-line:#e2e8f0;--mada-radius:18px;--mada-shadow:0 10px 30px rgba(15,23,42,.08)}
html{scroll-behavior:smooth}
body{background:radial-gradient(1200px 600px at 100% -10%,rgba(14,165,233,.16),transparent 60%),radial-gradient(900px 500px at -10% 10%,rgba(15,118,110,.12),transparent 55%),var(--mada-bg)!important;color:var(--mada-ink)!important;font-family:"Segoe UI",Tahoma,"Noto Kufi Arabic","Cairo",system-ui,sans-serif!important;line-height:1.75!important;letter-spacing:.1px}
header,nav{position:sticky;top:0;z-index:50;background:linear-gradient(120deg,#0b132b,#123c69 55%,#0f766e)!important;color:#fff!important;box-shadow:0 8px 24px rgba(2,6,23,.18)!important;border-bottom:1px solid rgba(255,255,255,.12)!important;padding-block:14px!important}
header a,nav a{color:#fff!important}header h1,nav h1{font-weight:800;letter-spacing:-.5px}
:is(h1,h2,h3){line-height:1.3;letter-spacing:-.3px;font-weight:800}
h1{font-size:clamp(1.8rem,4vw,2.7rem)}h2{font-size:clamp(1.5rem,3vw,2.2rem)}h3{font-size:clamp(1.1rem,2vw,1.35rem)}
p{color:var(--mada-muted)}
:is(.hero,[class*="hero"]):not(img):not(svg):not(picture){background:linear-gradient(135deg,#0b132b 0%,#143d73 55%,#0f766e 100%)!important;color:#fff!important;border-radius:0 0 32px 32px;padding:clamp(42px,7vw,84px) 24px!important;position:relative;overflow:hidden;box-shadow:inset 0 -1px 0 rgba(255,255,255,.08)}
:is(.hero,[class*="hero"]:not(img)) :is(h1,h2,h3){color:#fff!important}
:is(.hero,[class*="hero"]:not(img)) p{color:#dbeafe!important;font-size:clamp(1rem,2vw,1.2rem)!important;max-width:62ch;margin-inline:auto}
.card,[class*="card"]{background:var(--mada-card)!important;border:1px solid var(--mada-line)!important;border-radius:var(--mada-radius)!important;box-shadow:var(--mada-shadow)!important;overflow:hidden;transition:transform .25s ease,box-shadow .25s ease}
.card:hover,[class*="card"]:hover{transform:translateY(-6px);box-shadow:0 18px 40px rgba(15,23,42,.14)}
.card img,[class*="card"] img{aspect-ratio:16/9;object-fit:cover;border-radius:calc(var(--mada-radius) - 6px)!important;width:100%}
button,.add-to-cart,[class*="btn"],[class*="button"],[role="button"]{background:linear-gradient(135deg,#0f766e,#0ea5e9)!important;color:#fff!important;border:none!important;border-radius:999px!important;padding:12px 22px!important;font-weight:700!important;box-shadow:0 8px 18px rgba(14,165,233,.25)!important;transition:transform .2s ease,filter .2s ease;cursor:pointer}
button:hover,.add-to-cart:hover,[role="button"]:hover{transform:translateY(-2px);filter:brightness(1.06)}
header button,nav button{background:rgba(255,255,255,.12)!important;border:1px solid rgba(255,255,255,.25)!important;box-shadow:none!important;padding:8px 12px!important;border-radius:12px!important}
footer{background:#0b132b!important;color:#cbd5e1!important;padding:28px 20px!important;margin-top:40px}
a{color:#0e7490}
:focus-visible{outline:3px solid #f59e0b!important;outline-offset:3px!important}
img{max-width:100%}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`.trim();

type Target = { selector: string; html: string; text: string; tag: string; where: string };

const COPY = `إنت كاتب محتوى عربي ومصمم تجربة مستخدم. حسّن النص الظاهر في العنصر ده عشان يبقى أوضح وأجمل وأسهل في القراءة، من غير ما تغيّر المعنى.
قواعد صارمة:
- حسّن الصياغة دايماً لو ينفع، متسيبش النص زي ما هو إلا لو مفيش تحسين آمن.
- حافظ على كل رقم أو سعر أو نسبة زي ما هو بالظبط.
- ممنوع تضيف معلومات جديدة أو مواصفات أو وعود غير موجودة.
- عربي فصيح بسيط، مناسب لواجهة موقع، من غير مبالغة.
- الطول من 2 إلى 140 حرف، وبحد أقصى ضعف النص الأصلي.
- متحطش علامات اقتباس ولا شرح ولا HTML.
أمثلة آمنة: "أضف للسلة" -> "أضف إلى السلة" | "السعر: ٢٤٩٩ جنيه" -> "٢٤٩٩ جنيه فقط" | "سعر خاص لفترة محدودة" -> "سعر خاص لفترة محدودة فقط"
رجّع JSON بس: {"text":"...","confidence":0.0}`;

async function collect(page: Page): Promise<Target[]> {
  return page.evaluate(() => {
    const out: { selector: string; html: string; text: string; tag: string; where: string }[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.1;
    };
    const where = (el: Element) =>
      el.closest("nav,header") ? "header"
      : el.closest("[class*='hero'],.hero") ? "hero"
      : el.closest("[class*='card'],.card") ? "card" : "page";
    for (const el of Array.from(document.querySelectorAll("h1,h2,h3,p,button,a,[role='button']"))) {
      if (el.childElementCount > 0) continue; // leaf text only: never destroy icons or nested links
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
      if (text.length < 6 || text.length > 140 || !visible(el)) continue;
      const loc = where(el);
      if (loc === "header") continue; // keep the brand and nav wording
      const tag = el.tagName.toLowerCase();
      if (tag === "a" && !el.closest("[class*='card'],.card,[class*='hero'],.hero") && el.getAttribute("role") !== "button") continue;
      if (loc === "page" && tag === "p") continue;
      if ((tag === "button" || tag === "a") && text.length > 40) continue;
      const id = `copy${out.length}`;
      el.setAttribute("data-mada", id);
      out.push({ selector: `[data-mada="${id}"]`, html: el.outerHTML, text, tag, where: loc });
      if (out.length >= 12) break;
    }
    return out;
  });
}

export async function beautifyOps(page: Page): Promise<Omit<Fix, "status">[]> {
  const out: Omit<Fix, "status">[] = [];
  out.push({ issueId: "visual-polish", selector: "head", attr: "css", op: "css", value: THEME, confidence: 0.95, html: "<head>" });
  const title = await page.title().catch(() => "");
  for (const t of await collect(page)) {
    try {
      const r = await askJson<{ text: string; confidence: number }>(COPY, `الصفحة: ${title}\nالموضع: ${t.where}\nالوسم: ${t.tag}\nالنص الحالي: ${t.text}`);
      const next = typeof r.text === "string" ? r.text.trim().replace(/\s+/g, " ") : "";
      const conf = typeof r.confidence === "number" && Number.isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0;
      // Compare numeric tokens after normalizing Arabic-Indic digits, so wording can change but values cannot.
      const nums = (s: string) => (s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).match(/\d+(?:[.,]\d+)?/g) ?? []).join("|");
      const tooLong = next.length > 160 || next.length > Math.max(40, t.text.length * 2);
      const valid = next.length >= 2 && !tooLong && !/[<>]/.test(next) && !next.includes("```") && nums(next) === nums(t.text) && conf >= MIN_COPY_CONF;
      if (DEBUG) console.error(`[copy] ${t.selector} conf=${conf.toFixed(2)} ${valid ? (next === t.text ? "same" : "ok") : tooLong ? "too-long" : nums(next) !== nums(t.text) ? "numbers" : "invalid"}\n  old: ${t.text}\n  new: ${next}`);
      if (!valid || next === t.text) continue;
      out.push({ issueId: "copy-polish", selector: t.selector, attr: "text", op: "text", value: next, confidence: conf, html: t.html });
    } catch (e) {
      console.error(`copy skip ${t.selector}: ${String(e).slice(0, 80)}`);
    }
  }
  return out;
}
