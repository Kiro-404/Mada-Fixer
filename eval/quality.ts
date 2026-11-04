import { readdir, readFile, writeFile } from "node:fs/promises";

// Step 1 of measuring description quality: draws a reproducible random sample of 50 generated texts from out/eval/*
// into eval/quality-sample.csv. Fill the human_ok column (1 = good, 0 = wrong) then run `npm run score`.
const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""').replace(/\s+/g, " ")}"`;
const rows: { site: string; id: string; el: string; text: string; conf: number; status: string }[] = [];
for (const d of await readdir("out/eval").catch(() => [] as string[])) {
  const r = JSON.parse(await readFile(`out/eval/${d}/report.json`, "utf8").catch(() => "null"));
  for (const f of r?.fixes ?? []) if (f.status !== "failed" && ["alt", "aria-label", "title"].includes(f.attr) && f.value) rows.push({ site: r.url, id: f.issueId, el: (f.html ?? "").slice(0, 120), text: f.value, conf: f.confidence, status: f.status });
}
let seed = 42; // fixed seed: the same sample every time
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
rows.sort(() => rnd() - 0.5);
const pick = rows.slice(0, 50);
await writeFile("eval/quality-sample.csv", ["site,issue,element,generated,confidence,status,human_ok,better_text", ...pick.map((p) => [p.site, p.id, p.el, p.text, p.conf, p.status, "", ""].map(q).join(","))].join("\n"));
console.log(`wrote ${pick.length} of ${rows.length} generated texts to eval/quality-sample.csv`);
