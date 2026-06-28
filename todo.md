# Project TODO

<!-- ═══════════════════════════════════════════════════════════════════════
     CURRENT OPEN ITEMS  ·  authoritative list, maintained June 15 2026
     Everything below this block is historical session logs (mostly [x] done).
     When asked "what's left", READ THIS BLOCK FIRST. Line refs point into the body.
     ═══════════════════════════════════════════════════════════════════════ -->

## ⟢ CURRENT OPEN ITEMS (read this first)

**MEDIUM / feature work**

_(DESIGN — "Finish Design" pass (NOT STARTED, requested June 27 2026; follows the June 27 orange `#E2674A` theme recolor which is DONE). Screen-by-screen polish toward a more minimal look — propose approach per screen before coding:_
_  • Artist Profile — minimal; invoices section minimal; profile photo = round upload._
_  • Manager Profile — round photo upload, minimal._
_  • Venue page — minimal, more like a menu (sectioned/list feel)._
_  • Booking page — minimal, more like an "agreement" page look._
_  • My Artists — minimal._
_  • My Venues — minimal._
_  • Assign DJ page — cards styled like the dashboard cards._
_  • Network (artist side) — show "DJ" or "Musician" instead of the genre under the name._
_  • Add a "My Venues" entry/section on the ARTIST side (surface it more prominently — confirm exact placement when implementing; artist my-venues.tsx already exists)._
_  • Dashboard — the "X" mark → change to "Nexgig" (logo / "gig" wordmark / possibly a NEW brand name TBD — confirm direction first)._
_  • "Add Block" control → style it like the "Add Set" pill (consistent pill look)._
_  • Tab headers — fix the Calendar / My Profile / tab headers on BOTH artist and manager sides (consistency pass)._
_  • Finish design IMAGES — finalize the app's image assets (logo / brand / avatar / illustration art) so they match the new minimal direction._
_  • CLEAN asset images — audit `assets/images/`, remove unused/orphaned image files (and any retired icons from the old blue theme), keep the asset folder lean. Verify nothing still imports a removed asset before deleting._
_  • UNIFIED TIME FORMAT — time is shown inconsistently (e.g. dashboard shows "8 PM" but the calendar shows "20:00" for the same slot). Make it consistent app-wide AND add a Settings toggle (12h AM/PM vs 24h) the user picks; every time display reads from that preference. Implementation: a single shared `formatTime` helper (note `lib/conflict-detection.ts` already exports a formatTime — likely the place, or a new one) that takes the user's 12h/24h setting; store the choice in settings (AsyncStorage, same pattern as other settings toggles) + expose via a hook/store so all screens re-render on change. Audit every time render (dashboard, calendar, booking-detail, assign-artist, invoices, pending-requests, profiles) so none format time inline — all go through the shared helper. Default 12h AM/PM (matches dashboard today)._
_  • PENDING REQUESTS time cut off — on the artist pending-requests cards the slot timing isn't fully visible (user can't see the full start–end time). Fix the layout so the full time range shows (likely a flex/numberOfLines/width constraint on the date-time row in `app/(artist)/pending-requests.tsx`). Folds in naturally with the unified-time-format work._
_  • WHATSAPP-STYLE LIST SEPARATION — study how WhatsApp separates its chats and apply the same somewhere in Nexgig. Candidate surfaces: the bookings cards or the artists cards (separate/group them WhatsApp-style). CONFIRM exact screen + the separation style with Tuts before implementing._
_)_

_(DASHBOARD — VENUE PHOTO MISSING FOR DISCONNECTED/HIDDEN VENUE (NOT STARTED, logged June 28 2026): on the manager dashboard "Bookings" cards the venue photo shows the place-pin FALLBACK (no image) for bookings whose venue is no longer in the manager's live `allVenues` set — confirmed root cause: the artist DISCONNECTED from the venue (and/or the venue is hidden/soft-deleted), so `allVenues.find(v => v.id === booking.venueId)` returns nothing and the code falls back to the snapshot `{ id, name }` which carries NO photo fields. This is technically correct fallback behaviour, NOT a render bug (the June 28 fix already re-resolves from the live store, identical to the working venue-detail path — it works whenever the venue is still live). To make the photo PERSIST through disconnect/hide, the durable fix is to SNAPSHOT the venue photo onto the booking like slotDate/venueName already are: add a `venue_photo_url` column on `bookings` (Supabase), write it at booking-creation time (saveBookingToSupabase in calendar.tsx + any other booking insert path), backfill existing rows, map it through in the booking loaders (_layout.tsx + dashboard handleRefresh + artist refresh), and have venuePhotoUri/the dashboard card fall back to `booking.venuePhotoUrl` when the live venue can't be resolved. Bigger change (touches DB + Edge/SQL + multiple loaders) — confirm scope with Tuts before starting. Alternative lighter option: resolve from the venue DIRECTORY cache or a read-by-id (incl. hidden) so the photo loads without a new column. Decide approach first. NOTE: pin fallback is acceptable as-is if not worth the DB change.)_

_(DASHBOARD — MULTI-ARTIST SLOT ON ONE LINE (NOT STARTED, logged June 28 2026): when a single slot has TWO (or more) artists booked on it, the manager dashboard "Bookings"/upcoming list currently renders them as SEPARATE rows (one card per booking). They should instead collapse onto ONE line/card for that slot — i.e. group the dashboard bookings by slotId and show the multiple artists together (e.g. both names / stacked avatars) on a single row, rather than repeating the same venue+date twice. Scope: `app/(manager)/(tabs)/dashboard.tsx` — the `dashboardBookings`/`dashboardBookingsPreview` memo currently maps one entry per booking; needs a group-by-slot pass so multi-artist slots become a single grouped item. Confirm the exact multi-artist display (both names inline vs stacked avatars + "+1") with Tuts before implementing. NOTE: user's message trailed off with "also …" — there may be a SECOND related ask to capture next session.)_

_(BUGS (NOT STARTED, logged June 27 2026):_
_  • USERNAME TAKEN — catch a taken username during artist signup at STEP 1 (inline, friendly message), not at the final insert where it surfaces as a raw Postgres unique-violation error. Likely a pre-check query (or RPC) against artists.username before advancing the wizard step._
_  • LEAVE/REJOIN vs OTHER VENUES — if an artist leaves a venue then requests to re-join, and the manager DECLINES that request: confirm what happens to the artist's OTHER active venue assignments with the SAME manager. Need to verify a declined re-join application does not cascade-remove or otherwise affect the artist's other venue_assignments for that manager. Investigate the decline handler in `app/(manager)/(tabs)/network.tsx` + the applications/venue_assignments relationship; fix if there's unintended coupling._
_)_

_(TODO — Auto gig-feedback prompt + completion push (NOT STARTED, requested June 25 2026): when a gig becomes COMPLETED, (a) the artist should get a PUSH NOTIFICATION that the gig is complete, and (b) the next time they open the app, the gig-review/feedback UI should POP UP automatically (rather than them having to open the booking detail to find it). Context for next session: the review UI ALREADY EXISTS inline in `app/(artist)/booking-detail.tsx` (the `booking.status === 'completed'` block — star rating + text → addReview + notifies manager `review_submitted`). So this task is about SURFACING it proactively, not building the form. Pieces: (1) detect newly-completed gigs the artist hasn't reviewed yet — cross-check completed bookings against useReviewStore (getReviewByBooking) on app open / artist tabs focus; gate so each gig only prompts once (e.g. a dismissed/seen flag, or rely on "has a review" + a local 'prompted' set). (2) show the prompt — either auto-navigate to booking-detail, or a dedicated modal reusing the same rating UI. (3) PUSH on completion — who flips a gig to completed? Manager confirms past gig OR artist self-confirms; a completed transition should fire a push to the artist. iOS push infra is live (Expo push tokens + send path); Android FCM key uploaded + the production Android build is done (June 27 2026) but not yet device-tested, so Android push is built-but-unverified until that test passes. Likely needs a notif type like 'gig_completed' + a send call at the completion point(s). Watch: don't double-prompt for gigs the artist already reviewed; respect the existing `review_submitted` manager notification.)_

_(Reports + Feedback rework — DONE June 25 2026 (app ships via OTA; SQL + Edge Function deployed via dashboard): moved BOTH the flag/report (venue + artist, ReportModal) and Send Feedback (manager + artist) off the old mailto/AsyncStorage approach to: (1) SAVE to Supabase — `reports` table (existing) got an authenticated INSERT RLS policy; NEW `feedback` table created w/ same policy (no SELECT policies — admin-only, read in dashboard / service role). SQL lives in `supabase/reports-feedback-setup.sql`. (2) EMAIL admin@nexgigapp.com server-side via the existing `send-email` Edge Function — added two admin templates `report_admin` + `feedback_admin` that render from `data` and route to ADMIN_EMAIL, branching BEFORE the to_user_id validation/user-lookup (admin emails have no recipient user). New client helper `sendAdminEmail(template, data)` in `lib/send-email.ts` (no to_user_id). Both saves + emails are fire-and-forget (best-effort, never block the confirmation). NOTE: needs the SQL + function deploy live BEFORE the OTA or feedback silently no-ops. (3) REPORT MODAL RESTYLE — now opens like Send Feedback: full-screen `presentationStyle="pageSheet"` + `animationType="slide"` (slides up), header w/ close X, scrollable body with `paddingBottom: 24 + keyboardHeight` (KeyboardAvoidingView) so you can scroll behind the keyboard, Cancel/Submit pinned in a footer above the safe-area inset. visible/onClose prop interface unchanged — both call sites (venue-detail, artist-profile-view) untouched.)_

_(Settings swipe-back disabled — DONE June 25 2026, OTA: added `gestureEnabled: false` to the `settings` Stack.Screen on BOTH manager + artist `_layout.tsx` (matches edit-venue/edit-profile). Back button is the only way out. NOTE: settings auto-saves every toggle instantly (AsyncStorage on change) — considered adding a Save button + unsaved-changes guard like edit-venue but DECLINED: there's nothing pending to save, so the guard would never fire and a Save button would be meaningless. Left settings as instant-save.)_

_(Artist booking-detail maps-in-card — DONE June 25 2026, OTA: the earlier "move Open-in-Google-Maps inside the venue card" fix was only applied to the MANAGER booking-detail; the artist still had a standalone button. Mirrored the manager pattern to `app/(artist)/booking-detail.tsx`: live-venue card is now a `venueCard`/`venueCardTop` with an in-card `mapsRow` (hairline-divided bottom row), standalone button removed. Same deliberate behavior as manager: maps row only on the LIVE venue card, NOT the venueName-only fallback (deleted venue = no real location) and NOT private events.)_

_(Report flow email wiring — DONE June 25 2026, ships via OTA: the flag/report on venue + artist pages (ReportModal) used to insert into a Supabase `reports` table with NO admin notification — so reports were invisible unless you queried the DB. Per decision, made it EMAIL-ONLY like Send Feedback: removed the `reports` insert entirely (+ the now-unused supabase import); on Submit it opens the reporter's mail app pre-filled to admin@nexgigapp.com with type/name/id/reason/details/reporter-id, then shows the silent 'Report submitted' confirmation. The empty `public.reports` table is now unused — harmless, can be dropped later. Single client-side file (`components/report-modal.tsx`) → OTA.)_

_(4-fix batch — DONE June 25 2026, shipped via OTA + tested: (1) KEYBOARD PADDING — added `paddingBottom: base + keyboardHeight` so users can scroll behind the keyboard on: manager-register page 1 (phone), create-venue page 1 (capacity) + page 3 (music link). create-venue didn't import useKeyboardHeight before — added it. (2) SWIPE-BACK in create-venue wizard — swiping left used to pop the whole wizard even from step 2/3/4. Fixed by `gestureEnabled: false` on the create-venue Stack.Screen in `app/(manager)/_layout.tsx` (matches edit-venue/edit-profile). Swipe-back is now fully disabled; the in-wizard back button (handleBack, steps backward) is the only back path. Swipe-to-previous-step would need gesture interception — deferred. (3) MANAGER DEFAULT AVATAR — `components/ui/avatar-image.tsx` got a `variant?: 'manager' | 'artist'` prop; manager + no photo now renders an illustrated avatar (`assets/images/manager-avatar.png`, blue figure w/ music note), artists keep the `person` icon. Passed `variant="manager"` at the two manager self-view call sites: profile tab + edit-profile. Image asset ships via OTA in most SDK54 setups — confirmed working on this update. (4) MOVE DELETE VENUE — removed the red Delete button + Danger Zone (and now-orphaned handleDelete + unused imports/styles) from `edit-venue.tsx`; ported handleDelete into `venue-detail.tsx` and replaced the Hide Venue button (Overview tab, owner-only) with a Delete Venue button using the greyBtn shape but red icon/text/border. Full delete behavior preserved (cancel active bookings → notify artists → soft-hide is_hidden=true → route to profile). handleToggleHideVenue + hide/unhide store wiring kept intact but unused, per request. All 4 are JS-only (asset incl.) → shipped via `eas update --branch production`.)_

_(End-of-day 3-fix cleanup — DONE June 25 2026, shipped via OTA + tested: (1) ADMIN VENUE PHOTO now shows on ALL manager screens, not just Network. Root cause: manager `app/(manager)/_layout.tsx` venue loader manually mapped rows with hardcoded `photoUrls: []` and NO `adminPhotoUrl`, so admin-curated photos never reached my-venues/venue-detail/calendar. Fixed by using the shared `mapVenueRow` (maps photo_urls + admin_photo_url) and layering `billing` on top. Artist side was already correct (its loader maps adminPhotoUrl + uses venuePhotoUri). Admin sets `venues.admin_photo_url` directly in Supabase; venuePhotoUri resolves manager photo → admin photo → icon. (2) MANAGER PROFILE → Artists stat card (when djCount===0) routes to `network?tab=artists`; the Network screen only read the tab param via useState's one-time initializer, so when already mounted it showed the last-open sub-tab. Added a useFocusEffect that applies the `tab` param on focus → now lands on Artists like the Discover button (which uses the identical route, so it's fixed too). (3) EDIT-VENUE false "unsaved changes" after Save: handleSave reset the baseline in a ref, but hasChanges is a useMemo on [form, photoUri] — a ref mutation doesn't retrigger it, so it stayed true. Added a `savedTick` state bumped after save + added to the memo deps. All three are JS-only → shipped via `eas update --branch production`, no rebuild.)_

_(Batch UI/logic fixes — DONE June 25 2026, shipping in iOS build #5 + OTA: (1) venue-create field order Name→Address→Type; (2) artist phone now saved to artists table so manager-side profile Contact shows phone+email — fixes NEW signups only; (3) booking-detail "Open in Google Maps" moved inside the venue card; (4) artist-setup keyboard leaves scroll space for Instagram; (5) manager dashboard heading "Confirmed Bookings"→"Upcoming Bookings"; (6+7+8) auth-entry redesign — welcome.tsx is now a compact, keyboard-safe email-routing screen (login_hint: none→chooser, google/apple→"use that button", password→sign-in prefilled), matched BLACK Apple-style OAuth buttons (custom Pressables, both black bg/white logo+text), sign-in.tsx accepts email param, choose-account-type passes oauth through only when present. STILL OPEN: item 9 availability blocks — confirmed gigs should also flag the artist unavailable to managers (not yet done).)_

_(Item 9 availability blocks — DONE June 25 2026, shipped via OTA + tested: a manager assigning an artist now sees an unavailable flag when that artist has a CONFIRMED gig elsewhere on the same date/overlapping time. ROOT CAUSE: bookings RLS only allows owner reads (manager=own, artist=own), so the old cross-manager query `.from('bookings').neq('manager_id', me)` was silently filtered to empty — confirmed gigs elsewhere never flagged. (availability_blocks already worked because it has an `Authenticated can read availability` qual:true SELECT policy.) FIX: new SECURITY DEFINER RPC `get_artist_busy_times(p_artist_ids uuid[], p_date date)` returns ONLY {artist_id, start_time, end_time} for CONFIRMED bookings on a date — no venue, no manager (privacy-safe). assign-artist.tsx now calls the RPC instead of the blocked query, and its useEffect deps were widened (was `[slot?.id]` only → now re-runs when assignments/data load) + a cancelled guard added. Conflict text now distinguishes: own confirmed gig → "Booked at [venue] HH–HH", own draft → "Drafted at [venue] HH–HH" (lib/conflict-detection.ts), another manager's gig → "Booked elsewhere HH–HH" (no venue), block → "Unavailable HH–HH". NOTE: slot_date is a real `date` column — RPC compares date=date, no ::text cast. Only `confirmed` blocks (not `requested`).)_

_(delete-account Edge Function — FIXED + REDEPLOYED June 25 2026: removed the retired `invites` table refs from the cleanup `deletions` array. They were erroring ("Could not find table public.invites"), which aborted the function BEFORE step 5 (auth user deletion) — leaving the profile rows deleted but an orphaned auth.users row. Now deletes cleanly incl. the auth login. Redeployed via dashboard + tested. Note: Edge Functions are server-side — NOT shipped via app/OTA.)_

_(OTA enabled — DONE June 25 2026: added expo-updates@~29.0.18 + runtimeVersion {policy:appVersion} + updates.url in app.config.ts, and channel "production" in eas.json. iOS build #5 is the first OTA-capable binary on TestFlight. Future JS-only fixes ship via `eas update --branch production` — no rebuild. NATIVE changes (deps, app.config native, icons) still need a full build+submit.)_

_(Invoice reminders — DONE June 24 2026: artist gets a LOCAL notification at 10:00 AM on each venue's reminder day ("Time to send your invoice for [venue]"), skipped if already invoiced that month. Engine `lib/invoice-reminders.ts` (mirrors lib/reminders.ts); re-armed on app open (artist `_layout.tsx`), after a reminder-day change (invoices.tsx Save), and after an invoice is sent (invoice-preview.tsx). Local-only, same app-open-reschedule tradeoff as gig reminders. The reminder day previously only colored a badge — it now actually notifies.)_

_(Notification deep-link — DONE June 23–24 2026: push-tap routing by payload + cold-start in app/_layout.tsx, plus in-app routing for booking/venue/lineup on both sides. Manager IN-APP `invoice_received` tap now routes to the manager Profile tab (where invoices live) — done June 24. The old `artist_joined → My Artists` idea is obsolete: no such notification exists in the current model (artists self-register / apply; managers see join requests via the Network badge).)_

**BIGGER WORKSTREAMS (deliberately parked)**
- Push (Android FCM credentials) — KEY UPLOADED June 25 2026. The multi-session org-policy blocker is RESOLVED: admin@nexgigapp.com is a Google Workspace super-admin = the nexgigapp.com Cloud ORG enforces `iam.disableServiceAccountKeyCreation` org-wide, inherited by the Firebase project `nexgigapp-b34e6` (project# 718321313770 — NOTE this is the FCM project, NOT the thematic-lore-498814-t5 "Nexgig" GCP project). admin@nexgigapp.com already had Organization Administrator + Organization Policy Administrator. FIX: opened the constraint on project `nexgigapp-b34e6` → Manage policy → Override parent → Enforcement Off → created the service-account JSON key (saved to ~/Downloads, deleted after upload) → `eas credentials` → Android → production → Google Service Account → FCM V1 → uploaded the JSON. Then RE-ENFORCED the org policy (set back to inherit/enforced). BUILD DONE June 27 2026 (`eas build --profile production --platform android` ran successfully — first native Android build, Android keystore generated + managed by EAS). STILL TODO: install the build on an Android device → test push delivery end-to-end (needs a 2nd device for cross-user, since push goes manager↔artist). The same uploaded key also unblocks `eas submit --platform android` for Google Play. Gig reminders DONE (local notifications, multi-select offsets). iOS push already works end-to-end. (L839, L842)
- Calendar: artist Google Calendar sync (scope TBD). (L946)
- App Store / TestFlight launch path — IN PROGRESS June 25 2026: **iOS build submitted to TestFlight** (steps 1-4 DONE). ASC App ID 6784020757, bundle com.nexgig.app, build #4, v1.0.0.
    1. ✅ Paid Apple Developer account (elieturk@live.com, Team 9F4MZ3T94X Individual). NOTE: had to accept an updated Apple Developer Program License Agreement at developer.apple.com before the bundle ID would register; EU trader-status (DSA) banner can be left as-is for a UAE launch (blocks EU distribution only, not the build).
    2. ✅ App record auto-created in App Store Connect by `eas submit` (ASC App ID 6784020757).
    3. ✅ Production build: `eas build --profile production --platform ios`. GOTCHA (fixed): adding `google-services.json` pulled Firebase pods (AppCheckCore/GoogleUtilities/RecaptchaInterop) into the iOS build; pod install failed with "Swift pods cannot be integrated as static libraries." FIX = `expo-build-properties` → `ios.extraPods` with `modular_headers: true` for those 3 pods (committed in app.config.ts). `expo-build-properties` has NO `useModularHeaders` key — use `extraPods` instead.
    4. ✅ Submit: `eas submit --profile production --platform ios` → auto-created an App Store Connect API key (ADMIN) on EAS servers, uploaded the .ipa. Apple processes ~5-30 min.
    5. ⬜ NEXT: TestFlight INTERNAL testing — install via the TestFlight app on iPhone (elieturk@live.com already added as internal tester), RETEST core flows in RELEASE mode: full signup matrix, booking confirm/decline/cancel, invoice + PDF download, push + local notifications (gig + invoice reminders), venue picker / Open in Maps. Clear the export-compliance prompt if it appears (should auto-pass — ITSAppUsesNonExemptEncryption=false already set).
    6. ⬜ **TestFlight EXTERNAL testers — PRIORITIZED (user wants this next).** Shareable public link path, step by step:
        a. App Store Connect → Nexgig → TestFlight tab. Confirm build #5 finished processing + has NO "Missing Compliance" flag (export-compliance should auto-clear via ITSAppUsesNonExemptEncryption=false; if it asks, answer No / standard encryption).
        b. Create an EXTERNAL group (e.g. "Beta Testers") under TestFlight → add build #5 to it.
        c. Adding the first build to an external group TRIGGERS a one-time **Beta App Review** by Apple (~24h, sometimes faster). Fill the "What to Test" notes + a contact email + (if asked) a demo manager & artist login. THIS REVIEW GATES external distribution — can't share the public link until it clears.
        d. After approval: enable the group's **Public Link** → get a `https://testflight.apple.com/join/XXXXXXXX` URL. Share that anywhere; testers install the TestFlight app then tap to install Nexgig. Up to 10,000 testers, no ASC access needed.
        e. (Alternative, instant but limited: INTERNAL testers — up to 100, but each must be added to the ASC team with an Apple ID + role. No review, available immediately. Good for a cofounder, not wide sharing.)
        NOTE: every NEW build pushed to the external group gets a quick re-review (usually trivial/auto after the first). JS-only OTA updates do NOT need re-review — they ship under the already-approved binary.
    7. ⬜ Public App Store listing → full Apple review. PREP STATUS: privacy-policy URL ✅ live (https://nexgig.github.io/legal/privacy-policy.html) + terms ✅; still need (a) two reviewer demo accounts (manager + artist, seeded), (b) screenshots from the TestFlight build. Full listing copy drafted in `app-store-listing.md` at repo root. (L830-831)
- Google Play launch path (INDEPENDENT of Apple — neither blocks the other; can run in parallel, before, or after iOS). The two items with LEAD TIME are flagged — start those early if Play matters:
    1. **Google Play Developer account — one-time $25** (not yearly, unlike Apple's $99/yr). Register at play.google.com/console. ⚠️ If registering as an ORGANISATION, Google now requires D-U-N-S verification (can take a few days). Individual account is faster but shows your name publicly. ← LEAD TIME.
    2. **FCM service-account key** — the SAME key from the Android-push work above. `eas submit --platform android` uses it to upload to Play. Finishing the org-policy/key step unblocks BOTH push and Play submission. (Already in progress.)
    3. Production AAB build: `eas build --profile production --platform android` (Play wants `.aab`, not the dev `.apk`).
    4. Play Console listing: title, short + full description, screenshots, content-rating questionnaire, Data safety form, target-audience declaration, privacy policy URL.
    5. **Closed/internal testing track FIRST** — newer personal Play accounts must run closed testing with ~12+ testers for ~14 days before they can apply for production access. ← LEAD TIME (start this early to avoid a 2-week launch delay).
    6. Submit to production: `eas submit --profile production --platform android` → uploads the AAB to Play Console → Google review (usually faster than Apple, can be hours–days).
    Note: production build uses Google Play App Signing with a DIFFERENT SHA-1 — add it to the Nexgig Android OAuth client at submission so Google sign-in keeps working in the Play build.
- Dep alignment before the production release build: run `npx expo install @react-navigation/bottom-tabs @react-navigation/native` to pin them to SDK 54's expected versions — currently ahead (7.8.12 / 7.1.25 vs 7.4.0 / 7.1.8). Harmless in dev (flagged by `expo install --check`), but worth pinning for the App Store build + a quick navigation smoke-test after. Not urgent.
- Payments: Tap Payments integration.

**LINT HYGIENE (deferred — "clean as you touch")**
- 9 cosmetic unescaped-apostrophe errors, ~80 unused-import/var warnings, ~40 hook-dependency warnings (case-by-case ONLY — bulk-fixing has caused infinite loops), ~7 duplicate-import warnings. Full catalogue in the June 15 lint session log near the bottom.
- Delete `lib/_core/` (still has live bits used by oauth/callback — blocked until auth pass). (L797)
- delete-account Edge Function hardening (best-effort cleanup steps). (L960)

<!-- ═══════════════════════════════════════════════════════════════════════
     END current open items. Historical logs follow.
     ═══════════════════════════════════════════════════════════════════════ -->

- [x] Project initialization and scaffolding
- [x] Type definitions (User, DJProfile, Venue, Booking, etc.)
- [x] Zustand stores (auth, venue, slot, booking, roster, notification, availability)
- [x] Mock data for demo accounts and venues
- [x] Conflict detection utility
- [x] Theme configuration (navy/blue/gold brand colors)
- [x] Shared UI components (AvatarImage, EmptyState, SectionHeader, StatusBadge)
- [x] Icon symbol mappings for all tabs
- [x] Auth flow: Welcome screen
- [x] Auth flow: Sign-in screen
- [x] Auth flow: Manager registration (4-step wizard)
- [x] Auth flow: DJ setup (4-step wizard)
- [x] Manager tabs layout (Dashboard, Venues, Calendar, Roster, Profile)
- [x] Manager Dashboard screen
- [x] Manager Venues list screen
- [x] Manager Calendar screen
- [x] Manager Roster screen
- [x] Manager Profile screen
- [x] Manager Venue Detail screen
- [x] Manager Booking Detail screen
- [x] Manager Assign DJ screen
- [x] Manager Create Venue screen
- [x] Manager DJ Profile View screen
- [x] Manager Notifications screen
- [x] DJ tabs layout (Home, Bookings, Availability, Profile)
- [x] DJ Home screen
- [x] DJ Bookings screen
- [x] DJ Availability screen
- [x] DJ Profile screen
- [x] DJ Booking Detail screen
- [x] DJ Notifications screen
- [x] Root navigation with auth redirect
- [x] App icon and branding
- [x] Design document
- [x] Restructure roster to global manager roster (DJs added once, assigned to venues separately)
- [x] Add GlobalRoster type (manager-level DJ list, independent of venues)
- [x] Add VenueAssignment type (links a global roster DJ to a specific venue)
- [x] Update Zustand roster store with global roster + venue assignment logic
- [x] Update mock data for global roster and venue assignments
- [x] Update Roster tab screen to show global DJ list with venue assignment UI
- [x] Update DJ Invite flow to add DJ to global roster (not venue-specific)
- [x] Update Venue Detail roster tab to show assigned DJs from global roster
- [x] Update Assign DJ screen to pull from global roster
- [x] Test and verify all roster-related flows work end-to-end
- [x] Sort roster artists alphabetically by name on All DJs and By Venue tabs
- [x] Create unified calendar view showing all bookings with artists and venues together
- [x] Add weekly overview view showing all slots across all venues for the entire week at a glance
- [x] Add "Copy Previous Month" button to calendar (copies shifts without assigned DJs, name + timing only)
- [x] Add "Delete All Shifts" button to calendar (deletes all shifts in current month)
- [x] Manager can delete a slot
- [x] Manager can edit a slot (name, time)
- [x] Manager can edit venue info (name, address, etc.)
- [x] Manager can delete a venue
- [x] Simplify Copy Previous Month and Delete All buttons to icon-only (no text), reposition between calendar grid and slots section
- [x] Fix Copy Previous Month logic to copy by day-of-week (Monday→Monday, Tuesday→Tuesday) with deduplication
- [x] Add manager profile editing screen (name, bio, location, photo, etc.)
- [x] Fix venue name chips horizontal scrolling not responding to touch
- [x] Move copy/delete month icons to a better position near the calendar header
- [x] Fix weekly view not scrolling down
- [x] Change weekly view to start Monday → Sunday instead of Sunday → Saturday
- [x] Add profile picture editing for manager
- [x] Redesign DJ availability screen to match manager calendar layout, tapping experience, and colors
- [x] Fix booking detail: manager should see "Cancel Request" not "Accept Booking", DJ should see "Accept/Decline"
- [x] Manager can edit venue photo from edit-venue screen
- [x] Fix venue chips horizontal scroll in calendar (not responding to touch)
- [x] Reorder calendar tabs to Month | Week | Venue and default to Month view
- [x] Manager can securely edit phone number with confirmation step
- [x] Manager can securely edit email with confirmation step
- [x] Fix day number not centered inside blue highlight circle on monthly calendar (especially two-digit numbers)
- [x] Fix inconsistent row gaps between weeks in monthly calendar grid
- [x] Hidden venues should disappear from the Venues tab
- [x] Hidden venues should appear in Profile tab with unhide option
- [x] Fix hide/unhide button to show correct label based on venue's current hidden state
- [x] Merge "My Venues" and "Hidden Venues" into one "My Venues" section on Profile tab with inline unhide icon
- [x] Rename "My Venues" to "Venues" in Venues tab header and Profile tab section
- [x] Add color field to Venue type for permanent venue color
- [x] Add color picker to create-venue screen
- [x] Add color picker to edit-venue screen
- [x] Update calendar to use stored venue color instead of index-based assignment
- [x] Fix keyboard covering Add Slot modal input fields
- [x] Replace manual time text inputs with scroll-wheel time picker in Add Slot modal
- [x] Replace time selector with iOS-style scroll wheel picker (like iPhone alarm clock)
- [x] Fix time picker wheel crash — replace reanimated pan gestures with ScrollView snap approach
- [x] Fix time picker: selected number not visible in highlight band, colon misaligned, improve smoothness
- [x] Remove KeyboardAvoidingView from Add Slot modal — keyboard won't cover the slot name field
- [x] Fix venue color not updating in calendar after editing venue color
- [x] Fix venue color dots on calendar still not updating after venue color edit (deeper investigation needed)
- [x] Move "Save Changes" button to the header bar (top-right) on Edit Venue screen
- [x] Add unsaved changes warning when navigating back from Edit Venue with unsaved edits
- [x] Add confirmation dialog before saving on Edit Venue screen
- [x] Disable swipe-back gesture on Edit Venue screen (user must use back arrow button)
- [x] Reorder calendar tabs to Venue | Weekly | Monthly and set Venue as default
- [x] Add DraftAssignment type and draftAssignments store (slot→DJ mapping, no request sent)
- [x] Update slot cards to show Draft badge (yellow) vs sent booking badge
- [x] Update Assign DJ flow to save as draft instead of sending booking request
- [x] Add per-DJ assignment counter on assign screen for balance visibility
- [x] Add "Send All Requests" button to convert all drafts to real booking requests
- [x] Allow manager to remove/change a draft assignment before sending
- [x] Remove save draft confirmation alert on assign-dj screen
- [x] Rename "Send All (N)" button to "Send Bookings (N)" in calendar header
- [x] Support multiple DJ assignments per slot (Option B): slot can have multiple DJs with individual draft/booking statuses
- [x] Update DraftAssignment store to allow multiple drafts per slot (one per DJ)
- [x] Update Booking store to allow multiple bookings per slot (one per DJ)
- [x] Update slot card UI to show all assigned DJs stacked with individual status badges
- [x] Update Assign DJ flow to add a DJ rather than replace existing assignment
- [x] Allow removing individual DJ assignments from a slot (not the whole slot)
- [x] Update Lineup Balance panel for multi-assignment slots
- [x] Update Send Bookings logic for multi-assignment slots
- [x] Fix slot card DJ avatar and name getting clipped on the right side in monthly calendar view

- [x] Make Draft badge in slot cards match solid style of Confirmed/Requested badges

- [x] Remove draft gig count from Assign DJ screen DJ cards
- [x] Remove draft confirmation modal — assign draft directly on DJ tap
- [x] Remove assigned DJs banner from Assign DJ screen
- [x] Fix real-time reactivity on Assign DJ screen (Zustand selector fix)
- [x] Toggle draft on/off by tapping DJ card on Assign DJ screen
- [x] Make Send Booking Requests dialog context-specific (venue name + period)
- [x] Restructure Calendar to Monthly/Weekly top-level toggle with venue filter row (replace 3-mode system)
- [x] Fix default calendar view not applying after changing it in Settings
- [x] Replace all mock data with real venues (February30, Lucias, Lady Bird, Limonata, Yubi, Theater), real artists, and real shift types/times
- [x] Populate mock slots/bookings with exact Apr 6–12 schedule from spreadsheet
- [x] Set default venue filter to "All" when opening calendar
- [x] Build working artist Settings screen (default calendar view, notifications, theme, language, edit profile)
- [x] Redesign artist availability block screen to match manager slot design
- [x] Update artist profile to match manager pattern (remove header gear icon, add Settings + Edit Profile as full-width body rows)
- [x] Manager profile: remove Settings row and Edit Profile button from body, add settings gear icon next to edit pencil in profile card
- [x] Replace "Years Exp." stat on manager profile with total DJ roster count
- [x] Artist profile: add settings gear next to edit pencil in profile card, remove Settings/Edit Profile body rows
- [x] Fix: artist default calendar view preference not being applied on availability screen
- [x] Fix: artist availability toggle order — Month should be left, Week right (matching settings default position)
- [x] Fix artist availability calendar to match manager calendar design (toggle layout, month grid, day cell styling)
- [x] Fix: artist availability toggle order should be dynamic — active view always on the left
- [x] Fix manager calendar default view not applying from Settings
- [x] Set Monthly as first-time signup default for both manager and artist
- [x] Fix calendar toggle order: order fixed by saved default (not active selection) — active pill highlights in place, does not move
- [x] Replace all user-facing "DJ" text with "Artist" across the entire app UI (titles, labels, buttons, tabs, placeholders)
- [x] Calendar default view applies on first mount only (not every tab focus) — switching mid-session persists until app restart
- [x] Remove App Language setting from artist and manager settings screens
- [x] Manager can remove artist from a specific venue in the roster (All Artists tab)
- [x] Roster: remove All Artists/By Venue sub-tabs, replace with horizontal chip row (All + venue names)
- [x] Fix Add Slot sheet keyboard handling — sheet content scrolls and stays visible when keyboard opens
- [x] Roster chip row: match calendar venue filter chip style
- [x] Roster artist cards: replace wrapping venue chips with collapsible dropdown (venues + remove per venue)
- [x] Unify horizontal venue filter chip style across Calendar and Roster screens
- [x] Fix All chip to match venue chip pill shape on both Roster and Calendar
- [x] Fix chip text clipping (bottom of letters cut off by white)
- [x] Fix Add Slot modal: screen moves when keyboard opens (regression)
- [x] Fix Add Slot modal: VirtualizedLists nested in ScrollView warning
- [x] Fix Add Slot modal: time picker wheel not scrollable
- [x] Fix Add Slot modal layout: buttons overlapping pickers, sheet disappears on keyboard open
- [x] Audit: Replace remaining user-facing "DJ" text with "Artist" (venue-detail, edit-venue, edit-profile, calendar, mock-data)
- [x] Audit: Add purple theme token for settings accent color
- [x] Audit: Replace 218+ hardcoded hex colors with theme tokens in inline styles
- [x] Audit: Fix 56 JSX prop color assignments (color=colors.X → color={colors.X})
- [x] Audit: Fix module-level color references (notifications, create-venue, edit-venue)
- [x] Audit: Replace trackColor hardcoded values with theme tokens in settings
- [x] Audit: Fix 12 touch targets below 44pt minimum (buttons, icons across calendar, profile, settings)
- [x] Audit: Verify all long-list screens use FlatList (roster, calendar, venues, notifications, bookings, assign-dj all confirmed)
- [x] Fix venue chip names clipped/cut off in Roster screen filter row
- [x] Fix venue filter chips still clipping venue names on Roster screen (names truncated, not fully readable)
- [x] Remove venue filter chip row from Roster tab — show all artists in one flat list
- [x] Fix iOS-specific text clipping on Calendar venue filter chips (bottom of letters cut off on native)
- [x] Rebuild Add Slot modal from scratch with clean iOS-native layout and properly rendering venue chips
- [x] Fix iOS venue chip text still clipping in Add Slot sheet (overflow hidden cutting descenders)
- [x] Fix Add Slot sheet cut off at bottom on iOS — time pickers and buttons hidden behind home indicator
- [x] Fix VirtualizedLists nested inside ScrollView warning in Add Slot sheet
- [x] Fix Add Slot sheet layout — buttons overlapping time picker wheels, sheet not tall enough
- [x] Fix Add Slot sheet too short on iOS — replaced wheel pickers with compact text inputs, sheet now fits on all phones
- [x] Add KeyboardAvoidingView to Add Slot sheet so it slides up above the keyboard on iOS
- [x] Restore grey overlay behind Add Slot sheet (disappeared after KeyboardAvoidingView change)
- [x] Delete old Add Slot sheet and rebuild from scratch with polished iOS-native design (venue color pills, preset name chips, clock-icon time inputs, red border validation, full-width CTA)
- [x] Replace manual text time inputs with dropdown time picker (scrollable list of 30-min intervals, selected time highlighted)
- [x] Make Add Slot sheet compact so it sits above keyboard without moving (no KeyboardAvoidingView shift)
- [x] Shrink all elements inside Add Slot sheet (smaller padding, chips, buttons, spacing)
- [x] Move Add Slot sheet higher up the screen so keyboard doesn't cover the input fields
- [x] Fix background content visible below floating Add Slot sheet — ensure full dark overlay covers everything
- [x] Time dropdowns should float absolutely below trigger button — sheet must not move when dropdown opens
- [x] Add Done button on keyboard for slot name input to dismiss keyboard when finished typing
- [x] Change Confirmed and Requested badge text color from white to black
- [x] Calendar All-venues view: show single summary dot per day (green=all confirmed, orange=any requested) instead of multiple dots; per-venue view keeps individual dots
- [x] Calendar summary dot: green only if ALL bookings on that day are confirmed; orange if any single booking is requested (multi-DJ slots included)
- [x] Calendar summary dot: include draft assignments — orange if any booking is requested OR drafts exist alongside confirmed bookings; green only if all confirmed and no drafts remain
- [x] Replace preset slot name chips with Day/Sunset/Night and auto-fill times: Day=13:00-17:00, Sunset=17:00-21:00, Night=21:00-01:00
- [x] Calendar dots: drafts always grey (not orange); orange only for requested bookings — applies to All-venues and per-venue views
- [x] Unify calendar dot logic: always one dot per day in both All-venues and individual venue views — orange=any requested, grey=any draft, green=all confirmed
- [x] Calendar dots: max 2 dots — grey+orange when both drafts and requested exist; single orange=requested only; single grey=draft only; single green=all confirmed
- [x] Move "Send All Bookings (N)" from calendar header to sticky bottom bar above tab bar
- [x] Sticky Send bar: "Send All Bookings" when All venues selected; "Send Bookings for [Venue]" when specific venue selected — only sends that venue's drafts
- [x] Shrink sticky Send bar button to match Add Slot button size; ensure it appears in weekly view too
- [x] Fix weekly view: filter slots by selected venue (currently shows all venues' slots regardless of venue filter)
- [x] Add "Today" button next to Monthly/Weekly toggle in calendar header
- [x] Replace sticky Send bar with circular FAB (floating action button) bottom-right, send icon + draft count badge
- [x] FAB send: open action sheet with "Send All Venues" + per-venue options (each showing draft count); removed venue-filter-aware send logic
- [x] Send FAB: always show when any draft exists in current period, regardless of selected venue filter
- [x] Send FAB: only count/show drafts for slots that are today or in the future (exclude past slot dates)
- [x] Fix Send All Venues count mismatch: venuesDraftGroups should cover all future drafts (not period-bounded); Send All count should sum per-venue rows
- [x] Add "Today" as a third calendar view mode (same level as Month/Week in the toggle), showing only today's slots in weekly-list style
- [x] Update Settings to include Today as a selectable default calendar view option
- [x] Show assigned artist names and status badges on slot cards in Weekly and Today views (matching monthly view)
- [x] Add Slot sheet: always show venue picker even when a specific venue filter is active
- [x] Monthly slot cards: show venue name next to the colored bar (not just the color)
- [x] Weekly/Today unassigned slot cards: match monthly design — slot name, time, venue name, and "+ Assign Artist" button
- [x] Settings: add "Today" as a selectable default calendar view option
- [x] Calendar toggle: selected default moves to first position; rename Monthly→Month, Weekly→Week
- [x] Weekly/Today: group slots by venue (with colored dot header + slot count) when "All" venues is selected, matching monthly view
- [x] Weekly/Today cards: reduce height/padding/font to match monthly compactness; expand card to full width
- [x] Fully unify Weekly/Today slot card styles with Monthly — same wrapper, same styles, no separate weekSlot* styles
- [x] Add individual send booking button next to draft icon on each draft artist row in slot cards (all views)
- [x] Auto-complete confirmed bookings whose slot date has passed (mark isCompleted=true)
- [x] Dashboard: add Completed counter card alongside Venues, Upcoming, Pending
- [x] Dashboard: add Completed Bookings section (list of all completed bookings, same card style as Upcoming)
- [x] Dashboard: collapsible Completed Bookings section with chevron toggle (like Lineup Balance)
- [x] Conflict detection: also check draft assignments (not just confirmed/requested) when assigning an artist
- [x] Dashboard: add Artists counter card to summary grid
- [x] Dashboard: move Pending card before Upcoming in summary grid
- [x] Settings: add Completed Bookings date range option (This Month / This Year / All Time); wire to Dashboard Completed counter
- [x] Lineup Balance: include completed bookings in artist count (not just confirmed/requested/draft)
- [x] Settings: add multi-select Lineup Balance status filter (Draft, Requested, Confirmed, Completed — any combo or All); wire to Lineup Balance panel in calendar
- [x] Roster: confirm before adding or removing an artist from a venue
- [x] Remove Delete All Shifts and Copy Previous Month buttons from calendar (user will add custom solution later)
- [x] Lineup Balance panel: always starts collapsed when app opens
- [x] Week/Today view: allow multiple artist assignments per slot (same as month view)
- [x] Roster tab: redesign to match app visual language (cards, typography, spacing, interactions)
- [x] Dashboard: remove Completed stat card from top grid (keep 4 cards: Venues, Artists, Pending, Upcoming)
- [x] Dashboard: replace flat completed bookings list with month-by-month breakdown rows inside the panel
- [x] Dashboard: completed bookings month rows are tappable accordion — expand to show individual bookings per month
- [x] Dashboard: horizontal venue filter chips inside Completed Bookings panel (plain style, no colors)
- [x] Settings: remove obsolete Completed Bookings Range card and related constants
- [x] Calendar: add Bulk Add Slots bottom sheet (+ button in month header, venue multi-select, day-of-week toggles, multiple slot templates with name+time)
- [x] Calendar: fix venue chip styling in Add Slot modal to plain primary-blue selected chips (no colors)
- [x] Calendar: fix Bulk Add Slots modal to slide up from bottom like Add Slot modal
- [x] Calendar: fix month title centering — balance left/right sides so title stays centered with + button present
- [x] Calendar: convert Bulk Add Slots modal from bottom sheet to full-screen modal
- [x] Calendar: fix raw Unicode escape sequences in Bulk Add modal (… and → now render correctly)
- [x] Calendar: add "Delete All Open Slots" button inside Bulk Add screen — removes only empty slots (no drafts, no bookings) for current month
- [x] Calendar: auto-delete past empty slots (no drafts/bookings) on calendar focus
- [x] Calendar: Bulk Add skips past dates — only creates slots from today onwards for current month
- [x] Completed bookings are permanent — deleting a slot does NOT delete its completed bookings (store + auto-cleanup protection)
- [x] Dashboard: Completed Bookings panel always shows all completed bookings even if their slot was deleted
- [x] Artist profile: add Completed Bookings history section showing past gigs
- [x] Calendar: remove floating Send button, add Send button to top-right header
- [x] Calendar: Send button opens context-aware bulk send bottom sheet (month/week/day scoped drafts)
- [x] Calendar: bulk send bottom sheet shows drafts grouped by date with multi-select and Select All
- [x] Calendar: bulk send promotes selected drafts from draft → requested and notifies artists
- [x] Calendar: auto-cleanup also removes drafts on past slots (not just empty slots)
- [x] Calendar: revert send modal past-date guard (exclude past slots from send modal)
- [x] Calendar: creating a slot on a past date triggers auto-complete flow — assign artist → booking saved as completed directly (no draft/request/confirm steps)
- [x] Fix: past-date slot created but immediately deleted by auto-cleanup before user can assign artist — navigate to assign-dj immediately after saving past slot
- [x] Calendar: monthStartDay only affects Lineup Balance — all other views (calendar dots, Send modal, slot display, draft counts) always use standard calendar month (1st to last day)
- [x] Venues: add Reorder button next to Add Venue — drag-to-reorder mode with drag handles, persisted custom order
- [x] App-wide: all venue lists (calendar chips, slot groupings, bulk add, assign-dj) follow the custom venue order
- [x] Fix: venue reorder drag not working — replace PanResponder with up/down arrow buttons
- [x] Past-date slot: assign artist sends a past-gig confirmation request (status: past_confirmation) instead of auto-completing
- [x] Artist inbox: show past gig confirmation requests with amber "Past Gig" badge and Confirm/Decline actions
- [x] Confirm → booking saved as completed; Decline → booking rejected; manager notified in both cases
- [x] Fix: Bulk Add modal "Delete Empty Slots" should scope to current week (not month) when opened from week view
- [x] Fix: Dashboard Completed Bookings — switching venue chips collapses expanded month sections (remove setExpandedMonth reset)
- [x] Fix: cancelling Send Completed Gig Request dialog on a past slot should delete the slot immediately and navigate back
- [x] Roster: add three-dot menu to each artist card with View Profile, Assign Venue (dropdown with confirmation), and Remove from Roster
- [x] Roster: replace three-dot menu with inline View Profile, Assign Venue, Delete buttons on each card
- [x] Roster: fix Assign Venue sheet Cancel button not visible
- [x] Roster: add remove (×) icon button on each assigned venue chip in the Assign Venue sheet
- [x] Redesign Gig History on manager's dj-profile-view: grouped by month (collapsible), venue filter chips, clickable gig cards
- [x] Redesign Gig History on artist's own profile tab: same layout as dashboard completed bookings panel
- [x] Merge Venues and Roster tabs into a single "Team" tab with Venues | Roster segmented toggle
- [x] Team tab: context-aware + button (Add Venue on Venues sub-view, Invite Artist on Roster sub-view)
- [x] Team tab: Reorder button stays inside Venues sub-view
- [x] Remove standalone Venues and Roster tabs from tab bar, replace with Team tab
- [x] Artist calendar: add Today view (matching manager style)
- [x] Artist calendar week view: replace Add/Block button with simple + icon button
- [x] Artist calendar: update dot legend labels (Pending, Confirmed, Completed, Cancelled / Blocked)
- [x] Artist tab bar: rename Home → Dashboard, Availability → Calendar with matching manager icons
- [x] Artist settings: add Today option to Default Calendar View, update description text
- [x] Auto-complete past confirmed bookings (both manager and artist sides)
- [x] Past-date booking accept → goes directly to completed status
- [x] Fix StatusBadge: add confirmed=green, fix completed label, fix all status colors on artist side
- [x] Artist Dashboard: replace Career Stats with Completed Gigs section (grouped by month, collapsible, matching manager layout)
- [x] Artist Profile: add read-only Venues section (rostered venues, no edit/delete)
- [x] Artist Dashboard Completed Gigs: verify/fix horizontal venue filter chips matching manager style
- [x] Artist Dashboard: remove booking request notifications/banners
- [x] Artist Bookings tab: add count badge for requested/past_confirmation/cancelled bookings
- [x] Black font on all green confirm/accept buttons app-wide
- [x] StatusBadge: change all badge text colors to black font across every status
- [x] Fix: artist calendar shows 'Venue' as gig name instead of actual venue name
- [x] Rename Awaiting → Pending everywhere (badge, labels, section headers)
- [x] Artist Calendar: slot cards tappable → opens booking detail
- [x] Manager Calendar: slot cards tappable → opens booking detail (already implemented)
- [x] Calendar: hide red dot for past blocked/cancelled dates (artist calendar; manager has no red dots)
- [x] Fix: past past_confirmation bookings should still show orange dot on artist calendar
- [x] Manager artist-profile view: 7 changes (header fields, 2 stat cards, Played In, Sub-Vibe, Links, Gig History fix, section order)
- [x] Artist own profile: same 7 changes applied
- [x] Fix: artist profile Venues section — only show venues with at least one completed booking
- [x] Fix: Manager dashboard pending counter not counting past_confirmation bookings
- [x] Fix: Artist dashboard pending counter not counting past_confirmation bookings
- [x] Fix: Manager calendar orange dot missing for past pending gigs (past slots excluded from dot logic)
- [x] Fix: deleteSlot must cancel all attached requested/past_confirmation bookings and notify artist
- [x] Fix: Artist Bookings tab badge auto-marks cancelled booking notification as read on slot delete
- [x] Fix: Artist calendar cancelled booking card — replace 3-dots menu with trash icon + confirmation dialog
- [x] Fix: Rename Cancel/Reject/Rejected to Decline/Declined everywhere (artist + manager sides)
- [x] Fix: Manager calendar — add red dot for declined bookings + red entry in dot legend
- [x] Fix: getBookingsBySlot must include declined bookings so they show in manager calendar slot card with Declined badge
- [x] Fix: Manager can delete a declined booking from the slot card (same UX as deleting a draft)
- [x] Fix: Artist calendar 3-dots menu decline sets 'cancelled' instead of 'declined' — manager slot card shows nothing
- [x] Fix: Manager cancels a 'requested' booking → delete booking entirely (no trace on artist side)
- [x] Fix: deleteSlot for 'requested'/'past_confirmation' bookings → delete entirely (not cancel)
- [x] Fix: deleteSlot for 'confirmed' bookings → cancel + notify artist
- [x] Fix: Artist calendar 'Cancel Booking' label → rename to 'Decline Booking'
- [x] Fix: Artist confirmed booking → add Decline action (sets declined + notifies manager)
- [x] Fix: Artist deletes a confirmed booking card → acts as decline (sets declined + notifies manager)
- [x] Fix: Artist calendar card — replace 3-dots with status-based icon (X for requested/confirmed, trash for cancelled/declined)
- [x] Fix: Artist booking detail — rename "Accept Booking" to "Confirm"
- [x] Fix: Artist booking detail confirmed — show "Cancel Booking" (sets cancelled, notifies manager)
- [x] Fix: Artist deletes booking card — removes from calendar view only, record untouched
- [x] Fix: Manager calendar legend — red dot label updated to "Declined / Cancelled"
- [x] Fix: Cancelled confirmed bookings disappear from manager calendar slot card — should remain visible with Cancelled badge
- [x] Fix: Cancelled status badge color changed from grey to red
- [x] Fix: Manager calendar red dot now includes cancelled bookings
- [x] Fix: Manager calendar slot card — add X delete button to cancelled booking rows (same as declined)
- [x] Manager calendar slot card — add × cancel button to confirmed booking rows (cancels confirmed gig, notifies artist)
- [x] Artist Bookings tab — add "Cancelled" section showing only manager-cancelled bookings (status = cancelled); remove cancelled from Past section
- [x] Artist calendar — deleting a cancelled booking hides it locally only (does not delete the actual booking record, stays visible on manager calendar)
- [x] Manager calendar: declined booking row delete hides locally only (does not delete record, stays on artist calendar)
- [x] Manager calendar: hide 3-dots menu on requested/confirmed booking rows (only show for declined/cancelled/draft)
- [x] Artist calendar: cancelled booking delete hides from calendar only, stays in Cancelled tab of Bookings
- [x] Artist Bookings tab: remove Past section entirely
- [x] Artist calendar: add inline confirm (checkmark) button next to X on requested booking cards
- [x] Manager calendar: hide 3-dots on slot header when slot has any requested/confirmed booking
- [x] Manager calendar: show × on draft/requested/confirmed booking rows; show trash icon on declined/cancelled rows
- [x] Manager calendar: hide slot header 3-dots when any booking in the slot has completed status
- [x] Artist calendar: past private events show event name as title + blue Completed badge (keep 3-dots)
- [x] Artist calendar: show red dot on cancelled booking dates; tapping opens card; card has Dismiss button that hides from calendar (stays in Cancelled tab)
- [x] Artist tab bar: rename Gigs to Requests, update icon to inbox/mail
- [x] Artist Requests screen: remove Upcoming and Past sections entirely
- [x] Artist Requests screen: add three inner pill tabs — New (requested), Responded (confirmed/declined), Cancelled (manager-cancelled)
- [x] Artist Requests — New tab: inline green Confirm + red Decline buttons identical to calendar cards, default tab
- [x] Artist Requests — Responded tab: muted cards, no action buttons, tap opens booking detail
- [x] Artist Requests — Cancelled tab: red left border, read-only, badge count, tap opens booking detail, no delete
- [x] Artist Requests: no delete allowed from any tab
- [x] Artist Requests — New tab: show manager-cancelled confirmed bookings with Dismiss button (moves to Cancelled tab on dismiss)
- [x] Artist Requests — Responded tab: exclude cancelled bookings (they show in New until dismissed)
- [x] Artist Requests — Cancelled tab: remove badge count
- [x] Artist tab bar: Requests tab badge includes unacknowledged cancellations (cancelled && !cancellationAcknowledged) in addition to requested
- [x] Artist calendar: move Dismiss button inline (right side) on cancelled/declined booking cards
- [x] Artist calendar: replace block card 3-dots with × delete button (no menu)
- [x] Artist calendar Add/Block modal: move title down to sit at the same vertical position as the Block button currently is
- [x] Artist Requests New tab: show past-date requested bookings (no date filter — all requested bookings appear regardless of slot date)
- [x] Artist Requests New tab: past_confirmation cards show "Completed Gig" badge (not pending style)
- [x] Artist tab bar: Requests badge count includes past_confirmation bookings (sync with New tab count)
- [x] Add Confirm/Decline inline buttons to past_confirmation (Completed Gig) cards in Artist Requests New tab; blue badge stays visible; after response card moves to Responded tab
- [x] Fix: past_confirmation Confirm button now sets status to 'completed' (not 'confirmed') so card moves to Responded tab correctly
- [x] Fix Responded tab: only show bookings artist actively responded to from Requests tab (not all completed gigs); add artistRespondedFromRequests flag
- [x] Fix artist notifications screen infinite render loop (unstable Zustand selector + timeAgo component)
- [x] Remove all addNotification calls and mock notification data; keep store/screen/types/bell icon intact
- [x] Fix: artist-cancelled bookings should not appear in New tab; only manager-cancelled should (add cancelledByArtist flag)
- [x] Add 8 in-app notification triggers for artists (new request, cancelled, slot deleted, past confirmation, lineup add/remove, venue assign/remove)
- [x] Add 8 in-app notification triggers for artists (new request, cancelled, slot deleted, past confirmation, lineup add/remove, venue assign/remove)
- [x] Notification deep-link: booking notifications → booking detail with back → notifications; venue/lineup → artist venues screen — DONE (in-app routing live on both sides; push-tap routing added June 23 2026)
- [x] Rename all roster references to lineup (Global Lineup = artists connected to manager, Lineup = artists assigned to venue)
- [x] Create artist my-venues screen showing assigned venues with venue profiles
- [x] Fix New Gig Request notification: add venue/date/slot details to body, add relatedId/relatedType so it navigates to booking detail on tap
- [x] New Gig Request notification: general body with manager name, navigate to Requests tab on tap
- [x] Manager-cancelled request: stay in New tab with Cancelled label + Dismiss button, moves to Cancelled on dismiss
- [x] Assigned to Venue notification: navigate to My Venues with new venue highlighted until tapped, normal card colors
- [x] Add relatedId (venueId) to venue_assigned notifications in all 3 creation sites (lineup.tsx, profile.tsx, team.tsx)
- [x] Notifications screen: pass venueId param when navigating to My Venues for venue_assigned
- [x] My Venues screen: accept highlightVenueId param, show subtle highlight on new venue card until tapped
- [x] Auto-mark booking notifications as read when artist responds (Confirm/Decline) or dismisses from Requests tab
- [x] Auto-mark venue_assigned notification as read when artist taps highlighted venue on My Venues screen
- [x] Fix: booking_request notifications missing relatedId — add booking ID so auto-mark-as-read works when artist responds from Requests tab
- [x] Fix: Artist calendar Confirm/Decline/Cancel actions should auto-mark related notifications as read + set artistRespondedFromRequests flag (same as Requests tab)
- [x] Add badge count to artist Calendar tab for pending requests + unacknowledged cancellations, disappears on confirm/decline/dismiss
- [x] Calendar dismiss on cancelled request should set cancellationAcknowledged so it moves from New to Cancelled in Requests tab
- [x] Cancelled notification body: "Your booking request at [venue name] on [date] has been cancelled by [manager name]"
- [x] New gig request notification body: "You have a new booking request at [venue name] on [date]"
- [x] Hide the Requests tab from artist tab bar
- [x] Artist Dashboard: tapping Pending stat card navigates to Requests tab (New tab)
- [x] Artist Dashboard: tapping Venues stat card navigates to My Venues page
- [x] Update past_confirmation_request notification: title "Did this gig happen?", body "[Manager] needs you to confirm a past booking at [venue] — [weekday], [month day]"
- [x] Update booking_request notification: title "New Booking Request", body "[Manager] requested you at [venue] — [weekday], [month day]"
- [x] Update booking_cancelled notification: title "Booking Cancelled", body "[Manager] cancelled your booking at [venue] on [weekday], [month day]"
- [x] Update booking_request_cancelled notification body: "Your booking request at [venue] on [weekday], [month day] has been cancelled by [manager]"
- [x] Show "Request Cancelled" title in red on artist notifications screen
- [x] Manager-cancelled requests: set status=cancelled directly (no Dismiss step for artist)
- [x] All booking notifications: tapping opens booking detail screen (not Requests tab)
- [x] Simplify notification bodies: booking_request, booking_request_cancelled, booking_cancelled → "[Venue] — [weekday], [month day]"
- [x] Add cancelledAsRequest flag to Booking type and all manager cancel-request flows
- [x] Hide cancelled requests (cancelledAsRequest=true) from artist calendar slot cards and month dots
- [x] Exclude cancelled requests from artist Calendar tab badge count
- [x] Dismiss cancelled booking: mark booking_cancelled notification as read
- [x] Dismiss cancelled request (cancelledAsRequest): mark both booking_request + booking_request_cancelled notifications as read
- [x] Dashboard Pending card: push to standalone requests screen (slide from right, back returns to Dashboard)
- [x] Fix: lineup balance not counting in Today view — todayDateStr defined after lineupRows useMemo
- [x] Manager notification: artist confirms booking → "Booking Confirmed" / "[Artist] at [venue] — [weekday], [month day]"
- [x] Manager notification: artist declines booking → "Booking Declined" / "[Artist] at [venue] — [weekday], [month day]"
- [x] Manager notification: artist cancels confirmed booking → "Booking Cancelled" / "[Artist] at [venue] — [weekday], [month day]"
- [x] Artist booking detail: add "Show on Calendar" button that opens Calendar tab in month view with booking date selected
- [x] Manager booking detail: add "Show on Calendar" button that opens Calendar tab in month view with booking date selected
- [x] Calendar month view (both): today date shown as red text only, no circle
- [x] Calendar month view (both): tapping an already-selected date deselects it (no blue highlight)
- [x] Calendar dot legend (both): remove Draft, add Completed (blue), order: Requested / Confirmed / Completed / Declined/Cancelled
- [x] Manager calendar: "Add Set" button color changed from hardcoded #2E75B6 to colors.primary
- [x] Manager calendar: Month/Week/Today selector active state uses colors.primary
- [x] Manager calendar: "Send" button hidden when totalPeriodDraftCount === 0
- [x] Manager calendar: empty/draft-only slot cards — remove three-dots menu, expand to full width, add inline × delete button with confirmation
- [x] Manager dashboard: remove Venues and Artists stat cards (dashboard only, profile untouched)
- [x] Manager dashboard: rename Upcoming stat card to Confirmed (shows confirmed booking count)
- [x] Manager dashboard: Pending stat card tappable → navigates to new Pending Requests screen
- [x] Manager dashboard: Confirmed stat card tappable → navigates to new Confirmed Bookings screen
- [x] Manager dashboard: rename upcoming list to Confirmed Bookings, See All → Confirmed Bookings screen
- [x] New screen: Pending Requests (list of all requested bookings)
- [x] New screen: Confirmed Bookings (list of all confirmed bookings)
- [x] Artist profile: remove notification bell from header, move Edit + Settings buttons to header top-right, remove from current position
- [x] Manager profile: remove notification bell from header, move Edit + Settings buttons to header top-right, remove from current position
- [x] Manager settings: replace purple with colors.primary for all icons, toggles, and active chips
- [x] Artist settings: replace purple with colors.primary for all icons, toggles, and active chips
- [x] Manager calendar lineup balance: replace purple with colors.primary
- [x] Artist settings: add Notification Preferences section above email prefs (new booking request, booking request cancelled, confirmed booking cancelled, added/removed from lineup, assigned/removed from venue)
- [x] Manager settings: add Notification Preferences section above email prefs (artist confirms, artist declines, artist cancels confirmed, new artist joins via invite)
- [x] Manager settings: rename "Marketing Preferences" → "Email Preferences", remove Weekly Digest, rename Email Marketing → "Product Updates"
- [x] Artist settings: add "Email Preferences" section with "Product Updates" toggle (persisted in AsyncStorage)
- [x] Manager settings: remove stale STORAGE_KEY_WEEKLY_DIGEST (state, load, save, reset)
- [x] Artist settings: add Reminders section in Notifications — Same Day (3h before gig) and Day Before (24h before gig) toggles, persisted in AsyncStorage, scheduled via expo-notifications
- [x] Manager settings: add Account section at the top (matching artist settings)
- [x] Artist profile header: remove pencil (edit) icon
- [x] Manager profile header: remove pencil (edit) icon
- [x] Settings (both): add Send Feedback row below Email Preferences, opens modal with subject/message/category, stores locally, shows success toast
- [x] Settings (both): all notification and email preference toggles default to true
- [x] Manager Dashboard: profile photo tap navigates to Profile tab
- [x] Artist Dashboard: profile photo tap navigates to Profile tab
- [x] Manager Dashboard: stat cards match Profile screen style (no icons, colored number, grey uppercase label — Pending=orange, Confirmed=green, Venues=primary blue)
- [x] Artist Dashboard: stat cards match Profile screen style (no icons, colored number, grey uppercase label)
- [x] Settings (both): convert Send Feedback from bottom-sheet to full-screen modal (like Add to Lineup), fix success state layout
- [x] Manager Dashboard: Confirmed Bookings section must only show status='confirmed', exclude pending/requested
- [x] Rename app to Nexgig (app.config.ts appName) — DONE (verified in app.config.ts: appName="Nexgig", slug="nexgig", bundle com.nexgig.app).
- [x] Generate new Nexgig app icon (X with arrows on right side only) and replace all icon files — DONE (./assets/images/app-icon.png).
- [x] Manager Dashboard: swap Confirmed and Pending stat card positions (Confirmed first, Pending second)
- [x] Manager Dashboard: remove profile photo from header, keep only notification bell at top-right
- [x] Artist Dashboard: remove profile photo from header, keep only notification bell at top-right
- [x] Replace all hardcoded #3B82F6 completed status color with app primary color (#2563EB)
- [x] Fix manager calendar: completed bookings not showing the completed dot on calendar days
- [x] StatusBadge: change completed status badge text color to white (both artist and manager profiles)
- [x] Keyboard fix: add dynamic bottom padding to ScrollView on all screens with TextInput (except Add Slot modal) — no auto-push, user scrolls manually
- [x] Add returnKeyType="done" to all single-line TextInputs across the app
- [x] Dismiss keyboard on tap outside TextInput on all screens (global Pressable wrapper in root layout)
- [x] Change Add Venue and Add Artist screens to slide from right (standard push) instead of slide from bottom
- [x] Bulk Slot modal: add keyboard bottom-padding so user can scroll to see input fields when keyboard is open
- [x] Remove global Pressable overlay from root layout — keyboard dismisses via Done/Enter button on keyboard only (no overlay blocking scroll)
- [x] Create Venue: add smooth horizontal slide animation between wizard steps (1 → 2 → 3)
- [x] Manager Register: add smooth horizontal slide animation between wizard steps
- [x] Artist Setup: add smooth horizontal slide animation between wizard steps
- [x] All wizards: update step transitions to match full page push navigation (full screen width slide, same timing as Edit Profile)
- [x] Fix: invite-artist (Add Artist) page flicker — delayed autoFocus to wait for screen transition to complete (500ms)
- [x] All wizards: wrap entire screen (header + content + button) in Animated.View so the whole page slides, not just the middle content
- [ ] Create Venue: split into separate route screens (step1, step2, step3) for native push navigation
- [ ] Manager Register: split into separate route screens (step1-step4) for native push navigation
- [ ] Artist Setup: split into separate route screens (step1-step4) for native push navigation
- [x] Artist Calendar: add Calendar Sync button (event-available icon) next to month name, open pageSheet modal to export confirmed gigs to device calendar with Export All and per-gig export buttons
- [x] Fix: Calendar Sync modal header — Export All button partially off-screen, fix layout
- [x] Calendar Sync: track exported gig IDs in AsyncStorage — skip already-exported gigs on Export All, show checkmark on exported rows, allow re-export individually
- [x] Create Artist Confirmed Gigs page (same layout as manager's confirmed gigs page)
- [x] Create Artist Pending Requests page (same layout as manager's pending requests page)
- [x] Wire artist dashboard Confirmed/Pending taps to new pages (slide from right)
- [x] Remove Requests tab from artist tab bar (was already hidden via href: null)
- [x] Artist Pending Requests page: add Accept/Decline buttons on each row matching the calendar booking card layout
- [x] Calendar Sync: hide already-exported gigs, pre-select all remaining, checkbox per row, single Export (X) button at bottom
- [x] Calendar Sync: set calendar event start and end both to gig's start time (zero-duration point event)
- [x] Manager dashboard: make venue count tappable, open a simple My Venues page (no colors)
- [x] Artist venues page: fix layout to be simple and clean, remove colored cards
- [x] My Venues pages (manager + artist): replace location icon with venue photo, fallback to location icon if no photo
- [x] Remove checkmark icon next to "History" on both manager and artist dashboards
- [x] Fix: Artist My Venues — tapping a venue does nothing, add navigation to venue detail page
- [x] Fix: when manager deletes a slot, preserve slot date/time/venue on the booking so it still shows on artist calendar as cancelled
- [x] Create Venue: added "Bar / Club" to venue types, "Party Crowd"/"Music Lovers"/"Neighbourhood Bar" to audience, new genres (Khaleeji, Pop/Top 40, Reggaeton, R&B/Soul, Dancehall, Disco/Funk, 90s/2000s, 80s), and "Urban"/"Soul" to sub-vibe
- [x] Manager venue detail: move status badge to right, add audience type, merge sub-vibe into genres, grey hide button, add Add to Lineup / Remove from Lineup in lineup tab
- [x] Fix: Add to Lineup in venue-detail navigates to assign-artist which crashes with "Slot not found" — support venueId param for venue-level lineup assignment
- [x] Fix: Remove from Lineup in venue-detail has stale UI — removed artist should disappear immediately without navigating away
- [x] Edit Venue: sync all options from Create Venue (venue types, audience types, genres, sub-vibes) so both screens match exactly
- [x] Manager venue detail: make all chip/pill sections (Preferred Energy, Genre Preferences, Audience Type, Sub-Vibe) consistently grey/muted style
- [x] Create Venue/Artist Discovery screen (Venues tab: other managers' active venues; Artists tab: all signed-up artists) — read-only profiles on tap
- [x] Manager My Venues page: add Discover button → Discovery screen (Venues tab)
- [x] Manager Profile: wire Venues stat card → My Venues page; add Discover button in expanded venues section → Discovery screen (Venues tab)
- [x] Manager Profile: wire Artists stat card → new Global Lineup list screen with Discover button → Discovery screen (Artists tab)
- [x] Artist My Venues page: add Discover button → Discovery screen (Venues tab)
- [x] Manager venue detail: remove slot/artist counts from tab labels; style Manage in Calendar button as grey/surface
- [x] Discovery venue detail (manager + artist read-only): hide Slots and Lineup tabs, show Overview only
- [x] Sorting: venue detail Slots tab by date, Lineup tab alphabetical; Discovery venues + artists alphabetical; assign-artist on calendar alphabetical
- [x] Venue detail Lineup tab: rename 'Add to Lineup' button to 'Add Artist', match grey style of Manage in Calendar; assign-artist screen title → 'Add Artist'
- [x] Artist Discovery: tapping an artist card opens a read-only artist profile view
- [x] Artist profile overhaul: single minRate, remove energy/technicalRider, add instruments, sync genres, redesign public profile view
- [x] Manager Dashboard: remove Quick Actions section, add FAB (+ button) with bottom sheet (New Venue, Invite Artist, Add Set)
- [x] Manager Dashboard FAB: replace bottom sheet with small floating popup menu directly above the FAB button
- [x] Manager Dashboard FAB: lighter blue LinearGradient, smaller size, drop shadow, animated + to × rotation
- [x] Manager Profile tab: tighten spacing so Sign Out is visible without scrolling when all sections are collapsed
- [x] Calendar: remove dot legend from week view and today view on both manager and artist screens (keep only in month view)
- [x] Replace UAE city chips with CountryPicker (Based In + Nationality) in artist-setup.tsx
- [x] Replace UAE city chips with CountryPicker (Based In + Nationality) in artist edit-profile.tsx
- [x] Replace UAE city chips with CountryPicker (Based In) in manager-register.tsx
- [x] Replace UAE city chips with CountryPicker (Based In) in manager edit-profile.tsx
- [x] Update both artist-profile-view.tsx screens to show basedIn + nationality with flag emojis below artist name
- [x] Add basedIn and nationality fields to ArtistProfile type in types.ts
- [x] Create CountryPicker component with full world countries list and search
- [x] Fix: artist own profile tab not showing updated basedIn/nationality after saving in Edit Profile
- [x] Fix: manager profile tab not showing updated basedIn after saving in Edit Profile
- [x] Profile display: remove flag from Based In (country name only); nationality shows flag-only on separate line below profile pic (artist); manager shows country name only
- [x] Redesign artist profile hero card: photo left, name+flag centered next to photo, full-width bottom row (Based In left, Member since right)
- [x] Artist profile tab: change stats to Monthly Plays + Completed Gigs
- [x] Artist profile tab: remove Played In and Venues sections
- [x] Artist profile tab: remove bio edit pencil
- [x] Rename "Played In" to "History" on all artist profile screens
- [x] Fix: Bio card too close to stats row on artist profile tab (match spacing of profile-view screens)
- [x] Add Years of Experience field to artist onboarding (artist-setup.tsx)
- [x] Add Years Experience stat card between hero card and stats row on all 3 artist profile screens
- [x] Hero card cleanup: remove Years of Experience pill, remove Member since, move Based In to right side of bottom row (all 3 artist profile screens)
- [x] Fix: Bio card still shows on artist profile tab when bio is deleted/empty
- [x] Edit Profile (artist + manager): sticky header with Save button on top-right, unsaved changes alert on back
- [x] Add Save button to Settings screen header (artist + manager)
- [x] Persist all profile edits (auth store + lineup store) to AsyncStorage — survives app close, sign-out, sign-in
- [x] Persist all settings changes to AsyncStorage (already partially done, verify completeness)
- [x] Fix Lineup Balance period: start day of current month → start day minus 1 of next month (forward, not backward)
- [x] Show active date range label next to Lineup Balance header (e.g. "May 3 – Jun 2" or "May" for day 1)
- [x] Rename "Today" to "Day" in view toggle (manager calendar + artist availability)
- [x] Add prev/next day arrows to Day view in manager calendar (same pattern as month/week)
- [x] Add prev/next day arrows to Day view in artist availability (same pattern as month/week)
- [x] Day view starts on today's date when first opened
- [x] Fix week view label not centered due to + button on right side (manager calendar + artist availability)
- [x] Add Artist Name field (required, stage name, shown publicly) to signup and edit profile
- [x] Add Full Legal Name field (required, private, for future invoicing) to signup and edit profile
- [x] Add Username field (required, unique, lowercase/numbers/underscores only, private, shown in artist settings)
- [x] Email uniqueness validation — show error if email already taken
- [x] Username uniqueness validation — suggest alternatives if taken
- [x] Add venue card and day card to artist private booking detail view (match manager booking look)
- [x] Artist private events should show as unavailability/conflict in manager's Assign Artist screen (same as blocked dates)
- [x] Update artist profile stat cards to match manager profile stat card style (large bold number, smaller muted uppercase label, same card size/padding/border-radius/background, side by side)
- [x] Add search bar to Assign Artist page (same style as Discovery screen, at top below header)
- [x] Add review section to artist booking detail for completed bookings (manager + private): 5 stars, optional text, submit button, read-only after submit
- [x] Show artist review (read-only) on manager's booking detail screen for completed bookings
- [x] Send notification to manager when artist submits a review
- [x] Move 'Show on Calendar' button to after the review section when a review exists (manager booking detail)
- [x] Manager Discovery page: show all venues (including own), only exclude hidden ones
- [x] Move 'Show on Calendar' button to after the review section on artist booking detail screen
- [x] Redesign slot cards: replace slot name with venue name, remove venue group header name, remove venue tag, hide slot name
- [x] Change slot card left vertical bar color to follow the venue color instead of status-based color
- [x] Replace X delete button with + button (opens Assign Artist) on slot cards
- [x] Remove inline '+ Assign Artist' text button from slot cards
- [x] Add swipe-left-to-delete on slot cards
- [x] Remove "Add another Artist" button from bottom of slot cards (redundant with + button in header)
- [x] Remove custom name text input from Add Slot modal (single and bulk)
- [x] Keep preset pills (Sunset, Day, Night) that auto-fill start/end time
- [x] Time dropdown should scroll to currently selected time instead of starting from 00:00
- [x] Rename "Bulk Add Sets" modal title to "Add Multiple Sets"
- [x] Rename "New Slot" modal title to "Add Set"
- [x] Rename save button labels to "Assign Artist Now" and "Later" (names only, no behavior change)
- [x] Add floating + FAB button at bottom right of Venues page (manager profile) that navigates to Create New Venue
- [x] Wire "Assign Artist Now" button to save slot and navigate to Assign Artist page
- [x] Make Lineup page Invite Artist button navigate to the same /(manager)/invite-artist route as the dashboard
- [x] Rename Lineup page title to "Artists", remove artist count, move Discover to top right, add FAB for invite artist
- [x] Move Artists page from tab to stack screen (slides from right, no tab bar) like My Venues
- [x] Rename Artists page to "My Artists" and move title to the left on both My Venues and My Artists pages
- [x] Show blue + instead of 0 on Venues/Artists stat cards on profile and dashboard, navigating to create venue or invite artist
- [x] Replace VENUES card on dashboard with COMPLETED card (blue number), create dedicated Completed Gigs stack page
- [x] Remove Save button from Settings screens (manager and artist)
- [x] Disable swipe-back on Edit Profile screens (manager and artist) — back button only
- [x] Remove duplicate Artists/Venues links section from manager profile (keep only stat cards)
- [x] Fix gig count on My Artists page to only count completed bookings under the current manager (filter by managerId)
- [x] Add floating FAB to artist profile view (manager's view) with 3 options: Assign Venue, Bookings, Remove
- [x] Create artist bookings stack screen showing Pending/Upcoming/Completed bookings for a specific artist under current manager
- [x] Replace FAB on artist profile view with three-dot (⋯) menu in the header top-right corner
- [x] Replace Delete button with Bookings button on each artist card in My Artists page
- [x] Remove three-dot menu from artist profile view header
- [x] After manager sends artist invite, auto-open "Assign to Venue" bottom sheet so manager can pre-assign in one flow
- [x] Fix venue creation: Continue button fixed outside scroll (always visible while scrolling)
- [x] Fix venue creation: navigate to My Venues page after finishing
- [x] Fix venue creation: make venue color optional
- [x] Fix venue creation: make preferred energy optional
- [x] Show primary and secondary genres on the same line in both artist's own profile and manager's artist profile view
- [x] Add Instagram URL and Music Link display to venue detail screen Overview tab
- [x] Fix venue header to stay visible while scrolling in Create Venue and Edit Venue screens
- [x] Add missing Audience Type, Sub-Vibe, Instagram URL, Music Link to artist-facing venue detail screen
- [x] Show confirmed private bookings in artist Upcoming tab (home screen)
- [x] Add edit pencil icon to top-right of profile hero card for both artist and manager
- [x] Color notification dot green for confirmed, red for cancelled in both artist and manager notifications
- [x] Remove slot name required validation from Add Slot modal (slot type/name is optional)
- [x] Manager calendar: tapping a slot opens booking detail instead of assign artist
- [x] Artist calendar: replace three-dot menu on private booking slots with X cancel button (with confirmation)
- [x] Fix UTC vs local date mismatch in artist home Upcoming filter (private bookings not showing)
- [x] Cancelling a private booking on artist calendar should delete it immediately instead of showing cancelled status
- [x] Fix private bookings created for today not showing in artist Upcoming section
- [x] Use start datetime (date + startTime) instead of date-only for upcoming/completed logic for both artist and manager
- [x] Fix "past gig" warning in Add Slot modal to use date + start time (not date-only) — only warn if start datetime has already passed
- [x] Add Invoice type to lib/types.ts (id, venueId, venueName, artistId, artistLegalName, gigs, totalAmount, sentAt, status)
- [x] Add billing fields to Venue type (legalName, trnNumber, address) and venue creation/editing screens
- [x] Add invoice store (invoices, reminders, CRUD operations) to lib/store.ts
- [x] Add floating invoice FAB on artist dashboard with red badge for overdue reminders
- [x] Build artist invoice screen with New Invoice / Sent tabs
- [x] Build venue list step (venue cards with gig count, reminder day, bell icon, color-coded badges)
- [x] Build gig list step (completed gigs with price inputs in AED, running total, Generate Invoice button)
- [x] Build invoice preview step (from/to, gig table, total, Send button)
- [x] Generate PDF via expo-print matching preview layout
- [x] Build sent tab (list of sent invoices, tap to view read-only preview)
- [x] Add collapsible Invoices section to manager profile with unread badge count
- [x] Build manager invoice cards (artist name, venue, date, gig count, total, New/Downloaded badges)
- [x] Add Downloaded button and downloaded invoices list in manager profile
- [x] Add in-app notification when manager receives invoice
- [x] Invoice reminder system per venue (bell icon, day picker 1-28, badge logic)
- [x] Calendar sync: change event title to venue name only, use actual gig end time for event duration
- [x] Add calendar sync/export for private bookings (venue name as title, export button on each private booking)
- [x] Add inline calendar export icon badge on confirmed manager booking cards (same as private bookings)
- [x] Artist add/block slot: time pickers and Full Day on same row, default start 21:00 end 01:00, dropdown scrolls to selected time
- [x] Make everything inside Add/Block slot modal 20% smaller (text, padding, spacing, inputs)
- [x] Add swipe-down-to-dismiss gesture on the Add/Block slot modal
- [x] Add KeyboardAvoidingView to Add/Block slot modal so lower fields aren't covered by keyboard — device-tested June 22 2026 (lower fields not covered).
- [x] Manager Add Slot modal: full-height, compact sizing (20% smaller), horizontally scrollable venue pills
- [x] Manager Bulk Add Slots modal: full-height, compact sizing (20% smaller), horizontally scrollable venue pills
- [x] Manager Add Slot modal: open partially (leave calendar header + month title visible), not full screen
- [x] Manager Add Slot modal: rename "Slot Type / Name" label to "Set Time"
- [x] Bulk Add Slots modal: partial height (same as Add Slot modal), header shows only "Multiple Sets", minimal add template button, Create Sets button moved below add template button
- [x] Fix scroll getting stuck in Bulk Add Slots modal (outer Pressable overlay intercepting scroll gestures)

## Nexgig Rebranding

- [x] Copy NEXGIG.png to assets/images/nexgig-logo.png
- [x] Copy X.png to assets/images/nexgig-icon.png
- [x] Update app.config.ts: appName to "Nexgig", icon to nexgig-logo.png, splash to nexgig-logo.png with #2563EB background
- [x] Update Welcome/Onboarding screen: full logo centered on #2563EB, slogan "Every booking, verified." in white
- [x] Update Sign-in screen: X icon at top, "Nexgig" bold, "Every booking, verified." muted
- [x] Global text replace: "Gigster" → "Nexgig" in all .ts/.tsx files
- [x] Global text replace: "gigster.app" → "nexgigapp.com" in email addresses
- [x] Update AsyncStorage key prefixes from "gigster:" to "nexgig:" (internal)
- [x] Update Settings screens: app name shows "Nexgig" (no explicit app name text found in settings — storage keys updated)
- [x] Update About/Legal sections: app name "Nexgig", website "nexgigapp.com" (no dedicated about/legal screens found — all text references updated)
- [x] Update design.md references from Gigster to Nexgig
- [x] Run TypeScript check and verify no errors

## Splash Screen Fix

- [x] Verify splash-icon.png is the Nexgig logo and not the old Gigster logo — DONE (byte-size match with nexgig-logo.png; visually verified during testing).
- [x] Ensure app.config.ts splash screen config points to correct asset — DONE (splash points to splash-icon.png on #2563EB).

## Calendar Sync Message Fix

- [x] Update calendar sync success message to: "[VenueName]'s Gig has been added to your phone calendar"

## Bulk Calendar Export Message Fix

- [x] Update "Export All" bulk message to list venue names dynamically

## Invoice Page Updates

- [x] Remove completed gigs count under venue name on venue card, show only reminder day
- [x] Remove bell icon from venue card right side
- [x] Move bell icon to top-right header inside venue invoice page
- [x] Move dot to where bell was (right side of venue card)
- [x] Show uninvoiced gig count where dot was, with orange dot when gigs exist
- [x] On due date, if invoice not sent → dot turns red
- [x] When dot is red → dashboard invoice floating button gets a red badge
- [x] Fix gig price input page: use day + date as black title, remove grey date/time text
- [x] Fix back navigation after sending invoice: back from invoices page goes to dashboard, not price input

## Invoice Card Dot Cleanup

- [x] Remove green dot from venue invoice card (redundant with uninvoiced count badge)

## Invoice Back Navigation Fix

- [x] Fix invoices page back button: use router.canGoBack() to safely navigate to dashboard when stack is empty
- [x] Fix invoice-preview send flow: remove router.dismissAll() which empties the stack causing GO_BACK error

## Invoice Stack Navigation Fix

- [x] After sending invoice, clear the full stack (price input + preview) so back from invoices list goes to dashboard

## Invoice PDF Layout Update

- [x] Header left: "Nexgig" large + "Every booking. verified." small uppercase muted
- [x] Header right: "Invoice" small uppercase muted → invoice number → issued date
- [x] From/To: replace gigster.app email with nexgig.app
- [x] Table: remove "Set" column
- [x] Table: rename "Date" → "Gig", show full readable date + venue name below in muted text
- [x] Table: rename "AED" → "Amount (AED)"
- [x] Total row: remove decimals
- [x] Footer: "Generated via Nexgig · nexgigapp.com" left + "Sent" badge right

## Manager Invoices Redesign

- [x] Add isReadByManager field to Invoice type and markInvoiceReadByManager action to invoice store
- [x] Redesign manager profile invoices section: artist list with unread badge
- [x] Create manager artist invoices screen (sorted newest first, unread highlighted orange)
- [x] Create manager invoice detail screen with PDF download button
- [x] Mark invoice as read when manager opens it

## Invoice PDF Styling Fix

- [x] Standardise grey label colour for: slogan, FROM, TO, INVOICE label, venue name in table, footer text
- [x] Fix TO section order: venue legal name → venue address → TRN number

## PDF Speed & Invoice Badge Fixes

- [x] Pre-generate invoice HTML on screen mount in artist invoice-preview screen
- [x] Pre-generate invoice HTML on screen mount in manager invoice-detail screen
- [x] Remove orange border/highlight from unread invoice cards (keep dot only)
- [x] Add unread invoice count badge on manager Profile tab icon

## Artist Venue Detail Spacing Fix

- [x] Fix extra spacing between info card and Vibe card on artist venue-detail page

## Artist History Visibility Toggle

- [x] Add isHistoryHidden field to ArtistProfile type and store
- [x] Add eye icon toggle on artist's own profile history section header
- [x] Show "hidden" indicator to artist when history is hidden
- [x] Hide history card on manager and other artist profile views when isHistoryHidden is true

## History Toggle UI Delay Fix

- [x] Fix isHistoryHidden UI delay — read directly from reactive store so eye icon updates instantly on tap

## Invoice PDF Filename & Confirmed Gigs

- [x] Rename PDF filename to NX_[ArtistName]_[VenueName]_[DD][Mon][YYYY].pdf in artist invoice-preview
- [x] Rename PDF filename to NX_[ArtistName]_[VenueName]_[DD][Mon][YYYY].pdf in manager invoice-detail
- [x] Show confirmed gigs in invoice-gigs screen under "Upcoming" section
- [x] Show completed gigs under "Completed" section in invoice-gigs screen

## Invoice Uninvoiced Count & Confirmed Gig Date Fix

- [x] Fix uninvoiced count badge on venue invoice cards to include confirmed gigs (not just completed)
- [x] Fix confirmed gigs in invoice-gigs screen to show slotDate (same as completed gigs)

## Lineup Balance Period Label Fix

- [x] Fix lineupPeriodLabel in month view to use monthPeriodBounds.label (not standardMonthBounds.label) so the date range reflects the custom monthStartDay setting
- [x] Fix monthPeriodBounds calculation: custom cycle now starts from previous month (Apr 21 – May 20 when monthStartDay=21 and viewing May)

## Artist Invoice Preview Table Layout Fix

- [x] Fix artist invoice-preview table: uppercase headers, correct column proportions, proper text wrapping to match manager invoice layout

## Artist Invoice Total Divider Fix

- [x] Fix total divider line in artist invoice-preview: make it blue (#2563EB) and add spacing between last gig row and total row

## Invoice List Card & Manager Detail Double Line Fix

- [x] Remove last gig row bottom border in manager invoice-detail (only blue total line should remain)
- [x] Match artist sent invoices list card layout to manager invoice list card (amount in blue on right, same text positions and structure)

## Manager Profile Invoices Section Fix

- [x] Remove bottom divider from last venue row in manager profile invoices section (no double border when only one artist shown)

## Artist Invoice Reminder Day Display Fix

- [x] Fix reminder day on venue cards not updating after user changes it in the modal (always shows 1st of month)

## Manager Profile Invoices Redesign

- [x] Replace artist-grouped invoice list in manager profile with flat all-invoices list sorted by date (latest first)
- [x] Use same card design as artist invoice list but show artist name instead of invoice number
- [x] Add "Download All" button to export all invoices as PDFs
- [x] Add swipe-left to delete on each invoice card

## Manager Invoice Delete & Download Fixes

- [x] Soft-delete: manager deleting invoice only hides it from manager view, artist still sees it in Sent
- [x] Download All: zip all PDFs into one file and share in a single action
- [x] Fix PDF filename format: NX_[ArtistName]_[VenueName]_[DD][Mon][YYYY].pdf (no spaces, no random chars)

## Download All Fix

- [x] Fix Download All hanging indefinitely in manager profile invoices section — switched to STORE compression (no compression) for speed, added error message display

# ─────────────────────────────────────────────────────────────
# PRE-LAUNCH AUDIT — Cleanup, Bugs, Store Readiness (May 2026)
# ─────────────────────────────────────────────────────────────

## A. Remove dead code (unused Manus backend scaffold — app runs 100% on Supabase)

- [x] Delete `server/` directory (tRPC/Express stubs — never used)
- [x] Delete `drizzle/` and `drizzle.config.ts` (no MySQL DB — app is Supabase)
- [x] Delete `shared/` directory
- [ ] Delete `lib/_core/` — KEPT FOR NOW: still holds live nativewind-pressable + manus-runtime (web safe-area) + api/auth used by oauth/callback.tsx. Revisit during sign-in work (E).
- [x] Delete `lib/trpc.ts` and remove the trpc.Provider wrapper from `app/_layout.tsx`
- [x] Verify `lib/api.ts` — (still present; revisit)
- [x] Delete `hooks/use-auth.ts` (unused Manus auth hook)
- [x] Remove unused deps (@trpc/*, express, drizzle-orm, mysql2, superjson, axios, cookie, jose, dotenv, zod, @expo/ngrok, drizzle-kit, esbuild, tsx, concurrently, cross-env, @types/cookie, @types/express)
- [x] Remove unused npm scripts: dev:server, dev:metro, build, start, db:push
- [x] Delete scratch notes: notes.txt, notes-calendar.txt, notes-checkpoint2.txt, notes-weekview.txt
- [x] Delete dev-only screen `app/dev/theme-lab.tsx` and `expo-qr-code.png`
- [x] Verify `lib/mock-data.ts` is NOT seeding stores at runtime; delete if unused — CONFIRMED orphaned (every ref was self-internal), deleted
- [x] Delete `package-lock.json` (using pnpm)
- [x] Remove dead styles in welcome.tsx (djNote, testBtn, testBtnText)
- [~] Artist settings.tsx language code — SKIPPED: not actually unused; `language`/`saveLanguage`/`DJ_STORAGE_KEY_LANGUAGE` are wired into handleResetAll. Only the `languages` array + LANGUAGE_LABELS are unrendered; left in place for a future language feature. Not worth the risk.
- [x] Remove/replace `tests/auth.logout.test.ts` (imported deleted server/)
- [x] Remove unneeded `@types/jszip` devDep stub (jszip ships its own types)
- [x] Rename `app/(manager)/(tabs)/explore.tsx` → `network.tsx` so the filename matches the "Network" tab — DONE in commit f48d276 (both manager + artist sides; all router.push refs + Tabs.Screen name updated).

## B. Bugs & correctness

- [x] Fix `Slot` type in types.ts — added managerId, status, updatedAt (sync.ts uses them). `pnpm check` clean. — TESTED ON DEVICE ✅
- [~] Consolidate venue/slot/booking persistence INTO the store actions — DONE for the part that actually mattered (bookings), DEFERRED for the rest by design. Audit findings: (1) BOOKINGS were the real gap (store-first flow) — `updateBookingStatus` already self-syncs, and now `acknowledgeCancellation`, `hideFromCalendar`, `hideFromManagerCalendar` ALSO self-sync to Supabase via syncBookingStatus (the proven additive pattern: original set() untouched, sync added after, status looked up from get(); private events match 0 rows = harmless no-op). This closes the "dismissed cancellation / hidden booking reverts after sign-out" bug class — device-tested ✅. `deleteBooking` left local-only ON PURPOSE (only ever deletes private events, which aren't in the Supabase bookings table). (2) VENUES + SLOTS deliberately NOT consolidated — they use a Supabase-FIRST flow (insert to get the generated id, then store) and are already covered by their screens' writes; restructuring working code with no active bug = risk with no payoff, especially pre-launch. lib/sync.ts has only READ helpers, no write layer to reuse, which is why a blind full consolidation would've been a big rewrite. Net: the "reverts after sign-out" class is closed for bookings; venues/slots stay as-is.
- [x] Make `updateBookingStatus` store action sync to Supabase — the store action now calls syncBookingStatus internally (fire-and-forget) after the local set, so every confirm/decline/cancel persists without the caller remembering. Critically this also fixes the deleteSlot cancel-cascade, which previously updated cancelled bookings locally only. syncBookingStatus does a PARTIAL update so existing manual calls in screens are now harmless idempotent double-writes (left in place to avoid a risky sweep). — needs device test (confirm/decline/cancel + manager-deletes-slot-with-confirmed-booking reaches Supabase)
- [x] Dedupe notifications: removed legacy fetchInvites synthesizer in artist _layout (was creating a 2nd notification per invite alongside the real one)
- [x] Strip console.log from production paths — COMPLETE full sweep across lib + all screens. Removed pure-debug logs entirely (booking-sync per-call log, store notification log, calendar "saving/saved booking" logs, booking-detail "cancel sync called") and converted genuine error logs to console.warn everywhere (notifications-push ×4, assign-artist past-booking insert, venue-detail venue_assignments remove, calendar booking insert, invoice-preview invoice insert, availability ×6 block/private-event insert+delete). No console.log remains in lib/ or app/. (console.warn kept for real errors, which is appropriate for production.)
- [x] Fixed false self-conflict when assigning an artist to a past slot. — TESTED ON DEVICE ✅
- [x] INVESTIGATED — NOT a bug, DO NOT remove. The two writes are NOT redundant: a private event is written (A) to the LOCAL bookings store only via addBooking (isArtistCreated:true) — this is never inserted into the Supabase bookings table, it only ever lives on the artist's own device and drives the ARTIST'S calendar; and (B) to the Supabase availability_blocks table with block_type='private_event' — this is what the MANAGER side reads (assign-artist.tsx queries availability_blocks) to detect the artist as busy and avoid double-booking. Deleting write B would let managers book over an artist's blocked time (real user-facing bug). The todo's premise ("display reads from bookings only") was backwards — on the artist's device private events are never written to the Supabase bookings table, and manager conflict detection genuinely depends on availability_blocks. OPTIONAL privacy nicety (not done): availability_blocks stores event_name + location for private events, which managers' apps can read; only start/end time is needed for conflict detection, so those two fields could be dropped from write B if desired.

## C. Store launch blockers (HARD requirements for App Store + Google Play)

- [x] Build in-app Delete Account in artist + manager settings — built `delete-account` Edge Function (option-2 anonymize: private data deleted, shared history anonymized, manager venues deactivated), "type DELETE to confirm" modal wired into both settings screens; deployed + tested (manager delete verified)
- [x] Add Privacy Policy + Terms screens/links in settings — DONE: legal/privacy-policy.html + legal/terms-of-service.html (UAE/Dubai, admin@nexgigapp.com, history-visibility + user-content-accuracy clauses) hosted live at https://nexgig.github.io/legal/ ; in-app "About" links added to both manager + artist settings.
- [x] Decide on expo-audio (microphone) + expo-video plugins — REMOVED both plugins + packages (no audio/video features; mic permission with no feature was a rejection risk)
- [x] Add iOS permission strings for expo-image-picker — added NSPhotoLibraryUsageDescription + NSCameraUsageDescription to infoPlist + expo-image-picker plugin (photos + camera; users can pick from library or take a photo)
- [x] Verify splash + app icon are Nexgig — icon set to app-icon.png (white X on blue #2563EB, 1024×1024, no transparency); splash uses the full Nexgig logo on blue. Old Gigster icons gone.
- [ ] Prepare reviewer demo accounts (manager + artist) + review notes — onboarding now allows self-registration, so just supply one manager + one artist test login at submission
- [ ] Complete App Store privacy nutrition labels / Google Data Safety form (collects email, name, photos) — done in App Store Connect at submission
- [x] Add a Report / flag mechanism for user content (venues, profiles) — DONE: ReportModal component (reason + details → Supabase `reports` table) wired to manager→artist-profile, manager→venue-detail (non-owner only), artist→venue-detail, artist→artist-profile. `reports` table created in Supabase with insert RLS. (Block-a-user still optional/deferred.)

## D. Push notifications

- [x] Set up EAS Build (eas.json + EAS project id `eae9c0e4-...`) — simulator dev build + device dev build both succeeded
- [x] Add expo-notifications to app.config.ts plugins (notification color set; also added expo-font + expo-web-browser plugins)
- [x] iOS push credentials (APNs key) via EAS — created + assigned during device build, Push Notifications capability enabled on com.nexgig.app
- [ ] Android push credentials (FCM) via EAS — not done yet (iOS only so far)
- [x] Register device push tokens on sign-in and store per user in Supabase — `lib/notifications-push.ts` registers + saves to new `users.push_token` column; called from app/_layout on sign-in
- [x] Send push on key events — `create-notification` Edge Function now sends Expo push to the recipient's push_token (best-effort); tested working on a physical iPhone
- [ ] Wire same-day / day-before gig reminders (artist settings toggles exist; need real scheduling on a dev/EAS build)
- [x] Push-tap deep-link: route by notification type/related_id — DONE June 23 2026 (app/_layout.tsx routeFromPush + cold-start via getLastNotificationResponseAsync; payload already carried type/related_id/related_type from create-notification). Needs a real EAS build to device-test (push doesn't work in Expo Go).

## E. Sign in with Apple + Google

- [x] Add Google sign-in via Supabase OAuth — native @react-native-google-signin/google-signin → signInWithIdToken (signInWithGoogle in lib/auth.ts); Google Cloud project Nexgig (admin@nexgigapp.com org), Web + iOS OAuth clients, Supabase Google provider enabled
- [x] Add Sign in with Apple — native expo-apple-authentication → signInWithIdToken (signInWithApple in lib/auth.ts); Apple App ID capability + Services ID com.nexgig.app.signin + Key 8UMH84RKW8; Supabase Apple provider Client IDs = com.nexgig.app.signin,com.nexgig.app (native, no secret needed). TESTED WORKING ON DEVICE ✅
- [x] Add Apple + Google buttons to welcome.tsx and sign-in.tsx — reusable components/oauth-buttons.tsx (onDark/onLight variants); native Apple button (iOS only) + Google button
- [x] On first OAuth sign-in, route new users through account-type selection and create the managers/artists/users rows — choose-account-type.tsx screen + oauth mode in manager-register & artist-setup (skip signup, pre-fill name/email, use existing session); resolveAccountRoute() checks managers→artists→new
- [x] Configure redirect scheme + enable Apple & Google providers in the Supabase dashboard — both enabled; iOS URL scheme (reversed iOS client ID) added to app.config.ts google-signin plugin. IMPORTANT: enabled "Skip nonce check" on the Supabase Google provider — REQUIRED for native iOS Google sign-in (iOS Google SDK embeds a nonce it never exposes, so it can't be matched; this is the Supabase-sanctioned fix). Google sign-in CONFIRMED WORKING on device ✅
- [x] Removed dead Manus OAuth scaffold (oauth/callback.tsx, _core/api.ts, _core/auth.ts, constants/oauth.ts) before building real OAuth
- [x] Android Google sign-in — DONE + DEVICE-TESTED June 24 2026 (Android emulator). No app code change needed (signInWithGoogle already passes webClientId, which is what Android uses; iosClientId is harmless there). Created the EAS Android keystore (development profile) — SHA-1 E0:A8:23:BD:1A:0B:2A:9A:3B:CA:68:A1:04:76:24:C7:54:78:16:86 — and registered an "Nexgig Android" OAuth client in Google Cloud (package com.nexgig.app + that SHA-1). Supabase Google provider + skip-nonce already cover Android. VERIFIED: installed the dev-build APK on an Android Studio Pixel 7 emulator (API 35, Google Play image), tapped Continue with Google, Google sign-in succeeded and routed a new Google user to choose-account-type correctly. NOTE for production: the Play Store build will use Google Play App Signing with a DIFFERENT SHA-1; add that second SHA-1 to the same Nexgig Android OAuth client at submission time.
- [x] Test Google flow on device — CONFIRMED WORKING (both existing-in-app Gmail and brand-new Gmail) after enabling Skip nonce check. Apple confirmed working too. (Returning-user re-sign-in flow not separately stress-tested but routing logic is shared with sign-in.)

## F. Testing

- [x] Add smoke test `__tests__/smoke.test.ts` — stores, venue/slot/booking/draft/lineup reducers, slot-delete cascade, conflict detection (incl. overnight wrap + self-slot skip), time utils, resetAllStores
- [x] Run `pnpm check` (TypeScript) — clean (0 errors)
- [x] Run `pnpm test` — 25 passing (smoke + existing suite)
- [x] Run `pnpm lint` — DONE June 15: ran clean after a node_modules reinstall; fixed the 2 real rules-of-hooks bugs; remaining 9 cosmetic errors + 161 warnings catalogued in the June 15 lint session log below ("clean as you touch").

## G. Security to verify

- [x] `.env` — confirmed contains only public Supabase keys (anon + url); now gitignored + untracked, no rotation needed
- [x] Confirm Supabase RLS enabled with correct policies on all tables — DONE June 22 2026. Full audit (pg_tables + pg_policies); RLS enabled on all 15 tables. Fixed 3 real leaks: managers SELECT was `USING true` (every manager's email/phone readable by any authed user) → own-row `auth.uid() = id`; dropped broad "Authenticated can read bookings" (cross-artist history now only via the safe get_artist_public_gigs RPC); dropped broad "Authenticated can read lineup" on global_lineup. Tightened venues read to authenticated (dropped the no-login public read). Deduped redundant per-command policies on venues/slots/bookings/global_lineup/invoices/managers/artists (covered by each table's manager `ALL` policy or the authenticated read). Dropped the unused `invites` table. Accepted as-is per product: artists + venues + slots readable by any authed user (intended public/discovery; only PII is the known artists.email/phone caveat), and availability_blocks private-event name/location readable. Already correct: users (own-row), notifications (own-row + service-role insert), reports (insert-only), venue_assignments (manager ALL + artist leave/view-own).

# ─────────────────────────────────────────────────────────
# JUNE 2026 — Notifications, Network refactor, EAS/Push
# ─────────────────────────────────────────────────────────

## Done (June 2026)

- [x] Notifications moved server-side (option 2): `create-notification` Edge Function (service-role insert, verifies caller, validates payload); rewrote addNotification to call it instead of direct table upsert; enabled RLS on notifications
- [x] Add-to-roster from manager Network > Artists tab: "Add" button adds existing artist to roster + all current venues, one informational notification (instant, no acceptance)
- [x] Fix artist venue load crash: Array.isArray guards on preferred_energy/genre_preferences/audience_type/sub_vibe + load previously-missing fields (vibe, rules, capacity, links)
- [x] Retire email-invite flow: removed legacy fetchInvites synthesizer (fixed duplicate notifications)
- [x] Artist Network tab: removed Applications sub-tab (status shows as Requested on venue rows); added red DOT badge on Network tab for new network activity (clears on focus/while-focused, leaves notifications in bell)
- [x] Manager Network tab: removed Applications tab; pending applicants show inline at top of Artists tab with Accept/Decline (per-venue accept preserved vs add-to-all-venues roster)
- [x] resetAllStores now clears notifications on sign-out (privacy + stale-cache fix)
- [x] Notifications screens (artist + manager): refetch from Supabase on open + pull-to-refresh (covers missed realtime pushes without sign-out/in)
- [x] Move Preferred Energy field to step 1 (after Address) in create-venue
- [x] Silence RN-internal SafeAreaView deprecation warning via LogBox
- [x] Align all deps to SDK 54 (expo-file-system + expo-linear-gradient were on SDK 55 — broke the native build)

## NEW (June 2026, this session) — account-type back nav

- [x] choose-account-type used router.replace → wizard back button was dead; switched to router.push so back returns to the role picker — TESTED ON DEVICE ✅

## Open bugs (June 2026) — tackle next

- [x] "Booking not found" when tapping a booking notification — booking-detail now fetches from Supabase by id when missing locally + back button added. (Push-tap type routing still open in D bucket.) — TESTED ON DEVICE ✅
- [x] Artist DECLINES a booking — decline now dismisses directly from every screen (calendar, booking-detail, pending-requests) + hides from calendar — TESTED ON DEVICE ✅
- [x] Artist DISMISSES a cancelled booking — notification behaves wrong (diagnose) — VERIFIED WORKING (tested by user, June 2026)
- [x] Remove dead invite code: handleAcceptInvite / handleDeclineInvite removed from app/(artist)/notifications.tsx + orphaned imports/hooks/styles cleaned up

## UI polish (from device testing, June 2026)

- [x] Invoices section collapsed by default on sign in — TESTED ON DEVICE ✅
- [x] Profile-tab badge for new invoices (counts invoices since last Profile-tab visit, clears on tab tap); per-invoice red dot now persists across sign-out via useInvoiceReadStore — TESTED ON DEVICE ✅
- [x] Removed "(optional)" label next to phone number in both registration wizards — TESTED ON DEVICE ✅
- [x] "Booking not found" page now has a back button (header arrow + Go Back button, falls back to Calendar tab) — TESTED ON DEVICE ✅
- [x] Manager lands on Calendar after creating a venue (was My Venues) — TESTED ON DEVICE ✅
- [x] Clear users.push_token on sign-out — clearPushToken now called in handleSignOut (both manager + artist profiles) before resetAllStores, while session is still valid
- [x] "Venue not found" in Network/Discovery — both manager + artist venue-detail now fetch from Supabase by id when missing locally (read-only Overview, loading + back-button states); Array.isArray guards fixed a crash on non-array list fields; Hide button gated to owner — TESTED ON DEVICE ✅
- [x] Artist avatar consistency — AvatarImage fallback now renders the chosen person icon (was white initials on a light circle = "blank white") so every AvatarImage consumer is consistent — TESTED ON DEVICE ✅

## Device testing round 2 (June 2026) — tackle next

- [x] Network tab badge clears the MOMENT the manager accepts or declines a join request (inline Accept/Decline), not only when the manager opens the artist's profile. — TESTED ON DEVICE ✅
- [x] Network data fetches ONCE on Network tab entry (cached in state); only re-fetches on first entry or explicit pull-to-refresh, not on back-navigation. — TESTED ON DEVICE ✅
- [x] Notifications auto-dismiss when the user opens the bell — fade out slowly (~3s) on their own, no tapping each one. — TESTED ON DEVICE ✅
- [x] Artist profile photo now visible to managers/other users — avatar uploads to Supabase Storage + public URL persisted on the artist record; all manager-side artist views read it from Supabase. — TESTED ON DEVICE ✅
- [x] Manager profile Invoices red-dot-on-every-sign-in investigated + fixed — useInvoiceReadStore now applied on every invoice load path. — TESTED ON DEVICE ✅
- [x] [Verified] Artist Full Legal Name IS collected at signup — required field in artist-setup.tsx Step 1 ("Full Legal Name", kept private, used for invoicing). No change needed.

## Device testing round 3 (June 2026) — tackle next

- [x] [Investigate] Artist Full Legal Name disappears after sign-out then sign-in — the legal name the artist entered at signup is gone after re-signing in. Likely root cause: fullLegalName is saved only to the local auth/profile store (or not included in the auth-store partialize) and is never re-read from Supabase (artists.full_legal_name) on sign-in, so it reverts to empty. FIX direction: persist fullLegalName to the artists row on save AND hydrate it from Supabase on sign-in.
- [x] Add a "disconnect" icon to each artist's profile card on the manager's "My Artists" page that removes that artist from THIS manager's connections — i.e. remove them from the manager's global lineup AND from all of the manager's venue assignments (call useLineupStore.removeFromGlobalLineup(artistId) locally + delete/deactivate the corresponding global_lineup and venue_assignments rows in Supabase for this manager). Add a confirmation step before disconnecting.
- [x] [Self-view] Artist should see their OWN card in Network > Artists so they can preview how their profile looks to other artists — currently self is likely filtered out. Either include self in the list (clearly marked "You"), or add a "Preview my profile" affordance that opens the read-only artist-profile-view of themselves.
- [x] [Venue copy] In create-venue (and edit-venue), add a short note near the Rules field telling the manager that a venue's rules are sent to the artist when they join the lineup / are accepted — DONE June 15.
- [x] [Maps] DONE June 24 2026 — Google Places venue location picker + "Open in Google Maps" + admin fallback photo + short-city display. See the June 24 2026 session log at the bottom of this file.

## Venue verification / moderation (June 2026)

- [x] [Review — v1 SHIPPED: show-only verification badge] Venues now carry a `verification_status` ('pending' | 'verified' | 'rejected'). New venues default to 'pending'; all existing venues were backfilled to 'verified'. A small pill renders on the manager's My Venues card and on the venue-detail info card: blue "Verified" ✓ / amber "Pending verification" / red "Not approved". PURELY A LABEL — nothing is gated. Moderation action = flip `verification_status` in Supabase (manual for now). Implemented in: lib/types.ts (Venue.verificationStatus), lib/store.ts (addVenue default 'pending'), lib/sync.ts (map verification_status on load), venue-detail.tsx (fallback fetch map + badge), my-venues.tsx (badge). pnpm check clean.
- [ ] [Review — FUTURE, decide later] If show-only proves too soft, tighten the gate WITHOUT changing the data model: options in increasing strictness — (a) hide pending venues from Discovery until verified, (b) block the FIRST artist assignment / Send Bookings on a never-verified venue with a "Pending verification" message. Also still open: notify the manager when we verify/reject; auto-flag risky new venues (new manager, dup name+address, no maps location, banned words) server-side via a Postgres insert trigger so the review queue stays small; lock `verification_status` to service-role-only in RLS so managers can't self-verify; build a small internal admin screen (v2) instead of editing rows by hand.
- [x] [Review — optional polish] DONE June 15: hid the "Pending verification" + "Not approved" pills from NON-owners on (manager)/venue-detail.tsx — non-owners now only ever see the "Verified" badge (gated both the rejected + pending branches behind `isOwner`, added `: null` fallback). Artist-side venue-detail never rendered the pill, so no change needed there.

## Email + onboarding (June 2026) — DONE June 24 2026 (Resend transactional email)

> NOTE: Foundation built — a generic `send-email` Edge Function sends transactional email via Resend from `notifications@nexgigapp.com` on the verified domain nexgigapp.com (DKIM/SPF/MX in Squarespace DNS, domain shows Verified in Resend, eu-west-1). The function verifies the caller is a logged-in user, looks up the recipient's email server-side (artists then managers by id), renders a branded HTML template, and sends. App-side one-line helper `lib/send-email.ts` `sendEmail(toUserId, template, data)` (fire-and-forget; never blocks the user action). These are OPERATIONAL/transactional emails — they always send and are NOT gated by the local "Product Updates" toggle (which is for future marketing and the server can't read it anyway). Test verified end-to-end on device.

- [x] [Email] Welcome email on first signup (artist + manager) — DONE. `welcome_artist` / `welcome_manager` templates. Triggered after the artists/managers row is created: artist-setup.tsx (after artists upsert) + manager-register.tsx (after managers upsert). Both fire for ALL signup paths (email + Google + Apple) because every path funnels through that single row-creation point. Device-tested ✅.
- [x] [Email] Manager adds an artist to their lineup — DONE. `lineup_added` template, triggered in network.tsx `handleAddToRoster` with `{ managerName, managerId }`. The Edge Function builds the venue+rules section SERVER-SIDE: queries the manager's non-hidden venues (`manager_id = X, is_hidden != true`), renders each venue's name + `rules_template` (venues with no rules show "(joined — no specific rules)"). No rules data crosses the client.
- [x] [Email] Gig/venue-rules email on acceptance — DONE (same `lineup_added` template, one-venue variant). Triggered in network.tsx `handleAccept` (manager accepts an artist's join application to a SPECIFIC venue) with `{ managerName, managerId, venueId }` — the Edge Function fetches just that one venue's rules when `venueId` is passed.

### Email infra implementation notes (June 24 2026)
- Edge Function `send-email` deployed via dashboard Code tab (same as the others; no CLI on this Mac). Reuses the project-wide `RESEND_API_KEY` secret (Tuts created a fresh key + replaced the secret value; the old month-old key was only ever used by the now-orphaned `send-invite-email` function and was deleted in Resend for a clean start).
- Templates live IN the function (`renderTemplate`): `test`, `welcome_artist`, `welcome_manager`, `lineup_added`. Shared branded `shell()` wrapper (blue #2563EB header "NEXGIG / Every booking, verified.", footer). No emojis (per Tuts). Welcome emails are link-free (mobile app, no useful web link).
- Repo source of truth for the function: `supabase/functions/send-email/index.ts`. App helper + template union type: `lib/send-email.ts`.
- A temporary "Send Test Email (TEMP)" button was added to manager settings ADVANCED to verify the pipe, then REMOVED after the test email landed.
- Respecting Email Preferences "Product Updates" toggle: deliberately NOT applied to these (they're transactional, not marketing). Keep that toggle for a future marketing/broadcast path.

## Auth flows to verify (June 2026)

- [x] [Auth] OAuth-then-password collision — DONE June 24 2026. Sign-in now detects when a failed email+password attempt is actually an OAuth-only account and shows "This account was created with Google/Apple — tap Continue with [provider]" instead of a generic wrong-password error. Powered by a `login_hint(p_email)` SECURITY DEFINER SQL function that returns the provider off `auth.users.raw_app_meta_data` (callable by anon; sign-in.tsx calls it in the catch block, falls back to "Incorrect email or password" if unavailable). Mild email-enumeration tradeoff accepted. Device-tested ✅. (plain email+password sanity-check + Android Google sign-in still open below)
- [x] [Auth] Plain email + password signup sanity-check — DONE June 24 2026. Confirmed Supabase "Confirm email" is OFF, so signUp returns a session immediately and the wizard's profile-row inserts succeed. Device-tested end to end: brand-new email+password signup creates all three rows (auth.users + public.users + artists) and lands on the dashboard with the profile populated; sign-out → sign back in with the same email+password works and the profile persists. No code change needed. (Note: with confirm-email OFF, email+password emails are not link-verified — acceptable for launch; OAuth emails are verified regardless.)

## Calendar sync (June 2026)

- [ ] [Calendar] Artist Google Calendar sync — beyond the existing device-calendar export (expo-calendar, one confirmed gig at a time / Export All), add Google Calendar specifically. Clarify scope first: (a) one-way export of confirmed gigs to the user's Google Calendar, or (b) two-way sync. Likely needs Google Calendar API scope on the existing Google OAuth, or rely on the device calendar already being the user's Google account.

## Device testing round 3 — COMPLETED (June 2026)

- [x] Artist Full Legal Name disappears after sign-out → sign-in — ROOT CAUSE: sign-in.tsx artist branch rebuilt currentUser without fullLegalName (also username/bio/location/yearsOfExperience). FIX: sign-in now hydrates fullLegalName + username + bio + based_in + years_of_experience + profile_photo_url from the artists row. (Signup already set them; only the re-sign-in path was missing them.)
- [x] Disconnect icon — manager My Artists cards (link-off icon, top-right of card) AND manager Network > Artists (red link-off next to the green Connected badge when already connected). Both do local removeFromGlobalLineup + Supabase global_lineup/venue_assignments status='removed' + lineup_removed notification, behind a confirm dialog. Dropped the old "can't remove with completed gigs" block (disconnect just severs the connection; gig history stays).
- [x] [Self-view] Artist sees their own card in Network > Artists, marked with a blue "You" pill; tapping opens their own read-only artist-profile-view. (Sorted alphabetically among everyone — pin-to-top is an optional follow-up if wanted.)

## Delete Account — FIXED end-to-end (June 2026)

- [x] FK constraints that blocked deletion fixed in Supabase: bookings.manager_id and reports.reporter_id were NO ACTION → dropped NOT NULL + recreated as ON DELETE SET NULL (bookings.artist_id was already SET NULL). Every other user-referencing FK already CASCADEs. Artist delete now completes (confirmed gone from Supabase).
- [x] delete-account Edge Function: on deletion the departing user's still-pending bookings (requested / past_confirmation) are set to 'cancelled' so they drop off the OTHER party's Pending list automatically (handled for both artist_id and manager_id). Confirmed/completed bookings stay as history, name anonymized to "Former Artist" / "Former Manager". Redeployed via the dashboard Code tab (no local Supabase CLI / Homebrew on this Mac).
- [x] lib/delete-account.ts now surfaces the real Edge Function error (reads error.context.json()) instead of the generic "non-2xx" message — this is how we found the FK error.
- [x] [Low priority — WON'T DO] Manager Network > Artists doesn't live-remove an artist who just deleted their account — it clears on pull-to-refresh / app restart (correct behavior, just not instant). DECISION (re-confirmed June 15): not building it. A live "artist deleted" realtime listener isn't worth the complexity (Supabase realtime subscription + StrictMode dedupe + channel cleanup) for a rare edge case that already self-corrects on refresh. Reopen only if it becomes a real problem.
- [ ] [Deferred / optional] delete-account Edge Function hardening — make the anonymize + private-data cleanup steps best-effort (collected as warnings, never block deletion); only the critical identity-row + auth-user deletion can hard-fail. Not done; the function works now that the FKs are fixed, but this would make it robust against a future stray missing-column/table error.

## Delete Account — follow-ups & former-artist display (June 2026, this session)

- [x] "Former Artist" on manager calendar — after an artist deletes, their booking's artist_id is null so calendar slot rows were skipped (slot looked empty / "+assign") while the day dot lingered. FIX: getArtistUser (lib/store.ts) now returns a stable "Former Artist" placeholder when the id is null/undefined, so those bookings render with their real status across month/week/day views. A real-but-unloaded artist still passes a real id (returns undefined → skip), so no mislabeling.
- [x] Confirmed bookings → cancelled on delete — delete-account Edge Function 4a-pre now cancels requested / past_confirmation AND confirmed bookings (both artist_id and manager_id) so a deleted artist's confirmed gigs drop off the other party's active/upcoming lists. Completed gigs still kept as history. (User's explicit choice: clean slate, no record the confirmed gig was booked.) REDEPLOYED via dashboard Code tab.
- [x] Invoices kept on delete (both directions) — delete-account no longer deletes invoices by artist_id/manager_id; instead invoices.artist_id AND invoices.manager_id were made nullable + ON DELETE SET NULL (SQL run). Artist keeps invoices they sent when a manager deletes; manager keeps invoices received when an artist deletes. Invoice snapshot columns (legal name, email, venue, amounts) keep them readable. REDEPLOYED.
- [x] Storage cleanup on delete — delete-account step 4b-storage now lists + removes the departing user's uploaded photos: avatars bucket (`avatar-<userId>-*`, timestamped so there can be several) for everyone, plus venue-photos (`venue-<venueId>-*`) for each of a manager's venues. Storage failures are collected as non-fatal `storageWarnings` on the success response and never block the account/auth deletion. REDEPLOYED.
- [x] Manager booking-detail — added an Artist card (avatar + name + "Artist" label) at the top of the manager's booking-detail (it previously showed venue + slot but NO artist). Uses getArtistUser → shows "Former Artist" for deleted accounts. Gated to isManager (artist's own view unchanged).
- [x] Dashboard History + Completed Gigs showed "Unknown Artist" for deleted artists — dashboard.tsx (upcoming + completed useMemos) and completed-gigs.tsx now resolve dj to a { fullName: 'Former Artist', profilePhotoUrl: undefined } object when b.artistId == null (kept the "Unknown Artist" fallback only for the truly-unresolvable case). profilePhotoUrl:undefined added to satisfy tsc (placeholder shape must match User where .profilePhotoUrl is read).
- [x] Booking-detail duplicate status removed — deleted the colored status-bar block (the "Gig completed" / "You accepted this booking" line) under the header on BOTH manager and artist booking-detail; the header StatusBadge is now the only status indicator. (Left statusColors / statusBar styles / isDJ in place as dead code — noUnusedLocals is off; logged for tidy-up below.)
- [x] pnpm check clean after fixes (was 3 TS2339 errors on the Former-Artist placeholder missing profilePhotoUrl; fixed).
- [x] [Tidy-up] Removed dead code left by the booking-detail status-bar removal: statusColors object + statusBar/statusDot/statusText styles in both booking-detail files. (Left `isDJ` in manager booking-detail — it IS still used at the Accept/Decline guard, so the todo note was wrong on that one.) Done in the June 13 tidy commit.
- [x] [Optional polish — WON'T DO] confirmed/cancelled former-artist booking rows on the calendar still show the × cancel button which would fire a notification to a null userId (harmless no-op). DECISION (June 15): leaving as-is — it's a do-nothing button on orphaned bookings (artist already deleted), lowest-value item on the list. Gate the action buttons off for null-artist bookings only if it ever actually matters.
- [x] Full test-data wipe performed by user (all bookings + all app-table rows + auth logins) and the whole delete/former-artist flow re-tested on device — WORKING.

## Artist signup data not persisting (June 2026) — RE-INVESTIGATED, real root causes

- [x] [ROOT CAUSE A — own profile tab blank] artist-setup.tsx writes the full artists row to Supabase but only called setCurrentUser — it NEVER populated useLineupStore.artistProfiles, where the profile + edit-profile screens read genres/instruments/gender/rate/nationality/links from. So the artist's own profile tab was blank right after signup. FIX: artist-setup.tsx now also calls updateArtistProfile(user.id, {...}) right after setCurrentUser with the full field set. (Earlier I only fixed the re-sign-in path; the immediately-after-signup path was still broken — this closes it.)
- [x] [ROOT CAUSE B — network artist preview blank] artist-profile-view.tsx fetched the artists row with `.eq('user_id', artistId)`, but the artists table is keyed by `id` (signup writes `id: user.id`; sign-in + edit-profile both query `.eq('id', ...)`). So the preview query matched nothing and the whole profile came back empty. FIX: changed to `.eq('id', artistId)` and rewrote the field mapping to the ACTUAL columns (primary_genre, secondary_genres, instruments, min_rate, gender, based_in, nationality, instagram/soundcloud/mixcloud/spotify_url, is_history_hidden) — the old mapping read non-existent columns (energy_types, social_links, rate_per_hour, user_id). Array.isArray guards on the array columns.
- [x] [Re-sign-in hydration — still correct] sign-in.tsx + oauth-buttons.tsx hydrate currentUser + artistProfiles for returning artists (email/Apple/Google), and manager bio/based_in/years on both paths. Kept.
- [x] [VERIFIED on device June 22 2026] FULL matrix passed: (1) brand-new artist signup → profile tab shows everything immediately (no refresh); (2) that artist appears correctly in another user's Network > Artists preview; (3) sign out → sign back in (email + Apple + Google) → everything still there; (4) manager signup Company Name saves, shows, and persists across sign-out/in.
- [x] [Network preview minor] explore.tsx artist list query — reviewed and left as-is intentionally (the DETAIL screen does its own full fetch, so no change needed).
- [x] ["Filled = filled everywhere" — single source of truth] Confirmed the real artists-table schema (21 cols, keyed by id, no user_id/energy_types/social_links/rate_per_hour, and NO is_history_hidden column). Two hardening changes so filled fields always show on every screen: (1) lib/store.ts updateArtistProfile now MERGES onto existing + always keeps userId — a partial update (history-hide toggle sending only {isHistoryHidden}) can no longer wipe the rest or create a half-empty profile (this was the user's "maybe history-hide is hiding the others" suspicion — plausible when the store was empty). (2) profile.tsx now fetches the artist's OWN row from Supabase on every tab open and repopulates both currentUser (fullName/legalName/username/bio/location/years/photo) and artistProfiles (genres/instruments/gender/rate/nationality/links). Supabase is the source of truth; the local store is just a cache the screen reads. This makes the own-profile tab correct even for old accounts / reinstalls / pre-fix signups, with no manual re-sign-in. Network preview (artist-profile-view) already fetches Supabase directly → same truth. pnpm check passed.
- [x] [Profile/preview layout parity (June 2026)] (1) profile.tsx: split the single "Music" card into separate "Music Genres" + "Instruments" cards to match the preview. (2) artist-profile-view.tsx: bio + years_of_experience were read from the users row (which doesn't store them) — now read from the artists row (fetchedProfile) via resolved `bio`/`yearsOfExperience` fallbacks. (3) ALSO the preview had a guard `if (djFromStore) return` that skipped the Supabase fetch when the artist was in the local store — and the stored ArtistProfile carries no bio/years, so they never showed. Changed to ALWAYS fetch the full row from Supabase (source of truth) and prefer fetched over store; spinner only when nothing cached. (4) Moved the Links/Instagram card above History in the preview to match profile order. All verified on device.
- [x] [history-hide PERSISTS now] DONE June 15: added is_history_hidden boolean column to artists, profile.tsx toggle writes to Supabase alongside the local store, profile.tsx own-row fetch reads it back, all 3 directory-cache seeders read `a.is_history_hidden ?? false`. Also killed the "history card flashes for 1ms on entry" first-paint bug on manager + other-artist views.

## Disconnect artist — REAL fix + cleanup notes (June 2026, this session)

- [x] [ROOT CAUSE] "Disconnect" on the manager Network (explore) tab AND the manager Profile → Artists screen (artists.tsx) wrote `.update({ status: 'removed' })` to global_lineup + venue_assignments. Setting venue_assignments.status='removed' VIOLATES a check constraint on that table, so the write failed silently (error never checked) and the row stayed active → the artist reappeared on sign-out/in. FIX: both now `.delete()` the rows (with console.warn on error). This SUPERSEDES the earlier "Device testing round 3" note that recorded the status='removed' approach as done — that approach was broken from the start.
- [x] [Audited every remove path — all DELETE now] (manager) explore.tsx handleDisconnect; artists.tsx handleDisconnect + handleRemoveFromVenue; team.tsx handleRemoveDJ + handleRemoveFromVenue; lineup.tsx both handlers; artist-profile-view.tsx handleRemove + handleRemoveFromVenue. RLS confirmed OK: global_lineup + venue_assignments each have a "Managers can manage…" ALL policy (auth.uid() = manager_id) that covers DELETE (verified via pg_policies).
- [x] [Stale rows] VERIFIED CLEAN June 15: both global_lineup (4 rows) and venue_assignments (4 rows) only contain `status='active'` rows for legitimate current connections. No stale `'removed'` rows.

## Page cleanup — TODO (flagged June 2026)

- [x] [Wipe unused hidden pages] DONE (commit f48d276): deleted team.tsx + lineup.tsx (confirmed unreachable via grep) + their Tabs.Screen entries.
- [x] [Rename pages to match what they are] DONE (commit f48d276): renamed (manager)/(tabs)/explore.tsx AND (artist)/(tabs)/explore.tsx → network.tsx; updated both Tabs.Screen name="explore"→"network" and the 3 router pushes (dashboard, profile, artists). Left the MaterialIcons name="explore" compass icon (it's an icon, not a route). (manager)/artists.tsx kept its name (it's "My Artists").

## Session log — June 12 2026 (security + instant-load + disconnect + verified badge)

All items below COMMITTED + device-tested unless marked otherwise.

- [x] [Security] Closed users-table PII leak: Discovery + profile previews read from `artists` (not `users`); fixed broken `.eq('user_id')` query (artists keyed by `id`). RLS verified in DB: dropped "Users can view all profiles", "Users can insert own data", and 2 redundant global_lineup insert policies (pg_policies confirms gone). Rollback policy noted if ever needed.
- [x] [Instant-complete loading] Shared in-memory directory caches so profiles/venues open COMPLETE on first frame (no fetch-on-open second pass). `useArtistDirectoryStore` + `useVenueDirectoryStore` + `mapVenueRow` helper in lib/store.ts (merge-on-set). Seeded from: manager explore (artists+venues), artist explore (artists+venues), manager _layout (lineup artists at startup). Readers: both artist-profile-views + both venue-details prefer cache → fetch → skeleton/spinner. Resolution prefers COMPLETE cache over partial lineup-store data; contentReady gates the skeleton.
- [x] [Disconnect bug — ROOT CAUSE + full fix] Disconnect wrote `.update({status:'removed'})` which violates a check constraint on venue_assignments → failed silently → artist returned on sign-in. Fixed ALL paths to `.delete()` global_lineup + venue_assignments: explore.tsx handleDisconnect (the Network-card button the user actually used), artists.tsx (Profile→Artists) handleDisconnect + handleRemoveFromVenue, team.tsx handleRemoveDJ + handleRemoveFromVenue, lineup.tsx both handlers, artist-profile-view.tsx handleRemove + handleRemoveFromVenue. RLS OK (ALL policy auth.uid()=manager_id covers DELETE). Verified survives sign-out/in.
- [x] [Invite button] Removed retired "Invite to Lineup" button + "Invite Sent" state from manager artist preview (invite-only onboarding is retired).
- [x] [Verified badge] Artists with ≥1 completed booking get a blue `verified` checkmark. SQL RUN: added artists.has_completed_booking (bool), backfilled from bookings (status='completed' OR is_completed=true), + AFTER INSERT/UPDATE trigger mark_artist_completed() (SECURITY DEFINER) to keep it synced. Badge placed on the NETWORK LIST CARDS (manager + artist explore), NOT inside profile screens (flag lives there). Reads has_completed_booking straight off the row.

### Open follow-ups from this session (NOT done)
- [x] [Tidy dead code] DONE June 15: removed the unused hasCompletedBooking threading (the 2 artist-profile-view fetch mappings, the artist + manager network seeder duplicates, the artist own-profile mapping) and the stray hasCompletedBooking fields on Venue objects. KEPT ArtistProfile.hasCompletedBooking + the manager network seeder line + the artists column/trigger/card-reads, because the manager Network card's badge reads from that field (removing it broke the build — regression caught and fixed in the same session).
- [x] [Verify on device] DONE June 15: badge end-to-end verified during the orphan-row investigation; trigger fires + card reads correctly.
- [x] [Stale connection rows] VERIFIED CLEAN June 15 (same check as above).

(See also "Page cleanup — TODO" just above: wipe unused hidden team.tsx/lineup.tsx after verifying they're unreachable; rename misleading page files e.g. explore.tsx → network.tsx.)

## Session log — June 13 2026 (screen cleanup pass, pre-Replit-design)

- [x] [Wipe team/lineup] Deleted (manager)/(tabs)/team.tsx + lineup.tsx + their Tabs.Screen entries. Commit f48d276.
- [x] [Rename explore→network] Both (manager) + (artist) (tabs)/explore.tsx → network.tsx; Tabs.Screen names + 3 router pushes repointed; compass icon left alone. Commit f48d276.
- [x] [Remove 5 orphaned screens] Confirmed unreachable via grep, then deleted + removed their layout entries (commit 037fb26, 1501 deletions):
  - (auth)/artist-invite.tsx — retired email-invite onboarding.
  - (manager)/manager-artist-invoices.tsx — superseded by manager-invoice-detail.
  - (manager)/(tabs)/venues.tsx — leftover hidden tab; live venue screen is (manager)/my-venues.tsx.
  - (artist)/requests.tsx — older version; live flow is (artist)/pending-requests.tsx.
  - (artist)/(tabs)/bookings.tsx — leftover hidden tab; artists use home / confirmed-gigs / pending-requests.
- [x] [Housekeeping] Removed an accidental stray git repo in the home folder (~/.git, no remote/commits) that was causing `git add -A` from ~ to try to stage the whole home dir. Nexgig repo unaffected.
- [x] [Artist tab rename] (artist)/(tabs)/home.tsx → dashboard.tsx and availability.tsx → calendar.tsx so file names match their displayed titles (Dashboard / Calendar), consistent with the manager side. Tabs.Screen names + all 8 route refs repointed (entry redirect, sign-in, artist-setup, oauth-buttons, invoice-preview, invoices, booking-detail ×2). Commit 3dbf31b.

### CLEAN SCREEN INVENTORY (as of 037fb26 — reference for the Replit design pass)
VISIBLE TABS — manager: dashboard, calendar, network, profile | artist: dashboard, calendar, network, profile (file names + titles now match on both sides after the home→dashboard / availability→calendar rename, commit 3dbf31b). No hidden href:null tabs remain on either side.
MANAGER pushed (non-tab) screens: artist-bookings, artist-profile-view, artists ("My Artists"), assign-artist, booking-detail, completed-gigs, confirmed-bookings, create-venue, edit-profile, edit-venue, invite-artist, manager-invoice-detail, my-venues, notifications, pending-requests, send-feedback, settings, venue-detail.
ARTIST pushed (non-tab) screens: artist-profile-view, booking-detail, confirmed-gigs, edit-profile, invoice-gigs, invoice-preview, invoices, my-venues, notifications, pending-requests, send-feedback, settings, venue-detail.
AUTH: welcome, sign-in, choose-account-type, manager-register, artist-setup.
ENTRY: app/(tabs)/index.tsx = auth-gate router (redirects to welcome / manager dashboard / artist dashboard). KEEP.
NOTE: (manager)/invite-artist.tsx is still live (referenced once) — this is the "add an already-registered artist to a venue lineup" in-app action, NOT the retired email invite. Left in place.

### Remaining dead-code tidy-ups (cosmetic, noUnusedLocals is off so pnpm check stays green)
- [x] hasCompletedBooking threading removed (badge stays on the cards via raw row reads): removed the ArtistProfile field (types.ts) + an unrelated stray field on Venue, both artist-profile-view fetch-mapping lines, all 3 directory-cache seeder lines, the has_completed_booking column from the manager _layout.tsx select, and the artist profile.tsx mapping. Verified the artists column + trigger + the card-side reads were left intact.
- [x] booking-detail status-bar leftovers removed (both files).
- [x] artist (tabs)/_layout.tsx BookingTabIcon removed (component was orphaned after deleting the bookings tab).

### Still-open verifications/items carried forward
- [x] Verify on device: badge end-to-end — DONE June 15.
- [x] Stale connection rows — VERIFIED CLEAN June 15.
- [x] is_history_hidden — DONE June 15 (column added, write + read + cache seeders).
- (recap — full list lives in "CURRENT OPEN ITEMS" at the top of this file) Bigger workstreams still pending: push (Android FCM + reminders), email infra, auth/OAuth edge cases, Maps, Google Calendar, App Store submission, Tap Payments.

## Session log — June 13 2026 evening (dead-code tidy + stale Stack.Screen fix)

- [x] [Dead-code tidy] Removed three orphan blocks across the codebase: BookingTabIcon in artist (tabs)/_layout.tsx (powered the deleted bookings tab); hasCompletedBooking threading (ArtistProfile field + stray Venue field + 2 fetch mappings + 3 seeders + select column + own-profile mapping) — the badge stays on the cards via raw row reads; statusColors + statusBar/statusDot/statusText styles in both booking-detail files. Verified isDJ in manager booking-detail is still used (todo note was off on that one).
- [x] [Stale Stack.Screen] Removed `<Stack.Screen name="requests" />` from (artist)/_layout.tsx that was left over from deleting (artist)/requests.tsx earlier today (commit 037fb26). Cleared the "No route named 'requests' exists" runtime warning.

### Pre-existing warnings surfaced during today's reload (NOT from today's work)
- [x] [Extraneous route] DONE: removed orphan `<Stack.Screen name="oauth/callback" />` from app/_layout.tsx (no matching route file exists; lib/_core/ helpers were not touched). Cleared the runtime warning.
- [x] [SafeAreaView] Investigated: codebase already imports from `react-native-safe-area-context` (only 2 places, both correct). The deprecation warning is coming from a transitive dependency, so the LogBox.ignoreLogs silencer in app/_layout.tsx is the correct workaround. Marked DONE — leave the silencer in place.

## Session log — June 15 2026 (push-through tidy + is_history_hidden persistence + critical signup-flow finding)

### Code/SQL shipped today (committed)
- [x] Removed orphan `oauth/callback` Stack.Screen registration (a, above).
- [x] Added Rules helper copy on create-venue + edit-venue ("Rules are sent to artists when they join your lineup or accept a booking at this venue.").
- [x] **is_history_hidden now PERSISTS**: SQL added column to artists (boolean NOT NULL DEFAULT false), profile.tsx toggle writes to Supabase alongside local store, profile.tsx own-row fetch now reads it back, and all 3 directory-cache seeders (manager (tabs)/network.tsx, artist (tabs)/network.tsx, manager _layout.tsx) now read `a.is_history_hidden ?? false` instead of hardcoding false. Killed the "history card flashes for 1ms on entry" first-paint bug on the manager + other-artist views of an artist who hid their history.
- [x] Confirmed cleanup of dead code tidy from earlier today survived: BookingTabIcon removed, statusColors / statusBar / statusDot / statusText styles removed from both booking-detail files, stale `<Stack.Screen name="requests" />` cleaned from (artist)/_layout.tsx.
- [x] Caught + fixed regression from the dead-code tidy: I had removed `hasCompletedBooking` from ArtistProfile in types.ts, breaking the manager Network card's badge read. Restored the field; restored the manager Network seeder line; removed two stray `hasCompletedBooking: false` lines from Venue object constructions (manager _layout.tsx + create-venue.tsx) that were never legitimate on the Venue type — those were the source of the TS errors.

### ✅ RESOLVED June 22 2026 — signup-flow "wrong-UUID" finding was a one-off, NOT a recurring bug

**RESOLUTION (June 22 2026):** Re-investigated. `signUp()` inserts the users row with the fresh `data.user.id`, and the artists table's RLS `WITH CHECK (auth.uid() = id)` means a wrong-UUID artists row can only be created while a *manager* session is still live at insert time — which is unreachable in normal use (signed-in users never reach the artist-signup screen). The full signup matrix was verified working on June 22. A data audit returned **0 rows** for BOTH checks (artists rows whose id isn't an artist user; artist users with no profile row at their uid) — no mismatches anywhere. Conclusion: the original break was a one-off from a dev test session (signed in as a manager, then manually completing a new artist signup on the same device), not a production bug. No code change needed. The checklist below is kept only for reference / re-use if it ever recurs.

**[Original finding, kept for reference] Symptom user reported:** New artist account `elieturk0@gmail.com` had the verified badge in the Network list but the History card on their own Profile said "No completed gigs yet," while the booking was visible on the manager's calendar.

**Diagnosis (SQL forensic):**
- `public.users.id = 8361a0f9-b94d-4e9d-b320-ae5b9e080e86` (account_type='artist', email='elieturk0@gmail.com') — the actual auth user.
- `public.bookings.artist_id = 8361a0f9-…` (correct — booking points at the auth user).
- `public.artists` had NO row at id=8361a0f9-… — the artist's profile row was MISSING at the correct UUID.
- Instead, the artist's profile data (full_name="Elie Turk", email="elieturk0@gmail.com", primary_genre="Amapiano", username="tuuuuurk", instagram_url, has_completed_booking=true) was sitting on a row at id=084fc235-8732-4b0f-b340-b7bd7fe40712 — which is the MANAGER "Eie Turk" / elieturk@live.com's users.id.
- Net effect: artist logs in as 8361a0f9-… → app looks for `artists WHERE id = 8361a0f9-…` → no row → empty profile/history. Badge looked correct because the trigger was firing on the orphan row at 084fc235-….

**One-row data repair (RUN tonight, working):**
```sql
BEGIN;
UPDATE public.artists
  SET id = '8361a0f9-b94d-4e9d-b320-ae5b9e080e86', updated_at = NOW()
  WHERE id = '084fc235-8732-4b0f-b340-b7bd7fe40712';
COMMIT;
```
FK cascade worked (bookings/lineup/assignments already pointed at the correct UUID anyway). Device-verified: artist sign-out/in shows full profile + 1 Completed Gig + history card. Manager calendar + Network card badge unchanged.

**Earlier attempt that failed (kept for reference):** INSERT-into-target-then-DELETE-orphan tripped on `artists_username_key` unique constraint because Postgres validated the new row's username before the DELETE removed the colliding one. The single-row UPDATE worked because the username never changed.

**Why this is critical for the auth workstream:**
- The signup flow somewhere wrote an `artists` row with `id = <some OTHER user's auth uuid>` instead of `id = <the signing-up user's auth uuid>`. That's a violation of the 1-to-1 `users.id <-> artists.id` contract.
- Most plausible cause (educated guess, NOT verified): a manager session was still active when the artist signup ran, and the artist-profile INSERT used the cached/wrong session's uid. This squares with the symptom that the orphan row sat at the manager's UUID specifically. Could also be an OAuth-flow path that pulls the wrong uid.
- IMPACT: every future artist signup is at risk of the same bug, in conditions we haven't isolated. The repair tonight only fixes THIS account; it does not prevent recurrence.
- USER-FACING: an affected artist sees the badge from the orphan but an empty profile — confusing, and they may abandon onboarding. Manager-side data looks fine.

**Investigation checklist for the auth pass:**
- [ ] Audit every place we INSERT into `public.artists`. Confirm the id ALWAYS comes from the freshly-fetched supabase auth user (e.g. `(await supabase.auth.getUser()).data.user!.id`), not from any cached/store value that could be stale. Start with artist-setup.tsx and any OAuth-completion path.
- [ ] Add a defensive INSERT guard: only insert when `auth.uid()` matches the artists.id being inserted (the "Artists can insert own profile" RLS policy already does this with `WITH CHECK (auth.uid() = id)` — so the bug actually means the wrong uid was somehow auth.uid() at insert time, OR the insert ran from a context that bypassed RLS, like a server-side helper).
- [ ] After fixing, write a one-off audit query to find any OTHER orphaned/mismatched artists rows: `SELECT a.id, u.id AS auth_id, a.email FROM public.artists a LEFT JOIN public.users u ON u.id = a.id WHERE u.id IS NULL OR u.account_type <> 'artist';` Repair any matches the same way.
- [ ] Consider adding a Postgres CHECK / trigger / RLS rule that physically prevents an `artists` row from being created at a `users.id` whose `account_type <> 'artist'`. That would have caught this at insert time.
- [ ] Reproduce: try signing up a new artist while a manager session is cached in the app and see if it recurs. (Skipped tonight per user's call to wrap.)

### Items NOT done from tonight's "finish everything except big workstreams" plan
- [x] **(e) Stale connection rows check** — VERIFIED CLEAN. Both global_lineup (4 rows) and venue_assignments (4 rows) contain only `status='active'` rows for legitimate current connections (manager Eie Turk → 4 artists: Elie Turk, Bsnsna, Salt Shaker, Tuurk; all assigned to Feb30). No stale `'removed'` rows from the old broken-disconnect bug. The disconnect fixes earlier this week stopped the rot at the source; no wipe needed.
- [x] **(f) Verify badge end-to-end** — confirmed manually tonight while investigating the orphan-row bug above; the badge logic + the trigger both work. Calling this verified.

## Session log — June 15 2026 (lint pass, minimum scope)

Ran `pnpm lint` (`expo lint`). First attempt errored "Cannot find module is-string" — corrupt node_modules; fixed with `rm -rf node_modules && pnpm install` (lockfile up to date, 1081 packages). Lint then ran: **11 errors, 161 warnings.**

Chose MINIMUM scope: fix only the 2 real rules-of-hooks bugs, log the rest.

- [x] [Rules-of-hooks] app/(manager)/assign-artist.tsx — `useState`(slotSearch) and a `useMemo`(filteredDjs) were declared AFTER two early returns (slot-not-found + venue-lineup-mode), so they ran conditionally. FIX: moved the slotSearch `useState` up next to venueSearch (above the early returns); converted filteredDjs from useMemo to a plain computation (its dep chain crossed the early-return branches; the list is small so memoization loss is imperceptible). 
- [x] [Rules-of-hooks] app/(manager)/booking-detail.tsx — `useNotificationStore`(addNotification) on line 74 was after the `if (!booking) return` early return. FIX: hoisted it into the hook block above the early return (next to the other two useNotificationStore reads), deleted the lower one.
- (Both fixed; pnpm check expected clean; device-test the manager booking-detail + assign-artist screens. Commit msg: "Fix two rules-of-hooks violations: hoist slotSearch state + convert filteredDjs to plain compute in assign-artist; hoist addNotification above early-return in booking-detail".)

### Remaining lint inventory — NOT fixed (deliberately deferred; "clean as you touch" going forward)
- [ ] [Lint — cosmetic] 9 `react/no-unescaped-entities` errors = literal apostrophes in JSX text (e.g. don't / you're) that ESLint wants written as `&apos;`. ZERO runtime impact. Files: (manager)/artists.tsx (L450×2), (manager)/booking-detail.tsx (L267), (manager)/invite-artist.tsx (L140×2, L198), (artist)/my-venues.tsx (L122), (manager)/settings.tsx (L325). Auto-fixable.
- [ ] [Lint — cosmetic] ~80 "defined/assigned but never used" warnings (dead imports/vars) spread across many files. Safe to remove but tedious; do it per-file as you touch them.
- [ ] [Lint — RISKY, case-by-case only] ~40 "React Hook missing dependency" warnings. Do NOT bulk-fix — some omissions are intentional (adding the dep causes infinite loops / unwanted reruns; we've hit that regression before). Handle one at a time only when editing that specific effect.
- [ ] [Lint — cosmetic] ~7 "imported multiple times" (expo-router) + "import/first" warnings. Safe to merge/reorder.
- [ ] [Lint — harmless] `MODULE_TYPELESS_PACKAGE_JSON` warning on eslint.config.js — could add `"type":"module"` to package.json to silence; not urgent.
- Note: only 5 of the 161 warnings are auto-fixable via `pnpm lint --fix`.

## Session log — June 15 2026 (manager profile overhaul + calendar/dashboard tweaks)

All device-tested and working. Required SQL (ALL RUN): `ALTER TABLE public.managers ADD COLUMN IF NOT EXISTS company_name text;` + `ALTER TABLE public.managers ADD COLUMN IF NOT EXISTS profile_photo_url text;` + a new RLS UPDATE policy on managers (`create policy "Managers can update own profile" on public.managers for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);`).

- [x] [Manager bio removed ENTIRELY] profile display card + cardText style ((manager)/(tabs)/profile.tsx); field + form state + originalForm + hasChanges + save mapping + bio-only styles ((manager)/edit-profile.tsx); field + form state + managers-table write + setCurrentUser write + textarea/charCount styles ((auth)/manager-register.tsx). Artist bio UNTOUCHED. The `bio` field stays on the User type (artists use it); managers.bio column left in place but unused (harmless).
- [x] [Manager Company Name replaces Years of Experience] Added `companyName?: string` to the User type (kept yearsOfExperience — artists hydrate it). Replaced the years field with a "Company Name" text field in manager-register + manager edit-profile. Writes `company_name` to the managers row; hydrated on sign-in + OAuth. SQL added managers.company_name. Old managers.years_of_experience column left unused.
- [x] [Manager profile FULLY persists to Supabase] manager edit-profile save now writes ALL editable fields to the managers row (full_name, phone, based_in, company_name, profile_photo_url) — previously it only wrote the photo to the users table, so name/phone/based-in/company edits silently reverted on re-sign-in (sign-in re-hydrates from managers). Photo also still written to users. SQL added managers.profile_photo_url (the column the code already READ on sign-in but that never existed — so the manager photo never actually persisted before; now it does).
- [x] [Manager edit-profile RLS — root cause of "based_in not changing"] Added the missing UPDATE policy on the managers table. Before today, edit-profile never UPDATE-d managers (only INSERT via registration), so there was no UPDATE policy — PostgREST silently updated 0 rows with NO error. (users photo write kept working because users has an UPDATE policy.)
- [x] [Save diagnostics] manager edit-profile save now surfaces failures instead of failing silently: captures `{ error }` from both updates AND checks the returned row count via `.select()` (PostgREST does NOT error on an RLS-blocked UPDATE — it returns 0 rows). Shows a "Save failed" alert with the reason. This is how we found BOTH the missing RLS policy and the missing profile_photo_url column.
- [x] [Unsaved-changes guard bug FIXED] After Save succeeded, tapping back still prompted "save your changes?". Cause: `hasChanges` is a useMemo, but the baseline (originalForm/originalPhoto) was stored in REFS — updating a ref after save doesn't re-run the memo, and on a text-only edit nothing else in the dep array changed, so hasChanges stayed stuck true. Converted the baseline from refs to STATE so save resets it and the memo recomputes to false. Removed the dead `saved` state (never set) + the now-unused useRef import.
- [x] [Calendar] Added a centered "+ Create Venue" button to the manager calendar empty state, shown ONLY when the manager has 0 venues (existing `venues.length === 0` branch). Replaced the bare EmptyState with an inline icon+title+subtitle+Pressable → router.push('/(manager)/create-venue'); removed the now-unused EmptyState import.
- [x] [Dashboard] Removed the "Add Set" option from the manager dashboard + FAB (now only New Venue + Find Artists).
- [x] [Artist edit-profile] Verified + fixed June 15. The unsaved-changes-after-save bug is NOT present on the artist side (it uses a `baselineVersion` counter in the hasChanges deps that the manager screen lacked — setBaselineVersion on save forces the memo to recompute). BUT artist profile edits other than the photo were NOT persisting to Supabase (updateProfile + updateArtistProfile are local-only; the save only wrote profile_photo_url to users + artists). FIXED: the save now writes ALL editable fields to the artists row (full_name, full_legal_name, bio, based_in, nationality, gender, primary_genre, secondary_genres, instruments, min_rate, years_of_experience, the 4 social URLs, profile_photo_url) + the same error/0-row diagnostics as the manager. No SQL needed — artists already has an UPDATE policy + all these columns (mirrored from the artist-setup signup insert). NOTE: phone is intentionally NOT written to artists (no phone column there; artist phone uses the dedicated change flow / users table).

## Session log — June 22 2026 (VERIFY-ON-DEVICE items confirmed by user)

All three device-only verification items from the top "CURRENT OPEN ITEMS" block are now confirmed working and have been removed from that block.

- [x] KeyboardAvoidingView on the artist Add/Block slot modal — lower fields are NOT covered by the keyboard. (verified on device)
- [x] Full signup matrix — new artist signup shows everything immediately, appears correctly in others' Network, and survives sign-out/in on email + Apple + Google; manager signup Company Name (not bio/years) saves, shows, and persists across sign-out/in. (verified on device)
- [x] Manager's dedicated email + phone change flows persist to Supabase — phone change writes to Supabase immediately; email is read-only (changed via admin@nexgigapp.com). (verified on device)

## Session log — June 2026 (latest: RLS audit + email-invite retirement + profile RPC + UI polish)

Removed the stale "OPTIONAL polish" trio from the top block — all three were already resolved (pending-verification pill hidden from non-owners = done June 15; null-artist cancel button + live-remove-deleted-artist = explicit won't-do in the body).

- [x] RLS audited + hardened on all 15 tables (full detail in section G): managers SELECT was `USING true` (email/phone leak) → own-row; dropped broad "Authenticated can read bookings" + "Authenticated can read lineup"; venues read tightened to authenticated; redundant per-command policies deduped. NOTE: if not done yet, run `drop table if exists public.invite_venues; drop table if exists public.invites cascade;` to finish the invite retirement.
- [x] Retired the email-invite flow end-to-end: deleted `(manager)/invite-artist.tsx` + `lib/api.ts` (dead Manus helper layer), removed the dead invite `useEffect` + `handleSendInvite` from `(manager)/artist-profile-view.tsx`, repointed the My Artists FAB to Network → Artists (open-registration discovery). `send-invite-email` Edge Function now orphaned (delete in dashboard whenever).
- [x] Signup-flow wrong-UUID finding RESOLVED — one-off dev-test artifact, data audit returned 0 mismatches (see bottom of file).
- [x] Artist + manager artist-profile-view now show the viewed artist's REAL global completed gigs / monthly plays / history via a new `get_artist_public_gigs` SECURITY DEFINER RPC (returns only venue + date + times; manager's remove-warning keeps its own shared-gig count).
- [x] Verified-badge consistency: icon-only ✓ next to the name on the network artist card, network venue card, venue-detail header, and My Venues (after the name, matching network); added the ✓ to the artist profile-view hero (both manager + artist sides).
- [x] Network card polish: artist card subtitle → primary genre only (dropped location + secondary); venue cards → name + location only (fixed the artist-side address that never showed — now reads `google_maps_location.address`; manager venues map via `mapVenueRow` so location shows).
- [x] Connect/Join controls unified: manager artist card connected = green ✓ pill matching Add + swipe-left to disconnect; artist venue Join pill matched to Add (+ "Sent" muted sibling + green ✓ when connected); artists can swipe-left to LEAVE a venue (deletes own `venue_assignments` row via a new "Artists can leave a venue" DELETE policy + notifies the manager).
- [x] Notify the artist when a manager declines their venue join request (`lineup_declined` notification + push).
- [x] Booking-detail slot card (both sides): dropped the slot-name line, now leads with date + time.
- [x] Manager's view of a CONNECTED artist gets a Contact section (email + phone) — added `artists.phone` column + dual-write on the artist's phone change. Send Feedback now actually delivers (mailto to admin@nexgigapp.com, both sides); email-change hint names the support address.
- [x] Edit-venue brought in line with create-venue: Preferred Energy options (Low/High/Mixed) + the full field order now match.
- [x] Three VERIFY-ON-DEVICE items confirmed (KeyboardAvoidingView, full signup matrix, manager email/phone persistence) — logged just above.

## Session log — June 23 2026 (venue-delete history preservation, artist completed gigs, invoices for deleted venues, rate removal)

All committed (commit 29c33d2 for the venue/booking/invoice batch; rate-removal a follow-up commit). Device-tested by user.

- [x] **Venue "delete" now HIDES instead of hard-deleting** — edit-venue sets `is_hidden = true` (keeps the row + slots alive so completed gigs keep resolving the real venue name everywhere), cancels the venue's pending/confirmed bookings + notifies those artists, and still removes venue_assignments. Completed gigs are preserved as history. `is_hidden` already existed in the DB and both Network lists already filtered it; only `sync.ts` needed to READ `is_hidden` (was hardcoded false) so the hide persists across reload. My Venues already filtered `!isHidden`.
- [x] **Manager calendar shows hidden venues' booked slots** — scoped slot rendering to include hidden venues but ONLY slots that already have a booking (history shows, no empty-slot clutter); filter tabs + add-slot stay on active venues.
- [x] **Artist completed gigs were invisible — TWO root causes fixed.** (1) Artist `_layout` booking loader SKIPPED completed bookings on sign-in (`else if (!isCompleted || status!=='completed')`) — and the booking store isn't persisted, so they vanished every sign-out/in. Now loads all bookings incl. completed. (2) Artist dashboard auto-complete required the slot in-store, but the artist app never loads slots, so past confirmed gigs never flipped to completed → fell into a gap (not upcoming, not completed). Now falls back to the booking's `slotDate`/`slotStartTime` snapshot. Fixes dashboard COMPLETED count, Completed Gigs screen, and profile History.
- [x] **Invoices work for deleted/hidden venues** — `invoices.tsx` New-Invoice list no longer drops a venue missing from the store (falls back to booking `venueName` snapshot); `invoice-gigs` header uses snapshot + passes managerId/venueName params; `invoice-preview` fetches the still-existing venue row from Supabase for name/manager/billing (billing is in separate `billing_company_*` columns that no artist-side loader maps), with snapshot param fallback + a send guard blocking an invoice with no resolved manager. Send now inserts to Supabase FIRST and only marks sent/notifies on success (was silently swallowing insert errors). Manager profile re-pulls invoices on focus (realtime INSERT on `invoices` may not be firing — table likely not in the realtime publication; optional `alter publication supabase_realtime add table public.invoices;`). RLS on invoices confirmed correct (manager SELECT `manager_id = auth.uid()` exists).
- [x] **Verified badge on the artist's OWN profile tab** — blue `verified` icon next to the name, same rule as elsewhere (`has_completed_booking` flag, now mapped into the own-profile fetch, OR loaded completed gigs).
- [x] **Booking-detail keeps the venue name when the venue is gone** — both manager + artist booking-detail venue cards fall back to the booking `venueName` snapshot; manager date/time card also falls back to slot snapshot (cascades away with a hard-deleted venue). Artist side previously showed NO venue card on normal gigs (artist app has no venues in store) — now shows it via snapshot.
- [x] **Removed the artist RATE field from everywhere** — dropped the Minimum Rate input + "visible to managers" note from signup (step 3 is now just Instruments) and artist edit-profile, the rate display card from the artist's own profile, and the manager-only rate card from the manager's artist-profile-view. No longer written to the artists row. `min_rate` DB column + `minRate` type field left in place (unused, harmless) — drop the column later if wanted.

## Session log — June 24 2026 (Google Places venue location + admin fallback photo + city display)

Why a custom picker: the old `react-native-google-places-autocomplete` lib uses the LEGACY Places API, which Google no longer lets NEW Cloud projects enable (frozen Mar 1 2025). Our project is new, so that lib was dead — built on Places API (New) via a server-side proxy instead.

- [x] **places-proxy Edge Function** (deployed via dashboard, NOT in repo — same as the other functions). Proxies Places API (New) autocomplete + details so the API key (`GOOGLE_PLACES_KEY` secret) never ships in the app bundle. UAE-only (`includedRegionCodes: ['ae']`), session tokens, tight field mask. Verify-JWT ON (only signed-in app users can call it). GOTCHA hit during setup: it was first deployed under the wrong name `smooth-task` → app got non-2xx until redeployed as `places-proxy`.
- [x] **lib/places.ts** (new) — `placesAutocomplete` / `placeDetails` (call the proxy via supabase.functions.invoke, JWT auto-attached), `newPlacesSessionToken`, and `cityFromAddress` (scans for the 7 UAE emirates and returns just the emirate for short card display; falls back to the segment before the country).
- [x] **create-venue + edit-venue** — replaced the dead library with a custom Google autocomplete (search box + tappable suggestions, 300ms debounce). create: picking a place is REQUIRED to pass step 1 (no manual free-type — per Tuts). edit: existing location kept untouched unless the address is edited, then a re-pick is required. Stores `{ lat, lng, address, place_id }`; the address SAVED is the short `secondary` line (e.g. "Palm Jumeirah - Dubai"), not Google's full formattedAddress.
- [x] **Storage round-trip fix (real bug)** — there was NO `google_maps_location` column; both loaders (sync.ts syncVenues + store.ts mapVenueRow) read it and always fell back to lat/lng 0,0, so venue coordinates were silently dropped on EVERY reload. Both now build googleMapsLocation from the flat `lat`/`lng`/`address`/`place_id` columns. SQL run: `alter table public.venues add column if not exists place_id text;` and `... add column if not exists admin_photo_url text;`.
- [x] **Open in Google Maps** — was already on booking-detail (both sides); now reads the stored place_id/coords correctly. Confirmed working on device.
- [x] **Admin fallback photo** — `admin_photo_url` column + `adminPhotoUrl` on the Venue type, mapped in both loaders. Shared `venuePhotoUri()` resolver (manager photo → admin photo → icon) applied to venue-detail, my-venues, and network venue cards on BOTH sides (artist network uses its own VenueItem type, so `admin_photo_url` was added there too). Admin sets it directly in Supabase (`admin_photo_url` = a public image URL); only shows when the venue has no manager-uploaded photo. (Built; quick device-check of the fallback still recommended.)
- [x] **City-only address display** — `cityFromAddress` applied to every venue/booking card: manager + artist venue-detail, manager + artist booking-detail, both my-venues, both network. Shows "Dubai" instead of the full street line; works on old long addresses too. Manager My Venues card ALSO had the venue type removed from the subtitle (city only now).

NOTE: the old `react-native-google-places-autocomplete` package + the `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` env var are now unused but left in place (harmless, per "don't clean up unprompted"). `venueTypeLabel` in manager my-venues is now an unused local (harmless).

## Session log — June 24 2026 (evening: transactional email DONE + gig reminders DONE + Android FCM in progress)

### Part 1 — Transactional email (Resend) — DONE + device-tested ✅
Full detail in the "Email + onboarding" section above. Summary: `send-email` Edge Function (Resend, from notifications@nexgigapp.com on verified nexgigapp.com), `lib/send-email.ts` helper, 4 triggers wired (welcome_artist on artist-setup, welcome_manager on manager-register, lineup_added on network.tsx handleAddToRoster [all venues] + handleAccept [one venue + its rules]). Venue rules rendered SERVER-SIDE. Welcome + lineup-with-real-rules emails confirmed landing on device.

### Part 2 — Artist gig reminders (LOCAL notifications) — DONE + device-tested ✅
[DECISION] Local scheduled notifications (not push) — computed on the artist's device from confirmed bookings; works offline, no server. Replaced the OLD two fixed toggles (Same Day 3h / Day Before 24h, which never actually scheduled anything) with multi-select preset CHIPS: 1h / 2h / 3h / 6h / 12h / 1 day (minutes 60/120/180/360/720/1440). Default offsets [180,1440]. Pre-launch, so old UI replaced cleanly (no migration).
- `lib/reminders.ts` (NEW) — engine. `REMINDER_PRESETS`, `getReminderOffsets`/`setReminderOffsets` (AsyncStorage key `nexgig:dj:reminderOffsets`, default [180,1440]), `rescheduleArtistReminders(artistId)`: cancels only OUR previously-scheduled reminders (tagged `data.kind='gig_reminder'`), reads offsets, reads confirmed gigs via `getConfirmedBookingsByDJ`, computes start (from booking `slotDate`+`slotStartTime` snapshots — artist app doesn't load slots) minus offset, skips past times, sorts soonest-first, caps at 60 (iOS ~64 limit), schedules via DATE trigger. No-ops on web.
- `app/(artist)/settings.tsx` — removed the 2 old Switch rows + their state/save/load/reset + the 2 old storage keys; added `reminderOffsets` state + `currentUserId`, a `saveReminderOffset` toggler (persists + reschedules), reset now sets [180,1440]+reschedules; "Gig Reminders" card with 6 multi-select chips (styles chipWrap/chip/chipText).
- `app/(artist)/_layout.tsx` — `fetchBookings().then(() => rescheduleArtistReminders(currentUser.id))` so reschedule runs after bookings load on sign-in/startup.
- Verified on device via a TEMP diagnostic button (since REMOVED): permission granted, offsets [60,1440], confirmed gig "Monkey bar", and correctly "Scheduled now: 1" once the gig start was far enough in the future. Engine correctly SKIPS past-time reminders (a gig <1h away schedules nothing for the 1h offset — not a bug).

### Part 3 — Android FCM push credentials — IN PROGRESS (blocked on a now-resolved org policy; key generation pending propagation)
Goal: Android devices receive server-sent pushes (booking requests etc.) via Expo Push → FCM V1. App code was ALREADY Android-ready (`lib/notifications-push.ts` creates the Android channel + gets/saves token; `create-notification` sends Expo push which routes to both APNs+FCM). The only missing piece is the FCM credential. (This same service-account key is ALSO needed for `eas submit` to Google Play — solving it once unblocks both Android push AND the Play Store upload.)
DONE so far:
- Firebase project **Nexgigapp** (`nexgigapp-b34e6`, project_number 718321313770) — Spark/free plan (FCM works on free; do NOT need Blaze). Registered Android app with package `com.nexgig.app`; downloaded `google-services.json` → moved to repo root `/Users/tuurk/Desktop/Nexgig/Development/Nexgig/google-services.json` (verified `package_name: com.nexgig.app` — matches, no MismatchSenderId risk; SAFE to commit, public identifiers only).
- `app.config.ts` — added `googleServicesFile: "./google-services.json"` in the android block.
- ORG POLICY BLOCKER (resolved): "Generate new private key" in Firebase → Service accounts errored "Key creation is not allowed... restricted by organization policies." IMPORTANT GOTCHA: there are TWO constraints that both block this and are evaluated CONCURRENTLY — the new `iam.managed.disableServiceAccountKeyCreation` AND the legacy `iam.disableServiceAccountKeyCreation` (type "Managed (Legacy)"). On nexgigapp.com the LEGACY one was the active blocker; the managed one was already Inactive. Turning off only one is NOT enough — a Firebase info-banner explicitly notes "setting the managed constraint doesn't unset the legacy... both are evaluated concurrently." BOTH were set to Not enforced (Override parent's policy → Add a rule → Enforcement Off → Set policy) at the ORG level (picker = nexgigapp.com). Tuts has Organization Administrator + Owner but those do NOT include org-policy EDIT rights, so he first granted himself **Organization Policy Administrator** (`roles/orgpolicy.policyAdmin`) at the ORG level (only grantable at org scope, not project). As of ~7:10 PM both constraints show Status: Not enforced; waiting on Google propagation (can take a few min–~1hr) before the Firebase key will generate. The blue "legacy constraint is active" banner on the managed-policy page is STALE/cached — trust each policy's own Status page.
REMAINING (next session / once propagation completes, can take a few min–~1hr):
1. Firebase → Project settings → Service accounts → **Generate new private key** → download the JSON (SECRET — never commit; add to .gitignore).
2. Upload to EAS: `cd ~/Desktop/Nexgig/Development/Nexgig && eas credentials` → Android → development profile → "Google Service Account" → "Manage your Google Service Account Key for Push Notifications (FCM V1)" → "Set up..." → "Upload a new service account key" → point at the downloaded JSON.
3. Re-build the Android dev APK, install on emulator/device, test a real push arrives (manager sends a booking request).
4. **Re-enable BOTH org policies** (set Enforcement back On for the legacy `iam.disableServiceAccountKeyCreation` — and the managed one if you ever turned it on) once the key is downloaded — the downloaded key keeps working; this restores the org security baseline. The 80%-active managed-constraints baseline on nexgigapp.com is deliberate.
5. For Google Play later: the production build uses Google Play App Signing with a DIFFERENT SHA-1 — add it to the same Nexgig Android OAuth client at submission; the same service-account key can be reused for `eas submit`.

### Commit checklist (this session) — Tuts to run
Changed files: `supabase/functions/send-email/index.ts` (new), `lib/send-email.ts` (new), `lib/reminders.ts` (new), `app/(auth)/artist-setup.tsx`, `app/(auth)/manager-register.tsx`, `app/(manager)/(tabs)/network.tsx`, `app/(artist)/settings.tsx`, `app/(artist)/_layout.tsx`, `app.config.ts`, `google-services.json` (new — safe to commit), `todo.md`. Run `pnpm check` first (settings.tsx had many coordinated edits). Also still-pending from earlier today: the separate auth-edge-cases commit (`app/(auth)/sign-in.tsx` + todo).
