# Nexgig — App Store Listing

Rewritten 14 July 2026. Everything below has been checked against what the app
actually does as of this date. The previous draft (25 June) declared photo uploads
and listed "hotels" as a venue type — both false now, and the photo claim would have
made the App Privacy questionnaire a false declaration. Do not resurrect it.

B2B nightlife booking platform (UAE) connecting venue managers with artists
(DJs / live performers). iPhone only — `supportsTablet: false`.

---

## App Name (30 char max)
Nexgig

## Subtitle (30 char max)
**Book artists. Run your venue.** (28)

Alternatives if it reads oddly next to the icon: "Nightlife booking, sorted." (26),
"Venue & artist bookings" (21).

---

## Promotional Text (170 char max — editable anytime, no review)
The fastest way for venues and artists to book gigs. Manage lineups, confirm bookings, send invoices, and keep every detail in one place — no more endless WhatsApp threads.

---

## Description (4000 char max)

Nexgig is the booking platform built for nightlife. It connects venue managers with the DJs and performers who bring their nights to life — replacing scattered WhatsApp chats and spreadsheets with one clean, reliable workflow.

FOR VENUE MANAGERS
- Build and manage your lineup across all your venues — beach clubs, dance clubs, lounges, cocktail bars, rooftops, and live music venues.
- Send booking requests with the date, time, and details, and get instant confirmations.
- Discover artists, view their profiles, and add them to your roster.
- Review join requests from artists who want to play your venues — accept or decline in a tap.
- Keep every venue's details, location, and house rules in one place.
- Receive invoices from artists and track them right from your profile.

FOR ARTISTS
- Create your profile and get discovered by venues across the UAE.
- Receive booking requests and confirm or decline instantly.
- Set your availability so managers know when you can play.
- Get reminders before every gig so you never miss a set.
- Send professional invoices in seconds — and get a monthly nudge so you never forget to bill.
- Keep your whole schedule organized in one calendar.

WHY NEXGIG
- Built for the UAE nightlife scene.
- Real-time updates — confirmations, changes, and reminders the moment they happen.
- Venue locations powered by Google Maps.
- Sign in with Apple or Google.
- Designed to be fast, simple, and reliable on the night.

Whether you run one lounge or a portfolio of venues, or you're an artist building your calendar, Nexgig keeps your bookings moving.

---

## Keywords (100 char max, comma-separated, no spaces)
```
dj,booking,nightlife,venue,gigs,artist,events,club,lineup,performer,music,nightclub,bookings,uae
```
(99 chars.)

---

## URLs
- **Support URL:** https://nexgigapp.com
- **Marketing URL:** https://nexgigapp.com
- **Privacy Policy URL (REQUIRED):** https://www.nexgigapp.com/legal/privacy-policy.html
- **Terms of Service:** https://www.nexgigapp.com/legal/terms-of-service.html

Both legal pages are served by GitHub Pages from the **`Nexgig/legal`** repo — NOT
from the app repo. The app repo also carries a `legal/` folder; it is a stale copy and
will drift. Edit `Nexgig/legal`, or delete the app repo's copy.

Both were updated 14 July 2026 and are live. Both are wired into in-app
Settings → About (manager + artist).

---

## Category
- **Primary:** Business
- **Secondary:** Music

---

## Age Rating
Answer every content question "None." The app has no objectionable content — it's a
scheduling and invoicing tool. Nightlife is the *context*, not the content: there is no
alcohol imagery, no gambling, no mature themes in the app itself.

Expect a 4+ rating. If the questionnaire asks about "Alcohol, Tobacco, or Drug Use or
References", the honest answer is None — the app never references them. Venue names are
user-entered.

---

## App Privacy questionnaire

**Verified against the code on 14 July 2026.** The app collects:

Data **linked to the user**:
- **Contact Info:** email address, phone number, name (stage name + legal name).
- **User Content:** bio, reviews, venue names/descriptions. *(No photos — see below.)*
- **Identifiers:** user ID.
- **Other Data:** location as a self-declared country/city (a text field), nationality,
  genres, instruments, social links.

Used for: **App Functionality** only. NOT used for tracking. NOT used for advertising.
NOT linked to third-party data.

**Things that are easy to answer wrong:**

- **Photos or Videos → NO.** The app has no photo upload. `expo-image-picker` is not a
  dependency. `NSPhotoLibraryUsageDescription` and `NSCameraUsageDescription` are not in
  the Info.plist. People pick from a set of bundled avatars; venue images are bundled
  assets chosen by venue type. No image ever leaves the device.
- **Precise Location → NO.** There is no device-location permission and no background
  location. Venue addresses are typed in by managers via Google Places. That is *content
  about a venue*, not the user's location.
- **Sensitive Info → NO.** Gender is not collected (a legacy DB column exists but nothing
  writes to it).
- **Purchases / Financial Info → NO.** Invoices record an amount; the app processes no
  payments.
- **Diagnostics / Usage Data → NO**, unless you add analytics before submitting.

Also declared: a **push notification token**, used to deliver booking alerts.

The privacy policy at the URL above states exactly this. Keep the two in sync — a
reviewer comparing them is the single most likely way to get flagged.

---

## Demo accounts (App Review Information)

Password for all: `NexgigDemo2026`

| Role | Email | Name |
|---|---|---|
| Manager | review.manager@nexgigapp.com | Omar Haddad — Marina Hospitality Group |
| Artist | review.artist@nexgigapp.com | Layla Rae (Layla Rahman), House |
| Artist (extra) | sam.reyes@nexgigapp.com | Sam Reyes, Tech House |
| Artist (extra) | nadia.k@nexgigapp.com | Nadia K, R&B / Soul |

Venues on the manager account: **Azure Beach Club** (Beach Club, cap. 800) and
**Neon Room** (Dance Club, cap. 400).

These must exist with real seeded data — venues, sets, at least one confirmed booking,
one completed booking, one invoice. A reviewer who lands in an empty app cannot exercise
the features, and will reject it.

### Reviewer notes (paste into App Review Information → Notes)

> Nexgig is a B2B booking platform connecting nightlife venue managers with artists (DJs and live performers) in the UAE.
>
> The app is two-sided, so please use BOTH demo accounts to see the full flow:
>
> MANAGER — review.manager@nexgigapp.com / NexgigDemo2026
> The manager has two venues with sets on the calendar. From a venue you can add a set, assign an artist from the lineup, and send a booking request. Invoices received from artists appear in the profile tab.
>
> ARTIST — review.artist@nexgigapp.com / NexgigDemo2026
> The artist receives booking requests and can confirm or decline them, set availability, and send an invoice for a completed gig.
>
> Sign in with Apple and Sign in with Google are also supported, but the email/password accounts above cover the entire feature set.
>
> The app sends booking-related push notifications. It does not process payments — invoices are records only, and any payment happens directly between the manager and the artist, outside the app.
>
> Contact: admin@nexgigapp.com

---

## Screenshots

**Required: 6.9" iPhone display.** Accepted sizes are **1290 × 2796** or **1320 × 2868**.
3–10 shots. Everything else (6.5", iPad) is auto-scaled from this set, so this is the
only set needed.

Note: an iPhone 16 Pro shoots at 1206 × 2622, which is **not** an accepted size. Shots
taken on it must be resized to 1290 × 2796 before upload. The aspect ratios differ by
0.3% — the resize is visually undetectable, and Apple only validates pixel dimensions.

Shot list (the first 3 appear in search results, so they carry the most weight):

1. Manager — Dashboard, upcoming bookings
2. Manager — Venue profile (the banner image sells it)
3. Manager — Booking detail
4. Manager — Calendar, month view
5. Artist — Dashboard, upcoming gigs
6. Artist — Booking detail / confirm
7. Artist — Invoice send
8. Network — discover artists

Rules: light mode throughout (a mixed set looks accidental), realistic seeded data, a
spread of statuses visible, nothing half-empty, no test junk.

---

## Pre-submit checklist

- [ ] Privacy Policy URL live and reachable → **confirmed 14 July 2026**
- [ ] Terms URL live → **confirmed 14 July 2026**
- [ ] Demo accounts created and seeded
- [ ] Screenshots uploaded at 1290 × 2796
- [ ] App Privacy questionnaire — photos NO, location NO, tracking NO
- [ ] Age rating — all None
- [ ] Reviewer notes pasted
- [ ] Export compliance — handled in `app.config.ts`
      (`ITSAppUsesNonExemptEncryption: false`), so no prompt should appear
- [ ] **EU trader status** — declare it, or the app is excluded from the EU. A UAE-focused
      launch can skip this initially, but decide it deliberately rather than by accident.

---

## Do not break the OTA

`version` is `1.0.0` and `runtimeVersion` is `{ policy: "appVersion" }`. The submitted
binary pulls its JS from the `production` EAS channel. **App Review runs the binary, and
it will fetch whatever is sitting on that channel.** Do not push experimental updates to
`production` while the app is in review — use a different branch.
