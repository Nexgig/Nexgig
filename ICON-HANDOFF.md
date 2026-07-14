# Nexgig — app icon assets: rebuild brief

## The ask

Rebuild the app's icon assets so the arrow mark is **pixel-identical to the logo on nexgigapp.com**.
Same shape, same proportions, same black, same coral. Nothing about the mark should be
reinterpreted or "improved" — the website is the source of truth.

**Please work from the vector source (SVG/AI/Figma) used on the website.** Do not trace or
upscale the PNGs in this repo — see below for why they're unusable as a source.

---

## What's wrong with the current assets

Measured directly from the files in `assets/images/`:

| File | Size | Unique colours | Background |
|---|---|---|---|
| `app-icon.png` | 1024×1024 | **2** | opaque coral |
| `nexgig-icon.png` | 512×512 | **2** | opaque coral |
| `android-icon-foreground.png` | 1024×1024 | **2** | transparent |
| `android-icon-monochrome.png` | 1024×1024 | **2** | transparent |
| `splash-icon.png` | 1024×1024 | **2** | transparent |
| `favicon.png` | 256×256 | **2** | opaque coral |
| `nexgig-logo.png` (wordmark) | 1200×360 | 262 | transparent |

**1. Zero anti-aliasing.** Every icon file contains exactly **two** colours. A scanline straight
through the arrow shows a hard jump with no blend pixels:

```
x=667   coral (226,103,74) → (17,17,17)     ← hard edge, no transition
x=821   (17,17,17) → coral (226,103,74)     ← hard edge, no transition
```

Real artwork exported from vector has hundreds of intermediate pixels along every diagonal and
curve. These were exported with anti-aliasing off (or nearest-neighbour upscaled from a tiny
source), so every angled edge is a hard staircase. Scaled down to ~60px on a home screen it reads
as low-resolution. This is the main defect.

Note the **wordmark** (`nexgig-logo.png`) has 262 colours — it was exported correctly. Only the
icons are broken.

**2. The arrow is not black.** It's `#111111`, not `#000000`. Against coral it reads as soft
charcoal, which is why it doesn't match the website.

**3. The arrow is off-centre.** On the 1024 canvas its bounding box is x 284–820, y 282–740 —
margins of left 284 / right 204. It sits ~80px right of centre.

**The coral is correct:** `#E2674A`. Keep it exactly.

---

## Deliverables

Six PNGs, all **exported from vector with anti-aliasing on**. Overwrite in place at these paths.

### 1. `assets/images/app-icon.png` — iOS app icon
- **1024 × 1024**
- Solid coral `#E2674A` background, arrow in **`#000000`**
- **No alpha channel, no transparency, no rounded corners.** iOS applies its own mask and will
  reject an icon containing an alpha channel. Full-bleed square.
- Arrow **optically centred**, roughly 50–55% of canvas width (matching the current proportion,
  minus the off-centre error).

### 2. `assets/images/android-icon-foreground.png` — Android adaptive icon foreground
- **1024 × 1024**, **transparent** background
- Arrow only, in `#000000`. The coral comes from `adaptiveIcon.backgroundColor` in the config —
  do **not** paint it into this file.
- **Safe zone:** Android crops adaptive icons to various shapes. All of the arrow must sit inside
  the centre **66%** — i.e. within a **672 px** circle centred on the canvas. Anything outside can
  be clipped on some launchers.

### 3. `assets/images/android-icon-monochrome.png` — Android themed icon
- **1024 × 1024**, **transparent** background
- Arrow as a **solid single-colour silhouette** (pure black is fine — Android recolours it).
- Same 66% safe zone.

### 4. `assets/images/splash-icon.png` — splash screen
- **1024 × 1024**, **transparent** background
- Arrow only, `#000000`. It's rendered at **200px wide, `contain`**, on a coral `#E2674A` background,
  so it must stay legible when scaled down that far.

### 5. `assets/images/favicon.png` — web favicon
- **256 × 256**
- Coral `#E2674A` background, arrow `#000000`. Opaque.

### 6. `assets/images/nexgig-icon.png` — **DELETE**
- Grep says nothing in the codebase references this file. It's a dead 512×512 duplicate. Remove it
  rather than regenerate it.

---

## Not in scope

- `assets/images/nexgig-logo.png` — the **wordmark** used on the welcome / sign-in / reset-password
  screens. It's correctly exported (262 colours, anti-aliased) and should **not** be touched.
- App icon *design* — it's final and locked (the send-arrow). This is purely a re-export at correct
  quality, correct colour, correctly centred.

---

## Acceptance checks

Anyone can verify these without design tools:

1. **Anti-aliasing** — each file must have **hundreds** of unique colours, not 2:
   ```python
   from PIL import Image
   from collections import Counter
   im = Image.open("assets/images/app-icon.png").convert("RGBA")
   print(len(Counter(im.getdata())))   # expect >100, currently 2
   ```
2. **Black** — the arrow's fill samples as `(0, 0, 0)`, not `(17, 17, 17)`.
3. **Coral** — background samples as `(226, 103, 74)` = `#E2674A`.
4. **No alpha on `app-icon.png`** — `Image.open(...).mode` must not be `RGBA`, or the corner pixel's
   alpha must be 255. iOS rejects icons with transparency.
5. **Centred** — the arrow's bounding box has equal left/right and top/bottom margins.
6. **Android safe zone** — the arrow's bounding box fits inside a 672px circle centred on the 1024
   canvas.

## After the assets land

The icon is a **native** asset, so it does **not** ship over-the-air. It needs a new EAS build:

```
eas build --platform ios --profile production
```

An `eas update` will not change it.
