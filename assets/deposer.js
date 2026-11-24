import { CONFIG } from "./config.js";
import { sb, configuree, esc, verifierCv, envoyerCv } from "./client.js";
import { DOMAINES, CONTRATS, NIVEAUX, DISPONIBILITES, couleurDomaine } from "./listes.js";

const $ = (s) => document.querySelector(s);
const form = $("#depot");
const erreur = $("#erreur");

$("#nom-cvtheque").textContent = CONFIG.nom;
$("#organisation").textContent = CONFIG.organisation;
document.querySelectorAll(".nom-organisation").forEach((n) => (n.textContent = CONFIG.organisation || "notre équipe"));
if (!configuree) $("#config-manquante").hidden = false;

$("#domaines").innerHTML = DOMAINES.map(
  ([nom, c]) => `<label class="chemise" style="--c:${c}">
      <input type="radio" name="domaine" value="${esc(nom)}" required>
      <span class="onglet"></span><span class="corps">${esc(nom)}</span>
    </label>`,
).join("");
$("#contrats").innerHTML = CONTRATS.map(
  (c) => `<label class="case"><input type="checkbox" name="contrats" value="${esc(c)}"> ${esc(c)}</label>`,
).join("");
const options = (liste, vide) => `<option value="">${vide}</option>` + liste.map((v) => `<option>${esc(v)}</option>`).join("");
$("#niveau").innerHTML = options(NIVEAUX, "Choisir…");
$("#disponibilite").innerHTML = options(DISPONIBILITES, "Choisir…");

// ?source=chaine, ?source=accompagnement… : d'où vient la personne (visible dans l'espace équipe).
const source = new URLSearchParams(location.search).get("source")?.slice(0, 60) || "formulaire";

function verifier(d, fichier) {
  if (!d.domaine) return "Choisissez votre domaine.";
  if (!d.postes || d.postes.length < 2) return "Indiquez le ou les postes que vous recherchez.";
  if (!d.prenom || !d.nom) return "Indiquez votre prénom et votre nom.";
  if (!d.telephone || d.telephone.replace(/\D/g, "").length < 8) return "Indiquez un numéro de téléphone joignable.";
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return "L'adresse email n'est pas valide.";
  if (!d.ville) return "Indiquez votre ville ou commune.";
  const cv = verifierCv(fichier);
  if (cv.erreur) return cv.erreur;
  if (!d.consentement) return "Cochez la case d'accord pour que nous puissions conserver votre CV.";
  return null;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  erreur.textContent = "";
  const f = new FormData(form);
  if (f.get("site_web")) return; // robot
  const fichier = f.get("cv") instanceof File && f.get("cv").size ? f.get("cv") : null;
  const d = {
    domaine: f.get("domaine") || "",
    postes: (f.get("postes") || "").trim(),
    contrats: f.getAll("contrats"),
    disponibilite: f.get("disponibilite") || "",
    pretentions: (f.get("pretentions") || "").trim(),
    prenom: (f.get("prenom") || "").trim(),
    nom: (f.get("nom") || "").trim(),
    telephone: (f.get("telephone") || "").trim(),
    email: (f.get("email") || "").trim(),
    ville: (f.get("ville") || "").trim(),
    pays: (f.get("pays") || "").trim(),
    niveau: f.get("niveau") || "",
    experience: f.get("experience") || "",
    competences: (f.get("competences") || "").trim(),
    langues: (f.get("langues") || "").trim(),
    linkedin: (f.get("linkedin") || "").trim(),
    message: (f.get("message") || "").trim(),
    consentement: f.get("consentement") === "on",
    source,
  };
  const probleme = verifier(d, fichier);
  if (probleme) {
    erreur.textContent = probleme;
    return;
  }
  if (!configuree) {
    erreur.textContent = "La CVthèque n'est pas encore reliée à sa base de données.";
    return;
  }
  const bouton = $("#bouton-envoi");
  bouton.disabled = true;
  bouton.textContent = "Envoi en cours…";
  try {
    d.cv_chemin = await envoyerCv(fichier, "depots");
    d.cv_nom = fichier.name.slice(0, 200);
    const { data, error } = await sb.rpc("deposer_cv", { d });
    if (error) throw error;
    confirmer(d, data);
  } catch (err) {
    console.error(err);
    erreur.textContent = /Failed to fetch|NetworkError|network/i.test(String(err?.message))
      ? "Connexion impossible. Vérifiez votre connexion internet puis réessayez."
      : "L'envoi n'a pas abouti. Réessayez dans un instant ; si le problème continue, envoyez-nous votre CV sur WhatsApp.";
    bouton.disabled = false;
    bouton.textContent = "Envoyer mon CV";
  }
});

function confirmer(d, resultat) {
  $("#zone-formulaire").hidden = true;
  const bloc = $("#confirmation");
  bloc.hidden = false;
  $("#chemise-classee").style.setProperty("--c", couleurDomaine(d.domaine));
  $("#confirmation-titre").textContent =
    resultat === "mis_a_jour" ? `Merci ${d.prenom}, votre dossier est mis à jour.` : `Merci ${d.prenom}, votre CV est classé.`;
  $("#confirmation-texte").textContent = `Il est rangé dans « ${d.domaine} », pour les postes : ${d.postes}.`;
  if (CONFIG.chaineWhatsapp) {
    const lien = $("#lien-chaine");
    lien.href = CONFIG.chaineWhatsapp;
    lien.hidden = false;
  }
  bloc.focus();
  window.scrollTo({ top: 0 });
}

$("#partager").addEventListener("click", async () => {
  const url = location.origin + location.pathname;
  const texte = "Tu cherches un emploi ? Dépose ton CV ici, on t'appelle quand un poste te correspond :";
  if (navigator.share) {
    try { await navigator.share({ title: "Déposer mon CV", text: texte, url }); } catch { /* annulé */ }
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${texte} ${url}`)}`, "_blank", "noopener");
  }
});
