/**
 * Cloudflare Worker: Contact form handler for strengthbasedmarriage.com
 *
 * Receives POST form data from the contact form, validates it,
 * and forwards it as an email via Resend (https://resend.com).
 *
 * Required secrets (set via `wrangler secret put`):
 *   - RESEND_API_KEY: API key from resend.com
 *   - TO_EMAIL:       inbox where contact form messages should land
 *   - FROM_EMAIL:     verified sender (e.g. contact@strengthbasedmarriage.com)
 */

const ALLOWED_ORIGINS = [
  'https://strengthbasedmarriage.com',
  'https://www.strengthbasedmarriage.com',
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Vary': 'Origin',
  };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function parseBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await request.json();
  }
  const form = await request.formData();
  const data = {};
  for (const [key, value] of form.entries()) {
    data[key] = value;
  }
  return data;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers,
      });
    }

    let body;
    try {
      body = await parseBody(request);
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers,
      });
    }

    const name = (body.name || '').toString().trim();
    const email = (body.email || '').toString().trim();
    const phone = (body.phone || '').toString().trim();
    const message = (body.message || '').toString().trim();
    const honeypot = (body.website || '').toString().trim();

    if (honeypot) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: 'Name, email, and message are required.' }),
        { status: 400, headers }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email address.' }), {
        status: 400,
        headers,
      });
    }

    if (message.length > 5000 || name.length > 200) {
      return new Response(JSON.stringify({ error: 'Submission too long.' }), {
        status: 400,
        headers,
      });
    }

    const subject = `New inquiry from ${name} — Strength-Based Marriage`;
    const html = `
      <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; color: #2D2D2D; max-width: 560px;">
        <h2 style="color: #4A7C6F; font-family: Georgia, serif; margin: 0 0 16px;">New contact form submission</h2>
        <p style="margin: 0 0 6px;"><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p style="margin: 0 0 6px;"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
        ${phone ? `<p style="margin: 0 0 6px;"><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ''}
        <p style="margin: 16px 0 6px;"><strong>Message:</strong></p>
        <div style="background: #F0F5F3; padding: 16px; border-left: 4px solid #4A7C6F; border-radius: 4px; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(message)}</div>
        <p style="margin-top: 24px; font-size: 12px; color: #7A7A7A;">Sent via strengthbasedmarriage.com</p>
      </div>
    `;

    const text =
      `New contact form submission\n\n` +
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      (phone ? `Phone: ${phone}\n` : '') +
      `\nMessage:\n${message}\n`;

    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.FROM_EMAIL,
          to: [env.TO_EMAIL],
          reply_to: email,
          subject,
          html,
          text,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error('Resend error:', errText);
        return new Response(
          JSON.stringify({ error: 'Email service failed. Try again or call directly.' }),
          { status: 502, headers }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: 'Unexpected error.' }), {
        status: 500,
        headers,
      });
    }
  },
};
