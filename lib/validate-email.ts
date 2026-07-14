/**
 * Email validation shared by the signup flows.
 *
 * Deliberately a format check only — we never probe the database to see whether an
 * address is already registered. That would be an email-enumeration hole (anyone
 * could discover who has an account), which is why Supabase doesn't expose it
 * either. "Already registered" is surfaced by signUp() itself.
 */

// Pragmatic, not RFC-5322-complete: something@something.tld, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Returns an error message, or '' when the address looks fine. */
export function validateEmail(raw: string): string {
  const email = raw.trim();
  if (!email) return 'Please enter your email address.';
  if (!EMAIL_RE.test(email)) return 'That email doesn’t look right.';
  return '';
}
