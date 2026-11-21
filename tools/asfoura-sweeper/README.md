# كاسحة صور عصفورة (الجيل 2)

بتلاقي صورة علبة لكل صنف من أصناف مستودع عصفورة (`items.csv`، 490 صنف) وبتحفظ أحسن 3 مرشحين للمراجعة.

**شو بتعمل لكل صنف:**
1. بحث صور: Bing، DuckDuckGo، Yandex، Google.
2. بحث نصي (Google، Bing، Brave، Yandex، Yahoo، Startpage، Mojeek) ← بتفتح صفحات المنتجات وبتاخد صورتها الأساسية (JSON-LD، og:image).
3. باركود (لصاقات StopEver): Open Beauty/Food/Products Facts + بحث بالباركود.
4. تقييم كل صورة: الماركة بالعنوان أو مقروءة على العلبة (OCR عربي/إنكليزي/تركي)، كلمات الاسم، الحجم، خلفية بيضا، الدقة، صفحة متجر، CLIP (نوع المنتج)، وحذف المكرر والصور التجارية.

**التشغيل:** أي تعديل على `run.json` بفرع الكاسحة بيشغّل الـ workflow `asfoura-sweeper.yml`؛ النتيجة (صور + results.csv + gallery.html) بفرع `asfoura-images-data`.

**تحديث الأصناف:** `python build_items.py <asfoura-data-v2.xlsx> <asfoura-data-v1.xlsx>`
