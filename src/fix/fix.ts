import type { Page } from "playwright";
import type { Fix } from "../types.js";

type F = Pick<Fix, "selector" | "attr" | "value" | "extra" | "op">;

// Applies one fix to the live page and returns a short before/after diff.
export async function applyFix(page: Page, f: F): Promise<string | null> {
  if (typeof f.value !== "string") return null; // never write "undefined" into the page
  return page.evaluate(({ s, a, v, x, op }) => {
    if (op === "title") {
      if (!v.trim()) return null;
      let t = document.querySelector("title");
      const before = t ? t.outerHTML : "(no <title>)";
      if (!t) { t = document.createElement("title"); document.head.appendChild(t); }
      t.textContent = v;
      return `- ${before}\n+ ${t.outerHTML}`;
    }
    if (op === "css") {
      if (!v.trim()) return null;
      const existing = Array.from(document.querySelectorAll("style[data-mada-css]")).some((e) => (e.textContent || "").trim() === v.trim());
      if (existing) return "(already present)";
      const st = document.createElement("style");
      st.setAttribute("data-mada-css", "");
      st.textContent = v;
      document.head.appendChild(st);
      return `+ <style>${v}</style>`;
    }
    if (op === "html") {
      if (!v.trim()) return null;
      if (document.querySelector("[data-mada-added]")) return "(already present)";
      document.body.insertAdjacentHTML("afterbegin", v);
      return `+ ${v}`;
    }
    const el = document.querySelector(s);
    if (!el) return null;
    const tag = () => (el.cloneNode(false) as Element).outerHTML.replace(/ data-mada="[^"]*"/g, "");
    const before = tag();
    if (a === "style") {
      const i = v.indexOf(":");
      if (i < 0) return null;
      (el as HTMLElement).style.setProperty(v.slice(0, i).trim(), v.slice(i + 1).trim());
    } else el.setAttribute(a, v);
    for (const [k, w] of x ?? []) el.setAttribute(k, w);
    return `- ${before}\n+ ${tag()}`;
  }, { s: f.selector, a: f.attr, v: f.value, x: f.extra ?? null, op: f.op ?? "attr" });
}
