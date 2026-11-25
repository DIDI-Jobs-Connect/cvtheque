import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";
import { CONFIG } from "./config.js?v=11";

export const configuree = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseCle);
export const sb = configuree ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseCle) : null;

/** Échappe un texte avant de l'insérer dans du HTML (les fiches viennent du public). */
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
export const sansAccents = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

export const TAILLE_MAX = 5 * 1024 * 1024;
const TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
/** Vérifie un fichier de CV ; renvoie { ext, type } ou un message d'erreur. */
export function verifierCv(f) {
  if (!f) return { erreur: "Ajoutez votre CV (PDF ou Word)." };
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  if (!TYPES[ext]) return { erreur: "Le CV doit être un fichier PDF ou Word (.pdf, .doc, .docx)." };
  if (f.size > TAILLE_MAX) return { erreur: "Le fichier dépasse 5 Mo. Enregistrez-le en PDF pour l'alléger." };
  return { ext, type: TYPES[ext] };
}
export async function envoyerCv(f, dossier) {
  const v = verifierCv(f);
  if (v.erreur) throw new Error(v.erreur);
  const chemin = `${dossier}/${crypto.randomUUID()}.${v.ext}`;
  const { error } = await sb.storage.from("cv").upload(chemin, f, { contentType: v.type, upsert: false });
  if (error) throw error;
  return chemin;
}
