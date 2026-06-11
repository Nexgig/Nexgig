import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 1. Identify the caller from their auth token (never trust an id from the body).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid or expired session' }, 401);

    const userId = user.id;

    // 2. Admin client (service role) — can read/write any row and delete the auth user.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Determine role BEFORE deleting the users row (managers need venue deactivation).
    const { data: userRow } = await admin
      .from('users')
      .select('account_type')
      .eq('id', userId)
      .maybeSingle();
    const accountType: string | null = userRow?.account_type ?? null;

    const errors: string[] = [];
    const run = async (label: string, op: Promise<{ error: unknown }>) => {
      const { error } = await op;
      if (error) errors.push(`${label}: ${(error as { message?: string }).message ?? String(error)}`);
    };

    // 4a-pre. Cancel the departing user's pending AND confirmed bookings so they
    //         drop off the other party's active/upcoming lists (as if the booking
    //         had been cancelled). Completed bookings are left intact as history.
    const nowIso = new Date().toISOString();
    await run('bookings.cancel_active_as_artist', admin.from('bookings')
      .update({ status: 'cancelled', cancelled_at: nowIso })
      .eq('artist_id', userId)
      .in('status', ['requested', 'past_confirmation', 'confirmed']));
    await run('bookings.cancel_active_as_manager', admin.from('bookings')
      .update({ status: 'cancelled', cancelled_at: nowIso })
      .eq('manager_id', userId)
      .in('status', ['requested', 'past_confirmation', 'confirmed']));

    // 4a. ANONYMIZE shared history (keep the row, strip the departing person's name).
    //     Bookings, global_lineup, venue_assignments carry both manager_name & artist_name.
    await run('bookings.artist_name', admin.from('bookings').update({ artist_name: 'Former Artist' }).eq('artist_id', userId));
    await run('bookings.manager_name', admin.from('bookings').update({ manager_name: 'Former Manager' }).eq('manager_id', userId));
    await run('global_lineup.artist_name', admin.from('global_lineup').update({ artist_name: 'Former Artist' }).eq('artist_id', userId));
    await run('global_lineup.manager_name', admin.from('global_lineup').update({ manager_name: 'Former Manager' }).eq('manager_id', userId));
    await run('venue_assignments.artist_name', admin.from('venue_assignments').update({ artist_name: 'Former Artist' }).eq('artist_id', userId));
    await run('venue_assignments.manager_name', admin.from('venue_assignments').update({ manager_name: 'Former Manager' }).eq('manager_id', userId));

    // 4b. MANAGER ONLY: deactivate venues (keep record so history still resolves the name),
    //     anonymize the manager name on them. Slots are left intact (belong to the venue).
    if (accountType === 'manager') {
      await run('venues.deactivate', admin.from('venues').update({ is_deactivated: true, manager_name: 'Former Manager' }).eq('manager_id', userId));
    }

    // 4b-storage. Delete the departing user's uploaded photos from Storage so no
    //   orphaned image files are left behind (privacy + storage cleanup).
    //   Photo paths are timestamped (e.g. `avatar-<userId>-<ts>.jpg`), so a user
    //   may have several old files — we LIST everything with their prefix and
    //   remove all matches. Storage failures are recorded but NOT fatal: they
    //   must never block the actual account deletion.
    const storageWarnings: string[] = [];
    const removeByPrefix = async (bucket: string, prefix: string) => {
      try {
        const { data: files, error: listErr } = await admin.storage.from(bucket).list('', {
          limit: 1000,
          search: prefix,
        });
        if (listErr) { storageWarnings.push(`${bucket}.list(${prefix}): ${listErr.message}`); return; }
        const paths = (files ?? [])
          .map((f) => f.name)
          .filter((name) => name.startsWith(prefix));
        if (paths.length === 0) return;
        const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
        if (rmErr) storageWarnings.push(`${bucket}.remove: ${rmErr.message}`);
      } catch (e) {
        storageWarnings.push(`${bucket}(${prefix}): ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    // Everyone may have an avatar: `avatar-<userId>-...`
    await removeByPrefix('avatars', `avatar-${userId}`);

    // Managers may have venue photos: `venue-<venueId>-...` for each of their venues.
    if (accountType === 'manager') {
      const { data: managerVenues } = await admin.from('venues').select('id').eq('manager_id', userId);
      for (const v of managerVenues ?? []) {
        await removeByPrefix('venue-photos', `venue-${v.id}`);
      }
    }

    // 4c. DELETE the user's personal / private data outright.
    //     NOTE: invoices are intentionally NOT deleted here — they are kept as a
    //     financial record for the OTHER party (the departed person's link is
    //     nulled via the invoices FK ON DELETE SET NULL). The invoice's snapshot
    //     columns (names, email, venue, amounts) keep it fully readable.
    const deletions: { table: string; column: string }[] = [
      { table: 'notifications', column: 'user_id' },
      { table: 'availability_blocks', column: 'artist_id' },
      { table: 'applications', column: 'artist_id' },
      { table: 'applications', column: 'manager_id' },
      { table: 'invites', column: 'artist_id' },
      { table: 'invites', column: 'manager_id' },
      { table: 'draft_assignments', column: 'artist_id' },
      { table: 'draft_assignments', column: 'manager_id' },
    ];
    for (const { table, column } of deletions) {
      await run(`delete ${table}.${column}`, admin.from(table).delete().eq(column, userId));
    }

    // 4d. DELETE identity rows last.
    await run('delete managers', admin.from('managers').delete().eq('id', userId));
    await run('delete artists', admin.from('artists').delete().eq('id', userId));
    await run('delete users', admin.from('users').delete().eq('id', userId));

    // If anything failed, stop before deleting the login so it can be retried.
    if (errors.length > 0) {
      return json({ error: 'Account data cleanup failed', details: errors }, 500);
    }

    // 5. Finally, delete the auth login itself (service-role only).
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      return json({ error: 'Auth deletion failed', details: authDeleteError.message }, 500);
    }

    return json({ success: true, storageWarnings: storageWarnings.length ? storageWarnings : undefined }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
