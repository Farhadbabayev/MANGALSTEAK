# Design: "Xalça və steyk-ev lüksü"

A black-and-gold steakhouse (full-bleed meat photography, heavy condensed
type) framed by the grammar of a Quba-Qazax carpet: border bands, sawtooth
guard stripes and a knotted göl medallion. Pattern lives only in borders and
fields, never over food. Tokens: `theme.config.json` (admin → Dizayn) →
`theme.css`; everything else is in `public/assets/css/site.css`.

Replaced the earlier "Şəbəkə" direction at the owner's request (2026-09).

## Colour

| Token | Value | Role |
|---|---|---|
| `black` | `#0F0D0C` | Page ground |
| `black2` | `#191613` | Panels, inputs, alt sections |
| `black3` | `#0A0908` | Footer, hero shade |
| `cream` | `#F3EEE6` | Text |
| `creamDim` | `#ADA398` | Secondary text |
| `gold` | `#D9A441` | The only UI accent: primary buttons, prices, active nav, carpet motifs |
| `brand` | `#4E0007` | Madder bordeaux: header bar and logo field, kilim bands, carpet borders, whole-region fields |
| `brand2` | `#6B0A12` | Reserve |

Derived tones use `color-mix`, so they follow admin colour changes. Dark only.

## Type

Archivo (variable, self-hosted, has ə/Ə, İ and ₼).
Display: `font-stretch: 68%`, weight 800 (h1/h2) or 700 (h3, prices, numbers),
uppercase, line-height ≥ 1 so Azerbaijani accents (İ Ü Ö Ş Ç) don't collide.
Body: normal width, 17px / 1.65. Small tracked caps (13px, 112%) are rationed:
hero caption, footer column heads, menu category heads, dish subtitle.

## Logo

The owner's own lockup (bull skull on a skewer, blackletter "Mangal",
tracked "STEAKHOUSE"), traced to vector in `src/brand/logo.svg`
(`currentColor`). Inlined once per page as a `<symbol>`; header and footer
`<use>` it. Shown the way the owner uploaded it: cream on plain bordeaux
(`logo.background`). No pattern on or around the logo: the owner rejected a
carpet-banner version (2026-09). The owner chose `bar`: the whole header bar
is bordeaux, left to right, at the top and while scrolling, and the logo sits
on it aligned with the content column. `block` keeps bordeaux only behind the
logo (full header height); `none` is the transparent header. The logo is
`--logo-h` (admin → Dizayn, default 64px, never taller than the header minus
12px). The footer shows the logo on a bordeaux tile, larger. The desktop nav
collapses into the menu at ≤1180px so the logo keeps its size.

## Carpet system (`/assets/ornament/`, all CSS masks, pixel-stepped like knots)

- `motif.svg`: stepped-diamond border motif. `guard.svg`: sawtooth guard stripe.
- `gol.svg`: göl medallion, the only bullet/marker (`.gol-mark`).
- `field.svg`: all-over field pattern, embossed at 20% black on bordeaux fields.
- `.kilim` (partial `kilim.html`): guard + bordeaux band with gold motif + guard.
  Sits under every hero and above the footer. Weaves in left→right once.
- `.carpet`: bordeaux border of motifs (`mask-repeat: round`) with a double
  gold keyline around its content. Used for the home menu card and the booking form.
- `.frame`: rectangular photo with a gold inset keyline (12px).

## Shape

Photos sharp rectangles; controls square (radius 0). No arches, no rounded cards.

## Motion

Ease-out `cubic-bezier(0.23,1,0.32,1)`. Hero slides crossfade with a slow
Ken Burns settle; hero copy rises line by line; kilim bands weave in; framed
photos reveal upward. Buttons press to `scale(0.97)`. Nothing loops except the
submit spinner. Hover is gated to `(hover: hover)`; all motion is off under
`prefers-reduced-motion`. No scroll listeners (IntersectionObserver only).

## Icons

Phosphor Icons, light weight (MIT), in `src/icons/`, inlined as `{{icons.name}}`.

## Images

Current photos are temporary stock. Replace via admin → Şəkillər with the same
filenames. The full-bleed heroes need dark, moody meat/fire photography.
