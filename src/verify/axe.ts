import type { Page } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Issue } from "../types.js";
import { scan } from "./scan.js";

const require = createRequire(import.meta.url);
export const AXE_PATH = require.resolve("axe-core/axe.min.js");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
// Rule ids this agent can fix; used for the "targeted issues" headline number.
export const TARGETED = new Set(["image-alt", "button-name", "link-name", "label", "select-name", "html-has-lang", "html-lang-valid", "symbol-only-name", "color-contrast",
  "document-title", "meta-viewport", "frame-title", "svg-img-alt", "role-img-alt", "object-alt", "empty-heading", "input-image-alt", "area-alt",
  "aria-command-name", "aria-input-field-name", "aria-toggle-field-name", "aria-dialog-name", "landmark-one-main", "custom-control", "focus-invisible"]);

async function ensureAxe(page: Page) {
  if (await page.evaluate(() => "axe" in window)) return;
  try {
    await page.addScriptTag({ path: AXE_PATH });
  } catch {
    // A strict style/script CSP can block addScriptTag; CDP evaluate() is not subject to page CSP.
    await page.evaluate(readFileSync(AXE_PATH, "utf8"));
  }
  if (!(await page.evaluate(() => "axe" in window))) throw new Error("could not load axe-core (page blocked script injection)");
}

export async function runAxe(page: Page): Promise<Issue[]> {
  await ensureAxe(page);
  const found: Issue[] = await page.evaluate(async (tags) => {
    const res = await (window as any).axe.run(document, { runOnly: { type: "tag", values: tags } });
    return res.violations.flatMap((v: any) =>
      v.nodes.map((n: any) => ({ id: v.id, impact: v.impact, selector: String(n.target[0]), html: String(n.html), data: n.any?.[0]?.data ?? null, help: v.help })));
  }, TAGS);
  // axe accepts a button whose only content is "🔍" as named. A screen reader reads that as noise, so flag it.
  const symbols: Issue[] = await page.evaluate(() => {
    const out: any[] = [];
    document.querySelectorAll("button,a[href],[role=button]").forEach((el, i) => {
      if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.querySelector("img[alt]:not([alt=''])")) return;
      const t = (el.textContent || "").trim();
      if (!t || /[\p{L}\p{N}]/u.test(t)) return;
      el.setAttribute("data-mada", "s" + i);
      out.push({ id: "symbol-only-name", impact: "moderate", selector: `[data-mada="s${i}"]`, html: el.outerHTML.slice(0, 300).replace(/ data-mada="[^"]*"/g, "") });
    });
    return out;
  });
  return [...found, ...symbols, ...(await arabicContrast(page, found.map((i) => i.selector))), ...(await scan(page))];
}

// axe-core 4.14 treats some joined Arabic text as an icon-font ligature (text.isIconLigature) and skips it in
// color-contrast for some fonts/phrases, so low-contrast Arabic text can go unreported. This scan covers elements
// whose own text is Arabic. Verify with your browser/fonts; see docs/ARABIC-CONTRAST.md.
async function arabicContrast(page: Page, known: string[]): Promise<Issue[]> {
  return page.evaluate((known) => {
    type C = [number, number, number, number];
    const rgba = (s: string): C | null => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
    const over = (top: C, base: [number, number, number]): [number, number, number] => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])) as [number, number, number];
    const lum = (c: number[]) => { const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
    const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const out: any[] = [];
    let n = 0;
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!Array.from(el.childNodes).some((x) => x.nodeType === 3 && /[\u0600-\u06FF]/.test(x.nodeValue ?? ""))) continue;
      if (!el.getClientRects().length || (el as HTMLInputElement).disabled) continue;
      if (known.some((s) => { try { return document.querySelector(s) === el; } catch { return false; } })) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden") continue;
      const layers: C[] = [];
      let skip = false, node: Element | null = el;
      while (node) {
        const s = getComputedStyle(node);
        if (Number(s.opacity) < 1 || s.backgroundImage !== "none") { skip = true; break; }
        const bg = rgba(s.backgroundColor);
        if (bg && bg[3] > 0) { layers.push(bg); if (bg[3] >= 1) break; }
        node = node.parentElement;
      }
      const fg = rgba(cs.color);
      if (skip || !fg) continue;
      let base: [number, number, number] = [255, 255, 255];
      for (const l of layers.reverse()) base = over(l, base);
      const text = over(fg, base);
      const [hi, lo] = [lum(text), lum(base)].sort((p, q) => q - p);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      if (ratio >= need) continue;
      el.setAttribute("data-mada", "c" + n);
      out.push({ id: "color-contrast", impact: "serious", selector: `[data-mada="c${n++}"]`, html: el.outerHTML.slice(0, 300).replace(/ data-mada="[^"]*"/g, ""),
        data: { fgColor: hex(text), bgColor: hex(base), contrastRatio: Math.round(ratio * 100) / 100, expectedContrastRatio: `${need}:1` } });
    }
    return out;
  }, known);
}
