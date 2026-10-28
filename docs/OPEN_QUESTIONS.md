# OPEN QUESTIONS

Information or decisions the team, the café or the guide must supply. Until answered, the default applies and is visibly labelled where relevant. **Blocks** shows the earliest phase that needs the answer; nothing here blocks Phase 2.

| ID | Question | Ask whom | Default until answered | Blocks |
|---|---|---|---|---|
| Q-01 | Verified outlet address and map coordinates (lat/lng) | Café | Placeholder address "To be confirmed"; no map pin | 4B (real data), 8 | **Answered 2026-10-14 (ADR-044):** address from the printed menu — "Cafe Zorko, Chavan Arkade, Near Sambha Bhel, 100 ft. Road, Vishrambag, Sangli 416415". Coordinates still needed. Coordinates 16.845262, 74.596347 supplied by the team 2026-10-15 (map pin and directions now use them, ADR-046). |
| Q-02 | Phone and WhatsApp numbers | Café | Hidden / "To be confirmed" | 4B, 8 | **Answered 2026-10-14 (ADR-044):** phone 9890011348 (printed menu). WhatsApp number still needed.
| Q-03 | Optional public email | Café | Hidden | 4B |
| Q-04 | Instagram and Facebook URLs | Café | Hidden | 4B |
| Q-05 | Opening hours per day (any hours past midnight?) | Café | Demo hours labelled demo; past-midnight closing not supported unless needed | 3, 4B |
| Q-06 | Is the outlet 100% vegetarian? (controls every "100% VEG" claim) | Café | `isPureVegConfirmed=false`; per-item marks only | 4A | *(2026-10-14: the brand site zorko.in describes ZORKO as "100% Veg"; still needs confirmation for the Sangli outlet before the badge is shown — ADR-043.)* **Answered 2026-10-14 (ADR-044):** yes — the printed outlet menu carries the green veg mark; flag set.
| Q-07 | Real menu: categories, items, prices, descriptions, add-ons, veg/non-veg | Café | Demo seed labelled demo | before final demo | **Answered 2026-10-14 (ADR-044):** menu and prices transcribed from the printed menu (65 items). Still needed: dessert prices (cut off in the photo) and item photos.
| Q-08 | Real offers, combos and Student Zone terms | Café | Demo offers labelled demo | before final demo |
| Q-09 | Permission to use the ZORKO logo, name and imagery | Café / franchise | **Answered 2026-10-28:** team supplied the logo and asked for it (ADR-055); neutral footer kept | 4A |
| Q-10 | Real photos for gallery and menu | Café | **Gallery: 5 outlet photos added 2026-10-28 (ADR-056).** Menu photos still illustrative | before final demo |
| Q-11 | Should feedback include a star rating? | Team / guide | No ratings (ADR-026) | 6 |
| Q-12 | Loyalty and Reward Program: confirm it is future work (synopsis abstract vs methodology) | Guide | Out of scope | — |
| Q-13 | Production domain (if any) | Team | Vercel `*.vercel.app` URL | 8 |
| Q-14 | Enable MFA for admin accounts? | Team | Recommended, optional | 5A |
| Q-15 | Administrator email address(es) | Team | — | 5A |
| Q-16 | GitHub repository (for CI) — create one? | Team | Local Git only; CI workflow file prepared but not run | 2 |
| Q-17 | Two Supabase projects (dev, prod) created? | Team | — | 3 (dev), 8 (prod) |
| Q-18 | Vercel account | Team | — | 8 |
| Q-19 | Confirm UI decisions: hover colour (ADR-004), header fixes (ADR-024), 4 trending items (ADR-023), feedback without ratings (ADR-026) | Team | As proposed | 2 |
| Q-20 | Hero/about marketing copy: keep the Stitch-style tagline "Hungry? Bite Into Joy at ZORKO Sangli!"? | Team / café | Keep (not a factual claim) | 4A |
| Q-21 | Are `PLACE 3/4/5` photos of the Sangli outlet? | Team | **Answered 2026-10-28:** owner allows any ZORKO café photo; added as "A ZORKO café (brand photo)", not as Sangli (ADR-058) | Round 2A |
