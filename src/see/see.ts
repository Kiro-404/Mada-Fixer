import type { Page } from "playwright";
import type { El, Issue } from "../types.js";
import { segment } from "./sam.js";
import { envNum } from "../util.js";

const CONCEPTS = (process.env.SAM_CONCEPTS ?? "icon,logo,button,image").split(",").map((s) => s.trim()).filter(Boolean);

// SAM 3.1 looks at the screenshot like a user would. Anything it sees that is a visual control or picture
// but has no accessible name in the DOM becomes a new issue (things axe-core cannot flag, e.g. icon-only divs).
export async function discover(page: Page, known: Issue[]): Promise<Issue[]> {
  const vp = page.viewportSize();
  if (!vp) return [];
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const screens = Math.min(envNum("SAM_SCREENS", 3, 1, 10), Math.max(1, Math.ceil(height / vp.height)));
  const out: Issue[] = [];
  for (let s = 0; s < screens; s++) {
    await page.evaluate((y) => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
    }, s * vp.height);
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const png = await page.screenshot({ animations: "disabled", caret: "hide" });
    for (const concept of CONCEPTS) {
      let boxes;
      try { boxes = await segment(png, concept); } catch (e) { console.error(`SAM "${concept}": ${String(e).slice(0, 120)}`); continue; }
      for (const b of boxes) {
        if ((b.c ?? 1) < 0.5) continue;
        // SAM reports boxes in the image's coordinate space (b.w x b.h); convert to CSS viewport pixels.
        const cx = Math.max(0, Math.min(vp.width - 1, ((b.x1 + b.x2) / 2) * (vp.width / b.w)));
        const cy = Math.max(0, Math.min(vp.height - 1, ((b.y1 + b.y2) / 2) * (vp.height / b.h)));
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
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
  return out;
}

// Collects bbox, visible text, surrounding HTML and a cropped screenshot for each failing element.
export async function see(page: Page, issues: Issue[]): Promise<El[]> {
  const out: El[] = [];
  for (const i of issues) {
    const loc = page.locator(i.selector).first();
    try {
      const bbox = await loc.boundingBox();
      const context = i.id === "document-title"
        ? await page.evaluate(() => (document.querySelector("h1")?.textContent ?? "") + "\n" + document.body.innerText.slice(0, 600))
        : await loc.evaluate((el) => (el.parentElement?.outerHTML ?? el.outerHTML).slice(0, 600).replace(/ data-mada="[^"]*"/g, ""));
      const text = await loc.evaluate((el) => ((el as HTMLElement).innerText ?? "").trim().slice(0, 160)).catch(() => "");
      const shot = bbox ? await loc.screenshot({ timeout: 3000, animations: "disabled", caret: "hide" }).catch(() => undefined) : undefined;
      out.push({ ...i, bbox, context, text, shot });
    } catch { out.push({ ...i, bbox: null, context: "", text: "" }); }
  }
  return out;
}
