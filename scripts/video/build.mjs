import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderSlides, WORK } from "./slides.mjs";

const ROOT = resolve(".");
const OUT = resolve("out/video/mada-fixer-explainer.mp4");
const VOICE = process.env.VOICE ?? "ar-EG-ShakirNeural";
const RATE = process.env.RATE ?? "+0%";
const FPS = 25;

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}):\n${(r.stderr || "").slice(-3000)}`);
  return r.stdout || "";
};
const ff = (args) => run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
const duration = (file) =>
  Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]).trim());

const SEGMENTS = [
  { id: "s1", slide: "title", tail: 1.8, min: 18.5, text:
    "لملايين المستخدمين، قارئ الشاشة هو الطريقة الوحيدة لاستخدام الإنترنت. لكن معظم المواقع العربية بتتكتب من غير أسماء للأزرار والصور، ومن غير تنقل بلوحة المفاتيح. ده اللي Mada Fixer بيحله." },
  { id: "s2", slide: "problem", tail: 1.4, min: 18, text:
    "المتجر اللي قدامك فيه مشاكل حقيقية: صور من غير وصف، أزرار إيموجي من غير اسم، عناصر بتشتغل بالماوس بس، ونص عربي تباينه ضعيف. قارئ الشاشة بيقول: صورة، صورة، زر، زر، من غير أي معنى." },
  { id: "s3", slide: "idea", tail: 1.4, min: 18, text:
    "Mada Fixer مش أداة فحص، ده وكيل بيغيّر الصفحة فعلاً: بيشوفها زي المستخدم، بيفهم المشكلة، بيصلّحها، وبعدين بيثبت إن الإصلاح نجح. وبيستخدم موديلات ميتا: Muse Spark وMuse Wonder وSAM 3.1." },
  { id: "s4", slide: "pipeline", tail: 1.4, min: 24, text:
    "دورة العمل أربع خطوات: نشوف بمتصفح حقيقي وفحص axe وتنقل بلوحة المفاتيح وتباين عربي. نفهم: Spark بيكتب الأسماء، وناقد بيقارن بالصورة، والثقة المنخفضة تروح لمراجعة بشرية. نصلّح على الصفحة الحية مع diff. ونتحقق بإعادة الفحص وقياس المشاكل وحركة العناصر." },
  { id: "s5", slide: "fixes", tail: 1.4, min: 15, text:
    "والإصلاحات مش نصوص بس: أزرار حقيقية بدل الـ div، حلقة فوكس واضحة، main وskip link، عنوان صفحة وlang، وتكبير مسموح. وكل ده على الصفحة نفسها، مش توصيات." },
  { id: "d1", demo: "d1", tail: 1.6, min: 19, text:
    "تعالى نشوف عمليًا. بنفتح الواجهة، نختار المتجر، ونشغّل الفحص مع التحسين. 24 مخالفة WCAG و8 عناصر من غير اسم، والنتيجة صفر وصفر بـ36 إصلاح. ودي لقطات قبل وبعد." },
  { id: "s6", slide: "beautify", tail: 1.2, min: 18.5, mix: [["slide", "beautify", 10], ["demo", "d2", null]], text:
    "وضع التحسين بيعيد التصميم بثيم متاح كامل، ويعيد صياغة العناوين والأسعار والأزرار بالعربي، مع الحفاظ على كل رقم وكل ادعاء. في التقرير 9 نصوص جديدة، والتغييرات متعلّمة إنها مقصودة." },
  { id: "s7", slide: "proof", tail: 1.2, min: 21, mix: [["slide", "proof", 15], ["demo", "d3", null]], text:
    "والدليل مش كلام. التقرير بيوري المشاكل قبل وبعد، ونص قارئ الشاشة، ونسبة البكسلات اللي اتغيّرت. وفي وضع الريبو، Muse Wonder بيرجّع التعديلات للكود ويطلّع diff صغير. وأي حاجة محتاجة تدخل بشري بتتسجل." },
  { id: "s8", slide: "close", tail: 2.6, min: 14.5, text:
    "Mada Fixer: إتاحة عربية حقيقية، من الفحص للتعديل للإثبات، بموديلات ميتا. والكود كله مفتوح المصدر، واتكتب خلال الهاكاثون." },
];

const segFile = (id) => join(WORK, `seg-${id}`);
const framesFor = (d) => Math.round(d * FPS);
const dims = ["-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-an"];

async function prepareDemo() {
  const demo = "out/video/mada-fixer-demo.mp4";
  const speed = join(WORK, "overlay-speed.png");
  // Demo UI is inset above a black caption band so subtitles never cover the interface.
  const inset = "scale=1280:656,setsar=1,pad=1280:720:0:0:color=black,drawbox=x=0:y=656:w=1280:h=1:color=0x1f2937@1:t=fill";

  ff(["-i", demo, "-i", speed, "-filter_complex",
    "[0:v]trim=start=0.5:end=7.2,setpts=PTS-STARTPTS,fps=25[a];" +
    "[0:v]trim=start=7.2:end=23,setpts=(PTS-STARTPTS)/6,fps=25[b];" +
    "[0:v]trim=start=23:end=31.5,setpts=PTS-STARTPTS,fps=25[c];" +
    "[a][b][c]concat=n=3:v=1:a=0[base];" +
    `[base]${inset}[p];[p][1:v]overlay=0:0:enable='between(t,6.6,9.5)'[out]`,
    "-map", "[out]", ...dims, join(WORK, "demo-d1.mp4")]);

  ff(["-i", demo, "-filter_complex",
    `[0:v]trim=start=31.5:end=39.5,setpts=(PTS-STARTPTS)/0.8,fps=25[base];[base]${inset}[out]`,
    "-map", "[out]", ...dims, join(WORK, "demo-d2.mp4")]);

  ff(["-i", demo, "-filter_complex",
    `[0:v]trim=start=42.5:end=47.5,setpts=(PTS-STARTPTS)/0.7,fps=25[base];[base]${inset}[out]`,
    "-map", "[out]", ...dims, join(WORK, "demo-d3.mp4")]);
}

function slideVideo(slide, d, out) {
  const frames = framesFor(d);
  ff(["-loop", "1", "-i", join(WORK, `slide-${slide}.png`), "-frames:v", String(frames),
    "-vf", "zoompan=z='min(1+0.0002*on,1.02)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=25,format=yuv420p",
    ...dims, out]);
}

function demoVideo(src, d, out) {
  const frames = framesFor(d);
  ff(["-i", src, "-vf",
    `tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS,fps=25,format=yuv420p`,
    "-frames:v", String(frames), ...dims, out]);
}

async function concatVideos(files, out) {
  const list = join(WORK, `list-${Date.now()}.txt`);
  await writeFile(list, files.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(FPS), "-an", out]);
}

async function buildRaw(seg, d) {
  const raw = join(WORK, `raw-${seg.id}.mp4`);
  if (seg.mix) {
    let content = 0;
    const parts = [];
    for (const [kind, name, fixed] of seg.mix) {
      const partDur = fixed ?? Math.max(0.8, d - content);
      content += partDur;
      const part = join(WORK, `part-${seg.id}-${name ?? kind}.mp4`);
      if (kind === "slide") slideVideo(name, partDur, part);
      else demoVideo(join(WORK, `demo-${name}.mp4`), partDur, part);
      parts.push(part);
    }
    await concatVideos(parts, raw);
    return raw;
  }
  if (seg.demo) {
    demoVideo(join(WORK, `demo-${seg.demo}.mp4`), d, raw);
    return raw;
  }
  slideVideo(seg.slide, d, raw);
  return raw;
}

async function finish(seg, d) {
  const raw = await buildRaw(seg, d);
  const out = segFile(seg.id) + ".mp4";
  const frames = framesFor(d);
  ff(["-i", raw, "-vf", `fade=t=in:st=0:d=0.3,fade=t=out:st=${(d - 0.3).toFixed(3)}:d=0.3,format=yuv420p`,
    "-frames:v", String(frames), ...dims, out]);
  return out;
}

const toSec = (s) => {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s.trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000 : 0;
};
const stamp = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
};
function parseSrt(text) {
  const out = [];
  for (const block of text.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n").filter(Boolean);
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split("-->").map((x) => x.trim());
    out.push({ start: toSec(a), end: toSec(b), text: lines.slice(ti + 1).join(" ") });
  }
  return out;
}

async function main() {
  await rm(WORK, { recursive: true, force: true });
  await mkdir(WORK, { recursive: true });
  await renderSlides();
  await prepareDemo();
  run("node", ["scripts/video/music.mjs"]);

  const d = {};
  for (const seg of SEGMENTS) {
    const mp3 = join(WORK, `${seg.id}.mp3`);
    const srt = join(WORK, `${seg.id}.srt`);
    run("python", ["-m", "edge_tts", "--voice", VOICE, "--rate", RATE, "--text", seg.text, "--write-media", mp3, "--write-subtitles", srt]);
    const narr = duration(mp3);
    d[seg.id] = Math.max(narr + seg.tail, seg.min ?? 0);
    console.log(`${seg.id}: narration ${narr.toFixed(2)}s -> segment ${d[seg.id].toFixed(2)}s`);
  }
  let total = Object.values(d).reduce((a, b) => a + b, 0);
  if (total < 180) {
    let need = 180 - total;
    const order = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
    while (need > 0.05) {
      for (const id of order) {
        const add = Math.min(2, need);
        d[id] += add;
        need -= add;
        if (need <= 0.05) break;
      }
    }
    total = 180;
    console.log("distributed holds across slides");
  }
  console.log(`planned total ${total.toFixed(2)}s`);

  const videoParts = [];
  let t = 0;
  const cues = [];
  for (const seg of SEGMENTS) {
    const D = d[seg.id];
    const out = await finish(seg, D);
    videoParts.push(out);

    const wav = join(WORK, `${seg.id}.wav`);
    ff(["-i", join(WORK, `${seg.id}.mp3`), "-af", `adelay=400|400,apad=pad_dur=${D},atrim=0:${D},aresample=48000`,
      "-ac", "2", "-ar", "48000", wav]);

    const srtText = await readFile(join(WORK, `${seg.id}.srt`), "utf8");
    // Captions only where there is real footage, not on top of designed slides.
    const from = seg.id === "d1" ? 0 : seg.id === "s6" ? 10 : seg.id === "s7" ? 15 : Infinity;
    for (const c of parseSrt(srtText)) {
      if (c.start < from) continue;
      const start = t + 0.4 + c.start;
      const end = Math.min(t + D - 0.08, t + 0.4 + c.end);
      if (end > start + 0.2) cues.push({ start, end, text: "\u200F" + c.text });
    }
    t += D;
  }

  const list = join(WORK, "video-list.txt");
  await writeFile(list, videoParts.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", join(WORK, "video.mp4")]);

  const alist = join(WORK, "audio-list.txt");
  await writeFile(alist, SEGMENTS.map((s) => `file '${join(WORK, `${s.id}.wav`).replace(/\\/g, "/")}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", alist, "-c", "copy", join(WORK, "voice.wav")]);

  ff(["-i", join(WORK, "voice.wav"), "-i", join(WORK, "music.wav"), "-filter_complex",
    "[1:a]volume=0.22[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-16:LRA=11:TP=-1.5[a]",
    "-map", "[a]", "-ar", "48000", "-ac", "2", join(WORK, "mix.wav")]);

  const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join("\n\n") + "\n";
  await writeFile(join(WORK, "subs.srt"), srt);

  const style = "FontName=Segoe UI,FontSize=18,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H60000000,BorderStyle=1,Outline=1,Shadow=0.4,MarginV=12,Alignment=2";
  ff(["-i", join(WORK, "video.mp4"), "-i", join(WORK, "mix.wav"),
    "-vf", `subtitles=out/video/work/subs.srt:force_style='${style}'`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT]);

  const final = duration(OUT);
  console.log(`\nvideo: ${OUT}`);
  console.log(`duration: ${final.toFixed(2)}s`);
  console.log(`cues: ${cues.length}`);
  if (final < 180) throw new Error(`video is ${final.toFixed(1)}s, needs at least 180s`);
}

await main();
