import { chromium, type Browser, type Page } from "playwright";

export const launch = () => chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    "--disable-web-security",
    "--disable-blink-features=TrustedTypes",
    ...(process.env.CHROMIUM_ARGS?.split(" ").filter(Boolean) || []),
  ],
});

export async function newPage(browser: Browser) {
  const page = await browser.newPage({
    bypassCSP: true,
    locale: "ar-EG",
    viewport: { width: 1280, height: 900 },
    userAgent: process.env.USER_AGENT || undefined,
  });
  page.setDefaultTimeout(15000);
  await page.addInitScript(`
    window.__name = (f) => f;
    if (typeof window !== "undefined" && window.trustedTypes && !window.trustedTypes.defaultPolicy) {
      try {
        window.trustedTypes.createPolicy('default', {
          createHTML: (s) => s,
          createScript: (s) => s,
          createScriptURL: (s) => s,
        });
      } catch (e) {}
    }
  `);
  return page;
}

// Real sites keep polling or hang on third-party resources: a partially loaded page is still worth checking, so never wait forever.
export async function openPage(page: Page, url: string) {
  try { await page.goto(url, { waitUntil: "load", timeout: 30000 }); }
  catch (e) { if (page.url() === "about:blank") throw e; }
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
}
