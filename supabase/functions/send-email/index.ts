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
  muted: '#8E8E93',     // app muted — labels / footer
  faint: '#B3B0A8',     // lightest — footer address + reason line
};
// Font stacks. Clash Display (logo) + General Sans (everything) render in Apple Mail,
// which loads the @import; other clients fall back to the system stack below.
const LOGO_FONT = "'Clash Display','Arial Black','Helvetica Neue',Arial,sans-serif";
const BODY_FONT = "'General Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Hosted PNG of the "Nexgig." wordmark in Clash Display (black letters + white dot), so the logo
// renders identically in EVERY email client — Gmail/Outlook strip web fonts and can't use LOGO_FONT.
// Must be a PUBLIC url (e.g. a public Supabase Storage bucket). Until it's set, the alt text shows.
const LOGO_URL = 'https://jgzuzkwzoceuzytwadvc.supabase.co/storage/v1/object/public/Assets/nexgig-email-logo.png';

// Wraps body content in a Nexgig-branded layout: cream page, wordmark + category label header,
// white card, footer with links + an optional "why you got this" reason. Table-based so it holds
// up in Outlook/Gmail (not just Apple Mail). Returns a full HTML doc.
function shell(inner: string, opts: { category?: string; reason?: string } = {}): string {
  const categoryCell = opts.category
    ? `<td align="right" valign="middle" style="font-family:${BODY_FONT}; font-size:12px; letter-spacing:1.5px; color:${BRAND.muted}; text-transform:uppercase;">${opts.category}</td>`
    : `<td></td>`;
  const reasonCell = opts.reason
    ? `<td align="right" valign="top" width="45%" style="font-family:${BODY_FONT}; font-size:13px; line-height:1.55; color:${BRAND.faint};">${opts.reason}</td>`
    : `<td></td>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>@import url('https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap');</style></head>
<body style="margin:0; padding:0; background:${BRAND.surface};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface}; font-family:${BODY_FONT};"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">
  <tr><td style="padding:4px 6px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="left" valign="middle"><img src="${LOGO_URL}" alt="Nexgig" width="109" height="30" style="display:block; border:0; outline:none; text-decoration:none;"></td>
      ${categoryCell}
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff; border:1px solid ${BRAND.hairline}; border-radius:16px; padding:36px;">
    ${inner}
  </td></tr>
  <tr><td style="padding:24px 6px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="left" valign="top" style="font-family:${BODY_FONT}; font-size:13px; line-height:1.6; color:${BRAND.muted};">Nexgig &middot; Book. Play. Discover.<br><a href="https://nexgigapp.com" style="color:${BRAND.muted}; text-decoration:underline;">nexgigapp.com</a> &middot; <a href="mailto:admin@nexgigapp.com" style="color:${BRAND.muted}; text-decoration:underline;">Support</a></td>
      ${reasonCell}
    </tr></table>
    <div style="font-family:${BODY_FONT}; font-size:12px; color:${BRAND.faint}; margin-top:16px;">Dubai, United Arab Emirates &middot; admin@nexgigapp.com</div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const h1 = (text: string) =>
  `<h1 style="font-family:${BODY_FONT}; font-size:22px; font-weight:600; color:${BRAND.ink}; margin:0 0 16px;">${text}</h1>`;
const p = (text: string) =>
  `<p style="color:${BRAND.body}; font-size:15px; line-height:1.6; margin:0 0 14px;">${text}</p>`;

// Where every "Open Nexgig" / "Download Nexgig" button points.
const APP_STORE_URL = 'https://apps.apple.com/ae/app/nexgig/id6784020757';

// ─── Card content helpers (the redesigned emails) ────────────────────────────
const greet = (name: string) =>
  `<div style="font-family:${BODY_FONT}; font-size:15px; color:${BRAND.muted}; margin:0 0 6px;">Hi ${name} &mdash;</div>`;
const cardTitle = (text: string) =>
  `<div style="font-family:${BODY_FONT}; font-size:24px; font-weight:600; color:${BRAND.ink}; line-height:1.25; margin:0 0 24px;">${text}</div>`;
const bigStat = (label: string, value: string) =>
  `<div style="margin:0 0 22px;"><div style="font-family:${BODY_FONT}; font-size:12px; letter-spacing:1px; color:${BRAND.muted}; text-transform:uppercase; margin:0 0 6px;">${label}</div><div style="font-family:${BODY_FONT}; font-size:34px; font-weight:600; color:${BRAND.ink}; line-height:1.1;">${value}</div></div>`;
const hr = () => `<div style="height:1px; background:${BRAND.hairline}; margin:24px 0;"></div>`;
const rowsTable = (pairs: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${BODY_FONT};">` +
  pairs.map(([l, v]) => `<tr><td align="left" valign="top" style="font-size:14px; color:${BRAND.muted}; padding:7px 0;">${l}</td><td align="right" valign="top" style="font-size:14px; color:${BRAND.ink}; font-weight:500; padding:7px 0;">${v}</td></tr>`).join('') +
  `</table>`;
const stepsTable = (items: string[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${BODY_FONT};">` +
  items.map((desc, i) => `<tr><td align="left" valign="top" style="font-size:14px; color:${BRAND.muted}; padding:9px 0;">Step ${i + 1}</td><td align="right" valign="top" style="font-size:15px; color:${BRAND.ink}; font-weight:500; padding:9px 0;">${desc}</td></tr>`).join('') +
  `</table>`;
const pdfChip = (filename: string, sizeLabel: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface}; border-radius:12px; margin:22px 0;"><tr><td style="padding:14px 16px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle"><div style="width:36px; height:36px; background:${BRAND.ink}; border-radius:8px; color:#fff; font-size:10px; font-weight:700; text-align:center; line-height:36px; font-family:${BODY_FONT};">PDF</div></td><td valign="middle" style="padding-left:12px;"><div style="font-family:${BODY_FONT}; font-size:14px; font-weight:500; color:${BRAND.ink};">${filename}</div><div style="font-family:${BODY_FONT}; font-size:12px; color:${BRAND.muted}; margin-top:2px;">Attached to this email${sizeLabel ? ` &middot; ${sizeLabel}` : ''}</div></td></tr></table></td></tr></table>`;
const ctaButton = (label: string, url: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0;"><tr><td align="center" style="background:${BRAND.ink}; border-radius:14px;"><a href="${url}" style="display:block; padding:16px 24px; font-family:${BODY_FONT}; font-size:16px; font-weight:600; color:#ffffff; text-decoration:none; text-align:center;">${label}</a></td></tr></table>`;
const footnote = (text: string) =>
  `<div style="font-family:${BODY_FONT}; font-size:14px; color:${BRAND.muted}; line-height:1.55; margin:20px 0 0;">${text}</div>`;

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
          greet(escapeHtml(name || 'there')) +
          cardTitle('Welcome to Nexgig') +
          hr() +
          stepsTable([
            'Complete your artist profile',
            'Get added to venue rosters, or add your own private gigs',
            "Block the dates and times you're unavailable",
          ]) +
          ctaButton('Open Nexgig', APP_STORE_URL) +
          footnote('A complete profile gets you found by venues looking for your sound.'),
          { category: 'WELCOME', reason: 'You get this because you have an artist profile on Nexgig.' },
        ),
      };
    }

    // Welcome email — manager variant.
    case 'welcome_manager': {
      return {
        subject: 'Welcome to Nexgig',
        html: shell(
          greet(escapeHtml(name || 'there')) +
          cardTitle('Welcome to Nexgig') +
          hr() +
          stepsTable([
            'Create your venues',
            'Invite artists to your roster',
            'Send your first booking request',
          ]) +
          ctaButton('Open Nexgig', APP_STORE_URL) +
          footnote('Book. Play. Discover. — everything for the night in one place.'),
          { category: 'WELCOME', reason: 'You get this because you created a manager account on Nexgig.' },
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
      const pdfName = escapeHtml(String(data.pdfFileName ?? 'invoice.pdf'));
      const b64 = typeof data.pdfBase64 === 'string' ? data.pdfBase64 : '';
      const kb = b64 ? Math.max(1, Math.round((b64.length * 3) / 4 / 1024)) : 0;
      const issued = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return {
        subject: `New invoice from ${artistName}${invoiceNumber ? ` (${invoiceNumber})` : ''}`,
        html: shell(
          greet(escapeHtml(name || 'there')) +
          cardTitle(`${artistName} sent you an invoice`) +
          bigStat('Amount due', `AED ${amount}`) +
          hr() +
          rowsTable([
            ['Invoice number', invoiceNumber || '—'],
            ['From', artistName],
            ['Venue', venueName],
            ['Issued', issued],
          ]) +
          pdfChip(pdfName, kb ? `${kb} KB` : '') +
          ctaButton('Open Nexgig', APP_STORE_URL) +
          footnote(`Questions about this invoice? Message ${artistName} from the booking in Nexgig.`),
          { category: 'INVOICE', reason: 'You get this because you manage this venue on Nexgig.' },
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

      const inviteeName = escapeHtml((String(d.name ?? '')).trim() || 'there');
      const inviterRaw = (String(d.managerName ?? '')).trim() || 'A venue manager';
      const inviter = escapeHtml(inviterRaw);
      const inviteHtml = shell(
        greet(inviteeName) +
        cardTitle(`${inviter} invited you to Nexgig`) +
        p(`<strong style="color:${BRAND.ink};">${inviter}</strong> wants to add you to their roster on <strong>Nexgig</strong> — the app venues across the UAE use to book artists.`) +
        ctaButton('Download Nexgig', APP_STORE_URL) +
        footnote("Sign up with this email address and you'll be added to their roster automatically. If you weren't expecting this, you can ignore this email."),
        { category: 'ROSTER INVITE' },
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
