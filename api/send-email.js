function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function recapRows(d) {
  const rows = [
    ['Départ', d.depart],
    ['Arrivée', d.arrivee],
    ['Date', `${d.date} à ${d.heure}`],
    ['Véhicule', d.vehicule],
    ['Type de trajet', d.type],
    ['Prix estimé', `${d.prix} — à régler à bord ⏳`],
    ['Mode de paiement', 'À bord (auprès du chauffeur)'],
    ['Passagers', d.passagers],
    ['Bagages', d.bagages]
  ];
  if (d.vol) rows.push(['N° de vol', d.vol]);
  if (d.message) rows.push(['Message', d.message]);

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
              <div style="color:#C9A84C;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">Chauffeur privé — Paris &amp; Oise</div>
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

async function sendResendEmail({ to, subject, html, replyTo }) {
  const payload = {
    from: 'RF Driver <reservation@rfdriver.fr>',
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
        html: emailShell({
          preheader: 'Votre demande de réservation a bien été reçue.',
          title: 'Votre demande a bien été reçue',
          intro: `Bonjour ${escapeHtml(prenom)},<br><br>Votre demande de réservation a bien été enregistrée. Vous réglerez directement auprès de votre chauffeur.`,
          recapHtmlBlock: recapRows(data),
          outro: `Notre équipe va confirmer votre trajet dans les plus brefs délais.<br><br>À bientôt,<br><strong>L'équipe RF Driver</strong>`
        })
      });
    } else if (emailType === 'paiement_bord_notification') {
      await sendResendEmail({
        to: 'reservation@rfdriver.fr',
        subject: `Nouvelle demande de réservation (paiement à bord) — ${nom} ${prenom}`,
        replyTo: email,
        html: emailShell({
          preheader: `Nouvelle demande de ${prenom} ${nom}`,
          title: 'Nouvelle demande de réservation',
          intro: `<strong>Client :</strong> ${escapeHtml(prenom)} ${escapeHtml(nom)}<br><strong>Téléphone :</strong> ${escapeHtml(tel)}<br><strong>Email :</strong> ${escapeHtml(email)}<br><strong>Paiement :</strong> à bord`,
          recapHtmlBlock: recapRows(data),
          outro: ''
        })
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
