# سكريبت الفيديو

**قبل التسجيل:** مفتاح ميتا لازم يكون شغال. الفيديو المسجّل حاليًا اتعمل بالـ fallback بتاع Groq، وبيظهر في لوحة اللوج `[groq]`، فما ينفعش يتسلّم كإثبات استخدام موديلات ميتا. بعد ما `MODEL_API_KEY` يشتغل، شغّل `npm run check` وبعدين `npm run demo:video` عشان يتسجّل تلقائيًا على مسار ميتا.

## English 3:00 cut (for Meta review)

File: `out/video/mada-fixer-explainer-en.mp4` — 180 seconds, 1280×720, fully English: slides, voice-over (`en-US-BrianNeural`), captions and speed chip. About 68 seconds of it is real product footage (open → scan → results → rebuilt page → report), so reviewers see the experience, not only claims.

| Time | Visual | Narration |
|---|---|---|
| 0:00–0:15 | Title slide: model chips, audit → fix → proof | For millions of Arabic speakers, a screen reader is the only way online. Most Arabic sites are still unusable with one. Mada Fixer changes that. |
| 0:15–0:34 | Problem slide: four real defects + screen-reader output | This demo store has real problems: images with no description, emoji buttons with no name, controls that only respond to a mouse, and low-contrast Arabic text. A screen reader just says: image, image, button, button. |
| 0:34–0:51 | Idea slide: SAM 3.1, Muse Spark, Muse Wonder | Mada Fixer is not another audit tool. It is an agent that changes the page: it sees the screen like a user, understands what is missing, fixes it, and proves the fix, with Meta models SAM 3.1, Muse Spark and Muse Wonder. |
| 0:51–1:18 | Pipeline slide: see → understand → fix → verify | Four stages. See: a real browser, axe-core, keyboard checks and Arabic-specific contrast. Understand: Muse Spark writes the Arabic names, while a critic compares each proposal to the pixels and sends low confidence to human review. Fix: every change is applied to the live page, with a diff. Verify: we re-scan issues, screen-reader output and layout movement. |
| 1:18–1:46 | **Live footage**: UI opens, store selected, scan at ×5, results 24→0 / 8→0, before/after | Let's watch it work. We open the interface, point it at the demo store, enable Beautify, and start the run. The agent scans the live page, proposes fixes, applies them, and immediately re-audits. Look at the result: 24 targeted WCAG issues down to zero, 8 unnamed elements down to zero, 36 fixes applied. These before-and-after captures come from the same run. |
| 1:46–1:55 | Beautify slide: before/after + three copy rewrites | Beautify is opt-in and auditable: an accessible theme and clearer Arabic copy, with every number preserved. |
| 1:55–2:18 | **Live footage**: rebuilt store page, keyboard focus, nine rewrites | Here is the rebuilt page, live in the browser. A high-contrast theme, readable Arabic type, visible keyboard focus, and nine copy rewrites, all marked as intentional, not hidden. Prices, discounts and product names stay exactly the same, and screen-reader output now gives real Arabic labels instead of button, button, image. |
| 2:18–2:31 | Proof slide: metrics, report capture, review note | Every change is measured. The report shows issues before and after, screen-reader output, pixel change and element movement, and anything that needs human judgment is listed, not guessed. |
| 2:31–2:48 | **Live footage**: report rows, confidence scores, audit table | This is the report. Each rewrite is validated, with its confidence score. The audit table keeps the remaining structure issues visible for a human. And in repo mode, Muse Wonder returns a small, reviewable diff against the source. |
| 2:48–3:00 | Close slide | Mada Fixer: real Arabic accessibility, from audit to fix to proof, with Meta models. Open source, and built entirely during the hackathon. |

The demo UI is in Arabic on purpose: that is the product's target. Everything around it — narration, slides, captions, overlay labels — is English for the Meta review.

## النسخة القصيرة (48 ثانية، مطابقة للفيديو الحالي)

الأرقام دي من الفيديو المسجّل. لو رقم اتغيّر بعد إعادة التسجيل، انطق الرقم اللي ظاهر على الشاشة.

**0:00–0:05 — التعريف**
> دي Mada Fixer، وكيل ذكاء اصطناعي بيصلّح إتاحة المواقع العربية من أول الفحص لحد تعديل الكود، وبيشتغل بموديلات ميتا: Muse Spark و Muse Wonder و SAM 3.1.

**0:05–0:23 — التشغيل**
> بنشغّله على متجر عربي تجريبي فيه مشاكل حقيقية: صور من غير وصف، أزرار إيموجي من غير اسم، عناصر بتشتغل بالماوس بس، وتباين ضعيف في النص العربي. الأداة بتفحص بـ axe-core، وبتجرّب التنقل بلوحة المفاتيح، وSAM بيبص على الشاشة ويلاقي العناصر اللي axe مش شايفها.

**0:23–0:31 — النتيجة قبل/بعد**
> النتيجة: 24 مخالفة WCAG مستهدفة وصلت لصفر، و8 عناصر من غير اسم لقارئ الشاشة وصلت لصفر، بـ36 إصلاح. ودي لقطات قبل وبعد.

**0:31–0:41 — الصفحة المصلّحة**
> ومش مجرد إصلاحات مخفية: وضع التحسين بيعيد تصميم الصفحة بثيم متاح، ويعيد صياغة العناوين والأسعار والأزرار بالعربي مع الحفاظ على كل رقم وكل معلومة. الصفحة بقت أوضح وأنضف.

**0:41–0:48 — التقرير والختام**
> وفي التقرير كل تغيير موثّق: 9 نصوص محسّنة، وثيم بصري متاح كامل، والتغيير البصري متعلّم إنه مقصود. وأي حاجة محتاجة مراجعة بشرية بتظهر في قائمة منفصلة. Mada Fixer، إتاحة عربية حقيقية بموديلات ميتا.

### English narration (for reviewers)

> Meet Mada Fixer: an agent that audits and fixes Arabic web accessibility end to end, using Meta models. It runs axe-core plus keyboard and contrast checks, while SAM 3.1 watches the rendered page and finds unlabeled icons axe cannot flag. Muse Spark writes Arabic names and captions, and a second critic pass checks each one. On this broken store demo it takes 24 targeted WCAG issues and 8 unnamed controls down to zero with 36 fixes. Then Beautify mode applies an accessible theme and rewrites Arabic headings, prices and CTAs while preserving every number. Every change is documented, and low-confidence edits go to human review. Mada Fixer: real Arabic accessibility, with Meta models.

## فيديو الشرح المنتج (3:00) — السكريبت المطابق

الملف: `out/video/mada-fixer-explainer.mp4` — 180 ثانية بالضبط، 1280×720، تعليق عربي (`ar-EG-ShakirNeural`) + موسيقى هادئة + ترجمة على اللقطات الحقيقية. ده نفس النص اللي اتسجل فعلاً، فلو هتعيد التسجيل انطقه زي ما هو.

| الوقت | المشهد | النص |
|---|---|---|
| 0:00–0:19 | شريحة العنوان + أسماء موديلات ميتا | لملايين المستخدمين، قارئ الشاشة هو الطريقة الوحيدة لاستخدام الإنترنت. لكن معظم المواقع العربية بتتكتب من غير أسماء للأزرار والصور، ومن غير تنقل بلوحة المفاتيح. ده اللي Mada Fixer بيحله. |
| 0:19–0:41 | شريحة المشكلة: صور وأزرار من غير اسم، تباين ضعيف | المتجر اللي قدامك فيه مشاكل حقيقية: صور من غير وصف، أزرار إيموجي من غير اسم، عناصر بتشتغل بالماوس بس، ونص عربي تباينه ضعيف. قارئ الشاشة بيقول: صورة، صورة، زر، زر، من غير أي معنى. |
| 0:41–1:01 | شريحة الفكرة: وكيل بيصلّح مش أداة فحص | Mada Fixer مش أداة فحص، ده وكيل بيغيّر الصفحة فعلاً: بيشوفها زي المستخدم، بيفهم المشكلة، بيصلّحها، وبعدين بيثبت إن الإصلاح نجح. وبيستخدم موديلات ميتا: Muse Spark وMuse Wonder وSAM 3.1. |
| 1:01–1:27 | شريحة خط الأنابيب: فحص ← فهم ← إصلاح ← تحقق | دورة العمل أربع خطوات: نشوف بمتصفح حقيقي وفحص axe وتنقل بلوحة المفاتيح وتباين عربي. نفهم: Spark بيكتب الأسماء، وناقد بيقارن بالصورة، والثقة المنخفضة تروح لمراجعة بشرية. نصلّح على الصفحة الحية مع diff. ونتحقق بإعادة الفحص وقياس المشاكل وحركة العناصر. |
| 1:27–1:45 | شريحة الإصلاحات: أزرار حقيقية، فوكس، skip link، lang | والإصلاحات مش نصوص بس: أزرار حقيقية بدل الـ div، حلقة فوكس واضحة، main وskip link، عنوان صفحة وlang، وتكبير مسموح. وكل ده على الصفحة نفسها، مش توصيات. |
| 1:45–2:05 | تشغيل حقيقي مسرّع ×6 ثم النتيجة 24→0 و8→0 و36 إصلاح | تعالى نشوف عمليًا. بنفتح الواجهة، نختار المتجر، ونشغّل الفحص مع التحسين. 24 مخالفة WCAG و8 عناصر من غير اسم، والنتيجة صفر وصفر بـ36 إصلاح. ودي لقطات قبل وبعد. |
| 2:05–2:25 | شريحة التحسين + الصفحة المصلّحة بالثيم الجديد | وضع التحسين بيعيد التصميم بثيم متاح كامل، ويعيد صياغة العناوين والأسعار والأزرار بالعربي، مع الحفاظ على كل رقم وكل ادعاء. في التقرير 9 نصوص جديدة، والتغييرات متعلّمة إنها مقصودة. |
| 2:25–2:45 | شريحة الإثبات + تقرير التغييرات + أسطر تحتاج مراجعة بشرية | والدليل مش كلام. التقرير بيوري المشاكل قبل وبعد، ونص قارئ الشاشة، ونسبة البكسلات اللي اتغيّرت. وفي وضع الريبو، Muse Wonder بيرجّع التعديلات للكود ويطلّع diff صغير. وأي حاجة محتاجة تدخل بشري بتتسجل. |
| 2:45–3:00 | شريحة الختام | Mada Fixer: إتاحة عربية حقيقية، من الفحص للتعديل للإثبات، بموديلات ميتا. والكود كله مفتوح المصدر، واتكتب خلال الهاكاثون. |

**English narration (3-minute cut):**

> For millions of users, a screen reader is the only way online. Yet most Arabic sites ship without names for buttons and images, and with no keyboard navigation. That is what Mada Fixer fixes. This demo store has real problems: unlabeled images, emoji buttons without accessible names, mouse-only interactions, and low-contrast Arabic text. A screen reader just says: image, image, button, button — with no meaning. Mada Fixer is not an audit tool; it is an agent that changes the page: it sees like a user, understands the problem, fixes it, then proves the fix. It uses Meta models: Muse Spark, Muse Wonder and SAM 3.1. Four stages: see, with a real browser, axe, keyboard and Arabic contrast checks; understand, where Spark writes names and a critic checks against the pixels, sending low confidence to human review; fix on the live page with a diff; and verify by re-scanning and measuring issue count and element movement. Fixes are not just text: real buttons instead of divs, a visible focus ring, main and skip links, page title and lang, and allowed zoom. All applied to the page itself. Here it is running: 24 WCAG issues and 8 unnamed elements become zero with 36 fixes. Beautify mode then applies a full accessible theme and rewrites Arabic headings, prices and CTAs while preserving every number and claim: 9 copy rewrites, all marked as intentional. The report shows before and after, screen-reader output and the pixel change. In repo mode, Muse Wonder writes the patch and produces a small diff. Anything that needs human judgement is listed, not guessed. Mada Fixer: real Arabic accessibility, from audit to fix to proof, with Meta models. Fully open source, written during the hackathon.

## النسخة الطويلة (حتى 3 دقايق)

سجّل التشغيلات الحقيقية بالموديلات الحقيقية (مش الـ mock). الأرقام بين [ ] من نتايجك أنت.

**0:00-0:25 المشكلة.** افتح موقع تجريبي مكسور في قارئ شاشة (أو `reader-before.txt`): "link, img, button, img, textbox" ومفيش معنى. جملة: "٣٠٠ مليون ناطق بالعربي، ومعظم مواقعهم مش مقروءة لقارئ الشاشة."

**0:25-0:55 الوكيل بيشوف.** شغّل `npm run fix -- <url>`. وضّح إن SAM 3.1 بيبص على لقطة الشاشة زي المستخدم ويلاقي عناصر axe مش شايفها (زر أيقونة من غير نص). جملة: "ده اللي الأدوات التقليدية بتفوّته."

**0:55-1:30 الفهم والنقد.** وريّ `report.html`: Muse Spark كتب الوصف بالعربي، وبعدين مراجع تاني بيشوف الصورة ويرفض أو يحسّن. وريّ عمود الثقة، وإن أي تعديل ثقته منخفضة راح "مراجعة بشرية" ومتطبّقش. جملة: "بنعترف بحدود الـ AI."

**1:15-1:30 مش نصوص بس.** وريّ جدول "إيه اللي بيصلحه" في README: لوحة المفاتيح (div بقى زر حقيقي)، حلقة الفوكس، main وskip link، عنوان الصفحة، والـ zoom.

**1:30-2:00 الإصلاح على الكود الحقيقي.** شغّل بـ `--repo`. Muse Wonder بيكتب التعديلات في الـ source، وبيطلع `fixes.diff`. وريّ الـ diff الصغير. وبـ `--pr` الأداة بتعمل branch وcommit وبتفتح PR بوصف جاهز (على repo بتاعك إنت بس).

**2:00-2:30 الإثبات.** وريّ إن `axe-core` لوحده بيفوّت التباين على النص العربي (راجع القسم في README) وإن الأداة بتغطيه. القياس على الكود المعدّل: المشاكل [X] ← [Y]، العناصر من غير اسم في قارئ الشاشة [X] ← 0، تغيّر الشكل 0%. وريّ `reader-after.txt`: "link 'السلة', button 'بحث'..." كلام مفهوم.

**2:30-3:00 النتايج والحدود.** جدول `npm run eval` على [N] موقع. بعدين الحدود بصراحة (التباين وRTL لسه، وHTML ثابت بس في وضع الـ repo). وختام: "كل الكود اتكتب خلال الهاكاثون" مع لقطة من `git log` بتواريخ الـ commits.

**قبل التسجيل:** الـ repo public، ومفيش API key في الـ history، وكل المواقع الحقيقية اتفحصت محلياً بس من غير فتح PR عليها.
