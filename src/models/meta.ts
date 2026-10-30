import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { envNum, sleep } from "../util.js";

export const API_BASE = (process.env.API_BASE ?? "https://api.meta.ai/v1").replace(/\/$/, "");
export const SPARK = process.env.SPARK_MODEL ?? "muse-spark-1.3"; // high-volume: understand + critic
export const WONDER = process.env.WONDER_MODEL ?? "muse-wonder-1.0"; // long-horizon coding: repo patches
export const apiKey = () => (process.env.MODEL_API_KEY ?? process.env.META_API_KEY ?? "").trim();
export const requireKey = () => {
  if (!apiKey()) throw new Error("MODEL_API_KEY is missing: copy .env.example to .env and paste your key (or run with --audit)");
};

export const usage = { calls: 0, cached: 0, inTok: 0, outTok: 0, sam: 0, limitHit: false };
const MAX_CALLS = envNum("MAX_MODEL_CALLS", 400, 1);
const MAX_INPUT_TOKENS = envNum("MAX_INPUT_TOKENS", 2_000_000, 1_000);
const TIMEOUT_MS = envNum("MODEL_TIMEOUT_MS", 90_000, 5_000, 600_000);
const NO_CACHE = process.env.NO_CACHE === "1";

// Rough cost in USD. Prices are per 1M tokens / per 1000 SAM images; override with PRICE_IN, PRICE_OUT, PRICE_SAM.
export const estimateCost = () =>
  (usage.inTok * envNum("PRICE_IN", 1.25) + usage.outTok * envNum("PRICE_OUT", 4.25)) / 1e6 + (usage.sam * envNum("PRICE_SAM", 2.5)) / 1000;

export const usageSnapshot = () => ({ ...usage, costUsd: Number(estimateCost().toFixed(4)) });

export async function fetchWithRetry(url: string, init: RequestInit, retries = 3): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (r.ok) return r;
      const body = (await r.text()).slice(0, 300);
      // A bad key or a bad request will never succeed on retry; fail fast with the server's message.
      if (r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404) throw new Error(`HTTP ${r.status}: ${body}`);
      last = new Error(`HTTP ${r.status}: ${body}`);
    } catch (e) {
      if (e instanceof Error && /^HTTP 4/.test(e.message)) throw e;
      last = e;
    }
    if (i < retries - 1) await sleep(800 * 2 ** i);
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function cached<T>(key: string, make: () => Promise<T>): Promise<T> {
  const file = `.cache/${createHash("sha1").update(key).digest("hex")}.json`;
  if (!NO_CACHE) {
    try { const hit = JSON.parse(await readFile(file, "utf8")) as T; usage.cached++; return hit; } catch {}
  }
  const out = await make();
  try { await mkdir(".cache", { recursive: true }); await writeFile(file, JSON.stringify(out)); } catch {}
  return out;
}

const textOf = (j: any): string => {
  if (typeof j?.output_text === "string") return j.output_text; // Responses API convenience field
  if (typeof j?.choices?.[0]?.message?.content === "string") return j.choices[0].message.content; // Chat Completions
  const parts = Array.isArray(j?.output) ? j.output.flatMap((o: any) => (Array.isArray(o?.content) ? o.content : [])) : [];
  return parts.filter((c: any) => c?.type === "output_text" && typeof c.text === "string").map((c: any) => c.text).join("");
};

// Chat Completions call that must return JSON. Cached on disk to save credits.
export async function askJson<T>(system: string, user: string, png?: Buffer, model = SPARK): Promise<T> {
  requireKey();
  const image = png?.toString("base64") ?? "";
  const chatKey = model + system + user + image;
  return cached(chatKey, async () => {
    if (usage.calls >= MAX_CALLS || usage.limitHit) throw new Error(`model call limit reached (MAX_MODEL_CALLS=${MAX_CALLS})`);
    // Cheap guard before spending: text is ~4 chars/token, images are far more expensive per character.
    const approxTokens = (system.length + user.length + image.length * 1.5) / 4;
    if (usage.inTok + approxTokens > MAX_INPUT_TOKENS) {
      usage.limitHit = true;
      throw new Error(`input token budget reached (MAX_INPUT_TOKENS=${MAX_INPUT_TOKENS})`);
    }
    usage.calls++;
    const content: unknown[] = [{ type: "text", text: user }];
    if (png) content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${image}` } });
    let lastErr: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetchWithRetry(`${API_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
          body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content }] }),
        });
        const j = await r.json();
        usage.inTok += j.usage?.prompt_tokens ?? j.usage?.input_tokens ?? 0;
        usage.outTok += j.usage?.completion_tokens ?? j.usage?.output_tokens ?? 0;
        const txt = textOf(j);
        try { return JSON.parse(txt.replace(/```json|```/g, "").trim()) as T; } catch { lastErr = new Error("response was not valid JSON"); }
      } catch (e) {
        lastErr = e;
        if (e instanceof Error && /^HTTP 4/.test(e.message)) break; // bad key/request: retrying cannot help
      }
    }
    throw new Error(`${model}: ${lastErr instanceof Error ? lastErr.message : "no valid JSON"}`);
  });
}
