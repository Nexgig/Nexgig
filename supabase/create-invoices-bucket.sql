-- ============================================================================
-- Public Storage bucket for artist-UPLOADED invoices (the "upload my own
-- invoice" feature — a photo of their invoice on the current app version, a PDF
-- on the later native build; the bucket takes either). Mirrors how venue-photos
-- / profile-photos are served: public read (so getPublicUrl works for the
-- manager), authenticated write.
--
-- Run this once in the Supabase SQL editor. (Alternatively: Storage → New bucket
-- → name "invoices", tick Public — then add the two write policies below.)
-- ============================================================================

-- 1) The bucket (public read).
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do update set public = true;

-- 2) Anyone can READ (matches getPublicUrl serving, same as the photo buckets).
drop policy if exists "invoices public read" on storage.objects;
create policy "invoices public read"
  on storage.objects for select
  using ( bucket_id = 'invoices' );

-- 3) Any signed-in user can UPLOAD.
drop policy if exists "invoices authenticated insert" on storage.objects;
create policy "invoices authenticated insert"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'invoices' );

-- 4) Needed because the upload uses upsert (a re-upload is an update).
drop policy if exists "invoices authenticated update" on storage.objects;
create policy "invoices authenticated update"
  on storage.objects for update to authenticated
  using ( bucket_id = 'invoices' )
  with check ( bucket_id = 'invoices' );
