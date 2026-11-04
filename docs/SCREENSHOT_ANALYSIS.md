# Screenshot analysis — reference material for the GOWAYY ecosystem redesign

18 screenshots were supplied as functional/UX references (two commerce apps + one mascot
reference). This document records what each screen teaches and how GOWAYY adopts the
pattern **without copying any branding, logo, trademark or proprietary asset**.

## Reference set A — marketplace product detail / purchase flow (images 1, 11–14, 18)

| # | Screen | Patterns extracted for GOWAYY |
| --- | --- | --- |
| 1 / 11 | Product hero: sticky search header, tab strip (Details / Explore / Reviews), collapsible sections (About the brand, Videos, What's in the box, Warranty), large image gallery | Product detail gets a tabbed/collapsible information architecture, not one long page |
| 12 | Variant selector: colour swatches with price, struck-through MRP, "In stock" per variant | Variants are first-class: each variant carries its own price, MRP and stock state |
| 12 | Prime-style delivery promise box, "Mega Festival Deal", −47% price block, MRP line, cashback-on-wallet line | Verified discount %, MRP, and payment-method-specific cashback are shown separately and honestly |
| 13 | Protection plan module: provider name, coverage bullets (easy claim, free pickup, no hidden charges), ₹/month price, MRP strike, "Add" button, "See more protection plans", order Total line | Optional protection is an explicit, priced add-on with real terms — never a fake warranty |
| 14 | Delivery promise, pin-code delivery target, stock state, quantity dropdown, full-width "Add to cart" + "Buy Now", UPI reward strip, Ships from / Sold by / Gift options | Seller/fulfilment transparency, quantity selector, two checkout intents, payment-linked rewards |
| 18 | "Top highlights" with checkmarks, AI-summary disclaimer ("summarized from seller-provided information"), "See more", FAQ chips ("How many devices…", "compatible with my MacBook?"), Product specifications, sticky Add to Cart | Highlights are labelled when derived; FAQ chips deep-link to Q&A; sticky purchase bar on scroll |

## Reference set B — cart, checkout, payment (images 8, 15–17)

| # | Screen | Patterns extracted |
| --- | --- | --- |
| 8 | Cart line item with qty stepper, price block with discount %, savings banner ("You'll save ₹…"), delivery-speed selector, per-item delivery dates, Remove / Move to Wishlist / Buy Now, sticky total + "Proceed to buy" | Cart shows savings explicitly, delivery options per item, and a sticky purchase summary |
| 15 / 17 | Payment method list: UPI apps, cards, wallet balance with "Add money", EMI, net banking, COD greyed out as "Unavailable for this payment", gift card / promo code row | Only genuinely integrated methods are selectable; unavailable methods are visibly disabled with a reason |
| 16 | Checkout stepper (Address → Payment → Confirm order), deliver-to card with Change, Continue CTA, wallet-cashback strip, recommended payment with cashback, "Previously used" methods | A 3-step stepper with server-authoritative state; payment recommendations labelled "Best offer" |

## Reference set C — discovery surfaces (images 5–7, 9, 10)

| # | Screen | Patterns extracted |
| --- | --- | --- |
| 5 | Home: top quick tiles, location pill, search bar, category icon row, ad banner carousel with dots, "still looking for these?" recents, bottom nav | GOWAYY home keeps: service grid, location selector, search, recommendations — in GOWAYY design tokens |
| 6 | Skeleton loading state (grey blocks + tab-bar placeholder) | Every async screen ships a skeleton, not a spinner-only state |
| 7 | Search: recent searches as image chips with labels, "Recommended Stores" cards | Search shows recent searches and recommended stores before results |
| 9 | Account: greeting, coin balance, Orders/Wishlist tiles, finance options list, recently viewed stores | Account page aggregates orders, wishlist, finance, recents |
| 10 | Categories: left rail + popular stores grid + "New & Upcoming Launches" with BUY NOW chips | A dedicated categories browser with curated launch rails |

## Reference set D — mascot (image 2) and app identity (images 3–4)

- Image 2 is the **GOWAYY monkey mascot reference**: large rounded head, dark-brown fur,
  warm-orange eye mask, big white eyes, large red rounded ears, long beige muzzle, red hands,
  yellow-orange body. The rebuilt mascot is an original character derived from these traits —
  see `assets/mascot/MASCOT.md`. The supplied photo is never pasted into the apps.
- Images 3–4 (splash + icon pair) confirm the required pattern: **distinct splash and app icon
  per application**. GOWAYY / GOWAYY PARTNER / GOWAYY EXPLORE therefore each get their own
  logo variation, icon, splash and package identifier.

## Adoption rules

1. Interaction patterns only — no copied logos, colours-as-brand, mascots or layout assets.
2. All prices, discounts, ratings, stock and delivery dates come from server records.
3. Unavailable payment methods / images are visibly marked, never faked.
4. Every pattern above is implemented with the GOWAYY charcoal/champagne design system.
