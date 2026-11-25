// Réglages de la CVthèque. Les deux valeurs Supabase se trouvent dans Supabase →
// Project Settings → API (« Project URL » et clé « anon » ou « publishable »).
// Elles sont faites pour être publiques : la sécurité vient des règles de la base.
// Ne mettez JAMAIS ici la clé « service_role » ou « secret ».
export const CONFIG = {
  nom: "CVthèque",
  organisation: "DIDI Jobs Connect",
  supabaseUrl: "https://orgnclnbwrmsuluntmrr.supabase.co",
  supabaseCle: "sb_publishable_vIr1c_a8DcHWvVr9lc7jew_UnKtFYF6",
  // Lien de votre chaîne WhatsApp, proposé après un dépôt (laisser vide pour ne rien afficher).
  chaineWhatsapp: "https://whatsapp.com/channel/0029VbCvS879WtC1T1Xq8L0b",
  // Numéro WhatsApp affiché aux entreprises et aux recruteurs (ex. "22901XXXXXXXX"), vide = masqué.
  whatsappContact: "2290154776858",
  // Formules proposées aux entreprises sur la page « Vous recrutez ? ».
  // Montants d'exemple : modifiez-les librement (texte libre).
  formules: [
    {
      nom: "Shortlist express",
      prix: "20 000 FCFA",
      unite: "par poste",
      resume: "3 à 5 profils présélectionnés dans notre CVthèque, envoyés sous 72\u00a0h.",
      points: ["Tri des CV selon votre besoin", "Appel de vérification de chaque candidat", "Dossiers prêts à être convoqués"],
    },
    {
      nom: "Recrutement clé en main",
      prix: "50 % du 1er salaire",
      unite: "payable à l'embauche",
      resume: "Nous menons le recrutement jusqu'à la prise de poste.",
      points: ["Publication de l'offre et sourcing", "Entretiens de présélection", "Suivi jusqu'à l'intégration", "Remplacement gratuit sous 1 mois"],
      conseillee: true,
    },
    {
      nom: "Chasse de cadres",
      prix: "Dès 150 000 FCFA",
      unite: "sur devis",
      resume: "Recherche ciblée de profils expérimentés ou rares, en toute discrétion.",
      points: ["Approche directe de candidats en poste", "Évaluation approfondie", "Rapport détaillé par candidat"],
    },
  ],
};
