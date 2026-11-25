// Lecture automatique d'un CV (PDF ou Word .docx) dans le navigateur, puis repérage des
// informations du candidat et calcul de sa compatibilité avec un poste.
// Rien n'est envoyé à un service extérieur : le texte reste sur l'ordinateur de l'équipe.
import { VILLES, NIVEAUX } from "./listes.js?v=9";
import { normal, motsCles } from "./compatibilite.js?v=1";

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/";
const MAMMOTH = "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js";

let pdfjs = null;
async function chargerPdfjs() {
  if (!pdfjs) {
    pdfjs = await import(`${PDFJS}pdf.min.mjs`);
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.mjs`;
  }
  return pdfjs;
}
let mammothPret = null;
function chargerMammoth() {
  mammothPret ??= new Promise((ok, ko) => {
    if (window.mammoth) return ok(window.mammoth);
    const s = document.createElement("script");
    s.src = MAMMOTH;
    s.onload = () => ok(window.mammoth);
    s.onerror = () => { mammothPret = null; ko(new Error("Lecture Word indisponible")); };
    document.head.append(s);
  });
  return mammothPret;
}

/** Texte brut d'un CV. `erreur` explique pourquoi il n'a pas pu être lu. */
export async function lireTexteCv(fichier) {
  const ext = (fichier.name.split(".").pop() || "").toLowerCase();
  try {
    if (ext === "pdf") {
      const lib = await chargerPdfjs();
      const doc = await lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
      const pages = [];
      for (let n = 1; n <= Math.min(doc.numPages, 6); n++) {
        const contenu = await (await doc.getPage(n)).getTextContent();
        pages.push(contenu.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join(""));
      }
      const texte = pages.join("\n").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
      return texte.replace(/\s/g, "").length < 40
        ? { texte: "", erreur: "CV scanné (image) : le texte ne peut pas être lu, remplissez à la main." }
        : { texte };
    }
    if (ext === "docx") {
      const m = await chargerMammoth();
      const { value } = await m.extractRawText({ arrayBuffer: await fichier.arrayBuffer() });
      return { texte: value.replace(/\n{3,}/g, "\n\n").trim() };
    }
    return { texte: "", erreur: "Ancien format Word (.doc) : il ne peut pas être lu, remplissez à la main." };
  } catch (err) {
    console.warn(err);
    return { texte: "", erreur: "Ce CV n'a pas pu être lu, remplissez à la main." };
  }
}

const TITRES = /^(exp[ée]riences?|parcours|formations?|[ée]tudes|dipl[oô]mes|comp[ée]tences|aptitudes|savoir[- ]faire|qualit[ée]s|langues?|loisirs|centres? d['’]int[ée]r[eê]t|r[ée]f[ée]rences|informatique|profil|objectif|atouts|certifications?)\b/i;
const PAS_UN_NOM = /curriculum|vitae|\bcv\b|r[ée]sum[ée]|profil|adresse|t[ée]l|e-?mail|contact|n[ée]e? le|nationalit|situation|c[ée]libataire|objectif|exp[ée]rience|formation|comp[ée]tence|langue|@|\d|www|http/i;

function trouverNom(lignes) {
  for (const brute of lignes.slice(0, 12)) {
    const l = brute.replace(/^(m\.|mr|mme|mlle|monsieur|madame|mademoiselle)\s+/i, "").trim();
    const mots = l.split(/\s+/);
    if (l.length > 45 || mots.length < 2 || mots.length > 4 || PAS_UN_NOM.test(l)) continue;
    if (!mots.every((m) => /^[\p{L}][\p{L}'’-]*$/u.test(m))) continue;
    if (VILLES.some((v) => normal(l).includes(normal(v)))) continue;
    const maj = mots.filter((m) => m.length > 1 && m === m.toUpperCase());
    const joli = (m) => m.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase());
    if (maj.length && maj.length < mots.length) return { prenom: mots.filter((m) => !maj.includes(m)).map(joli).join(" "), nom: maj.join(" "), ligne: brute };
    return { prenom: joli(mots[0]), nom: mots.slice(1).join(" ").toUpperCase(), ligne: brute };
  }
  return null;
}

function trouverTelephone(texte) {
  const essais = [];
  for (const m of texte.matchAll(/(?:\+|00)?\d[\d\s.\-()/]{6,20}\d/g)) {
    const brut = m[0].trim();
    if (/^(19|20)\d{2}\s*[-–/]\s*(19|20)\d{2}$/.test(brut) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(brut)) continue;
    let ch = brut.replace(/\D/g, "").replace(/^00/, "");
    const local = ch.startsWith("229") ? ch.slice(3) : ch;
    if (local.length < 8 || local.length > 12) continue;
    const avant = texte.slice(Math.max(0, m.index - 25), m.index).toLowerCase();
    let poids = 0;
    if (/t[ée]l|phone|cel|mobile|whatsapp|contact|gsm/.test(avant)) poids += 3;
    if (/^\+|^00|^229/.test(brut.replace(/\s/g, ""))) poids += 2;
    if ((local.length === 10 && local.startsWith("01")) || (local.length === 8 && /^[4-9]/.test(local))) poids += 2;
    essais.push({ brut, poids, i: m.index });
  }
  essais.sort((a, b) => b.poids - a.poids || a.i - b.i);
  return essais[0] && essais[0].poids > 0 ? essais[0].brut.replace(/\s+/g, " ") : null;
}

const NIVEAU_MOTS = [
  ["Doctorat", /doctorat|\bph\.?d\b/],
  ["Master (Bac+5)", /\bmaster|bac\s*\+\s*5|\bdess\b|\bdea\b|ingenieur (de conception|d'etat)|mba\b/],
  ["Licence (Bac+3)", /\blicence|bachelor|bac\s*\+\s*3|\blicence professionnelle/],
  ["BTS / DUT (Bac+2)", /\bbts\b|\bdut\b|bac\s*\+\s*2|\bdeug\b|\bdts\b/],
  ["BAC", /baccalaur|\bbac\b(?!\s*\+)/],
  ["CAP / BT", /\bcap\b|\bbt\b|brevet de technicien/],
  ["BEPC", /\bbepc\b/],
  ["CEP", /\bcep\b/],
];

function section(lignes, titre) {
  const debut = lignes.findIndex((l) => titre.test(l.trim()) && l.length < 60);
  if (debut < 0) return [];
  const fin = lignes.findIndex((l, i) => i > debut && TITRES.test(l.trim()) && !titre.test(l.trim()) && l.length < 60);
  return lignes.slice(debut + 1, fin < 0 ? debut + 25 : fin);
}

function estimerExperience(lignes) {
  const zone = section(lignes, /^(exp[ée]riences?( professionnelles?)?|parcours professionnel)\b/i).join("\n");
  const maintenant = new Date().getFullYear();
  const periodes = [];
  for (const m of zone.matchAll(/((?:19|20)\d{2})\s*(?:[-–—]|à|au|to)\s*(?:(?:à|au|a)\s+)?((?:19|20)\d{2}|ce jour|aujourd['’]hui|pr[ée]sent|present|en cours|nos jours|now)/gi)) {
    const debut = Number(m[1]);
    const fin = /^\d{4}$/.test(m[2]) ? Number(m[2]) : maintenant;
    if (debut <= fin && fin <= maintenant) periodes.push([debut, fin]);
  }
  if (!periodes.length) return null;
  periodes.sort((a, b) => a[0] - b[0]);
  let total = 0, [d, f] = periodes[0];
  for (const [a, b] of periodes.slice(1)) { if (a <= f) f = Math.max(f, b); else { total += f - d; [d, f] = [a, b]; } }
  total += f - d;
  return Math.min(40, Math.max(total, 1));
}

/** Informations repérées dans le texte d'un CV, et la liste de celles qui manquent. */
export function analyserCv(texte) {
  const lignes = texte.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const plat = normal(texte);
  const nom = trouverNom(lignes);
  const email = (texte.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [null])[0]?.toLowerCase() ?? null;
  const telephone = trouverTelephone(texte);
  const entete = normal(lignes.slice(0, 20).join(" "));
  const villeDans = (t) => VILLES.find((v) => new RegExp(`\\b${normal(v).replace("-", "[- ]")}\\b`).test(t)) || null;
  const ville = villeDans(entete) || villeDans(plat);
  const exp = plat.match(/(\d{1,2})\s*(?:\+\s*)?ans?\s+d['’ ]?\s*experience|experience (?:professionnelle )?(?:de |d'au moins |de plus de )?(\d{1,2})\s*ans/);
  const experienceDeclaree = exp ? Number(exp[1] || exp[2]) : null;
  const experience = experienceDeclaree ?? estimerExperience(lignes);
  const niveau = (NIVEAU_MOTS.find(([, re]) => re.test(plat)) || [null])[0];
  const ligneApresNom = nom ? lignes[lignes.indexOf(nom.ligne) + 1] : null;
  const titre = ligneApresNom && ligneApresNom.length < 70 && !PAS_UN_NOM.test(ligneApresNom) && !TITRES.test(ligneApresNom) ? ligneApresNom : null;
  const competences = section(lignes, /^(comp[ée]tences|aptitudes|savoir[- ]faire|atouts|qualit[ée]s)\b/i)
    .map((l) => l.replace(/^[•\-–*▪●◦>]+\s*/, "")).join(", ").slice(0, 300) || null;
  const langues = section(lignes, /^langues?\b/i).map((l) => l.replace(/^[•\-–*▪●◦>]+\s*/, "")).join(", ").slice(0, 120) || null;
  const infos = {
    prenom: nom?.prenom ?? null, nom: nom?.nom ?? null, telephone, email, ville, experience,
    experienceEstimee: experienceDeclaree == null && experience != null, niveau: NIVEAUX.includes(niveau) ? niveau : null,
    titre, competences, langues,
  };
  const manquants = [["nom", "nom"], ["telephone", "téléphone"], ["email", "email"], ["ville", "ville"], ["experience", "expérience"]]
    .filter(([k]) => infos[k] == null).map(([, l]) => l);
  return { ...infos, manquants };
}

const MOTS_OFFRE_VIDES = new Set(["experience", "profil", "mission", "missions", "poste", "candidat", "candidature", "recrute", "recrutement", "rapidement", "envoie", "envoyer", "objet", "postuler", "urgent", "structure", "environ", "aujourd", "quotidien", "idealement", "rigueur", "sens", "plus", "tres", "cotonou", "benin", "entreprise", "etablissement", "partage", "correspond", "connais", "quelqu", "tarde", "pourvoir", "disponible"]);

/** Compatibilité d'un CV lu avec un poste, de 0 à 100, avec les raisons. */
export function scoreCv(texte, infos, poste) {
  const plat = normal(`${texte} ${infos.titre || ""}`);
  const contient = (m) => plat.includes(m.slice(0, Math.max(4, m.length - 2)));
  const raisons = [];
  let score = 0;
  const motsTitre = motsCles(poste.titre);
  const titreTrouves = motsTitre.filter(contient);
  if (motsTitre.length) {
    score += Math.round((40 * titreTrouves.length) / motsTitre.length);
    if (titreTrouves.length) raisons.push(`poste : ${titreTrouves.join(", ")}`);
  }
  const motsOffre = motsCles(poste.details || "").filter((m) => m.length >= 5 && !MOTS_OFFRE_VIDES.has(m) && !motsTitre.includes(m)).slice(0, 30);
  if (motsOffre.length) {
    const trouves = motsOffre.filter(contient);
    score += Math.round((25 * trouves.length) / motsOffre.length);
    if (trouves.length) raisons.push(`${trouves.length}/${motsOffre.length} mots de l'offre`);
  } else score += 10;
  if (poste.ville && infos.ville && normal(infos.ville) === normal(poste.ville)) { score += 15; raisons.push(infos.ville); }
  if (poste.experience_min != null) {
    if (infos.experience != null && infos.experience >= poste.experience_min) { score += 15; raisons.push(`${infos.experience} an(s) d'expérience`); }
    else if (infos.experience != null && infos.experience >= poste.experience_min - 1) score += 8;
  } else if (infos.experience != null && infos.experience >= 2) { score += 10; raisons.push(`${infos.experience} an(s) d'expérience`); }
  if (infos.niveau) { score += 5; raisons.push(infos.niveau); }
  // Même secteur que le poste (ex. hôtellerie, restauration, tourisme) : un vrai signal.
  const secteur = motsCles(poste.domaine || "").filter((m) => m.length >= 5 && plat.includes(m.slice(0, Math.max(5, m.length - 3))));
  if (secteur.length) { score += 10; raisons.push(`secteur : ${secteur.join(", ")}`); }
  return { score: Math.min(100, score), raisons };
}

/** Étape proposée selon le score : présenter, garder sous la main, ou ne pas retenir. */
export const etapeConseillee = (score) => (score >= 65 ? "presente" : score >= 40 ? "source" : "refuse");
