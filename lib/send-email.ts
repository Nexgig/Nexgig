import { supabase } from './supabase';

/**
 * Transactional email templates supported by the `send-email` Edge Function.
 * Keep this in sync with renderTemplate() in supabase/functions/send-email/index.ts.
 */
export type EmailTemplate =
  | 'test'
  | 'welcome_artist'
  | 'welcome_manager'
  | 'lineup_added';

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
