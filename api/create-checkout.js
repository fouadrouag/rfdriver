import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      amount, description, customerEmail, customerName,
      nom, prenom, tel, email, date, heure, passagers, bagages, vol, message,
      depart, arrivee, vehicule, type, prix, paiement
    } = req.body || {};

    if (!amount || !customerEmail || !depart || !arrivee) {
      return res.status(400).json({ error: 'Données de réservation incomplètes' });
    }

    const amountCents = Math.round(Number(amount) * 100);
    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: description || 'Trajet RF Driver' },
            unit_amount: amountCents
          },
          quantity: 1
        }
      ],
      metadata: {
        business: 'rfdriver',
        nom: nom || '', prenom: prenom || '', tel: tel || '', email: email || customerEmail || '',
        date: date || '', heure: heure || '', passagers: passagers || '', bagages: bagages || '',
        vol: vol || '', message: message || '', depart: depart || '', arrivee: arrivee || '',
        vehicule: vehicule || '', type: type || '', prix: prix || '', paiement: paiement || 'ligne',
        customerName: customerName || ''
      },
      success_url: `${origin}/reservation.html?payment=success`,
      cancel_url: `${origin}/reservation.html?payment=cancelled`
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Create checkout error:', err);
    return res.status(500).json({ error: 'Impossible de créer la session de paiement' });
  }
}
