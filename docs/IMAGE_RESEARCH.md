# Image research workflow

The mandatory workflow is implemented as follows:

1. Search for the **exact** place (see verified sources in `docs/LICENSING.md`).
2. Confirm the photograph actually depicts the named subject (file description,
   geotag, publisher caption). Where a caption contradicts the record — e.g. the
   Tumling lodge on the Singalila Ridge trail — the image is **not** used as a
   photograph of Sandakphu summit.
3. Check licence/usage permission on the source page; prefer official tourism sites,
   verified accommodation pages and openly licensed repositories.
4. Download only permitted assets to `assets/images/destinations/<place>/`.
5. Optimize to WebP derivatives via `scripts/sync-assets.mjs` (web) and keep originals
   for attribution.
6. Record `sourceUrl`, place, licence, credit, download date and local paths in
   `assets/images/IMAGE_SOURCES.json` and `ATTRIBUTION.md`.
7. Connect the image to the correct catalog record via `assetPath`/`thumbPath` with
   `alt`, `credit`, `license` and `sourceUrl`.
8. Runtime: `expo-image`/`ImageFrame` with caching, lazy loading, responsive sizes and
   a designed "Photograph unavailable" fallback; `/credits` shows attribution.

Records without a verified, permissibly licensed exact-place photograph are marked
`unavailable`. They must never be replaced by an unrelated or AI-generated image. The
Mirik bridge image has `license: UNVERIFIED`, `displayed: false` and is not rendered.
