# Manager UI overhaul — 31 Jul 2026 (reference for mirroring on the artist side)

Everything the manager side got today, with **files touched** and whether it should be
**mirrored on the artist side** (`app/(artist)/(tabs)/*`). Use the "Mirror?" call on each when
picking up the "mirror to artist" to-do.

---

## 1. Invoices → per-artist view (manager profile)
- Invoices section on the profile now lists **artists** (avatar + name + a **"N to invoice"**
  pill in the pending amber `STATUS_COLORS.pending` = completed gigs not yet covered by a
  non-cancelled invoice). Tap an artist → new `app/(manager)/artist-invoices.tsx` (their
  invoices) → tap one → `manager-invoice-detail`. Includes artists with pending gigs but no
  invoices yet. Removed the old bulk select/download/delete + the bulk-download HTML helper.
- "Uninvoiced" = completed bookings whose id is **not** in any non-cancelled invoice's
  `gigs[].bookingId` (`InvoiceGig.bookingId`).
- Files: `app/(manager)/(tabs)/profile.tsx` (`InvoicesSection`), `artist-invoices.tsx`.
- **Mirror?** Different shape on the artist side — the artist SENDS invoices (per venue), so
  the artist "invoices" view is a different concept. Review separately; don't copy verbatim.

## 2. History removed from the dashboard
- The completed-gig History section was moved off the dashboard, then removed from the profile
  too. Completed gigs now live on: **venue detail → Bookings tab** and the dashboard
  **"Completed" stat → Completed Gigs page**. Component `manager-history-section.tsx` deleted.
- **Mirror?** The artist dashboard still has its own completed/history UI — decide whether to
  match (artist has a Completed Gigs page too).

## 3. Wording: "Set/Sets" → "Slot/Slots"
- All user-facing "Set(s)" labels/alerts → "Slot(s)" (bulk sheet, calendar alerts,
  booking-detail, assign-artist, create-venue rules placeholder). Left "Not set", "Set up your
  profile", and code comments. Code identifiers were already `slot`.
- **Mirror?** Check the artist side for any user-facing "Set" wording and match.

## 4. Shared venue filter + venue name as header title
- New `useVenueFilterStore` (session-only `venueId`). Dashboard, calendar and roster all read
  the one filter. Header shows the selected venue's name via `components/venue-filter-header.tsx`
  (tap → the venue-picker popup). **Coral** when a venue is selected among multiple; **black**
  on "All Venues"; a **single venue** shows its name in black with no dropdown. Roster filters to
  the selected venue's assigned artists. Removed the dashboard tune-icon + calendar tune/venue
  menu. The send-sheet's own venue chips are untouched.
- Files: `lib/store.ts`, `venue-filter-header.tsx`, dashboard/calendar/network.
- **Mirror?** Artists don't own venues, so a venue filter doesn't map directly — an artist works
  across venues. Likely N/A, or a different filter concept. Decide deliberately.

## 5. Network tab → "Roster", artists-only
- Renamed the tab "Network" → "Roster"; removed the Venues sub-tab, its toggle and the "+"
  create-venue button — artists only. Section labels: "My Lineup" → **Roster**, "Discover" →
  **Invite Artists**. File: `app/(manager)/(tabs)/network.tsx`, tabs `_layout.tsx`.
- **Mirror?** The artist has no equivalent "roster of artists" tab — N/A. (The parked artist
  Network→"Venues" rework is a separate item.)

## 6. Center "+" tab button → native action sheet
- A raised center "+" in the manager tab bar opens the **native iOS action sheet**
  (`ActionSheetIOS`): **Add Slot** (context-aware date — the calendar's selected day when on the
  calendar via `useCalendarSelectionStore`, else today; carries the shared venue filter),
  **Add Multiple Slots** (flags `useCalendarBulkStore` and jumps to the calendar, which opens
  its bulk sheet on focus), **Create Venue**. Removed the dashboard header "+", the calendar
  "Create" button and the calendar bulk "+" buttons. Stub route `create-action.tsx` + custom
  `tabBarButton`.
- Files: tabs `_layout.tsx`, `lib/store.ts`, `calendar.tsx`, `create-action.tsx`.
- **Mirror?** YES — the artist tab bar could get the same center "+" opening a native action
  sheet with the artist's create actions (Create private event / block via `add-block`). Good
  candidate to mirror.

## 7. Auth — Sign in with Apple (Guideline 4 fix)
- After Apple/Google sign-in the name/email are no longer re-asked: **"Display Name"** field
  (optional for OAuth, pre-filled), legal-name hidden for OAuth, blank name falls back to the
  email local-part; official `AppleAuthenticationButton` ("Continue with Apple"), buttons
  stacked full-width. Files: `app/(auth)/artist-setup.tsx`, `manager-register.tsx`,
  `components/oauth-buttons.tsx`.
- **Mirror?** Already shared/both-role (the artist signup got the same changes). No extra work,
  just re-verify (see the "artist sign-up steps" to-do).

## 8. Misc copy / flows
- "Added to a Lineup" → "Added to Lineup"; invoice wordmark removed; artist Create
  (`add-block`) got an editable date, TYPE-before-DATE order, and the single/travel mode toggle
  removed (single-day only); avatar refresh on launch (`roles.ts refreshCurrentUserProfile`,
  both layouts).

---

### Net: strongest artist-side mirror candidates
- **Center "+" native action sheet** (#6) with artist create actions.
- **Dashboard: show all bookings (not ~5) + venue/stat behaviour** (see the dashboard to-dos —
  applies to the artist dashboard too).
- **Wording sweep** (#3) for any "Set" text on the artist side.
