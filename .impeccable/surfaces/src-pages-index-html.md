---
version: 1
slug: "src-pages-index-html"
primary_target: "src/pages/index.html"
related_targets: ["src/pages","src/partials","public/assets/css/site.css"]
---

# Surface brief: site (home + inner pages)

Mode: Persuade. Visitor = Baku diner on a phone in the evening deciding where to eat; success = a booked table.

## Direction contract

THESIS: The site is a Sheki şəbəkə window. A dark walnut frame of geometric lattice through which fire and food glow like coloured glass. Refuses the category default: near-black + gold hairlines + italic serif display + centred hero.

OWN-WORLD: Walnut-black ground (#140E0C), ivory text, brand bordeaux (#4E0007) as whole-region fields, saffron glass (#EFA93A) as the single UI accent (primary buttons, focus, active states), ruby and cobalt appear only as glass panes inside the lattice. Archivo in expanded width for display, normal width for body. Images are arched windows (round top, square foot); all controls are square (radius 0). The 8-point şəbəkə star is the only ornament and the only bullet mark.

STORY: Visitor sees the fire through the window, reads one promise, sees the chef's cut with its price, scans the menu like a printed card, trusts the room and the guests, books without leaving the page.

FIRST VIEWPORT: Desktop split 7/5. Left: slide headline in expanded Archivo ~clamp(44px,6vw,92px), 2 lines, one sentence of text, primary "Masa ayır" saffron + text link to menu. Right: tall arched window (≈78dvh) holding the hero slide photo behind a şəbəkə lattice; star panes tinted ruby/saffron/cobalt. Caption under window = slide subtitle. Mobile: window first (60dvh), text below, CTA visible.

FORM: Şəbəkə window, position 3 of 7 on the ordered list (xalça, İçərişəhər stone, şəbəkə, Lahıc copper, kəlağayı buta, çayxana ritual, Yeni Əlifba posters). Seed key 769c421a (degraded roll, no challengers). Signature interaction: on load the glass panes light up in a rising sweep from the bottom (fire behind glass), once; slide changes crossfade with blur inside the lattice. Motion grammar: ease-out cubic-bezier(0.23,1,0.32,1), reveals by clip-path from the bottom for arched images, 60ms staggers, nothing loops.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
