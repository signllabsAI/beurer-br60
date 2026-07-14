// /api/waitlist.js
// Vercel Serverless Function for the BR60 hero waitlist form.
// Sends via Resend (resend.com). Requires RESEND_API_KEY, which is
// auto-injected once the Resend integration is connected in the Vercel
// dashboard (Project -> Integrations -> Resend).
//
// Optional env vars (Project -> Settings -> Environment Variables):
//   RESEND_FROM_EMAIL      verified sender, e.g. "Beurer BiteX <waitlist@beurer-bitex.com>"
//   WAITLIST_NOTIFY_EMAIL  where new-signup alerts are sent (defaults to RESEND_FROM_EMAIL)
//
// Every signup is also saved as a Resend Contact (Audience -> Contacts) so
// the waitlist is a real, exportable list, not just a stream of emails.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
        if (req.method !== 'POST') {
                  res.setHeader('Allow', 'POST');
                  return res.status(405).json({ error: 'Method not allowed' });
        }

  const body = req.body || {};
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';

  if (!email || !EMAIL_RE.test(email)) {
            return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
                  console.error('RESEND_API_KEY is not configured.');
                  return res.status(500).json({ error: 'Waitlist is temporarily unavailable. Please try again shortly.' });
        }

  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Beurer BiteX <onboarding@resend.dev>';
        const fromMatch = fromAddress.match(/<(.+)>/);
        const notifyTo = process.env.WAITLIST_NOTIFY_EMAIL || (fromMatch ? fromMatch[1] : fromAddress);

  const resendHeaders = {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
  };

  // Save as a Resend Contact so the waitlist is a real, exportable list.
  // Fire-and-forget: a contact-save hiccup should never block the signup.
  fetch('https://api.resend.com/contacts', {
            method: 'POST',
            headers: resendHeaders,
            body: JSON.stringify({
                        email: email,
                        firstName: name || undefined,
                        unsubscribed: false,
            }),
  })
          .then(async function (r) {
                      if (!r.ok) console.error('Resend contact save failed:', await r.text());
          })
          .catch(function (err) { console.error('Resend contact save failed:', err); });

  try {
            const confirmRes = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: resendHeaders,
                        body: JSON.stringify({
                                      from: fromAddress,
                                      to: email,
                                      subject: "You're on the BR60 waitlist",
                                      html: `<p>Hi ${name || 'there'},</p>
                                      <p>Thanks for your interest in the Beurer BR60. We've sold out faster than expected — but you're now on the list, and we'll email you the moment it's back in stock, ahead of the general public.</p>
                                      <p style="margin:22px 0;padding:18px 22px;background:#F5F5F6;border-radius:12px;border:1px dashed #C50050;">
                                        <strong>As a thank-you for waiting:</strong> here's 15% off your BR60 when it's back in stock.<br>
                                        <span style="display:inline-block;margin-top:10px;font-family:monospace;font-size:20px;font-weight:700;letter-spacing:2px;color:#C50050;">SORRY15</span>
                                      </p>
                                      <p>While you wait: the BR60 is backed by two independent, peer-reviewed clinical studies showing drug-free relief from insect bite itch in as little as one minute. <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10309056/">Read more here.</a></p>
                                      <p>Questions? Just reply to this email.</p>
                                      <p>— The Beurer BR60 team</p>`,
                        }),
            });

          if (!confirmRes.ok) {
                      const errText = await confirmRes.text();
                      console.error('Resend confirmation email failed:', errText);
                      return res.status(502).json({ error: 'Could not send confirmation email. Please try again.' });
          }

          fetch('https://api.resend.com/emails', {
                      method: 'POST',
                      headers: resendHeaders,
                      body: JSON.stringify({
                                    from: fromAddress,
                                    to: notifyTo,
                                    subject: 'New BR60 waitlist signup',
                                    html: '<p>New signup:</p><ul><li>Name: ' + (name || '(not provided)') + '</li><li>Email: ' + email + '</li></ul>',
                      }),
          }).catch(function (err) { console.error('Resend notification email failed:', err); });

          return res.status(200).json({ ok: true });
  } catch (err) {
            console.error('Waitlist submission error:', err);
            return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
