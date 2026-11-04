# GOWAYY image licensing and provenance

**Policy:** every photograph used to represent a real destination, attraction, hotel,
restaurant or other place must depict that exact place and have a verified, permissive
licence. GOWAYY does not use AI-generated substitutes, unrelated stock photographs, or
hotlinked images for real places. When a permitted exact-place photograph cannot be
found, the record is marked `status: "unavailable"` and the app renders a designed
"Photograph unavailable" state with meaningful alt text.

## Manifest

The machine-readable manifest is `assets/images/IMAGE_SOURCES.json`. Each entry records:

| Field | Meaning |
| --- | --- |
| `id`, `place` | Stable identifier and exact place name |
| `sourceUrl` | Original source page (not a hotlink) |
| `license` | Verified licence / usage permission, or `UNVERIFIED` |
| `credit`, `author` | Attribution text |
| `downloadDate` | Date the asset was checked and downloaded |
| `localOriginal`, `localWebp` | Local asset paths |
| `displayed` | Whether the image is safe to display |

A human-readable attribution list is `assets/images/ATTRIBUTION.md`. The 15 destination
records in `packages/catalog/src/data/destinations.json` and attraction records in
`attractions.json` reference images by `assetPath` with `alt`, `credit`, `license` and
`sourceUrl`; `verificationNote` explains any unavailable asset. `scripts/sync-assets.mjs`
copies optimized WebP derivatives into `apps/web/public/images/`.

## Verified assets (checked 2026-11-03)

| Place | Source | Licence |
| --- | --- | --- |
| Darjeeling railway station | Wikimedia Commons, `2024-03-05_Darjeeling_railway_station_4.jpg`, Alexkom000 | CC BY 4.0 |
| Darjeeling Town Hall clock tower | Wikimedia Commons, `2024-03-05_The_Clock_tower_of_Darjeeling_Town_Hall.jpg`, Alexkom000 | CC BY 4.0 |
| Darjeeling tea gardens / ropeway | Mongabay India commentary, publisher-attested Wikimedia Commons image by Jyoti PN | CC BY-SA 4.0 (file page not independently located) |
| Sumendu Lake, Mirik | Wikimedia Commons, `Mirik_Sumendu_Lake.jpg`, Benoy | CC BY-SA 3.0 |
| Kurseong DHR station | Wikimedia Commons, `Kurseong_Station,_Darjeeling_Himalayan_Railway_1031.jpg`, PP Yoonus | CC BY-SA 3.0 |
| Zang Dhok Palri Phodang, Kalimpong | Wikimedia Commons, `Zang_Dhok_Palri_Phodang_02.jpg`, Bernard Gagnon | CC BY-SA 4.0 |
| Shikhar Lodge, Tumling (Singalila Ridge trail) | Wikimedia Commons, `Shikhar_Lodge,_Tumling,_Singalila_Ridge_Trail_(8716422445).jpg`, Matt Stabile | CC BY 2.0 — **route photograph, not Sandakphu summit** |

## Withheld assets

- `mirik-sumendu-bridge` — subject identified but licence `UNVERIFIED`; retained locally
  with `displayed: false`. It must not be rendered.
- Sandakphu destination image — the only verified licence found depicts Tumling on the
  approach route, not the summit; marked `unavailable` with an explicit note.
- Seven attraction records (`att_01, att_02, att_04, att_05, att_06, att_09, att_11`)
  were corrected to `unavailable` because the previously attached photographs depicted
  different nearby places.
- Siliguri, Lepchajagat, Lamahatta, Tinchuley, Takdah, Chatakpur, Sittong, Dawaipani,
  Jorebunglow, Ghum and all business/vehicle-specific photography currently have no
  verified exact-place asset and remain in designed unavailable states.

## Attribution obligations

When redistributing the app, include this file and `assets/images/ATTRIBUTION.md`, keep
author/licence/source text on or adjacent to each displayed photograph, preserve
ShareAlike terms for CC BY-SA derivatives, and honour any removal request. The app's
`/credits` screen (web) and `app/credits.tsx` (mobile) expose the same data at runtime.

**Do not** claim an image is a genuine photograph of a place unless its source was
checked, and do not bypass copyright, hotlink restrictions or access controls.
