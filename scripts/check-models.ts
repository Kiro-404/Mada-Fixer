import "../src/env.js";
import { launch, newPage } from "../src/browser.js";
import { apiKey, askJson, SPARK, WONDER } from "../src/models/meta.js";
import { segment } from "../src/see/sam.js";

// Live check of the three models the agent uses (costs a few calls). Run: npm run check
if (!apiKey()) {
  console.log("MODEL_API_KEY is missing: copy .env.example to .env and paste your key");
  process.exit(1);
}
let failures = 0;
const ok = (m: string) => console.log("OK  ", m);
const bad = (n: string, e: unknown) => { failures++; console.log("FAIL", n, String(e instanceof Error ? e.message : e).split("\n")[0].slice(0, 160)); };

for (const m of [SPARK, WONDER]) {
  try {
    const r = await askJson<{ msg: string }>('Return JSON only: {"msg":"..."}', "قل مرحبا بالعربي", undefined, m);
    if (typeof r?.msg === "string") ok(`${m}: ${r.msg}`); else bad(m, "response had no msg string");
  } catch (e) { bad(m, e); }
}

let browser;
try {
  browser = await launch();
  const p = await newPage(browser);
  await p.setViewportSize({ width: 400, height: 300 });
  await p.setContent('<div style="width:120px;height:120px;background:#d22;margin:40px"></div>');
  const png = await p.screenshot();
  const boxes = await segment(png, "red square");
  if (boxes.length) ok(`${process.env.SAM_MODEL ?? "sam-3.1"}: ${boxes.length} box(es) for "red square"`);
  else bad("SAM", "no boxes returned (is SAM_MODEL correct?)");
} catch (e) { bad(process.env.SAM_MODEL ?? "sam-3.1", e); }
finally { await browser?.close().catch(() => {}); }

console.log(failures ? `\n${failures} check(s) failed` : "\nall models responded");
process.exit(failures ? 1 : 0);
