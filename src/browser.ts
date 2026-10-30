import { chromium, type Browser, type Page } from "playwright";
import { envNum } from "./util.js";

const USER_AGENT = process.env.MADA_USER_AGENT ?? "MadaFixer/0.1 (Arabic accessibility audit; read-only; see repository)";

export const launch = () =>
  chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: process.env.HEADLESS !== "0",
    args: process.env.CHROMIUM_ARGS?.split(" ").filter(Boolean),
  });

export async function newPage(browser: Browser): Promise<Page> {
  // bypassCSP keeps axe-core working on sites that send Content-Security-Policy headers.
  const context = await browser.newContext({
    locale: "ar-EG",
    viewport: { width: 1280, height: 900 },
    bypassCSP: true,
    reducedMotion: "reduce",
    userAgent: USER_AGENT,
  });
  const page = await context.newPage();
  const timeout = envNum("PAGE_TIMEOUT_MS", 15_000, 1_000, 120_000);
  page.setDefaultTimeout(timeout);
  page.setDefaultNavigationTimeout(envNum("NAV_TIMEOUT_MS", 45_000, 3_000, 180_000));
  await page.addInitScript("window.__name = (f) => f;"); // tsx/esbuild injects __name into evaluate() callbacks
  return page;
}
