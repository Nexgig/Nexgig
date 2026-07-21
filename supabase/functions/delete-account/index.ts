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

    // 3. Which role is being deleted, and which profiles actually exist.
    //
    //    Dual-role accounts share ONE auth user across a managers row AND an artists row.
    //    Deleting "the account" from one side must NOT take the other down with it — that
    //    was the original bug: deleting from artist mode wiped the manager profile and the
    //    login too. So the delete is scoped to ONE role, and the login only dies with the
    //    last remaining profile.
    //
    //    The role comes from the body (the active role the user is looking at). It is not a
    //    security boundary — the caller owns both profiles — so trusting it is fine; only
    //    the identity (userId) must come from the token, and it does.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const requestedRole = body?.role === 'manager' || body?.role === 'artist' ? body.role : null;

    const [{ data: mgrRow }, { data: artRow }] = await Promise.all([
      admin.from('managers').select('id').eq('id', userId).maybeSingle(),
      admin.from('artists').select('id').eq('id', userId).maybeSingle(),
    ]);
    const hasManager = !!mgrRow;
    const hasArtist = !!artRow;

    const { data: userRow } = await admin
      .from('users').select('account_type').eq('id', userId).maybeSingle();

    // Resolve the role to delete: the body's role, else the stored account_type, else
    // whichever profile exists (covers an abandoned signup with no profiles at all).
    const roleToDelete: 'manager' | 'artist' =
      requestedRole ?? (userRow?.account_type as 'manager' | 'artist' | undefined)
      ?? (hasManager ? 'manager' : 'artist');

    // Partial = the OTHER profile survives, so keep the login. Full = last (or only) role.
    const otherRoleExists = roleToDelete === 'manager' ? hasArtist : hasManager;
    const isPartial = otherRoleExists;
    const survivingRole: 'manager' | 'artist' | null =
      !isPartial ? null : (roleToDelete === 'manager' ? 'artist' : 'manager');

    const errors: string[] = [];
    const run = async (label: string, op: Promise<{ error: unknown }>) => {
      const { error } = await op;
      if (error) errors.push(`${label}: ${(error as { message?: string }).message ?? String(error)}`);
    };

    const nowIso = new Date().toISOString();

    // 4. Role-scoped cleanup. Everything here touches ONLY the departing role's columns, so
    //    a surviving profile on the same userId is never affected.
    if (roleToDelete === 'artist') {
      await run('bookings.cancel_active_as_artist', admin.from('bookings')
        .update({ status: 'cancelled', cancelled_at: nowIso })
        .eq('artist_id', userId)
        .in('status', ['requested', 'past_confirmation', 'confirmed']));
      await run('bookings.artist_name', admin.from('bookings').update({ artist_name: 'Former Artist' }).eq('artist_id', userId));
      await run('global_lineup.artist_name', admin.from('global_lineup').update({ artist_name: 'Former Artist' }).eq('artist_id', userId));
      await run('venue_assignments.artist_name', admin.from('venue_assignments').update({ artist_name: 'Former Artist' }).eq('artist_id', userId));
      await run('delete availability_blocks', admin.from('availability_blocks').delete().eq('artist_id', userId));
      await run('delete applications.artist', admin.from('applications').delete().eq('artist_id', userId));
      await run('delete draft_assignments.artist', admin.from('draft_assignments').delete().eq('artist_id', userId));
    } else {
      await run('bookings.cancel_active_as_manager', admin.from('bookings')
        .update({ status: 'cancelled', cancelled_at: nowIso })
        .eq('manager_id', userId)
        .in('status', ['requested', 'past_confirmation', 'confirmed']));
      await run('bookings.manager_name', admin.from('bookings').update({ manager_name: 'Former Manager' }).eq('manager_id', userId));
      await run('global_lineup.manager_name', admin.from('global_lineup').update({ manager_name: 'Former Manager' }).eq('manager_id', userId));
      await run('venue_assignments.manager_name', admin.from('venue_assignments').update({ manager_name: 'Former Manager' }).eq('manager_id', userId));
      await run('venues.deactivate', admin.from('venues').update({ is_deactivated: true, manager_name: 'Former Manager' }).eq('manager_id', userId));
      await run('delete applications.manager', admin.from('applications').delete().eq('manager_id', userId));
      await run('delete draft_assignments.manager', admin.from('draft_assignments').delete().eq('manager_id', userId));
    }

    // 5. Delete the departing role's identity row.
    await run(`delete ${roleToDelete}s`,
      admin.from(roleToDelete === 'manager' ? 'managers' : 'artists').delete().eq('id', userId));

    const storageWarnings: string[] = [];
    const removeByPrefix = async (bucket: string, prefix: string) => {
      try {
        const { data: files, error: listErr } = await admin.storage.from(bucket).list('', { limit: 1000, search: prefix });
        if (listErr) { storageWarnings.push(`${bucket}.list(${prefix}): ${listErr.message}`); return; }
        const paths = (files ?? []).map((f) => f.name).filter((name) => name.startsWith(prefix));
        if (paths.length === 0) return;
        const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
        if (rmErr) storageWarnings.push(`${bucket}.remove: ${rmErr.message}`);
      } catch (e) {
        storageWarnings.push(`${bucket}(${prefix}): ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    if (isPartial) {
      // Keep the login. Re-point the users row at the surviving role so any server-side
      // logic sees a consistent account_type; the client re-hydrates the rest of the row
      // from the surviving profile on return.
      await run('users.account_type', admin.from('users').update({ account_type: survivingRole }).eq('id', userId));
      if (errors.length > 0) return json({ error: 'Account data cleanup failed', details: errors }, 500);
      return json({ success: true, fullyDeleted: false, remaining: survivingRole }, 200);
    }

    // ── FULL delete: the last (or only) role. Remove everything and the login. ──
    //    Storage runs only here — a surviving profile may share the avatar file, and a
    //    manager's deactivated venues keep their photos as history.
    await removeByPrefix('avatars', `avatar-${userId}`);
    if (roleToDelete === 'manager') {
      const { data: managerVenues } = await admin.from('venues').select('id').eq('manager_id', userId);
      for (const v of managerVenues ?? []) await removeByPrefix('venue-photos', `venue-${v.id}`);
    }

    // Notifications are keyed by user_id (shared across roles) — only safe to delete once
    // no profile remains. Invoices are intentionally kept (financial record for the other
    // party; the departed link is nulled via ON DELETE SET NULL).
    await run('delete notifications', admin.from('notifications').delete().eq('user_id', userId));
    await run('delete users', admin.from('users').delete().eq('id', userId));

    if (errors.length > 0) return json({ error: 'Account data cleanup failed', details: errors }, 500);

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      return json({ error: 'Auth deletion failed', details: authDeleteError.message }, 500);
    }

    return json({ success: true, fullyDeleted: true, remaining: null, storageWarnings: storageWarnings.length ? storageWarnings : undefined }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
