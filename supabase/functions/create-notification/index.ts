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

function isUuid(v: unknown): v is string {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 1. Caller must be a logged-in user (verify their token).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid or expired session' }, 401);

    // 2. Parse + validate the payload.
    const payload = await req.json();
    const {
      id, user_id, type, title, body,
      is_read = false, related_id = null, related_type = null, created_at,
    } = payload ?? {};

    if (!isUuid(id)) return json({ error: 'Invalid notification id' }, 400);
    if (!isUuid(user_id)) return json({ error: 'Invalid recipient user_id' }, 400);
    if (typeof type !== 'string' || type.length === 0) return json({ error: 'Invalid notification type' }, 400);
    if (typeof title !== 'string' || typeof body !== 'string') {
      return json({ error: 'Title and body are required' }, 400);
    }

    // 3. Insert with the service role (bypasses RLS — the only path that may write).
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: insertError } = await admin
      .from('notifications')
      .upsert({
        id,
        user_id,
        type,
        title,
        body,
        is_read: !!is_read,
        related_id,
        related_type,
        created_at: created_at ?? new Date().toISOString(),
      }, { onConflict: 'id' });

    if (insertError) {
      return json({ error: 'Could not create notification', details: insertError.message }, 500);
    }

    // 4. Best-effort push notification to the recipient's device.
    //    Failures here never fail the request — the in-app notification row
    //    is already saved above.
    try {
      const { data: recipient } = await admin
        .from('users')
        .select('push_token')
        .eq('id', user_id)
        .maybeSingle();

      const pushToken = recipient?.push_token;
      if (pushToken && typeof pushToken === 'string' && pushToken.startsWith('ExponentPushToken')) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify({
            to: pushToken,
            title,
            body,
            sound: 'default',
            data: { type, related_id, related_type, notification_id: id },
          }),
        });
      }
    } catch (pushErr) {
      console.log('push send failed (non-fatal):', pushErr);
    }

    return json({ success: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
