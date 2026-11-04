import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export const API_BASE = process.env.API_BASE ?? "https://api.meta.ai/v1";
export const SPARK = process.env.SPARK_MODEL ?? "muse-spark-1.3"; // high-volume: understand + critic
export const WONDER = process.env.WONDER_MODEL ?? "muse-wonder-1.0"; // long-horizon coding: repo patches
export type Route = { base: string; key: string; model?: string; label?: string };
export const OPEN_MODEL = process.env.OPEN_MODEL ?? "meta-models/muse-spark-open-1026";
// Optional route to an open-weights Muse model served by a partner (Baseten, Modal...). Needs USE_OPEN=1, OPEN_API_BASE and OPEN_API_KEY.
export const openRoute = (): Route | undefined =>
  process.env.USE_OPEN === "1" && process.env.OPEN_API_BASE && process.env.OPEN_API_KEY ? { base: process.env.OPEN_API_BASE, key: process.env.OPEN_API_KEY } : undefined;
export const apiKey = () => process.env.MODEL_API_KEY ?? process.env.META_API_KEY ?? "";
export const usage = { calls: 0, cached: 0, sam: 0, tok: {} as Record<string, { in: number; out: number }> };
const MAX_CALLS = Number(process.env.MAX_MODEL_CALLS ?? 400); // hard stop so a bug can never burn money
// Rough cost in USD. Prices per 1M tokens: Spark PRICE_IN/PRICE_OUT, Wonder WONDER_PRICE_IN/WONDER_PRICE_OUT (defaults are
// unverified estimates, check the official pricing page), SAM PRICE_SAM per 1000 images. Reasoning tokens count as output.
export const estimateCost = () =>
  Object.entries(usage.tok).reduce((s, [model, t]) => {
    const [pi, po] = model.includes("wonder")
      ? [Number(process.env.WONDER_PRICE_IN ?? 4), Number(process.env.WONDER_PRICE_OUT ?? 20)]
      : [Number(process.env.PRICE_IN ?? 1.25), Number(process.env.PRICE_OUT ?? 4.25)];
    return s + (t.in * pi + t.out * po) / 1e6;
  }, 0) + (usage.sam * Number(process.env.PRICE_SAM ?? 2.5)) / 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Fallback route: tried automatically when the primary (Meta) route fails.
// Configure via FALLBACK_API_BASE + FALLBACK_API_KEY + FALLBACK_MODEL.
// Works with any OpenAI-compatible endpoint (Groq, Together, OpenRouter…).
// Example for Groq (free, no credit card):
//   FALLBACK_API_BASE=https://api.groq.com/openai/v1
//   FALLBACK_API_KEY=gsk_xxxx
//   FALLBACK_MODEL=llama-3.3-70b-versatile
// ---------------------------------------------------------------------------
export const fallbackRoute = (): Route | undefined =>
  process.env.FALLBACK_API_BASE && process.env.FALLBACK_API_KEY
    ? { base: process.env.FALLBACK_API_BASE, key: process.env.FALLBACK_API_KEY, model: process.env.FALLBACK_MODEL, label: process.env.FALLBACK_LABEL ?? "fallback" }
    : undefined;

export async function cached<T>(key: string, make: () => Promise<T>): Promise<T> {
  const file = `.cache/${createHash("sha1").update(key).digest("hex")}.json`;
  try { const hit = JSON.parse(await readFile(file, "utf8")) as T; usage.cached++; return hit; } catch {}
  const out = await make();
  await mkdir(".cache", { recursive: true });
  await writeFile(file, JSON.stringify(out));
  return out;
}

// Attempt a single chat/completions request. forceJson=true adds response_format:{type:"json_object"} (Groq/OpenAI support it).
async function tryRoute<T>(base: string, key: string, model: string, messages: unknown[], content: unknown[], forceJson = false): Promise<T | null> {
  for (let i = 0; i < 3; i++) {
    let r: Response;
    try {
      r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [messages[0], { ...(messages[1] as object), content }],
          ...(forceJson ? { response_format: { type: "json_object" } } : {}),
        }),
      });
    } catch { await sleep(1000 * (i + 1)); continue; }
    if (!r.ok) {
      const errTxt = await r.text().catch(() => "");
      console.error(`[${model}] HTTP ${r.status}: ${errTxt.slice(0, 100)}`);
      await sleep(1000 * (i + 1));
      continue;
    }
    const j = await r.json();
    const t = (usage.tok[model] ??= { in: 0, out: 0 });
    t.in += j.usage?.prompt_tokens ?? 0; t.out += j.usage?.completion_tokens ?? 0;
    const txt: string = j.choices?.[0]?.message?.content ?? "";
    // 1. direct parse  2. strip markdown fences  3. extract first {...} block
    for (const a of [txt, txt.replace(/```json|```/g, "").trim(), (txt.match(/\{[\s\S]*\}/) ?? [])[0] ?? ""]) {
      if (!a) continue;
      try { return JSON.parse(a) as T; } catch {}
    }
  }
  return null;
}

// Chat Completions call that must return JSON. Cached on disk to save credits.
// Primary route: Meta API (API_BASE + MODEL_API_KEY). Automatic fallback to FALLBACK_* if primary fails or key missing.
export async function askJson<T>(system: string, user: string, png?: Buffer, model = SPARK, route?: Route): Promise<T> {
  return cached(model + system + user + (png?.toString("base64") ?? ""), async () => {
    if (usage.calls >= MAX_CALLS) throw new Error(`MAX_MODEL_CALLS (${MAX_CALLS}) reached`);
    usage.calls++;
    const content: unknown[] = [{ type: "text", text: user }];
    const primaryBase = route?.base ?? API_BASE;
    const primaryKey = route?.key ?? apiKey();
    const messages = [{ role: "system", content: system }, { role: "user", content }];

    // Vision content — only for primary (Meta supports it; most free providers don't)
    if (png) content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } });

    // 1. Try primary (Meta API or explicitly supplied route)
    if (primaryKey) {
      const res = await tryRoute<T>(primaryBase, primaryKey, route?.model ?? model, messages, content);
      if (res !== null) return res;
      console.error(`[meta] ⚠️  primary failed, trying fallback…`);
    }

    // 2. Auto-fallback to FALLBACK_* (only for top-level calls, not explicit routes)
    const fallback = !route ? fallbackRoute() : undefined;
    if (fallback) {
      const fbModel = fallback.model ?? "llama-3.3-70b-versatile";
      const contentNoImg: unknown[] = [{ type: "text", text: user }]; // strip image — text only
      // Use JSON mode (response_format) so Llama always returns valid JSON
      const res = await tryRoute<T>(fallback.base, fallback.key, fbModel, messages, contentNoImg, true);
      if (res !== null) { console.error(`[${fallback.label}] ✅ ${fbModel}`); return res; }
    }

    throw new Error(`${model}: no valid JSON after all routes`);
  });
}
