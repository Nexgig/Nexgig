# Design Sync — corrections we send Claude Design (+ the code cleanup they imply)

**Purpose.** Claude Design (a separate chat) READS this repo to draw the app mockups — it does
NOT edit code. It sometimes draws **old screens** because the repo still carries **dead /
renamed / leftover code** from earlier versions. This file logs every correction we've sent it,
and doubles as the **dead-code cleanup backlog**: clearing these makes future mockups match the
real app without us hand-correcting each time.

**Two causes of a "wrong" mockup, two fixes:**
- **(a) CD asset gap** — e.g. it lacks our bundled fonts. Fix: just tell CD. Code is fine.
- **(b) CD read old/dead code.** Fix: tell CD **and delete the dead code** so it can't recur.

Legend: 🎨 = tell Claude Design · 🧹 = code cleanup (delete/rename) · ✅ = done

---

## 2026-09-04 · Fonts — ALL screens  _(cause: CD asset gap)_
🎨 CD renders a generic system font. The app uses **two bundled typefaces**:
- **General Sans** → ALL UI text, every screen (body, titles, section headers, buttons, numbers).
- **Clash Display** → ONLY the **"Nexgig." wordmark**, the **coloured status dots**, and the
  **invoice-document** branding. Nothing else.
- Both are free on Fontshare. **Ignore Bricolage Grotesque** in `assets/fonts` (bundled, unused).

🧹 Code is correct as-is (`lib/fonts.ts`). ✅ **Removed** the unused **Bricolage Grotesque** OTFs +
`fonts.header` / `fonts.headerSemibold` (4 Sep 2026) so CD / design tools can't pick them up.

## 2026-09-04 · Manager Dashboard (Overview) — mostly faithful
🎨 In **"All Venues" (multi-venue)** mode the coverage-grid cells are **plain coloured squares** —
the date number sits only in the **header row**, not inside each cell. (In-cell numbers are the
single-venue view only.)
🎨 Sample dates were internally inconsistent (panel said "Fri 5" while the grid labelled the 5th
as Thursday). Placeholder data to tidy.
🧹 None — CD just needs the current read.

## 2026-09-04 · Manager Calendar — CD drew the OLD calendar  _(cause: dead code)_

| What CD drew (OLD) | What's actually current |
|---|---|
| **"Send 4"** filled coral button, top-right of the header | **No header button.** Header = **"All Venues ⌄"** only. The send action is coral **TEXT "SEND ALL (N)"** in the month row, shown **only when drafts are pending**. |
| **"‹ September 2026 ›"** with prev/next chevrons | **No chevrons** — you **swipe the grid** left/right to change month (Apple-style paging). |
| **"Today"** button (coral, right of the month) | **Removed.** That slot now holds "SEND ALL (N)", or nothing when there are no drafts. |
| Roster Balance rows show a **bare count** (4 / 2 / 2) | Rows show **"AED {cost} · {N} bookings"** per artist (per-artist money added 3 Sep) + coral bar; panel title is **"Roster Balance (September 2026)"** with an equalizer icon. |
| Big coral **"+" FAB** in the tab-bar centre | **No centre +.** Manager tab bar = **4 tabs**: Dashboard · Calendar · Roster · Profile. |
| Font (as above) | General Sans everywhere. |

🧹 **Dead code that likely caused the old drawing:**
- **`app/(manager)/(tabs)/create-action.tsx`** — the old centre-"+" screen. Registered as
  `<Tabs.Screen … href:null>` but **nothing navigates to it** (orphaned). **Delete** the file
  + its registration. This is almost certainly why CD drew the "+" FAB.
- **`calendar.tsx` ~line 2139** — leftover comment `// Send FAB (kept for style reference, no
  longer rendered)`. Dead breadcrumb — remove.
- **`calendar.tsx`** — the `todayBtn` style is now used for the "Send all" text. Misleading name;
  rename to `sendAllBtn`.

## 2026-09-04 · Manager Calendar → Roster Balance redesign — IMPLEMENTED ✅
The **one** code change in Claude Design's manager-screens handoff (`~/Downloads/design_handoff_manager_screens/README.md`;
every other frame in that bundle already matched `main`). Roster Balance went from a bordered box to a
**card-free section**: full-bleed hairline, two-line header ("Roster Balance" over the period), a dedicated
**"Month total"** row, per-artist **"AED {cost}"** + progress bar + **"N gigs"**, inset dividers past the
avatar. **Look only — no logic changed** (Tuts's instruction). Shipped to preview 4 Sep (group `c384c8e7`,
iOS `01a06c88`).
- ✅ **Bars now scale by AED** (Tuts approved same day): bar width = `cost / maxCost`, matching the mockup's
  money-proportional bars — a bigger earner shows a longer bar. The gig COUNT and the totals are unchanged.
  [group `f95c3116`, iOS `01a06c8f`]

## 2026-09-04 · Manager Roster tab → row layout IMPLEMENTED ✅
From a newer Claude Design Roster mockup (the original handoff said the Roster tab already matched `main`;
this is an updated design). Each artist row's **right column** now leads with the **AED amount** (big, bold,
foreground) over a muted **"N completed"** line — "—" / "No gigs" when the artist has no gigs that month.
Also removed the roster-wide **month total** from the header (Tuts: "doesn't mean anything"). Counts + costs
(completed gigs in the picked month) unchanged. Shipped to preview 4 Sep (groups `2e35aa12` + `beb9940d`).

---

## Later · one comprehensive dead-code sweep
Before the next big CD mockup round, run a **read-only audit** for orphaned screens,
renamed-but-still-referenced styles, and unreachable branches across `app/`, then delete them so
CD only ever reads live code.
- Known dead already: **`create-action.tsx`** (delete — above); `all-bookings.tsx` on both sides
  is dead too but **kept on purpose** (see CLAUDE.md — don't delete/restyle it).
- Reachable, so NOT dead (don't remove): the calendar's `week` / `today` view modes — they're set
  from the saved "default calendar view" setting.
