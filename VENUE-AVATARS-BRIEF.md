# Nexgig — venue avatars: designer brief

## What this is

A set of bundled **venue avatars**, mirroring the 22 artist/manager avatars already in the app.
A manager who hasn't uploaded a photo of their venue picks one of these instead. Today they get a
grey placeholder icon, which looks unfinished everywhere the venue appears.

**Not photographs. Not faces.** Venue-flavoured illustrations — think club, bar, rooftop, beach club,
lounge, restaurant, festival stage, boat, hotel, warehouse.

---

## Deliverable

**Square PNGs, 1024 × 1024, one file per avatar.**

- Format: **PNG**, RGB or RGBA (transparency not required — see "background" below)
- Naming: `venue-1.png`, `venue-2.png`, … `venue-N.png`
- Count: your call. The artist set has **22**. Anything from 12 upward works.

---

## ⚠️ The one constraint that matters: the safe zone

The same square file is displayed in **three different shapes**, each cropping it differently:

| Where in the app | Shape | Rendered size | What it does to the artwork |
|---|---|---|---|
| Venue profile page | **wide banner** | full-width × 180 | scales to fill the width, then **crops the top and bottom** — only the middle **51%** of the height survives |
| Booking detail | **rounded square** | 44 × 44 | almost the whole square survives, corners softly rounded |
| Everywhere else (booking lists, My Venues) | **circle** | 48 × 48 | **corners are cut off** by the circle mask |

Put those together and only a **centred region** survives every crop.

### ✅ Keep everything meaningful inside a centred box of **700 × 450 px** on the 1024 canvas.

That's roughly the middle **68% of the width** and **44% of the height**. Anything outside it will be
cut off in at least one place in the app.

```
┌──────────────── 1024 ────────────────┐
│                                      │
│         ╔══════════════════╗         │
│         ║                  ║         │  ← everything that
│         ║   700 × 450      ║  1024   │    matters goes in
│         ║   SAFE ZONE      ║         │    here, centred
│         ╚══════════════════╝         │
│                                      │
└──────────────────────────────────────┘
```

**Practical consequence:** these want to be **simple, centred marks on a flat background** — a single
clear icon or silhouette, horizontally composed. Not a busy scene, not a full-bleed illustration, and
nothing important near the edges or corners.

---

## Background

- **Fill the entire 1024 × 1024 canvas edge to edge** with a flat colour. No transparency, no vignette,
  no border, no rounded corners baked in — the app applies its own masks.
- Because the background bleeds off every edge, it's the only thing allowed outside the safe zone.
- **One flat colour per avatar.** Variety across the set is good — it's how a manager tells their venues
  apart at a glance in a list of 48px circles.

---

## Colour

The app's accent is coral **`#E2674A`**, and these avatars appear directly beside coral UI (buttons,
chips, selected states). So:

- **Avoid coral and near-coral** backgrounds — they'll fight the UI and stop reading as a *photo slot*.
- Deeper, more saturated tones work best: teal, indigo, plum, forest, amber, slate, wine.
- The mark itself should be **high-contrast** against its background — most of the time it's rendered at
  **48 px**, so subtlety is wasted.

---

## The 48px test

This is the acceptance test, and it's the one that actually matters:

> **Shrink the artwork to 48 × 48, mask it to a circle, and look at it.**
> If you can't instantly tell what it is, it's too detailed.

Thin lines, small text, fine gradients and interior detail all disappear at that size. Bold silhouette,
strong contrast, one idea per avatar.

---

## Not in scope

- The **artist/manager avatars** (`assets/images/avatars/avatar-1…22.png`) — done, unchanged.
- Real venue **photographs** uploaded by managers — those keep working exactly as now. These avatars are
  only the fallback for venues with no photo.

---

## Summary for the designer

> 12–22 square **1024 × 1024 PNGs**, named `venue-1.png` onwards.
> Each: a **bold, simple, centred venue icon** on a **flat, edge-to-edge background colour**.
> Everything meaningful inside a centred **700 × 450** box.
> No coral backgrounds. Must be legible at **48 px in a circle**.
