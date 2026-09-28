---
name: فينيق — الموقع التعريفي
description: خزانة أدراج الصيدلية — كل أصناف المستودع بدرج واحد بجيبتك.
colors:
  orange: "#F2760A"
  orange-deep: "#C85A00"
  navy: "#16283F"
  silver: "#E4E7EB"
  silver-edge: "#B9BFC7"
  ground: "#0E1A2C"
  paper: "#F7F7F8"
  drawer-front: "#1D3452"
  drawer-front-hover: "#25405F"
  seam: "#0A1422"
  ink-soft: "#46566B"
  on-dark-soft: "#B4C2D6"
typography:
  display:
    fontFamily: "Alexandria, system-ui, sans-serif"
    fontSize: "clamp(2.1rem, 1.3rem + 3.4vw, 3.9rem)"
    fontWeight: 800
    lineHeight: 1.22
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Alexandria, system-ui, sans-serif"
    fontSize: "clamp(1.7rem, 1.2rem + 2vw, 2.6rem)"
    fontWeight: 800
    lineHeight: 1.3
  body:
    fontFamily: "Alexandria, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Reem Kufi, Alexandria, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  plate: "2px"
  drawer: "3px"
  control: "4px"
  cabinet: "6px"
spacing:
  gutter: "clamp(16px, 4vw, 40px)"
  drawer-gap: "8px"
  section: "clamp(64px, 9vw, 120px)"
components:
  button-pull:
    backgroundColor: "{colors.orange}"
    textColor: "#1A1206"
    rounded: "{rounded.control}"
    height: "52px"
  button-plate:
    backgroundColor: "{colors.silver}"
    textColor: "{colors.navy}"
    rounded: "{rounded.control}"
    height: "52px"
  label-plate:
    backgroundColor: "{colors.silver}"
    textColor: "{colors.navy}"
    typography: "{typography.label}"
    rounded: "{rounded.plate}"
  drawer:
    backgroundColor: "{colors.drawer-front}"
    rounded: "{rounded.drawer}"
  drawer-interior:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.navy}"
---

# فينيق — نظام تصميم الموقع التعريفي (`site/`)

النطاق: الموقع العام فقط. لوحة الويب (`web/`) والتطبيق (`phoenix/`) لهما نظامهما،
ويشتركان مع الموقع في ألوان العلامة فقط (`assets/branding/README.md`).

## Overview

**Creative North Star: "خزانة أدراج الصيدلية"**

الصفحة خزانة: جسم كحلي، أدراج بأسماء على لوحات فضية ومقابض برتقالية، وداخل كل
درج فاتح. فتح الدرج هو الحركة الوحيدة المقصودة في الصفحة. كل ميزة للصيدلية مثبّتة
مقابل ميزتها للمستودع في الصف نفسه.

**Key Characteristics:**
- ألوان العلامة فقط: كحلي، برتقالي، فضي.
- أرضية غامقة للخزانة، وداخل فاتح للأدراج المفتوحة وللأقسام الهادئة.
- الإغلاق بحقل برتقالي كامل (قسم التواصل).

## Colors

- **البرتقالي** `#F2760A`: المقابض والأزرار الرئيسية فقط، وحقل التواصل الختامي.
- **الكحلي** `#16283F`: جسم الخزانة والنصوص على الخلفيات الفاتحة.
- **الفضي** `#E4E7EB`: لوحات الأسماء والأزرار الثانوية. لون مسطّح بحافة 1px، بلا تدرّج معدني.
- **الأرضية** `#0E1A2C` و**الورق** `#F7F7F8`.
- النص الثانوي على الغامق `#B4C2D6` (مائل للأزرق، لا رمادي).

## Typography

- **Alexandria** (400–800) لكل النصوص، والعناوين بوزن 800.
- **Reem Kufi** (500–700) للوحات الأسماء وأرقام الخطوات فقط.
- الخطوط مستضافة ذاتياً في `site/fonts/` (عربي + لاتيني).
- أسماء الأدوية لاتينية بـ`dir="ltr"`، والأرقام غربية.

## Layout

- عرض أقصى 1180px، هامش جانبي `clamp(16px, 4vw, 40px)`.
- الواجهة عمودان (النص يميناً والخزانة يساراً)، وعمود واحد تحت 900px.
- الأدراج 4×4 بترتيب لاتيني من اليسار لليمين (`direction: ltr` على الشبكة فقط).
- الصفوف المتقابلة عمودان، وتحت 720px تتكدّس بلصاقة «الصيدلية/المستودع» على كل درج.

## Elevation & Depth

- الدرج: خط سفلي داكن 3px (`seam`) فقط، بلا لمعة علوية.
- الدرج المفتوح: ينزل 6px ويكبر 3.5%، مع ظل بإزاحة، وإطار برتقالي 2px.
- داخل الدرج: ظل داخلي علوي خفيف يوحي بالعمق.
- لا ظلال ملوّنة ولا توهّج.

## Shapes

زوايا صغيرة متدرّجة حسب الحجم: لوحة 2px، درج 3px، زر 4px، خزانة 6px. قسيمة الطلبية
بحافة علوية مخرّمة.

## Components

- **زر المقبض** (`.btn--pull`): برتقالي، ظل سفلي صلب 2px بلون `orange-deep`.
- **زر اللوحة** (`.btn--plate`): فضي مسطّح بحافة 1px.
- **الدرج** (`.drawer`، `details.d`): واجهة كحلية، لوحة اسم، مقبض برتقالي 7px.
- **داخل الدرج**: ورق فاتح، صفوف مفصولة بخط 1px.
- **القسيمة** (`.slip`): ورقة بيضاء، تتبّع الحالة بأربعة أشرطة برتقالية.

## Do's and Don'ts

- **افعل:** كل ميزة جديدة للصيدلية لها مقابل للمستودع.
- **افعل:** وسم أي بيانات توضيحية بـ«تجربة».
- **لا تفعل:** ذكر العمولة، أو شهادات، أو أرقام صيدليات ومستودعات لم تحدث.
- **لا تفعل:** تدرّجات معدنية، أو زجاج وتغبيش، أو تسميات صغيرة فوق العناوين.
- **لا تفعل:** استعمال صور العرض التقديمي (صور تجارية بعضها بعلامة مائية).
