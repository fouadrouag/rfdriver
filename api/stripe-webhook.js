import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: false
  }
};

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

async function sendResendEmail({ to, subject, html, replyTo }) {
  const payload = {
    from: 'RF Driver <reservations@rfdriver.fr>',
    to: [to],
    subject,
    html
  };
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errText = await response.text();
    console.error('Resend error:', errText);
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function recapRows(m) {
  const rows = [
    ['Départ', m.depart],
    ['Arrivée', m.arrivee],
    ['Date', `${m.date} à ${m.heure}`],
    ['Véhicule', m.vehicule],
    ['Type de trajet', m.type],
    ['Prix', m.prix],
    ['Passagers', m.passagers],
    ['Bagages', m.bagages]
  ];
  if (m.vol) rows.push(['N° de vol', m.vol]);
  if (m.message) rows.push(['Message', m.message]);

  return rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #EDEDED;color:#8A8F92;font-size:13px;width:140px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #EDEDED;color:#263238;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>
  `).join('');
}

function emailShell({ preheader, title, intro, recapHtmlBlock, outro }) {
  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F6F6;font-family:Helvetica,Arial,sans-serif;">
  <span style="display:none;font-size:1px;color:#F4F6F6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="background:#263238;padding:28px 32px;text-align:center;">
              <img src="https://rfdriver.fr/logo.png" alt="RF Driver" width="90" style="display:block;margin:0 auto 4px;" />
              <div style="color:#C9A84C;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">Chauffeur privé — Oise &amp; Paris</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;color:#263238;font-size:20px;font-weight:700;">${escapeHtml(title)}</h1>
              <div style="color:#454A4D;font-size:14px;line-height:1.7;margin-bottom:20px;">${intro}</div>
              ${recapHtmlBlock ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #C9A84C;padding-top:4px;margin-bottom:20px;">
                ${recapHtmlBlock}
              </table>
              ` : ''}
              <div style="color:#454A4D;font-size:14px;line-height:1.7;">${outro}</div>
            </td>
          </tr>
          <tr>
            <td style="background:#F4F6F6;padding:20px 32px;text-align:center;">
              <div style="color:#8A8F92;font-size:12px;">RF Driver — 06 05 71 77 11 — <a href="mailto:contact@rfdriver.fr" style="color:#8A8F92;">contact@rfdriver.fr</a></div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;
  try {
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const m = session.metadata || {};

    try {
      await Promise.all([
        sendResendEmail({
          to: m.email || session.customer_email,
          subject: 'Confirmation de votre réservation RF Driver',
          html: emailShell({
            preheader: 'Votre paiement a bien été reçu, votre trajet est confirmé.',
            title: 'Votre réservation est confirmée',
            intro: `Bonjour ${escapeHtml(m.prenom)},<br><br>Votre paiement a bien été reçu et votre trajet est confirmé.`,
            recapHtmlBlock: recapRows(m),
            outro: `À bientôt,<br><strong>L'équipe RF Driver</strong>`
          })
        }),
        sendResendEmail({
          to: 'reservations@rfdriver.fr',
          subject: `Nouvelle réservation payée — ${m.nom} ${m.prenom}`,
          html: emailShell({
            preheader: `Nouvelle réservation payée par ${m.prenom} ${m.nom}`,
            title: 'Nouvelle réservation (paiement en ligne confirmé)',
            intro: `<strong>Client :</strong> ${escapeHtml(m.prenom)} ${escapeHtml(m.nom)}<br><strong>Téléphone :</strong> ${escapeHtml(m.tel)}<br><strong>Email :</strong> ${escapeHtml(m.email)}`,
            recapHtmlBlock: recapRows(m),
            outro: ''
          })
        })
      ]);
    } catch (err) {
      console.error('Error sending confirmation emails:', err);
    }
  }

  return res.status(200).json({ received: true });
}
