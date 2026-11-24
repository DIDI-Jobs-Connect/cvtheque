import { CONFIG } from "./config.js?v=6";
import { sb, configuree, esc, sansAccents, envoyerCv } from "./client.js?v=6";
import {
  DOMAINES, CONTRATS, NIVEAUX, DISPONIBILITES, STATUTS, ETAPES, STATUTS_DEMANDE, TYPES_ACTIVITE, STATUTS_ENTREPRISE,
  couleurDomaine, libelleStatut, libelleEtape,
} from "./listes.js?v=6";

const $ = (s) => document.querySelector(s);
const PAR_PAGE = 40;
const COLONNES_LISTE = "id,cree_le,prenom,nom,telephone,email,ville,postes,domaine,contrats,niveau,experience,disponibilite,statut,note,cv_chemin,source";
const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const jourCourt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const jour = (d) => (d ? dateFr.format(new Date(d)) : "");
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const libelle = (liste, k) => (liste.find(([c]) => c === k) || [k, k])[1];
// Statut de la fiche candidat suivant l'étape atteinte sur un poste.
const STATUT_PAR_ETAPE = { presente: "propose", entretien: "entretien", offre: "entretien", place: "place" };

const etat = {
  vue: "accueil",
  filtres: { domaine: "", statut: "", contrat: "", niveau: "", experience: "", ville: "", disponibilite: "" },
  texte: "",
  tri: "recent",
  page: 0,
  total: 0,
  fiches: [],
  cascade: false,
  bord: null, // chiffres du tableau de bord
  relances: [],
  derniers: [],
  ouvert: null, // dossier candidat : { c, notes, liens, relances }
  demandes: [],
  posteOuvert: null, // { d, pipeline, relances }
  entreprises: [],
  entrepriseOuverte: null, // { e, contacts, postes, notes, relances }
  selectionPour: null, // poste pour lequel on cherche des profils dans la CVthèque
  demandesRecues: [], // demandes déposées par les entreprises sur la page « Vous recrutez ? »
};
const BASE = new URL("./", location.href).href;
const DUREE_PARTAGE = 30 * 24 * 3600; // liens de CV du recruteur : 30 jours
const ETAPES_PRESENTEES = ["presente", "entretien", "offre", "place"];
const AVIS = { rencontrer: "Veut le/la rencontrer", reserve: "En réserve", non: "Pas retenu" };

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
  sb.auth.onAuthStateChange((evenement) => {
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
  await Promise.all([chargerDemandes(), chargerEntreprises(), chargerDemandesRecues()]);
  rendreFiltres();
  changerVue("accueil");
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

// ---------- Outils de formulaire ----------
const options = (liste, vide, valeur) =>
  (vide === null ? "" : `<option value="">${vide}</option>`) +
  liste.map((v) => {
    const [k, l] = Array.isArray(v) ? v : [v, v];
    return `<option value="${esc(k)}"${k === valeur ? " selected" : ""}>${esc(l)}</option>`;
  }).join("");

/** Ouvre la fenêtre de formulaire ; `enregistrer` reçoit le FormData et renvoie un message d'erreur ou rien. */
function fenetre(html, enregistrer, libelleBouton = "Enregistrer", extra = "") {
  const form = $("#form-fenetre");
  form.innerHTML = `${html}
    <p class="erreur" id="erreur-fenetre" role="alert"></p>
    <div class="envoi">${extra}
      <button type="button" class="bouton discret" data-action="fermer-fenetre">Annuler</button>
      <button type="submit" class="bouton">${libelleBouton}</button>
    </div>`;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const bouton = form.querySelector('button[type="submit"]');
    bouton.disabled = true;
    try {
      const probleme = await enregistrer(new FormData(form));
      if (probleme) $("#erreur-fenetre").textContent = probleme;
      else $("#fenetre").close();
    } catch (err) {
      console.error(err);
      $("#erreur-fenetre").textContent = /CV|fichier/.test(err?.message || "") ? err.message : "L'enregistrement n'a pas abouti. Réessayez.";
    } finally {
      bouton.disabled = false;
    }
  };
  $("#fenetre").showModal();
  form.querySelector("input, select, textarea")?.focus();
}
const val = (f, k) => (f.get(k) ?? "").toString().trim() || null;

function marquerVue(vue) {
  etat.vue = vue;
  document.querySelectorAll(".vues button").forEach((b) => b.setAttribute("aria-current", b.dataset.vue === vue ? "page" : "false"));
  $("#corps-appli").classList.toggle("sans-filtres", vue !== "fiches");
}

function changerVue(vue) {
  marquerVue(vue);
  fermerDossier();
  if (vue === "accueil") return chargerAccueil();
  if (vue === "fiches") return chargerFiches();
  if (vue === "postes") return rendrePostes();
  if (vue === "entreprises") return chargerDemandesRecues().then(rendreEntreprises);
}

// =====================================================================
// Tableau de bord
// =====================================================================
async function chargerAccueil() {
  const [bord, relances, derniers] = await Promise.all([
    sb.rpc("tableau_de_bord"),
    sb.from("relances").select("*, candidats(id, prenom, nom), entreprises(id, nom), demandes(id, titre)").eq("fait", false).order("echeance").limit(40),
    sb.from("candidats").select(COLONNES_LISTE).order("cree_le", { ascending: false }).limit(6),
  ]);
  if (bord.error) {
    console.error(bord.error);
    $("#contenu").innerHTML = `<div class="vide"><h2>Le module CRM n'est pas encore installé</h2><p>Dans Supabase, ouvrez <b>SQL Editor</b> → <b>New query</b>, collez le contenu du fichier <code>supabase/crm.sql</code> puis cliquez sur <b>Run</b>. Faites de même avec <code>supabase/offres.sql</code>. Rechargez ensuite cette page.</p></div>`;
    return;
  }
  etat.bord = bord.data || {};
  etat.relances = relances.data || [];
  etat.derniers = derniers.data || [];
  majPastille(etat.bord.demandes_entreprises);
  rendreAccueil();
  rendreFiltres();
}

function ligneRelance(r) {
  const j = aujourdhui();
  const classe = r.echeance < j ? "retard" : r.echeance === j ? "jour" : "";
  const quand = r.echeance < j ? `En retard, ${jourCourt.format(new Date(r.echeance))}` : r.echeance === j ? "Aujourd'hui" : jourCourt.format(new Date(r.echeance));
  const lien = r.candidats
    ? `<button type="button" class="lien" data-fiche="${r.candidats.id}">${esc(r.candidats.prenom)} ${esc(r.candidats.nom)}</button>`
    : r.entreprises
      ? `<button type="button" class="lien" data-entreprise="${r.entreprises.id}">${esc(r.entreprises.nom)}</button>`
      : r.demandes
        ? `<button type="button" class="lien" data-poste="${r.demandes.id}">${esc(r.demandes.titre)}</button>`
        : "";
  return `<li class="relance ${classe}">
      <input type="checkbox" data-faire="${r.id}" aria-label="Marquer « ${esc(r.titre)} » comme fait">
      <span class="relance-texte"><b>${esc(r.titre)}</b>${lien ? `<span>${lien}</span>` : ""}</span>
      <span class="relance-date">${quand}</span>
    </li>`;
}

function barres(objet, libeller = (k) => k, couleur = () => "var(--action)") {
  const lignes = Object.entries(objet || {}).sort((a, b) => b[1] - a[1]);
  if (!lignes.length) return `<p class="aide">Pas encore de données.</p>`;
  const max = Math.max(...lignes.map(([, n]) => n));
  return `<ul class="barres">${lignes.map(([k, n]) => `<li><span>${esc(libeller(k))}</span><i style="--w:${(n / max) * 100}%;--c:${couleur(k)}"></i><b>${n}</b></li>`).join("")}</ul>`;
}

const SOURCES = { chaine: "Chaîne WhatsApp", accompagnement: "Accompagnement", formulaire: "Formulaire", statut: "Statut WhatsApp", linkedin: "LinkedIn", facebook: "Facebook", "ajout par l'équipe": "Ajout manuel", inconnue: "Inconnue", site: "Site DIDI Jobs Connect", offre: "Candidature à une offre", "relance-site": "Relance des inscrits", "relance-email": "Relance par email", "relance-whatsapp": "Relance WhatsApp", "chaine-relance": "Relance chaîne WhatsApp" };

function rendreAccueil() {
  const b = etat.bord;
  const evolution = b.semaine - b.semaine_precedente;
  const enRetard = etat.relances.filter((r) => r.echeance < aujourdhui());
  const tuile = (n, titre, detail, vue) => `<button type="button" class="tuile" ${vue ? `data-vue="${vue}"` : ""}><b data-compte="${n}">${n}</b><span>${titre}</span>${detail ? `<small>${detail}</small>` : ""}</button>`;
  $("#contenu").innerHTML = `
    <div class="resume">
      <h1>Tableau de bord</h1>
      <div class="outils">
        <button type="button" class="bouton petit secondaire" data-action="nouvelle-relance">Nouvelle relance</button>
        <button type="button" class="bouton petit" data-action="nouveau-poste">Nouveau poste</button>
      </div>
    </div>
    <div class="tuiles">
      ${tuile(b.actifs, pluriel(b.actifs, "profil dans la CVthèque", "profils dans la CVthèque"), `${b.semaine} ${pluriel(b.semaine, "reçu", "reçus")} cette semaine${evolution ? ` (${evolution > 0 ? "+" : ""}${evolution})` : ""}`, "fiches")}
      ${tuile(b.postes_ouverts, pluriel(b.postes_ouverts, "poste à pourvoir", "postes à pourvoir"), `${b.offres_publiques ?? 0} ${pluriel(b.offres_publiques ?? 0, "publié", "publiés")} en ligne, ${b.entreprises} ${pluriel(b.entreprises, "entreprise active", "entreprises actives")}`, "postes")}
      ${tuile(b.en_cours, pluriel(b.en_cours, "candidat en process", "candidats en process"), "sur les postes ouverts", "postes")}
      ${tuile(b.places_30j, pluriel(b.places_30j, "placement", "placements"), "ces 30 derniers jours", "")}
    </div>
    <div class="bord">
      <section class="panneau">
        <div class="panneau-titre"><h2>À faire</h2>${enRetard.length ? `<span class="tampon retard">${enRetard.length} en retard</span>` : ""}</div>
        ${alertes()}
        ${etat.relances.length
          ? `<ul class="relances">${etat.relances.map(ligneRelance).join("")}</ul>`
          : `<div class="vide petit"><p>Aucune relance prévue. Ajoutez-en depuis une fiche, un poste ou une entreprise : « rappeler Aïcha jeudi », « envoyer la shortlist au client »…</p></div>`}
      </section>
      <section class="panneau">
        <h2>Pipeline des postes ouverts</h2>
        ${barres(Object.fromEntries(ETAPES.map(([k]) => [k, b.etapes?.[k] || 0]).filter(([, n]) => n)), libelleEtape)}
        <h2 class="sous-titre">Provenance des CV</h2>
        ${barres(b.sources, (k) => SOURCES[k] || k, () => "var(--ambre)")}
      </section>
      <section class="panneau">
        <h2>Derniers CV reçus</h2>
        ${etat.derniers.length ? `<div class="fiches compactes">${etat.derniers.map((c, i) => ligneFiche(c, i)).join("")}</div>` : `<p class="aide">Aucun CV pour l'instant.</p>`}
      </section>
      <section class="panneau">
        <h2>Profils par domaine</h2>
        ${barres(b.domaines, (k) => k, (k) => couleurDomaine(k))}
      </section>
    </div>`;
  compter();
}

function alertes() {
  const b = etat.bord;
  const lignes = [];
  if (b.demandes_entreprises) lignes.push(`<li class="relance jour"><span>✦</span><span class="relance-texte"><b>${b.demandes_entreprises} ${pluriel(b.demandes_entreprises, "nouvelle demande d'entreprise", "nouvelles demandes d'entreprises")}</b><span><button type="button" class="lien" data-vue="entreprises">Voir les demandes</button></span></span><span class="relance-date">À traiter</span></li>`);
  if (b.candidatures_7j) lignes.push(`<li class="relance"><span>✉</span><span class="relance-texte"><b>${b.candidatures_7j} ${pluriel(b.candidatures_7j, "candidature reçue", "candidatures reçues")} sur vos offres</b><span><button type="button" class="lien" data-vue="postes">Voir les postes</button></span></span><span class="relance-date">7 derniers jours</span></li>`);
  return lignes.length ? `<ul class="relances" style="margin-bottom:.4rem">${lignes.join("")}</ul>` : "";
}

// Les chiffres montent jusqu'à leur valeur (0,6 s) à l'affichage du tableau de bord.
function compter() {
  if (reduit()) return;
  document.querySelectorAll("[data-compte]").forEach((el) => {
    const cible = Number(el.dataset.compte);
    if (!cible) return;
    const debut = performance.now();
    const pas = (t) => {
      const x = Math.min(1, (t - debut) / 600);
      el.textContent = Math.round(cible * (1 - Math.pow(1 - x, 3)));
      if (x < 1) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  });
}

// ---------- Relances ----------
function ouvrirFormulaireRelance(lien = {}) {
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const cible = lien.candidat ? `${lien.candidat.prenom} ${lien.candidat.nom}` : lien.entreprise?.nom || lien.poste?.titre;
  fenetre(`
    <h2>Nouvelle relance</h2>
    ${cible ? `<p class="aide">Pour : <b>${esc(cible)}</b></p>` : ""}
    <label class="champ"><span>Que faut-il faire ?</span><input type="text" name="titre" required placeholder="Ex. : rappeler pour confirmer l'entretien"></label>
    <label class="champ"><span>Pour quand ?</span><input type="date" name="echeance" value="${demain}" required></label>
    ${cible ? "" : `<label class="champ"><span>Liée à un poste (facultatif)</span><select name="demande_id">${options(etat.demandes.map((d) => [d.id, d.titre]), "Aucun")}</select></label>`}`,
  async (f) => {
    const titre = val(f, "titre");
    if (!titre) return "Indiquez ce qu'il faut faire.";
    const { error } = await sb.from("relances").insert({
      titre, echeance: val(f, "echeance") || aujourdhui(),
      candidat_id: lien.candidat?.id ?? null, entreprise_id: lien.entreprise?.id ?? null,
      demande_id: lien.poste?.id ?? val(f, "demande_id"),
    });
    if (error) throw error;
    flash("Relance ajoutée.");
    await rafraichir();
  }, "Ajouter la relance");
}

async function marquerFait(id) {
  const { error } = await sb.from("relances").update({ fait: true, fait_le: new Date().toISOString() }).eq("id", id);
  if (error) return echec(error);
  flash("Relance terminée.");
  await rafraichir();
}

/** Recharge ce qui est affiché après une modification. */
async function rafraichir() {
  if (etat.ouvert) await ouvrirFiche(etat.ouvert.c.id, false);
  if (etat.vue === "accueil") await chargerAccueil();
  else if (etat.vue === "postes" && etat.posteOuvert) await ouvrirPoste(etat.posteOuvert.d.id);
  else if (etat.vue === "entreprises" && etat.entrepriseOuverte) await ouvrirEntreprise(etat.entrepriseOuverte.e.id);
}

// =====================================================================
// Candidats (fiches)
// =====================================================================
function rendreFiltres() {
  const f = etat.filtres;
  const comptes = etat.bord?.domaines || {};
  $("#filtres").innerHTML = `
    <div>
      <h2>Domaines</h2>
      <div class="onglets-domaines">
        <button type="button" data-domaine="" aria-pressed="${!f.domaine}" style="--c:var(--encre)"><i></i>Tous les domaines<em>${etat.bord?.actifs ?? ""}</em></button>
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
  etat.cascade = !reduit();
  rendreFiches();
  etat.cascade = false;
}

function ligneFiche(c, i = 0) {
  const details = [
    c.ville,
    c.experience != null ? `${c.experience} an${c.experience > 1 ? "s" : ""} d'expérience` : "",
    c.niveau,
    (c.contrats || []).join(", "),
    c.disponibilite ? `Dispo. ${c.disponibilite.toLowerCase()}` : "",
  ].filter(Boolean);
  return `<button type="button" class="fiche" data-fiche="${c.id}" style="--c:${couleurDomaine(c.domaine)};--i:${i}" aria-current="${etat.ouvert?.c.id === c.id}">
      <span><span class="qui">${esc(c.prenom)} ${esc(c.nom)}</span><br><span class="poste">${esc(c.postes)}</span></span>
      <span class="cote"><span class="tampon ${esc(c.statut)}">${esc(libelleStatut(c.statut))}</span>${c.note ? `<span class="etoiles" aria-label="${c.note} sur 5">${"★".repeat(c.note)}</span>` : ""}</span>
      <span class="details">${details.map((d) => `<span>${esc(d)}</span>`).join("")}<span class="date">Reçu le ${jour(c.cree_le)}</span></span>
    </button>`;
}

function rendreFiches() {
  const filtresActifs = Object.values(etat.filtres).some(Boolean) || etat.texte;
  const pages = Math.max(1, Math.ceil(etat.total / PAR_PAGE));
  const liste = etat.fiches.length
    ? `<div class="fiches${etat.cascade ? " cascade" : ""}">${etat.fiches.map(ligneFiche).join("")}</div>`
    : filtresActifs
      ? `<div class="vide"><h2>Aucun candidat ne correspond</h2><p>Retirez un filtre ou essayez d'autres mots, par exemple le poste sans le lieu.</p></div>`
      : `<div class="vide"><h2>La CVthèque est vide pour l'instant</h2><p>Partagez le lien du formulaire de dépôt, ou ajoutez un candidat vous-même avec « Ajouter une fiche ».</p></div>`;
  $("#contenu").innerHTML = `
    ${etat.selectionPour ? `<div class="bandeau"><span>Vous cherchez des profils pour le poste <b>${esc(etat.selectionPour.titre)}</b>. Ouvrez une fiche puis « Ajouter au pipeline ».</span><button class="bouton petit secondaire" style="color:#fff;border-color:#fff" type="button" data-action="fin-selection">Revenir au poste</button></div>` : ""}
    <div class="resume">
      <h1>${filtresActifs ? `${etat.total} ${pluriel(etat.total, "candidat trouvé", "candidats trouvés")}` : "Candidats"}</h1>
      <div class="outils">
        <label><span class="visuellement-cache">Trier</span>
          <select id="tri">
            ${[["recent", "Plus récents"], ["experience", "Plus expérimentés"], ["note", "Mieux notés"], ["nom", "Nom (A-Z)"]].map(([k, l]) => `<option value="${k}"${etat.tri === k ? " selected" : ""}>${l}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="bouton secondaire petit" data-action="relance-cv">Relancer les CV manquants</button>
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
async function ouvrirFiche(id, defiler = true) {
  const [c, notes, liens, relances] = await Promise.all([
    sb.from("candidats").select("*").eq("id", id).single(),
    sb.from("notes").select("*").eq("candidat_id", id).order("cree_le", { ascending: false }),
    sb.from("demande_candidats").select("etape, demande_id, demandes(titre, statut, entreprises(nom))").eq("candidat_id", id),
    sb.from("relances").select("*").eq("candidat_id", id).eq("fait", false).order("echeance"),
  ]);
  if (c.error) return echec(c.error, "Impossible d'ouvrir ce dossier.");
  etat.ouvert = { c: c.data, notes: notes.data || [], liens: liens.data || [], relances: relances.data || [] };
  rendreDossier();
  if (defiler) $("#dossier").scrollTop = 0;
  document.querySelectorAll(".fiche").forEach((b) => b.setAttribute("aria-current", String(b.dataset.fiche === id)));
}

function numeroWhatsapp(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (!String(tel).trim().startsWith("+") && !d.startsWith("229") && (d.length === 8 || d.length === 10)) d = "229" + d;
  return d;
}

const formulaireJournal = (cible) => `
  <form class="form-journal" data-journal="${cible}">
    <div class="journal-ligne">
      <label><span class="visuellement-cache">Type</span><select name="type">${options(TYPES_ACTIVITE, null, "appel")}</select></label>
      <label class="journal-texte"><span class="visuellement-cache">Compte rendu</span><textarea name="texte" required placeholder="Ce qui s'est dit, la suite prévue…"></textarea></label>
    </div>
    <div class="envoi" style="margin-top:.5rem"><button class="bouton petit" type="submit">Ajouter au journal</button></div>
  </form>`;
const listeJournal = (notes) => `<div class="notes">${notes.map((n) => `<article><p><span class="type-activite ${esc(n.type || "note")}">${esc(libelle(TYPES_ACTIVITE, n.type || "note"))}</span> ${esc(n.texte)}</p><small>${esc(n.auteur || "")}, le ${jour(n.cree_le)}</small></article>`).join("")}</div>`;
const listeRelances = (relances) => (relances.length ? `<ul class="relances">${relances.map(ligneRelance).join("")}</ul>` : `<p class="aide">Aucune relance prévue.</p>`);

function rendreDossier() {
  const { c, notes, liens, relances } = etat.ouvert;
  const wa = numeroWhatsapp(c.telephone);
  const ligne = (t, v) => (v ? `<dt>${t}</dt><dd>${v}</dd>` : "");
  const postesLibres = etat.demandes.filter((d) => d.statut === "ouverte" && !liens.some((l) => l.demande_id === d.id));
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
        <button type="button" class="bouton discret petit" data-action="relance-candidat">Relance</button>
      </div>
      <div class="reglages">
        <label><span class="visuellement-cache">Statut</span><select id="statut-dossier">${STATUTS.map(([k, l]) => `<option value="${k}"${c.statut === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <span class="note-etoiles" role="group" aria-label="Note">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-note="${n}" aria-pressed="${(c.note || 0) >= n}" aria-label="${n} sur 5">★</button>`).join("")}</span>
        ${etat.selectionPour && !liens.some((l) => l.demande_id === etat.selectionPour.id) ? `<button type="button" class="bouton petit" data-action="ajouter-selection">Ajouter au pipeline « ${esc(etat.selectionPour.titre)} »</button>` : ""}
      </div>
    </div>
    <section id="zone-apercu" hidden></section>
    <section>
      <h3>Postes et pipeline</h3>
      ${liens.length ? `<div class="propositions">${liens.map((l) => `<div class="proposition">
          <button type="button" class="lien" data-poste="${l.demande_id}">${esc(l.demandes?.titre)}</button>
          <span class="aide">${esc(l.demandes?.entreprises?.nom || "")}</span>
          <select data-etape="${c.id}" data-demande="${l.demande_id}" aria-label="Étape">${options(ETAPES, null, l.etape)}</select>
        </div>`).join("")}</div>` : `<p class="aide">Sur aucun poste pour l'instant.</p>`}
      ${postesLibres.length ? `<div class="reglages"><label><span class="visuellement-cache">Poste</span><select id="choix-poste">${options(postesLibres.map((d) => [d.id, d.titre + (d.entreprises?.nom ? `, ${d.entreprises.nom}` : "")]), null)}</select></label><button type="button" class="bouton secondaire petit" data-action="ajouter-poste">Ajouter au pipeline</button></div>` : ""}
    </section>
    <section>
      <h3>Relances</h3>
      ${listeRelances(relances)}
    </section>
    <section>
      <h3>Journal</h3>
      ${formulaireJournal(`candidat:${c.id}`)}
      ${listeJournal(notes)}
    </section>
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
        ${ligne("Provenance", esc(SOURCES[c.source] || c.source))}
        ${ligne("Reçu le", jour(c.cree_le))}
        ${ligne("Accord", c.consentement_le ? `Donné le ${jour(c.consentement_le)}` : "Non enregistré")}
      </dl>
      ${c.message ? `<p style="margin-top:.8rem;white-space:pre-wrap"><b>Son mot :</b> ${esc(c.message)}</p>` : ""}
      ${(c.anciens_cv || []).length ? `<p style="margin-top:.8rem"><b>Anciens CV :</b></p><ul class="liste-simple">${c.anciens_cv.map((a, i) => `<li><button type="button" class="bouton discret petit" data-ancien="${i}">${esc(a.nom || "CV")}, remplacé le ${jour(a.remplace_le)}</button></li>`).join("")}</ul>` : ""}
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
    zone.scrollIntoView({ behavior: reduit() ? "auto" : "smooth", block: "start" });
  } catch (err) {
    echec(err, "Impossible d'ouvrir le CV.");
  }
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
  changerVue(etat.vue);
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
  fenetre(`
    <h2>${c ? `Modifier la fiche de ${esc(c.prenom)} ${esc(c.nom)}` : "Ajouter un candidat"}</h2>
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
    ${c ? "" : `<label class="accord" style="margin-top:0"><input type="checkbox" name="consentement"><span>La personne a accepté que son CV soit conservé et transmis à des recruteurs.</span></label>`}`,
  async (f) => {
    const champs = {
      prenom: val(f, "prenom"), nom: val(f, "nom"), telephone: val(f, "telephone"),
      email: val(f, "email")?.toLowerCase() ?? null, ville: val(f, "ville"), pays: val(f, "pays") || "Bénin",
      domaine: val(f, "domaine"), postes: val(f, "postes"), contrats: f.getAll("contrats"),
      niveau: val(f, "niveau"), experience: val(f, "experience") === null ? null : Number(val(f, "experience")),
      disponibilite: val(f, "disponibilite"), pretentions: val(f, "pretentions"),
      competences: val(f, "competences"), langues: val(f, "langues"), linkedin: val(f, "linkedin"),
    };
    if (!champs.prenom || !champs.nom || !champs.domaine || !champs.postes) return "Prénom, nom, domaine et poste sont obligatoires.";
    champs.telephone_chiffres = champs.telephone ? champs.telephone.replace(/\D/g, "").replace(/^(00)?229/, "") || null : null;
    const fichier = f.get("cv");
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
    flash(c ? "Fiche enregistrée." : "Candidat ajouté.");
    if (etat.vue === "fiches") await chargerFiches();
    await ouvrirFiche(id);
  }, c ? "Enregistrer" : "Ajouter le candidat");
}

// ---------- Relance WhatsApp des fiches sans CV ----------
const MARQUE_WA = "Relance CV envoyée par WhatsApp";
const LIEN_RELANCE = `${BASE}?source=relance-whatsapp`;

async function ouvrirRelanceCv() {
  const cibles = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await sb.from("candidats").select("id, prenom, nom, telephone, postes, domaine, source").is("cv_chemin", null).neq("statut", "archive").not("telephone", "is", null).order("cree_le", { ascending: false }).range(debut, debut + 999);
    if (error) return echec(error);
    cibles.push(...data);
    if (data.length < 1000) break;
  }
  const { data: notes } = await sb.from("notes").select("candidat_id").eq("texte", MARQUE_WA);
  const faits = new Set((notes || []).map((n) => n.candidat_id));
  const restants = cibles.filter((c) => !faits.has(c.id) && numeroWhatsapp(c.telephone));
  const message = (c) => `Bonjour ${c.prenom}, ici ${CONFIG.organisation || "l'équipe recrutement"} 👋\nVotre profil est dans notre CVthèque, mais il manque votre CV. Les entreprises nous demandent des profils chaque semaine et nous proposons en priorité les dossiers complets.\nAjoutez-le en 3 minutes ici (avec le même numéro, votre fiche sera complétée) : ${LIEN_RELANCE}`;
  $("#contenu-large").innerHTML = `
    <div class="large-tete"><h2>Relancer les CV manquants</h2><button type="button" class="bouton discret petit" data-action="fermer-large">Fermer</button></div>
    <p class="aide">${cibles.length} ${pluriel(cibles.length, "fiche", "fiches")} sans CV avec un téléphone. ${faits.size ? `${cibles.length - restants.length} déjà ${pluriel(cibles.length - restants.length, "relancée", "relancées")} sur WhatsApp. ` : ""}Cliquez sur « WhatsApp » : le message s'ouvre déjà écrit, il ne reste qu'à appuyer sur Envoyer. La fiche est ensuite marquée comme relancée.</p>
    ${restants.length ? `<ol class="matchs relance-cv">${restants.map((c) => `<li style="--c:${couleurDomaine(c.domaine)}">
        <span class="match-qui"><button type="button" class="lien" data-fiche="${c.id}">${esc(c.prenom)} ${esc(c.nom)}</button><small>${esc(c.postes)}${c.source ? ` · ${esc(SOURCES[c.source] || c.source)}` : ""}</small></span>
        <span></span>
        <a class="bouton petit" target="_blank" rel="noopener" data-action="relance-wa" data-id="${c.id}" href="https://wa.me/${numeroWhatsapp(c.telephone)}?text=${encodeURIComponent(message(c))}">WhatsApp</a>
      </li>`).join("")}</ol>` : `<div class="vide petit"><p>Toutes les fiches sans CV ont été relancées. 🎉</p></div>`}`;
  $("#fenetre-large").showModal();
}

async function marquerRelanceWa(lien) {
  const li = lien.closest("li");
  li?.classList.add("faite");
  lien.textContent = "Relancé ✓";
  const { error } = await sb.from("notes").insert({ candidat_id: lien.dataset.id, type: "whatsapp", texte: MARQUE_WA });
  if (error) echec(error, "La relance n'a pas été notée sur la fiche.");
}

// ---------- Export Excel (CSV) ----------
async function exporter() {
  const { data, error } = await requeteFiches("prenom,nom,telephone,email,ville,pays,domaine,postes,contrats,niveau,experience,disponibilite,pretentions,competences,langues,statut,note,source,cree_le", false).limit(5000);
  if (error) return echec(error, "Export impossible.");
  const entetes = ["Prénom", "Nom", "Téléphone", "Email", "Ville", "Pays", "Domaine", "Postes", "Contrats", "Niveau", "Expérience", "Disponibilité", "Prétentions", "Compétences", "Langues", "Statut", "Note", "Provenance", "Reçu le"];
  const cellule = (v) => {
    let t = Array.isArray(v) ? v.join(", ") : String(v ?? "");
    if (/^[=+\-@]/.test(t)) t = "'" + t; // pas de formule dans Excel
    return `"${t.replace(/"/g, '""')}"`;
  };
  const lignes = data.map((c) => [c.prenom, c.nom, c.telephone, c.email, c.ville, c.pays, c.domaine, c.postes, c.contrats, c.niveau, c.experience, c.disponibilite, c.pretentions, c.competences, c.langues, libelleStatut(c.statut), c.note, SOURCES[c.source] || c.source, jour(c.cree_le)].map(cellule).join(";"));
  const blob = new Blob(["﻿" + [entetes.join(";"), ...lignes].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `cvtheque-${aujourdhui()}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
  flash(`${data.length} ${pluriel(data.length, "fiche exportée", "fiches exportées")}.`);
}

// =====================================================================
// Postes à pourvoir et pipeline (Kanban)
// =====================================================================
async function chargerDemandes() {
  const { data, error } = await sb.from("demandes").select("*, entreprises(id, nom), demande_candidats(etape)").order("statut").order("cree_le", { ascending: false });
  if (!error) etat.demandes = data;
}

function rendrePostes() {
  const ouvert = etat.posteOuvert;
  const liste = etat.demandes.length
    ? etat.demandes.map((d) => {
        const n = d.demande_candidats?.length || 0;
        const places = d.demande_candidats?.filter((x) => x.etape === "place").length || 0;
        return `<button type="button" class="demande-carte" data-poste="${d.id}" style="--c:${couleurDomaine(d.domaine)}" aria-current="${ouvert?.d.id === d.id}">
          <b>${esc(d.titre)}</b>
          <small>${esc([d.entreprises?.nom || d.client, d.ville].filter(Boolean).join(", "))}</small>
          <small>${esc(libelle(STATUTS_DEMANDE, d.statut))}, ${n} ${pluriel(n, "candidat", "candidats")}${places ? `, ${places} ${pluriel(places, "placé", "placés")}` : ""}${d.publique && d.statut === "ouverte" ? `, <span class="badge-candidature">en ligne</span>` : ""}</small>
        </button>`;
      }).join("")
    : `<div class="vide petit"><h2>Aucun poste</h2><p>Quand une entreprise vous confie un recrutement, créez le poste pour suivre les candidats étape par étape.</p></div>`;
  $("#contenu").innerHTML = `
    <div class="resume"><h1>Postes à pourvoir</h1><div class="outils"><a class="bouton discret petit" href="${BASE}offres.html" target="_blank" rel="noopener">Voir la page des offres</a><button type="button" class="bouton petit secondaire" data-action="importer-offre">Coller une offre reçue</button><button type="button" class="bouton petit" data-action="nouveau-poste">Nouveau poste</button></div></div>
    <div class="demandes"><div class="liste-postes">${liste}</div><div id="detail-poste">${ouvert ? "" : `<div class="panneau"><p class="aide">Choisissez un poste pour voir son pipeline, ou créez-en un.</p></div>`}</div></div>`;
  if (ouvert) rendrePipeline();
}

async function ouvrirPoste(id) {
  if (etat.vue !== "postes") marquerVue("postes");
  await chargerDemandes();
  const d = etat.demandes.find((x) => x.id === id);
  if (!d) return;
  const [pipeline, relances] = await Promise.all([
    sb.from("demande_candidats").select("etape, ajoute_le, modifie_le, origine, avis_recruteur, avis_commentaire, cv_partage, candidats(id, prenom, nom, postes, ville, experience, telephone, cv_chemin, cv_nom, domaine, note)").eq("demande_id", id).order("modifie_le", { ascending: false }),
    sb.from("relances").select("*").eq("demande_id", id).eq("fait", false).order("echeance"),
  ]);
  if (pipeline.error) return echec(pipeline.error, /column|colonne/i.test(pipeline.error.message || "") ? "Base à mettre à jour : exécutez supabase/offres.sql dans Supabase (voir le guide)." : undefined);
  etat.posteOuvert = { d, pipeline: pipeline.data.filter((p) => p.candidats), relances: relances.data || [] };
  rendrePostes();
}

function rendrePipeline() {
  const { d, pipeline, relances } = etat.posteOuvert;
  const infos = [d.entreprises?.nom || d.client, d.domaine, d.ville, d.contrat, d.experience_min != null ? `${d.experience_min} an(s) d'expérience minimum` : "", d.salaire, d.nb_postes > 1 ? `${d.nb_postes} postes` : "", d.echeance ? `pour le ${jour(d.echeance)}` : ""].filter(Boolean);
  const carte = (p) => {
    const c = p.candidats;
    return `<article class="carte-pipeline" draggable="true" data-glisse="${c.id}" style="--c:${couleurDomaine(c.domaine)}">
        <button type="button" class="lien" data-fiche="${c.id}">${esc(c.prenom)} ${esc(c.nom)}</button>
        <small>${esc([c.postes, c.ville, c.experience != null ? `${c.experience} an(s)` : ""].filter(Boolean).join(", "))}</small>
        ${c.note ? `<span class="etoiles">${"★".repeat(c.note)}</span>` : ""}
        ${p.origine === "candidature" ? `<span class="badge-candidature">A postulé en ligne</span>` : ""}
        ${p.avis_recruteur ? `<span class="badge-avis ${esc(p.avis_recruteur)}" title="${esc(p.avis_commentaire || "")}">Recruteur : ${esc(AVIS[p.avis_recruteur])}</span>` : ""}
        <label><span class="visuellement-cache">Étape</span><select data-etape="${c.id}" data-demande="${d.id}">${options(ETAPES, null, p.etape)}</select></label>
      </article>`;
  };
  $("#detail-poste").innerHTML = `
    <div class="panneau poste-tete" style="--c:${couleurDomaine(d.domaine)}">
      <div class="tete-ligne">
        <div><h2>${esc(d.titre)}</h2><p class="aide">${infos.map(esc).join(", ")}</p></div>
        <label style="margin-left:auto"><span class="visuellement-cache">Statut</span><select id="statut-poste">${options(STATUTS_DEMANDE, null, d.statut)}</select></label>
      </div>
      ${d.details ? `<p class="details-poste">${esc(d.details)}</p>` : ""}
      <div class="envoi">
        <button type="button" class="bouton" data-action="matching">Profils compatibles</button>
        <button type="button" class="bouton secondaire" data-action="chercher-profils">Chercher dans la CVthèque</button>
        <button type="button" class="bouton secondaire" data-action="copier-message">Message pour le client</button>
        <button type="button" class="bouton discret petit" data-action="relance-poste">Relance</button>
        <button type="button" class="bouton discret petit" data-action="modifier-poste">Modifier</button>
      </div>
      ${blocPartage(d, pipeline)}
      ${relances.length ? `<div class="relances-poste"><h3>Relances</h3>${listeRelances(relances)}</div>` : ""}
    </div>
    <div class="kanban" aria-label="Pipeline du poste">
      ${ETAPES.map(([k, l]) => {
        const cartes = pipeline.filter((p) => p.etape === k);
        return `<section class="colonne ${k}" data-colonne="${k}">
          <h3>${l} <span>${cartes.length}</span></h3>
          <div class="cartes">${cartes.map(carte).join("") || `<p class="colonne-vide">Glissez un candidat ici</p>`}</div>
        </section>`;
      }).join("")}
    </div>`;
  $("#publier-poste")?.addEventListener("change", async (e) => {
    const champs = { publique: e.target.checked };
    if (e.target.checked && !d.publiee_le) champs.publiee_le = new Date().toISOString();
    const { error } = await sb.from("demandes").update(champs).eq("id", d.id);
    if (error) return echec(error);
    flash(e.target.checked ? "Offre publiée sur la page des offres." : "Offre retirée de la page des offres.");
    await ouvrirPoste(d.id);
  });
  $("#statut-poste").addEventListener("change", async (e) => {
    const { error } = await sb.from("demandes").update({ statut: e.target.value }).eq("id", d.id);
    if (error) return echec(error);
    flash("Poste mis à jour.");
    await ouvrirPoste(d.id);
  });
  brancherGlisser();
}

// ---------- Partage : offre publique et lien privé du recruteur ----------
const lienOffre = (d) => `${BASE}?offre=${d.id}&source=offre`;
const lienRecruteur = (d) => `${BASE}recruteur.html#${d.jeton_recruteur}`;

function blocPartage(d, pipeline) {
  const presentes = pipeline.filter((p) => ETAPES_PRESENTEES.includes(p.etape)).length;
  const avis = pipeline.filter((p) => p.avis_recruteur).length;
  const candidatures = pipeline.filter((p) => p.origine === "candidature").length;
  return `<div class="partage">
    <div class="partage-ligne">
      <label class="interrupteur"><input type="checkbox" id="publier-poste"${d.publique ? " checked" : ""}> Publiée sur la page des offres</label>
      ${d.publique ? `<button type="button" class="bouton discret petit" data-action="copier-lien-offre">Copier le lien pour postuler</button>
        <a class="bouton discret petit" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`📢 Offre : ${d.titre}${d.ville ? ` (${d.ville})` : ""}. Postulez avec votre CV ici : ${lienOffre(d)}`)}">Partager sur WhatsApp</a>` : ""}
      ${candidatures ? `<span class="aide">${candidatures} ${pluriel(candidatures, "candidature en ligne", "candidatures en ligne")}</span>` : ""}
    </div>
    <div class="partage-ligne">
      <b>Lien recruteur</b>
      ${d.jeton_recruteur
        ? `<button type="button" class="bouton petit" data-action="copier-lien-recruteur">Copier le lien</button>
           <button type="button" class="bouton secondaire petit" data-action="whatsapp-recruteur">Envoyer sur WhatsApp</button>
           <a class="bouton discret petit" target="_blank" rel="noopener" href="${lienRecruteur(d)}">Voir comme le recruteur</a>
           <button type="button" class="bouton discret petit" data-action="couper-lien">Couper le lien</button>`
        : `<button type="button" class="bouton secondaire petit" data-action="creer-lien-recruteur">Créer le lien privé</button>`}
      <span class="aide">${presentes} ${pluriel(presentes, "profil visible", "profils visibles")} (étapes « Présenté au client » et suivantes)${avis ? `, ${avis} ${pluriel(avis, "avis reçu", "avis reçus")}` : ""}</span>
    </div>
  </div>`;
}

/** Prépare les liens de CV (30 jours) des candidats présentés, visibles sur la page du recruteur. */
async function preparerPartage(demandeId) {
  const { data, error } = await sb.from("demande_candidats").select("candidat_id, etape, cv_partage, candidats(cv_chemin)").eq("demande_id", demandeId).in("etape", ETAPES_PRESENTEES);
  if (error) throw error;
  const aSigner = data.filter((l) => l.candidats?.cv_chemin);
  if (!aSigner.length) return 0;
  const { data: liens, error: e2 } = await sb.storage.from("cv").createSignedUrls(aSigner.map((l) => l.candidats.cv_chemin), DUREE_PARTAGE);
  if (e2) throw e2;
  const parChemin = Object.fromEntries(liens.map((x) => [x.path, x.signedUrl]));
  await Promise.all(aSigner.map((l) => sb.from("demande_candidats").update({ cv_partage: parChemin[l.candidats.cv_chemin] || null }).eq("demande_id", demandeId).eq("candidat_id", l.candidat_id)));
  return aSigner.length;
}

async function copier(texte, message) {
  try {
    await navigator.clipboard.writeText(texte);
    flash(message);
  } catch {
    prompt("Copiez ce lien :", texte);
  }
}

// Glisser-déposer des cartes entre colonnes (sur téléphone : la liste « Étape » de chaque carte).
function brancherGlisser() {
  document.querySelectorAll(".carte-pipeline").forEach((carte) => {
    carte.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", carte.dataset.glisse);
      carte.classList.add("glisse");
    });
    carte.addEventListener("dragend", () => carte.classList.remove("glisse"));
  });
  document.querySelectorAll(".colonne").forEach((col) => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("survol");
    });
    col.addEventListener("dragleave", () => col.classList.remove("survol"));
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("survol");
      const id = e.dataTransfer.getData("text/plain");
      if (id) changerEtape(etat.posteOuvert.d.id, id, col.dataset.colonne);
    });
  });
}

async function changerEtape(demandeId, candidatId, etape) {
  const { error } = await sb.from("demande_candidats").update({ etape, modifie_le: new Date().toISOString() }).eq("demande_id", demandeId).eq("candidat_id", candidatId);
  if (error) return echec(error);
  if (STATUT_PAR_ETAPE[etape]) await sb.from("candidats").update({ statut: STATUT_PAR_ETAPE[etape], modifie_le: new Date().toISOString() }).eq("id", candidatId);
  // Le recruteur voit aussitôt le profil (et son CV) sur son lien privé.
  const poste = etat.demandes.find((x) => x.id === demandeId);
  if (poste?.jeton_recruteur && ETAPES_PRESENTEES.includes(etape)) await preparerPartage(demandeId).catch(console.error);
  flash(`Étape : ${libelleEtape(etape)}.`);
  if (etat.posteOuvert?.d.id === demandeId && etat.vue === "postes") await ouvrirPoste(demandeId);
  if (etat.ouvert?.c.id === candidatId) await ouvrirFiche(candidatId, false);
}

async function ajouterAuPipeline(demandeId, candidatId) {
  const { error } = await sb.from("demande_candidats").upsert({ demande_id: demandeId, candidat_id: candidatId, etape: "source" }, { onConflict: "demande_id,candidat_id", ignoreDuplicates: true });
  if (error) return echec(error);
  flash("Candidat ajouté au pipeline.");
  await chargerDemandes();
}

function ouvrirFormulairePoste(d = null, entrepriseId = null) {
  const v = (k) => esc(d?.[k] ?? "");
  const edition = Boolean(d?.id);
  const brouillon = d && !d.id; // offre collée et analysée
  fenetre(`
    <h2>${edition ? "Modifier le poste" : brouillon ? "Vérifiez l'offre analysée" : "Nouveau poste à pourvoir"}</h2>
    ${brouillon ? `<p class="aide">Les champs ont été remplis à partir du texte collé. Corrigez-les si besoin avant de créer le poste.</p>` : ""}
    <label class="champ"><span>Intitulé du poste</span><input type="text" name="titre" required value="${v("titre")}" placeholder="Ex. : Comptable confirmé(e)"></label>
    <div class="grille deux">
      <label class="champ"><span>Entreprise</span><select name="entreprise_id">${options(etat.entreprises.map((e) => [e.id, e.nom]), "Aucune (à préciser)", d?.entreprise_id ?? entrepriseId)}</select></label>
      <label class="champ"><span>Domaine</span><select name="domaine">${options(DOMAINES.map(([n]) => n), "Choisir…", d?.domaine)}</select></label>
      <label class="champ"><span>Ville</span><input type="text" name="ville" value="${v("ville")}"></label>
      <label class="champ"><span>Contrat</span><select name="contrat">${options(CONTRATS, "Choisir…", d?.contrat)}</select></label>
      <label class="champ"><span>Expérience minimale (ans)</span><input type="number" min="0" max="40" name="experience_min" value="${v("experience_min")}"></label>
      <label class="champ"><span>Salaire proposé</span><input type="text" name="salaire" value="${v("salaire")}" placeholder="Ex. : 200 000 FCFA / mois"></label>
      <label class="champ"><span>Nombre de postes</span><input type="number" min="1" max="99" name="nb_postes" value="${d?.nb_postes ?? 1}"></label>
      <label class="champ"><span>À pourvoir avant le</span><input type="date" name="echeance" value="${v("echeance")}"></label>
    </div>
    <label class="champ"><span>Détails du besoin <small>(visibles par tous si l'offre est publiée : retirez le nom du client si besoin)</small></span><textarea name="details" placeholder="Missions, diplôme, horaires, avantages…">${v("details")}</textarea></label>
    ${brouillon && d.entreprise_nom && !d.entreprise_id ? `<p class="aide">Entreprise repérée dans le texte : <b>${esc(d.entreprise_nom)}</b>. Elle n'est pas encore dans vos entreprises.</p>` : `<p class="aide">Pas encore l'entreprise dans la liste ? Créez-la d'abord dans l'onglet Entreprises.</p>`}
    <div class="cases">
      <label class="case"><input type="checkbox" name="publique"${d?.publique || brouillon ? " checked" : ""}> Publier sur la page des offres (les candidats postulent en ligne)</label>
      <label class="case"><input type="checkbox" name="afficher_entreprise"${d?.afficher_entreprise ? " checked" : ""}> Afficher le nom de l'entreprise sur l'offre</label>
      ${edition ? "" : `<label class="case"><input type="checkbox" name="auto"${brouillon || !d ? " checked" : ""}> Ajouter tout de suite les profils compatibles de la CVthèque</label>`}
    </div>`,
  async (f) => {
    const champs = {
      titre: val(f, "titre"), entreprise_id: val(f, "entreprise_id"), domaine: val(f, "domaine"), ville: val(f, "ville"),
      contrat: val(f, "contrat"), experience_min: val(f, "experience_min") === null ? null : Number(val(f, "experience_min")),
      salaire: val(f, "salaire"), nb_postes: Number(val(f, "nb_postes") || 1), echeance: val(f, "echeance"), details: val(f, "details"),
    };
    if (!champs.titre) return "Indiquez l'intitulé du poste.";
    champs.publique = f.get("publique") === "on";
    champs.afficher_entreprise = f.get("afficher_entreprise") === "on";
    if (champs.publique && !d?.publiee_le) champs.publiee_le = new Date().toISOString();
    if (!edition && d?.demande_recue_id) champs.client = d.client ?? null;
    const r = edition ? await sb.from("demandes").update(champs).eq("id", d.id).select().single() : await sb.from("demandes").insert(champs).select().single();
    if (r.error) throw r.error;
    if (d?.demande_recue_id) await sb.from("demandes_entreprises").update({ statut: "convertie", demande_id: r.data.id }).eq("id", d.demande_recue_id);
    fermerDossier();
    let ajoutes = 0;
    if (!edition && f.get("auto") === "on") ajoutes = await ajouterCompatibles(r.data);
    flash(edition ? "Poste enregistré." : `Poste créé${champs.publique ? " et publié" : ""}${ajoutes ? `, ${ajoutes} ${pluriel(ajoutes, "profil compatible ajouté", "profils compatibles ajoutés")}` : ""}.`);
    if (d?.demande_recue_id) await chargerDemandesRecues();
    await ouvrirPoste(r.data.id);
  }, edition ? "Enregistrer" : "Créer le poste",
  edition ? `<button type="button" class="bouton danger" data-action="supprimer-poste" style="margin-right:auto">Supprimer</button>` : "");
}

async function copierMessage() {
  const { d, pipeline } = etat.posteOuvert;
  const retenus = pipeline.filter((p) => ["presente", "entretien", "offre"].includes(p.etape));
  if (!retenus.length) return flash("Passez d'abord des candidats à l'étape « Présenté au client ».", true);
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
      return [`${i + 1}. ${c.prenom} ${c.nom}, ${c.postes}${c.experience != null ? `, ${c.experience} an(s) d'expérience` : ""}${c.ville ? `, ${c.ville}` : ""}`, c.cv_chemin ? `   CV : ${liens[c.cv_chemin]}` : ""].filter(Boolean).join("\n");
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

// ---------- Offre collée : analyse automatique ----------
const VILLES = ["Cotonou", "Porto-Novo", "Abomey-Calavi", "Calavi", "Godomey", "Parakou", "Bohicon", "Abomey", "Ouidah", "Lokossa", "Natitingou", "Djougou", "Kandi", "Malanville", "Allada", "Sèmè-Podji", "Pobè", "Kétou", "Savalou", "Dassa-Zoumè", "Grand-Popo", "Comè", "Aplahoué", "Nikki", "Lomé", "Abidjan", "Dakar", "Ouagadougou", "Niamey", "Lagos"];
const MOTS_DOMAINES = {
  "Administration & secrétariat": ["secretaire", "assistante? de direction", "assistante? administrati", "administratif", "receptionniste", "standardiste", "hotesse d'accueil", "agent d'accueil"],
  "Comptabilité & finance": ["comptab", "financ", "auditeur", "audit", "tresori", "fiscal", "controleur de gestion"],
  "Banque & assurance": ["banque", "bancaire", "assurance", "microfinance", "agent de credit", "charge de credit"],
  "Commerce & vente": ["commercial", "vente", "vendeu", "merchandis", "charge de clientele", "teleconseill", "boutique", "prospection", "caissi", "supermarche"],
  "Marketing & communication": ["marketing", "communication", "community manager", "graphiste", "journalist", "infographiste"],
  "Informatique & digital": ["informati", "developpeur", "reseau", "data", "logiciel", "web", "devops", "systeme d'information", "cybersecurite"],
  "Ressources humaines": ["ressources humaines", "\\brh\\b", "recrutement", "paie", "gestionnaire du personnel"],
  "Juridique": ["juriste", "juridique", "avocat", "notaire", "\\bdroit\\b"],
  "BTP & génie civil": ["\\bbtp\\b", "genie civil", "conducteur de travaux", "chantier", "macon", "architecte", "topograph"],
  "Industrie & maintenance": ["maintenance", "mecani", "industri", "electromecan", "production", "usine", "soudeur", "electricien"],
  "Transport & logistique": ["chauffeur", "logisti", "transport", "magasinier", "livreur", "transit", "douane", "supply"],
  "Agriculture & agroalimentaire": ["agricul", "agro", "elevage", "agronome", "plantation"],
  "Santé": ["infirmi", "medecin", "sage-femme", "pharmac", "sante", "laborantin", "aide-soignant", "clinique"],
  "Éducation & formation": ["enseignant", "professeur", "formateur", "educat", "instituteur", "repetiteur", "ecole"],
  "Hôtellerie, restauration & tourisme": ["hotel", "cuisini", "serveu", "restaura", "barman", "touris", "chef de cuisine"],
  "ONG & développement": ["\\bong\\b", "suivi-evaluation", "suivi evaluation", "humanitaire", "developpement communautaire", "bailleur"],
  "Sécurité & gardiennage": ["securite", "gardien", "vigile"],
  "Services à la personne": ["menagere", "nounou", "domestique", "baby-sit", "aide a domicile"],
};
const CONTRATS_MOTS = [["CDI", /\bcdi\b|duree indeterminee/], ["CDD", /\bcdd\b|duree determinee/], ["Stage", /\bstage|stagiaire/], ["Alternance / apprentissage", /alternance|apprenti/], ["Freelance / mission", /freelance|consultan|prestation|mission ponctuelle/], ["Temps partiel", /temps partiel|mi-temps/], ["Bénévolat", /benevol|volontaire/]];

/** Lit une offre reçue (WhatsApp, email…) et en déduit les champs du poste. */
function analyserOffre(texte) {
  const lignes = texte.split(/\r?\n/).map((l) => l.replace(/^[\s*•\-–>#_]+|[\s*_]+$/g, "").trim()).filter(Boolean);
  const plat = normal(texte);
  const capture = (re) => { const m = texte.match(re); return m ? m[m.length - 1].trim().replace(/[.;]+$/, "") : null; };
  let titre = capture(/(?:intitul[ée] du poste|poste(?: à pourvoir)?|fonction|profil recherch[ée])\s*[:\-–]\s*([^\n]{3,90})/i)
    || capture(/recrute(?:nt)?\s+(?:un|une|des|d['’]un|d['’]une)?\s*\(?\d*\)?\s*([^\n,.]{3,80}?)(?:\s+(?:pour|à|au|en|H\/F|\(H\/F\))\b|[,.\n]|$)/i);
  if (!titre) titre = lignes.find((l) => l.length <= 90 && !/^(offre|avis|appel)\b.*(emploi|recrutement|candidature)/i.test(normal(l)) && !/^(urgent|recrutement)$/i.test(l)) || lignes[0] || "";
  titre = titre.replace(/\s*\(?H\s*\/\s*F\)?\s*$/i, "").replace(/^(un|une|des)\s+/i, "").trim();
  titre = titre.charAt(0).toUpperCase() + titre.slice(1);

  const ville = VILLES.find((v) => new RegExp(`\\b${normal(v).replace("-", "[- ]")}\\b`).test(plat)) || null;
  const contrat = (CONTRATS_MOTS.find(([, re]) => re.test(plat)) || [null])[0];
  const exp = plat.match(/experience[^.\n]{0,50}?(\d{1,2})\s*(?:\+\s*)?(?:ans|annees)|(\d{1,2})\s*(?:\+\s*)?(?:ans|annees)[^.\n]{0,30}experience/);
  const salaire = capture(/(\d[\d\s.]{2,}\s*(?:F\s?CFA|FCFA|XOF|francs?)(?:\s*(?:\/|par)\s*mois)?)/i);
  const date = texte.match(/(?:avant le|au plus tard le|date limite[^\d\n]{0,30}|jusqu['’]au)\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/i);
  const nb = plat.match(/\b(\d{1,2})\s*(?:postes|agents|personnes|profils)\b/);
  const entrepriseNom = capture(/(?:entreprise|soci[ée]t[ée]|cabinet|structure|employeur|client)\s*[:\-–]\s*([^\n]{2,80})/i)
    || capture(/^\s*(?:la soci[ée]t[ée]|l['’]entreprise|le cabinet|l['’]ONG)?\s*([A-Z][\w&'’ .-]{1,60}?)\s+recrute/m);

  const titreN = normal(titre);
  let domaine = null, meilleur = 0;
  for (const [dom, mots] of Object.entries(MOTS_DOMAINES)) {
    let score = 0;
    for (const m of mots) {
      const re = new RegExp(m, "g");
      score += (titreN.match(re) || []).length * 4 + (plat.match(re) || []).length;
    }
    if (score > meilleur) { meilleur = score; domaine = dom; }
  }
  const entreprise = entrepriseNom && etat.entreprises.find((e) => normal(e.nom) === normal(entrepriseNom) || normal(entrepriseNom).includes(normal(e.nom)));
  return {
    titre: titre.slice(0, 120), ville, contrat, domaine,
    experience_min: exp ? Number(exp[1] || exp[2]) : null,
    salaire, nb_postes: nb ? Number(nb[1]) : 1,
    echeance: date ? `${date[3].length === 2 ? "20" + date[3] : date[3]}-${date[2].padStart(2, "0")}-${date[1].padStart(2, "0")}` : null,
    details: texte.trim().slice(0, 3000),
    entreprise_id: entreprise?.id ?? null, entreprise_nom: entrepriseNom,
  };
}

function ouvrirImportOffre() {
  fenetre(`
    <h2>Coller une offre reçue</h2>
    <p class="aide">Collez le texte de l'offre tel que vous l'avez reçu (WhatsApp, email, Facebook…). L'outil remplit le poste, le publie sur la page des offres si vous le souhaitez et y ajoute les profils compatibles de la CVthèque.</p>
    <label class="champ import-offre"><span>Texte de l'offre</span><textarea name="texte" required placeholder="Ex. : La société X recrute un(e) comptable confirmé(e) à Cotonou. CDI. 3 ans d'expérience minimum…"></textarea></label>`,
  async (f) => {
    const texte = val(f, "texte");
    if (!texte || texte.length < 15) return "Collez le texte complet de l'offre.";
    const brouillon = analyserOffre(texte);
    setTimeout(() => ouvrirFormulairePoste(brouillon), 0);
  }, "Analyser l'offre");
}

// ---------- Matching automatique ----------
const MOTS_VIDES = new Set(["pour", "avec", "dans", "des", "les", "une", "sur", "confirme", "confirmee", "junior", "senior"]);
const normal = (t) => sansAccents(String(t || "").toLowerCase());
const motsCles = (t) => [...new Set(normal(t).split(/[^a-z0-9+#]+/).filter((m) => m.length > 2 && !MOTS_VIDES.has(m)))];

/** Score sur 100 : domaine 30, intitulé 30, ville 15, expérience 10, contrat 10, disponibilité 5. */
function scorer(c, d) {
  const raisons = [];
  let score = 0;
  if (d.domaine && c.domaine === d.domaine) { score += 30; raisons.push("même domaine"); }
  const mots = motsCles(d.titre);
  if (mots.length) {
    const texte = normal(`${c.postes} ${c.competences || ""}`);
    const trouves = mots.filter((m) => texte.includes(m.slice(0, Math.max(4, m.length - 2))));
    if (trouves.length) { score += Math.round((30 * trouves.length) / mots.length); raisons.push(`poste : ${trouves.join(", ")}`); }
  }
  if (d.ville && c.ville && (normal(c.ville).includes(normal(d.ville)) || normal(d.ville).includes(normal(c.ville)))) { score += 15; raisons.push(c.ville); }
  if (d.experience_min != null) {
    if (c.experience != null && c.experience >= d.experience_min) { score += 10; raisons.push(`${c.experience} an(s) d'expérience`); }
    else if (c.experience != null && c.experience >= d.experience_min - 1) score += 5;
  } else if (c.experience != null) score += 5;
  if (d.contrat) { if ((c.contrats || []).includes(d.contrat)) { score += 10; raisons.push(d.contrat); } }
  else score += 5;
  if (c.disponibilite === "Immédiate") { score += 5; raisons.push("dispo. immédiate"); }
  else if (c.disponibilite === "Sous 2 semaines") score += 3;
  return { score: Math.min(100, score), raisons };
}

/** Profils de la CVthèque classés pour un poste (hors candidats déjà dans `exclus`). */
async function profilsCompatibles(d, exclus = new Set()) {
  const colonnes = "id,prenom,nom,postes,competences,domaine,ville,experience,contrats,disponibilite,note";
  const requetes = [];
  if (d.domaine) requetes.push(sb.from("candidats").select(colonnes).eq("domaine", d.domaine).neq("statut", "archive").limit(400));
  const mots = motsCles(d.titre);
  if (mots.length) requetes.push(sb.from("candidats").select(colonnes).neq("statut", "archive").textSearch("recherche", mots.join(" or "), { type: "websearch", config: "french" }).limit(300));
  if (!requetes.length) return null;
  const resultats = await Promise.all(requetes);
  const erreur = resultats.find((r) => r.error);
  if (erreur) throw erreur.error;
  const vus = new Map();
  for (const r of resultats) for (const c of r.data) if (!exclus.has(c.id)) vus.set(c.id, c);
  return [...vus.values()].map((c) => ({ c, ...scorer(c, d) })).sort((a, b) => b.score - a.score || (b.c.note || 0) - (a.c.note || 0));
}

/** Ajoute au pipeline (étape « Sourcé ») les meilleurs profils : score de 60 ou plus, 10 au maximum. */
async function ajouterCompatibles(d) {
  try {
    const liste = (await profilsCompatibles(d)) || [];
    const retenus = liste.filter((x) => x.score >= 60).slice(0, 10);
    if (!retenus.length) return 0;
    const { error } = await sb.from("demande_candidats").upsert(
      retenus.map((x) => ({ demande_id: d.id, candidat_id: x.c.id, etape: "source", origine: "matching" })),
      { onConflict: "demande_id,candidat_id", ignoreDuplicates: true });
    if (error) throw error;
    return retenus.length;
  } catch (err) {
    console.error(err);
    return 0;
  }
}

async function matching() {
  const { d, pipeline } = etat.posteOuvert;
  let liste;
  try {
    liste = await profilsCompatibles(d, new Set(pipeline.map((p) => p.candidats.id)));
  } catch (err) {
    return echec(err, "Recherche des profils impossible.");
  }
  if (!liste) return flash("Indiquez au moins le domaine ou l'intitulé du poste.", true);
  const classes = liste.slice(0, 25);
  $("#contenu-large").innerHTML = `
    <div class="large-tete"><h2>Profils compatibles : ${esc(d.titre)}</h2><button type="button" class="bouton discret petit" data-action="fermer-large">Fermer</button></div>
    <p class="aide">Classement selon le domaine, l'intitulé du poste, la ville, l'expérience, le contrat et la disponibilité. Les candidats déjà dans le pipeline n'apparaissent pas.</p>
    ${classes.length ? `<ol class="matchs">${classes.map(({ c, score, raisons }) => `<li style="--c:${couleurDomaine(c.domaine)}">
        <span class="match-score" style="--s:${score}"><b>${score}</b><small>/100</small></span>
        <span class="match-qui"><button type="button" class="lien" data-fiche="${c.id}">${esc(c.prenom)} ${esc(c.nom)}</button><small>${esc(c.postes)}</small>
          <span class="puces-raisons">${raisons.map((r) => `<span>${esc(r)}</span>`).join("")}</span></span>
        <button type="button" class="bouton petit secondaire" data-ajouter-match="${c.id}">Ajouter</button>
      </li>`).join("")}</ol>` : `<div class="vide petit"><p>Aucun profil proche pour l'instant. Précisez le domaine du poste, ou partagez le lien de dépôt pour recevoir plus de CV.</p></div>`}`;
  $("#fenetre-large").showModal();
}

// =====================================================================
// Entreprises clientes
// =====================================================================
async function chargerEntreprises() {
  const { data, error } = await sb.from("entreprises").select("id, nom, secteur, ville, statut").order("nom");
  if (!error) etat.entreprises = data;
}

// ---------- Demandes reçues des entreprises (page « Vous recrutez ? ») ----------
async function chargerDemandesRecues() {
  const { data, error } = await sb.from("demandes_entreprises").select("*").in("statut", ["nouvelle", "contactee"]).order("cree_le", { ascending: false }).limit(50);
  etat.demandesRecues = error ? [] : data;
  majPastille(etat.demandesRecues.filter((d) => d.statut === "nouvelle").length);
}

function majPastille(n) {
  const bouton = document.querySelector('.vues button[data-vue="entreprises"]');
  if (!bouton) return;
  bouton.querySelector(".pastille")?.remove();
  if (n) bouton.insertAdjacentHTML("beforeend", `<span class="pastille" aria-label="${n} nouvelles demandes">${n}</span>`);
}

function blocDemandesRecues() {
  if (!etat.demandesRecues.length) return "";
  return `<section class="panneau" style="margin-bottom:1.25rem">
    <div class="panneau-titre"><h2>Demandes reçues</h2><span class="aide">depuis la page « Vous recrutez ? »</span></div>
    <div class="demandes-recues" style="margin-top:.8rem">${etat.demandesRecues.map((r) => {
      const wa = numeroWhatsapp(r.telephone);
      const infos = [r.nb_postes > 1 ? `${r.nb_postes} postes` : "", r.contrat, r.experience_min != null ? `${r.experience_min} an(s) d'exp.` : "", r.budget, r.ville, r.echeance ? `avant le ${jour(r.echeance)}` : ""].filter(Boolean);
      return `<article class="demande-recue ${esc(r.statut)}">
        <div class="demande-recue-tete"><b>${esc(r.poste)}</b><span>${esc(r.entreprise)}${r.secteur ? `, ${esc(r.secteur)}` : ""}</span>
          <span class="tampon ${r.statut === "nouvelle" ? "nouveau" : "qualifie"}">${r.statut === "nouvelle" ? "Nouvelle" : "Contactée"}</span>
          <span class="aide">reçue le ${jour(r.cree_le)}</span></div>
        <p class="aide">Formule : <b>${esc(r.formule || "non précisée")}</b>${infos.length ? ` · ${esc(infos.join(", "))}` : ""}</p>
        <p class="aide">Contact : ${esc(r.contact_nom)}${r.fonction ? ` (${esc(r.fonction)})` : ""}, ${esc(r.telephone)}${r.email ? `, ${esc(r.email)}` : ""}</p>
        ${r.details ? `<p class="details-poste" style="margin-top:.2rem">${esc(r.details)}</p>` : ""}
        <div class="envoi">
          <button type="button" class="bouton petit" data-convertir="${r.id}">Créer le poste</button>
          ${wa ? `<a class="bouton secondaire petit" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(`Bonjour ${r.contact_nom}, ici ${CONFIG.organisation || "l'équipe recrutement"}. Merci pour votre demande de profils pour le poste « ${r.poste} ». `)}">WhatsApp</a>` : ""}
          <a class="bouton discret petit" href="tel:${esc(String(r.telephone).replace(/[^\d+]/g, ""))}">Appeler</a>
          ${r.statut === "nouvelle" ? `<button type="button" class="bouton discret petit" data-recue-statut="contactee" data-recue="${r.id}">Marquer contactée</button>` : ""}
          <button type="button" class="bouton discret petit" data-recue-statut="refusee" data-recue="${r.id}">Classer sans suite</button>
        </div>
      </article>`;
    }).join("")}</div>
  </section>`;
}

/** Transforme une demande reçue en entreprise (créée si besoin), contact et poste pré-rempli. */
async function convertirDemande(id) {
  const r = etat.demandesRecues.find((x) => x.id === id);
  if (!r) return;
  let entreprise = etat.entreprises.find((e) => normal(e.nom) === normal(r.entreprise));
  if (!entreprise) {
    const { data, error } = await sb.from("entreprises").insert({ nom: r.entreprise, secteur: r.secteur, ville: r.ville, statut: "prospect", notes: r.formule ? `Formule demandée : ${r.formule}` : null }).select().single();
    if (error) return echec(error);
    entreprise = data;
    await sb.from("contacts").insert({ entreprise_id: data.id, nom: r.contact_nom, fonction: r.fonction, telephone: r.telephone, email: r.email });
    await chargerEntreprises();
  }
  ouvrirFormulairePoste({
    titre: r.poste, entreprise_id: entreprise.id, ville: r.ville, contrat: CONTRATS.includes(r.contrat) ? r.contrat : null,
    experience_min: r.experience_min, salaire: r.budget, nb_postes: r.nb_postes, echeance: r.echeance,
    details: [r.formule ? `Formule : ${r.formule}` : "", r.details].filter(Boolean).join("\n\n"),
    domaine: analyserOffre(`${r.poste}\n${r.details || ""}`).domaine,
    demande_recue_id: r.id,
  });
}

function rendreEntreprises() {
  const ouverte = etat.entrepriseOuverte;
  const liste = etat.entreprises.length
    ? etat.entreprises.map((e) => `<button type="button" class="demande-carte entreprise-carte" data-entreprise="${e.id}" aria-current="${ouverte?.e.id === e.id}">
        <b>${esc(e.nom)}</b><small>${esc([e.secteur, e.ville].filter(Boolean).join(", "))}</small>
        <small class="statut-entreprise ${esc(e.statut)}">${esc(libelle(STATUTS_ENTREPRISE, e.statut))}</small>
      </button>`).join("")
    : `<div class="vide petit"><h2>Aucune entreprise</h2><p>Ajoutez les entreprises qui vous confient des recrutements, et leurs contacts.</p></div>`;
  $("#contenu").innerHTML = `
    <div class="resume"><h1>Entreprises</h1><div class="outils"><a class="bouton discret petit" href="${BASE}recruter.html" target="_blank" rel="noopener">Voir la page « Vous recrutez ? »</a><button type="button" class="bouton petit" data-action="nouvelle-entreprise">Nouvelle entreprise</button></div></div>
    ${blocDemandesRecues()}
    <div class="demandes"><div class="liste-postes">${liste}</div><div id="detail-entreprise">${ouverte ? "" : `<div class="panneau"><p class="aide">Choisissez une entreprise pour voir ses contacts, ses postes et l'historique des échanges.</p></div>`}</div></div>`;
  if (ouverte) rendreEntreprise();
}

async function ouvrirEntreprise(id) {
  if (etat.vue !== "entreprises") marquerVue("entreprises");
  const [e, contacts, postes, notes, relances] = await Promise.all([
    sb.from("entreprises").select("*").eq("id", id).single(),
    sb.from("contacts").select("*").eq("entreprise_id", id).order("nom"),
    sb.from("demandes").select("id, titre, statut, cree_le, demande_candidats(etape)").eq("entreprise_id", id).order("cree_le", { ascending: false }),
    sb.from("notes").select("*").eq("entreprise_id", id).order("cree_le", { ascending: false }),
    sb.from("relances").select("*").eq("entreprise_id", id).eq("fait", false).order("echeance"),
  ]);
  if (e.error) return echec(e.error);
  etat.entrepriseOuverte = { e: e.data, contacts: contacts.data || [], postes: postes.data || [], notes: notes.data || [], relances: relances.data || [] };
  rendreEntreprises();
}

function rendreEntreprise() {
  const { e, contacts, postes, notes, relances } = etat.entrepriseOuverte;
  const places = postes.reduce((n, p) => n + (p.demande_candidats || []).filter((x) => x.etape === "place").length, 0);
  $("#detail-entreprise").innerHTML = `
    <div class="panneau">
      <div class="tete-ligne">
        <div><h2>${esc(e.nom)}</h2><p class="aide">${esc([e.secteur, e.ville, e.adresse].filter(Boolean).join(", "))}</p>
          ${e.site ? `<p><a href="${/^https?:\/\//i.test(e.site) ? esc(e.site) : `https://${esc(e.site)}`}" target="_blank" rel="noopener">${esc(e.site)}</a></p>` : ""}</div>
        <label style="margin-left:auto"><span class="visuellement-cache">Statut</span><select id="statut-entreprise">${options(STATUTS_ENTREPRISE, null, e.statut)}</select></label>
      </div>
      <p class="chiffres-entreprise"><b>${postes.length}</b> ${pluriel(postes.length, "poste confié", "postes confiés")}, <b>${places}</b> ${pluriel(places, "placement", "placements")}</p>
      ${e.notes ? `<p class="details-poste">${esc(e.notes)}</p>` : ""}
      <div class="envoi">
        <button type="button" class="bouton" data-action="nouveau-poste-entreprise">Nouveau poste</button>
        <button type="button" class="bouton secondaire" data-action="nouveau-contact">Ajouter un contact</button>
        <button type="button" class="bouton discret petit" data-action="relance-entreprise">Relance</button>
        <button type="button" class="bouton discret petit" data-action="modifier-entreprise">Modifier</button>
      </div>
    </div>
    <div class="bord deux-colonnes">
      <section class="panneau">
        <h2>Contacts</h2>
        ${contacts.length ? `<ul class="contacts">${contacts.map((ct) => {
          const wa = numeroWhatsapp(ct.telephone);
          return `<li><span><b>${esc(ct.nom)}</b>${ct.fonction ? `<small>${esc(ct.fonction)}</small>` : ""}</span>
            <span class="contact-actions">
              ${wa ? `<a class="bouton secondaire petit" target="_blank" rel="noopener" href="https://wa.me/${wa}">WhatsApp</a>` : ""}
              ${ct.telephone ? `<a class="bouton discret petit" href="tel:${esc(ct.telephone.replace(/[^\d+]/g, ""))}">Appeler</a>` : ""}
              ${ct.email ? `<a class="bouton discret petit" href="mailto:${esc(ct.email)}">Email</a>` : ""}
              <button type="button" class="bouton discret petit" data-supprimer-contact="${ct.id}" aria-label="Retirer ${esc(ct.nom)}">Retirer</button>
            </span></li>`;
        }).join("")}</ul>` : `<p class="aide">Aucun contact. Ajoutez la personne qui vous transmet les besoins.</p>`}
        <h2 class="sous-titre">Postes confiés</h2>
        ${postes.length ? `<ul class="liste-simple">${postes.map((p) => `<li><button type="button" class="lien" data-poste="${p.id}">${esc(p.titre)}</button> <span class="aide">${esc(libelle(STATUTS_DEMANDE, p.statut))}, ${(p.demande_candidats || []).length} candidat(s), ${jour(p.cree_le)}</span></li>`).join("")}</ul>` : `<p class="aide">Aucun poste pour l'instant.</p>`}
        <h2 class="sous-titre">Relances</h2>
        ${listeRelances(relances)}
      </section>
      <section class="panneau">
        <h2>Journal des échanges</h2>
        ${formulaireJournal(`entreprise:${e.id}`)}
        ${listeJournal(notes)}
      </section>
    </div>`;
  $("#statut-entreprise").addEventListener("change", async (ev) => {
    const { error } = await sb.from("entreprises").update({ statut: ev.target.value }).eq("id", e.id);
    if (error) return echec(error);
    await chargerEntreprises();
    await ouvrirEntreprise(e.id);
    flash("Entreprise mise à jour.");
  });
}

function ouvrirFormulaireEntreprise(e = null) {
  const v = (k) => esc(e?.[k] ?? "");
  fenetre(`
    <h2>${e ? "Modifier l'entreprise" : "Nouvelle entreprise"}</h2>
    <label class="champ"><span>Nom</span><input type="text" name="nom" required value="${v("nom")}"></label>
    <div class="grille deux">
      <label class="champ"><span>Secteur</span><input type="text" name="secteur" value="${v("secteur")}" placeholder="Ex. : BTP, banque, ONG"></label>
      <label class="champ"><span>Ville</span><input type="text" name="ville" value="${v("ville")}"></label>
      <label class="champ"><span>Adresse</span><input type="text" name="adresse" value="${v("adresse")}"></label>
      <label class="champ"><span>Site web</span><input type="text" name="site" value="${v("site")}"></label>
      <label class="champ"><span>Statut</span><select name="statut">${options(STATUTS_ENTREPRISE, null, e?.statut || "client")}</select></label>
    </div>
    <label class="champ"><span>Notes</span><textarea name="notes" placeholder="Conditions, habitudes de recrutement, délais de paiement…">${v("notes")}</textarea></label>`,
  async (f) => {
    const champs = { nom: val(f, "nom"), secteur: val(f, "secteur"), ville: val(f, "ville"), adresse: val(f, "adresse"), site: val(f, "site"), statut: val(f, "statut") || "client", notes: val(f, "notes") };
    if (!champs.nom) return "Indiquez le nom de l'entreprise.";
    const r = e ? await sb.from("entreprises").update(champs).eq("id", e.id).select().single() : await sb.from("entreprises").insert(champs).select().single();
    if (r.error) throw r.error;
    await chargerEntreprises();
    flash(e ? "Entreprise enregistrée." : "Entreprise ajoutée.");
    await ouvrirEntreprise(r.data.id);
  }, e ? "Enregistrer" : "Ajouter l'entreprise",
  e ? `<button type="button" class="bouton danger" data-action="supprimer-entreprise" style="margin-right:auto">Supprimer</button>` : "");
}

function ouvrirFormulaireContact() {
  const { e } = etat.entrepriseOuverte;
  fenetre(`
    <h2>Nouveau contact chez ${esc(e.nom)}</h2>
    <div class="grille deux">
      <label class="champ"><span>Nom</span><input type="text" name="nom" required></label>
      <label class="champ"><span>Fonction</span><input type="text" name="fonction" placeholder="Ex. : DRH, gérante"></label>
      <label class="champ"><span>Téléphone (WhatsApp)</span><input type="tel" name="telephone"></label>
      <label class="champ"><span>Email</span><input type="email" name="email"></label>
    </div>`,
  async (f) => {
    const champs = { entreprise_id: e.id, nom: val(f, "nom"), fonction: val(f, "fonction"), telephone: val(f, "telephone"), email: val(f, "email") };
    if (!champs.nom) return "Indiquez le nom du contact.";
    const { error } = await sb.from("contacts").insert(champs);
    if (error) throw error;
    flash("Contact ajouté.");
    await ouvrirEntreprise(e.id);
  }, "Ajouter le contact");
}

// =====================================================================
// Journal (candidat ou entreprise)
// =====================================================================
document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".form-journal");
  if (!form) return;
  e.preventDefault();
  const f = new FormData(form);
  const texte = val(f, "texte");
  if (!texte) return;
  const [genre, id] = form.dataset.journal.split(":");
  const ligne = { type: f.get("type") || "note", texte, [genre === "candidat" ? "candidat_id" : "entreprise_id"]: id };
  const { error } = await sb.from("notes").insert(ligne);
  if (error) return echec(error);
  flash("Ajouté au journal.");
  if (genre === "candidat") await ouvrirFiche(id, false);
  else await ouvrirEntreprise(id);
});

// =====================================================================
// Clics
// =====================================================================
document.addEventListener("click", async (e) => {
  const cible = e.target.closest("button, [data-action]");
  if (!cible) return;
  const ds = cible.dataset;
  if (ds.vue) return changerVue(ds.vue);
  if (ds.fiche) {
    if (cible.closest("#fenetre-large")) $("#fenetre-large").close();
    return ouvrirFiche(ds.fiche);
  }
  if (ds.poste) {
    fermerDossier();
    return ouvrirPoste(ds.poste);
  }
  if (ds.entreprise) {
    fermerDossier();
    return ouvrirEntreprise(ds.entreprise);
  }
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
  if (ds.ajouterMatch) {
    await ajouterAuPipeline(etat.posteOuvert.d.id, ds.ajouterMatch);
    cible.closest("li").remove();
    return ouvrirPoste(etat.posteOuvert.d.id);
  }
  if (ds.convertir) return convertirDemande(ds.convertir);
  if (ds.recue) {
    if (ds.recueStatut === "refusee" && !confirm("Classer cette demande sans suite ?")) return;
    const { error } = await sb.from("demandes_entreprises").update({ statut: ds.recueStatut }).eq("id", ds.recue);
    if (error) return echec(error);
    await chargerDemandesRecues();
    rendreEntreprises();
    return flash(ds.recueStatut === "contactee" ? "Demande marquée contactée." : "Demande classée.");
  }
  if (ds.supprimerContact) {
    if (!confirm("Retirer ce contact ?")) return;
    const { error } = await sb.from("contacts").delete().eq("id", ds.supprimerContact);
    if (error) return echec(error);
    return ouvrirEntreprise(etat.entrepriseOuverte.e.id);
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
    case "fermer-fenetre": return cible.closest("dialog").close();
    case "fermer-large": return $("#fenetre-large").close();
    case "voir-cv": return voirCv();
    case "telecharger-cv":
      try { location.href = await lienCv(etat.ouvert.c.cv_chemin, etat.ouvert.c.cv_nom, true); } catch (err) { echec(err, "Téléchargement impossible."); }
      return;
    case "modifier": return ouvrirFormulaireFiche(etat.ouvert.c);
    case "supprimer": return supprimerFiche();
    case "nouvelle-fiche": return ouvrirFormulaireFiche();
    case "exporter": return exporter();
    case "relance-cv": return ouvrirRelanceCv();
    case "relance-wa": return marquerRelanceWa(cible);
    case "nouvelle-relance": return ouvrirFormulaireRelance();
    case "relance-candidat": return ouvrirFormulaireRelance({ candidat: etat.ouvert.c });
    case "relance-poste": return ouvrirFormulaireRelance({ poste: etat.posteOuvert.d });
    case "relance-entreprise": return ouvrirFormulaireRelance({ entreprise: etat.entrepriseOuverte.e });
    case "ajouter-poste": {
      await ajouterAuPipeline($("#choix-poste").value, etat.ouvert.c.id);
      return ouvrirFiche(etat.ouvert.c.id, false);
    }
    case "ajouter-selection": {
      await ajouterAuPipeline(etat.selectionPour.id, etat.ouvert.c.id);
      return ouvrirFiche(etat.ouvert.c.id, false);
    }
    case "nouveau-poste": return ouvrirFormulairePoste();
    case "nouveau-poste-entreprise": return ouvrirFormulairePoste(null, etat.entrepriseOuverte.e.id);
    case "modifier-poste": return ouvrirFormulairePoste(etat.posteOuvert.d);
    case "supprimer-poste": {
      const d = etat.posteOuvert.d;
      if (!confirm(`Supprimer le poste « ${d.titre} » et son pipeline ? Les fiches des candidats sont conservées.`)) return;
      const { error } = await sb.from("demandes").delete().eq("id", d.id);
      if (error) return echec(error);
      $("#fenetre").close();
      etat.posteOuvert = null;
      await chargerDemandes();
      rendrePostes();
      return flash("Poste supprimé.");
    }
    case "matching": return matching();
    case "importer-offre": return ouvrirImportOffre();
    case "copier-lien-offre": return copier(lienOffre(etat.posteOuvert.d), "Lien copié : les candidats arrivent directement sur ce poste.");
    case "creer-lien-recruteur": {
      const d = etat.posteOuvert.d;
      const { error } = await sb.from("demandes").update({ jeton_recruteur: crypto.randomUUID(), jeton_cree_le: new Date().toISOString() }).eq("id", d.id);
      if (error) return echec(error);
      await preparerPartage(d.id).catch(console.error);
      await ouvrirPoste(d.id);
      return copier(lienRecruteur(etat.posteOuvert.d), "Lien recruteur créé et copié.");
    }
    case "copier-lien-recruteur":
      await preparerPartage(etat.posteOuvert.d.id).catch(console.error);
      return copier(lienRecruteur(etat.posteOuvert.d), "Lien recruteur copié. Les liens des CV sont valables 30 jours.");
    case "whatsapp-recruteur": {
      const d = etat.posteOuvert.d;
      await preparerPartage(d.id).catch(console.error);
      const n = etat.posteOuvert.pipeline.filter((p) => ETAPES_PRESENTEES.includes(p.etape)).length;
      const texte = `Bonjour, voici ${n ? `les ${n} profils sélectionnés` : "votre espace de suivi des profils"} pour le poste « ${d.titre} ». Vous pouvez ouvrir les CV et me donner votre avis sur chaque candidat ici : ${lienRecruteur(d)}`;
      return window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, "_blank", "noopener");
    }
    case "couper-lien": {
      const d = etat.posteOuvert.d;
      if (!confirm("Couper le lien recruteur ? La personne qui l'a reçu ne verra plus les profils. Vous pourrez en créer un nouveau.")) return;
      const { error } = await sb.from("demandes").update({ jeton_recruteur: null }).eq("id", d.id);
      if (error) return echec(error);
      flash("Lien coupé.");
      return ouvrirPoste(d.id);
    }
    case "copier-message": return copierMessage();
    case "chercher-profils": {
      const d = etat.posteOuvert.d;
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
      return ouvrirPoste(id);
    }
    case "nouvelle-entreprise": return ouvrirFormulaireEntreprise();
    case "modifier-entreprise": return ouvrirFormulaireEntreprise(etat.entrepriseOuverte.e);
    case "supprimer-entreprise": {
      const en = etat.entrepriseOuverte.e;
      if (!confirm(`Supprimer « ${en.nom} », ses contacts et son journal ? Ses postes sont conservés, sans entreprise.`)) return;
      const { error } = await sb.from("entreprises").delete().eq("id", en.id);
      if (error) return echec(error);
      $("#fenetre").close();
      etat.entrepriseOuverte = null;
      await Promise.all([chargerEntreprises(), chargerDemandes()]);
      rendreEntreprises();
      return flash("Entreprise supprimée.");
    }
    case "nouveau-contact": return ouvrirFormulaireContact();
  }
});

document.addEventListener("change", async (e) => {
  if (e.target.dataset?.faire) return marquerFait(e.target.dataset.faire);
  const candidat = e.target.dataset?.etape;
  if (candidat) return changerEtape(e.target.dataset.demande, candidat, e.target.value);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#dossier").hidden && !document.querySelector("dialog[open]")) fermerDossier();
});

demarrer();
