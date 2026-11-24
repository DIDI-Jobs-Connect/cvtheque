import { CONFIG } from "./config.js";
import { sb, configuree, esc, sansAccents, envoyerCv } from "./client.js";
import {
  DOMAINES, CONTRATS, NIVEAUX, DISPONIBILITES, STATUTS, ETAPES, STATUTS_DEMANDE,
  couleurDomaine, libelleStatut,
} from "./listes.js";

const $ = (s) => document.querySelector(s);
const PAR_PAGE = 40;
const COLONNES_LISTE = "id,cree_le,prenom,nom,telephone,email,ville,postes,domaine,contrats,niveau,experience,disponibilite,statut,note,cv_chemin";
const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const jour = (d) => (d ? dateFr.format(new Date(d)) : "");
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

const etat = {
  vue: "fiches",
  filtres: { domaine: "", statut: "", contrat: "", niveau: "", experience: "", ville: "", disponibilite: "" },
  texte: "",
  tri: "recent",
  page: 0,
  total: 0,
  fiches: [],
  stats: null,
  ouvert: null, // dossier affiché : { c, notes, liens }
  demandes: [],
  demandeOuverte: null, // { d, propositions }
  selectionPour: null, // demande pour laquelle on cherche des profils
};

document.querySelectorAll(".nom-cvtheque").forEach((n) => (n.textContent = CONFIG.nom));

// ---------- Messages ----------
let minuterie;
function flash(texte, erreur = false) {
  const f = $("#flash");
  f.textContent = texte;
  f.classList.toggle("erreur", erreur);
  f.hidden = false;
  clearTimeout(minuterie);
  minuterie = setTimeout(() => (f.hidden = true), 3200);
}
function echec(err, texte = "L'opération n'a pas abouti. Réessayez.") {
  console.error(err);
  flash(texte, true);
}

// ---------- Connexion ----------
function ecran(id) {
  for (const e of ["ecran-connexion", "ecran-refuse", "appli"]) $("#" + e).hidden = e !== id;
}

async function demarrer() {
  if (!configuree) {
    $("#config-manquante").hidden = false;
    return;
  }
  const { data } = await sb.auth.getSession();
  await afficherSession(data.session);
  sb.auth.onAuthStateChange((evenement, session) => {
    if (evenement === "SIGNED_OUT") afficherSession(null);
  });
}

async function afficherSession(session) {
  if (!session) return ecran("ecran-connexion");
  const { data: membre, error } = await sb.from("equipe").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (error || !membre) {
    $("#email-refuse").textContent = session.user.email;
    return ecran("ecran-refuse");
  }
  $("#email-compte").textContent = session.user.email;
  ecran("appli");
  await Promise.all([chargerStats(), chargerDemandes()]);
  rendreFiltres();
  await chargerFiches();
}

$("#form-connexion").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const zone = $("#erreur-connexion");
  zone.textContent = "";
  const { data, error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("mdp") });
  if (error) {
    zone.textContent = /invalid/i.test(error.message) ? "Email ou mot de passe incorrect." : "Connexion impossible. Réessayez.";
    return;
  }
  afficherSession(data.session);
});

// ---------- Statistiques et filtres ----------
async function chargerStats() {
  const { data, error } = await sb.rpc("stats_cvtheque");
  if (!error) etat.stats = data;
}

const options = (liste, vide, valeur) =>
  `<option value="">${vide}</option>` +
  liste.map((v) => {
    const [k, l] = Array.isArray(v) ? v : [v, v];
    return `<option value="${esc(k)}"${k === valeur ? " selected" : ""}>${esc(l)}</option>`;
  }).join("");

function rendreFiltres() {
  const f = etat.filtres;
  const comptes = etat.stats?.domaines || {};
  $("#filtres").innerHTML = `
    <div>
      <h2>Domaines</h2>
      <div class="onglets-domaines">
        <button type="button" data-domaine="" aria-pressed="${!f.domaine}" style="--c:var(--encre)"><i></i>Tous les domaines<em>${etat.stats?.total ?? ""}</em></button>
        ${DOMAINES.map(([n, c]) => `<button type="button" data-domaine="${esc(n)}" aria-pressed="${f.domaine === n}" style="--c:${c}"><i></i>${esc(n)}<em>${comptes[n] || ""}</em></button>`).join("")}
      </div>
    </div>
    <label class="champ"><span>Statut</span><select data-filtre="statut">${options(STATUTS, "Tous sauf archivés", f.statut)}</select></label>
    <label class="champ"><span>Contrat</span><select data-filtre="contrat">${options(CONTRATS, "Tous", f.contrat)}</select></label>
    <label class="champ"><span>Niveau d'études</span><select data-filtre="niveau">${options(NIVEAUX, "Tous", f.niveau)}</select></label>
    <label class="champ"><span>Expérience minimale (ans)</span><input type="number" min="0" max="60" data-filtre="experience" value="${esc(f.experience)}"></label>
    <label class="champ"><span>Ville</span><input type="text" data-filtre="ville" value="${esc(f.ville)}" placeholder="Ex. : Cotonou"></label>
    <label class="champ"><span>Disponibilité</span><select data-filtre="disponibilite">${options(DISPONIBILITES, "Toutes", f.disponibilite)}</select></label>
    <button type="button" class="bouton discret petit" data-action="reinitialiser">Effacer les filtres</button>`;
}

$("#filtres").addEventListener("change", (e) => {
  const cle = e.target.dataset.filtre;
  if (!cle) return;
  etat.filtres[cle] = e.target.value.trim();
  etat.page = 0;
  chargerFiches();
});

let attente;
$("#recherche").addEventListener("input", (e) => {
  clearTimeout(attente);
  attente = setTimeout(() => {
    etat.texte = e.target.value.trim();
    etat.page = 0;
    if (etat.vue !== "fiches") changerVue("fiches");
    else chargerFiches();
  }, 300);
});

// ---------- Fiches ----------
function requeteFiches(colonnes, avecCompte) {
  const f = etat.filtres;
  let q = sb.from("candidats").select(colonnes, avecCompte ? { count: "exact" } : undefined);
  if (f.domaine) q = q.eq("domaine", f.domaine);
  q = f.statut ? q.eq("statut", f.statut) : q.neq("statut", "archive");
  if (f.contrat) q = q.contains("contrats", [f.contrat]);
  if (f.niveau) q = q.eq("niveau", f.niveau);
  if (f.experience !== "" && !Number.isNaN(Number(f.experience))) q = q.gte("experience", Number(f.experience));
  if (f.ville) q = q.ilike("ville", `%${f.ville.replace(/[%_]/g, "")}%`);
  if (f.disponibilite) q = q.eq("disponibilite", f.disponibilite);
  if (etat.texte) q = q.textSearch("recherche", sansAccents(etat.texte), { type: "websearch", config: "french" });
  if (etat.tri === "experience") q = q.order("experience", { ascending: false, nullsFirst: false });
  else if (etat.tri === "note") q = q.order("note", { ascending: false, nullsFirst: false });
  else if (etat.tri === "nom") q = q.order("nom").order("prenom");
  return q.order("cree_le", { ascending: false });
}

async function chargerFiches() {
  const debut = etat.page * PAR_PAGE;
  const { data, error, count } = await requeteFiches(COLONNES_LISTE, true).range(debut, debut + PAR_PAGE - 1);
  if (error) return echec(error, "Impossible de charger les fiches.");
  etat.fiches = data;
  etat.total = count ?? data.length;
  rendreFiches();
}

function ligneFiche(c) {
  const details = [
    c.ville,
    c.experience != null ? `${c.experience} an${c.experience > 1 ? "s" : ""} d'expérience` : "",
    c.niveau,
    (c.contrats || []).join(", "),
    c.disponibilite ? `Dispo. ${c.disponibilite.toLowerCase()}` : "",
  ].filter(Boolean);
  return `<button type="button" class="fiche" data-fiche="${c.id}" style="--c:${couleurDomaine(c.domaine)}" aria-current="${etat.ouvert?.c.id === c.id}">
      <span><span class="qui">${esc(c.prenom)} ${esc(c.nom)}</span><br><span class="poste">${esc(c.postes)}</span></span>
      <span class="cote"><span class="tampon ${esc(c.statut)}">${esc(libelleStatut(c.statut))}</span>${c.note ? `<span class="etoiles" aria-label="${c.note} sur 5">${"★".repeat(c.note)}</span>` : ""}</span>
      <span class="details">${details.map((d) => `<span>${esc(d)}</span>`).join("")}<span class="date">Reçu le ${jour(c.cree_le)}</span></span>
    </button>`;
}

function rendreFiches() {
  const s = etat.stats || {};
  const filtresActifs = Object.values(etat.filtres).some(Boolean) || etat.texte;
  const pages = Math.max(1, Math.ceil(etat.total / PAR_PAGE));
  const liste = etat.fiches.length
    ? `<div class="fiches">${etat.fiches.map(ligneFiche).join("")}</div>`
    : filtresActifs
      ? `<div class="vide"><h2>Aucune fiche ne correspond</h2><p>Retirez un filtre ou essayez d'autres mots, par exemple le poste sans le lieu.</p></div>`
      : `<div class="vide"><h2>La CVthèque est vide pour l'instant</h2><p>Partagez le lien du formulaire de dépôt sur votre chaîne, ou ajoutez une fiche vous-même avec « Ajouter une fiche ».</p></div>`;
  $("#contenu").innerHTML = `
    ${etat.selectionPour ? `<div class="bandeau"><span>Vous choisissez des profils pour la demande <b>${esc(etat.selectionPour.titre)}</b>. Ouvrez une fiche puis « Proposer pour cette demande ».</span><button class="bouton petit secondaire" style="color:#fff;border-color:#fff" type="button" data-action="fin-selection">Terminer</button></div>` : ""}
    <div class="resume">
      <h1>${filtresActifs ? `${etat.total} fiche${etat.total > 1 ? "s" : ""} trouvée${etat.total > 1 ? "s" : ""}` : "Fiches"}</h1>
      <div class="chiffres">
        <span><b>${s.total ?? "–"}</b> ${pluriel(s.total, "profil actif", "profils actifs")}</span>
        <span><b>${s.semaine ?? "–"}</b> ${pluriel(s.semaine, "reçu", "reçus")} cette semaine</span>
        <span><b>${s.demandes ?? "–"}</b> ${pluriel(s.demandes, "demande ouverte", "demandes ouvertes")}</span>
      </div>
      <div class="outils">
        <label><span class="visuellement-cache">Trier</span>
          <select id="tri">
            ${[["recent", "Plus récents"], ["experience", "Plus expérimentés"], ["note", "Mieux notés"], ["nom", "Nom (A-Z)"]].map(([k, l]) => `<option value="${k}"${etat.tri === k ? " selected" : ""}>${l}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="bouton discret petit" data-action="exporter">Exporter (Excel)</button>
      </div>
    </div>
    ${liste}
    ${pages > 1 ? `<nav class="pagination" aria-label="Pages">
        <button type="button" class="bouton discret petit" data-page="${etat.page - 1}" ${etat.page === 0 ? "disabled" : ""}>Précédente</button>
        <span>Page ${etat.page + 1} sur ${pages}</span>
        <button type="button" class="bouton discret petit" data-page="${etat.page + 1}" ${etat.page + 1 >= pages ? "disabled" : ""}>Suivante</button>
      </nav>` : ""}`;
  $("#tri").addEventListener("change", (e) => {
    etat.tri = e.target.value;
    etat.page = 0;
    chargerFiches();
  });
}

// ---------- Dossier d'un candidat ----------
async function ouvrirFiche(id) {
  const [c, notes, liens] = await Promise.all([
    sb.from("candidats").select("*").eq("id", id).single(),
    sb.from("notes").select("*").eq("candidat_id", id).order("cree_le", { ascending: false }),
    sb.from("demande_candidats").select("etape, demande_id, demandes(titre, statut)").eq("candidat_id", id),
  ]);
  if (c.error) return echec(c.error, "Impossible d'ouvrir ce dossier.");
  etat.ouvert = { c: c.data, notes: notes.data || [], liens: liens.data || [] };
  rendreDossier();
  document.querySelectorAll(".fiche").forEach((b) => b.setAttribute("aria-current", String(b.dataset.fiche === id)));
}

function numeroWhatsapp(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (!String(tel).trim().startsWith("+") && !d.startsWith("229") && (d.length === 8 || d.length === 10)) d = "229" + d;
  return d;
}

function rendreDossier() {
  const { c, notes, liens } = etat.ouvert;
  const wa = numeroWhatsapp(c.telephone);
  const ligne = (t, v) => (v ? `<dt>${t}</dt><dd>${v}</dd>` : "");
  const demandesOuvertes = etat.demandes.filter((d) => d.statut === "ouverte" && !liens.some((l) => l.demande_id === d.id));
  const panneau = $("#dossier");
  panneau.style.setProperty("--c", couleurDomaine(c.domaine));
  panneau.innerHTML = `
    <div class="tete">
      <div class="tete-ligne">
        <div><h2>${esc(c.prenom)} ${esc(c.nom)}</h2><p class="poste">${esc(c.postes)}</p></div>
        <button type="button" class="bouton discret petit fermer" data-action="fermer">Fermer</button>
      </div>
      <div class="actions">
        ${c.cv_chemin ? `<button type="button" class="bouton petit" data-action="voir-cv">Voir le CV</button>
          <button type="button" class="bouton secondaire petit" data-action="telecharger-cv">Télécharger</button>` : ""}
        ${wa ? `<a class="bouton secondaire petit" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(`Bonjour ${c.prenom}, `)}">WhatsApp</a>` : ""}
        ${c.telephone ? `<a class="bouton discret petit" href="tel:${esc(c.telephone.replace(/[^\d+]/g, ""))}">Appeler</a>` : ""}
        ${c.email ? `<a class="bouton discret petit" href="mailto:${esc(c.email)}">Email</a>` : ""}
      </div>
      <div class="reglages">
        <label><span class="visuellement-cache">Statut</span><select id="statut-dossier">${STATUTS.map(([k, l]) => `<option value="${k}"${c.statut === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <span class="note-etoiles" role="group" aria-label="Note">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-note="${n}" aria-pressed="${(c.note || 0) >= n}" aria-label="${n} sur 5">★</button>`).join("")}</span>
        ${etat.selectionPour ? `<button type="button" class="bouton petit" data-action="proposer-selection">Proposer pour « ${esc(etat.selectionPour.titre)} »</button>` : ""}
      </div>
    </div>
    <section id="zone-apercu" hidden></section>
    <section>
      <h3>Recherche</h3>
      <dl class="infos">
        ${ligne("Domaine", esc(c.domaine))}
        ${ligne("Postes", esc(c.postes))}
        ${ligne("Contrats", esc((c.contrats || []).join(", ")))}
        ${ligne("Disponibilité", esc(c.disponibilite))}
        ${ligne("Prétentions", esc(c.pretentions))}
      </dl>
    </section>
    <section>
      <h3>Profil</h3>
      <dl class="infos">
        ${ligne("Niveau", esc(c.niveau))}
        ${ligne("Expérience", c.experience != null ? `${c.experience} an${c.experience > 1 ? "s" : ""}` : "")}
        ${ligne("Compétences", esc(c.competences))}
        ${ligne("Langues", esc(c.langues))}
        ${ligne("Ville", esc([c.ville, c.pays].filter(Boolean).join(", ")))}
        ${ligne("Téléphone", esc(c.telephone))}
        ${ligne("Email", esc(c.email))}
        ${ligne("LinkedIn", /^https?:\/\//i.test(c.linkedin || "") ? `<a href="${esc(c.linkedin)}" target="_blank" rel="noopener">${esc(c.linkedin)}</a>` : esc(c.linkedin))}
        ${ligne("Provenance", esc(c.source))}
        ${ligne("Reçu le", jour(c.cree_le))}
        ${ligne("Accord", c.consentement_le ? `Donné le ${jour(c.consentement_le)}` : "Non enregistré")}
      </dl>
      ${c.message ? `<p style="margin-top:.8rem;white-space:pre-wrap"><b>Son mot :</b> ${esc(c.message)}</p>` : ""}
      ${(c.anciens_cv || []).length ? `<p style="margin-top:.8rem"><b>Anciens CV :</b></p><ul class="liste-simple">${c.anciens_cv.map((a, i) => `<li><button type="button" class="bouton discret petit" data-ancien="${i}">${esc(a.nom || "CV")}, remplacé le ${jour(a.remplace_le)}</button></li>`).join("")}</ul>` : ""}
    </section>
    <section>
      <h3>Demandes</h3>
      ${liens.length ? `<ul class="liste-simple">${liens.map((l) => `<li>${esc(l.demandes?.titre)} : ${esc((ETAPES.find(([k]) => k === l.etape) || [, l.etape])[1])}</li>`).join("")}</ul>` : `<p class="aide">Proposé à aucune demande pour l'instant.</p>`}
      ${demandesOuvertes.length ? `<div class="reglages"><label><span class="visuellement-cache">Demande</span><select id="choix-demande">${demandesOuvertes.map((d) => `<option value="${d.id}">${esc(d.titre)}</option>`).join("")}</select></label><button type="button" class="bouton secondaire petit" data-action="proposer">Proposer</button></div>` : ""}
    </section>
    <section>
      <h3>Notes</h3>
      <form id="form-note">
        <label class="champ"><span class="visuellement-cache">Nouvelle note</span><textarea name="texte" required placeholder="Appel du 12/11 : disponible, très motivée…"></textarea></label>
        <div class="envoi" style="margin-top:.5rem"><button class="bouton petit" type="submit">Ajouter la note</button></div>
      </form>
      <div class="notes">${notes.map((n) => `<article><p>${esc(n.texte)}</p><small>${esc(n.auteur || "")}, le ${jour(n.cree_le)}</small></article>`).join("")}</div>
    </section>
    <section>
      <div class="envoi" style="margin-top:0">
        <button type="button" class="bouton discret petit" data-action="modifier">Modifier la fiche</button>
        <button type="button" class="bouton danger petit" data-action="supprimer">Supprimer définitivement</button>
      </div>
    </section>`;
  panneau.hidden = false;
  document.body.classList.add("dossier-ouvert");

  $("#statut-dossier").addEventListener("change", (e) => majFiche({ statut: e.target.value }, "Statut mis à jour."));
  $("#form-note").addEventListener("submit", ajouterNote);
}

async function majFiche(champs, message) {
  const id = etat.ouvert.c.id;
  const { error } = await sb.from("candidats").update({ ...champs, modifie_le: new Date().toISOString() }).eq("id", id);
  if (error) return echec(error);
  Object.assign(etat.ouvert.c, champs);
  const i = etat.fiches.findIndex((f) => f.id === id);
  if (i >= 0) Object.assign(etat.fiches[i], champs);
  rendreDossier();
  if (etat.vue === "fiches") rendreFiches();
  if (message) flash(message);
}

async function ajouterNote(e) {
  e.preventDefault();
  const texte = new FormData(e.target).get("texte").trim();
  if (!texte) return;
  const { data, error } = await sb.from("notes").insert({ candidat_id: etat.ouvert.c.id, texte }).select().single();
  if (error) return echec(error);
  etat.ouvert.notes.unshift(data);
  rendreDossier();
  flash("Note ajoutée.");
}

async function lienCv(chemin, nom, telecharger = false) {
  const { data, error } = await sb.storage.from("cv").createSignedUrl(chemin, 3600, telecharger ? { download: nom || true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

async function voirCv() {
  const { c } = etat.ouvert;
  try {
    const url = await lienCv(c.cv_chemin);
    const zone = $("#zone-apercu");
    zone.hidden = false;
    zone.innerHTML = c.cv_chemin.endsWith(".pdf")
      ? `<iframe class="apercu" src="${esc(url)}" title="CV de ${esc(c.prenom)} ${esc(c.nom)}"></iframe><p class="aide" style="margin-top:.5rem"><a href="${esc(url)}" target="_blank" rel="noopener">Ouvrir dans un nouvel onglet</a></p>`
      : `<p>Les fichiers Word ne s'affichent pas ici. <a href="${esc(url)}" target="_blank" rel="noopener">Ouvrir le fichier</a></p>`;
    zone.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    echec(err, "Impossible d'ouvrir le CV.");
  }
}

async function proposer(demandeId) {
  const { error } = await sb.from("demande_candidats").upsert({ demande_id: demandeId, candidat_id: etat.ouvert.c.id });
  if (error) return echec(error);
  if (etat.ouvert.c.statut === "nouveau" || etat.ouvert.c.statut === "qualifie") await majFiche({ statut: "propose" });
  await ouvrirFiche(etat.ouvert.c.id);
  flash("Profil proposé pour la demande.");
}

async function supprimerFiche() {
  const { c } = etat.ouvert;
  if (!confirm(`Supprimer définitivement la fiche et le CV de ${c.prenom} ${c.nom} ? Cette action est irréversible.`)) return;
  const fichiers = [c.cv_chemin, ...(c.anciens_cv || []).map((a) => a.chemin)].filter(Boolean);
  if (fichiers.length) await sb.storage.from("cv").remove(fichiers);
  const { error } = await sb.from("candidats").delete().eq("id", c.id);
  if (error) return echec(error);
  fermerDossier();
  flash("Fiche supprimée.");
  await chargerStats();
  rendreFiltres();
  chargerFiches();
}

function fermerDossier() {
  etat.ouvert = null;
  $("#dossier").hidden = true;
  document.body.classList.remove("dossier-ouvert");
  document.querySelectorAll(".fiche").forEach((b) => b.setAttribute("aria-current", "false"));
}

// ---------- Ajouter / modifier une fiche ----------
function ouvrirFormulaireFiche(c = null) {
  const v = (k) => esc(c?.[k] ?? "");
  const form = $("#form-fiche");
  form.innerHTML = `
    <h2>${c ? `Modifier la fiche de ${esc(c.prenom)} ${esc(c.nom)}` : "Ajouter une fiche"}</h2>
    <div class="grille deux">
      <label class="champ"><span>Prénom</span><input type="text" name="prenom" required value="${v("prenom")}"></label>
      <label class="champ"><span>Nom</span><input type="text" name="nom" required value="${v("nom")}"></label>
      <label class="champ"><span>Téléphone</span><input type="tel" name="telephone" value="${v("telephone")}"></label>
      <label class="champ"><span>Email</span><input type="email" name="email" value="${v("email")}"></label>
      <label class="champ"><span>Ville</span><input type="text" name="ville" value="${v("ville")}"></label>
      <label class="champ"><span>Pays</span><input type="text" name="pays" value="${c ? v("pays") : "Bénin"}"></label>
    </div>
    <label class="champ"><span>Domaine</span><select name="domaine" required>${options(DOMAINES.map(([n]) => n), "Choisir…", c?.domaine)}</select></label>
    <label class="champ"><span>Poste(s) recherché(s)</span><input type="text" name="postes" required value="${v("postes")}"></label>
    <div class="champ"><span>Contrats</span><div class="cases">${CONTRATS.map((k) => `<label class="case"><input type="checkbox" name="contrats" value="${esc(k)}"${c?.contrats?.includes(k) ? " checked" : ""}> ${esc(k)}</label>`).join("")}</div></div>
    <div class="grille deux">
      <label class="champ"><span>Niveau d'études</span><select name="niveau">${options(NIVEAUX, "Choisir…", c?.niveau)}</select></label>
      <label class="champ"><span>Années d'expérience</span><input type="number" min="0" max="60" name="experience" value="${v("experience")}"></label>
      <label class="champ"><span>Disponibilité</span><select name="disponibilite">${options(DISPONIBILITES, "Choisir…", c?.disponibilite)}</select></label>
      <label class="champ"><span>Prétentions</span><input type="text" name="pretentions" value="${v("pretentions")}"></label>
    </div>
    <label class="champ"><span>Compétences</span><textarea name="competences">${v("competences")}</textarea></label>
    <div class="grille deux">
      <label class="champ"><span>Langues</span><input type="text" name="langues" value="${v("langues")}"></label>
      <label class="champ"><span>LinkedIn</span><input type="url" name="linkedin" value="${v("linkedin")}"></label>
    </div>
    <label class="fichier"><b>${c?.cv_chemin ? "Remplacer le CV" : "CV"}</b><span class="aide">PDF ou Word, 5 Mo maximum${c?.cv_chemin ? ". L'ancien reste dans l'historique." : " (facultatif)."}</span>
      <input type="file" name="cv" accept=".pdf,.doc,.docx"></label>
    ${c ? "" : `<label class="accord" style="margin-top:0"><input type="checkbox" name="consentement"><span>La personne a accepté que son CV soit conservé et transmis à des recruteurs.</span></label>`}
    <p class="erreur" id="erreur-fiche" role="alert"></p>
    <div class="envoi">
      <button type="button" class="bouton discret" data-action="fermer-fenetre">Annuler</button>
      <button type="submit" class="bouton" value="ok">${c ? "Enregistrer" : "Ajouter la fiche"}</button>
    </div>`;
  form.onsubmit = (e) => enregistrerFiche(e, c);
  $("#fenetre-fiche").showModal();
}

async function enregistrerFiche(e, c) {
  e.preventDefault();
  const f = new FormData(e.target);
  const zone = $("#erreur-fiche");
  const champs = {
    prenom: f.get("prenom").trim(), nom: f.get("nom").trim(), telephone: f.get("telephone").trim() || null,
    email: f.get("email").trim().toLowerCase() || null, ville: f.get("ville").trim() || null, pays: f.get("pays").trim() || "Bénin",
    domaine: f.get("domaine"), postes: f.get("postes").trim(), contrats: f.getAll("contrats"),
    niveau: f.get("niveau") || null, experience: f.get("experience") === "" ? null : Number(f.get("experience")),
    disponibilite: f.get("disponibilite") || null, pretentions: f.get("pretentions").trim() || null,
    competences: f.get("competences").trim() || null, langues: f.get("langues").trim() || null,
    linkedin: f.get("linkedin").trim() || null,
  };
  if (!champs.prenom || !champs.nom || !champs.domaine || !champs.postes) {
    zone.textContent = "Prénom, nom, domaine et poste sont obligatoires.";
    return;
  }
  champs.telephone_chiffres = champs.telephone ? champs.telephone.replace(/\D/g, "").replace(/^(00)?229/, "") || null : null;
  const fichier = f.get("cv");
  const bouton = e.target.querySelector('button[type="submit"]');
  bouton.disabled = true;
  try {
    if (fichier && fichier.size) {
      champs.cv_chemin = await envoyerCv(fichier, "equipe");
      champs.cv_nom = fichier.name.slice(0, 200);
      if (c?.cv_chemin) champs.anciens_cv = [...(c.anciens_cv || []), { chemin: c.cv_chemin, nom: c.cv_nom, remplace_le: new Date().toISOString() }];
    }
    let id = c?.id;
    if (c) {
      const { error } = await sb.from("candidats").update({ ...champs, modifie_le: new Date().toISOString() }).eq("id", c.id);
      if (error) throw error;
    } else {
      champs.source = "ajout par l'équipe";
      if (f.get("consentement") === "on") champs.consentement_le = new Date().toISOString();
      const { data, error } = await sb.from("candidats").insert(champs).select("id").single();
      if (error) throw error;
      id = data.id;
    }
    $("#fenetre-fiche").close();
    flash(c ? "Fiche enregistrée." : "Fiche ajoutée.");
    await chargerStats();
    rendreFiltres();
    await chargerFiches();
    await ouvrirFiche(id);
  } catch (err) {
    console.error(err);
    zone.textContent = err?.message?.includes("CV") || err?.message?.includes("fichier") ? err.message : "L'enregistrement n'a pas abouti. Réessayez.";
  } finally {
    bouton.disabled = false;
  }
}

// ---------- Export Excel (CSV) ----------
async function exporter() {
  const { data, error } = await requeteFiches("prenom,nom,telephone,email,ville,pays,domaine,postes,contrats,niveau,experience,disponibilite,pretentions,competences,langues,statut,note,cree_le", false).limit(5000);
  if (error) return echec(error, "Export impossible.");
  const entetes = ["Prénom", "Nom", "Téléphone", "Email", "Ville", "Pays", "Domaine", "Postes", "Contrats", "Niveau", "Expérience", "Disponibilité", "Prétentions", "Compétences", "Langues", "Statut", "Note", "Reçu le"];
  const cellule = (v) => {
    let t = Array.isArray(v) ? v.join(", ") : String(v ?? "");
    if (/^[=+\-@]/.test(t)) t = "'" + t; // pas de formule dans Excel
    return `"${t.replace(/"/g, '""')}"`;
  };
  const lignes = data.map((c) => [c.prenom, c.nom, c.telephone, c.email, c.ville, c.pays, c.domaine, c.postes, c.contrats, c.niveau, c.experience, c.disponibilite, c.pretentions, c.competences, c.langues, libelleStatut(c.statut), c.note, jour(c.cree_le)].map(cellule).join(";"));
  const blob = new Blob(["﻿" + [entetes.join(";"), ...lignes].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `cvtheque-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
  flash(`${data.length} fiche${data.length > 1 ? "s" : ""} exportée${data.length > 1 ? "s" : ""}.`);
}

// ---------- Demandes ----------
async function chargerDemandes() {
  const { data, error } = await sb.from("demandes").select("*, demande_candidats(count)").order("statut").order("cree_le", { ascending: false });
  if (!error) etat.demandes = data;
}

async function ouvrirDemande(id) {
  const d = etat.demandes.find((x) => x.id === id);
  const { data, error } = await sb.from("demande_candidats")
    .select("etape, ajoute_le, candidats(id, prenom, nom, postes, ville, experience, telephone, cv_chemin, cv_nom, domaine)")
    .eq("demande_id", id).order("ajoute_le");
  if (error) return echec(error);
  etat.demandeOuverte = { d, propositions: data };
  rendreDemandes();
}

function rendreDemandes() {
  const ouverte = etat.demandeOuverte;
  const liste = etat.demandes.length
    ? etat.demandes.map((d) => `<button type="button" class="demande-carte" data-demande="${d.id}" style="--c:${couleurDomaine(d.domaine)}" aria-current="${ouverte?.d.id === d.id}">
        <b>${esc(d.titre)}</b>
        <small>${esc([d.client, d.ville, (STATUTS_DEMANDE.find(([k]) => k === d.statut) || [, d.statut])[1]].filter(Boolean).join(", "))}, ${d.demande_candidats?.[0]?.count ?? 0} profil(s)</small>
      </button>`).join("")
    : `<div class="vide"><h2>Aucune demande</h2><p>Quand une recruteuse vous demande des profils, créez une demande pour suivre les candidats proposés.</p></div>`;
  let detail = `<div class="panneau"><p class="aide">Choisissez une demande, ou créez-en une.</p></div>`;
  if (ouverte) {
    const { d, propositions } = ouverte;
    detail = `<div class="panneau" style="border-top:6px solid ${couleurDomaine(d.domaine)}">
      <div class="tete-ligne" style="display:flex;gap:.75rem;align-items:flex-start;flex-wrap:wrap">
        <div><h2>${esc(d.titre)}</h2><p class="aide">${esc([d.client, d.domaine, d.ville].filter(Boolean).join(", "))}${d.echeance ? `, pour le ${jour(d.echeance)}` : ""}</p></div>
        <label style="margin-left:auto"><span class="visuellement-cache">Statut</span><select id="statut-demande">${STATUTS_DEMANDE.map(([k, l]) => `<option value="${k}"${d.statut === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      ${d.details ? `<p style="margin-top:.8rem;white-space:pre-wrap">${esc(d.details)}</p>` : ""}
      <div class="envoi">
        <button type="button" class="bouton" data-action="chercher-profils">Trouver des profils</button>
        <button type="button" class="bouton secondaire" data-action="copier-message" ${propositions.length ? "" : "disabled"}>Copier le message pour la recruteuse</button>
        <button type="button" class="bouton discret petit" data-action="modifier-demande">Modifier</button>
      </div>
      <h3 style="margin-top:1.5rem">Profils proposés (${propositions.length})</h3>
      ${propositions.length ? `<div class="propositions">${propositions.map((p) => `<div class="proposition">
          <button type="button" class="lien" data-fiche="${p.candidats.id}">${esc(p.candidats.prenom)} ${esc(p.candidats.nom)}</button>
          <span class="aide">${esc(p.candidats.postes)}${p.candidats.experience != null ? `, ${p.candidats.experience} an(s)` : ""}${p.candidats.ville ? `, ${esc(p.candidats.ville)}` : ""}</span>
          <select data-etape="${p.candidats.id}" aria-label="Étape">${ETAPES.map(([k, l]) => `<option value="${k}"${p.etape === k ? " selected" : ""}>${l}</option>`).join("")}</select>
          <button type="button" class="bouton discret petit" data-retirer="${p.candidats.id}">Retirer</button>
        </div>`).join("")}</div>` : `<p class="aide">Aucun profil proposé. Cliquez sur « Trouver des profils » pour chercher dans la CVthèque.</p>`}
    </div>`;
  }
  $("#contenu").innerHTML = `
    <div class="resume"><h1>Demandes de profils</h1><div class="outils"><button type="button" class="bouton petit" data-action="nouvelle-demande">Nouvelle demande</button></div></div>
    <div class="demandes"><div>${liste}</div><div>${detail}</div></div>`;
  $("#statut-demande")?.addEventListener("change", async (e) => {
    const { error } = await sb.from("demandes").update({ statut: e.target.value }).eq("id", ouverte.d.id);
    if (error) return echec(error);
    ouverte.d.statut = e.target.value;
    await chargerStats();
    rendreDemandes();
    flash("Demande mise à jour.");
  });
}

function ouvrirFormulaireDemande(d = null) {
  const v = (k) => esc(d?.[k] ?? "");
  const form = $("#form-demande");
  form.innerHTML = `
    <h2>${d ? "Modifier la demande" : "Nouvelle demande de profils"}</h2>
    <label class="champ"><span>Poste recherché</span><input type="text" name="titre" required value="${v("titre")}" placeholder="Ex. : Comptable confirmé(e)"></label>
    <div class="grille deux">
      <label class="champ"><span>Pour qui (entreprise, recruteuse)</span><input type="text" name="client" value="${v("client")}"></label>
      <label class="champ"><span>Ville</span><input type="text" name="ville" value="${v("ville")}"></label>
      <label class="champ"><span>Domaine</span><select name="domaine">${options(DOMAINES.map(([n]) => n), "Choisir…", d?.domaine)}</select></label>
      <label class="champ"><span>À fournir avant le</span><input type="date" name="echeance" value="${v("echeance")}"></label>
    </div>
    <label class="champ"><span>Détails du besoin</span><textarea name="details" placeholder="Expérience, diplôme, salaire, horaires…">${v("details")}</textarea></label>
    <p class="erreur" id="erreur-demande" role="alert"></p>
    <div class="envoi">
      ${d ? `<button type="button" class="bouton danger" data-action="supprimer-demande" style="margin-right:auto">Supprimer</button>` : ""}
      <button type="button" class="bouton discret" data-action="fermer-fenetre">Annuler</button>
      <button type="submit" class="bouton">${d ? "Enregistrer" : "Créer la demande"}</button>
    </div>`;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const champs = {
      titre: f.get("titre").trim(), client: f.get("client").trim() || null, ville: f.get("ville").trim() || null,
      domaine: f.get("domaine") || null, echeance: f.get("echeance") || null, details: f.get("details").trim() || null,
    };
    if (!champs.titre) return ($("#erreur-demande").textContent = "Indiquez le poste recherché.");
    const r = d ? await sb.from("demandes").update(champs).eq("id", d.id).select().single() : await sb.from("demandes").insert(champs).select().single();
    if (r.error) return echec(r.error);
    $("#fenetre-demande").close();
    await Promise.all([chargerDemandes(), chargerStats()]);
    await ouvrirDemande(r.data.id);
    flash(d ? "Demande enregistrée." : "Demande créée.");
  };
  $("#fenetre-demande").showModal();
}

async function copierMessage() {
  const { d, propositions } = etat.demandeOuverte;
  const retenus = propositions.filter((p) => p.etape !== "refuse");
  const chemins = retenus.map((p) => p.candidats.cv_chemin).filter(Boolean);
  let liens = {};
  if (chemins.length) {
    const { data, error } = await sb.storage.from("cv").createSignedUrls(chemins, 7 * 24 * 3600);
    if (error) return echec(error, "Impossible de préparer les liens des CV.");
    liens = Object.fromEntries(data.map((x) => [x.path, x.signedUrl]));
  }
  const texte = [
    `Bonjour, voici les profils pour le poste « ${d.titre} »${d.ville ? ` (${d.ville})` : ""} :`,
    "",
    ...retenus.map((p, i) => {
      const c = p.candidats;
      return [
        `${i + 1}. ${c.prenom} ${c.nom}, ${c.postes}${c.experience != null ? `, ${c.experience} an(s) d'expérience` : ""}${c.ville ? `, ${c.ville}` : ""}`,
        c.cv_chemin ? `   CV : ${liens[c.cv_chemin]}` : "",
      ].filter(Boolean).join("\n");
    }),
    "",
    "Les liens des CV restent valables 7 jours.",
  ].join("\n");
  try {
    await navigator.clipboard.writeText(texte);
    flash("Message copié : collez-le dans WhatsApp ou un email.");
  } catch {
    prompt("Copiez ce message :", texte);
  }
}

// ---------- Navigation ----------
function changerVue(vue) {
  etat.vue = vue;
  document.querySelectorAll(".vues button").forEach((b) => b.setAttribute("aria-current", b.dataset.vue === vue ? "page" : "false"));
  $("#corps-appli").classList.toggle("sans-filtres", vue !== "fiches");
  if (vue === "fiches") chargerFiches();
  else rendreDemandes();
}

document.addEventListener("click", async (e) => {
  const cible = e.target.closest("button, [data-action]");
  if (!cible) return;
  const ds = cible.dataset;
  if (ds.vue) return changerVue(ds.vue);
  if (ds.fiche) return ouvrirFiche(ds.fiche);
  if (ds.domaine !== undefined && cible.closest(".onglets-domaines")) {
    etat.filtres.domaine = ds.domaine;
    etat.page = 0;
    rendreFiltres();
    return chargerFiches();
  }
  if (ds.page !== undefined) {
    etat.page = Number(ds.page);
    await chargerFiches();
    return $("#contenu").scrollIntoView({ block: "start" });
  }
  if (ds.note) return majFiche({ note: etat.ouvert.c.note === Number(ds.note) ? null : Number(ds.note) });
  if (ds.ancien !== undefined) {
    const a = etat.ouvert.c.anciens_cv[Number(ds.ancien)];
    try { window.open(await lienCv(a.chemin), "_blank", "noopener"); } catch (err) { echec(err, "Impossible d'ouvrir ce CV."); }
    return;
  }
  if (ds.demande) return ouvrirDemande(ds.demande);
  if (ds.retirer) {
    const { error } = await sb.from("demande_candidats").delete().eq("demande_id", etat.demandeOuverte.d.id).eq("candidat_id", ds.retirer);
    if (error) return echec(error);
    await chargerDemandes();
    return ouvrirDemande(etat.demandeOuverte.d.id);
  }
  switch (ds.action) {
    case "deconnexion": await sb.auth.signOut(); return location.reload();
    case "filtres": {
      const ouvert = $("#filtres").classList.toggle("ouvert");
      return cible.setAttribute("aria-expanded", String(ouvert));
    }
    case "reinitialiser":
      Object.keys(etat.filtres).forEach((k) => (etat.filtres[k] = ""));
      etat.texte = "";
      $("#recherche").value = "";
      etat.page = 0;
      rendreFiltres();
      return chargerFiches();
    case "fermer": return fermerDossier();
    case "voir-cv": return voirCv();
    case "telecharger-cv":
      try { location.href = await lienCv(etat.ouvert.c.cv_chemin, etat.ouvert.c.cv_nom, true); } catch (err) { echec(err, "Téléchargement impossible."); }
      return;
    case "proposer": return proposer($("#choix-demande").value);
    case "proposer-selection": return proposer(etat.selectionPour.id);
    case "modifier": return ouvrirFormulaireFiche(etat.ouvert.c);
    case "supprimer": return supprimerFiche();
    case "nouvelle-fiche": return ouvrirFormulaireFiche();
    case "fermer-fenetre": return cible.closest("dialog").close();
    case "exporter": return exporter();
    case "nouvelle-demande": return ouvrirFormulaireDemande();
    case "modifier-demande": return ouvrirFormulaireDemande(etat.demandeOuverte.d);
    case "supprimer-demande": {
      const d = etat.demandeOuverte.d;
      if (!confirm(`Supprimer la demande « ${d.titre} » ? Les fiches des candidats sont conservées.`)) return;
      const { error } = await sb.from("demandes").delete().eq("id", d.id);
      if (error) return echec(error);
      $("#fenetre-demande").close();
      etat.demandeOuverte = null;
      await Promise.all([chargerDemandes(), chargerStats()]);
      rendreDemandes();
      return flash("Demande supprimée.");
    }
    case "chercher-profils": {
      const d = etat.demandeOuverte.d;
      etat.selectionPour = d;
      Object.keys(etat.filtres).forEach((k) => (etat.filtres[k] = ""));
      etat.filtres.domaine = d.domaine || "";
      etat.texte = "";
      $("#recherche").value = "";
      etat.page = 0;
      rendreFiltres();
      return changerVue("fiches");
    }
    case "fin-selection": {
      const id = etat.selectionPour.id;
      etat.selectionPour = null;
      fermerDossier();
      await chargerDemandes();
      changerVue("demandes");
      return ouvrirDemande(id);
    }
    case "copier-message": return copierMessage();
  }
});

document.addEventListener("change", async (e) => {
  const id = e.target.dataset?.etape;
  if (!id) return;
  const { error } = await sb.from("demande_candidats").update({ etape: e.target.value }).eq("demande_id", etat.demandeOuverte.d.id).eq("candidat_id", id);
  if (error) return echec(error);
  flash("Étape mise à jour.");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#dossier").hidden && !document.querySelector("dialog[open]")) fermerDossier();
});

demarrer();
