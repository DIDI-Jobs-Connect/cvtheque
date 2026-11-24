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
  chaineWhatsapp: "",
};
