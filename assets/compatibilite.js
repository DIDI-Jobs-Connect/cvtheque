// Compatibilité candidat ↔ poste. Même calcul partout : « Profils compatibles » de l'espace
// équipe, offres proposées après un dépôt de CV et badges de la page « Nos recrutements ».
// Pas d'import de client.js ici : chaque page le charge avec sa propre version.
const sansAccents = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const MOTS_VIDES = new Set(["pour", "avec", "dans", "des", "les", "une", "sur", "confirme", "confirmee", "junior", "senior"]);
export const normal = (t) => sansAccents(String(t || "").toLowerCase());
export const motsCles = (t) => [...new Set(normal(t).split(/[^a-z0-9+#]+/).filter((m) => m.length > 2 && !MOTS_VIDES.has(m)))];

/** Score de 0 à 100 d'un candidat `c` pour un poste `d`, avec les raisons lisibles. */
export function scorer(c, d) {
  const raisons = [];
  let score = 0;
  const experience = c.experience === "" || c.experience == null ? null : Number(c.experience);
  if (d.domaine && c.domaine === d.domaine) { score += 30; raisons.push("même domaine"); }
  const mots = motsCles(d.titre);
  if (mots.length) {
    const texte = normal(`${c.postes} ${c.competences || ""}`);
    const trouves = mots.filter((m) => texte.includes(m.slice(0, Math.max(4, m.length - 2))));
    if (trouves.length) { score += Math.round((30 * trouves.length) / mots.length); raisons.push(`poste : ${trouves.join(", ")}`); }
  }
  if (d.ville && c.ville && (normal(c.ville).includes(normal(d.ville)) || normal(d.ville).includes(normal(c.ville)))) { score += 15; raisons.push(c.ville); }
  if (d.experience_min != null) {
    if (experience != null && experience >= d.experience_min) { score += 10; raisons.push(`${experience} an(s) d'expérience`); }
    else if (experience != null && experience >= d.experience_min - 1) score += 5;
  } else if (experience != null) score += 5;
  if (d.contrat) { if ((c.contrats || []).includes(d.contrat)) { score += 10; raisons.push(d.contrat); } }
  else score += 5;
  if (c.disponibilite === "Immédiate") { score += 5; raisons.push("dispo. immédiate"); }
  else if (c.disponibilite === "Sous 2 semaines") score += 3;
  return { score: Math.min(100, score), raisons };
}

// Seuil à partir duquel une offre est présentée comme « compatible » au candidat.
export const SEUIL_CANDIDAT = 50;

/** Offres compatibles avec un profil, de la meilleure à la moins bonne. */
export const offresCompatibles = (profil, offres, exclure = []) => offres
  .filter((o) => !exclure.includes(o.id))
  .map((o) => ({ o, ...scorer(profil, o) }))
  .filter((x) => x.score >= SEUIL_CANDIDAT)
  .sort((a, b) => b.score - a.score);

// Profil gardé sur l'appareil du candidat après son dépôt, pour repérer les offres qui lui
// correspondent. Jamais le CV, le nom, le téléphone ni l'email.
const CLE = "cvtheque-profil";
export function memoriserProfil(d, postulees = []) {
  try {
    localStorage.setItem(CLE, JSON.stringify({
      domaine: d.domaine, postes: d.postes, ville: d.ville, contrats: d.contrats || [],
      experience: d.experience, disponibilite: d.disponibilite, competences: String(d.competences || "").slice(0, 300),
      postulees, le: new Date().toISOString(),
    }));
  } catch { /* stockage indisponible (navigation privée) : rien à faire */ }
}
export function profilMemorise() {
  try { return JSON.parse(localStorage.getItem(CLE) || "null"); } catch { return null; }
}
export function oublierProfil() {
  try { localStorage.removeItem(CLE); } catch { /* rien */ }
}
export function noterCandidature(id) {
  const p = profilMemorise();
  if (!p) return;
  p.postulees = [...new Set([...(p.postulees || []), id])];
  try { localStorage.setItem(CLE, JSON.stringify(p)); } catch { /* rien */ }
}
