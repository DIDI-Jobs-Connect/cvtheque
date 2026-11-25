import { CONFIG } from "./config.js?v=10";
import { sb, configuree, esc } from "./client.js?v=6";
import { CONTRATS } from "./listes.js?v=6";

const $ = (s) => document.querySelector(s);
const formules = CONFIG.formules || [];

$("#formules").innerHTML = formules.map((f, i) => `
  <article class="formule${f.conseillee ? " conseillee" : ""}">
    ${f.conseillee ? `<span class="formule-ruban">La plus demandée</span>` : ""}
    <h3>${esc(f.nom)}</h3>
    <p class="formule-prix"><b>${esc(f.prix)}</b><small>${esc(f.unite || "")}</small></p>
    <p>${esc(f.resume)}</p>
    <ul>${(f.points || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    <button type="button" class="bouton${f.conseillee ? "" : " secondaire"}" data-formule="${i}">Choisir cette formule</button>
  </article>`).join("");

$("#choix-formule").innerHTML = [...formules.map((f) => f.nom), "Je ne sais pas encore"].map((n, i) =>
  `<label class="case"><input type="radio" name="formule" value="${esc(n)}"${i === formules.length ? " checked" : ""}> ${esc(n)}</label>`).join("");
$("#contrat").innerHTML = `<option value="">Choisir…</option>` + CONTRATS.map((c) => `<option>${esc(c)}</option>`).join("");

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-formule]");
  if (!b) return;
  const nom = formules[Number(b.dataset.formule)].nom;
  const radio = [...document.querySelectorAll('[name="formule"]')].find((r) => r.value === nom);
  if (radio) radio.checked = true;
  $("#zone-demande").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  setTimeout(() => $('[name="poste"]').focus({ preventScroll: true }), 400);
});


$("#form-demande").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);
  const zone = $("#erreur-demande");
  zone.textContent = "";
  if (f.get("site_web")) return;
  const d = Object.fromEntries(["poste", "nb_postes", "contrat", "experience_min", "budget", "echeance", "details", "entreprise", "secteur", "contact_nom", "fonction", "telephone", "email", "ville", "formule"].map((k) => [k, (f.get(k) || "").toString().trim()]));
  if (d.poste.length < 2) return (zone.textContent = "Indiquez le poste à pourvoir.");
  if (d.entreprise.length < 2) return (zone.textContent = "Indiquez le nom de votre entreprise.");
  if (d.contact_nom.length < 2) return (zone.textContent = "Indiquez votre nom.");
  if (d.telephone.replace(/\D/g, "").length < 8) return (zone.textContent = "Indiquez un numéro de téléphone joignable.");
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return (zone.textContent = "L'adresse email n'est pas valide.");
  if (!configuree) return (zone.textContent = "Le site n'est pas encore relié à sa base de données.");
  const bouton = $("#bouton-demande");
  bouton.disabled = true;
  bouton.textContent = "Envoi en cours…";
  const { error } = await sb.rpc("deposer_demande_entreprise", { d });
  if (error) {
    console.error(error);
    zone.textContent = "L'envoi n'a pas abouti. Réessayez dans un instant.";
    bouton.disabled = false;
    bouton.textContent = "Envoyer ma demande";
    return;
  }
  form.hidden = true;
  const ok = $("#demande-envoyee");
  ok.hidden = false;
  $("#texte-envoyee").textContent = `Votre demande pour le poste « ${d.poste} » (${d.formule}) est bien arrivée chez ${CONFIG.organisation || "nous"}.`;
  if (CONFIG.whatsappContact) {
    const w = $("#whatsapp-direct");
    w.href = `https://wa.me/${CONFIG.whatsappContact.replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjour, je viens d'envoyer une demande de profils pour le poste « ${d.poste} » (${d.entreprise}).`)}`;
    w.hidden = false;
  }
  ok.focus();
});
