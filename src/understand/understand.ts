import { askJson } from "../models/meta.js";
import { critique } from "./critic.js";
import { fixColor } from "../fix/contrast.js";
import type { El, Fix } from "../types.js";
import { asObject, confidence, labelMatchesVisible, text } from "../validate.js";
import { envNum, mapLimit } from "../util.js";

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
const CONCURRENCY = envNum("MODEL_CONCURRENCY", 4, 1, 12);

export async function understand(els: El[]): Promise<Omit<Fix, "status">[]> {
  let done = 0;
  const parts = await mapLimit(els, CONCURRENCY, async (e) => {
    const r = await understandOne(e);
    if (++done % 10 === 0 || done === els.length) console.error(`[mada] understood ${done}/${els.length} elements`);
    return r;
  });
  return parts.flat();
}

async function understandOne(e: El): Promise<Omit<Fix, "status">[]> {
  const out: Omit<Fix, "status">[] = [];
  const ctx = `العنصر:\n${e.html}\n\nالسياق:\n${e.context}`;
  const base = { issueId: e.id, selector: e.selector, html: e.html, context: e.context, text: e.text };
  const tag = tagOf(e.html);
  const invalid = (what: string) => console.error(`skip ${e.selector}: model returned no valid ${what}`);

  const name = async (attr: string, extra?: [string, string][]) => {
    const r = asObject(await askJson<Record<string, unknown>>(LBL, ctx, e.shot));
    const label = text(r.label, 160);
    if (!label) return invalid("label");
    let c = confidence(r.confidence);
    if (c === null) { invalid("confidence"); c = 0; }
    // WCAG 2.5.3: never replace visible text with an unrelated accessible name.
    if (!labelMatchesVisible(e.text, label)) c = Math.min(c, 0.5);
    const crit = await critique(e, attr, label, c);
    out.push({ ...base, attr, value: crit.value, confidence: crit.confidence, criticRounds: crit.rounds, extra });
  };

  try {
    if (e.id === "html-has-lang" || e.id === "html-lang-valid")
      out.push({ ...base, selector: "html", attr: "lang", value: "ar", confidence: 1 });
    else if (e.id === "meta-viewport") { // allow pinch-zoom (WCAG 1.4.4)
      const content = (/content="([^"]*)"/.exec(e.html)?.[1] ?? "width=device-width, initial-scale=1").split(",").map((s) => s.trim())
        .filter((s) => !/^user-scalable\s*=\s*(no|0)$/i.test(s) && !/^maximum-scale\s*=/i.test(s)).join(", ");
      out.push({ ...base, attr: "content", value: content || "width=device-width, initial-scale=1", confidence: 1 });
    } else if (e.id === "document-title") {
      const r = asObject(await askJson<Record<string, unknown>>(TITLE, e.context));
      const title = text(r.title, 120);
      const c = confidence(r.confidence);
      if (!title || c === null) invalid("title/confidence");
      else out.push({ ...base, selector: "head", attr: "title", op: "title", value: title, confidence: c });
    } else if (e.id === "color-contrast") {
      const d = e.data;
      const c = d?.fgColor && d?.bgColor ? fixColor(d.fgColor, d.bgColor, parseFloat(d.expectedContrastRatio) || 4.5) : null;
      if (c) out.push({ ...base, attr: "style", value: `color:${c}`, confidence: 1 });
      else console.error(`skip ${e.selector}: contrast colors are not simple hex`);
    } else if (e.id === "custom-control") { // clickable div/span: make it a real keyboard-operable button
      const role = /role="(button|link)"/.exec(e.html)?.[1] ?? "button";
      out.push({ ...base, attr: "role", value: role, confidence: 0.9, extra: [["tabindex", "0"], ["onkeydown", KEY]] });
      if (!e.data?.named) await name("aria-label");
    } else if (e.id === "image-alt" || (e.id === "sam-visual" && tag === "img")) {
      const r = asObject(await askJson<Record<string, unknown>>(IMG, ctx, e.shot));
      let c = confidence(r.confidence);
      if (c === null) { invalid("confidence"); c = 0; }
      if (r.decorative === true) out.push({ ...base, attr: "alt", value: "", confidence: c });
      else {
        const alt = text(r.alt, 300);
        if (!alt) invalid("alt");
        else { const crit = await critique(e, "alt", alt, c); out.push({ ...base, attr: "alt", value: crit.value, confidence: crit.confidence, criticRounds: crit.rounds }); }
      }
    } else if (NAMED[e.id]) {
      // Visual-only elements that are not native controls also need a role.
      const extra: [string, string][] | undefined = e.id === "sam-visual" && !NATIVE.includes(tag) ? [["role", "img"]] : undefined;
      await name(NAMED[e.id], extra);
    }
  } catch (err) {
    console.error(`skip ${e.selector}: ${String(err).slice(0, 100)}`);
  }
  return out;
}
