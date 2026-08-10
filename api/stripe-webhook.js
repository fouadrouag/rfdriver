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

function recapHtml(m) {
  return `
    <p><strong>Départ :</strong> ${escapeHtml(m.depart)}</p>
    <p><strong>Arrivée :</strong> ${escapeHtml(m.arrivee)}</p>
    <p><strong>Date :</strong> ${escapeHtml(m.date)} à ${escapeHtml(m.heure)}</p>
    <p><strong>Véhicule :</strong> ${escapeHtml(m.vehicule)}</p>
    <p><strong>Type de trajet :</strong> ${escapeHtml(m.type)}</p>
    <p><strong>Prix :</strong> ${escapeHtml(m.prix)}</p>
    <p><strong>Passagers :</strong> ${escapeHtml(m.passagers)} — <strong>Bagages :</strong> ${escapeHtml(m.bagages)}</p>
    ${m.vol ? `<p><strong>Numéro de vol :</strong> ${escapeHtml(m.vol)}</p>` : ''}
    ${m.message ? `<p><strong>Message :</strong> ${escapeHtml(m.message)}</p>` : ''}
  `;
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
          html: `
            <h2>Votre réservation est confirmée</h2>
            <p>Bonjour ${escapeHtml(m.prenom)},</p>
            <p>Votre paiement a bien été reçu et votre trajet est confirmé.</p>
            ${recapHtml(m)}
            <p>À bientôt,<br>L'équipe RF Driver</p>
          `
        }),
        sendResendEmail({
          to: 'reservations@rfdriver.fr',
          subject: `Nouvelle réservation payée — ${m.nom} ${m.prenom}`,
          html: `
            <h2>Nouvelle réservation (paiement en ligne confirmé)</h2>
            <p><strong>Client :</strong> ${escapeHtml(m.prenom)} ${escapeHtml(m.nom)}</p>
            <p><strong>Téléphone :</strong> ${escapeHtml(m.tel)}</p>
            <p><strong>Email :</strong> ${escapeHtml(m.email)}</p>
            ${recapHtml(m)}
          `
        })
      ]);
    } catch (err) {
      console.error('Error sending confirmation emails:', err);
    }
  }

  return res.status(200).json({ received: true });
}
