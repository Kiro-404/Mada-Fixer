import type { Page } from "playwright";
import type { Fix } from "../types.js";

type F = Pick<Fix, "selector" | "attr" | "value" | "extra" | "op">;

// Applies one fix to the live page and returns a short before/after diff.
export function applyFix(page: Page, f: F): Promise<string | null> {
  return page.evaluate(({ s, a, v, x, op }) => {
    if (op === "title") {
      let t = document.querySelector("title");
      const before = t ? t.outerHTML : "(no <title>)";
      if (!t) { t = document.createElement("title"); document.head.appendChild(t); }
      t.textContent = v;
      return `- ${before}\n+ ${t.outerHTML}`;
    }
    if (op === "css") {
      const st = document.createElement("style");
      st.setAttribute("data-mada-css", "");
      st.textContent = v;
      document.head.appendChild(st);
      return `+ <style>${v}</style>`;
    }
    if (op === "html") { document.body.insertAdjacentHTML("afterbegin", v); return `+ ${v}`; }
    const el = document.querySelector(s);
    if (!el) return null;
    if (op === "text") {
      // Only leaf text is replaced: rewriting a container would destroy its icons/links.
      if (el.childElementCount > 0) return null;
      const old = (el.textContent ?? "").trim();
      if (!v.trim() || v.trim() === old) return null;
      el.textContent = v;
      return `- ${old}\n+ ${v}`;
    }
    const tag = () => (el.cloneNode(false) as Element).outerHTML.replace(/ data-mada="[^"]*"/g, "");
    const before = tag();
    if (a === "style") { const [p, val] = v.split(":"); (el as HTMLElement).style.setProperty(p, val); } else el.setAttribute(a, v);
    for (const [k, w] of x ?? []) el.setAttribute(k, w);
    return `- ${before}\n+ ${tag()}`;
  }, { s: f.selector, a: f.attr, v: f.value, x: f.extra ?? null, op: f.op ?? "attr" });
}
