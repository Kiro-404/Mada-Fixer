import type { Page } from "playwright";
import type { El, Issue } from "../types.js";
import { segment } from "./sam.js";

const CONCEPTS = (process.env.SAM_CONCEPTS ?? "icon,logo,button,image").split(",");

// SAM 3.1 looks at the screenshot like a user would. Anything it sees that is a visual control or picture
// but has no accessible name in the DOM becomes a new issue (things axe-core cannot flag, e.g. icon-only divs).
export async function discover(page: Page, known: Issue[]): Promise<Issue[]> {
  const vp = page.viewportSize()!;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const screens = Math.min(Number(process.env.SAM_SCREENS ?? 3), Math.max(1, Math.ceil(height / vp.height)));
  const out: Issue[] = [];
  for (let s = 0; s < screens; s++) { // one screenshot per screen; elementFromPoint works in viewport coordinates
    await page.evaluate((y) => window.scrollTo(0, y), s * vp.height);
    const png = await page.screenshot();
    for (const concept of CONCEPTS) {
      let boxes;
      try { boxes = await segment(png, concept.trim()); } catch (e) { console.error(`SAM "${concept}": ${String(e).slice(0, 100)}`); continue; }
      for (const b of boxes) {
        if ((b.c ?? 1) < 0.5) continue;
        const cx = ((b.x1 + b.x2) / 2) * (vp.width / b.w), cy = ((b.y1 + b.y2) / 2) * (vp.height / b.h);
        const hit = await page.evaluate(({ cx, cy, known }) => {
          let el = document.elementFromPoint(cx, cy) as HTMLElement | null;
          if (!el) return null;
          el = (el.closest("button,a,[role=button],[role=link],img,svg,input,select,[onclick]") as HTMLElement | null) ?? el;
          if (el === document.body || el === document.documentElement) return null;
          for (const s of known) { try { const k = document.querySelector(s); if (k && k !== document.documentElement && k !== document.body && (k === el || k.contains(el) || el.contains(k))) return null; } catch {} }
          const name = (el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("title") || el.textContent || "").trim();
          if (name || el.getAttribute("aria-labelledby")) return null;
          const id = "m" + Math.random().toString(36).slice(2, 8);
          el.setAttribute("data-mada", id);
          return { selector: `[data-mada="${id}"]`, html: el.outerHTML.slice(0, 400).replace(/ data-mada="[^"]*"/g, "") };
        }, { cx, cy, known: [...known, ...out].map((i) => i.selector) });
        if (hit) out.push({ id: "sam-visual", impact: "moderate", ...hit });
      }
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return out;
}

// Collects bbox, surrounding HTML and a cropped screenshot for each failing element.
export async function see(page: Page, issues: Issue[]): Promise<El[]> {
  const out: El[] = [];
  for (const i of issues) {
    const loc = page.locator(i.selector).first();
    try {
      const bbox = await loc.boundingBox();
      const context = i.id === "document-title"
        ? await page.evaluate(() => (document.querySelector("h1")?.textContent ?? "") + "\n" + document.body.innerText.slice(0, 600))
        : await loc.evaluate((el) => (el.parentElement?.outerHTML ?? el.outerHTML).slice(0, 800).replace(/ data-mada="[^"]*"/g, ""));
      const shot = bbox ? await loc.screenshot({ timeout: 3000 }).catch(() => undefined) : undefined;
      out.push({ ...i, bbox, context, shot });
    } catch { out.push({ ...i, bbox: null, context: "" }); }
  }
  return out;
}
