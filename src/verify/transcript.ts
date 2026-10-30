import type { Page } from "playwright";

const UNNAMED = /^\s*- (img|button|link|textbox|combobox|checkbox)(\s*(:|$|\[)|\s+"[^\p{L}\p{N}"]*")/u;
const NAMED_PARENT = /^\s*- (link|button) "/;

// Counts images/controls a screen reader would announce without a meaningful name.
// A nameless image inside a named link/button is decoration (the control already has its name), so it is not counted.
export function countUnnamed(text: string): number {
  const lines = text.split("\n");
  let n = 0;
  lines.forEach((l, i) => {
    if (!UNNAMED.test(l)) return;
    if (/^\s*- img/.test(l)) {
      const ind = l.search(/\S/);
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j].search(/\S/) < ind) { if (NAMED_PARENT.test(lines[j])) return; break; }
      }
    }
    n++;
  });
  return n;
}

// What a screen reader would announce (accessibility tree) + count of nameless images/controls.
export async function transcript(page: Page) {
  const text = await page.locator("body").ariaSnapshot();
  return { text, unnamed: countUnnamed(text) };
}
