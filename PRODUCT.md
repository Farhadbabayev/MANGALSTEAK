# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Guests in Baku choosing where to eat steak or mangal tonight or planning a
table for a family dinner, birthday, business meal or banquet. They arrive
mostly on a phone (Instagram, Google Maps, a friend's link), look at the food
and the room, check the menu and prices, and book a table. A second audience
is event planners comparing banquet rooms.

## Product Purpose

Mangal Steak House's own website: show the food, the room and the fire, make
the menu and prices easy to read, and turn a visit into a table reservation.
Success is a completed reservation (form on every page, sent to the restaurant
server and forwarded to Vilka) or a phone call.

## Positioning

Premium dry-aged steak and Azerbaijani mangal on one table: steaks aged 28 days
in the house's own aging room, kebabs cooked only over oak and mulberry charcoal,
an open mangal zone where guests watch the fire.

## Operating Context

- Static multi-page site built by `scripts/build.mjs` from `src/` and the
  `*.config.json` files; no npm dependencies; deployed on Vercel.
- Every page carries the reservation form; `/rezervasiya.html` is the main one.
- The owner edits texts, menu, images, colors, fonts and logo from `/admin`
  (the "Dizayn" section writes `theme.config.json` → `theme.css`). The design
  must keep working when the owner changes those tokens.
- Language: Azerbaijani (`lang="az"`), Latin script with ə, ğ, ı, ö, ü, ç, ş.

## Capabilities and Constraints

- Pages: home, menu (7 categories), about, gallery, events & banquet,
  reservation, contact, 404. URLs, nav labels and form field names stay stable.
- Reservation form fields and IDs are relied on by `reservation.js`, the API
  and tests; they must not be renamed.
- Fonts are self-hosted woff2 in `public/assets/fonts/`.

## Brand Commitments

- Name "Mangal Steak House", logo = bull skull with skewer mark plus the
  "Mangal" wordmark in Grenze Gotisch.
- Brand bordeaux `#4E0007`.
- Owner-requested feel (2026-09): premium calm mixed with the spirit of Baku
  and the Caucasus. Reference feel: Nusr-Et. Full new visual world approved.

## Evidence on Hand

- Menu items and prices in `content.config.json` (real, owner-editable).
- One guest quote (Elvin Məmmədov) in content config.
- Photography in `public/assets/images/` is temporary stock; the design must
  not depend on specific photos and must look right when real shoots replace
  them. The about page shows owner-entered stats (years, seats, "4.8" rating);
  no awards or press exist. Do not invent any.

## Product Principles

1. Booking is always one tap away, on every page and every screen size.
2. Food and fire lead; the interface stays quiet around them.
3. Local, not generic: Baku and Caucasus culture is expressed through
   material and pattern, never through clichés or costume.
4. Everything the owner can edit in `/admin` keeps rendering correctly.

## Accessibility & Inclusion

WCAG AA contrast, keyboard-reachable navigation and form, respects
`prefers-reduced-motion`.
