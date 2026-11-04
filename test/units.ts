import { launch, newPage } from "../src/browser.js";
import { scan } from "../src/verify/scan.js";
import { structureOps } from "../src/fix/structure.js";
import { countUnnamed } from "../src/verify/transcript.js";
import { robotsAllowsAll } from "../src/robots.js";
import { fixColor, ratio } from "../src/fix/contrast.js";

// Detector tests on tiny pages (real browser, no model API). Run: npm run units
const browser = await launch();
const page = await newPage(browser);
const load = async (html: string) => { await page.setContent(html); await page.evaluate("window.__name = (f) => f"); };
const ids = async (html: string) => { await load(html); return (await scan(page)).map((i) => i.id); };
const AR = "هذا نص عربي طويل بما يكفي لاختبار الكشف عن الاتجاه";
const results: [string, boolean][] = [];
const t = (n: string, ok: boolean) => results.push([n, ok]);

t("Arabic page without dir is flagged", (await ids(`<body style="direction:ltr"><p>${AR}</p></body>`)).includes("arabic-dir"));
t("Arabic page with rtl is not flagged", !(await ids(`<body style="direction:rtl"><p>${AR}</p></body>`)).includes("arabic-dir"));
t("outline:none buttons are flagged", (await ids(`<style>button{outline:none}</style><button>أ</button><button>ب</button>`)).includes("focus-invisible"));
t("default focus ring passes", !(await ids(`<button>أ</button><button>ب</button>`)).includes("focus-invisible"));
t("clickable div is flagged", (await ids(`<div onclick="1" style="cursor:pointer">x</div>`)).includes("custom-control"));
t("clickable div with role+tabindex+keydown passes", !(await ids(`<div onclick="1" role="button" tabindex="0" onkeydown="1" style="cursor:pointer">x</div>`)).includes("custom-control"));
t("click inside a real button is ignored", !(await ids(`<button><span onclick="1" style="cursor:pointer">x</span></button>`)).includes("custom-control"));
const main = async (html: string) => { await load(html); return (await structureOps(page, [{ id: "landmark-one-main", impact: null, selector: "html", html: "" }])).some((o) => o.attr === "role"); };
t("wrapper div becomes main", await main(`<div id="a"><p>${AR} ${AR}</p><p>x</p></div>`));
t("content inside a layout wrapper with nav becomes main", await main(`<div id="a"><nav>قائمة</nav><div id="c"><p>${AR} ${AR}</p></div><footer>ذيل</footer></div>`));
t("split content next to nav is left to a human", !(await main(`<div id="a"><nav>قائمة</nav><p>${AR}</p><p>${AR}</p></div>`)));
t("contrast fix passes 4.5:1", ratio([0x74, 0x74, 0x74], [255, 255, 255]) >= 4.5 && /^#[0-9a-f]{6}$/.test(fixColor("#bbbbbb", "#ffffff", 4.5) ?? ""));
t("contrast fix works on dark backgrounds", (() => { const c = fixColor("#444444", "#222222", 4.5)!; const n = parseInt(c.slice(1), 16); return ratio([n >> 16, (n >> 8) & 255, n & 255], [0x22, 0x22, 0x22]) >= 4.5; })());

t("nameless image inside a named link is decoration", countUnnamed('- link "السلة":\n  - /url: /cart\n  - img') === 0);
t("nameless image inside a nameless link counts", countUnnamed('- link:\n  - /url: /cart\n  - img') === 2);
t("emoji-only button counts", countUnnamed('- button "🔍"') === 1);
t("robots: Disallow / for * blocks", !robotsAllowsAll("User-agent: *\nDisallow: /"));
t("robots: partial disallow is fine", robotsAllowsAll("User-agent: *\nDisallow: /admin"));
t("robots: other bots are ignored", robotsAllowsAll("User-agent: BadBot\nDisallow: /"));
await browser.close();
for (const [n, ok] of results) console.log(ok ? "PASS" : "FAIL", n);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
