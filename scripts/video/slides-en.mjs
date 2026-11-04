import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const WORK = resolve("out/video/work-en");
const b64 = async (p) => `data:image/png;base64,${(await readFile(p)).toString("base64")}`;

const FONTS = "'Segoe UI', 'Segoe UI Variable Display', Tahoma, Arial, sans-serif";
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1280px;height:720px;background:#060a14}
body{font-family:${FONTS};direction:ltr;color:#e8eefb;overflow:hidden;text-align:left}
.slide{position:relative;width:1280px;height:720px;overflow:hidden;padding:58px 68px;
  background:
    radial-gradient(820px 460px at 88% 6%, rgba(45,212,191,.16), transparent 62%),
    radial-gradient(720px 500px at 6% 100%, rgba(96,165,250,.14), transparent 60%),
    linear-gradient(158deg,#070c17 0%,#0a1120 52%,#06101a 100%)}
.grid{position:absolute;inset:0;pointer-events:none;opacity:.5;
  background-image:linear-gradient(rgba(148,163,184,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.055) 1px,transparent 1px);
  background-size:54px 54px;
  mask-image:radial-gradient(900px 600px at 60% 30%, #000 20%, transparent 78%)}
.glow{position:absolute;width:420px;height:420px;border-radius:50%;filter:blur(90px);opacity:.22;pointer-events:none}
.footer{position:absolute;left:68px;right:68px;bottom:22px;display:flex;align-items:center;justify-content:space-between;
  font-size:13px;color:#7c8db0;letter-spacing:.2px;border-top:1px solid rgba(148,163,184,.12);padding-top:12px}
.brandline{display:flex;align-items:center;gap:10px;font-weight:600;color:#b9c7e2}
.mark{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#2dd4bf,#2563eb);display:grid;place-items:center;
  color:#03121a;font-weight:800;font-size:15px;box-shadow:0 0 22px rgba(45,212,191,.35)}
.badge{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;font-size:14px;
  background:rgba(45,212,191,.1);border:1px solid rgba(45,212,191,.35);color:#9ff5e7}
.chip{display:inline-flex;align-items:center;gap:9px;padding:11px 16px;border-radius:12px;font-size:16px;
  background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.2);color:#c9d6ee}
.chip b{color:#f8fafc;font-weight:700}
.chip span{color:#8ea3c6}
h1{font-size:84px;line-height:1;letter-spacing:-1.5px}
h2{font-size:42px;line-height:1.25;font-weight:800;letter-spacing:-.6px}
h2 em{font-style:normal;color:#2dd4bf}
.sub{font-size:23px;color:#a9b8d4;line-height:1.7}
.kicker{font-size:15px;font-weight:700;letter-spacing:1.2px;color:#2dd4bf;margin-bottom:14px}
.card{background:linear-gradient(180deg,rgba(17,27,47,.92),rgba(11,19,34,.92));border:1px solid rgba(148,163,184,.18);border-radius:18px}
.ico{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:rgba(45,212,191,.12);color:#5eead4}
.ico.blue{background:rgba(96,165,250,.13);color:#93c5fd}
.ico.gold{background:rgba(251,191,36,.13);color:#fcd34d}
.ico.red{background:rgba(248,113,113,.13);color:#fca5a5}
.tiny{font-size:13px;color:#8a9cbd;line-height:1.7}
.ltr{direction:ltr;unicode-bidi:isolate}

/* title */
.title-wrap{position:relative;height:582px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:18px}
.title-mark{width:96px;height:96px;border-radius:26px;background:linear-gradient(140deg,#2dd4bf,#2563eb);display:grid;place-items:center;
  font-size:46px;font-weight:900;color:#04121c;box-shadow:0 18px 60px rgba(37,99,235,.35)}
.title-wrap h1{font-size:88px;font-weight:800}
.lead{font-size:30px;color:#7fe9d9;font-weight:700;letter-spacing:0}
.title-chips{display:flex;gap:12px;margin-top:10px}
.title-note{margin-top:8px;font-size:15px;color:#8ea3c6}

/* problem */
.split{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:30px}
.issue-list{display:flex;flex-direction:column;gap:12px}
.issue{display:flex;align-items:center;gap:14px;padding:15px 16px;border-radius:14px;background:rgba(15,23,42,.8);border:1px solid rgba(148,163,184,.14)}
.issue .dot{width:26px;height:26px;border-radius:50%;background:rgba(248,113,113,.16);color:#fca5a5;display:grid;place-items:center;font-weight:800;font-size:15px;flex:none}
.issue b{font-size:18px;font-weight:650}
.issue span{display:block;font-size:14px;color:#93a4c3;margin-top:2px}
.sr{position:relative;border-radius:18px;border:1px solid rgba(148,163,184,.2);background:#0a1322;overflow:hidden;height:326px}
.sr-bar{display:flex;align-items:center;gap:7px;padding:12px 16px;background:#0d172a;border-bottom:1px solid rgba(148,163,184,.14)}
.sr-bar i{width:9px;height:9px;border-radius:50%;background:#334155;display:block}
.sr-body{padding:16px 20px;font-family:Consolas,'Courier New',monospace;direction:ltr;text-align:left;font-size:16px;line-height:2.05;color:#c7d5ee}
.sr-body .bad{color:#fca5a5}
.sr-body .tag{color:#64748b}
.sr-note{position:absolute;right:14px;bottom:12px;font-size:13px;color:#fca5a5;direction:ltr;text-align:right}

/* idea */
.cards3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:28px}
.mcard{padding:22px;height:286px;display:flex;flex-direction:column;gap:12px}
.mcard h3{font-size:24px;font-weight:750}
.mcard .role{font-size:13px;color:#2dd4bf;font-weight:700;letter-spacing:.8px}
.mcard p{font-size:15.5px;line-height:1.7;color:#a9b8d4}
.flow{display:flex;align-items:center;gap:10px;margin-top:24px;font-size:17px;color:#c9d6ee}
.flow .step{padding:9px 16px;border-radius:11px;background:rgba(45,212,191,.09);border:1px solid rgba(45,212,191,.25)}
.flow .arrow{color:#4b607f}
.flow .tail{margin-left:auto;font-size:14px;color:#7c8db0}

/* pipeline */
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:30px}
.step{padding:20px 18px;min-height:330px;display:flex;flex-direction:column;gap:10px}
.step .num{font-size:34px;font-weight:800;color:rgba(45,212,191,.55);letter-spacing:-1px}
.step h3{font-size:22px}
.step ul{list-style:none;display:flex;flex-direction:column;gap:9px;margin-top:2px}
.step li{font-size:14.5px;line-height:1.6;color:#a9b8d4;padding-left:14px;position:relative}
.step li:before{content:'';position:absolute;left:0;top:8px;width:5px;height:5px;border-radius:50%;background:#2dd4bf}
.step .tagline{margin-top:auto;font-size:12.5px;color:#7c8db0}

/* fixes */
.tiles{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr;gap:14px;margin-top:26px}
.tile{padding:20px;display:flex;gap:14px;align-items:flex-start}
.tile h3{font-size:19px;margin-bottom:4px}
.tile p{font-size:13.5px;line-height:1.6;color:#9badc9}
.note{margin-top:18px;font-size:15px;color:#8ea3c6}
.note b{color:#e8eefb}

/* beautify */
.ba{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:22px}
.shot{position:relative;border-radius:14px;overflow:hidden;border:1px solid rgba(148,163,184,.22);height:250px;background:#0b1220}
.shot img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.shot .lbl{position:absolute;top:10px;left:10px;padding:6px 12px;border-radius:999px;font-size:13px;background:rgba(2,6,23,.82);border:1px solid rgba(148,163,184,.25)}
.shot.after .lbl{background:rgba(13,148,136,.9);border-color:transparent;color:#ecfeff}
.copy{display:flex;flex-direction:column;gap:9px;margin-top:16px}
.crow{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:11px;background:rgba(15,23,42,.75);border:1px solid rgba(148,163,184,.14);font-size:15px}
.crow .old{color:#93a4c3;text-decoration:line-through;text-decoration-color:rgba(248,113,113,.6)}
.crow .arr{color:#4b607f}
.crow .new{color:#7fe9d9;font-weight:650}
.crow .why{margin-left:auto;font-size:12.5px;color:#7c8db0}
.pill{position:absolute;top:22px;right:68px}

/* proof */
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:26px}
.metric{padding:18px 20px}
.metric .k{font-size:13.5px;color:#93a4c3}
.metric .v{font-size:42px;font-weight:800;letter-spacing:-1px;margin-top:6px}
.metric .v .from{color:#f87171;font-size:26px;font-weight:700}
.metric .v .arr{color:#4b607f;font-size:24px;margin:0 8px}
.metric .v .to{color:#2dd4bf}
.proof-bottom{display:grid;grid-template-columns:1.15fr .85fr;gap:18px;margin-top:18px}
.report{border-radius:14px;overflow:hidden;border:1px solid rgba(148,163,184,.2);height:214px;background:#0b1220}
.report img{width:100%;height:100%;object-fit:cover;object-position:top}
.proof-notes{padding:18px;display:flex;flex-direction:column;gap:10px}
.proof-notes .line{display:flex;align-items:center;gap:10px;font-size:15px;color:#b9c7e2}
.proof-notes .line i{width:7px;height:7px;border-radius:50%;background:#2dd4bf;display:block;flex:none}
.proof-notes .human{margin-top:auto;padding:10px 12px;border-radius:10px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);font-size:13.5px;color:#fcd34d}

/* close */
.close{height:582px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px}
.close h1{font-size:78px}
.close .sub{font-size:26px}
.close .lines{display:flex;flex-direction:column;gap:7px;margin-top:8px;font-size:19px;color:#b9c7e2}
.close .lines b{color:#7fe9d9}
`;

const html = (body, n) => `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="slide" id="slide">
  <div class="grid"></div><div class="glow" style="background:#2dd4bf;top:-140px;right:-100px"></div><div class="glow" style="background:#2563eb;bottom:-160px;left:-80px"></div>
  ${body}
  <div class="footer"><div class="brandline"><span class="mark">M</span> Mada Fixer</div><div>Meta Global AI Developer Hackathon · Indie</div><div>${String(n).padStart(2, "0")} / 07</div></div>
</div></body></html>`;

const footerless = (body) => `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><style>${CSS}html,body{background:transparent!important}</style></head><body>${body}</body></html>`;

const icon = (path) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const ICONS = {
  eye: icon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  brain: icon('<path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5.8V15a3 3 0 0 0 4 2.8V21"/><path d="M15 3a3 3 0 0 1 3 3v1a3 3 0 0 1 1 5.8V15a3 3 0 0 1-4 2.8V21"/><path d="M9 7h6M9 12h6"/>'),
  code: icon('<path d="m8 7-4 5 4 5M16 7l4 5-4 5M13 4l-2 16"/>'),
  scan: icon('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/>'),
  keyboard: icon('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
  focus: icon('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1"/>'),
  contrast: icon('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none"/>'),
  layout: icon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'),
  rtl: icon('<path d="M4 7h12M4 12h9M4 17h12"/><path d="m18 10 3 3-3 3"/>'),
  check: icon('<path d="m20 6-11 11-5-5"/>'),
  human: icon('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  wrench: icon('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-3-3 2.3-2.3Z"/>'),
};

async function renderSlides() {
  await mkdir(WORK, { recursive: true });
  const before = await b64("out/before.png");
  const after = await b64("out/after.png");
  const table = await b64("out/video/frames/f-46.png");

  const slides = {};

  slides.title = html(`<div class="title-wrap">
    <div class="badge">Meta Global AI Developer Hackathon · Indie</div>
    <div class="title-mark">M</div>
    <h1>Mada Fixer</h1>
    <div class="lead">Real Arabic accessibility</div>
    <div class="sub">An agent that sees, understands, fixes — and proves the fix worked.</div>
    <div class="title-chips">
      <span class="chip"><b>SAM 3.1</b><span>Vision</span></span>
      <span class="chip"><b>Muse Spark</b><span>Understanding + critic</span></span>
      <span class="chip"><b>Muse Wonder</b><span>Code patches</span></span>
    </div>
    <div class="title-note">Audit → Fix → Proof, on a real page.</div>
  </div>`, 1);

  slides.problem = html(`<div class="kicker">THE PROBLEM</div><h2>A screen reader says: image, image, button, button</h2>
  <div class="split">
    <div class="issue-list">
      <div class="issue"><div class="dot">×</div><div><b>Images with no description</b><span>No alt text, so the image does not exist for a screen reader.</span></div></div>
      <div class="issue"><div class="dot">×</div><div><b>Emoji buttons with no name</b><span>The icon is obvious to sighted users; its accessible name is empty.</span></div></div>
      <div class="issue"><div class="dot">×</div><div><b>Mouse-only controls</b><span>A div handles click, but it cannot be reached or activated from a keyboard.</span></div></div>
      <div class="issue"><div class="dot">×</div><div><b>Low-contrast Arabic text</b><span>axe-core misses part of it, so the issue slips through.</span></div></div>
      <div class="note"><b>Traditional tools stop at the report.</b> We continue to the fix.</div>
    </div>
    <div class="sr">
      <div class="sr-bar"><i></i><i></i><i></i><span style="margin-left:auto;font-size:12px;color:#64748b">screen reader</span></div>
      <div class="sr-body">
        <div><span class="tag">- </span>img <span class="bad">(no name)</span></div>
        <div><span class="tag">- </span>button <span class="bad">(no name)</span></div>
        <div><span class="tag">- </span>link "🛒"</div>
        <div><span class="tag">- </span>img <span class="bad">(no name)</span></div>
        <div><span class="tag">- </span>textbox <span class="bad">(no label)</span></div>
      </div>
      <div class="sr-note">8 unnamed elements on the demo page</div>
    </div>
  </div>`, 2);

  slides.idea = html(`<div class="kicker">THE IDEA</div><h2>Not an audit tool. <em>An agent that fixes and proves.</em></h2>
  <div class="cards3">
    <div class="card mcard"><div class="ico blue">${ICONS.eye}</div><div class="role">VISION</div><h3>SAM 3.1</h3><p>Looks at the rendered page like a user, and finds unlabeled icons and images that axe cannot flag.</p></div>
    <div class="card mcard"><div class="ico">${ICONS.brain}</div><div class="role">UNDERSTAND + CRITIC</div><h3>Muse Spark</h3><p>Writes Arabic names and alt text, while a second critic checks each proposal against the pixels and rewrites or rejects it.</p></div>
    <div class="card mcard"><div class="ico gold">${ICONS.code}</div><div class="role">CODE</div><h3>Muse Wonder</h3><p>Returns fixes to the source itself, as a small, reviewable diff that can be applied or rejected.</p></div>
  </div>
  <div class="flow"><span class="step">See</span><span class="arrow">→</span><span class="step">Understand</span><span class="arrow">→</span><span class="step">Fix</span><span class="arrow">→</span><span class="step">Verify</span><span class="tail">all through the Meta Model API</span></div>`, 3);

  slides.pipeline = html(`<div class="kicker">HOW IT WORKS</div><h2>Four stages, each with evidence</h2>
  <div class="steps">
    <div class="card step"><div class="num">01</div><div class="ico">${ICONS.scan}</div><h3>See</h3><ul><li>Real browser + axe-core</li><li>Keyboard navigation</li><li>Arabic-specific contrast</li><li>Screenshots for vision</li></ul><div class="tagline">Wider than a DOM scan</div></div>
    <div class="card step"><div class="num">02</div><div class="ico blue">${ICONS.brain}</div><h3>Understand</h3><ul><li>Spark proposes name or alt</li><li>Critic compares with pixels</li><li>Confidence per proposal</li><li>Low confidence goes to review</li></ul><div class="tagline">No silent guessing</div></div>
    <div class="card step"><div class="num">03</div><div class="ico gold">${ICONS.wrench}</div><h3>Fix</h3><ul><li>Changes on the live page</li><li>Before/after diff per edit</li><li>role, tabindex, keyboard</li><li>Optional theme + copy</li></ul><div class="tagline">Real change, not advice</div></div>
    <div class="card step"><div class="num">04</div><div class="ico red">${ICONS.check}</div><h3>Verify</h3><ul><li>Full re-scan</li><li>Issue count before/after</li><li>Screen-reader output</li><li>Element movement and pixels</li></ul><div class="tagline">Measurable result</div></div>
  </div>`, 4);

  slides.beautify = html(`<div class="kicker">BEAUTIFY MODE</div><h2>Intentional redesign, <em>not random decoration</em></h2>
  <div class="ba">
    <div class="shot"><img src="${before}"><div class="lbl">Before</div></div>
    <div class="shot after"><img src="${after}"><div class="lbl">After</div></div>
  </div>
  <div class="copy">
    <div class="crow"><span class="old">أضف للسلة</span><span class="arr">→</span><span class="new">أضف إلى السلة</span><span class="why">Clearer CTA</span></div>
    <div class="crow"><span class="old">السعر: ٢٤٩٩ جنيه</span><span class="arr">→</span><span class="new">٢٤٩٩ جنيه فقط</span><span class="why">Every number preserved</span></div>
    <div class="crow"><span class="old">عروض اليوم</span><span class="arr">→</span><span class="new">عروض اليوم المميزة</span><span class="why">Same meaning, clearer</span></div>
  </div>
  <div class="pill badge">An accessible theme + 9 rewritten texts</div>`, 5);

  slides.proof = html(`<div class="kicker">PROOF</div><h2>Results, measured on a real page</h2>
  <div class="metrics">
    <div class="card metric"><div class="k">Targeted WCAG issues</div><div class="v"><span class="from">24</span><span class="arr">→</span><span class="to">0</span></div></div>
    <div class="card metric"><div class="k">Unnamed elements</div><div class="v"><span class="from">8</span><span class="arr">→</span><span class="to">0</span></div></div>
    <div class="card metric"><div class="k">Fixes applied</div><div class="v">36</div></div>
    <div class="card metric"><div class="k">Intentional visual change</div><div class="v">43.74%</div></div>
  </div>
  <div class="proof-bottom">
    <div class="report"><img src="${table}"></div>
    <div class="card proof-notes">
      <div class="line"><i></i>Full HTML + JSON report</div>
      <div class="line"><i></i>Screen-reader output, before and after</div>
      <div class="line"><i></i>Real source diff via Muse Wonder</div>
      <div class="line"><i></i>Pixel change and element movement</div>
      <div class="human">Needs human review? It is listed, not guessed.</div>
    </div>
  </div>`, 6);

  slides.close = html(`<div class="close">
    <div class="badge">Meta Global AI Developer Hackathon</div>
    <h1>Mada Fixer</h1>
    <div class="lead">Real Arabic accessibility</div>
    <div class="sub">From audit, to fix, to proof.</div>
    <div class="lines"><div>Built with <b>SAM 3.1</b>, <b>Muse Spark</b> and <b>Muse Wonder</b>.</div><div>Open source — entirely written during the hackathon.</div></div>
  </div>`, 7);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  for (const [name, content] of Object.entries(slides)) {
    await page.setContent(content, { waitUntil: "load" });
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(WORK, `slide-${name}.png`) });
  }

  const overlaySpeed = footerless(`<div style="width:1280px;height:720px;background:transparent">
    <div style="position:absolute;left:20px;top:16px;display:flex;align-items:center;gap:8px;background:rgba(3,7,18,.86);border:1px solid rgba(148,163,184,.25);padding:7px 13px;border-radius:10px;font-size:14px;color:#c9d6ee">
      <b style="color:#2dd4bf">×5</b> playback
    </div>
  </div>`);
  await page.setContent(overlaySpeed, { waitUntil: "load" });
  await page.screenshot({ path: join(WORK, "overlay-speed.png"), omitBackground: true });

  await browser.close();
  return slides;
}

export { renderSlides, WORK };
