import { CONFIG } from "./config.js";
import { sb, configuree, esc, verifierCv, envoyerCv } from "./client.js";
import { DOMAINES, CONTRATS, NIVEAUX, DISPONIBILITES, couleurDomaine } from "./listes.js";

const $ = (s) => document.querySelector(s);
const form = $("#depot");
const erreur = $("#erreur");

$("#nom-cvtheque").textContent = CONFIG.nom;
const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
document.querySelectorAll(".nom-organisation").forEach((n) => (n.textContent = CONFIG.organisation || "notre équipe"));
if (!configuree) $("#config-manquante").hidden = false;

$("#domaines").innerHTML = DOMAINES.map(
  ([nom, c], i) => `<label class="chemise" style="--c:${c};--i:${i}">
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

// ---------- Mouvement ----------
// Le métier du titre change toutes les 2,6 s (arrêté si l'utilisateur limite les animations).
const METIERS = ["comptable", "commercial(e)", "assistant(e) RH", "développeur web", "infirmier(e)", "chauffeur", "stagiaire", "technicien(ne)", "caissier(ère)", "logisticien(ne)"];
const mot = $("#metier");
const trait = $("#metier-trait");
const mesurer = () => trait.style.setProperty("--largeur", `${mot.offsetWidth}px`);
mesurer();
document.fonts?.ready.then(mesurer);
if (!reduit) {
  let n = 0;
  setInterval(() => {
    if (document.hidden) return;
    mot.classList.remove("entre");
    mot.classList.add("sort");
    setTimeout(() => {
      n = (n + 1) % METIERS.length;
      mot.textContent = METIERS[n];
      mot.classList.remove("sort");
      mot.classList.add("entre");
      mesurer();
      trait.classList.remove("trace");
      void trait.offsetWidth;
      trait.classList.add("trace");
    }, 200);
  }, 2600);
}

// Les étapes apparaissent quand on y arrive.
const etapes = document.querySelectorAll(".etape");
if ("IntersectionObserver" in window && !reduit) {
  const obs = new IntersectionObserver((entrees) => {
    for (const e of entrees) if (e.isIntersecting) { e.target.classList.remove("attend"); obs.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px" });
  etapes.forEach((el, i) => { if (i > 0) { el.classList.add("attend"); obs.observe(el); } });
}

// Barre de progression : part des informations obligatoires déjà remplies.
function progression() {
  const f = new FormData(form);
  const cv = f.get("cv");
  const faits = [
    f.get("domaine"), (f.get("postes") || "").trim().length > 1, (f.get("prenom") || "").trim(), (f.get("nom") || "").trim(),
    (f.get("telephone") || "").replace(/\D/g, "").length >= 8, (f.get("ville") || "").trim(), cv instanceof File && cv.size > 0, f.get("consentement"),
  ].filter(Boolean).length;
  $("#progression").style.setProperty("--p", (faits / 8).toFixed(3));
}
form.addEventListener("input", progression);
form.addEventListener("change", progression);

// Dossier choisi : il saute et on confirme le rangement.
$("#domaines").addEventListener("change", (e) => {
  const chemise = e.target.closest(".chemise");
  document.querySelectorAll(".chemise.saute").forEach((c) => c.classList.remove("saute"));
  void chemise.offsetWidth;
  chemise.classList.add("saute");
  $("#choix-domaine").textContent = `✓ Votre CV sera rangé dans « ${e.target.value} »`;
});

// Fichier du CV : glisser-déposer et confirmation du fichier choisi.
const zone = document.querySelector(".fichier");
const champCv = form.querySelector('[name="cv"]');
["dragenter", "dragover"].forEach((t) => zone.addEventListener(t, () => zone.classList.add("survol")));
["dragleave", "drop"].forEach((t) => zone.addEventListener(t, () => zone.classList.remove("survol")));
champCv.addEventListener("change", () => {
  const f = champCv.files[0];
  const v = f ? verifierCv(f) : null;
  zone.classList.toggle("rempli", Boolean(f && !v.erreur));
  $("#fichier-choisi").innerHTML = f
    ? v.erreur
      ? `<span class="erreur">${esc(v.erreur)}</span>`
      : `<span class="feuille-mini"></span>${esc(f.name)} <small class="aide">(${Math.max(1, Math.round(f.size / 1024))} Ko)</small>`
    : "";
});

function signalerErreur(texte) {
  erreur.textContent = texte;
  erreur.classList.remove("secoue");
  void erreur.offsetWidth;
  erreur.classList.add("secoue");
}

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
    signalerErreur(probleme);
    return;
  }
  if (!configuree) {
    signalerErreur("La CVthèque n'est pas encore reliée à sa base de données.");
    return;
  }
  const bouton = $("#bouton-envoi");
  bouton.disabled = true;
  bouton.classList.add("charge");
  bouton.textContent = "Envoi en cours…";
  try {
    d.cv_chemin = await envoyerCv(fichier, "depots");
    d.cv_nom = fichier.name.slice(0, 200);
    const { data, error } = await sb.rpc("deposer_cv", { d });
    if (error) throw error;
    confirmer(d, data);
  } catch (err) {
    console.error(err);
    signalerErreur(/Failed to fetch|NetworkError|network/i.test(String(err?.message))
      ? "Connexion impossible. Vérifiez votre connexion internet puis réessayez."
      : "L'envoi n'a pas abouti. Réessayez dans un instant ; si le problème continue, envoyez-nous votre CV sur WhatsApp.");
    bouton.classList.remove("charge");
    bouton.disabled = false;
    bouton.textContent = "Envoyer mon CV";
  }
});

function confirmer(d, resultat) {
  $("#zone-formulaire").hidden = true;
  const bloc = $("#confirmation");
  bloc.hidden = false;
  $(".progression").hidden = true;
  const couleur = couleurDomaine(d.domaine);
  $("#scene-dossier").style.setProperty("--c", couleur);
  // Confettis aux couleurs DIDI et du domaine.
  const teintes = ["#4263f0", "#ff9f1c", couleur, "#0b1026"];
  $("#confettis").innerHTML = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
    const portee = 90 + Math.random() * 70;
    return `<span style="--couleur:${teintes[i % 4]};--x:${Math.round(Math.cos(angle) * portee)}px;--y:${Math.round(Math.sin(angle) * portee - 40)}px;--r:${Math.round(Math.random() * 540 - 270)}deg;--d:${Math.round(Math.random() * 120)}"></span>`;
  }).join("");
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
