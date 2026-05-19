import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  try {
    const { artist_email, manager_name, invite_id } = await req.json();

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Nexgig <invites@nexgigapp.com>',
        to: [artist_email],
        subject: `${manager_name} invited you to join their lineup on Nexgig`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h1 style="font-size: 24px; font-weight: 800; color: #111;">You're Invited! 🎧</h1>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              <strong>${manager_name}</strong> has invited you to join their artist lineup on <strong>Nexgig</strong>.
            </p>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Nexgig is a booking platform connecting DJs and artists with top venues across the UAE.
            </p>
            <a href="https://nexgigapp.com/invite/${invite_id}" 
               style="display: inline-block; margin-top: 24px; padding: 14px 28px; background: #2563EB; color: #fff; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px;">
              Accept Invitation
            </a>
            <p style="color: #999; font-size: 13px; margin-top: 32px;">
              If you weren't expecting this, you can ignore this email.
            </p>
          </div>
        `,
      }),
    });

    const result = await emailResponse.json();

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});