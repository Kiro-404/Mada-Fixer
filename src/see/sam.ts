import { createHash } from "node:crypto";
import { API_BASE, apiKey, cached, fetchWithRetry, requireKey, usage } from "../models/meta.js";

export type Box = { x1: number; y1: number; x2: number; y2: number; w: number; h: number; c?: number };
const NUM = String.raw`-?\d+(?:\.\d+)?`;
const BOX = new RegExp(String.raw`<\|box;x1=(${NUM});y1=(${NUM});x2=(${NUM});y2=(${NUM});w=(${NUM});h=(${NUM})(?:;c=([\d.]+))?\|>`, "g");
const SAM = process.env.SAM_MODEL ?? "sam-3.1";

export function parseBoxes(text: string): Box[] {
  return [...text.matchAll(BOX)]
    .map((m) => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4], w: +m[5], h: +m[6], c: m[7] ? +m[7] : undefined }))
    .filter((b) => [b.x1, b.y1, b.x2, b.y2, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0 && b.x2 > b.x1 && b.y2 > b.y1);
}

// PNG IHDR width/height, so SAM boxes can be mapped back to the actual screenshot space.
export function pngSize(png: Buffer): { width: number; height: number } | null {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

// SAM 3.1 via the Responses API: one noun-phrase concept per request, boxes streamed back as text tokens.
export async function segment(png: Buffer, concept: string): Promise<Box[]> {
  requireKey();
  const key = "sam" + SAM + concept + createHash("sha1").update(png).digest("hex");
  return cached(key, async () => {
    usage.sam++;
    const r = await fetchWithRetry(`${API_BASE}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify({
        model: SAM, stream: true,
        metadata: { include_confidence: "true", mask_encoding: "one_bit" },
        input: [{ type: "message", role: "user", content: [
          { type: "input_text", text: concept },
          { type: "input_image", image_url: `data:image/png;base64,${png.toString("base64")}` },
        ] }],
      }),
    });
    const raw = await r.text();
    let out = "";
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const d = line.slice(6);
      if (d === "[DONE]") break;
      try {
        const e = JSON.parse(d);
        if (e.type === "response.output_text.delta" && typeof e.delta === "string") out += e.delta;
        else if (e.type === "response.output_text.done" && !out && typeof e.text === "string") out = e.text;
        else if (e.type === "response.error") throw new Error(e.error?.message ?? "SAM returned an error event");
      } catch (e) {
        if (e instanceof Error && !/JSON/.test(e.message)) throw e;
      }
    }
    if (!out && raw.trim().startsWith("{")) {
      const j = JSON.parse(raw);
      out = typeof j.output_text === "string" ? j.output_text : "";
    }
    return parseBoxes(out);
  });
}
