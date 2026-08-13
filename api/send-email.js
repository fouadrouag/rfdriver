function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function recapHtml(d) {
  return `
    <p><strong>Départ :</strong> ${escapeHtml(d.depart)}</p>
    <p><strong>Arrivée :</strong> ${escapeHtml(d.arrivee)}</p>
    <p><strong>Date :</strong> ${escapeHtml(d.date)} à ${escapeHtml(d.heure)}</p>
    <p><strong>Véhicule :</strong> ${escapeHtml(d.vehicule)}</p>
    <p><strong>Type de trajet :</strong> ${escapeHtml(d.type)}</p>
    <p><strong>Prix estimé :</strong> ${escapeHtml(d.prix)} (à régler à bord)</p>
    <p><strong>Passagers :</strong> ${escapeHtml(d.passagers)} — <strong>Bagages :</strong> ${escapeHtml(d.bagages)}</p>
    ${d.vol ? `<p><strong>Numéro de vol :</strong> ${escapeHtml(d.vol)}</p>` : ''}
    ${d.message ? `<p><strong>Message :</strong> ${escapeHtml(d.message)}</p>` : ''}
  `;
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
    throw new Error('Resend send failed');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body || {};
    const { emailType, nom, prenom, tel, email, depart, arrivee } = data;

    if (!emailType || !nom || !email || !depart || !arrivee) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    if (emailType === 'paiement_bord_client') {
      await sendResendEmail({
        to: email,
        subject: 'Votre demande de réservation RF Driver',
        html: `
          <h2>Votre demande a bien été reçue</h2>
          <p>Bonjour ${escapeHtml(prenom)},</p>
          <p>Votre demande de réservation a bien été enregistrée. Vous réglerez directement auprès de votre chauffeur.</p>
          ${recapHtml(data)}
          <p>Notre équipe va confirmer votre trajet dans les plus brefs délais.</p>
          <p>À bientôt,<br>L'équipe RF Driver</p>
        `
      });
    } else if (emailType === 'paiement_bord_notification') {
      await sendResendEmail({
        to: 'reservations@rfdriver.fr',
        subject: `Nouvelle demande de réservation (paiement à bord) — ${nom} ${prenom}`,
        replyTo: email,
        html: `
          <h2>Nouvelle demande de réservation (paiement à bord)</h2>
          <p><strong>Client :</strong> ${escapeHtml(prenom)} ${escapeHtml(nom)}</p>
          <p><strong>Téléphone :</strong> ${escapeHtml(tel)}</p>
          <p><strong>Email :</strong> ${escapeHtml(email)}</p>
          ${recapHtml(data)}
        `
      });
    } else {
      return res.status(400).json({ error: 'Type d\'email inconnu' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Send-email API error:', err);
    return res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'email' });
  }
}
