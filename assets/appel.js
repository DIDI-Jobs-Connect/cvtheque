// Script d'appel de présélection et grille de notation, générés pour chaque poste.
// Le script suit l'ordre de l'annonce : critères bloquants, expérience, missions,
// mises en situation, motivation, puis présentation du poste.

const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PUCE = /^\s*(?:[-*•·▪►✓✔✅➡️👉]|\d+[.)])\s*/u;

// Lignes à puces de l'annonce, rangées par section (missions, profil, autre).
export function lirePuces(details) {
  const sections = { missions: [], profil: [], autre: [] };
  let courante = "autre";
  for (const brute of String(details || "").split(/\n+/)) {
    const ligne = brute.trim();
    if (!ligne) continue;
    const nue = ligne.replace(PUCE, "").replace(/^[^\p{L}\d]+/u, "").replace(/[:\s]+$/, "");
    const enTete = nue.split(/\s+/).length <= 5 && !/[.;,]/.test(nue);
    const t = sansAccents(nue);
    if (enTete && /mission|tache|responsabilit|role|ce que (tu|vous) (feras|ferez)/.test(t)) { courante = "missions"; continue; }
    if (enTete && /profil|exigence|qualification|competences requises|recherch|requis|critere/.test(t)) { courante = "profil"; continue; }
    if (enTete && /postuler|avantage|offrons|structure|entreprise|contact|candidature/.test(t)) { courante = "autre"; continue; }
    if (PUCE.test(ligne)) {
      const texte = ligne.replace(PUCE, "").replace(/\s+/g, " ").trim();
      if (texte.length > 3) sections[courante].push(texte.replace(/[.;]$/, ""));
    }
  }
  if (!sections.missions.length && !sections.profil.length) sections.missions = sections.autre.slice(0, 3);
  return sections;
}

export const estEncadrement = (titre) => /responsable|chef|manager|directeur|directrice|superviseur|coordinat|gerant|gerante|superviseu/.test(sansAccents(titre));

// Mises en situation par domaine : ce sont les questions qui révèlent le plus.
const SITUATIONS = {
  "Hôtellerie, restauration & tourisme": [
    ["Client mécontent", "Un client arrive le soir et trouve sa chambre ou sa table mal préparée. Il s'énerve devant tout le monde. Vous faites quoi ?", "S'excuse, trouve une solution tout de suite (autre chambre, geste commercial), suit le client, puis règle le problème avec l'équipe."],
    ["Absence dans l'équipe", "Une personne de l'équipe ne vient pas un jour où l'établissement est plein. Comment vous vous organisez ?", "Réorganise les tâches, met la main à la pâte, prévient la direction, cherche un remplaçant."],
    ["Contrôle qualité", "Comment vous vérifiez qu'une chambre ou une salle est vraiment prête avant l'arrivée du client ?", "Une méthode précise : liste de contrôle, passage systématique, points vérifiés."],
  ],
  "Commerce & vente": [
    ["Objection prix", "Un client vous dit : « C'est trop cher, je vais voir ailleurs. » Vous répondez quoi ?", "Écoute, reformule, met en avant la valeur, propose une alternative sans casser le prix tout de suite."],
    ["Objectif en retard", "On est le 20 du mois et vous êtes à 50 % de votre objectif. Vous faites quoi ?", "Analyse ses chiffres, relance ses prospects chauds, augmente le nombre de visites ou d'appels, en parle à son responsable."],
    ["Prospection", "Comment vous trouvez de nouveaux clients quand personne ne vous les donne ?", "Des méthodes concrètes : terrain, recommandations, réseaux, fichier, relances."],
  ],
  "Administration & secrétariat": [
    ["Urgences en même temps", "Votre responsable vous demande un document urgent et, en même temps, un visiteur attend et le téléphone sonne. Vous faites quoi ?", "Priorise calmement, fait patienter avec courtoisie, garde le contrôle."],
    ["Classement", "Comment vous organisez le classement des documents pour retrouver n'importe quel dossier en deux minutes ?", "Une méthode claire, physique et numérique."],
    ["Confidentialité", "Un collègue vous demande une information confidentielle sur un dossier. Vous réagissez comment ?", "Refuse poliment et renvoie vers le responsable."],
  ],
  "Comptabilité & finance": [
    ["Écart de caisse", "En fin de journée, la caisse présente un écart de 15 000 FCFA. Vous faites quoi ?", "Recompte, vérifie les pièces, retrace les opérations, signale et documente."],
    ["Clôture", "Comment vous préparez une clôture mensuelle ? Quelles étapes ?", "Rapprochements bancaires, lettrage, contrôle des pièces, états."],
    ["Pression", "Votre directeur vous demande d'enregistrer une dépense sans justificatif. Vous réagissez comment ?", "Refuse ou demande le justificatif, explique le risque."],
  ],
  "Informatique & digital": [
    ["Panne", "Un utilisateur vous appelle : plus rien ne marche sur son poste et il a une réunion dans 10 minutes. Vous faites quoi ?", "Diagnostic rapide, solution de contournement, puis résolution de fond."],
    ["Projet", "Racontez-moi un projet technique que vous avez mené du début à la fin.", "Contexte, outils, difficultés, résultat mesurable."],
    ["Apprendre", "Comment vous faites pour apprendre une nouvelle technologie rapidement ?", "Une méthode concrète, des exemples récents."],
  ],
  "Transport & logistique": [
    ["Retard de livraison", "Une livraison importante va être en retard. Le client appelle. Vous faites quoi ?", "Informe le client honnêtement, propose une nouvelle heure, trouve une solution."],
    ["Stock", "Vous constatez un écart entre le stock réel et le stock théorique. Vous faites quoi ?", "Recompte, vérifie les mouvements, signale, corrige la procédure."],
    ["Sécurité", "Un chauffeur ou un collègue ne respecte pas les règles de sécurité. Vous réagissez comment ?", "Intervient tout de suite, explique, signale si ça se répète."],
  ],
  "Ressources humaines": [
    ["Conflit", "Deux employés sont en conflit et l'ambiance se dégrade. Vous faites quoi ?", "Écoute chacun séparément, cherche les faits, organise une médiation."],
    ["Recrutement urgent", "On vous demande de recruter un profil en une semaine. Comment vous vous y prenez ?", "Besoin clarifié, canaux de sourcing, tri, entretiens rapides."],
    ["Paie", "Un salarié conteste son bulletin de paie. Vous faites quoi ?", "Vérifie les éléments, explique, corrige si erreur."],
  ],
};
const SITUATIONS_GENERIQUES = [
  ["Problème avec un client", "Racontez-moi une fois où un client ou un usager était mécontent. Qu'est-ce que vous avez fait ?", "Une situation réelle, une action concrète, un résultat."],
  ["Imprévu", "Vous avez trop de travail et une urgence arrive. Comment vous choisissez ce que vous faites en premier ?", "Priorise, prévient, reste calme."],
  ["Erreur", "Parlez-moi d'une erreur que vous avez faite au travail et de ce que vous en avez appris.", "Reconnaît l'erreur, explique la correction, a changé sa façon de faire."],
];

// Grille sur 30 : 6 critères notés de 1 à 5.
export function criteres(d) {
  const metier = d.domaine && d.domaine !== "Autre domaine" ? d.domaine.split(/[,&]/)[0].trim().toLowerCase() : "le métier";
  return [
    ["experience", `Expérience réelle en ${metier}`],
    estEncadrement(d.titre) ? ["encadrement", "Encadrement d'équipe"] : ["missions", "Maîtrise des missions du poste"],
    ["situations", "Réponses aux mises en situation"],
    ["organisation", "Organisation et rigueur"],
    ["oral", "Expression et présentation orale"],
    ["motivation", "Motivation pour ce poste"],
  ];
}

// Critères bloquants : un seul non validé, et le candidat n'est pas transmis.
export function bloquants(d) {
  return [
    d.ville ? ["ville", `Peut travailler à ${d.ville}`] : ["ville", "Lieu de travail possible pour lui"],
    ["dispo", d.echeance ? `Disponible avant le ${new Date(d.echeance).toLocaleDateString("fr-FR")}` : "Disponible dans les délais"],
    ["salaire", d.salaire ? `Prétentions compatibles (${d.salaire})` : "Prétentions compatibles avec le budget"],
    ...(d.experience_min ? [["experience_min", `Au moins ${d.experience_min} an(s) d'expérience`]] : []),
  ];
}

export const SEUIL_PRESENTER = 24;
export const SEUIL_RESERVE = 18;

export function conseil(total, bloquantsOk) {
  if (!bloquantsOk) return { etape: "refuse", texte: "Un critère bloquant n'est pas validé : ne pas transmettre." };
  if (total >= SEUIL_PRESENTER) return { etape: "presente", texte: "À présenter au client." };
  if (total >= SEUIL_RESERVE) return { etape: "contacte", texte: "À garder en réserve." };
  return { etape: "refuse", texte: "Profil trop juste : ne pas transmettre." };
}

const minuscule = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// Le script, en sections. Chaque question peut avoir une « bonne réponse » attendue.
export function scriptAppel(d, organisation = "DIDI Jobs Connect", moi = "Cadnel") {
  const { missions, profil } = lirePuces(d.details);
  const encadrement = estEncadrement(d.titre);
  const lieu = d.ville ? ` à ${d.ville}` : "";
  const situations = SITUATIONS[d.domaine] || SITUATIONS_GENERIQUES;
  const profilUtile = profil.filter((p) => !/disponib|dispo\b/i.test(sansAccents(p)));

  const sections = [
    {
      titre: "Ouverture",
      duree: "1 min",
      questions: [
        { dire: `Bonjour, je suis ${moi} de ${organisation}. Vous avez envoyé votre CV pour le poste de ${d.titre}${lieu}. Vous avez dix minutes pour en parler maintenant ?` },
        { dire: "Je vais vous poser quelques questions sur votre parcours. Ensuite je vous présente le poste, et vous pourrez me poser vos questions." },
      ],
      astuce: "S'il n'est pas disponible, fixez un créneau précis : « Demain à 10 h, ça vous va ? »",
    },
    {
      titre: "Critères bloquants",
      duree: "2 min",
      astuce: "Commencez par eux. Si un seul ne passe pas, vous pouvez écourter l'appel poliment.",
      questions: [
        { dire: d.ville ? `Vous habitez où actuellement ? Travailler à ${d.ville}, c'est possible pour vous ?` : "Vous habitez où actuellement ? Le lieu de travail vous convient ?" },
        { dire: "Si vous êtes retenu, vous pouvez commencer quand ?", attendu: d.echeance ? `Le poste est à pourvoir pour le ${new Date(d.echeance).toLocaleDateString("fr-FR")}.` : "Le poste est urgent : au-delà de deux semaines, c'est un risque." },
        { dire: "Quelle est votre prétention salariale mensuelle ?", attendu: d.salaire ? `Budget annoncé : ${d.salaire}. Notez le chiffre exact, sans commenter.` : "Notez le chiffre exact, sans commenter." },
        { dire: "Vous êtes en poste en ce moment ? Il y a un préavis à respecter ?" },
        ...(d.contrat ? [{ dire: `Le contrat proposé est un ${d.contrat}. Ça vous convient ?` }] : []),
      ],
    },
    {
      titre: "Expérience",
      duree: "3 min",
      questions: [
        { dire: "Racontez-moi votre dernier poste : quelle structure, quelle taille, quel était votre rôle exactement ?" },
        ...(d.experience_min ? [{ dire: `Au total, vous avez combien d'années d'expérience dans ce métier ?`, attendu: `Minimum demandé : ${d.experience_min} an(s).` }] : []),
        ...(encadrement ? [{ dire: "Vous avez déjà dirigé une équipe ? Combien de personnes, et quels postes ?", attendu: "Des chiffres précis et des exemples concrets de gestion d'équipe." }] : []),
        { dire: "Comment se passait une journée type pour vous ?", attendu: "Écoutez s'il décrit des tâches proches des missions du poste." },
        ...missions.slice(0, 3).map((m) => ({ dire: `Une des missions du poste : “${m}”. Vous l'avez déjà fait ? Racontez-moi comment.`, attendu: "Un exemple réel, avec du concret (chiffres, outils, résultats)." })),
        ...profilUtile.slice(0, 2).map((p) => ({ dire: `Le poste demande : “${minuscule(p)}”. Qu'est-ce qui, dans votre parcours, le montre ?` })),
      ],
    },
    {
      titre: "Mises en situation",
      duree: "3 min",
      astuce: "Ce sont les questions les plus révélatrices. Posez-en deux ou trois.",
      questions: situations.map(([titre, dire, attendu]) => ({ titre, dire, attendu: `Bonne réponse : ${minuscule(attendu)}` })),
    },
    {
      titre: "Motivation",
      duree: "1 min",
      questions: [
        { dire: "Pourquoi ce poste vous intéresse ?" },
        { dire: "Pourquoi vous voulez quitter votre poste actuel ? (ou : pourquoi votre dernier poste s'est arrêté ?)" },
      ],
    },
    {
      titre: "Présentation du poste et clôture",
      duree: "1 min",
      astuce: "Ne donnez pas le nom de l'entreprise tant que le candidat n'est pas présenté au client.",
      questions: [
        { dire: `C'est un poste de ${d.titre}${lieu}${d.contrat ? `, en ${d.contrat}` : ""}.${missions.length ? ` Vos missions : ${missions.slice(0, 3).map(minuscule).join(" ; ")}.` : ""}` },
        { dire: "Vous avez des questions ?" },
        { dire: "Merci pour cet échange. Je transmets les profils retenus au client cette semaine. Si votre profil est retenu, je vous rappelle pour l'entretien. Votre numéro WhatsApp est bien celui-ci ?" },
      ],
    },
  ];
  return sections;
}

// Version texte, pour copier le script et le garder sous les yeux pendant l'appel.
export function scriptTexte(d, organisation, moi) {
  const lignes = [`SCRIPT D'APPEL : ${d.titre}${d.ville ? ` (${d.ville})` : ""}`, ""];
  scriptAppel(d, organisation, moi).forEach((s, i) => {
    lignes.push(`${i + 1}. ${s.titre.toUpperCase()} (${s.duree})`);
    if (s.astuce) lignes.push(`   ${s.astuce}`);
    s.questions.forEach((q) => {
      lignes.push(`- ${q.titre ? `${q.titre} : ` : ""}${q.dire}`);
      if (q.attendu) lignes.push(`  → ${q.attendu}`);
    });
    lignes.push("");
  });
  lignes.push("GRILLE (note de 1 à 5)");
  criteres(d).forEach(([, l]) => lignes.push(`- ${l} : …/5`));
  lignes.push("Total : …/30");
  lignes.push(`${SEUIL_PRESENTER} à 30 : présenter au client. ${SEUIL_RESERVE} à ${SEUIL_PRESENTER - 1} : en réserve. Moins de ${SEUIL_RESERVE} ou critère bloquant non validé : ne pas transmettre.`);
  return lignes.join("\n");
}
