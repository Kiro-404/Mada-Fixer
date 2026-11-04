import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Generates a quiet ambient bed (no external assets) for the narration.
const SR = 48000;
const DUR = 240;
const CHORDS = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [130.81, 164.81, 196.0],
  [196.0, 246.94, 293.66],
];

const data = Buffer.alloc(44 + DUR * SR * 2 * 2);
const n = DUR * SR;
const smooth = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

for (let i = 0; i < n; i++) {
  const t = i / SR;
  const block = 8;
  const idx = Math.floor(t / block);
  const local = t - idx * block;
  const a = CHORDS[idx % 4];
  const b = CHORDS[(idx + 1) % 4];
  const xf = smooth((local - (block - 2)) / 2);
  const env = smooth(local / 1.2) * (1 - smooth((local - (block - 1.4)) / 1.4));
  const mod = 0.85 + 0.15 * Math.sin((2 * Math.PI * t) / 14);
  let l = 0, r = 0;
  for (let k = 0; k < 3; k++) {
    const f = a[k] * (1 - xf) + b[k] * xf;
    l += Math.sin(2 * Math.PI * f * t + k) * 0.032;
    r += Math.sin(2 * Math.PI * f * 1.0015 * t + k + 0.7) * 0.032;
    l += Math.sin(2 * Math.PI * f * 2 * t) * 0.005;
    r += Math.sin(2 * Math.PI * f * 2.001 * t) * 0.005;
  }
  const fade = Math.min(1, t / 4) * Math.min(1, (DUR - t) / 5);
  const v = env * mod * fade;
  const li = Math.max(-1, Math.min(1, l * v));
  const ri = Math.max(-1, Math.min(1, r * v));
  const off = 44 + i * 4;
  data.writeInt16LE(Math.round(li * 32767), off);
  data.writeInt16LE(Math.round(ri * 32767), off + 2);
}
data.write("RIFF", 0);
data.writeUInt32LE(36 + DUR * SR * 4, 4);
data.write("WAVEfmt ", 8);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20);
data.writeUInt16LE(2, 22);
data.writeUInt32LE(SR, 24);
data.writeUInt32LE(SR * 4, 28);
data.writeUInt16LE(4, 32);
data.writeUInt16LE(16, 34);
data.write("data", 36);
data.writeUInt32LE(DUR * SR * 4, 40);

const out = resolve(process.env.VIDEO_MUSIC_OUT ?? "out/video/work/music.wav");
await writeFile(out, data);
console.log(out);
