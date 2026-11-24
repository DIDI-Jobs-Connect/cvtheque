import { CONFIG } from "./config.js?v=6";
import { sb, configuree, esc } from "./client.js?v=6";
import { couleurDomaine } from "./listes.js?v=6";

const $ = (s) => document.querySelector(s);
// Le jeton est après le # : il n'est jamais envoyé aux serveurs ni aux sites visités ensuite.
const jeton = (location.hash.slice(1) || new URLSearchParams(location.search).get("j") || "").trim();
const AVIS = { rencontrer: "Je veux le/la rencontrer", reserve: "À garder en réserve", non: "Pas retenu" };
const ETAPES = { presente: "Présenté(e)", entretien: "Entretien prévu", offre: "Offre en cours", place: "Recruté(e)" };
let donnees = null;

function flash(t, erreur = false) {
  const f = $("#flash");
  f.textContent = t;
  f.classList.toggle("erreur", erreur);
  f.hidden = false;
  clearTimeout(flash.m);
  flash.m = setTimeout(() => (f.hidden = true), 3000);
}

function erreurLien(titre, texte) {
  $("#contenu-recruteur").innerHTML = `<div class="vide"><h2>${titre}</h2><p>${texte}</p></div>`;
}

function profil(p, i) {
  const infos = [p.ville, p.experience != null ? `${p.experience} an${p.experience > 1 ? "s" : ""} d'expérience` : "", p.niveau, p.disponibilite ? `Disponible : ${p.disponibilite.toLowerCase()}` : ""].filter(Boolean);
  return `<article class="profil-recruteur" style="--c:${couleurDomaine(p.domaine)};--i:${i}" data-id="${esc(p.id)}">
      <div class="profil-tete">
        <div><h2>${esc(p.prenom)} ${esc(p.nom)}</h2><p class="poste">${esc(p.postes)}</p></div>
        <span class="tampon ${p.etape === "place" ? "place" : "propose"}">${esc(ETAPES[p.etape] || "")}</span>
      </div>
      <ul class="offre-infos">${infos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <dl class="infos">
        ${p.competences ? `<dt>Compétences</dt><dd>${esc(p.competences)}</dd>` : ""}
        ${p.langues ? `<dt>Langues</dt><dd>${esc(p.langues)}</dd>` : ""}
        ${p.pretentions ? `<dt>Prétentions</dt><dd>${esc(p.pretentions)}</dd>` : ""}
      </dl>
      <div class="profil-actions">
        ${p.cv ? `<a class="bouton secondaire petit" href="${esc(p.cv)}" target="_blank" rel="noopener noreferrer">Voir le CV</a>` : `<span class="aide">CV transmis sur demande</span>`}
      </div>
      <form class="form-avis">
        <fieldset>
          <legend>Votre avis</legend>
          <div class="choix-avis">
            ${Object.entries(AVIS).map(([k, l]) => `<label class="avis ${k}"><input type="radio" name="avis" value="${k}"${p.avis === k ? " checked" : ""}> ${l}</label>`).join("")}
          </div>
          <label class="champ"><span>Commentaire <small>(facultatif)</small></span><textarea name="commentaire" maxlength="1000" placeholder="Disponibilités pour un entretien, question sur le profil…">${esc(p.commentaire || "")}</textarea></label>
          <div class="envoi" style="justify-content:flex-start;margin-top:.5rem"><button class="bouton petit" type="submit">Envoyer mon avis</button></div>
        </fieldset>
      </form>
    </article>`;
}

function afficher() {
  const d = donnees;
  const enCours = d.profils.filter((p) => !p.avis).length;
  $("#contenu-recruteur").innerHTML = `
    <section class="entete-recruteur">
      <p class="aide">${esc(d.entreprise || "")}</p>
      <h1>${esc(d.titre)}</h1>
      <p class="aide">${esc([d.ville, d.contrat].filter(Boolean).join(", "))}</p>
      <p class="resume-recruteur">${d.profils.length
        ? `<b>${d.profils.length}</b> profil${d.profils.length > 1 ? "s" : ""} présenté${d.profils.length > 1 ? "s" : ""}${enCours ? `, <b>${enCours}</b> en attente de votre avis` : ""}.`
        : "Les premiers profils arrivent bientôt : cette page se met à jour dès que nous vous en présentons."}</p>
      <p class="aide">Les coordonnées des candidats vous sont transmises par ${esc(CONFIG.organisation || "notre équipe")} pour organiser les entretiens. Les liens des CV restent valables 30 jours.</p>
      ${CONFIG.whatsappContact ? `<p style="margin-top:.75rem"><a class="bouton discret petit" target="_blank" rel="noopener" href="https://wa.me/${esc(CONFIG.whatsappContact.replace(/\D/g, ""))}?text=${encodeURIComponent(`Bonjour, au sujet des profils pour « ${d.titre} » :`)}">Nous écrire sur WhatsApp</a></p>` : ""}
    </section>
    <div class="profils-recruteur">${d.profils.map(profil).join("")}</div>`;
}

async function charger() {
  if (!configuree) return erreurLien("Site pas encore relié", "");
  if (!/^[0-9a-f-]{36}$/i.test(jeton)) return erreurLien("Lien incomplet", "Vérifiez que vous avez copié le lien en entier, ou demandez-en un nouveau.");
  const { data, error } = await sb.rpc("profils_recruteur", { j: jeton });
  if (error) { console.error(error); return erreurLien("Chargement impossible", "Vérifiez votre connexion puis rechargez la page."); }
  if (!data) return erreurLien("Ce lien n'est plus actif", "Il a peut-être été remplacé. Demandez le nouveau lien à votre contact chez " + esc(CONFIG.organisation || "nous") + ".");
  donnees = data;
  document.title = `Profils : ${data.titre}`;
  afficher();
}

document.addEventListener("submit", async (e) => {
  const form = e.target.closest(".form-avis");
  if (!form) return;
  e.preventDefault();
  const f = new FormData(form);
  const avis = f.get("avis");
  if (!avis) return flash("Choisissez une réponse.", true);
  const id = form.closest("[data-id]").dataset.id;
  const bouton = form.querySelector("button");
  bouton.disabled = true;
  const { error } = await sb.rpc("avis_recruteur", { j: jeton, candidat: id, avis, commentaire: (f.get("commentaire") || "").toString().trim() });
  bouton.disabled = false;
  if (error) { console.error(error); return flash("L'avis n'a pas été enregistré. Réessayez.", true); }
  const p = donnees.profils.find((x) => x.id === id);
  Object.assign(p, { avis, commentaire: f.get("commentaire") });
  flash(avis === "rencontrer" ? "Merci, nous organisons la rencontre." : "Merci, votre avis est enregistré.");
  afficher();
});

window.addEventListener("hashchange", charger);
charger();
