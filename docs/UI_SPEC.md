# UI_SPEC — ZORKO Sangli (authoritative visual specification)

**Sources:** `design/stitch/*/code.html` (exact classes and structure), `design/stitch/smart_culinary_energy/DESIGN.md` (tokens and intent), and the reference renders in `design/reference/` (1440 px desktop, 390 px mobile; rendered 2026-10-13 with all remote assets loaded).

**Precedence when sources disagree:** `code.html` classes → DESIGN.md YAML → DESIGN.md prose. Every deviation from Stitch is listed in §14 with a reason.

---

## 1. Brand direction

Energetic, warm, appetising, fast to scan: saturated orange actions on warm off-white canvases, bold geometric headings (Sora), friendly legible body text (Plus Jakarta Sans), pill-shaped controls, soft warm shadows, and rounded food cards.

Mobile-first. The tone is playful but honest: nothing on screen may state an unverified fact (CLAUDE.md 6.2).

## 2. Colour tokens

### 2.1 Core palette (Tailwind `@theme` names = Stitch names)

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#a93200` | Primary buttons, active states, prices, links, focus ring |
| `on-primary` | `#ffffff` | Text/icons on primary |
| `primary-container` | `#d1430a` | Active nav pill, highlighted tiles, **primary hover** (ADR-004) |
| `on-primary-container` | `#fffbff` | Text on primary-container |
| `primary-fixed` | `#ffdbd0` | Soft tints, avatar circles, text on dark orange gradients |
| `primary-fixed-dim` | `#ffb59e` | Decorative |
| `on-primary-fixed` | `#3a0b00` | Text on primary-fixed |
| `secondary` | `#7c5800` | Gold text/icons on light backgrounds |
| `secondary-container` | `#fcb812` | Value/offer badges ("SAVE ₹71") |
| `on-secondary-container` | `#6a4b00` | Text on secondary-container |
| `secondary-fixed` | `#ffdea7` | Soft gold tints |
| `tertiary` | `#006947` | "Open now", success |
| `tertiary-container` | `#00855b` | Decorative |
| `tertiary-fixed` | `#6ffbbe` | Avatar tints |
| `error` / `on-error` | `#ba1a1a` / `#ffffff` | Errors, destructive buttons |
| `error-container` / `on-error-container` | `#ffdad6` / `#93000a` | Error banners |
| `surface` / `background` | `#fcf9f8` | Page canvas |
| `surface-container-lowest` | `#ffffff` | Cards |
| `surface-container-low` | `#f6f3f2` | Section bands, list rows |
| `surface-container` | `#f0eded` | Secondary buttons, chips |
| `surface-container-high` | `#eae7e7` | Pressed/hover chips, image placeholders |
| `surface-container-highest` | `#e5e2e1` | Strong neutral fills |
| `surface-dim` | `#dcd9d9` | Decorative |
| `on-surface` | `#1c1b1b` | Body/heading text |
| `on-surface-variant` | `#5a4139` | Secondary text |
| `outline` | `#8e7067` | Borders, tertiary text **on white only** (see 2.3) |
| `outline-variant` | `#e2bfb4` | Dividers, separators |
| `inverse-surface` / `inverse-on-surface` | `#313030` / `#f3f0ef` | Dark bars, toasts |

### 2.2 Extended accents

| Token | Hex | Usage |
|---|---|---|
| `culinary-orange-deep` | `#E64A19` | Gradients, decorative icons, borders — **not** a background under small text |
| `mustard-gold` | `#FFA000` | Decorative icon tints only |
| `veg-pure-green` | `#15803D` | Veg indicator, WhatsApp button |
| `surface-warm-cream` | `#FFFBF5` | Warm section bands, footer |
| `surface-canvas-subtle` | `#F7F8FA` | Input and search backgrounds |
| `smart-cyan` | `#04ADED` | Decorative "smart" icon tints only |
| `#F15A24` (`brand-glow`) | — | Shadow/glow colour only: `rgba(241,90,36,0.08–0.25)` |

### 2.4 ZORKO brand colours (zorko.in, ADR-059)
| Token | Value | Allowed use |
|---|---|---|
| `brand-orange` | #fb6514 | On black: text, icons, hover (6.97:1). On white: only non-text marks (nav underline, rules, borders) and large decorative shapes, because it is 3.01:1 there. |
| `brand-yellow` | #fbe414 | On black only (16.21:1): small accents, "to be confirmed" notes. |
| `brand-blue` | #04aded | On black only (8.21:1). Reserved; the logo already carries the blue. |
| `brand-ink` | #000000 | Header info bar, homepage "At a glance" band, footer, Call button. |
| `brand-ink-soft` | #d4d4d4 | Body text and links on black (14.17:1). |
| `brand-plank` | #5c4128 | Footer bottom band; white text 9.37:1. |
Text on white keeps `primary` #a93200 (6.68:1).

### 2.3 Contrast verification (WCAG 2.2 AA, measured 2026-10-13)

| Pair | Ratio | Result / rule |
|---|---|---|
| white on `primary` | 6.68 | AA |
| white on `primary-container` | 4.65 | AA → used for hover |
| `on-primary-container` on `primary-container` | 4.54 | AA |
| white on `culinary-orange-deep` | 3.92 | Large text only → **not** for button labels |
| white on `#F15A24` | 3.37 | Large text only → glow only |
| `primary` on surface / low / container / cream | 6.38 / 6.05 / 5.74 / 6.48 | AA |
| `on-surface` on `surface` | 16.40 | AA |
| `on-surface-variant` on surface / container / high | 8.91 / 8.02 / 7.59 | AA |
| `outline` on white | 4.50 | AA (exact limit) — allowed on white only |
| `outline` on `surface-canvas-subtle` | 4.24 | **Fails** → placeholders and helper text in inputs use `on-surface-variant` |
| `on-secondary-container` on `secondary-container` | 4.58 | AA |
| `on-surface` on `secondary-container` | 9.82 | AA |
| `veg-pure-green` ↔ white | 5.02 | AA |
| `tertiary` ↔ white | 6.75 | AA |
| `primary-fixed` on `primary` | 5.18 | AA |
| `secondary` on white | 6.46 | AA |
| `error` ↔ white | 6.46 | AA |
| `inverse-on-surface` on `inverse-surface` | 11.60 | AA |
| `mustard-gold` on white | 2.04 | **Fails** → decorative icons only, always next to a text label |
| `smart-cyan` on white | 2.56 | **Fails** → decorative icons only, always next to a text label |

Text over photos always sits on the Stitch gradient overlay (`bg-gradient-to-t from-black/80 via-black/20`) or a solid pill. This is checked with axe and manually in Phase 4A.

> **Phase 7 Round 2B part 2 (ADR-060):** the palette in §2.1 is re-pointed to the ZORKO palette (primary = brown #a54e30, page #faf7f4, text #211c19 / #76645a, CTA orange #ff7916 with #211c19 text, border #e9ded5), and §3 typography is now **Inter** (headings) + **DM Sans** (body) with a refined scale (hero 40–56 px / 1.08, sections 30–36 px, body 16 px / 1.55, labels 15 px / 600, metadata 13 px). ADR-060 wins where the older tables below differ.

## 3. Typography

Fonts are self-hosted via `next/font`: **Sora** (600/700/800) and **Plus Jakarta Sans** (400/500/700/800).

| Token | Font | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `display-hero` | Sora | 48/56 | 800 | −0.03em | Desktop hero H1 |
| `display-hero-mobile` | Sora | 32/40 | 800 | −0.02em | Mobile hero H1 |
| `headline-lg` | Sora | 32/40 | 700 | −0.02em | Section H2 (desktop) |
| `headline-lg-mobile` | Sora | 24/32 | 700 | −0.01em | Section H2 (mobile) |
| `headline-md` | Sora | 22/28 | 700 | −0.01em | Card titles (large), dialogs |
| `headline-sm` | Sora | 18/24 | 600 | — | Card titles, H3/H4 |
| `title-price` | Sora | 20/24 | 800 | −0.01em | Prices (`₹149`, no space) |
| `body-lg` | Plus Jakarta Sans | 16/24 | 500 | — | Lead paragraphs |
| `body-md` | Plus Jakarta Sans | 14/20 | 400 | — | Default body |
| `body-sm` | Plus Jakarta Sans | 12/16 | 400 | — | Descriptions, meta |
| `label-lg` | Plus Jakarta Sans | 14/18 | 700 | 0.02em | Buttons, nav |
| `label-md` | Plus Jakarta Sans | 12/16 | 700 | 0.03em | Small buttons, chips |
| `label-sm` | Plus Jakarta Sans | 10/12 | 800 | 0.05em | Badges (UPPERCASE) |

**Stitch one-offs kept:**
- `text-[34px]` extrabold for the homepage promo-card titles.
- `text-[32px] leading-8` for the item-details price.
- `text-[15px]` for small card names (testimonial names, map card).

**Rules:**
- Headings scale down at `<768px`: hero uses `display-hero-mobile`, H2 uses `headline-lg-mobile`.
- Body text is never below 12 px; `label-sm` (10 px) is for uppercase badges only.

## 4. Spacing, containers, grid

- **Spacing tokens (Tailwind `--spacing-*`):** `space-xs` 4 · `space-sm` 8 · `space-md` 16 · `space-lg` 24 · `space-xl` 36 · `space-2xl` 56 · `gutter` 16 · `gutter-desktop` 24 · `margin` 16 · `margin-tablet` 24 · `margin-desktop` 40 (px). Standard Tailwind steps (`gap-2`, `p-2.5`, `py-3.5`, …) are also allowed because Stitch uses them.
- **Container:** `max-w-page mx-auto` (1480 px, theme token `--container-page`; was 1280 px until Phase 7 Round 2A, ADR-054). Horizontal padding is `px-margin` (16) under 768, `px-margin-tablet` (24) from 768 to 1023, and `px-margin-desktop` (40) at 1024 and above. Stitch always uses 40, which is desktop-only.
- **Breakpoints:** mobile <768 · tablet 768–1023 (`md`) · desktop ≥1024 (`lg`) · wide nav ≥1280 (`xl`). Tailwind defaults are kept.
- **Section rhythm:** `py-space-2xl` for major sections, `py-space-xl` for compact bands; heading blocks use `mb-space-xl`.

## 5. Radii (ADR-005)

| Class | Value | Used for |
|---|---|---|
| `rounded` | 4 px | Rare metadata containers |
| `rounded-md` | 6 px | Small tags on images |
| `rounded-lg` | 8 px | Filter rows, small icon tiles |
| `rounded-xl` | 12 px | Inputs, search, sidebar buttons, logo tile, small cards |
| `rounded-2xl` | 16 px | Menu/offer/review cards, category tiles, image frames |
| `rounded-3xl` | 24 px | Hero image, promo cards, item-details panels, dialogs |
| `rounded-full` | pill | Buttons, chips, badges, nav pills, avatars |
| `rounded-[3px]` | 3 px | Veg indicator square |

## 6. Elevation

`code.html` uses Tailwind shadows; DESIGN.md levels are the intent.

| Level | Classes | Use |
|---|---|---|
| 0 | none | Canvas, section bands |
| 1 | `shadow-sm`; hover `shadow-md` | Cards, tiles, filter panels |
| 1-warm | `shadow-[0_4px_16px_-2px_rgba(241,90,36,0.2)]` | Primary header CTA |
| 2 | `shadow-md` → hover `shadow-xl` | Featured/combo cards, CTA buttons (`shadow-lg shadow-primary/25`) |
| 3 | `shadow-2xl` | Hero image, dialogs, toasts |
| Header | `shadow-[0_1px_8px_rgba(0,0,0,0.04)]` + `bg-surface/90 backdrop-blur-xl` | Sticky header, footer |

Atmospheric glows: blurred circles (`bg-primary-container/10 blur-3xl`, `bg-secondary-container/15 blur-2xl`) in hero bands. They are decorative, `aria-hidden`, and `pointer-events-none`.

## 7. Components

### 7.1 Buttons (all `rounded-full`, `font-label-lg`, min height 48 px on touch layouts)

| Variant | Classes (from code.html, hover per ADR-004) |
|---|---|
| Primary | `bg-primary text-on-primary hover:bg-primary-container active:scale-95 transition-transform shadow-lg shadow-primary/25 px-space-xl py-3.5` |
| Primary-sm | same, `font-label-md px-space-md py-2` |
| Secondary (tonal) | `bg-surface-container text-primary hover:bg-surface-container-high` |
| Ghost-on-card | `bg-surface-container-low text-primary hover:bg-primary hover:text-on-primary` (menu card "View details") |
| Inverse (on orange) | `bg-surface-container-lowest text-primary hover:bg-surface-container-low` |
| WhatsApp | `bg-veg-pure-green text-on-tertiary hover:opacity-90` |
| Destructive (admin) | `bg-error text-on-error hover:opacity-90` |
| Text link | `font-label-lg text-primary hover:underline` + trailing arrow icon |
| Disabled | `bg-surface-container text-on-surface-variant cursor-not-allowed`, `aria-disabled`; no hover/scale |
| Loading | label kept, spinner icon before it, `aria-busy="true"`, disabled |

**Focus (all interactive elements):** `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`. This is a visible ring with 6.38:1 contrast on the canvas.

### 7.2 Inputs
- **Field:** `h-12 px-space-md rounded-xl bg-surface-canvas-subtle border border-[rgba(26,26,26,0.12)] font-body-md text-on-surface placeholder:text-on-surface-variant`.
- **Focus:** `focus:bg-white focus:ring-[1.5px] focus:ring-primary`.
- **Label:** `font-label-md text-on-surface` above the field.
- **Error:** text `font-body-sm text-error` linked with `aria-describedby`; field gets `aria-invalid` and `border-error`.
- **Search** (header and menu): `rounded-xl bg-surface-canvas-subtle`, leading search icon, trailing clear button (only shown when the field has text).
- **Select:** native `<select>` styled like the field, as on the menu "Sort" control.
- **Checkbox/radio:** native inputs with `accent-primary`, minimum 20 px, inside a full-row `<label>` (`p-2 rounded-lg hover:bg-surface-container-low`).

### 7.3 Chips and pills
- **Category pill:** inactive `bg-surface-container text-on-surface-variant hover:text-on-surface`; active `bg-primary text-on-primary shadow-sm`; `px-space-lg py-2.5` on desktop, `px-3.5 py-1.5` on mobile.
  - Mobile: one horizontal row, `overflow-x-auto snap-x snap-mandatory`, no visible scrollbar, edge-to-edge.
- **Active-filter chip:** `bg-primary-fixed text-on-primary-fixed rounded-full` with a × button (`aria-label="Remove filter: …"`).
- **Nav pill:** active `bg-primary-container text-on-primary-container font-bold`; inactive `text-on-surface-variant hover:bg-surface-container`; container `p-1 rounded-full bg-surface-container-low`.

### 7.4 Badges (`font-label-sm uppercase rounded-full px-2.5 py-0.5`)

| Badge | Classes | Source |
|---|---|---|
| Best seller | `bg-primary text-on-primary` + flame icon | `isBestSeller` |
| Trending | `bg-secondary-container text-on-secondary-container` | `isTrending` |
| Offer / Save ₹X | `bg-secondary-container text-on-secondary-container font-extrabold` | active offer (computed) |
| Featured | `bg-surface-container text-on-surface` | `isFeatured` |
| Out of stock | `bg-inverse-surface/90 text-inverse-on-surface` overlay label | `isAvailable=false` |
| Available | `text-tertiary` dot + "Available" | `isAvailable=true` |
| Scheduled | `bg-surface-container-high text-on-surface-variant` + "Starts 1 Nov" | offer status |
| Student | `bg-secondary-fixed text-on-secondary-fixed` + school icon | `isStudentOffer` |
| Demo data | `bg-inverse-surface text-inverse-on-surface` small ribbon | `isDemo` |

Stitch badges such as "CHEF SPECIAL", "SPICY ZING", "STEAM FRESH" and "6 PCS" are **not** reproduced; they are mockup content.

### 7.5 Vegetarian indicator
- **"100% VEG" pill text** uses `tertiary` (V-12).
- **Mark:** 16×16 square, `rounded-[3px] border-[1.5px] border-veg-pure-green`, with an 8 px `bg-veg-pure-green rounded-full` dot (12×12 / 6 px in compact contexts). Non-veg variant: border and triangle in `#8B1A1A` (standard Indian marking). Each mark has `role="img"` and an `aria-label` ("Vegetarian" / "Non-vegetarian").
- **Rules:**
  - The per-item mark comes from `MenuItem.dietType`.
  - The "100% VEG" pill (`bg-[rgba(16,185,129,0.12)] text-veg-pure-green`) and the header "PURE VEG" chip appear **only** when the café-level flag `CafeInformation.isPureVegConfirmed = true`. This is open question Q-06, default `false`.

### 7.6 Cards
- **Menu card (grid), from the menu screen:** `bg-surface-container-lowest rounded-2xl p-space-md shadow-sm hover:shadow-md group`.
  - Image `h-44 rounded-xl overflow-hidden` with `group-hover:scale-105` (motion-safe only).
  - Veg mark top-left in a `bg-surface-container-lowest/90` pill; one badge top-right (priority: Out of stock > Best seller > Offer > Trending).
  - Title `headline-sm` with a two-line clamp; description `body-sm text-on-surface-variant line-clamp-2`.
  - Footer: small caption (category name), price `title-price text-primary` (if a DISCOUNT offer is active: struck-through regular price `body-sm line-through text-on-surface-variant`, then the promo price), and a "View details" ghost button.
  - The whole card is a link target; the button is the same link.
  - **Unavailable:** image `grayscale` + `opacity-60` (image only, V-13), centred overlay label "Out of stock" on solid `bg-inverse-surface`, button text "Out of stock — view details" in disabled styling. The card remains a link and its text keeps full contrast.
- **Trending card (home):** `rounded-2xl bg-surface-container-lowest overflow-hidden shadow-sm hover:shadow-xl`, image `h-52`, `p-space-md` body; otherwise the same as the menu card.
- **Combo card:** desktop `article flex sm:flex-row rounded-2xl shadow-md hover:shadow-xl`, image `sm:w-2/5 min-h-[240px]`, body `sm:w-3/5 p-space-lg`; mobile stacked, image `h-44` with gradient and the title over the image (mobile Stitch).
  - Includes a "SAVE ₹X" badge, an "Included" list (`bg-surface-canvas-subtle rounded-xl`, check icons, `N× Item`), the price with struck-through regular price and "% OFF", the validity line "Valid till 31 Oct 2026", and a "View details" button.
- **Info offer card:** `rounded-3xl bg-surface p-space-xl shadow-lg`, with a label pill, `headline-md` title, body, and a validity footer.
- **Review card:** `p-space-lg rounded-2xl bg-surface-container-lowest shadow-sm`; italic quote `body-md`; avatar circle with initials (`bg-primary-fixed`); name or "Guest"; submission month. No stars and no affiliation line.
- **Category tile (home):** `rounded-2xl bg-surface-container-lowest p-space-md shadow-sm hover:shadow-md` with a 64 px tinted icon circle, the name, and "N items". Grid: `grid-cols-2 sm:grid-cols-4 lg:grid-cols-8`.
- **Summary card (admin):** `rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm`, with an icon tile, `title-price` number and `label-md` caption.

### 7.7 Feedback, overlays, states
- **Toast:** `fixed bottom-6 inset-x-4 sm:left-1/2 sm:-translate-x-1/2 max-w-md rounded-full bg-inverse-surface text-inverse-on-surface shadow-2xl px-4 py-3`. Uses `role="status"` (success) or `role="alert"` (error) and auto-dismisses after 5 s, but stays while hovered or focused.
- **Dialog / confirm dialog:** overlay `bg-on-surface/40 backdrop-blur-sm`; panel `bg-surface rounded-3xl max-w-md p-space-xl shadow-2xl`; close button `w-9 h-9 rounded-full bg-surface-container`. Native `<dialog>` or an equivalent with focus trap, Escape to close, and focus restored on close. Destructive confirm uses the error button and repeats the item name.
- **Drawer / bottom sheet (mobile filters, More menu, tablet nav):** `rounded-t-3xl` (DESIGN.md), level-3 shadow, same focus rules as dialogs.
- **Skeleton:** `bg-surface-container-high animate-pulse rounded-*` matching each card's shape. With reduced motion there is no pulse.
- **Empty state:** centred icon tile (`w-12 h-12 rounded-2xl bg-primary-fixed text-primary`), `headline-sm` title, `body-md` text, and one action. Example: "No dishes match these filters" with a "Clear all filters" button.
- **Error state:** the same layout with an `error-container` icon tile, a short message (no technical detail), and a "Try again" button.
- **Pagination:** `nav aria-label="Pagination"` with Prev / page numbers / Next as `rounded-full` 48 px buttons; the current page uses `bg-primary text-on-primary` and `aria-current="page"`.

## 8. Navigation

### 8.1 Header (public) — one black block, Phase 7 Round 2B (ADR-059)
- **Sticky top** (ADR-024): `sticky top-0 z-50 bg-brand-ink text-white shadow-header`, closed by a 3 px `bg-brand-orange` rule (echoes the footer wave line). Focus outlines inside the header use `brand-orange` (6.97:1; `primary` is only 3.14:1 on black).
- **Info line (≥768):** part of the same black block, separated by `border-white/10`. Left: "100% VEG" pill (`tone="dark"`, only when the flag is set) and the short address with an orange pin. Right: today's hours with a yellow clock, "(to be confirmed)" in `brand-yellow` when unverified.
- **Main row `h-20` (`h-16` <768):**
  - Logo: official ZORKO logo on black (`Logo tone="dark"`), "SANGLI" caption in `brand-orange`.
  - Nav (≥1280): Sora `label-lg` text links in `brand-ink-soft` (14.2:1). Current page: `brand-orange` bold + 3 px orange underline. Hover: white text, and the bar grows in (no transition under reduced motion).
  - Right: dark pill search (`bg-white/10 border-white/20`, white text, orange focus ring), and an orange **Call** button (`bg-brand-orange text-brand-ink`, 6.97:1, `tel:`) at ≥1024 only when the café has a phone number.
- **768–1279:** dark menu button (`bg-white/10`) opens the light drawer (links + Staff portal). **<768:** compact black row + light bottom nav.
- The admin sign-in page keeps the light logo (`Logo` default `tone="light"`, caption in `primary`).

### 8.2 Bottom nav (mobile, from the mobile Stitch screen)
- `fixed bottom-0 bg-surface/95 backdrop-blur-xl shadow-[0_-2px_12px_rgba(0,0,0,0.05)] h-16`, five items of `min-w-[56px] min-h-[48px]`: **Home · Menu · Offers · Students · More**.
- Active item: `text-primary font-bold`. Stitch uses `culinary-orange-deep`, but that colour is only 3.74:1 against the canvas and these labels are small, so `primary` is used instead.
- "More" opens a bottom sheet: Gallery · About & Contact · Feedback · QR Menu.
- `main` gets `pb-24` on mobile, plus iOS safe-area padding.

### 8.3 Footer (all public pages) — zorko.in style, Phase 7 Round 2B (ADR-059)
1. **Skyline wave** (`public/brand/footer-skyline.webp`, zorko.in artwork, sky made transparent so it sits on any page background), full width, `min-h-20` with `object-cover` on phones.
2. **Black body** `bg-brand-ink`, grid `md:grid-cols-2 lg:grid-cols-12`:
   - Brand (4): plain ZORKO logo, one-line neutral description, "100% VEG" pill (`tone="dark"`), social pills (orange outline) only when configured.
   - Explore (2): live main pages. `nav aria-label="Footer"`.
   - Visit us (3): address, phone (`tel:`), "Directions on Google Maps" (only with a directions URL), weekly hours; "Hours to be confirmed" in `brand-yellow` when unverified.
   - Quick links (3): Feedback · QR Menu · Image credits · Staff portal. `nav aria-label="Quick links"`.
   - Headings white Sora; links `brand-ink-soft` (14.2:1), hover `brand-orange` (6.97:1 on black); icons orange.
3. **Food strip** (zorko.in artwork): `footer-food.webp` ≥768, taller `footer-food-mobile.webp` below.
4. **Plank band** `bg-brand-plank` (#5c4128, white 9.37:1): "ZORKO Sangli — student project, not an official ZORKO website. Menu photos are illustrative."
- **Not copied from zorko.in:** corporate office/warehouse addresses, franchise emails, the subscribe form (no backend: rule 7), the "© ZORKO Limited" line. No Privacy/Terms links until real pages exist.

### 8.4 Admin navigation
- **Sidebar (≥1024):** `w-64 sticky top-0 h-dvh bg-surface-container-low p-space-md`, logo tile + "Admin".
- **Items:** Dashboard · Menu items · Categories · Offers & combos · Banners · Café info · Gallery · Feedback · QR code · Audit log.
- **Item style:** `rounded-xl px-space-md py-2.5 font-label-lg`; active `bg-primary-container text-on-primary-container`; inactive `text-on-surface-variant hover:bg-surface-container`.
- The signed-in email and a visible **Log out** button sit at the bottom.
- **<1024:** a top bar with a menu button opens the sidebar as a drawer.

## 9. Icons — Lucide (ADR-006)

Default size is 18–20 px (16 px inside small buttons), `stroke-width` 2, inheriting the text colour. Decorative icons get `aria-hidden`; icon-only buttons need an `aria-label`.

| Stitch (Material) | Lucide |
|---|---|
| search | `Search` |
| restaurant_menu | `UtensilsCrossed` |
| local_offer | `Tag` |
| qr_code_scanner / qr_code_2 | `QrCode` / `ScanLine` |
| school | `GraduationCap` |
| location_on / pin_drop | `MapPin` |
| schedule | `Clock` |
| call / phone | `Phone` |
| chat (WhatsApp) | `MessageCircle` |
| photo_camera (Instagram) | `Camera` (+ text "Instagram") |
| directions | `Navigation` |
| arrow_forward / chevron_right / arrow_back | `ArrowRight` / `ChevronRight` / `ArrowLeft` |
| local_fire_department / whatshot | `Flame` |
| close | `X` |
| sort / tune | `ArrowUpDown` / `SlidersHorizontal` |
| grid_view / view_list | `LayoutGrid` / `List` |
| check_circle | `CircleCheck` |
| zoom_in | `ZoomIn` |
| storefront | `Store` |
| lunch_dining, local_pizza, local_cafe, icecream, fastfood, … | `Sandwich`, `Pizza`, `Coffee`, `IceCreamCone`, `Popcorn`, `Soup`, `CupSoda`, `Salad` (category icon picked by the admin from a fixed list) |

## 10. Imagery

| Context | Ratio / size | Notes |
|---|---|---|
| Hero (home) | `aspect-[4/5]`, max-w 460 | Gradient overlay for text |
| Menu card | `h-44` (176 px), `object-cover` | ~4:3 source |
| Trending card | `h-52` (208 px) | |
| Item details main | `aspect-[4/3]` | Up to 4 thumbnails, `aspect-square` grid of 4 |
| Combo card | desktop `min-h-[240px]` 2/5 width; mobile `h-44` | |
| Gallery | `aspect-square` grid tiles; lightbox shows original ratio | |
| Banner | 16:9 desktop, 4:3 mobile crop | |

- Images go through `next/image` with `sizes`. All images need alt text: item name for menu images; admin-entered alt text for gallery and banners (required field).
- Missing image: a neutral `bg-surface-container-high` tile with the category icon.
- Seed placeholders are local generated tiles (ADR-025).

## 11. Interaction states and motion

- **Hover:** colour or shadow change as in §7. Images `scale-105` over 300 ms; tiles `-translate-y-1` (motion-safe only).
- **Active:** buttons `active:scale-95` (`0.97` per DESIGN.md is acceptable).
- **Focus:** visible outline (§7.1) on every interactive element, never removed.
- **Disabled:** reduced emphasis, `cursor-not-allowed`, `aria-disabled`, no hover effect.
- **Loading:** skeletons for lists and cards; spinner and `aria-busy` for buttons; route-level `loading.tsx`.
- **Reduced motion:** every transform, pulse and smooth scroll is wrapped in `motion-safe:`, and a global `@media (prefers-reduced-motion: reduce)` reset disables remaining animations. The "open" pulse dot becomes static.
- **Touch targets:** ≥48×48 px for all controls on <1024 layouts. Desktop inline links may be smaller but still keep padding.

## 12. Page layouts — public

### 12.1 Home (`/`) — Stitch `desktop_home`
1. **Hero** (`bg-surface-container-low`, 12-col: 7/5).
   - No hours chip in the hero (ADR-064): today's hours are already in the top info bar, the "At a glance" strip, Visit us and the footer. No ratings or certification chips.
   - Eyebrow "ZORKO Sangli"; H1 "Hungry? Bite Into Joy at **ZORKO Sangli!**" with the second line `text-primary`; lead text is neutral, editable brand copy.
   - CTAs: **View Menu** (primary → `/menu`) and **View Offers** (tonal → `/offers`).
   - Three features describing real site features: "QR Digital Menu / Scan to browse", "Student Zone / Offers for students", "Live Availability / See what's in stock". Plain list (ADR-063): 16 px brown icon, title, text; a hairline above; no boxes.
   - Desktop 6/6 columns. Image card: active banner image, otherwise ZORKO's own paneer-burger brand photo, tight 5:4 crop (`brand-paneer-burger-hero.webp`, never a stock photo, ADR-063/064); `aspect-[5/4]`, max 560 px, `rounded-3xl`, fine border, no heavy shadow. Stat label on the frame's bottom edge, left: "**N**" (`headline-md`) + "items on the menu" (`label-md`), a real count from the database, no icon tile. The second floating card ("10 Mins") is removed.
   - CTAs carry no decorative icons. No background glow.
   - **Eyebrows site-wide** (hero and `SectionHeading`): brown `text-primary` spaced capitals, no orange dash (ADR-063). The orange header/footer rules and the active-nav underline stay.
2. **Promotional banners strip:** published, in-date `PromotionalBanner`s; one is a full-width card and several form a snap carousel with buttons. Hidden when there are none. This replaces the Stitch orange claims strip with a strip of facts computed from the database:
   - location (short address), shown only when configured;
   - "QR Digital Menu";
   - "Combos from ₹X", where X is the minimum active combo price, shown only when a combo exists;
   - opening hours.
3. **Categories:** "Explore menu categories" + "Craving Something Delicious?", tiles with real item counts, and a "See full menu" link.
4. **Trending & best sellers:** `bg-surface-warm-cream`, up to 4 cards (ADR-023). The intro line is neutral ("Picked by our café team").
5. **Offers & Student Zone** (2 columns): left, the featured active combo in a gradient card (`from-primary via-culinary-orange-deep to-primary-container`; title text is 34 px, so it qualifies as large text) with a "View offer" CTA; right, the Student Zone teaser (admin-editable intro text plus up to 2 student offers) with an "Explore Student Zone" CTA. Hidden blocks collapse gracefully.
6. **Reviews:** "What café guests are saying", the 3 latest approved feedback items. If there are none: an empty-state card "Be the first to share feedback" linking to `/feedback`.
7. **Gallery preview:** 4–6 published images plus a "View gallery" link. This block is derived; it does not exist in Stitch. It uses the review-card spacing.
8. **Visit us:** address card, hours, phone, map embed (ADR-017), and "Get directions" + "Chat on WhatsApp" buttons (each only when configured). The amenities tiles are removed.

### 12.2 Digital menu (`/menu`) — Stitch `desktop_digital_menu`
- **Info strip** (`bg-surface-warm-cream`): "Digital Menu" + short address + "Availability is updated live by café staff". The kitchen-queue and certification claims are removed.
- **Layout `lg:grid-cols-12`, aside 3 (sticky `top-24`) / main 9:**
  - **Aside:**
    1. Status card (gradient): "Open now" / "Closed now" and today's hours, from configuration.
    2. Categories list: "All items" plus categories with real counts; the active one uses `bg-primary text-on-primary`.
    3. Filters card ("Filters" + "Reset"): **Popular only** (checkbox), **Offers only** (checkbox), **Price range** radios (All / Under ₹100 / ₹100–₹200 / ₹200+).
    4. Student Zone link card (`bg-secondary-container/20`), with no discount claim.
  - **Main:** toolbar card with search (debounced 300 ms, submits on Enter), Sort select (Popular first · Price: low to high · Price: high to low · Name A–Z) and the grid/list view toggle (works; `aria-pressed`).
    - Active filter chips with × and "Clear all"; "Showing N items" (`aria-live="polite"`).
    - Card grid `md:grid-cols-2 xl:grid-cols-3`, then pagination (12 per page).
- **Mobile (<1024):**
  - Search field full width.
  - Category pills as a snap row.
  - A "Filters" button (badge with the active count) opens a bottom sheet holding filters and sort, with "Apply" and "Reset".
  - Grid of **2 columns** (DESIGN.md), compact card: image `aspect-square`, title `text-[15px] font-bold` 2-line clamp, description hidden, price + availability, the whole card links.
  - Status card collapses to a one-line strip.
- **State:** all filters live in the URL (`?q=&category=&price=&popular=1&offers=1&sort=&view=list&page=`), so they are shareable and the back button works. The server renders results. Price bands: `under-100` (< ₹100), `100-200` (inclusive), `200-plus` (> ₹200). Invalid URL values are ignored by the page (the JSON API answers 400).
- **Implemented in Phase 4A:** filters auto-apply on change (`next/form`, client navigation) and still work without JavaScript (an Apply button appears inside `<noscript>`).
- **Removed:** Curated Tags, dietary-customisation banner, sticky table/tray bar, "Call Café Staff", ADD buttons.

### 12.3 Item details (`/menu/[slug]`) — Stitch `desktop_item_details`
- Breadcrumb (Home / Digital Menu / Category / Item) plus a "Back to menu" pill; the menu filters are restored when navigating back.
- `lg:grid-cols-12`, 6/6:
  - **Left:** image panel `rounded-3xl p-space-md shadow-md` with badges (Best seller / Trending, veg), a zoom button that opens a lightbox dialog, and up to 4 working thumbnails. Prep-time and rating overlays are removed.
  - **Right:**
    - Title card: category eyebrow, H1 `headline-lg`, price `text-[32px] text-primary` (struck-through regular price when a discount is active), availability badge ("Available now" or "Out of stock" — prominent), description.
    - **Customisations card:** a read-only list per add-on group (group name, "Choose 1 · required" / "Optional" rule, options with `+₹15` / "Included"). Hidden when the item has no add-ons. The card heading is "Customisations available — ask at the counter".
    - **Frequently bought together / Related items:** compact cards (56 px thumbnail, name, price) linking to their pages.
    - **Combos with this item:** active combo offers containing the item, as compact combo cards.
- **Removed:** Jain/nutrition/allergen blocks, server code, special-instructions input, sticky order bar, quantity stepper.

### 12.4 Offers & combos (`/offers`) — Stitch `desktop_offers_combos` + `offers_combos` (mobile)
- **Hero:** eyebrow pill (short address), H1 "Offers & Combo Feasts at **ZORKO Sangli**", lead text, and a summary card ("N active offers", "Jump to combos" anchor). The coupon block and voucher card are removed.
- **Sticky tabs** (`top-20`; mobile snap row): All · Combos · Item deals · Student. Implemented as URL param `?kind=` so they work without JS.
- **Featured combos:** grid `lg:grid-cols-2` of combo cards.
- **Item deals:** `DISCOUNT` offers as menu-style cards with the struck-through price.
- **Limited-time specials:** `INFO` offers as info cards (validity text from the database).
- **Coming soon:** scheduled offers in compact cards with a "Starts <date>" badge. Hidden when empty.
- **Terms:** admin-editable `offerTerms` text from the café info, or the section is hidden. The "How to claim" and voucher modal are removed.
- **Empty state:** "No active offers right now. Check back soon" with a "Browse the menu" button.
- **Mobile:** follows the mobile Stitch screen — gradient hero card, snap tabs, stacked combo cards with the title over the image, info cards.

### 12.5 Offer details (`/offers/[slug]`) — derived
Uses the item-details layout: image left, details right (description, included items with links, price/savings, validity dates, student flag). Expired or unpublished offers return 404.

### 12.6 Student Zone (`/student-zone`) — derived
Hero band (`bg-surface-container-high` like the Stitch "College ID Happy Perks" card): eyebrow "Student Zone", H1, the admin intro text, and a disclaimer line "Offer terms are set by the café; this website does not verify student status."
Grid of student offers (combo/discount/info cards), then a "Browse the menu" CTA. Empty state when there are none.

### 12.7 Gallery (`/gallery`) — derived
Heading block, then a grid `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-space-md` of square `rounded-2xl` tiles. Clicking opens a lightbox dialog (prev/next, Escape, alt-text caption).

### 12.8 About & Contact (`/contact`) — derived from the home "Visit" section
- Full-width version of §12.1 item 8: address card, weekly opening-hours table (today highlighted, `aria-current`), phone, optional email, WhatsApp, Instagram/Facebook, map with directions.
- Map privacy note: "The map is loaded from Google".
- Short about text (admin-editable), latest approved reviews, and a feedback CTA.
- Unverified fields show a "To be confirmed" placeholder label instead of invented values.

### 12.9 Feedback (`/feedback`) — derived
Card `max-w-xl rounded-3xl p-space-xl`:
- Fields: name or nickname (optional), message (required, counter 0/1000), a hidden honeypot field.
- **Quick highlights (optional, ADR-062):** a `fieldset` of six toggle pills below the message: outline `border-border` with a `+` icon; ticked = `bg-primary text-on-primary` with a check icon; `min-h-12` (`lg:min-h-10`); visible focus ring. Ticked highlights appear as `bg-surface-warm-cream text-primary` chips in admin moderation and on approved reviews.
- Privacy note: "Your feedback is reviewed before it appears publicly. We don't collect your email or phone."
- Submit button, success state ("Thanks! Your feedback will appear after review"), and error states (validation, rate limit "Too many submissions, try again in a few minutes", generic failure).

### 12.10 QR menu (`/qr`) — derived
Centred card: QR SVG (min 240 px, white quiet zone), the destination URL as text, "Download PNG" and "Download SVG" buttons, and "Open the menu" link.

### 12.11 404 / error / offline — derived
Empty-state layout with a large `display-hero` "404" in `text-primary`, the message, and "Go home" + "View menu" buttons. The global error page uses "Try again" (reset) + "Go home". Never shows stack traces.

## 13. Page layouts — admin (all derived; same tokens; `bg-surface`)

| Screen | Route | Layout |
|---|---|---|
| Login | `/admin/login` | Centred card `max-w-sm rounded-3xl p-space-xl shadow-xl`: logo tile, "Admin sign in", email, password, primary full-width button. Generic error "Email or password is incorrect"; rate-limit message. No signup or "forgot password" link (recovery via Supabase dashboard; DEPLOYMENT.md). |
| Dashboard | `/admin` | Summary-card grid `sm:grid-cols-2 xl:grid-cols-4`: total items, available, unavailable, active offers, scheduled offers, pending feedback, published gallery images. Then a "Recently updated" table (latest 10 audit entries) and quick links. |
| Menu items | `/admin/menu` | Toolbar (search, category select, availability filter, "New item"), data table: thumbnail, name, category, price, availability **toggle switch** (instant, with optimistic UI and rollback on error), flags, updated, actions (Edit, View public, Archive). Paginated 20 per page. Archived items are reached through a toggle. Mobile: the table becomes a stacked card list. |
| Item editor | `/admin/menu/new`, `/admin/menu/[id]` | Two columns: form (name, slug auto, description, category, price ₹, veg/non-veg, flags, sort order, availability) and a side panel (images uploader with reorder and alt text, add-on groups editor, related items picker with type). Sticky save bar; "Preview" opens the public page (draft items are viewable only by admins). |
| Categories | `/admin/categories` | Table with drag-free ordering (up/down buttons), name, icon picker, item count, archive. |
| Offers & combos | `/admin/offers` | Tabs by status (Active · Scheduled · Expired · Drafts). Editor: kind, title, description, image, promo price, linked items with quantities, start/end datetime (IST), student/featured flags, publish, "Expire now". |
| Banners | `/admin/banners` | List with preview thumbnails; editor: title, subtitle, image, CTA label, CTA link (internal path or https URL only), schedule, order, publish. |
| Café info | `/admin/cafe` | Sections: contact (address, phone, email, WhatsApp), social URLs, map (Google Maps place name as listed on Google; lat/lng with a validation hint), opening hours (7 rows: open/close time or closed), texts (about, student-zone intro, offer terms), pure-veg flag. |
| Gallery | `/admin/gallery` | Upload drop-zone (button fallback), grid of tiles with alt-text field, order up/down, publish toggle, remove (confirm). |
| Feedback | `/admin/feedback` | Tabs Pending · Approved · Rejected; rows with message (escaped text), name, date, actions Approve / Reject / Delete (confirm). Counts in the tabs. |
| QR code | `/admin/qr` | Same as `/qr` plus a warning if `NEXT_PUBLIC_SITE_URL` is not https. |
| Audit log | `/admin/audit` | Read-only table: time (IST), admin email, action, entity, summary. Filters: entity, admin. Paginated. |
| Session expired | (state) | Toast "Your session expired. Please sign in again", then redirect to `/admin/login?next=…` (internal paths only). |

**Data table component:** `rounded-2xl bg-surface-container-lowest shadow-sm overflow-hidden`; header row `bg-surface-container-low font-label-md uppercase text-on-surface-variant`; rows `border-t border-outline-variant/40 hover:bg-surface-container-low`. Below 768 px it becomes stacked cards, with no horizontal page scroll; wide tables may scroll inside their own container, with a visible focus outline on the scroll region.

## 14. Deviations from Stitch (summary)

| # | Stitch | Implementation | Reason |
|---|---|---|---|
| V-01 | Hover `#E64A19` under white text | Hover `#d1430a` | Contrast (ADR-004) |
| V-02 | Fixed header overlapping the info bar; nav wraps; no nav at 768–1279 | Sticky header, nowrap, drawer at 768–1279 | Layout defects (ADR-024) |
| V-03 | Bottom-nav active `culinary-orange-deep` | `primary` | Contrast |
| V-04 | Placeholder `text-outline` on `#F7F8FA` | `on-surface-variant` | Contrast |
| V-05 | Material Symbols, Google-hosted fonts/images, Tailwind CDN | Lucide, `next/font`, local images, built Tailwind | CLAUDE.md 5, 6.1.3 |
| V-06 | All ordering UI, coupons, kiosk/queue claims, profile/bell icons, Curated Tags, nutrition, Jain blocks, amenities, testimonials with names/stars, certifications | Removed or replaced as listed in §12 | CLAUDE.md 6.2, 6.3 |
| V-07 | Customiser inputs | Read-only list | ADR-019 |
| V-08 | "100% VEG" everywhere | Per-item mark; global pill only when confirmed | CLAUDE.md 6.3 |
| V-09 | 5 trending (synopsis) vs 4 (Stitch) | 4 | ADR-023 |
| V-10 | Header "Table QR Order" button | "QR Menu" link to `/qr` | CLAUDE.md 6.3 |
| V-11 | Fixed 40 px page margins at all widths | 16 / 24 / 40 px | DESIGN.md grid |
| V-12 | "100% VEG" pill text `#15803D` on the light-emerald tint (DESIGN.md) | Text `tertiary` `#006947` | axe colour-contrast failure found in Phase 2 |
| V-13 | Sold-out card `opacity-60` on the whole card (Stitch menu screen) | Dim and greyscale the **image only**; the label sits on a solid `bg-inverse-surface`; text keeps full contrast | axe colour-contrast failure found in Phase 2 |
| V-15 | Header "QR Menu" button, "View Offers" CTA, Student Zone/offer CTAs, bottom-nav Offers/Students/More | Rendered only once the target page exists (4B / 6) | No dead links between phases (ADR-042) |
| V-16 | Menu card struck-through regular price for discounts | "Offer" badge on the card; the item page names the offer and its price | Seeded/admin discount prices apply to a bundle (e.g. 2× pizza), not to one item |
| V-17 | Breadcrumb links ~14 px tall | `min-h-12 min-w-12` under 1024 px | 48 px touch-target rule (TC-RESP-002) |
| V-14 | Small buttons, pills, chip remove `×` (28–40 px) | `min-h-12` under 1024 px (`lg:` compact size kept); whole filter chip is the remove link; dialog/toast close 48 px | 48 px touch-target rule (§11), TC-RESP-002 |

## 15. Derived screens (no Stitch source)

Mobile home · mobile menu (with filter sheet) · mobile item details · tablet layouts · offer details · Student Zone · Gallery (+ lightbox) · About & Contact · Feedback · QR page · 404 · error · loading skeletons · empty states · admin login · admin dashboard · menu items list · item editor · categories · offers list and editor · banners · café info · gallery management · feedback moderation · admin QR · audit log · session-expired state · confirm dialog · toasts.

## 16. Component inventory (`src/components`)

- **`ui/`:** Button, IconButton, LinkButton, TextField, TextArea, Select, Checkbox, Radio/RadioGroup, Switch, SearchField, Chip/FilterChip, Badge, VegMark, Price, Card, Skeleton, EmptyState, ErrorState, Dialog, ConfirmDialog, Drawer/BottomSheet, Toast/Toaster, Pagination, DataTable, Tabs, SectionHeading, Container, VisuallyHidden, Spinner.
- **`layout/`:** SiteHeader, InfoBar, MainNav, MobileNavDrawer, BottomNav, MoreSheet, SiteFooter, DemoRibbon, AdminShell, AdminSidebar, AdminTopBar.
- **Feature components:**
  - `features/menu`: MenuCard, MenuGrid, CategoryList, CategoryPills, FilterPanel, SortSelect, ActiveFilters, ItemGallery, AddOnList, RelatedItems.
  - `features/offers`: ComboCard, DiscountCard, InfoOfferCard, OfferTabs.
  - `features/cafe`: HoursTable, ContactCard, MapEmbed, OpenStatus.
  - `features/gallery`: GalleryGrid, Lightbox.
  - `features/feedback`: ReviewCard, FeedbackForm.
  - `features/admin`: SummaryCard, ImageUploader, AddOnEditor, RelationPicker, AuditTable.
- **Style/preview page** (Phase 2): `/dev/styleguide` renders every primitive in every state. It is development only and returns 404 in production.

## 17. Responsive verification matrix (CLAUDE.md 6.7)

Widths 375 · 430 · 768 · 1024 · 1440. Every public and admin page is checked for:
- no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth`);
- nav reachable;
- touch targets ≥ 48 px under 1024 px;
- no clipped dialogs;
- sticky elements not covering content;
- tables usable.

Automated in Playwright from Phase 4A (TC-RESP-*).
