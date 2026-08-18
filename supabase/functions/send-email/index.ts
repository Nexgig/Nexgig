import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const FROM = 'Nexgig <notifications@nexgigapp.com>';
// Where report + feedback notifications are delivered.
const ADMIN_EMAIL = 'admin@nexgigapp.com';

// ─── Shared HTML shell ───────────────────────────────────────────────────────
// Brand palette (matches the app's light theme in theme.config.js).
const BRAND = {
  coral: '#E2674A',
  dot: '#FFFFFF',       // the wordmark's accent dot — white on the coral header
  tagline: '#FBE4DC',   // soft cream, sits under the wordmark
  ink: '#1A1A1A',       // headings (app foreground is #000; softened for email)
  body: '#57534E',      // warm grey body text
  surface: '#F6F2EC',   // app surface — cards inside the email
  hairline: '#EDE7DE',  // soft divider
  muted: '#8E8E93',     // app muted — footer
};
// Font stacks. Clash Display (logo) + General Sans (everything) render in Apple Mail,
// which loads the @import; other clients fall back to the system stack below.
const LOGO_FONT = "'Clash Display','Arial Black','Helvetica Neue',Arial,sans-serif";
const BODY_FONT = "'General Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Hosted PNG of the "Nexgig." wordmark in Clash Display (black letters + white dot), so the logo
// renders identically in EVERY email client — Gmail/Outlook strip web fonts and can't use LOGO_FONT.
// Must be a PUBLIC url (e.g. a public Supabase Storage bucket). Until it's set, the alt text shows.
const LOGO_URL = 'REPLACE_WITH_PUBLIC_PNG_URL';

// Wraps body content in a consistent Nexgig-branded layout. Returns a full HTML doc so
// the <head> can pull the brand fonts from Fontshare (where they're hosted).
function shell(innerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @import url('https://api.fontshare.com/v2/css?f[]=clash-display@600&f[]=general-sans@400,500,600&display=swap');
  </style>
</head>
<body style="margin:0; padding:0; background:${BRAND.surface};">
  <div style="font-family:${BODY_FONT}; background:${BRAND.surface}; padding:24px;">
    <div style="max-width:480px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid ${BRAND.hairline};">
      <div style="background:${BRAND.surface}; padding:26px 32px; border-bottom:1px solid ${BRAND.hairline};">
        <img src="${LOGO_URL}" alt="Nexgig" width="109" height="30" style="display:block; border:0; outline:none; text-decoration:none;" />
        <div style="color:${BRAND.muted}; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; margin-top:8px;">Book. Play. Discover.</div>
      </div>
      <div style="padding:32px;">
        ${innerHtml}
      </div>
      <div style="padding:16px 32px; border-top:1px solid ${BRAND.hairline};">
        <div style="color:${BRAND.muted}; font-size:12px;">Sent by Nexgig &middot; nexgigapp.com</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

const h1 = (text: string) =>
  `<h1 style="font-family:${BODY_FONT}; font-size:22px; font-weight:600; color:${BRAND.ink}; margin:0 0 16px;">${text}</h1>`;
const p = (text: string) =>
  `<p style="color:${BRAND.body}; font-size:15px; line-height:1.6; margin:0 0 14px;">${text}</p>`;

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Renders one venue block: name in bold, rules below (or a muted "no rules" line).
function venueBlock(name: string, rules: string | null): string {
  const safeName = escapeHtml(name || 'Venue');
  const trimmedRules = (rules ?? '').trim();
  if (trimmedRules) {
    return `
      <div style="background:${BRAND.surface}; border-radius:12px; padding:16px 18px; margin:0 0 12px;">
        <div style="font-size:15px; font-weight:500; color:${BRAND.ink}; margin:0 0 4px;">${safeName}</div>
        <div style="color:${BRAND.body}; font-size:14px; line-height:1.55; white-space:pre-line;">${escapeHtml(trimmedRules)}</div>
      </div>`;
  }
  return `
      <div style="background:${BRAND.surface}; border-radius:12px; padding:16px 18px; margin:0 0 12px;">
        <div style="font-size:15px; font-weight:500; color:${BRAND.ink}; margin:0 0 4px;">${safeName}</div>
        <div style="color:${BRAND.muted}; font-size:13px; font-style:italic;">(joined — no specific rules)</div>
      </div>`;
}

// Builds the venues + rules section for the lineup_added email.
// If venueId is provided, fetches just that venue; otherwise all the manager's
// non-hidden venues. Returns '' if nothing resolvable (caller falls back).
async function buildVenuesHtml(
  admin: SupabaseClient,
  managerId: string | null,
  venueId: string | null,
): Promise<string> {
  let rows: { name: string; rules_template: string | null }[] | null = null;

  if (venueId && isUuid(venueId)) {
    const { data } = await admin
      .from('venues').select('name, rules_template').eq('id', venueId).maybeSingle();
    if (data) rows = [data];
  } else if (managerId && isUuid(managerId)) {
    const { data } = await admin
      .from('venues')
      .select('name, rules_template')
      .eq('manager_id', managerId)
      .neq('is_hidden', true)
      .order('name', { ascending: true });
    if (data) rows = data;
  }

  if (!rows || rows.length === 0) return '';

  const heading = `<p style="color:${BRAND.ink}; font-size:15px; font-weight:500; margin:6px 0 12px;">${rows.length > 1 ? 'Venues & rules' : 'Venue & rules'}</p>`;
  return heading + rows.map((r) => venueBlock(r.name, r.rules_template)).join('');
}

// ─── Templates ───────────────────────────────────────────────────────────────
type TemplateResult = { subject: string; html: string };

// Renders a labelled row for the admin report/feedback emails.
function adminRow(label: string, value: string): string {
  return `<p style="margin:0 0 8px; font-size:14px; color:${BRAND.body};"><strong style="color:${BRAND.ink}; font-weight:500;">${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
}

// Admin-notification templates (report / feedback). These render purely from
// `data` and are delivered to ADMIN_EMAIL — no recipient-user lookup.
function renderAdminTemplate(
  template: string,
  data: Record<string, unknown>,
): TemplateResult | null {
  const str = (v: unknown) => (v === null || v === undefined || v === '') ? '—' : String(v);

  switch (template) {
    case 'report_admin': {
      const type = str(data.reportedType);
      const name = str(data.reportedName);
      return {
        subject: `[Report] ${type}: ${name}`,
        html: shell(
          h1('New Report') +
          adminRow('Type', type) +
          adminRow('Reported ' + type, `${name} (id: ${str(data.reportedId)})`) +
          adminRow('Reason', str(data.reason)) +
          adminRow('Details', str(data.details)) +
          adminRow('Reporter id', str(data.reporterId)),
        ),
      };
    }
    case 'feedback_admin': {
      const cat = str(data.category);
      const subj = str(data.subject);
      return {
        subject: `[Feedback] ${cat}${subj !== '—' ? ': ' + subj : ''}`,
        html: shell(
          h1('New Feedback') +
          adminRow('Category', cat) +
          adminRow('Subject', subj) +
          adminRow('From', `${str(data.userName)} (${str(data.accountType)})`) +
          adminRow('User email', str(data.userEmail)) +
          adminRow('User id', str(data.userId)) +
          `<div style="margin-top:14px; padding:14px; background:${BRAND.surface}; border-radius:12px; white-space:pre-line; color:${BRAND.ink}; font-size:15px; line-height:1.55;">${escapeHtml(str(data.message))}</div>`,
        ),
      };
    }
    default:
      return null;
  }
}

function renderTemplate(
  template: string,
  recipientName: string,
  data: Record<string, unknown>,
  venuesHtml: string,
): TemplateResult | null {
  const name = escapeHtml(recipientName || 'there');

  switch (template) {
    // Generic test/ping email — used to prove the pipe end to end.
    case 'test': {
      return {
        subject: 'Nexgig email test',
        html: shell(
          h1('It works!') +
          p(`Hi ${name},`) +
          p('This is a test email from Nexgig confirming that transactional email is set up correctly.') +
          p('If you received this, the pipe is live.'),
        ),
      };
    }

    // Welcome email — artist variant.
    case 'welcome_artist': {
      return {
        subject: 'Welcome to Nexgig',
        html: shell(
          h1('Welcome to Nexgig') +
          p(`Hi ${name},`) +
          p('Your artist profile is live. Managers across the UAE can now discover you, add you to their lineups, and send you booking requests.') +
          p('Round out your profile — pick your avatar, set your genres and instruments, and add your links so venues find the right fit.'),
        ),
      };
    }

    // Welcome email — manager variant.
    case 'welcome_manager': {
      return {
        subject: 'Welcome to Nexgig',
        html: shell(
          h1('Welcome to Nexgig') +
          p(`Hi ${name},`) +
          p('Your manager account is ready. Create your venues, build your artist lineup, and manage every booking in one place.') +
          p('Start by adding a venue, then browse the Network to connect with artists.'),
        ),
      };
    }

    // Added to a manager's lineup. data.managerName; venuesHtml built server-side.
    case 'lineup_added': {
      const managerName = escapeHtml(String(data.managerName ?? 'A manager'));
      return {
        subject: `${managerName} added you to their lineup on Nexgig`,
        html: shell(
          h1("You're on the lineup") +
          p(`Hi ${name},`) +
          p(`<strong>${managerName}</strong> has added you to their artist lineup on Nexgig.`) +
          (venuesHtml || p('Open the app to see the venues and details.')),
        ),
      };
    }

    // Manager received an invoice from an artist.
    case 'invoice_received': {
      const artistName = escapeHtml(String(data.artistName ?? 'An artist'));
      const venueName = escapeHtml(String(data.venueName ?? 'your venue'));
      const amount = escapeHtml(String(data.amount ?? ''));
      const invoiceNumber = escapeHtml(String(data.invoiceNumber ?? ''));
      return {
        subject: `New invoice from ${artistName}${invoiceNumber ? ` (${invoiceNumber})` : ''}`,
        html: shell(
          h1('You received an invoice') +
          p(`Hi ${name},`) +
          p(`<strong>${artistName}</strong> sent you an invoice for <strong>${venueName}</strong>.`) +
          p(`Amount: <strong>AED ${amount}</strong>${invoiceNumber ? `<br/>Invoice: ${invoiceNumber}` : ''}`) +
          p('The invoice PDF is attached to this email. You can also open Nexgig to view the full details.'),
        ),
      };
    }

    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) return json({ error: 'Email is not configured' }, 500);

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
    const { to_user_id, template, data = {} } = payload ?? {};

    if (typeof template !== 'string' || template.length === 0) {
      return json({ error: 'Invalid template' }, 400);
    }

    // 2a. ADMIN-notification templates (report / feedback): no recipient user —
    //     render from `data` and deliver to the admin inbox. Any logged-in user
    //     may trigger these (already verified above).
    if (template === 'report_admin' || template === 'feedback_admin') {
      const renderedAdmin = renderAdminTemplate(template, data as Record<string, unknown>);
      if (!renderedAdmin) return json({ error: `Unknown template: ${template}` }, 400);

      const adminResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: FROM,
          to: [ADMIN_EMAIL],
          subject: renderedAdmin.subject,
          html: renderedAdmin.html,
        }),
      });
      const adminResult = await adminResponse.json();
      if (!adminResponse.ok) {
        return json({ error: 'Resend rejected the email', details: adminResult }, 502);
      }
      return json({ success: true, id: adminResult?.id ?? null }, 200);
    }

    // 2a-bis. ROSTER INVITE — the invitee may not have a Nexgig account yet, so the
    //     address comes explicitly from data.to_email (not a user-id lookup). Access is
    //     gated below: the caller must own a matching PENDING invite (manager-only via RLS).
    if (template === 'roster_invite') {
      const d = data as Record<string, unknown>;
      const inviteEmail = (typeof d.to_email === 'string' ? d.to_email : '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
        return json({ error: 'Invalid to_email' }, 400);
      }
      // SECURITY: only send if the CALLER actually has a PENDING invite for this email.
      // That row can only be created by a manager (RLS), so this both restricts sending
      // to managers and ties every email to a real invite — no arbitrary/spam sends.
      const svc = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: inviteRow } = await svc
        .from('roster_invites')
        .select('id')
        .eq('manager_id', user.id)
        .ilike('email', inviteEmail)
        .eq('status', 'pending')
        .maybeSingle();
      if (!inviteRow) return json({ error: 'No matching pending invite for this manager' }, 403);

      const APP_STORE_URL = 'https://apps.apple.com/ae/app/nexgig/id6784020757';
      const inviteeName = escapeHtml((String(d.name ?? '')).trim() || 'there');
      const inviterRaw = (String(d.managerName ?? '')).trim() || 'A venue manager';
      const inviter = escapeHtml(inviterRaw);
      const button =
        `<a href="${APP_STORE_URL}" style="display:inline-block;background:#E2674A;color:#ffffff;` +
        `text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px;margin:8px 0;">` +
        `Download Nexgig</a>`;
      const inviteHtml = shell(
        h1("You've been invited to Nexgig") +
        p(`Hi ${inviteeName},`) +
        p(`<strong>${inviter}</strong> invited you to join their roster on <strong>Nexgig</strong> — the app venues use to book artists across the UAE.`) +
        p('Download the app and sign up with this email address, and you’ll be added to their roster automatically.') +
        button +
        p('<span style="color:#8E8E93;font-size:13px;">If you weren’t expecting this, you can ignore this email.</span>'),
      );
      const inviteResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
        body: JSON.stringify({
          from: FROM,
          to: [inviteEmail],
          subject: `${inviterRaw} invited you to Nexgig`,
          html: inviteHtml,
        }),
      });
      const inviteResult = await inviteResp.json();
      if (!inviteResp.ok) return json({ error: 'Resend rejected the email', details: inviteResult }, 502);
      return json({ success: true, id: inviteResult?.id ?? null }, 200);
    }

    // 2b. User-targeted templates require a valid recipient.
    if (!isUuid(to_user_id)) return json({ error: 'Invalid recipient to_user_id' }, 400);

    // 3. Look up the recipient's email + name server-side (service role).
    //    Check artists first, then managers (a user id lives in exactly one).
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let toEmail: string | null = null;
    let toName = '';

    const { data: artistRow } = await admin
      .from('artists').select('email, full_name').eq('id', to_user_id).maybeSingle();
    if (artistRow?.email) {
      toEmail = artistRow.email;
      toName = artistRow.full_name ?? '';
    } else {
      const { data: managerRow } = await admin
        .from('managers').select('email, full_name').eq('id', to_user_id).maybeSingle();
      if (managerRow?.email) {
        toEmail = managerRow.email;
        toName = managerRow.full_name ?? '';
      }
    }

    if (!toEmail) return json({ error: 'Recipient has no email on file' }, 404);

    // 4. For lineup_added, build the venues + rules section server-side.
    let venuesHtml = '';
    if (template === 'lineup_added') {
      const d = data as Record<string, unknown>;
      const managerId = typeof d.managerId === 'string' ? d.managerId : null;
      const venueId = typeof d.venueId === 'string' ? d.venueId : null;
      venuesHtml = await buildVenuesHtml(admin, managerId, venueId);
    }

    // 5. Render the template.
    const rendered = renderTemplate(template, toName, data as Record<string, unknown>, venuesHtml);
    if (!rendered) return json({ error: `Unknown template: ${template}` }, 400);

    // 6. Optional PDF attachment — the app passes the invoice PDF as base64 in data.pdfBase64
    //    (Resend wants { filename, content: <base64> }). Absent for templates without a PDF.
    const dd = data as Record<string, unknown>;
    const pdfBase64 = typeof dd.pdfBase64 === 'string' && dd.pdfBase64 ? dd.pdfBase64 : null;
    const pdfFileName = typeof dd.pdfFileName === 'string' && dd.pdfFileName ? dd.pdfFileName : 'invoice.pdf';
    const attachments = pdfBase64 ? [{ filename: pdfFileName, content: pdfBase64 }] : undefined;

    // 7. Send via Resend.
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [toEmail],
        subject: rendered.subject,
        html: rendered.html,
        ...(attachments ? { attachments } : {}),
      }),
    });

    const result = await emailResponse.json();

    if (!emailResponse.ok) {
      return json({ error: 'Resend rejected the email', details: result }, 502);
    }

    return json({ success: true, id: result?.id ?? null }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
