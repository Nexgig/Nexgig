import { supabase } from './supabase';

/**
 * Manager signup is invite-only. A person can only create a manager account if their email is on
 * the `manager_allowlist` (approved by us). Everything here runs BEFORE any account/session exists,
 * so it relies on the app's anon key: `is_manager_allowed` is a security-definer RPC granted to
 * anon, and the request goes through the send-email edge function's session-less path.
 */

/** True if this email is approved to become a manager. Fails OPEN-ish: on error returns false
 *  (so an unknown email is treated as not-approved → they get the request flow, never a wrong let-in). */
export async function isManagerAllowed(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (!e) return false;
  try {
    const { data, error } = await supabase.rpc('is_manager_allowed', { check_email: e });
    if (error) { console.warn('[isManagerAllowed] rpc error:', error.message); return false; }
    return data === true;
  } catch (err) {
    console.warn('[isManagerAllowed] threw:', err);
    return false;
  }
}

/**
 * For a returning APPROVED manager: their name + phone from the request they already submitted, so
 * signup doesn't ask again. Returns null unless the email is BOTH approved and has a prior request
 * (the RPC gates on the allow-list, so it can't leak details for a random/unapproved email).
 */
export async function getManagerRequestPrefill(email: string): Promise<{ fullName?: string; phone?: string } | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  try {
    const { data, error } = await supabase.rpc('get_manager_request_prefill', { check_email: e });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as { full_name?: string | null; phone?: string | null };
    return { fullName: row.full_name ?? undefined, phone: row.phone ?? undefined };
  } catch {
    return null;
  }
}

/**
 * Record a manager-access request + email admin@nexgigapp.com. Goes through the send-email edge
 * function (session-less `manager_access_request` template): the function inserts the row (service
 * role) and sends the admin email. Returns false on failure so the screen can tell the user.
 */
export async function submitManagerRequest(input: {
  name?: string;
  email: string;
  phone?: string;
  venues?: string;
}): Promise<boolean> {
  try {
    const { data: result, error } = await supabase.functions.invoke('send-email', {
      method: 'POST',
      body: {
        template: 'manager_access_request',
        data: {
          name: (input.name ?? '').trim(),
          email: input.email.trim().toLowerCase(),
          phone: (input.phone ?? '').trim(),
          venues: (input.venues ?? '').trim(),
        },
      },
    });
    if (error) { console.warn('[submitManagerRequest] failed:', error.message); return false; }
    if (result && (result as { error?: string }).error) {
      console.warn('[submitManagerRequest] failed:', (result as { error: string }).error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[submitManagerRequest] threw:', err);
    return false;
  }
}
