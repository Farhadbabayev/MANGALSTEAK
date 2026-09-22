---
version: 1
slug: "src-pages-index-html"
primary_target: "src/pages/index.html"
related_targets: ["src/pages","src/partials","public/assets/css/site.css"]
---

# Surface brief: site (home + inner pages)

Mode: Persuade. Visitor = Baku diner on a phone in the evening deciding where to eat; success = a booked table.

## Direction contract

THESIS: A steakhouse dressed in a Quba-Qazax carpet. Black-and-gold steakhouse luxury (full-bleed meat photography, heavy condensed type) framed by carpet grammar: border bands, guard stripes, a knotted göl medallion. Refuses both the quiet hairline-serif luxury default and the tourist "ethnic pattern everywhere" default: pattern lives only in borders and fields, never over food.

OWN-WORLD: Near-black ground (#0F0D0C), ivory text, gold (#D9A441) as the single UI accent, madder bordeaux (#4E0007) as carpet bands and whole-region fields. Ornament is pixel-stepped (carpets are knotted on a grid): göl medallion, stepped-diamond border motif, sawtooth guard stripe, all SVG masks so admin colours follow. Archivo condensed (68%) weight 800 uppercase for display, normal width for body. Photos are sharp rectangles with a gold inset keyline. Controls square, radius 0.

STORY: Visitor sees the meat and fire full-bleed, reads a hard two-line promise, sees the chef's cut and price on a carpet field, reads the menu inside a carpet frame, trusts the room and guests, books without leaving the page.

FIRST VIEWPORT: Full-bleed hero slide photo darkened toward bottom-left. Bottom-left: condensed uppercase headline clamp(56px,9vw,150px) in 2 lines, one sentence, gold "Masa ayır" + text link to menu. Bottom-right: slide caption + dots. Directly under the hero a kilim band (bordeaux band, gold border motif, sawtooth guards) closes the viewport edge.

FORM: User-pinned fusion of two presented cards: "Xalça sahəsi" (pos 1 of 7) + canon "Klassik steyk-ev lüksü". Replaces direction from seed 769c421a (Şəbəkə, removed at user request). Signature interaction: kilim bands weave in once when they enter the viewport (clip-path left to right, stepped timing), hero headline rises line by line. Motion grammar: ease-out cubic-bezier(0.23,1,0.32,1), nothing loops.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
