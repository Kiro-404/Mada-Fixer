import { readFile, writeFile } from "node:fs/promises";

// Step 2: accuracy of the rated sample, overall and per confidence bucket (does higher confidence mean more often correct?).
function parse(t: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", inq = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inq) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += c; }
    else if (c === '"') inq = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const [head, ...body] = parse(await readFile("eval/quality-sample.csv", "utf8"));
const ci = head.indexOf("confidence"), hi = head.indexOf("human_ok");
const rated = body.filter((r) => r[hi] === "0" || r[hi] === "1").map((r) => ({ conf: Number(r[ci]), ok: r[hi] === "1" }));
const buckets: [string, (c: number) => boolean][] = [["0.90 and above", (c) => c >= 0.9], ["0.75 to 0.90", (c) => c >= 0.75 && c < 0.9], ["0.60 to 0.75", (c) => c >= 0.6 && c < 0.75], ["below 0.60 (sent to review)", (c) => c < 0.6]];
const pct = (a: number, n: number) => (n ? `${Math.round((100 * a) / n)}%` : "-");
const lines = [`rated ${rated.length} of ${body.length}`, `overall accuracy: ${pct(rated.filter((r) => r.ok).length, rated.length)}`, "", "| confidence | texts | correct |", "|---|---|---|"];
for (const [n, f] of buckets) { const b = rated.filter((r) => f(r.conf)); lines.push(`| ${n} | ${b.length} | ${pct(b.filter((r) => r.ok).length, b.length)} |`); }
await writeFile("eval/quality-summary.md", lines.join("\n") + "\n");
console.log(lines.join("\n"));
