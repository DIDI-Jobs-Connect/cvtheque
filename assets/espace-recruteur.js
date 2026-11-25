import { CONFIG } from "./config.js?v=11";
import { sb, configuree, esc } from "./client.js?v=8";
import { DOMAINES, CONTRATS, couleurDomaine } from "./listes.js?v=8";

const $ = (s) => document.querySelector(s);
const zone = $("#contenu-recruteur");
const ORGA = CONFIG.organisation || "notre équipe";
const AVIS = { rencontrer: "Je veux le/la rencontrer", reserve: "À garder en réserve", non: "Pas retenu" };
const ETAPES = { presente: "Présenté(e)", entretien: "Entretien prévu", offre: "Offre en cours", place: "Recruté(e)" };
const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const etat = { compte: null, onglet: "postes", q: "", dom: "", page: 0 };

function flash(t, erreur = false) {
  const f = $("#flash");
  f.textContent = t;
  f.classList.toggle("erreur", erreur);
  f.hidden = false;
  clearTimeout(flash.m);
  flash.m = setTimeout(() => (f.hidden = true), 3200);
}
const panneau = (titre, texte, extra = "") => `<div class="vide"><h2>${titre}</h2><p>${texte}</p>${extra}</div>`;
const infos = (p) => [p.ville, p.experience != null ? `${p.experience} an${p.experience > 1 ? "s" : ""} d'expérience` : "", p.niveau, p.disponibilite ? `Disponible : ${p.disponibilite.toLowerCase()}` : ""].filter(Boolean);

// =====================================================================
// Connexion, création de compte, mot de passe oublié
// =====================================================================
function ecranConnexion(mode = "connexion", message = "") {
  $("#onglets").hidden = true;
  $("#deconnexion").hidden = true;
  $("#email-recruteur").textContent = "";
  const creation = mode === "creation";
  zone.innerHTML = `
    <section class="entete-recruteur">
      <p class="aide">Espace recruteur ${esc(ORGA)}</p>
      <h1>${creation ? "Créer votre compte recruteur" : "Accéder à votre espace recruteur"}</h1>
      <p class="aide">Retrouvez les profils présélectionnés pour vos postes, parcourez notre CVthèque et demandez les CV qui vous intéressent. Chaque compte est validé par notre équipe.</p>
    </section>
    <div class="etape connexion-recruteur">
      <div class="choix-connexion" role="tablist">
        <button type="button" role="tab" data-mode="connexion" aria-selected="${!creation}">J'ai déjà un compte</button>
        <button type="button" role="tab" data-mode="creation" aria-selected="${creation}">Créer un compte</button>
      </div>
      ${message ? `<p class="info-connexion">${message}</p>` : ""}
      <form id="form-acces" novalidate>
        ${creation ? `<div class="grille deux">
          <label class="champ"><span>Votre nom</span><input type="text" name="nom" required maxlength="120" autocomplete="name"></label>
          <label class="champ"><span>Entreprise ou cabinet</span><input type="text" name="entreprise" required maxlength="160" autocomplete="organization"></label>
          <label class="champ"><span>Fonction <small>(facultatif)</small></span><input type="text" name="fonction" maxlength="120" placeholder="Ex. : DRH, chargé(e) de recrutement"></label>
          <label class="champ"><span>Téléphone (WhatsApp)</span><input type="tel" name="telephone" required maxlength="40" autocomplete="tel"></label>
        </div>` : ""}
        <label class="champ"><span>Email professionnel</span><input type="email" name="email" required autocomplete="username"></label>
        <label class="champ"><span>Mot de passe${creation ? " <small>(8 caractères minimum)</small>" : ""}</span><input type="password" name="mdp" required minlength="${creation ? 8 : 1}" autocomplete="${creation ? "new-password" : "current-password"}"></label>
        <div class="envoi" style="justify-content:flex-start">
          <button class="bouton" type="submit">${creation ? "Créer mon compte" : "Se connecter"}</button>
          ${creation ? "" : `<button class="bouton discret petit" type="button" id="oubli">Mot de passe oublié ?</button>`}
        </div>
        <p class="erreur" id="erreur-acces" role="alert"></p>
      </form>
    </div>`;
  zone.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => ecranConnexion(b.dataset.mode)));
  $("#oubli")?.addEventListener("click", motDePasseOublie);
  $("#form-acces").addEventListener("submit", (e) => (creation ? creerCompte(e) : seConnecter(e)));
}

async function seConnecter(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = $("#erreur-acces");
  err.textContent = "";
  const { data, error } = await sb.auth.signInWithPassword({ email: String(f.get("email")).trim(), password: f.get("mdp") });
  if (error) {
    err.textContent = /confirm/i.test(error.message) ? "Confirmez d'abord votre adresse email (lien reçu par email), puis reconnectez-vous."
      : /invalid/i.test(error.message) ? "Email ou mot de passe incorrect." : "Connexion impossible. Réessayez.";
    return;
  }
  await afficher(data.session);
}

async function creerCompte(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const err = $("#erreur-acces");
  err.textContent = "";
  const d = Object.fromEntries(["nom", "entreprise", "fonction", "telephone"].map((k) => [k, String(f.get(k) || "").trim()]));
  const email = String(f.get("email") || "").trim();
  const mdp = String(f.get("mdp") || "");
  if (d.nom.length < 2 || d.entreprise.length < 2) return (err.textContent = "Indiquez votre nom et votre entreprise.");
  if (d.telephone.replace(/\D/g, "").length < 8) return (err.textContent = "Indiquez un numéro de téléphone joignable.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return (err.textContent = "L'adresse email n'est pas valide.");
  if (mdp.length < 8) return (err.textContent = "Le mot de passe doit contenir au moins 8 caractères.");
  const bouton = e.target.querySelector('button[type="submit"]');
  bouton.disabled = true;
  try { localStorage.setItem("inscription-recruteur", JSON.stringify(d)); } catch { /* navigation privée */ }
  const { data, error } = await sb.auth.signUp({ email, password: mdp, options: { emailRedirectTo: location.href.split("#")[0] } });
  bouton.disabled = false;
  if (error) {
    err.textContent = /registered|exists/i.test(error.message) ? "Un compte existe déjà avec cet email : connectez-vous."
      : /signups not allowed|disabled/i.test(error.message) ? "Les inscriptions sont fermées pour le moment. Contactez-nous."
      : /password/i.test(error.message) ? "Mot de passe trop faible : utilisez au moins 8 caractères, avec des chiffres." : "Création impossible. Réessayez.";
    return;
  }
  if (!data.session) return ecranConnexion("connexion", "Compte créé. Ouvrez l'email de confirmation que vous venez de recevoir, cliquez sur le lien, puis connectez-vous ici.");
  await afficher(data.session);
}

async function motDePasseOublie() {
  const email = (zone.querySelector('[name="email"]').value || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ($("#erreur-acces").textContent = "Saisissez d'abord votre email, puis cliquez sur « Mot de passe oublié ? ».");
  await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
  flash("Si un compte existe, un email de réinitialisation vient d'être envoyé.");
}

function nouveauMotDePasse() {
  zone.innerHTML = `<div class="etape connexion-recruteur"><h2>Choisissez un nouveau mot de passe</h2>
    <form id="form-mdp" novalidate><label class="champ"><span>Nouveau mot de passe (8 caractères minimum)</span><input type="password" name="mdp" minlength="8" required autocomplete="new-password"></label>
    <div class="envoi" style="justify-content:flex-start"><button class="bouton" type="submit">Enregistrer</button></div><p class="erreur" id="erreur-mdp" role="alert"></p></form></div>`;
  $("#form-mdp").addEventListener("submit", async (e) => {
    e.preventDefault();
    const mdp = new FormData(e.target).get("mdp");
    if (String(mdp).length < 8) return ($("#erreur-mdp").textContent = "8 caractères minimum.");
    const { error } = await sb.auth.updateUser({ password: mdp });
    if (error) return ($("#erreur-mdp").textContent = "Modification impossible. Réessayez.");
    flash("Mot de passe modifié.");
    const { data } = await sb.auth.getSession();
    afficher(data.session);
  });
}

// =====================================================================
// Compte : en attente, suspendu, validé
// =====================================================================
async function afficher(session) {
  if (!session) return ecranConnexion();
  $("#email-recruteur").textContent = session.user.email;
  $("#deconnexion").hidden = false;
  let { data: compte, error } = await sb.rpc("mon_compte_recruteur");
  if (error) {
    console.error(error);
    zone.innerHTML = panneau("Espace momentanément indisponible", "Réessayez dans quelques minutes.");
    return;
  }
  // Inscription commencée avant confirmation de l'email : on la termine.
  if (!compte) {
    let d = null;
    try { d = JSON.parse(localStorage.getItem("inscription-recruteur") || "null"); } catch { /* rien */ }
    if (d?.nom && d?.entreprise) {
      const r = await sb.rpc("inscrire_recruteur", { d });
      if (!r.error) {
        try { localStorage.removeItem("inscription-recruteur"); } catch { /* rien */ }
        ({ data: compte } = await sb.rpc("mon_compte_recruteur"));
      }
    }
  }
  if (!compte) return completerProfil();
  if (compte.equipe) {
    zone.innerHTML = panneau("Vous êtes connecté(e) avec un compte de l'équipe", "L'espace recruteur est réservé aux recruteurs. Votre espace de travail est ici :", `<p style="margin-top:1rem"><a class="bouton" href="espace.html">Ouvrir l'espace équipe</a></p>`);
    return;
  }
  etat.compte = compte;
  if (compte.statut === "en_attente") {
    $("#onglets").hidden = true;
    zone.innerHTML = panneau("Votre compte est en cours de validation",
      `Merci ${esc(compte.nom)}. Notre équipe vérifie votre demande (${esc(compte.entreprise)}) et active votre accès, en général sous 24 h ouvrées. Revenez sur cette page ensuite : vous y trouverez vos postes et la CVthèque.`,
      CONFIG.whatsappContact ? `<p style="margin-top:1rem"><a class="bouton secondaire" target="_blank" rel="noopener" href="https://wa.me/${esc(CONFIG.whatsappContact.replace(/\D/g, ""))}?text=${encodeURIComponent(`Bonjour, je viens de créer mon compte recruteur (${compte.entreprise}).`)}">Nous prévenir sur WhatsApp</a></p>` : "");
    return;
  }
  if (compte.statut === "suspendu") {
    $("#onglets").hidden = true;
    zone.innerHTML = panneau("Accès suspendu", `Votre accès à l'espace recruteur n'est pas actif. Contactez ${esc(ORGA)} pour en savoir plus.`);
    return;
  }
  $("#onglets").hidden = false;
  changerOnglet(etat.onglet);
}

function completerProfil() {
  $("#onglets").hidden = true;
  zone.innerHTML = `<div class="etape connexion-recruteur"><h2>Dernière étape : présentez-vous</h2>
    <form id="form-profil" novalidate><div class="grille deux">
      <label class="champ"><span>Votre nom</span><input type="text" name="nom" required maxlength="120"></label>
      <label class="champ"><span>Entreprise ou cabinet</span><input type="text" name="entreprise" required maxlength="160"></label>
      <label class="champ"><span>Fonction <small>(facultatif)</small></span><input type="text" name="fonction" maxlength="120"></label>
      <label class="champ"><span>Téléphone (WhatsApp)</span><input type="tel" name="telephone" required maxlength="40"></label>
    </div><div class="envoi" style="justify-content:flex-start"><button class="bouton" type="submit">Envoyer ma demande d'accès</button></div><p class="erreur" id="erreur-profil" role="alert"></p></form></div>`;
  $("#form-profil").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const d = Object.fromEntries(["nom", "entreprise", "fonction", "telephone"].map((k) => [k, String(f.get(k) || "").trim()]));
    if (d.nom.length < 2 || d.entreprise.length < 2 || d.telephone.replace(/\D/g, "").length < 8) return ($("#erreur-profil").textContent = "Nom, entreprise et téléphone sont obligatoires.");
    const { error } = await sb.rpc("inscrire_recruteur", { d });
    if (error) return ($("#erreur-profil").textContent = "Envoi impossible. Réessayez.");
    const { data } = await sb.auth.getSession();
    afficher(data.session);
  });
}

// =====================================================================
// Onglets de l'espace validé
// =====================================================================
function changerOnglet(onglet) {
  etat.onglet = onglet;
  document.querySelectorAll("[data-onglet]").forEach((b) => b.setAttribute("aria-current", b.dataset.onglet === onglet ? "page" : "false"));
  if (onglet === "postes") return mesPostes();
  if (onglet === "cvtheque") return cvtheque();
  if (onglet === "accordes") return accordes();
  if (onglet === "demande") return nouvelleDemande();
}

function carteProfil(p, i, demande) {
  return `<article class="profil-recruteur" style="--c:${couleurDomaine(p.domaine)};--i:${i}" data-id="${esc(p.id)}" ${demande ? `data-demande="${esc(demande)}"` : ""}>
      <div class="profil-tete">
        <div><h2>${esc(p.prenom)} ${esc(p.nom)}</h2><p class="poste">${esc(p.postes)}</p></div>
        ${p.etape ? `<span class="tampon ${p.etape === "place" ? "place" : "propose"}">${esc(ETAPES[p.etape] || "")}</span>` : `<span class="tampon place">CV accordé</span>`}
      </div>
      <ul class="offre-infos">${infos(p).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <dl class="infos">
        ${p.competences ? `<dt>Compétences</dt><dd>${esc(p.competences)}</dd>` : ""}
        ${p.langues ? `<dt>Langues</dt><dd>${esc(p.langues)}</dd>` : ""}
        ${p.pretentions ? `<dt>Prétentions</dt><dd>${esc(p.pretentions)}</dd>` : ""}
      </dl>
      <div class="profil-actions">
        ${p.cv_chemin ? `<button type="button" class="bouton secondaire petit" data-cv="${esc(p.cv_chemin)}">Voir le CV</button>` : `<span class="aide">CV pas encore disponible : demandez-le à ${esc(ORGA)}.</span>`}
      </div>
      ${demande ? `<form class="form-avis"><fieldset><legend>Votre avis</legend>
        <div class="choix-avis">${Object.entries(AVIS).map(([k, l]) => `<label class="avis ${k}"><input type="radio" name="avis" value="${k}"${p.avis === k ? " checked" : ""}> ${l}</label>`).join("")}</div>
        <label class="champ"><span>Commentaire <small>(facultatif)</small></span><textarea name="commentaire" maxlength="1000" placeholder="Disponibilités pour un entretien, question sur le profil…">${esc(p.commentaire || "")}</textarea></label>
        <div class="envoi" style="justify-content:flex-start;margin-top:.5rem"><button class="bouton petit" type="submit">Envoyer mon avis</button></div>
      </fieldset></form>` : ""}
    </article>`;
}

async function mesPostes() {
  zone.innerHTML = `<p class="aide">Chargement…</p>`;
  const { data, error } = await sb.rpc("mes_postes_recruteur");
  if (error) return (zone.innerHTML = panneau("Chargement impossible", "Réessayez dans un instant."));
  const c = etat.compte;
  zone.innerHTML = `
    <section class="entete-recruteur">
      <p class="aide">${esc(c.entreprise)}</p>
      <h1>Bonjour ${esc(c.nom)}</h1>
      <p class="resume-recruteur">${data.length ? `<b>${data.length}</b> ${data.length > 1 ? "postes suivis" : "poste suivi"} par ${esc(ORGA)}.` : "Aucun poste pour le moment."}</p>
      <p class="aide">Vous voyez ici les candidats que notre équipe a présélectionnés pour vous. Les coordonnées des candidats vous sont transmises par ${esc(ORGA)} pour organiser les entretiens.</p>
    </section>
    ${data.length ? data.map((d) => `
      <section class="bloc-poste">
        <div class="bloc-poste-tete"><h2>${esc(d.titre)}</h2><span class="aide">${esc([d.ville, d.contrat, d.statut === "ouverte" ? "en cours" : d.statut === "pourvue" ? "pourvu" : "fermé"].filter(Boolean).join(" · "))}</span></div>
        ${d.profils.length ? `<div class="profils-recruteur">${d.profils.map((p, i) => carteProfil(p, i, d.id)).join("")}</div>` : `<p class="aide">Nous sélectionnons les profils : ils apparaîtront ici dès qu'ils seront validés.</p>`}
      </section>`).join("")
    : panneau("Pas encore de poste", "Envoyez-nous votre besoin : nous créons le poste et vous présentons des candidats ici. Vous pouvez aussi parcourir la CVthèque et demander des CV.", `<p style="margin-top:1rem"><button class="bouton" type="button" data-onglet="demande">Envoyer une demande de profils</button> <button class="bouton secondaire" type="button" data-onglet="cvtheque">Parcourir la CVthèque</button></p>`)}`;
}

async function cvtheque() {
  zone.innerHTML = `
    <section class="entete-recruteur">
      <h1>CVthèque</h1>
      <p class="aide">Les profils sont anonymes. Demandez le CV d'un candidat : notre équipe vérifie sa disponibilité et vous l'accorde. Il apparaît alors dans « CV accordés ».</p>
    </section>
    <div class="barre-offres" style="margin-top:1rem">
      <label class="recherche-offres"><span class="visuellement-cache">Rechercher</span><input type="search" id="q" placeholder="Métier, compétence, ville…" value="${esc(etat.q)}"></label>
      <label><span class="visuellement-cache">Domaine</span><select id="dom"><option value="">Tous les domaines</option>${DOMAINES.map(([n]) => `<option${etat.dom === n ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
    </div>
    <p class="aide" id="compte-cv" style="margin:1rem 0 .5rem"></p>
    <div id="liste-cv" class="liste-offres"></div>
    <nav class="pagination" id="pages"></nav>`;
  let minuterie;
  $("#q").addEventListener("input", (e) => { clearTimeout(minuterie); minuterie = setTimeout(() => { etat.q = e.target.value.trim(); etat.page = 0; chargerCatalogue(); }, 350); });
  $("#dom").addEventListener("change", (e) => { etat.dom = e.target.value; etat.page = 0; chargerCatalogue(); });
  chargerCatalogue();
}

const BADGE_ACCES = { demande: ["Demande envoyée", "propose"], accorde: ["CV accordé", "place"], refuse: ["Non disponible", "archive"] };

async function chargerCatalogue() {
  const { data, error } = await sb.rpc("catalogue_recruteur", { q: etat.q, dom: etat.dom, page: etat.page });
  if (error) return ($("#liste-cv").innerHTML = panneau("Recherche impossible", "Réessayez dans un instant."));
  $("#compte-cv").textContent = `${data.total} profil${data.total > 1 ? "s" : ""}`;
  $("#liste-cv").innerHTML = data.profils.length ? data.profils.map((p, i) => `
    <article class="offre" style="--c:${couleurDomaine(p.domaine)};--i:${i}">
      <div class="offre-tete"><span class="offre-domaine">${esc(p.domaine)}</span>${p.acces ? `<span class="tampon ${BADGE_ACCES[p.acces][1]}">${BADGE_ACCES[p.acces][0]}</span>` : ""}</div>
      <h2>${esc(p.postes)}</h2>
      <ul class="offre-infos">${[...infos(p), ...(p.contrats || [])].map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${p.competences ? `<p class="aide" style="margin-top:.6rem">${esc(p.competences)}</p>` : ""}
      <div class="offre-pied"><span class="aide">${p.a_un_cv ? "CV disponible" : "CV sur demande"}${p.langues ? ` · ${esc(p.langues)}` : ""}</span>
        ${p.acces ? (p.acces === "accorde" ? `<button type="button" class="bouton secondaire petit" data-onglet="accordes">Voir dans « CV accordés »</button>` : "") : `<button type="button" class="bouton petit" data-demander="${esc(p.id)}" data-poste="${esc(p.postes)}">Demander le CV</button>`}
      </div>
    </article>`).join("") : panneau("Aucun profil ne correspond", "Essayez un autre mot ou un autre domaine, ou envoyez-nous une demande de profils.");
  const pages = Math.ceil(data.total / 30);
  $("#pages").innerHTML = pages > 1 ? `<button type="button" class="bouton discret petit" data-page="${etat.page - 1}" ${etat.page === 0 ? "disabled" : ""}>Précédente</button><span>Page ${etat.page + 1} sur ${pages}</span><button type="button" class="bouton discret petit" data-page="${etat.page + 1}" ${etat.page + 1 >= pages ? "disabled" : ""}>Suivante</button>` : "";
}

function demanderCv(id, poste) {
  const form = $("#form-recruteur");
  form.innerHTML = `<h2>Demander le CV</h2><p class="aide">Profil : <b>${esc(poste)}</b>. Notre équipe vérifie la disponibilité du candidat et vous répond rapidement.</p>
    <label class="champ"><span>Pour quel poste ? <small>(facultatif)</small></span><textarea name="message" maxlength="1000" placeholder="Ex. : poste de comptable à Cotonou, CDI, prise de poste en janvier"></textarea></label>
    <div class="envoi"><button type="button" class="bouton discret" data-fermer>Annuler</button><button type="submit" class="bouton">Envoyer la demande</button></div>`;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.rpc("demander_cv", { candidat: id, message: String(new FormData(form).get("message") || "").trim() });
    $("#fenetre-recruteur").close();
    if (error) return flash("La demande n'a pas pu être envoyée. Réessayez.", true);
    flash("Demande envoyée. Vous serez prévenu(e) dès que le CV est accordé.");
    chargerCatalogue();
  };
  $("#fenetre-recruteur").showModal();
}

async function accordes() {
  zone.innerHTML = `<p class="aide">Chargement…</p>`;
  const { data, error } = await sb.rpc("profils_accessibles");
  if (error) return (zone.innerHTML = panneau("Chargement impossible", "Réessayez dans un instant."));
  zone.innerHTML = `
    <section class="entete-recruteur"><h1>CV accordés</h1>
      <p class="aide">Les profils dont ${esc(ORGA)} vous a accordé le CV. Pour rencontrer un candidat, écrivez-nous : nous organisons l'entretien.</p></section>
    ${data.length ? `<div class="profils-recruteur">${data.map((p, i) => carteProfil(p, i, null)).join("")}</div>` : panneau("Aucun CV accordé pour l'instant", "Parcourez la CVthèque et demandez les CV qui vous intéressent.", `<p style="margin-top:1rem"><button class="bouton" type="button" data-onglet="cvtheque">Parcourir la CVthèque</button></p>`)}`;
}

function nouvelleDemande() {
  const c = etat.compte;
  const formules = CONFIG.formules || [];
  zone.innerHTML = `
    <section class="entete-recruteur"><h1>Nouvelle demande de profils</h1>
      <p class="aide">Décrivez le poste : nous le créons dans votre espace et vous y présentons les candidats sélectionnés.</p></section>
    <div class="etape" style="margin-top:1rem"><form id="form-demande" novalidate>
      <div class="grille deux">
        <label class="champ"><span>Poste à pourvoir</span><input type="text" name="poste" required maxlength="200"></label>
        <label class="champ"><span>Nombre de postes</span><input type="number" name="nb_postes" min="1" max="99" value="1"></label>
        <label class="champ"><span>Contrat</span><select name="contrat"><option value="">Choisir…</option>${CONTRATS.map((x) => `<option>${esc(x)}</option>`).join("")}</select></label>
        <label class="champ"><span>Expérience minimale (ans)</span><input type="number" name="experience_min" min="0" max="40"></label>
        <label class="champ"><span>Salaire ou budget <small>(facultatif)</small></span><input type="text" name="budget" maxlength="120"></label>
        <label class="champ"><span>Ville</span><input type="text" name="ville" maxlength="80"></label>
        <label class="champ"><span>À pourvoir avant le <small>(facultatif)</small></span><input type="date" name="echeance"></label>
        <label class="champ"><span>Formule</span><select name="formule">${[...formules.map((f) => f.nom), "Je ne sais pas encore"].map((n) => `<option>${esc(n)}</option>`).join("")}</select></label>
      </div>
      <label class="champ"><span>Missions et profil recherché</span><textarea name="details" maxlength="3000"></textarea></label>
      <div class="envoi" style="justify-content:flex-start"><button class="bouton" type="submit">Envoyer la demande</button><a class="bouton discret petit" href="recruter.html" target="_blank" rel="noopener">Voir les formules et tarifs</a></div>
      <p class="erreur" id="erreur-demande" role="alert"></p>
    </form></div>`;
  $("#form-demande").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const d = Object.fromEntries(["poste", "nb_postes", "contrat", "experience_min", "budget", "ville", "echeance", "formule", "details"].map((k) => [k, String(f.get(k) || "").trim()]));
    if (d.poste.length < 2) return ($("#erreur-demande").textContent = "Indiquez le poste à pourvoir.");
    Object.assign(d, { entreprise: c.entreprise, contact_nom: c.nom, fonction: c.fonction || "", telephone: c.telephone || "", email: c.email });
    if (!String(d.telephone).replace(/\D/g, "").length) d.telephone = "00000000";
    const { error } = await sb.rpc("deposer_demande_entreprise", { d });
    if (error) return ($("#erreur-demande").textContent = "Envoi impossible. Réessayez.");
    flash("Demande envoyée. Le poste apparaîtra dans « Mes postes » dès que notre équipe l'aura créé.");
    changerOnglet("postes");
  });
}

// =====================================================================
// Clics et envois
// =====================================================================
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.onglet) return changerOnglet(b.dataset.onglet);
  if (b.dataset.demander) return demanderCv(b.dataset.demander, b.dataset.poste);
  if (b.dataset.page !== undefined) { etat.page = Number(b.dataset.page); chargerCatalogue(); return window.scrollTo({ top: 0 }); }
  if (b.hasAttribute("data-fermer")) return $("#fenetre-recruteur").close();
  if (b.dataset.cv) {
    const fenetre = window.open("", "_blank");
    const { data, error } = await sb.storage.from("cv").createSignedUrl(b.dataset.cv, 600);
    if (error) { fenetre?.close(); return flash("Ce CV n'est pas accessible.", true); }
    if (fenetre) { fenetre.location.href = data.signedUrl; fenetre.opener = null; } else location.href = data.signedUrl;
  }
});

document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".form-avis");
  if (!form) return;
  e.preventDefault();
  const f = new FormData(form);
  const avis = f.get("avis");
  if (!avis) return flash("Choisissez une réponse.", true);
  const carte = form.closest("[data-id]");
  const { error } = await sb.rpc("avis_recruteur_compte", { demande: carte.dataset.demande, candidat: carte.dataset.id, avis, commentaire: String(f.get("commentaire") || "").trim() });
  if (error) return flash("L'avis n'a pas été enregistré. Réessayez.", true);
  flash(avis === "rencontrer" ? "Merci, nous organisons la rencontre." : "Merci, votre avis est enregistré.");
});

$("#deconnexion").addEventListener("click", async () => { await sb.auth.signOut(); ecranConnexion(); });

async function demarrer() {
  if (!configuree) return (zone.innerHTML = panneau("Espace pas encore relié", ""));
  sb.auth.onAuthStateChange((evenement) => { if (evenement === "PASSWORD_RECOVERY") nouveauMotDePasse(); });
  if (/type=recovery/.test(location.hash)) return;
  const { data } = await sb.auth.getSession();
  afficher(data.session);
}
demarrer();
