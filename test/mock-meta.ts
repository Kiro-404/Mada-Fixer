// Local stand-in for Meta Model API so the pipeline can be tested offline. Not part of the product.
import http from "node:http";

export const modelsSeen = new Set<string>();
const sse = (res: http.ServerResponse, text: string) => {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  res.write(`data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\n`);
  res.end("data: [DONE]\n\n");
};

export function startMock(port = 8787) {
  return http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      const j = JSON.parse(b || "{}");
      modelsSeen.add(j.model);
      if (req.url?.endsWith("/responses")) { // SAM: report one "icon" where demo/index.html has an unlabeled div
        const concept = j.input[0].content[0].text;
        return sse(res, concept === "icon" ? "<0f>0<|box;x1=40;y1=80;x2=90;y2=130;w=1280;h=900;c=0.93|><|mask;x=0;y=0;c=0.93;data=1,2,!x|>" : "");
      }
      const sys: string = j.messages[0].content, user = j.messages[1].content;
      const u: string = typeof user === "string" ? user : user[0].text;
      let out: unknown;
      if (sys.includes("You edit web source files")) {
        const p = JSON.parse(u), edits: unknown[] = [];
        const once = (c: string, re: RegExp) => { const x = c.match(new RegExp(re.source, "g")); return x?.length === 1 ? x[0] : null; };
        // Group fixes that touch the same rendered element, then emit one edit per element (like a careful model).
        const groups = new Map<string, { html: string; fixes: any[] }>(), order = new Map<string, string[]>();
        for (const f of p.fixes) {
          if ((f.op ?? "attr") !== "attr" || !f.html || !f.el) continue;
          const key = `${f.el}\u0000${f.html}`;
          const g = groups.get(key) ?? { html: f.html as string, fixes: [] as any[] };
          g.fixes.push(f);
          groups.set(key, g);
          const els = order.get(f.html) ?? [];
          if (!els.includes(f.el)) els.push(f.el);
          order.set(f.html, els);
        }
        const targets = p.files.filter((file: any) => p.fixes.some((f: any) => f.html && file.content.includes(f.html)));
        for (const f of p.fixes) {
          const op = f.op ?? "attr";
          if (op === "attr") continue;
          const files = targets.length ? targets : p.files;
          for (const file of files) {
            const c: string = file.content;
            if (op === "title") { const t = once(c, /<head[^>]*>/); if (t && !/<title[^>]*>/i.test(c)) edits.push({ file: file.path, find: t, replace: `${t}<title>${f.value}</title>` }); }
            else if (op === "css") { const t = once(c, /<\/head>/); if (t) edits.push({ file: file.path, find: t, replace: `<style>${f.value}</style></head>` }); }
            else if (op === "html") { const t = once(c, /<body[^>]*>/); if (t) edits.push({ file: file.path, find: t, replace: t + f.value }); }
          }
        }
        for (const [, g] of groups) for (const file of p.files) {
          const c: string = file.content;
          if (!c.includes(g.html)) continue;
          const first = g.fixes[0];
          if (first.attr === "content" && /^<meta\b/i.test(g.html)) {
            const t = once(c, /<meta[^>]*name=["']viewport["'][^>]*>/i);
            if (t) edits.push({ file: file.path, find: t, replace: t.replace(/\scontent=["'][^"']*["']/i, ` content="${first.value}"`) });
            continue;
          }
          // Identical elements (three "add to cart" divs) map to their own occurrence, in document order.
          const n = (order.get(g.html) ?? []).indexOf(first.el);
          let idx = -1, prevEnd = 0;
          for (let i = 0; i <= n; i++) { idx = c.indexOf(g.html, prevEnd); if (idx < 0) break; if (i < n) prevEnd = idx + g.html.length; }
          if (idx < 0) continue;
          const from = n === 0 ? 0 : prevEnd, to = idx + g.html.length;
          let find = c.slice(from, to);
          for (let extra = 80; c.split(find).length !== 2 && extra <= 320; extra += 80) find = c.slice(from, Math.min(c.length, to + extra));
          if (c.split(find).length !== 2) continue;
          const gt = g.html.indexOf(">") + 1;
          let open = g.html.slice(0, gt);
          const setAttr = (name: string, val: string) => {
            const re = new RegExp(`\\s${name}="[^"]*"`);
            open = re.test(open) ? open.replace(re, () => ` ${name}="${val}"`) : open.replace(/>$/, () => ` ${name}="${val}">`);
          };
          for (const f of g.fixes) {
            if (f.attr === "style") {
              const cur = /\sstyle="([^"]*)"/.exec(open)?.[1];
              setAttr("style", cur ? `${cur};${f.value}` : f.value);
            } else {
              setAttr(f.attr, f.value);
              for (const [k, v] of f.also ?? []) setAttr(k, v);
            }
          }
          const fixed = open + g.html.slice(gt);
          edits.push({ file: file.path, find, replace: find.replace(g.html, () => fixed) });
        }
        out = { edits };
      } else if (sys.includes("alt text")) out = { alt: "صورة منتج في المتجر", decorative: false, confidence: 0.9 };
      else if (sys.includes("مراجع")) out = { score: 0.9, better: "" };
      else if (sys.includes("<title>")) out = { title: "متجر النيل: تسوّق أونلاين", confidence: 0.9 };
      else out = { label: u.includes("🔍") ? "بحث" : u.includes("🛒") ? "السلة" : u.includes("onclick") ? "قائمة" : "حقل إدخال", confidence: 0.85 };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
    });
  }).listen(port);
}
