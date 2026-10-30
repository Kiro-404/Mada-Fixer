import type { Page } from "playwright";
import type { Fix, Issue } from "../types.js";

type Op = Omit<Fix, "status">;
const FOCUS_CSS = ":focus-visible{outline:3px solid #1a73e8!important;outline-offset:2px!important}";
const SKIP_CSS = ".mada-skip{position:absolute;top:0;inset-inline-start:0;transform:translateY(-150%);padding:8px 14px;background:#000;color:#fff;z-index:2147483647;text-decoration:none}.mada-skip:focus{transform:none}";

// Page-level fixes: a main landmark (plus a skip link), a visible focus ring, and a (review-only) dir="rtl" suggestion.
export async function structureOps(page: Page, issues: Issue[]): Promise<Op[]> {
  const ids = new Set(issues.map((i) => i.id)), out: Op[] = [];
  if (ids.has("landmark-one-main")) {
    const main = await page.evaluate(() => {
      if (document.querySelector("main,[role=main]")) return null;
      const skip = "header,nav,footer,aside,script,style,link,meta,noscript,template,[role=banner],[role=navigation],[role=contentinfo],[role=complementary]";
      const container = /^(DIV|SECTION|ARTICLE|FORM|TABLE|UL|OL|DL|TD)$/; // a landmark on <p> or <span> would be wrong
      const len = (e: Element) => (e.textContent || "").trim().length;
      let root: Element = document.body;
      for (let d = 0; d < 5; d++) { // walk down into the block container that holds most of the text
        const kids = Array.from(root.children).filter((k) => !k.matches(skip) && container.test(k.tagName) && len(k) > 0);
        if (!kids.length) break;
        const best = kids.sort((a, b) => len(b) - len(a))[0];
        if (kids.length === 1 || len(best) > 0.6 * kids.reduce((s, k) => s + len(k), 0)) root = best; else break;
      }
      if (root === document.body || !container.test(root.tagName) || root.querySelector("header,nav,footer,[role=banner],[role=navigation]") || len(root) < 20) return null;

      let id = root.id;
      if (!id) {
        id = "main-content";
        for (let n = 2; document.getElementById(id); n++) id = `main-content-${n}`;
      }
      root.setAttribute("data-mada", "main0");
      const open = root.outerHTML.slice(0, root.outerHTML.indexOf(">") + 1).replace(/ data-mada(-\w+)?="[^"]*"/g, ""); // opening tag only, as written in the source
      return { id, hadId: !!root.id, html: open };
    });
    if (main) {
      out.push({ issueId: "landmark-one-main", selector: '[data-mada="main0"]', attr: "role", value: "main", confidence: 0.8, html: main.html, extra: main.hadId ? undefined : [["id", main.id]] });
      const hasSkip = await page.evaluate((target) => {
        const anchors = Array.from(document.querySelectorAll("a[href^='#']"));
        return anchors.some((a) => {
          const href = a.getAttribute("href") || "";
          return a.classList.contains("mada-skip") || href === `#${target}` || /skip|تخط|المحتوى الرئيسي/i.test(a.textContent || "");
        });
      }, main.id);
      if (!hasSkip) {
        out.push({ issueId: "skip-link", selector: "head", attr: "css:skip", op: "css", value: SKIP_CSS, confidence: 0.9, html: "<head>" });
        out.push({ issueId: "skip-link", selector: "body", attr: "html", op: "html", value: `<a href="#${main.id}" class="mada-skip" data-mada-added>تخطّي إلى المحتوى الرئيسي</a>`, confidence: 0.9, html: "<body>" });
      }
    }
  }
  if (ids.has("focus-invisible")) out.push({ issueId: "focus-invisible", selector: "head", attr: "css", op: "css", value: FOCUS_CSS, confidence: 0.9, html: "<head>" });
  if (ids.has("arabic-dir")) out.push({ issueId: "arabic-dir", selector: "html", attr: "dir", value: "rtl", confidence: 0.5, html: "<html>" }); // flips layout: always goes to human review
  return out;
}
