import { askJson, OPEN_MODEL, openRoute } from "../models/meta.js";
import { critique } from "./critic.js";
import { fixColor } from "../fix/contrast.js";
import type { El, Fix } from "../types.js";

const IMG = `إنت خبير إتاحة. شوف الصورة والسياق المحيط. اكتب alt text بالعربي الفصيح المبسّط، جملة واحدة، بتوصف الوظيفة مش الشكل بس. لو الصورة زخرفية خلّي decorative=true. رجّع JSON بس: {"alt":"...","decorative":false,"confidence":0.0}`;
const LBL = `العنصر ده من غير label واضح. بناءً على الـ HTML المحيط والنص حواليه، اقترح aria-label عربي قصير. لو مش متأكد رجّع confidence منخفض بدل ما تخمّن. رجّع JSON بس: {"label":"...","confidence":0.0}`;
const TITLE = `الصفحة دي من غير عنوان الصفحة <title>. من محتواها اقترح عنوان عربي قصير ومعبّر (لحد 60 حرف). رجّع JSON بس: {"title":"...","confidence":0.0}`;
// rule id -> attribute that carries the accessible name
const NAMED: Record<string, string> = {
  "button-name": "aria-label", "link-name": "aria-label", label: "aria-label", "select-name": "aria-label", "sam-visual": "aria-label",
  "symbol-only-name": "aria-label", "frame-title": "title", "svg-img-alt": "aria-label", "role-img-alt": "aria-label", "object-alt": "aria-label",
  "empty-heading": "aria-label", "aria-command-name": "aria-label", "aria-input-field-name": "aria-label", "aria-toggle-field-name": "aria-label",
  "aria-dialog-name": "aria-label", "input-image-alt": "alt", "area-alt": "alt",
};
const NATIVE = ["button", "a", "input", "select", "textarea"];
const KEY = "if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}"; // Enter/Space activate, like a real button
const tagOf = (h: string) => /^<(\w+)/.exec(h)?.[1]?.toLowerCase() ?? "";

// First draft: open-weights Muse model when configured (USE_OPEN=1), otherwise Muse Spark. The critic always runs on Muse Spark.
const gen = <T>(system: string, user: string, png?: Buffer) => { const o = openRoute(); return o ? askJson<T>(system, user, png, OPEN_MODEL, o) : askJson<T>(system, user, png); };

export async function understand(els: El[]): Promise<Omit<Fix, "status">[]> {
  const out: Omit<Fix, "status">[] = [];
  const name = async (e: El, base: { issueId: string; selector: string; html: string }, attr: string, ctx: string, extra?: [string, string][]) => {
    const r = await gen<{ label: string; confidence: number }>(LBL, ctx, e.shot);
    const c = await critique(e, attr, r.label, r.confidence);
    // A frame title is a pure accessible-name attribute (no visual or behavioral effect), so a hedge here is safe to apply.
    const conf = e.id === "frame-title" ? Math.max(c.confidence, 0.9) : c.confidence;
    out.push({ ...base, attr, value: c.value, confidence: conf, criticRounds: c.rounds, extra });
  };
  for (const e of els) {
    const ctx = `العنصر:\n${e.html}\n\nالسياق:\n${e.context}`;
    const base = { issueId: e.id, selector: e.selector, html: e.html };
    const tag = tagOf(e.html);
    try {
      if (e.id === "html-has-lang" || e.id === "html-lang-valid")
        out.push({ ...base, selector: "html", attr: "lang", value: "ar", confidence: 1 });
      else if (e.id === "meta-viewport") { // allow pinch-zoom (WCAG 1.4.4)
        const content = (/content="([^"]*)"/.exec(e.html)?.[1] ?? "width=device-width, initial-scale=1").split(",").map((s) => s.trim())
          .filter((s) => !/^user-scalable\s*=\s*(no|0)$/i.test(s) && !/^maximum-scale\s*=/i.test(s)).join(", ");
        out.push({ ...base, attr: "content", value: content, confidence: 1 });
      } else if (e.id === "document-title") {
        const r = await gen<{ title: string; confidence: number }>(TITLE, e.context);
        out.push({ ...base, selector: "head", attr: "title", op: "title", value: r.title, confidence: r.confidence });
      } else if (e.id === "color-contrast") {
        const d = e.data;
        const c = d?.fgColor && d?.bgColor ? fixColor(d.fgColor, d.bgColor, parseFloat(d.expectedContrastRatio) || 4.5) : null;
        if (c) out.push({ ...base, attr: "style", value: `color:${c}`, confidence: 1 });
      } else if (e.id === "custom-control") { // clickable div/span: make it a real keyboard-operable button
        const role = /role="(\w+)"/.exec(e.html)?.[1] ?? "button";
        out.push({ ...base, attr: "role", value: role, confidence: 0.9, extra: [["tabindex", "0"], ["onkeydown", KEY]] });
        if (!e.data?.named) await name(e, base, "aria-label", ctx);
      } else if (e.id === "image-alt" || (e.id === "sam-visual" && tag === "img")) {
        const r = await gen<{ alt: string; decorative: boolean; confidence: number }>(IMG, ctx, e.shot);
        if (r.decorative) out.push({ ...base, attr: "alt", value: "", confidence: r.confidence });
        else { const c = await critique(e, "alt", r.alt, r.confidence); out.push({ ...base, attr: "alt", value: c.value, confidence: c.confidence, criticRounds: c.rounds }); }
      } else if (NAMED[e.id]) {
        // Visual-only elements that are not native controls also need a role.
        const extra: [string, string][] | undefined = e.id === "sam-visual" && !NATIVE.includes(tag) ? [["role", "img"]] : undefined;
        await name(e, base, NAMED[e.id], ctx, extra);
      }
    } catch (err) { console.error(`skip ${e.selector}: ${String(err).slice(0, 80)}`); }
  }
  return out;
}
