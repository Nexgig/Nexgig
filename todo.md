# Project TODO

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
- [ ] Manager artist-profile view: add header fields (gender, experience, energy, member since), 2 stat cards, Played In, Sub-Vibe, Links sections, fix Gig History, correct section order
- [ ] Artist own profile: same changes as manager artist-profile view
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
- [ ] Fix Responded tab: only show bookings artist actively responded to from Requests tab (not all completed gigs); add artistRespondedFromRequests flag
- [x] Fix Responded tab: only show bookings artist actively responded to from Requests tab (not all completed gigs); add artistRespondedFromRequests flag
- [x] Fix artist notifications screen infinite render loop (unstable Zustand selector + timeAgo component)
- [ ] Remove all addNotification calls and mock notification data; keep store/screen/types/bell icon intact
- [x] Remove all addNotification calls and mock notification data; keep store/screen/types/bell icon intact
- [x] Fix: artist-cancelled bookings should not appear in New tab; only manager-cancelled should (add cancelledByArtist flag)
- [x] Add 8 in-app notification triggers for artists (new request, cancelled, slot deleted, past confirmation, lineup add/remove, venue assign/remove)
- [ ] Create artist venues screen showing assigned venues with venue profile view
- [ ] Notification deep-link: booking notifications → booking detail with back → notifications; venue/lineup → artist venues screen
- [x] Rename all roster references to lineup (Global Lineup = artists connected to manager, Lineup = artists assigned to venue)
- [ ] Add notification: New Gig Request (when manager sends booking request)
- [ ] Add notification: Gig Cancelled by Manager (confirmed booking cancelled)
- [ ] Add notification: Request Cancelled (slot with pending request deleted)
- [ ] Add notification: Past Gig Confirmation Request (past gig needs artist confirm)
- [ ] Add notification: Added to Lineup (manager adds artist to global lineup)
- [ ] Add notification: Removed from Lineup (manager removes artist from global lineup)
- [ ] Add notification: Assigned to Venue (manager assigns artist to venue)
- [ ] Add notification: Removed from Venue (manager removes artist from venue)
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
- [ ] Rename app to Nexgig (app.config.ts appName)
- [ ] Generate new Nexgig app icon (X with arrows on right side only) and replace all icon files
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
- [ ] Add KeyboardAvoidingView to Add/Block slot modal so lower fields aren't covered by keyboard
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

- [ ] Verify splash-icon.png is the Nexgig logo and not the old Gigster logo
- [ ] Ensure app.config.ts splash screen config points to correct asset

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
- [ ] Rename `app/(manager)/(tabs)/explore.tsx` → `network.tsx` so the filename matches the "Network" tab (changes route path /explore→/network; must update all router.push references + dashboard/profile/artists links)

## B. Bugs & correctness

- [ ] Fix `Slot` type in types.ts — add managerId, status, updatedAt (sync.ts already uses them → type error). Run `pnpm check`.
- [ ] Consolidate venue/slot/booking persistence INTO the store actions so Supabase writes can't be forgotten (currently split between store + screens → silent local/server drift)
- [ ] Make `updateBookingStatus` store action sync to Supabase (today it only mutates local state; relies on manual syncBookingStatus calls)
- [x] Dedupe notifications: removed legacy fetchInvites synthesizer in artist _layout (was creating a 2nd notification per invite alongside the real one)
- [ ] Strip console.log from production paths (booking-sync.ts, store.ts; use-auth.ts before deletion)
- [ ] Fix false self-conflict when assigning an artist to a past slot (open item from prior session)
- [ ] Private events are written to BOTH the bookings table (isArtistCreated) and the availability_blocks table (block_type='private_event') — redundant; display reads from bookings only. Consider dropping the availability_blocks write. (availability.tsx ~line 221, 623)

## C. Store launch blockers (HARD requirements for App Store + Google Play)

- [x] Build in-app Delete Account in artist + manager settings — built `delete-account` Edge Function (option-2 anonymize: private data deleted, shared history anonymized, manager venues deactivated), "type DELETE to confirm" modal wired into both settings screens; deployed + tested (manager delete verified)
- [ ] Add Privacy Policy + Terms screens/links in settings — REQUIRED by both stores (need a hosted policy URL)
- [ ] Decide on expo-audio (microphone) + expo-video plugins — remove plugins+packages if unused (mic permission with no feature = rejection risk); else be ready to justify
- [ ] Add iOS permission strings for expo-image-picker (NSPhotoLibraryUsageDescription / camera) in app.config.ts
- [ ] Verify splash + app icon are Nexgig (not old Gigster) in app.config.ts and assets
- [ ] Prepare reviewer demo accounts (manager + artist) + review notes — onboarding is invite-only
- [ ] Complete App Store privacy nutrition labels / Google Data Safety form (collects email, name, photos)

## D. Push notifications

- [x] Set up EAS Build (eas.json + EAS project id `eae9c0e4-...`) — simulator dev build + device dev build both succeeded
- [x] Add expo-notifications to app.config.ts plugins (notification color set; also added expo-font + expo-web-browser plugins)
- [x] iOS push credentials (APNs key) via EAS — created + assigned during device build, Push Notifications capability enabled on com.nexgig.app
- [ ] Android push credentials (FCM) via EAS — not done yet (iOS only so far)
- [x] Register device push tokens on sign-in and store per user in Supabase — `lib/notifications-push.ts` registers + saves to new `users.push_token` column; called from app/_layout on sign-in
- [x] Send push on key events — `create-notification` Edge Function now sends Expo push to the recipient's push_token (best-effort); tested working on a physical iPhone
- [ ] Wire same-day / day-before gig reminders (artist settings toggles exist; need real scheduling on a dev/EAS build)
- [ ] Push-tap deep-link: route by notification type/related_id (currently always opens notifications list) — tie in with the "Booking not found" fix below

## E. Sign in with Apple + Google

- [ ] Add Google sign-in via Supabase OAuth (oauth/callback.tsx + constants/oauth.ts are scaffolded — wire them up)
- [ ] Add Sign in with Apple — REQUIRED by Apple once Google/social login is offered
- [ ] Add Apple + Google buttons to welcome.tsx and sign-in.tsx
- [ ] On first OAuth sign-in, route new users through account-type selection and create the managers/artists/users rows
- [ ] Configure redirect scheme + enable Apple & Google providers in the Supabase dashboard

## F. Testing

- [x] Add smoke test `__tests__/smoke.test.ts` — stores, venue/slot/booking/draft/lineup reducers, slot-delete cascade, conflict detection (incl. overnight wrap + self-slot skip), time utils, resetAllStores
- [x] Run `pnpm check` (TypeScript) — clean (0 errors)
- [x] Run `pnpm test` — 25 passing (smoke + existing suite)
- [ ] Run `pnpm lint`

## G. Security to verify

- [x] `.env` — confirmed contains only public Supabase keys (anon + url); now gitignored + untracked, no rotation needed
- [~] Confirm Supabase RLS enabled with correct policies on all tables — `notifications` locked down (own-row read/update/delete; inserts only via service-role create-notification function). STILL TODO: verify the other 13 tables have sensible policies before launch

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

## Open bugs (June 2026) — tackle next

- [ ] "Booking not found" when tapping a booking notification — booking-detail only reads the local Zustand store; if the booking isn't loaded it shows the error. User confirmed it appears after going into the app, scrolling down, and pull-to-refresh (which triggers a Supabase fetch). FIX: fetch the booking from Supabase by id when missing locally (show loading), instead of "not found". Also fix push-tap routing (D bucket) to open the right screen by notification type.
- [ ] Artist DECLINES a booking — notification behaves wrong (diagnose: is the manager notified correctly? stale artist notification?)
- [ ] Artist DISMISSES a cancelled booking — notification behaves wrong (diagnose)
- [ ] Remove dead invite code: handleAcceptInvite / handleDeclineInvite still in app/(artist)/notifications.tsx (leftover from retired email-invite flow)
