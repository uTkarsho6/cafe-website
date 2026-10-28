/**
 * Category thumbnails for the homepage (ADR-060): official ZORKO menu photography from zorko.in
 * (owner's permission, ADR-058), cropped to the dish only, files in public/brand/menu/<slug>.webp.
 * Ice Tea comes from the glass on zorko.in's printed menu board (menu-6). Categories without a
 * ZORKO photo (new admin-created ones, e.g. "sangli special") return null and keep the icon fallback, rather than showing an unrelated stand-in. The photo is
 * decorative: the card's text already names the category.
 */
const WITH_PHOTO = new Set([
  'burgers',
  'pizza',
  'momos',
  'fries',
  'wraps',
  'pasta',
  'garlic-bread',
  'toastie',
  'special-buns',
  'nachos',
  'maggi',
  'mojito',
  'cold-coffee',
  'milk-shakes',
  'hot-beverages',
  'ice-tea',
])

export function categoryPhoto(slug: string): string | null {
  return WITH_PHOTO.has(slug) ? `/brand/menu/${slug}.webp` : null
}
