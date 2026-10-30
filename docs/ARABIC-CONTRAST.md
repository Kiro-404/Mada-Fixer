# Why axe-core can miss contrast on Arabic text (and what Mada Fixer does)

## The observation

axe-core 4.14's `color-contrast` rule uses a font-rendering heuristic (`text.isIconLigature`) to avoid flagging icon-font glyphs as text. The heuristic measures whether the rendered text width matches the expected width for the characters. Joined Arabic script, with its contextual forms and ligatures (لا، ﷲ، etc.), can look "different enough" that the heuristic treats the text as an icon and **skips the contrast check for that element**.

We saw this on the bundled demo depending on the installed font: some Arabic paragraphs were checked, others were silently skipped, while Latin text on the same page was always checked. The behavior is font-dependent, so it is not a stable browser bug report — but a tool that only trusts axe-core cannot claim to have audited Arabic text.

## The added scan

`src/verify/axe.ts` → `arabicContrast()` runs after axe on every audit:

- considers only elements that have **their own** text node containing Arabic (`\u0600-\u06FF`), so parents are not double-counted;
- skips elements axe already reported (`known` selectors) to avoid duplicates;
- skips hidden/disabled elements and elements with `opacity < 1` or a background image (can't be computed reliably);
- walks up the ancestors, alpha-composites the background layers, and computes the WCAG relative-luminance ratio of the composited text color;
- uses WCAG 1.4.3 thresholds: **4.5:1** for normal text, **3:1** for large text (≥ 24 px, or ≥ 18.66 px bold);
- emits a normal `color-contrast` issue with `fgColor`, `bgColor`, `contrastRatio`, `expectedContrastRatio`, so the rest of the pipeline (fix, report, diff) treats it like any other contrast issue.

The fix (`src/fix/contrast.ts`) keeps the hue and moves the text color toward black or white by the **smallest 2% step** that passes `target + 0.05` safety margin. It never changes the background, so layout and other colors stay intact; contrast changes are expected to change pixels (the report says so explicitly).

## How to verify

```bash
npm run units        # contrast math: #rgb / rgb() inputs, dark backgrounds, bad input
npm run fix -- file://$PWD/demo/index.html --audit
# open out/report.html: the issue table and the "needs human" table show every
# color-contrast issue, including ones axe did not report.
```

In your own browser, compare the report with DevTools' contrast checker on the same Arabic paragraph, and try another font: the axe behavior may change, the Mada Fixer scan should not.

## Limits (read this before quoting the finding)

- **Logos and logotypes** are exempt from WCAG 1.4.3; the scan does not know a brand mark from body text and may flag it. Review contrast fixes on brand elements.
- **Inactive/disabled** components are exempt; the scan skips `disabled` form controls but not every custom "disabled-looking" widget.
- Text over **images, gradients, opacity or blend modes** is skipped rather than guessed.
- The scan uses the computed color of the element, not per-pixel text antialiasing; subpixel rendering and thin fonts can make the real ratio slightly different.
- Transparent backgrounds are composited up the ancestor chain; if an ancestor is an image, the element is skipped.
- This is a WCAG 1.4.3 check, not 1.4.11 (non-text contrast) or 1.4.6 (AAA).

The claim we make in the README is deliberately narrow: **axe-core can skip Arabic text in its icon-ligature heuristic; we run a separate, deterministic check.** We do not claim axe is wrong on Latin text, and we do not claim our scan replaces manual review.
