-- ═══════════════════════════════════════════════════════════════════════════
-- reviews — an artist's post-gig review, readable by that gig's manager.
--
-- WHY: reviews used to live only in the artist's local AsyncStorage store, so a review
-- never left the phone that wrote it. The manager received the `review_submitted`
-- notification, tapped through to booking-detail, and saw "No review yet" — because their
-- device had no copy and no way to get one. This table is the record; `useReviewStore` is
-- now a cache of it (see lib/reviews.ts, the single source of truth for the round trip).
--
-- One review per booking (`booking_id` is unique) and immutable once written: there is
-- deliberately NO update or delete policy, matching the copy the artist agrees to —
-- "this can't be changed later".
--
-- Two artists on one slot each have their OWN booking row, so each writes their own
-- review. The manager sees the review for whichever artist's booking they're viewing.
--
-- STATUS: deployed 18 Jul 2026.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null unique references public.bookings(id) on delete cascade,
  artist_id   uuid not null,
  manager_id  uuid not null,
  rating      int  not null check (rating between 1 and 5),
  text        text,
  created_at  timestamptz not null default now()
);

-- The manager's read path is "every review on my gigs" (booking-detail + completed-gigs
-- both fetch the whole visible set), so manager_id is the column worth indexing.
create index if not exists reviews_manager_id_idx on public.reviews (manager_id);

alter table public.reviews enable row level security;

drop policy if exists "artist inserts own review"   on public.reviews;
drop policy if exists "artist reads own review"     on public.reviews;
drop policy if exists "manager reads gig review"    on public.reviews;

create policy "artist inserts own review" on public.reviews
  for insert with check (auth.uid() = artist_id);

create policy "artist reads own review" on public.reviews
  for select using (auth.uid() = artist_id);

create policy "manager reads gig review" on public.reviews
  for select using (auth.uid() = manager_id);
