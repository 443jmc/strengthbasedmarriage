# Contact Form Worker

A Cloudflare Worker that receives the contact form and sends an email via [Resend](https://resend.com).

## One-time setup

### 1. Sign up for Resend
- Go to [resend.com](https://resend.com) and create a free account (100 emails/day, plenty for a contact form).
- Add and verify your domain (`strengthbasedmarriage.com`). Resend will give you DNS records to add — since your domain is on Cloudflare, you can add them in the Cloudflare DNS tab.
- Create an API key under **API Keys** → **Create API Key**. Copy it.

### 2. Install wrangler (one time)
```bash
npm install -g wrangler
wrangler login
```

### 3. Deploy the Worker
```bash
cd worker
wrangler deploy
```

This will publish the Worker at something like `https://strengthbasedmarriage-contact.<your-subdomain>.workers.dev`.

### 4. Set the secrets
```bash
wrangler secret put RESEND_API_KEY    # paste your Resend API key
wrangler secret put TO_EMAIL          # e.g. james@strengthbasedmarriage.com (where messages land)
wrangler secret put FROM_EMAIL        # e.g. contact@strengthbasedmarriage.com (verified Resend sender)
```

### 5. Wire up the form
In `../index.html`, replace the form action with your Worker URL:
```html
<form id="contact-form" action="https://strengthbasedmarriage-contact.<your-subdomain>.workers.dev" method="POST">
```

Or, even better, bind the Worker to a custom route in the Cloudflare dashboard (e.g. `contact.strengthbasedmarriage.com/*`) and use that URL instead.

### 6. (Optional) Test locally
```bash
wrangler dev
```
Then `curl -X POST http://localhost:8787 -F name=Test -F email=test@example.com -F message=Hello`.

## How it works
1. Visitor submits the form on the site
2. Browser POSTs `name`, `email`, `phone`, `message` to the Worker
3. Worker validates fields, checks the honeypot, and calls the Resend API
4. Resend delivers an HTML email to `TO_EMAIL` with `reply_to` set to the visitor's email
5. Worker returns `{ ok: true }` and the site shows a success state

## Security & abuse
- A hidden `website` field is used as a honeypot — bots that fill it get a silent 200
- CORS is locked down to `strengthbasedmarriage.com` and `www.strengthbasedmarriage.com`
- Message length capped at 5000 chars, name at 200
- Email format is validated
- All user input is HTML-escaped before being placed in the email body
