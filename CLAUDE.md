# Nexgig

React Native / Expo (SDK 54, New Architecture / Fabric) gig-booking app for UAE nightlife:
venue **managers** book **artists** (DJs / live performers). Supabase backend. iPhone only
(`supportsTablet: false`). Ships OTA via `eas update`.

Two route groups mirror the two sides: `app/(manager)/…` and `app/(artist)/…`.

## Working agreement

- **You run `git` and `eas` yourself — but ASK FIRST, every time.** (Changed 17 Jul 2026; it
  used to be "hand Tuts the command to paste".) State exactly what you're about to run and why,
  wait for a yes, then run it. Ask per action, not once per session — a yes to `git push` is not
  a yes to `eas update`. **`eas update` reaches real users' phones within minutes and there is
  no review gate**, so it always gets its own explicit confirmation, never bundled into "and
  then I'll ship it".
  - Read-only checks (`git log`, `git status`, `eas update:list`) need no permission — just run
    them. **Prefer them to asking**: never claim something is committed/shipped when you could
    have checked in one command. That mistake was made repeatedly on 17 Jul.
  - You CANNOT see Tuts's terminal — only your own shell, the filesystem, and git. If he runs
    something himself, you learn the result from git, from `eas update:list`, or from him
    saying so. **Never infer it from silence.**
- **SQL specifically — Supabase dashboard is READ-ONLY for you.** Hand Tuts the query; he runs
  it and says "Done"; you then *read* the result from the browser and interpret it. Never type
  into, execute in, or navigate around the SQL editor — it's the production database. Reading
  the rendered result is the whole job. Give him **one self-contained statement at a time**:
  the editor shows a single result set, so a multi-statement paste hides the answer you need.
- **ALWAYS paste the SQL in full in the chat, in a ```sql block, ready to copy.** Never say
  "it's in `supabase/foo.sql`" or "the STEP 1 block" and expect him to go find it — he can't see
  the file from where he's reading, and it's the single thing he needs. The .sql file is the
  record; the chat is the delivery. Same for any command he has to run.
- **Never handle passwords/credentials.** Demo-account passwords are not in the repo by design.
  The Sentry DSN and Supabase anon key are NOT secret (they ship in the app); the Sentry
  **auth token** IS (EAS secret).
- `todo.md` → the **OPEN WORK** block at the top is the authoritative "what's left". Read it
  first when asked. Done work is deleted from it, not archived.

## Commands

```bash
npx tsc --noEmit                                  # typecheck — run before every ship
eas update --branch production --message "..."    # JS-only changes → OTA, no rebuild
eas build --platform ios --profile production     # native changes only (see below)
eas submit --platform ios --profile production
```

**OTA vs native rebuild** — get this wrong and you ship nothing:
- **OTA (`eas update`)**: any `.ts`/`.tsx`, styles, images/assets, copy. Most work.
- **Native rebuild (`eas build`)**: new npm packages with native code, `app.config.ts` native
  changes, permissions, icons/splash, config plugins. **An OTA can never add a native module.**
  If a native SDK isn't in the installed binary, its JS calls silently no-op.

## Hard-won traps — read before touching these areas

**Fonts.** `lib/fonts.ts` `familyForWeight()` maps 800/900 → **ClashDisplay-Semibold**, 700 →
GeneralSans-Bold, 600 → GeneralSans-Semibold. So `fontWeight: '800'` **silently renders Clash
Display** (display font) instead of a bold body font. This has bitten us more than once.

**`lib/rn`** re-exports React Native but swaps `Text` for `app-text`. Import RN primitives from
`@/lib/rn`, not `react-native`. (`TextInput` and `Animated` are raw RN.)

**`.env` never reaches the EAS build server.** It's gitignored; builds do a clean git clone. Any
var the *build* needs (incl. `EXPO_PUBLIC_*`, which are inlined at build time) must live in
`eas.json` → `build.production.env`. Only true secrets go in EAS secrets. Symptom of getting
this wrong: build fails at source-map upload, or the app builds but the SDK never initialises.

**Realtime echo loop.** A realtime handler that writes back to the DB creates an infinite
realtime→write→realtime loop (symptom: a row visibly flickering between two statuses several
times a second). **Any handler applying a change that came FROM the DB must use
`updateBookingStatusLocal` (local-only), never `updateBookingStatus`** (which also writes).

**Private events live in `availability_blocks`, NOT `bookings`.** They're stored as
`block_type='private_event'` rows but *rendered* as artist-created bookings (the named green
card). Every code path that loads the artist calendar must reconstruct them via
`fetchPrivateEventBookings()` (`lib/private-events.ts` — the single source of truth), or they
silently vanish. Current call sites: artist `_layout` cold start + the pull-to-refresh in artist
`dashboard`, `calendar`, and `profile`. **If you add another loader, call the helper.**

**`clearBookings()` wipes private events too.** Anything that calls it must rebuild them (see
above). When fixing a "X gets wiped by Y" bug, **grep for every caller of Y** — don't assume the
screen you found it on is the only one. That exact assumption caused a repeat of this bug.

**`addBooking` is an upsert**, not an append: it dedupes by `id` and refuses to overwrite a
newer record with a staler one (compares `updatedAt`). Duplicate bookings with the same id
produce duplicate list keys → a stale-vs-fresh render flicker.

**Timestamps are UTC in Supabase**; Dubai is UTC+4. Cross-timezone bugs hide here.

**Gigs cross midnight — `isPastStart` ≠ "finished".** Defaults are 20:00–00:00 (`add-slot`)
and 21:00–01:00 (manager calendar), so `endTime < startTime` (the gig ends the *next day*)
is the **common case, not an edge case**. Completion runs off **`isPastEnd(date, start, end)`**
(`lib/utils.ts`), which rolls the date forward for the overnight wrap; `isPastStart` is for
*upcoming/filtering only*. Never compute an end as `` `${date}T${endTime}` `` — a 22:00–03:00
gig then "ends" 19h before it starts and completes the instant it's created.

**One rule, four places — change one, change all four.** `slotEndDateTimeStr` (`lib/utils.ts`)
is the source of truth: roll on `end < start`, **strictly** (a zero-length slot ends instantly;
`timesOverlap` depends on that to treat it as covering no time). The four:
1. the two dashboard sweeps (`app/(manager|artist)/(tabs)/dashboard.tsx`);
2. the private-event pair — `lib/private-events.ts` + `add-block.tsx` *write* `isCompleted`,
   while the artist calendar's `getBookingStatusColor`/`getBookingStatusLabel` *re-derive* it at
   render; drift and a private event stores one thing but displays another;
3. `timesOverlap` (`lib/conflict-detection.ts`), which resolves both ranges to real datetimes so
   overnight sets clash across days — it must never re-add a same-date guard;
4. `supabase/complete-past-bookings.sql` — the hourly pg_cron backstop (jobid 1, **live**),
   mirroring the rule in SQL as `et < st`. It's deployed: changing the JS without re-running that
   function's `create or replace` puts the phones and the DB out of step, silently.

**An OTA does not reach a phone just because you published it.** `expo-updates` checks only
on a **cold start**, and applies what it downloads on the **next** one — so stock behaviour is
*two full quits* before a user sees a change. Backgrounding is not quitting; iOS suspends the
app and no check happens, so someone who never swipes it away can sit on an old bundle
indefinitely. `lib/silent-update.ts` closes that: on foreground after 5 min away it checks,
downloads and reloads, behind an `UpdatingOverlay` (a bare reload resets to the dashboard
mid-navigation and reads as a crash). It reloads on `isUpdatePending` FIRST — a cold start may
have already downloaded the update, in which case asking the server "anything newer?" answers
no. **A change to this file can't speed up its own delivery** — it ships in the new bundle, so
the old two-cold-start path delivers it once more. The settings footers (both sides) show the
running update id; that's how you tell what a tester is actually on.

**A manager's PAST BOOKING REQUEST is stored as `status: 'requested'`, not
`'past_confirmation'`.** Both creation paths (`assign-artist.tsx`, `add-slot.tsx`) insert
`requested`; only the *notification* is typed `past_confirmation_request`. So "a request whose
gig has already ended" describes **two opposite things**: a dead request nobody answered, and a
brand-new past request the artist still has to confirm. Telling them apart is
`isExpiredRequest` (`lib/utils.ts`), which compares **`createdAt` against the gig's end** —
made *before* the end = stale/expired, made *after* = deliberate. Expiring on "the gig ended"
alone kills every past request the instant it's created. `past_confirmation` itself never
expires.

**`MaterialIcons` are font glyphs** — `size` sets font size, not advance width, so different
glyphs have different widths. Pin them to a fixed-width box to align rows.

## Conventions

- **Theme**: `useColors()` + tokens — primary `#E2674A` (coral), surface `#F6F2EC`, muted
  `#8E8E93`, success `#22C55E`, warning `#D4A017`, error `#EF4444`. Don't hardcode hex.
- **Status colours** (booking lists): pending gold `#D4A017`, confirmed green `#22C55E`,
  completed blue `#2563EB`. Shared `DateBadge` (`components/ui/date-badge.tsx`) renders the
  status-coloured WED/15 tile used by the dashboards + artist-bookings.
- **State**: Zustand stores in `lib/store.ts`, persisted. Errors/telemetry go through
  `lib/observability.ts` (`reportError` for thrown/caught errors, `reportWarning` for
  "this shouldn't happen" silent-failure tripwires) — never import Sentry directly.
- **Supabase RLS** is permissive on bookings (`auth.uid() = artist_id` / `= manager_id`, no
  status restriction). Writes that touch 0 rows fail silently — `syncBookingStatus` reports
  those to Sentry.
- Legal pages are served from a **separate `Nexgig/legal` GitHub repo**. The `legal/` folder in
  this repo is a stale copy — editing it does nothing to the live site.
- **`all-bookings.tsx` (both sides) is DEAD — nothing opens it.** Verified 17 Jul 2026: the only
  references are the `<Stack.Screen name="all-bookings" />` registrations in the two `_layout`s.
  No `router.push`, no link, no push deep-link. The dashboard stat tiles go to
  `confirmed-bookings` / `pending-requests` / `completed-gigs` instead. **Kept on purpose, so
  don't delete it — but don't restyle it either**, and don't treat it as drift when it doesn't
  match the other lists (it still has venue images / avatars / `statusMark` dots that were
  removed everywhere else). If you wire it back up, it needs the `DateBadge` pass first.

## Before shipping

1. `npx tsc --noEmit` → must exit 0.
2. Decide OTA vs native rebuild (above).
3. Hand Tuts the git + eas commands.
