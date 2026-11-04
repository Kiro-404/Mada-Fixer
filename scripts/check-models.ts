import "../src/env.js";
import { chromium } from "playwright";
import { apiKey, askJson, SPARK, WONDER } from "../src/models/meta.js";
import { segment } from "../src/see/sam.js";

// Live check of the three models the agent uses.
if (!apiKey()) { console.log('MODEL_API_KEY is missing: copy .env.example to .env and paste your key'); process.exit(1); }
const ok = (m: string) => console.log("OK  ", m);
const bad = (n: string, e: unknown) => console.log("FAIL", n, String(e).slice(0, 140));
for (const m of [SPARK, WONDER]) {
  try { const r = await askJson<{ msg: string }>('Return JSON only: {"msg":"..."}', "قل مرحبا بالعربي", undefined, m); ok(`${m}: ${r.msg}`); } catch (e) { bad(m, e); }
}
try {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  await p.setContent('<div style="width:120px;height:120px;background:#d22;margin:40px"></div>');
  const png = await p.screenshot();
  await b.close();
  ok(`sam-3.1: ${(await segment(png, "red square")).length} box(es) for "red square"`);
} catch (e) { bad("sam-3.1", e); }
