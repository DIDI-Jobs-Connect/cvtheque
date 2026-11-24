import { sb, configuree, esc, sansAccents } from "./client.js?v=6";
import { DOMAINES, couleurDomaine } from "./listes.js?v=6";

const $ = (s) => document.querySelector(s);
const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
let offres = [];

function fraicheur(d) {
  const jours = Math.floor((Date.now() - new Date(d)) / 86400000);
  return jours <= 0 ? "Publiée aujourd'hui" : jours === 1 ? "Publiée hier" : jours < 30 ? `Publiée il y a ${jours} jours` : `Publiée le ${dateFr.format(new Date(d))}`;
}

function carte(o, i) {
  const infos = [o.ville, o.contrat, o.experience_min != null ? (o.experience_min ? `${o.experience_min} an${o.experience_min > 1 ? "s" : ""} d'expérience` : "Débutant accepté") : "", o.salaire, o.nb_postes > 1 ? `${o.nb_postes} postes` : ""].filter(Boolean);
  const lien = `./?offre=${encodeURIComponent(o.id)}&source=offre`;
  return `<article class="offre" style="--c:${couleurDomaine(o.domaine)};--i:${i}">
      <div class="offre-tete">
        <span class="offre-domaine">${esc(o.domaine || "Tous domaines")}</span>
        <span class="offre-date">${fraicheur(o.publiee_le)}</span>
      </div>
      <h2>${esc(o.titre)}</h2>
      ${o.entreprise ? `<p class="offre-entreprise">${esc(o.entreprise)}</p>` : ""}
      <ul class="offre-infos">${infos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      ${o.details ? `<details><summary>Voir le détail du poste</summary><p>${esc(o.details)}</p></details>` : ""}
      <div class="offre-pied">
        ${o.echeance ? `<span class="aide">Candidatures jusqu'au ${dateFr.format(new Date(o.echeance))}</span>` : "<span></span>"}
        <a class="bouton" href="${lien}">Postuler avec mon CV</a>
      </div>
    </article>`;
}

function afficher() {
  const texte = sansAccents($("#recherche-offres").value.trim().toLowerCase());
  const domaine = $("#domaine-offres").value;
  const liste = offres.filter((o) => (!domaine || o.domaine === domaine) &&
    (!texte || texte.split(/\s+/).every((m) => sansAccents(`${o.titre} ${o.ville} ${o.details} ${o.domaine} ${o.contrat}`.toLowerCase()).includes(m))));
  $("#compte-offres").textContent = offres.length ? `${liste.length} offre${liste.length > 1 ? "s" : ""}` : "";
  $("#liste-offres").innerHTML = liste.length
    ? liste.map(carte).join("")
    : `<div class="vide"><h2>${offres.length ? "Aucune offre ne correspond" : "Pas d'offre ouverte pour le moment"}</h2>
        <p>${offres.length ? "Essayez un autre mot ou un autre domaine." : "De nouveaux postes arrivent chaque semaine."} Déposez votre CV dans notre CVthèque : nous vous appelons dès qu'un poste vous correspond.</p>
        <p style="margin-top:1rem"><a class="bouton" href="./">Déposer mon CV</a></p></div>`;
}

async function demarrer() {
  if (!configuree) { $("#config-manquante").hidden = false; return; }
  const { data, error } = await sb.rpc("offres_publiques");
  if (error) {
    console.error(error);
    $("#liste-offres").innerHTML = `<div class="vide"><h2>Les offres n'ont pas pu être chargées</h2><p>Vérifiez votre connexion puis rechargez la page.</p></div>`;
    return;
  }
  offres = data || [];
  const presents = new Set(offres.map((o) => o.domaine));
  $("#domaine-offres").innerHTML = `<option value="">Tous les domaines</option>` +
    DOMAINES.filter(([n]) => presents.has(n)).map(([n]) => `<option>${esc(n)}</option>`).join("");
  afficher();
}

$("#recherche-offres").addEventListener("input", afficher);
$("#domaine-offres").addEventListener("change", afficher);
demarrer();
