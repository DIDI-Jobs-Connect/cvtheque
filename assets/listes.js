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
export const ETAPES = [
  ["propose", "Proposé"],
  ["retenu", "Retenu"],
  ["refuse", "Non retenu"],
];
export const STATUTS_DEMANDE = [
  ["ouverte", "Ouverte"],
  ["pourvue", "Pourvue"],
  ["fermee", "Fermée"],
];
