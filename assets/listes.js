// Listes partagées par le formulaire public et l'espace équipe.
// Chaque domaine a la couleur de son onglet de classeur.
export const DOMAINES = [
  ["Administration & secrétariat", "#7F9CC4"],
  ["Comptabilité & finance", "#5F9474"],
  ["Banque & assurance", "#3F7189"],
  ["Commerce & vente", "#D4A03A"],
  ["Marketing & communication", "#C7765C"],
  ["Informatique & digital", "#5866AD"],
  ["Ressources humaines", "#9C78AE"],
  ["Juridique", "#7C6B56"],
  ["BTP & génie civil", "#C4842F"],
  ["Industrie & maintenance", "#6F7E89"],
  ["Transport & logistique", "#3F9393"],
  ["Agriculture & agroalimentaire", "#86A04E"],
  ["Santé", "#CB7184"],
  ["Éducation & formation", "#D9B13F"],
  ["Hôtellerie, restauration & tourisme", "#B0614A"],
  ["ONG & développement", "#4F8A60"],
  ["Sécurité & gardiennage", "#4D5868"],
  ["Services à la personne", "#B0879A"],
  ["Autre domaine", "#9E9C92"],
];
export const couleurDomaine = (d) => (DOMAINES.find(([n]) => n === d) || DOMAINES[DOMAINES.length - 1])[1];

export const CONTRATS = ["CDI", "CDD", "Stage", "Alternance / apprentissage", "Freelance / mission", "Temps partiel", "Bénévolat"];
// Villes reconnues dans les offres collées et dans les CV lus automatiquement.
export const VILLES = ["Cotonou", "Porto-Novo", "Abomey-Calavi", "Calavi", "Godomey", "Parakou", "Bohicon", "Abomey", "Ouidah", "Lokossa", "Natitingou", "Djougou", "Kandi", "Malanville", "Allada", "Sèmè-Podji", "Pobè", "Kétou", "Savalou", "Dassa-Zoumè", "Grand-Popo", "Comè", "Aplahoué", "Nikki", "Lomé", "Abidjan", "Dakar", "Ouagadougou", "Niamey", "Lagos"];
export const NIVEAUX = ["Sans diplôme", "CEP", "BEPC", "CAP / BT", "BAC", "BTS / DUT (Bac+2)", "Licence (Bac+3)", "Master (Bac+5)", "Doctorat"];
export const DISPONIBILITES = ["Immédiate", "Sous 2 semaines", "Sous 1 mois", "Plus tard (en poste)"];
export const STATUTS = [
  ["nouveau", "Nouveau"],
  ["qualifie", "Qualifié"],
  ["propose", "Proposé"],
  ["entretien", "En entretien"],
  ["place", "Placé"],
  ["archive", "Archivé"],
];
export const libelleStatut = (s) => (STATUTS.find(([k]) => k === s) || [s, s])[1];
// Étapes du pipeline d'un candidat sur un poste, dans l'ordre du processus.
export const ETAPES = [
  ["source", "Sourcé"],
  ["contacte", "Contacté"],
  ["presente", "Présenté au client"],
  ["entretien", "Entretien"],
  ["offre", "Offre"],
  ["place", "Placé"],
  ["refuse", "Non retenu"],
];
export const libelleEtape = (e) => (ETAPES.find(([k]) => k === e) || [e, e])[1];
export const TYPES_ACTIVITE = [
  ["appel", "Appel"],
  ["whatsapp", "WhatsApp"],
  ["email", "Email"],
  ["entretien", "Entretien"],
  ["rencontre", "Rencontre"],
  ["note", "Note"],
];
export const STATUTS_ENTREPRISE = [
  ["client", "Client"],
  ["prospect", "Prospect"],
  ["inactif", "Inactif"],
];
export const STATUTS_DEMANDE = [
  ["ouverte", "Ouverte"],
  ["pourvue", "Pourvue"],
  ["fermee", "Fermée"],
];
