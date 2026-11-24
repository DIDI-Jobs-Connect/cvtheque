// Transfert des candidats du site DIDI Jobs Connect vers la CVthèque (Supabase).
//
// - Seuls les candidats qui ont coché « figurer dans la CVthèque » sur le site sont transférés.
// - Un candidat déjà présent (même email ou même téléphone) n'est pas dupliqué : on complète
//   seulement son CV s'il n'en avait pas.
// - Relançable sans risque. Le journal n'affiche que des chiffres, jamais de noms.
//
// Variables d'environnement (secrets GitHub) :
//   SITE_DATABASE_URL          adresse de la base du site (postgresql://…)
//   SUPABASE_URL               https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  clé « service_role » ou « secret » de Supabase
//   ESSAI = "oui"              simulation : compte sans rien écrire
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";

const nettoyer = (v) => (v || "").trim().replace(/^["']|["']$/g, "").trim();
const SITE_DATABASE_URL = nettoyer(process.env.SITE_DATABASE_URL);
const SUPABASE_URL = nettoyer(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = nettoyer(process.env.SUPABASE_SERVICE_ROLE_KEY);
// Sur GitHub, les erreurs s'affichent aussi en haut de la page du résumé.
const erreurInitiale = console.error;
console.error = (...m) => erreurInitiale(process.env.GITHUB_ACTIONS ? "::error::" + m.join(" ") : m.join(" "));
process.on("unhandledRejection", (err) => { console.error(`Erreur inattendue : ${err?.code || ""} ${String(err?.message || err).replace(/postgres(ql)?:\/\/\S+/g, "[adresse masquée]")}`); process.exit(1); });
const ESSAI = (process.env.ESSAI || "oui").toLowerCase() !== "non";
for (const [k, v] of Object.entries({ SITE_DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
  if (!v) { console.error(`Secret manquant : ${k}`); process.exit(1); }
}

const DOMAINES = {
  "Administration / Gestion": "Administration & secrétariat",
  "Agriculture / Agroalimentaire": "Agriculture & agroalimentaire",
  "Banque / Finance / Assurance": "Banque & assurance",
  "BTP / Immobilier": "BTP & génie civil",
  "Commerce / Vente": "Commerce & vente",
  "Communication / Marketing": "Marketing & communication",
  "Éducation / Formation": "Éducation & formation",
  "Hôtellerie / Restauration": "Hôtellerie, restauration & tourisme",
  "Informatique / Numérique": "Informatique & digital",
  "Logistique / Transport": "Transport & logistique",
  "ONG / Projets": "ONG & développement",
  "Ressources humaines": "Ressources humaines",
  "Santé": "Santé",
};
const NIVEAUX = {
  "Sans diplôme exigé": "Sans diplôme", "CEP / BEPC": "BEPC", "BAC": "BAC", "BAC+2 (BTS, DUT…)": "BTS / DUT (Bac+2)",
  "BAC+3 (Licence)": "Licence (Bac+3)", "BAC+4/5 (Master)": "Master (Bac+5)", "Doctorat": "Doctorat",
};
const EXPERIENCES = { "Débutant accepté": 0, "Moins d'1 an": 0, "1 à 3 ans": 1, "3 à 5 ans": 3, "Plus de 5 ans": 5 };
const DISPOS = ["Immédiate", "Sous 2 semaines", "Sous 1 mois", "Plus tard (en poste)"];
const TYPES = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const chiffresTel = (t) => (String(t || "").replace(/\D/g, "").replace(/^(00)?229/, "") || null);

function separerNom(nom) {
  const mots = String(nom || "").trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return { prenom: mots[0] || "?", nom: "" };
  // « DOSSOU Cadnel » : le nom de famille en majuscules vient en premier.
  if (mots[0] === mots[0].toUpperCase() && mots.slice(1).some((m) => m !== m.toUpperCase())) {
    return { prenom: mots.slice(1).join(" "), nom: mots[0] };
  }
  return { prenom: mots[0], nom: mots.slice(1).join(" ") };
}

function extension(f) {
  const ext = (f.filename.split(".").pop() || "").toLowerCase();
  if (TYPES[ext]) return ext;
  return Object.entries(TYPES).find(([, t]) => t === f.mimeType)?.[0] || null;
}

const site = new pg.Client({ connectionString: SITE_DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(SITE_DATABASE_URL) ? false : { rejectUnauthorized: false } });
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Vérification de la clé Supabase avant de commencer.
{
  const { error } = await sb.from("candidats").select("id", { head: true, count: "exact" });
  if (error) {
    const cle = SUPABASE_SERVICE_ROLE_KEY;
    const genre = cle.startsWith("sb_publishable_") ? "une clé « publishable » (publique)"
      : cle.startsWith("sb_secret_") ? "une clé « secret »"
      : cle.startsWith("eyJ") ? "une clé de type « anon » ou « service_role »"
      : "une valeur qui ne ressemble pas à une clé Supabase";
    console.error(`Clé Supabase refusée (${error.message}). Le secret SUPABASE_SERVICE_ROLE_KEY contient ${genre}, de ${cle.length} caractères.`);
    console.error("Il faut la clé « secret » (sb_secret_…) ou « service_role » (eyJ…, environ 200 caractères) du projet CVthèque : Supabase → Project Settings → API Keys.");
    process.exit(1);
  }
  if (SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_publishable_") || SUPABASE_SERVICE_ROLE_KEY.length < 40) {
    console.error("Le secret SUPABASE_SERVICE_ROLE_KEY contient la clé publique : prenez la clé « secret » ou « service_role ».");
    process.exit(1);
  }
}

try {
  await site.connect();
} catch (err) {
  console.error("Connexion à la base du site impossible. Vérifiez SITE_DATABASE_URL, et que la base n'est pas en pause chez Netlify.");
  console.error(`Détail technique : ${err.code || ""} ${String(err.message).replace(/postgres(ql)?:\/\/\S+/g, "[adresse masquée]")}`);
  process.exit(1);
}

const { rows: totaux } = await site.query(`
  select count(*)::int as candidats,
         count(*) filter (where p."cvthequeOptIn")::int as accord
    from "User" u left join "CandidateProfile" p on p."userId" = u.id
   where u.role = 'CANDIDATE' and u."isActive"`);
console.log(`Candidats actifs sur le site : ${totaux[0].candidats}, dont ${totaux[0].accord} ont accepté la CVthèque.`);

const totalSite = totaux[0];
const { rows } = await site.query(`
  select u.id, u.name, u.email, u.phone, p.city, p.zone, p.field, p.diploma, p.specialty, p."educationLevel",
         p."experienceLevel", p.skills, p.availability, p.headline, p."isStudent", p.school, p."updatedAt",
         r."fileId"
    from "User" u
    join "CandidateProfile" p on p."userId" = u.id and p."cvthequeOptIn"
    left join lateral (select "fileId" from "Resume" where "userId" = u.id order by "isPrimary" desc, "createdAt" desc limit 1) r on true
   where u.role = 'CANDIDATE' and u."isActive"
   order by u."createdAt"`);

const bilan = { nouveaux: 0, cvAjoute: 0, dejaPresents: 0, sansCv: 0, cvIgnore: 0, erreurs: 0 };

for (const c of rows) {
  try {
    const email = c.email ? c.email.trim().toLowerCase() : null;
    const tel = chiffresTel(c.phone);
    const filtres = [email && !/[,()]/.test(email) ? `email.eq.${email}` : null, tel ? `telephone_chiffres.eq.${tel}` : null].filter(Boolean);
    const { data: existants, error: e1 } = await sb.from("candidats").select("id, cv_chemin").or(filtres.join(",")).limit(1);
    if (e1) throw e1;
    const existant = existants?.[0];
    if (existant?.cv_chemin) { bilan.dejaPresents++; continue; }

    // Le CV (stocké dans la base du site).
    let cv = null;
    if (c.fileId) {
      const { rows: f } = await site.query(`select filename, "mimeType", size, data from "StoredFile" where id = $1`, [c.fileId]);
      const fichier = f[0];
      const ext = fichier && extension(fichier);
      if (fichier && ext && fichier.size <= 5 * 1024 * 1024) cv = { ext, fichier };
      else bilan.cvIgnore++;
    }
    if (!cv) bilan.sansCv++;

    if (ESSAI) { existant ? (cv && bilan.cvAjoute++) : bilan.nouveaux++; continue; }

    let chemin = null;
    if (cv) {
      chemin = `import/${randomUUID()}.${cv.ext}`;
      const { error: e2 } = await sb.storage.from("cv").upload(chemin, cv.fichier.data, { contentType: TYPES[cv.ext], upsert: false });
      if (e2) throw e2;
    }

    if (existant) {
      if (!chemin) { bilan.dejaPresents++; continue; }
      const { error: e3 } = await sb.from("candidats").update({ cv_chemin: chemin, cv_nom: cv.fichier.filename.slice(0, 200), modifie_le: new Date().toISOString() }).eq("id", existant.id);
      if (e3) throw e3;
      bilan.cvAjoute++;
      continue;
    }

    const { prenom, nom } = separerNom(c.name);
    const dispo = DISPOS.find((d) => d.toLowerCase() === String(c.availability || "").trim().toLowerCase()) || null;
    const infos = [c.diploma && `Diplôme : ${c.diploma}`, c.school && `École : ${c.school}`, c.isStudent && "Étudiant(e)", !dispo && c.availability && `Disponibilité : ${c.availability}`].filter(Boolean);
    const { data: cree, error: e4 } = await sb.from("candidats").insert({
      prenom: prenom.slice(0, 80), nom: nom.slice(0, 80),
      email, telephone: c.phone, telephone_chiffres: tel,
      ville: c.city || c.zone || null, pays: "Bénin",
      domaine: DOMAINES[c.field] || "Autre domaine",
      postes: (c.headline || c.specialty || c.diploma || c.field || "À préciser").slice(0, 300),
      contrats: c.isStudent ? ["Stage"] : [],
      niveau: NIVEAUX[c.educationLevel] || null,
      experience: EXPERIENCES[c.experienceLevel] ?? null,
      disponibilite: dispo,
      competences: (c.skills || []).join(", ").slice(0, 1000) || null,
      message: infos.join(" · ").slice(0, 1000) || null,
      cv_chemin: chemin, cv_nom: chemin ? cv.fichier.filename.slice(0, 200) : null,
      source: "site",
      consentement_le: c.updatedAt,
    }).select("id").single();
    if (e4) throw e4;
    await sb.from("notes").insert({ candidat_id: cree.id, auteur: "Import", type: "note", texte: "Importé depuis le site DIDI Jobs Connect (accord CVthèque donné sur le site)." });
    bilan.nouveaux++;
  } catch (err) {
    bilan.erreurs++;
    console.error(`Erreur sur un candidat : ${err.code || ""} ${err.message || err}`);
  }
}

await site.end();
console.log(ESSAI ? "SIMULATION (rien n'a été écrit) :" : "TRANSFERT TERMINÉ :");
console.log(`  ${ESSAI ? "seraient ajoutés" : "ajoutés"} : ${bilan.nouveaux}`);
console.log(`  CV ${ESSAI ? "qui seraient " : ""}ajoutés à une fiche existante : ${bilan.cvAjoute}`);
console.log(`  déjà dans la CVthèque avec un CV : ${bilan.dejaPresents}`);
console.log(`  sans CV téléversé sur le site : ${bilan.sansCv}`);
console.log(`  CV ignorés (format non PDF/Word ou plus de 5 Mo) : ${bilan.cvIgnore}`);
console.log(`  erreurs : ${bilan.erreurs}`);
// Bilan en grand sur la page « Summary » de GitHub.
const resume = [
  `## ${ESSAI ? "Simulation (rien n'a été écrit)" : "Transfert terminé"}`,
  "",
  `**Candidats actifs sur le site : ${totalSite.candidats}**, dont **${totalSite.accord}** ont accepté la CVthèque (les autres ne sont pas transférés).`,
  "",
  "| | Nombre |",
  "| --- | ---: |",
  `| ${ESSAI ? "Seraient ajoutés" : "Ajoutés"} à la CVthèque | **${bilan.nouveaux}** |`,
  `| CV ${ESSAI ? "qui seraient ajoutés" : "ajoutés"} à une fiche existante | ${bilan.cvAjoute} |`,
  `| Déjà dans la CVthèque avec un CV | ${bilan.dejaPresents} |`,
  `| Sans CV téléversé sur le site | ${bilan.sansCv} |`,
  `| CV ignorés (pas PDF/Word, ou plus de 5 Mo) | ${bilan.cvIgnore} |`,
  `| Erreurs | ${bilan.erreurs} |`,
  "",
  ESSAI ? "Pour transférer pour de vrai : **Run workflow** avec « non »." : "Les candidats apparaissent dans l'espace équipe avec la provenance « Site ».",
].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resume + "\n");
if (process.env.GITHUB_ACTIONS) console.log(`::notice title=${ESSAI ? "Simulation" : "Transfert"}::${totalSite.accord} candidats avec accord sur ${totalSite.candidats}. ${ESSAI ? "Seraient ajoutés" : "Ajoutés"} : ${bilan.nouveaux}. CV ajoutés à des fiches existantes : ${bilan.cvAjoute}. Déjà présents : ${bilan.dejaPresents}. Erreurs : ${bilan.erreurs}.`);
if (bilan.erreurs) process.exitCode = 1;
