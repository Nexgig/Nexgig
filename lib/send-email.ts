import { supabase } from './supabase';

/**
 * Transactional email templates supported by the `send-email` Edge Function.
 * Keep this in sync with renderTemplate() in supabase/functions/send-email/index.ts.
 */
export type EmailTemplate =
  | 'test'
  | 'welcome_artist'
  | 'welcome_manager'
  | 'lineup_added'
  | 'invoice_received';

/**
 * Admin-notification templates. Unlike EmailTemplate, these do NOT target a
 * Nexgig user — the Edge Function sends them to the admin inbox
 * (admin@nexgigapp.com) and renders their content purely from `data`.
 */
export type AdminEmailTemplate =
  | 'report_admin'
  | 'feedback_admin';

/**
 * Sends a transactional email to a Nexgig user via the `send-email` Edge Function.
 *
 * The function (server-side, with the service-role key):
 *  - verifies the caller is a logged-in user
 *  - looks up the recipient's email by user id (artists, then managers)
 *  - renders the chosen template and sends it via Resend
 *    (from notifications@nexgigapp.com)
 *
 * These are OPERATIONAL emails (welcome, lineup-add, etc.) and always send —
 * they are not gated by the marketing "Product Updates" preference.
 *
 * Fire-and-forget by design: email is a best-effort side-effect, so a failure
 * here must never block the user action that triggered it. Errors are logged
 * (console.warn) and swallowed; the function returns true on success, false
 * otherwise, in case a caller wants to know.
 *
 * @param toUserId  the recipient's auth user id (artists.id / managers.id)
 * @param template  which email to send
 * @param data      template-specific values (e.g. { managerName, venuesHtml })
 */
export async function sendEmail(
  toUserId: string,
  template: EmailTemplate,
  data: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    // Must have a live session to authorize the call.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('[sendEmail] no active session — skipping');
      return false;
    }

    const { data: result, error } = await supabase.functions.invoke('send-email', {
      method: 'POST',
      body: { to_user_id: toUserId, template, data },
    });

    if (error) {
      // supabase-js puts the raw Response on error.context for non-2xx replies.
      let detail = error.message;
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = (await ctx.json()) as { error?: string; details?: unknown };
          if (body?.error) {
            detail = body.error + (body.details ? `: ${JSON.stringify(body.details)}` : '');
          }
        } catch {
          // body wasn't JSON — keep the generic message
        }
      }
      console.warn('[sendEmail] failed:', detail);
      return false;
    }

    if (result && (result as { error?: string }).error) {
      console.warn('[sendEmail] failed:', (result as { error: string }).error);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[sendEmail] threw:', err);
    return false;
  }
}

/**
 * Sends an ADMIN-notification email (report / feedback) via the same
 * `send-email` Edge Function. There is no recipient user — the function routes
 * these templates to admin@nexgigapp.com and builds the body from `data`.
 *
 * Fire-and-forget by design (best-effort side-effect): a failure here must never
 * block the user action that triggered it. Still requires a live session so the
 * function can authorize the caller.
 *
 * @param template  which admin email to send ('report_admin' | 'feedback_admin')
 * @param data      template-specific values (see the function's renderTemplate)
 */
export async function sendAdminEmail(
  template: AdminEmailTemplate,
  data: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('[sendAdminEmail] no active session — skipping');
      return false;
    }

    // No to_user_id — admin templates are routed server-side to the admin inbox.
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      method: 'POST',
      body: { template, data },
    });

    if (error) {
      let detail = error.message;
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = (await ctx.json()) as { error?: string; details?: unknown };
          if (body?.error) {
            detail = body.error + (body.details ? `: ${JSON.stringify(body.details)}` : '');
          }
        } catch { /* body wasn't JSON */ }
      }
      console.warn('[sendAdminEmail] failed:', detail);
      return false;
    }

    if (result && (result as { error?: string }).error) {
      console.warn('[sendAdminEmail] failed:', (result as { error: string }).error);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[sendAdminEmail] threw:', err);
    return false;
  }
}

/**
 * Sends a ROSTER-INVITE email to someone who may NOT have a Nexgig account yet.
 * Unlike sendEmail, the recipient is addressed by raw email (there's no user id to
 * look up) — the `send-email` function's `roster_invite` branch validates the
 * address and renders the "you've been invited + download the app" email.
 *
 * Fire-and-forget: a failure must never block the invite being saved.
 *
 * @param toEmail      the invitee's email (lower-cased by the caller)
 * @param managerName  the inviting manager's display name (for the subject/body)
 * @param name         the invitee's name the manager typed (optional greeting)
 */
export async function sendRosterInviteEmail(
  toEmail: string,
  managerName: string,
  name?: string,
): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { console.warn('[sendRosterInviteEmail] no active session — skipping'); return false; }

    const { data: result, error } = await supabase.functions.invoke('send-email', {
      method: 'POST',
      body: { template: 'roster_invite', data: { to_email: toEmail, managerName, name: name ?? '' } },
    });

    if (error) {
      let detail = error.message;
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = (await ctx.json()) as { error?: string; details?: unknown };
          if (body?.error) detail = body.error + (body.details ? `: ${JSON.stringify(body.details)}` : '');
        } catch { /* body wasn't JSON */ }
      }
      console.warn('[sendRosterInviteEmail] failed:', detail);
      return false;
    }
    if (result && (result as { error?: string }).error) {
      console.warn('[sendRosterInviteEmail] failed:', (result as { error: string }).error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[sendRosterInviteEmail] threw:', err);
    return false;
  }
}
