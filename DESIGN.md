# Design: "Şəbəkə"

The site is a Sheki *şəbəkə* window: a dark walnut lattice of 8-point stars
through which fire and food glow like coloured glass. Source of truth for
tokens is `theme.config.json` (editable in `/admin` → Dizayn) → `theme.css`;
everything else lives in `public/assets/css/site.css`.

## Colour

| Token (theme.config) | Value | Role |
|---|---|---|
| `black` | `#140E0C` | Page ground (walnut in shadow) |
| `black2` | `#1E1512` | Raised panels, lattice wood, inputs |
| `black3` | `#0C0807` | Footer, lattice veil |
| `cream` | `#F2ECE4` | Text |
| `creamDim` | `#B3A79C` | Secondary text |
| `gold` | `#EFA93A` | Saffron glass: the only UI accent (primary buttons, prices, active nav, focus) |
| `brand` | `#4E0007` | Bordeaux fields: chef's dish, reservation, stats, featured package |
| `brand2` | `#6B0A12` | Lattice friezes |

Glass-only colours (never used for UI): ruby `#D0223C`, cobalt `#2F63DA`,
saffron = `gold`. Derived tones (`--hair`, `--gold-soft`…) use `color-mix`,
so they follow admin colour changes. The page is dark only, by brand choice.

## Type

Archivo (variable, self-hosted, has ə/Ə and ₼). Display: `font-stretch: 125%`
(display-1) / `118%` (display-2), weight 500, negative tracking. Body: normal
width, 17px / 1.65. Small caps labels (13px, 112%, +0.14em) are rationed:
window captions, footer column heads, menu category heads, one per dish.
Logo wordmark stays Grenze Gotisch. Prices use tabular numerals.

## Shape

- Images are **arched windows**: `border-radius: 100vmax 100vmax 0 0` (`.arch`, `.window`).
- All controls (buttons, inputs, cards) are **square**, radius 0.
- The 8-point star (`/assets/ornament/star.svg`) is the only ornament and the
  only bullet. `/assets/ornament/tile.svg` is the lattice tile, used as a CSS
  mask for friezes and embossed bordeaux walls.

## Signature component: `.window`

Built by `lattice()` in `scripts/build.mjs`: an SVG of star tiles over a photo
(`.window-media`). Non-star areas get a dark veil, star panes are tinted glass
(`mix-blend-mode: color`). When a window scrolls into view it gets `.is-lit`
and the panes light up once, bottom to top (`--d` per pane).

## Motion

Ease-out `cubic-bezier(0.23,1,0.32,1)`; drawer `cubic-bezier(0.32,0.72,0,1)`.
Authored moment = glass lighting. Supporting: arch windows open upward with
`clip-path`, hero slides crossfade with blur, sections fade up 20px once.
Buttons press to `scale(0.97)`. Nothing loops. Hover effects are gated to
`(hover: hover)`, all motion is off under `prefers-reduced-motion`.
No scroll listeners: header state and floating buttons use
IntersectionObserver sentinels.

## Icons

Phosphor Icons, light weight (MIT), in `src/icons/`, inlined as `{{icons.name}}`.

## Images

All current photos are temporary stock. Replace via `/admin` → Şəkillər with
the same filenames; the arched/lattice framing adapts to any photo.
