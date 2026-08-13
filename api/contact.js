function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function emailShell({ preheader, title, intro, recapHtmlBlock }) {
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
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #C9A84C;padding-top:4px;">
                ${recapHtmlBlock}
              </table>
              ` : ''}
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

    const recapHtmlBlock = `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #EDEDED;color:#8A8F92;font-size:13px;width:140px;vertical-align:top;">Téléphone</td>
        <td style="padding:10px 0;border-bottom:1px solid #EDEDED;color:#263238;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(tel)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #EDEDED;color:#8A8F92;font-size:13px;width:140px;vertical-align:top;">Objet</td>
        <td style="padding:10px 0;border-bottom:1px solid #EDEDED;color:#263238;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(objetLabel)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #EDEDED;color:#8A8F92;font-size:13px;width:140px;vertical-align:top;">Message</td>
        <td style="padding:10px 0;border-bottom:1px solid #EDEDED;color:#263238;font-size:14px;vertical-align:top;">${escapeHtml(message).replace(/\n/g, '<br>')}</td>
      </tr>
    `;

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
        html: emailShell({
          preheader: `Nouvelle demande de contact de ${nom}`,
          title: 'Nouvelle demande de contact',
          intro: `<strong>Nom :</strong> ${escapeHtml(nom)}<br><strong>Email :</strong> ${escapeHtml(email)}`,
          recapHtmlBlock
        })
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
