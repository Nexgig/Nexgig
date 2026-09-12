-- ============================================================================
-- SYNC users.full_name + users.phone FROM the role profile (artists / managers).
--
-- The app DISPLAYS name/phone from the managers/artists row, but kept separate
-- `users.full_name` / `users.phone` copies that Edit Profile didn't always update
-- — so they could stay frozen at the signup values (e.g. name "Alexy") while the
-- real ones changed. (The app code is now fixed to write both; this backfills
-- existing rows.)
--
-- Picks from the person's ACTIVE role (account_type), falling back to whichever
-- role row exists. Non-destructive: only touches rows that differ, and never
-- blanks a value (keeps the current one if no role value is found).
--
-- Run STEP 1 (read-only) to see who changes, then STEP 2 to apply.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1 — PREVIEW (read-only): whose users name/phone is out of date.
-- ────────────────────────────────────────────────────────────────────────────
with real as (
  select
    u.id, u.email, u.account_type,
    u.full_name as users_name_now,
    u.phone     as users_phone_now,
    coalesce(nullif(trim(case when u.account_type = 'manager' then m.full_name else a.full_name end), ''),
             nullif(trim(m.full_name), ''), nullif(trim(a.full_name), '')) as real_name,
    coalesce(nullif(trim(case when u.account_type = 'manager' then m.phone else a.phone end), ''),
             nullif(trim(m.phone), ''), nullif(trim(a.phone), '')) as real_phone
  from public.users u
  left join public.managers m on m.id = u.id
  left join public.artists  a on a.id = u.id
)
select email, account_type, users_name_now, real_name, users_phone_now, real_phone
from real
where (real_name  is not null and users_name_now  is distinct from real_name)
   or (real_phone is not null and users_phone_now is distinct from real_phone)
order by email;


-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2 — APPLY: set users.full_name + users.phone to the real (role) values.
-- ────────────────────────────────────────────────────────────────────────────
with real as (
  select
    u.id,
    coalesce(nullif(trim(case when u.account_type = 'manager' then m.full_name else a.full_name end), ''),
             nullif(trim(m.full_name), ''), nullif(trim(a.full_name), '')) as name,
    coalesce(nullif(trim(case when u.account_type = 'manager' then m.phone else a.phone end), ''),
             nullif(trim(m.phone), ''), nullif(trim(a.phone), '')) as phone
  from public.users u
  left join public.managers m on m.id = u.id
  left join public.artists  a on a.id = u.id
)
update public.users u
set full_name = coalesce(real.name, u.full_name),
    phone     = coalesce(real.phone, u.phone)
from real
where real.id = u.id
  and (u.full_name is distinct from coalesce(real.name, u.full_name)
       or u.phone   is distinct from coalesce(real.phone, u.phone));
