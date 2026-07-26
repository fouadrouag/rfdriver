export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ reply: "Méthode non autorisée." });
  }

  try {
    const { history } = req.body;

    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ reply: "Merci de poser une question." });
    }

    // On garde uniquement les 12 derniers échanges pour limiter les coûts
    const trimmedHistory = history.slice(-12).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content).slice(0, 500)
    }));

    const systemPrompt = `Tu es l'assistant virtuel du site RF Driver, un service de chauffeur privé (VTC) basé dans l'Oise (Ribécourt-Dreslincourt).

INFORMATIONS SUR RF DRIVER :
- Flotte : Classique (jusqu'à 4 passagers, dès 25€), Berline (jusqu'à 3 passagers, dès 35€, confort et discrétion), Van Classe V (jusqu'à 7 passagers, dès 50€, familles et groupes)
- Mise à disposition avec chauffeur : Classique 40€/h, Berline 55€/h, Van Classe V 90€/h
- Zones desservies : RF Driver dessert en priorité l'Oise, Paris et l'Île-de-France pour les trajets du quotidien, mais propose aussi des trajets longue distance et de la mise à disposition PARTOUT en France et à l'international (Europe et au-delà) sur demande, sans restriction géographique. Ne dis jamais qu'une destination n'est "pas couverte" — indique plutôt que ce type de trajet est possible sur devis personnalisé.
- Services : transferts aéroports (CDG, Orly, Beauvais, Le Bourget), gares parisiennes, déplacements professionnels, événements, tourisme/excursions, transport de groupe, longue distance (France et international), mise à disposition, transport sécurisé de documents et objets précieux
- Annulation : remboursement intégral si annulation +24h avant, 50% entre 6h et 24h avant, aucun remboursement -6h avant
- Disponibilité : 24h/24, 7j/7 sur réservation
- Contact : 06 05 71 77 11, WhatsApp, contact@rfdriver.fr

RÈGLES GÉNÉRALES :
1. Réponds toujours dans la MÊME LANGUE que le client (détecte automatiquement sa langue à partir de son message, même si le reste de la conversation était dans une autre langue).
2. Réponds de façon courte, chaleureuse et professionnelle (2-3 phrases maximum), en te basant sur l'historique de la conversation pour ne pas répéter des questions déjà posées.
3. Ne donne jamais d'information sur des sujets sans rapport avec RF Driver.
4. Pour toute question de PRIX PRÉCIS ou devis général (hors demande de réservation active), redirige vers le calculateur à l'adresse /reservation.html, sans calculer toi-même.
5. Ne dis jamais qu'une destination n'est pas desservie — RF Driver dessert toutes destinations en France et à l'international sur demande (longue distance).

RÈGLES POUR UNE DEMANDE DE RÉSERVATION :
Si le client exprime une intention de réserver un trajet, tu dois collecter ces 6 informations :
- Nom du client
- Lieu de départ
- Destination
- Date
- Heure
- Nombre de passagers

IMPORTANT : ne pose JAMAIS ces questions une par une. Dès que le client exprime une intention de réserver, identifie en une seule fois TOUTES les informations parmi les 6 qui manquent encore, et demande-les TOUTES ENSEMBLE dans un seul message groupé (ex: "Avec plaisir ! Pouvez-vous me communiquer votre nom, le lieu de départ, la destination, la date, l'heure et le nombre de passagers ?"). Si le client a déjà donné certaines infos dans son message initial, ne redemande que celles qui manquent, mais toujours groupées en une seule question.

Dès que tu as TOUTES ces 6 informations, indique au client dans ta réponse qu'il a deux possibilités : voir le prix exact de son trajet via le calculateur de réservation en ligne (/reservation.html), ou envoyer directement sa demande à RF Driver sur WhatsApp sans passer par le calculateur. Présente ces deux options clairement et brièvement.

Dès que tu as TOUTES ces 6 informations, termine ta réponse par une ligne EXACTEMENT sous ce format (sans rien changer à la syntaxe), en remplaçant les valeurs par les vraies informations collectées, sur une seule ligne :
WHATSAPP_MESSAGE: Bonjour, je m'appelle [nom]. Je souhaite réserver un trajet de [départ] à [destination] le [date] à [heure] pour [nombre] passager(s).

Ne mets cette ligne QUE lorsque les 6 informations sont toutes connues. Tant qu'il en manque, pose une seule question groupée demandant tout ce qui manque, sans cette ligne.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...trimmedHistory
        ],
        max_tokens: 300,
        temperature: 0.5
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI API error:', errText);
      return res.status(200).json({
        reply: "Désolé, je rencontre un souci technique. Contactez-nous directement par WhatsApp pour une réponse rapide."
      });
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content?.trim()
      || "Désolé, je n'ai pas pu répondre. Contactez-nous par WhatsApp.";

    // Extraction du message WhatsApp pré-rempli si présent
    let whatsappMessage = null;
    const marker = 'WHATSAPP_MESSAGE:';
    const markerIndex = reply.indexOf(marker);
    if (markerIndex !== -1) {
      whatsappMessage = reply.slice(markerIndex + marker.length).trim();
      reply = reply.slice(0, markerIndex).trim();
    }

    return res.status(200).json({ reply, whatsappMessage });

  } catch (error) {
    console.error('Assistant API error:', error);
    return res.status(200).json({
      reply: "Une erreur est survenue. Contactez-nous directement par WhatsApp."
    });
  }
}
