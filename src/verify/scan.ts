import type { Page } from "playwright";
import type { Issue } from "../types.js";

// Problems axe-core cannot see: clickable non-semantic elements, invisible keyboard focus, missing dir on Arabic pages.
const NATIVE = ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "OPTION", "AREA", "LABEL", "VIDEO", "AUDIO", "IFRAME", "HTML", "BODY", "HEAD", "SCRIPT", "STYLE", "META", "LINK", "TITLE"];

export async function scan(page: Page): Promise<Issue[]> {
  return [...(await customControls(page)), ...(await focusInvisible(page)), ...(await arabicDir(page))];
}

// Elements with a real click listener (found through the DevTools protocol, so framework handlers count) that a keyboard cannot reach.
async function customControls(page: Page): Promise<Issue[]> {
  const cands = await page.evaluate((native) => {
    let n = 0;
    document.body.querySelectorAll("*").forEach((el) => {
      if (native.includes(el.tagName) || el.closest("a[href],button,summary,label")) return;
      const parent = el.parentElement ? getComputedStyle(el.parentElement).cursor === "pointer" : false;
      if ((getComputedStyle(el).cursor === "pointer" && !parent) || el.hasAttribute("onclick")) el.setAttribute("data-mada-cand", String(n++));
    });
    return n;
  }, NATIVE);
  if (!cands) return [];
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-mada-cand]" });
    for (const nodeId of nodeIds.slice(0, 300)) {
      const { object } = await cdp.send("DOM.resolveNode", { nodeId });
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: object.objectId! });
      const types = listeners.map((l) => l.type);
      if (types.includes("click")) await cdp.send("DOM.setAttributeValue", { nodeId, name: "data-mada-click", value: types.includes("keydown") ? "kb" : "1" });
      await cdp.send("Runtime.releaseObject", { objectId: object.objectId! });
    }
  } finally { await cdp.detach(); }
  return page.evaluate(() => {
    const out: any[] = [];
    document.querySelectorAll("[data-mada-click]").forEach((el, i) => {
      const role = el.getAttribute("role"), ti = el.getAttribute("tabindex");
      const ok = (role === "button" || role === "link") && ti !== null && Number(ti) >= 0 && (el.getAttribute("data-mada-click") === "kb" || el.hasAttribute("onkeydown"));
      const named = !!(el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("title") || (el.textContent || "").trim());
      el.removeAttribute("data-mada-click");
      if (ok) return;
      let id = el.getAttribute("data-mada");
      if (!id) { id = "k" + i + Math.random().toString(36).slice(2, 5); el.setAttribute("data-mada", id); }
      out.push({ id: "custom-control", impact: "serious", selector: `[data-mada="${id}"]`, html: el.outerHTML.slice(0, 300).replace(/ data-mada(-\w+)?="[^"]*"/g, ""), data: { named } });
    });
    document.querySelectorAll("[data-mada-cand]").forEach((e) => e.removeAttribute("data-mada-cand"));
    return out;
  });
}

// Presses Tab through the first focusable elements; if the computed style is identical when focused, the user cannot see where they are (WCAG 2.4.7).
async function focusInvisible(page: Page): Promise<Issue[]> {
  const total = await page.evaluate(() => {
    const w = window as any;
    // Reset the sequential-focus start to the top of the document; without this a second probe starts from the
    // browser chrome and every Tab lands outside the page.
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
    w.__madaSnap = (e: Element) => { const s = getComputedStyle(e); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.backgroundColor, s.color, s.textDecorationLine].join("|"); };
    w.__madaBase = {};
    const els = Array.from(document.querySelectorAll<HTMLElement>("a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex='-1'])")).filter((e) => e.getClientRects().length && !(e as any).disabled).slice(0, 12);
    els.forEach((e, i) => { e.setAttribute("data-mada-f", String(i)); w.__madaBase[i] = w.__madaSnap(e); });
    (document.activeElement as HTMLElement | null)?.blur();
    return els.length;
  });
  let bad = 0;
  for (let i = 0; i < total; i++) {
    await page.keyboard.press("Tab");
    bad += await page.evaluate(() => {
      const w = window as any, e = document.activeElement, k = e?.getAttribute("data-mada-f");
      return k != null && w.__madaBase[k] === w.__madaSnap(e) ? 1 : 0;
    });
  }
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); document.querySelectorAll("[data-mada-f]").forEach((e) => e.removeAttribute("data-mada-f")); });
  return bad ? [{ id: "focus-invisible", impact: "serious", selector: "html", html: "<html>", data: { bad, total } }] : [];
}

async function arabicDir(page: Page): Promise<Issue[]> {
  const r = await page.evaluate(() => {
    const t = document.body.innerText || "";
    return { ar: (t.match(/[\u0600-\u06FF]/g) || []).length, la: (t.match(/[A-Za-z]/g) || []).length, dir: getComputedStyle(document.body).direction };
  });
  return r.ar > 20 && r.ar > 2 * r.la && r.dir !== "rtl" ? [{ id: "arabic-dir", impact: "moderate", selector: "html", html: "<html>", data: r }] : [];
}
