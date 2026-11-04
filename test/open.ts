import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { modelsSeen, startMock } from "./mock-meta.js";

// The open-weights route must be used for first drafts while the critic stays on Muse Spark. Run: npm run test:open
rmSync(".cache", { recursive: true, force: true });
const base = "http://localhost:8787/v1";
Object.assign(process.env, { API_BASE: base, MODEL_API_KEY: "t", USE_OPEN: "1", OPEN_API_BASE: base, OPEN_API_KEY: "t" });
const server = startMock();
const { run } = await import("../src/orchestrator.js");
const { OPEN_MODEL, SPARK } = await import("../src/models/meta.js");
const r = await run(pathToFileURL(resolve("demo/index.html")).href, "out/open");
server.close();
const checks: [string, boolean][] = [["open-weights model used for drafts", modelsSeen.has(OPEN_MODEL)], ["Muse Spark still used as critic", modelsSeen.has(SPARK)], ["result unchanged", r.targetedAfter === 0]];
for (const [n, ok] of checks) console.log(ok ? "PASS" : "FAIL", n);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
