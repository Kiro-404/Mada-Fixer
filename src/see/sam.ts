import { createHash } from "node:crypto";
import { API_BASE, apiKey, cached, usage } from "../models/meta.js";

export type Box = { x1: number; y1: number; x2: number; y2: number; w: number; h: number; c?: number };
const BOX = /<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)(?:;c=([\d.]+))?\|>/g;

export function parseBoxes(text: string): Box[] {
  return [...text.matchAll(BOX)].map((m) => ({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4], w: +m[5], h: +m[6], c: m[7] ? +m[7] : undefined }));
}

// SAM 3.1 via the Responses API: one noun-phrase concept per request, boxes streamed back as text tokens.
export async function segment(png: Buffer, concept: string): Promise<Box[]> {
  const key = "sam" + concept + createHash("sha1").update(png).digest("hex");
  return cached(key, async () => {
    usage.sam++;
    const r = await fetch(`${API_BASE}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify({
        model: "sam-3.1", stream: true,
        metadata: { include_confidence: "true", mask_encoding: "one_bit" },
        input: [{ type: "message", role: "user", content: [
          { type: "input_text", text: concept },
          { type: "input_image", image_url: `data:image/png;base64,${png.toString("base64")}` },
        ] }],
      }),
    });
    if (!r.ok) throw new Error(`SAM ${r.status}: ${(await r.text()).slice(0, 120)}`);
    let out = "";
    for (const line of (await r.text()).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const d = line.slice(6);
      if (d === "[DONE]") break;
      try { const e = JSON.parse(d); if (e.type === "response.output_text.delta") out += e.delta; } catch {}
    }
    return parseBoxes(out);
  });
}
