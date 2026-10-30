// Local stand-in for Meta Model API so the pipeline can be tested offline. Not part of the product.
import http from "node:http";

const sse = (res: http.ServerResponse, text: string) => {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.write(`data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\n`);
  res.end("data: [DONE]\n\n");
};

export type MockOptions = {
  badJson?: boolean; // chat returns prose instead of JSON
  badFields?: boolean; // chat returns wrong types / impossible confidence
  patchNoop?: boolean; // patch model maps nothing
  emptySam?: boolean; // SAM finds nothing
};

type Change = { id: string; attr: string; value: string; also?: [string, string][] };
type Element = { html?: string; changes: Change[] };
type PageOp = { id: string; op: string; tag?: string; value: string };

const attrOf = (tag: string, name: string) => new RegExp(String.raw`\s${name}="([^"]*)"`).exec(tag)?.[1];

// Applies every change to one opening tag, skipping ones already present (idempotent, like a careful model).
function applyChanges(html: string, changes: Change[]): { tag: string; done: string[] } {
  const gt = html.indexOf(">");
  const rest = gt >= 0 ? html.slice(gt + 1) : "";
  let out = gt >= 0 ? html.slice(0, gt + 1) : html;
  const done: string[] = [];
  for (const c of changes) {
    if (c.attr === "style") {
      const cur = attrOf(out, "style");
      const decl = c.value.trim();
      if (cur !== undefined && cur.split(";").map((s) => s.trim()).includes(decl)) { done.push(c.id); continue; }
      out = cur === undefined ? out.replace(/>$/, ` style="${decl}">`) : out.replace(/(\sstyle=")([^"]*)"/, (_m, a, v) => `${a}${v ? v + ";" : ""}${decl}"`);
    } else if (attrOf(out, c.attr) === c.value) { done.push(c.id); continue; }
    else if (new RegExp(String.raw`\s${c.attr}="[^"]*"`).test(out)) out = out.replace(new RegExp(String.raw`\s${c.attr}="[^"]*"`), ` ${c.attr}="${c.value}"`);
    else out = out.replace(/>$/, ` ${c.attr}="${c.value}">`);
    for (const [k, v] of c.also ?? []) {
      if (new RegExp(String.raw`\s${k}="[^"]*"`).test(out)) out = out.replace(new RegExp(String.raw`\s${k}="[^"]*"`), ` ${k}="${v}"`);
      else out = out.replace(/>$/, ` ${k}="${v}">`);
    }
    done.push(c.id);
  }
  return { tag: out + rest, done };
}

function patch(p: any, noop: boolean) {
  if (noop) return { edits: [], unmapped: [] };
  const files: { path: string; content: string }[] = Array.isArray(p.files) ? p.files : [];
  const target: string | undefined = p.target;
  const order = target ? [...files].sort((a, b) => (a.path === target ? -1 : b.path === target ? 1 : 0)) : files;
  // Fixes were measured on the target page: never scatter them across unrelated pages.
  const scope = target && files.some((f) => f.path === target) ? files.filter((f) => f.path === target) : order;
  const elements: Element[] = Array.isArray(p.elements) ? p.elements : [];
  const pageOps: PageOp[] = Array.isArray(p.pageOps) ? p.pageOps : [];
  const edits: any[] = [], unmapped: any[] = [];

  // Page-level ops go in the measured page, else the first file that has the needed tag.
  for (const op of pageOps) {
    const file = scope.find((f) => (op.op === "html" ? /<body[^>]*>/.test(f.content) : /<\/head>|<head[^>]*>/.test(f.content))) ?? scope[0];
    if (!file) { unmapped.push({ fix: op.id, reason: "no source file" }); continue; }
    let find = "", insert = "", replace = "";
    if (op.op === "title") {
      if (/<title[^>]*>/.test(file.content)) { unmapped.push({ fix: op.id, reason: "a title already exists in the source" }); continue; }
      find = /<head[^>]*>/.exec(file.content)?.[0] ?? "";
      insert = `<title>${op.value}</title>`;
    } else if (op.op === "css") {
      if (file.content.includes(op.value.trim())) { unmapped.push({ fix: op.id, reason: "already present" }); continue; }
      find = "</head>";
      insert = `<style data-mada-css>${op.value}</style>`;
    } else if (op.op === "html") {
      if (file.content.includes(op.value.trim())) { unmapped.push({ fix: op.id, reason: "already present" }); continue; }
      find = /<body[^>]*>/.exec(file.content)?.[0] ?? "";
      insert = op.value;
    }
    if (!find || file.content.split(find).length !== 2) { unmapped.push({ fix: op.id, reason: "tag not found exactly once" }); continue; }
    replace = op.op === "html" || op.op === "css" ? find + insert : find + insert;
    edits.push({ file: file.path, find, replace, fixes: [op.id] });
    continue;
  }

  for (const el of elements) {
    // Rendered HTML from the live DOM may carry an empty style="" or our data-mada markers; source does not.
    const html = (el.html ?? "").replace(/ style=""/g, "").replace(/ data-mada(?:-\w+)?="[^"]*"/g, "");
    if (!html) { for (const c of el.changes) unmapped.push({ fix: c.id, reason: "no rendered html" }); continue; }
    const file = scope.find((f) => f.content.split(html).length === 2);
    if (!file) { for (const c of el.changes) unmapped.push({ fix: c.id, reason: "element not found exactly once" }); continue; }
    const { tag, done } = applyChanges(html, el.changes);
    const open = html.slice(0, html.indexOf(">") + 1);
    const newOpen = tag.slice(0, tag.indexOf(">") + 1);
    if (newOpen === open) { for (const c of el.changes) unmapped.push({ fix: c.id, reason: "already present" }); continue; }
    // An opening tag like <button onclick="…"> can repeat; fall back to the whole (unique) element as the anchor.
    const find = file.content.split(open).length === 2 ? open : html;
    edits.push({ file: file.path, find, replace: find === open ? newOpen : newOpen + html.slice(open.length), fixes: done });
    for (const c of el.changes) if (!done.includes(c.id)) unmapped.push({ fix: c.id, reason: "not applied" });
  }
  return { edits, unmapped };
}

export function startMock(port = 8787, opts: MockOptions = {}) {
  return http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      let j: any = {};
      try { j = JSON.parse(b || "{}"); } catch { res.writeHead(400).end("bad json"); return; }
      if (req.url?.endsWith("/responses")) { // SAM: report one "icon" where the demo has an unlabeled visual control
        if (opts.emptySam) return sse(res, "");
        const concept = j.input?.[0]?.content?.[0]?.text ?? "";
        return sse(res, concept === "icon" ? "<|box;x1=600;y1=100;x2=640;y2=140;w=1280;h=900;c=0.93|>" : "");
      }
      if (opts.badJson) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ choices: [{ message: { content: "sorry, I cannot help with that" } }] }));
      }
      const sys: string = j.messages?.[0]?.content ?? "", user = j.messages?.[1]?.content;
      const u: string = typeof user === "string" ? user : user?.[0]?.text ?? "";
      let out: unknown;
      if (sys.includes("You edit web source files")) out = patch(JSON.parse(u), !!opts.patchNoop);
      else if (opts.badFields) out = sys.includes("alt text") ? { alt: 42, decorative: "no", confidence: "high" } : sys.includes("مراجع") ? { score: "great" } : { label: 7, confidence: -4 };
      else if (sys.includes("alt text")) out = { alt: "صورة منتج في المتجر", decorative: false, confidence: 0.9 };
      else if (sys.includes("مراجع")) out = { score: 0.9, better: "" };
      else if (sys.includes("<title>")) out = { title: "متجر النيل: تسوّق أونلاين", confidence: 0.9 };
      else {
        const el = u.split("السياق:")[0]; // the element's own HTML, not its parent context
        const label = el.includes("iframe") ? "إطار محتوى" : el.includes("/cart") || el.includes("🛒") ? "السلة" : el.includes("🔍") ? "بحث"
          : el.includes("<input") ? "حقل بحث" : el.includes("onclick") ? "قائمة الأقسام" : el.includes("<span") ? "أيقونة" : "زر";
        out = { label, confidence: 0.85 };
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
    });
  }).listen(port);
}
