export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { nom, tel, email, objet, message } = req.body || {};

    if (!nom || !tel || !email || !message) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const objetLabels = {
      vtc: 'Réservation chauffeur privé',
      van: 'Van / Groupe',
      devis: 'Devis',
      autre: 'Autre'
    };
    const objetLabel = objetLabels[objet] || 'Non précisé';

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'RF Driver <contact@rfdriver.fr>',
        to: ['contact@rfdriver.fr'],
        reply_to: email,
        subject: `Nouvelle demande de contact — ${nom}`,
        html: `
          <h2>Nouvelle demande via le formulaire de contact</h2>
          <p><strong>Nom :</strong> ${escapeHtml(nom)}</p>
          <p><strong>Téléphone :</strong> ${escapeHtml(tel)}</p>
          <p><strong>Email :</strong> ${escapeHtml(email)}</p>
          <p><strong>Objet :</strong> ${escapeHtml(objetLabel)}</p>
          <p><strong>Message :</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        `
      })
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error('Resend error:', errText);
      return res.status(502).json({ error: 'Erreur lors de l\'envoi de l\'email' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Contact API error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
